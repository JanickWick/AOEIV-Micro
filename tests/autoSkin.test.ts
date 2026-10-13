import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { autoSkin, fitPoseFor } from '../src/app/render3d/skel/autoSkin';
import { HUMAN_RADII, HUMAN_TIPS, GENERATED_MODELS } from '../src/app/render3d/skel/generatedModels';
import { HUMAN_RIG, jointPosition } from '../src/app/render3d/skel/humanRig';

const skin = GENERATED_MODELS.archer!.skin;

function pointGeometry(points: [number, number, number][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(points.map(() => [0, 0, 1]).flat(), 3));
  return g;
}

describe('Automatisches Skinning erzeugter Modelle', () => {
  it('A-Pose des Bogenschützen bringt die Hände seitlich auf Hüfthöhe', () => {
    const pose = fitPoseFor(HUMAN_RIG, skin.fit);
    const hl = jointPosition(pose, 'handL', [0, 0, 0]);
    const hr = jointPosition(pose, 'handR', [0, 0, 0]);
    expect(hl[0]).toBeLessThan(-0.26);
    expect(hr[0]).toBeGreaterThan(0.26);
    expect(hl[1]).toBeGreaterThan(0.45);
    expect(hl[1]).toBeLessThan(0.56);
    expect(hr[2]).toBeGreaterThan(0.03); // leicht nach vorn
  });

  it('Punkte am Kopf und Fuß bekommen die passenden Knochen, Gewichte sind normiert', () => {
    const g = pointGeometry([[0, 0.95, 0], [-0.075, 0.02, 0.03], [0, 0.66, 0.05]]);
    autoSkin(g, HUMAN_RIG, { fit: {}, radius: HUMAN_RADII, tip: HUMAN_TIPS, smooth: 0 });
    const si = g.getAttribute('aSkinIndex');
    const sw = g.getAttribute('aSkinWeight');
    const up = g.getAttribute('aUpper');
    expect(HUMAN_RIG.bones[si.getX(0)]!.name).toBe('head');
    expect(HUMAN_RIG.bones[si.getX(1)]!.name).toBe('footL');
    expect(['spine', 'chest']).toContain(HUMAN_RIG.bones[si.getX(2)]!.name);
    for (let v = 0; v < 3; v++) {
      const s = sw.getX(v) + sw.getY(v) + sw.getZ(v) + sw.getW(v);
      expect(s).toBeCloseTo(1, 5);
    }
    expect(up.getX(0)).toBeCloseTo(1, 5); // Kopf dreht voll mit
    expect(up.getX(1)).toBeCloseTo(0, 5); // Fuß nicht
  });

  it('bringt einen Punkt an der A-Pose-Hand in die Ruhelage der Hand', () => {
    const pose = fitPoseFor(HUMAN_RIG, skin.fit);
    const handFit = jointPosition(pose, 'handR', [0, 0, 0]);
    const g = pointGeometry([handFit]);
    autoSkin(g, HUMAN_RIG, { ...skin, smooth: 0 });
    const p = g.getAttribute('position');
    const rest = HUMAN_RIG.bones[HUMAN_RIG.index.handR!]!.pos;
    expect(Math.hypot(p.getX(0) - rest[0], p.getY(0) - rest[1], p.getZ(0) - rest[2])).toBeLessThan(0.03);
  });
});
