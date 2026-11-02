// Serveur statique local (lot 4c), Node natif, sans dépendance : sert un dossier (par défaut _site/) pour vérifier le site assemblé ou une archive.
// Usage : node scripts/site/serve.mjs [--root _site] [--port 4180] [--base /Z-Survival/]
//  --base : préfixe d'adresse simulé (comme GitHub Pages sous /<dépôt>/) ; hors du préfixe, 404 : un lien absolu vers « / » est ainsi détecté.
// Le serveur ne sert que des fichiers sous la racine (aucune remontée), redirige un dossier sans « / » final et sert index.html d'un dossier.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.xml': 'application/xml',
};

// Normalise un préfixe : '' ou '/x/'.
export function normalizeBase(base = '/') {
  const trimmed = String(base ?? '/').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

// Résout l'adresse demandée en chemin de fichier sous root, ou null (hors préfixe, remontée, octet nul).
export function resolveRequest(root, base, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const prefix = normalizeBase(base);
  if (prefix !== '/') {
    if (pathname === prefix.slice(0, -1)) return { redirect: prefix };
    if (!pathname.startsWith(prefix)) return null;
    pathname = `/${pathname.slice(prefix.length)}`;
  }
  const rootAbs = resolve(root);
  const file = resolve(rootAbs, `.${pathname}`);
  if (file !== rootAbs && !file.startsWith(rootAbs + sep)) return null;
  return { file, dir: pathname.endsWith('/'), pathname };
}

export function startServer({ root = '_site', port = 4180, base = '/', quiet = false } = {}) {
  const server = createServer(async (req, res) => {
    const target = resolveRequest(root, base, req.url);
    if (!target) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    if (target.redirect) {
      res.writeHead(301, { Location: target.redirect }).end();
      return;
    }
    let file = target.file;
    try {
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        if (!target.dir) {
          const location = new URL(req.url, 'http://localhost');
          res.writeHead(301, { Location: `${location.pathname}/${location.search}` }).end();
          return;
        }
        file = join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      if (!quiet) console.log(`http://localhost:${server.address().port}${normalizeBase(base)} → ${resolve(root)}`);
      resolveStart(server);
    });
  });
}

export function parseArgs(argv) {
  const options = { root: '_site', port: 4180, base: '/' };
  for (let i = 0; i < argv.length; i += 1) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === '--root') options.root = value;
    else if (key === '--port') options.port = Number(value);
    else if (key === '--base') options.base = value;
    else continue;
    i += 1;
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new RangeError('Port invalide');
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = parseArgs(process.argv.slice(2));
  if (process.env.PORT) options.port = Number(process.env.PORT);
  await startServer(options);
}
