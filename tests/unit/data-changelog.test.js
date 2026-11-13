import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseLot } from '../../js/lots.js';
import { readEvolutions, VERSION_RE } from '../../scripts/site/site-info.mjs';
import { bilansDuDossier } from '../../scripts/docs/bilans.mjs';

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

  // Lot 5m : bilans séparés (Docs/lots/lot-N.md) ou regroupés par version (Docs/lots/versions/v0.N.md), lus par scripts/docs/bilans.mjs ;
  // avant : readdirSync('Docs/lots') (bilans séparés seulement). Même assertion par bilan.
  it('chaque bilan de Docs/lots/ (séparé ou regroupé) a son entrée', () => {
    for (const lot of bilansDuDossier().keys()) expect(lots.map((e) => e.name), lot).toContain(lot);
  });

  // Lot 5q : lot-5q ajouté en dernier, après lot-5p (avant : lot-5p en dernier ; les rangs suivants décalés d'un cran). Lot 5p : lot-5p ajouté en dernier, après lot-5o (avant : lot-5o en dernier ; les rangs suivants décalés d'un cran). Lot 5o : lot-5o ajouté en dernier, après lot-5n (avant : lot-5n en dernier ; les rangs suivants décalés d'un cran). Lot 5n : lot-5n ajouté en dernier, après lot-5m (avant : lot-5m en dernier ; les rangs suivants décalés d'un cran). Lot 5m : lot-5m ajouté en dernier, après lot-5l (avant : lot-5l en dernier ; les rangs suivants décalés d'un cran). Lot 5l : lot-5l ajouté en dernier, après lot-5k (avant : lot-5k en dernier ; les rangs suivants décalés d'un cran). Lot 5k : lot-5k ajouté en dernier, après lot-5j (avant : lot-5j en dernier). Lot 5j : lot-5j ajouté en dernier, après lot-5i (avant : lot-5i en dernier). Lot 5i : lot-5i ajouté en dernier, après lot-5f ; avant (lot 5f) : lot-5f en dernier, après lot-5h (publié après les lots 5g et 5h) ;
  // (lot 5h : lot-5h en dernier, après lot-5g ; lot 5g : lot-5g en dernier, après lot-5e ; lot 5e : lot-5e en dernier, après lot-5d).
  it('le fichier est dans l\'ordre chronologique : lot-0 en premier, lot-8i en dernier (lot 8i : après lot-8g ; lot 8g : après lot-8f ; lot 8f : après lot-8e ; lot 8e : après lot-8d ; lot 8d : après lot-8c ; lot 8c : après lot-8b ; lot 8b : après lot-8a ; lot 8a : après lot-5q, lot-5p, lot-5o, lot-5n, lot-5m, lot-5l, lot-5k, lot-5j, lot-5i, lot-5f, lot-5h, lot-5g, lot-5e, lot-5d, lot-5c, lot-5b, lot-5a, lot-4g, lot-4f, lot-4e, lot-4c et lot-4b)', () => {
    expect(lots[0].name).toBe('lot-0');
    expect(lots.at(-1).name).toBe('lot-8i'); // lot 8i (avant : lot-8g en dernier ; les rangs suivants décalés d'un cran)
    expect(lots.at(-2).name).toBe('lot-8g'); // lot 8g (avant : lot-8f en dernier)
    expect(lots.at(-3).name).toBe('lot-8f'); // lot 8f (avant : lot-8e en dernier)
    expect(lots.at(-4).name).toBe('lot-8e'); // lot 8e (avant : lot-8d en dernier)
    expect(lots.at(-5).name).toBe('lot-8d'); // lot 8d (avant : lot-8c en dernier)
    expect(lots.at(-6).name).toBe('lot-8c'); // lot 8c (avant : lot-8b en dernier)
    expect(lots.at(-7).name).toBe('lot-8b'); // lot 8b (avant : lot-8a en dernier)
    expect(lots.at(-8).name).toBe('lot-8a'); // lot 8a (avant : lot-5q en dernier ; les rangs suivants décalés d'un cran)
    const sans8b = lots.slice(0, -7); // lot 8b : rangs d'avant inchangés sur la liste sans lot-8b (lot 8c : ni lot-8c ; lot 8d : ni lot-8d ; lot 8e : ni lot-8e ; lot 8f : ni lot-8f ; lot 8g : ni lot-8g ; lot 8i : ni lot-8i)
    expect(sans8b.at(-2).name).toBe('lot-5q');
    expect(sans8b.at(-3).name).toBe('lot-5p');
    expect(sans8b.at(-4).name).toBe('lot-5o');
    expect(sans8b.at(-5).name).toBe('lot-5n');
    expect(sans8b.at(-6).name).toBe('lot-5m');
    expect(sans8b.at(-7).name).toBe('lot-5l');
    expect(sans8b.at(-8).name).toBe('lot-5k');
    expect(sans8b.at(-9).name).toBe('lot-5j');
    expect(sans8b.at(-10).name).toBe('lot-5i');
    expect(sans8b.at(-11).name).toBe('lot-5f');
    expect(sans8b.at(-12).name).toBe('lot-5h');
    expect(sans8b.at(-13).name).toBe('lot-5g');
    expect(sans8b.at(-14).name).toBe('lot-5e');
    expect(sans8b.at(-15).name).toBe('lot-5d');
    const before = sans8b.slice(0, -15).filter((e) => e.name !== 'lot-5c');
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

  // Lot 5q : lot-5q ajouté (v0.8, premier lot de la V0.8) ; lot 5p : lot-5p ajouté (v0.7) ; lot 5o : lot-5o ajouté (v0.7) ; lot 5n : lot-5n ajouté (v0.7) ; lot 5m : lot-5m ajouté (v0.7) ; lot 5l : lot-5l ajouté (v0.7) ; lot 5k : lot-5k ajouté (v0.7) ; lot 5j : lot-5j ajouté (v0.7, première évolution de la version suivante) ; lot 5i : lot-5i ajouté (v0.6) ; lot 5f : lot-5f ajouté (v0.6) ; avant : lots 5a à 5h sans 5f.
  it('champ « version » : de la forme v0.N quand il est présent ; présent (v0.6) sur les lots 5a à 5i, v0.7 sur lot-5j, lot-5k, lot-5l, lot-5m, lot-5n, lot-5o et lot-5p, v0.8 sur lot-5q, lot-8a, lot-8b, lot-8c, lot-8d, lot-8e, lot-8f, lot-8g et lot-8i ; absent des lots plus anciens', () => {
    for (const e of lots.filter((x) => 'version' in x)) expect(e.version, e.name).toMatch(VERSION_RE);
    const fives = lots.filter((e) => /^lot-5[a-z]$/.test(e.name));
    expect(fives.map((e) => e.name)).toEqual(['lot-5a', 'lot-5b', 'lot-5c', 'lot-5d', 'lot-5e', 'lot-5g', 'lot-5h', 'lot-5f', 'lot-5i', 'lot-5j', 'lot-5k', 'lot-5l', 'lot-5m', 'lot-5n', 'lot-5o', 'lot-5p', 'lot-5q']);
    for (const e of fives) expect(e.version, e.name).toBe(e.name === 'lot-5q' ? 'v0.8' : ['lot-5j', 'lot-5k', 'lot-5l', 'lot-5m', 'lot-5n', 'lot-5o', 'lot-5p'].includes(e.name) ? 'v0.7' : 'v0.6');
    expect(lots.find((e) => e.name === 'lot-8a')?.version).toBe('v0.8'); // lot 8a
    expect(lots.find((e) => e.name === 'lot-8b')?.version).toBe('v0.8'); // lot 8b
    expect(lots.find((e) => e.name === 'lot-8c')?.version).toBe('v0.8'); // lot 8c
    expect(lots.find((e) => e.name === 'lot-8d')?.version).toBe('v0.8'); // lot 8d
    expect(lots.find((e) => e.name === 'lot-8e')?.version).toBe('v0.8'); // lot 8e
    expect(lots.find((e) => e.name === 'lot-8f')?.version).toBe('v0.8'); // lot 8f
    expect(lots.find((e) => e.name === 'lot-8g')?.version).toBe('v0.8'); // lot 8g
    expect(lots.find((e) => e.name === 'lot-8i')?.version).toBe('v0.8'); // lot 8i
    expect(lots.filter((e) => !/^lot-5/.test(e.name) && !['lot-8a', 'lot-8b', 'lot-8c', 'lot-8d', 'lot-8e', 'lot-8f', 'lot-8g', 'lot-8i'].includes(e.name) && 'version' in e)).toEqual([]); // lots 8a à 8g et 8i (v0.8) exceptés
  });

  it('champ « date » (facultatif) : AAAA-MM-JJ quand il est présent, jamais dans le futur du lot suivant (ordre chronologique)', () => {
    const dated = lots.filter((e) => 'date' in e);
    for (const e of dated) expect(e.date, e.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < dated.length; i += 1) expect(dated[i].date >= dated[i - 1].date, dated[i].name).toBe(true);
  });

  // Lot 5f : V0.6 publiée, donc aucune évolution ; avant : v0.6 non publiée et les lots 5h → 5a en évolutions. Ce cas est gardé (versions publiées
  // sans v0.6), et un lot d'une version suivante (v0.7) y entre.
  // Lot 5o : lot-5o, lot-5n, lot-5m, lot-5l, lot-5k puis lot-5j ; lot 5n : lot-5n, lot-5m, lot-5l, lot-5k puis lot-5j ; lot 5m : lot-5m, lot-5l, lot-5k puis lot-5j ; lot 5l : lot-5l, lot-5k puis lot-5j ; lot 5k : lot-5k puis lot-5j (v0.7, non publiée) ; lot 5j : lot-5j seul (avant : aucune).
  // Lot 5p : V0.7 publiée, donc aucune évolution ; avant (v0.6 publiée, v0.7 non) : lot-5o, lot-5n, lot-5m, lot-5l, lot-5k puis lot-5j. Ce cas est gardé
  // (versions publiées sans v0.7 : lot-5p en tête), le cas « sans v0.6 » aussi, et un lot d'une version suivante (v0.8, avant : v0.7) y entre.
  // Lot 5q : lot-5q (v0.8, non publiée) figure dans chaque liste brute (avant : absent) ; l'accueil le masque (« afficher: non », publication.test.js).
  // Lot 8a : lot-8a (v0.8, affiché) en tête de chaque liste brute. Lot 8b : lot-8b (v0.8, affiché) devant lot-8a. Lot 8c : lot-8c (v0.8, affiché) devant lot-8b. Lot 8d : lot-8d devant lot-8c. Lot 8e : lot-8e devant lot-8d. Lot 8f : lot-8f devant lot-8e. Lot 8g : lot-8g devant lot-8f.
  it('les évolutions de l\'accueil sont les lots de la version cible pas encore publiée, du plus récent au plus ancien ; v0.7 publiée : aucune ; sans v0.7 : lot-5p, lot-5o, lot-5n, lot-5m, lot-5l, lot-5k puis lot-5j (v0.7)', () => {
    expect(published).toContain('v0.6');
    expect(published).toContain('v0.7');
    expect(readEvolutions(changelog, published).map((e) => [e.id, e.version])).toEqual([['lot-8i', 'v0.8'], ['lot-8g', 'v0.8'], ['lot-8f', 'v0.8'], ['lot-8e', 'v0.8'], ['lot-8d', 'v0.8'], ['lot-8c', 'v0.8'], ['lot-8b', 'v0.8'], ['lot-8a', 'v0.8'], ['lot-5q', 'v0.8']]); // lot 8i : lot-8i en tête ; lot 8e : lot-8e en tête ; lot 8d : lot-8d ; lot 8c : lot-8c ; lot 8b : lot-8b ; lot 8a : lot-8a (avant : lot-5q seul) ; lot-5q masqué par le fichier des noms
    const avantV07 = published.filter((id) => id !== 'v0.7');
    expect(readEvolutions(changelog, avantV07).map((e) => [e.id, e.version])).toEqual([['lot-8i', 'v0.8'], ['lot-8g', 'v0.8'], ['lot-8f', 'v0.8'], ['lot-8e', 'v0.8'], ['lot-8d', 'v0.8'], ['lot-8c', 'v0.8'], ['lot-8b', 'v0.8'], ['lot-8a', 'v0.8'], ['lot-5q', 'v0.8'], ['lot-5p', 'v0.7'], ['lot-5o', 'v0.7'], ['lot-5n', 'v0.7'], ['lot-5m', 'v0.7'], ['lot-5l', 'v0.7'], ['lot-5k', 'v0.7'], ['lot-5j', 'v0.7']]);
    const avantV06 = published.filter((id) => id !== 'v0.6' && id !== 'v0.7');
    expect(readEvolutions(changelog, avantV06).map((e) => e.id)).toEqual(['lot-8i', 'lot-8g', 'lot-8f', 'lot-8e', 'lot-8d', 'lot-8c', 'lot-8b', 'lot-8a', 'lot-5q', 'lot-5p', 'lot-5o', 'lot-5n', 'lot-5m', 'lot-5l', 'lot-5k', 'lot-5j', 'lot-5i', 'lot-5f', 'lot-5h', 'lot-5g']); // lot 8i : lot-8i en tête, lot-5e sort des 20 ; 20 au plus (MAX_EVOLUTIONS) : lot 8g, lot-5d sort ; lot 8f, lot-5c sort ; lot 8e, lot-5b sort ; lot 8d, lot-5a sort
    const suivant = { ...changelog, lots: [...changelog.lots, { name: 'lot-6a', version: 'v0.8', date: '2026-11-10', titre: 'Lot de la version suivante', points: ['Premier point.'] }] };
    expect(readEvolutions(suivant, published).map((e) => [e.id, e.version])).toEqual([['lot-6a', 'v0.8'], ['lot-8i', 'v0.8'], ['lot-8g', 'v0.8'], ['lot-8f', 'v0.8'], ['lot-8e', 'v0.8'], ['lot-8d', 'v0.8'], ['lot-8c', 'v0.8'], ['lot-8b', 'v0.8'], ['lot-8a', 'v0.8'], ['lot-5q', 'v0.8']]);
    const suivantSansV07 = { ...changelog, lots: [...changelog.lots, { name: 'lot-6a', version: 'v0.7', date: '2026-11-10', titre: 'Lot de la version suivante', points: ['Premier point.'] }] };
    expect(readEvolutions(suivantSansV07, avantV07).map((e) => [e.id, e.version])).toEqual([['lot-6a', 'v0.7'], ['lot-8i', 'v0.8'], ['lot-8g', 'v0.8'], ['lot-8f', 'v0.8'], ['lot-8e', 'v0.8'], ['lot-8d', 'v0.8'], ['lot-8c', 'v0.8'], ['lot-8b', 'v0.8'], ['lot-8a', 'v0.8'], ['lot-5q', 'v0.8'], ['lot-5p', 'v0.7'], ['lot-5o', 'v0.7'], ['lot-5n', 'v0.7'], ['lot-5m', 'v0.7'], ['lot-5l', 'v0.7'], ['lot-5k', 'v0.7'], ['lot-5j', 'v0.7']]);
  });

  it('le fichier est publié par le build (data/) ; plus aucune clé de texte du journal (dev.changelog*)', () => {
    expect(existsSync('data/changelog.json')).toBe(true);
    expect(readFileSync('scripts/build.mjs', 'utf8')).toContain("'data'");
    const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    expect(Object.keys(fr).filter((k) => k.startsWith('dev.changelog') || ['dev.title', 'dev.badge', 'dev.intro', 'dev.main', 'dev.footer'].includes(k))).toEqual([]);
  });
});
