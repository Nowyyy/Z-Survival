import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PERSO_VALUES, SANG_VALUES, USURE_VALUES, readPersosParams } from '../../js/game/persos-params.js';
import { loadPersos } from '../../js/game/persos-loader.js';
import { createPersos } from '../../js/game/persos-runtime.js';
import * as bloodFx from '../../js/game/blood-fx.js';
import { createCharacter, createKit } from '../../js/game/character.js';
import { computePose } from '../../js/core/pose.js';
import { CROWD, LIMITS, REFERENCE, characterCost, crowdCost, project } from '../../scripts/personnages/projection.mjs';
import { characters, load, poses } from '../../scripts/personnages/lib.mjs';

// Lot 3j-D : essai en jeu derrière ?perso= et ?sang= (paramètres, chargeur, accroches), invariance des données de logique, projection.
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8' });
  } catch {
    return null;
  }
};
const variants = load('zombie-variants');

// Garde-fous du lot 3j contre main : actifs seulement sur la branche du lot (première ligne d'apercu.txt = atelier-personnages.html) ;
// dans la branche d'intégration (lot 4b), d'autres lots modifient les mêmes fichiers : ils se taisent (voir Docs/ref/passation-personnages-4b.md).
const ON_LOT = readFileSync('apercu.txt', 'utf8').split('\n')[0].trim() === 'atelier-personnages.html';
describe('persos-params.js : lecture des paramètres', () => {
  // Lot 3m : le défaut est la table des choix (?perso=choix ; data/game/persos-choix.json : « riche » pour les 5, sang complet).
  const choix = load('persos-choix');
  it('défauts (choix du propriétaire, lot 3m : table des choix) : variantes riche, sang complet, usure auto ; actif', () => expect(readPersosParams('', choix)).toMatchObject({ perso: 'choix', sang: '1', usure: 'auto', active: true, slots: { joueur: 'riche', marcheur: 'riche', petit: 'riche', voute: 'riche', grand: 'riche' } }));
  it('?perso=actuel&sang=0 : le jeu d\'avant le lot 3j, inactif ; réduit et 0 restent disponibles pour le menu d\'options', () => {
    expect(readPersosParams('?perso=actuel&sang=0')).toMatchObject({ perso: 'actuel', sang: '0', usure: 'auto', active: false });
    expect(readPersosParams('?sang=reduit').sang).toBe('reduit');
    expect(readPersosParams('?sang=0', choix).active).toBe(true); // lot 3m : personnages v2 de la table, sang coupé
  });
  it.each(PERSO_VALUES)('?perso=%s', (v) => expect(readPersosParams(`?perso=${v}`).perso).toBe(v));
  it.each(SANG_VALUES)('?sang=%s', (v) => expect(readPersosParams(`?sang=${v}`).sang).toBe(v));
  it.each(USURE_VALUES)('?usure=%s', (v) => expect(readPersosParams(`?usure=${v}`).usure).toBe(v === 'auto' ? 'auto' : Number(v)));
  it.each(['?perso=D', '?perso=a', '?perso=', '?perso=%3Cscript%3E', '?sang=2', '?sang=complet', '?usure=4', '?usure=-1', '?perso=A&perso=B'])('valeur inconnue ou ambiguë (%s) : la première valeur valide ou le défaut, sans erreur', (q) => {
    const p = readPersosParams(q);
    expect(PERSO_VALUES).toContain(p.perso);
    expect(SANG_VALUES).toContain(p.sang);
    expect(p.usure === 'auto' || [0, 1, 2, 3].includes(p.usure)).toBe(true);
  });
  it('entrées hostiles : non-chaîne, très longue : défaut sans exception', () => {
    for (const s of [null, undefined, 42, {}, `?perso=${'A'.repeat(100000)}`]) expect(() => readPersosParams(s)).not.toThrow();
    expect(readPersosParams(null).perso).toBe('choix');
  });
  it('actif dès qu\'il y a des personnages v2 ou du sang ; ?perso=actuel&sang=0 ne charge rien, même avec ?usure=', () => {
    expect(readPersosParams('?perso=B').active).toBe(true);
    expect(readPersosParams('?perso=actuel&sang=reduit').active).toBe(true);
    expect(readPersosParams('?perso=actuel&sang=0&usure=2').active).toBe(false);
  });
  it('les paramètres cosmétiques ne sont pas des paramètres d\'essai de la sauvegarde (readOnlyParams de save.json)', () => {
    const ro = JSON.stringify(load('save'));
    for (const k of ['"perso"', '"sang"', '"usure"']) expect(ro).not.toContain(k);
  });
});

describe('chargeur : chargé par défaut, rien avec ?perso=actuel&sang=0', () => {
  const game = readFileSync('js/game/game.js', 'utf8');
  const loader = readFileSync('js/game/persos-loader.js', 'utf8');
  it('game.js charge toujours le chargeur (import dynamique en tête de module)', () => {
    expect(game).toContain("const persos = await import('./persos-loader.js').then((m) => m.loadPersos(location.search));");
    expect(game).not.toMatch(/^import .*persos-/m);
  });
  it('persos-loader.js : 30 lignes au plus, modules du lot importés dynamiquement seulement', () => {
    expect(loader.split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(30);
    expect(loader).toContain("import('./persos-runtime.js')");
    expect(loader).not.toMatch(/^import .*persos-runtime/m);
  });
  it('?perso=actuel&sang=0 : aucune requête, aucun module du lot chargé (lot 3m : seul l\'ancien modèle, attach inactif)', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('aucune requête attendue')));
    vi.stubGlobal('fetch', fetchSpy);
    expect((await loadPersos('?perso=actuel&sang=0')).attach()).toBeNull();
    expect((await loadPersos('?perso=actuel&sang=0&usure=3')).attach()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('character.js aiguille createCharacter vers kit.v2 quand il prend ce personnage (lot 3m : par personnage, handles)', () => {
    const src = readFileSync('js/game/character.js', 'utf8');
    expect(src).toMatch(/if \(kit\.v2\?\.handles\(kind, variant\)\) return kit\.v2\.create\(kind, variant\);/);
  });
});

describe('fichiers du jeu modifiés : liste fermée, 40 lignes au plus chacun', () => {
  const numstat = git('diff --numstat main -- js/game');
  it.skipIf(!ON_LOT).each(['js/game/game.js', 'js/game/character.js', 'js/game/effects.js'])('%s : au plus 40 lignes ajoutées ou retirées', (f) => {
    if (numstat === null) return;
    const row = numstat.split('\n').find((l) => l.endsWith(`\t${f}`));
    const n = row ? row.split('\t').slice(0, 2).reduce((a, b) => a + Number(b), 0) : 0;
    expect(n).toBeLessThanOrEqual(40);
  });
  it.skipIf(!ON_LOT)('aucun autre fichier existant de js/game/ n\'est modifié (nouveaux fichiers seulement)', () => {
    const changed = git('diff --name-only --diff-filter=M main -- js/game');
    if (changed === null) return;
    expect(changed.split('\n').filter(Boolean).filter((f) => !['js/game/game.js', 'js/game/character.js', 'js/game/effects.js'].includes(f))).toEqual([]);
  });
  it('données de logique inchangées (ennemis, allures, armes, joueur, vagues, fenêtres, statistiques, économie, sauvegarde)', () => {
    // Lot 3m-A : dans lot-4b, comparées à la base de la branche d'intégration (le lot 4 a changé economy.json, enemies.json, save.json depuis main).
    // Lot 4e : origin/lot-4b n'existe plus et la branche locale « main » peut être périmée : base = celle de la branche avec origin/main
    // (à jour après git fetch), sinon origin/dev, sinon main ; sans historique (CI superficielle), rien à comparer.
    const base = git('merge-base HEAD origin/main')?.trim() || git('merge-base HEAD origin/dev')?.trim() || 'main';
    const changed = git(`diff --name-only ${base} -- data/game/enemies.json data/game/gaits.json data/game/weapons.json data/game/player.json data/game/waves.json data/game/windows.json data/game/player-stats.json data/game/economy.json data/game/save.json data/game/player-down.json data/game/stairs.json`);
    if (changed === null) return;
    expect(changed.trim()).toBe('');
  });
});

describe('persos-runtime.js : accroches (sans rendu)', () => {
  const stub = { region: () => ({ u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 }), texture: () => new THREE.Texture(), repeat: () => 1 };
  const lookup = (t) => [200, 180, 160, t ? 0 : 0].slice(0, 3);
  const setup = (perso, sang) => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#c8b4a0' }));
    vi.stubGlobal('document', { documentElement: {} });
    const kit = createKit({ textures: stub, variants, hit: '#ffffff' });
    const world = { dynamic: new THREE.Group() };
    const pv = createPersos(readPersosParams(`?perso=${perso}&sang=${sang}`), { characters, poses, blood: load('blood'), bloodFx }, { computePose, createKit, createCharacter }); // lot 3m-C : blood-fx fourni par le chargeur
    pv.attach({ kit, world, render: load('render'), palette: { hit: '#ffffff' }, variants, seed: 3 });
    return { kit, world, pv };
  };
  const after = () => vi.unstubAllGlobals();
  void lookup;
  it('?perso=B : createCharacter fabrique des personnages v2 de la variante B (joueur et 4 types)', () => {
    const { kit } = setup('B', '0');
    const p = createCharacter(kit, 'player');
    expect(p.v2).toBe(true);
    expect(p.choice).toBe('B');
    for (let i = 0; i < 4; i += 1) expect(createCharacter(kit, 'zombie', i).slot).toBe(variants.zombie.variants[i].id);
    after();
  });
  it('?perso=actuel&sang=1 : personnages actuels, sang actif', () => {
    const { kit, pv } = setup('actuel', '1');
    expect(createCharacter(kit, 'player').v2).toBeUndefined();
    expect(pv.state({}).architecture).toBe('articulated');
    after();
  });
  it('impacts : un tir non mortel donne des particules, une mort une flaque et un cadavre', () => {
    const { pv } = setup('A', '1');
    const enemies = [{ id: 1, x: 100, y: 0, type: 'grand', visual: 2, floor: 'rdc', health: 50, maxHealth: 140 }, { id: 2, x: 0, y: 80, type: 'petit', visual: 1, floor: 'rdc' }];
    pv.impacts([{ enemyId: 1, x: 95, y: 0 }, { enemyId: 2, x: 0, y: 75 }], [{ id: 2 }], enemies, { x: 0, y: 0 });
    pv.update(0.02);
    pv.sync('rdc', 1);
    const st = pv.state({ calls: 1, triangles: 2 });
    expect(st.blood.particules).toBe(8 + 20);
    expect(st.blood.cadavres).toBe(1);
    expect(st.blood.taches).toBeGreaterThanOrEqual(2);
    expect(st.render).toEqual({ calls: 1, triangles: 2 });
    after();
  });
  it('sang 0 : aucune particule ni cadavre ; état complet (perso, sang, usure, architecture, personnages, sang, rendu)', () => {
    const { pv } = setup('C', '0');
    pv.impacts([{ enemyId: 1, x: 0, y: 0 }], [{ id: 1 }], [{ id: 1, x: 10, y: 0, type: 'marcheur', visual: 0 }], { x: 0, y: 0 });
    const st = pv.state({});
    expect(Object.keys(st)).toEqual(['perso', 'sang', 'usure', 'wear', 'architecture', 'characters', 'slots', 'choix', 'blood', 'textures', 'render']); // lot 3m : slots, choix
    expect(st.blood).toMatchObject({ particules: 0, taches: 0, cadavres: 0 });
    after();
  });
  it('usure auto : le palier suit la manche (sync)', () => {
    const { pv } = setup('A', '0');
    pv.sync('rdc', 25);
    expect(pv.state({}).wear).toBe(2);
    pv.sync('rdc', 35);
    expect(pv.state({}).wear).toBe(3);
    after();
  });
  it('joueur : coup reçu détecté par la baisse de vie ; réparation et chute lues dans l\'état', () => {
    const { pv } = setup('A', '1');
    const sim = { player: { health: 100 }, down: { state: 'debout' }, repair: { F1: { repairing: true } } };
    expect(pv.playerCtx(sim, { player: { repairTime: 1.2 } })).toEqual({ down: 'debout', repairing: true, repairTime: 1.2, hurt: false });
    expect(pv.playerCtx({ ...sim, player: { health: 90 } }, { player: { repairTime: 1.2 } }).hurt).toBe(true);
    after();
  });
  it('blessures : le palier du corps suit la vie au niveau complet, jamais au niveau réduit', () => {
    const full = setup('A', '1');
    const z = createCharacter(full.kit, 'zombie', 0);
    full.pv.zombie(z, { health: 20, maxHealth: 100 });
    expect(z.readPose().wound).toBe(3);
    after();
    const red = setup('A', 'reduit');
    const y = createCharacter(red.kit, 'zombie', 0);
    red.pv.zombie(y, { health: 20, maxHealth: 100 });
    expect(y.readPose().wound).toBe(0);
    after();
  });
});

describe('projection de budget (scripts/personnages/projection.mjs)', () => {
  it('foule : le joueur et 10 zombies variés (3 marcheurs, 3 petits, 2 voûtés, 2 grands)', () => {
    expect(CROWD).toHaveLength(11);
    expect(CROWD.filter((c) => c === 'marcheur')).toHaveLength(3);
  });
  it('actuel : 16 à 17 appels par personnage (pièces + ombres)', () => {
    expect(characterCost('marcheur', 'actuel').calls).toBe(16);
    expect(characterCost('joueur', 'actuel').calls).toBe(17);
    expect(crowdCost(() => 'actuel').calls).toBe(177);
  });
  it.each(['A', 'B', 'C'])('variante %s, sang complet et 6 cadavres : sous les limites de refonte et sous les limites actuelles dans R1, R2, U1, U4', (v) => {
    for (const p of Object.values(project(() => v, '1'))) {
      expect(p.calls).toBeLessThanOrEqual(LIMITS.refonte.calls);
      expect(p.triangles).toBeLessThanOrEqual(LIMITS.refonte.triangles);
      expect(p.calls).toBeLessThanOrEqual(LIMITS.current.calls);
      expect(p.triangles).toBeLessThanOrEqual(LIMITS.current.triangles);
    }
  });
  it('« riche » : sous les limites de refonte, au-dessus des limites actuelles (hors budget, rapporté)', () => {
    const worst = Math.max(...Object.values(project(() => 'riche', '1')).map((p) => p.triangles));
    expect(worst).toBeLessThanOrEqual(LIMITS.refonte.triangles);
    expect(worst).toBeGreaterThan(LIMITS.current.triangles);
  });
  it('actuel sans sang : la projection redonne la référence mesurée', () => expect(project(() => 'actuel', '0')).toEqual(REFERENCE));
});

describe('plan d\'intégration et manifeste de fusion (formats)', () => {
  const plan = readFileSync('Docs/ref/integration-personnages.md', 'utf8');
  const manifest = readFileSync('Docs/ref/fusion-3j.md', 'utf8');
  it.each(['Variante par défaut', 'Valeurs par défaut à changer', 'Code à supprimer', 'Tests à adapter', 'Couleurs', 'Budget et mémoire', 'Sons à prévoir', 'réduire le sang', 'Procédure'])('le plan a sa section « %s »', (h) => expect(plan).toMatch(new RegExp(`## \\d+\\. .*${h}`, 'i')));
  it('le plan nomme les sons à prévoir (chair, chute du corps, marteau) et les tests persos-*.spec.js de la suite rapide', () => {
    for (const w of ['Impact sur la chair', 'Chute du corps', 'Marteau de réparation', 'persos-atelier', 'persos-jeu']) expect(plan).toContain(w);
  });
  it('le manifeste liste chaque fichier partagé modifié et sa résolution ; la première ligne d\'apercu.txt n\'est jamais fusionnée', () => {
    for (const f of ['apercu.txt', 'scripts/build.mjs', 'css/tokens.css', 'tests/unit/lot1-regles.test.js', 'tests/unit/core-purity.test.js', 'tests/unit/data-i18n.test.js', 'js/game/character.js', 'js/game/game.js', 'js/game/effects.js']) expect(manifest).toContain(`\`${f}\``);
    expect(manifest).toContain('Ne jamais fusionner la première ligne');
  });
  it.skipIf(!ON_LOT)('les fichiers partagés réellement modifiés depuis main sont tous dans le manifeste', () => {
    const changed = git('diff --name-only --diff-filter=M main');
    if (changed === null) return;
    const shared = changed.split('\n').filter(Boolean).filter((f) => !f.startsWith('Docs/') && !/persos|character-v2|characters-v2|poses-v2/.test(f) && !f.includes('lot-3j'));
    for (const f of shared) expect(manifest, f).toContain(`\`${f}\``);
  });
});
