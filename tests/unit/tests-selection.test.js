// Lot 4e-B : sélection des tests par zone (scripts/tests/lib/selection.mjs), contrôle de tests/selection.json, complet périodique,
// enregistrement du dernier complet, scripts de package.json.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { correspond, globVersRegex } from '../../scripts/tests/lib/glob.mjs';
import { aretesEntreZones, referencesDe } from '../../scripts/tests/lib/graphe.mjs';
import { changementsDeTable, completPeriodique, controlerTable, cyclesDe, fermetureInverse, refDeVersionActuelle, selectionner } from '../../scripts/tests/lib/selection.mjs';
import { verdictComplet } from '../../scripts/tests/lib/complet.mjs';

const T = (zones, extra = {}) => ({
  fumee: ['tests/e2e/fumee.spec.js'], toujours: ['tests/unit/hygiene.test.js'], 'rejeu-total': ['package.json', 'css/tokens.css', '.github/workflows/**', 'tests/selection.json'],
  documentation: { inclus: ['Docs/**', '**/*.md'], exclus: ['Docs/ref/tests-*.md'] }, defaut: 'tout', zones, ...extra,
});
const Z = (id, sources, dependances = [], o = {}) => ({ id, sources, dependances, vitest: [`tests/unit/${id}.test.js`], e2e: o.e2e ?? [], complet: o.complet ?? [] });
const simple = T([Z('noyau', ['js/core/vec.js']), Z('vagues', ['js/core/waves.js'], ['noyau']), Z('economie', ['js/core/economy.js'], ['vagues'], { e2e: ['tests/e2e/argent.spec.js'] }), Z('interface', ['js/game/hud.js'], ['economie']), Z('sons', ['js/game/audio.js'], ['noyau'])]);
const ids = (r) => r.rejouees.map((z) => z.id);

describe('motifs de chemins', () => {
  it('** traverse les dossiers, * reste dans un nom, un dossier « x/ » vise tout son contenu', () => {
    expect(globVersRegex('js/**').test('js/a/b.js')).toBe(true);
    expect(globVersRegex('js/*.js').test('js/a/b.js')).toBe(false);
    expect(correspond('Docs/ref/x.md', ['**/*.md'])).toBe(true);
    expect(correspond('README.md', ['**/*.md'])).toBe(true);
    expect(correspond('data/game/maps/a/b.json', ['data/game/maps/'])).toBe(true);
    expect(correspond('js/core/vec.jsx', ['js/core/vec.js'])).toBe(false);
  });
});

describe('sélection par zone', () => {
  it('zone touchée et fermeture inverse en chaîne : vagues → economie → interface ; sons sauté avec la raison', () => {
    const r = selectionner({ fichiers: ['js/core/waves.js'], table: simple, base: 'abc123' });
    expect(r.mode).toBe('zones');
    expect(ids(r)).toEqual(['vagues', 'economie', 'interface']);
    expect(r.rejouees.find((z) => z.id === 'interface').raison).toBe('dépend de « economie »');
    expect(r.sautees.find((z) => z.id === 'sons').raison).toBe('aucune source ni dépendance modifiée depuis abc123');
    expect(r.vitest).toEqual(['tests/unit/economie.test.js', 'tests/unit/hygiene.test.js', 'tests/unit/interface.test.js', 'tests/unit/vagues.test.js']);
    expect(r.e2e).toEqual(['tests/e2e/argent.spec.js']);
    expect(r.fumee).toEqual(['tests/e2e/fumee.spec.js']);
  });
  it('dépendance simple : une feuille ne rejoue pas ses dépendances', () => {
    expect(ids(selectionner({ fichiers: ['js/game/hud.js'], table: simple }))).toEqual(['interface']);
  });
  it('module partagé : rejoue toutes les zones qui le lisent', () => {
    expect(ids(selectionner({ fichiers: ['js/core/vec.js'], table: simple })).sort()).toEqual(['economie', 'interface', 'noyau', 'sons', 'vagues']);
  });
  it('fermetureInverse refuse un cycle (la fermeture serait sans fin) ; cyclesDe le nomme', () => {
    const cyc = T([Z('a', ['a.js'], ['b']), Z('b', ['b.js'], ['a'])]);
    expect(cyclesDe(cyc)[0]).toMatch(/a → b → a|b → a → b/);
    expect(() => fermetureInverse(['a'], cyc)).toThrow(/cyclique/);
    expect(cyclesDe(simple)).toEqual([]);
  });
  it('documentation seule : rien à rejouer, pas même la fumée ; Docs/ref/tests-*.md n\'est pas de la documentation seule', () => {
    const r = selectionner({ fichiers: ['Docs/lots/lot-4.md', 'README.md'], table: simple });
    expect(r.rejouees).toEqual([]);
    expect(r.vitest).toEqual([]);
    expect(r.fumee).toEqual([]);
    expect(r.raison).toMatch(/documentation seule/);
    expect(selectionner({ fichiers: ['Docs/ref/tests-paliers.md'], table: simple }).mode).toBe('tout');
  });
  it('fichier inconnu : défaut « tout », avec la raison', () => {
    const r = selectionner({ fichiers: ['js/nouveau.js'], table: simple });
    expect(r.mode).toBe('tout');
    expect(r.raison).toMatch(/aucune zone ne revendique.*js\/nouveau\.js/);
    expect(ids(r)).toHaveLength(5);
  });
  it.each(['package.json', 'css/tokens.css', '.github/workflows/tests.yml', 'tests/selection.json'])('rejeu total forcé par %s', (f) => {
    const r = selectionner({ fichiers: [f, 'js/core/waves.js'], table: simple });
    expect(r.mode).toBe('tout');
    expect(r.raison).toContain(f);
  });
  // Lot 5n (T5) : la table elle-même. Sans table de la base (cas ci-dessus), elle rejoue tout ; avec elle, un changement limité aux entrées
  // zones[*] touche ces zones (fermeture inverse comprise) ; toute autre clé, ou une zone retirée, garde le rejeu total.
  const avecZone = (table, id, change) => ({ ...table, zones: table.zones.map((z) => (z.id === id ? { ...z, ...change } : z)) });
  it('table : une entrée de zone changée (tests listés) touche cette zone et celles qui en dépendent, sans rejeu total', () => {
    const apres = avecZone(simple, 'vagues', { vitest: ['tests/unit/vagues.test.js', 'tests/unit/vagues-2.test.js'] });
    const r = selectionner({ fichiers: ['tests/selection.json'], table: apres, tableAvant: simple });
    expect(r.mode).toBe('zones');
    expect(ids(r)).toEqual(['vagues', 'economie', 'interface']);
    expect(r.rejouees[0].raison).toBe('source modifiée : tests/selection.json');
    expect(r.vitest).toContain('tests/unit/vagues-2.test.js');
    expect(r.declencheurs).toEqual([]);
  });
  it('table : sources ou dépendances d\'une zone changées, zone ajoutée : ces zones et leur fermeture ; deux zones à la fois', () => {
    expect(ids(selectionner({ fichiers: ['tests/selection.json'], table: avecZone(simple, 'sons', { sources: ['js/game/audio.js', 'js/game/audio2.js'] }), tableAvant: simple }))).toEqual(['sons']);
    expect(ids(selectionner({ fichiers: ['tests/selection.json'], table: avecZone(simple, 'interface', { dependances: ['economie', 'sons'] }), tableAvant: simple }))).toEqual(['interface']);
    const ajout = { ...simple, zones: [...simple.zones, Z('carte', ['js/core/maps.js'], ['noyau'])] };
    expect(ids(selectionner({ fichiers: ['tests/selection.json'], table: ajout, tableAvant: simple }))).toEqual(['carte']);
    const deux = avecZone(avecZone(simple, 'sons', { e2e: ['tests/e2e/sons.spec.js'] }), 'noyau', { vitest: ['tests/unit/vec.test.js'] });
    expect(ids(selectionner({ fichiers: ['tests/selection.json', 'js/game/hud.js'], table: deux, tableAvant: simple })).sort()).toEqual(['economie', 'interface', 'noyau', 'sons', 'vagues']);
  });
  it.each([
    ['garde-fous', { 'garde-fous': [{ fichier: 'tests/e2e/fumee.spec.js', categorie: 'G' }] }],
    ['rejeu-total', { 'rejeu-total': ['package.json'] }],
    ['rejeu-vitest', { 'rejeu-vitest': ['tests/unit/aides/**'] }],
    ['toujours', { toujours: ['tests/unit/hygiene.test.js', 'tests/unit/x.test.js'] }],
    ['fumee', { fumee: [] }],
    ['documentation', { documentation: { inclus: ['Docs/**'], exclus: [] } }],
    ['defaut', { defaut: 'rien' }],
    ['schema', { schema: 2 }],
  ])('table : clé %s changée → rejeu total, avec la raison', (cle, change) => {
    const r = selectionner({ fichiers: ['tests/selection.json'], table: { ...avecZone(simple, 'sons', { vitest: ['tests/unit/s.test.js'] }), ...change }, tableAvant: simple });
    expect(r.mode).toBe('tout');
    expect(r.raison).toContain('tests/selection.json');
    expect(changementsDeTable(simple, { ...simple, ...change }).autres).toEqual([cle]);
  });
  it('table : zone retirée → rejeu total ; table de la base illisible ou absente → rejeu total ; changementsDeTable', () => {
    const retrait = { ...simple, zones: simple.zones.filter((z) => z.id !== 'sons') };
    expect(selectionner({ fichiers: ['tests/selection.json'], table: retrait, tableAvant: simple }).mode).toBe('tout');
    expect(changementsDeTable(simple, retrait)).toEqual({ zones: [], autres: ['zones (zone retirée : sons)'] });
    for (const avant of [null, {}, { zones: 'x' }]) expect(selectionner({ fichiers: ['tests/selection.json'], table: simple, tableAvant: avant }).mode).toBe('tout');
    expect(changementsDeTable(simple, simple)).toEqual({ zones: [], autres: [] });
    expect(selectionner({ fichiers: ['tests/selection.json'], table: simple, tableAvant: simple })).toMatchObject({ mode: 'zones', rejouees: [] });
  });
  it('aides de Vitest (rejeu-vitest) : tout Vitest et les « toujours », aucun Playwright de zone ni rejeu total ; avec du code, les zones touchées en plus', () => {
    const t = { ...simple, 'rejeu-vitest': ['tests/unit/helpers/**'] };
    const r = selectionner({ fichiers: ['tests/unit/helpers/sim.js'], table: t });
    expect(r.mode).toBe('zones');
    expect(r.rejouees).toEqual([]);
    expect(r.vitestTout).toEqual(['tests/unit/helpers/sim.js']);
    expect(r.raison).toMatch(/tout Vitest \(aide Vitest modifiée : tests\/unit\/helpers\/sim\.js\)/);
    expect(r.vitest).toEqual([...simple.zones.map((z) => z.vitest[0]), 'tests/unit/hygiene.test.js'].sort());
    expect(r.e2e).toEqual([]);
    expect(r.fumee).toEqual(['tests/e2e/fumee.spec.js']);
    const r2 = selectionner({ fichiers: ['tests/unit/helpers/sim.js', 'js/core/economy.js'], table: t });
    expect(ids(r2)).toEqual(['economie', 'interface']);
    expect(r2.e2e).toEqual(['tests/e2e/argent.spec.js']);
    expect(r2.vitest).toContain('tests/unit/sons.test.js');
  });
  it('table réelle : tests/unit/helpers/** dans rejeu-vitest et plus dans rejeu-total ; aucun fichier Playwright ne lit une aide de Vitest', () => {
    const table = JSON.parse(readFileSync('tests/selection.json', 'utf8'));
    expect(table['rejeu-vitest']).toEqual(['tests/unit/helpers/**']);
    expect(table['rejeu-total']).not.toContain('tests/unit/helpers/**');
    for (const f of ['package.json', 'css/tokens.css', 'tests/e2e/helpers.js', '.github/workflows/**', 'tests/selection.json', 'playwright.config.*', 'vitest.config.*']) expect(table['rejeu-total'], f).toContain(f);
    for (const f of readdirSync('tests/e2e')) if (/\.js$/.test(f)) expect(readFileSync(join('tests/e2e', f), 'utf8'), f).not.toMatch(/unit\/helpers/);
    expect(table.toujours).toContain('tests/unit/tests-selection.test.js');
  });
  it('rejeu total imposé (--tout, complet périodique) : raison affichée', () => {
    expect(selectionner({ fichiers: [], table: simple, forcerTout: 'option --tout' })).toMatchObject({ mode: 'tout', raison: 'option --tout' });
  });
  it('un test modifié est rejoué lui-même ; le graphe de Vitest (--changed) est uni à la table', () => {
    const r = selectionner({ fichiers: ['tests/unit/autre.test.js', 'tests/e2e/x.spec.js', 'js/game/hud.js'], table: simple, vitestChanged: ['tests/unit/graphe.test.js'] });
    expect(r.vitest).toEqual(expect.arrayContaining(['tests/unit/autre.test.js', 'tests/unit/graphe.test.js', 'tests/unit/interface.test.js']));
    expect(r.e2e).toContain('tests/e2e/x.spec.js');
  });
  it('fichiers hostiles (espaces, guillemets, « ../ », très longs) : jamais d\'exception, défaut « tout » s\'ils ne sont dans aucune zone', () => {
    const hostiles = ['a b/"c".js', '../../etc/passwd', `${'x/'.repeat(500)}y.js`, '$(rm -rf /).js', 'js/core/vec.js\nrm'];
    const r = selectionner({ fichiers: hostiles, table: simple });
    expect(r.mode).toBe('tout');
    expect(r.inconnus).toHaveLength(hostiles.length);
  });
});

describe('--depuis-version et complet périodique', () => {
  const versions = { versions: [{ id: 'v0.4', status: 'archive', ref: 'b'.repeat(40) }, { id: 'v0.5', status: 'actuelle', ref: 'a'.repeat(40) }] };
  it('la base est le ref de la version « actuelle » ; version absente ou ref invalide : erreur explicite', () => {
    expect(refDeVersionActuelle(versions)).toEqual({ id: 'v0.5', ref: 'a'.repeat(40) });
    expect(refDeVersionActuelle({ versions: [] }).erreur).toMatch(/aucune version « actuelle »/);
    expect(refDeVersionActuelle({ versions: [{ id: 'v1', status: 'actuelle', ref: 'pas un hash' }] }).erreur).toMatch(/sans ref valide/);
  });
  it('complet périodique : null → tout ; retard de plus de N versions → tout ; sinon rien', () => {
    expect(completPeriodique(versions, null, 3)).toMatch(/premier palier de publication est complet/);
    expect(completPeriodique(versions, { version: 'v0.4' }, 3)).toBeNull();
    expect(completPeriodique(versions, { version: 'v0.4' }, 0)).toMatch(/1 versions de retard/);
    expect(completPeriodique(versions, { version: 'v9' }, 3)).toMatch(/inconnue/);
  });
  it('tests/dernier-complet.json vaut null au départ (le premier palier de publication sera complet)', () => {
    expect(JSON.parse(readFileSync('tests/dernier-complet.json', 'utf8'))).toBeNull();
  });
  it('enregistrer-complet refuse un palier non vert, incomplet ou vide', () => {
    const rapport = (stats, files = ['a.spec.js', 'b.spec.js']) => ({ stats, suites: files.map((file) => ({ file, suites: [] })) });
    const ok = { expected: 10, unexpected: 0, flaky: 0, skipped: 2 };
    expect(verdictComplet({ rapport: rapport(ok), attendus: ['a.spec.js', 'b.spec.js'], vitestOk: true }).ok).toBe(true);
    expect(verdictComplet({ rapport: rapport({ ...ok, unexpected: 1 }), attendus: ['a.spec.js'], vitestOk: true }).raison).toMatch(/1 test\(s\) en échec/);
    expect(verdictComplet({ rapport: rapport(ok, ['a.spec.js']), attendus: ['a.spec.js', 'b.spec.js'], vitestOk: true }).raison).toMatch(/b\.spec\.js/);
    expect(verdictComplet({ rapport: rapport(ok), attendus: ['a.spec.js'], vitestOk: false }).ok).toBe(false);
    expect(verdictComplet({ rapport: rapport({ ...ok, expected: 0 }), attendus: [], vitestOk: true }).ok).toBe(false);
    expect(verdictComplet({ rapport: null, attendus: [], vitestOk: true }).ok).toBe(false);
  });
});

describe('table tests/selection.json', () => {
  const table = JSON.parse(readFileSync('tests/selection.json', 'utf8'));
  const SKIP = new Set(['node_modules', '.git', 'vendor', '_site', 'test-results', 'Docs', 'tests', '.lots', 'playwright-report', 'blob-report']);
  const walk = (d) => readdirSync(d || '.').flatMap((f) => {
    const p = d ? `${d}/${f}` : f;
    if (SKIP.has(p)) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const sources = walk('').filter((f) => /^(?:js|data|css|dev|scripts|fonts)\//.test(f) || /^[^/]+\.html$/.test(f));
  const tests = [...readdirSync('tests/unit').filter((f) => f.endsWith('.test.js')).map((f) => `tests/unit/${f}`), ...readdirSync('tests/e2e').filter((f) => f.endsWith('.spec.js')).map((f) => `tests/e2e/${f}`)];
  const SKIP_TOUS = new Set(['node_modules', '.git', 'vendor', '_site', 'test-results', '.lots', 'playwright-report', 'blob-report']);
  const tous = (function tout(d) {
    return readdirSync(d || '.').flatMap((f) => {
      const p = d ? `${d}/${f}` : f;
      if (SKIP_TOUS.has(p)) return [];
      return statSync(p).isDirectory() ? tout(p) : [p];
    });
  })('');
  const code = Object.fromEntries(sources.filter((f) => /\.(?:m?js|html)$/.test(f)).map((f) => [f, readFileSync(f, 'utf8')]));

  it('chaque test dans une zone ou « toujours », chaque source dans une zone ou en rejeu total, aucun motif ni test fantôme, aucun cycle, dépendances réelles déclarées', () => {
    const aretes = aretesEntreZones(table, code, correspond);
    const erreurs = controlerTable(table, { fichiersTests: tests, fichiersSources: sources, existe: existsSync, aretes, tousFichiers: tous });
    expect(erreurs, erreurs.join(' | ')).toEqual([]);
  });
  it('controlerTable détecte : test sans zone, dépendance inconnue, cycle, fichier retiré encore référencé, dépendance non déclarée', () => {
    const t = T([Z('a', ['a.js'], ['b', 'zz']), Z('b', ['b.js'], ['a'])]);
    const err = controlerTable(t, { fichiersTests: ['tests/unit/orphelin.test.js'], fichiersSources: ['a.js', 'b.js', 'c.js'], existe: () => false, aretes: [{ de: 'b', vers: 'c', exemple: 'b.js → c.js' }] });
    const tout = err.join('\n');
    for (const motif of [/test sans zone : tests\/unit\/orphelin/, /dépendance inconnue « zz »/, /cycle/, /fichier de test absent tests\/unit\/a\.test\.js/, /source sans zone ni rejeu total : c\.js/, /dépendance non déclarée : b → c/]) expect(tout).toMatch(motif);
  });
  it('chaque fichier garde-fou existe (catégories G et P, et tests G ou P des autres fichiers : leur motif trouve encore un titre)', () => {
    expect(table['garde-fous'].length).toBeGreaterThan(0);
    for (const g of table['garde-fous']) {
      expect(existsSync(g.fichier), g.fichier).toBe(true);
      if (g.motif) expect(new RegExp(g.motif, 'i').test(readFileSync(g.fichier, 'utf8')), `${g.fichier} /${g.motif}/`).toBe(true);
    }
  });
  it('fumée : 10 à 20 tests dans des fichiers listés', () => {
    // Décompte statique : chaque test( compte une fois ; ceux d'une boucle « for (const [nom, url] of [[…], […], […]]) » comptent une fois par page.
    const n = table.fumee.map((f) => {
      const src = readFileSync(f, 'utf8');
      const pages = (/for \(const \[nom, url\] of \[(.*)\]\)/.exec(src)?.[1].match(/\['/g) ?? []).length;
      const enBoucle = (src.match(/^\s*test\(`/gm) ?? []).length;
      return (src.match(/^\s*test\(/gm) ?? []).length - enBoucle + enBoucle * pages;
    }).reduce((a, b) => a + b, 0);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(20);
  });
  it('referencesDe : imports, new URL, données lues et pages HTML', () => {
    expect(referencesDe('js/game/a.js', "import x from '../core/vec.js';\nconst u = new URL('../../data/game/waves.json', import.meta.url);\nfetch('data/i18n/fr.json')").sort()).toEqual(['data/game/waves.json', 'data/i18n/fr.json', 'js/core/vec.js']);
    expect(referencesDe('jeu.html', '<link href="css/game.css"><script type="module" src="js/game/main.js"></script>').sort()).toEqual(['css/game.css', 'js/game/main.js']);
  });
});

describe('scripts de package.json', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  it('anciens noms conservés et paliers présents', () => {
    for (const s of ['lint', 'test', 'test:e2e', 'test:e2e:full', 'test:avant-commit', 'test:standard', 'test:publication', 'test:complet', 'test:selection', 'test:fumee']) expect(pkg.scripts[s], s).toBeTruthy();
    for (const p of ['avant-commit', 'standard', 'publication', 'complet', 'selection', 'fumee']) expect(pkg.scripts[`test:${p}`]).toBe(`node scripts/tests/palier.mjs ${p}`);
    expect(existsSync(join('scripts', 'tests', 'palier.mjs'))).toBe(true);
  });
});

describe('workflows : tests.yml ajouté, pages.yml intact', () => {
  const tests = readFileSync('.github/workflows/tests.yml', 'utf8');
  const pages = readFileSync('.github/workflows/pages.yml', 'utf8');
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  // Lot 5g : empreintes recalculées après les trois lignes de chemin (commentaire d'en-tête, appel de l'assembleur et son commentaire ; détail et
  // comparaison ligne à ligne dans workflow.test.js, LOT_5G) ; avant : 3ae852e9… (en-tête) et 5ef68472… (deploy).
  it('pages.yml : en-tête (déclencheurs, permissions, concurrence) et tâche deploy identiques au lot 4c (sauf les lignes de chemin du lot 5g) ; jobs quick, deploy (job e2e retiré au lot 4g, pas de job verify depuis le lot 2c)', () => {
    expect(sha(pages.slice(0, pages.indexOf('\njobs:')))).toBe('af32c7d4d82e660e39090f12af2e26ee75a0a1bd8469491590bb474f4bbecca4');
    expect(sha(pages.slice(pages.indexOf('\n  deploy:\n')))).toBe('a3c9e01b09bb5fe273a8022ca056d600e093bc5fc75069187090316dea5374f4');
    expect([...pages.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]).filter((j) => pages.indexOf(`\n  ${j}:`) > pages.indexOf('\njobs:'))).toEqual(['quick', 'deploy']);
  });
  it('tests.yml : déclencheurs push (dev, lot-*, essai/** depuis le lot 4f), pull_request, workflow_dispatch avec un choix de palier ; documentation seule ignorée', () => {
    expect(tests).toMatch(/push:\n\s+branches: \[dev, 'lot-\*', 'essai\/\*\*'\]/);
    expect(tests).toContain('pull_request:');
    // Lot 5n (W2-a) : Pull Requests vers main seulement, toujours sans la documentation seule.
    expect(tests).toContain("\n  pull_request:\n    branches: [main]\n    paths-ignore: ['Docs/**', '**/*.md']\n");
    expect((tests.match(/\n {2}pull_request:\n/g) ?? []).length).toBe(1);
    expect(tests).toMatch(/options: \[standard, publication, complet\]/);
    expect(tests).toContain("paths-ignore: ['Docs/**', '**/*.md']");
    expect(tests).not.toContain('pull_request_target');
  });
  it('tests.yml : droits minimaux (contents: read ; actions: read seulement pour les deux tâches qui téléchargent des artefacts), aucun secret, aucun déploiement', () => {
    expect(tests).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(tests).not.toMatch(/secrets\.|actions: write|contents: write|pages: write|id-token|deploy-pages|upload-pages-artifact/);
    expect((tests.match(/actions: read/g) ?? []).length).toBe(2);
    const tache = (job) => tests.slice(tests.indexOf(`\n  ${job}:\n`) + job.length + 4).split(/\n {2}[\w-]+:\n/)[0];
    for (const job of ['rapport', 'bilan-duree']) expect(tache(job), job).toContain('actions: read');
    for (const job of ['planifier', 'unitaires', 'tranches']) expect(tache(job), job).not.toContain('actions: read');
  });
  it('tests.yml (lot 4f) : planifier (ci-palier.mjs, sélection, budget.mjs) → tranches et unitaires → rapport et bilan-duree', () => {
    expect([...tests.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]).filter((j) => tests.indexOf(`\n  ${j}:`) > tests.indexOf('\njobs:'))).toEqual(['planifier', 'unitaires', 'tranches', 'rapport', 'bilan-duree']);
    expect(tests).toMatch(/planifier:[\s\S]*ci-palier\.mjs[\s\S]*selectionner\.mjs[\s\S]*budget\.mjs --palier "\$PALIER" --selection selection\.json --plan plan\.json --echec tranches/);
    expect(tests).toMatch(/tranches:\n\s+needs: planifier\n\s+if: needs\.planifier\.outputs\.palier != '' && needs\.planifier\.outputs\.n != '0'/);
    expect(tests).toContain('index: ${{ fromJSON(needs.planifier.outputs.matrice) }}');
    expect(Number(/max-parallel: (\d+)/.exec(tests)[1])).toBe(16);
    expect(tests).toMatch(/unitaires:\n\s+needs: planifier/);
    expect(tests).toMatch(/bilan-duree:\n\s+needs: \[planifier, unitaires, tranches\][\s\S]*?continue-on-error: true[\s\S]*?bilan-duree\.mjs/);
    expect(tests).toMatch(/tranche\.mjs --plan plan\.json --index \$\{\{ matrix\.index \}\} --empreinte/);
    expect(tests).toMatch(/name: duree-tranche-\$\{\{ needs\.planifier\.outputs\.palier \}\}-\$\{\{ matrix\.index \}\}/);
    expect(tests).toMatch(/planifier:[\s\S]*?fetch-depth: 0/);
  });
  // Lot 5n (W1-a) : sur un push de dev, quick (pages.yml) fait déjà le lint et tout Vitest, et bloque le déploiement : unitaires est sautée ;
  // rapport ne l'attend pas, bilan-duree s'exécute quand même (always()) ; ailleurs (lot-*, pull_request, essai/**, manuel) elle tourne.
  it('tests.yml (lot 5n, W1-a) : unitaires sautée sur un push de dev seulement ; quick garde lint et tout Vitest ; rapport et bilan-duree sans elle', () => {
    expect(tests).toContain("\n  unitaires:\n    needs: planifier\n    if: needs.planifier.outputs.palier != '' && !(github.event_name == 'push' && github.ref == 'refs/heads/dev')\n");
    expect(tests).toContain("\n  rapport:\n    needs: [planifier, tranches]\n    if: always() && needs.planifier.result == 'success' && needs.planifier.outputs.palier != '' && needs.planifier.outputs.n != '0'\n");
    expect(tests).toContain("\n  bilan-duree:\n    needs: [planifier, unitaires, tranches]\n    if: always() && needs.planifier.result == 'success' && needs.planifier.outputs.palier != ''\n");
    const quick = pages.slice(pages.indexOf('\n  quick:\n'), pages.indexOf('\n  deploy:\n'));
    expect(quick).toContain('      - run: npm run lint\n      - run: npm test\n');
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.test).toBe('vitest run');
    expect(pages).toMatch(/\n {2}deploy:\n[\s\S]*?\n {4}needs: quick\n/);
  });
  it('tests.yml (lot 4f) : annulation des exécutions plus anciennes pour le standard seulement (publication et complet : groupe propre à l\'exécution)', () => {
    const c = /concurrency:\n {2}group: (.+)\n {2}cancel-in-progress: (.+)\n/.exec(tests);
    expect(c).not.toBeNull();
    expect(c[1]).toContain("== 'standard' && 'standard' || github.run_id");
    expect(c[2]).toMatch(/^\$\{\{ .*== 'standard' \}\}$/);
    expect(c[1]).toContain("startsWith(github.ref, 'refs/heads/essai/complet-') && 'complet'");
    expect(c[1]).toContain('${{ github.event_name }}'); // push et create d'une même branche ne s'annulent pas
  });
  it('tests.yml (lot 4f) : événement create pour les branches essai/** seulement (planifier), sans filtre de chemins', () => {
    expect(tests).toMatch(/\n {2}create:\n/);
    expect(tests).toMatch(/planifier:\n {4}if: github\.event_name != 'create' \|\| startsWith\(github\.ref, 'refs\/heads\/essai\/'\)/);
    expect(tests).toContain('CREE: ${{ github.event.created }}');
  });
  // Lot 4g : upload-artifact n'est plus dans pages.yml (job e2e retiré) ; il reste admis comme action déjà employée par pages.yml jusqu'au lot 4f.
  it('tests.yml : seulement des actions déjà employées par pages.yml (jusqu\'au lot 4f), épinglées par commit complet ; aucun navigateur installé', () => {
    const uses = (s) => [...s.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    const admises = [...uses(pages), 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'];
    for (const u of uses(tests)) {
      expect(u, u).toMatch(/@[0-9a-f]{40}$/);
      expect(admises, u).toContain(u);
    }
    expect(tests).not.toContain('playwright install');
  });
});

describe('regroupements G et P (lot 4e-C) : aucune assertion perdue', () => {
  it('chaque fichier e2e G ou P garde au moins les assertions de la référence d\'avant les regroupements (scripts/tests/compter.mjs)', async () => {
    const { compter } = await import('../../scripts/tests/compter.mjs');
    const ref = JSON.parse(readFileSync('scripts/tests/assertions-reference.json', 'utf8')).fichiers;
    for (const [f, r] of Object.entries(ref)) {
      expect(existsSync(f), f).toBe(true);
      expect(compter(readFileSync(f, 'utf8')).assertions, f).toBeGreaterThanOrEqual(r.assertions);
    }
  });
  it('compter : assertions, chargements (page.goto et chargeurs locaux), tests', async () => {
    const { compter } = await import('../../scripts/tests/compter.mjs');
    const src = "async function open(page) {\n  await page.goto('/a');\n}\ntest('a', async ({ page }) => {\n  await open(page);\n  expect(1).toBe(1);\n  await expect.poll(() => 1).toBe(1);\n});\ntest('b', async ({ page }) => {\n  await page.goto('/b');\n});\n";
    expect(compter(src)).toEqual({ tests: 2, assertions: 2, chargements: 2 });
  });
});
