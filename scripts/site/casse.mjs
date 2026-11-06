// Casse des adresses (lot 5h). GitHub Pages distingue la casse et sert 404.html (racine du site publié) pour toute adresse inconnue.
// La page 404 produite par l'assembleur embarque corrigerCasse (le même code que celui testé, recopié par toString) : /recette/… → /Recette/….
// Module pur : aucun accès disque, réseau ni horloge ; jamais d'exception.
//
// Aucun dossier « recette/ » n'est jamais créé : sur Windows et macOS (systèmes de fichiers insensibles à la casse), il entrerait en collision avec
// « Recette/ ». cheminsEnCollision signale toute paire de chemins du site qui ne diffère que par la casse (l'assembleur échoue alors).

// Chemin corrigé (premier segment qui, en minuscules, vaut « recette » sans être exactement « Recette », remplacé par « Recette »), ou null :
// aucune redirection. Chaque correction retire un segment fautif : pas de boucle possible (sur /Recette/…, rien n'est corrigé).
// Écrit sans dépendance ni import (recopié tel quel dans 404.html par toString).
export function corrigerCasse(chemin) {
  if (typeof chemin !== 'string' || chemin.length > 4096) return null;
  const segments = chemin.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i] !== 'Recette' && segments[i].toLowerCase() === 'recette') {
      segments[i] = 'Recette';
      return segments.join('/');
    }
  }
  return null;
}

// Paires de chemins (relatifs, séparés par « / ») qui ne diffèrent que par la casse, à n'importe quel niveau : [[a, b], …].
export function cheminsEnCollision(chemins) {
  const vus = new Map();
  const paires = [];
  const prefixes = new Set();
  for (const chemin of Array.isArray(chemins) ? chemins : []) {
    if (typeof chemin !== 'string') continue;
    const parts = chemin.split('/');
    for (let i = 1; i <= parts.length; i += 1) prefixes.add(parts.slice(0, i).join('/'));
  }
  for (const chemin of [...prefixes].sort()) {
    const cle = chemin.toLowerCase();
    if (vus.has(cle) && vus.get(cle) !== chemin) paires.push([vus.get(cle), chemin]);
    else vus.set(cle, chemin);
  }
  return paires;
}
