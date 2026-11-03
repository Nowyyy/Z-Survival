// Lot 4e-A : fonctions pures de l'audit des tests (scripts/tests/lib/rapports.mjs) et cohérence du classement (scripts/tests/classement.json).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
  categorieDe, chargeurs, familleDuChemin, natureDesCommits, navigationsParLigne, playwrightParFichier, playwrightTests, totauxParCategorie, vitestParFichier,
} from '../../scripts/tests/lib/rapports.mjs';

describe('rapports de tests', () => {
  it('vitestParFichier : chemins relatifs, comptes et durées', () => {
    const rows = vitestParFichier({ testResults: [{ name: '/r/tests/unit/a.test.js', startTime: 10, endTime: 40, assertionResults: [
      { status: 'passed', duration: 5 }, { status: 'failed', duration: 7 }, { status: 'skipped' }] }] }, '/r');
    expect(rows).toEqual([{ fichier: 'tests/unit/a.test.js', tests: 3, ok: 1, ko: 1, ignores: 1, msTests: 12, msFichier: 30 }]);
  });

  it('playwrightTests : une ligne par test et par projet, titres imbriqués, tentatives additionnées', () => {
    const tests = playwrightTests({ suites: [{ title: 'a.spec.js', file: 'a.spec.js', specs: [], suites: [{ title: 'bloc', specs: [{ title: 't1', file: 'a.spec.js', line: 7, tests: [
      { projectName: 'bureau', status: 'flaky', results: [{ duration: 100, errors: [{ message: '\u001b[31mboum\u001b[39m' }] }, { duration: 50 }] },
      { projectName: 'mobile', status: 'skipped', results: [{ duration: 0 }] }] }] }] }] });
    expect(tests).toHaveLength(2);
    expect(tests[0]).toMatchObject({ fichier: 'tests/e2e/a.spec.js', ligne: 7, titre: 'bloc › t1', projet: 'bureau', ms: 150, tentatives: 2, erreur: 'boum' });
  });

  it('playwrightParFichier : agrège par fichier et projet', () => {
    const rows = playwrightParFichier([
      { fichier: 'f', projet: 'bureau', statut: 'expected', ms: 10 }, { fichier: 'f', projet: 'bureau', statut: 'unexpected', ms: 5 },
      { fichier: 'f', projet: 'mobile', statut: 'skipped', ms: 0 }]);
    expect(rows).toEqual([
      { fichier: 'f', projet: 'bureau', tests: 2, ok: 1, ko: 1, instables: 0, ignores: 0, ms: 15 },
      { fichier: 'f', projet: 'mobile', tests: 1, ok: 0, ko: 0, instables: 0, ignores: 1, ms: 0 }]);
  });

  it('chargeurs : fonctions locales qui appellent page.goto', () => {
    const src = 'async function open(page) {\n  await page.goto("/x");\n}\nconst other = async (p) => p.click();\nconst load = async (page) => {\n  await page.goto("/y");\n};\n';
    expect(chargeurs(src).sort()).toEqual(['load', 'open']);
  });

  it('navigationsParLigne : appels dans le corps du test, beforeEach compris', () => {
    const src = [
      'async function open(page) {', '  await page.goto("/");', '}', 'test.beforeEach(async ({ page }) => {', '  await open(page);', '});',
      "test('a', async ({ page }) => {", '  await open(page);', '  await page.goto("/b");', '});', "test('b', async () => {", '  expect(1).toBe(1);', '});'].join('\n');
    expect(navigationsParLigne(src, [7, 11])).toEqual({ 7: 3, 11: 1 });
  });

  it('categorieDe et totauxParCategorie : groupe, projet, règle mobile, garde-fou jamais en D', () => {
    const cl = [{ fichier: 'f', categorie: 'R', mobile: 'D', groupes: [{ motif: 'axe', categorie: 'G' }, { motif: 'instable', projet: 'mobile', categorie: 'I' }] }];
    expect(categorieDe(cl, 'f', 'axe : rien', 'mobile')).toBe('G');
    expect(categorieDe(cl, 'f', 'règle', 'mobile')).toBe('D');
    expect(categorieDe(cl, 'f', 'règle', 'bureau')).toBe('R');
    expect(categorieDe(cl, 'f', 'test instable', 'bureau')).toBe('R');
    expect(categorieDe(cl, 'f', 'test instable', 'mobile')).toBe('I');
    expect(categorieDe(cl, 'absent', 'x', 'bureau')).toBe('?');
    expect(totauxParCategorie(cl, [{ fichier: 'f', titre: 'axe', ms: 3, projet: 'bureau' }, { fichier: 'f', titre: 'x', ms: 4, projet: 'mobile' }]))
      .toEqual({ G: { tests: 1, ms: 3, fichiers: 1 }, D: { tests: 1, ms: 4, fichiers: 1 } });
  });

  it('familleDuChemin et natureDesCommits : documentation seule, ciblé, large', () => {
    expect(familleDuChemin('Docs/lots/lot-4.md')).toBe('doc');
    expect(familleDuChemin('README.md')).toBe('doc');
    expect(familleDuChemin('js/core/rng.js')).toBe('js/core');
    expect(familleDuChemin('jeu.html')).toBe('pages');
    expect(familleDuChemin('package.json')).toBe('racine');
    expect(natureDesCommits([
      { hash: 'a', fichiers: ['Docs/x.md'] }, { hash: 'b', fichiers: ['js/core/a.js', 'tests/unit/a.test.js'] }, { hash: 'c', fichiers: ['package.json'] },
    ]).map((c) => c.nature)).toEqual(['doc', 'cible', 'large']);
  });
});

describe('classement des fichiers de test (scripts/tests/classement.json)', () => {
  const data = JSON.parse(readFileSync('scripts/tests/classement.json', 'utf8'));
  const files = [
    ...readdirSync('tests/unit').filter((f) => f.endsWith('.test.js')).map((f) => `tests/unit/${f}`),
    ...readdirSync('tests/e2e').filter((f) => f.endsWith('.spec.js')).map((f) => `tests/e2e/${f}`),
  ];
  it('chaque fichier de test est classé une seule fois, avec une catégorie connue, des motifs valides et aucun fichier inexistant', () => {
    const listed = data.fichiers.map((c) => c.fichier);
    expect(files.filter((f) => !listed.includes(f))).toEqual([]);
    expect(listed.filter((f) => !files.includes(f))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const c of data.fichiers) {
      expect(Object.keys(data.categories)).toContain(c.categorie);
      for (const g of c.groupes ?? []) {
        expect(Object.keys(data.categories)).toContain(g.categorie);
        expect(() => new RegExp(g.motif, 'i')).not.toThrow();
      }
    }
  });
});
