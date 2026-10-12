import { buildUnitDefs, effectiveRules, loadCalibration, unverifiedPaths, type CalibrationState } from './app/calibration';
import { Game } from './app/game';
import { HotkeyMap } from './app/hotkeys';
import { importBundle, loadSettings, saveSettings, type DisplaySettings } from './app/settings';
import { buildSettingsPanel } from './app/settingsPanel';
import type { RoundSummary } from './app/summary';
import { SCENARIOS } from './data/scenarios/index';
import type { ScenarioDef } from './sim/scenario';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
canvas.tabIndex = 0;
let settings: DisplaySettings = loadSettings();
let calibration: CalibrationState = loadCalibration();
let hotkeys = HotkeyMap.load();

const initialScenario = SCENARIOS.find((s) => s.id === settings.lastScenario) ?? SCENARIOS[0]!;
const game = new Game(canvas, buildUnitDefs(calibration), hotkeys, settings, effectiveRules(calibration), initialScenario);

const scenarioName = $('scenario-name');
const scenarioGoal = $('scenario-goal');
const unverifiedHint = $('unverified-hint');
const stats = $('stats');
const selectionInfo = $('selection-info');
const scenarioSelect = $<HTMLSelectElement>('scenario-select');
const speedSelect = $<HTMLSelectElement>('speed-select');
const randomStart = $<HTMLInputElement>('random-start');
const btnPause = $<HTMLButtonElement>('btn-pause');
const result = $('result');
const settingsOverlay = $('settings');

for (const sc of SCENARIOS) {
  const opt = document.createElement('option');
  opt.value = sc.id;
  opt.textContent = sc.name;
  scenarioSelect.appendChild(opt);
}
scenarioSelect.value = initialScenario.id;
speedSelect.value = String(settings.speed);
randomStart.checked = settings.randomStart;

function selectScenario(sc: ScenarioDef): void {
  settings.lastScenario = sc.id;
  saveSettings(settings);
  game.restart(sc);
}
scenarioSelect.addEventListener('change', () => {
  const sc = SCENARIOS.find((s) => s.id === scenarioSelect.value);
  if (sc) selectScenario(sc);
  canvas.focus();
});
$('btn-restart').addEventListener('click', () => {
  game.restart();
  canvas.focus();
});
btnPause.addEventListener('click', () => {
  game.togglePause();
  canvas.focus();
});
speedSelect.addEventListener('change', () => {
  settings.speed = Number(speedSelect.value);
  saveSettings(settings);
  canvas.focus();
});
randomStart.addEventListener('change', () => {
  settings.randomStart = randomStart.checked;
  saveSettings(settings);
  game.restart();
  canvas.focus();
});
$('btn-fullscreen').addEventListener('click', async () => {
  const app = document.getElementById('app')!;
  try {
    if (!document.fullscreenElement) {
      await app.requestFullscreen();
      const kb = (navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard;
      await kb?.lock?.().catch(() => undefined);
    } else {
      await document.exitFullscreen();
    }
  } catch {
    /* Vollbild verweigert */
  }
  canvas.focus();
});

// -------- Einstellungen
function rebuildSettingsPanel(): void {
  buildSettingsPanel({
    root: $('settings-body'),
    settings,
    calibration,
    hotkeys,
    onCalibrationChanged: () => {
      game.setDefs(buildUnitDefs(calibration), effectiveRules(calibration));
      game.restart();
      refreshHud();
    },
    onDisplayChanged: () => refreshHud(),
    onImport: (json) => {
      try {
        const r = importBundle(json);
        Object.assign(settings, r.settings);
        calibration = r.calibration;
        hotkeys = r.hotkeys;
        game.setDefs(buildUnitDefs(calibration), effectiveRules(calibration));
        game.restart();
        rebuildSettingsPanel();
        refreshHud();
      } catch (e) {
        window.alert(`Import fehlgeschlagen: ${(e as Error).message}`);
      }
    },
  });
}
function openSettings(): void {
  rebuildSettingsPanel();
  settingsOverlay.hidden = false;
  game.inputBlocked = true;
  if (game.outcome === 'running' && !game.paused) game.togglePause();
}
function closeSettings(): void {
  settingsOverlay.hidden = true;
  game.inputBlocked = false;
  canvas.focus();
}
$('btn-settings').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', closeSettings);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !settingsOverlay.hidden) closeSettings();
});

// -------- Ergebnis
function showResult(s: RoundSummary): void {
  const title = $('result-title');
  title.textContent = s.outcome === 'victory' ? 'Sieg' : s.outcome === 'defeat' ? 'Niederlage' : 'Unentschieden';
  title.className = s.outcome;
  const rows: [string, string][] = [
    ['Dauer', `${s.seconds.toFixed(1)} s`],
    ['Eigene Verluste', `${s.lostMine} (Wert ${s.valueLostMine})`],
    ['Gegner getötet', `${s.lostTheirs} (Wert ${s.valueKilled})`],
    ['Schaden ausgeteilt / erlitten', `${Math.round(s.damageDealt)} / ${Math.round(s.damageTaken)}`],
    ['Angriffe begonnen / Treffer', `${s.attacksStarted} / ${s.hitsDealt}`],
    ['Abgebrochene Ausholzeiten (Windup-Cancel)', String(s.windupCancelled)],
    ['Nahkampf-Fehlschläge (Ziel entkommen)', String(s.misses)],
  ];
  const table = $('result-table');
  table.replaceChildren(
    ...rows.map(([k, v]) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      a.textContent = k;
      const b = document.createElement('td');
      b.className = 'num';
      b.textContent = v;
      tr.append(a, b);
      return tr;
    }),
  );
  result.hidden = false;
}
$('result-restart').addEventListener('click', () => {
  result.hidden = true;
  game.restart();
  canvas.focus();
});
$('result-close').addEventListener('click', () => {
  result.hidden = true;
  canvas.focus();
});
game.onRoundFinished = showResult;

// -------- HUD
function refreshHud(): void {
  scenarioName.textContent = game.scenario.name;
  scenarioGoal.textContent = game.scenario.goal ?? game.scenario.description ?? '';
  btnPause.textContent = game.paused ? 'Weiter' : 'Pause';
  const deps = game.scenario.dependsOnUnverified ?? [];
  const open = unverifiedPaths(calibration);
  const missing = deps.filter((p) => open.includes(p));
  unverifiedHint.hidden = missing.length === 0;
  unverifiedHint.textContent = missing.length ? `Hinweis: Dieses Szenario hängt von unbestätigten Werten ab (${missing.join(', ')}). Ergebnisse sind erst nach Kalibrierung aussagekräftig.` : '';
  const counts = new Map<string, number>();
  for (const id of game.selection) {
    const u = game.world.units.find((x) => x.id === id);
    if (!u || !u.alive) continue;
    const name = game.world.defs.get(u.defId).name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  selectionInfo.textContent = counts.size === 0 ? 'Keine Auswahl' : [...counts].map(([n, c]) => `${c}× ${n}`).join(', ');
}
game.onStateChanged = () => {
  refreshHud();
  saveSettings(settings);
};
refreshHud();
result.hidden = true;
window.addEventListener('resize', () => game.resize());

let lastStats = 0;
function loop(now: number): void {
  game.frame(now);
  if (now - lastStats > 250) {
    lastStats = now;
    const s = game.stats;
    stats.textContent = `${s.simTime.toFixed(1)} s · Einheiten ${s.mine} : ${s.theirs} · ${Math.round(s.fps)} FPS`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
canvas.focus();
