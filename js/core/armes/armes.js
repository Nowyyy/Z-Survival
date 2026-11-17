// Lot 9c — Armes : lecture des données (data/armes/armes.json), variantes, choix du propriétaire (data/armes/armes-choix.json),
// maillage d'une arme dans une pose ('main' : tenue ; 'caisse' : posée sur le côté), budgets. Pur : aucun Three.js, aucun DOM ;
// aucune exception sur des entrées inattendues (valeur par défaut). Les statistiques de jeu (dégâts, cadence, prix) n'existent pas ici.
import { maillage, matriceRotation } from './geometrie.js';
import { MODELES } from './modeles.js';
import { rectTuile } from './atlas.js';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v, d) => (Number.isFinite(v) ? v : d);
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
  const echelle = { unitesParMetre: num(e.unitesParMetre, 35), lisibilite: Math.max(0.5, Math.min(3, num(e.lisibilite, 1))) };
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
      dos: isObj(a.dos) ? a.dos : null, variantes,
    });
  }
  return { echelle, budgets, armes, caisses: Array.isArray(j.caisses) ? j.caisses : [], approche: isObj(j.approche) ? j.approche : {}, ecarts };
}

export const armeParId = (donnees, id) => donnees.armes.find((a) => a.id === id) ?? null;
export const varianteDe = (arme, id) => arme?.variantes.find((v) => v.id === id) ?? arme?.variantes[0] ?? null;
export const budgetDe = (donnees, arme) => (arme?.classe === 'lourde' ? donnees.budgets.lourde : donnees.budgets.epaule);

// Choix du propriétaire : { variantes: { arme: variante }, armeSpeciale } ; arme ou variante inconnue : défaut (première variante),
// arme spéciale inconnue : la première de SPECIALES. Renvoie { variantes (toutes les armes), armeSpeciale, ecarts }.
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
  const armeSpeciale = dispo.includes(c.armeSpeciale) ? c.armeSpeciale : dispo[0] ?? null;
  if (c.armeSpeciale !== undefined && armeSpeciale !== c.armeSpeciale) ecarts.push(`arme spéciale inconnue : ${String(c.armeSpeciale)}`);
  return { variantes, armeSpeciale, ecarts };
}

// Pièces d'une arme dans une pose. 'main' : groupe « dos » déplacé de arme.dos.main (mm, repère de l'arme) ; 'caisse' : de arme.dos.caisse.
export function piecesArme(arme, variante, pose = 'main') {
  const f = MODELES[arme?.id];
  if (!f) return [];
  const pieces = f(arme.dimensions ?? {}, variante?.options ?? {});
  const dec = arme.dos?.[pose === 'caisse' ? 'caisse' : 'main'];
  if (!Array.isArray(dec)) return pieces;
  return pieces.map((p) => (p.groupe === 'dos' ? { ...p, pos: [(p.pos?.[0] ?? 0) + num(dec[0], 0), (p.pos?.[1] ?? 0) + num(dec[1], 0), (p.pos?.[2] ?? 0) + num(dec[2], 0)] } : p));
}

// Unités du jeu par millimètre.
export const echelleJeu = (donnees) => (donnees.echelle.unitesParMetre / 1000) * donnees.echelle.lisibilite;

// Maillage d'une arme (unités du jeu). options : { pose ('main' | 'caisse'), echelle (remplace celle des données) }.
export function maillageArme(donnees, arme, variante, { pose = 'main', echelle } = {}) {
  const v = variante ?? varianteDe(arme);
  const mat = v?.matieres ?? MATIERES_DEFAUT;
  const m = maillage(piecesArme(arme, v, pose), {
    echelle: Number.isFinite(echelle) ? echelle : echelleJeu(donnees),
    tuile: (role) => rectTuile(mat[role] ?? MATIERES_DEFAUT[role] ?? 'bruni'),
    teinte: (role) => {
      const t = v?.teintes?.[role];
      if (Array.isArray(t) && t.length >= 3) return t.map((x) => num(x, 1));
      return role === 'noir' ? TEINTE_NOIR : [1, 1, 1];
    },
  });
  return { ...m, longueur: m.bornes.max[2] - m.bornes.min[2], largeur: m.bornes.max[0] - m.bornes.min[0], hauteur: m.bornes.max[1] - m.bornes.min[1] };
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
