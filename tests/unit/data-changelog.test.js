import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseLot } from '../../js/lots.js';
import { readEvolutions, VERSION_RE } from '../../scripts/site/site-info.mjs';

// Lot 5g : le journal des versions (/dev/) et la liste « versions » sont supprimés ; « lots » reste (une entrée par bilan) et chaque lot depuis le 5a
// porte « version » (version cible) : l'accueil de la Recette montre les lots dont la version n'est pas encore publiée (scripts/site/site-info.mjs).
const changelog = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
const { lots } = changelog;
const published = JSON.parse(readFileSync('versions.json', 'utf8')).versions.map((v) => v.id);

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

  it('un seul bloc par lot, et le lot courant (lot-5g, organisation du site) est décrit, comme lot-4c et lot-4b', () => {
    const names = lots.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('lot-5g');
    expect(names).toContain('lot-4c');
    expect(names).toContain('lot-4b');
    expect(names).toContain('lot-4');
    expect(names).toContain('lot-3k'); // lot 3k fusionné dans lot-4b
  });

  it('chaque bilan de Docs/lots/ a son entrée', () => {
    for (const f of readdirSync('Docs/lots').filter((n) => n.endsWith('.md'))) expect(lots.map((e) => e.name), f).toContain(f.replace('.md', ''));
  });

  // Lot 5g : lot-5g ajouté en dernier, après lot-5e ; avant (lot 5e) : lot-5e en dernier, après lot-5d.
  it('le fichier est dans l\'ordre chronologique : lot-0 en premier, lot-5g en dernier (lot 5g : après lot-5e, lot-5d, lot-5c, lot-5b, lot-5a, lot-4g, lot-4f, lot-4e, lot-4c et lot-4b)', () => {
    expect(lots[0].name).toBe('lot-0');
    expect(lots.at(-1).name).toBe('lot-5g');
    expect(lots.at(-2).name).toBe('lot-5e');
    expect(lots.at(-3).name).toBe('lot-5d');
    const before = lots.slice(0, -3).filter((e) => e.name !== 'lot-5c');
    expect(before.at(-1).name).toBe('lot-5b');
    expect(before.at(-2).name).toBe('lot-5a');
    expect(before.at(-3).name).toBe('lot-4g');
    expect(before.at(-4).name).toBe('lot-4f');
    expect(before.at(-5).name).toBe('lot-4e');
    expect(before.at(-6).name).toBe('lot-4c');
    expect(before.at(-7).name).toBe('lot-4b');
  });

  // Lot 5g : la liste « versions » (V0.1 à V0.5, montrée par /dev/) est supprimée avec le journal ; avant : liste exacte V0.1 lot-1 … V0.5 lot-4b (en cours)
  // et correspondance avec versions.json (désormais vérifiée par versions-schema : chaque version désigne un lot de « lots »).
  it('plus de liste « versions » ni de note « _versions » ; seulement « _note » et « lots »', () => {
    expect(Object.keys(changelog).sort()).toEqual(['_note', 'lots']);
    expect(readFileSync('apercu.txt', 'utf8').match(/^nom:/gm)).toHaveLength(1);
  });

  it('champ « version » : de la forme v0.N quand il est présent ; présent (v0.6) sur les lots 5a à 5g ; absent des lots plus anciens', () => {
    for (const e of lots.filter((x) => 'version' in x)) expect(e.version, e.name).toMatch(VERSION_RE);
    const fives = lots.filter((e) => /^lot-5[a-z]$/.test(e.name));
    expect(fives.map((e) => e.name)).toEqual(['lot-5a', 'lot-5b', 'lot-5c', 'lot-5d', 'lot-5e', 'lot-5g']);
    for (const e of fives) expect(e.version, e.name).toBe('v0.6');
    expect(lots.filter((e) => !/^lot-5/.test(e.name) && 'version' in e)).toEqual([]);
  });

  it('champ « date » (facultatif) : AAAA-MM-JJ quand il est présent, jamais dans le futur du lot suivant (ordre chronologique)', () => {
    const dated = lots.filter((e) => 'date' in e);
    for (const e of dated) expect(e.date, e.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < dated.length; i += 1) expect(dated[i].date >= dated[i - 1].date, dated[i].name).toBe(true);
  });

  it('les évolutions de l\'accueil sont les lots de la version cible pas encore publiée (v0.6), du plus récent au plus ancien', () => {
    expect(published).not.toContain('v0.6');
    expect(readEvolutions(changelog, published).map((e) => e.id)).toEqual(['lot-5g', 'lot-5e', 'lot-5d', 'lot-5c', 'lot-5b', 'lot-5a']);
  });

  it('le fichier est publié par le build (data/) ; plus aucune clé de texte du journal (dev.changelog*)', () => {
    expect(existsSync('data/changelog.json')).toBe(true);
    expect(readFileSync('scripts/build.mjs', 'utf8')).toContain("'data'");
    const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    expect(Object.keys(fr).filter((k) => k.startsWith('dev.changelog') || ['dev.title', 'dev.badge', 'dev.intro', 'dev.main', 'dev.footer'].includes(k))).toEqual([]);
  });
});
