// Lot 9e — Armes portées par le joueur : emplacement permanent du Colt, emplacements achetés (donnée), chargeurs, réserves, rechargement,
// changement d'arme. Pur : le temps arrive en argument (secondes de jeu, figées par la pause), aucun hasard, aucune horloge, aucun stockage ;
// chaque fonction renvoie un nouvel état (l'argument n'est jamais modifié). La cadence reste celle de js/core/combat.js (stepWeapon).
// État : { emplacements: [{ id, chargeur, reserve, recharge }] (0 : l'arme de départ, permanente), actif, sortie, illimite } ;
// recharge : secondes déjà faites d'un rechargement en cours ou interrompu (null : aucun) ; sortie : { t, total, de } pendant un changement.
import { isNum, num } from '../vec.js';

export const RANGER = 0.4; // part du temps de sortie passée à ranger l'arme d'avant (le reste : sortir la nouvelle)
const plein = (e) => ({ id: e.id, chargeur: e.chargeur, reserve: e.reserve, recharge: null });

// table : lireTable() (js/core/armes/partie.js) ; options : { illimite } (munitions illimitées sans rechargement : débogage, référence de la trace).
export function creerInventaire(table, { illimite = false } = {}) {
  const depart = table?.armes?.[table?.armeDepart];
  return { emplacements: depart ? [plein(depart)] : [], actif: 0, sortie: null, illimite: illimite === true };
}

export const maxEmplacements = (table) => 1 + Math.max(0, Math.floor(num(table?.emplacementsAchetes, 1)));
export const armeActive = (state) => state?.emplacements?.[state.actif] ?? null;
// Arme montrée : pendant la première part d'un changement, l'arme qu'on range ; sinon l'arme active.
export const armeMontree = (state) => {
  const so = state?.sortie;
  if (!so || so.t >= so.total * RANGER) return armeActive(state);
  return so.ancien ? { id: so.ancien } : state.emplacements[so.de] ?? armeActive(state);
};
export const enRecharge = (state) => !state?.sortie && isNum(armeActive(state)?.recharge);
export const aSec = (state) => {
  const a = armeActive(state);
  return Boolean(a) && !state.illimite && a.chargeur <= 0 && a.reserve <= 0;
};
// Le joueur peut-il tirer ? Ni changement ni rechargement en cours, une cartouche au moins (ou munitions illimitées).
export const peutTirer = (state) => {
  const a = armeActive(state);
  return Boolean(a) && !state.sortie && !isNum(a.recharge) && (state.illimite || a.chargeur > 0);
};

const avecArme = (state, i, change) => ({ ...state, emplacements: state.emplacements.map((e, k) => (k === i ? { ...e, ...change } : e)) });

// Commence le changement vers l'emplacement `vers` (sinon le suivant) : un rechargement en cours est interrompu (gardé sur son emplacement, il
// reprend à la prochaine sortie de l'arme) ; durée : temps de sortie de l'arme qui arrive. Renvoie { state, change } (faux : rien à changer).
export function changerArme(state, table, vers = null) {
  const n = state.emplacements.length;
  if (n < 2) return { state, change: false };
  const cible = Number.isInteger(vers) ? vers : (state.actif + 1) % n;
  if (cible < 0 || cible >= n || cible === state.actif) return { state, change: false };
  const total = num(table?.armes?.[state.emplacements[cible].id]?.sortie, 0.5);
  return { state: { ...state, actif: cible, sortie: { t: 0, total, de: state.actif, ancien: null } }, change: true };
}

// Donne une arme (débogage, futur achat) : déjà portée : ses munitions restent, on la sort ; emplacement libre : ajoutée ; sinon elle remplace
// l'arme achetée tenue (ou la première achetée si le Colt est en main), jamais l'arme de départ. Elle arrive pleine et elle est sortie.
export function donnerArme(state, table, id) {
  const e = table?.armes?.[id];
  if (!e || e.active === false) return { state, change: false };
  const deja = state.emplacements.findIndex((x) => x.id === id);
  if (deja >= 0) return deja === state.actif ? { state, change: false } : changerArme(state, table, deja);
  let liste = state.emplacements;
  let i;
  if (liste.length < maxEmplacements(table)) {
    liste = [...liste, plein(e)];
    i = liste.length - 1;
  } else {
    i = state.actif > 0 ? state.actif : 1;
    liste = liste.map((x, k) => (k === i ? plein(e) : x));
  }
  const pose = { ...state, emplacements: liste };
  if (i !== state.actif) return changerArme(pose, table, i);
  // L'arme tenue est remplacée : on range l'ancienne, on sort la nouvelle.
  return { state: { ...pose, sortie: { t: 0, total: num(e.sortie, 0.5), de: i, ancien: state.emplacements[i].id } }, change: true };
}

// Remplit chargeurs et réserves de toutes les armes portées (débogage) ; un rechargement en cours s'arrête.
export const remplirMunitions = (state, table) => ({ ...state, emplacements: state.emplacements.map((x) => (table?.armes?.[x.id] ? plein(table.armes[x.id]) : x)) });
export const munitionsIllimitees = (state, on) => ({ ...state, illimite: on === true });

// Rechargement à la main : chargeur incomplet, réserve non vide, ni changement ni rechargement en cours.
export function recharger(state, table) {
  const a = armeActive(state);
  const e = table?.armes?.[a?.id];
  if (!a || !e || state.sortie || isNum(a.recharge) || state.illimite || a.chargeur >= e.chargeur || a.reserve <= 0) return { state, debut: false };
  return { state: avecArme(state, state.actif, { recharge: 0 }), debut: true };
}

// Un tir parti (la cadence l'a permis) : une cartouche de moins (sauf munitions illimitées).
export function tirer(state) {
  const a = armeActive(state);
  if (!a || state.illimite) return state;
  return avecArme(state, state.actif, { chargeur: Math.max(0, a.chargeur - 1) });
}

// Avance de dt (secondes de jeu, ≥ 0). Renvoie { state, evenements: [{ type: 'sortie' | 'rechargeDebut' | 'rechargeFin', id }] }.
// Chargeur vide et réserve non vide : le rechargement démarre tout seul ; il dure le temps de rechargement de l'arme, puis le chargeur se remplit
// autant que la réserve le permet (réserve illimitée : jamais à sec).
export function avancerInventaire(state, table, dt) {
  const step = Math.max(0, num(dt));
  const evenements = [];
  let s = state;
  if (s.sortie) {
    const t = s.sortie.t + step;
    if (t < s.sortie.total) return { state: { ...s, sortie: { ...s.sortie, t } }, evenements };
    s = { ...s, sortie: null };
    evenements.push({ type: 'sortie', id: armeActive(s)?.id ?? null });
  }
  const a = armeActive(s);
  const e = table?.armes?.[a?.id];
  if (!a || !e || s.illimite) return { state: s, evenements };
  if (!isNum(a.recharge) && a.chargeur <= 0 && a.reserve > 0) {
    s = avecArme(s, s.actif, { recharge: 0 });
    evenements.push({ type: 'rechargeDebut', id: a.id, auto: true });
    return { state: s, evenements };
  }
  if (isNum(a.recharge)) {
    const t = a.recharge + step;
    if (t < e.rechargement) return { state: avecArme(s, s.actif, { recharge: t }), evenements };
    const pris = Math.min(e.chargeur - a.chargeur, a.reserve);
    s = avecArme(s, s.actif, { recharge: null, chargeur: a.chargeur + pris, reserve: a.reserve === Infinity ? Infinity : a.reserve - pris });
    evenements.push({ type: 'rechargeFin', id: a.id });
  }
  return { state: s, evenements };
}

// Progression (0 à 1) du rechargement de l'arme active, ou null.
export function progressionRecharge(state, table) {
  const a = armeActive(state);
  if (!a || state.sortie || !isNum(a.recharge)) return null;
  return Math.min(1, a.recharge / Math.max(1e-6, num(table?.armes?.[a.id]?.rechargement, 1)));
}

// Texte des munitions « chargeur / réserve » (réserve illimitée : ∞) pour le HUD ; null sans arme.
export function texteMunitions(state) {
  const a = armeActive(state);
  if (!a) return null;
  return `${a.chargeur} / ${a.reserve === Infinity || state.illimite ? '∞' : a.reserve}`;
}
