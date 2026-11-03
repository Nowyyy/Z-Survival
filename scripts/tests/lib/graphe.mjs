// Lot 4e-B — Graphe des dépendances entre fichiers sources (pur : reçoit le chemin et le contenu, rend des chemins relatifs à la racine).
// Relève : imports statiques et dynamiques, new URL('…', import.meta.url), chaînes « data/…json » et « css/…css » (lues par fetch ou fs),
// scripts et feuilles des pages HTML. Sert au contrôle de tests/selection.json : une zone qui lit le fichier d'une autre zone doit la
// déclarer dans ses dépendances.
import { posix } from 'node:path';

const norm = (p) => posix.normalize(p).replace(/^\.\//, '');

export function referencesDe(chemin, source) {
  const dir = posix.dirname(chemin);
  const out = new Set();
  const rel = (spec) => {
    if (/^(?:https?:|data:|#|\/\/)/.test(spec)) return;
    if (spec.startsWith('./') || spec.startsWith('../')) out.add(norm(posix.join(dir, spec)));
    else if (/^(?:js|css|data|dev|fonts|vendor)\//.test(spec)) out.add(norm(spec));
  };
  for (const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new URL\(\s*)['"]([^'"]+)['"]/g)) rel(m[1]);
  for (const m of source.matchAll(/['"`]((?:\.\.\/)*(?:data\/[\w./-]+\.(?:json|txt)|css\/[\w.-]+\.css))['"`]/g)) rel(m[1]);
  if (chemin.endsWith('.html')) {
    for (const m of source.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) rel(m[1]);
    for (const m of source.matchAll(/"[\w/.-]+":\s*"([^"]+)"/g)) rel(m[1]); // importmap
  }
  out.delete(chemin);
  return [...out].filter((p) => !p.endsWith('/') && !p.includes('${'));
}

// Zone d'un chemin d'après la table (première zone dont un motif correspond), ou null.
export function zonesDuChemin(table, chemin, correspond) {
  return (table.zones ?? []).filter((z) => correspond(chemin, z.sources)).map((z) => z.id);
}

// Dépendances réelles entre zones : pour chaque fichier source d'une zone A qui lit un fichier d'une zone B (B ≠ A), l'arête A → B,
// avec un exemple de fichier pour l'expliquer. fichiers : { chemin: contenu }. Une zone marquée « graphe: false » (outillage qui cite
// des chemins comme données, par exemple les cassures du sabotage) n'a pas d'arêtes sortantes.
export function aretesEntreZones(table, fichiers, correspond) {
  const out = new Map();
  for (const [chemin, source] of Object.entries(fichiers)) {
    const za = zonesDuChemin(table, chemin, correspond).filter((id) => table.zones.find((z) => z.id === id)?.graphe !== false);
    if (!za.length) continue;
    for (const ref of referencesDe(chemin, source)) {
      for (const b of zonesDuChemin(table, ref, correspond)) {
        for (const a of za) {
          if (a === b || za.includes(b)) continue;
          const k = `${a}>${b}`;
          if (!out.has(k)) out.set(k, { de: a, vers: b, exemple: `${chemin} → ${ref}` });
        }
      }
    }
  }
  return [...out.values()];
}
