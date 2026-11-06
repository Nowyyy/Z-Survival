import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(`data/i18n/${lang}.json`, 'utf8'));
const fr = load('fr');
const en = load('en');
// Sources qui consomment des clés : les pages HTML et les scripts du site.
// Lot 5g : dev/index.html et dev/dev.js (journal des versions) supprimés.
const pages = ['index.html', 'sons.html', 'carte.html', 'visite.html', 'ecarts.html', 'sauvegarde.html'].map((f) => readFileSync(f, 'utf8'));
const gamePage = readFileSync('jeu.html', 'utf8');
const html = pages[0];
// Lot 1d : la page d'écoute (js/sons/) et le script planche-sons.mjs lisent les étiquettes de sons par `dev.sons.etiquette.${id}`.
// Lot 4 : js/sauvegarde/ (page sauvegarde.html) lit les messages d'erreur du code (clés construites par `game.save.page.error.${code}`).
const extra = [...(existsSync('js/sons') ? readdirSync('js/sons').map((f) => `js/sons/${f}`) : []), ...readdirSync('js/carte').map((f) => `js/carte/${f}`), ...readdirSync('js/sauvegarde').map((f) => `js/sauvegarde/${f}`), 'scripts/planche-sons.mjs', 'js/visite/main.js', 'js/ecarts/main.js', 'js/core/visite.js']; // lot 3b : page carte.html ; lot 3g : visite.html et ecarts.html
// Lot 4c : l'accueil (js/accueil/) et les pages produites par l'assembleur (scripts/assemble.mjs, clés site.*) consomment aussi des clés.
const scripts = ['js/main.js', 'js/page.js', ...readdirSync('js/accueil').map((f) => `js/accueil/${f}`), 'scripts/assemble.mjs', ...readdirSync('js/game').map((f) => `js/game/${f}`), ...extra].map((f) => readFileSync(f, 'utf8'));
// Lot 3l : l'atelier de l'interface (lot 3k, toujours publié) lit des clés game.* de fr.json pour ses propositions A et C (« Vague N / 40 », « N restants »,
// « Voir ma sauvegarde ») que le jeu intégré (B) n'affiche plus : ses modules comptent comme consommateurs.
scripts.push(...readdirSync('js/atelier-interface').map((f) => readFileSync(`js/atelier-interface/${f}`, 'utf8')));
// Une clé est utilisée si elle apparaît entre apostrophes ou si son préfixe est construit dynamiquement (`préfixe.${…}`).
const dynamicUse = (k) => scripts.some((js) => js.includes(`${k.slice(0, k.lastIndexOf('.') + 1)}\${`));
const usedKeys = new Set([...pages, gamePage].flatMap((p) => [...p.matchAll(/data-(?:i18n|title-key|i18n-label)="([^"]+)"/g)].map((m) => m[1])));

describe('dictionnaires fr / en', () => {
  // Le menu /dev et le jeu sont en français seulement : leurs clés « dev.* » et « game.* » n'existent que dans fr.json.
  const FR_ONLY = /^(dev|game)\./;
  const shared = (dict) => Object.keys(dict).filter((k) => !FR_ONLY.test(k)).sort();

  it('ont exactement les mêmes clés (hors menu /dev et jeu, français seulement)', () => {
    expect(shared(en)).toEqual(shared(fr));
  });

  it('n\'ont aucune clé « dev.* » ni « game.* » en anglais', () => {
    expect(Object.keys(en).filter((k) => FR_ONLY.test(k))).toEqual([]);
  });

  it('n\'ont aucune valeur vide', () => {
    for (const dict of [fr, en]) {
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('');
    }
  });

  it('n\'ont aucune clé orpheline (toutes sont utilisées par la page ou main.js)', () => {
    for (const k of Object.keys(fr)) {
      expect(usedKeys.has(k) || scripts.some((js) => js.includes(`'${k}'`)) || dynamicUse(k), k).toBe(true);
    }
  });

  it('couvrent toutes les clés demandées par la page', () => {
    for (const k of usedKeys) expect(fr[k], k).toBeDefined();
  });

  it('traduisent réellement (le texte anglais diffère du français)', () => {
    expect(en['home.play']).not.toBe(fr['home.play']); // lot 4c : app.status (« En construction ») retiré avec la page d'attente
  });
});

describe('page d\'attente', () => {
  it('est en noindex et sans ressource externe', () => {
    for (const page of pages) expect(page).toContain('name="robots" content="noindex"');
    for (const page of pages) expect(page).not.toMatch(/(src|href)="https?:\/\//);
  });

  it('charge le script en module avec des chemins relatifs', () => {
    expect(html).toContain('<script type="module" src="js/accueil/main.js">'); // lot 4c : accueil (avant : js/main.js, page d'attente)
    // Lot 5g : dev/index.html (journal, src="dev.js") supprimé ; avant : pages[1] chargeait dev.js. Aucune page ne charge un script par adresse absolue.
    for (const page of pages) expect(page).not.toMatch(/<script[^>]*src="(?:\/|https?:)/);
  });

  it('n\'a aucun id dupliqué', () => {
    for (const page of pages) {
      const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('ne contient aucun style en ligne', () => {
    for (const page of pages) expect(page).not.toMatch(/\sstyle="/);
  });

  it('aucun fichier de polices n\'est sans licence', () => {
    const files = readdirSync('fonts');
    expect(files.some((f) => f.startsWith('LICENSE-'))).toBe(true);
  });
});
