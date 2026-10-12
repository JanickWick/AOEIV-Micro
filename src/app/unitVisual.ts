/** Sichtbare Größen der Einheiten (für Trefferprüfung, Lebensbalken, Platzhalterfiguren). */
import type { UnitKind } from '../sim/unitDefs';

/** Sichtbare Höhe in Tiles. Aus Video: Infanterie ≈ 0,45 Tiles Bildhöhe bei 45° Neigung → ≈ 0,6 Tiles. */
export function unitHeight(kind: UnitKind): number {
  return kind === 'cavalry' ? 0.8 : kind === 'siege' ? 0.6 : 0.6;
}

export const PLAYER_COLORS = ['#3b82f6', '#ef4444'] as const;
export const PLAYER_COLORS_HEX = [0x3b82f6, 0xef4444] as const;
