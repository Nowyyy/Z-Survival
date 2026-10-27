import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { GAITS, TYPES, waveSpec } from '../../js/core/waves.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const waves = load('waves');
const gaits = load('gaits');
const enemies = load('enemies');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

describe('data/game/waves.json', () => {
  it('est marqué provisoire et contient toutes les sections', () => {
    expect(waves._provisoire).toBeTruthy();
    for (const k of ['total', 'maxConcurrent', 'spawnInterval', 'hp', 'speed', 'damage', 'types', 'gaitAnchors', 'order', 'intermission', 'healFraction', 'wavesPerLevel', 'spawn']) expect(waves, k).toHaveProperty(k);
  });

  it('contient les valeurs de départ de la spécification', () => {
    expect(waves.total).toMatchObject({ base: 5, linear: 1.6, quadratic: 0.05, cap: 150, reinforcedEvery: 5, reinforcedMul: 1.3 });
    expect(waves.hp).toEqual({ hpLinearPerRound: 0.5, hpExpStartRound: 10, hpExpFactor: 1.1, hpCap: 30 });
    expect(waves.spawnInterval).toEqual({ base: 2.5, factor: 0.95, min: 0.9 });
    expect(waves.damage).toEqual({ factor: 1.05, cap: 3 });
    expect(waves.speed.factor).toBe(1.02);
    expect(waves.intermission).toEqual({ first: 3, between: 8 });
    expect([waves.healFraction, waves.wavesPerLevel]).toEqual([1, 5]);
  });

  it('types introduits aux vagues 1, 3, 5 et 7 avec les plafonds 30, 20 et 15 %', () => {
    expect([waves.types.marcheur.from, waves.types.petit.from, waves.types.voute.from, waves.types.grand.from]).toEqual([1, 3, 5, 7]);
    expect([waves.types.petit.cap, waves.types.voute.cap, waves.types.grand.cap]).toEqual([0.3, 0.2, 0.15]);
    expect(waves.types.rampWaves).toBe(6);
  });

  it('simultanés : au plus 10 (budget de triangles)', () => {
    expect(waves.maxConcurrent.cap).toBeLessThanOrEqual(10);
    for (let n = 1; n <= 300; n += 1) expect(waveSpec(n, waves).maxConcurrent).toBeLessThanOrEqual(10);
  });

  it('budget de triangles estimé : 8 230 (décor et joueur) + 624 par zombie × 10 ≤ 15 000', () => {
    // Bilan du lot 1c : 13 222 triangles avec 8 zombies de 624 triangles, soit 13 222 − 8 × 624 = 8 230 pour le décor et le joueur.
    const fixed = 13222 - 8 * 624;
    expect(fixed).toBe(8230);
    expect(fixed + 624 * waves.maxConcurrent.cap).toBe(14470);
    expect(fixed + 624 * waves.maxConcurrent.cap).toBeLessThanOrEqual(15000);
  });

  it('les poids d\'allures totalisent 100 à chaque point d\'ancrage, rangés par vague croissante', () => {
    for (const a of waves.gaitAnchors) expect(GAITS.reduce((s, g) => s + a[g], 0), `vague ${a.wave}`).toBe(100);
    expect(waves.gaitAnchors.map((a) => a.wave)).toEqual([1, 4, 8, 12, 20]);
  });
});

describe('data/game/gaits.json', () => {
  it('est marqué provisoire et décrit les quatre allures', () => {
    expect(gaits._provisoire).toBeTruthy();
    expect(Object.keys(gaits.gaits)).toEqual(GAITS);
  });

  it('valeurs de la spécification : vitesse, plafond et foulée', () => {
    expect(gaits.gaits).toEqual({
      lent: { speed: 45, cap: 70, stride: 38 },
      marche: { speed: 70, cap: 110, stride: 52 },
      rampe: { speed: 105, cap: 150, stride: 40 },
      course: { speed: 140, cap: 185, stride: 78 },
    });
  });

  it('plafond d\'allure ≥ vitesse de base, et plafond absolu de 190', () => {
    expect(gaits.maxSpeed).toBe(190);
    for (const g of GAITS) expect(gaits.gaits[g].cap).toBeGreaterThanOrEqual(gaits.gaits[g].speed);
  });

  it('la marche garde la vitesse du zombie du lot 1 (70)', () => {
    expect(gaits.gaits.marche.speed).toBe(enemies.zombie.speed);
  });
});

describe('data/game/enemies.json : types', () => {
  it('quatre types avec les cinq multiplicateurs', () => {
    expect(Object.keys(enemies.variants)).toEqual(TYPES);
    for (const v of Object.values(enemies.variants)) expect(Object.keys(v).sort()).toEqual(['bounty', 'damageMul', 'hpMul', 'radiusMul', 'speedMul']);
  });

  it('valeurs de vie, vitesse et dégâts de la spécification', () => {
    const pick = (k) => TYPES.map((t) => enemies.variants[t][k]);
    expect(pick('hpMul')).toEqual([1, 0.6, 1.6, 2.8]);
    expect(pick('speedMul')).toEqual([1, 1.15, 0.9, 0.85]);
    expect(pick('damageMul')).toEqual([1, 0.7, 1.2, 1.6]);
  });

  it('les rayons restent entre 0,92 et 1,08 du rayon de base', () => {
    for (const v of Object.values(enemies.variants)) {
      expect(v.radiusMul).toBeGreaterThanOrEqual(0.92);
      expect(v.radiusMul).toBeLessThanOrEqual(1.08);
    }
  });

  it('le zombie du lot 1 est conservé (autres tests de valeurs de départ)', () => {
    expect(enemies.zombie).toMatchObject({ radius: 20, speed: 70, health: 50, contactDamage: 10 });
  });
});

describe('textes et pureté', () => {
  it('les modules des vagues n\'utilisent ni Math.random, ni Date.now, ni document, ni window', () => {
    for (const f of ['waves', 'wave-director', 'enemy-factory']) {
      const text = readFileSync(`js/core/${f}.js`, 'utf8');
      for (const re of [/Math\.random/, /Date\.now/, /\bdocument\b/, /\bwindow\b/, /performance\.now/, /setTimeout|setInterval/]) expect(text, `${f} ${re}`).not.toMatch(re);
    }
  });

  it('aucun fichier de js/core/ n\'utilise Math.random, Date.now, document ni window', () => {
    for (const f of walk('js/core').filter((n) => n.endsWith('.js'))) {
      const text = readFileSync(f, 'utf8');
      for (const re of [/Math\.random/, /Date\.now/, /\bdocument\b/, /\bwindow\b/]) expect(text, `${f} ${re}`).not.toMatch(re);
    }
  });

  it('le script de la courbe existe et n\'écrit rien', () => {
    const text = readFileSync('scripts/courbe-vagues.mjs', 'utf8');
    expect(text).not.toMatch(/writeFile|appendFile|mkdir|rmSync|unlink/);
    expect(text).toContain('Black Ops 3');
  });

  it('data/game/*.json : le jeu ne dépend d\'aucune couleur en dur dans les nouvelles données', () => {
    for (const f of ['waves', 'gaits']) expect(readFileSync(`data/game/${f}.json`, 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
