/** Einstellungs- und Kalibrierungsmenü (HTML). Änderungen werden sofort gespeichert und übernommen. */
import { listCalibrationEntries, RULE_ENTRIES, ruleDefault, saveCalibration, type CalibrationState } from './calibration';
import { ACTIONS, bindingFromEvent, describeBinding, PRESETS, type ActionId, type HotkeyMap, type KeyBinding } from './hotkeys';
import { exportBundle, saveSettings, type DisplaySettings, type HealthBarMode } from './settings';
void (0 as unknown as KeyBinding);

export interface SettingsPanelDeps {
  root: HTMLElement;
  settings: DisplaySettings;
  calibration: CalibrationState;
  hotkeys: HotkeyMap;
  /** Nach Änderungen an Daten/Regeln: Einheitenbibliothek neu bauen und Szenario neu starten. */
  onCalibrationChanged: () => void;
  onDisplayChanged: () => void;
  onImport: (json: string) => void;
  onHotkeysChanged: () => void;
  keyboardLayout?: Map<string, string>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

export function buildSettingsPanel(d: SettingsPanelDeps): void {
  const root = d.root;
  root.replaceChildren();

  // -------- Anzeige
  root.append(el('h3', { text: 'Anzeige' }));
  const hb = el('select', { id: 'set-healthbars' });
  const modes: [HealthBarMode, string][] = [
    ['always', 'immer'],
    ['selectedOrDamaged', 'bei Auswahl oder Schaden'],
    ['selected', 'nur bei Auswahl'],
  ];
  for (const [v, label] of modes) hb.append(el('option', { value: v, text: label }));
  hb.value = d.settings.healthBars;
  hb.addEventListener('change', () => {
    d.settings.healthBars = hb.value as HealthBarMode;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const ring = el('input', { type: 'checkbox', id: 'set-rangering' });
  ring.checked = d.settings.rangeRing;
  ring.addEventListener('change', () => {
    d.settings.rangeRing = ring.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const timing = el('input', { type: 'checkbox', id: 'set-timingbars' });
  timing.checked = d.settings.showTimingBars;
  timing.addEventListener('change', () => {
    d.settings.showTimingBars = timing.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const plock = el('input', { type: 'checkbox', id: 'set-pointerlock' });
  plock.checked = d.settings.pointerLock;
  plock.addEventListener('change', () => {
    d.settings.pointerLock = plock.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const viewSel = el('select', { id: 'set-view' });
  viewSel.append(el('option', { value: '3d', text: '3D (perspektivisch)' }), el('option', { value: '2d', text: '2D-Debug (Draufsicht)' }));
  viewSel.value = d.settings.view;
  viewSel.addEventListener('change', () => {
    d.settings.view = viewSel.value as '2d' | '3d';
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const shadows = el('input', { type: 'checkbox', id: 'set-shadows' });
  shadows.checked = d.settings.shadows;
  shadows.addEventListener('change', () => {
    d.settings.shadows = shadows.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const fps = el('input', { type: 'checkbox', id: 'set-fps' });
  fps.checked = d.settings.showFps;
  fps.addEventListener('change', () => {
    d.settings.showFps = fps.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const sound = el('input', { type: 'checkbox', id: 'set-sound' });
  sound.checked = d.settings.sound;
  sound.addEventListener('change', () => {
    d.settings.sound = sound.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.05', id: 'set-volume' });
  vol.value = String(d.settings.soundVolume);
  vol.addEventListener('input', () => {
    d.settings.soundVolume = Number(vol.value);
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const ui = el('input', { type: 'range', min: '60', max: '160', step: '5', id: 'set-uiscale' });
  ui.value = String(d.settings.uiScale);
  const uiLabel = el('span', { text: `${d.settings.uiScale} %` });
  ui.addEventListener('input', () => {
    d.settings.uiScale = Number(ui.value);
    uiLabel.textContent = `${d.settings.uiScale} %`;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const cardMod = el('select', { id: 'set-cardmod' });
  for (const [v, label] of [
    ['game', 'Shift entfernt den Typ, Strg behält nur ihn (wie im Spiel)'],
    ['swapped', 'Strg entfernt den Typ, Shift behält nur ihn'],
  ] as const)
    cardMod.append(el('option', { value: v, text: label }));
  cardMod.value = d.settings.cardModifiers;
  cardMod.addEventListener('change', () => {
    d.settings.cardModifiers = cardMod.value as DisplaySettings['cardModifiers'];
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  root.append(
    el('div', { class: 'row' }, [el('label', {}, ['UI-Größe ', ui, ' ', uiLabel]), el('label', {}, ['Typ-Karten: ', cardMod]), el('span', { class: 'note', text: '(Klick ohne Taste = Untergruppe aktivieren, Tab / Strg+Tab = Untergruppe wechseln)' })]),
    el('div', { class: 'row' }, [el('label', {}, ['Ansicht ', viewSel]), el('label', {}, [shadows, ' Schatten (3D)']), el('label', {}, [fps, ' FPS anzeigen']), el('label', {}, [sound, ' Ton']), el('label', {}, ['Lautstärke ', vol])]),
    el('div', { class: 'row' }, [
      el('label', {}, ['Lebensbalken ', hb]),
      el('label', {}, [ring, ' Reichweitenring (Kalibrierhilfe: Zoom so einstellen, dass der Ring so groß wirkt wie im Spiel)']),
    ]),
    el('div', { class: 'row' }, [el('label', {}, [timing, ' Angriffs-Timing unter eigenen Einheiten (gelb = Ausholen, blau = Nachlauf, grau = Abklingzeit)'])]),
    el('div', { class: 'row' }, [
      el('label', {}, [plock, ' Mauszeiger im Spielfeld einsperren (Pointer-Lock, eigener Zeiger; Rand-Scrolling auch im Fenster; Esc gibt frei, nächster Klick sperrt wieder)']),
    ]),
    el('div', { class: 'note', text: `Zoom 2D: ${d.settings.zoom.toFixed(1)} px/Tile · Kameraabstand 3D: ${d.settings.zoom3d.toFixed(1)} Tiles (Standard 52 ≈ 44 px/Tile in Bildmitte bei 2560×1440, Neigung 45°, Sichtfeld 35°). Backspace setzt die Kamera zurück.` }),
  );

  // -------- Regeln
  root.append(el('h3', { text: 'Simulationsregeln' }));
  const rt = el('table');
  rt.append(el('tr', {}, [el('th', { text: 'Regel' }), el('th', { text: 'Wert' }), el('th', { text: 'Hinweis' })]));
  for (const r of RULE_ENTRIES) {
    const current = d.calibration.rules[r.key] ?? ruleDefault(r.key);
    let input: HTMLInputElement;
    if (r.type === 'boolean') {
      input = el('input', { type: 'checkbox' });
      input.checked = current === true;
      input.addEventListener('change', () => {
        (d.calibration.rules as Record<string, unknown>)[r.key] = input.checked;
        saveCalibration(d.calibration);
        d.onCalibrationChanged();
      });
    } else {
      input = el('input', { type: 'number', step: String(r.step ?? 0.1) });
      input.value = String(current);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        (d.calibration.rules as Record<string, unknown>)[r.key] = v;
        saveCalibration(d.calibration);
        d.onCalibrationChanged();
      });
    }
    const isDefault = d.calibration.rules[r.key] === undefined;
    rt.append(
      el('tr', {}, [
        el('td', { text: r.label }),
        el('td', {}, [input, ' ', el('span', { class: 'note', text: isDefault ? '' : `(Standard ${String(ruleDefault(r.key))})` })]),
        el('td', { class: 'note', text: r.note }),
      ]),
    );
  }
  root.append(rt);

  // -------- Kalibrierung der Einheitenwerte
  root.append(
    el('h3', { text: 'Kalibrierung: nicht bestätigte Einheitenwerte' }),
    el('div', { class: 'note', text: 'Alle Werte, die aoe4world nicht liefert. Platzhalter sind orange markiert; ein von dir gesetzter Wert gilt als nachgemessen. Leeres Feld = Platzhalter wiederherstellen.' }),
  );
  const ct = el('table');
  ct.append(el('tr', {}, [el('th', { text: 'Einheit' }), el('th', { text: 'Wert' }), el('th', { text: 'Eingabe' }), el('th', { text: 'Hinweis' })]));
  // Werte, die pro Zeitalter vorliegen (z. B. Projektiltempo), werden einmal angezeigt und für alle Zeitalter gesetzt.
  const groups = new Map<string, { unitId: string; unitName: string; label: string; paths: string[]; defaultValue: number; note: string }>();
  for (const e of listCalibrationEntries()) {
    const label = e.path.replace(/^ages\.\d+\./, 'ages.*.');
    const key = `${e.unitId}|${label}`;
    const g = groups.get(key);
    if (g) g.paths.push(e.path);
    else groups.set(key, { unitId: e.unitId, unitName: e.unitName, label, paths: [e.path], defaultValue: e.defaultValue, note: e.note });
  }
  for (const g of groups.values()) {
    const override = d.calibration.units[g.unitId]?.[g.paths[0]!];
    const input = el('input', { type: 'number', step: '0.05' });
    input.value = String(override ?? g.defaultValue);
    const badge = el('span', { class: `badge ${override === undefined ? 'unverified' : 'set'}`, text: override === undefined ? 'Platzhalter' : 'gesetzt' });
    input.addEventListener('change', () => {
      const units = (d.calibration.units[g.unitId] ??= {});
      if (input.value.trim() === '') {
        for (const p of g.paths) delete units[p];
        input.value = String(g.defaultValue);
      } else {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        for (const p of g.paths) units[p] = v;
      }
      const set = units[g.paths[0]!] !== undefined;
      badge.className = `badge ${set ? 'set' : 'unverified'}`;
      badge.textContent = set ? 'gesetzt' : 'Platzhalter';
      saveCalibration(d.calibration);
      d.onCalibrationChanged();
    });
    ct.append(
      el('tr', {}, [
        el('td', { text: g.unitName }),
        el('td', {}, [el('code', { text: g.label }), ' ', badge]),
        el('td', {}, [input]),
        el('td', { class: 'note', text: g.note + (g.paths.length > 1 ? ' Gilt für alle Zeitalter.' : '') }),
      ]),
    );
  }
  root.append(ct);

  // -------- Hotkeys
  const presetSel = el('select', { id: 'set-preset' });
  for (const p of PRESETS) presetSel.append(el('option', { value: p.id, text: p.label }));
  presetSel.value = d.hotkeys.presetId;
  presetSel.addEventListener('change', () => {
    d.hotkeys.applyPreset(presetSel.value);
    d.hotkeys.save();
    d.onHotkeysChanged();
    buildSettingsPanel(d);
  });
  root.append(
    el('h3', { text: 'Hotkeys' }),
    el('div', { class: 'row' }, [el('label', {}, ['Preset ', presetSel])]),
    el('div', { class: 'note', text: '"Mein Layout" stammt aus deiner Spieldatei (reference/hotkeys/Dorfzenter.rkp). Klick auf "Belegen", dann Tastenkombination drücken (Esc bricht ab). "Entfernen" löscht die Belegung. Orange = Taste stammt nicht aus der Spieldatei. Grau = Aktion wird erst in einer späteren Etappe wirksam. Tasten werden als physische Taste gespeichert; "Z" der Spieldatei ist die Taste links neben X.' }),
  );
  const ht = el('table');
  ht.append(el('tr', {}, [el('th', { text: 'Aktion' }), el('th', { text: 'Taste(n)' }), el('th', { text: '' })]));
  let lastCat = '';
  const describeAll = (id: ActionId) => d.hotkeys.get(id).map((b) => describeBinding(b, d.keyboardLayout)).join(', ') || '–';
  for (const a of ACTIONS) {
    if (a.category !== lastCat) {
      lastCat = a.category;
      ht.append(el('tr', {}, [el('th', { text: a.category, colspan: '3' })]));
    }
    const keysCell = el('td', { text: describeAll(a.id) });
    const unsure = d.hotkeys.preset.unsure.has(a.id) && !d.hotkeys.isCustom(a.id);
    const badge = el('span', { class: `badge ${unsure ? 'unverified' : 'set'}`, text: unsure ? 'nicht aus Spieldatei' : '' });
    if (!unsure) badge.hidden = true;
    const pendingBadge = el('span', { class: 'badge pending', text: a.pending ? `ab ${a.pending}` : '' });
    if (!a.pending) pendingBadge.hidden = true;
    const bindBtn = el('button', { text: 'Belegen' });
    const conflictNote = el('span', { class: 'note' });
    bindBtn.addEventListener('click', () => {
      bindBtn.textContent = 'Taste drücken …';
      conflictNote.textContent = '';
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          cleanup();
          return;
        }
        const b = bindingFromEvent(e);
        if (!b) return; // nur Modifier gedrückt
        const conflicts = d.hotkeys.conflicts(b, a.id);
        for (const other of conflicts) d.hotkeys.set(other, d.hotkeys.get(other).filter((x) => !(x.code === b.code && !!x.ctrl === !!b.ctrl && !!x.shift === !!b.shift && !!x.alt === !!b.alt)));
        d.hotkeys.set(a.id, [b]);
        d.hotkeys.save();
        d.onHotkeysChanged();
        if (conflicts.length) conflictNote.textContent = `Entfernt von: ${conflicts.map((c) => ACTIONS.find((x) => x.id === c)?.label ?? c).join(', ')}`;
        cleanup();
        buildSettingsPanel(d);
      };
      const cleanup = () => {
        window.removeEventListener('keydown', onKey, true);
        bindBtn.textContent = 'Belegen';
      };
      window.addEventListener('keydown', onKey, true);
    });
    const clearBtn = el('button', { text: 'Entfernen' });
    clearBtn.addEventListener('click', () => {
      d.hotkeys.set(a.id, []);
      d.hotkeys.save();
      d.onHotkeysChanged();
      buildSettingsPanel(d);
    });
    ht.append(el('tr', {}, [el('td', {}, [a.label, ' ', badge, ' ', pendingBadge]), keysCell, el('td', {}, [bindBtn, ' ', clearBtn, ' ', conflictNote])]));
  }
  root.append(ht);
  const resetHk = el('button', { text: 'Hotkeys auf Preset zurücksetzen' });
  resetHk.addEventListener('click', () => {
    d.hotkeys.resetToPreset();
    d.hotkeys.save();
    d.onHotkeysChanged();
    buildSettingsPanel(d);
  });
  root.append(el('div', { class: 'row' }, [resetHk]));

  // -------- Export / Import
  root.append(el('h3', { text: 'Export / Import' }));
  const exportBtn = el('button', { text: 'Einstellungen als JSON speichern' });
  exportBtn.addEventListener('click', () => {
    const json = JSON.stringify(exportBundle(d.settings, d.calibration, d.hotkeys), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `aoe4micro-einstellungen-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const importInput = el('input', { type: 'file', accept: 'application/json,.json' });
  importInput.addEventListener('change', async () => {
    const f = importInput.files?.[0];
    if (!f) return;
    d.onImport(await f.text());
    importInput.value = '';
  });
  const resetBtn = el('button', { text: 'Kalibrierung zurücksetzen' });
  resetBtn.addEventListener('click', () => {
    d.calibration.units = {};
    d.calibration.rules = {};
    saveCalibration(d.calibration);
    d.onCalibrationChanged();
    buildSettingsPanel(d);
  });
  root.append(el('div', { class: 'row' }, [exportBtn, el('label', {}, ['Importieren: ', importInput]), resetBtn]));
}
