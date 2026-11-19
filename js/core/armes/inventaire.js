// Lot 9e — Armes portées par le joueur : emplacement permanent du Colt, emplacements achetés (donnée), chargeurs, réserves, rechargement,
// changement d'arme. Pur : le temps arrive en argument (secondes de jeu, figées par la pause), aucun hasard, aucune horloge, aucun stockage ;
// chaque fonction renvoie un nouvel état (l'argument n'est jamais modifié). La cadence reste celle de js/core/combat.js (stepWeapon).
// État : { emplacements: [{ id, chargeur, reserve, recharge, prevu, vide }] (0 : l'arme de départ, permanente), actif, sortie, illimite } ;
// prevu : cartouches à mettre une à une (rechargement « balle », fixé au début) ; vide : le chargeur était vide au début du rechargement ;
// recharge : secondes déjà faites d'un rechargement en cours ou interrompu (null : aucun) ; sortie : { t, ranger, total, de, ancien } pendant un
// changement (ranger : secondes passées à ranger l'arme d'avant ; total : ranger + sortir la nouvelle).
import { isNum, num } from '../vec.js';

// Retour du propriétaire après le lot 9e : ranger dépend de l'arme rangée, sortir de l'arme sortie (un fusil se range et se sort lentement,
// un pistolet vite). Le temps de maniement d'une arme (`sortie` de la table) se partage : RANGER pour la ranger, le reste pour la sortir.
export const RANGER = 0.5;
const maniement = (table, id) => num(table?.armes?.[id]?.sortie, 0.5);
// Changement de `ancienId` (rangé) vers `nouveauId` (sorti) : { t: 0, ranger, total }.
export const dureesChangement = (table, ancienId, nouveauId) => {
  const ranger = RANGER * maniement(table, ancienId);
  return { t: 0, ranger, total: ranger + (1 - RANGER) * maniement(table, nouveauId) };
};
const plein = (e) => ({ id: e.id, chargeur: e.chargeur, reserve: e.reserve, recharge: null, prevu: null, vide: false });

// table : lireTable() (js/core/armes/partie.js) ; options : { illimite } (munitions illimitées sans rechargement : débogage, référence de la trace).
export function creerInventaire(table, { illimite = false } = {}) {
  const depart = table?.armes?.[table?.armeDepart];
  return { emplacements: depart ? [plein(depart)] : [], actif: 0, sortie: null, illimite: illimite === true, attente: 0 };
}

export const maxEmplacements = (table) => 1 + Math.max(0, Math.floor(num(table?.emplacementsAchetes, 1)));
export const armeActive = (state) => state?.emplacements?.[state.actif] ?? null;
// Arme montrée : pendant la première part d'un changement, l'arme qu'on range ; sinon l'arme active.
export const armeMontree = (state) => {
  const so = state?.sortie;
  if (!so || so.t >= (isNum(so.ranger) ? so.ranger : so.total * RANGER)) return armeActive(state);
  return so.ancien ? { id: so.ancien } : state.emplacements[so.de] ?? armeActive(state);
};
export const enRecharge = (state) => !state?.sortie && isNum(armeActive(state)?.recharge);
export const aSec = (state) => {
  const a = armeActive(state);
  return Boolean(a) && !state.illimite && a.chargeur <= 0 && a.reserve <= 0;
};
// Le joueur peut-il tirer ? Ni changement ni rechargement en cours, ni le court délai qui suit un rechargement (partie M), une cartouche au
// moins (ou munitions illimitées).
export const peutTirer = (state) => {
  const a = armeActive(state);
  return Boolean(a) && !state.sortie && !isNum(a.recharge) && !(num(state.attente) > 0) && (state.illimite || a.chargeur > 0);
};
// Délai après un rechargement en cours (partie M : « laisse un léger délai à la fin du rechargement avant de pouvoir tirer »).
export const enAttente = (state) => !state?.sortie && num(state?.attente) > 0;
// Durée de ce délai : celle de l'arme (apresRecharge), sinon celle de la table.
const delaiApres = (table, e) => Math.max(0, num(e?.apresRecharge ?? table?.apresRecharge, 0));

const avecArme = (state, i, change) => ({ ...state, emplacements: state.emplacements.map((e, k) => (k === i ? { ...e, ...change } : e)) });

// Commence le changement vers l'emplacement `vers` (sinon le suivant) : un rechargement en cours est interrompu (gardé sur son emplacement, il
// reprend à la prochaine sortie de l'arme) ; durée : ranger l'arme tenue puis sortir la nouvelle (dureesChangement). Renvoie { state, change }.
export function changerArme(state, table, vers = null) {
  const n = state.emplacements.length;
  if (n < 2) return { state, change: false };
  const cible = Number.isInteger(vers) ? vers : (state.actif + 1) % n;
  if (cible < 0 || cible >= n || cible === state.actif) return { state, change: false };
  // Changement en cours (on range encore l'arme d'avant) : l'arme rangée reste celle qui est montrée.
  const tenue = armeMontree(state)?.id ?? state.emplacements[state.actif].id;
  return { state: { ...state, actif: cible, attente: 0, sortie: { ...dureesChangement(table, tenue, state.emplacements[cible].id), de: state.actif, ancien: null } }, change: true };
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
  return { state: { ...pose, attente: 0, sortie: { ...dureesChangement(table, state.emplacements[i].id, id), de: i, ancien: state.emplacements[i].id } }, change: true };
}

// Remplit chargeurs et réserves de toutes les armes portées (débogage) ; un rechargement en cours s'arrête.
export const remplirMunitions = (state, table) => ({ ...state, emplacements: state.emplacements.map((x) => (table?.armes?.[x.id] ? plein(table.armes[x.id]) : x)) });
export const munitionsIllimitees = (state, on) => ({ ...state, illimite: on === true });

// Rechargement à la main : chargeur incomplet, réserve non vide, ni changement ni rechargement en cours.
export function recharger(state, table) {
  const a = armeActive(state);
  const e = table?.armes?.[a?.id];
  if (!a || !e || state.sortie || isNum(a.recharge) || state.illimite || a.chargeur >= e.chargeur || a.reserve <= 0) return { state, debut: false };
  return { state: avecArme(state, state.actif, debutRecharge(a, e)), debut: true };
}

// Début d'un rechargement : secondes faites, cartouches prévues (balle par balle), chargeur vide ou non (étapes siVide, siReste).
const debutRecharge = (a, e) => ({ recharge: 0, prevu: e.recharge?.type === 'balle' ? Math.max(0, Math.min(e.chargeur - a.chargeur, a.reserve)) : null, vide: a.chargeur <= 0 });
// Durée du rechargement en cours de l'arme a (entrée e) : balle par balle, debut + prevu × parBalle + fin ; sinon le temps de rechargement.
export function dureeRecharge(a, e) {
  const r = e?.recharge;
  if (r?.type === 'balle') return r.debut + Math.max(0, num(a?.prevu, e.chargeur)) * r.parBalle + r.fin;
  return num(e?.rechargement, 1);
}
const franchi = (t0, t1, x) => t0 < x && x <= t1;

// Un tir parti (la cadence l'a permis) : une cartouche de moins (sauf munitions illimitées).
export function tirer(state) {
  const a = armeActive(state);
  if (!a || state.illimite) return state;
  return avecArme(state, state.actif, { chargeur: Math.max(0, a.chargeur - 1) });
}

// Avance de dt (secondes de jeu, ≥ 0). Renvoie { state, evenements: [{ type: 'sortie' | 'rechargeDebut' | 'rechargeEtape' | 'rechargeBalle'
// | 'rechargeFin', id, son?, lacher? }] } (son : recette de data/game/sons-armes.json ; lacher : la pièce de l'arme tombe au sol).
// Chargeur vide et réserve non vide : le rechargement démarre tout seul. Type « chargeur » : il dure le temps de rechargement de l'arme, puis
// le chargeur se remplit autant que la réserve le permet (réserve illimitée : jamais à sec) ; type « balle » : une cartouche à la fois.
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
  if (num(s.attente) > 0) s = { ...s, attente: Math.max(0, s.attente - step) };
  const a = armeActive(s);
  const e = table?.armes?.[a?.id];
  if (!a || !e || s.illimite) return { state: s, evenements };
  if (!isNum(a.recharge) && a.chargeur <= 0 && a.reserve > 0) {
    s = avecArme(s, s.actif, debutRecharge(a, e));
    evenements.push({ type: 'rechargeDebut', id: a.id, auto: true });
    return { state: s, evenements };
  }
  if (isNum(a.recharge)) {
    const t0 = a.recharge;
    const t1 = t0 + step;
    const r = e.recharge;
    const total = dureeRecharge(a, e);
    let { chargeur, reserve } = a;
    if (r?.type === 'balle') {
      // Retour du propriétaire : fusil à pompe et fusil à verrou se rechargent balle par balle (chaque cartouche compte dès qu'elle est mise :
      // un rechargement interrompu les garde).
      // Sons calés sur les gestes (partie J) : début dès le départ (0,05 s : verrou ouvert), fin au début du geste final (pompe, verrou fermé).
      const tDebut = Math.min(0.05, r.debut);
      if (tDebut > 0 && franchi(t0, t1, tDebut) && r.sons.debut) evenements.push({ type: 'rechargeEtape', id: a.id, son: r.sons.debut, lacher: false });
      for (let i = 1; i <= a.prevu; i += 1) {
        if (!franchi(t0, t1, r.debut + i * r.parBalle) || reserve <= 0 || chargeur >= e.chargeur) continue;
        chargeur += 1;
        reserve = reserve === Infinity ? Infinity : reserve - 1;
        evenements.push({ type: 'rechargeBalle', id: a.id, son: r.sons.balle, lacher: false });
      }
      const tFin = r.debut + a.prevu * r.parBalle + (r.finSon ?? 0); // après la dernière cartouche (Kar98k : le temps de reprendre le levier)
      if (r.fin > 0 && franchi(t0, t1, tFin) && r.sons.fin) evenements.push({ type: 'rechargeEtape', id: a.id, son: r.sons.fin, lacher: false });
      if (t1 < total) return { state: avecArme(s, s.actif, { recharge: t1, chargeur, reserve }), evenements };
      s = { ...avecArme(s, s.actif, { recharge: null, prevu: null, vide: false, chargeur, reserve }), attente: delaiApres(table, e) };
      evenements.push({ type: 'rechargeFin', id: a.id, son: r.fin > 0 ? null : r.sons.fin });
      return { state: s, evenements };
    }
    // Chargeur : étapes du déroulé (chargeur retiré qui tombe, chargeur remis, culasse armée si l'arme était vide…).
    for (const et of r?.etapes ?? []) {
      if (!franchi(t0, t1, et.t * total) || (et.siVide && !a.vide) || (et.siReste && a.vide)) continue;
      evenements.push({ type: 'rechargeEtape', id: a.id, son: et.son, lacher: et.lacher });
    }
    if (t1 < total) return { state: avecArme(s, s.actif, { recharge: t1 }), evenements };
    const pris = Math.min(e.chargeur - a.chargeur, a.reserve);
    s = { ...avecArme(s, s.actif, { recharge: null, prevu: null, vide: false, chargeur: a.chargeur + pris, reserve: a.reserve === Infinity ? Infinity : a.reserve - pris }), attente: delaiApres(table, e) };
    evenements.push({ type: 'rechargeFin', id: a.id, son: null });
  }
  return { state: s, evenements };
}

// Progression (0 à 1) du rechargement de l'arme active, ou null.
export function progressionRecharge(state, table) {
  const a = armeActive(state);
  if (!a || state.sortie || !isNum(a.recharge)) return null;
  return Math.min(1, a.recharge / Math.max(1e-6, dureeRecharge(a, table?.armes?.[a.id])));
}

// Geste du rechargement en cours (dessin) : { p (progression), balle (vrai : balle par balle), geste (0 à 1 : main au point du geste) } ou null.
// Balle par balle : un aller-retour de la main par cartouche ; chargeur : un seul geste au milieu du rechargement.
export function gesteRecharge(state, table) {
  const a = armeActive(state);
  const e = table?.armes?.[a?.id];
  const p = progressionRecharge(state, table);
  if (p === null || !e) return null;
  const r = e.recharge;
  if (r?.type === 'balle') {
    const u = (a.recharge - r.debut) / r.parBalle;
    const geste = u > 0 && u < a.prevu ? Math.sin((u % 1) * Math.PI) : 0;
    return { p, balle: true, geste };
  }
  return { p, balle: false, geste: p > 0.35 && p < 0.75 ? Math.sin(((p - 0.35) / 0.4) * Math.PI) : 0 };
}

// Texte des munitions « chargeur / réserve » (réserve illimitée : ∞) pour le HUD ; null sans arme.
export function texteMunitions(state) {
  const a = armeActive(state);
  if (!a) return null;
  return `${a.chargeur} / ${a.reserve === Infinity || state.illimite ? '∞' : a.reserve}`;
}
