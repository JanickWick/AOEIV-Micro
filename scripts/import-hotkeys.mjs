#!/usr/bin/env node
/**
 * Liest ein AoE4-Hotkey-Profil (.rkp, Textformat aus Documents/My Games/Age of Empires IV/<Profil>/keyBindingProfiles)
 * und erzeugt daraus das Preset src/data/hotkeys/mein-layout.json für dieses Tool.
 *
 * Aufruf: node scripts/import-hotkeys.mjs reference/hotkeys/Dorfzenter.rkp
 *
 * Tastennamen der Datei sind US-Layout-Namen physischer Tasten (Relic-Engine); sie werden auf
 * KeyboardEvent.code abgebildet ("Z" -> "KeyZ", auf QWERTZ die mit Y beschriftete Taste).
 * Mit --qwertz-chars wird stattdessen angenommen, dass "Z"/"Y" die beschrifteten Tasten meinen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('Pfad zur .rkp-Datei angeben.');
  process.exit(1);
}
const qwertzChars = process.argv.includes('--qwertz-chars');
const text = readFileSync(src, 'utf8');

// ---------------------------------------------------------------- Parser
const groups = {};
const groupRe = /^\t\t(\w+) =\s*$/gm;
const heads = [];
let m;
while ((m = groupRe.exec(text))) heads.push({ name: m[1], start: m.index });
for (let i = 0; i < heads.length; i++) {
  const body = text.slice(heads[i].start, i + 1 < heads.length ? heads[i + 1].start : text.length);
  const cmds = {};
  const cmdRe = /command = "([^"]+)",\s*keycombos =\s*\{([\s\S]*?)\n\t\t\t\t\},/g;
  let c;
  while ((c = cmdRe.exec(body))) {
    cmds[c[1]] = [...c[2].matchAll(/combo = "([^"]*)",\s*event = "(\w+)"/g)].map((x) => x[1]).filter(Boolean);
  }
  groups[heads[i].name] = cmds;
}
const profileName = (text.match(/name = "([^"]+)"/) ?? [])[1] ?? 'Mein Layout';

// ---------------------------------------------------------------- Tasten -> KeyboardEvent.code
const SPECIAL = {
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  Tab: 'Tab', Escape: 'Escape', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Space: 'Space',
  Grave: 'Backquote', Minus: 'Minus', Equal: 'Equal', LBracket: 'BracketLeft', RBracket: 'BracketRight',
  Backslash: 'Backslash', Slash: 'Slash', Period: 'Period', Comma: 'Comma', Semicolon: 'Semicolon', Apostrophe: 'Quote',
};
const unmappable = new Set();
function toBinding(combo) {
  const parts = combo.split('+');
  const b = { code: '' };
  for (const p of parts) {
    if (p === 'Control') b.ctrl = true;
    else if (p === 'Shift') b.shift = true;
    else if (p === 'Alt') b.alt = true;
    else if (/^[A-Z]$/.test(p)) {
      let letter = p;
      if (qwertzChars && (p === 'Z' || p === 'Y')) letter = p === 'Z' ? 'Y' : 'Z';
      b.code = `Key${letter}`;
    } else if (/^\d$/.test(p)) b.code = `Digit${p}`;
    else if (/^Numpad\d$/.test(p)) b.code = p;
    else if (/^F\d{1,2}$/.test(p)) b.code = p;
    else if (SPECIAL[p]) b.code = SPECIAL[p];
    else {
      unmappable.add(p);
      return null;
    }
  }
  if (!b.code) return null; // nur Modifier (z. B. "Alt" für Orbit)
  return b;
}

// ---------------------------------------------------------------- Zuordnung Befehl -> Aktion des Tools
const MAP = [
  ['camera.up', 'camera', 'pan_up'],
  ['camera.down', 'camera', 'pan_down'],
  ['camera.left', 'camera', 'pan_left'],
  ['camera.right', 'camera', 'pan_right'],
  ['camera.reset', 'camera', 'default'],
  ['camera.focusSelection', 'hud_selection_orders', 'focus_selected'],
  ['game.settings', 'hud_game', 'pause_menu'],
  ['unit.attackMove', 'abilities', 'squad_order_attack_move'],
  ['unit.stop', 'abilities', 'squad_order_stop'],
  ['unit.patrol', 'abilities', 'squad_order_patrol'],
  ['unit.hold', 'abilities', 'general_toggle_stand_ground'],
  ['unit.delete', 'abilities', 'general_delete'],
  ['formation.line', 'abilities', 'toggle_formation_line'],
  ['formation.wedge', 'abilities', 'toggle_formation_wedge'],
  ['formation.spread', 'abilities', 'toggle_formation_spread'],
  ['select.allMilitary', 'hud_selection_orders', 'pick_all_military'],
  ['select.allMilitary', 'hud_selection_orders', 'select_all'],
  ['select.allOfType', 'hud_selection_orders', 'pick_all_of_current_types'],
  ['select.idleMilitary', 'hud_selection_orders', 'pick_all_idle_military'],
  ['select.nextIdleMilitary', 'hud_selection_orders', 'pick_next_idle_military'],
  ['subselect.next', 'hud_selection_orders', 'subselect_next'],
  ['subselect.prev', 'hud_selection_orders', 'subselect_previous'],
  ['group.removeAll', 'hud_control_groups', 'hkgroup_remove_all'],
];
for (let d = 0; d <= 9; d++) {
  MAP.push([`group.select.${d}`, 'hud_control_groups', `hkgroup_select${d}`]);
  MAP.push([`group.set.${d}`, 'hud_control_groups', `hkgroup_set${d}`]);
  MAP.push([`group.add.${d}`, 'hud_control_groups', `hkgroup_add${d}`]);
  MAP.push([`group.addExclusive.${d}`, 'hud_control_groups', `hkgroup_add_exclusively${d}`]);
  MAP.push([`group.remove.${d}`, 'hud_control_groups', `hkgroup_remove${d}`]);
}

const bindings = {};
const source = {};
const report = [];
for (const [action, group, cmd] of MAP) {
  const combos = groups[group]?.[cmd];
  if (combos === undefined) {
    report.push(`?  ${action}: Befehl ${group}.${cmd} nicht in der Datei`);
    continue;
  }
  const list = combos.map(toBinding).filter(Boolean);
  if (list.length === 0) {
    report.push(`-  ${action}: ${group}.${cmd} in der Datei unbelegt`);
    if (!bindings[action]) bindings[action] = [];
    continue;
  }
  bindings[action] = [...(bindings[action] ?? []), ...list];
  source[action] = `${group}.${cmd} = ${combos.join(' | ')}`;
}

const out = {
  id: 'mein-layout',
  label: 'Mein Layout',
  source: `persönliches Hotkey-Profil (${profileName}), importiert mit scripts/import-hotkeys.mjs`,
  importedAt: new Date().toISOString().slice(0, 10),
  keyNaming: qwertzChars ? 'qwertz-chars' : 'us-physical',
  bindings,
  source,
};
const outPath = join(ROOT, 'src', 'data', 'hotkeys', 'mein-layout.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Profil "${profileName}": ${Object.keys(bindings).length} Aktionen belegt -> ${outPath}`);
console.log(report.join('\n'));
if (unmappable.size) console.log('Nicht abbildbare Tasten (Maus/sonstige):', [...unmappable].join(', '));
