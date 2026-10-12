/** Wendet Spieler-/KI-Befehle auf Einheiten an. Befehle wirken im selben Tick ohne Verzögerung. */
import { clearTarget, onNewOrder } from './combat';
import { computeFormation } from './formation';
import { clamp, type Vec2 } from './math';
import type { Command, Order, UnitState, World } from './types';
import { getUnit } from './world';

function clampToMap(world: World, p: Vec2, radius: number): Vec2 {
  return {
    x: clamp(p.x, radius, world.map.width - radius),
    y: clamp(p.y, radius, world.map.height - radius),
  };
}

function resolveUnits(world: World, ids: number[]): UnitState[] {
  const out: UnitState[] = [];
  for (const id of ids) {
    const u = getUnit(world, id);
    if (u && u.alive) out.push(u);
  }
  return out;
}

function pushOrder(world: World, u: UnitState, order: Order, queue: boolean): void {
  if (queue && u.orders.length > 0) {
    u.orders.push(order);
  } else {
    u.orders = [order];
    u.stuckTicks = 0;
    u.lastDist = Infinity;
    onNewOrder(world, u, order);
  }
  world.events.push({ kind: 'orderAccepted', unitId: u.id, tick: world.tick, order: order.kind });
}

/** Position, von der aus der Formationsplatz für eingereihte Befehle berechnet wird. */
function plannedPos(u: UnitState): Vec2 {
  for (let i = u.orders.length - 1; i >= 0; i--) {
    const o = u.orders[i]!;
    if (o.kind === 'move' || o.kind === 'attackMove') return o.target;
    if (o.kind === 'patrol') return o.to;
  }
  return u.pos;
}

export function applyCommand(world: World, cmd: Command): void {
  switch (cmd.kind) {
    case 'move': {
      const units = resolveUnits(world, cmd.unitIds);
      if (units.length === 0) return;
      // Für eingereihte Befehle wird die Formation vom geplanten Endpunkt aus berechnet.
      const ghosts = units.map((u) => (cmd.queue ? { ...u, pos: plannedPos(u) } : u));
      const slots = computeFormation(world, ghosts, cmd.target, cmd.facing);
      const groupId = world.nextGroupId++;
      let speedCap: number | undefined;
      if (world.rules.formationSpeedMatching && units.length > 1) {
        speedCap = Math.min(...units.map((u) => u.maxSpeed));
      }
      for (const slot of slots) {
        const u = getUnit(world, slot.unitId)!;
        const order: Order = { kind: 'move', target: clampToMap(world, slot.target, u.radius), groupId };
        if (speedCap !== undefined) order.speedCap = speedCap;
        pushOrder(world, u, order, cmd.queue);
      }
      return;
    }
    case 'attackMove': {
      const units = resolveUnits(world, cmd.unitIds);
      if (units.length === 0) return;
      const ghosts = units.map((u) => (cmd.queue ? { ...u, pos: plannedPos(u) } : u));
      const slots = computeFormation(world, ghosts, cmd.target, cmd.facing);
      for (const slot of slots) {
        const u = getUnit(world, slot.unitId)!;
        pushOrder(world, u, { kind: 'attackMove', target: clampToMap(world, slot.target, u.radius) }, cmd.queue);
      }
      return;
    }
    case 'patrol': {
      const units = resolveUnits(world, cmd.unitIds);
      if (units.length === 0) return;
      const ghosts = units.map((u) => (cmd.queue ? { ...u, pos: plannedPos(u) } : u));
      const slots = computeFormation(world, ghosts, cmd.target);
      for (const slot of slots) {
        const u = getUnit(world, slot.unitId)!;
        const from = cmd.queue ? plannedPos(u) : { x: u.pos.x, y: u.pos.y };
        pushOrder(world, u, { kind: 'patrol', from: { x: from.x, y: from.y }, to: clampToMap(world, slot.target, u.radius), leg: 1 }, cmd.queue);
      }
      return;
    }
    case 'attack': {
      const target = getUnit(world, cmd.targetId);
      if (!target || !target.alive) return;
      for (const u of resolveUnits(world, cmd.unitIds)) {
        if (u.player === target.player) continue;
        pushOrder(world, u, { kind: 'attack', targetId: cmd.targetId }, cmd.queue);
      }
      return;
    }
    case 'hold': {
      for (const u of resolveUnits(world, cmd.unitIds)) pushOrder(world, u, { kind: 'hold' }, cmd.queue);
      return;
    }
    case 'formation': {
      for (const u of resolveUnits(world, cmd.unitIds)) u.formation = cmd.formation;
      return;
    }
    case 'delete': {
      for (const u of resolveUnits(world, cmd.unitIds)) {
        u.hp = 0;
        u.alive = false;
        u.diedTick = world.tick;
        u.orders = [];
        u.speed = 0;
        world.events.push({ kind: 'died', unitId: u.id, killerId: null, tick: world.tick });
      }
      return;
    }
    case 'stop': {
      for (const u of resolveUnits(world, cmd.unitIds)) {
        u.orders = [];
        u.speed = 0;
        u.stuckTicks = 0;
        u.idleSince = world.tick;
        clearTarget(world, u, 'stop');
        u.attack.leashOrigin = { x: u.pos.x, y: u.pos.y };
      }
      return;
    }
  }
}
