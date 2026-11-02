"""Lecture d'un fichier Collada (SketchUp) sans dépendance : aplatissement de la scène.

Bibliothèque standard seulement (xml.etree). Utilisé par extraire.py (lot 3g).
Chaque triangle est rendu en mètres, dans le repère du modèle (x est, y nord, z haut),
avec le chemin des nœuds (noms des composants) et le nom de sa matière.
"""
import xml.etree.ElementTree as ET

NS = '{http://www.collada.org/2005/11/COLLADASchema}'


def _floats(text):
    return [float(v) for v in (text or '').split()]


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def _apply(m, p):
    x, y, z = p
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    )


IDENTITY = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


class Model:
    def __init__(self, path):
        root = ET.parse(path).getroot()
        unit = root.find(f'{NS}asset/{NS}unit')
        self.meter = float(unit.get('meter')) if unit is not None else 1.0
        self.geometries = {g.get('id'): g for g in root.iter(f'{NS}geometry')}
        self.lib_nodes = {}
        lib = root.find(f'{NS}library_nodes')
        if lib is not None:
            for n in lib.findall(f'{NS}node'):
                self.lib_nodes[n.get('id')] = n
        self.materials = {}
        effects = {e.get('id'): e for e in root.iter(f'{NS}effect')}
        images = {i.get('id'): (i.findtext(f'{NS}init_from') or '') for i in root.iter(f'{NS}image')}
        for m in root.iter(f'{NS}material'):
            inst = m.find(f'{NS}instance_effect')
            eff = effects.get((inst.get('url') or '')[1:]) if inst is not None else None
            color, texture = None, None
            if eff is not None:
                diffuse = eff.find(f'.//{NS}diffuse')
                if diffuse is not None:
                    c = diffuse.find(f'{NS}color')
                    if c is not None:
                        color = _floats(c.text)[:3]
                    t = diffuse.find(f'{NS}texture')
                    if t is not None:
                        sampler = t.get('texture')
                        # sampler -> surface -> image
                        for p in eff.iter(f'{NS}newparam'):
                            if p.get('sid') == sampler:
                                src = p.findtext(f'.//{NS}source')
                                for q in eff.iter(f'{NS}newparam'):
                                    if q.get('sid') == src:
                                        texture = images.get(q.findtext(f'.//{NS}init_from'))
            self.materials[m.get('id')] = {'name': m.get('name'), 'color': color, 'texture': texture}
        self.scene = root.find(f'{NS}library_visual_scenes/{NS}visual_scene')

    def _geometry_triangles(self, geom_id, bind):
        g = self.geometries.get(geom_id)
        if g is None:
            return
        mesh = g.find(f'{NS}mesh')
        sources = {s.get('id'): _floats(s.findtext(f'{NS}float_array')) for s in mesh.findall(f'{NS}source')}
        verts = {}
        for v in mesh.findall(f'{NS}vertices'):
            for inp in v.findall(f'{NS}input'):
                if inp.get('semantic') == 'POSITION':
                    verts[v.get('id')] = sources[inp.get('source')[1:]]
        for tri in mesh.findall(f'{NS}triangles'):
            inputs = tri.findall(f'{NS}input')
            stride = max(int(i.get('offset')) for i in inputs) + 1
            vin = next(i for i in inputs if i.get('semantic') == 'VERTEX')
            pos = verts[vin.get('source')[1:]]
            off = int(vin.get('offset'))
            idx = [int(v) for v in (tri.findtext(f'{NS}p') or '').split()]
            mat = bind.get(tri.get('material'), tri.get('material'))
            pts = []
            for k in range(0, len(idx), stride):
                i = idx[k + off]
                pts.append((pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]))
            for k in range(0, len(pts) - 2, 3):
                yield mat, pts[k], pts[k + 1], pts[k + 2]

    def walk(self, node=None, matrix=None, path=()):
        """Rend (chemin, matière, (a, b, c)) pour chaque triangle, en mètres dans le repère du monde."""
        if node is None:
            for n in self.scene.findall(f'{NS}node'):
                yield from self.walk(n, IDENTITY, ())
            return
        m = matrix
        mt = node.find(f'{NS}matrix')
        if mt is not None:
            v = _floats(mt.text)
            m = _mat_mul(matrix, [v[0:4], v[4:8], v[8:12], v[12:16]])
        name = node.get('name') or node.get('id') or ''
        here = path + (name,)
        for ig in node.findall(f'{NS}instance_geometry'):
            bind = {}
            for im in ig.iter(f'{NS}instance_material'):
                bind[im.get('symbol')] = im.get('target')[1:]
            for mat, a, b, c in self._geometry_triangles(ig.get('url')[1:], bind):
                s = self.meter
                yield here, mat, tuple(tuple(q * s for q in _apply(m, p)) for p in (a, b, c))
        for inst in node.findall(f'{NS}instance_node'):
            ref = self.lib_nodes.get(inst.get('url')[1:])
            if ref is not None:
                yield from self.walk(ref, m, here)
        for child in node.findall(f'{NS}node'):
            yield from self.walk(child, m, here)
