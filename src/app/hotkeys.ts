/**
 * Hotkey-Registry. Alle Aktionen sind frei belegbar (Einstellungsmenü); Belegungen werden in
 * localStorage gespeichert. Tasten werden als KeyboardEvent.code (physische Taste) gespeichert,
 * damit deutsche Layouts (Y/Z) keine Probleme machen.
 */
import meinLayout from '../data/hotkeys/mein-layout.json';

export type ActionId =
  | 'camera.up'
  | 'camera.down'
  | 'camera.left'
  | 'camera.right'
  | 'camera.focusSelection'
  | 'camera.reset'
  | 'game.restart'
  | 'game.pause'
  | 'game.settings'
  | 'unit.stop'
  | 'unit.attackMove'
  | 'unit.hold'
  | 'unit.patrol'
  | 'unit.delete'
  | 'formation.line'
  | 'formation.wedge'
  | 'formation.spread'
  | 'select.allMilitary'
  | 'select.allOfType'
  | 'select.idleMilitary'
  | 'select.nextIdleMilitary'
  | 'subselect.next'
  | 'subselect.prev'
  | 'group.removeAll'
  | `group.set.${GroupDigit}`
  | `group.select.${GroupDigit}`
  | `group.add.${GroupDigit}`
  | `group.addExclusive.${GroupDigit}`
  | `group.remove.${GroupDigit}`;

export type GroupDigit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const GROUP_DIGITS: readonly GroupDigit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

export interface KeyBinding {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ActionInfo {
  id: ActionId;
  label: string;
  category: 'Kamera' | 'Spiel' | 'Einheitenbefehle' | 'Formation' | 'Auswahl' | 'Kontrollgruppen';
  /** Wird bei gehaltener Taste jeden Frame ausgelöst (Kamera) statt einmal pro Druck. */
  continuous?: boolean;
  /** Noch nicht umgesetzt (kommt in der genannten Etappe). */
  pending?: string;
}

export const ACTIONS: readonly ActionInfo[] = [
  { id: 'camera.up', label: 'Kamera nach oben', category: 'Kamera', continuous: true },
  { id: 'camera.down', label: 'Kamera nach unten', category: 'Kamera', continuous: true },
  { id: 'camera.left', label: 'Kamera nach links', category: 'Kamera', continuous: true },
  { id: 'camera.right', label: 'Kamera nach rechts', category: 'Kamera', continuous: true },
  { id: 'camera.focusSelection', label: 'Kamera auf Auswahl zentrieren', category: 'Kamera' },
  { id: 'camera.reset', label: 'Kamera zurücksetzen (Standardzoom, auf eigene Truppe)', category: 'Kamera' },
  { id: 'game.restart', label: 'Szenario neu starten', category: 'Spiel' },
  { id: 'game.pause', label: 'Pause', category: 'Spiel' },
  { id: 'game.settings', label: 'Einstellungen öffnen', category: 'Spiel' },
  { id: 'unit.attackMove', label: 'Angriffsbewegung (dann Ziel klicken)', category: 'Einheitenbefehle' },
  { id: 'unit.stop', label: 'Stopp', category: 'Einheitenbefehle' },
  { id: 'unit.patrol', label: 'Patrouille (dann Ziel klicken)', category: 'Einheitenbefehle' },
  { id: 'unit.hold', label: 'Position halten', category: 'Einheitenbefehle' },
  { id: 'unit.delete', label: 'Einheit löschen', category: 'Einheitenbefehle' },
  { id: 'formation.line', label: 'Formation: Linie', category: 'Formation' },
  { id: 'formation.wedge', label: 'Formation: versetzt (Keil)', category: 'Formation' },
  { id: 'formation.spread', label: 'Formation: aufgelockert', category: 'Formation' },
  { id: 'select.allMilitary', label: 'Alle Militäreinheiten auswählen', category: 'Auswahl' },
  { id: 'select.allOfType', label: 'Alle Einheiten dieses Typs auswählen', category: 'Auswahl' },
  { id: 'select.idleMilitary', label: 'Alle untätigen Militäreinheiten auswählen', category: 'Auswahl' },
  { id: 'select.nextIdleMilitary', label: 'Nächste untätige Militäreinheit', category: 'Auswahl' },
  { id: 'subselect.next', label: 'Untergruppe: nächster Typ', category: 'Auswahl' },
  { id: 'subselect.prev', label: 'Untergruppe: voriger Typ', category: 'Auswahl' },
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.select.${d}`, label: `Kontrollgruppe ${d} auswählen (Doppeltipp zentriert)`, category: 'Kontrollgruppen' })),
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.set.${d}`, label: `Kontrollgruppe ${d} setzen`, category: 'Kontrollgruppen' })),
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.add.${d}`, label: `Zu Kontrollgruppe ${d} hinzufügen`, category: 'Kontrollgruppen' })),
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.addExclusive.${d}`, label: `Exklusiv zu Kontrollgruppe ${d} (aus allen anderen entfernen)`, category: 'Kontrollgruppen' })),
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.remove.${d}`, label: `Aus Kontrollgruppe ${d} entfernen`, category: 'Kontrollgruppen' })),
  { id: 'group.removeAll', label: 'Auswahl aus allen Kontrollgruppen entfernen', category: 'Kontrollgruppen' },
];

export type Bindings = Record<ActionId, KeyBinding[]>;

function withAll(partial: Partial<Record<ActionId, KeyBinding[]>>): Bindings {
  const out = {} as Bindings;
  for (const a of ACTIONS) out[a.id] = structuredClone(partial[a.id] ?? []);
  return out;
}

/** Vorschlag im klassischen Raster-Layout (A S D / Z X C V); unsichere Tasten in PRESET_UNSURE. */
export const GRID_DEFAULT_PRESET: Bindings = withAll({
  'camera.up': [{ code: 'ArrowUp' }],
  'camera.down': [{ code: 'ArrowDown' }],
  'camera.left': [{ code: 'ArrowLeft' }],
  'camera.right': [{ code: 'ArrowRight' }],
  'camera.reset': [{ code: 'Backspace' }],
  'game.restart': [{ code: 'F4' }],
  'game.pause': [{ code: 'F3' }],
  'game.settings': [{ code: 'F10' }],
  'unit.attackMove': [{ code: 'KeyA' }],
  'unit.stop': [{ code: 'KeyS' }],
  'unit.patrol': [{ code: 'KeyD' }],
  'unit.hold': [{ code: 'KeyV' }],
  'unit.delete': [{ code: 'Delete' }],
  'formation.line': [{ code: 'KeyZ' }],
  'formation.wedge': [{ code: 'KeyX' }],
  'formation.spread': [{ code: 'KeyC' }],
  'select.allMilitary': [{ code: 'KeyC', ctrl: true, shift: true }],
  'subselect.next': [{ code: 'Tab' }],
  'subselect.prev': [{ code: 'Tab', ctrl: true }],
  ...(Object.fromEntries(GROUP_DIGITS.map((d) => [`group.select.${d}`, [{ code: `Digit${d}` }]])) as Record<`group.select.${GroupDigit}`, KeyBinding[]>),
  ...(Object.fromEntries(GROUP_DIGITS.map((d) => [`group.set.${d}`, [{ code: `Digit${d}`, ctrl: true }]])) as Record<`group.set.${GroupDigit}`, KeyBinding[]>),
  ...(Object.fromEntries(GROUP_DIGITS.map((d) => [`group.add.${d}`, [{ code: `Digit${d}`, shift: true }]])) as Record<`group.add.${GroupDigit}`, KeyBinding[]>),
});

/** Aus dem persönlichen Hotkey-Profil importiertes Layout (scripts/import-hotkeys.mjs). Eigene Zusätze: Neustart F4, Pause F3. */
export const MEIN_LAYOUT_PRESET: Bindings = withAll({
  ...(meinLayout.bindings as Partial<Record<ActionId, KeyBinding[]>>),
  'game.restart': [{ code: 'F4' }],
  'game.pause': [{ code: 'F3' }],
});

export interface PresetInfo {
  id: string;
  label: string;
  bindings: Bindings;
  /** Aktionen, deren Taste nicht aus dem importierten Profil stammt. */
  unsure: ReadonlySet<ActionId>;
}

export const PRESETS: readonly PresetInfo[] = [
  {
    id: 'mein-layout',
    label: meinLayout.label,
    bindings: MEIN_LAYOUT_PRESET,
    unsure: new Set<ActionId>(['game.restart', 'game.pause', ...ACTIONS.map((a) => a.id).filter((id) => !(id in meinLayout.bindings) || (meinLayout.bindings as Record<string, unknown[]>)[id]!.length === 0)]),
  },
  {
    id: 'raster-vorschlag',
    label: 'Raster-Layout (Vorschlag)',
    bindings: GRID_DEFAULT_PRESET,
    unsure: new Set<ActionId>(['unit.attackMove', 'unit.stop', 'unit.hold', 'unit.patrol', 'select.allMilitary', 'select.allOfType', 'game.restart', 'game.pause', 'game.settings']),
  },
];

export const DEFAULT_PRESET_ID = 'mein-layout';

export function presetById(id: string): PresetInfo {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
}

/** @deprecated Nur noch für Tests/Abwärtskompatibilität. */
export const PRESET_UNSURE: ReadonlySet<ActionId> = presetById(DEFAULT_PRESET_ID).unsure;

const STORAGE_KEY = 'kompanie.hotkeys.v3';
const LEGACY_KEY = 'aoe4micro.hotkeys.v3';
/** Frühere Preset-Kennungen, damit gespeicherte Einstellungen weiter gelesen werden. */
const LEGACY_PRESET_IDS: Record<string, string> = { 'aoe4-default': 'raster-vorschlag' };

export function sameBinding(a: KeyBinding, b: KeyBinding): boolean {
  return a.code === b.code && !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt;
}

export function bindingFromEvent(e: { code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): KeyBinding | null {
  if (/^(Control|Shift|Alt|Meta)(Left|Right)$/.test(e.code)) return null;
  const b: KeyBinding = { code: e.code };
  if (e.ctrlKey) b.ctrl = true;
  if (e.shiftKey) b.shift = true;
  if (e.altKey) b.alt = true;
  return b;
}

export class HotkeyMap {
  private bindings: Bindings;
  presetId: string;

  constructor(presetId: string = DEFAULT_PRESET_ID) {
    this.presetId = presetById(LEGACY_PRESET_IDS[presetId] ?? presetId).id;
    this.bindings = structuredClone(presetById(this.presetId).bindings);
  }

  static load(): HotkeyMap {
    const map = new HotkeyMap();
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? globalThis.localStorage?.getItem(LEGACY_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { presetId?: string; bindings?: Partial<Record<ActionId, KeyBinding[]>> };
        if (saved.presetId) map.applyPreset(saved.presetId);
        for (const a of ACTIONS) if (Array.isArray(saved.bindings?.[a.id])) map.bindings[a.id] = saved.bindings![a.id]!;
      }
    } catch {
      /* ungültige Daten ignorieren */
    }
    return map;
  }

  save(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ presetId: this.presetId, bindings: this.bindings }));
    } catch {
      /* z. B. privater Modus */
    }
  }

  applyPreset(id: string): void {
    const p = presetById(LEGACY_PRESET_IDS[id] ?? id);
    this.presetId = p.id;
    this.bindings = structuredClone(p.bindings);
  }

  get preset(): PresetInfo {
    return presetById(this.presetId);
  }

  get(action: ActionId): KeyBinding[] {
    return this.bindings[action];
  }

  set(action: ActionId, bindings: KeyBinding[]): void {
    this.bindings[action] = bindings;
  }

  /** true, wenn die Belegung vom Preset abweicht (vom Nutzer gesetzt). */
  isCustom(action: ActionId): boolean {
    const a = this.bindings[action];
    const b = this.preset.bindings[action];
    return a.length !== b.length || a.some((x, i) => !sameBinding(x, b[i]!));
  }

  resetToPreset(): void {
    this.bindings = structuredClone(this.preset.bindings);
  }

  /** Alle Aktionen, die dieselbe Taste benutzen (Konflikt), außer `except`. */
  conflicts(binding: KeyBinding, except?: ActionId): ActionId[] {
    return ACTIONS.filter((a) => a.id !== except && this.bindings[a.id].some((b) => sameBinding(b, binding))).map((a) => a.id);
  }

  /** Liefert die Aktion zu einem Tastendruck, oder null. Modifier müssen exakt passen. */
  match(e: { code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): ActionId | null {
    for (const a of ACTIONS) {
      for (const b of this.bindings[a.id]) {
        if (b.code === e.code && !!b.ctrl === e.ctrlKey && !!b.shift === e.shiftKey && !!b.alt === e.altKey) return a.id;
      }
    }
    return null;
  }

  isBound(code: string): boolean {
    return ACTIONS.some((a) => this.bindings[a.id].some((b) => b.code === code));
  }

  toJSON(): Bindings {
    return structuredClone(this.bindings);
  }
}

const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

/** Lesbare Darstellung; nutzt das Tastaturlayout des Browsers, wenn verfügbar (Chrome/Edge). */
export function describeBinding(b: KeyBinding, layout?: Map<string, string>): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push('Strg');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  let key = layout?.get(b.code);
  if (key) key = key.toUpperCase();
  else key = ARROWS[b.code] ?? b.code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  parts.push(key);
  return parts.join('+');
}

/**
 * Tastaturbelegung für die Anzeige (physischer Code → aufgedrucktes Zeichen). Chrome/Edge liefern sie
 * über die Keyboard-API; ohne diese API wird bei deutscher Browsersprache QWERTZ angenommen (Y und Z
 * vertauscht), damit die Rasterbeschriftung zur Tastatur passt.
 */
export async function loadKeyboardLayout(): Promise<Map<string, string> | undefined> {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
  try {
    const m = await kb?.getLayoutMap?.();
    if (m) return m;
  } catch {
    /* unten Fallback */
  }
  if (/^de/i.test(navigator.language ?? '')) return new Map([['KeyY', 'z'], ['KeyZ', 'y']]);
  return undefined;
}
