// Lot 4e-B : budget de durée (scripts/tests/lib/budget.mjs) sur des rapports fictifs, réglages de tests/budget.json.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dureesDepuisMesure, evaluer, ligneTestList, nombreDeTranches, repartir, sansEtiquette, unites } from '../../scripts/tests/lib/budget.mjs';

const B = { completCibleSecondes: 600, installationSecondes: 90, testsParTrancheSecondes: 480, tranchesMax: 16, facteurDesequilibre: 1.25, facteurParallelisme: 2, ajoutMaxParLotSecondes: 90 };
const fictifs = (n, ms, fichier = 'tests/e2e/a.spec.js') => Array.from({ length: n }, (_, i) => ({ projet: 'bureau', fichier, titre: `t${i}`, ms }));

describe('budget du palier complet', () => {
  it('N = ceil(somme × déséquilibre ÷ (parallélisme × tranche))', () => {
    expect(nombreDeTranches(4800, B, 2)).toBe(7); // 4800 × 1,25 / 960 = 6,25
    expect(nombreDeTranches(4800, B, 1)).toBe(13);
    expect(nombreDeTranches(0, B, 2)).toBe(1);
  });
  it('cas atteignable : 400 tests de 10 s, deux projections (mesurée et 1,0), aucune erreur', () => {
    const ev = evaluer(fictifs(400, 10000), B);
    expect(ev.ok).toBe(true);
    expect(ev.mesuree).toMatchObject({ facteur: 2, sommeSecondes: 4000, tranches: 6 });
    expect(ev.mesuree.trancheLaPlusLongueSecondes).toBeLessThanOrEqual(480);
    expect(ev.mesuree.totalSecondes).toBe(90 + ev.mesuree.trancheLaPlusLongueSecondes);
    expect(ev.prudente.facteur).toBe(1);
    expect(ev.prudente.tranches).toBe(11);
  });
  it('cas inatteignable : plus de tranchesMax tranches → erreur avec le calcul à retirer', () => {
    const ev = evaluer(fictifs(1000, 20000), B);
    expect(ev.ok).toBe(false);
    expect(ev.erreurs.join(' ')).toMatch(/27 tranches nécessaires pour tranchesMax = 16 : calcul à retirer ≈ \d+ min/);
  });
  it('tranche trop lourde à cause d\'un fichier unique (granularité fichier) ; découpé par test, il passe', () => {
    const tests = [...fictifs(150, 10000, 'tests/e2e/gros.spec.js'), ...fictifs(10, 1000, 'tests/e2e/petit.spec.js')];
    const parFichier = evaluer(tests, B, { granularite: 'fichier' });
    expect(parFichier.ok).toBe(false);
    expect(parFichier.erreurs.join(' ')).toMatch(/unité trop lourde.*gros\.spec\.js/);
    expect(evaluer(tests, B, { granularite: 'test' }).ok).toBe(true);
  });
  it('ajout maximal par lot : plus de 90 s de calcul de plus que la référence → erreur', () => {
    expect(evaluer(fictifs(10, 10000), B, { referenceSecondes: 50 })).toMatchObject({ ok: true, ajoutSecondes: 50 });
    expect(evaluer(fictifs(20, 10000), B, { referenceSecondes: 100 }).erreurs.join(' ')).toMatch(/ajout de 100 s de calcul au complet/);
    expect(evaluer(fictifs(20, 10000), B, { referenceSecondes: 150 }).ok).toBe(true);
  });
  it('répartition gloutonne : le plus lourd d\'abord, dans la tranche la moins chargée', () => {
    const t = repartir(unites([60, 50, 40, 30, 20, 10].map((ms, i) => ({ projet: 'p', fichier: 'f', titre: `t${i}`, ms }))), 2);
    expect(t.map((x) => x.ms)).toEqual([110, 100]);
  });
  it('durées : mesure exacte (étiquettes ignorées), sinon médiane du fichier, du projet, puis générale', () => {
    const mesure = [{ projet: 'bureau', fichier: 'f', titre: 'a', ms: 100 }, { projet: 'bureau', fichier: 'f', titre: 'b', ms: 300 }, { projet: 'mobile', fichier: 'g', titre: 'c', ms: 50 }];
    const r = dureesDepuisMesure([
      { projet: 'bureau', fichier: 'f', titre: 'a @lent' }, { projet: 'bureau', fichier: 'f', titre: 'nouveau' }, { projet: 'mobile', fichier: 'h', titre: 'x' }, { projet: 'autre', fichier: 'z', titre: 'y' },
    ], mesure);
    expect(r.map((x) => [x.ms, x.source])).toEqual([[100, 'mesure'], [300, 'médiane du fichier'], [50, 'médiane du projet'], [100, 'médiane générale']]);
    expect(sansEtiquette('titre @instable')).toBe('titre');
  });
  it('ligne de --test-list : « [projet] › fichier › titres »', () => {
    expect(ligneTestList({ projet: 'bureau', fichier: 'tests/e2e/jeu.spec.js', titre: 'bloc › test' })).toBe('[bureau] › jeu.spec.js › bloc › test');
  });
  it('tests/budget.json : réglages présents, objectif de 10 minutes et 16 tranches', () => {
    const b = JSON.parse(readFileSync('tests/budget.json', 'utf8'));
    for (const k of ['avantCommitSecondes', 'standardSecondes', 'completCibleSecondes', 'installationSecondes', 'testsParTrancheSecondes', 'tranchesMax', 'facteurDesequilibre', 'facteurParallelisme', 'workersCI', 'retriesComplet', 'ajoutMaxParLotSecondes', 'vitestToutSousSecondes', 'completMaxVersions']) expect(typeof b[k], k).toBe('number');
    expect(b.completCibleSecondes).toBe(600);
    expect(b.tranchesMax).toBe(16);
    expect(b.retriesInstables).toBeLessThanOrEqual(2);
  });
});
