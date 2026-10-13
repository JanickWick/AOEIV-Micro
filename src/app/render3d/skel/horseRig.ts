/**
 * Pferde-Skelett (Stufe 3, H3). Modellraum: Höhe 1 (Scheitel), Fußsohle y = 0, Blick +z.
 * Rumpf liegt entlang z, Beine hängen senkrecht; Vorder- und Hinterbeine haben je Oberschenkel,
 * Unterschenkel und Huf. Der Reiter sitzt bei SADDLE.
 */
import { makeRig, type BoneDef } from './rig';

export const HORSE_BONES: readonly BoneDef[] = [
  { name: 'root', parent: null, pos: [0, 0.6, 0], upper: 0 },
  { name: 'chest', parent: 'root', pos: [0, 0.62, 0.22], upper: 0 },
  { name: 'neck', parent: 'chest', pos: [0, 0.7, 0.42], upper: 0 },
  { name: 'head', parent: 'neck', pos: [0, 0.9, 0.55], upper: 0 },
  { name: 'rump', parent: 'root', pos: [0, 0.62, -0.22], upper: 0 },
  { name: 'tail', parent: 'rump', pos: [0, 0.62, -0.42], upper: 0 },
  { name: 'thighFL', parent: 'chest', pos: [-0.11, 0.58, 0.3], upper: 0 },
  { name: 'shinFL', parent: 'thighFL', pos: [-0.11, 0.33, 0.31], upper: 0 },
  { name: 'hoofFL', parent: 'shinFL', pos: [-0.11, 0.09, 0.31], upper: 0 },
  { name: 'thighFR', parent: 'chest', pos: [0.11, 0.58, 0.3], upper: 0 },
  { name: 'shinFR', parent: 'thighFR', pos: [0.11, 0.33, 0.31], upper: 0 },
  { name: 'hoofFR', parent: 'shinFR', pos: [0.11, 0.09, 0.31], upper: 0 },
  { name: 'thighBL', parent: 'rump', pos: [-0.11, 0.6, -0.3], upper: 0 },
  { name: 'shinBL', parent: 'thighBL', pos: [-0.11, 0.33, -0.33], upper: 0 },
  { name: 'hoofBL', parent: 'shinBL', pos: [-0.11, 0.09, -0.33], upper: 0 },
  { name: 'thighBR', parent: 'rump', pos: [0.11, 0.6, -0.3], upper: 0 },
  { name: 'shinBR', parent: 'thighBR', pos: [0.11, 0.33, -0.33], upper: 0 },
  { name: 'hoofBR', parent: 'shinBR', pos: [0.11, 0.09, -0.33], upper: 0 },
];

export const HORSE_RIG = makeRig('horse', HORSE_BONES);

/** Sattelpunkt im Modellraum des Pferdes (Reiterhüfte). */
export const SADDLE: [number, number, number] = [0, 0.66, 0.02];

export const HORSE_RADII: Readonly<Record<string, number>> = {
  root: 0.3, chest: 0.26, neck: 0.16, head: 0.16, rump: 0.26, tail: 0.12,
  thighFL: 0.09, shinFL: 0.07, hoofFL: 0.07, thighFR: 0.09, shinFR: 0.07, hoofFR: 0.07,
  thighBL: 0.1, shinBL: 0.07, hoofBL: 0.07, thighBR: 0.1, shinBR: 0.07, hoofBR: 0.07,
};

export const HORSE_TIPS: Readonly<Record<string, [number, number, number]>> = {
  head: [0, -0.05, 0.22], tail: [0, -0.25, -0.12],
  hoofFL: [0, -0.09, 0.03], hoofFR: [0, -0.09, 0.03], hoofBL: [0, -0.09, 0.03], hoofBR: [0, -0.09, 0.03],
};
