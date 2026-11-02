// Vérificateur des archives (lot 4c), Node natif + Playwright (devDependency déjà présente) pour le chargement.
// node scripts/versions/verifier.mjs [--dir <dossier contenant v0.N/>] [--ref archive] [--ids v0.1,v0.2] [--no-browser] [--json <fichier>]
// Sans --dir : le contenu de la branche archive (origin/archive, sinon archive) est extrait par git archive dans un dossier temporaire.
// Contrôles par version : dossier présent, page d'entrée présente, build-info.json cohérent, aucun fichier de plus de 50 Mo, taille totale,
// liens non relatifs ; puis chargement dans Chromium sous un sous-dossier (/Z-Survival/v0.N/) : ressources manquantes, erreurs de console.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { labelOf, validateVersions } from './schema.mjs';
import { scanDir } from './links.mjs';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const BASE = '/Z-Survival/';

// Contrôles sans navigateur d'un dossier de version. Renvoie { id, ok, problems[], bytes, files, links, tooLarge, info }.
export function checkVersionDir(root, version, { maxFileBytes = MAX_FILE_BYTES } = {}) {
  const dir = join(root, version.id);
  const result = { id: version.id, label: labelOf(version.id), entry: version.entry, ok: false, problems: [], bytes: 0, files: 0, links: [], tooLarge: [], info: null };
  if (!existsSync(dir)) {
    result.problems.push(`dossier ${version.id}/ absent`);
    return result;
  }
  if (!existsSync(join(dir, version.entry))) result.problems.push(`page d'entrée ${version.entry} absente`);
  try {
    result.info = JSON.parse(readFileSync(join(dir, 'build-info.json'), 'utf8'));
    if (result.info.channel !== 'archive') result.problems.push('build-info.json : channel « archive » attendu');
    if (result.info.version !== result.label) result.problems.push(`build-info.json : version ${result.info.version} ≠ ${result.label}`);
    if (version.ref && result.info.ref !== version.ref) result.problems.push('build-info.json : ref différente de versions.json');
  } catch {
    result.problems.push('build-info.json absent ou illisible');
  }
  const scan = scanDir(dir, { maxFileBytes });
  Object.assign(result, { bytes: scan.totalBytes, files: scan.files, links: scan.links, tooLarge: scan.tooLarge });
  for (const big of scan.tooLarge) result.problems.push(`fichier de plus de 50 Mo : ${big.path}`);
  for (const link of scan.links.filter((l) => l.type !== 'external')) result.problems.push(`lien non relatif : ${link.file} → ${link.url}`);
  result.ok = result.problems.length === 0;
  return result;
}

// Versions à vérifier : celles de statut « archive » (ou la liste demandée).
export function selectVersions(data, ids = null) {
  const check = validateVersions(data);
  if (!check.ok) throw new Error(`versions.json invalide : ${check.errors.join(' ; ')}`);
  const wanted = data.versions.filter((v) => v.status === 'archive');
  return ids ? wanted.filter((v) => ids.includes(v.id)) : wanted;
}

// Extraction du contenu de la branche archive dans un dossier temporaire.
export function extractArchive(repo, ref, dest) {
  const tar = spawnSync('git', ['-C', repo, 'archive', '--format=tar', ref], { maxBuffer: 2 ** 31 });
  if (tar.status !== 0) throw new Error(`git archive ${ref} : ${String(tar.stderr).trim()}`);
  const untar = spawnSync('tar', ['-x', '-C', dest], { input: tar.stdout });
  if (untar.status !== 0) throw new Error('tar -x a échoué');
}

// Chargement d'une page dans Chromium : ressources en échec (réseau ou statut ≥ 400), erreurs de console et de page, requêtes externes.
export async function loadPage(browser, url, { settleMs = 4000 } = {}) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
  const origin = new URL(url).origin;
  const missing = [];
  const consoleErrors = [];
  const external = [];
  page.on('requestfailed', (r) => missing.push(`${r.url()} (${r.failure()?.errorText ?? 'échec'})`));
  page.on('response', (r) => r.status() >= 400 && missing.push(`${r.status()} ${r.url()}`));
  page.on('request', (r) => !r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror : ${e.message.slice(0, 200)}`));
  let status = 0;
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    status = response?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(settleMs);
  } catch (error) {
    consoleErrors.push(`navigation : ${error.message.split('\n')[0]}`);
  }
  const webgl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  }).catch(() => false);
  await page.close();
  return { url, status, missing: [...new Set(missing)], consoleErrors, external: [...new Set(external)], webgl };
}

const mo = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

// Tableau Markdown pour le propriétaire.
export function markdownTable(results) {
  const rows = ['| Version | Entrée | Taille | Fichiers | Ressources manquantes | Erreurs de console | Liens non relatifs | Contrôles |', '|---|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const missing = r.loads ? r.loads.reduce((n, l) => n + l.missing.length, 0) : '—';
    const errors = r.loads ? r.loads.reduce((n, l) => n + l.consoleErrors.length, 0) : '—';
    rows.push(`| ${r.label} | \`${r.id}/${r.entry}\` | ${mo(r.bytes)} | ${r.files} | ${missing} | ${errors} | ${r.links.filter((l) => l.type !== 'external').length} | ${r.ok ? 'OK' : r.problems.join(' ; ')} |`);
  }
  return rows.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  const data = JSON.parse(readFileSync(resolve(get('--versions') ?? 'versions.json'), 'utf8'));
  const versions = selectVersions(data, get('--ids')?.split(',') ?? null);
  let root = get('--dir');
  let tmp = null;
  if (!root) {
    tmp = mkdtempSync(join(tmpdir(), 'zs-verif-'));
    const remoteRef = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/archive']).status === 0;
    extractArchive(repo, get('--ref') ?? (remoteRef ? 'refs/remotes/origin/archive' : 'refs/heads/archive'), tmp);
    root = tmp;
  }
  const results = versions.map((v) => checkVersionDir(root, v));
  if (!argv.includes('--no-browser')) {
    const { startServer } = await import('../site/serve.mjs');
    const { chromium } = await import('@playwright/test');
    const server = await startServer({ root, port: 0, base: BASE, quiet: true });
    const origin = `http://127.0.0.1:${server.address().port}${BASE}`;
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
      for (const r of results) {
        if (!existsSync(join(root, r.id))) continue;
        r.loads = [];
        for (const path of [...new Set([r.entry, ''])]) r.loads.push(await loadPage(browser, `${origin}${r.id}/${path}`));
        for (const load of r.loads) {
          if (load.status !== 200) r.problems.push(`${load.url} : statut ${load.status}`);
          for (const m of load.missing) r.problems.push(`ressource manquante : ${m}`);
        }
        r.ok = r.problems.length === 0;
      }
    } finally {
      await browser.close();
      server.close();
    }
  }
  console.log(markdownTable(results));
  for (const r of results) {
    for (const load of r.loads ?? []) {
      if (load.consoleErrors.length || load.missing.length || load.external.length) {
        console.log(`\n${load.url} (WebGL : ${load.webgl ? 'oui' : 'non'})`);
        for (const m of load.missing) console.log(`  manquant : ${m}`);
        for (const e of load.consoleErrors) console.log(`  console : ${e}`);
        for (const e of load.external) console.log(`  externe : ${e}`);
      }
    }
  }
  if (get('--json')) writeFileSync(get('--json'), `${JSON.stringify(results, null, 2)}\n`);
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
