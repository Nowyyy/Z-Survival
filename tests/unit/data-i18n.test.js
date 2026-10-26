import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(`data/i18n/${lang}.json`, 'utf8'));
const fr = load('fr');
const en = load('en');
// Sources qui consomment des clés : les pages HTML et les scripts du site.
const pages = ['index.html', 'dev/index.html'].map((f) => readFileSync(f, 'utf8'));
const gamePage = readFileSync('jeu.html', 'utf8');
const html = pages[0];
const scripts = ['js/main.js', 'js/page.js', 'dev/dev.js', ...readdirSync('js/game').map((f) => `js/game/${f}`)].map((f) => readFileSync(f, 'utf8'));
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
      expect(usedKeys.has(k) || scripts.some((js) => js.includes(`'${k}'`)), k).toBe(true);
    }
  });

  it('couvrent toutes les clés demandées par la page', () => {
    for (const k of usedKeys) expect(fr[k], k).toBeDefined();
  });

  it('traduisent réellement (le texte anglais diffère du français)', () => {
    expect(en['app.status']).not.toBe(fr['app.status']);
  });
});

describe('page d\'attente', () => {
  it('est en noindex et sans ressource externe', () => {
    for (const page of pages) expect(page).toContain('name="robots" content="noindex"');
    for (const page of pages) expect(page).not.toMatch(/(src|href)="https?:\/\//);
  });

  it('charge le script en module avec des chemins relatifs', () => {
    expect(html).toContain('<script type="module" src="js/main.js">');
    expect(pages[1]).toContain('<script type="module" src="dev.js">');
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
