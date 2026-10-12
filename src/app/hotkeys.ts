/**
 * Hotkey-Registry. Alle Aktionen sind frei belegbar (Einstellungsmenü); Belegungen werden in
 * localStorage gespeichert. Tasten werden als KeyboardEvent.code (physische Taste) gespeichert,
 * damit deutsche Layouts (Y/Z) keine Probleme machen.
 */
export type ActionId =
  | 'camera.up'
  | 'camera.down'
  | 'camera.left'
  | 'camera.right'
  | 'camera.focusSelection'
  | 'game.restart'
  | 'game.pause'
  | 'game.settings'
  | 'unit.stop'
  | 'unit.attackMove'
  | 'unit.hold'
  | 'unit.patrol'
  | 'select.allMilitary'
  | 'select.allOfType'
  | `group.set.${GroupDigit}`
  | `group.select.${GroupDigit}`
  | `group.add.${GroupDigit}`;

export type GroupDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const GROUP_DIGITS: readonly GroupDigit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface KeyBinding {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ActionInfo {
  id: ActionId;
  label: string;
  category: 'Kamera' | 'Spiel' | 'Einheitenbefehle' | 'Auswahl' | 'Kontrollgruppen';
  /** Wird bei gehaltener Taste jeden Frame ausgelöst (Kamera) statt einmal pro Druck. */
  continuous?: boolean;
}

export const ACTIONS: readonly ActionInfo[] = [
  { id: 'camera.up', label: 'Kamera nach oben', category: 'Kamera', continuous: true },
  { id: 'camera.down', label: 'Kamera nach unten', category: 'Kamera', continuous: true },
  { id: 'camera.left', label: 'Kamera nach links', category: 'Kamera', continuous: true },
  { id: 'camera.right', label: 'Kamera nach rechts', category: 'Kamera', continuous: true },
  { id: 'camera.focusSelection', label: 'Kamera auf Auswahl zentrieren', category: 'Kamera' },
  { id: 'game.restart', label: 'Szenario neu starten', category: 'Spiel' },
  { id: 'game.pause', label: 'Pause', category: 'Spiel' },
  { id: 'game.settings', label: 'Einstellungen öffnen', category: 'Spiel' },
  { id: 'unit.attackMove', label: 'Angriffsbewegung (dann Ziel klicken)', category: 'Einheitenbefehle' },
  { id: 'unit.stop', label: 'Stopp', category: 'Einheitenbefehle' },
  { id: 'unit.hold', label: 'Position halten', category: 'Einheitenbefehle' },
  { id: 'unit.patrol', label: 'Patrouille (dann Ziel klicken)', category: 'Einheitenbefehle' },
  { id: 'select.allMilitary', label: 'Alle Militäreinheiten auswählen', category: 'Auswahl' },
  { id: 'select.allOfType', label: 'Alle Einheiten dieses Typs auswählen', category: 'Auswahl' },
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.select.${d}`, label: `Kontrollgruppe ${d} auswählen (Doppeltipp zentriert)`, category: 'Kontrollgruppen' })),
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.set.${d}`, label: `Kontrollgruppe ${d} setzen`, category: 'Kontrollgruppen' })),
  ...GROUP_DIGITS.map((d): ActionInfo => ({ id: `group.add.${d}`, label: `Zu Kontrollgruppe ${d} hinzufügen`, category: 'Kontrollgruppen' })),
];

/** Voreinstellung nach AoE4-Standard (Grid-Layout), soweit bekannt; unsichere Tasten in PRESET_UNSURE. */
export const AOE4_DEFAULT_PRESET: Record<ActionId, KeyBinding[]> = {
  'camera.up': [{ code: 'ArrowUp' }],
  'camera.down': [{ code: 'ArrowDown' }],
  'camera.left': [{ code: 'ArrowLeft' }],
  'camera.right': [{ code: 'ArrowRight' }],
  'camera.focusSelection': [],
  'game.restart': [{ code: 'F4' }],
  'game.pause': [{ code: 'F3' }],
  'game.settings': [{ code: 'F10' }],
  'unit.attackMove': [{ code: 'KeyA' }],
  'unit.stop': [{ code: 'KeyS' }],
  'unit.hold': [{ code: 'KeyH' }],
  'unit.patrol': [{ code: 'KeyP' }],
  'select.allMilitary': [{ code: 'KeyM', ctrl: true, shift: true }],
  'select.allOfType': [{ code: 'KeyT', ctrl: true, shift: true }],
  ...(Object.fromEntries(GROUP_DIGITS.map((d) => [`group.select.${d}`, [{ code: `Digit${d}` }]])) as Record<`group.select.${GroupDigit}`, KeyBinding[]>),
  ...(Object.fromEntries(GROUP_DIGITS.map((d) => [`group.set.${d}`, [{ code: `Digit${d}`, ctrl: true }]])) as Record<`group.set.${GroupDigit}`, KeyBinding[]>),
  ...(Object.fromEntries(GROUP_DIGITS.map((d) => [`group.add.${d}`, [{ code: `Digit${d}`, shift: true }]])) as Record<`group.add.${GroupDigit}`, KeyBinding[]>),
};

/** Aktionen, deren Standardtaste im echten Spiel nicht sicher bekannt ist (bitte mit eigener Belegung prüfen). */
export const PRESET_UNSURE: ReadonlySet<ActionId> = new Set<ActionId>([
  'unit.attackMove',
  'unit.stop',
  'unit.hold',
  'unit.patrol',
  'select.allMilitary',
  'select.allOfType',
  'game.restart',
  'game.pause',
  'game.settings',
]);

const STORAGE_KEY = 'aoe4micro.hotkeys.v2';

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
  private bindings: Record<ActionId, KeyBinding[]>;

  constructor(preset: Record<ActionId, KeyBinding[]> = AOE4_DEFAULT_PRESET) {
    this.bindings = structuredClone(preset);
  }

  static load(): HotkeyMap {
    const map = new HotkeyMap();
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Record<ActionId, KeyBinding[]>>;
        for (const a of ACTIONS) if (Array.isArray(saved[a.id])) map.bindings[a.id] = saved[a.id]!;
      }
    } catch {
      /* ungültige Daten ignorieren */
    }
    return map;
  }

  save(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      /* z. B. privater Modus */
    }
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
    const b = AOE4_DEFAULT_PRESET[action];
    return a.length !== b.length || a.some((x, i) => !sameBinding(x, b[i]!));
  }

  resetToPreset(): void {
    this.bindings = structuredClone(AOE4_DEFAULT_PRESET);
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

  toJSON(): Record<ActionId, KeyBinding[]> {
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

export async function loadKeyboardLayout(): Promise<Map<string, string> | undefined> {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
  try {
    return await kb?.getLayoutMap?.();
  } catch {
    return undefined;
  }
}
