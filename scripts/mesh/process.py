#!/usr/bin/env python3
"""
Nachbearbeitung erzeugter 3D-Modelle (Bild → 3D) für das Spiel:
  - Szene laden, auf Höhe 1 normieren (Fußsohle y = 0, Mitte x/z = 0), Blick +z
  - Polygonzahl reduzieren (Quadric-Kollaps), Normalen vom Original übernehmen
  - neue, zusammenhängende Texturkoordinaten (xatlas) und die Originaltextur darauf
    neu backen (je Texel: nächster Punkt auf dem Original) – keine Nahtfehler durch
    die vielen kleinen Texturinseln der Generatoren
  - Randpolster, Teamfarben-Maske per Farbton-Key (Blau)
  - Ausgabe: <out>.glb (Geometrie + Albedo) und <out>-mask.png (gleiche UVs)

Aufruf: python3 -I scripts/mesh/process.py <in.glb> <out-basis> [--faces 7000] [--tex 1024]
        [--yaw GRAD] [--hue 185,260] [--sat 0.35] [--no-mask]
"""
import argparse, sys
import numpy as np
import trimesh
from PIL import Image, ImageFilter
import fast_simplification
import xatlas
from scipy import ndimage


def load_single(path):
    s = trimesh.load(path, force='scene')
    meshes = []
    for name, g in s.geometry.items():
        for node in s.graph.nodes_geometry:
            T, gname = s.graph[node]
            if gname == name:
                m = g.copy()
                m.apply_transform(T)
                meshes.append(m)
    if len(meshes) != 1:
        sys.exit(f'Erwarte genau eine Geometrie, gefunden: {len(meshes)}')
    return meshes[0]


def normalize(m, yaw_deg):
    if yaw_deg:
        m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(yaw_deg), [0, 1, 0]))
    lo, hi = m.bounds
    m.apply_scale(1.0 / (hi[1] - lo[1]))
    lo, hi = m.bounds
    m.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    return m


def decimate(m, target_faces):
    v = np.asarray(m.vertices, dtype=np.float64)
    f = np.asarray(m.faces, dtype=np.int64)
    if len(f) <= target_faces:
        return v, f
    nv, nf = fast_simplification.simplify(v, f, target_reduction=1.0 - target_faces / len(f), agg=7)
    return np.asarray(nv, dtype=np.float64), np.asarray(nf, dtype=np.int64)


def nearest_on(orig, pts, ref_n, k=12, min_dot=0.2):
    """Nächster Punkt auf dem Original, aber nur auf Dreiecken, deren Normale zur Referenz passt
    (sonst greift man an Beinen, Säumen und Ärmeln die Innenseite oder das Nachbarteil ab)."""
    from scipy.spatial import cKDTree
    cen = orig.triangles_center
    fn = orig.face_normals
    tree = cKDTree(cen)
    _, cand = tree.query(pts, k=k)
    ok = (fn[cand] * ref_n[:, None, :]).sum(axis=2) > min_dot
    ok[:, 0] |= ~ok.any(axis=1)  # notfalls das nächste
    best_d = np.full(len(pts), np.inf); best_t = np.zeros(len(pts), dtype=int); best_p = np.zeros_like(pts)
    for j in range(k):
        t = cand[:, j]
        q = trimesh.triangles.closest_point(orig.triangles[t], pts)
        d = np.linalg.norm(q - pts, axis=1)
        d[~ok[:, j]] = np.inf
        better = d < best_d
        best_d[better] = d[better]; best_t[better] = t[better]; best_p[better] = q[better]
    return best_p, best_t


def face_normals_of(nv, nf):
    a, b, c = nv[nf[:, 0]], nv[nf[:, 1]], nv[nf[:, 2]]
    n = np.cross(b - a, c - a)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def vertex_normals_of(nv, nf):
    fn = face_normals_of(nv, nf)
    vn = np.zeros_like(nv)
    for k in range(3):
        np.add.at(vn, nf[:, k], fn)
    return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)


def sample_normals(orig, pts_in, ref_n):
    """Gespeicherte (glatte) Normalen des Originals am nächsten passenden Punkt interpolieren."""
    vn = np.asarray(orig.vertex_normals)
    pts, tid = nearest_on(orig, pts_in, ref_n)
    bary = trimesh.triangles.points_to_barycentric(orig.triangles[tid], pts)
    n = (vn[orig.faces[tid]] * bary[:, :, None]).sum(axis=1)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def orient_faces(nv, nf, vn):
    a, b, c = nv[nf[:, 0]], nv[nf[:, 1]], nv[nf[:, 2]]
    fn = np.cross(b - a, c - a)
    flip = (fn * vn[nf].sum(axis=1)).sum(axis=1) < 0
    nf = nf.copy()
    nf[flip] = nf[flip][:, [0, 2, 1]]
    return nf


def sample_texture(img_arr, uv):
    """Bilineare Abtastung (uv wie von trimesh geladen: v nach oben, Bildzeile 0 = v 1)."""
    h, w, _ = img_arr.shape
    x = np.clip(uv[:, 0] * w - 0.5, 0, w - 1)
    y = np.clip((1.0 - uv[:, 1]) * h - 0.5, 0, h - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    a = img_arr[y0, x0]; b = img_arr[y0, x1]; c = img_arr[y1, x0]; d = img_arr[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def bake(orig, verts, faces, uvs, res):
    """Rastert die neuen Dreiecke im UV-Raum und holt je Texel die Farbe vom nächsten Punkt des Originals."""
    img0 = np.asarray(orig.visual.material.baseColorTexture.convert('RGB'), dtype=np.float32)
    uv0 = np.asarray(orig.visual.uv)
    out = np.zeros((res, res, 3), dtype=np.float32)
    used = np.zeros((res, res), dtype=bool)
    px = uvs * res  # Pixelkoordinaten (v wächst nach unten, da glTF-Konvention)
    pos_list, idx_list, nrm_list = [], [], []
    fnormals = face_normals_of(verts, faces)
    for fi, f in enumerate(faces):
        p = px[f]
        x0, y0 = np.floor(p.min(axis=0)).astype(int) - 1
        x1, y1 = np.ceil(p.max(axis=0)).astype(int) + 1
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, res - 1), min(y1, res - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        q = np.stack([gx.ravel(), gy.ravel()], axis=1)
        (ax, ay), (bx, by), (cx, cy) = p
        det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(det) < 1e-9:
            continue
        l1 = ((bx - q[:, 0]) * (cy - q[:, 1]) - (cx - q[:, 0]) * (by - q[:, 1])) / det
        l2 = ((cx - q[:, 0]) * (ay - q[:, 1]) - (ax - q[:, 0]) * (cy - q[:, 1])) / det
        l3 = 1 - l1 - l2
        eps = -0.75 / max(1.0, np.sqrt(abs(det)))  # leichter Überstand gegen Lücken
        inside = (l1 >= eps) & (l2 >= eps) & (l3 >= eps)
        if not inside.any():
            continue
        bc = np.stack([l1, l2, l3], axis=1)[inside]
        bc = np.clip(bc, 0, 1); bc /= bc.sum(axis=1, keepdims=True)
        pos = bc @ verts[f]
        pos_list.append(pos)
        idx_list.append(q[inside].astype(int))
        nrm_list.append(np.repeat(fnormals[fi][None], len(pos), axis=0))
    pos = np.concatenate(pos_list); idx = np.concatenate(idx_list); nrm = np.concatenate(nrm_list)
    print(f'Backen: {len(pos)} Texel …', flush=True)
    pts, tid = nearest_on(orig, pos, nrm)
    bary = trimesh.triangles.points_to_barycentric(orig.triangles[tid], pts)
    suv = (uv0[orig.faces[tid]] * bary[:, :, None]).sum(axis=1)
    col = sample_texture(img0, suv)
    out[idx[:, 1], idx[:, 0]] = col
    used[idx[:, 1], idx[:, 0]] = True
    # Randpolster: ungenutzte Texel mit dem nächsten genutzten füllen
    _, nn = ndimage.distance_transform_edt(~used, return_indices=True)
    out = out[nn[0], nn[1]]
    print(f'Texturbelegung: {used.mean():.1%}')
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def team_mask(img, hue_lo, hue_hi, sat_min):
    hsv = np.asarray(img.convert('HSV'), dtype=np.float32)
    h = hsv[..., 0] * 360.0 / 255.0
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    m = (h >= hue_lo) & (h <= hue_hi) & (s >= sat_min) & (v >= 0.12)
    out = Image.fromarray((m * 255).astype(np.uint8), 'L')
    return out.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--faces', type=int, default=7000)
    ap.add_argument('--tex', type=int, default=1024)
    ap.add_argument('--yaw', type=float, default=0.0)
    ap.add_argument('--hue', default='185,260')
    ap.add_argument('--sat', type=float, default=0.35)
    ap.add_argument('--no-mask', action='store_true')
    ap.add_argument('--own-normals', action='store_true', help='Normalen aus dem reduzierten Netz statt vom Original')
    a = ap.parse_args()

    m = normalize(load_single(a.inp), a.yaw)
    print(f'Original: {len(m.vertices)} Vertices, {len(m.faces)} Dreiecke, Maße {np.round(m.extents, 3).tolist()}')
    # Texturnähte verschweißen: sonst bleiben an jeder Naht Randkanten, die die Reduktion zerreißt
    welded = trimesh.Trimesh(m.vertices, m.faces, process=False)
    welded.merge_vertices(merge_tex=True, merge_norm=True)
    print(f'Verschweißt: {len(welded.vertices)} Vertices, wasserdicht: {welded.is_watertight}, Teilkörper: {welded.body_count}')
    nv, nf = decimate(welded, a.faces)
    # Generatoren liefern Teilkörper mit nach innen gewickelten Dreiecken: je Körper nach außen richten
    tmp = trimesh.Trimesh(nv, nf, process=False)
    tmp.fix_normals(multibody=True)
    nf = np.asarray(tmp.faces, dtype=np.int64)
    print(f'Teilkörper: {tmp.body_count}')
    vn = vertex_normals_of(nv, nf) if a.own_normals else sample_normals(welded, nv, vertex_normals_of(nv, nf))
    nf = orient_faces(nv, nf, vn)
    print(f'Reduziert: {len(nv)} Vertices, {len(nf)} Dreiecke')

    vmap, indices, uvs = xatlas.parametrize(nv.astype(np.float32), nf.astype(np.uint32), vn.astype(np.float32))
    verts = nv[vmap]; normals = vn[vmap]; faces = indices.astype(np.int64)
    print(f'Neue Texturkoordinaten: {len(verts)} Vertices')

    img = bake(m, verts, faces, uvs, a.tex)
    # glTF: v nach unten; trimesh erwartet v nach oben beim Export → umrechnen
    uv_tm = np.stack([uvs[:, 0], 1.0 - uvs[:, 1]], axis=1)
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=img, roughnessFactor=0.9, metallicFactor=0.0)
    out = trimesh.Trimesh(verts, faces, vertex_normals=normals, visual=trimesh.visual.TextureVisuals(uv=uv_tm, material=mat), process=False)
    out.export(a.out + '.glb', include_normals=True)
    print(f'→ {a.out}.glb')
    if not a.no_mask:
        lo, hi = (float(x) for x in a.hue.split(','))
        mask = team_mask(img, lo, hi, a.sat)
        mask.save(a.out + '-mask.png')
        print(f'→ {a.out}-mask.png (Anteil {np.asarray(mask).mean() / 255:.1%})')


if __name__ == '__main__':
    main()
