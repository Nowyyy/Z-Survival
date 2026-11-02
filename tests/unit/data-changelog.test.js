import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseLot } from '../../js/lots.js';

const { lots } = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));

describe('data/changelog.json', () => {
  it('chaque entrée a un nom de lot valide, un titre et au moins un point', () => {
    expect(lots.length).toBeGreaterThanOrEqual(9);
    for (const e of lots) {
      expect(parseLot(e.name), e.name).not.toBeNull();
      expect(e.titre.length, e.name).toBeGreaterThan(3);
      expect(e.points.length, e.name).toBeGreaterThanOrEqual(1);
      for (const p of e.points) expect(typeof p === 'string' && p.length > 5, `${e.name}: ${p}`).toBe(true);
    }
  });

  it('un seul bloc par lot, et le lot courant (lot-4c, publication par versions) est décrit, comme lot-4b', () => {
    const names = lots.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('lot-4c');
    expect(names).toContain('lot-4b');
    expect(names).toContain('lot-4');
    expect(names).toContain('lot-3k'); // lot 3k fusionné dans lot-4b
  });

  it('chaque bilan de Docs/lots/ a son entrée', () => {
    for (const f of readdirSync('Docs/lots').filter((n) => n.endsWith('.md'))) expect(lots.map((e) => e.name), f).toContain(f.replace('.md', ''));
  });

  it('le fichier est dans l\'ordre chronologique : lot-0 en premier, lot-4c en dernier (après lot-4b)', () => {
    expect(lots[0].name).toBe('lot-0');
    expect(lots.at(-1).name).toBe('lot-4c');
    expect(lots.at(-2).name).toBe('lot-4b');
  });

  // Lot 4b (demande du propriétaire) : versions majeures montrées par /dev, dans cet ordre ; chacune désigne un lot du journal.
  it('versions : V0.1 lot-1, V0.2 lot-1d, V0.3 lot-2c, V0.4 lot-3e, V0.5 lot-4b (en cours), chacune avec son entrée', () => {
    const { versions } = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
    expect(versions.map((v) => [v.version, v.lot, v.enCours === true])).toEqual([['V0.1', 'lot-1', false], ['V0.2', 'lot-1d', false], ['V0.3', 'lot-2c', false], ['V0.4', 'lot-3e', false], ['V0.5', 'lot-4b', true]]);
    for (const v of versions) expect(lots.map((e) => e.name)).toContain(v.lot);
  });

  // Lot 4c (règle du propriétaire, lot 4b) : le lot ajoute son entrée à « lots » seulement ; « versions » ne change pas, aucune ligne « nom: » de plus.
  it('lot-4c n\'est pas une version : absent de « versions » ; versions.json et « versions » se correspondent', () => {
    const { versions } = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
    expect(versions.map((v) => v.lot)).not.toContain('lot-4c');
    const published = JSON.parse(readFileSync('versions.json', 'utf8')).versions;
    expect(published.map((v) => [v.label, v.branch])).toEqual(versions.map((v) => [v.version, v.lot]));
    expect(readFileSync('apercu.txt', 'utf8').match(/^nom:/gm)).toHaveLength(1);
  });

  it('les textes de la section existent en français et le fichier est publié par le build', () => {
    for (const k of ['dev.changelog', 'dev.changelog.open', 'dev.changelog.current']) expect(fr[k], k).toBeTruthy();
    expect(fr['dev.changelog.open']).toBe('Ouvrir cette version'); // lot 4c (avant : « Ouvrir ce lot »)
    expect(existsSync('data/changelog.json')).toBe(true);
    expect(readFileSync('scripts/build.mjs', 'utf8')).toContain("'data'");
  });
});
