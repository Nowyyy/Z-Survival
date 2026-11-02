// Lot 3k : garde-fous de l'atelier de l'interface. Le jeu n'est pas modifié (git diff vide sur ses fichiers), aucun fichier image, police ou son n'est
// ajouté, les nouveaux modules de js/core/ restent purs. Le groupe « le jeu n'est pas modifié » a été retiré à la fusion dans lot-4b (lot 3l).
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NEW_CORE = ['js/core/ui-mock.js', 'js/core/ui-measure.js'];

function base() {
  for (const ref of ['origin/main', 'main']) {
    try {
      execSync(`git rev-parse --verify --quiet ${ref}`, { stdio: 'pipe' });
      return ref;
    } catch {
      // essai suivant
    }
  }
  return null;
}
const ref = base();
const diff = (args) => execSync(`git diff --name-only ${args}`, { encoding: 'utf8' }).split('\n').filter(Boolean);

describe('pureté des nouveaux modules de js/core/', () => {
  it.each(NEW_CORE)('%s : ni Math.random, ni Date.now, ni document, ni window, ni stockage, ni réseau, ni minuteur', (f) => {
    const src = readFileSync(f, 'utf8');
    for (const re of [/Math\.random/, /Date\.now/, /performance\.now/, /\bdocument\b/, /\bwindow\b/, /localStorage|sessionStorage|indexedDB/, /\bfetch\s*\(|XMLHttpRequest/, /setTimeout|setInterval|requestAnimationFrame/]) {
      expect(src, `${f} : ${re}`).not.toMatch(re);
    }
  });

  it.each(NEW_CORE)('%s : aucune couleur en dur, aucun import hors js/core/', (f) => {
    const src = readFileSync(f, 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/);
    for (const m of src.matchAll(/from '([^']+)'/g)) expect(m[1]).toMatch(/^\.\/[a-z-]+\.js$/);
  });
});

// Lot 3l (fusion dans lot-4b) : le groupe « le jeu n'est pas modifié » (garde-fou propre à la branche lot-3k) est retiré, comme prévu par
// Docs/ref/fusion-3k.md (point 3) : l'intégration modifie le jeu. Restent les règles valables pour toute la branche d'intégration.
describe('dépendances et fichiers binaires (git diff avec main)', () => {
  it('package.json : dépendances inchangées', () => {
    if (!ref) return;
    const before = JSON.parse(execSync(`git show ${ref}:package.json`, { encoding: 'utf8' }));
    const now = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(now.dependencies).toEqual(before.dependencies);
    expect(now.devDependencies).toEqual(before.devDependencies);
  });

  it('aucun fichier image, police, son ni vidéo ajouté', () => {
    const added = ref ? diff(`--diff-filter=A ${ref}`) : [];
    expect(added.filter((f) => /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|aac|flac|mp4|webm)$/i.test(f))).toEqual([]);
  });
});
