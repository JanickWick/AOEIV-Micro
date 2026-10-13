/** Anzeige-Einstellungen (localStorage) und Export/Import aller Einstellungen als JSON. */
import { ACTIONS, HotkeyMap, type ActionId, type KeyBinding } from './hotkeys';
import { emptyCalibration, saveCalibration, type CalibrationState } from './calibration';
import { exportHistory, importHistory, type Attempt } from './history';
import { exportDaily, importDaily, type DailyStore } from './daily';
import { exportGhosts, importGhosts, type GhostStore } from './ghosts';

export type HealthBarMode = 'always' | 'selectedOrDamaged' | 'selected';
/** Grafikqualität der 3D-Ansicht (Schatten, Auflösung). */
export type QualityLevel = 'low' | 'medium' | 'high';

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
  /** Schatten in der 3D-Ansicht (wird von `quality` abgeleitet; bleibt für alte Exporte). */
  shadows: boolean;
  /** Qualitätsstufe der 3D-Ansicht. */
  quality: QualityLevel;
  /** FPS-Anzeige. */
  showFps: boolean;
  /** Größe des HUD in Prozent. */
  uiScale: number;
  /** Typ-Karten: 'game' = Shift+Klick entfernt den Typ, Strg+Klick behält nur ihn (klassische Belegung); 'swapped' = umgekehrt. */
  cardModifiers: 'game' | 'swapped';
  sound: boolean;
  soundVolume: number;
  lastScenario: string | null;
  /** Geisterlauf (eigener Bestlauf) halbtransparent mitlaufen lassen. */
  ghost: boolean;
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
  quality: 'medium',
  showFps: true,
  uiScale: 100,
  cardModifiers: 'game',
  sound: true,
  soundVolume: 0.5,
  lastScenario: null,
  ghost: true,
};

const STORAGE_KEY = 'kompanie.settings.v1';
const LEGACY_KEY = 'aoe4micro.settings.v1';

export function loadSettings(): DisplaySettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? globalThis.localStorage?.getItem(LEGACY_KEY);
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
  format: 'kompanie-settings';
  version: 1;
  exportedAt: string;
  settings: DisplaySettings;
  calibration: CalibrationState;
  hotkeys: Partial<Record<ActionId, KeyBinding[]>>;
  hotkeyPreset?: string;
  /** Verlauf der Versuche pro Szenario. */
  history?: Record<string, Attempt[]>;
  /** Daily Challenge: Versuche je Tag. */
  daily?: DailyStore;
  /** Geisterläufe: Bestlauf je Szenario als Replay. */
  ghosts?: GhostStore;
}

export function exportBundle(settings: DisplaySettings, calibration: CalibrationState, hotkeys: HotkeyMap): ExportBundle {
  const hk: Partial<Record<ActionId, KeyBinding[]>> = {};
  for (const a of ACTIONS) hk[a.id] = hotkeys.get(a.id);
  return { format: 'kompanie-settings', version: 1, exportedAt: new Date().toISOString(), settings, calibration, hotkeys: hk, hotkeyPreset: hotkeys.presetId, history: exportHistory(), daily: exportDaily(), ghosts: exportGhosts() };
}

export interface ImportResult {
  settings: DisplaySettings;
  calibration: CalibrationState;
  hotkeys: HotkeyMap;
}

/** Liest ein Export-Bundle; wirft bei ungültigem Format. */
export function importBundle(json: string): ImportResult {
  const b = JSON.parse(json) as Partial<ExportBundle> & { format?: string };
  // Ältere Exporte tragen noch den alten Formatnamen und werden weiter gelesen.
  if (b.format !== 'kompanie-settings' && b.format !== 'aoe4micro-settings') throw new Error('Keine Einstellungsdatei dieses Spiels.');
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
  if (b.daily && typeof b.daily === 'object') importDaily(b.daily);
  if (b.ghosts && typeof b.ghosts === 'object') importGhosts(b.ghosts);
  return { settings, calibration, hotkeys };
}
