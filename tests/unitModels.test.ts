import { describe, expect, it } from 'vitest';
import { bakeClips } from '../src/app/render3d/skel/animBake';
import { makeHumanClips, type HumanStyle } from '../src/app/render3d/skel/humanClipSets';
import { HUMAN_RIG, emptyPose, jointPosition } from '../src/app/render3d/skel/humanRig';
import { HORSE_RIG } from '../src/app/render3d/skel/horseRig';
import { HORSE_CLIPS } from '../src/app/render3d/skel/horseClips';
import { MANGONEL_CLIPS, SIEGE_RIG, SPRINGALD_CLIPS } from '../src/app/render3d/skel/siegeRig';
import { boneWorldRotationFor, resetPose, setWorldRotationFor } from '../src/app/render3d/skel/rig';
import { chooseClip, UNIT_SPECS } from '../src/app/render3d/skel/skinnedUnits';
import type { UnitState } from '../src/sim/types';

const STYLES: HumanStyle[] = ['bow', 'spear', 'sword', 'crossbow', 'riderSpear', 'riderSword'];

describe('Animationssätze aller Einheiten', () => {
  it('backen für alle Waffenstile, Pferd und Belagerung endlich und vollständig', () => {
    for (const st of STYLES) {
      const baked = bakeClips(HUMAN_RIG, makeHumanClips(st));
      expect(baked.data.every((x) => Number.isFinite(x))).toBe(true);
      for (const name of ['idle', 'ready', 'walk', 'run', 'windup', 'strike', 'recover', 'hit', 'die1', 'die2', 'die3'] as const) expect(baked.byName[name], `${st}:${name}`).toBeDefined();
    }
    for (const [rig, clips] of [[HORSE_RIG, HORSE_CLIPS], [SIEGE_RIG, MANGONEL_CLIPS], [SIEGE_RIG, SPRINGALD_CLIPS]] as const) {
      const baked = bakeClips(rig, clips);
      expect(baked.data.every((x) => Number.isFinite(x))).toBe(true);
      expect(baked.byName.strike).toBeDefined();
    }
    expect(bakeClips(HUMAN_RIG, makeHumanClips('riderSpear')).byName.charge).toBeDefined();
    expect(bakeClips(HUMAN_RIG, makeHumanClips('spear')).byName.charge).toBeUndefined();
  });

  it('Speerstoß: die rechte Hand ist am Ende des Stoßes deutlich vor dem Körper', () => {
    const clips = makeHumanClips('spear');
    const strike = clips.find((c) => c.name === 'strike')!;
    const p = resetPose(emptyPose());
    strike.pose(1, p);
    const hand = jointPosition(p, 'handR', [0, 0, 0]);
    expect(hand[2]).toBeGreaterThan(0.3);
  });

  it('Reiter sitzen: die Füße hängen unterhalb der Hüfte, Knie nach vorn', () => {
    const idle = makeHumanClips('riderSword').find((c) => c.name === 'idle')!;
    const p = resetPose(emptyPose());
    idle.pose(0.1, p);
    const knee = jointPosition(p, 'shinL', [0, 0, 0]);
    expect(knee[2]).toBeGreaterThan(0.15);
    expect(knee[1]).toBeLessThan(0.52);
  });

  it('Pferdegalopp hebt den Rumpf in der Sprungphase', () => {
    const run = HORSE_CLIPS.find((c) => c.name === 'run')!;
    const ys: number[] = [];
    for (let i = 0; i < 10; i++) {
      const p = resetPose({ bones: HORSE_RIG.bones.map(() => ({ rx: 0, ry: 0, rz: 0, s: 1 })), hipOffset: [0, 0, 0] });
      run.pose(i / 10, p);
      ys.push(p.hipOffset[1]);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.02);
  });

  it('Mangonel: der Wurfarm schnellt beim Schuss nach vorn (positive x-Drehung) und kehrt zurück', () => {
    const strike = MANGONEL_CLIPS.find((c) => c.name === 'strike')!;
    const recover = MANGONEL_CLIPS.find((c) => c.name === 'recover')!;
    const p = resetPose({ bones: SIEGE_RIG.bones.map(() => ({ rx: 0, ry: 0, rz: 0, s: 1 })), hipOffset: [0, 0, 0] });
    strike.pose(1, p);
    expect(p.bones[1]!.rx).toBeGreaterThan(1);
    recover.pose(1, p);
    expect(Math.abs(p.bones[1]!.rx)).toBeLessThan(0.01);
  });
});

describe('Exakte Requisiten-Ausrichtung', () => {
  it('setzt die Weltrotation eines Knochens unabhängig von der Elternkette', () => {
    const p = resetPose(emptyPose());
    const idx = HUMAN_RIG.index;
    p.bones[idx.chest!]!.ry = -0.4;
    p.bones[idx.upperArmR!]!.rx = -1.2; p.bones[idx.upperArmR!]!.rz = 0.7;
    p.bones[idx.forearmR!]!.rx = -0.9; p.bones[idx.forearmR!]!.ry = 0.3;
    setWorldRotationFor(HUMAN_RIG, p, 'propR', Math.PI / 2);
    const R = boneWorldRotationFor(HUMAN_RIG, p, 'propR', new Float64Array(9));
    // R · (0,1,0) muss (0,0,1) sein: Spalte 1
    expect(R[1]).toBeCloseTo(0, 6);
    expect(R[4]).toBeCloseTo(0, 6);
    expect(R[7]).toBeCloseTo(1, 6);
  });
});

describe('Einheiten-Zuordnung', () => {
  it('kennt alle acht Einheitentypen; Kavallerie hat Pferd und Reiter', () => {
    expect(Object.keys(UNIT_SPECS).sort()).toEqual(['archer', 'crossbowman', 'horseman', 'knight', 'man-at-arms', 'mangonel', 'spearman', 'springald']);
    expect(UNIT_SPECS.knight!.parts.map((p) => p.key)).toEqual(['horse', 'knight-rider']);
    expect(UNIT_SPECS.knight!.parts[1]!.mount).toBeDefined();
  });

  it('Sturmangriff nur mit Ziel beim Rennen', () => {
    const u = { alive: true, speed: 2.5, attack: { phase: 'idle', targetId: 7, startTick: 0, phaseEndsTick: 0 }, lastHitTick: 0 } as unknown as UnitState;
    const base = { now: 100, tickRate: 60, recoveryS: 0.4, deadT: 0, running: true, walkPhase: 0.3, nowS: 1, dieVariant: 'die1' as const, idleDuration: 4, readyDuration: 2, dieDuration: 0.8 };
    expect(chooseClip(u, { ...base, charge: true }).clip).toBe('charge');
    expect(chooseClip(u, { ...base, charge: false }).clip).toBe('run');
  });
});
