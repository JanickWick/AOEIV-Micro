import { buildUnitDefs, effectiveRules, loadCalibration, unverifiedPaths, type CalibrationState } from './app/calibration';
import { drawHistoryChart, type ChartHandle } from './app/chart';
import type { DrillSummary } from './app/drill';
import { EDITOR_SCENARIO_ID, loadEditorState, scenarioFromEditor } from './app/editor';
import { buildEditorPanel } from './app/editorPanel';
import { Game } from './app/game';
import { Hud, UNIT_CODE, type GroupMarker, type SelectionCard } from './app/hud';
import { attemptFromSummary, bestAttempt, getAttempts, isBetter, recordAttempt, type Attempt } from './app/history';
import { HotkeyMap, loadKeyboardLayout, type ActionId } from './app/hotkeys';
import { importBundle, loadSettings, saveSettings, type DisplaySettings } from './app/settings';
import { buildSettingsPanel } from './app/settingsPanel';
import { SCENARIOS } from './data/scenarios/index';
import { simulateBaseline, type BaselineResult } from './sim/baseline';
import type { ScenarioDef } from './sim/scenario';
import type { Formation, UnitId } from './sim/types';
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

const result = $('result');
const settingsOverlay = $('settings');
const editorOverlay = $('editor');
let keyboardLayout: Map<string, string> | undefined;

const hud = new Hud($('hud'), {
  onAction: (action: ActionId) => {
    game.runAction(action, false);
    canvas.focus();
  },
  onGroupClick: (n, double) => {
    game.groupSelect(n, performance.now());
    if (double) game.focusSelection();
    refreshHud();
    canvas.focus();
  },
  onMenu: (item) => {
    switch (item) {
      case 'settings':
        openSettings();
        return;
      case 'restart':
        result.hidden = true;
        game.restart();
        break;
      case 'pause':
        game.togglePause();
        break;
      case 'editor':
        openEditor();
        return;
      case 'view':
        game.setView(game.view === '3d' ? '2d' : '3d');
        saveSettings(settings);
        break;
      case 'fullscreen':
        void toggleFullscreen();
        break;
    }
    canvas.focus();
  },
  onScenarioChange: (id) => {
    if (id === '__editor__') {
      openEditor();
      hud.scenarioSelect.value = game.scenario.id;
      return;
    }
    const sc = allScenarios().find((s) => s.id === id);
    if (sc) selectScenario(sc);
    canvas.focus();
  },
  onSpeedChange: (v) => {
    settings.speed = v;
    saveSettings(settings);
    canvas.focus();
  },
  onRandomChange: (on) => {
    settings.randomStart = on;
    saveSettings(settings);
    game.restart();
    canvas.focus();
  },
});
void loadKeyboardLayout().then((m) => {
  keyboardLayout = m;
  hud.setKeyboardLayout(m);
  refreshHud();
});
hud.setScale(settings.uiScale);
game.minimapBox = () => hud.minimapBox();
game.onActionTriggered = (a) => hud.flash(a);

function fillScenarioSelect(): void {
  hud.fillScenarios(
    allScenarios().map((sc) => ({ id: sc.id, name: sc.name })),
    game.scenario.id,
  );
}
fillScenarioSelect();
hud.speedSelect.value = String(settings.speed);
hud.randomStart.checked = settings.randomStart;

function selectScenario(sc: ScenarioDef): void {
  settings.lastScenario = sc.id;
  saveSettings(settings);
  result.hidden = true;
  game.restart(sc);
  hud.scenarioSelect.value = sc.id;
}

async function toggleFullscreen(): Promise<void> {
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
}

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
      hud.setScale(settings.uiScale);
      game.resize();
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
function drillText(): string | null {
  const d = game.drill;
  if (!d) return null;
  const p = d.progress;
  if (d.phase === 'prompt' && d.current) {
    const step = d.currentStep;
    const stepHint = step ? ` · Schritt ${d.current.steps.indexOf(step) + 1}/${d.current.steps.length}` : '';
    return `${p.done + 1}/${p.total}: ${d.current.label}${stepHint}`;
  }
  if (d.phase === 'waiting') return p.done === 0 ? 'Hotkey-Drill: gleich geht es los …' : `Aufgabe ${p.done}/${p.total} erledigt · nächste folgt …`;
  return null;
}
function refreshDrill(): void {
  hud.setDrill(drillText());
}
game.onDrillChanged = refreshDrill;

/** Feste Reihenfolge der Typen in Auswahl-Leiste und Gruppenmarken (wie im Spiel: Infanterie, Fernkampf, Kavallerie, Belagerung). */
const TYPE_ORDER = ['spearman', 'man-at-arms', 'archer', 'crossbowman', 'horseman', 'knight', 'mangonel', 'springald'];
function typeRank(defId: string): number {
  const i = TYPE_ORDER.indexOf(defId);
  return i < 0 ? 99 : i;
}

function cardsFor(ids: Iterable<UnitId>): { cards: SelectionCard[]; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const id of ids) {
    const u = game.world.units.find((x) => x.id === id);
    if (!u || !u.alive) continue;
    counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
    total++;
  }
  const cards = [...counts]
    .sort((a, b) => typeRank(a[0]) - typeRank(b[0]))
    .map(([defId, count]) => ({ defId, code: UNIT_CODE[defId] ?? defId.slice(0, 2).toUpperCase(), name: game.world.defs.get(defId).name, count }));
  return { cards, total };
}

function refreshGroups(): void {
  const markers: GroupMarker[] = [];
  for (let n = 1; n <= 10; n++) {
    const k = n % 10;
    const ids = game.groups.get(k, game.world.units);
    if (ids.length === 0) continue;
    const { cards, total } = cardsFor(ids);
    const lead = cards[0];
    markers.push({ n: k, count: total, code: cards.length > 1 ? '+' : (lead?.code ?? '?'), label: cards.map((c) => `${c.count}× ${c.name}`).join(', ') });
  }
  hud.setGroups(markers);
}

function refreshGrid(): void {
  let alive = 0;
  let holding = 0;
  const formations = new Map<Formation, number>();
  for (const id of game.selection) {
    const u = game.world.units.find((x) => x.id === id);
    if (!u || !u.alive) continue;
    alive++;
    if (u.orders[0]?.kind === 'hold') holding++;
    formations.set(u.formation, (formations.get(u.formation) ?? 0) + 1);
  }
  let formation: Formation | null = null;
  let best = 0;
  for (const [f, c] of formations) if (c > best) [formation, best] = [f, c];
  hud.setGrid(game.hotkeys, { hasSelection: alive > 0, hold: alive > 0 && holding === alive, formation });
}

function refreshCounts(): void {
  let mine = 0;
  let theirs = 0;
  let lostMine = 0;
  let lostTheirs = 0;
  let valueLost = 0;
  let valueKilled = 0;
  let age: number | null = null;
  for (const u of game.world.units) {
    const own = u.player === 0;
    if (u.alive) {
      if (own) {
        mine++;
        age ??= u.age;
      } else theirs++;
      continue;
    }
    const cost = game.world.defs.ageStats(u.defId, u.age).cost.total;
    if (own) {
      lostMine++;
      valueLost += cost;
    } else {
      lostTheirs++;
      valueKilled += cost;
    }
  }
  let selected = 0;
  for (const id of game.selection) if (game.world.units.find((x) => x.id === id)?.alive) selected++;
  hud.setCounts({ mine, theirs, lostMine, lostTheirs, valueLost, valueKilled, selected });
  hud.setTime(game.world.tick * game.world.dt, age ?? game.scenario.groups[0]?.age ?? null);
}

function refreshHud(): void {
  const deps = game.scenario.dependsOnUnverified ?? [];
  const open = unverifiedPaths(calibration);
  const missing = deps.filter((p) => open.includes(p));
  hud.setScenario(
    game.scenario.name,
    game.scenario.goal ?? game.scenario.description ?? '',
    missing.length ? `Hinweis: Dieses Szenario hängt von unbestätigten Werten ab (${missing.join(', ')}). Ergebnisse sind erst nach Kalibrierung aussagekräftig.` : '',
  );
  hud.setPaused(game.paused);
  hud.setView(game.view);
  const { cards, total } = cardsFor(game.selection);
  hud.setSelection(cards, total);
  refreshGrid();
  refreshGroups();
  refreshCounts();
  hud.setMode(
    game.targeting === 'attackMove'
      ? 'Angriffsbewegung: Ziel mit Linksklick wählen (Shift = einreihen, Rechtsklick/Esc = abbrechen)'
      : game.targeting === 'patrol'
        ? 'Patrouille: Ziel mit Linksklick wählen (Shift = einreihen, Rechtsklick/Esc = abbrechen)'
        : null,
  );
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
    refreshCounts();
    hud.setFps(settings.showFps ? `${Math.round(game.stats.fps)} FPS` : '');
    // Auswahl, Gruppen, Formations- und Halten-Zustand ändern sich auch ohne Eingabe (Einheiten sterben, Befehle enden)
    const { cards, total } = cardsFor(game.selection);
    hud.setSelection(cards, total);
    refreshGroups();
    refreshGrid();
  }
  if (game.drill && now - lastDrill > 100) {
    lastDrill = now;
    refreshDrill();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
canvas.focus();
