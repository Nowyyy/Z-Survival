// Lot 9k — Mesure reproductible de l'équilibrage des armes (garantie 2) : sortie en texte. Pur Node (aucun navigateur) : lit les données du jeu
// (ou des fichiers de remplacement), la précision mesurée par le joueur automatique (scripts/equilibrage/joueur.mjs --out), et calcule par
// scripts/equilibrage/modele.mjs : difficulté par vague, aisance des armes (référence : Colt sans équipement, vagues 1 à 10), aisance de survie
// avec l'équipement de référence, prix d'après les Zollars du joueur automatique.
// Usage : node scripts/equilibrage/armes.mjs [--armes f.json] [--waves f.json] [--enemies f.json] [--joueur resultats.json (précision, Zollars)]
//         [--vagues 1,10,11,20,21,30,31,40] [--armes-vues m1911,winchester1897,kar98k,thompson | toutes]
import { readFileSync } from 'node:fs';
import { EQUIPEMENT_REFERENCE, FACTEUR_EQUIPEMENT, cycle, modele, niveauxReference, precisionMesuree, survie } from './modele.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const armesPartie = lire(opt('armes', 'data/game/armes-partie.json'));
const waves = lire(opt('waves', 'data/game/waves.json'));
const enemies = lire(opt('enemies', 'data/game/enemies.json'));
const playerStats = lire('data/game/player-stats.json');
const joueurF = opt('joueur', null);
const joueur = joueurF ? lire(joueurF) : null;
const VAGUES = opt('vagues', '1,5,10,11,15,20,21,25,30,31,35,40').split(',').map(Number);
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : NaN; };

// Précision du joueur automatique, par arme (modele.mjs, precisionMesuree : parties sans équipement) ; sans mesure : celle de la proposition, sinon 0,8.
const precision = { defaut: 0.8, ...(armesPartie._equilibrage?.precision ?? {}) }; // proposition : précision écrite par proposer.mjs
const mesures = {};
if (joueur) {
  const m0 = modele({ armesPartie, waves, enemies });
  Object.assign(mesures, precisionMesuree(m0.table, m0.vague, joueur.resultats));
  Object.assign(precision, mesures);
}
const M = modele({ armesPartie, waves, enemies, precision });
const vues = opt('armes-vues', 'm1911,winchester1897,kar98k,thompson');
const ids = vues === 'toutes' ? M.table.actives : vues.split(',').filter((id) => M.table.armes[id]?.active);

console.log('# Difficulté par vague (waves.json, enemies.json)');
console.log('| Vague | Zombies | Présents au plus | Intervalle (s) | Arrivées / s | Vie ×  | Vie marcheur | Vie moyenne | Demande (PV/s) | Coup (marcheur) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const v of [1, 2, 3, 5, 7, 9, 10, 11, 15, 20, 21, 25, 28, 30, 31, 35, 40]) {
  const w = M.vague(v);
  console.log(`| ${v}${w.renforcee ? ' (R)' : ''} | ${w.total} | ${w.maxPresents} | ${f(w.intervalle)} | ${f(w.parSeconde)} | ${f(w.hpMul, 1)} | ${Math.round(w.vies.marcheur)} | ${Math.round(w.vieMoyenne)} | ${f(w.demande, 0)} | ${f(w.degatsContact, 1)} |`);
}
console.log('\n# Armes : cycle soutenu (chargeur, rechargement et délai après compris), précision du joueur automatique');
console.log('| Arme | Dégâts × plombs | Cadence | Chargeur / réserve | Rechargement + délai | Cycle (s) | DPS brut | Précision | Prix | Rachat |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const id of ids) {
  const e = M.table.armes[id];
  const c = cycle(e, M.table);
  const src = armesPartie.armes[id] ?? {};
  console.log(`| ${id} | ${e.degats} × ${e.plombs} | ${f(e.cadence)} | ${e.chargeur} / ${e.reserve === Infinity ? '∞' : e.reserve} | ${f(e.rechargement)} + ${f(c.apres, 1)} | ${f(c.duree)} | ${f(c.dpsBrut, 1)} | ${f(M.precision(id))}${mesures[id] ? '' : ' (défaut)'} | ${e.prix ?? '—'} | ${src.rachat ?? '—'} |`);
}
console.log(`\nRéférence (aisance brute moyenne du Colt, vagues 1 à 10) : ${f(M.ref, 4)}`);
console.log('\n# Aisance (1,0 = Colt sans équipement, moyenne des vagues 1 à 10) — identique avec l\'équipement (aucun objet ne donne d\'attaque)');
console.log(`| Arme | ${VAGUES.join(' | ')} |`);
console.log(`|---|${VAGUES.map(() => '---').join('|')}|`);
for (const id of ids) console.log(`| ${id} | ${VAGUES.map((v) => f(M.aisance(id, v))).join(' | ')} |`);

// Aisance de survie avec l'équipement de référence.
const niveaux = niveauxReference(lire('data/menu/objets.json'), lire('data/menu/personnages.json'), playerStats, EQUIPEMENT_REFERENCE);
const sNu = survie({}, playerStats, lire('data/game/player.json'), lire('data/game/player-down.json'));
const sEq = survie(niveaux, playerStats, lire('data/game/player.json'), lire('data/game/player-down.json'));
console.log(`\n# Équipement de référence : six objets ${EQUIPEMENT_REFERENCE.rarete}s au niveau ${EQUIPEMENT_REFERENCE.niveau}, ${EQUIPEMENT_REFERENCE.personnage} → niveaux ${JSON.stringify(niveaux)}`);
console.log(`Nu : vie ${sNu.vie}, soin ${sNu.regen} par tué, ${sNu.chutes} chute ; équipé : vie ${sEq.vie}, soin ${sEq.regen} par tué, ${sEq.chutes} chute, vitesse ×${f(sEq.vitesse)}, planche ${f(sEq.reparation)} s`);
console.log(`| Arme (aisance avec l'équipement : × ${f(FACTEUR_EQUIPEMENT, 1)}, mesuré) | ${VAGUES.join(' | ')} |`);
console.log(`|---|${VAGUES.map(() => '---').join('|')}|`);
for (const id of ids) console.log(`| ${id} | ${VAGUES.map((v) => f(M.aisance(id, v) * FACTEUR_EQUIPEMENT)).join(' | ')} |`);

if (joueur) {
  console.log('\n# Joueur automatique (médianes des graines)');
  for (const profil of [...new Set(joueur.resultats.map((r) => r.profil))]) {
    const rs = joueur.resultats.filter((r) => r.profil === profil);
    const z = (v) => med(rs.map((r) => r.byWave[v]?.zollarsDebut));
    console.log(`- ${profil} : manche atteinte ${rs.map((r) => r.vague).join(', ')} (médiane ${f(med(rs.map((r) => r.vague)), 1)}) ; tués ${f(med(rs.map((r) => r.tues)), 0)} ; Zollars gagnés ${f(med(rs.map((r) => r.gagne)), 0)} ; Zollars en poche au début des manches 11 / 21 / 31 : ${f(z(11), 0)} / ${f(z(21), 0)} / ${f(z(31), 0)}`);
    const parManche = [];
    for (let v = 1; v <= 40; v += 1) { const x = med(rs.map((r) => (r.byWave[v + 1]?.zollarsDebut ?? NaN) - (r.byWave[v]?.zollarsDebut ?? NaN))); if (Number.isFinite(x)) parManche.push(`${v}:${f(x, 0)}`); }
    console.log(`  Zollars nets par manche (médiane) : ${parManche.join(' ')}`);
  }
  for (const id of Object.keys(mesures)) console.log(`- précision mesurée ${id} : ${f(precision[id], 3)}`);
}
