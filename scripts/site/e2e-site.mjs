// Site assemblé de test pour Playwright (lot 4c ; lot 5g : nouvelle organisation), tests/e2e/publication.spec.js, servi sur http://localhost:4174/ (PORT_SITE pour changer).
// Construit depuis l'arbre de travail courant (copie dans un dossier temporaire, puis scripts/build.mjs) — jamais dans _site/ du dépôt —, puis assemble trois sites :
//  - full/ : racine « en construction », Recette/ (build courant), dev/ (le même build, canal dev : ses entrées de journal en version non publiée
//    sont les « évolutions »), archives FICTIVES v0.2 à v0.4 (pages de test), v0.1 indisponible (jeu de versions de test) ;
//  - bare/ : Recette/ seule (ni dev, ni archive) : « Aucun build de développement pour l'instant », versions publiées « indisponibles » ;
//  - many/ : 13 versions FICTIVES (v0.1 à v0.12 archivées, v0.13 Recette) pour la liste qui défile ; v0.6 y est publiée : aucune évolution ;
//  - noms/ (lot 5h) : comme full/, mais le build de dev porte un fichier des noms FICTIF (NOMS_TEST) qui renomme la V0.5, la V0.4 et le lot 5h,
//    masque le lot 5g et (lot 5i) donne à la Recette V0.6 une description de 200 caractères (sans changer son nom). full/, bare/ et many/ sont assemblés sans fichier des noms (textes d'origine), pour ne pas dépendre des textes du propriétaire.
// Chaque site vit dans un sous-dossier, comme le site publié sous /Z-Survival/. Les données de version sont fictives et annoncées comme telles.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assembleSite } from '../assemble.mjs';
import { NOMS_FICHIER } from './noms.mjs';
import { startServer } from './serve.mjs';

const SKIP = new Set(['.git', 'node_modules', '_site', '.lots', 'Docs', 'tests', 'test-results', 'playwright-report', 'lighthouse-report', 'blob-report', 'coverage']);
export const DEV_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
export const DEV_DATE = '2026-11-02T12:00:00Z';
export const GENERE = '2026-11-06T12:00:00Z';
// Lot 5i : description FICTIVE de la Recette (V0.6) de 200 caractères, la borne du fichier des noms : la carte « Version actuelle » doit l'afficher en entier.
export const DESCRIPTION_RECETTE_TEST = 'Description de test de la V0.6 (fictive) : deux cents caractères pour vérifier que la carte de la version actuelle l\'affiche en entier, sans la couper à cent vingt caractères comme avant ce lot ; fin.';
// Fichier des noms de test (fictif) du site noms/.
export const NOMS_TEST = [
  '# Fichier des noms de test (fictif) : site noms/ de scripts/site/e2e-site.mjs.',
  '[v0.6]', `description: ${DESCRIPTION_RECETTE_TEST}`,
  '[v0.5]', 'nom: V0.5 (nom de test)', 'description: Description de test de la Recette (fictive)',
  '[v0.4]', 'nom: Quatrième version (test)', 'description: Description de test de la V0.4 : fictive',
  '[lot-5h]', 'nom: Évolution renommée (test)', 'description: Texte de test de l\'évolution, venu du fichier des noms (fictif).',
  '[lot-5g]', 'afficher: non',
  '',
].join('\n');

// Jeu de versions de test (dérivé de versions.json : mêmes identifiants ; V0.1 indisponible pour tester ce cas).
export function testVersions(real) {
  const data = structuredClone(real);
  for (const v of data.versions) {
    if (v.id === 'v0.1') {
      v.status = 'indisponible';
      v.note = 'Version de test indisponible (jeu de versions fictif).';
    }
  }
  return data;
}

// Jeu de 13 versions fictives (v0.1 à v0.12 archivées, v0.13 actuelle), valide pour scripts/versions/schema.mjs.
export function manyVersions(count = 13) {
  const versions = Array.from({ length: count }, (_, i) => ({
    id: `v0.${i + 1}`, label: `V0.${i + 1}`, title: `Version de test ${i + 1} (fictive)`, date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    branch: `lot-${i + 1}`, ref: String(i + 1).padStart(2, '0').repeat(20), entry: 'jeu.html', status: i + 1 === count ? 'actuelle' : 'archive', note: '',
  }));
  return { schema: 1, latest: `v0.${count}`, versions, dev: { branch: 'dev', path: 'next/' } };
}

// Archive fictive : une page d'entrée, une feuille de style et un module, tous en chemins relatifs, et build-info.json.
// Lot 4f : icône vide en data: (comme l'icône intégrée des vraies pages) ; sans elle, le vrai Chrome de la CI demande /favicon.ico,
// reçoit 404 et l'écrit en console (« Failed to load resource »), ce qui faisait échouer publication.spec.js:70 et :141 en CI seulement
// (le Chromium « headless shell » local ne demande pas d'icône).
export function fakeArchive(dir, version) {
  const root = join(dir, version.id);
  mkdirSync(join(root, 'css'), { recursive: true });
  mkdirSync(join(root, 'js'), { recursive: true });
  writeFileSync(join(root, version.entry), `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${version.label} (archive de test)</title><link rel="icon" href="data:,"><link rel="stylesheet" href="css/style.css"><script type="module" src="js/main.js"></script></head>\n<body><main><h1>${version.label}</h1><p>Archive de test (fictive).</p><p id="loaded"></p></main></body></html>\n`);
  writeFileSync(join(root, 'css/style.css'), 'body { margin: 0; }\n');
  writeFileSync(join(root, 'js/main.js'), "document.getElementById('loaded').textContent = 'module chargé';\n");
  writeFileSync(join(root, 'build-info.json'), `${JSON.stringify({ channel: 'archive', version: version.label, branch: version.branch, sha: version.ref.slice(0, 7), ref: version.ref, date: `${version.date}T00:00:00Z` }, null, 2)}\n`);
}

export function buildTestSites(repo, www) {
  const tmp = mkdtempSync(join(tmpdir(), 'zs-e2e-site-'));
  try {
    const src = join(tmp, 'src');
    mkdirSync(src);
    for (const name of readdirSync(repo)) if (!SKIP.has(name)) cpSync(join(repo, name), join(src, name), { recursive: true });
    const build = spawnSync('node', ['scripts/build.mjs'], { cwd: src, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`build : ${build.stderr}`);
    const mainDir = join(src, '_site');
    rmSync(join(mainDir, NOMS_FICHIER), { force: true });
    const nomsDev = join(tmp, 'dev-noms');
    cpSync(mainDir, nomsDev, { recursive: true });
    writeFileSync(join(nomsDev, NOMS_FICHIER), NOMS_TEST);
    const versions = testVersions(JSON.parse(readFileSync(join(repo, 'versions.json'), 'utf8')));
    const archive = join(tmp, 'archive');
    for (const v of versions.versions.filter((x) => x.status === 'archive')) fakeArchive(archive, v);
    rmSync(www, { recursive: true, force: true });
    const main = { branch: 'main', sha: 'fedcba9876543210fedcba9876543210fedcba98', date: '2026-11-02T10:00:00Z' };
    const dev = { sha: DEV_SHA, date: DEV_DATE };
    assembleSite({ mainDir, devDir: mainDir, archiveDir: archive, versions, out: join(www, 'full'), main, dev, genere: GENERE });
    assembleSite({ mainDir, versions, out: join(www, 'bare'), main, genere: GENERE });
    assembleSite({ mainDir, devDir: nomsDev, archiveDir: archive, versions, out: join(www, 'noms'), main, dev, genere: GENERE });
    const many = manyVersions();
    const manyArchive = join(tmp, 'archive-many');
    for (const v of many.versions.filter((x) => x.status === 'archive')) fakeArchive(manyArchive, v);
    assembleSite({ mainDir, devDir: mainDir, archiveDir: manyArchive, versions: many, out: join(www, 'many'), main, dev, genere: GENERE });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || process.cwd();
  const www = join(tmpdir(), `zs-e2e-www-${process.pid}`);
  buildTestSites(repo, www);
  const server = await startServer({ root: www, port: Number(process.env.PORT_SITE) || 4174, base: '/' });
  const stop = () => {
    server.close();
    rmSync(www, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
