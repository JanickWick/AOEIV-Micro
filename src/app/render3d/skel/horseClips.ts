/**
 * Gangarten und Zustände des Pferdes als Posenfunktionen. Schritt: Viertakt, Galopp: Dreitakt mit
 * Sprungphase; beide werden über die Strecke angesteuert (Phase 0..1 je Zyklus).
 * Konventionen: Bein schwingt mit rx < 0 nach vorn (um die x-Achse), Knie/Sprunggelenk beugen rx > 0
 * vorn bzw. rx < 0 hinten.
 */
import { boneIndexOf, type BonePose, type ClipDef, type Pose } from './rig';
import { HORSE_RIG } from './horseRig';

const TAU = Math.PI * 2;
const bi = (n: string) => boneIndexOf(HORSE_RIG, n);
const I = {
  root: bi('root'), chest: bi('chest'), neck: bi('neck'), head: bi('head'), rump: bi('rump'), tail: bi('tail'),
  FL: [bi('thighFL'), bi('shinFL'), bi('hoofFL')] as const,
  FR: [bi('thighFR'), bi('shinFR'), bi('hoofFR')] as const,
  BL: [bi('thighBL'), bi('shinBL'), bi('hoofBL')] as const,
  BR: [bi('thighBR'), bi('shinBR'), bi('hoofBR')] as const,
};
const b = (p: Pose, i: number): BonePose => p.bones[i]!;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeIn = (t: number) => t * t;
const bump = (t: number) => Math.sin(Math.PI * clamp01(t));

/** Ein Bein: Phase ph (0..1), Schwingweite amp, Beugung knee; Vorderbein beugt das Knie nach hinten. */
function leg(p: Pose, L: readonly [number, number, number], ph: number, amp: number, knee: number, front: boolean): void {
  const s = Math.sin(TAU * ph);
  const lift = Math.max(0, Math.cos(TAU * ph)) ** 1.5; // Bein hebt beim Vorschwingen
  b(p, L[0]).rx = -amp * s;
  b(p, L[1]).rx = (front ? 1 : -1) * knee * lift + (front ? 0.05 : -0.05);
  b(p, L[2]).rx = -b(p, L[0]).rx * 0.5 - b(p, L[1]).rx * 0.5;
}

function headNeutral(p: Pose, t: number, bob: number): void {
  b(p, I.neck).rx = -0.15 + bob * Math.sin(TAU * t * 2);
  b(p, I.head).rx = 0.55 - bob * 0.5 * Math.sin(TAU * t * 2);
  b(p, I.tail).rx = 0.2 + 0.1 * Math.sin(TAU * t);
}

export const HORSE_CLIPS: readonly ClipDef[] = [
  {
    name: 'idle', duration: 4, loop: true,
    pose: (t, p) => {
      headNeutral(p, t * 0.5, 0.03);
      b(p, I.head).ry = 0.15 * Math.sin(TAU * t + 0.7);
      b(p, I.tail).rz = 0.25 * Math.sin(TAU * t * 1.5);
      b(p, I.chest).rx = 0.01 * Math.sin(TAU * t * 2);
      b(p, I.BL[0]).rx = 0.06; b(p, I.BL[1]).rx = -0.12; // ein Hinterbein entlastet
    },
  },
  {
    name: 'ready', duration: 2, loop: true,
    pose: (t, p) => {
      headNeutral(p, t, 0.02);
      b(p, I.head).rx = 0.35;
      b(p, I.FL[0]).rx = -0.08 * (0.5 + 0.5 * Math.sin(TAU * t)); // scharrt
    },
  },
  {
    name: 'walk', duration: 1, loop: true,
    pose: (t, p) => {
      // Viertakt: BL, FL, BR, FR je ein Viertel versetzt
      leg(p, I.BL, t, 0.3, 0.5, false);
      leg(p, I.FL, t + 0.25, 0.3, 0.45, true);
      leg(p, I.BR, t + 0.5, 0.3, 0.5, false);
      leg(p, I.FR, t + 0.75, 0.3, 0.45, true);
      headNeutral(p, t, 0.05);
      p.hipOffset[1] = 0.008 * Math.sin(TAU * t * 2);
    },
  },
  {
    name: 'run', duration: 0.6, loop: true,
    pose: (t, p) => {
      // Galopp: Hinterbeine fast zusammen, Vorderbeine folgen, Sprungphase
      leg(p, I.BL, t, 0.55, 0.9, false);
      leg(p, I.BR, t + 0.1, 0.55, 0.9, false);
      leg(p, I.FL, t + 0.45, 0.55, 0.8, true);
      leg(p, I.FR, t + 0.55, 0.55, 0.8, true);
      const ph = TAU * t;
      p.hipOffset[1] = 0.03 * Math.max(0, Math.sin(ph + 0.5)) - 0.01;
      b(p, I.root).rx = -0.08 * Math.sin(ph + 0.3);
      b(p, I.neck).rx = -0.25 + 0.12 * Math.sin(ph);
      b(p, I.head).rx = 0.5 - 0.1 * Math.sin(ph);
      b(p, I.tail).rx = -0.4;
    },
  },
  {
    name: 'charge', duration: 0.5, loop: true,
    pose: (t, p) => {
      leg(p, I.BL, t, 0.65, 1.0, false);
      leg(p, I.BR, t + 0.1, 0.65, 1.0, false);
      leg(p, I.FL, t + 0.45, 0.65, 0.9, true);
      leg(p, I.FR, t + 0.55, 0.65, 0.9, true);
      const ph = TAU * t;
      p.hipOffset[1] = 0.035 * Math.max(0, Math.sin(ph + 0.5)) - 0.01;
      b(p, I.root).rx = -0.1 * Math.sin(ph + 0.3);
      b(p, I.neck).rx = -0.45 + 0.12 * Math.sin(ph);
      b(p, I.head).rx = 0.65 - 0.1 * Math.sin(ph);
      b(p, I.tail).rx = -0.5;
    },
  },
  { name: 'windup', duration: 0.5, loop: false, pose: (t, p) => { headNeutral(p, t, 0.02); b(p, I.head).rx = 0.35; } },
  { name: 'strike', duration: 0.12, loop: false, pose: (t, p) => { headNeutral(p, 0, 0); b(p, I.head).rx = 0.3; b(p, I.chest).rx = 0.03 * bump(t); } },
  { name: 'recover', duration: 0.4, loop: false, pose: (t, p) => { headNeutral(p, t, 0.02); b(p, I.head).rx = 0.35; } },
  {
    name: 'hit', duration: 0.3, loop: false,
    pose: (t, p) => {
      const k = bump(t);
      headNeutral(p, 0, 0);
      b(p, I.neck).rx = -0.15 - 0.35 * k; // Kopf hoch
      b(p, I.head).rx = 0.55 - 0.2 * k;
      b(p, I.FL[0]).rx = -0.4 * k; b(p, I.FL[1]).rx = 0.5 * k; // steigt leicht
      b(p, I.FR[0]).rx = -0.2 * k;
      b(p, I.root).rx = -0.08 * k;
    },
  },
  {
    name: 'die1', duration: 0.9, loop: false,
    pose: (t, p) => {
      const e = easeIn(clamp01(t)); // seitlich nach links kippen
      b(p, I.root).rz = 1.3 * e;
      p.hipOffset[1] = -0.42 * e;
      p.hipOffset[0] = -0.15 * e;
      for (const L of [I.FL, I.FR, I.BL, I.BR]) { b(p, L[0]).rx = -0.3 * e; b(p, L[1]).rx = (L === I.FL || L === I.FR ? 0.9 : -0.9) * e; }
      b(p, I.neck).rx = -0.3 * e; b(p, I.head).rx = 0.7 * e; b(p, I.head).rz = -0.4 * e;
    },
  },
  {
    name: 'die2', duration: 1.0, loop: false,
    pose: (t, p) => {
      const k = clamp01(t / 0.5), f = easeIn(clamp01((t - 0.4) / 0.6)); // vorn einknicken, dann seitlich
      b(p, I.FL[0]).rx = -0.9 * k; b(p, I.FL[1]).rx = 1.8 * k;
      b(p, I.FR[0]).rx = -0.9 * k; b(p, I.FR[1]).rx = 1.8 * k;
      b(p, I.root).rx = 0.35 * k;
      p.hipOffset[1] = -0.12 * k - 0.3 * f;
      b(p, I.root).rz = 1.2 * f;
      b(p, I.BL[0]).rx = -0.3 * f; b(p, I.BR[0]).rx = -0.3 * f; b(p, I.BL[1]).rx = -0.8 * f; b(p, I.BR[1]).rx = -0.8 * f;
      b(p, I.neck).rx = -0.2 * k; b(p, I.head).rx = 0.9 * k;
    },
  },
  {
    name: 'die3', duration: 0.9, loop: false,
    pose: (t, p) => {
      const e = easeIn(clamp01(t)); // nach rechts kippen
      b(p, I.root).rz = -1.3 * e;
      p.hipOffset[1] = -0.42 * e;
      p.hipOffset[0] = 0.15 * e;
      for (const L of [I.FL, I.FR, I.BL, I.BR]) { b(p, L[0]).rx = -0.25 * e; b(p, L[1]).rx = (L === I.FL || L === I.FR ? 0.8 : -0.8) * e; }
      b(p, I.neck).rx = -0.3 * e; b(p, I.head).rx = 0.7 * e; b(p, I.head).rz = 0.4 * e;
    },
  },
];
