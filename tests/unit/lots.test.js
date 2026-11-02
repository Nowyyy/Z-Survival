import { describe, it, expect } from 'vitest';
import * as lots from '../../js/lots.js';
import { compareLots, parseEntry, parseLot } from '../../js/lots.js';
import { readFileSync } from 'node:fs';

describe('parseLot', () => {
  it('lit le numéro et le suffixe', () => {
    expect(parseLot('lot-0')).toEqual({ num: 0, suffix: '' });
    expect(parseLot('lot-0b')).toEqual({ num: 0, suffix: 'b' });
    expect(parseLot('lot-12')).toEqual({ num: 12, suffix: '' });
  });

  it('refuse tout ce qui n\'est pas un lot', () => {
    for (const bad of ['main', 'lot-', 'lot-b', 'Lot-1', 'lot-1-x', 'lot-1B', '', null, undefined, 3, {}]) {
      expect(parseLot(bad), String(bad)).toBeNull();
    }
  });
});

describe('compareLots', () => {
  it('trie dans l\'ordre naturel', () => {
    const names = ['lot-10', 'lot-2', 'lot-0b', 'lot-1', 'lot-0'];
    expect([...names].sort(compareLots)).toEqual(['lot-0', 'lot-0b', 'lot-1', 'lot-2', 'lot-10']);
  });

  it('place un suffixe après le numéro seul et dans l\'ordre alphabétique', () => {
    expect(compareLots('lot-1', 'lot-1b')).toBeLessThan(0);
    expect(compareLots('lot-1c', 'lot-1b')).toBeGreaterThan(0);
    expect(compareLots('lot-3', 'lot-3')).toBe(0);
  });

  it('lève une erreur sur un nom invalide', () => {
    expect(() => compareLots('main', 'lot-1')).toThrow(RangeError);
  });
});

describe('parseEntry', () => {
  it('lit la première ligne de apercu.txt', () => {
    expect(parseEntry('jeu.html\ntype: hifi\ntitre: Cœur du jeu\n')).toBe('jeu.html');
    expect(parseEntry('jeu.html\r\nx')).toBe('jeu.html');
    expect(parseEntry('pages/menu.html')).toBe('pages/menu.html');
  });

  it('refuse tout ce qui est invalide', () => {
    for (const bad of ['../x.html', '/jeu.html', 'a b.html', 'jeu.html?x=1', 'é.html', '', null, undefined, 3, {}]) expect(parseEntry(bad), String(bad)).toBe('');
  });
});

// Lot 4c : aperçus par lot retirés du site (lots.json n'est plus produit) ; apercu.txt reste dans le dépôt, première ligne et ligne « nom: » inchangées.
describe('après le retrait des aperçus par lot (lot 4c)', () => {
  it('js/lots.js ne garde que parseLot, compareLots et parseEntry', () => {
    expect(Object.keys(lots).sort()).toEqual(['compareLots', 'parseEntry', 'parseLot']);
  });

  it('apercu.txt : page jeu.html, ligne « nom: V0.5 » conservée', () => {
    const text = readFileSync('apercu.txt', 'utf8');
    expect(parseEntry(text)).toBe('jeu.html');
    expect(text.split(/\r?\n/)).toContain('nom: V0.5');
  });

  it('scripts/assemble.mjs ne produit plus lots.json ni de dossier lots/lot-*', () => {
    const src = readFileSync('scripts/assemble.mjs', 'utf8');
    expect(src).not.toMatch(/writeFileSync\([^)]*lots\.json/);
    expect(src).not.toContain('js/lots.js');
    expect(src).toContain("rmSync(join(out, 'lots.json')");
  });
});
