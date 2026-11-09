// Accueil de la Recette (lot 4c ; refait au lot 5g ; retouché au lot 5i : carte de la version actuelle, « Jouer - <étiquette> ») : logique pure, sans DOM, réseau ni horloge. Construit le modèle de la page d'après site-info.json
// (écrit par l'assembleur dans Recette/ : scripts/site/site-info.mjs). Les données sont revérifiées ici : un champ invalide est ignoré, jamais affiché
// tel quel ; les textes sont insérés par textContent (main.js), jamais comme du HTML ; les adresses sont toutes relatives et construites ici.
// États : « ok » (site assemblé), « source » (site-info.json de l'arbre du dépôt servi en local), « error » (fichier absent ou invalide) ;
// dans les deux derniers cas, la page garde ses liens statiques : « Jouer » (jeu.html) et « Dernier build de développement » (../dev/jeu.html).
export const DEV_HREF = '../dev/jeu.html';
export const MAX_EVOLUTIONS = 20;
export const MAX_PREVIOUS = 200;
// Lot 5i : description d'une version jusqu'à 200 caractères (borne de « description » du fichier des noms ; avant : 120, comme versions.json).
export const MAX_DESCRIPTION = 200;
// Lot 5i : étiquette du bouton « Jouer - <étiquette> » : celle de la Recette si elle fait 20 caractères au plus, sinon « V<id> ».
export const MAX_PLAY_LABEL = 20;
const ID_RE = /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const VERSION_RE = /^v\d+\.\d+$/;
const SHA_RE = /^[0-9a-f]{7}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Étiquette d'une version (lot 5h) : sans les espaces des extrémités, de 1 à 60 caractères, aucun caractère de contrôle ; sinon null (repli sur « V<id> »).
// Même règle que scripts/site/site-info.mjs (validLabel).
export function validLabel(value) {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  const length = [...label].length;
  return length >= 1 && length <= 60 && ![...label].some((c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159)) ? label : null;
}

// Texte d'une donnée : chaîne seulement, caractères de contrôle remplacés, espaces resserrées, borné.
export function text(value, max = 300) {
  if (typeof value !== 'string') return '';
  const flat = [...value].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/\s+/g, ' ').trim();
  return [...flat].slice(0, max).join('');
}

// Chemin relatif sûr : lettres, chiffres, « . _ - / », sans « .. », « // », « / » initial ni schéma.
export function safePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(path)) return null;
  if (path.startsWith('/') || path.startsWith('.') || path.includes('//') || path.endsWith('/') || path.split('/').some((part) => part === '..' || part === '.')) return null;
  return path;
}

// Entrée d'une version précédente : exactement « ../v0.N/<chemin sûr> » pour son propre identifiant.
export function previousHref(id, entry) {
  const prefix = `../${id}/`;
  return typeof entry === 'string' && entry.startsWith(prefix) && safePath(entry.slice(prefix.length)) ? entry : null;
}

export function readEvolutions(list) {
  return (Array.isArray(list) ? list : []).filter(isObject).map((e) => ({ title: text(e.title, 120), text: text(e.text, 300), version: VERSION_RE.test(e.version ?? '') ? e.version : '' }))
    .filter((e) => e.title && e.text && e.version).slice(0, MAX_EVOLUTIONS);
}

export function readPrevious(list) {
  return (Array.isArray(list) ? list : []).filter((p) => isObject(p) && ID_RE.test(p.id ?? '')).slice(0, MAX_PREVIOUS).map((p) => {
    const href = p.status === 'archive' ? previousHref(p.id, p.entry) : null;
    return { id: p.id, label: validLabel(p.label) ?? `V${p.id.slice(1)}`, title: text(p.title, MAX_DESCRIPTION), href, note: href ? '' : text(p.note, 300) };
  });
}

// Étiquette du bouton « Jouer » (lot 5i) : étiquette valide de 20 caractères au plus, sinon « V<id> ».
export function playLabel(label, id) {
  const valid = validLabel(label);
  return valid && [...valid].length <= MAX_PLAY_LABEL ? valid : `V${id.slice(1)}`;
}

// Modèle de la page. current : carte de la version Recette (étiquette et description complète, '' si absente) ; playLabel : étiquette du bouton.
export function homeModel(info) {
  const base = { play: 'jeu.html', dev: { present: true, href: DEV_HREF, sha: '', date: '' }, evolutions: [], previous: [], version: '', playLabel: '', current: null };
  if (isObject(info) && info.schema === 1 && info.source === true) return { ...base, state: 'source' };
  const recette = isObject(info) && info.schema === 1 && isObject(info.recette) && ID_RE.test(info.recette.id ?? '') ? info.recette : null;
  if (!recette) return { ...base, state: 'error' };
  const dev = isObject(info.dev) ? info.dev : {};
  const present = dev.present === true;
  return {
    state: 'ok',
    version: validLabel(recette.label) ?? `V${recette.id.slice(1)}`,
    playLabel: playLabel(recette.label, recette.id),
    current: { label: validLabel(recette.label) ?? `V${recette.id.slice(1)}`, title: text(recette.title, MAX_DESCRIPTION) },
    play: safePath(recette.entry) ?? 'jeu.html',
    dev: { present, href: DEV_HREF, sha: present && SHA_RE.test(dev.sha ?? '') ? dev.sha : '', date: present ? text(dev.date, 30) : '' },
    evolutions: present ? readEvolutions(info.evolutions) : [],
    previous: readPrevious(info.precedentes),
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
