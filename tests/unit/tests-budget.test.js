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

// Lot 4f-A : complet à tranchesMax tranches, standard réparti (bureau seulement), choix du palier par la branche, bilan des durées.
describe('lot 4f : plan des paliers (planDuPalier)', async () => {
  const { nombreDeTranchesStandard, planDuPalier, projectionCompacte } = await import('../../scripts/tests/lib/budget.mjs');
  const BS = { ...B, standardCibleSecondes: 480, standardMaxSecondes: 600, tranchesMaxStandard: 8 };
  it('complet et publication : tranchesMax (16) dès que le nombre de tests le permet ; N minimal et N utilisé rapportés', () => {
    const p = planDuPalier(fictifs(400, 10000), BS, 'complet');
    expect(p).toMatchObject({ nMinimal: 6, nUtilise: 16, sommeSecondes: 4000 });
    expect(p.projection.repartition).toHaveLength(16);
    expect(p.projection.trancheLaPlusLongueSecondes).toBe(125); // 400 tests ÷ 16 = 25 par tranche, 250 s ÷ parallélisme 2
    expect(planDuPalier(fictifs(5, 10000), BS, 'publication').nUtilise).toBe(5); // moins de tests que de tranches
    expect(planDuPalier(fictifs(1000, 20000), BS, 'complet').erreurs.join(' ')).toMatch(/27 tranches nécessaires pour tranchesMax = 16/);
  });
  it('standard : N = clamp(1, 8, ceil(somme × 1,25 ÷ (parallélisme × (480 − 90))))', () => {
    expect(nombreDeTranchesStandard(1000, BS)).toBe(2); // 1250 / 780 = 1,6
    expect(nombreDeTranchesStandard(10, BS)).toBe(1);
    expect(nombreDeTranchesStandard(100000, BS)).toBe(8);
    const p = planDuPalier(fictifs(100, 10000), BS, 'standard'); // 1 000 s cumulées
    expect(p).toMatchObject({ nMinimal: 2, nUtilise: 2 });
    expect(p.projection.totalSecondes).toBe(90 + 250);
    expect(p.erreurs).toEqual([]);
  });
  it('standard trop lourd : limité à 8 tranches, avertissement, erreur au-delà de standardMaxSecondes', () => {
    const p = planDuPalier(fictifs(1000, 10000), BS, 'standard'); // 10 000 s cumulées
    expect(p.nUtilise).toBe(8);
    expect(p.avertissements.join(' ')).toMatch(/17 tranches nécessaires pour tenir 480 s ; limité à tranchesMaxStandard = 8/);
    expect(p.erreurs.join(' ')).toMatch(/> maximum du standard 600 s/);
  });
  it('aucun test Playwright (documentation, Vitest seul) : 0 tranche de navigateur', () => {
    for (const palier of ['standard', 'complet']) expect(planDuPalier([], BS, palier)).toMatchObject({ nMinimal: 0, nUtilise: 0, projection: null });
    expect(projectionCompacte(planDuPalier([], BS, 'standard'), BS)).toMatchObject({ nUtilise: 0, totalSecondes: 0, tranches: [] });
  });
  it('projection compacte : secondes et exécutions par tranche', () => {
    const c = projectionCompacte(planDuPalier(fictifs(4, 10000), BS, 'standard'), BS);
    expect(c).toMatchObject({ palier: 'standard', nUtilise: 1, facteur: 2, installationSecondes: 90, totalSecondes: 110, tranches: [{ index: 1, secondes: 20, executions: 4 }] });
  });
  it('tests/budget.json : réglages du standard (cible 480 s, maximum 600 s, 8 tranches, bureau seulement, d\'après les projets de playwright.config)', () => {
    const b = JSON.parse(readFileSync('tests/budget.json', 'utf8'));
    expect(b).toMatchObject({ standardCibleSecondes: 480, standardMaxSecondes: 600, tranchesMaxStandard: 8, standardProjets: ['bureau'] });
    const config = readFileSync('playwright.config.js', 'utf8');
    for (const p of b.standardProjets) expect(config).toContain(`name: '${p}'`);
  });
});

describe('lot 4f : palier choisi par l\'événement et le nom de la branche (lib/ci.mjs)', async () => {
  const { basesCandidates, palierDeLExecution } = await import('../../scripts/tests/lib/ci.mjs');
  it.each([
    ['push', 'refs/heads/essai/complet-1', undefined, 'complet'],
    ['push', 'refs/heads/essai/standard-2', undefined, 'standard'],
    ['push', 'refs/heads/essai/autre', undefined, null],
    ['push', 'refs/heads/essai/complet-1/x', undefined, null],
    ['push', 'refs/heads/dev', undefined, 'standard'],
    ['push', 'refs/heads/lot-4f', undefined, 'standard'],
    ['push', 'refs/heads/main', undefined, null],
    ['pull_request', 'refs/pull/3/merge', undefined, 'standard'],
    ['workflow_dispatch', 'refs/heads/main', 'complet', 'complet'],
    ['workflow_dispatch', 'refs/heads/main', 'publication', 'publication'],
    ['workflow_dispatch', 'refs/heads/main', undefined, 'standard'],
  ])('%s %s (%s) → %s', (evenement, ref, palierDemande, attendu) => {
    const r = palierDeLExecution({ evenement, ref, palierDemande });
    expect(r.palier).toBe(attendu);
    expect(r.message.length).toBeGreaterThan(0);
  });
  it('événement create : essai/complet-* → complet, essai/standard-* → standard, autre branche ou tag → rien ; le push qui crée une branche essai/** ne lance rien', () => {
    expect(palierDeLExecution({ evenement: 'create', ref: 'refs/heads/essai/complet-3' }).palier).toBe('complet');
    expect(palierDeLExecution({ evenement: 'create', ref: 'refs/heads/essai/standard-2' }).palier).toBe('standard');
    expect(palierDeLExecution({ evenement: 'create', ref: 'refs/heads/lot-5' }).palier).toBeNull();
    expect(palierDeLExecution({ evenement: 'create', ref: 'refs/tags/lot-4f' }).palier).toBeNull();
    expect(palierDeLExecution({ evenement: 'push', ref: 'refs/heads/essai/complet-3', cree: true })).toMatchObject({ palier: null, message: expect.stringMatching(/événement create/) });
    expect(palierDeLExecution({ evenement: 'push', ref: 'refs/heads/essai/complet-3', cree: false }).palier).toBe('complet');
    expect(palierDeLExecution({ evenement: 'push', ref: 'refs/heads/lot-5', cree: true }).palier).toBe('standard');
    expect(basesCandidates({ evenement: 'create', ref: 'refs/heads/essai/standard-2' })).toEqual(['origin/dev', 'origin/main']);
  });
  it('une autre branche essai/** : aucun palier, avec un message', () => {
    expect(palierDeLExecution({ evenement: 'push', ref: 'refs/heads/essai/x' }).message).toMatch(/aucun palier.*essai\/complet-\* et essai\/standard-\*/);
  });
  it('base de la sélection : commit précédent s\'il est valide, sinon origin/main (premier push d\'une branche lot-* : origin/dev, lot 5n) ; branche de base d\'une PR ; origin/dev pour essai/standard-*', () => {
    const avant = 'a'.repeat(40);
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/dev', avant })).toEqual([avant, 'origin/main']);
    // Lot 5n (W2-c) : premier push d'une branche lot-* (avant nul ou absent) : origin/dev, repli sur origin/main (avant : ['origin/main']).
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/lot-4f', avant: '0'.repeat(40) })).toEqual(['origin/dev', 'origin/main']);
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/lot-4f', avant: '' })).toEqual(['origin/dev', 'origin/main']);
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/lot-5n', avant })).toEqual([avant, 'origin/main']);
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/dev', avant: '0'.repeat(40) })).toEqual(['origin/main']);
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/lot-5n/x', avant: '' })).toEqual(['origin/main']);
    expect(basesCandidates({ evenement: 'pull_request', ref: 'refs/pull/3/merge', baseRef: 'dev', baseSha: avant })).toEqual(['origin/dev', avant, 'origin/main']);
    expect(basesCandidates({ evenement: 'push', ref: 'refs/heads/essai/standard-1', avant })).toEqual(['origin/dev', 'origin/main']);
    expect(basesCandidates({ evenement: 'workflow_dispatch', ref: 'refs/heads/main' })).toEqual(['origin/dev', 'origin/main']);
  });
});

describe('lot 4f : bilan des durées sur des rapports fictifs (lib/duree.mjs)', async () => {
  const { bilanDuree, bilanTexte, dureeTranche } = await import('../../scripts/tests/lib/duree.mjs');
  const T0 = 1_700_000_000_000;
  const tranche = (index, installation, tests, sommeTestsMs, o = {}) => ({
    palier: 'complet', index, debutTache: T0 + 10_000, finNpmCi: T0 + 20_000, finNavigateur: T0 + 21_000,
    debutTests: T0 + 10_000 + installation * 1000, finTests: T0 + 10_000 + (installation + tests) * 1000,
    tests: 60, workers: 2, reussis: 58, echoues: 1, instables: 1, ignores: 0, sommeTestsMs, code: 0, ...o,
  });
  const projection = { palier: 'complet', nMinimal: 8, nUtilise: 3, facteur: 1.99, installationSecondes: 90, trancheLaPlusLongueSecondes: 178, totalSecondes: 268, tranches: [{ index: 1, secondes: 178 }, { index: 2, secondes: 178 }, { index: 3, secondes: 178 }] };
  it('une tranche : installation, tests, parallélisme réel = somme des durées ÷ durée des tests', () => {
    expect(dureeTranche(tranche(1, 30, 200, 380_000))).toMatchObject({ installationSecondes: 30, npmCiSecondes: 10, testsSecondes: 200, tacheSecondes: 230, parallelisme: 1.9, workers: 2 });
  });
  it('objectif tenu : total, installation moyenne et maximale, tranche la plus longue, parallélisme global, écart avec la projection', () => {
    const b = bilanDuree({ tranches: [tranche(1, 30, 200, 380_000), tranche(2, 40, 180, 360_000), tranche(3, 20, 150, 300_000)], unitaires: { debutTache: T0 + 9_000, finNpmCi: T0 + 19_000, finLint: T0 + 29_000, finVitest: T0 + 119_000, code: 0 }, projection, declenchement: T0, objectifSecondes: 600 });
    expect(b.totalSecondes).toBe(240); // fin de la tranche 2 : 10 + 40 + 180
    expect(b.installation).toEqual({ moyenneSecondes: 30, maxSecondes: 40 });
    expect(b.trancheLaPlusLongue).toEqual({ index: 1, secondes: 230, testsSecondes: 200 });
    expect(b.parallelisme).toBe(Number((1_040_000 / 530_000).toFixed(2)));
    expect(b.comparaison).toMatchObject({ totalProjeteSecondes: 268, ecartTotalSecondes: -28, nMinimal: 8, nUtilise: 3 });
    expect(b.unitaires).toMatchObject({ npmCiSecondes: 10, lintSecondes: 10, vitestSecondes: 90, tacheSecondes: 110 });
    expect(b.tests).toEqual({ executions: 180, reussis: 174, echoues: 3, instables: 3, ignores: 0 });
    expect(b.depassements).toEqual([]);
    expect(b.verdict).toBe('OBJECTIF TENU');
    expect(bilanTexte(b)).toMatch(/OBJECTIF TENU$/);
  });
  it('objectif non tenu : « OBJECTIF NON TENU (x s pour y s) » et les tranches qui dépassent', () => {
    const b = bilanDuree({ tranches: [tranche(1, 30, 200, 380_000), tranche(2, 60, 700, 1_300_000)], projection, declenchement: T0, objectifSecondes: 600 });
    expect(b.verdict).toBe('OBJECTIF NON TENU (770 s pour 600 s)');
    expect(b.depassements).toEqual([{ index: 2, raison: 'finit à 770 s du déclenchement (objectif 600 s)' }]);
    const lente = bilanDuree({ tranches: [tranche(1, 30, 300, 380_000)], projection, declenchement: T0, objectifSecondes: 600 });
    expect(lente.depassements).toEqual([{ index: 1, raison: 'tests 300 s pour 178 s projetés' }]);
    expect(bilanTexte(b)).toContain('| 2 | 60 s | 10 s | 700 s | 760 s |');
  });
  it('sans déclenchement connu : compté depuis le début de la première tâche ; sans horodatage : non mesuré', () => {
    expect(bilanDuree({ tranches: [tranche(1, 30, 200, 380_000)], objectifSecondes: 600 }).totalSecondes).toBe(230);
    expect(bilanDuree({ tranches: [], objectifSecondes: 600 }).verdict).toMatch(/NON MESURÉ/);
  });
  it('standard sans tranche (aucun test Playwright) : seulement unitaires', () => {
    const b = bilanDuree({ tranches: [], unitaires: { debutTache: T0 + 5_000, finNpmCi: T0 + 15_000, finLint: T0 + 25_000, finVitest: T0 + 105_000, code: 0 }, declenchement: T0, objectifSecondes: 600, palier: 'standard' });
    expect(b).toMatchObject({ nombreDeTranches: 0, totalSecondes: 105, verdict: 'OBJECTIF TENU' });
  });
});
