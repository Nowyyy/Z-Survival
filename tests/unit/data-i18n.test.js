import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(`data/i18n/${lang}.json`, 'utf8'));
const fr = load('fr');
const en = load('en');
// Lot 8b : textes propres à l'accueil (index.html, js/page.js, js/accueil/) séparés de ceux du jeu et du menu : accueil.fr.json, accueil.en.json.
const afr = load('accueil.fr');
const aen = load('accueil.en');
const accueilSources = [readFileSync('index.html', 'utf8'), readFileSync('js/page.js', 'utf8'), ...readdirSync('js/accueil').map((f) => readFileSync(`js/accueil/${f}`, 'utf8'))];
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
// Lot 8a : le menu principal (js/menu/, état pur js/core/menu-etat.js) consomme les clés game.menu.* (écrites en entier).
// Lot 8f : js/menu/ contient un sous-dossier (js/menu/ouverture/, ouvertures en 3D) : lu en entier, sous-dossiers compris (avant : fichiers à plat).
const fichiersDe = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiersDe(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
scripts.push(...fichiersDe('js/menu').map((f) => readFileSync(f, 'utf8')), readFileSync('js/core/menu-etat.js', 'utf8'));
// Lot 5j : les libellés des options (écran Options du jeu) sont nommés dans data/game/graphics.json et lus par js/game/options-menu.js ; chaque clé y est
// écrite entre guillemets : le fichier compte comme consommateur (avant : seuls les scripts et les pages).
const graphicsJson = readFileSync('data/game/graphics.json', 'utf8');
// Une clé est utilisée si elle apparaît entre apostrophes ou si son préfixe est construit dynamiquement (`préfixe.${…}`).
const dynamicUse = (k) => scripts.some((js) => js.includes(`${k.slice(0, k.lastIndexOf('.') + 1)}\${`));
const keysOf = (list) => new Set(list.flatMap((p) => [...p.matchAll(/data-(?:i18n|title-key|i18n-label)="([^"]+)"/g)].map((m) => m[1])));
const usedKeys = keysOf([...pages.slice(1), gamePage]); // lot 8b : pages autres que l'accueil (fr.json)
const homeKeys = keysOf([html]); // lot 8b : accueil (accueil.fr.json)

describe('dictionnaires fr / en', () => {
  // Le menu /dev et le jeu sont en français seulement : leurs clés « dev.* » et « game.* » n'existent que dans fr.json.
  const FR_ONLY = /^(dev|game)\./;
  const shared = (dict) => Object.keys(dict).filter((k) => !FR_ONLY.test(k)).sort();

  it('ont exactement les mêmes clés (hors menu /dev et jeu, français seulement)', () => {
    expect(shared(en)).toEqual(shared(fr));
    expect(Object.keys(aen).sort()).toEqual(Object.keys(afr).sort()); // lot 8b : textes de l'accueil, les deux langues
  });

  it('n\'ont aucune clé « dev.* » ni « game.* » en anglais', () => {
    expect(Object.keys(en).filter((k) => FR_ONLY.test(k))).toEqual([]);
  });

  it('n\'ont aucune valeur vide', () => {
    for (const dict of [fr, en, afr, aen]) {
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('');
    }
  });

  it('n\'ont aucune clé orpheline (toutes sont utilisées par la page ou main.js)', () => {
    for (const k of Object.keys(fr)) {
      expect(usedKeys.has(k) || scripts.some((js) => js.includes(`'${k}'`)) || dynamicUse(k) || graphicsJson.includes(`"${k}"`), k).toBe(true);
    }
    // Lot 8b : chaque clé de l'accueil est lue par l'accueil (page, js/page.js, js/accueil/).
    for (const k of Object.keys(afr)) expect(homeKeys.has(k) || accueilSources.some((js) => js.includes(`'${k}'`)), k).toBe(true);
  });

  it('couvrent toutes les clés demandées par la page', () => {
    for (const k of usedKeys) expect(fr[k], k).toBeDefined();
    for (const k of homeKeys) expect(afr[k], k).toBeDefined(); // lot 8b : l'accueil dans ses propres fichiers
  });

  it('traduisent réellement (le texte anglais diffère du français)', () => {
    expect(aen['home.play']).not.toBe(afr['home.play']); // lot 4c : app.status (« En construction ») retiré avec la page d'attente ; lot 8b : accueil.*.json
  });
});

// Lot 8b : l'accueil ne charge que ses propres textes ; aucune clé dans deux fichiers de textes ; aucune clé du jeu, du menu ni des ateliers chez lui.
describe('textes séparés (lot 8b)', () => {
  const fichiers = readdirSync('data/i18n').filter((f) => f.endsWith('.json'));
  const parLangue = (lang) => fichiers.filter((f) => (lang === 'en' ? /(^|\.)en\.json$/.test(f) : !/(^|\.)en\.json$/.test(f)));

  it('aucune clé en double entre deux fichiers de textes d\'une même langue', () => {
    for (const lang of ['fr', 'en']) {
      const vu = new Map();
      for (const f of parLangue(lang)) {
        for (const k of Object.keys(JSON.parse(readFileSync(`data/i18n/${f}`, 'utf8')))) {
          expect(vu.get(k), `${k} : ${f}`).toBeUndefined();
          vu.set(k, f);
        }
      }
    }
  });

  it('l\'accueil ne contient ni ne charge aucune clé du jeu, du menu ni des ateliers : seulement accueil.<langue>.json', () => {
    expect([...Object.keys(afr), ...Object.keys(aen)].filter((k) => !/^(meta|app|home|lang)\./.test(k))).toEqual([]);
    const lus = accueilSources.flatMap((src) => [...src.matchAll(/data\/i18n\/([^"'`\s,)]+)/g)].map((m) => m[1]));
    expect(lus.length).toBeGreaterThan(0);
    for (const chemin of lus) expect(chemin, chemin).toMatch(/^accueil\.(?:fr|\$\{lang\})\.json$/);
    expect(Object.keys(fr).filter((k) => /^(meta|home|lang)\./.test(k) || k === 'app.title')).toEqual([]);
  });

  it('les textes du jeu et du menu restent dans fr.json (chargé par jeu.html et js/game/texts.js)', () => {
    expect(gamePage).toContain('<link rel="preload" href="data/i18n/fr.json" as="fetch" crossorigin>');
    expect(readFileSync('js/game/texts.js', 'utf8')).toContain("fetch('data/i18n/fr.json')");
    expect(Object.keys(fr).filter((k) => k.startsWith('game.menu.')).length).toBeGreaterThan(0);
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
