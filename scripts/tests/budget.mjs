// Lot 4e-B — Budget de durée des paliers et plan des tranches (Node natif, sans dépendance).
//
// Usage :
//   node scripts/tests/budget.mjs [--palier complet|publication|standard] [--selection <json de selectionner.mjs>] [--plan <sortie.json>]
//                                 [--liste <json de playwright --list --reporter=json>] [--granularite test|fichier] [--non-bloquant]
//   node scripts/tests/budget.mjs --ecrire-mesure <dossier des rapports de mesurer.mjs>   (réécrit tests/budget-mesure.json)
//   node scripts/tests/budget.mjs --liste-sans-mesure <fichier>   (lot 5n : lignes --test-list des tests du complet sans durée mesurée)
//   node scripts/tests/budget.mjs --completer-mesure <rapport JSON de playwright> [--note <texte>]   (lot 5n : ajoute ces durées à tests/budget-mesure.json)
//   node scripts/tests/budget.mjs --remettre-reference --raison <texte>   (lot 5n, T6 : référence du complet = cumul projeté d'aujourd'hui ; décision du propriétaire seulement)
//
// Durées : tests/budget-mesure.json (mesure de référence, par test). Réglages : tests/budget.json. La liste des tests vient de
// `playwright test --list` (E2E_FULL=1) : un test nouveau prend la médiane de son fichier. Le plan donne, par tranche, les lignes
// d'un fichier --test-list de Playwright (répartition par test, gloutonne par durée). Sort en erreur si N > tranchesMax (hypothèse mesurée),
// si le temps projeté dépasse completCibleSecondes, si une unité dépasse une tranche, ou si le complet gagne plus de ajoutMaxParLotSecondes.
// Lot 4f-A : publication et complet utilisent tranchesMax (16) tranches dès que le nombre de tests le permet (N minimal et N utilisé rapportés) ;
// standard : projets de standardProjets seulement (bureau), N = clamp(1, tranchesMaxStandard, …) (lib/budget.mjs → planDuPalier),
// 0 tranche si la sélection ne contient aucun test Playwright. Le plan porte une empreinte (contrôle des tranches) et une projection compacte.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { completerMesure, dureesDepuisMesure, remettreReference, evaluer, ligneTestList, planDuPalier, projectionCompacte } from './lib/budget.mjs';
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

const ecrireJsonMesure = (out) => writeFileSync(join(ROOT, 'tests/budget-mesure.json'), `${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{').replace(/"tests":\[/, '"tests":[\n')}\n`);

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
  ecrireJsonMesure(out);
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
  // Lot 5n (T4) : liste des tests du complet (deux projets, @lent et @instable compris) qui n'ont pas de durée mesurée.
  if (has('--liste-sans-mesure')) {
    const sans = dureesDepuisMesure(listerTests(), readJson('tests/budget-mesure.json').tests).filter((t) => t.source !== 'mesure');
    writeFileSync(resolve(val('--liste-sans-mesure')), `${sans.map(ligneTestList).join('\n')}\n`);
    console.log(`${sans.length} tests sans durée mesurée → ${val('--liste-sans-mesure')}`);
    process.exit(0);
  }
  if (has('--remettre-reference')) {
    if (!val('--raison')) throw new Error('--remettre-reference exige --raison (décision du propriétaire)');
    const m = readJson('tests/budget-mesure.json');
    const tests = dureesDepuisMesure(listerTests(), m.tests);
    const cumul = tests.reduce((s, t) => s + t.ms, 0) / 1000;
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const r = remettreReference(m, cumul, { date: new Date().toISOString().slice(0, 10), commit, raison: val('--raison') });
    ecrireJsonMesure(r);
    console.log(`référence du complet : ${m.complet.cumulSecondes} s → ${r.complet.cumulSecondes} s (${tests.length} exécutions, ${tests.filter((t) => t.source !== 'mesure').length} sans mesure)`);
    process.exit(0);
  }
  if (has('--completer-mesure')) {
    const rapport = JSON.parse(readFileSync(resolve(val('--completer-mesure')), 'utf8'));
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const r = completerMesure(readJson('tests/budget-mesure.json'), playwrightTests(rapport), { date: rapport.stats?.startTime?.slice(0, 10) ?? null, commit, note: val('--note', '') });
    ecrireJsonMesure(r.mesure);
    console.log(`tests/budget-mesure.json : ${r.remplaces} durées remplacées, ${r.ajoutes} ajoutées (${r.mesure.tests.length} tests)`);
    process.exit(0);
  }
  const b = readJson('tests/budget.json');
  const mesure = readJson('tests/budget-mesure.json');
  const table = readJson('tests/selection.json');
  const palier = val('--palier', 'complet');
  const standard = palier === 'standard';
  const projets = standard ? (b.standardProjets ?? []) : [];
  const ecrirePlan = (plan) => {
    if (val('--plan')) writeFileSync(val('--plan'), `${JSON.stringify(plan, null, 1)}\n`);
    if (process.env.GITHUB_OUTPUT && val('--plan')) {
      appendFileSync(process.env.GITHUB_OUTPUT, `matrice=${JSON.stringify(plan.matrice)}\nn=${plan.n}\nempreinte=${plan.empreinte}\nprojection=${JSON.stringify(plan.projection)}\n`);
    }
  };
  // Aucun test Playwright : 0 tranche de navigateur, seulement la tâche « unitaires » (lint et Vitest).
  const planVide = () => {
    const msg = `Budget (${palier}) : aucun test Playwright sélectionné : 0 tranche de navigateur (seulement lint et Vitest).`;
    console.log(msg);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${msg}\n\n`);
    ecrirePlan({ palier, n: 0, nMinimal: 0, ok: true, erreurs: [], matrice: [], empreinte: 'vide', projection: projectionCompacte({ palier, nMinimal: 0, nUtilise: 0, sommeSecondes: 0, projection: null }, b), tranches: [] });
    process.exit(0);
  };
  let fichiers = [];
  if (val('--selection')) {
    const s = JSON.parse(readFileSync(val('--selection'), 'utf8'));
    // Palier standard en rejeu total : fumée et tests e2e de toutes les zones (comme palier.mjs), jamais les tests « complet ».
    if (s.mode === 'tout') fichiers = standard ? [...new Set([...table.fumee, ...table.zones.flatMap((z) => z.e2e)])] : [];
    else fichiers = [...new Set([...s.e2e, ...(standard ? [] : s.complet), ...s.fumee])];
    if (s.mode !== 'tout' && !fichiers.length) planVide();
  }
  const brut = val('--liste') ? playwrightTests(JSON.parse(readFileSync(val('--liste'), 'utf8'))) : listerTests(fichiers, projets.map((p) => `--project=${p}`));
  let tests = brut; // en mode --list, tous les tests ont le statut « skipped » : on les garde tous
  if (projets.length) tests = tests.filter((t) => projets.includes(t.projet));
  if (palier !== 'complet') tests = tests.filter((t) => !/@lent\b|@instable\b/.test(t.titre));
  const avecDurees = dureesDepuisMesure(tests, mesure.tests);
  const granularite = val('--granularite', 'test');
  const plan = planDuPalier(avecDurees, b, palier, { granularite });
  if (plan.nUtilise === 0) planVide();
  const estimes = avecDurees.filter((t) => t.source !== 'mesure').length;
  const entete = `Budget du palier ${palier} : ${avecDurees.length} exécutions Playwright${projets.length ? ` (projets : ${projets.join(', ')})` : ''} (${estimes} sans mesure, durée estimée)`;
  let corps;
  let ev = null;
  if (standard) {
    const p = plan.projection;
    corps = [
      `- N minimal = ${plan.nMinimal}, N utilisé = ${plan.nUtilise} (tranchesMaxStandard ${b.tranchesMaxStandard}) ; cumul ${min(plan.sommeSecondes)} ; parallélisme ${String(b.facteurParallelisme).replace('.', ',')}`,
      `- tranche la plus longue ${min(p.trancheLaPlusLongueSecondes)}, total ${min(p.totalSecondes)} (installation ${b.installationSecondes} s comprise) — cible ${min(b.standardCibleSecondes)}, maximum ${min(b.standardMaxSecondes)}`,
      ...plan.erreurs.map((e) => `- ERREUR : ${e}`),
      ...plan.avertissements.map((a) => `- avertissement : ${a}`),
    ].join('\n');
  } else {
    ev = evaluer(avecDurees, b, { granularite, referenceSecondes: palier === 'complet' ? mesure.complet.cumulSecondes : undefined, etiquette: palier });
    const p = plan.projection;
    corps = `${texte(ev, b)}\n- plan : N minimal = ${plan.nMinimal}, N utilisé = ${plan.nUtilise} (tranchesMax ${b.tranchesMax}) : tranche la plus longue ${min(p.trancheLaPlusLongueSecondes)}, total ${min(p.totalSecondes)}`;
  }
  console.log(`${entete}\n${corps}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${entete}\n\n${corps}\n\n`);
  if (val('--plan')) {
    const tranches = plan.projection.repartition.map((t) => ({
      index: t.index,
      secondesProjetees: Math.round(t.ms / 1000 / b.facteurParallelisme),
      lignes: t.unites.flatMap((u) => u.tests).filter((x) => !estInstable(x)).map(ligneTestList),
      instables: t.unites.flatMap((u) => u.tests).filter(estInstable).map(ligneTestList),
    }));
    const empreinte = createHash('sha256').update(JSON.stringify(tranches)).digest('hex').slice(0, 16);
    const ok = standard ? plan.erreurs.length === 0 : ev.ok && plan.erreurs.length === 0;
    ecrirePlan({ palier, n: plan.nUtilise, nMinimal: plan.nMinimal, ok, erreurs: [...(ev?.erreurs ?? []), ...plan.erreurs], matrice: tranches.map((t) => t.index), empreinte, projection: projectionCompacte(plan, b), tranches });
  }
  // --echec tranches : n'échoue que si N minimal > tranchesMax (publication, complet : tâche « planifier » de la CI) ; jamais pour le standard
  // (limité à tranchesMaxStandard, le dépassement est rapporté) ; --non-bloquant : jamais.
  const bloquant = val('--echec') === 'tranches' ? !standard && plan.nMinimal > b.tranchesMax : standard ? plan.erreurs.length > 0 : !ev.ok;
  if (bloquant && !has('--non-bloquant')) process.exit(1);
}
