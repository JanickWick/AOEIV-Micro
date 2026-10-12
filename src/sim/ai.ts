/**
 * Gegner-KI. Benutzt ausschließlich normale Befehle (keine Cheats) und reagiert mit
 * einstellbarer Verzögerung. M2: Stufe "leicht" (Attack-Move auf die Spielertruppe).
 */
import type { Command, PlayerId, World } from './types';
import { aliveUnits } from './world';

export type AiLevel = 'none' | 'easy' | 'medium' | 'hard';

export interface AiConfig {
  level: AiLevel;
  /** Reaktionszeit in Millisekunden zwischen zwei Entscheidungen. */
  reactionMs: number;
}

export interface AiController {
  readonly player: PlayerId;
  /** Liefert die Befehle für diesen Tick (meist leer). */
  think(world: World): Command[];
}

export function createAi(player: PlayerId, cfg: AiConfig): AiController {
  const interval = Math.max(1, Math.round((cfg.reactionMs / 1000) * 60));
  let nextThink = interval;
  return {
    player,
    think(world) {
      if (cfg.level === 'none') return [];
      if (world.tick < nextThink) return [];
      nextThink = world.tick + Math.max(1, Math.round((cfg.reactionMs / 1000) * world.rules.tickRate));
      const mine = aliveUnits(world, player);
      const enemies = aliveUnits(world, player === 0 ? 1 : 0);
      if (mine.length === 0 || enemies.length === 0) return [];
      const idle = mine.filter((u) => u.orders.length === 0 && u.attack.targetId === null);
      if (idle.length === 0) return [];
      const cx = enemies.reduce((s, u) => s + u.pos.x, 0) / enemies.length;
      const cy = enemies.reduce((s, u) => s + u.pos.y, 0) / enemies.length;
      return [{ kind: 'attackMove', unitIds: idle.map((u) => u.id), target: { x: cx, y: cy }, queue: false }];
    },
  };
}
