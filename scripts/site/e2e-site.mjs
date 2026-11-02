// Site assemblé de test pour Playwright (lot 4c, tests/e2e/publication.spec.js), servi sur http://localhost:4174/ (PORT_SITE pour changer).
// Construit depuis l'arbre de travail courant (copie dans un dossier temporaire, puis scripts/build.mjs) — jamais dans _site/ du dépôt —, puis assemble deux sites :
//  - full/ : racine (build courant), next/ (le même build, canal dev), archives FICTIVES v0.2 à v0.4 (pages de test), v0.1 indisponible (jeu de versions de test) ;
//  - bare/ : racine seule (ni dev, ni archive) : « Aucun build de développement pour l'instant », versions publiées « indisponibles ».
// Chaque site vit dans un sous-dossier, comme le site publié sous /Z-Survival/. Les données de version sont fictives et annoncées comme telles.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assembleSite } from '../assemble.mjs';
import { startServer } from './serve.mjs';

const SKIP = new Set(['.git', 'node_modules', '_site', '.lots', 'Docs', 'tests', 'test-results', 'playwright-report', 'lighthouse-report', 'blob-report', 'coverage']);
export const DEV_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
export const DEV_DATE = '2026-11-02T12:00:00Z';

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

// Archive fictive : une page d'entrée, une feuille de style et un module, tous en chemins relatifs, et build-info.json.
export function fakeArchive(dir, version) {
  const root = join(dir, version.id);
  mkdirSync(join(root, 'css'), { recursive: true });
  mkdirSync(join(root, 'js'), { recursive: true });
  writeFileSync(join(root, version.entry), `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${version.label} (archive de test)</title><link rel="stylesheet" href="css/style.css"><script type="module" src="js/main.js"></script></head>\n<body><main><h1>${version.label}</h1><p>Archive de test (fictive).</p><p id="loaded"></p></main></body></html>\n`);
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
    const versions = testVersions(JSON.parse(readFileSync(join(repo, 'versions.json'), 'utf8')));
    const archive = join(tmp, 'archive');
    for (const v of versions.versions.filter((x) => x.status === 'archive')) fakeArchive(archive, v);
    rmSync(www, { recursive: true, force: true });
    const main = { branch: 'main', sha: 'fedcba9876543210fedcba9876543210fedcba98', date: '2026-11-02T10:00:00Z' };
    assembleSite({ mainDir, devDir: mainDir, archiveDir: archive, versions, out: join(www, 'full'), main, dev: { sha: DEV_SHA, date: DEV_DATE } });
    assembleSite({ mainDir, versions, out: join(www, 'bare'), main });
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
