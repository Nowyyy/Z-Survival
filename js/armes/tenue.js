// Lot 9c — Poses de tenue des armes (décision du propriétaire) : quatre poses (pistolet, épaule, hanche, sur l'épaule) créées en tournant
// les articulations d'une INSTANCE du personnage de l'atelier (épaules, bras, avant-bras, mains ; torse 30° au plus, tête et regard vers
// l'avant). Pendant la tenue d'une arme d'épaule ou de hanche, l'instance peut rapprocher ses épaules (jusqu'à ±9) et, seulement si la main
// gauche n'atteint toujours pas sa prise, allonger bras et avant-bras (20 % au plus). js/game/character-v2.js et le personnage du jeu ne
// sont jamais modifiés. Résultat = données (angles par articulation, écartement, allongement, place de l'arme) : data/armes/poses.json.
import * as THREE from 'three';

// Règles par défaut (data/armes/poses.json → regles les remplace) : positions en unités du jeu ; torse en degrés.
export const REGLES = Object.freeze({
  torses: [0, 15, 30], // rotation du torse essayée dans cet ordre (degrés ; épaule gauche vers l'avant)
  epaules: [11.5, 10, 9], // écartement des épaules (x) essayé ensuite, pour l'épaule et la hanche (11,5 : celui du personnage)
  bras: [1, 1.1, 1.2], // allongement du bras et de l'avant-bras, en dernier recours
  pistolet: { 'deux-mains': [-2, 45, 15.5], 'une-main': [-10, 46.5, 19.5] }, // paume droite (repère du personnage)
  epaule: { creux: [-4, 6.5, 7] }, // crosse : creux intérieur de l'épaule droite, devant la poitrine (repère de l'os chest)
  hanche: { main: [-9.5, 33, 8] }, // paume droite devant la hanche droite (repère du personnage)
  'sur-epaule': { appui: [-7.5, 13, -1] }, // tube posé sur l'épaule droite (repère de l'os chest)
  dos: [0, 2, -14.5], // centre des réservoirs portés, contre le dos et le sac (repère de l'os chest)
});
const POLE = { R: new THREE.Vector3(-0.8, -1, -0.3), L: new THREE.Vector3(0.8, -1, -0.3) };
const PAUME = 1.8; // centre de la paume sous le poignet (pièces handL / handR)
const RAYON_CROSSE = 3; // points de l'arme à moins de 3 unités de la crosse : autorisés contre l'épaule
// Retour du propriétaire (« la main arrière est dans l'arme ») : la main (ellipsoïde de 2,2 × 2,6 du personnage) se pose contre la surface ;
// aucun point de l'arme à moins de RAYON_MAIN du centre de la paume (le reste de la main l'entoure, comme des doigts).
export const RAYON_MAIN = 1.3;
// Côté où chaque paume se pose : droite sur le côté droit (−x) du poignet ou de la poignée ; gauche dessous (fût, pompe, manchon) ou sur le
// côté gauche (+x) d'une poignée avant verticale (prises.contactGauche = 'cote').
const VERS = { droite: [-1, 0, 0], dessous: [0, -1, 0], cote: [1, 0, 0] };
export const ARTICULATIONS = Object.freeze(['spine', 'chest', 'neck', 'head', 'shoulderR', 'elbowR', 'wristR', 'shoulderL', 'elbowL', 'wristL']);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Volumes de la tête et du torse : boîtes dans le repère de leur os, relevées sur le personnage « riche » (characters-v2.json, sac à dos
// compris) avec une petite marge. Les bras ne comptent pas (ils tiennent l'arme).
export const CORPS = Object.freeze([
  { os: 'chest', min: [-9.9, -2.3, -10.1], max: [9.9, 11.3, 6.0] },
  { os: 'spine', min: [-8.9, -0.7, -5.4], max: [8.9, 9.9, 5.4] },
  { os: 'pelvis', min: [-9.3, -3.6, -2.8], max: [6.3, 4.6, 2.8] },
  { os: 'head', min: [-5.0, -0.7, -4.9], max: [5.5, 9.9, 7.8] },
  { os: 'neck', min: [-2.5, -1.6, -2.5], max: [2.5, 3.9, 2.5] },
]);

// Points de la surface d'un maillage (positions de triangles, unités) : sommets et grille barycentrique de chaque triangle.
export function echantillons(positions, n = 4) {
  const out = [];
  for (let t = 0; t + 8 < positions.length; t += 9) {
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n - i; j += 1) {
        const [a, b] = [i / n, j / n];
        const c = 1 - a - b;
        out.push(a * positions[t] + b * positions[t + 3] + c * positions[t + 6], a * positions[t + 1] + b * positions[t + 4] + c * positions[t + 7], a * positions[t + 2] + b * positions[t + 5] + c * positions[t + 8]);
      }
    }
  }
  return new Float32Array(out);
}

function lesOs(root) {
  const g = (n) => root.getObjectByName(n);
  return { root, spine: g('spine'), chest: g('chest'), neck: g('neck'), head: g('head'), R: [g('shoulderR'), g('elbowR'), g('wristR')], L: [g('shoulderL'), g('elbowL'), g('wristL')] };
}

// Cinématique inverse d'un bras (allongement f : os de l'épaule à l'échelle f, main ramenée à 1) ; cible = centre de la paume (monde).
// Renvoie l'écart restant entre la paume et la cible (unités).
function bras([epaule, coude, poignet], cible, pole, f) {
  epaule.parent.updateMatrixWorld(true);
  const S = epaule.getWorldPosition(new THREE.Vector3());
  const L1 = coude.position.length() * f;
  const L2 = poignet.position.length() * f + PAUME;
  const vers = cible.clone().sub(S);
  const dist = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, vers.length()));
  const dir = vers.clone().normalize();
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const E = S.clone().add(dir.clone().multiplyScalar(a)).add(p.multiplyScalar(h));
  const W = S.clone().add(dir.clone().multiplyScalar(dist));
  const u = E.clone().sub(S).normalize();
  const fw = W.clone().sub(E).normalize();
  // Repère de l'épaule : l'os pend selon −y ; l'avant-bras plie dans le plan (y, z) local, vers +z (coude : rotation négative autour de x).
  const Y = u.clone().negate();
  let Z = fw.clone().sub(u.clone().multiplyScalar(fw.dot(u)));
  if (Z.lengthSq() < 1e-8) Z = new THREE.Vector3(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const monde = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const parent = epaule.parent.getWorldQuaternion(new THREE.Quaternion());
  epaule.quaternion.copy(parent.invert().multiply(monde));
  coude.rotation.set(-Math.acos(Math.max(-1, Math.min(1, u.dot(fw)))), 0, 0);
  poignet.rotation.set(0, 0, 0);
  return vers.length() - dist;
}

// Nombre de points de l'arme dans la tête ou le torse pour une position P de l'arme (repère du personnage, sans rotation) : points
// transformés une fois dans le repère de chaque os ; ensuite seul le décalage change.
function collisions(root, points) {
  root.updateMatrixWorld(true);
  const boites = CORPS.map((c) => {
    const o = root.getObjectByName(c.os);
    if (!o) return null;
    const versOs = o.matrixWorld.clone().invert().multiply(root.matrixWorld);
    const q = new Float32Array(points.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < points.length; i += 3) {
      v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(versOs);
      q[i] = v.x;
      q[i + 1] = v.y;
      q[i + 2] = v.z;
    }
    return { c, q, dir: new THREE.Matrix3().setFromMatrix4(versOs) };
  }).filter(Boolean);
  return (P) => {
    let total = 0;
    for (const b of boites) {
      const d = P.clone().applyMatrix3(b.dir); // la translation de l'os est déjà dans les points
      const [x0, y0, z0] = b.c.min;
      const [x1, y1, z1] = b.c.max;
      for (let i = 0; i < b.q.length; i += 3) {
        const x = b.q[i] + d.x;
        if (x < x0 || x > x1) continue;
        const y = b.q[i + 1] + d.y;
        if (y < y0 || y > y1) continue;
        const z = b.q[i + 2] + d.z;
        if (z >= z0 && z <= z1) total += 1;
      }
    }
    return total;
  };
}

// Points de l'arme à moins de RAYON_MAIN d'une paume (repère de l'arme, unités).
function dansMain(points, p) {
  if (!points || !p) return 0;
  let n = 0;
  for (let i = 0; i < points.length; i += 3) if (Math.hypot(points[i] - p.x, points[i + 1] - p.y, points[i + 2] - p.z) < RAYON_MAIN) n += 1;
  return n;
}

// Paume posée contre la surface : on l'écarte de la prise, dans la direction donnée, jusqu'à ce qu'aucun point de l'arme ne soit sous elle
// (pas de 0,05 unité, 4 unités au plus).
function contact(points, p, dir) {
  if (!points) return p;
  const d = v3(dir);
  const q = p.clone();
  for (let i = 0; i < 80 && dansMain(points, q) > 0; i += 1) q.addScaledVector(d, 0.05);
  return q;
}

// Retour du propriétaire (« la main ne doit pas être mise sur la bretelle mais sur l'arme, la bretelle doit être contre le bras ») : la main
// se pose sur l'arme sans la bretelle (points sans bretelle) ; puis la bretelle, souple, est déviée : ses deux sections du milieu descendent
// (et s'écartent un peu) juste assez pour passer contre les bras et les mains, sans les traverser ni entrer dans le torse. Ses attaches
// (première et dernière sections) ne bougent pas.
const RAYONS_BRAS = { haut: 2.5, avant: 2.1, main: 2.4 }; // capsules du personnage (characters-v2.json : upperL, foreL, handL)
const MARGE_BRETELLE = 0.15;
const BRETELLE = { dy: [0, -320, 10], dx: [-40, 80, 20], dz: [-60, 120, 30] }; // déplacements essayés (mm : début, fin, pas)
const pas = ([a, b, p]) => Array.from({ length: Math.floor(Math.abs(b - a) / Math.abs(p)) + 1 }, (_, i) => a + Math.sign(b - a) * i * Math.abs(p));
function distSeg(q, a, b) {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, q.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return q.distanceTo(a.clone().addScaledVector(ab, t));
}
function router(perso, o, P, s, f, sections) {
  const root = perso.root;
  root.updateMatrixWorld(true);
  const loc = (obj, v = new THREE.Vector3()) => root.worldToLocal(obj.localToWorld(v.clone())).sub(P); // repère de l'arme (unités)
  const capsules = [];
  for (const cote of ['L', 'R']) {
    const [ep, co, po] = o[cote];
    const [S, E, W] = [loc(ep), loc(co), loc(po)];
    const paume = W.clone().add(W.clone().sub(E).normalize().multiplyScalar(PAUME));
    capsules.push([S, E, RAYONS_BRAS.haut * f], [E, W, RAYONS_BRAS.avant * f], [W, paume, RAYONS_BRAS.main]);
  }
  // Boîtes du corps : passage du repère de l'arme à celui de chaque os.
  const boites = CORPS.map((c) => {
    const b = root.getObjectByName(c.os);
    return b ? { c, m: b.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(P.x, P.y, P.z)) } : null;
  }).filter(Boolean);
  const demi = (Math.max(...sections.map((x) => x.h)) / 2) * s;
  const points = (secs) => {
    const out = [];
    for (let k = 0; k < secs.length - 1; k += 1) {
      const [a, b] = [secs[k], secs[k + 1]];
      for (let t = 0; t <= 8; t += 1) {
        const u = t / 8;
        const w = (a.w + (b.w - a.w) * u) / 2;
        for (const cx of [-w, 0, w]) out.push(new THREE.Vector3((a.x + (b.x - a.x) * u + cx) * s, (a.y + (b.y - a.y) * u) * s, (a.z + (b.z - a.z) * u) * s));
      }
    }
    return out;
  };
  const conflits = (secs) => {
    let n = 0;
    const v = new THREE.Vector3();
    for (const q of points(secs)) {
      if (capsules.some(([a, b, r]) => distSeg(q, a, b) < r + demi + MARGE_BRETELLE)) n += 1;
      for (const { c, m } of boites) {
        v.copy(q).applyMatrix4(m);
        if (v.x >= c.min[0] && v.x <= c.max[0] && v.y >= c.min[1] && v.y <= c.max[1] && v.z >= c.min[2] && v.z <= c.max[2]) n += 1;
      }
    }
    return n;
  };
  const base = sections.map((x) => ({ ...x }));
  let meilleur = { secs: base, cout: conflits(base) * 1e9 };
  if (meilleur.cout === 0) return { sections: base, conflits: 0 };
  const [i1, i2] = [1, sections.length - 2];
  for (const dy1 of pas(BRETELLE.dy)) for (const dx1 of pas(BRETELLE.dx)) for (const dy2 of pas(BRETELLE.dy)) for (const dx2 of pas(BRETELLE.dx)) for (const dz2 of pas(BRETELLE.dz)) {
    const ecart = dx1 * dx1 + dy1 * dy1 + dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
    if (ecart >= meilleur.cout) continue;
    const secs = base.map((x, i) => (i === i1 ? { ...x, x: x.x + dx1, y: x.y + dy1 } : i === i2 ? { ...x, x: x.x + dx2, y: x.y + dy2, z: x.z + dz2 } : x));
    const cout = conflits(secs) * 1e9 + ecart;
    if (cout < meilleur.cout) meilleur = { secs, cout };
  }
  return { sections: meilleur.secs, conflits: conflits(meilleur.secs) };
}

// Instance : torse (degrés), écartement des épaules, allongement des bras ; repart toujours de l'état « repos » noté au départ.
function configurer(o, repos, { torse = 0, epaules = null, f = 1 }) {
  const t = (-torse * Math.PI) / 180;
  o.spine.rotation.y = repos.spine + t / 2;
  o.chest.rotation.y = repos.chest + t / 2;
  if (o.neck) o.neck.rotation.y = repos.neck - t / 2; // tête et regard ramenés dans l'axe de visée
  if (o.head) o.head.rotation.y = repos.head - t / 2;
  for (const [cote, s] of [['R', -1], ['L', 1]]) {
    const [epaule, , poignet] = o[cote];
    epaule.position.x = epaules === null ? repos[`x${cote}`] : s * epaules;
    epaule.scale.setScalar(f);
    poignet.scale.setScalar(1 / f); // la main garde sa taille
  }
  o.root.updateMatrixWorld(true);
}

const arrondi = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

// Essai demandé par le propriétaire (« toutes les armes avec les bras les plus longs, idem pour les épaules », pour voir le rendu d'un
// personnage du jeu modifié une fois pour toutes) : même corps pour toutes les armes, le pistolet compris.
export const CORPS_LONG = Object.freeze({ epaules: 9, f: 1.2 });

// Applique un corps (écartement des épaules, allongement des bras) à une instance sans pose de tenue (pose actuelle du jeu).
export function appliquerCorps(perso, corps) {
  if (!corps) return;
  const o = lesOs(perso.root);
  for (const [cote, s] of [['R', -1], ['L', 1]]) {
    o[cote][0].position.x = s * corps.epaules;
    o[cote][0].scale.setScalar(corps.f);
    o[cote][2].scale.setScalar(1 / corps.f);
  }
  perso.root.updateMatrixWorld(true);
}

// Pose une arme. perso : instance de createV2Kit (après setAnim('repos')) ; arme : données (prises en mm) ; s : unités par mm (échelle
// commune) ; objet : groupe de l'arme (ajouté au repère du personnage) ; points : surface de l'arme (echantillons(), repère de l'arme) ;
// mode : 'deux-mains' | 'une-main' (pistolet) ; bretelle : sections de la bretelle (sectionsBretelle(), mm) ou null ; corps : { epaules, f }
// imposé à toutes les armes (essai CORPS_LONG) au lieu des écartements et allongements essayés arme par arme.
// Renvoie les données de la pose (voir data/armes/poses.json) et ses contrôles.
export function poserArme(perso, arme, s, objet, { points = null, regles = REGLES, mode = 'deux-mains', bretelle = null, corps = null } = {}) {
  const r = { ...REGLES, ...(regles ?? {}) };
  const prises = arme.prises;
  const o = lesOs(perso.root);
  perso.root.updateMatrixWorld(true);
  const repos = { spine: o.spine.rotation.y, chest: o.chest.rotation.y, neck: o.neck?.rotation.y ?? 0, head: o.head?.rotation.y ?? 0, xR: o.R[0].position.x, xL: o.L[0].position.x };
  const mm = (p) => v3(p).multiplyScalar(s);
  const D = contact(points, mm(prises.droite), VERS.droite);
  const G = prises.gauche ? contact(points, mm(prises.gauche), VERS[prises.contactGauche] ?? VERS.dessous) : null;
  const C = prises.crosse ? mm(prises.crosse) : null;
  const pose = prises.tenue;
  const avecGauche = Boolean(G) && !(pose === 'pistolet' && mode === 'une-main');
  // Points de collision : la crosse peut toucher l'épaule ; 2 000 points au plus (des milliers de positions sont essayées).
  let pts = points;
  if (pts && C) pts = pts.filter((_, i, a) => { const k = i - (i % 3); return Math.hypot(a[k] - C.x, a[k + 1] - C.y, a[k + 2] - C.z) > RAYON_CROSSE; });
  if (pts) {
    const pas = Math.max(1, Math.ceil(pts.length / 3 / 2000));
    if (pas > 1) pts = pts.filter((_, i) => Math.floor(i / 3) % pas === 0);
  }
  const local = (v) => perso.root.worldToLocal(v.clone());
  const essais = [];
  if (corps) for (const torse of pose === 'pistolet' ? [0] : r.torses) essais.push({ torse, epaules: corps.epaules, f: corps.f });
  else if (pose === 'pistolet') essais.push({ torse: 0, epaules: null, f: 1 });
  else for (const f of r.bras) for (const e of r.epaules) for (const torse of r.torses) essais.push({ torse, epaules: e === 11.5 ? null : e, f });
  // Pistolet : bras aussi tendus qu'avec le corps du personnage (retour du propriétaire : « faire tendre un peu les bras » avec le corps
  // long, au lieu de bras entièrement repliés) : la main s'avance jusqu'à la même extension (distance épaule-paume / portée du bras).
  let extension = null;
  if (pose === 'pistolet') {
    configurer(o, repos, { torse: 0, epaules: null, f: 1 });
    const S0 = local(o.R[0].getWorldPosition(new THREE.Vector3()));
    const p0 = (o.R[1].position.length() + o.R[2].position.length()) + PAUME;
    extension = v3(r.pistolet[mode] ?? r.pistolet['deux-mains']).distanceTo(S0) / p0;
  }
  let meilleur = null;
  for (const cfg of essais) {
    configurer(o, repos, cfg);
    const SR = local(o.R[0].getWorldPosition(new THREE.Vector3()));
    const SL = local(o.L[0].getWorldPosition(new THREE.Vector3()));
    const portee = 0.99 * ((o.R[1].position.length() + o.R[2].position.length()) * cfg.f + PAUME);
    let base;
    let grille;
    if (pose === 'pistolet') {
      const T = v3(r.pistolet[mode] ?? r.pistolet['deux-mains']);
      const voulu = extension * ((o.R[1].position.length() + o.R[2].position.length()) * cfg.f + PAUME);
      const [dx, dy, dz] = [T.x - SR.x, T.y - SR.y, T.z - SR.z];
      if (Math.hypot(dx, dy, dz) < voulu - 1e-6 && voulu * voulu > dx * dx + dy * dy) T.z = SR.z + Math.sqrt(voulu * voulu - dx * dx - dy * dy);
      base = T.sub(D);
      grille = [[0], [0], [0]];
    } else if (pose === 'epaule' || pose === 'sur-epaule') {
      const appui = local(o.chest.localToWorld(v3(pose === 'epaule' ? r.epaule.creux : r['sur-epaule'].appui)));
      base = appui.sub(C ?? new THREE.Vector3());
      // Crosse un peu enfoncée dans le creux de l'épaule : permis (la crosse seule) ; le tube peut se poser plus à l'extérieur de la tête.
      grille = pose === 'epaule' ? [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1, 2]] : [[-4, -3, -2, -1, 0, 1], [-1, 0, 1], [-1, 0, 1, 2]];
    } else {
      base = v3(r.hanche.main).sub(D);
      grille = [[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4], [-2, -1, 0, 1, 2, 3, 4, 5], [-4, -3, -2, -1, 0, 1, 2, 3]];
    }
    const collision = pts ? collisions(perso.root, pts) : () => 0;
    const cfgCout = cfg.torse * 0.04 + (cfg.epaules === null ? 0 : (11.5 - cfg.epaules) * 0.8) + (cfg.f - 1) * 40;
    for (const dx of grille[0]) for (const dy of grille[1]) for (const dz of grille[2]) {
      const P = base.clone().add(new THREE.Vector3(dx, dy, dz));
      const manque = Math.max(0, P.clone().add(D).distanceTo(SR) - portee) + (avecGauche ? Math.max(0, P.clone().add(G).distanceTo(SL) - portee) : 0);
      const ecart = cfgCout + (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) * 0.2;
      if (meilleur && manque * 30 + ecart >= meilleur.cout) continue;
      const traverse = collision(P);
      const cout = traverse * 100 + manque * 30 + ecart;
      if (!meilleur || cout < meilleur.cout) meilleur = { cout, cfg, P };
    }
  }
  // Pose retenue : instance configurée, arme placée, bras posés.
  configurer(o, repos, meilleur.cfg);
  const P = meilleur.P;
  objet.position.copy(P);
  objet.rotation.set(0, 0, 0);
  perso.root.add(objet);
  perso.root.updateMatrixWorld(true);
  const monde = (v) => perso.root.localToWorld(v.clone());
  const droite = bras(o.R, monde(P.clone().add(D)), POLE.R, meilleur.cfg.f);
  let gauche = 0;
  if (avecGauche) gauche = bras(o.L, monde(P.clone().add(G)), POLE.L, meilleur.cfg.f);
  else for (const b of o.L) b.rotation.set(0, 0, 0); // main libre : bras le long du corps
  perso.root.updateMatrixWorld(true);
  // Contrôles : points dans le corps, visée (l'arme pointe vers +z du personnage), bouche devant le corps (vue de dessus).
  const traverse = pts ? collisions(perso.root, pts)(P) : 0;
  const visee = (new THREE.Vector3(0, 0, 1).applyEuler(objet.rotation).angleTo(new THREE.Vector3(0, 0, 1)) * 180) / Math.PI;
  let bouche = -Infinity;
  if (points) for (let i = 2; i < points.length; i += 3) bouche = Math.max(bouche, points[i] + P.z);
  const devantCorps = Math.max(...CORPS.map((c) => {
    const b = perso.root.getObjectByName(c.os);
    let m = -Infinity;
    for (const x of [c.min[0], c.max[0]]) for (const y of [c.min[1], c.max[1]]) for (const z of [c.min[2], c.max[2]]) m = Math.max(m, local(b.localToWorld(new THREE.Vector3(x, y, z))).z);
    return m;
  }));
  // Réservoirs portés (lance-flammes) : centre du sac sur le dos (repère de l'os chest), donc tournés avec le torse ; décalage rendu dans le
  // repère de l'arme (mm) et rotation (degrés) pour js/core/armes/armes.js (groupe « dos »).
  let dos = null;
  if (arme.dos) {
    const centre = local(o.chest.localToWorld(v3(r.dos ?? [0, 2, -14.5])));
    dos = { decalage: centre.sub(P).divideScalar(s).toArray().map((x) => Math.round(x)), lacet: -meilleur.cfg.torse };
  }
  const route = Array.isArray(bretelle) && bretelle.length >= 4 ? router(perso, o, P, s, meilleur.cfg.f, bretelle) : null;
  const angles = Object.fromEntries(ARTICULATIONS.map((n) => {
    const b = perso.root.getObjectByName(n);
    return [n, b ? [arrondi(b.rotation.x), arrondi(b.rotation.y), arrondi(b.rotation.z)] : [0, 0, 0]];
  }));
  return {
    pose, mode: pose === 'pistolet' ? mode : null,
    torse: meilleur.cfg.torse, epaules: meilleur.cfg.epaules ?? 11.5, bras: meilleur.cfg.f,
    arme: {
      position: P.toArray().map((x) => arrondi(x, 3)), rotation: [0, 0, 0], ...(dos ? { dos } : {}),
      ...(route ? { bretelle: route.sections.map((x) => [x.x, x.y, x.z].map((v) => Math.round(v))) } : {}),
    },
    angles,
    controle: {
      droite: arrondi(Math.max(0, droite), 3), gauche: arrondi(Math.max(0, gauche), 3), traverse, visee: arrondi(visee, 2), devant: arrondi(bouche - devantCorps, 2),
      mains: dansMain(points, D) + (avecGauche ? dansMain(points, G) : 0), // points de l'arme à moins de RAYON_MAIN des paumes
      ...(route ? { bretelle: route.conflits } : {}), // points de la bretelle dans un bras, une main ou le torse
    },
    prises: { droite: D.toArray().map((x) => arrondi(x, 3)), gauche: G && avecGauche ? G.toArray().map((x) => arrondi(x, 3)) : null },
  };
}

// Applique une pose enregistrée (data/armes/poses.json) à une instance après setAnim('repos') : angles, écartement, allongement ; l'arme
// (objet) est placée à sa position dans le repère du personnage.
export function appliquerPose(perso, p, objet = null) {
  const o = lesOs(perso.root);
  const x = { R: o.R[0].position.x, L: o.L[0].position.x };
  for (const [cote, s] of [['R', -1], ['L', 1]]) {
    o[cote][0].position.x = p.epaules === 11.5 ? x[cote] : s * p.epaules;
    o[cote][0].scale.setScalar(p.bras);
    o[cote][2].scale.setScalar(1 / p.bras);
  }
  for (const [n, a] of Object.entries(p.angles ?? {})) perso.root.getObjectByName(n)?.rotation.set(a[0], a[1], a[2]);
  if (objet) {
    objet.position.set(...p.arme.position);
    objet.rotation.set(...p.arme.rotation);
    perso.root.add(objet);
  }
  perso.root.updateMatrixWorld(true);
}
