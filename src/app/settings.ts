/** Anzeige-Einstellungen (localStorage) und Export/Import aller Einstellungen als JSON. */
import { ACTIONS, HotkeyMap, type ActionId, type KeyBinding } from './hotkeys';
import { emptyCalibration, saveCalibration, type CalibrationState } from './calibration';
import { exportHistory, importHistory, type Attempt } from './history';

export type HealthBarMode = 'always' | 'selectedOrDamaged' | 'selected';

export interface DisplaySettings {
  healthBars: HealthBarMode;
  rangeRing: boolean;
  zoom: number;
  speed: number;
  randomStart: boolean;
  showTimingBars: boolean;
  /** Mauszeiger im Spielfeld einsperren (Pointer-Lock mit eigenem Zeiger). */
  pointerLock: boolean;
  /** Darstellung: perspektivisch (3D) oder Draufsicht (2D-Debug). */
  view: '3d' | '2d';
  /** Kameraabstand der 3D-Ansicht in Tiles. */
  zoom3d: number;
  /** Schatten in der 3D-Ansicht. */
  shadows: boolean;
  /** FPS-Anzeige. */
  showFps: boolean;
  /** Größe des HUD in Prozent (wie die UI-Skalierung im Spiel). */
  uiScale: number;
  sound: boolean;
  soundVolume: number;
  lastScenario: string | null;
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  healthBars: 'always',
  rangeRing: false,
  zoom: 48,
  speed: 1,
  randomStart: false,
  showTimingBars: true,
  pointerLock: false,
  view: '3d',
  zoom3d: 31,
  shadows: true,
  showFps: true,
  uiScale: 100,
  sound: true,
  soundVolume: 0.5,
  lastScenario: null,
};

const STORAGE_KEY = 'aoe4micro.settings.v1';

export function loadSettings(): DisplaySettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DisplaySettings>) };
  } catch {
    /* ignorieren */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: DisplaySettings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignorieren */
  }
}

export interface ExportBundle {
  format: 'aoe4micro-settings';
  version: 1;
  exportedAt: string;
  settings: DisplaySettings;
  calibration: CalibrationState;
  hotkeys: Partial<Record<ActionId, KeyBinding[]>>;
  hotkeyPreset?: string;
  /** Verlauf der Versuche pro Szenario. */
  history?: Record<string, Attempt[]>;
}

export function exportBundle(settings: DisplaySettings, calibration: CalibrationState, hotkeys: HotkeyMap): ExportBundle {
  const hk: Partial<Record<ActionId, KeyBinding[]>> = {};
  for (const a of ACTIONS) hk[a.id] = hotkeys.get(a.id);
  return { format: 'aoe4micro-settings', version: 1, exportedAt: new Date().toISOString(), settings, calibration, hotkeys: hk, hotkeyPreset: hotkeys.presetId, history: exportHistory() };
}

export interface ImportResult {
  settings: DisplaySettings;
  calibration: CalibrationState;
  hotkeys: HotkeyMap;
}

/** Liest ein Export-Bundle; wirft bei ungültigem Format. */
export function importBundle(json: string): ImportResult {
  const b = JSON.parse(json) as Partial<ExportBundle>;
  if (b.format !== 'aoe4micro-settings') throw new Error('Keine Einstellungsdatei dieses Tools.');
  const settings = { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) };
  const calibration: CalibrationState = { ...emptyCalibration(), ...(b.calibration ?? {}) };
  const hotkeys = new HotkeyMap(b.hotkeyPreset);
  for (const a of ACTIONS) {
    const bind = b.hotkeys?.[a.id];
    if (Array.isArray(bind)) hotkeys.set(a.id, bind);
  }
  saveSettings(settings);
  saveCalibration(calibration);
  hotkeys.save();
  if (b.history && typeof b.history === 'object') importHistory(b.history);
  return { settings, calibration, hotkeys };
}
