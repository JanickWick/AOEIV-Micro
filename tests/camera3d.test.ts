import { describe, expect, it } from 'vitest';
import { Camera3D, SCREEN_RIGHT, SCREEN_UP } from '../src/app/camera3d';
import { Camera2D } from '../src/app/camera';
import { unitAtScreenPoint, unitsInScreenRect } from '../src/app/selection';
import { defs, makeWorld, spawn } from './helpers';

describe('3D-Kamera', () => {
  const cam = () => {
    const c = new Camera3D(64, 48);
    c.setViewport(2560, 1440);
    c.lookAt({ x: 32, y: 24 });
    return c;
  };

  it('Bildmitte zeigt auf center; Welt→Bild→Welt ist konsistent', () => {
    const c = cam();
    const s = c.worldToScreen({ x: 32, y: 24 });
    expect(s.x).toBeCloseTo(1280, 0);
    expect(s.y).toBeCloseTo(720, 0);
    for (const p of [{ x: 20, y: 30 }, { x: 40, y: 10 }, { x: 32, y: 24 }]) {
      const back = c.screenToWorld(c.worldToScreen(p));
      expect(back.x).toBeCloseTo(p.x, 4);
      expect(back.y).toBeCloseTo(p.y, 4);
    }
  });

  it('Standardzoom: etwa 44 px pro Tile in Bildmitte bei 2560×1440 (Screenshot-Maß)', () => {
    const c = cam();
    const scale = c.scaleAt({ x: 32, y: 24 });
    expect(scale).toBeGreaterThan(40);
    expect(scale).toBeLessThan(48);
  });

  it('Bildschirm-rechts und -oben entsprechen den Diagonalen der Karte', () => {
    const c = cam();
    const o = c.worldToScreen({ x: 32, y: 24 });
    const r = c.worldToScreen({ x: 32 + SCREEN_RIGHT.x, y: 24 + SCREEN_RIGHT.y });
    const u = c.worldToScreen({ x: 32 + SCREEN_UP.x, y: 24 + SCREEN_UP.y });
    expect(r.x).toBeGreaterThan(o.x + 20);
    expect(Math.abs(r.y - o.y)).toBeLessThan(1);
    expect(u.y).toBeLessThan(o.y - 10);
    expect(Math.abs(u.x - o.x)).toBeLessThan(1);
  });

  it('sichtbarer Boden ist ein Trapez: ferne Kante breiter als nahe', () => {
    const c = cam();
    const [tl, tr, br, bl] = c.visibleQuad();
    const far = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const near = Math.hypot(br.x - bl.x, br.y - bl.y);
    expect(far / near).toBeGreaterThan(1.5);
    expect(far / near).toBeLessThan(2.4);
  });

  it('Zoom am Ankerpunkt hält den Bodenpunkt unter dem Zeiger fest; Pan verschiebt in Bildrichtung', () => {
    const c = cam();
    const anchor = { x: 900, y: 500 };
    const before = c.screenToWorld(anchor);
    c.zoomAt(1.3, anchor);
    const after = c.screenToWorld(anchor);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
    const c2 = cam();
    const p0 = c2.screenToWorld({ x: 1280, y: 720 });
    c2.panPixels(200, 0);
    const p1 = c2.screenToWorld({ x: 1280, y: 720 });
    expect(p1.x - p0.x).toBeGreaterThan(0);
    expect(p1.y - p0.y).toBeGreaterThan(0); // Richtung (+x, +y)
  });
});

describe('Auswahl im Bildschirmraum', () => {
  it('Klick auf die Figur und Rahmen über projizierte Positionen (2D und 3D)', () => {
    const w = makeWorld();
    const a = spawn(w, 'archer', 30, 24);
    const b = spawn(w, 'knight', 34, 24);
    for (const cam of [new Camera2D(64, 48), new Camera3D(64, 48)]) {
      cam.setViewport(1920, 1080);
      cam.lookAt({ x: 32, y: 24 });
      const footA = cam.worldToScreen(a.pos);
      expect(unitAtScreenPoint(w.units, defs, footA, cam)?.id).toBe(a.id);
      const headB = cam.worldToScreen(b.pos, 1.5);
      expect(unitAtScreenPoint(w.units, defs, headB, cam)?.id).toBe(b.id);
      expect(unitAtScreenPoint(w.units, defs, { x: footA.x, y: footA.y + 200 }, cam)).toBeNull();
      const sa = cam.worldToScreen(a.pos);
      const sb = cam.worldToScreen(b.pos);
      const rect = { x0: Math.min(sa.x, sb.x) - 5, y0: Math.min(sa.y, sb.y) - 5, x1: Math.max(sa.x, sb.x) + 5, y1: Math.max(sa.y, sb.y) + 5 };
      expect(unitsInScreenRect(w.units, rect, cam, 0).length).toBe(2);
    }
  });
});
