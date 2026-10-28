// Rendu des fenêtres (lot 3a) : un maillage par fenêtre (planches en relief, cadre plat, trou sombre, pastilles au sol) et un maillage pour les débris.
// Tout partage la matière « planche » (une texture de 128 px : bois et bandeau de teintes unies). Chaque maillage a une capacité fixe, ses sommets
// ne sont réécrits que lorsque l'état de la fenêtre change (jamais par image), et il n'est dessiné que s'il est dans le champ de la caméra
// (volume englobant calculé une fois). Ni ombre portée ni objet recréé : un élément absent est écrasé en un point (triangles dégénérés).
// Géométrie : js/core/plank-layout.js (pur). Repère : logique (x, y) -> scène (x, hauteur, y).
import * as THREE from 'three';
import { debrisScale, plankCorners, plankPoses, wallGap, windowTriangles } from '../core/plank-layout.js';

// Écrit un quadrilatère (6 sommets) de coins p (cycliques) à partir de l'indice de sommet `at` ; l'ordre est inversé si besoin pour que la face regarde
// vers `want` ; uv : un [u, v] par coin. La normale écrite est celle de la face.
function writeQuad(buf, at, p, uv, want) {
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0;
  const len = Math.hypot(...n) || 1;
  n = n.map((v) => (flip ? -v : v) / len);
  const order = flip ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
  order.forEach((c, k) => {
    const v = at + k;
    buf.pos.set(p[c], v * 3);
    buf.nor.set(n, v * 3);
    buf.uv.set(uv[c], v * 2);
  });
}

// Point du plan du mur d'une fenêtre : a le long du mur depuis le centre, y la hauteur, depth vers la salle depuis la face intérieure.
const onWall = (g, a, y, depth) => [
  g.center.x + g.tangent.x * a - g.normal.x * (g.inner + depth),
  y,
  g.center.y + g.tangent.y * a - g.normal.y * (g.inner + depth),
];

// geoms : géométries de windows.js avec `inner` (distance du centre à la face intérieure) ; p : réglages (plankSettings) ; sheet : plankSheet.
// Renvoie { sync(winState), nailed(), stats(camera), meshes }.
export function createWindowMeshes({ scene, material, geoms, settings: p, sheet, seed }) {
  const count = p.count;
  const total = windowTriangles(count);
  const entries = geoms.map((g) => buildWindow(g));

  function buildWindow(g) {
    const verts = total * 3;
    const buf = { pos: new Float32Array(verts * 3), nor: new Float32Array(verts * 3), uv: new Float32Array(verts * 2) };
    const cell = (name) => sheet.cells.find((c) => c.name === name);
    const solid = (name) => {
      const c = cell(name);
      return [[c.u, c.v], [c.u, c.v], [c.u, c.v], [c.u, c.v]];
    };
    const items = []; // { from, to (sommets), kind, index }
    const add = (kind, index, from, to) => items.push({ kind, index, from, to });
    let at = 0;
    // Poutres : face avant (côté salle) et dessus.
    const poses = plankPoses(g, p, seed);
    const faceDir = [-g.normal.x, 0, -g.normal.y];
    poses.forEach((pose, i) => {
      const c = plankCorners(pose, g);
      const strip = sheet.strips[i % sheet.strips.length];
      const front = [c[3], c[7], c[5], c[1]];
      writeQuad(buf, at, front, [[sheet.u0, strip.v0], [sheet.u1, strip.v0], [sheet.u1, strip.v1], [sheet.u0, strip.v1]], faceDir);
      writeQuad(buf, at + 6, [c[2], c[6], c[7], c[3]], [[sheet.u0, strip.v0], [sheet.u1, strip.v0], [sheet.u1, strip.v0], [sheet.u0, strip.v0]], [0, 1, 0]);
      add('beam', i, at, at + 12);
      at += 12;
    });
    // Cadre plat autour de l'ouverture : quatre bandes collées à la face intérieure du mur.
    const half = g.width / 2;
    const fw = p.frameWidth;
    const rect = (a0, a1, y0, y1, depth) => [onWall(g, a0, y1, depth), onWall(g, a1, y1, depth), onWall(g, a1, y0, depth), onWall(g, a0, y0, depth)];
    const frame = [
      rect(-half - fw, half + fw, p.sill - fw, p.sill, p.frameGap),
      rect(-half - fw, half + fw, p.lintel, p.lintel + fw, p.frameGap),
      rect(-half - fw, -half, p.sill, p.lintel, p.frameGap),
      rect(half, half + fw, p.sill, p.lintel, p.frameGap),
    ];
    const frameFrom = at;
    for (const q of frame) {
      writeQuad(buf, at, q, solid('frame'), faceDir);
      at += 6;
    }
    add('frame', 0, frameFrom, at);
    // Trou sombre dans l'ouverture (visible quand il manque une planche).
    const voidFrom = at;
    writeQuad(buf, at, rect(-half, half, p.sill, p.lintel, p.voidGap), solid('void'), faceDir);
    at += 6;
    add('void', 0, voidFrom, at);
    // Pastilles au sol, alignées le long du mur et centrées sur le point de réparation : carré de cadre, puis carré intérieur plein (planche présente) ou sombre.
    const spot = g.repairSpot;
    const inner = [];
    for (let i = 0; i < count; i += 1) {
      const along = (i - (count - 1) / 2) * p.pipStep;
      const square = (h, y) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => [
        spot.x + g.tangent.x * (along + sa * h) + g.normal.x * sb * h,
        y,
        spot.y + g.tangent.y * (along + sa * h) + g.normal.y * sb * h,
      ]);
      const from = at;
      writeQuad(buf, at, square(p.pip / 2, p.pipLift), solid('off'), [0, 1, 0]);
      writeQuad(buf, at + 6, square(p.pipInner / 2, p.pipLift + 0.05), solid('on'), [0, 1, 0]);
      inner.push(at + 6);
      at += 12;
      add('pip', i, from, at);
    }
    const uvOn = solid('on');
    const uvOff = solid('void');
    const full = new Float32Array(buf.pos); // tout visible : la référence des sommets
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buf.nor, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    geometry.computeBoundingSphere(); // une fois, tout visible : il ne change plus (les éléments absents sont des sous-ensembles)
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = `fenetre-${g.id}`;
    scene.add(mesh);
    const entry = { id: g.id, geom: g, mesh, items, buf, full, inner, uvOn, uvOff, planks: -1, nailed: 0, stats: { triangles: total, minY: null, minWallGap: null, beams: 0, voidVisible: false, pipsOn: 0 } };
    return entry;
  }

  const setVisible = (e, item, on) => {
    const a = item.from * 3;
    const b = item.to * 3;
    if (on) e.buf.pos.set(e.full.subarray(a, b), a);
    else e.buf.pos.fill(0, a, b);
  };

  function refresh(e, planks) {
    const max = count;
    e.planks = planks;
    let nailed = 0;
    for (const item of e.items) {
      if (item.kind === 'beam') {
        const on = item.index < planks;
        setVisible(e, item, on);
        if (on) nailed += 1;
      } else if (item.kind === 'void') setVisible(e, item, planks < max);
    }
    e.nailed = nailed;
    // Carré intérieur de chaque pastille : plein si la planche est présente, sombre sinon (forme et luminosité, jamais la couleur seule).
    e.inner.forEach((from, i) => {
      const uv = i < planks ? e.uvOn : e.uvOff;
      for (let k = 0; k < 6; k += 1) e.buf.uv.set(uv[0], (from + k) * 2);
    });
    e.mesh.geometry.attributes.position.needsUpdate = true;
    e.mesh.geometry.attributes.uv.needsUpdate = true;
    // Mesures sur les sommets réels : triangles non dégénérés, ordonnée minimale et distance minimale au mur des poutres visibles.
    let triangles = 0;
    const pos = e.buf.pos;
    for (let t = 0; t < total; t += 1) {
      const o = t * 9;
      const area = Math.abs((pos[o + 3] - pos[o]) * (pos[o + 8] - pos[o + 2]) - (pos[o + 5] - pos[o + 2]) * (pos[o + 6] - pos[o])) + Math.abs(pos[o + 4] - pos[o + 1]) + Math.abs(pos[o + 7] - pos[o + 1]);
      if (area > 1e-9) triangles += 1;
    }
    let minY = Infinity;
    let minGap = Infinity;
    for (const item of e.items) {
      if (item.kind !== 'beam' || item.index >= planks) continue;
      for (let v = item.from; v < item.to; v += 1) {
        minY = Math.min(minY, pos[v * 3 + 1]);
        minGap = Math.min(minGap, wallGap([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], e.geom));
      }
    }
    // Lu sur les tampons : poutres dessinées, trou sombre dessiné, pastilles dont le carré intérieur est plein.
    const hole = e.items.find((item) => item.kind === 'void');
    let voidVisible = false;
    for (let v = hole.from * 3; v < hole.to * 3; v += 1) if (pos[v] !== 0) voidVisible = true;
    const on = e.uvOn[0].map((v) => Math.fround(v));
    const pipsOn = e.inner.filter((from) => e.buf.uv[from * 2] === on[0] && e.buf.uv[from * 2 + 1] === on[1]).length;
    e.stats = { triangles, minY: Number.isFinite(minY) ? minY : null, minWallGap: Number.isFinite(minGap) ? minGap : null, beams: e.nailed, voidVisible, pipsOn };
  }

  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  return {
    meshes: entries.map((e) => e.mesh),
    // state : sortie de createWindowsState / stepWindows ; ne réécrit que les fenêtres dont le nombre de planches a changé.
    sync(state) {
      for (const e of entries) {
        const planks = Math.max(0, Math.min(count, Math.floor(Number(state?.windows?.[e.id]?.planks) || 0)));
        if (planks !== e.planks) refresh(e, planks);
      }
    },
    // Poutres clouées visibles (tous maillages).
    nailed: () => entries.reduce((n, e) => n + e.nailed, 0),
    // Mesures de chaque fenêtre (tests) : triangles non dégénérés, dans le champ de la caméra, ordonnée minimale et distance minimale au mur des poutres.
    stats(camera) {
      camera.updateMatrixWorld();
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
      return entries.map((e) => ({ id: e.id, ...e.stats, inFrustum: frustum.intersectsObject(e.mesh) }));
    },
  };
}

// Débris : un seul maillage (capacité debrisMax × 4 triangles) réécrit quand la liste ou une échelle change. Chaque planche est un dessus et un côté
// tourné vers le sud (la caméra) ; la matière est celle des fenêtres. Dessiné seulement s'il y a des débris.
export function createDebrisMesh({ scene, material, settings: p, sheet }) {
  const capacity = p.debrisMax;
  const verts = capacity * 12;
  const buf = { pos: new Float32Array(verts * 3), nor: new Float32Array(verts * 3), uv: new Float32Array(verts * 2) };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(buf.nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'debris';
  mesh.visible = false;
  scene.add(mesh);
  let signature = '';
  return {
    mesh,
    count: () => (mesh.visible ? geometry.drawRange.count / 12 : 0),
    // items : liste de plank-layout (id, x, y, z, yaw, size, age) ; reduced : pas de mise à l'échelle de fin de vie.
    sync(items, reduced = false) {
      const list = (Array.isArray(items) ? items : []).slice(0, capacity);
      const scales = list.map((d) => debrisScale(d, p, reduced));
      const sig = list.map((d, i) => `${d.id}:${scales[i].toFixed(3)}`).join('|');
      if (sig === signature) return;
      signature = sig;
      const center = [0, 0, 0];
      list.forEach((d, i) => {
        const s = scales[i];
        const ax = Math.cos(d.yaw);
        const az = Math.sin(d.yaw);
        const hl = (d.size[0] / 2) * s;
        const hw = (d.size[2] / 2) * s;
        const ht = (d.size[1] / 2) * s;
        const strip = sheet.strips[Math.abs(d.id) % sheet.strips.length];
        const pt = (a, b, y) => [d.x + ax * a - az * b, d.y + y, d.z + az * a + ax * b];
        const top = [pt(-hl, -hw, ht), pt(hl, -hw, ht), pt(hl, hw, ht), pt(-hl, hw, ht)];
        const sign = ax >= 0 ? 1 : -1; // côté dont la normale (-sin, cos) a une composante z positive : face à la caméra
        const side = [pt(-hl, sign * hw, ht), pt(hl, sign * hw, ht), pt(hl, sign * hw, -ht), pt(-hl, sign * hw, -ht)];
        writeQuad(buf, i * 12, top, [[sheet.u0, strip.v0], [sheet.u1, strip.v0], [sheet.u1, strip.v1], [sheet.u0, strip.v1]], [0, 1, 0]);
        writeQuad(buf, i * 12 + 6, side, [[sheet.u0, strip.v0], [sheet.u1, strip.v0], [sheet.u1, strip.v1], [sheet.u0, strip.v1]], [-az * sign, 0, ax * sign]);
        center[0] += d.x;
        center[2] += d.z;
      });
      geometry.setDrawRange(0, list.length * 12);
      mesh.visible = list.length > 0;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.normal.needsUpdate = true;
      geometry.attributes.uv.needsUpdate = true;
      if (list.length > 0) {
        const c = new THREE.Vector3(center[0] / list.length, 0, center[2] / list.length);
        let r = 0;
        for (const d of list) r = Math.max(r, Math.hypot(d.x - c.x, d.z - c.z));
        geometry.boundingSphere.set(c, r + p.debrisLength);
      }
    },
  };
}
