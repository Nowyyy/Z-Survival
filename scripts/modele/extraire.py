"""Extraction brute du modèle SketchUp (Collada) pour le relevé du lot 3g.

Usage : python3 -I scripts/modele/extraire.py <model.dae> <sortie-brute.json>
Bibliothèque standard seulement. La sortie (en mètres, repère du modèle : x est, y nord, z haut)
n'est PAS versionnée : `node scripts/modele/releve.mjs <sortie-brute.json>` en tire
`data/game/maps/rez-de-chaussee/releve.json` (pixels du plan, versionné).

Contenu de la sortie :
- cuts : segments de la coupe horizontale du bâti (géométrie libre du nœud du bâtiment) à 1,2 m au-dessus
  de chaque sol (rez-de-chaussée z = 0 → 1,2 ; étage z = 3,05 → 4,2, comme aux lots 3b et 3e) ;
- instances : chaque composant posé dans la scène (nom, chemin, boîte englobante, triangles, matières) ;
- steps : emprises des escaliers (marches horizontales du bâti groupées par contact) ;
- materials : nom, couleur diffuse, nom de l'image de texture (jamais l'image), triangles.
Aucune image n'est lue ni copiée.
"""
import json
import math
import os
import sys

sys.dont_write_bytecode = True  # aucun fichier __pycache__ dans le dépôt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lecture_collada import Model  # noqa: E402

BUILDING = 'Nazi_Zombies-_Nacht_Der_Untoten'
LEVELS = {'rdc': {'floor': 0.0, 'cut': 1.2}, 'etage': {'floor': 3.05, 'cut': 4.2}}


def r3(v):
    return round(v, 3)


def cut_triangle(t, z):
    pts = []
    for i in range(3):
        a, b = t[i], t[(i + 1) % 3]
        if (a[2] - z) * (b[2] - z) < 0:
            u = (z - a[2]) / (b[2] - a[2])
            pts.append((a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])))
    return pts if len(pts) == 2 else None


def main(src, out):
    model = Model(src)
    cuts = {k: [] for k in LEVELS}
    inst = {}
    flats = []
    mat_count = {}
    for path, mat, t in model.walk():
        mat_count[mat] = mat_count.get(mat, 0) + 1
        in_building = len(path) >= 3 and path[2] == BUILDING
        scope = 'batiment' if in_building else 'exterieur'
        if in_building and len(path) == 3:
            for k, lv in LEVELS.items():
                seg = cut_triangle(t, lv['cut'])
                if seg:
                    cuts[k].append([r3(seg[0][0]), r3(seg[0][1]), r3(seg[1][0]), r3(seg[1][1])])
            # marche : triangle horizontal du bâti entre 0,1 et 2,35 m (ni sol, ni palier sous le plafond de 2,44 m, ni dalle)
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            area = math.sqrt(nx * nx + ny * ny + nz * nz) / 2
            if area > 1e-4 and abs(nz) / (2 * area) > 0.99 and 0.1 < az < 2.35:
                flats.append((min(ax, bx, cx), min(ay, by, cy), max(ax, bx, cx), max(ay, by, cy), az, area))
            continue
        if len(path) < 4:
            continue
        key = path[3] if in_building else (path[3] if len(path) > 3 else path[-1])
        comp = path[4] if (in_building and len(path) > 4) else (path[4] if len(path) > 4 else path[-1])
        e = inst.get(key)
        if e is None:
            e = inst[key] = {'id': key, 'component': comp, 'scope': scope, 'bbox': [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], 'triangles': 0, 'materials': {}}
        b = e['bbox']
        for x, y, z in t:
            b[0], b[1], b[2] = min(b[0], x), min(b[1], y), min(b[2], z)
            b[3], b[4], b[5] = max(b[3], x), max(b[4], y), max(b[5], z)
        e['triangles'] += 1
        name = model.materials.get(mat, {}).get('name', mat)
        e['materials'][name] = e['materials'].get(name, 0) + 1

    # Escaliers : marches horizontales groupées par contact (boîtes à 0,05 m près) ; un groupe d'au moins 6 hauteurs distinctes est un escalier.
    groups = []
    for f in flats:
        hit = [g for g in groups if f[0] <= g['b'][2] + 0.05 and f[2] >= g['b'][0] - 0.05 and f[1] <= g['b'][3] + 0.05 and f[3] >= g['b'][1] - 0.05]
        g = {'b': list(f[:4]), 'z': {round(f[4], 2)}}
        for h in hit:
            groups.remove(h)
            g['b'] = [min(g['b'][0], h['b'][0]), min(g['b'][1], h['b'][1]), max(g['b'][2], h['b'][2]), max(g['b'][3], h['b'][3])]
            g['z'] |= h['z']
        groups.append(g)
    steps = [{'bbox': [r3(v) for v in g['b']], 'levels': sorted(g['z'])} for g in groups if len(g['z']) >= 6]

    instances = []
    for e in inst.values():
        e['bbox'] = [r3(v) for v in e['bbox']]
        instances.append(e)
    instances.sort(key=lambda e: (e['scope'], int(e['id'].rsplit('_', 1)[-1]) if e['id'].rsplit('_', 1)[-1].isdigit() else 0))
    materials = []
    for mid, m in model.materials.items():
        n = mat_count.get(mid, 0)
        if n:
            materials.append({'id': mid, 'name': m['name'], 'color': [r3(c) for c in m['color']] if m['color'] else None, 'texture': os.path.basename(m['texture']) if m['texture'] else None, 'triangles': n})
    materials.sort(key=lambda m: -m['triangles'])
    data = {
        'source': {'file': os.path.basename(src), 'unitMeters': model.meter, 'building': BUILDING},
        'levels': LEVELS,
        'cuts': cuts,
        'steps': steps,
        'instances': instances,
        'materials': materials,
    }
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False)
    print(f"coupes : {', '.join(f'{k} {len(v)} segments' for k, v in cuts.items())} ; escaliers {len(steps)} ; instances {len(instances)} ; matières {len(materials)}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
