// Lot 9k — Modèle de l'équilibrage des armes (pur : aucune horloge, aucun hasard, aucun accès au DOM ; données passées en argument).
// Sert à scripts/equilibrage/armes.mjs (tableaux en texte) et aux tests qui gardent les bornes (tests/unit/equilibrage-armes.test.js).
//
// Aisance d'une arme à la vague v (définition du prompt du lot 9k) :
//   aisance brute = DPS soutenu utile ÷ (vie moyenne d'un zombie à v × zombies arrivant par seconde à v)
//   - DPS soutenu = dégâts d'un cycle (chargeur plein) ÷ durée du cycle : (chargeur − 1) × cadence + max(cadence, rechargement + délai après) ;
//     réserve comprise (la réserve finie se rachète) ; précision du joueur automatique (part des balles ou des plombs au but, mesurée) ;
//   - utile : les dégâts au-delà de la vie du zombie sont perdus (aucune perforation) : part utile = vie ÷ (coups nécessaires × dégâts d'un coup),
//     moyennée sur la composition de la vague (types) ; le fusil à pompe compte par plomb ;
//   - zombies arrivant par seconde = 1 ÷ intervalle d'apparition de la vague (wave-director.js), vie moyenne = Σ nombre × vie du type ÷ total.
//   aisance = aisance brute ÷ référence ; référence = moyenne des aisances brutes du Colt (sans équipement) aux vagues 1 à 10.
// L'équipement et les personnages ne donnent ni dégâts, ni cadence, ni précision (décision du propriétaire, lot 8h) : l'aisance est la même avec
// et sans eux. Leur effet est mesuré par le joueur automatique (scripts/equilibrage/joueur.mjs) et résumé par l'« aisance de survie » ci-dessous.
import { waveSpec, TYPES } from '../../js/core/waves.js';
import { lireTable } from '../../js/core/armes/partie.js';
import { statValues } from '../../js/core/player-stats.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// Vie, nombre et cadence d'arrivée d'une vague : { vague, total, intervalle, parSeconde, maxPresents, vies: { type: vie }, composition, vieMoyenne,
// demande (points de vie par seconde), degatsContact (dégâts d'un coup d'un marcheur), duree (secondes d'apparition au rythme nominal) }.
export function vague(v, waves, enemies) {
  const spec = waveSpec(v, waves);
  const base = num(enemies?.zombie?.health, 50);
  const vies = {};
  let somme = 0;
  for (const t of TYPES) {
    vies[t] = base * num(enemies?.variants?.[t]?.hpMul, 1) * spec.hpMul;
    somme += vies[t] * num(spec.composition[t]);
  }
  const vieMoyenne = somme / Math.max(1, spec.total);
  return {
    vague: v, total: spec.total, intervalle: spec.spawnInterval, parSeconde: 1 / spec.spawnInterval, maxPresents: spec.maxConcurrent, renforcee: spec.reinforced,
    hpMul: spec.hpMul, vies, composition: { ...spec.composition }, vieMoyenne, demande: vieMoyenne / spec.spawnInterval,
    degatsContact: num(enemies?.zombie?.contactDamage, 10) * spec.damageMul, damageMul: spec.damageMul, speedMul: spec.speedMul, duree: spec.total * spec.spawnInterval,
  };
}

// Cycle d'une arme (entrée de lireTable) : { coups, duree, degats (par cycle, tous les plombs au but), dpsBrut }.
export function cycle(e, table) {
  const apres = num(e.apresRecharge ?? table?.apresRecharge, 0);
  const coups = e.chargeur;
  const duree = (coups - 1) * e.cadence + Math.max(e.cadence, e.rechargement + apres);
  const degats = coups * e.degats * e.plombs;
  return { coups, duree, degats, dpsBrut: degats / duree, apres };
}

// Coups nécessaires pour tuer un zombie de `vie` : balle unique, ⌈vie ÷ dégâts⌉ balles au but, donc ÷ précision balles tirées ; plusieurs plombs,
// ⌈vie ÷ (plombs × précision × dégâts)⌉ tirs (au moins un). Aucune perforation : un tir ne tue qu'un zombie (le pompe peut en toucher plusieurs :
// gain non compté).
export function coups(e, vie, precision = 1) {
  const p = Math.max(1e-6, precision);
  if (e.plombs > 1) return Math.max(1, Math.ceil(vie / (e.plombs * p * e.degats) - 1e-9));
  return Math.ceil(vie / e.degats - 1e-9) / p;
}

// Part utile des dégâts à la vague : vie ÷ dégâts tirés pour la tuer (balles ou plombs manqués compris), moyennée sur la composition.
export function partUtile(e, w, precision = 1) {
  let utile = 0;
  let tire = 0;
  for (const t of TYPES) {
    const n = num(w.composition[t]);
    if (!n) continue;
    utile += n * w.vies[t];
    tire += n * coups(e, w.vies[t], precision) * e.degats * e.plombs;
  }
  return tire > 0 ? utile / tire : 1;
}

// Aisance brute d'une arme à la vague v = DPS utile ÷ (vie moyenne × arrivées par seconde) = zombies tués par seconde ÷ zombies arrivant par
// seconde ; precision : part des balles (des plombs) au but, mesurée sur le joueur automatique.
export function aisanceBrute(e, table, w, precision = 1) {
  const c = cycle(e, table);
  return (c.dpsBrut * partUtile(e, w, precision)) / w.demande;
}

// Table lue + données : { table, ref (aisance brute moyenne du Colt aux vagues 1 à 10), aisance(id, v) }.
export function modele({ armesPartie, waves, enemies, precision = {} }) {
  const table = lireTable(armesPartie);
  const p = (id) => num(precision[id], num(precision.defaut, 1));
  const vagues = new Map();
  const w = (v) => {
    if (!vagues.has(v)) vagues.set(v, vague(v, waves, enemies));
    return vagues.get(v);
  };
  const depart = table.armes[table.armeDepart];
  let ref = 0;
  for (let v = 1; v <= 10; v += 1) ref += aisanceBrute(depart, table, w(v), p(depart.id));
  ref /= 10;
  const aisance = (id, v) => aisanceBrute(table.armes[id], table, w(v), p(id)) / ref;
  return { table, ref, vague: w, aisance, precision: p };
}

// --- Équipement de référence (lot 9k) ------------------------------------------------------------------------------------------------------
// Six objets rares au niveau 8 (milieu de 1 à 15), un par emplacement, et le Survivant (personnage de départ, sans effet aujourd'hui) :
// tête casque kevlar (vie), torse gilet pare-balles (vie), gants tactiques (réparation), pantalon treillis (régénération), bottes rangers
// (vitesse), accessoire trousse de secours (régénération). Niveaux effectifs : bonus + bonusParNiveau × (niveau − 1), additionnés, arrondis
// à l'entier inférieur une fois, bornés (règle de js/core/equipement.js, statistiquesEffectives).
export const EQUIPEMENT_REFERENCE = Object.freeze({
  rarete: 'rare', niveau: 8, personnage: 'survivant',
  objets: Object.freeze({ tete: 'casque-kevlar', torse: 'gilet-pare-balles', gants: 'gants-tactiques', pantalon: 'treillis', bottes: 'rangers', accessoire: 'trousse-secours' }),
});
export function niveauxReference(objetsJson, personnagesJson, playerStats, ref = EQUIPEMENT_REFERENCE) {
  const total = {};
  const add = (b, k = 1) => {
    for (const [s, v] of Object.entries(b ?? {})) total[s] = (total[s] ?? 0) + v * k;
  };
  for (const id of Object.values(ref.objets)) {
    const o = objetsJson.objets.find((x) => x.id === id);
    const d = o?.raretes?.[ref.rarete];
    if (!d) continue;
    add(d.bonus);
    add(d.bonusParNiveau, ref.niveau - 1);
  }
  const perso = personnagesJson.personnages.find((x) => x.id === ref.personnage);
  if (perso) {
    add(perso.capacite.effet);
    add(perso.capacite.effetParNiveau, (perso.niveau ?? 1) - 1);
  }
  const out = {};
  for (const [s, v] of Object.entries(total)) {
    const max = s === 'chutes' ? 5 : s === 'reparation' ? num(playerStats?.extra?.reparation?.maxLevel, 10) : num(playerStats?.maxLevel, 10);
    out[s] = Math.max(0, Math.min(max, Math.floor(v + 1e-9)));
  }
  return out;
}
// Paramètre ?lvl= des niveaux : « vie:10,regen:10,… ».
export const lvlParam = (niveaux) => Object.entries(niveaux).map(([k, v]) => `${k}:${v}`).join(',');

// Survie (pour l'aisance de survie) : vie maximale, soin par zombie tué, chutes (relevage à standUpHealFraction de la vie).
export function survie(niveaux, playerStats, player, playerDown) {
  const v = statValues(niveaux, playerStats);
  const vie = num(player?.health, 100) + v.hpBonus;
  return { vie, regen: v.regen, chutes: v.falls, releve: num(playerDown?.standUpHealFraction, 0.5), vitesse: v.speedMul, reparation: v.repairTime };
}
// Points de vie disponibles pendant une vague de n tués : vie + chutes × vie relevée + soins (au plus un soin par tué, jamais au-delà du
// maximum : borne haute).
export const pvVague = (s, tues) => s.vie * (1 + s.chutes * s.releve) + s.regen * tues;
// Aisance avec l'équipement de référence : aisance × FACTEUR_EQUIPEMENT, rapport mesuré des aisances critiques (scripts/equilibrage/critique.mjs :
// aisance brute en dessous de laquelle le joueur automatique meurt dans la vague, sans équipement ÷ avec l'équipement de référence ; vagues 15 et
// 35, graines 1 à 3, coups de 1 à 1,5 : environ 0,45 ÷ 0,32 = 1,4). L'équipement ne tue pas plus vite : il laisse survivre à une aisance 1,4 fois
// plus basse. Mesure résumée, vérifiée par le joueur automatique (manches gagnées).
export const FACTEUR_EQUIPEMENT = 1.4;

// Précision mesurée par le joueur automatique (scripts/equilibrage/joueur.mjs) : pour chaque arme, la part p des balles (des plombs) au but telle
// que les dégâts utiles prévus par le modèle (Σ dégâts tirés × partUtile(p), vague par vague) égalent les dégâts utiles mesurés (vie perdue
// par les zombies). resultats : champ `resultats` de la sortie du joueur ; profil : celui des parties lues (« nu » par défaut).
export function precisionMesuree(table, w, resultats, profil = 'nu') {
  const acc = {};
  for (const r of resultats.filter((x) => x.profil === profil)) for (const [v, x] of Object.entries(r.byWave)) for (const id of Object.keys(x.tire)) {
    if (!table.armes[id] || !x.tire[id]) continue;
    (acc[id] ??= { utile: 0, tirs: [] });
    acc[id].utile += x.utile[id] ?? 0;
    acc[id].tirs.push([w(Number(v)), x.tire[id]]);
  }
  const out = {};
  for (const [id, a] of Object.entries(acc)) {
    const e = table.armes[id];
    const prevu = (p) => a.tirs.reduce((s, [wv, t]) => s + t * partUtile(e, wv, p), 0);
    let lo = 0.01;
    let hi = 1;
    if (prevu(hi) <= a.utile) { out[id] = 1; continue; }
    for (let k = 0; k < 40; k += 1) { const mid = (lo + hi) / 2; if (prevu(mid) < a.utile) lo = mid; else hi = mid; }
    out[id] = Math.round(((lo + hi) / 2) * 1000) / 1000;
  }
  return out;
}
