import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../../scripts/publication/controles.mjs';
import { estIgnore, lirePathsIgnore, motifEnRegex } from '../../scripts/publication/chemins-ignores.mjs';

// Lot 5q — contrôle de publication, CI de dev (contrôle 2) : le dernier commit testé avec succès de la lignée --first-parent de dev, et les fichiers
// modifiés depuis, comparés aux paths-ignore lus dans tests.yml. Données fictives : aucun réseau, aucun gh, aucun git.
const TESTS_YML = readFileSync('.github/workflows/tests.yml', 'utf8');
const sha = (c) => c.repeat(40);
const [TETE, SEED, TESTE, ANCIEN] = [sha('a'), sha('b'), sha('c'), sha('d')];
const pages = { name: 'Pages', status: 'completed', conclusion: 'success', id: 900, event: 'push', head_sha: TETE };
const tests = (head_sha, id, extra = {}) => ({ name: 'Tests', status: 'completed', conclusion: 'success', id, event: 'push', head_sha, ...extra });
// runs : exécutions du hash de la tête ; historique : exécutions Tests de dev ; fichiers : diff depuis la référence attendue.
const donnees = (extra = {}) => ({ devSha: TETE, runs: [pages], historique: [tests(TESTE, 10)], commits: [TETE, SEED, TESTE, ANCIEN], workflow: TESTS_YML, fichiers: { depuis: TESTE, liste: ['Docs/seed.md'] }, ...extra });
const ci = (extra) => C.ciDev(donnees(extra));

describe('CI de dev : dernier commit testé de la lignée et chemins ignorés par tests.yml', () => {
  it('tête testée : OK, comme avant (sans diff)', () => {
    const res = ci({ runs: [pages, tests(TETE, 20)], fichiers: null });
    expect(res.resultat).toBe(C.OK);
    expect(res.detail).toContain('dernier commit testé : aaaaaaa (tête de dev, 20)');
    expect(res.detail).toContain('Pages : réussi (900)');
  });

  it('commit du seed seul après un commit testé : OK, avec le message', () => {
    const res = ci();
    expect(res).toMatchObject({ resultat: C.OK, detail: expect.stringContaining('dernier commit testé : ccccccc (10) ; depuis : Docs/seed.md, ignorés par les tests') });
  });

  it('commit de fusion sans fichier modifié (retour de main dans dev) : OK, « aucun fichier »', () => {
    const res = ci({ commits: [TETE, TESTE], fichiers: { depuis: TESTE, liste: [] } });
    expect(res).toMatchObject({ resultat: C.OK, detail: expect.stringContaining('dernier commit testé : ccccccc (10) ; depuis : aucun fichier') });
  });

  it('un fichier de code modifié depuis le dernier commit testé : KO, fichier listé', () => {
    const res = ci({ fichiers: { depuis: TESTE, liste: ['js/main.js'] } });
    expect(res).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('fichiers non ignorés par tests.yml : js/main.js') });
  });

  it('mélange de documentation et de code : KO, seul le code est listé', () => {
    const res = ci({ fichiers: { depuis: TESTE, liste: ['Docs/seed.md', 'README.md', 'data/game/vagues.json'] } });
    expect(res.resultat).toBe(C.KO);
    expect(res.detail).toContain('data/game/vagues.json');
    expect(res.detail).not.toContain('README.md');
  });

  it('dernière exécution conclue en échec : KO (jamais de saut vers un succès plus ancien)', () => {
    const res = ci({ historique: [tests(ANCIEN, 5), tests(TESTE, 10, { conclusion: 'failure' })], fichiers: { depuis: ANCIEN, liste: ['Docs/seed.md'] } });
    expect(res).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('failure sur ccccccc (10)') });
    // Relancée avec succès : la plus récente compte ; annulée : ne conclut rien, la référence remonte.
    expect(ci({ historique: [tests(TESTE, 10, { conclusion: 'failure' }), tests(TESTE, 11)] }).resultat).toBe(C.OK);
    expect(ci({ historique: [tests(ANCIEN, 5), tests(TESTE, 10, { conclusion: 'cancelled' })], fichiers: { depuis: ANCIEN, liste: ['Docs/seed.md'] } }).detail).toContain('dernier commit testé : ddddddd');
  });

  it('exécution Tests en cours sur la tête : NON VÉRIFIABLE (aussi sur le dernier commit testé)', () => {
    const res = ci({ runs: [pages, tests(TETE, 30, { status: 'in_progress', conclusion: null })] });
    expect(res).toMatchObject({ resultat: C.NV, detail: expect.stringContaining('en cours sur la tête aaaaaaa (30)') });
    expect(ci({ runs: [pages, { ...tests(TETE, 31, { status: 'queued', conclusion: null }), event: 'pull_request' }] }).resultat).toBe(C.NV);
    expect(ci({ historique: [tests(TESTE, 10, { status: 'in_progress', conclusion: null })] }).resultat).toBe(C.NV);
  });

  it('aucun commit testé dans les 50 derniers : KO ; une Pull Request ne compte pas comme test du hash', () => {
    const commits = [TETE, ...Array.from({ length: 49 }, (_, i) => i.toString(16).padStart(40, 'e')), TESTE];
    expect(commits).toHaveLength(51);
    const res = ci({ commits });
    expect(res).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('aucun commit testé avec succès dans les 50 derniers') });
    expect(ci({ historique: [{ ...tests(TESTE, 10), event: 'pull_request' }] }).resultat).toBe(C.KO);
    expect(ci({ historique: [] }).resultat).toBe(C.KO);
    expect(ci({ historique: { erreur: 'gh refusé' } }).resultat).toBe(C.NV); // non lu : jamais KO ni OK
  });

  it('tests.yml illisible ou sans paths-ignore : NON VÉRIFIABLE, jamais OK', () => {
    const sansIgnore = TESTS_YML.replace(/^ {4}paths-ignore:.*$/gm, '');
    for (const workflow of [null, { erreur: 'absent' }, '', 'on: [push]\n', sansIgnore, 'on:\n  push:\n    paths-ignore: [Docs/**\n', 'on:\n  push:\n    paths: [js/**]\n    paths-ignore: [\'Docs/**\']\n']) {
      for (const extra of [{}, { runs: [pages, tests(TETE, 20)], fichiers: null }]) {
        const res = ci({ workflow, ...extra });
        expect(res.resultat, JSON.stringify(workflow)).toBe(C.NV);
        expect(res.detail).toContain('chemins ignorés illisibles');
      }
    }
  });

  it('fichiers illisibles ou d\'une autre référence, lignée qui ne commence pas par la tête : NON VÉRIFIABLE', () => {
    expect(ci({ fichiers: { erreur: 'git diff' } }).resultat).toBe(C.NV);
    expect(ci({ fichiers: { depuis: ANCIEN, liste: [] } }).resultat).toBe(C.NV);
    expect(ci({ fichiers: { depuis: TESTE, liste: [3] } }).resultat).toBe(C.NV);
    expect(ci({ commits: [SEED, TESTE] }).resultat).toBe(C.NV);
    expect(ci({ commits: { erreur: 'git log' } }).resultat).toBe(C.NV);
  });

  it('entrées hostiles : noms avec espaces, accents, caractères de contrôle ; aucune exception', () => {
    expect(ci({ fichiers: { depuis: TESTE, liste: ['Docs/notes de réunion é.md', 'à lire.md', 'Docs/\n\u0007x.txt'] } }).resultat).toBe(C.OK);
    const res = ci({ fichiers: { depuis: TESTE, liste: ['js/fichier é |\u0000\n.js'] } });
    expect(res.resultat).toBe(C.KO);
    expect([...res.detail].some((c) => c.charCodeAt(0) < 32 || c === '|')).toBe(false); // cellule nettoyée
    for (const h of [undefined, null, 'x', [], { runs: [null, 3, 'x'], commits: [null], historique: [null, 'x'], fichiers: 'x', workflow: 7 }]) {
      expect(() => C.ciDev(h)).not.toThrow();
      expect(C.ciDev(h).resultat).not.toBe(C.OK);
    }
  });
});

describe('chemins ignorés : lecture de tests.yml et motifs de GitHub', () => {
  it('tests.yml réel : paths-ignore du push lus, jamais recopiés', () => {
    expect(lirePathsIgnore(TESTS_YML)).toEqual({ motifs: ['Docs/**', '**/*.md'] });
  });

  it('formes lisibles : liste entre crochets, liste à tirets, guillemets, commentaires ; push lu, pas pull_request', () => {
    expect(lirePathsIgnore('on:\n  push:\n    branches: [dev]\n    paths-ignore:\n      - "Docs/**"  # doc\n      - \'**/*.md\'\n  pull_request:\n    paths-ignore: [\'x/**\']\n')).toEqual({ motifs: ['Docs/**', '**/*.md'] });
    expect(lirePathsIgnore('# Tests\non: # déclencheurs\n  push:\n    paths-ignore: ["a b/**", \'it\'\'s.md\', c/*.txt]\njobs:\n  x:\n')).toEqual({ motifs: ['a b/**', "it's.md", 'c/*.txt'] });
    expect(lirePathsIgnore('on:\r\n  push:\r\n    paths-ignore:\r\n    - \'Docs/**\'\r\n')).toEqual({ motifs: ['Docs/**'] });
  });

  it('formes non gérées : erreur avec la raison (jamais une liste vide)', () => {
    for (const [texte, raison] of [
      [null, 'absent'], ['', 'absent'], ['jobs:\n  a:\n', 'aucun bloc'], ['on: [push]\n', 'sur une ligne'], ['on:\n  pull_request:\n', 'aucun déclencheur « push »'],
      ['on:\n  push:\n    branches: [dev]\n', 'aucun « paths-ignore »'], ['on:\n  push:\n    paths-ignore: []\n', 'vide'], ['on:\n  push:\n    paths-ignore: [\'a/**\', \'!a/b\']\n', 'non géré'],
      ['on:\n  push:\n    paths-ignore: [\'a/?.md\']\n', 'non géré'], ['on:\n  push:\n    paths-ignore: [\'Docs/**\'\n', 'crochets'], ['on:\n  push:\n    paths-ignore: [\'Docs/**]\n', 'illisible'],
      ['on:\n  push:\n    paths: [\'js/**\']\n', '« paths »'], ['on:\n  push:\n    paths-ignore:\n      - **/*.md\n', 'illisible'], ['on:\n\tpush:\n', 'tabulation'],
      ['on:\n  push:\n    paths-ignore: [a]\non:\n  push:\n', 'plusieurs'],
    ]) {
      const r = lirePathsIgnore(texte);
      expect(r.motifs, JSON.stringify(texte)).toBeUndefined();
      expect(r.erreur, JSON.stringify(texte)).toContain(raison);
    }
  });

  it('motifs : ** (tout, dossiers compris), * (sans /), **/ (zéro ou plusieurs dossiers), dossiers, littéraux', () => {
    const m = ['Docs/**', '**/*.md'];
    for (const p of ['Docs/seed.md', 'Docs/lots/versions/v0.7.md', 'Docs/ref/image.png', 'README.md', 'CLAUDE.md', 'a/b/c/d.md', 'Docs/a b/é.txt']) expect(estIgnore(p, m), p).toBe(true);
    for (const p of ['js/main.js', 'docs/x.js', 'README.mdx', 'x.md.js', 'DocsX/a.js', 'Docs', 'data/changelog.json', '.github/workflows/tests.yml']) expect(estIgnore(p, m), p).toBe(false);
    expect(estIgnore('a/b.txt', ['a/*.txt'])).toBe(true);
    expect(estIgnore('a/c/b.txt', ['a/*.txt'])).toBe(false);
    expect(estIgnore('a/c/b.txt', ['a/**/b.txt'])).toBe(true);
    expect(estIgnore('a/b.txt', ['a/**/b.txt'])).toBe(true);
    expect(estIgnore('ab.txt', ['a.txt'])).toBe(false); // le point est littéral
    expect(estIgnore('a(b).txt', ['a(b).txt'])).toBe(true);
    expect(motifEnRegex('**/*.md').test('x/\ny.md')).toBe(true);
  });

  it('entrées hostiles : jamais ignoré sans motif valide, aucune exception', () => {
    for (const [p, m] of [[null, ['**']], ['', ['**']], [3, ['**']], ['a.md', null], ['a.md', [null, 3, '']], ['a.md', ['a?md']], ['a.md', '**']]) expect(estIgnore(p, m)).toBe(false);
    expect(estIgnore('fichier é\u0000\n.md', ['**/*.md'])).toBe(true);
  });
});
