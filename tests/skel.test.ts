import { describe, expect, it } from 'vitest';
import { HUMAN_CLIPS } from '../src/app/render3d/skel/animClips';
import { bakeHumanClips, clipRow } from '../src/app/render3d/skel/animBake';
import { BONE_COUNT, HUMAN_BONES, emptyPose, jointPosition, resetPose, solvePose } from '../src/app/render3d/skel/humanRig';
import { buildArcher } from '../src/app/render3d/skel/humanModels';
import { chooseClip } from '../src/app/render3d/skel/skinnedUnits';
import atlas from '../src/data/atlas/archer.json';
import { makeWorld, spawn } from './helpers';

describe('Skelett', () => {
  it('Ruhepose ergibt Einheitsmatrizen für alle Knochen', () => {
    const skins = new Float32Array(BONE_COUNT * 12);
    solvePose(emptyPose(), skins);
    for (let b = 0; b < BONE_COUNT; b++) {
      const m = skins.subarray(b * 12, b * 12 + 12);
      expect(Array.from(m).map((x) => Math.round(x * 1e5) / 1e5 + 0)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    }
  });

  it('Kind-Knochen folgen der Drehung des Eltern-Knochens', () => {
    const p = emptyPose();
    // Oberarm links 90° nach vorn: die Hand liegt vor der Schulter in Schulterhöhe
    p.bones[HUMAN_BONES.findIndex((b) => b.name === 'upperArmL')]!.rx = -Math.PI / 2;
    const hand = jointPosition(p, 'handL', [0, 0, 0]);
    expect(hand[1]).toBeCloseTo(0.84, 2);
    expect(hand[2]).toBeCloseTo(0.38, 2);
    expect(hand[0]).toBeCloseTo(-0.14, 2);
  });

  it('Hüftverschiebung bewegt den ganzen Körper', () => {
    const p = emptyPose();
    p.hipOffset[1] = -0.4;
    expect(jointPosition(p, 'head', [0, 0, 0])[1]).toBeCloseTo(0.5, 5);
    expect(jointPosition(p, 'footR', [0, 0, 0])[1]).toBeCloseTo(-0.36, 5);
  });
});

describe('Animationsclips', () => {
  it('alle Clips liefern endliche Posen über den ganzen Zeitbereich', () => {
    const p = emptyPose();
    for (const c of HUMAN_CLIPS) {
      for (let i = 0; i <= 20; i++) {
        resetPose(p);
        c.pose(i / 20, p);
        for (const b of p.bones) expect([b.rx, b.ry, b.rz, b.s].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('Spannen endet mit sichtbarem Pfeil und senkrechtem Bogen vor dem Schützen', () => {
    const p = emptyPose();
    HUMAN_CLIPS.find((c) => c.name === 'windup')!.pose(1, p);
    expect(p.bones[HUMAN_BONES.findIndex((b) => b.name === 'arrow')]!.s).toBe(1);
    const hand = jointPosition(p, 'handL', [0, 0, 0]);
    expect(hand[2]).toBeGreaterThan(0.25); // Bogenhand deutlich vor dem Körper
    expect(hand[1]).toBeGreaterThan(0.7); // in Schulterhöhe
  });

  it('nach dem Lösen ist der Pfeil ausgeblendet, Sterbe-Clips enden am Boden', () => {
    const p = emptyPose();
    HUMAN_CLIPS.find((c) => c.name === 'strike')!.pose(0.5, p);
    expect(p.bones[HUMAN_BONES.findIndex((b) => b.name === 'arrow')]!.s).toBe(0);
    for (const name of ['die1', 'die2', 'die3'] as const) {
      resetPose(p);
      HUMAN_CLIPS.find((c) => c.name === name)!.pose(1, p);
      expect(jointPosition(p, 'head', [0, 0, 0])[1]).toBeLessThan(0.45);
    }
  });

  it('Gehzyklus: Beine schwingen gegenläufig und der Clip wiederholt sich nahtlos', () => {
    const walk = HUMAN_CLIPS.find((c) => c.name === 'walk')!;
    const a = emptyPose(), b = emptyPose();
    walk.pose(0.25, a);
    const thL = HUMAN_BONES.findIndex((x) => x.name === 'thighL'), thR = HUMAN_BONES.findIndex((x) => x.name === 'thighR');
    expect(Math.sign(a.bones[thL]!.rx)).toBe(-Math.sign(a.bones[thR]!.rx));
    walk.pose(0, a);
    walk.pose(1, b);
    for (let i = 0; i < a.bones.length; i++) expect(a.bones[i]!.rx).toBeCloseTo(b.bones[i]!.rx, 6);
  });
});

describe('Gebackene Knochen-Textur', () => {
  const baked = bakeHumanClips();
  it('hat eine Zweierpotenz-Breite und nur endliche Werte', () => {
    expect(baked.width & (baked.width - 1)).toBe(0);
    expect(baked.width).toBeGreaterThanOrEqual(BONE_COUNT * 3);
    expect(baked.data.every(Number.isFinite)).toBe(true);
    expect(baked.height).toBe(baked.clips.reduce((s, c) => s + c.span + 1, 0) + 1);
  });

  it('Schleifen-Clips: Wiederholungsbild gleicht dem ersten Bild', () => {
    for (const c of baked.clips.filter((x) => x.loop)) {
      const first = baked.data.subarray(c.start * baked.width * 4, (c.start + 1) * baked.width * 4);
      const last = baked.data.subarray((c.start + c.span) * baked.width * 4, (c.start + c.span + 1) * baked.width * 4);
      expect(Array.from(last)).toEqual(Array.from(first));
    }
  });

  it('clipRow bildet t auf den Clipbereich ab (Schleife wickelt, sonst geklemmt)', () => {
    const walk = baked.get('walk'), draw = baked.get('windup');
    expect(clipRow(walk, 0)).toBe(walk.start);
    expect(clipRow(walk, 1.25)).toBeCloseTo(walk.start + 0.25 * walk.span, 6);
    expect(clipRow(draw, 2)).toBe(draw.start + draw.span);
    expect(clipRow(draw, -1)).toBe(draw.start);
  });
});

describe('Bogenschützen-Modell', () => {
  it('ist Low-Poly, hat normierte Gewichte und gültige Atlas-UVs', () => {
    const m = buildArcher(atlas as never);
    expect(m.triangles).toBeLessThan(2500);
    expect(m.vertices).toBeLessThan(2000);
    const w = m.geometry.getAttribute('aSkinWeight');
    const idx = m.geometry.getAttribute('aSkinIndex');
    const uv = m.geometry.getAttribute('uv');
    for (let i = 0; i < w.count; i++) {
      expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 4);
      for (const k of [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)]) expect(k >= 0 && k < BONE_COUNT).toBe(true);
      expect(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1).toBe(true);
    }
    const pos = m.geometry.getAttribute('position');
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    expect(minY).toBeGreaterThan(-0.05);
    expect(maxY).toBeLessThan(1.1);
  });
});

describe('Clipwahl aus dem Simulationszustand', () => {
  const base = { tickRate: 60, recoveryS: 0.5, deadT: 0, running: false, walkPhase: 2.3, nowS: 1, dieVariant: 'die2' as const, idleDuration: 4, readyDuration: 2, dieDuration: 0.9 };
  it('Windup → Spannen mit exakt dem Fortschritt der Ausholzeit', () => {
    const w = makeWorld();
    const u = spawn(w, 'archer', 5, 5, 0);
    u.attack = { ...u.attack, phase: 'windup', startTick: 100, phaseEndsTick: 115, targetId: 2 };
    expect(chooseClip(u, { ...base, now: 100 })).toEqual({ clip: 'windup', t: 0 });
    expect(chooseClip(u, { ...base, now: 110 }).t).toBeCloseTo(10 / 15, 6);
    expect(chooseClip(u, { ...base, now: 130 })).toEqual({ clip: 'windup', t: 1 });
  });
  it('Nachlauf → Lösen (erstes Viertel) und Erholen (Rest)', () => {
    const w = makeWorld();
    const u = spawn(w, 'archer', 5, 5, 0);
    u.attack = { ...u.attack, phase: 'recovery', startTick: 100, phaseEndsTick: 145, targetId: 2 };
    expect(chooseClip(u, { ...base, now: 115 })).toEqual({ clip: 'strike', t: 0 });
    expect(chooseClip(u, { ...base, now: 115 + 30 * 0.125 }).clip).toBe('strike');
    expect(chooseClip(u, { ...base, now: 115 + 30 * 0.5 })).toEqual({ clip: 'recover', t: (0.5 - 0.25) / 0.75 });
  });
  it('Treffer, Bewegung, Bereitschaft, Stehen, Tod', () => {
    const w = makeWorld();
    const u = spawn(w, 'archer', 5, 5, 0);
    u.lastHitTick = 200;
    expect(chooseClip(u, { ...base, now: 206 })).toEqual({ clip: 'hit', t: 0.1 / 0.3 });
    expect(chooseClip(u, { ...base, now: 300 }).clip).toBe('idle');
    u.speed = 1;
    expect(chooseClip(u, { ...base, now: 300 })).toEqual({ clip: 'walk', t: 2.3 });
    expect(chooseClip(u, { ...base, now: 300, running: true }).clip).toBe('run');
    u.speed = 0;
    u.attack.targetId = 7;
    expect(chooseClip(u, { ...base, now: 300 })).toEqual({ clip: 'ready', t: 0.5 });
    u.alive = false;
    expect(chooseClip(u, { ...base, now: 300, deadT: 0.45 })).toEqual({ clip: 'die2', t: 0.5 });
  });
});
