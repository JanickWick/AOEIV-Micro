/**
 * Hotkey-Registry. Alle Aktionen sind frei belegbar (Einstellungsmenü folgt in M3);
 * Belegungen werden in localStorage gespeichert. Tasten werden als KeyboardEvent.code
 * (physische Taste) gespeichert, damit deutsche Layouts (Y/Z) keine Probleme machen.
 */
export type ActionId =
  | 'camera.up'
  | 'camera.down'
  | 'camera.left'
  | 'camera.right'
  | 'game.restart'
  | 'game.pause'
  | 'unit.stop';

export interface KeyBinding {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ActionInfo {
  id: ActionId;
  label: string;
  /** Wird bei gehaltener Taste jeden Frame ausgelöst (Kamera) statt einmal pro Druck. */
  continuous?: boolean;
}

export const ACTIONS: readonly ActionInfo[] = [
  { id: 'camera.up', label: 'Kamera nach oben', continuous: true },
  { id: 'camera.down', label: 'Kamera nach unten', continuous: true },
  { id: 'camera.left', label: 'Kamera nach links', continuous: true },
  { id: 'camera.right', label: 'Kamera nach rechts', continuous: true },
  { id: 'game.restart', label: 'Szenario neu starten' },
  { id: 'game.pause', label: 'Pause' },
  { id: 'unit.stop', label: 'Stopp' },
];

/** Voreinstellung nach AoE4-Standard (Grid-Layout), soweit in M1 relevant. */
export const AOE4_DEFAULT_PRESET: Record<ActionId, KeyBinding[]> = {
  'camera.up': [{ code: 'ArrowUp' }],
  'camera.down': [{ code: 'ArrowDown' }],
  'camera.left': [{ code: 'ArrowLeft' }],
  'camera.right': [{ code: 'ArrowRight' }],
  'game.restart': [{ code: 'F4' }],
  'game.pause': [{ code: 'F3' }],
  'unit.stop': [{ code: 'KeyS' }],
};

const STORAGE_KEY = 'aoe4micro.hotkeys.v1';

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
        for (const a of ACTIONS) if (saved[a.id]) map.bindings[a.id] = saved[a.id]!;
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

  /** Liefert die Aktion zu einem Tastendruck, oder null. */
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
}

export function describeBinding(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push('Strg');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  parts.push(b.code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '↑↓←→'.charAt(['Up', 'Down', 'Left', 'Right'].indexOf(b.code.slice(5)))));
  return parts.join('+');
}
