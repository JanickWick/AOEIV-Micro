/**
 * Animationssatz des menschlichen Skeletts als Posenfunktionen (t ∈ [0,1] → Pose).
 * Jeder Clip wird beim Start in eine Knochen-Textur gebacken (animBake.ts). Die Dauer ist nur
 * nominal: Angriffsclips werden zur Laufzeit auf die Windup-/Nachlaufzeit der Daten gestreckt,
 * Gehen/Rennen auf die zurückgelegte Strecke gekoppelt.
 *
 * Konventionen (Modellraum, Blick +z): hängende Gliedmaße schwingt mit rx < 0 nach vorn,
 * Rumpf neigt sich mit rx > 0 nach vorn, Knie beugt mit rx > 0, Ellbogen beugt mit rx < 0.
 * Linker Arm ab mit rz < 0, rechter mit rz > 0.
 */
import { boneIndex, type BonePose, type Pose } from './humanRig';
import type { ClipDef, ClipName } from './rig';

export type { ClipDef, ClipName };

const TAU = Math.PI * 2;
const I = {
  hips: boneIndex('hips'), spine: boneIndex('spine'), chest: boneIndex('chest'), neck: boneIndex('neck'), head: boneIndex('head'),
  uaL: boneIndex('upperArmL'), faL: boneIndex('forearmL'), hL: boneIndex('handL'),
  uaR: boneIndex('upperArmR'), faR: boneIndex('forearmR'), hR: boneIndex('handR'),
  thL: boneIndex('thighL'), shL: boneIndex('shinL'), ftL: boneIndex('footL'),
  thR: boneIndex('thighR'), shR: boneIndex('shinR'), ftR: boneIndex('footR'),
  propL: boneIndex('propL'), arrow: boneIndex('arrow'), propR: boneIndex('propR'), nock: boneIndex('nock'),
};

const b = (p: Pose, i: number): BonePose => p.bones[i]!;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const bump = (t: number) => Math.sin(Math.PI * clamp01(t));

/** Bogen in der linken Hand senkrecht halten: Drehung des Requisits gleicht die Armdrehung aus. */
function bowVertical(p: Pose, armRaised: boolean): void {
  const total = b(p, I.uaL).rx + b(p, I.faL).rx + b(p, I.hL).rx;
  b(p, I.propL).rx = (armRaised ? -Math.PI / 2 : Math.PI / 2) - total;
  b(p, I.arrow).rx = b(p, I.propL).rx;
}

function relaxedArms(p: Pose, swing = 0): void {
  b(p, I.uaL).rx = -0.08 + swing;
  b(p, I.uaL).rz = -0.1;
  b(p, I.faL).rx = -0.2;
  b(p, I.uaR).rx = -0.08 - swing;
  b(p, I.uaR).rz = 0.1;
  b(p, I.faR).rx = -0.25;
}

function breathing(p: Pose, t: number, cycles: number): void {
  const s = Math.sin(TAU * t * cycles);
  b(p, I.chest).rx += 0.02 * s;
  b(p, I.spine).rx += 0.01 * s;
  b(p, I.uaL).rz -= 0.015 * s;
  b(p, I.uaR).rz += 0.015 * s;
}

/** Schussbereit: Bogen halb gehoben, rechte Hand nahe der Sehne. */
function readyPose(p: Pose): void {
  b(p, I.uaL).rx = -0.95;
  b(p, I.uaL).rz = 0.05;
  b(p, I.faL).rx = -0.15;
  b(p, I.uaR).rx = -0.55;
  b(p, I.uaR).rz = 0.35;
  b(p, I.faR).rx = -1.1;
  b(p, I.chest).ry = -0.15;
  b(p, I.head).ry = 0.15;
  b(p, I.thL).rz = -0.08;
  b(p, I.thR).rz = 0.08;
  b(p, I.thL).rx = -0.08;
  b(p, I.thR).rx = 0.08;
  b(p, I.hips).ry = 0.25;
  b(p, I.head).ry -= 0.25;
  b(p, I.arrow).s = 0;
  b(p, I.nock).rx = 0;
  bowVertical(p, true);
}

/** Voll gespannt. */
function drawnPose(p: Pose): void {
  b(p, I.uaL).rx = -1.5;
  b(p, I.uaL).rz = 0.18;
  b(p, I.faL).rx = 0.02;
  b(p, I.uaR).rx = -1.35;
  b(p, I.uaR).rz = 1.05;
  b(p, I.faR).rx = -2.45;
  b(p, I.faR).ry = 0.2;
  b(p, I.chest).ry = -0.4;
  b(p, I.chest).rx = -0.05;
  b(p, I.head).ry = 0.38;
  b(p, I.head).rx = 0.05;
  b(p, I.thL).rz = -0.1;
  b(p, I.thR).rz = 0.1;
  b(p, I.thL).rx = -0.12;
  b(p, I.thR).rx = 0.12;
  b(p, I.hips).ry = 0.3;
  b(p, I.head).ry -= 0.3;
  b(p, I.arrow).s = 1;
  b(p, I.nock).rx = -Math.PI / 2; // Sehne voll ausgezogen
  bowVertical(p, true);
}

/** Direkt nach dem Lösen: Zughand nach hinten offen, Bogenarm hält. */
function releasedPose(p: Pose): void {
  drawnPose(p);
  b(p, I.uaR).rx = -1.05;
  b(p, I.uaR).rz = 1.35;
  b(p, I.faR).rx = -0.5;
  b(p, I.faR).ry = 0;
  b(p, I.chest).rx = -0.09;
  b(p, I.arrow).s = 0;
  b(p, I.nock).rx = 0; // Sehne schnellt zurück
  bowVertical(p, true);
}

function mixInto(p: Pose, a: (p: Pose) => void, c: (p: Pose) => void, t: number): void {
  const pa = structuredClone(p), pc = structuredClone(p);
  a(pa);
  c(pc);
  for (let i = 0; i < p.bones.length; i++) {
    const x = pa.bones[i]!, y = pc.bones[i]!, o = p.bones[i]!;
    o.rx = x.rx + (y.rx - x.rx) * t;
    o.ry = x.ry + (y.ry - x.ry) * t;
    o.rz = x.rz + (y.rz - x.rz) * t;
    o.s = x.s + (y.s - x.s) * t;
  }
  for (let k = 0; k < 3; k++) p.hipOffset[k] = pa.hipOffset[k]! + (pc.hipOffset[k]! - pa.hipOffset[k]!) * t;
}

function gait(p: Pose, t: number, amp: number, knee: number, lean: number, armSwing: number, forearm: number, bob: number): void {
  const ph = TAU * t;
  const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
  b(p, I.thL).rx = -amp * sL;
  b(p, I.thR).rx = -amp * sR;
  const kL = knee * Math.max(0, Math.cos(ph)) ** 1.2, kR = knee * Math.max(0, Math.cos(ph + Math.PI)) ** 1.2;
  b(p, I.shL).rx = kL + 0.08;
  b(p, I.shR).rx = kR + 0.08;
  // Fuß bleibt ungefähr waagerecht, Zehen heben beim Vorschwingen
  b(p, I.ftL).rx = -(b(p, I.thL).rx + kL) * 0.6 - 0.08;
  b(p, I.ftR).rx = -(b(p, I.thR).rx + kR) * 0.6 - 0.08;
  p.hipOffset[1] = -bob * (1 - Math.cos(2 * ph)) * 0.5;
  b(p, I.hips).ry = 0.08 * sL;
  b(p, I.hips).rz = 0.03 * Math.cos(ph);
  b(p, I.spine).rx = lean;
  b(p, I.chest).ry = -0.1 * sL;
  b(p, I.head).ry = 0.04 * sL;
  relaxedArms(p, armSwing * sL);
  b(p, I.faL).rx = forearm;
  b(p, I.faR).rx = forearm;
  b(p, I.arrow).s = 0;
  bowVertical(p, false);
}

export const HUMAN_CLIPS: readonly ClipDef[] = [
  {
    name: 'idle', duration: 4, loop: true,
    pose: (t, p) => {
      relaxedArms(p);
      const s = Math.sin(TAU * t);
      // Gewichtsverlagerung: Becken seitlich, Beine gleichen aus
      p.hipOffset[0] = 0.012 * s;
      b(p, I.hips).rz = 0.035 * s;
      b(p, I.thL).rz = -0.035 * s;
      b(p, I.thR).rz = -0.035 * s;
      b(p, I.spine).rz = -0.02 * s;
      b(p, I.head).ry = 0.1 * Math.sin(TAU * t + 1.3);
      b(p, I.head).rx = 0.03 * Math.sin(TAU * t * 0.5 + 0.4);
      b(p, I.thL).rx = -0.04;
      b(p, I.thR).rx = 0.04;
      b(p, I.shL).rx = 0.06;
      b(p, I.shR).rx = 0.06;
      breathing(p, t, 2);
      b(p, I.arrow).s = 0;
      bowVertical(p, false);
    },
  },
  {
    name: 'ready', duration: 2, loop: true,
    pose: (t, p) => {
      readyPose(p);
      breathing(p, t, 1);
      b(p, I.uaR).rx += 0.03 * Math.sin(TAU * t);
    },
  },
  { name: 'walk', duration: 1, loop: true, pose: (t, p) => gait(p, t, 0.55, 1.0, 0.06, 0.3, -0.35, 0.02) },
  { name: 'run', duration: 0.7, loop: true, pose: (t, p) => gait(p, t, 0.85, 1.5, 0.2, 0.7, -1.1, 0.035) },
  /** Spannen: wird auf die Windup-Zeit gestreckt (t = Fortschritt). */
  { name: 'windup', duration: 0.6, loop: false, pose: (t, p) => mixInto(p, readyPose, drawnPose, smooth(t)) },
  /** Lösen: erste 25 % des Nachlaufs. */
  {
    name: 'strike', duration: 0.12, loop: false,
    pose: (t, p) => {
      mixInto(p, drawnPose, releasedPose, easeOut(t));
      b(p, I.arrow).s = 0; // der Pfeil ist ab dem Abschuss ein Projektil der Simulation
    },
  },
  /** Nachlauf: zurück in die Schussbereitschaft. */
  { name: 'recover', duration: 0.4, loop: false, pose: (t, p) => mixInto(p, releasedPose, readyPose, smooth(t)) },
  {
    name: 'hit', duration: 0.3, loop: false,
    pose: (t, p) => {
      relaxedArms(p);
      const k = bump(t);
      b(p, I.spine).rx = -0.22 * k;
      b(p, I.chest).rx = -0.1 * k;
      b(p, I.head).rx = -0.25 * k;
      b(p, I.uaL).rx = -0.5 * k;
      b(p, I.uaR).rx = -0.5 * k;
      b(p, I.uaL).rz = -0.3 * k;
      b(p, I.uaR).rz = 0.3 * k;
      b(p, I.shL).rx = 0.25 * k;
      b(p, I.shR).rx = 0.25 * k;
      p.hipOffset[2] = -0.03 * k;
      p.hipOffset[1] = -0.03 * k;
      b(p, I.arrow).s = 0;
      bowVertical(p, false);
    },
  },
  {
    name: 'die1', duration: 0.8, loop: false,
    pose: (t, p) => {
      // rückwärts umkippen
      const e = easeIn(clamp01(t));
      b(p, I.hips).rx = -1.45 * e;
      p.hipOffset[1] = -0.43 * e;
      p.hipOffset[2] = -0.12 * e;
      b(p, I.thL).rx = -0.35 * e;
      b(p, I.thR).rx = -0.2 * e;
      b(p, I.shL).rx = 0.7 * e;
      b(p, I.shR).rx = 0.4 * e;
      b(p, I.spine).rx = -0.2 * e;
      b(p, I.head).rx = -0.35 * e;
      b(p, I.uaL).rx = -1.1 * e;
      b(p, I.uaR).rx = -0.9 * e;
      b(p, I.uaL).rz = -0.7 * e;
      b(p, I.uaR).rz = 0.6 * e;
      b(p, I.faL).rx = -0.4 * e;
      b(p, I.faR).rx = -0.7 * e;
      b(p, I.arrow).s = 0;
      bowVertical(p, false);
      b(p, I.propL).rx += 0.6 * e;
    },
  },
  {
    name: 'die2', duration: 0.9, loop: false,
    pose: (t, p) => {
      // erst in die Knie, dann nach vorn fallen
      const k = smooth(clamp01(t / 0.45));
      const f = easeIn(clamp01((t - 0.35) / 0.55));
      b(p, I.thL).rx = 0.2 * k - 0.1 * f;
      b(p, I.thR).rx = 0.3 * k;
      b(p, I.shL).rx = 1.9 * k - 1.2 * f;
      b(p, I.shR).rx = 1.9 * k - 1.4 * f;
      p.hipOffset[1] = -0.3 * k - 0.15 * f;
      p.hipOffset[2] = 0.05 * k + 0.12 * f;
      b(p, I.hips).rx = 0.15 * k + 1.3 * f;
      b(p, I.spine).rx = 0.3 * k - 0.1 * f;
      b(p, I.head).rx = 0.3 * k - 0.4 * f;
      b(p, I.uaL).rx = -0.3 * k - 1.0 * f;
      b(p, I.uaR).rx = -0.3 * k - 1.1 * f;
      b(p, I.uaL).rz = -0.4 * f;
      b(p, I.uaR).rz = 0.5 * f;
      b(p, I.faL).rx = -0.3 * k;
      b(p, I.faR).rx = -0.3 * k;
      b(p, I.arrow).s = 0;
      bowVertical(p, false);
    },
  },
  {
    name: 'die3', duration: 0.8, loop: false,
    pose: (t, p) => {
      // seitlich nach links wegsacken
      const e = easeIn(clamp01(t));
      b(p, I.hips).rz = 1.35 * e;
      b(p, I.hips).rx = 0.3 * e;
      p.hipOffset[1] = -0.42 * e;
      p.hipOffset[0] = -0.1 * e;
      b(p, I.thL).rx = -0.5 * e;
      b(p, I.thR).rx = 0.1 * e;
      b(p, I.shL).rx = 0.9 * e;
      b(p, I.shR).rx = 0.5 * e;
      b(p, I.thL).rz = -0.2 * e;
      b(p, I.spine).rz = -0.25 * e;
      b(p, I.head).rz = -0.3 * e;
      b(p, I.uaL).rz = -1.2 * e;
      b(p, I.uaR).rx = -0.8 * e;
      b(p, I.uaR).rz = 0.3 * e;
      b(p, I.faR).rx = -0.6 * e;
      b(p, I.arrow).s = 0;
      bowVertical(p, false);
    },
  },
];

