/**
 * Animationssätze des menschlichen Skeletts je Waffenstil (t ∈ [0,1] → Pose).
 * Alle Sätze teilen Stehen, Gehen, Rennen, Treffer und Sterben; Bereit/Spannen/Lösen/Nachlauf
 * sind je Stil eigene Posen. Reiterstile sitzen und tragen die Waffe einhändig.
 *
 * Konventionen (Modellraum, Blick +z): hängende Gliedmaße schwingt mit rx < 0 nach vorn,
 * Rumpf neigt sich mit rx > 0 nach vorn, Knie beugt mit rx > 0, Ellbogen beugt mit rx < 0.
 * Linker Arm ab mit rz < 0, rechter mit rz > 0. Requisiten liegen in der Ruhelage entlang +y
 * (Spitze oben) bzw. der Bogen entlang z; `alignProp` dreht sie unabhängig von der Armhaltung.
 */
import { boneIndex, HUMAN_RIG, type BonePose, type Pose } from './humanRig';
import { setWorldRotationFor, type ClipDef } from './rig';

export type HumanStyle = 'bow' | 'spear' | 'sword' | 'crossbow' | 'riderSpear' | 'riderSword';

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

/**
 * Requisit exakt so drehen, dass es im Modellraum die Drehung R_x(rx) hat (z. B. π/2 = Spitze nach
 * vorn, 0 = Spitze nach oben), unabhängig von der Haltung der Armkette.
 */
function alignProp(p: Pose, prop: number, _arm: [number, number, number], rx: number, ry = 0): void {
  setWorldRotationFor(HUMAN_RIG, p, HUMAN_RIG.bones[prop]!.name, rx, ry, 0);
}
const ARM_L: [number, number, number] = [I.uaL, I.faL, I.hL];
const ARM_R: [number, number, number] = [I.uaR, I.faR, I.hR];

/** Bogen in der linken Hand senkrecht halten (näherungsweise, dreht mit dem Oberkörper mit). */
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
}

/** Sitzhaltung im Sattel (Reiterstile). */
function seated(p: Pose): void {
  b(p, I.thL).rx = -1.2; b(p, I.thL).rz = -0.32;
  b(p, I.thR).rx = -1.2; b(p, I.thR).rz = 0.32;
  b(p, I.shL).rx = 1.15; b(p, I.shL).rz = 0.2;
  b(p, I.shR).rx = 1.15; b(p, I.shR).rz = -0.2;
  b(p, I.ftL).rx = 0.15; b(p, I.ftR).rx = 0.15;
  b(p, I.spine).rx = 0.08;
}

/** Zügelhand (links) der Reiter. */
function reinHand(p: Pose): void {
  b(p, I.uaL).rx = -0.55; b(p, I.uaL).rz = -0.05;
  b(p, I.faL).rx = -1.0;
}

interface Style {
  rider: boolean;
  /** Requisiten in Trage-/Ruhestellung (nach jeder Grundpose aufrufen). */
  carry(p: Pose): void;
  ready(p: Pose): void;
  drawn(p: Pose): void;
  struck(p: Pose): void;
  /** Requisiten-Sichtbarkeit beim Lösen (z. B. Pfeil ab dem Abschuss unsichtbar). */
  afterStrike?(p: Pose): void;
}

// ---------- Bogen ----------
const bowStyle: Style = {
  rider: false,
  carry(p) { b(p, I.arrow).s = 0; b(p, I.nock).rx = 0; bowVertical(p, false); },
  ready(p) {
    b(p, I.uaL).rx = -0.95; b(p, I.uaL).rz = 0.05; b(p, I.faL).rx = -0.15;
    b(p, I.uaR).rx = -0.55; b(p, I.uaR).rz = 0.35; b(p, I.faR).rx = -1.1;
    b(p, I.chest).ry = -0.15; b(p, I.head).ry = 0.15;
    b(p, I.thL).rz = -0.08; b(p, I.thR).rz = 0.08; b(p, I.thL).rx = -0.08; b(p, I.thR).rx = 0.08;
    b(p, I.hips).ry = 0.25; b(p, I.head).ry -= 0.25;
    b(p, I.arrow).s = 0; b(p, I.nock).rx = 0;
    bowVertical(p, true);
  },
  drawn(p) {
    b(p, I.uaL).rx = -1.5; b(p, I.uaL).rz = 0.18; b(p, I.faL).rx = 0.02;
    b(p, I.uaR).rx = -1.35; b(p, I.uaR).rz = 1.05; b(p, I.faR).rx = -2.45; b(p, I.faR).ry = 0.2;
    b(p, I.chest).ry = -0.4; b(p, I.chest).rx = -0.05; b(p, I.head).ry = 0.38; b(p, I.head).rx = 0.05;
    b(p, I.thL).rz = -0.1; b(p, I.thR).rz = 0.1; b(p, I.thL).rx = -0.12; b(p, I.thR).rx = 0.12;
    b(p, I.hips).ry = 0.3; b(p, I.head).ry -= 0.3;
    b(p, I.arrow).s = 1; b(p, I.nock).rx = -Math.PI / 2;
    bowVertical(p, true);
  },
  struck(p) {
    bowStyle.drawn(p);
    b(p, I.uaR).rx = -1.05; b(p, I.uaR).rz = 1.35; b(p, I.faR).rx = -0.5; b(p, I.faR).ry = 0;
    b(p, I.chest).rx = -0.09;
    b(p, I.arrow).s = 0; b(p, I.nock).rx = 0;
    bowVertical(p, true);
  },
  afterStrike(p) { b(p, I.arrow).s = 0; },
};

// ---------- Speer (zu Fuß: beidhändig) ----------
function spearCarry(p: Pose): void {
  alignProp(p, I.propR, ARM_R, 0); // senkrecht getragen
  b(p, I.arrow).s = 0;
}
const spearStyle: Style = {
  rider: false,
  carry: spearCarry,
  ready(p) {
    b(p, I.uaR).rx = -0.35; b(p, I.uaR).rz = 0.25; b(p, I.faR).rx = -0.55;
    b(p, I.uaL).rx = -0.85; b(p, I.uaL).rz = 0.25; b(p, I.faL).rx = -0.45;
    b(p, I.hips).ry = 0.35; b(p, I.chest).ry = -0.1; b(p, I.head).ry = -0.3;
    b(p, I.thL).rx = -0.25; b(p, I.thR).rx = 0.2; b(p, I.shL).rx = 0.3; b(p, I.shR).rx = 0.15;
    b(p, I.thL).rz = -0.1; b(p, I.thR).rz = 0.1;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 - 0.1); // waagerecht nach vorn, leicht gesenkt
    b(p, I.arrow).s = 0;
  },
  drawn(p) {
    spearStyle.ready(p);
    b(p, I.uaR).rx = 0.35; b(p, I.uaR).rz = 0.45; b(p, I.faR).rx = -0.9;
    b(p, I.uaL).rx = -0.6; b(p, I.faL).rx = -0.7;
    b(p, I.hips).ry = 0.5; b(p, I.chest).ry = -0.15; b(p, I.head).ry = -0.4;
    b(p, I.spine).rx = -0.05;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 - 0.05);
  },
  struck(p) {
    spearStyle.ready(p);
    b(p, I.uaR).rx = -1.45; b(p, I.uaR).rz = 0.15; b(p, I.faR).rx = -0.05;
    b(p, I.uaL).rx = -1.1; b(p, I.faL).rx = -0.15;
    b(p, I.hips).ry = 0.1; b(p, I.chest).ry = -0.05; b(p, I.head).ry = -0.1;
    b(p, I.spine).rx = 0.2; b(p, I.chest).rx = 0.1;
    b(p, I.thL).rx = -0.6; b(p, I.shL).rx = 0.55; b(p, I.thR).rx = 0.35; b(p, I.shR).rx = 0.1;
    p.hipOffset[2] = 0.08; p.hipOffset[1] = -0.03;
    alignProp(p, I.propR, ARM_R, Math.PI / 2);
  },
};

// ---------- Schwert (Schild am linken Unterarm, ohne eigenen Knochen) ----------
function swordCarry(p: Pose): void {
  alignProp(p, I.propR, ARM_R, -0.35); // auf der Schulter angelehnt
  alignProp(p, I.propL, ARM_L, 0, 0); // Schild seitlich am Arm
  b(p, I.arrow).s = 0;
}
/** Schild vor den Körper, Fläche zum Gegner (+z). */
function shieldFront(p: Pose): void {
  alignProp(p, I.propL, ARM_L, 0.1, Math.PI / 2);
}
const swordStyle: Style = {
  rider: false,
  carry: swordCarry,
  ready(p) {
    b(p, I.uaR).rx = -0.9; b(p, I.uaR).rz = 0.85; b(p, I.faR).rx = -1.55; b(p, I.faR).ry = -0.3;
    b(p, I.uaL).rx = -0.75; b(p, I.uaL).rz = -0.25; b(p, I.faL).rx = -1.2; b(p, I.faL).ry = 0.5;
    b(p, I.hips).ry = 0.3; b(p, I.chest).ry = -0.05; b(p, I.head).ry = -0.25;
    b(p, I.thL).rx = -0.25; b(p, I.thR).rx = 0.2; b(p, I.shL).rx = 0.3; b(p, I.shR).rx = 0.15;
    b(p, I.thL).rz = -0.1; b(p, I.thR).rz = 0.1;
    alignProp(p, I.propR, ARM_R, -0.9); // Klinge schräg nach oben hinten
    shieldFront(p);
    b(p, I.arrow).s = 0;
  },
  drawn(p) {
    swordStyle.ready(p);
    b(p, I.uaR).rx = -1.35; b(p, I.uaR).rz = 1.2; b(p, I.faR).rx = -1.9;
    b(p, I.chest).ry = 0.25; b(p, I.hips).ry = 0.45; b(p, I.head).ry = -0.6;
    b(p, I.spine).rx = -0.08;
    alignProp(p, I.propR, ARM_R, -1.2);
    shieldFront(p);
  },
  struck(p) {
    swordStyle.ready(p);
    b(p, I.uaR).rx = -0.95; b(p, I.uaR).rz = -0.35; b(p, I.faR).rx = -0.15; b(p, I.faR).ry = 0;
    b(p, I.chest).ry = -0.5; b(p, I.hips).ry = 0.05; b(p, I.head).ry = 0.1;
    b(p, I.spine).rx = 0.25; b(p, I.chest).rx = 0.1;
    b(p, I.thL).rx = -0.55; b(p, I.shL).rx = 0.5; b(p, I.thR).rx = 0.3;
    p.hipOffset[2] = 0.06; p.hipOffset[1] = -0.03;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 + 0.3); // Klinge nach vorn unten
    shieldFront(p);
  },
};

// ---------- Armbrust (links gehalten, Bolzen auf 'arrow') ----------
function crossbowCarry(p: Pose): void {
  alignProp(p, I.propL, ARM_L, 0.25); // aufrecht getragen
  b(p, I.arrow).s = 0;
}
function crossbowAim(p: Pose): void {
  b(p, I.uaL).rx = -1.25; b(p, I.uaL).rz = 0.15; b(p, I.faL).rx = -0.25;
  b(p, I.uaR).rx = -0.85; b(p, I.uaR).rz = 0.45; b(p, I.faR).rx = -1.35; b(p, I.faR).ry = 0.3;
  b(p, I.chest).ry = -0.3; b(p, I.head).ry = 0.3; b(p, I.head).rx = 0.08; b(p, I.chest).rx = 0.04;
  b(p, I.thL).rz = -0.08; b(p, I.thR).rz = 0.08; b(p, I.thL).rx = -0.1; b(p, I.thR).rx = 0.1;
  b(p, I.hips).ry = 0.25; b(p, I.head).ry -= 0.25;
  alignProp(p, I.propL, ARM_L, Math.PI / 2);
  alignProp(p, I.arrow, ARM_L, Math.PI / 2);
  b(p, I.arrow).s = 1;
}
const crossbowStyle: Style = {
  rider: false,
  carry: crossbowCarry,
  ready(p) { crossbowAim(p); b(p, I.arrow).s = 1; },
  drawn(p) { crossbowAim(p); b(p, I.head).rx = 0.12; b(p, I.uaL).rx = -1.3; },
  struck(p) {
    crossbowAim(p);
    b(p, I.uaL).rx = -1.15; b(p, I.chest).rx = -0.04; // Rückstoß
    b(p, I.arrow).s = 0;
  },
  afterStrike(p) { b(p, I.arrow).s = 0; },
};

// ---------- Reiter mit Speer ----------
const riderSpearStyle: Style = {
  rider: true,
  carry(p) {
    seated(p); reinHand(p);
    b(p, I.uaR).rx = -0.2; b(p, I.uaR).rz = 0.2; b(p, I.faR).rx = -0.5;
    alignProp(p, I.propR, ARM_R, 0.15);
    b(p, I.arrow).s = 0;
  },
  ready(p) {
    seated(p); reinHand(p);
    b(p, I.uaR).rx = -0.3; b(p, I.uaR).rz = 0.5; b(p, I.faR).rx = -0.9;
    b(p, I.chest).ry = 0.2; b(p, I.head).ry = -0.3;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 - 0.2);
    b(p, I.arrow).s = 0;
  },
  drawn(p) {
    riderSpearStyle.ready(p);
    b(p, I.uaR).rx = 0.3; b(p, I.uaR).rz = 0.7; b(p, I.faR).rx = -1.1;
    b(p, I.chest).ry = 0.35; b(p, I.head).ry = -0.45;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 - 0.1);
  },
  struck(p) {
    riderSpearStyle.ready(p);
    b(p, I.uaR).rx = -1.5; b(p, I.uaR).rz = 0.2; b(p, I.faR).rx = -0.05;
    b(p, I.chest).ry = -0.2; b(p, I.head).ry = 0; b(p, I.spine).rx = 0.25;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 + 0.15);
  },
};

// ---------- Reiter mit Schwert ----------
const riderSwordStyle: Style = {
  rider: true,
  carry(p) {
    seated(p); reinHand(p);
    b(p, I.uaR).rx = -0.2; b(p, I.uaR).rz = 0.3; b(p, I.faR).rx = -0.6;
    alignProp(p, I.propR, ARM_R, -0.4);
    alignProp(p, I.propL, ARM_L, 0, 0);
    b(p, I.arrow).s = 0;
  },
  ready(p) {
    seated(p); reinHand(p);
    b(p, I.uaR).rx = -0.9; b(p, I.uaR).rz = 0.9; b(p, I.faR).rx = -1.5; b(p, I.faR).ry = -0.3;
    b(p, I.chest).ry = 0.1; b(p, I.head).ry = -0.2;
    alignProp(p, I.propR, ARM_R, -0.9);
    shieldFront(p);
    b(p, I.arrow).s = 0;
  },
  drawn(p) {
    riderSwordStyle.ready(p);
    b(p, I.uaR).rx = -1.4; b(p, I.uaR).rz = 1.3; b(p, I.faR).rx = -1.9;
    b(p, I.chest).ry = 0.3; b(p, I.head).ry = -0.5;
    alignProp(p, I.propR, ARM_R, -1.3);
  },
  struck(p) {
    riderSwordStyle.ready(p);
    b(p, I.uaR).rx = -1.0; b(p, I.uaR).rz = -0.2; b(p, I.faR).rx = -0.2; b(p, I.faR).ry = 0;
    b(p, I.chest).ry = -0.45; b(p, I.head).ry = 0.1; b(p, I.spine).rx = 0.3;
    alignProp(p, I.propR, ARM_R, Math.PI / 2 + 0.4);
  },
};

const STYLES: Record<HumanStyle, Style> = {
  bow: bowStyle, spear: spearStyle, sword: swordStyle, crossbow: crossbowStyle,
  riderSpear: riderSpearStyle, riderSword: riderSwordStyle,
};

/** Reiter: Gang des Pferdes als Auf-und-ab im Sattel. */
function rideBounce(p: Pose, t: number, amp: number, lean: number): void {
  const ph = TAU * t;
  p.hipOffset[1] = -amp * (1 - Math.cos(2 * ph)) * 0.5;
  b(p, I.spine).rx += lean + 0.03 * Math.sin(2 * ph);
  b(p, I.head).rx -= 0.04 * Math.sin(2 * ph);
}

export function makeHumanClips(style: HumanStyle): readonly ClipDef[] {
  const S = STYLES[style];
  const base = (p: Pose): void => {
    if (S.rider) seated(p);
    else relaxedArms(p);
  };
  const clips: ClipDef[] = [
    {
      name: 'idle', duration: 4, loop: true,
      pose: (t, p) => {
        base(p);
        const s = Math.sin(TAU * t);
        if (!S.rider) {
          p.hipOffset[0] = 0.012 * s;
          b(p, I.hips).rz = 0.035 * s;
          b(p, I.thL).rz = -0.035 * s;
          b(p, I.thR).rz = -0.035 * s;
          b(p, I.spine).rz = -0.02 * s;
          b(p, I.thL).rx = -0.04; b(p, I.thR).rx = 0.04;
          b(p, I.shL).rx = 0.06; b(p, I.shR).rx = 0.06;
        }
        b(p, I.head).ry = 0.1 * Math.sin(TAU * t + 1.3);
        b(p, I.head).rx = 0.03 * Math.sin(TAU * t * 0.5 + 0.4);
        breathing(p, t, 2);
        S.carry(p);
      },
    },
    {
      name: 'ready', duration: 2, loop: true,
      pose: (t, p) => {
        S.ready(p);
        breathing(p, t, 1);
        b(p, I.uaR).rx += 0.03 * Math.sin(TAU * t);
      },
    },
    S.rider
      ? { name: 'walk', duration: 1, loop: true, pose: (t, p) => { S.carry(p); rideBounce(p, t, 0.012, 0.02); } }
      : { name: 'walk', duration: 1, loop: true, pose: (t, p) => { gait(p, t, 0.55, 1.0, 0.06, 0.3, -0.35, 0.02); S.carry(p); } },
    S.rider
      ? { name: 'run', duration: 0.7, loop: true, pose: (t, p) => { S.carry(p); rideBounce(p, t, 0.03, 0.15); } }
      : { name: 'run', duration: 0.7, loop: true, pose: (t, p) => { gait(p, t, 0.85, 1.5, 0.2, 0.7, -1.1, 0.035); S.carry(p); } },
    { name: 'windup', duration: 0.6, loop: false, pose: (t, p) => mixInto(p, S.ready, S.drawn, smooth(t)) },
    {
      name: 'strike', duration: 0.12, loop: false,
      pose: (t, p) => {
        mixInto(p, S.drawn, S.struck, easeOut(t));
        S.afterStrike?.(p);
      },
    },
    { name: 'recover', duration: 0.4, loop: false, pose: (t, p) => mixInto(p, S.struck, S.ready, smooth(t)) },
    {
      name: 'hit', duration: 0.3, loop: false,
      pose: (t, p) => {
        base(p);
        const k = bump(t);
        b(p, I.spine).rx += -0.22 * k;
        b(p, I.chest).rx = -0.1 * k;
        b(p, I.head).rx = -0.25 * k;
        if (!S.rider) {
          b(p, I.uaL).rx = -0.5 * k; b(p, I.uaR).rx = -0.5 * k;
          b(p, I.uaL).rz = -0.3 * k; b(p, I.uaR).rz = 0.3 * k;
          b(p, I.shL).rx = 0.25 * k; b(p, I.shR).rx = 0.25 * k;
          p.hipOffset[2] = -0.03 * k;
          p.hipOffset[1] = -0.03 * k;
        }
        S.carry(p);
      },
    },
  ];
  if (S.rider) {
    clips.push({
      name: 'charge', duration: 0.6, loop: true,
      pose: (t, p) => {
        S.ready(p);
        rideBounce(p, t, 0.035, 0.3);
        b(p, I.head).rx += 0.1;
      },
    });
    // Reiter: vom Pferd kippen (das Pferd hat eigene Sterbeclips)
    const fall = (dir: number) => (t: number, p: Pose) => {
      const e = easeIn(clamp01(t));
      seated(p);
      b(p, I.hips).rz = 1.3 * e * dir;
      b(p, I.hips).rx = 0.2 * e;
      p.hipOffset[1] = -0.35 * e;
      p.hipOffset[0] = 0.25 * e * dir;
      b(p, I.uaL).rz = -0.9 * e; b(p, I.uaR).rz = 0.9 * e;
      b(p, I.uaL).rx = -0.6 * e; b(p, I.uaR).rx = -0.6 * e;
      b(p, I.head).rz = -0.3 * e * dir;
      S.carry(p);
      b(p, I.propR).rx += 0.8 * e;
    };
    clips.push(
      { name: 'die1', duration: 0.8, loop: false, pose: fall(-1) },
      { name: 'die2', duration: 0.9, loop: false, pose: fall(1) },
      { name: 'die3', duration: 0.8, loop: false, pose: fall(-1) },
    );
  } else {
    clips.push(
      {
        name: 'die1', duration: 0.8, loop: false,
        pose: (t, p) => {
          const e = easeIn(clamp01(t)); // rückwärts umkippen
          b(p, I.hips).rx = -1.45 * e;
          p.hipOffset[1] = -0.43 * e; p.hipOffset[2] = -0.12 * e;
          b(p, I.thL).rx = -0.35 * e; b(p, I.thR).rx = -0.2 * e;
          b(p, I.shL).rx = 0.7 * e; b(p, I.shR).rx = 0.4 * e;
          b(p, I.spine).rx = -0.2 * e; b(p, I.head).rx = -0.35 * e;
          b(p, I.uaL).rx = -1.1 * e; b(p, I.uaR).rx = -0.9 * e;
          b(p, I.uaL).rz = -0.7 * e; b(p, I.uaR).rz = 0.6 * e;
          b(p, I.faL).rx = -0.4 * e; b(p, I.faR).rx = -0.7 * e;
          S.carry(p);
          b(p, I.propL).rx += 0.6 * e; b(p, I.propR).rx += 0.6 * e;
        },
      },
      {
        name: 'die2', duration: 0.9, loop: false,
        pose: (t, p) => {
          const k = smooth(clamp01(t / 0.45)); // in die Knie, dann nach vorn
          const f = easeIn(clamp01((t - 0.35) / 0.55));
          b(p, I.thL).rx = 0.2 * k - 0.1 * f; b(p, I.thR).rx = 0.3 * k;
          b(p, I.shL).rx = 1.9 * k - 1.2 * f; b(p, I.shR).rx = 1.9 * k - 1.4 * f;
          p.hipOffset[1] = -0.3 * k - 0.15 * f; p.hipOffset[2] = 0.05 * k + 0.12 * f;
          b(p, I.hips).rx = 0.15 * k + 1.3 * f;
          b(p, I.spine).rx = 0.3 * k - 0.1 * f; b(p, I.head).rx = 0.3 * k - 0.4 * f;
          b(p, I.uaL).rx = -0.3 * k - 1.0 * f; b(p, I.uaR).rx = -0.3 * k - 1.1 * f;
          b(p, I.uaL).rz = -0.4 * f; b(p, I.uaR).rz = 0.5 * f;
          b(p, I.faL).rx = -0.3 * k; b(p, I.faR).rx = -0.3 * k;
          S.carry(p);
        },
      },
      {
        name: 'die3', duration: 0.8, loop: false,
        pose: (t, p) => {
          const e = easeIn(clamp01(t)); // seitlich nach links
          b(p, I.hips).rz = 1.35 * e; b(p, I.hips).rx = 0.3 * e;
          p.hipOffset[1] = -0.42 * e; p.hipOffset[0] = -0.1 * e;
          b(p, I.thL).rx = -0.5 * e; b(p, I.thR).rx = 0.1 * e;
          b(p, I.shL).rx = 0.9 * e; b(p, I.shR).rx = 0.5 * e;
          b(p, I.thL).rz = -0.2 * e;
          b(p, I.spine).rz = -0.25 * e; b(p, I.head).rz = -0.3 * e;
          b(p, I.uaL).rz = -1.2 * e; b(p, I.uaR).rx = -0.8 * e; b(p, I.uaR).rz = 0.3 * e;
          b(p, I.faR).rx = -0.6 * e;
          S.carry(p);
        },
      },
    );
  }
  return clips;
}
