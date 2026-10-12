/** Sichtbare Größen der Einheiten (für Trefferprüfung, Lebensbalken, Platzhalterfiguren). */
import type { UnitKind } from '../sim/unitDefs';

export function unitHeight(kind: UnitKind): number {
  return kind === 'cavalry' ? 1.9 : kind === 'siege' ? 1.3 : 1.6;
}

export const PLAYER_COLORS = ['#3b82f6', '#ef4444'] as const;
export const PLAYER_COLORS_HEX = [0x3b82f6, 0xef4444] as const;
