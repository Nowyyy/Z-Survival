// Lot 3k : garde-fous de l'atelier de l'interface. Le jeu n'est pas modifié (git diff vide sur ses fichiers), aucun fichier image, police ou son n'est
// ajouté, les nouveaux modules de js/core/ restent purs. Garde-fou propre à la branche lot-3k : à retirer quand l'intégration (lot 4b) modifiera le jeu.
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
const changed = (paths) => (ref ? diff(`${ref} -- ${paths}`) : []);

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

describe('le jeu n\'est pas modifié (git diff avec main)', () => {
  it('jeu.html, index.html, sauvegarde.html, css/game.css, css/tokens.css, css/base.css : inchangés', () => {
    expect(changed('jeu.html index.html sauvegarde.html css/game.css css/tokens.css css/base.css css/sauvegarde.css')).toEqual([]);
  });

  it('js/game/, js/save/, js/sauvegarde/ et les modules existants de js/core/ : inchangés', () => {
    expect(changed('js/game js/save js/sauvegarde js/i18n.js js/main.js js/page.js js/lots.js')).toEqual([]);
    expect(changed('js/core').filter((f) => !NEW_CORE.includes(f))).toEqual([]);
  });

  it('data/game/ (hors ui-atelier.json) et data/i18n/fr.json, en.json : inchangés', () => {
    expect(changed('data/game').filter((f) => f !== 'data/game/ui-atelier.json')).toEqual([]);
    expect(changed('data/i18n/fr.json data/i18n/en.json data/changelog.json')).toEqual([]);
  });

  it('documents du propriétaire et règles : CLAUDE.md, seed, conventions, bilans existants, workflow inchangés', () => {
    expect(changed('CLAUDE.md Docs/seed.md Docs/ref/conventions.md .github playwright.config.js eslint.config.js vitest.config.js package-lock.json')).toEqual([]);
    const lots = ref ? diff(`--diff-filter=MD ${ref} -- Docs/lots`) : [];
    expect(lots).toEqual([]);
  });

  it('tests existants : seuls les tests de pureté listés sont adaptés, aucun supprimé', () => {
    const touched = ref ? diff(`--diff-filter=MD ${ref} -- tests`) : [];
    expect(touched.filter((f) => !['tests/unit/lot1-regles.test.js'].includes(f))).toEqual([]);
  });

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
