// Lot 4e-B — Motifs de chemins sans dépendance : « ** » (n'importe quels dossiers), « * » (un nom sans « / »), « ? » (un caractère).
// Un motif qui finit par « / » vise tout le dossier. Chemins relatifs à la racine, séparés par « / ».
const cache = new Map();

export function globVersRegex(motif) {
  if (cache.has(motif)) return cache.get(motif);
  const m = motif.endsWith('/') ? `${motif}**` : motif;
  let re = '';
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '*' && m[i + 1] === '*') {
      i++;
      if (m[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const out = new RegExp(`^${re}$`);
  cache.set(motif, out);
  return out;
}

export const correspond = (chemin, motifs) => (motifs ?? []).some((m) => globVersRegex(m).test(chemin));
