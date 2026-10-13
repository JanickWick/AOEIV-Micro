#!/usr/bin/env python3
"""Schätzt für ein nachbearbeitetes Menschenmodell (Höhe 1, A-Pose) die Armhaltung:
Schulterhöhe, Handposition und Winkel des Arms zur Senkrechten → Werte für generatedModels.ts."""
import sys, numpy as np, trimesh
m = trimesh.load(sys.argv[1], force='mesh')
v = np.asarray(m.vertices)
print('Maße', np.round(m.extents, 3).tolist())
for side, sgn in (('L', -1), ('R', 1)):
    arm = v[(sgn * v[:, 0] > 0.17) & (v[:, 1] > 0.3)]
    if len(arm) == 0:
        print(side, 'kein Arm gefunden'); continue
    far = arm[np.argsort(sgn * arm[:, 0])[-40:]]  # äußerste Punkte = Hand
    hand = far.mean(axis=0)
    sh = v[(sgn * v[:, 0] > 0.1) & (sgn * v[:, 0] < 0.17) & (v[:, 1] > 0.7) & (v[:, 1] < 0.9)]
    shoulder = np.array([sgn * 0.14, sh[:, 1].mean() if len(sh) else 0.82, sh[:, 2].mean() if len(sh) else 0])
    d = hand - shoulder
    rz = np.arctan2(sgn * d[0], -d[1])  # Winkel zur Senkrechten, positiv = vom Körper weg
    rx = -np.arctan2(d[2], np.hypot(d[0], d[1]))
    print(f'{side}: Schulter {np.round(shoulder,3).tolist()} Hand {np.round(hand,3).tolist()} Armlänge {np.linalg.norm(d):.3f} → rz {sgn*rz:+.2f} rx {rx:+.2f}')
