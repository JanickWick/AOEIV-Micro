/** Einfaches Gitter für Nachbarschaftsabfragen (wird pro Tick neu aufgebaut). */
import type { UnitState } from './types';

export class SpatialGrid {
  private readonly cells = new Map<number, UnitState[]>();
  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(u: UnitState): void {
    const k = this.key(Math.floor(u.pos.x / this.cellSize), Math.floor(u.pos.y / this.cellSize));
    const list = this.cells.get(k);
    if (list) list.push(u);
    else this.cells.set(k, [u]);
  }

  build(units: readonly UnitState[]): void {
    this.clear();
    for (const u of units) if (u.alive) this.insert(u);
  }

  /** Alle Einheiten in Zellen, die den Kreis (x, y, r) berühren könnten; Reihenfolge deterministisch. */
  query(x: number, y: number, r: number, out: UnitState[] = []): UnitState[] {
    const x0 = Math.floor((x - r) / this.cellSize);
    const x1 = Math.floor((x + r) / this.cellSize);
    const y0 = Math.floor((y - r) / this.cellSize);
    const y1 = Math.floor((y + r) / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const u of list) out.push(u);
      }
    }
    return out;
  }
}
