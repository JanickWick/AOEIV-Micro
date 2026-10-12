/** Stabiler Zustands-Hash zur Prüfung der Determinismus-Garantie. */
import type { World } from './types';

export function hashWorld(world: World): string {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    const s = Math.round(n * 1e6).toString();
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  mix(world.tick);
  for (const u of world.units) {
    mix(u.id);
    mix(u.alive ? 1 : 0);
    mix(u.pos.x);
    mix(u.pos.y);
    mix(u.heading);
    mix(u.speed);
    mix(u.hp);
    mix(u.orders.length);
  }
  return h.toString(16).padStart(8, '0');
}
