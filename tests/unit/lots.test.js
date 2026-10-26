import { describe, it, expect } from 'vitest';
import { compareLots, lotLabel, lotUrl, parseEntry, parseLot, sortLots, splitLots } from '../../js/lots.js';

const lot = (name) => ({ name });

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

describe('compareLots / sortLots', () => {
  it('trie dans l\'ordre naturel', () => {
    const names = ['lot-10', 'lot-2', 'lot-0b', 'lot-1', 'lot-0'];
    expect(sortLots(names.map(lot)).map((l) => l.name)).toEqual(['lot-0', 'lot-0b', 'lot-1', 'lot-2', 'lot-10']);
  });

  it('place un suffixe après le numéro seul et dans l\'ordre alphabétique', () => {
    expect(compareLots('lot-1', 'lot-1b')).toBeLessThan(0);
    expect(compareLots('lot-1c', 'lot-1b')).toBeGreaterThan(0);
    expect(compareLots('lot-3', 'lot-3')).toBe(0);
  });

  it('lève une erreur sur un nom invalide', () => {
    expect(() => compareLots('main', 'lot-1')).toThrow(RangeError);
  });

  it('ignore les entrées invalides et ne modifie pas l\'entrée', () => {
    const input = [lot('main'), lot('lot-1'), null, lot('lot-0')];
    expect(sortLots(input).map((l) => l.name)).toEqual(['lot-0', 'lot-1']);
    expect(input).toHaveLength(4);
  });

  it('accepte une valeur qui n\'est pas un tableau', () => {
    expect(sortLots(undefined)).toEqual([]);
    expect(sortLots('lot-1')).toEqual([]);
  });
});

describe('splitLots', () => {
  it('renvoie le dernier lot et les anciens du plus récent au plus ancien', () => {
    const { latest, previous } = splitLots(['lot-0', 'lot-0b', 'lot-1', 'lot-2'].map(lot));
    expect(latest.name).toBe('lot-2');
    expect(previous.map((l) => l.name)).toEqual(['lot-1', 'lot-0b', 'lot-0']);
  });

  it('gère un seul lot', () => {
    const { latest, previous } = splitLots([lot('lot-0')]);
    expect(latest.name).toBe('lot-0');
    expect(previous).toEqual([]);
  });

  it('gère aucun lot', () => {
    expect(splitLots([])).toEqual({ latest: null, previous: [] });
    expect(splitLots(null)).toEqual({ latest: null, previous: [] });
  });
});

describe('lotLabel', () => {
  it('rend un libellé lisible', () => {
    expect(lotLabel('lot-0b')).toBe('Lot 0b');
    expect(lotLabel('lot-7')).toBe('Lot 7');
    expect(lotLabel('main')).toBe('main');
  });
});

describe('parseEntry / lotUrl', () => {
  it('lit la première ligne de apercu.txt', () => {
    expect(parseEntry('jeu.html\ntype: hifi\ntitre: Cœur du jeu\n')).toBe('jeu.html');
    expect(parseEntry('jeu.html\r\nx')).toBe('jeu.html');
    expect(parseEntry('pages/menu.html')).toBe('pages/menu.html');
  });

  it('refuse tout ce qui est invalide', () => {
    for (const bad of ['../x.html', '/jeu.html', 'a b.html', 'jeu.html?x=1', 'é.html', '', null, undefined, 3, {}]) expect(parseEntry(bad), String(bad)).toBe('');
  });

  it('construit l\'adresse du lot, avec ou sans page d\'aperçu', () => {
    expect(lotUrl({ name: 'lot-1', entry: 'jeu.html' })).toBe('../lots/lot-1/jeu.html');
    expect(lotUrl({ name: 'lot-0' })).toBe('../lots/lot-0/');
    expect(lotUrl({ name: 'lot-0', entry: '../evil' })).toBe('../lots/lot-0/');
  });
});
