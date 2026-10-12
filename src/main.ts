import { buildUnitDefs, effectiveRules, loadCalibration, unverifiedPaths, type CalibrationState } from './app/calibration';
import { drawHistoryChart, type ChartHandle } from './app/chart';
import type { DrillSummary } from './app/drill';
import { EDITOR_SCENARIO_ID, loadEditorState, scenarioFromEditor } from './app/editor';
import { buildEditorPanel } from './app/editorPanel';
import { Game } from './app/game';
import { attemptFromSummary, bestAttempt, getAttempts, isBetter, recordAttempt, type Attempt } from './app/history';
import { HotkeyMap, loadKeyboardLayout } from './app/hotkeys';
import { importBundle, loadSettings, saveSettings, type DisplaySettings } from './app/settings';
import { buildSettingsPanel } from './app/settingsPanel';
import { SCENARIOS } from './data/scenarios/index';
import { simulateBaseline, type BaselineResult } from './sim/baseline';
import type { ScenarioDef } from './sim/scenario';
import type { RoundSummary } from './sim/stats';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const glCanvas = $<HTMLCanvasElement>('game3d');
canvas.tabIndex = 0;
let settings: DisplaySettings = loadSettings();
let calibration: CalibrationState = loadCalibration();
let hotkeys = HotkeyMap.load();
let defs = buildUnitDefs(calibration);
const editorState = loadEditorState();

function allScenarios(): ScenarioDef[] {
  return [...SCENARIOS, scenarioFromEditor(editorState, defs)];
}

const initialScenario = allScenarios().find((s) => s.id === settings.lastScenario) ?? SCENARIOS[0]!;
const game = new Game(canvas, glCanvas, defs, hotkeys, settings, effectiveRules(calibration), initialScenario);

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
const editorOverlay = $('editor');
const modeInfo = $('mode-info');
const drillPrompt = $('drill-prompt');
let keyboardLayout: Map<string, string> | undefined;
void loadKeyboardLayout().then((m) => {
  keyboardLayout = m;
});

function fillScenarioSelect(): void {
  scenarioSelect.replaceChildren();
  for (const sc of allScenarios()) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = sc.name;
    scenarioSelect.appendChild(opt);
  }
  const edit = document.createElement('option');
  edit.value = '__editor__';
  edit.textContent = 'Editor öffnen …';
  scenarioSelect.appendChild(edit);
  scenarioSelect.value = game.scenario.id;
}
fillScenarioSelect();
speedSelect.value = String(settings.speed);
randomStart.checked = settings.randomStart;

function selectScenario(sc: ScenarioDef): void {
  settings.lastScenario = sc.id;
  saveSettings(settings);
  result.hidden = true;
  game.restart(sc);
  scenarioSelect.value = sc.id;
}
scenarioSelect.addEventListener('change', () => {
  if (scenarioSelect.value === '__editor__') {
    openEditor();
    scenarioSelect.value = game.scenario.id;
    return;
  }
  const sc = allScenarios().find((s) => s.id === scenarioSelect.value);
  if (sc) selectScenario(sc);
  canvas.focus();
});
const btnView = $<HTMLButtonElement>('btn-view');
btnView.addEventListener('click', () => {
  game.setView(game.view === '3d' ? '2d' : '3d');
  saveSettings(settings);
  canvas.focus();
});
$('btn-restart').addEventListener('click', () => {
  result.hidden = true;
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

// -------- Overlays
function openOverlay(el: HTMLElement): void {
  game.exitPointerLock();
  el.hidden = false;
  game.inputBlocked = true;
  if (game.outcome === 'running' && !game.paused && game.scenario.kind !== 'drill') game.togglePause();
}
function closeOverlay(el: HTMLElement): void {
  el.hidden = true;
  game.inputBlocked = !settingsOverlay.hidden || !editorOverlay.hidden;
  canvas.focus();
}

// -------- Einstellungen
function rebuildSettingsPanel(): void {
  buildSettingsPanel({
    root: $('settings-body'),
    settings,
    calibration,
    hotkeys,
    onCalibrationChanged: () => {
      defs = buildUnitDefs(calibration);
      game.setDefs(defs, effectiveRules(calibration));
      game.restart();
      refreshHud();
    },
    onDisplayChanged: () => {
      if (settings.view !== game.view) game.setView(settings.view);
      game.setShadows(settings.shadows);
      game.audio.enabled = settings.sound;
      game.audio.setVolume(settings.soundVolume);
      refreshHud();
    },
    onHotkeysChanged: () => refreshHud(),
    keyboardLayout,
    onImport: (json) => {
      try {
        const r = importBundle(json);
        Object.assign(settings, r.settings);
        calibration = r.calibration;
        hotkeys = r.hotkeys;
        game.hotkeys = hotkeys;
        defs = buildUnitDefs(calibration);
        game.setDefs(defs, effectiveRules(calibration));
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
  if (!settingsOverlay.hidden) return;
  rebuildSettingsPanel();
  openOverlay(settingsOverlay);
}
game.onOpenSettings = openSettings;
$('btn-settings').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', () => closeOverlay(settingsOverlay));

// -------- Editor
function openEditor(): void {
  buildEditorPanel($('editor-body'), editorState, defs, (s) => {
    const sc = scenarioFromEditor(s, defs);
    closeOverlay(editorOverlay);
    fillScenarioSelect();
    selectScenario(sc);
  });
  openOverlay(editorOverlay);
}
$('btn-editor').addEventListener('click', openEditor);
$('editor-close').addEventListener('click', () => closeOverlay(editorOverlay));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!settingsOverlay.hidden) closeOverlay(settingsOverlay);
  else if (!editorOverlay.hidden) closeOverlay(editorOverlay);
  else if (!result.hidden) closeOverlay(result);
});

// -------- Ergebnis
let chart: ChartHandle | null = null;
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)} %`);

function row(table: HTMLElement, k: string, v: string, cls = ''): void {
  const tr = document.createElement('tr');
  const a = document.createElement('td');
  a.textContent = k;
  const b = document.createElement('td');
  b.className = `num ${cls}`;
  b.textContent = v;
  tr.append(a, b);
  table.append(tr);
}

function showResult(s: RoundSummary): void {
  const sc = game.scenario;
  const title = $('result-title');
  title.textContent = s.outcome === 'victory' ? 'Sieg' : s.outcome === 'defeat' ? 'Niederlage' : 'Unentschieden';
  title.className = s.outcome;

  const attempt = attemptFromSummary(s);
  const previous = getAttempts(sc.id);
  const prevBest = bestAttempt(previous);
  const newBest = isBetter(attempt, prevBest);
  const attempts = recordAttempt(sc.id, attempt);

  let baseline: BaselineResult | null = null;
  if ((sc.victory ?? 'annihilation') !== 'none') {
    try {
      baseline = simulateBaseline(defs, { ...sc, rules: { ...(sc.rules ?? {}), ...effectiveRules(calibration) } }, { seed: game.roundSeed, randomStart: game.roundRandomStart });
    } catch {
      baseline = null;
    }
  }

  const table = $('result-table');
  table.replaceChildren();
  row(table, 'Dauer', `${s.seconds.toFixed(1)} s`);
  row(table, 'Eigene Verluste / Überlebende', `${s.lostMine} / ${s.survivorsMine} (Verlustwert ${s.valueLostMine})`);
  row(table, 'Gegner getötet', `${s.lostTheirs} (Wert ${s.valueKilled})`);
  row(table, 'APM / effektive APM', `${Math.round(s.apm)} / ${Math.round(s.eapm)}`);
  const cmds = Object.entries(s.commandsByType)
    .map(([k, v]) => `${labelCommand(k)} ${v}`)
    .join(', ');
  row(table, 'Befehle', cmds || '–');
  row(table, 'Kite-Effizienz (abgegebene / mögliche Fernkampfangriffe)', s.kiteEfficiency === null ? '–' : `${pct(s.kiteEfficiency)} (${s.rangedAttacksCompleted} / ${Math.round(s.rangedAttacksPossible)})`);
  row(table, 'Erlittener Nahkampfschaden', String(Math.round(s.meleeDamageTaken)));
  row(table, 'Overkill-Schaden (inkl. verschwendete Projektile)', `${Math.round(s.overkill)} (${s.wastedProjectiles} Projektile)`);
  row(table, 'Ø gleichzeitig beschossene Ziele', s.avgSimultaneousTargets.toFixed(2));
  row(table, 'Idle-Zeit eigener Einheiten im Kampf', `${s.idleSeconds.toFixed(1)} s (${pct(s.idleFraction)} der Einheiten-Zeit)`);
  row(table, 'Abgebrochene Ausholzeiten (Windup-Cancel)', String(s.windupCancelled));
  row(table, 'Schaden ausgeteilt / erlitten', `${Math.round(s.damageDealt)} / ${Math.round(s.damageTaken)}`);
  row(table, 'Nahkampf-Fehlschläge (Ziel entkommen)', String(s.misses));
  if (baseline) {
    const b = baseline;
    const outcome = b.outcome === 'victory' ? 'Sieg' : b.outcome === 'defeat' ? 'Niederlage' : b.timedOut ? 'unentschieden (Zeitlimit)' : b.outcome;
    row(table, 'Vergleich "nur Attack-Move" (ohne Micro)', `${outcome}, Verluste ${b.lostMine} (Wert ${b.valueLostMine}), ${b.seconds.toFixed(1)} s`);
    const diff = b.valueLostMine - s.valueLostMine;
    row(table, 'Dein Micro gegenüber Attack-Move', diff > 0 ? `${diff} Ressourcen weniger verloren` : diff < 0 ? `${-diff} Ressourcen mehr verloren` : 'gleich', diff > 0 ? 'good' : diff < 0 ? 'bad' : '');
  }
  if (prevBest) {
    row(table, 'Bisheriger Bestwert', `${prevBest.outcome === 'victory' ? 'Sieg' : 'Niederlage'}, Verlustwert ${prevBest.valueLostMine}, ${prevBest.seconds.toFixed(1)} s`);
  }
  row(table, 'Bestwert', newBest ? 'Neuer Bestwert!' : 'nicht übertroffen', newBest ? 'good' : '');

  renderChart(attempts, 'valueLostMine', 'Verlustwert pro Versuch (niedriger ist besser)', baseline?.valueLostMine ?? null, 'nur Attack-Move');
  $('result-chart-wrap').hidden = false;
  openOverlay(result);
}

function renderChart(attempts: Attempt[], metric: 'valueLostMine' | 'reactionMs', label: string, baseline: number | null, baselineLabel: string): void {
  chart?.destroy();
  const best = bestAttempt(attempts);
  chart = drawHistoryChart($<HTMLCanvasElement>('result-chart'), $('chart-tooltip'), attempts, {
    metric,
    metricLabel: label,
    baseline,
    baselineLabel,
    bestIndex: best ? attempts.indexOf(best) : -1,
  });
}

function labelCommand(k: string): string {
  return ({ move: 'Bewegen', attack: 'Angriff', attackMove: 'Attack-Move', patrol: 'Patrouille', stop: 'Stopp', hold: 'Halten' } as Record<string, string>)[k] ?? k;
}

function showDrillResult(d: DrillSummary): void {
  const sc = game.scenario;
  const title = $('result-title');
  title.textContent = 'Hotkey-Drill beendet';
  title.className = '';
  const attempt: Attempt = {
    ...attemptFromSummary(game.currentSummary()),
    outcome: d.errors === 0 ? 'victory' : 'defeat',
    reactionMs: d.avgMs,
    errors: d.errors,
  };
  const previous = getAttempts(sc.id);
  const prevBest = bestAttempt(previous);
  const newBest = isBetter(attempt, prevBest);
  const attempts = recordAttempt(sc.id, attempt);
  const table = $('result-table');
  table.replaceChildren();
  row(table, 'Aufgaben', String(d.results.length));
  row(table, 'Ø Reaktionszeit', `${Math.round(d.avgMs)} ms`);
  row(table, 'Median / beste / schlechteste', `${Math.round(d.medianMs)} / ${Math.round(d.bestMs)} / ${Math.round(d.worstMs)} ms`);
  row(table, 'Fehlgriffe', String(d.errors), d.errors ? 'bad' : 'good');
  for (const [k, v] of Object.entries(d.byType)) row(table, `  ${k}`, `Ø ${Math.round(v.avgMs)} ms (${v.count}×)`);
  if (prevBest?.reactionMs !== undefined) row(table, 'Bisheriger Bestwert', `Ø ${Math.round(prevBest.reactionMs)} ms, ${prevBest.errors ?? 0} Fehlgriffe`);
  row(table, 'Bestwert', newBest ? 'Neuer Bestwert!' : 'nicht übertroffen', newBest ? 'good' : '');
  renderChart(attempts, 'reactionMs', 'Ø Reaktionszeit in ms pro Durchgang (niedriger ist besser)', null, '');
  $('result-chart-wrap').hidden = false;
  openOverlay(result);
}

$('result-restart').addEventListener('click', () => {
  closeOverlay(result);
  game.restart();
});
$('result-close').addEventListener('click', () => closeOverlay(result));
game.onRoundFinished = showResult;
game.audio.enabled = settings.sound;
game.audio.setVolume(settings.soundVolume);
game.onDrillFinished = showDrillResult;

// -------- HUD
function refreshDrill(): void {
  const d = game.drill;
  if (!d) {
    drillPrompt.hidden = true;
    return;
  }
  const p = d.progress;
  if (d.phase === 'prompt' && d.current) {
    drillPrompt.hidden = false;
    const step = d.currentStep;
    const stepHint = step ? ` · Schritt ${d.current.steps.indexOf(step) + 1}/${d.current.steps.length}` : '';
    drillPrompt.textContent = `${p.done + 1}/${p.total}: ${d.current.label}${stepHint}`;
  } else if (d.phase === 'waiting') {
    drillPrompt.hidden = false;
    drillPrompt.textContent = p.done === 0 ? 'Hotkey-Drill: gleich geht es los …' : `Aufgabe ${p.done}/${p.total} erledigt · nächste folgt …`;
  } else drillPrompt.hidden = true;
}
game.onDrillChanged = refreshDrill;

function refreshHud(): void {
  scenarioName.textContent = game.scenario.name;
  scenarioGoal.textContent = game.scenario.goal ?? game.scenario.description ?? '';
  btnPause.textContent = game.paused ? 'Weiter' : 'Pause';
  btnView.textContent = game.view === '3d' ? 'Ansicht: 3D' : 'Ansicht: 2D-Debug';
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
  modeInfo.hidden = !game.targeting;
  modeInfo.textContent = game.targeting === 'attackMove' ? 'Angriffsbewegung: Ziel mit Linksklick wählen (Shift = einreihen, Rechtsklick/Esc = abbrechen)' : game.targeting === 'patrol' ? 'Patrouille: Ziel mit Linksklick wählen (Shift = einreihen, Rechtsklick/Esc = abbrechen)' : '';
  refreshDrill();
}
game.onStateChanged = () => {
  refreshHud();
  saveSettings(settings);
};
refreshHud();
result.hidden = true;
window.addEventListener('resize', () => game.resize());

let lastStats = 0;
let lastDrill = 0;
function loop(now: number): void {
  game.frame(now);
  if (now - lastStats > 250) {
    lastStats = now;
    const s = game.stats;
    stats.textContent = `${s.simTime.toFixed(1)} s · Einheiten ${s.mine} : ${s.theirs}${settings.showFps ? ` · ${Math.round(s.fps)} FPS` : ''}`;
  }
  if (game.drill && now - lastDrill > 100) {
    lastDrill = now;
    refreshDrill();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
canvas.focus();
