import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULTS, PERSO_VALUES, SANG_VALUES, SLOTS, USURE_VALUES, VARIANTES, needsChoices, readPersosParams, slotVariants } from '../../js/game/persos-params.js';
import { choiceOptions, createPersos } from '../../js/game/persos-runtime.js';
import { createV2Kit } from '../../js/game/character-v2.js';
import { ANIM_MACROS, MACRO_IDS } from '../../js/core/persos-variants.js';
import { LIMITS, characterCost, choicesOf, crowdCost, project } from '../../scripts/personnages/projection.mjs';
import { characters, load, poses } from '../../scripts/personnages/lib.mjs';

// Lot 3m : les personnages choisis (data/game/persos-choix.json) deviennent le défaut du jeu ; l'ancien modèle reste derrière ?perso=actuel.
const choix = JSON.parse(readFileSync('data/game/persos-choix.json', 'utf8'));
const raw = readFileSync('data/game/persos-choix.json', 'utf8');
const slotOf = (id) => characters.slots.find((s) => s.id === id);
const variantOf = (id, v) => slotOf(id)?.variants.find((x) => x.id === v);
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
const variants = load('zombie-variants');

describe('table des choix (data/game/persos-choix.json)', () => {
  it('provisoire, source nommée, version 1', () => {
    expect(choix._provisoire).toMatch(/provisoire/);
    expect(choix.source).toBe('passation-personnages-4b.md');
    expect(choix.version).toBe(1);
  });
  it('exactement les 5 personnages du jeu, une seule ligne chacun (aucun doublon dans le texte)', () => {
    expect(Object.keys(choix.persos).sort()).toEqual([...SLOTS].sort());
    for (const s of SLOTS) expect(raw.match(new RegExp(`"${s}"\\s*:`, 'g'))).toHaveLength(1);
  });
  it.each(SLOTS)('%s : variante connue, présente dans characters-v2.json (ou actuel)', (s) => {
    const c = choix.persos[s];
    expect(VARIANTES).toContain(c.variante);
    if (c.variante !== 'actuel') expect(variantOf(s, c.variante)).toBeTruthy();
    expect(c.source).toBe('passation-personnages-4b.md');
  });
  it.each(SLOTS)('%s : macros connues, dans les bornes de la variante', (s) => {
    const c = choix.persos[s];
    if (c.variante === 'actuel') return;
    const defs = variantOf(s, c.variante).macros;
    for (const [k, v] of Object.entries(c.macros ?? {})) {
      expect(MACRO_IDS).toContain(k);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(defs[k].min);
      expect(v).toBeLessThanOrEqual(defs[k].max);
    }
  });
  it.each(SLOTS)('%s : macros d\'animation connues, dans les bornes de poses-v2.json', (s) => {
    for (const [k, v] of Object.entries(choix.persos[s].animation ?? {})) {
      expect(ANIM_MACROS).toContain(k);
      expect(v).toBeGreaterThanOrEqual(poses.macros[k].min);
      expect(v).toBeLessThanOrEqual(poses.macros[k].max);
    }
  });
  it.each(SLOTS)('%s : style A, B ou C (style des données de la variante, le fichier ne le précise pas)', (s) => {
    const c = choix.persos[s];
    expect(['A', 'B', 'C']).toContain(c.style);
    if (c.variante !== 'actuel') expect(c.style).toBe(variantOf(s, c.variante).style);
  });
  it.each(SLOTS)('%s : tenues « toutes » ou liste de tenues existantes, sans doublon', (s) => {
    const c = choix.persos[s];
    if (c.tenues === 'toutes') return;
    expect(Array.isArray(c.tenues)).toBe(true);
    expect(c.tenues.length).toBeGreaterThan(0);
    expect(new Set(c.tenues).size).toBe(c.tenues.length);
    const ids = variantOf(s, c.variante).outfits.map((o) => o.id);
    for (const t of c.tenues) expect(ids).toContain(t);
  });
  it('choix reportés de la passation : « riche » pour les 5, 6 tenues tirées par zombie, joueur sur sa palette par défaut', () => {
    for (const s of SLOTS) expect(choix.persos[s].variante).toBe('riche');
    for (const s of ['marcheur', 'petit', 'voute', 'grand']) expect(choix.persos[s].tenues).toBe('toutes');
    expect(choix.persos.joueur.tenues).toEqual([variantOf('joueur', 'riche').outfits[0].id]);
  });
  it('sang complet (1) et usure auto, valeurs reconnues par les paramètres', () => {
    expect(choix.sang).toBe('1');
    expect(SANG_VALUES).toContain(choix.sang);
    expect(choix.usure).toBe('auto');
    expect(USURE_VALUES).toContain(String(choix.usure));
  });
  it('un personnage « actuel » est accepté (ancien modèle) ; absent ou inconnu : actuel', () => {
    const t = { persos: { joueur: { variante: 'actuel' }, marcheur: { variante: 'B' }, petit: { variante: 'Z' } } };
    expect(slotVariants('choix', t)).toEqual({ joueur: 'actuel', marcheur: 'B', petit: 'actuel', voute: 'actuel', grand: 'actuel' });
    const p = readPersosParams('', t);
    expect(p).toMatchObject({ v2: true, actuel: true, active: true });
  });
});

describe('paramètres : ?perso=choix par défaut', () => {
  it('défaut : choix, sang et usure de la table, les 5 personnages en « riche »', () => {
    expect(DEFAULTS.perso).toBe('choix');
    const p = readPersosParams('', choix);
    expect(p).toMatchObject({ perso: 'choix', sang: '1', usure: 'auto', v2: true, actuel: false, active: true });
    expect(p.slots).toEqual({ joueur: 'riche', marcheur: 'riche', petit: 'riche', voute: 'riche', grand: 'riche' });
  });
  it('sans table (illisible ou absente) : tous en ancien modèle, sang 0', () => {
    expect(readPersosParams('', null)).toMatchObject({ perso: 'choix', sang: '0', v2: false, actuel: true, active: false });
  });
  it.each(PERSO_VALUES)('?perso=%s reconnu', (v) => expect(readPersosParams(`?perso=${v}`, choix).perso).toBe(v));
  it.each(['A', 'B', 'C', 'riche'])('?perso=%s force la variante pour les 5 personnages', (v) => {
    expect(new Set(Object.values(readPersosParams(`?perso=${v}`, choix).slots))).toEqual(new Set([v]));
  });
  it('?perso=actuel : tout l\'ancien modèle ; sang de la table, sauf ?sang=', () => {
    expect(readPersosParams('?perso=actuel', choix)).toMatchObject({ v2: false, actuel: true, sang: '1', active: true });
    expect(readPersosParams('?perso=actuel&sang=0', choix)).toMatchObject({ active: false });
  });
  it.each(SANG_VALUES)('?sang=%s l\'emporte sur la table', (v) => expect(readPersosParams(`?sang=${v}`, choix).sang).toBe(v));
  it.each(USURE_VALUES)('?usure=%s', (v) => expect(readPersosParams(`?usure=${v}`, choix).usure).toBe(v === 'auto' ? 'auto' : Number(v)));
  it('valeurs inconnues : défauts, sans erreur', () => {
    expect(readPersosParams('?perso=D&sang=2&usure=9', choix)).toMatchObject({ perso: 'choix', sang: '1', usure: 'auto' });
  });
  it('entrées hostiles : non-chaîne, très longue, table hostile : défauts sans exception', () => {
    for (const s of [null, undefined, 42, {}, `?perso=${'A'.repeat(100000)}`, '?perso=%E0%A4%A', '?perso=<script>']) expect(() => readPersosParams(s, choix)).not.toThrow();
    for (const t of [null, 42, 'x', [], { persos: 3 }, { persos: { joueur: null } }, { sang: {}, usure: [] }]) expect(() => readPersosParams('', t)).not.toThrow();
    expect(readPersosParams('', { persos: { joueur: { variante: '__proto__' } }, sang: 'tout' })).toMatchObject({ sang: '0', actuel: true });
  });
  it('la table n\'est demandée que si elle sert (?perso=actuel&sang=0 : jamais)', () => {
    expect(needsChoices('')).toBe(true);
    expect(needsChoices('?perso=B')).toBe(true);
    expect(needsChoices('?perso=B&sang=1&usure=2')).toBe(false);
    expect(needsChoices('?perso=actuel&sang=0')).toBe(false);
    expect(needsChoices('?perso=choix&sang=0&usure=0')).toBe(true);
  });
  it('?perso=, ?sang= et ?usure= ne sont jamais des paramètres d\'essai (readOnlyParams de save.json)', () => {
    const ro = load('save').readOnlyParams;
    for (const k of ['perso', 'sang', 'usure']) expect(ro).not.toContain(k);
  });
  it('jamais mémorisés : persos-params.js et le chargeur ne touchent ni au stockage ni à la sauvegarde', () => {
    for (const f of ['js/game/persos-params.js', 'js/game/persos-loader.js', 'js/game/persos-runtime.js']) expect(readFileSync(f, 'utf8')).not.toMatch(/localStorage|sessionStorage|indexedDB|\/save\//);
  });
});

describe('chargeur : l\'ancien modèle n\'est importé que s\'il sert', () => {
  const loader = readFileSync('js/game/persos-loader.js', 'utf8');
  const game = readFileSync('js/game/game.js', 'utf8');
  it('game.js n\'importe plus pose.js ni character.js : le modèle vient du chargeur', () => {
    expect(game).not.toMatch(/^import .*['/]pose\.js'/m);
    expect(game).not.toMatch(/^import .*\.\/character\.js'/m);
    expect(game).toContain('const { computePose, createKit, createCharacter } = persos.model;');
  });
  it('persos-loader.js : pose.js et character.js importés dynamiquement, seulement si un personnage est « actuel »', () => {
    expect(loader).not.toMatch(/^import .*(pose|character)\.js/m);
    expect(loader).toMatch(/params\.actuel \? await Promise\.all\(\[import\('\.\.\/core\/pose\.js'\), import\('\.\/character\.js'\)\]\)/);
    expect(loader.split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(30);
  });
  it('aucun autre module chargé par défaut n\'importe pose.js ni character.js de façon statique', () => {
    for (const f of ['js/game/persos-runtime.js', 'js/game/character-v2.js', 'js/game/blood-fx.js', 'js/game/persos-params.js', 'js/game/effects.js', 'js/game/main.js']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/^import .*(core\/pose|\.\/character)\.js'/m);
    }
  });
});

describe('chargeur : modules réellement importés (Node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('../../js/core/pose.js');
  });
  const serve = (calls) => vi.fn((path) => {
    calls.push(path);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(path, 'utf8'))) });
  });
  it('défaut complet v2 : pose.js n\'est jamais évalué ; la table des choix est lue', async () => {
    const evaluated = vi.fn();
    vi.doMock('../../js/core/pose.js', async (orig) => {
      evaluated();
      return orig();
    });
    const calls = [];
    vi.stubGlobal('fetch', serve(calls));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    const p = await loadPersos('');
    expect(evaluated).not.toHaveBeenCalled();
    expect(calls).toContain('data/game/persos-choix.json');
    expect(p.params.slots.joueur).toBe('riche');
    expect(p.model.computePose({ state: 'marche' })).toEqual({});
  });
  it('?perso=actuel : l\'ancien modèle est importé (pose.js évalué, computePose réel)', async () => {
    const evaluated = vi.fn();
    vi.doMock('../../js/core/pose.js', async (orig) => {
      evaluated();
      return orig();
    });
    vi.stubGlobal('fetch', serve([]));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    const p = await loadPersos('?perso=actuel&sang=0');
    expect(evaluated).toHaveBeenCalled();
    expect(Object.keys(p.model.computePose({ state: 'marche', phase: 1 })).length).toBeGreaterThan(5);
    expect(p.attach()).toBeNull();
  });
  it('?perso=actuel&sang=0 : aucune requête (ni table, ni données v2)', async () => {
    const calls = [];
    vi.stubGlobal('fetch', serve(calls));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    await loadPersos('?perso=actuel&sang=0');
    expect(calls).toEqual([]);
  });
  it('table illisible : repli sans erreur sur l\'ancien modèle', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    const p = await loadPersos('');
    expect(p.params).toMatchObject({ actuel: true, v2: false, sang: '0' });
  });
});

describe('aiguillage par personnage (character-v2.js, persos-runtime.js)', () => {
  const stubs = () => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#c8b4a0' }));
    vi.stubGlobal('document', { documentElement: {} });
  };
  afterEach(() => vi.unstubAllGlobals());
  const kitFor = (params) => {
    stubs();
    const lookup = () => [200, 180, 160];
    return createV2Kit({ characters, poses, lookup, choice: params.perso, styleOf: params.slots, ...choiceOptions(params, choix), zombieIds: variants.zombie.variants.map((v) => v.id), seed: 3, wear: () => 0 });
  };
  it('défaut : chaque personnage est un personnage v2 de la variante de la table', () => {
    const v2 = kitFor(readPersosParams('', choix));
    expect(v2.handles('player')).toBe(true);
    const p = v2.create('player');
    expect(p.choice).toBe('riche');
    for (let i = 0; i < 4; i += 1) expect(v2.create('zombie', i).choice).toBe(choix.persos[variants.zombie.variants[i].id].variante);
  });
  it('choices() : variante, style, tenues et macros appliqués, sans rien construire', () => {
    const v2 = kitFor(readPersosParams('', choix));
    const c = v2.choices();
    expect(Object.keys(c).sort()).toEqual([...SLOTS].sort());
    expect(c.marcheur).toMatchObject({ variante: 'riche', style: 'A', macros: { taille: 0, carrure: 0, usure: 0, teinte: 0, posture: 0 } });
    expect(c.marcheur.tenues).toHaveLength(6);
    expect(c.joueur.tenues).toEqual(['sable']);
    expect(v2.textureCount()).toBe(0);
  });
  it('un personnage « actuel » de la table n\'est pas construit en v2 (handles faux)', () => {
    const t = { ...choix, persos: { ...choix.persos, petit: { ...choix.persos.petit, variante: 'actuel' } } };
    const params = readPersosParams('', t);
    stubs();
    const v2 = createV2Kit({ characters, poses, lookup: () => [200, 180, 160], choice: params.perso, styleOf: params.slots, ...choiceOptions(params, t), zombieIds: variants.zombie.variants.map((v) => v.id), seed: 3 });
    const petit = variants.zombie.variants.findIndex((v) => v.id === 'petit');
    expect(v2.handles('zombie', petit)).toBe(false);
    expect(v2.handles('zombie', (petit + 1) % 4)).toBe(true);
    expect(v2.choices().petit).toEqual({ variante: 'actuel' });
  });
  it('style d\'animation de la table : il remplace celui de la variante', () => {
    const t = { ...choix, persos: { ...choix.persos, grand: { ...choix.persos.grand, style: 'C' } } };
    const params = readPersosParams('', t);
    stubs();
    const v2 = createV2Kit({ characters, poses, lookup: () => [200, 180, 160], choice: params.perso, styleOf: params.slots, ...choiceOptions(params, t), zombieIds: variants.zombie.variants.map((v) => v.id), seed: 3 });
    expect(v2.choices().grand.style).toBe('C');
    expect(v2.choices().marcheur.style).toBe('A');
  });
  it('tenues de la table : un zombie ne tire que parmi les tenues retenues', () => {
    const keep = variantOf('marcheur', 'riche').outfits.slice(0, 2).map((o) => o.id);
    const t = { ...choix, persos: { ...choix.persos, marcheur: { ...choix.persos.marcheur, tenues: keep } } };
    const params = readPersosParams('', t);
    stubs();
    const v2 = createV2Kit({ characters, poses, lookup: () => [200, 180, 160], choice: params.perso, styleOf: params.slots, ...choiceOptions(params, t), zombieIds: variants.zombie.variants.map((v) => v.id), seed: 3, wear: () => 0 });
    const idx = variants.zombie.variants.findIndex((v) => v.id === 'marcheur');
    const z = v2.create('zombie', idx);
    const parent = new THREE.Group();
    const seen = new Set();
    for (let i = 0; i < 12; i += 1) {
      parent.add(z.root);
      seen.add(z.outfit);
      parent.remove(z.root);
    }
    expect([...seen].every((o) => o < 2)).toBe(true);
    expect(seen.size).toBe(2);
  });
  it('choiceOptions : réglages de la table avec ?perso=choix seulement', () => {
    expect(choiceOptions(readPersosParams('?perso=B', choix), choix)).toEqual({});
    const o = choiceOptions(readPersosParams('', choix), choix);
    expect(Object.keys(o)).toEqual(['macros', 'animMacros', 'styleAnim', 'outfitsOf']);
    expect(o.outfitsOf.marcheur).toBe('toutes');
  });
  it('état du jeu (getState().persos) : variante de chaque personnage et réglages appliqués', () => {
    stubs();
    const params = readPersosParams('', choix);
    const pv = createPersos(params, { characters, poses, blood: load('blood'), choices: choix }, { computePose: () => ({}), createKit: () => ({}), createCharacter: () => null });
    pv.attach({ kit: { variants: variants.zombie.variants }, world: { dynamic: new THREE.Group() }, render: load('render'), palette: { hit: '#ffffff' }, variants, seed: 3 });
    const st = pv.state({});
    expect(st).toMatchObject({ perso: 'choix', sang: '1', architecture: 'rigid', slots: params.slots });
    expect(st.choix.voute.variante).toBe('riche');
  });
});

describe('logique inchangée (données et vitesses)', () => {
  it('vitesses de déplacement inchangées : 45, 70, 105, 140 ; joueur 220', () => {
    const g = load('gaits').gaits ?? load('gaits');
    expect([g.lent.speed, g.marche.speed, g.rampe.speed, g.course.speed]).toEqual([45, 70, 105, 140]);
    expect(load('player').speed).toBe(220);
  });
  it('fichiers de règles et données de logique inchangés par le lot (git diff avec origin/lot-4b)', () => {
    const base = git('merge-base HEAD origin/lot-4b')?.trim();
    if (!base) return;
    const files = ['js/core/waves.js', 'js/core/projectile.js', 'js/core/ray.js', 'js/core/player-stats.js', 'js/core/siege.js', 'js/core/save.js', 'js/core/economy.js', 'js/core/pose.js', 'js/core/enemy-factory.js',
      'data/game/enemies.json', 'data/game/gaits.json', 'data/game/zombie-variants.json', 'data/game/windows.json', 'data/game/waves.json', 'data/game/save.json', 'data/game/player.json', 'data/game/economy.json'];
    expect(git(`diff --name-only ${base} -- ${files.join(' ')}`)?.trim()).toBe('');
  });
  it('fichiers interdits au lot inchangés (interface, carte, sons, textes, journal, workflow, seed)', () => {
    const base = git('merge-base HEAD origin/lot-4b')?.trim();
    if (!base) return;
    const files = ['jeu.html', 'index.html', 'css/game.css', 'js/game/hud.js', 'js/game/ui.js', 'js/game/world.js', 'js/game/windows-mesh.js', 'js/game/textures.js', 'CLAUDE.md', 'Docs/ref/conventions.md', 'Docs/seed.md', 'data/i18n/fr.json', 'data/changelog.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js', '.github'];
    expect(git(`diff --name-only ${base} -- ${files.join(' ')}`)?.trim()).toBe('');
  });
});

describe('rampants dans les escaliers', () => {
  it('game.js relève un rampant de 14 dans un escalier, quel que soit le modèle (ligne sans aiguillage)', () => {
    const game = readFileSync('js/game/game.js', 'utf8');
    expect(game).toMatch(/const STAIR_CRAWL_LIFT = 14;/);
    const line = game.split('\n').find((l) => l.includes('? STAIR_CRAWL_LIFT :'));
    expect(line).toMatch(/e\.gait === 'rampe' \? STAIR_CRAWL_LIFT/);
    expect(line).not.toMatch(/v2|perso|model/);
  });
});

describe('projection du budget avec la table des choix', () => {
  const choiceOf = choicesOf(choix);
  it('choicesOf lit la variante de chaque personnage (inconnue : actuel)', () => {
    expect(choiceOf('grand')).toBe('riche');
    expect(choicesOf({ persos: { grand: { variante: 'X' } } })('grand')).toBe('actuel');
  });
  it.each(['R1', 'R2', 'U1', 'U4'])('%s projeté (défaut, sang de la table) : sous 45 000 triangles et 400 appels', (id) => {
    const p = project(choiceOf, choix.sang)[id];
    expect(p.triangles).toBeLessThanOrEqual(LIMITS.refonte.triangles);
    expect(p.calls).toBeLessThanOrEqual(LIMITS.refonte.calls);
  });
  it('limites de refonte : 45 000 triangles et 400 appels (décision du propriétaire)', () => expect(LIMITS.refonte).toEqual({ calls: 400, triangles: 45000 }));
  it.each(SLOTS)('%s : coût par personnage dans son budget (1 600 triangles, riche 2 600 ; 4 appels + ombre)', (s) => {
    const v = choiceOf(s);
    if (v === 'actuel') return;
    const c = characterCost(s, v);
    expect(c.triangles).toBeLessThanOrEqual(v === 'riche' ? characters.budget.richTriangles + 2 * characters.budget.shadowTriangles : characters.budget.triangles + 2 * characters.budget.shadowTriangles);
    expect(c.calls).toBeLessThanOrEqual(characters.budget.calls + characters.budget.shadowCalls);
  });
  it('foule par défaut : moins d\'appels que l\'ancien modèle', () => expect(crowdCost(choiceOf).calls).toBeLessThan(crowdCost(() => 'actuel').calls));
});

describe('hygiène du lot', () => {
  it('js/core/ : aucun Math.random, Date.now, document ni window', () => {
    for (const f of readdirSync('js/core').filter((n) => n.endsWith('.js'))) expect(readFileSync(`js/core/${f}`, 'utf8'), f).not.toMatch(/Math\.random|Date\.now|\bdocument\.|(?<![\w.'-])window\s*[.[(]/);
  });
  it('aucun fichier image, police, modèle ou son ajouté depuis origin/lot-4b', () => {
    const base = git('merge-base HEAD origin/lot-4b')?.trim();
    if (!base) return;
    const added = (git(`diff --name-only --diff-filter=A ${base}`) ?? '').split('\n').filter(Boolean);
    expect(added.filter((f) => /\.(mp3|ogg|wav|flac|m4a|aac|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|glb|gltf|obj|fbx)$/i.test(f))).toEqual([]);
  });
  it('dépendances inchangées (package.json : dependencies et devDependencies)', () => {
    const base = git('merge-base HEAD origin/lot-4b')?.trim();
    if (!base) return;
    const before = JSON.parse(git(`show ${base}:package.json`));
    const now = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(now.dependencies).toEqual(before.dependencies);
    expect(now.devDependencies).toEqual(before.devDependencies);
  });
  it('aucune couleur en dur dans les fichiers du lot (jetons de tokens.css seulement)', () => {
    for (const f of ['js/game/persos-params.js', 'js/game/persos-loader.js', 'js/game/persos-runtime.js', 'data/game/persos-choix.json']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{6}\b|rgb\(/);
  });
});
