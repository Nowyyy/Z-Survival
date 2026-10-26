// Logique pure des lots : nom, tri, dernier lot, anciens lots. Aucun DOM, réseau ni horloge.
const LOT_RE = /^lot-(\d+)([a-z]*)$/;

export function parseLot(name) {
  const m = typeof name === 'string' ? LOT_RE.exec(name) : null;
  return m ? { num: Number(m[1]), suffix: m[2] } : null;
}

// Ordre naturel : lot-0 < lot-0b < lot-1 < lot-2 < lot-10.
export function compareLots(a, b) {
  const pa = parseLot(a);
  const pb = parseLot(b);
  if (!pa || !pb) throw new RangeError('Nom de lot invalide');
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.suffix < pb.suffix ? -1 : pa.suffix > pb.suffix ? 1 : 0;
}

export function sortLots(lots) {
  return (Array.isArray(lots) ? lots : [])
    .filter((lot) => parseLot(lot?.name))
    .sort((a, b) => compareLots(a.name, b.name));
}

// Dernier lot, et anciens lots du plus récent au plus ancien.
export function splitLots(lots) {
  const sorted = sortLots(lots);
  return { latest: sorted.at(-1) ?? null, previous: sorted.slice(0, -1).reverse() };
}

export function lotLabel(name) {
  const p = parseLot(name);
  return p ? `Lot ${p.num}${p.suffix}` : String(name);
}

// Page d'aperçu d'un lot : première ligne de apercu.txt (caractères A-Za-z0-9._/-, sans « .. » ni « / » initial). Sinon '' (racine du lot).
export function parseEntry(text) {
  const first = typeof text === 'string' ? text.split(/\r?\n/, 1)[0].trim() : '';
  return /^[A-Za-z0-9._/-]+$/.test(first) && !first.includes('..') && !first.startsWith('/') ? first : '';
}

// Adresse relative d'un lot depuis /dev/ : le dossier du lot, suivi de sa page d'aperçu si elle existe.
export function lotUrl(lot) {
  return `../lots/${lot?.name}/${parseEntry(lot?.entry)}`;
}
