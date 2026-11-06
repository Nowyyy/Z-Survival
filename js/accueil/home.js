// Accueil du site (lot 4c) : logique pure, sans DOM, réseau ni horloge. Construit le modèle de la page d'après versions.json et build-info.json.
// Contextes : « release » (racine du site), « dev » (next/ : bandeau, section Développement masquée, racine du site = ../),
// « source » ou inconnu (arbre du dépôt servi en local) : comme la racine, sans build de développement.
// Libellés affichés : main (racine, « release », et l'arbre source) = « Recette » ; dev (next/) = « Développement ». La production viendra avec un serveur.
const ID_RE = /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const STATUSES = ['actuelle', 'archive', 'indisponible'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 300) => (typeof value === 'string' ? [...value].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').trim().slice(0, max) : '');

// Chemin relatif sûr (même règle que scripts/versions/schema.mjs) : lettres, chiffres, « . _ - / », sans « .. », « // », « / » initial ni schéma.
export function safePath(path, { dir = false } = {}) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(path)) return null;
  if (path.startsWith('/') || path.startsWith('.') || path.includes('//') || path.split('/').some((part) => part === '..' || part === '.')) return null;
  if (path.endsWith('/') !== dir) return null;
  return path;
}

export function labelOf(id) {
  return typeof id === 'string' && ID_RE.test(id) ? `V${id.slice(1)}` : '';
}

// Canal du dossier courant, lu dans son build-info.json.
export function channelOf(info) {
  return isObject(info) && ['release', 'dev', 'archive'].includes(info.channel) ? info.channel : 'source';
}

// Racine du site depuis le dossier courant : next/ est un sous-dossier de la racine.
export function siteRoot(info) {
  return channelOf(info) === 'dev' ? '../' : '';
}

// Hash court et date d'un build-info.json, ou null s'il ne décrit pas un vrai build.
export function buildStamp(info) {
  if (!isObject(info) || !SHA_RE.test(info.sha ?? '')) return null;
  const time = typeof info.date === 'string' ? Date.parse(info.date) : NaN;
  return { sha: info.sha.slice(0, 7), date: Number.isFinite(time) ? new Date(time).toISOString() : '' };
}

// Versions lisibles de versions.json (les entrées invalides sont ignorées, jamais affichées).
export function readVersions(data) {
  const list = isObject(data) && Array.isArray(data.versions) ? data.versions : [];
  return list.filter((v) => isObject(v) && ID_RE.test(v.id ?? '') && STATUSES.includes(v.status)).map((v) => ({
    id: v.id, label: labelOf(v.id), title: text(v.title, 120), date: text(v.date, 10), status: v.status, entry: safePath(v.entry), note: text(v.note),
  }));
}

// Modèle de la page. Les adresses sont toutes relatives au dossier courant.
export function homeModel({ versions = null, info = null, nextInfo = null } = {}) {
  const channel = channelOf(info);
  const root = siteRoot(info);
  const list = readVersions(versions);
  const latestId = isObject(versions) && typeof versions.latest === 'string' ? versions.latest : '';
  const current = list.find((v) => v.id === latestId && v.status === 'actuelle') ?? null;
  const devPath = safePath(versions?.dev?.path, { dir: true }) ?? 'next/';
  const previous = list.filter((v) => v.status !== 'actuelle').reverse().map((v) => ({
    id: v.id, label: v.label, title: v.title, date: v.date, status: v.status === 'archive' && v.entry ? 'archive' : 'indisponible',
    href: v.status === 'archive' && v.entry ? `${root}${v.id}/${v.entry}` : null,
    note: v.status === 'archive' && v.entry ? '' : v.note,
  }));
  return {
    channel,
    channelKey: channel === 'dev' ? 'dev' : 'recette',
    root,
    version: current?.label ?? '',
    play: current?.entry ?? 'jeu.html',
    banner: channel === 'dev' ? buildStamp(info) ?? { sha: '', date: '' } : null,
    devSection: channel === 'dev' ? null : { next: channel === 'release' ? buildStamp(nextInfo) : null, nextHref: `${root}${devPath}` },
    previous,
    devPath,
  };
}

// Date courte en français (fuseau UTC, pour ne pas dépendre de l'appareil) ; '' si invalide.
export function formatDate(iso, lang = 'fr') {
  const time = typeof iso === 'string' && iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(time)) : '';
}

// Remplace {clé} dans un texte traduit.
export function fill(template, values) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}
