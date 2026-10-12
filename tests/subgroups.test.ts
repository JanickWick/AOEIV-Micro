import { describe, expect, it } from 'vitest';
import { ControlGroups } from '../src/app/groups';
import { commandTargets, cycleSubgroup, onlyType, removeType, resolveActive, subgroupsOf } from '../src/app/subgroups';
import { Drill } from '../src/app/drill';
import { createRng } from '../src/sim/rng';
import { makeWorld, spawn } from './helpers';

function mixedWorld() {
  const world = makeWorld(1, 40, 40);
  // Absichtlich in "falscher" Reihenfolge erzeugt: Reiter zuerst, dann Bogenschützen, dann Speere
  const h = [1, 2].map((i) => spawn(world, 'horseman', 10, 10 + i).id);
  const a = [1, 2, 3].map((i) => spawn(world, 'archer', 12, 10 + i).id);
  const s = [1, 2].map((i) => spawn(world, 'spearman', 14, 10 + i).id);
  return { world, h, a, s, all: [...h, ...a, ...s] };
}

describe('Untergruppen', () => {
  it('ordnet die Typ-Karten in fester Reihenfolge, unabhängig von der Auswahlreihenfolge', () => {
    const { world, all } = mixedWorld();
    const g = subgroupsOf(world.units, all);
    expect(g.map((x) => x.defId)).toEqual(['spearman', 'archer', 'horseman']);
    expect(g.map((x) => x.ids.length)).toEqual([2, 3, 2]);
  });

  it('Tab wechselt zyklisch Alle → Speer → Bogen → Reiter → Alle, Strg+Tab rückwärts', () => {
    const { world, all } = mixedWorld();
    const g = subgroupsOf(world.units, all);
    let a: string | null = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      a = cycleSubgroup(a, g, 1);
      seen.push(a);
    }
    expect(seen).toEqual(['spearman', 'archer', 'horseman', null]);
    expect(cycleSubgroup(null, g, -1)).toBe('horseman');
    expect(cycleSubgroup('spearman', g, -1)).toBe(null);
  });

  it('Tab bei nur einem Typ bleibt auf Alle', () => {
    const { world, a } = mixedWorld();
    expect(cycleSubgroup(null, subgroupsOf(world.units, a), 1)).toBe(null);
  });

  it('Befehle gehen an die aktive Untergruppe, sonst an alle', () => {
    const { world, all, a } = mixedWorld();
    expect(commandTargets(world.units, all, 'archer')).toEqual(a);
    expect(commandTargets(world.units, all, null).length).toBe(7);
  });

  it('Typ entfernen und nur Typ behalten', () => {
    const { world, all, h, a, s } = mixedWorld();
    expect(removeType(world.units, all, 'horseman').sort()).toEqual([...a, ...s].sort());
    expect(onlyType(world.units, all, 'horseman')).toEqual(h);
  });

  it('stirbt die aktive Untergruppe, fällt die Auswahl auf Alle zurück', () => {
    const { world, all, a } = mixedWorld();
    for (const id of a) world.units[id - 1]!.alive = false;
    const g = subgroupsOf(world.units, all);
    expect(g.map((x) => x.defId)).toEqual(['spearman', 'horseman']);
    expect(resolveActive('archer', g)).toBe(null);
    expect(commandTargets(world.units, all, 'archer').length).toBe(4);
  });

  it('Kontrollgruppen behalten ihre Zusammensetzung, wenn die Auswahl Typen verliert', () => {
    const { world, all, h } = mixedWorld();
    const groups = new ControlGroups();
    groups.set(1, all);
    const reduced = removeType(world.units, all, 'horseman');
    expect(reduced.length).toBe(5);
    expect(groups.get(1, world.units).length).toBe(7);
    // Stirbt ein Reiter, verschwindet nur er aus der Gruppe
    world.units[h[0]! - 1]!.alive = false;
    expect(groups.get(1, world.units).length).toBe(6);
    expect(subgroupsOf(world.units, groups.get(1, world.units)).map((g) => g.defId)).toEqual(['spearman', 'archer', 'horseman']);
  });
});

describe('Untergruppen-Drill', () => {
  it('Schritt "Untergruppe aktivieren" wird durch Tab oder Karten-Klick erfüllt, Befehl nur mit passenden Einheiten', () => {
    const { world, all, a, h } = mixedWorld();
    const types = [
      { defId: 'archer', name: 'Bogenschütze' },
      { defId: 'horseman', name: 'Reiter' },
    ];
    const drill = new Drill(createRng(3), 5, [1], { center: { x: 20, y: 20 }, radius: 5 }, 0, { mode: 'subgroups', types });
    drill.update(2000);
    expect(drill.phase).toBe('prompt');
    const task = drill.current!;
    expect(task.steps.some((s) => s.kind === 'subgroup' || s.kind === 'removeType')).toBe(true);
    // Alle Aufgaben beginnen mit "Alle auswählen"
    expect(task.steps[0]!.kind).toBe('selectAll');
    const selection = new Set(all);
    let active: string | null = null;
    const ctx = () => ({
      selection,
      groupIds: () => all,
      allMilitary: () => all,
      activeSubgroup: active,
      typeOf: (id: number) => world.units[id - 1]!.defId,
    });
    expect(drill.onInput({ kind: 'select' }, ctx(), 2100)).toBe(true);
    const step = drill.currentStep!;
    if (step.kind === 'subgroup') {
      // Falsche Untergruppe erfüllt nicht
      active = step.defId === 'archer' ? 'horseman' : 'archer';
      expect(drill.onInput({ kind: 'select' }, ctx(), 2200)).toBe(false);
      active = step.defId;
      expect(drill.onInput({ kind: 'select' }, ctx(), 2300)).toBe(true);
      const next = drill.currentStep;
      if (next && next.kind === 'command') {
        const wrong = step.defId === 'archer' ? h : a;
        expect(drill.onInput({ kind: 'command', command: { kind: next.command, unitIds: wrong, target: next.marker, queue: false } as never }, ctx(), 2400)).toBe(false);
        const right = step.defId === 'archer' ? a : h;
        expect(drill.onInput({ kind: 'command', command: { kind: next.command, unitIds: right, target: next.marker, queue: false } as never }, ctx(), 2500)).toBe(true);
      }
    } else if (step.kind === 'removeType') {
      expect(drill.onInput({ kind: 'select' }, ctx(), 2200)).toBe(false);
      for (const id of step.defId === 'archer' ? a : h) selection.delete(id);
      expect(drill.onInput({ kind: 'select' }, ctx(), 2300)).toBe(true);
    }
  });
});
