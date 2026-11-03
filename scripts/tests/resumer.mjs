// Lot 4e-A — Résumé des mesures de scripts/tests/mesurer.mjs : tableaux par fichier (Vitest, suite rapide, suite complète), estimation des
// chargements de page, totaux par catégorie d'après scripts/tests/classement.json, tests les plus lents, échecs et instables.
// Écrit l'annexe de l'audit (Markdown) et un résumé JSON hors du dépôt.
//
// Usage : node scripts/tests/resumer.mjs [--out <dossier des mesures>] [--annexe Docs/ref/tests-audit-annexe.md]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { natureDesCommits, navigationsParLigne, playwrightParFichier, playwrightTests, totauxParCategorie, vitestParFichier } from './lib/rapports.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? def : process.argv[i + 1];
};
const OUT = resolve(arg('--out', join(tmpdir(), 'zs-mesure-tests')));
const ANNEXE = resolve(ROOT, arg('--annexe', 'Docs/ref/tests-audit-annexe.md'));
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const min = (ms) => (ms / 60000).toFixed(1).replace('.', ',');
const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',');

const meta = readJson(join(OUT, 'meta.json')) ?? { etapes: {} };
const classement = readJson(join(ROOT, 'scripts/tests/classement.json'))?.fichiers ?? [];
const classOf = (f) => classement.find((c) => c.fichier === f) ?? {};
const vitest = vitestParFichier(readJson(join(OUT, 'vitest.json')), ROOT);
const vitestTests = (readJson(join(OUT, 'vitest.json'))?.testResults ?? []).flatMap((f) => (f.assertionResults ?? []).map((t) => ({
  fichier: f.name.replace(`${ROOT}/`, ''), titre: t.fullName ?? t.title, ms: t.duration ?? 0, statut: t.status,
})));
const suites = {};
for (const name of ['rapide', 'complet']) {
  const report = readJson(join(OUT, `${name}.json`));
  if (!report) continue;
  const tests = playwrightTests(report);
  const nav = {};
  for (const f of new Set(tests.map((t) => t.fichier))) {
    const p = join(ROOT, f);
    if (existsSync(p)) nav[f] = navigationsParLigne(readFileSync(p, 'utf8'), tests.filter((t) => t.fichier === f).map((t) => t.ligne));
  }
  for (const t of tests) t.chargements = t.statut === 'skipped' ? 0 : (nav[t.fichier]?.[t.ligne] ?? 0);
  suites[name] = { tests, parFichier: playwrightParFichier(tests), stats: report.stats, navigations: readJson(join(OUT, `${name}-navigations.json`)) ?? {} };
}

const L = [];
L.push('# Audit des tests — annexe (générée)', '');
L.push(`Généré par \`node scripts/tests/resumer.mjs\` depuis les mesures de \`scripts/tests/mesurer.mjs\` (sorties hors dépôt). Ne pas modifier à la main.`, '');
L.push('## Durées mesurées', '', '| Étape | Durée | Code de sortie |', '|---|---|---|');
for (const [k, v] of Object.entries(meta.etapes)) L.push(`| ${k} | ${min(v.ms)} min (${sec(v.ms)} s) | ${v.code} |`);
L.push('');

// Vitest
L.push('## Vitest par fichier', '', `${vitest.length} fichiers, ${vitest.reduce((s, r) => s + r.tests, 0)} tests ; durée = somme des tests (la suite tourne en parallèle).`, '');
L.push('| Fichier | Tests | Échecs | Ignorés | Durée (s) | Cat. | Valeur | Reco. |', '|---|---|---|---|---|---|---|---|');
for (const r of [...vitest].sort((a, b) => b.msTests - a.msTests)) {
  const c = classOf(r.fichier);
  L.push(`| ${r.fichier.replace('tests/unit/', '')} | ${r.tests} | ${r.ko} | ${r.ignores} | ${sec(r.msTests)} | ${c.categorie ?? '?'} | ${c.valeur ?? ''} | ${c.recommandation ?? ''} |`);
}
L.push('');

// Playwright
for (const [name, s] of Object.entries(suites)) {
  const total = s.tests.filter((t) => t.statut !== 'skipped');
  L.push(`## Playwright — suite ${name}`, '');
  L.push(`${s.tests.length} exécutions (${total.length} jouées, ${s.tests.length - total.length} ignorées) ; ${s.stats?.unexpected ?? 0} échecs, ${s.stats?.flaky ?? 0} instables ; durée du rapport ${min(s.stats?.duration ?? 0)} min ; somme des durées ${min(total.reduce((a, t) => a + t.ms, 0))} min.`);
  const navTotal = Object.values(s.navigations).reduce((a, b) => a + b, 0);
  L.push(`Pages chargées (serveur de comptage, documents .html) : ${navTotal} — ${Object.entries(s.navigations).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
  L.push('| Fichier | Projet | Exéc. | OK | Échecs | Instables | Ignorés | Durée (min) | Chargements estimés | Cat. | Reco. |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of [...s.parFichier].sort((a, b) => b.ms - a.ms)) {
    const c = classOf(r.fichier);
    const charg = s.tests.filter((t) => t.fichier === r.fichier && t.projet === r.projet).reduce((a, t) => a + t.chargements, 0);
    L.push(`| ${r.fichier.replace('tests/e2e/', '')} | ${r.projet} | ${r.tests} | ${r.ok} | ${r.ko} | ${r.instables} | ${r.ignores} | ${min(r.ms)} | ${charg} | ${c.categorie ?? '?'} | ${c.recommandation ?? ''} |`);
  }
  L.push('');
  const bad = s.tests.filter((t) => t.statut === 'unexpected' || t.statut === 'flaky');
  if (bad.length) {
    L.push(`### Échecs et instables (${name})`, '', '| Fichier:ligne | Projet | Statut | Titre | Erreur |', '|---|---|---|---|---|');
    for (const t of bad) L.push(`| ${t.fichier.replace('tests/e2e/', '')}:${t.ligne} | ${t.projet} | ${t.statut} | ${t.titre.replaceAll('|', '/').slice(0, 120)} | ${(t.erreur ?? '').replaceAll('|', '/').slice(0, 200)} |`);
    L.push('');
  }
  L.push(`### 25 tests les plus lents (${name})`, '', '| Durée (s) | Fichier:ligne | Projet | Titre |', '|---|---|---|---|');
  for (const t of [...total].sort((a, b) => b.ms - a.ms).slice(0, 25)) L.push(`| ${sec(t.ms)} | ${t.fichier.replace('tests/e2e/', '')}:${t.ligne} | ${t.projet} | ${t.titre.replaceAll('|', '/').slice(0, 120)} |`);
  L.push('');
}

// Catégories
const cats = {};
if (suites.complet) cats.complet = totauxParCategorie(classement, suites.complet.tests.filter((t) => t.statut !== 'skipped'));
if (suites.rapide) cats.rapide = totauxParCategorie(classement, suites.rapide.tests.filter((t) => t.statut !== 'skipped'));
cats.vitest = totauxParCategorie(classement, vitestTests);
L.push('## Totaux par catégorie', '', '| Catégorie | Vitest (tests / s) | Suite rapide (exéc. / min) | Suite complète (exéc. / min) |', '|---|---|---|---|');
const keys = [...new Set(Object.values(cats).flatMap((c) => Object.keys(c)))].sort();
for (const k of keys) {
  const v = cats.vitest[k];
  const r = cats.rapide?.[k];
  const c = cats.complet?.[k];
  L.push(`| ${k} | ${v ? `${v.tests} / ${sec(v.ms)}` : '—'} | ${r ? `${r.tests} / ${min(r.ms)}` : '—'} | ${c ? `${c.tests} / ${min(c.ms)}` : '—'} |`);
}
L.push('');

// 30 derniers commits (hors fusions) : familles de fichiers touchées et nature (documentation seule, ciblé, large).
const BASE = arg('--base', 'HEAD');
let commits = [];
try {
  const log = execFileSync('git', ['log', '--no-merges', '-30', '--format=@%h%x09%s', '--name-only', BASE], { cwd: ROOT, encoding: 'utf8' });
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) {
      const [hash, sujet] = line.slice(1).split('\t');
      commits.push({ hash, sujet, fichiers: [] });
    } else if (line.trim()) commits.at(-1).fichiers.push(line.trim());
  }
} catch { commits = []; }
const natures = natureDesCommits(commits);
const parNature = (n) => natures.filter((c) => c.nature === n).length;
L.push(`## 30 derniers commits de ${BASE} (hors fusions)`, '', `Documentation seule : ${parNature('doc')} ; ciblés : ${parNature('cible')} ; larges (racine, .github, vendor ou 4 familles et plus) : ${parNature('large')}.`, '');
L.push('| Commit | Fichiers | Familles | Nature | Sujet |', '|---|---|---|---|---|');
for (const c of natures) L.push(`| ${c.hash} | ${c.fichiers} | ${c.familles.join(', ')} | ${c.nature} | ${c.sujet.replaceAll('|', '/').slice(0, 90)} |`);
L.push('');

// Classement détaillé
L.push('## Classement par fichier', '', '| Fichier | Projet(s) | Cat. | Valeur | Recommandation | Raison | Groupes |', '|---|---|---|---|---|---|---|');
for (const c of classement) {
  const groupes = (c.groupes ?? []).map((g) => `${g.categorie} : /${g.motif}/${g.note ? ` (${g.note})` : ''}`).join(' ; ');
  L.push(`| ${c.fichier.replace(/^tests\//, '')} | ${c.projets ?? ''} | ${c.categorie} | ${c.valeur} | ${c.recommandation} | ${c.raison.replaceAll('|', '/')} | ${groupes.replaceAll('|', '/')} |`);
}
L.push('');

writeFileSync(ANNEXE, `${L.join('\n')}\n`);
const resume = {
  meta,
  vitest: { fichiers: vitest.length, tests: vitest.reduce((s, r) => s + r.tests, 0), echecs: vitest.reduce((s, r) => s + r.ko, 0) },
  suites: Object.fromEntries(Object.entries(suites).map(([k, s]) => [k, { stats: s.stats, parFichier: s.parFichier }])),
  categories: cats,
  commits: natures,
  nonClasses: [...new Set([...vitest.map((r) => r.fichier), ...Object.values(suites).flatMap((s) => s.tests.map((t) => t.fichier))])].filter((f) => !classement.some((c) => c.fichier === f)),
};
writeFileSync(join(OUT, 'resume.json'), `${JSON.stringify(resume, null, 2)}\n`);
console.log(`annexe : ${ANNEXE}\nrésumé : ${join(OUT, 'resume.json')}\nnon classés : ${resume.nonClasses.length}`);
