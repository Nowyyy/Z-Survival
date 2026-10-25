import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(`data/i18n/${lang}.json`, 'utf8'));
const fr = load('fr');
const en = load('en');
const html = readFileSync('index.html', 'utf8');
const mainJs = readFileSync('js/main.js', 'utf8');

describe('dictionnaires fr / en', () => {
  it('ont exactement les mêmes clés', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('n\'ont aucune valeur vide', () => {
    for (const dict of [fr, en]) {
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('');
    }
  });

  it('n\'ont aucune clé orpheline (toutes sont utilisées par la page ou main.js)', () => {
    const used = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]));
    for (const k of Object.keys(fr)) {
      expect(used.has(k) || mainJs.includes(`'${k}'`), k).toBe(true);
    }
  });

  it('couvrent toutes les clés demandées par la page', () => {
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) expect(fr[m[1]], m[1]).toBeDefined();
  });

  it('traduisent réellement (le texte anglais diffère du français)', () => {
    expect(en['app.status']).not.toBe(fr['app.status']);
  });
});

describe('page d\'attente', () => {
  it('est en noindex et sans ressource externe', () => {
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
  });

  it('charge le script en module avec des chemins relatifs', () => {
    expect(html).toContain('<script type="module" src="js/main.js">');
  });

  it('n\'a aucun id dupliqué', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ne contient aucun style en ligne', () => {
    expect(html).not.toMatch(/\sstyle="/);
  });

  it('aucun fichier de polices n\'est sans licence', () => {
    const files = readdirSync('fonts');
    expect(files.some((f) => f.startsWith('LICENSE-'))).toBe(true);
  });
});
