// Logique pure des noms de lots : nom, ordre, page d'aperçu. Aucun DOM, réseau ni horloge.
// Lot 4c : les aperçus par lot (/lots/lot-N/, lots.json) sont retirés du site ; il ne reste que ce qu'utilisent le journal de /dev (parseLot) et
// les tests de données (parseEntry : première ligne d'apercu.txt). Retirés : sortLots, splitLots, lotLabel, parseName, lotUrl.
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

// Page d'aperçu d'une branche : première ligne de apercu.txt (caractères A-Za-z0-9._/-, sans « .. » ni « / » initial). Sinon ''.
export function parseEntry(text) {
  const first = typeof text === 'string' ? text.split(/\r?\n/, 1)[0].trim() : '';
  return /^[A-Za-z0-9._/-]+$/.test(first) && !first.includes('..') && !first.startsWith('/') ? first : '';
}
