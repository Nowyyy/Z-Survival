import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as C from '../../scripts/publication/controles.mjs';
import { autorise, depotGitHub, horsDepot, lireArguments, GIT_LECTURE } from '../../scripts/publication/acces.mjs';

// Lot 5o — contrôle de publication (scripts/publication/) : décisions pures sur des données fictives (aucun réseau, aucun gh, aucun git),
// liste blanche des commandes (lecture seule) et absence d'écriture dans le dépôt.
const ROOT = resolve('.');
const versionsData = (latest = 'v0.7', extra = {}) => ({
  schema: 1,
  latest,
  versions: [
    { id: 'v0.5', label: 'V0.5', title: 'Cinq', date: '2026-11-02', branch: 'lot-4b', ref: 'a'.repeat(40), entry: 'jeu.html', status: 'archive', note: '' },
    { id: 'v0.6', label: 'V0.6', title: 'Six', date: '2026-11-06', branch: 'dev', ref: 'b'.repeat(40), entry: 'jeu.html', status: latest === 'v0.6' ? 'actuelle' : 'archive', note: '' },
    ...(latest === 'v0.7' ? [{ id: 'v0.7', label: 'V0.7', title: 'Sept', date: '2026-11-10', branch: 'dev', ref: 'c'.repeat(40), entry: 'jeu.html', status: 'actuelle', note: '' }] : []),
  ],
  dev: { branch: 'dev', path: 'next/' },
  ...extra,
});
const NOMS = '[v0.6]\nnom: V0.6\ndescription: Six.\n\n[v0.7]\nnom: V0.7\ndescription: Sept.\n';
const changelog = (version = 'v0.7') => ({ lots: [{ name: 'lot-5o', titre: 'Deux onglets', points: ['Correctif.'], date: '2026-11-09', version }] });
const r = (fn, data) => fn(data);

describe('contrôles --avant : OK, KO, ATTENTION, NON VÉRIFIABLE', () => {
  it('fraîcheur des références', () => {
    expect(r(C.fraicheur, { locales: { dev: '1', main: '2' }, distantes: { dev: '1', main: '2' } }).resultat).toBe(C.OK);
    expect(r(C.fraicheur, { locales: { dev: '1' }, distantes: { dev: '9' } })).toMatchObject({ resultat: C.ATTENTION, detail: expect.stringContaining('git fetch origin --prune') });
    expect(r(C.fraicheur, { locales: {}, distantes: { erreur: 'réseau' } }).resultat).toBe(C.NV);
  });

  it('dev : hash et bilan (lot-5o.md, sinon le dernier)', () => {
    expect(r(C.dev, { devSha: 'abcdef1234', bilans: ['lot-5n.md', 'lot-5o.md', 'versions'] })).toMatchObject({ resultat: C.OK, detail: 'origin/dev abcdef1 ; bilan : Docs/lots/lot-5o.md' });
    expect(r(C.dev, { devSha: 'abcdef1234', bilans: ['lot-5m.md', 'lot-5n.md', 'lot-10a.md'] }).detail).toContain('lot-10a.md');
    expect(r(C.dev, { devSha: { erreur: 'absent' }, bilans: [] }).resultat).toBe(C.KO);
    expect(r(C.dev, { devSha: 'abc', bilans: [] }).resultat).toBe(C.ATTENTION);
    expect(r(C.dev, { devSha: 'abc', bilans: { erreur: 'x' } }).resultat).toBe(C.NV);
  });

  it('CI de dev : Tests et Pages réussis, aucune en cours', () => {
    const ok = [{ name: 'Tests', status: 'completed', conclusion: 'success', id: 2 }, { name: 'Pages', status: 'completed', conclusion: 'success', id: 3 }];
    expect(r(C.ciDev, { devSha: 'abc', runs: ok }).resultat).toBe(C.OK);
    expect(r(C.ciDev, { devSha: 'abc', runs: [ok[0]] })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('Pages : aucune exécution') });
    expect(r(C.ciDev, { devSha: 'abc', runs: [...ok, { name: 'Tests', status: 'in_progress', id: 4 }] }).detail).toContain('en cours');
    expect(r(C.ciDev, { devSha: 'abc', runs: [ok[1], { ...ok[0], conclusion: 'failure' }] }).resultat).toBe(C.KO);
    expect(r(C.ciDev, { devSha: 'abc', runs: [ok[1], { ...ok[0], conclusion: 'failure', id: 1 }, ok[0]] }).resultat).toBe(C.OK); // relancé : la dernière compte
    expect(r(C.ciDev, { devSha: 'abc', runs: { erreur: 'gh refusé' } }).resultat).toBe(C.NV);
  });

  it('main ancêtre de dev', () => {
    expect(r(C.mainAncetre, { ancetre: true }).resultat).toBe(C.OK);
    expect(r(C.mainAncetre, { ancetre: false })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('Pull Request main → dev') });
    expect(r(C.mainAncetre, { ancetre: { erreur: 'x' } }).resultat).toBe(C.NV);
  });

  it('Pull Requests ouvertes : ATTENTION si l\'une vise main ou dev', () => {
    expect(r(C.pullRequests, { prs: [] }).resultat).toBe(C.OK);
    expect(r(C.pullRequests, { prs: [{ number: 3, head: { ref: 'x' }, base: { ref: 'lot-5o' } }] }).resultat).toBe(C.OK);
    expect(r(C.pullRequests, { prs: [{ number: 4, head: { ref: 'lot-5o' }, base: { ref: 'dev' } }] })).toMatchObject({ resultat: C.ATTENTION, detail: expect.stringContaining('#4 lot-5o → dev') });
    expect(r(C.pullRequests, { prs: { erreur: 'x' } }).resultat).toBe(C.NV);
  });

  it('versions.json : version préparée, remplacée archivée avec le même ref', () => {
    const base = { devVersions: versionsData('v0.7'), mainVersions: versionsData('v0.6'), refAncetre: true, archiveInfo: { ref: 'b'.repeat(40) } };
    expect(r(C.versions, base).resultat).toBe(C.OK);
    expect(r(C.versions, { ...base, devVersions: versionsData('v0.6') })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('version non préparée') });
    expect(r(C.versions, { ...base, archiveInfo: null }).detail).toContain('absent de origin/archive');
    expect(r(C.versions, { ...base, archiveInfo: { ref: 'f'.repeat(40) } }).resultat).toBe(C.KO);
    expect(r(C.versions, { ...base, refAncetre: false }).resultat).toBe(C.KO);
    expect(r(C.versions, { ...base, refAncetre: { erreur: 'x' } }).resultat).toBe(C.NV);
    expect(r(C.versions, { ...base, archiveInfo: { erreur: 'x' } }).resultat).toBe(C.NV);
    expect(r(C.versions, { ...base, devVersions: { schema: 2 } }).resultat).toBe(C.KO);
    const sansArchive = versionsData('v0.7');
    sansArchive.versions[1].status = 'indisponible';
    sansArchive.versions[1].note = 'non construite';
    expect(r(C.versions, { ...base, devVersions: sansArchive }).detail).toContain('doit être « archive »');
  });

  it('fichier des noms : bloc de latest, longueurs, brouillons', () => {
    expect(r(C.noms, { texte: NOMS, devVersions: versionsData('v0.7') }).resultat).toBe(C.OK);
    expect(r(C.noms, { texte: '[v0.6]\nnom: V0.6\n', devVersions: versionsData('v0.7') }).detail).toContain('aucun bloc [v0.7]');
    expect(r(C.noms, { texte: `[v0.7]\nnom: ${'x'.repeat(61)}\n`, devVersions: versionsData('v0.7') }).resultat).toBe(C.KO);
    expect(r(C.noms, { texte: '[v0.7]\nnom: V0.7\n', devVersions: versionsData('v0.7') }).resultat).toBe(C.ATTENTION);
    expect(r(C.noms, { texte: NOMS, devVersions: versionsData('v0.7'), brouillons: ['Sept.'] })).toMatchObject({ resultat: C.ATTENTION, detail: expect.stringContaining('brouillon') });
    expect(r(C.noms, { texte: { erreur: 'x' }, devVersions: versionsData() }).resultat).toBe(C.KO);
  });

  it('évolutions après publication : vide si la version cible est déclarée', () => {
    expect(r(C.evolutions, { devVersions: versionsData('v0.7'), changelog: changelog('v0.7'), texteNoms: NOMS }).resultat).toBe(C.OK);
    expect(r(C.evolutions, { devVersions: versionsData('v0.6'), changelog: changelog('v0.7'), texteNoms: NOMS })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('v0.7 (lot-5o)') });
    // Le fichier des noms peut rattacher un lot à une autre version (comme l'assembleur).
    expect(r(C.evolutions, { devVersions: versionsData('v0.6'), changelog: changelog('v0.7'), texteNoms: `${NOMS}\n[lot-5o]\nversion: v0.6\n` }).resultat).toBe(C.OK);
    expect(r(C.evolutions, { devVersions: { erreur: 'x' }, changelog: changelog() }).resultat).toBe(C.NV);
  });

  it('seed : version publiée citée = latest ; dernier commit par le propriétaire', () => {
    const texte = 'Titre\nVersion 0.27 — 10/11/2026\nSite : **version publiée (Recette) : V0.7**, jouable\n';
    const commit = { sha: 'abc1234', auteur: 'Nowyyy', committer: 'web-flow' };
    expect(r(C.seed, { texte, devVersions: versionsData('v0.7'), dernierCommit: commit, proprietaires: ['nowyyy'] }).resultat).toBe(C.OK);
    expect(r(C.seed, { texte, devVersions: versionsData('v0.6'), dernierCommit: commit, proprietaires: ['Nowyyy'] })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('cite V0.7, latest est v0.6') });
    expect(r(C.seed, { texte, devVersions: versionsData('v0.7'), dernierCommit: { ...commit, auteur: 'claude' }, proprietaires: ['Nowyyy'] }).resultat).toBe(C.ATTENTION);
    expect(r(C.seed, { texte, devVersions: versionsData('v0.7'), dernierCommit: { erreur: 'gh refusé' }, proprietaires: ['Nowyyy'] }).resultat).toBe(C.NV);
    expect(r(C.seed, { texte: 'rien', devVersions: versionsData('v0.7'), dernierCommit: commit, proprietaires: ['Nowyyy'] }).resultat).toBe(C.KO);
  });

  it('CLAUDE.md : marge ≥ 150 OK, entre 150 et 100 ATTENTION, sous 100 KO', () => {
    expect(r(C.claude, { texte: 'a'.repeat(8250) }).resultat).toBe(C.OK);
    expect(r(C.claude, { texte: 'a'.repeat(8251) }).resultat).toBe(C.ATTENTION);
    expect(r(C.claude, { texte: 'a'.repeat(8300) }).resultat).toBe(C.ATTENTION);
    expect(r(C.claude, { texte: 'a'.repeat(8301) }).resultat).toBe(C.KO);
    expect(r(C.claude, { texte: 'a'.repeat(9000) }).resultat).toBe(C.KO);
    expect(r(C.claude, { texte: 'é'.repeat(8000) })).toMatchObject({ resultat: C.ATTENTION, detail: expect.stringContaining('octets') }); // 8 000 caractères, 16 000 octets
    expect(r(C.claude, { texte: { erreur: 'x' } }).resultat).toBe(C.NV);
  });

  it('palier complet : même code que dev, sinon à refaire ; dernier-complet null → ATTENTION', () => {
    const run = { id: 1, head_sha: 'abc1234', head_branch: 'essai/complet-11' };
    expect(r(C.complet, { run, identique: true, dernierComplet: { version: 'v0.6' } }).resultat).toBe(C.OK);
    expect(r(C.complet, { run, identique: true, dernierComplet: null }).resultat).toBe(C.ATTENTION);
    expect(r(C.complet, { run, identique: false, dernierComplet: null })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('à refaire sur le contenu final') });
    expect(r(C.complet, { run: null, identique: null, dernierComplet: {} }).resultat).toBe(C.KO);
    expect(r(C.complet, { run, identique: { erreur: 'absent' }, dernierComplet: {} }).resultat).toBe(C.NV);
    expect(r(C.complet, { run: { erreur: 'gh' }, identique: null, dernierComplet: {} }).resultat).toBe(C.NV);
  });

  it('construction et site : racine, archives, canaux ; --sans-build = NON VÉRIFIABLE (jamais OK)', () => {
    const ok = { racine: ['index.html', 'Recette', 'dev', 'v0.5', '404.html', 'next'], canalRecette: 'release', canalDev: 'dev' };
    expect(r(C.site, ok).resultat).toBe(C.OK);
    expect(r(C.site, { sansBuild: true }).resultat).toBe(C.NV);
    expect(r(C.site, { erreur: 'npm ci' }).resultat).toBe(C.KO);
    expect(r(C.site, { ...ok, racine: ['index.html', 'Recette', 'dev', '404.html'] }).detail).toContain('v0.*');
    expect(r(C.site, { ...ok, canalRecette: 'source' }).resultat).toBe(C.KO);
    expect(r(C.site, { ...ok, canalDev: null }).resultat).toBe(C.KO);
  });

  it('workflows, branches, dépendances', () => {
    expect(r(C.workflows, { fichiers: [] }).resultat).toBe(C.OK);
    expect(r(C.workflows, { fichiers: ['.github/workflows/pages.yml'] })).toMatchObject({ resultat: C.ATTENTION, detail: expect.stringContaining('pages.yml') });
    expect(r(C.branches, { lotsNonFusionnes: [], essais: 2 }).detail).toContain('2 branche(s) essai/*');
    expect(r(C.branches, { lotsNonFusionnes: [{ nom: 'lot-5o', sha: 'abcdef123' }], essais: 0 })).toMatchObject({ resultat: C.ATTENTION, detail: expect.stringContaining('lot-5o abcdef1') });
    expect(r(C.dependances, { packageJson: '{"devDependencies":{"x":"1"}}' }).resultat).toBe(C.OK);
    expect(r(C.dependances, { packageJson: '{"dependencies":{}}' }).resultat).toBe(C.OK);
    expect(r(C.dependances, { packageJson: '{"dependencies":{"left-pad":"1"}}' }).resultat).toBe(C.KO);
    expect(r(C.dependances, { packageJson: '{bad' }).resultat).toBe(C.KO);
    expect(r(C.dependances, { packageJson: { erreur: 'x' } }).resultat).toBe(C.NV);
  });
});

describe('contrôles --apres', () => {
  it('contenu de main = dev, Pages sur main (jamais manuel)', () => {
    expect(r(C.mainEgalDev, { resume: '' }).resultat).toBe(C.OK);
    expect(r(C.mainEgalDev, { resume: ' a | 2 +-\n 1 file changed\n' })).toMatchObject({ resultat: C.KO, detail: expect.stringContaining('1 file changed') });
    expect(r(C.mainEgalDev, { resume: { erreur: 'x' } }).resultat).toBe(C.NV);
    const push = { name: 'Pages', status: 'completed', conclusion: 'success', event: 'push', id: 5 };
    expect(r(C.pagesMain, { mainSha: 'abc', runs: [push] }).resultat).toBe(C.OK);
    expect(r(C.pagesMain, { mainSha: 'abc', runs: [{ ...push, event: 'workflow_dispatch' }] }).detail).toContain('à la main');
    expect(r(C.pagesMain, { mainSha: 'abc', runs: [{ ...push, conclusion: 'failure' }] }).resultat).toBe(C.KO);
    expect(r(C.pagesMain, { mainSha: 'abc', runs: [] }).resultat).toBe(C.KO);
    expect(r(C.pagesMain, { mainSha: 'abc', runs: { erreur: 'x' } }).resultat).toBe(C.NV);
  });

  it('adresses du site : contenu clé ; réseau refusé → NON VÉRIFIABLE, jamais OK', () => {
    const reponses = {
      '': { status: 200, body: 'Z-Survival est en construction.' },
      'Recette/': { status: 200, body: '<html>' },
      'Recette/jeu.html': { status: 200, body: '<meta name="zs-canal" content="release">' },
      'Recette/site-info.json': { status: 200, body: JSON.stringify({ recette: { id: 'v0.7' }, evolutions: [] }) },
      'Recette/build-info.json': { status: 200, body: '{"channel":"release"}' },
      'dev/jeu.html': { status: 200, body: '<meta name="zs-canal" content="dev">' },
      'v0.6/': { status: 200, body: '<html>' },
      'recette/': { status: 404, body: 'location.replace(…/Recette/…)' },
    };
    expect(r(C.adresses, { reponses, latest: 'v0.7', remplacee: 'v0.6' }).resultat).toBe(C.OK);
    expect(r(C.adresses, { reponses: { ...reponses, 'Recette/site-info.json': { status: 200, body: JSON.stringify({ recette: { id: 'v0.7' }, evolutions: [{}] }) } }, latest: 'v0.7', remplacee: 'v0.6' }).resultat).toBe(C.KO);
    expect(r(C.adresses, { reponses: { ...reponses, 'recette/': { status: 200, body: 'Recette' } }, latest: 'v0.7', remplacee: 'v0.6' }).resultat).toBe(C.KO);
    const refuse = Object.fromEntries(Object.keys(reponses).map((k) => [k, { erreur: 'curl: (56) CONNECT tunnel failed, response 403' }]));
    expect(r(C.adresses, { reponses: refuse, latest: 'v0.7', remplacee: 'v0.6' })).toMatchObject({ resultat: C.NV, detail: expect.stringContaining('réseau') });
    expect(r(C.adresses, { reponses: { ...refuse, '': reponses[''] }, latest: 'v0.7', remplacee: 'v0.6' }).resultat).toBe(C.NV); // en partie lu, rien de faux : toujours pas OK
  });

  it('main ancêtre de dev (rappel), dernier-complet, branches à supprimer', () => {
    expect(r(C.mainAncetreApres, { ancetre: false }).resultat).toBe(C.ATTENTION);
    expect(r(C.dernierComplet, { valeur: null }).resultat).toBe(C.ATTENTION);
    expect(r(C.dernierComplet, { valeur: { version: 'v0.7' } }).resultat).toBe(C.OK);
    expect(r(C.aSupprimer, { essais: ['essai/complet-11'], lotsFusionnes: ['lot-5o'] })).toMatchObject({ resultat: C.OK, detail: 'information : essai/complet-11, lot-5o' });
  });
});

describe('résumé, tableau, code de sortie, entrées hostiles, déterminisme', () => {
  const lignes = [
    { id: 'a', controle: 'un', resultat: C.OK, detail: 'bien' },
    { id: 'b', controle: 'deux', resultat: C.ATTENTION, detail: 'à voir' },
    { id: 'c', controle: 'trois', resultat: C.NV, detail: 'réseau' },
  ];

  it('résumé : ATTENTION et NON VÉRIFIABLE en tête, puis le verdict ; code 0 sans KO, 1 avec', () => {
    expect(C.resume(lignes)).toEqual(['ATTENTION — deux : à voir', 'NON VÉRIFIABLE — trois : réseau', 'PRÊT À PUBLIER']);
    expect(C.codeSortie(lignes)).toBe(0);
    const ko = [...lignes, { id: 'd', controle: 'quatre', resultat: C.KO, detail: 'non' }];
    expect(C.resume(ko).at(-1)).toBe('PAS PRÊT : 1 KO (quatre)');
    expect(C.codeSortie(ko)).toBe(1);
    expect(C.resume(ko, 'apres').at(-1)).toBe('PUBLICATION INCOMPLÈTE : 1 KO (quatre)');
    expect(C.resume(lignes, 'apres').at(-1)).toBe('PUBLICATION VÉRIFIÉE (aucun KO)');
    expect(C.codeSortie('x')).toBe(0);
  });

  it('tableau : une ligne par contrôle, sans « | » ni retour à la ligne dans les cellules', () => {
    const t = C.tableau([{ controle: 'x|y', resultat: C.KO, detail: 'a\nb|c\u0007' }]);
    expect(t.split('\n')).toEqual(['| contrôle | résultat | détail |', '|---|---|---|', '| x/y | KO | a b/c |']);
  });

  it('entrées hostiles : aucun contrôle ne lève, aucun n\'est « OK » sans données', () => {
    const hostiles = [undefined, null, 3, 'x', [], { __proto__: { erreur: 'x' } }, { erreur: 'x' }, { devSha: 3, runs: 'x', bilans: 5, prs: {}, texte: 7, devVersions: [], run: 'x', fichiers: 'x', racine: 'x' }];
    for (const fn of [...C.AVANT, ...C.APRES]) {
      for (const h of hostiles) {
        let res;
        expect(() => { res = fn(h); }, fn.name).not.toThrow();
        expect(C.RESULTATS).toContain(res.resultat);
        if (fn !== C.dependances && fn !== C.aSupprimer && fn !== C.site) expect(res.resultat, `${res.controle} ${JSON.stringify(h)}`).not.toBe(C.OK);
      }
    }
  });

  it('déterministe : mêmes données, même résultat', () => {
    const d = { devVersions: versionsData('v0.7'), changelog: changelog(), texteNoms: NOMS };
    expect(C.evolutions(d)).toEqual(C.evolutions(structuredClone(d)));
    expect(C.AVANT.map((f) => f({}))).toEqual(C.AVANT.map((f) => f({})));
  });
});

describe('lecture seule : liste blanche des commandes et aucune écriture dans le dépôt', () => {
  it('git : lectures seulement', () => {
    for (const args of [['rev-parse', 'origin/dev'], ['merge-base', '--is-ancestor', 'a', 'b'], ['show', 'origin/dev:versions.json'], ['cat-file', '-e', 'abc^{commit}'], ['log', '-1', '--format=%H'], ['diff', '--quiet', 'a..b', '--', '.'], ['ls-remote', '--heads', 'origin'], ['for-each-ref', 'refs/remotes/origin'], ['ls-tree', '--name-only', 'origin/dev', 'Docs/lots/'], ['remote', 'get-url', 'origin']]) {
      expect(autorise('git', args, { racine: ROOT }).ok, args.join(' ')).toBe(true);
    }
    for (const args of [['push', 'origin', 'x'], ['fetch'], ['commit', '-m', 'x'], ['branch', '-D', 'x'], ['tag', 'v'], ['worktree', 'add', 'x'], ['reset', '--hard'], ['checkout', 'x'], ['merge', 'x'], ['update-ref', 'x', 'y'], ['config', 'a', 'b'], ['remote', 'add', 'x', 'y'], ['remote', 'set-url', 'origin', 'x'],
      ['merge-base', 'a', 'b'], ['ls-remote', 'origin'], ['diff', '--output=/tmp/x'], ['diff', '--output', 'x'], ['log', '-c', 'x'], ['gc'], ['stash'], []]) {
      expect(autorise('git', args, { racine: ROOT }).ok, args.join(' ')).toBe(false);
    }
  });

  it('gh : api en GET seulement, sans champ ni en-tête ; curl : GET vers le site publié sans fichier ; node : assemblage hors du dépôt', () => {
    expect(autorise('gh', ['api', '--method', 'GET', 'repos/Nowyyy/Z-Survival/actions/runs?head_sha=abc&per_page=100']).ok).toBe(true);
    expect(autorise('gh', ['api', '--method', 'GET', 'repos/Nowyyy/Z-Survival']).ok).toBe(true);
    for (const args of [['api', 'repos/x/y'], ['api', '--method', 'POST', 'repos/x/y/pulls'], ['api', '--method', 'GET', '-X', 'DELETE', 'repos/x/y/git/refs/heads/a'], ['api', '--method', 'GET', 'repos/x/y', '-f', 'a=b'], ['api', '--method', 'GET', 'repos/x/y', '--input', 'f'],
      ['api', '--method', 'GET', 'graphql'], ['api', '--method', 'GET', 'repos/x/y', '-H', 'X: y'], ['pr', 'create'], ['run', 'rerun', '1'], ['api', '--method', 'GET', 'repos/x/y', 'repos/a/b'], ['api', '--method=PATCH', 'repos/x/y']]) {
      expect(autorise('gh', args).ok, args.join(' ')).toBe(false);
    }
    expect(autorise('curl', ['-sS', '-m', '20', '-w', '\n%{http_code}', 'https://nowyyy.github.io/Z-Survival/Recette/']).ok).toBe(true);
    for (const args of [['-o', '/tmp/x', 'https://nowyyy.github.io/Z-Survival/'], ['-X', 'POST', 'https://nowyyy.github.io/Z-Survival/'], ['-d', 'a', 'https://nowyyy.github.io/Z-Survival/'], ['https://exemple.com/'], ['-T', 'f', 'https://nowyyy.github.io/Z-Survival/']]) {
      expect(autorise('curl', args).ok, args.join(' ')).toBe(false);
    }
    const dehors = join(tmpdir(), 'zs-site');
    expect(autorise('node', ['scripts/site/local.mjs', '--main', 'origin/dev', '--out', dehors], { racine: ROOT }).ok).toBe(true);
    expect(autorise('node', ['scripts/site/local.mjs', '--out', join(ROOT, '_site')], { racine: ROOT }).ok).toBe(false);
    expect(autorise('node', ['scripts/site/local.mjs'], { racine: ROOT }).ok).toBe(false);
    expect(autorise('node', ['scripts/autre.mjs', '--out', dehors], { racine: ROOT }).ok).toBe(false);
    for (const cmd of ['npm', 'sh', 'bash', 'rm', 'npx']) expect(autorise(cmd, ['x']).ok).toBe(false);
    expect(GIT_LECTURE).not.toContain('push');
  });

  it('le script ne lance rien sans la liste blanche et n\'écrit que le fichier --json, hors du dépôt', () => {
    const files = readdirSync('scripts/publication').filter((f) => f.endsWith('.mjs'));
    const src = Object.fromEntries(files.map((f) => [f, readFileSync(`scripts/publication/${f}`, 'utf8')]));
    const all = Object.values(src).join('\n');
    // Une seule fonction lance des commandes (executer), et elle passe par autorise().
    expect(all.match(/\b(spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\(/g)).toEqual(['spawnSync(']);
    expect(src['controler.mjs']).toMatch(/function executer[^]*?autorise\(cmd, args[^]*?spawnSync\(cmd, args/);
    // Une seule écriture : le rapport --json (chemin vérifié hors du dépôt par lireArguments).
    expect(all.match(/\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|mkdirSync|copyFileSync|cpSync|renameSync|unlinkSync)\(/g)).toEqual(['writeFileSync(']);
    expect(src['controler.mjs']).toMatch(/if \(args\.json\) writeFileSync\(resolve\(args\.json\)/);
    // Le seul effacement porte sur le dossier temporaire de l'assemblage (mkdtemp dans tmpdir()).
    expect(all.match(/rmSync\(/g)).toHaveLength(1);
    expect(src['controler.mjs']).toMatch(/mkdtempSync\(join\(tmpdir\(\), 'zs-controle-'\)\)[^]*rmSync\(tmp,/);
    expect(all).not.toMatch(/fetch\(|XMLHttpRequest/);
  });

  it('options : --json hors du dépôt seulement ; options inconnues refusées', () => {
    expect(lireArguments([], ROOT)).toMatchObject({ mode: 'avant', json: null, sansBuild: false });
    expect(lireArguments(['--apres', '--sans-build'], ROOT)).toMatchObject({ mode: 'apres', sansBuild: true });
    expect(lireArguments(['--json', join(tmpdir(), 'r.json')], ROOT).json).toBe(join(tmpdir(), 'r.json'));
    expect(lireArguments(['--json', 'rapport.json'], ROOT).erreur).toContain('hors du dépôt');
    expect(lireArguments(['--json', join(ROOT, 'Docs/x.json')], ROOT).erreur).toContain('hors du dépôt');
    expect(lireArguments(['--json'], ROOT).erreur).toBeDefined();
    expect(lireArguments(['--push'], ROOT).erreur).toContain('inconnue');
    expect(lireArguments(['--avant', '--apres'], ROOT).erreur).toBeDefined();
    expect(horsDepot(ROOT, ROOT)).toBe(false);
    expect(depotGitHub('https://github.com/Nowyyy/Z-Survival')).toEqual({ owner: 'Nowyyy', repo: 'Z-Survival' });
    expect(depotGitHub('git@github.com:Nowyyy/Z-Survival.git')).toEqual({ owner: 'Nowyyy', repo: 'Z-Survival' });
    expect(depotGitHub('https://exemple.com/x')).toBeNull();
  });
});
