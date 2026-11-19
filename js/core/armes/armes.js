// Lot 9c — Armes : lecture des données (data/armes/armes.json), variantes, choix du propriétaire (data/armes/armes-choix.json),
// maillage d'une arme dans une pose ('main' : tenue ; 'caisse' : posée sur le côté), budgets. Pur : aucun Three.js, aucun DOM ;
// aucune exception sur des entrées inattendues (valeur par défaut). Les statistiques de jeu (dégâts, cadence, prix) n'existent pas ici.
import { maillage, matriceRotation } from './geometrie.js';
import { MODELES } from './modeles.js';
import { rectTuile } from './atlas.js';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v, d) => (Number.isFinite(v) ? v : d);
const borne = (v, a, b) => Math.max(a, Math.min(b, v));
const str = (v, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d);

export const CLASSES = Object.freeze({ poing: 'epaule', epaule: 'epaule', lourde: 'lourde' });
export const SPECIALES = Object.freeze(['panzerschreck', 'm2lanceflammes']);
// Rôle de matière → tuile de l'atlas, par défaut (une variante remplace ce qu'elle veut).
export const MATIERES_DEFAUT = Object.freeze({
  metal: 'bruni', metal2: 'bruni', bois: 'noyer', poignee: 'noyer', cuir: 'cuir', toile: 'toile', laiton: 'laiton',
  peinture: 'olive', peinture2: 'olive', perfore: 'perfore', caoutchouc: 'caoutchouc', noir: 'caoutchouc',
});
export const TEINTE_NOIR = Object.freeze([0.35, 0.35, 0.35]);

// Données normalisées : { echelle, budgets, armes: [{ id, nom, genre, classe, dimensions, dos, variantes: [{ id, nom, description, matieres,
// teintes, options }] }], caisses, approche }. Arme sans modèle connu ou sans variante : ignorée (et signalée dans `ecarts`).
export function lireArmes(json) {
  const j = isObj(json) ? json : {};
  const e = isObj(j.echelle) ? j.echelle : {};
  // Retours du propriétaire (lot 9c-G) : lisibilite = facteur de longueur (toutes les armes, proportions entre elles gardées) ; epaisseur =
  // facteur des dimensions fines des pièces (sous seuilEpaisseur mm : canons, crosses, chargeurs, plaques), sans allonger les pièces longues ;
  // largeur = facteur en x de l'arme tenue (vue de dessus : la caméra est loin), sans changer son profil.
  const echelle = {
    unitesParMetre: num(e.unitesParMetre, 35), lisibilite: borne(num(e.lisibilite, 1), 0.5, 3), epaisseur: borne(num(e.epaisseur, 1), 1, 3),
    largeur: borne(num(e.largeur, 1), 1, 4),
    seuilEpaisseur: borne(num(e.seuilEpaisseur, 60), 0, 500),
  };
  const b = isObj(j.budgets) ? j.budgets : {};
  const budgets = { epaule: num(b.epaule, 400), lourde: num(b.lourde, 700), caisse: num(b.caisse, 300), texture: num(b.texture, 256) };
  const ecarts = [];
  const armes = [];
  for (const a of Array.isArray(j.armes) ? j.armes : []) {
    const id = str(a?.id);
    if (!MODELES[id]) {
      ecarts.push(`arme sans modèle : ${id || '?'}`);
      continue;
    }
    const variantes = (Array.isArray(a.variantes) ? a.variantes : []).filter((v) => str(v?.id)).map((v) => ({
      id: str(v.id), nom: str(v.nom, v.id), description: str(v.description),
      matieres: { ...MATIERES_DEFAUT, ...(isObj(v.matieres) ? v.matieres : {}) },
      teintes: isObj(v.teintes) ? v.teintes : {},
      options: isObj(v.options) ? v.options : {},
    }));
    if (!variantes.length) {
      ecarts.push(`arme sans variante : ${id}`);
      continue;
    }
    armes.push({
      id, nom: str(a.nom, id), genre: str(a.genre), classe: CLASSES[a.classe] ? a.classe : 'epaule',
      dimensions: isObj(a.dimensions) ? a.dimensions : {}, longueurReelle: num(a.dimensions?.longueur, 0),
      dos: isObj(a.dos) ? a.dos : null, prises: lirePrises(a.prises), variantes,
      // Exception décidée par le propriétaire (lot 9c-Q, « passer le Colt à ×1,2 ») : taille propre qui remplace le facteur commun.
      taille: Number.isFinite(a.taille) ? borne(a.taille, 0.5, 3) : null,
    });
  }
  return { echelle, budgets, armes, caisses: Array.isArray(j.caisses) ? j.caisses : [], approche: isObj(j.approche) ? j.approche : {}, ecarts };
}

// Prises (poses du propriétaire, data/armes/poses.json) : pose de tenue et points en mm dans le repère de l'arme : droite (paume droite sur
// la poignée), gauche (paume gauche ; null : main libre), crosse (plaque de couche, ou point du tube posé sur l'épaule ; null : aucun) ;
// contactGauche : 'dessous' (sous le fût) ou 'cote' (poignée avant verticale) : côté où la paume gauche se pose contre l'arme.
export const TENUES = Object.freeze(['pistolet', 'epaule', 'hanche', 'sur-epaule']);
const point = (p) => (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) ? [...p] : null);
function lirePrises(p) {
  const o = isObj(p) ? p : {};
  return { tenue: TENUES.includes(o.tenue) ? o.tenue : 'pistolet', droite: point(o.droite) ?? [0, 0, 0], gauche: point(o.gauche), crosse: point(o.crosse), contactGauche: o.contactGauche === 'cote' ? 'cote' : 'dessous' };
}

// Échelle choisie (fichier de choix ou curseurs de l'atelier) appliquée aux données : nouvel objet, les données d'origine ne changent pas.
export function avecEchelle(donnees, choixEchelle) {
  const c = isObj(choixEchelle) ? choixEchelle : {};
  const e = { ...donnees.echelle };
  if (Number.isFinite(c.longueur)) e.lisibilite = borne(c.longueur, 0.5, 3);
  if (Number.isFinite(c.epaisseur)) e.epaisseur = borne(c.epaisseur, 1, 3);
  if (Number.isFinite(c.largeur)) e.largeur = borne(c.largeur, 1, 4);
  return { ...donnees, echelle: e };
}

export const armeParId = (donnees, id) => donnees.armes.find((a) => a.id === id) ?? null;
export const varianteDe = (arme, id) => arme?.variantes.find((v) => v.id === id) ?? arme?.variantes[0] ?? null;
export const budgetDe = (donnees, arme) => (arme?.classe === 'lourde' ? donnees.budgets.lourde : donnees.budgets.epaule);

// Choix du propriétaire : { variantes: { arme: variante }, armesSpeciales: [...] } (les deux gardées : elles ne serviront pas au même
// endroit ; l'ancien armeSpeciale, une seule, est encore lu) ; arme ou variante inconnue : défaut (première variante) ; aucune arme spéciale
// valable : la première de SPECIALES. Renvoie { variantes (toutes les armes), armesSpeciales, ecarts }.
export function lireChoix(donnees, choix) {
  const c = isObj(choix) ? choix : {};
  const v = isObj(c.variantes) ? c.variantes : {};
  const ecarts = [];
  const variantes = {};
  for (const a of donnees.armes) {
    const voulu = v[a.id];
    const ok = typeof voulu === 'string' && a.variantes.some((x) => x.id === voulu);
    if (voulu !== undefined && !ok) ecarts.push(`variante inconnue pour ${a.id} : ${String(voulu)}`);
    variantes[a.id] = ok ? voulu : a.variantes[0].id;
  }
  for (const k of Object.keys(v)) if (!armeParId(donnees, k)) ecarts.push(`arme inconnue : ${k}`);
  const dispo = SPECIALES.filter((s) => armeParId(donnees, s));
  const voulues = Array.isArray(c.armesSpeciales) ? c.armesSpeciales : c.armeSpeciale !== undefined ? [c.armeSpeciale] : [];
  for (const s of voulues) if (!dispo.includes(s)) ecarts.push(`arme spéciale inconnue : ${String(s)}`);
  if (c.armesSpeciales !== undefined && !Array.isArray(c.armesSpeciales)) ecarts.push('armes spéciales illisibles');
  const gardees = dispo.filter((s) => voulues.includes(s));
  const armesSpeciales = gardees.length ? gardees : dispo.slice(0, 1);
  let echelle = null;
  if (c.echelle !== undefined) {
    const e = isObj(c.echelle) ? c.echelle : {};
    const ok = (x, a, b2) => Number.isFinite(x) && x >= a && x <= b2;
    echelle = {};
    if (ok(e.longueur, 0.5, 3)) echelle.longueur = e.longueur;
    else if (e.longueur !== undefined) ecarts.push(`échelle de longueur invalide : ${String(e.longueur)}`);
    if (ok(e.epaisseur, 1, 3)) echelle.epaisseur = e.epaisseur;
    else if (e.epaisseur !== undefined) ecarts.push(`échelle d'épaisseur invalide : ${String(e.epaisseur)}`);
    if (ok(e.largeur, 1, 4)) echelle.largeur = e.largeur;
    else if (e.largeur !== undefined) ecarts.push(`échelle de largeur invalide : ${String(e.largeur)}`);
    if (!isObj(c.echelle)) ecarts.push('échelle illisible');
  }
  return { variantes, armesSpeciales, echelle, ecarts };
}

// Pièces d'une arme dans une pose. 'main' : groupe « dos » déplacé de arme.dos.main (mm, repère de l'arme) ; 'caisse' : de arme.dos.caisse.
// 'seule' : sans le groupe « dos » ni le tuyau (longueur de la lance seule).
// options : { epaisseur (facteur des dimensions fines), seuil (mm), dos (décalage du groupe « dos », remplace arme.dos[pose]),
// lacet (degrés : le groupe « dos » tourne autour de son centre, avec le buste de la tenue de l'atelier), bretelle (positions [x, y, z] en mm
// de chaque section de la bretelle, calculées par la tenue de l'atelier : elle passe contre le bras au lieu de le traverser), sansBretelle
// (sans la bretelle : la main se pose sur l'arme, jamais sur la bretelle) }.
export function piecesArme(arme, variante, pose = 'main', { epaisseur = 1, seuil = 60, dos, lacet = 0, bretelle, sansBretelle = false, chargeur = false, verrou = false } = {}) {
  const f = MODELES[arme?.id];
  if (!f) return [];
  const dec = Array.isArray(dos) ? dos : arme.dos?.[pose === 'caisse' ? 'caisse' : 'main'];
  // chargeur (retour du propriétaire après le lot 9e) : vrai, seulement les pièces du chargeur (cachées comprises) ; 'sans', l'arme sans son
  // chargeur (retiré pendant le rechargement) ; sinon l'arme entière, jamais les pièces cachées.
  const toutes = f(arme.dimensions ?? {}, variante?.options ?? {}, { dos: Array.isArray(dec) ? dec.map((v) => num(v, 0)) : undefined });
  // verrou (partie L) : vrai, seulement les pièces du verrou ; 'sans', l'arme sans elles (le verrou est dessiné à part et animé).
  const parVerrou = verrou === true ? toutes.filter((p) => p.verrou) : verrou === 'sans' ? toutes.filter((p) => !p.verrou) : toutes;
  const brutes = chargeur === true ? parVerrou.filter((p) => p.chargeur) : chargeur === 'sans' ? parVerrou.filter((p) => !p.chargeur) : parVerrou.filter((p) => !p.seulChargeur);
  const epaisses = epaisseur > 1 ? brutes.map((p) => epaissir(p, epaisseur, seuil)) : brutes;
  const a = (num(lacet, 0) * Math.PI) / 180;
  const pieces = !a ? epaisses : epaisses.map((p) => {
    if (p.groupe !== 'dos') return p;
    const [x, y, z] = p.pos ?? [0, 0, 0];
    const r = p.rot ?? [0, 0, 0];
    return { ...p, pos: [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)], rot: [r[0], r[1] + num(lacet, 0), r[2]] };
  });
  let res = pieces;
  if (sansBretelle) res = res.filter((p) => p.groupe !== 'bretelle');
  else if (Array.isArray(bretelle)) {
    res = res.map((p) => (p.groupe === 'bretelle' && p.sections?.length === bretelle.length
      ? { ...p, sections: p.sections.map((x, i) => ({ ...x, x: num(bretelle[i]?.[0], x.x), y: num(bretelle[i]?.[1], x.y), z: num(bretelle[i]?.[2], x.z) })) }
      : p));
  }
  if (pose === 'seule') return res.filter((p) => p.groupe !== 'dos' && p.groupe !== 'tuyau');
  if (!Array.isArray(dec)) return res;
  return res.map((p) => (p.groupe === 'dos' ? { ...p, pos: [(p.pos?.[0] ?? 0) + num(dec[0], 0), (p.pos?.[1] ?? 0) + num(dec[1], 0), (p.pos?.[2] ?? 0) + num(dec[2], 0)] } : p));
}

// Épaissit une pièce : chaque dimension transversale sous le seuil (mm ; diamètre pour un tube) est multipliée par k ; ni la longueur
// des pièces (l, tubes) ni les positions ne changent.
export function epaissir(p, k, seuil) {
  const f = (d) => (Number.isFinite(d) && d < seuil ? d * k : d);
  if (p.forme === 'boite') return { ...p, w: f(p.w), h: f(p.h) }; // l (le long de l'arme) : jamais, l'arme ne s'allonge pas
  if (p.forme === 'tube') {
    const g = (r) => (Number.isFinite(r) && 2 * r < seuil ? r * k : r);
    return { ...p, r: g(p.r), ...(Number.isFinite(p.r2) ? { r2: g(p.r2) } : {}) };
  }
  if (p.forme === 'profil') return { ...p, e: f(p.e) };
  if (p.forme === 'loft') return { ...p, sections: p.sections.map((x) => ({ ...x, w: f(x.w), h: f(x.h) })) };
  return p;
}

// Facteur de taille d'une arme : le facteur commun (curseur « Taille des armes »), sauf taille propre (Colt M1911 : ×1,2, décision du propriétaire).
export const tailleArme = (donnees, arme) => arme?.taille ?? donnees.echelle.lisibilite;

// Unités du jeu par millimètre (arme : sa taille propre si elle en a une).
export const echelleJeu = (donnees, arme) => (donnees.echelle.unitesParMetre / 1000) * tailleArme(donnees, arme);

// Sections de la bretelle (mm, épaissies comme au rendu : { x, y, z, w, h }), ou null si la variante n'en a pas.
export function sectionsBretelle(donnees, arme, variante) {
  const p = piecesArme(arme, variante ?? varianteDe(arme), 'main', { epaisseur: donnees.echelle.epaisseur ?? 1, seuil: donnees.echelle.seuilEpaisseur ?? 60 })
    .find((x) => x.groupe === 'bretelle' && x.forme === 'loft');
  return p ? p.sections.map((s) => ({ x: s.x ?? 0, y: s.y ?? 0, z: s.z, w: s.w, h: s.h })) : null;
}

// Maillage d'une arme (unités du jeu). options : { pose ('main' | 'caisse' | 'seule'), echelle (remplace celle des données), dos, lacet, bretelle, sansBretelle,
// enJeu (vrai : largeur vue de dessus appliquée, vue de la caméra du jeu seulement) }.
// dos : décalage (mm) du groupe « dos » qui remplace celui des données (réservoirs placés sur le dos par la tenue de l'atelier).
export function maillageArme(donnees, arme, variante, { pose = 'main', echelle, dos, lacet, bretelle, sansBretelle = false, enJeu = false, sansChargeur = false, verrou = false } = {}) {
  const v = variante ?? varianteDe(arme);
  const mat = v?.matieres ?? MATIERES_DEFAUT;
  const opts = { epaisseur: donnees.echelle.epaisseur ?? 1, seuil: donnees.echelle.seuilEpaisseur ?? 60, dos, lacet, bretelle, sansBretelle, verrou, ...(sansChargeur ? { chargeur: 'sans' } : {}) };
  // Largeur vue de dessus (lot 9c-G ; retour : « seulement en jeu ») : l'arme tenue s'élargit en x autour de son plan de visée, dans la vue
  // de la caméra du jeu seulement (enJeu) ; jamais posée (couchée : profil vu de dessus) ni les réservoirs portés et leur tuyau.
  const sx = pose === 'caisse' || !enJeu ? 1 : donnees.echelle.largeur ?? 1;
  const m = maillage(piecesArme(arme, v, ['caisse', 'seule'].includes(pose) ? pose : 'main', opts), {
    etirer: (p) => (p.groupe === 'dos' || p.groupe === 'tuyau' ? 1 : sx),
    echelle: Number.isFinite(echelle) ? echelle : echelleJeu(donnees, arme),
    tuile: (role) => rectTuile(mat[role] ?? MATIERES_DEFAUT[role] ?? 'bruni'),
    teinte: (role) => {
      const t = v?.teintes?.[role];
      if (Array.isArray(t) && t.length >= 3) return t.map((x) => num(x, 1));
      return role === 'noir' ? TEINTE_NOIR : [1, 1, 1];
    },
  });
  return { ...m, longueur: m.bornes.max[2] - m.bornes.min[2], largeur: m.bornes.max[0] - m.bornes.min[0], hauteur: m.bornes.max[1] - m.bornes.min[1] };
}

// Retour du propriétaire après le lot 9e : chargeur de l'arme (mêmes pièces, matières, épaisseur et largeur que l'arme tenue en partie) pour
// le chargeur qui tombe au sol ; positions recentrées sur le milieu du chargeur. → { positions, normals, uvs, colors, centre (milieu du
// chargeur dans le repère de l'arme tenue, unités du jeu), dims } ou null (arme sans chargeur : Kar98k, Winchester).
export function maillageChargeur(donnees, arme, variante) {
  const v = variante ?? varianteDe(arme);
  const mat = v?.matieres ?? MATIERES_DEFAUT;
  const pieces = piecesArme(arme, v, 'main', { epaisseur: donnees.echelle.epaisseur ?? 1, seuil: donnees.echelle.seuilEpaisseur ?? 60, chargeur: true });
  if (!pieces.length) return null;
  const sx = donnees.echelle.largeur ?? 1;
  const m = maillage(pieces, {
    etirer: () => sx,
    echelle: echelleJeu(donnees, arme),
    tuile: (role) => rectTuile(mat[role] ?? MATIERES_DEFAUT[role] ?? 'bruni'),
    teinte: (role) => {
      const t = v?.teintes?.[role];
      if (Array.isArray(t) && t.length >= 3) return t.map((x) => num(x, 1));
      return role === 'noir' ? TEINTE_NOIR : [1, 1, 1];
    },
  });
  const centre = [0, 1, 2].map((c) => (m.bornes.min[c] + m.bornes.max[c]) / 2);
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 1) positions[i] = m.positions[i] - centre[i % 3];
  return { ...m, positions, centre, dims: [0, 1, 2].map((c) => m.bornes.max[c] - m.bornes.min[c]) };
}

// Pose « posée sur le côté » (côté droit vers le haut) : rotation de −90° autour de z ; renvoie un maillage tourné, le bas posé à y = 0
// et centré en x et z (repère de la caisse).
export function coucher(m) {
  const r = matriceRotation([0, 0, -90]);
  const n = m.positions.length / 3;
  const positions = new Float32Array(m.positions.length);
  const normals = new Float32Array(m.normals.length);
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i += 1) {
    for (const [src, dst] of [[m.positions, positions], [m.normals, normals]]) {
      const x = src[i * 3];
      const y = src[i * 3 + 1];
      const z = src[i * 3 + 2];
      dst[i * 3] = r[0] * x + r[1] * y + r[2] * z;
      dst[i * 3 + 1] = r[3] * x + r[4] * y + r[5] * z;
      dst[i * 3 + 2] = r[6] * x + r[7] * y + r[8] * z;
    }
    for (let c = 0; c < 3; c += 1) {
      mn[c] = Math.min(mn[c], positions[i * 3 + c]);
      mx[c] = Math.max(mx[c], positions[i * 3 + c]);
    }
  }
  const off = [-(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2];
  for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) positions[i * 3 + c] += off[c];
  return { ...m, positions, normals, bornes: { min: [mn[0] + off[0], 0, mn[2] + off[2]], max: [mx[0] + off[0], mx[1] + off[1], mx[2] + off[2]] } };
}

// Budget d'une arme : chaque variante, dans les deux poses ; { arme, budget, variantes: [{ id, triangles, ok }], ok }.
export function controleBudget(donnees, arme) {
  const budget = budgetDe(donnees, arme);
  const variantes = arme.variantes.map((v) => {
    const t = Math.max(maillageArme(donnees, arme, v, { pose: 'main' }).triangles, maillageArme(donnees, arme, v, { pose: 'caisse' }).triangles);
    return { id: v.id, triangles: t, ok: t <= budget };
  });
  return { arme: arme.id, budget, variantes, ok: variantes.every((v) => v.ok) };
}
