import { Game } from './app/game';
import { HotkeyMap } from './app/hotkeys';
import { SCENARIOS } from './data/scenarios/index';
import { defaultUnitDefs } from './sim/unitDefs';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.tabIndex = 0;
const defs = defaultUnitDefs();
const hotkeys = HotkeyMap.load();
const game = new Game(canvas, defs, hotkeys);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const scenarioName = $('scenario-name');
const stats = $('stats');
const selectionInfo = $('selection-info');
const scenarioSelect = $<HTMLSelectElement>('scenario-select');
const speedSelect = $<HTMLSelectElement>('speed-select');
const randomStart = $<HTMLInputElement>('random-start');
const btnPause = $<HTMLButtonElement>('btn-pause');

for (const sc of SCENARIOS) {
  const opt = document.createElement('option');
  opt.value = sc.id;
  opt.textContent = sc.name;
  scenarioSelect.appendChild(opt);
}
scenarioSelect.addEventListener('change', () => {
  const sc = SCENARIOS.find((s) => s.id === scenarioSelect.value);
  if (sc) game.restart(sc);
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
  game.speed = Number(speedSelect.value);
  canvas.focus();
});
randomStart.addEventListener('change', () => {
  game.randomStart = randomStart.checked;
  game.restart();
  canvas.focus();
});
$('btn-fullscreen').addEventListener('click', async () => {
  const app = document.getElementById('app')!;
  try {
    if (!document.fullscreenElement) {
      await app.requestFullscreen();
      // Keyboard-Lock (Chrome): fängt u. a. Esc/F-Tasten ab, damit sie im Spiel ankommen.
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

function refreshHud(): void {
  scenarioName.textContent = game.scenario.name;
  btnPause.textContent = game.paused ? 'Weiter' : 'Pause';
  const counts = new Map<string, number>();
  for (const id of game.selection) {
    const u = game.world.units.find((x) => x.id === id);
    if (!u || !u.alive) continue;
    const name = game.world.defs.get(u.defId).name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  selectionInfo.textContent = counts.size === 0 ? 'Keine Auswahl' : [...counts].map(([n, c]) => `${c}× ${n}`).join(', ');
}
game.onStateChanged = refreshHud;
refreshHud();

window.addEventListener('resize', () => game.resize());

let lastStats = 0;
function loop(now: number): void {
  game.frame(now);
  if (now - lastStats > 250) {
    lastStats = now;
    const s = game.stats;
    stats.textContent = `Tick ${s.tick} · ${s.simTime.toFixed(1)} s · ${Math.round(s.fps)} FPS`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
canvas.focus();
