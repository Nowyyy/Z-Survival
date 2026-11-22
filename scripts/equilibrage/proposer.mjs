// Lot 9k — Générateur de la proposition d'équilibrage (partie B) : à partir des réglages ci-dessous (zombies, armes, cibles d'aisance), écrit
// les trois fichiers proposés, jamais lus par le jeu : data/game/armes-partie.proposition.json (table des armes complète, prix, rachat),
// data/game/waves.proposition.json et data/game/enemies.proposition.json (vie et coups des zombies ; nombres inchangés).
// Les dégâts des armes sont calculés (modele.mjs) pour tenir l'aisance visée à la vague d'achat, la précision venant du joueur automatique.
// Usage : node scripts/equilibrage/proposer.mjs [--precision résultats.json] [--zollars résultats.json (prix : part des Zollars en poche)]
import { readFileSync, writeFileSync } from 'node:fs';
import { lireTable } from '../../js/core/armes/partie.js';
import { aisanceBrute, modele, precisionMesuree, vague } from './modele.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : NaN; };

// --- Réglages proposés (provisoires) ------------------------------------------------------------------------------------------------------
export const REGLAGES = {
  // Retours du propriétaire après la partie B : « un minimum dur, le joueur meurt et améliore son personnage avec les objets », « progression à
  // la Archero : des dizaines d'essais pour réussir » ; armes : dégâts et prix seulement (chargeur, réserve, cadence, rechargement gardés) ;
  // leviers choisis : courbe de vie des zombies plus régulière (coups inchangés), joueur automatique qui répare (--repare), pompe et Kar98k
  // faibles assumés (leur cadence ne suit pas le rythme d'apparition : un zombie toutes les 1,3 s dès la 14, toutes les 0,9 s dès la 21).
  // Zombies : vie +10 % de la vie de base par manche jusqu'à la 20 (au lieu de +50 % jusqu'à la 9), puis ×1,04 par manche (au lieu de ×1,10 dès
  // la 10), plafond ×30 inchangé (jamais atteint avant la 40) ; nombres, coups, vitesses, apparitions inchangés.
  waves: { hp: { hpLinearPerRound: 0.1, hpExpStartRound: 21, hpExpFactor: 1.04, hpCap: 30 } },
  enemies: null,
  // Dégâts fixés d'après les mesures du joueur automatique qui répare (graines 1 à 6) : Colt 25 → 50 ; pompe et Kar98k gardés (plus de dégâts
  // n'y changent rien : la cadence les limite) ; Thompson 90 → 150.
  armes: {
    m1911: {},
    winchester1897: { vague: 11, degats: 55 },
    kar98k: { vague: 21, degats: 320 },
    thompson: { vague: 31, degats: 150 },
  },
  colt: { degats: 50 },
  // Précision du joueur automatique, mesurée sur l'état actuel et les essais (Colt 0,85, plombs du pompe 0,67, Kar98k 0,80, Thompson 0,80) ;
  // --precision la remplace par une nouvelle mesure.
  precision: { m1911: 0.85, winchester1897: 0.67, kar98k: 0.8, thompson: 0.8 },
  prix: { part: 0.5, rachat: 0.35 },
  // Achat sur la carte : touche (event.code ; F est le plein écran), portée du message (deux cases, comme les portes), son d'achat synthétisé
  // (recette au format de js/core/synth.js : bruit sourd du couvercle de la caisse, déclic du loquet, deux tintements métalliques).
  achat: {
    touche: 'KeyB', toucheLibelle: 'B', distance: 120,
    son: {
      id: 'arme-achat', category: 'tir', set: 'essentiel', sampleRate: 44100, duration: 0.7, variants: 1, seed: 909, loop: false, gainDb: -3,
      layers: [
        { type: 'noise', color: 'brown', start: 0, dur: 0.14, attack: 0.002, decay: 0.05, gain: 1.3, filter: { type: 'lowpass', freq: 260, q: 0.7 } },
        { type: 'osc', wave: 'sine', freq: [150, 70], sweepTime: 0.1, start: 0, dur: 0.16, attack: 0.002, decay: 0.06, gain: 0.7 },
        { type: 'noise', color: 'white', start: 0.012, dur: 0.012, attack: 0.0005, decay: 0.003, gain: 0.9, filter: { type: 'highpass', freq: 3000, q: 0.7 } },
        { type: 'ring', start: 0.1, dur: 0.4, partials: [{ freq: 2093, gain: 0.5, decay: 0.16 }, { freq: 3136, gain: 0.3, decay: 0.1 }, { freq: 4186, gain: 0.12, decay: 0.05 }] },
        { type: 'ring', start: 0.19, dur: 0.45, partials: [{ freq: 2637, gain: 0.55, decay: 0.2 }, { freq: 3951, gain: 0.3, decay: 0.12 }, { freq: 5274, gain: 0.1, decay: 0.05 }] },
      ],
      post: { saturation: 0, targetPeak: 0.8, fadeOut: 0.02 },
    },
  },
};
export const VAGUES_CLES = Object.freeze([1, 10, 11, 20, 21, 30, 31, 40]);

export function construire(reglages = REGLAGES, { precision = {}, zollars = null } = {}) {
  const waves = structuredClone(lire('data/game/waves.json'));
  waves._provisoire = `PROPOSITION du lot 9k (partie B), jamais lue par le jeu : vie des zombies (hp) seulement ; nombres, intervalles, présents, allures et types inchangés. ${waves._provisoire}`;
  if (reglages.waves?.hp) Object.assign(waves.hp, reglages.waves.hp);
  if (reglages.waves?.damage) Object.assign(waves.damage, reglages.waves.damage);
  const enemies = structuredClone(lire('data/game/enemies.json'));
  enemies._provisoire = `PROPOSITION du lot 9k (partie B), jamais lue par le jeu : coups des zombies (zombie.contactDamage) seulement ; vitesses, rayons, types inchangés. ${enemies._provisoire}`;
  if (reglages.enemies) Object.assign(enemies.zombie, reglages.enemies);
  const table = structuredClone(lire('data/game/armes-partie.json'));
  const A = table.armes;
  for (const [id, r] of Object.entries(reglages.armes)) {
    for (const k of ['cadence', 'chargeur', 'reserve', 'rechargement', 'dispersion']) if (r[k] !== undefined) A[id][k] = r[k];
    if (r.parBalle !== undefined) A[id].recharge.parBalle = r.parBalle;
  }
  A.m1911.degats = reglages.colt.degats;
  // Dégâts : plus petite valeur entière (pas de 1) dont l'aisance à la vague d'achat atteint la cible (le Colt fixe la référence).
  for (const [id, r] of Object.entries(reglages.armes)) {
    if (!r.vague) continue;
    if (Number.isFinite(r.degats)) { A[id].degats = r.degats; continue; } // dégâts fixés (mesurés)
    let lo = 1;
    let hi = 20000;
    const ais = (d) => {
      A[id].degats = d;
      const m = modele({ armesPartie: table, waves, enemies, precision });
      return m.aisance(id, r.vague);
    };
    // Cadence limitée (aucune perforation : une balle tue au plus un zombie) : cible hors d'atteinte → 97 % du maximum, signalé.
    const max = ais(hi);
    const but = Math.min(r.aisance, 0.97 * max);
    if (but < r.aisance) console.warn(`${id} : aisance ${r.aisance} hors d'atteinte à la vague ${r.vague} (au plus ${max.toFixed(2)}, cadence et rechargement) : ${but.toFixed(2)} visée`);
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ais(mid) >= but) hi = mid; else lo = mid; }
    A[id].degats = hi;
  }
  // Rechargement balle par balle : temps total d'après le déroulé (début + chargeur × parBalle + fin).
  for (const id of ['kar98k', 'winchester1897']) {
    const rc = A[id].recharge;
    A[id].rechargement = Math.round((rc.debut + A[id].chargeur * rc.parBalle + rc.fin) * 100) / 100;
  }
  // Prix : part des Zollars en poche du joueur automatique sans équipement au début de la vague d'achat (médiane), arrondie à 50 ; rachat : part du prix.
  if (zollars) {
    for (const [id, r] of Object.entries(reglages.armes)) {
      if (!r.vague) continue;
      // Joueur sans équipement ; s'il n'atteint pas la vague (Thompson), tous les profils qui l'atteignent.
      const de = (l) => l.map((x) => x.byWave[r.vague]?.zollarsDebut).filter(Number.isFinite);
      const nu = de(zollars.resultats.filter((x) => x.profil === 'nu'));
      const poche = med(nu.length ? nu : de(zollars.resultats));
      if (Number.isFinite(poche)) {
        A[id].prix = Math.max(50, Math.round((poche * reglages.prix.part) / 50) * 50);
        A[id].rachat = Math.max(10, Math.round((A[id].prix * reglages.prix.rachat) / 10) * 10);
      }
    }
  }
  table._provisoire = `PROPOSITION du lot 9k (partie B), jamais lue par le jeu : table complète proposée pour data/game/armes-partie.json (valeurs provisoires, choisies par le propriétaire au GO), générée par node scripts/equilibrage/proposer.mjs. Changements : dégâts et prix des quatre armes de la carte 1, rachat (nouveau : prix des munitions pleines à la même caisse), achat (touche, portée du message, son) ; chargeur, réserve, cadence, rechargement et dispersion inchangés (retour du propriétaire). ${table._provisoire}`;
  table.achat = structuredClone(reglages.achat);
  // Résumé (lu par l'atelier des armes, section « Caisses sur la carte ») : aisance aux vagues clés, référence, précision.
  const m = modele({ armesPartie: table, waves, enemies, precision });
  table._equilibrage = {
    _note: "Lot 9k, partie B : aisance (zombies tués par seconde ÷ zombies arrivant par seconde, rapportée au Colt sans équipement en moyenne des vagues 1 à 10), précision du joueur automatique ; calculé par scripts/equilibrage/proposer.mjs.",
    vagues: [...VAGUES_CLES], reference: Math.round(m.ref * 1000) / 1000, precision,
    armes: Object.fromEntries(['m1911', ...Object.keys(reglages.armes).filter((id) => reglages.armes[id].vague)].map((id) => [id, { vague: reglages.armes[id]?.vague ?? 1, aisance: Object.fromEntries(VAGUES_CLES.map((v) => [v, Math.round(m.aisance(id, v) * 100) / 100])) }])),
  };
  return { table, waves, enemies };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  // --precision résultats.json[,autre.json] : précision mesurée par le joueur automatique (parties sans équipement ; la dernière mesure d'une arme l'emporte).
  const precision = {};
  for (const pf of (opt('precision', '') || '').split(',').filter(Boolean)) {
    const j = lire(pf);
    const m0 = modele({ armesPartie: lire(j.armes), waves: j.waves ? lire(j.waves) : lire('data/game/waves.json'), enemies: j.enemies ? lire(j.enemies) : lire('data/game/enemies.json') });
    Object.assign(precision, precisionMesuree(m0.table, m0.vague, j.resultats));
  }
  for (const [id, v] of Object.entries(REGLAGES.precision)) precision[id] ??= v;
  Object.assign(precision, JSON.parse(opt('precision-fixe', '{}')));
  const zf = opt('zollars', null);
  // --reglages '{"colt":{"degats":35},"armes":{"m1911":{"cadence":0.35}}}' : réglages fusionnés (essais).
  const fusion = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? fusion(a[k] ?? {}, v) : v; return a; };
  const reglages = fusion(structuredClone(REGLAGES), JSON.parse(opt('reglages', '{}')));
  const prixFixes = JSON.parse(opt('prix-essai', 'null')); // { id: prix } : prix d'essai (avant le calcul des prix)
  const r = construire(reglages, { precision, zollars: zf ? lire(zf) : null });
  if (prixFixes) for (const [id, p] of Object.entries(prixFixes)) { r.table.armes[id].prix = p; r.table.armes[id].rachat = Math.round((p * reglages.prix.rachat) / 10) * 10; }
  const dossier = opt('dossier', 'data/game/');
  writeFileSync(`${dossier}armes-partie.proposition.json`, `${JSON.stringify(r.table, null, 1)}\n`);
  // Zombies : fichiers de proposition écrits seulement s'ils changent (aucun dans la proposition actuelle).
  if (reglages.waves) writeFileSync(`${dossier}waves.proposition.json`, `${JSON.stringify(r.waves, null, 1)}\n`);
  if (reglages.enemies) writeFileSync(`${dossier}enemies.proposition.json`, `${JSON.stringify(r.enemies, null, 1)}\n`);
  const t = lireTable(r.table);
  const m = modele({ armesPartie: r.table, waves: r.waves, enemies: r.enemies, precision });
  for (const id of ['m1911', 'winchester1897', 'kar98k', 'thompson']) {
    const e = t.armes[id];
    console.log(`${id} : dégâts ${e.degats} × ${e.plombs}, cadence ${e.cadence}, ${e.chargeur} / ${e.reserve}, rechargement ${e.rechargement}, prix ${e.prix ?? '—'}, rachat ${r.table.armes[id].rachat ?? '—'} ; aisance ${[1, 10, 11, 20, 21, 30, 31, 40].map((v) => `${v}:${m.aisance(id, v).toFixed(2)}`).join(' ')}`);
  }
  console.log(`référence ${m.ref.toFixed(3)} ; précision ${JSON.stringify(precision)} ; vie marcheur ${[1, 10, 11, 20, 21, 31, 40].map((v) => `${v}:${Math.round(vague(v, r.waves, r.enemies).vies.marcheur)}`).join(' ')}`);
  void aisanceBrute;
}
