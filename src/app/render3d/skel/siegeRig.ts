/**
 * Belagerungs-Skelett: Gestell und ein bewegter Arm (Wurfarm der Mangonel, Schlitten/Sehne des
 * Springalds). Modellraum: Höhe 1, Boden y = 0, Schussrichtung +z.
 */
import { makeRig, type BoneDef, type BonePose, type ClipDef, type Pose } from './rig';

export const SIEGE_BONES: readonly BoneDef[] = [
  { name: 'base', parent: null, pos: [0, 0.3, 0], upper: 0 },
  /** Drehpunkt des Wurfarms (Achse quer, etwa in Gestellmitte). */
  { name: 'arm', parent: 'base', pos: [0, 0.55, 0.08], upper: 0 },
];
export const SIEGE_RIG = makeRig('siege', SIEGE_BONES);

/** Mangonel: der Arm reicht vom Drehpunkt nach hinten oben; Gestell bekommt den Rest. */
export const MANGONEL_RADII: Readonly<Record<string, number>> = { base: 0.6, arm: 0.16 };
export const MANGONEL_TIPS: Readonly<Record<string, [number, number, number]>> = { arm: [0, 0.45, -0.3] };
/** Springald: bewegter Teil ist der kleine Schlitten vorn in der Bolzenrinne. */
export const SPRINGALD_RADII: Readonly<Record<string, number>> = { base: 0.6, arm: 0.1 };
export const SPRINGALD_TIPS: Readonly<Record<string, [number, number, number]>> = { arm: [0, 0.05, 0.25] };

const b = (p: Pose, i: number): BonePose => p.bones[i]!;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const ARM = 1, BASE = 0;

/** Mangonel: geladen = Arm nach hinten gespannt (rx < 0 kippt ihn nach vorn zum Wurf). */
export const MANGONEL_CLIPS: readonly ClipDef[] = [
  { name: 'idle', duration: 2, loop: true, pose: (_t, p) => { b(p, ARM).rx = 0; } },
  { name: 'ready', duration: 2, loop: true, pose: (_t, p) => { b(p, ARM).rx = 0; } },
  { name: 'walk', duration: 1, loop: true, pose: (t, p) => { b(p, BASE).rx = 0.01 * Math.sin(Math.PI * 2 * t); } },
  { name: 'run', duration: 1, loop: true, pose: (t, p) => { b(p, BASE).rx = 0.01 * Math.sin(Math.PI * 2 * t); } },
  /** Zielen: Arm bleibt gespannt, Gestell richtet sich leicht aus. */
  { name: 'windup', duration: 0.3, loop: false, pose: (t, p) => { b(p, ARM).rx = 0.05 * smooth(t); } },
  /** Wurf: Arm schnellt nach vorn und schlägt an. */
  { name: 'strike', duration: 0.15, loop: false, pose: (t, p) => { b(p, ARM).rx = 0.05 + 1.5 * easeOut(clamp01(t)); b(p, BASE).rx = -0.04 * Math.sin(Math.PI * clamp01(t)); } },
  /** Nachlauf: Arm wird langsam wieder zurückgekurbelt. */
  { name: 'recover', duration: 2.5, loop: false, pose: (t, p) => { b(p, ARM).rx = 1.55 * (1 - smooth(clamp01(t))); } },
  { name: 'hit', duration: 0.3, loop: false, pose: (t, p) => { b(p, BASE).rz = 0.03 * Math.sin(Math.PI * clamp01(t)); } },
  { name: 'die1', duration: 0.8, loop: false, pose: (t, p) => { const e = clamp01(t) ** 2; b(p, BASE).rz = 0.5 * e; p.hipOffset[1] = -0.15 * e; b(p, ARM).rx = 0.8 * e; } },
  { name: 'die2', duration: 0.8, loop: false, pose: (t, p) => { const e = clamp01(t) ** 2; b(p, BASE).rx = 0.4 * e; p.hipOffset[1] = -0.15 * e; b(p, ARM).rx = 1.2 * e; } },
  { name: 'die3', duration: 0.8, loop: false, pose: (t, p) => { const e = clamp01(t) ** 2; b(p, BASE).rz = -0.5 * e; p.hipOffset[1] = -0.15 * e; b(p, ARM).rx = 0.8 * e; } },
];

/** Springald: Schlitten fährt beim Schuss nach vorn, kehrt im Nachlauf zurück. */
export const SPRINGALD_CLIPS: readonly ClipDef[] = [
  { name: 'idle', duration: 2, loop: true, pose: () => {} },
  { name: 'ready', duration: 2, loop: true, pose: () => {} },
  { name: 'walk', duration: 1, loop: true, pose: (t, p) => { b(p, BASE).rx = 0.01 * Math.sin(Math.PI * 2 * t); } },
  { name: 'run', duration: 1, loop: true, pose: (t, p) => { b(p, BASE).rx = 0.01 * Math.sin(Math.PI * 2 * t); } },
  { name: 'windup', duration: 0.3, loop: false, pose: (t, p) => { b(p, BASE).rx = -0.02 * smooth(t); } },
  { name: 'strike', duration: 0.15, loop: false, pose: (t, p) => { p.hipOffset[2] = 0; b(p, ARM).rx = 0; b(p, BASE).rx = -0.02 + 0.05 * easeOut(clamp01(t)); } },
  { name: 'recover', duration: 0.6, loop: false, pose: (t, p) => { b(p, BASE).rx = 0.03 * (1 - smooth(clamp01(t))); } },
  { name: 'hit', duration: 0.3, loop: false, pose: (t, p) => { b(p, BASE).rz = 0.03 * Math.sin(Math.PI * clamp01(t)); } },
  { name: 'die1', duration: 0.8, loop: false, pose: (t, p) => { const e = clamp01(t) ** 2; b(p, BASE).rz = 0.5 * e; p.hipOffset[1] = -0.15 * e; } },
  { name: 'die2', duration: 0.8, loop: false, pose: (t, p) => { const e = clamp01(t) ** 2; b(p, BASE).rx = 0.4 * e; p.hipOffset[1] = -0.15 * e; } },
  { name: 'die3', duration: 0.8, loop: false, pose: (t, p) => { const e = clamp01(t) ** 2; b(p, BASE).rz = -0.5 * e; p.hipOffset[1] = -0.15 * e; } },
];
