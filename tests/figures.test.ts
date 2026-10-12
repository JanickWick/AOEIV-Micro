import { describe, expect, it } from 'vitest';
import { FigureRenderer } from '../src/app/render3d/figures';
import { EffectsRenderer } from '../src/app/render3d/effects';
import { stepWorld } from '../src/sim/step';
import { makeWorld, spawn } from './helpers';

function limbBuffer(fr: FigureRenderer): Float32Array {
  const mesh = (fr as unknown as { parts: Map<string, { instanceMatrix: { array: Float32Array }; count: number }> }).parts.get('limb')!;
  return mesh.instanceMatrix.array.slice(0, mesh.count * 16);
}

describe('Figuren aus dem Simulationszustand', () => {
  it('rendert alle Einheitentypen, Reiter und Belagerung ohne Fehler', () => {
    const w = makeWorld();
    for (const id of ['spearman', 'archer', 'man-at-arms', 'horseman', 'crossbowman']) spawn(w, id, 10, 10);
    spawn(w, 'knight', 12, 10, 1, 3);
    spawn(w, 'mangonel', 14, 10, 1, 3);
    spawn(w, 'springald', 16, 10, 1, 3);
    const dead = spawn(w, 'archer', 18, 10, 1);
    dead.alive = false;
    dead.diedTick = 0;
    const fr = new FigureRenderer();
    fr.update(w, 0.5, { nowMs: 1000 });
    const parts = (fr as unknown as { parts: Map<string, { count: number }> }).parts;
    expect(parts.get('limb')!.count).toBeGreaterThan(30);
    expect(parts.get('horseBody')!.count).toBe(2);
    expect(parts.get('siegeArm')!.count).toBe(1);
    expect(parts.get('springBow')!.count).toBe(2);
    expect(parts.get('bow')!.count).toBe(2); // lebender Bogenschütze und Leiche (noch sichtbar)
  });

  it('Ausholpose entspricht dem Windup-Fortschritt und bricht sichtbar ab', () => {
    const w = makeWorld();
    const spear = spawn(w, 'spearman', 10, 10);
    const target = spawn(w, 'archer', 10.6, 10, 1);
    target.attack.cooldownLeft = 1e9;
    const fr = new FigureRenderer();
    fr.update(w, 0, { nowMs: 0 });
    const idle = limbBuffer(fr);
    stepWorld(w, [{ kind: 'attack', unitIds: [spear.id], targetId: target.id, queue: false }]);
    for (let i = 0; i < 60 && spear.attack.phase !== 'windup'; i++) stepWorld(w);
    expect(spear.attack.phase).toBe('windup');
    for (let i = 0; i < 7; i++) stepWorld(w); // Mitte der Ausholzeit (15 Ticks)
    fr.update(w, 0, { nowMs: 100 });
    const mid = limbBuffer(fr);
    expect(Array.from(mid)).not.toEqual(Array.from(idle));
    // Abbruch: Bewegungsbefehl im Windup → Pose blendet innerhalb 0,2 s zurück
    stepWorld(w, [{ kind: 'move', unitIds: [spear.id], target: { x: 30, y: 10 }, queue: false }]);
    expect(spear.attack.phase).toBe('idle');
    fr.update(w, 0, { nowMs: 110 });
    const justCancelled = limbBuffer(fr);
    fr.update(w, 0, { nowMs: 500 });
    const later = limbBuffer(fr);
    expect(Array.from(justCancelled)).not.toEqual(Array.from(later)); // Übergang sichtbar
  });

  it('Laufphase hängt von der zurückgelegten Strecke ab, Tote fallen um und versinken später', () => {
    const w = makeWorld();
    const u = spawn(w, 'spearman', 10, 10);
    const fr = new FigureRenderer();
    stepWorld(w, [{ kind: 'move', unitIds: [u.id], target: { x: 20, y: 10 }, queue: false }]);
    for (let i = 0; i < 10; i++) {
      stepWorld(w);
      fr.update(w, 1, { nowMs: i * 16 });
    }
    const vis = (fr as unknown as { visuals: Map<number, { walkPhase: number }> }).visuals.get(u.id)!;
    expect(vis.walkPhase).toBeGreaterThan(0);
    u.alive = false;
    u.diedTick = w.tick;
    fr.update(w, 0, { nowMs: 2000 });
    const parts = (fr as unknown as { parts: Map<string, { count: number }> }).parts;
    expect(parts.get('limb')!.count).toBe(8); // Leiche sichtbar
    w.tick += 60 * 4; // nach 4 s weg
    fr.update(w, 0, { nowMs: 6000 });
    expect(parts.get('limb')!.count).toBe(0);
  });

  it('Effekte: Projektile werden als Instanzen geführt, Treffer erzeugen Partikel', () => {
    const w = makeWorld();
    const archer = spawn(w, 'archer', 10, 10);
    const target = spawn(w, 'spearman', 14, 10, 1);
    target.attack.cooldownLeft = 1e9;
    const fx = new EffectsRenderer();
    stepWorld(w, [{ kind: 'attack', unitIds: [archer.id], targetId: target.id, queue: false }]);
    let sawProjectile = false;
    let sawParticles = false;
    for (let i = 0; i < 200; i++) {
      stepWorld(w);
      fx.consume(w, w.events);
      fx.update(w, 0.5, i * 16);
      const arrows = (fx as unknown as { arrows: { count: number } }).arrows.count;
      const particles = (fx as unknown as { particles: { count: number } }).particles.count;
      if (arrows > 0) sawProjectile = true;
      if (particles > 0) sawParticles = true;
    }
    expect(sawProjectile).toBe(true);
    expect(sawParticles).toBe(true);
  });
});
