// site-info.json (lot 5g) : ce que l'accueil de la Recette (/Recette/) affiche, écrit par l'assembleur dans Recette/.
// Module pur : aucun accès disque, réseau ni horloge (la date « genere » est fournie par l'appelant).
// Forme :
//   { schema: 1, genere: "<date UTC>",
//     recette: { id, label, title, date, ref, entry },
//     dev: { present, sha, date, entry: "../dev/jeu.html" },
//     evolutions: [{ id, title, text, date, version }],        // lots du journal de dev dont la version n'est pas encore publiée, la plus récente en haut
//     precedentes: [{ id, label, title, note, entry, status }] } // toutes les versions sauf la Recette, la plus récente en haut
// Les textes viennent de fichiers de données (versions.json, data/changelog.json) : ils sont nettoyés et bornés, jamais interprétés comme du HTML
// (l'accueil les insère par textContent).

export const SITE_INFO_SCHEMA = 1;
export const MAX_EVOLUTIONS = 20;
export const MAX_TITLE = 120;
export const MAX_TEXT = 300;
export const DEV_ENTRY = '../dev/jeu.html';
export const VERSION_RE = /^v\d+\.\d+$/;
const ID_RE = /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const LOT_RE = /^lot-\d+[a-z]?$/;
const SHA_RE = /^[0-9a-f]{7}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ENTRY_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const STATUSES = ['archive', 'indisponible'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Texte d'une donnée : chaîne seulement, caractères de contrôle remplacés par une espace, espaces resserrées, borné (sans couper un caractère).
export function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return '';
  const flat = [...value].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : flat;
}

const validDay = (value) => {
  const time = typeof value === 'string' && DAY_RE.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const safeEntry = (value) => typeof value === 'string' && value.length <= 200 && ENTRY_RE.test(value) && !value.split('/').some((p) => p === '.' || p === '..');
const versionKey = (id) => id.slice(1).split('.').map(Number);
const newestFirst = (a, b) => {
  const [x, y] = [versionKey(a.id), versionKey(b.id)];
  return y[0] - x[0] || y[1] - x[1];
};

// Évolutions : entrées de « lots » du journal du build de dev dont « version » est une version valide pas encore publiée (absente de publishedIds).
// Les entrées invalides (nom, titre vide, version absente ou mal formée, premier point manquant) sont ignorées ; la plus récente (fin du fichier) en haut.
export function readEvolutions(changelog, publishedIds, max = MAX_EVOLUTIONS) {
  const lots = isObject(changelog) && Array.isArray(changelog.lots) ? changelog.lots : [];
  const published = new Set(publishedIds);
  const seen = new Set();
  const out = [];
  for (const entry of [...lots].reverse()) {
    if (out.length >= max) break;
    if (!isObject(entry) || typeof entry.name !== 'string' || !LOT_RE.test(entry.name) || seen.has(entry.name)) continue;
    if (typeof entry.version !== 'string' || !VERSION_RE.test(entry.version) || published.has(entry.version)) continue;
    const title = cleanText(entry.titre, MAX_TITLE);
    const text = cleanText(Array.isArray(entry.points) ? entry.points[0] : '', MAX_TEXT);
    if (title.length < 3 || !text) continue;
    seen.add(entry.name);
    out.push({ id: entry.name, title, text, date: validDay(entry.date) ? entry.date : '', version: entry.version });
  }
  return out;
}

// Versions précédentes : toutes les versions publiées sauf la Recette, la plus récente en haut. versions = versions.json tel qu'il est publié
// (après contrôle des archives : une archive absente y est déjà « indisponible »).
export function readPrevious(versions, recetteId) {
  const list = isObject(versions) && Array.isArray(versions.versions) ? versions.versions : [];
  return list.filter((v) => isObject(v) && typeof v.id === 'string' && ID_RE.test(v.id) && v.id !== recetteId).sort(newestFirst).map((v) => {
    const available = v.status === 'archive' && safeEntry(v.entry);
    return {
      id: v.id,
      label: `V${v.id.slice(1)}`,
      title: cleanText(v.title, MAX_TITLE),
      note: available ? '' : cleanText(v.note, MAX_TEXT) || 'Version non construite.',
      entry: available ? `../${v.id}/${v.entry}` : null,
      status: available ? 'archive' : 'indisponible',
    };
  });
}

// site-info.json complet. versions : versions.json publié ; dev : { present, sha, date } (build-info.json du build de dev) ; changelog : journal du build de dev.
export function buildSiteInfo({ versions, dev = {}, changelog = null, genere }) {
  const current = isObject(versions) && Array.isArray(versions.versions) ? versions.versions.find((v) => isObject(v) && v.id === versions.latest && v.status === 'actuelle') : null;
  const ids = (versions?.versions ?? []).filter(isObject).map((v) => v.id);
  const present = dev.present === true;
  return {
    schema: SITE_INFO_SCHEMA,
    genere,
    recette: current
      ? { id: current.id, label: `V${current.id.slice(1)}`, title: cleanText(current.title, MAX_TITLE), date: validDay(current.date) ? current.date : '', ref: typeof current.ref === 'string' ? current.ref : '', entry: current.entry }
      : null,
    dev: { present, sha: present && SHA_RE.test(dev.sha ?? '') ? dev.sha : '', date: present && UTC_RE.test(dev.date ?? '') ? dev.date : '', entry: DEV_ENTRY },
    evolutions: present ? readEvolutions(changelog, ids) : [],
    precedentes: current ? readPrevious(versions, current.id) : [],
  };
}

// Contrôle de la forme (l'assembleur échoue si le fichier qu'il va écrire est invalide). Renvoie { ok, errors }.
export function validateSiteInfo(info) {
  const errors = [];
  const text = (value, max) => typeof value === 'string' && [...value].length <= max && ![...value].some((c) => c.charCodeAt(0) < 32);
  if (!isObject(info)) return { ok: false, errors: ['objet attendu'] };
  if (info.schema !== SITE_INFO_SCHEMA) errors.push('schema : 1 attendu');
  if (typeof info.genere !== 'string' || !UTC_RE.test(info.genere)) errors.push('genere : date UTC attendue (AAAA-MM-JJTHH:MM:SSZ)');
  const r = info.recette;
  if (!isObject(r)) errors.push('recette : objet attendu');
  else {
    if (!ID_RE.test(r.id ?? '') || r.label !== `V${String(r.id).slice(1)}`) errors.push('recette : id ou label invalide');
    if (!text(r.title, MAX_TITLE) || !r.title) errors.push('recette : title invalide');
    if (!safeEntry(r.entry)) errors.push('recette : entry invalide');
    if (r.date !== '' && !validDay(r.date)) errors.push('recette : date invalide');
    if (!/^[0-9a-f]{40}$/.test(r.ref ?? '')) errors.push('recette : ref invalide');
  }
  const d = info.dev;
  if (!isObject(d) || typeof d.present !== 'boolean' || d.entry !== DEV_ENTRY) errors.push('dev : { present, sha, date, entry } attendu');
  else {
    if (d.sha !== '' && !(d.present && SHA_RE.test(d.sha ?? ''))) errors.push('dev : sha invalide (7 caractères hexadécimaux, vide sans build de dev)');
    if (d.date !== '' && !(d.present && UTC_RE.test(d.date ?? ''))) errors.push('dev : date invalide');
  }
  if (!Array.isArray(info.evolutions) || info.evolutions.length > MAX_EVOLUTIONS) errors.push(`evolutions : liste de ${MAX_EVOLUTIONS} au plus attendue`);
  else info.evolutions.forEach((e, i) => {
    if (!isObject(e) || !LOT_RE.test(e.id ?? '') || !text(e.title, MAX_TITLE) || !e.title || !text(e.text, MAX_TEXT) || !e.text || !VERSION_RE.test(e.version ?? '') || (e.date !== '' && !validDay(e.date))) errors.push(`evolutions[${i}] invalide`);
  });
  if (!Array.isArray(info.precedentes)) errors.push('precedentes : liste attendue');
  else info.precedentes.forEach((p, i) => {
    const okEntry = p?.status === 'archive' ? typeof p.entry === 'string' && p.entry.startsWith(`../${p.id}/`) && safeEntry(p.entry.slice(3)) : p?.entry === null;
    if (!isObject(p) || !ID_RE.test(p.id ?? '') || p.label !== `V${String(p.id).slice(1)}` || !STATUSES.includes(p.status) || !okEntry || !text(p.title, MAX_TITLE) || !text(p.note, MAX_TEXT)) errors.push(`precedentes[${i}] invalide`);
  });
  return { ok: errors.length === 0, errors };
}
