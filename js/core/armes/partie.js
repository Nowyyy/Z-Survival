// Lot 9e — Armes en main dans la partie : table des armes (data/game/armes-partie.json), arme effective, calibrage. Pur : sans Three.js, DOM,
// horloge ni hasard ; les données arrivent en argument, jamais modifiées. Identifiants = ceux de data/armes/armes.json (modèle 3D, variante de
// armes-choix.json, visuel 2D visuelArme(id), poses de data/armes/poses.json) : aucun doublon.
import { parseColor } from '../color.js';
import { isNum, num } from '../vec.js';

export const STATS = Object.freeze(['degats', 'cadence', 'portee', 'dispersion', 'dispersionMouvement', 'vitesse', 'chargeur', 'rechargement', 'sortie', 'plombs']);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const pos = (v, d) => (isNum(v) && v > 0 ? v : d);

// Une entrée lue : { id, categorie, palier, active, masse, prix, degats, cadence, portee, dispersion, dispersionMouvement, vitesse, chargeur,
// reserve (Infinity si null), rechargement, sortie, plombs } ; une arme spéciale (active faux) garde seulement id, categorie, palier, prix.
function lireEntree(id, e) {
  const o = obj(e);
  const base = { id, categorie: typeof o.categorie === 'string' ? o.categorie : 'arme', palier: Number.isInteger(o.palier) && o.palier >= 0 ? o.palier : 0, active: o.active !== false, masse: pos(o.masse, 1), prix: isNum(o.prix) && o.prix >= 0 ? o.prix : null };
  if (!base.active) return base;
  return {
    ...base,
    degats: pos(o.degats, 1),
    cadence: pos(o.cadence, 0.4),
    portee: pos(o.portee, 700),
    dispersion: isNum(o.dispersion) && o.dispersion >= 0 ? o.dispersion : 4,
    dispersionMouvement: isNum(o.dispersionMouvement) && o.dispersionMouvement >= 0 ? o.dispersionMouvement : 8,
    vitesse: pos(o.vitesse, 1),
    chargeur: Number.isInteger(o.chargeur) && o.chargeur >= 1 ? o.chargeur : 1,
    reserve: o.reserve === null ? Infinity : Number.isInteger(o.reserve) && o.reserve >= 0 ? o.reserve : 0,
    rechargement: pos(o.rechargement, 1),
    sortie: pos(o.sortie, 0.5),
    plombs: Number.isInteger(o.plombs) && o.plombs >= 1 ? o.plombs : 1,
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
  return { armeDepart: depart, emplacementsAchetes: Number.isInteger(t.emplacementsAchetes) && t.emplacementsAchetes >= 0 ? t.emplacementsAchetes : 1, ids, actives, armes };
}

// Arme au format du jeu (celui de data/game/weapons.json → pistol, lu par player-stats.js, combat.js, projectile.js) : la base commune de
// weapons.json (vitesse et rayon de balle, éclair, laser, balles en vol, marge de visée) et les valeurs de l'entrée ; bouche : distance de la
// bouche du canon devant le centre du joueur (pose de l'arme), sinon celle de la base.
export function armeJeu(entree, base, bouche = null) {
  const b = obj(base);
  const e = obj(entree);
  return { ...b, id: e.id, damage: e.degats, fireDelay: e.cadence, fireRange: e.portee, muzzleOffset: isNum(bouche) && bouche > 0 ? bouche : num(b.muzzleOffset, 26), plombs: e.plombs ?? 1, vitesse: e.vitesse ?? 1 };
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
