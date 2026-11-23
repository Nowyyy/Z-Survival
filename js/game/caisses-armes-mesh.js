// Lot 9k — Dessin des caisses d'armes de la carte (caisse militaire ouverte du lot 9c, couvercle posé à côté vers la pièce, arme couchée dedans,
// contour à la craie au sol). Par étage, trois maillages fusionnés, créés une fois : caisses (matière de la caisse), armes (atlas des armes),
// craie (transparente) : au plus trois appels de dessin, ceux de l'étage du joueur seulement ; aucune ombre portée de plus. Dessin seulement : les collisions sont
// les obstacles « caisse-arme » de npm run carte. Géométries et matières libérées par dispose() (retour au menu).
import * as THREE from 'three';
import { creerKitArmes } from '../armes/rendu.js';

// Lacet de la caisse (repère du lot 9c : x vers l'avant marqué et le couvercle, z le long de la caisse) selon la face ouverte vers la pièce.
const LACET = { e: 0, w: Math.PI, s: -Math.PI / 2, n: Math.PI / 2 };

function fusionner(morceaux) {
  const attrs = ['position', 'normal', 'uv', 'color'];
  const parts = morceaux.map(({ geometrie, matrice }) => {
    const g = geometrie.index ? geometrie.toNonIndexed() : geometrie.clone();
    g.applyMatrix4(matrice);
    return g;
  });
  const out = new THREE.BufferGeometry();
  for (const a of attrs) {
    if (!parts.every((g) => g.getAttribute(a))) continue;
    const n = parts.reduce((s, g) => s + g.getAttribute(a).array.length, 0);
    const arr = new Float32Array(n);
    let o = 0;
    for (const g of parts) {
      arr.set(g.getAttribute(a).array, o);
      o += g.getAttribute(a).array.length;
    }
    out.setAttribute(a, new THREE.BufferAttribute(arr, parts[0].getAttribute(a).itemSize));
  }
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

// caisses : lireCaisses() ; groups : groupes du monde par étage (js/game/world.js) ; armes : données de la partie (armes-chargement.js).
export function creerCaissesArmes({ caisses, groups, armes }) {
  if (!Array.isArray(caisses) || caisses.length === 0 || !armes) return null;
  const kit = creerKitArmes({ donnees: armes.donnees, palette: armes.palette });
  const d = kit.dimensions('caisse');
  const maillages = [];
  let triangles = 0;
  const parEtage = new Map();
  for (const c of caisses) {
    if (!groups?.[c.floor]) continue;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(c.x + c.w / 2, 0, c.y + c.h / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), LACET[c.face] ?? 0), new THREE.Vector3(1, 1, 1));
    const caisse = kit.caisse('caisse');
    const craie = kit.craie('caisse');
    const arme = kit.mesh(c.arme, armes.choix?.variantes?.[c.arme] ?? 'a', 'caisse');
    const mArme = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, d.appui, 0));
    const e = parEtage.get(c.floor) ?? { caisse: [], craie: [], arme: [], materiaux: { caisse: caisse.material, craie: craie.material, arme: arme.material } };
    e.caisse.push({ geometrie: caisse.geometry, matrice: m });
    e.craie.push({ geometrie: craie.geometry, matrice: m });
    e.arme.push({ geometrie: arme.geometry, matrice: mArme });
    parEtage.set(c.floor, e);
  }
  for (const [floor, e] of parEtage) {
    for (const role of ['caisse', 'arme', 'craie']) {
      const geo = fusionner(e[role]);
      const mesh = new THREE.Mesh(geo, e.materiaux[role]);
      mesh.name = `caisses-armes-${role}`;
      mesh.castShadow = false;
      mesh.receiveShadow = role !== 'craie';
      if (role === 'craie') mesh.renderOrder = 1;
      mesh.userData.floor = floor;
      groups[floor].add(mesh);
      maillages.push(mesh);
      triangles += geo.getAttribute('position').count / 3;
    }
  }
  let etageVu = null;
  return {
    triangles,
    maillages: maillages.length,
    // Étage affiché (celui du joueur) : seules ses caisses sont dessinées (le rez-de-chaussée reste visible sous l'étage : sans cela, trois appels de
    // plus à l'étage). Ne touche aux maillages que si l'étage change.
    etage(f) {
      if (f === etageVu) return;
      etageVu = f;
      for (const m of maillages) m.visible = m.userData.floor === f;
    },
    dessines: () => maillages.filter((m) => m.visible).length,
    dispose() {
      for (const m of maillages) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      kit.dispose();
    },
  };
}
