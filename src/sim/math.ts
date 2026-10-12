/** 2D-Vektor in Tiles. Alle Funktionen sind rein (keine Mutation der Argumente). */
export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const fromAngle = (rad: number): Vec2 => ({ x: Math.cos(rad), y: Math.sin(rad) });
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export function normalize(a: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : clone(fallback);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const TAU = Math.PI * 2;

/** Normalisiert einen Winkel auf (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Dreht `from` um höchstens `maxDelta` in Richtung `to`. */
export function turnTowards(from: number, to: number, maxDelta: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxDelta) return to;
  return wrapAngle(from + Math.sign(d) * maxDelta);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + wrapAngle(b - a) * t);
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
