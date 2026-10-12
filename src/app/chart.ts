/**
 * Verlaufsdiagramm der letzten Versuche (Canvas 2D). Eine Kennzahl pro Versuch als Balken,
 * Sieg/Niederlage farblich und per Legende, Bestwert direkt beschriftet, Vergleichslinie
 * "nur Attack-Move" gestrichelt. Hover zeigt Details.
 */
import type { Attempt } from './history';

export interface ChartOptions {
  metric: 'valueLostMine' | 'reactionMs';
  metricLabel: string;
  baseline?: number | null;
  baselineLabel?: string;
  bestIndex?: number;
}

const INK = '#e5e7eb';
const MUTED = '#9ca3af';
const GRID = 'rgba(255,255,255,0.09)';
const VICTORY = '#3b82f6';
const DEFEAT = '#ef4444';
const PAD = { l: 44, r: 12, t: 24, b: 34 };

export interface ChartHandle {
  destroy(): void;
}

export function drawHistoryChart(canvas: HTMLCanvasElement, tooltip: HTMLElement, attempts: readonly Attempt[], o: ChartOptions): ChartHandle {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 520;
  const H = canvas.clientHeight || 180;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const values = attempts.map((a) => (o.metric === 'reactionMs' ? (a.reactionMs ?? 0) : a.valueLostMine));
  // Untergrenze der Achse, damit lauter Nullwerte nicht als "1 1 0 0" erscheinen.
  const floor = o.metric === 'reactionMs' ? 500 : 100;
  let max = Math.max(floor, ...values, o.baseline ?? 0);
  max = niceMax(max);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const n = Math.max(attempts.length, 1);
  const slot = plotW / 20;
  const barW = Math.max(6, Math.min(18, slot - 4));
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const x = (i: number) => PAD.l + (i + 0.5) * slot - barW / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // Gitter und y-Achse (3 Linien)
  for (let k = 0; k <= 3; k++) {
    const v = (max * k) / 3;
    const yy = Math.round(y(v)) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.l, yy);
    ctx.lineTo(W - PAD.r, yy);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(v), PAD.l - 6, yy);
  }

  // Balken
  attempts.forEach((a, i) => {
    const v = values[i]!;
    const top = y(v);
    const bottom = y(0);
    const h = Math.max(2, bottom - top);
    ctx.fillStyle = a.outcome === 'defeat' ? DEFEAT : VICTORY;
    roundedTopRect(ctx, x(i), bottom - h, barW, h, 4);
    ctx.fill();
    if (i === attempts.length - 1) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      roundedTopRect(ctx, x(i) - 1.5, bottom - h - 1.5, barW + 3, h + 1.5, 5);
      ctx.stroke();
    }
  });

  // Bestwert direkt beschriften
  if (o.bestIndex !== undefined && o.bestIndex >= 0 && o.bestIndex < attempts.length) {
    const i = o.bestIndex;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(`Best ${formatNumber(values[i]!)}`, x(i) + barW / 2, y(values[i]!) - 9);
  }

  // Vergleichslinie
  if (o.baseline !== undefined && o.baseline !== null) {
    const yy = Math.round(y(o.baseline)) + 0.5;
    ctx.strokeStyle = MUTED;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, yy);
    ctx.lineTo(W - PAD.r, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(`${o.baselineLabel ?? 'Vergleich'} ${formatNumber(o.baseline)}`, W - PAD.r, yy - 8);
  }

  // x-Achse: Versuchsnummern (jede 5.) und Legende
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  attempts.forEach((_, i) => {
    if ((i + 1) % 5 === 0 || i === attempts.length - 1 || i === 0) ctx.fillText(String(i + 1), x(i) + barW / 2, H - PAD.b + 10);
  });
  ctx.textAlign = 'left';
  ctx.fillText(o.metricLabel, PAD.l, PAD.t - 12);
  const legendY = H - 8;
  ctx.fillStyle = VICTORY;
  ctx.fillRect(PAD.l, legendY - 4, 10, 8);
  ctx.fillStyle = MUTED;
  ctx.fillText('Sieg', PAD.l + 14, legendY);
  ctx.fillStyle = DEFEAT;
  ctx.fillRect(PAD.l + 50, legendY - 4, 10, 8);
  ctx.fillStyle = MUTED;
  ctx.fillText(o.metric === 'reactionMs' ? 'mit Fehlgriffen' : 'Niederlage', PAD.l + 64, legendY);
  ctx.fillText('Versuch →', W - PAD.r - 56, H - PAD.b + 10);

  // Hover
  const onMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let hit = -1;
    attempts.forEach((_, i) => {
      if (mx >= x(i) - 2 && mx <= x(i) + barW + 2 && my >= PAD.t && my <= H - PAD.b) hit = i;
    });
    if (hit < 0) {
      tooltip.hidden = true;
      return;
    }
    const a = attempts[hit]!;
    const when = new Date(a.at).toLocaleString('de-DE');
    tooltip.hidden = false;
    tooltip.textContent =
      o.metric === 'reactionMs'
        ? `Versuch ${hit + 1} · ${when} · Ø ${Math.round(a.reactionMs ?? 0)} ms · Fehlgriffe ${a.errors ?? 0}`
        : `Versuch ${hit + 1} · ${when} · ${a.outcome === 'victory' ? 'Sieg' : a.outcome === 'defeat' ? 'Niederlage' : a.outcome} · Verlust ${a.valueLostMine} · ${a.seconds.toFixed(1)} s · Kite ${a.kiteEfficiency === null ? '–' : Math.round(a.kiteEfficiency * 100) + ' %'}`;
    tooltip.style.left = `${Math.min(mx + 12, W - 260)}px`;
    tooltip.style.top = `${my - 28}px`;
  };
  const onLeave = () => {
    tooltip.hidden = true;
  };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  return {
    destroy() {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    },
  };
}

function roundedTopRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 3 ? 3 : m <= 5 ? 5 : 10;
  return nice * p;
}

function formatNumber(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}
