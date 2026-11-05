import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { readPersosParams } from '../../js/game/persos-params.js';
import { createPersos } from '../../js/game/persos-runtime.js';
import { createV2Kit } from '../../js/game/character-v2.js';
import { deathFor } from '../../js/core/blood.js';
import { KICK, ZOMBIE_ANIMS } from '../../js/core/pose-v2.js';
import { characters, load, poses } from '../../scripts/personnages/lib.mjs';

// Lot 3m-C : leviers de chargement (le sang ne coûte rien tant qu'il ne sert pas), retours du propriétaire (passation du lot 3j) présents
// dans le jeu par défaut, compatibilité avec les autres refontes de lot-4b (interface au-dessus du canevas, visite libre, sons).
const choix = load('persos-choix');
const read = (f) => readFileSync(f, 'utf8');
const variants = load('zombie-variants');

describe('leviers de chargement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('../../js/game/blood-fx.js');
  });
  const serve = (calls) => vi.fn((path) => {
    calls.push(path);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read(path))) });
  });
  const watchBloodFx = () => {
    const evaluated = vi.fn();
    vi.doMock('../../js/game/blood-fx.js', async (orig) => {
      evaluated();
      return orig();
    });
    return evaluated;
  };
  it('?sang=0 : blood-fx.js (maillages et atlas du sang) n\'est jamais importé', async () => {
    const evaluated = watchBloodFx();
    vi.stubGlobal('fetch', serve([]));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    const p = await loadPersos('?sang=0');
    expect(p.params.sang).toBe('0');
    expect(evaluated).not.toHaveBeenCalled();
  });
  it('?perso=B&sang=0 : personnages v2 sans aucun module de sang en jeu', async () => {
    const evaluated = watchBloodFx();
    vi.stubGlobal('fetch', serve([]));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    await loadPersos('?perso=B&sang=0&usure=0');
    expect(evaluated).not.toHaveBeenCalled();
  });
  it('défaut (sang complet de la table) : blood-fx.js importé avec le reste, en parallèle de la table', async () => {
    const evaluated = watchBloodFx();
    const calls = [];
    vi.stubGlobal('fetch', serve(calls));
    const { loadPersos } = await import('../../js/game/persos-loader.js');
    const p = await loadPersos('');
    expect(p.params.sang).toBe('1');
    expect(evaluated).toHaveBeenCalled();
    expect(calls.slice(0, 4).sort()).toEqual(['data/game/blood.json', 'data/game/characters-v2.json', 'data/game/persos-choix.json', 'data/game/poses-v2.json']);
  });
  it('persos-runtime.js n\'importe plus blood-fx.js de façon statique (il le reçoit du chargeur)', () => {
    expect(read('js/game/persos-runtime.js')).not.toMatch(/^import .*blood-fx/m);
    expect(read('js/game/persos-loader.js')).toMatch(/fx \? import\('\.\/blood-fx\.js'\) : null/);
  });
  // Lot 5b-H (décision du propriétaire) : l'atlas n'est plus calculé à la première tache (accroc au premier sang sur les trois téléphones mesurés)
  // mais à la création du sang, derrière l'écran de préparation ; jamais pendant un moment libre ni par minuteur ; une seule fois.
  it('atlas des taches : calculé une fois à la création du sang (derrière l\'écran de préparation), jamais au premier moment libre', () => {
    const src = read('js/game/blood-fx.js');
    expect(src).toMatch(/const ensureAtlas = \(\) => \{\n\s+if \(atlasReady\) return;/);
    const head = src.slice(src.indexOf('const ensureAtlas'), src.indexOf('function addDecals'));
    expect(head.match(/ensureAtlas\(\);/g)).toHaveLength(1); // un appel direct à la création
    expect(src).toMatch(/function addDecals\(list\) \{\n\s+ensureAtlas\(\);/); // garde idempotente
    expect(src).not.toMatch(/requestIdleCallback\(ensureAtlas|setTimeout\(ensureAtlas/);
  });
  it('matières de blessure : seule la tuile 0 est créée avec le personnage, les autres au premier palier de blessure (levier 1)', () => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#c8b4a0' }));
    vi.stubGlobal('document', { documentElement: {} });
    const params = readPersosParams('', choix);
    const v2 = createV2Kit({ characters, poses, lookup: () => [200, 180, 160], choice: params.perso, styleOf: params.slots, zombieIds: variants.zombie.variants.map((v) => v.id), seed: 3 });
    const z = v2.create('zombie', 0);
    const kit = v2.slotKit(z.slot, z.choice);
    expect(kit.wound.filter(Boolean)).toHaveLength(1);
    z.setWound(2);
    expect(kit.wound.filter(Boolean)).toHaveLength(2);
    expect(kit.wound[2]).toBeTruthy();
  });
  // Levier 3 (tenues au premier usage) essayé puis retiré : aucun gain mesurable, et une tenue construite à l'apparition d'un zombie.
  it('tenues : toutes préparées d\'avance hors de l\'image (levier 3 non retenu)', () => {
    expect(read('js/game/persos-runtime.js')).toMatch(/max = Math\.max\(max, v2\.prewarm\(jobs\.shift\(\), outfit\)\);/);
  });
  it('sang 0 en jeu : aucun maillage de sang ajouté à la scène', () => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#c8b4a0' }));
    vi.stubGlobal('document', { documentElement: {} });
    const dynamic = new THREE.Group();
    const pv = createPersos(readPersosParams('?sang=0', choix), { characters, poses, blood: load('blood'), choices: choix, bloodFx: null }, { computePose: () => ({}), createKit: () => ({}), createCharacter: () => null });
    pv.attach({ kit: { variants: variants.zombie.variants }, world: { dynamic }, render: load('render'), palette: { hit: '#ffffff' }, variants, seed: 3 });
    expect(dynamic.children.filter((o) => /^sang-/.test(o.name))).toEqual([]);
    expect(pv.state({}).blood).toMatchObject({ particules: 0, taches: 0, cadavres: 0, calls: 0 });
  });
});

describe('retours du propriétaire (passation du lot 3j) : présents par défaut', () => {
  it('« riche » pour les cinq personnages et sang complet par défaut (table des choix)', () => {
    expect(Object.values(choix.persos).map((c) => c.variante)).toEqual(['riche', 'riche', 'riche', 'riche', 'riche']);
    expect(readPersosParams('', choix).sang).toBe('1');
  });
  it('morts selon le côté touché : de face, le zombie tombe en arrière', () => {
    expect(deathFor(0, { x: -1, y: 0 }, 7, load('blood').corpses.deaths)).toBe('mortArriere');
  });
  it('fenêtres enjambées : animation « enjamber » des zombies', () => expect(ZOMBIE_ANIMS).toContain('enjamber'));
  it('recul visible : arme relevée, reculée, cabrée et buste rejeté (KICK), pendant 0,25 s', () => {
    expect(KICK).toEqual([2.2, 3, 0.5, 0.3]);
    expect(read('js/game/character-v2.js')).toContain('const KICK_TIME = 0.25;');
  });
  it('jamais tirer et réparer à la fois ; pas de laser pendant la réparation (game.js)', () => {
    const game = read('js/game/game.js');
    expect(game).toMatch(/canRepair: !sim\.dead && !locked && !aimed/);
    expect(game).toMatch(/laser: laser && !sim\.dead && !Object\.values\(sim\.repair\)\.some\(\(r\) => r\.repairing\) \? laser : null/);
  });
  it('pistolet lisible et couleurs éclaircies (bloc du lot 3j de tokens.css)', () => {
    const css = read('css/tokens.css');
    for (const [k, v] of [['--perso-metal', '#ccd1d6'], ['--perso-crasse', '#d2cbba'], ['--perso-dechirure', '#a29d92'], ['--perso-tissu-rose', '#ebd0cb'], ['--perso-tissu-gris', '#d2d2cd']]) expect(css).toMatch(new RegExp(`${k}: ${v};`));
    expect(css).toContain('/* Personnages et sang (lot 3j)');
    expect(css).toContain('/* Interface intégrée (lot 3l) */');
  });
});

describe('compatibilité avec les autres refontes de lot-4b', () => {
  it('interface (lot 3l) : le canevas est dans #game-canvas, le HUD est un frère placé après lui (HTML au-dessus)', () => {
    const html = read('jeu.html');
    expect(html.indexOf('id="game-canvas"')).toBeGreaterThan(0);
    expect(html.indexOf('id="hud"')).toBeGreaterThan(html.indexOf('id="game-canvas"'));
  });
  it('sang et cadavres : dessinés dans la scène 3D (world.dynamic), jamais en HTML', () => {
    for (const f of ['js/game/blood-fx.js', 'js/game/persos-runtime.js', 'js/game/character-v2.js']) expect(read(f), f).not.toMatch(/document\.|createElement|innerHTML/);
  });
  it('visite libre (lot 3g, ?nospawn=1) : paramètre d\'essai de la sauvegarde, rien de spécial aux personnages', () => {
    expect(load('save').readOnlyParams).toContain('nospawn');
    for (const f of ['js/game/persos-params.js', 'js/game/persos-runtime.js']) expect(read(f)).not.toMatch(/nospawn/);
  });
  it('sons (lot 3i) : aucun son ajouté par le lot ; manques sonores listés dans le bilan', () => {
    const ids = load('sounds').sounds.map((s) => s.id);
    for (const id of ['chute-corps', 'marteau', 'impact-chair']) expect(ids).not.toContain(id);
    const bilan = read('Docs/lots/lot-3m.md');
    expect(bilan).toMatch(/Manques sonores/);
    for (const w of ['chute du corps', 'marteau', 'chair']) expect(bilan).toContain(w);
  });
  it('documentation : tableau des choix, paramètres, changer un défaut, code supprimable, écran de réglages', () => {
    const doc = read('Docs/ref/personnages-integres.md');
    for (const h of ['## Personnages par défaut', '## Paramètres d\'adresse', '## Changer un défaut', '## Code ancien supprimable', '## Budget', '## Futur écran de réglages']) expect(doc).toContain(h);
    expect(doc).toContain('persos-choix.json');
    expect(doc).toContain('?perso=actuel');
  });
});
