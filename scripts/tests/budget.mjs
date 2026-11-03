// Lot 4e-B — Budget de durée des paliers et plan des tranches (Node natif, sans dépendance).
//
// Usage :
//   node scripts/tests/budget.mjs [--palier complet|publication|standard] [--selection <json de selectionner.mjs>] [--plan <sortie.json>]
//                                 [--liste <json de playwright --list --reporter=json>] [--granularite test|fichier] [--non-bloquant]
//   node scripts/tests/budget.mjs --ecrire-mesure <dossier des rapports de mesurer.mjs>   (réécrit tests/budget-mesure.json)
//
// Durées : tests/budget-mesure.json (mesure de référence, par test). Réglages : tests/budget.json. La liste des tests vient de
// `playwright test --list` (E2E_FULL=1) : un test nouveau prend la médiane de son fichier. Le plan donne, par tranche, les lignes
// d'un fichier --test-list de Playwright (répartition par test, gloutonne par durée). Sort en erreur si N > tranchesMax (hypothèse mesurée),
// si le temps projeté dépasse completCibleSecondes, si une unité dépasse une tranche, ou si le complet gagne plus de ajoutMaxParLotSecondes.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dureesDepuisMesure, evaluer, ligneTestList, projection, unites } from './lib/budget.mjs';
import { playwrightTests, vitestParFichier } from './lib/rapports.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const val = (n, d) => {
  const i = args.indexOf(n);
  return i < 0 ? d : args[i + 1];
};
const has = (n) => args.includes(n);
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const min = (s) => `${(s / 60).toFixed(1).replace('.', ',')} min`;

export const estInstable = (t) => /@instable\b/.test(t.titre);

function ecrireMesure(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const lire = (n) => (existsSync(join(dir, n)) ? JSON.parse(readFileSync(join(dir, n), 'utf8')) : null);
  const complet = lire('complet.json');
  const rapide = lire('rapide.json');
  const vitest = lire('vitest.json');
  const joues = (r) => (r ? playwrightTests(r) : []); // les tests ignorés à l'exécution (test.skip) gardent leur durée quasi nulle
  const tc = joues(complet);
  const tr = joues(rapide);
  const somme = (l) => l.reduce((s, t) => s + t.ms, 0);
  const vf = vitest ? vitestParFichier(vitest, ROOT) : [];
  const out = {
    schema: 1,
    description: 'Mesure de référence des durées de tests (lot 4e-A : 4 cœurs, 2 workers Playwright, aucun rejeu). Mise à jour par le propriétaire après le premier palier complet en CI.',
    date: meta.fin?.slice(0, 10) ?? null,
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    etapes: Object.fromEntries(Object.entries(meta.etapes ?? {}).map(([k, v]) => [k, { secondes: Math.round(v.ms / 1000), code: v.code }])),
    complet: {
      cumulSecondes: Math.round(somme(tc) / 1000),
      reelSecondes: complet ? Math.round(complet.stats.duration / 1000) : null,
      facteurParallelisme: complet ? Number((somme(tc) / complet.stats.duration).toFixed(2)) : null,
      executions: tc.filter((t) => t.statut !== 'skipped').length,
    },
    rapide: { cumulSecondes: Math.round(somme(tr) / 1000), reelSecondes: rapide ? Math.round(rapide.stats.duration / 1000) : null, executions: tr.length },
    vitest: { reelSecondes: meta.etapes?.vitest ? Math.round(meta.etapes.vitest.ms / 1000) : null, fichiers: vf.map((f) => ({ fichier: f.fichier, tests: f.tests, ms: f.msFichier })) },
    tests: tc.map((t) => ({ projet: t.projet, fichier: t.fichier, titre: t.titre, ms: t.ms, ...(t.statut === 'skipped' ? { ignore: true } : {}) })),
  };
  writeFileSync(join(ROOT, 'tests/budget-mesure.json'), `${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{').replace(/"tests":\[/, '"tests":[\n')}\n`);
  console.log(`tests/budget-mesure.json : ${tc.length} tests, cumul ${min(out.complet.cumulSecondes)}, réel ${min(out.complet.reelSecondes)}, facteur ${out.complet.facteurParallelisme}`);
}

// Liste des tests Playwright d'un palier (sans les lancer).
export function listerTests(fichiers = [], extra = []) {
  const out = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json', ...extra, ...fichiers], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, E2E_FULL: '1' }, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return playwrightTests(JSON.parse(out.slice(out.indexOf('{'))));
}

function texte(ev, b) {
  const L = [];
  for (const [nom, p] of [['mesurée', ev.mesuree], ['prudente (1,0)', ev.prudente]]) {
    L.push(`- hypothèse ${nom} (parallélisme ${String(p.facteur).replace('.', ',')}) : cumul ${min(p.sommeSecondes)}, N = ${p.tranches} tranche(s), tranche la plus longue ${min(p.trancheLaPlusLongueSecondes)}, total ${min(p.totalSecondes)} (installation ${b.installationSecondes} s comprise) — objectif ${min(b.completCibleSecondes)}, ${b.tranchesMax} tranches au plus`);
  }
  if (ev.ajoutSecondes !== null) L.push(`- écart avec la mesure de référence : ${ev.ajoutSecondes >= 0 ? '+' : ''}${ev.ajoutSecondes} s de calcul cumulé (ajout maximal par lot : ${b.ajoutMaxParLotSecondes} s)`);
  for (const e of ev.erreurs) L.push(`- ERREUR : ${e}`);
  for (const a of ev.avertissements) L.push(`- avertissement : ${a}`);
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (has('--ecrire-mesure')) {
    ecrireMesure(resolve(val('--ecrire-mesure')));
    process.exit(0);
  }
  const b = readJson('tests/budget.json');
  const mesure = readJson('tests/budget-mesure.json');
  const palier = val('--palier', 'complet');
  let fichiers = [];
  if (val('--selection')) {
    const s = JSON.parse(readFileSync(val('--selection'), 'utf8'));
    fichiers = s.mode === 'tout' ? [] : [...s.e2e, ...(palier === 'standard' ? [] : s.complet), ...s.fumee];
    if (s.mode !== 'tout' && !fichiers.length) {
      console.log(`Budget (${palier}) : aucun test Playwright sélectionné.`);
      if (val('--plan')) writeFileSync(val('--plan'), `${JSON.stringify({ palier, tranches: [], matrice: [] }, null, 2)}\n`);
      process.exit(0);
    }
  }
  const brut = val('--liste') ? playwrightTests(JSON.parse(readFileSync(val('--liste'), 'utf8'))) : listerTests(fichiers);
  let tests = brut; // en mode --list, tous les tests ont le statut « skipped » : on les garde tous
  if (palier !== 'complet') tests = tests.filter((t) => !/@lent\b|@instable\b/.test(t.titre));
  const avecDurees = dureesDepuisMesure(tests, mesure.tests);
  const ev = evaluer(avecDurees, b, { granularite: val('--granularite', 'test'), referenceSecondes: palier === 'complet' ? mesure.complet.cumulSecondes : undefined, etiquette: palier });
  const estimes = avecDurees.filter((t) => t.source !== 'mesure').length;
  const entete = `Budget du palier ${palier} : ${avecDurees.length} exécutions Playwright (${estimes} sans mesure, durée estimée)`;
  const corps = texte(ev, b);
  console.log(`${entete}\n${corps}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${entete}\n\n${corps}\n\n`);
  if (val('--plan')) {
    const n = Math.min(ev.mesuree.tranches, b.tranchesMax);
    const rep = n === ev.mesuree.tranches ? ev.mesuree.repartition : projection(unites(avecDurees, val('--granularite', 'test')), b, b.facteurParallelisme, n).repartition;
    const tranches = rep.map((t) => ({
      index: t.index,
      secondesProjetees: Math.round(t.ms / 1000 / b.facteurParallelisme),
      lignes: t.unites.flatMap((u) => u.tests).filter((x) => !estInstable(x)).map(ligneTestList),
      instables: t.unites.flatMap((u) => u.tests).filter(estInstable).map(ligneTestList),
    }));
    writeFileSync(val('--plan'), `${JSON.stringify({ palier, n, ok: ev.ok, erreurs: ev.erreurs, matrice: tranches.map((t) => t.index), tranches }, null, 1)}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrice=${JSON.stringify(tranches.map((t) => t.index))}\n`);
  }
  // --echec tranches : n'échoue que si N > tranchesMax (tâche « planifier » de la CI) ; --non-bloquant : jamais.
  const bloquant = val('--echec') === 'tranches' ? ev.mesuree.tranches > b.tranchesMax : !ev.ok;
  if (bloquant && !has('--non-bloquant')) process.exit(1);
}
