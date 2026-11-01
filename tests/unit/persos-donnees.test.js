import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PART_KINDS, expandParts } from '../../js/core/character-parts.js';
import { characters, load, poses, texturesJson } from '../../scripts/personnages/lib.mjs';

// Lot 3j : données des personnages (characters-v2.json, poses-v2.json) et hygiène du lot (fichiers interdits, assets, pureté).
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null; // pas de dépôt ou pas de branche main : rien à comparer
  }
};
const regions = texturesJson.textures.find((t) => t.id === 'atlas-persos').params.regions.map((r) => r.id);
const ORDER = ['joueur', 'marcheur', 'petit', 'voute', 'grand'];
const NEW_CORE = ['character-parts', 'pose-v2', 'persos-variants', 'texgen-persos', 'blood', 'arena', 'crowd'].map((n) => `js/core/${n}.js`);

describe('characters-v2.json', () => {
  it('version, texte provisoire, cinq emplacements dans l\'ordre joueur, marcheur, petit, voûté, grand', () => {
    expect(characters.version).toBe(1);
    expect(characters._provisoire.length).toBeGreaterThan(40);
    expect(characters.slots.map((s) => s.id)).toEqual(ORDER);
    for (const s of characters.slots) expect(s.label.length).toBeGreaterThan(2);
  });
  it.each(characters.slots.map((s) => [s.id, s]))('%s : pièces actuelles valides (types, articulations, identifiants uniques)', (_id, s) => {
    const joints = new Set(poses.skeletons[s.current.skeleton].joints.map((j) => j.id));
    const parts = expandParts(s.current);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    for (const p of parts) {
      expect(PART_KINDS).toContain(p.kind);
      expect(joints.has(p.joint), `${p.id} ${p.joint}`).toBe(true);
    }
  });
  it.each(characters.slots.map((s) => [s.id, s]))('%s : chaque région nommée existe dans l\'atlas atlas-persos', (_id, s) => {
    for (const p of s.current.parts) expect(regions, `${p.id} ${p.region}`).toContain(s.current.regions[p.region]);
  });
  it('identifiants de variantes uniques par emplacement', () => {
    for (const s of characters.slots) {
      const ids = s.variants.map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('poses-v2.json : squelettes', () => {
  it.each(['v1', 'v2'])('squelette %s : parents déclarés avant leurs enfants, identifiants uniques, une seule racine', (id) => {
    const joints = poses.skeletons[id].joints;
    const seen = new Set();
    for (const j of joints) {
      if (j.parent !== null) expect(seen.has(j.parent), j.id).toBe(true);
      seen.add(j.id);
    }
    expect(seen.size).toBe(joints.length);
    expect(joints.filter((j) => j.parent === null)).toHaveLength(1);
  });
  it('v1 : longueurs du squelette actuel (js/game/skeleton.js)', () => {
    const j = Object.fromEntries(poses.skeletons.v1.joints.map((x) => [x.id, x.offset]));
    expect(j.pelvis[1]).toBe(27);
    expect(j.kneeL[1]).toBe(-12);
    expect(j.elbowL[1]).toBe(-10);
    expect(j.wristL[1]).toBe(-9);
    expect(j.shoulderL).toEqual([11.5, 17, 0]);
    expect(j.hipR).toEqual([-5.5, 0, 0]);
  });
  it('v2 : cou, colonne en deux segments, chevilles et poignets ; plages articulaires min < max sur chaque axe', () => {
    const ids = poses.skeletons.v2.joints.map((x) => x.id);
    for (const id of ['spine', 'chest', 'neck', 'head', 'ankleL', 'ankleR', 'wristL', 'wristR']) expect(ids).toContain(id);
    for (const j of poses.skeletons.v2.joints) for (const ax of ['x', 'y', 'z']) expect(j.range[ax][0], `${j.id}.${ax}`).toBeLessThan(j.range[ax][1]);
  });
  it('pose de repos : aucun angle', () => expect(poses.rest).toEqual({ angles: {}, offsets: {} }));
});

describe('hygiène du lot 3j', () => {
  it('js/core/ nouveaux fichiers : ni Math.random, ni Date.now, ni document, ni window, ni Three.js', () => {
    for (const f of NEW_CORE) {
      const src = readFileSync(f, 'utf8');
      for (const re of [/Math\.random/, /Date\.now/, /\bdocument\b/, /(?<![\w.'-])window\s*[.[(]/, /from 'three'/, /localStorage|sessionStorage/, /\bfetch\s*\(/]) expect(src, `${f} ${re}`).not.toMatch(re);
    }
  });
  it('aucune image, police, modèle ni son ajouté par le lot', () => {
    const added = git('diff --name-only --diff-filter=A main');
    if (added === null) return;
    expect(added.filter((f) => /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|glb|gltf|obj|fbx|dae|wav|mp3|ogg|flac|m4a)$/i.test(f))).toEqual([]);
  });
  it('fichiers interdits du lot inchangés depuis main', () => {
    const forbidden = ['jeu.html', 'index.html', 'css/game.css', 'js/game/hud.js', 'js/game/ui.js', 'js/game/world.js', 'js/game/windows-mesh.js', 'js/game/textures.js', 'js/game/palette.js', 'js/core/texgen.js', 'js/core/maps.js', 'js/core/pose.js', 'js/core/enemy-factory.js', 'data/game/zombie-variants.json', 'data/game/enemies.json', 'data/game/gaits.json', 'data/game/textures.json', 'data/game/render.json', 'data/game/save.json', 'CLAUDE.md', 'Docs/ref/conventions.md', 'Docs/seed.md', 'data/i18n/fr.json', 'data/i18n/en.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js', '.github/workflows/pages.yml', 'playwright.config.js'];
    const changed = git(`diff --name-only main -- ${forbidden.join(' ')}`);
    if (changed === null) return;
    expect(changed).toEqual([]);
  });
  it('bilans des lots précédents inchangés', () => {
    const changed = git('diff --name-only --diff-filter=MD main -- Docs/lots');
    if (changed === null) return;
    expect(changed).toEqual([]);
  });
  it('aucune dépendance nouvelle (dependencies et devDependencies de package.json identiques à main)', () => {
    const now = JSON.parse(readFileSync('package.json', 'utf8'));
    let before;
    try {
      before = JSON.parse(execSync('git show main:package.json', { encoding: 'utf8' }));
    } catch {
      return;
    }
    expect(now.dependencies ?? {}).toEqual(before.dependencies ?? {});
    expect(now.devDependencies).toEqual(before.devDependencies);
  });
  it('les scripts du lot n\'écrivent aucun fichier (lecture seule, sortie standard)', () => {
    for (const f of readdirSync('scripts/personnages').filter((n) => n.endsWith('.mjs'))) expect(readFileSync(`scripts/personnages/${f}`, 'utf8'), f).not.toMatch(/writeFile|appendFile|mkdirSync|rmSync/);
  });
  it('tests de pureté adaptés : une ligne par nouveau fichier de js/core/ dans lot1-regles', () => {
    const src = readFileSync('tests/unit/lot1-regles.test.js', 'utf8');
    for (const f of NEW_CORE) expect(src).toContain(`allowed.push('${f}'); // lot 3j`);
    expect(existsSync('tests/unit/core-purity.test.js')).toBe(true);
  });
  it('aucun fichier de plus de 5 Mo ajouté par le lot', () => {
    const added = git('diff --name-only --diff-filter=AM main');
    if (added === null) return;
    for (const f of added.filter(existsSync)) expect(readFileSync(f).length, f).toBeLessThan(5 * 1024 * 1024);
  });
});

describe('données de logique inchangées', () => {
  it('enemies.json et gaits.json : vitesses, rayons et vies du jeu', () => {
    const g = load('gaits');
    expect(Object.values(g.gaits).map((x) => x.speed)).toEqual([45, 70, 105, 140]);
    expect(load('enemies').zombie.radius).toBe(20);
    expect(load('player').speed).toBe(220);
  });
});
