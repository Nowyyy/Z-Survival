// Lot 9e — Armes en main dans la partie : table des armes (data/game/armes-partie.json), arme effective, calibrage. Pur : sans Three.js, DOM,
// horloge ni hasard ; les données arrivent en argument, jamais modifiées. Identifiants = ceux de data/armes/armes.json (modèle 3D, variante de
// armes-choix.json, visuel 2D visuelArme(id), poses de data/armes/poses.json) : aucun doublon.
import { parseColor } from '../color.js';
import { isNum, num } from '../vec.js';

export const STATS = Object.freeze(['degats', 'cadence', 'portee', 'dispersion', 'dispersionMouvement', 'vitesse', 'chargeur', 'rechargement', 'sortie', 'plombs']);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const pos = (v, d) => (isNum(v) && v > 0 ? v : d);

// Retour du propriétaire après le lot 9e : déroulé du rechargement, manœuvre après le tir, dernier tir, pièce qui tombe (voir le fichier).
const texte = (v) => (typeof v === 'string' && v !== '' ? v : null);
const part = (v) => (isNum(v) ? Math.min(1, Math.max(0, v)) : null);
function lireRecharge(r, rechargement) {
  const o = obj(r);
  if (o.type === 'balle') {
    const sons = obj(o.sons);
    const fin = isNum(o.fin) && o.fin >= 0 ? o.fin : 0;
    return { type: 'balle', poche: o.poche === 'une' ? 'une' : 'chaque', debut: isNum(o.debut) && o.debut >= 0 ? o.debut : 0, parBalle: pos(o.parBalle, 0.4), fin, finSon: isNum(o.finSon) && o.finSon >= 0 ? Math.min(o.finSon, fin) : 0, sons: { debut: texte(sons.debut), balle: texte(sons.balle), fin: texte(sons.fin) } };
  }
  const etapes = (Array.isArray(o.etapes) ? o.etapes : [])
    .map((x) => ({ t: part(obj(x).t), son: texte(obj(x).son), lacher: obj(x).lacher === true, siVide: obj(x).siVide === true, siReste: obj(x).siReste === true, geste: GESTES.includes(obj(x).geste) ? obj(x).geste : null }))
    .filter((x) => x.t !== null && x.t > 0)
    .sort((a, b) => a.t - b.t);
  return { type: 'chargeur', etapes, duree: rechargement };
}
function lireManoeuvre(m) {
  const o = obj(m);
  if (!isNum(o.duree) || o.duree <= 0) return null;
  // cles (partie J) : [[secondes depuis le son, cible]] dans l'ordre (gestes calés sur le son).
  const cles = (Array.isArray(o.cles) ? o.cles : []).filter((c) => Array.isArray(c) && isNum(c[0]) && typeof c[1] === 'string').map((c) => ({ t: c[0], cible: c[1] }));
  // verrou (partie L) : [[secondes depuis le son, levier relevé, culasse tirée]] (verrou animé du Kar98k).
  const verrou = (Array.isArray(o.verrou) ? o.verrou : []).filter((c) => Array.isArray(c) && c.length === 3 && c.every(isNum)).map((c) => ({ t: c[0], lift: c[1], back: c[2] }));
  return { debut: isNum(o.debut) && o.debut >= 0 ? o.debut : 0, duree: o.duree, son: texte(o.son), cles, verrou };
}
function lireLevier(l) {
  const o = obj(l);
  if (!Array.isArray(o.pos) || o.pos.length !== 3 || !o.pos.every(isNum)) return null;
  const v = obj(o.verrou);
  const verrou = Array.isArray(v.axe) && v.axe.length === 3 && v.axe.every(isNum) ? { axe: [...v.axe], angle: isNum(v.angle) ? v.angle : -80 } : null;
  return { main: o.main === 'droite' ? 'droite' : 'gauche', pos: [...o.pos], course: pos(o.course, 5), verrou };
}
const lirePiece = (p) => (Array.isArray(p) && p.length === 3 && p.every((v) => isNum(v) && v > 0) ? [...p] : null);
export const GESTES = Object.freeze(['retire', 'insere', 'pousse', 'degage', 'culasse', 'couvercle']);

// Une entrée lue : { id, categorie, palier, active, masse, prix, degats, cadence, portee, dispersion, dispersionMouvement, vitesse, chargeur,
// reserve (Infinity si null), rechargement, sortie, plombs, recharge, manoeuvre, dernierTir, piece, douille } ; une arme spéciale (active faux) garde
// seulement id, categorie, palier, prix.
function lireEntree(id, e) {
  const o = obj(e);
  const base = { id, categorie: typeof o.categorie === 'string' ? o.categorie : 'arme', palier: Number.isInteger(o.palier) && o.palier >= 0 ? o.palier : 0, active: o.active !== false, masse: pos(o.masse, 1), prix: isNum(o.prix) && o.prix >= 0 ? o.prix : null };
  if (!base.active) return base;
  const chargeur = Number.isInteger(o.chargeur) && o.chargeur >= 1 ? o.chargeur : 1;
  const recharge = lireRecharge(o.recharge, pos(o.rechargement, 1));
  const dt = obj(o.dernierTir);
  return {
    ...base,
    degats: pos(o.degats, 1),
    cadence: pos(o.cadence, 0.4),
    portee: pos(o.portee, 700),
    dispersion: isNum(o.dispersion) && o.dispersion >= 0 ? o.dispersion : 4,
    dispersionMouvement: isNum(o.dispersionMouvement) && o.dispersionMouvement >= 0 ? o.dispersionMouvement : 8,
    vitesse: pos(o.vitesse, 1),
    chargeur,
    reserve: o.reserve === null ? Infinity : Number.isInteger(o.reserve) && o.reserve >= 0 ? o.reserve : 0,
    // Balle par balle : le temps de rechargement (chargeur plein) découle du déroulé.
    rechargement: recharge.type === 'balle' ? recharge.debut + chargeur * recharge.parBalle + recharge.fin : pos(o.rechargement, 1),
    sortie: pos(o.sortie, 0.5),
    plombs: Number.isInteger(o.plombs) && o.plombs >= 1 ? o.plombs : 1,
    recharge,
    manoeuvre: lireManoeuvre(o.manoeuvre),
    dernierTir: o.dernierTir ? { son: texte(dt.son), lacher: dt.lacher === true } : null,
    piece: o.piece === true, // le chargeur lâché est celui du modèle de l'arme (maillageChargeur)
    levier: lireLevier(o.levier),
    douille: lirePiece(o.douille),
    apresRecharge: isNum(o.apresRecharge) && o.apresRecharge >= 0 ? o.apresRecharge : null, // délai propre à l'arme (sinon celui de la table)
  };
}

// Table : { armeDepart, emplacementsAchetes, ids (toutes, ordre du fichier), actives (utilisables), armes: { id: entrée } }.
export function lireTable(json) {
  const t = obj(json);
  const armes = {};
  for (const [id, e] of Object.entries(obj(t.armes))) if (!id.startsWith('_')) armes[id] = lireEntree(id, e);
  const ids = Object.keys(armes);
  const actives = ids.filter((id) => armes[id].active);
  const depart = actives.includes(t.armeDepart) ? t.armeDepart : actives[0] ?? null;
  return { armeDepart: depart, emplacementsAchetes: Number.isInteger(t.emplacementsAchetes) && t.emplacementsAchetes >= 0 ? t.emplacementsAchetes : 1, echellePieces: pos(t.echellePieces, 1), apresRecharge: isNum(t.apresRecharge) && t.apresRecharge >= 0 ? t.apresRecharge : 0, ids, actives, armes };
}

// Arme au format du jeu (celui de data/game/weapons.json → pistol, lu par player-stats.js, combat.js, projectile.js) : la base commune de
// weapons.json (vitesse et rayon de balle, éclair, laser, balles en vol, marge de visée) et les valeurs de l'entrée ; bouche : distance de la
// bouche du canon devant le centre du joueur (pose de l'arme), sinon celle de la base ; cote : décalage de la bouche sur le côté du joueur
// (muzzleSide, retour du propriétaire : les balles partent du bout du canon dessiné ; 0 sans pose).
export function armeJeu(entree, base, bouche = null, cote = 0) {
  const b = obj(base);
  const e = obj(entree);
  return { ...b, id: e.id, damage: e.degats, fireDelay: e.cadence, fireRange: e.portee, muzzleOffset: isNum(bouche) && bouche > 0 ? bouche : num(b.muzzleOffset, 26), muzzleSide: isNum(bouche) && bouche > 0 ? num(cote) : 0, plombs: e.plombs ?? 1, vitesse: e.vitesse ?? 1 };
}

// Paramètres des statistiques du joueur (player-stats.json) avec le cône de l'arme : demi-angle à l'arrêt (dispersion) et surcroît en mouvement
// (dispersionMouvement) remplacent precision.baseAngle et moveAngle ; les niveaux de précision s'y appliquent comme avant (copie, rien n'est modifié).
export function statsAvecArme(stats, entree) {
  const s = obj(stats);
  const p = obj(obj(s.stats).precision);
  return { ...s, stats: { ...obj(s.stats), precision: { ...p, baseAngle: num(entree?.dispersion, num(p.baseAngle)), moveAngle: num(entree?.dispersionMouvement, num(p.moveAngle)) } } };
}

// Temps de tir pour tuer un zombie de `vie` points : ⌈vie / (dégâts × plombs × part des plombs au but)⌉ × cadence (secondes ; le premier tir
// compte pour une cadence). touche : part des plombs qui touchent (0,75 pour plusieurs plombs, 1 pour une balle).
export function tempsPourTuer(entree, vie, touche = (entree?.plombs ?? 1) > 1 ? 0.75 : 1) {
  const coup = num(entree?.degats) * Math.max(1, num(entree?.plombs, 1)) * touche;
  if (!(coup > 0)) return Infinity;
  return Math.ceil(num(vie) / coup - 1e-9) * num(entree?.cadence);
}

// Grandeurs « lourdeur » d'après la masse réelle (kg) : vitesse, temps de sortie, surcroît de dispersion en mouvement (règle de la fiche
// Docs/ref/armes-en-main.md, arrondis à 0,01 et 0,1).
export const lourdeur = (masse) => ({
  vitesse: Math.round((1 - 0.02 * (num(masse, 1.1) - 1.1)) * 100) / 100,
  sortie: Math.round((0.3 + 0.07 * num(masse, 1.1)) * 100) / 100,
  dispersionMouvement: Math.round((8 + 0.45 * (num(masse, 1.1) - 1.1)) * 10) / 10,
});

// Palette des armes (jetons --arm-* de css/armes.css, une déclaration #rrggbb par ligne) lue dans le texte de la feuille : { nom: couleur de
// parseColor } (comme lirePalette de js/armes/rendu.js, sans charger la feuille dans la page de la partie).
export function paletteArmes(css) {
  const out = {};
  const re = /--arm-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  for (let m = re.exec(String(css ?? '')); m !== null; m = re.exec(String(css ?? ''))) {
    const c = parseColor(m[2]);
    if (c) out[m[1]] = c;
  }
  return out;
}

// Sons des armes (data/game/sons-armes.json) : recettes jouées en partie (la variante choisie de chaque arme et tous les sons qui ne sont pas un tir)
// et son de tir de chaque arme. Arme sans recette ni choix (le Colt) : le son « tir » de la partie. → { recettes, tir: { id: identifiant du son } }.
export function sonsChoisis(json, ids = []) {
  const o = obj(json);
  const recettes = Array.isArray(o.recettes) ? o.recettes.filter((r) => r && typeof r.id === 'string') : [];
  const par = new Map(recettes.map((r) => [r.id, r]));
  const tir = {};
  const garde = [];
  for (const id of ids) {
    const v = obj(o.choix)[id] === 'b' ? 'b' : 'a';
    const r = par.get(`tir-${id}-${v}`);
    tir[id] = r ? r.id : 'tir';
    if (r) garde.push(r);
  }
  // Rechargement, changement, culasses, pompe, chargeurs, ping… : toutes les recettes qui ne sont pas un tir (retour du propriétaire).
  for (const r of recettes) if (!r.id.startsWith('tir-')) garde.push(r);
  return { recettes: garde, tir };
}
