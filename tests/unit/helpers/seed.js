// Garde-fou de Docs/seed.md (lot 5b) : le fichier appartient au propriétaire, qui le met à jour lui-même (commits « Update seed.md » sur dev).
// Le comparer à un commit figé (main, c166e53…) échoue donc à chaque mise à jour du propriétaire sans qu'un lot y ait touché. Règle vérifiée
// à la place : depuis sa création (lot 0-A), chaque commit qui le modifie est du propriétaire (aucun auteur « Claude »), et aucune modification
// n'attend dans l'arbre de travail. Sans dépôt git ni historique : rien à vérifier (null), comme les comparaisons qu'il remplace.
import { execSync } from 'node:child_process';

const run = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
};

// Renvoie la liste des problèmes (vide : règle tenue), ou null si git n'est pas disponible.
export function seedProblems(git = run) {
  const edits = git('log --diff-filter=M --format=%h%x09%an -- Docs/seed.md');
  const pending = git('status --porcelain -- Docs/seed.md');
  if (edits === null || pending === null) return null;
  return [
    ...edits.filter((l) => l.split('\t')[1] === 'Claude').map((l) => `modifié par Claude : ${l.split('\t')[0]}`),
    ...pending.map((l) => `modification non validée : ${l.trim()}`),
  ];
}
