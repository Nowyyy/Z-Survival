// Logique pure des lots : nom, tri, dernier lot, anciens lots. Aucun DOM, réseau ni horloge.
const LOT_RE = /^lot-(\d+)([a-z]*)$/;

export function parseLot(name) {
  const m = typeof name === 'string' ? LOT_RE.exec(name) : null;
  return m ? { num: Number(m[1]), suffix: m[2] } : null;
}

// Ordre naturel : lot-0 < lot-0b < lot-1 < lot-2 < lot-10 (sortLots départage les suffixes d'un même numéro par la date).
export function compareLots(a, b) {
  const pa = parseLot(a);
  const pb = parseLot(b);
  if (!pa || !pb) throw new RangeError('Nom de lot invalide');
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.suffix < pb.suffix ? -1 : pa.suffix > pb.suffix ? 1 : 0;
}

// Même numéro (lot-1m puis lot-1b) : l'ordre des suffixes ne dit pas lequel est le plus récent, la date du dernier commit le dit.
// Sans dates valides, on retombe sur l'ordre alphabétique des suffixes.
export function sortLots(lots) {
  const time = (lot) => (typeof lot?.date === 'string' ? Date.parse(lot.date) : NaN);
  return (Array.isArray(lots) ? lots : [])
    .filter((lot) => parseLot(lot?.name))
    .sort((a, b) => {
      const same = parseLot(a.name).num === parseLot(b.name).num;
      const ta = time(a);
      const tb = time(b);
      if (same && Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return compareLots(a.name, b.name);
    });
}

// Dernier lot, et anciens lots du plus récent au plus ancien.
export function splitLots(lots) {
  const sorted = sortLots(lots);
  return { latest: sorted.at(-1) ?? null, previous: sorted.slice(0, -1).reverse() };
}

// Nom affiché d'un lot : `nom` (ligne « nom: » de son apercu.txt, voir parseName) s'il est donné, sinon « Lot 4b » d'après le nom de la branche.
export function lotLabel(name, nom = '') {
  const shown = parseName(`nom: ${nom ?? ''}`);
  if (shown) return shown;
  const p = parseLot(name);
  return p ? `Lot ${p.num}${p.suffix}` : String(name);
}

// Nom d'affichage facultatif d'un lot (lot 4b : « V0.1 ») : ligne « nom: … » de apercu.txt, 1 à 24 lettres, chiffres, espaces, points, tirets ou soulignés ;
// sinon '' (le nom de la branche reste l'adresse : lots/<branche>/).
export function parseName(text) {
  const line = typeof text === 'string' ? text.split(/\r?\n/).find((l) => /^\s*nom\s*:/i.test(l)) : undefined;
  const value = line ? line.replace(/^\s*nom\s*:/i, '').trim() : '';
  return /^[\p{L}\p{N} ._-]{1,24}$/u.test(value) ? value : '';
}

// Page d'aperçu d'un lot : première ligne de apercu.txt (caractères A-Za-z0-9._/-, sans « .. » ni « / » initial). Sinon '' (racine du lot).
export function parseEntry(text) {
  const first = typeof text === 'string' ? text.split(/\r?\n/, 1)[0].trim() : '';
  return /^[A-Za-z0-9._/-]+$/.test(first) && !first.includes('..') && !first.startsWith('/') ? first : '';
}

// Adresse relative d'un lot depuis /dev/ : le dossier du lot, suivi de sa page d'aperçu si elle existe.
export function lotUrl(lot, root = '../') {
  return `${root}lots/${lot?.name}/${parseEntry(lot?.entry)}`;
}
