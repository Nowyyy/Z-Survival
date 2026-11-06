// Lot 4e-A — Mesure des suites de tests (Node natif, aucune dépendance) : lint, Vitest (rapporteur JSON), suite rapide Playwright
// (rapporteur JSON), suite complète Playwright (E2E_FULL=1, rapporteur JSON). Les sorties brutes vont dans un dossier HORS du dépôt
// (défaut : <tmpdir>/zs-mesure-tests), jamais dans l'arbre de travail. Les étapes s'exécutent l'une après l'autre (jamais Vitest et
// Playwright en parallèle). Les navigations vers les pages (documents .html) sont comptées par un serveur statique de comptage sur le
// port 4173, que Playwright réutilise hors CI (reuseExistingServer) : total réel par étape ; le compte par test est statique (resumer.mjs).
//
// Usage : node scripts/tests/mesurer.mjs [--out <dossier>] [--etapes lint,vitest,rapide,complet] [-- <arguments Playwright>]
//   --etapes : sous-ensemble, dans cet ordre ; défaut : lint,vitest,rapide,complet.
//   Après « -- » : arguments ajoutés aux deux passes Playwright (ex. un fichier, --workers=2).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const dash = argv.indexOf('--');
  const own = dash < 0 ? argv : argv.slice(0, dash);
  const extra = dash < 0 ? [] : argv.slice(dash + 1);
  const opt = { out: join(tmpdir(), 'zs-mesure-tests'), etapes: ['lint', 'vitest', 'rapide', 'complet'], extra };
  for (let i = 0; i < own.length; i++) {
    if (own[i] === '--out') opt.out = resolve(own[++i]);
    else if (own[i] === '--etapes') opt.etapes = own[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (opt.out === ROOT || opt.out.startsWith(`${ROOT}/`)) throw new Error('--out doit être hors du dépôt');
  return opt;
}

function run(cmd, args, env = {}, logFile) {
  return new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('close', (code) => {
      const log = Buffer.concat(chunks).toString('utf8');
      if (logFile) writeFileSync(logFile, log);
      done({ code, ms: Date.now() - t0 });
    });
  });
}

// Serveur statique identique à scripts/serve.mjs, qui compte les documents HTML demandés (une navigation = une page chargée).
function countingServer(port = 4173) {
  const counts = {};
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
    try {
      if (!path.endsWith('/') && statSync(file, { throwIfNoEntry: false })?.isDirectory()) {
        res.writeHead(301, { Location: `${path}/` }).end();
        return;
      }
      const body = readFileSync(file);
      if (extname(file) === '.html') counts[path] = (counts[path] ?? 0) + 1;
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((ok, ko) => {
    server.once('error', ko);
    server.listen(port, () => ok({ counts, close: () => new Promise((c) => server.close(c)) }));
  });
}

async function playwright(name, opt, env) {
  const server = await countingServer();
  const json = join(opt.out, `${name}.json`);
  const r = await run('npx', ['playwright', 'test', '--reporter=dot,json', ...opt.extra], { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: json }, join(opt.out, `${name}.log`));
  await server.close();
  writeFileSync(join(opt.out, `${name}-navigations.json`), `${JSON.stringify(server.counts, null, 2)}\n`);
  return { ...r, json };
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  mkdirSync(opt.out, { recursive: true });
  const meta = { debut: new Date().toISOString(), etapes: {} };
  const save = () => writeFileSync(join(opt.out, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  for (const etape of opt.etapes) {
    const t = new Date().toISOString();
    console.log(`[mesurer] ${t} : ${etape}…`);
    let r;
    if (etape === 'lint') r = await run('npx', ['eslint', '.', '--max-warnings=0'], {}, join(opt.out, 'lint.log'));
    else if (etape === 'vitest') r = await run('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${join(opt.out, 'vitest.json')}`], {}, join(opt.out, 'vitest.log'));
    else if (etape === 'rapide') r = await playwright('rapide', opt, {});
    else if (etape === 'complet') r = await playwright('complet', opt, { E2E_FULL: '1' });
    else throw new Error(`étape inconnue : ${etape}`);
    meta.etapes[etape] = { debut: t, ms: r.ms, code: r.code };
    save();
    console.log(`[mesurer] ${etape} : ${(r.ms / 60000).toFixed(1)} min, code ${r.code}`);
  }
  meta.fin = new Date().toISOString();
  save();
  console.log(`[mesurer] sorties : ${opt.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
