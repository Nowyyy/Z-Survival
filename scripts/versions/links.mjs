// Détection des liens non relatifs dans un site construit (lot 4c) : pur sur le texte, plus un parcours de dossier.
// Un site publié sous /<dépôt>/ et dans des sous-dossiers (/v0.N/, /next/) n'admet que des chemins relatifs : aucune adresse vers « / »,
// aucun « //hôte » (protocole relatif) et aucune adresse vers /Z-Survival/. Les URL complètes (https:) sont des requêtes externes, signalées aussi.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const PATTERNS = {
  html: [/\b(?:href|src|action|poster|data)\s*=\s*["']([^"']*)["']/gi, /\bsrcset\s*=\s*["']([^"']*)["']/gi, /url\(\s*["']?([^"')]+)["']?\s*\)/gi],
  css: [/url\(\s*["']?([^"')]+)["']?\s*\)/gi, /@import\s+["']([^"']+)["']/gi],
  js: [/\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g, /\bfetch\(\s*["']([^"']+)["']/g, /\bnew\s+(?:URL|Worker|SharedWorker)\(\s*["']([^"']+)["']/g],
  json: [/"(?:imports|scopes)"\s*:\s*\{([^}]*)\}/g],
};

const KIND = { '.html': 'html', '.htm': 'html', '.css': 'css', '.js': 'js', '.mjs': 'js' };

// Classe une adresse : 'relative' (sûre), 'absolute' (« / » initial), 'protocol-relative' (« // »), 'external' (http:, https:), 'other' (data:, mailto:, #, javascript:…).
export function classifyUrl(url) {
  const value = String(url ?? '').trim();
  if (value === '' || value.startsWith('#') || /^(?:data|blob|mailto|tel|about|javascript):/i.test(value)) return 'other';
  if (value.startsWith('//')) return 'protocol-relative';
  if (value.startsWith('/')) return 'absolute';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return 'external';
  return 'relative';
}

// Adresses trouvées dans un texte selon son type ('html', 'css', 'js').
export function extractUrls(text, kind) {
  const found = [];
  const source = String(text ?? '');
  const patterns = [...(PATTERNS[kind] ?? [])];
  // Une page HTML porte aussi des modules et des styles en ligne, et une importmap.
  if (kind === 'html') patterns.push(...PATTERNS.js, /"(?:\.{0,2}\/[^"]*|[a-z][\w-]*)"\s*:\s*"([^"]+)"/g);
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      const value = match[1];
      if (re.source.includes('srcset')) for (const part of value.split(',')) found.push(part.trim().split(/\s+/)[0]);
      else found.push(value);
    }
  }
  return found.filter((u) => typeof u === 'string' && u.length > 0);
}

// Liens non relatifs d'un texte : [{ url, type }] (type = classe de classifyUrl). Les adresses externes ne sont comptées que si external est vrai.
export function findNonRelative(text, kind, { external = true } = {}) {
  const issues = [];
  for (const url of extractUrls(text, kind)) {
    const type = classifyUrl(url);
    if (type === 'absolute' || type === 'protocol-relative' || (external && type === 'external' && !/^https?:\/\/(?:www\.)?w3\.org\//i.test(url))) issues.push({ url, type });
  }
  return issues;
}

// Parcourt un dossier : fichiers, tailles, liens non relatifs des pages, styles et scripts.
export function scanDir(dir, { maxFileBytes = 50 * 1024 * 1024, external = true } = {}) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else if (info.isFile()) files.push({ path: relative(dir, path).split(sep).join('/'), bytes: info.size });
    }
  };
  walk(dir);
  const links = [];
  for (const file of files) {
    const kind = KIND[extname(file.path).toLowerCase()];
    if (!kind || file.path.startsWith('vendor/')) continue; // vendor/ : bibliothèques tierces non modifiées (Three.js, ancien moteur 2D), jamais chargées par un chemin absolu
    const text = readFileSync(join(dir, file.path), 'utf8');
    for (const issue of findNonRelative(text, kind, { external })) links.push({ file: file.path, ...issue });
  }
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  return { files: files.length, totalBytes, largest: [...files].sort((a, b) => b.bytes - a.bytes)[0] ?? null, tooLarge: files.filter((f) => f.bytes > maxFileBytes), links };
}
