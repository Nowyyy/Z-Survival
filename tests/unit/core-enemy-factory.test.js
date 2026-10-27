import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEnemy, enemySpeed } from '../../js/core/enemy-factory.js';
import { GAITS, TYPES, waveSpec } from '../../js/core/waves.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const enemies = load('enemies');
const gaits = load('gaits');
const params = load('waves');
const variants = load('zombie-variants');
const audio = load('audio');
const spec = (n) => waveSpec(n, params);

describe('createEnemy : type, allure et vague', () => {
  it('un marcheur à la vague 1 a la vie de base de enemies.json', () => {
    const e = createEnemy('marcheur', 'marche', spec(1), enemies, gaits);
    expect(e.hp).toBe(enemies.zombie.health);
    expect(e.maxHp).toBe(e.hp);
    expect(e.damage).toBe(enemies.zombie.contactDamage);
    expect(e.radius).toBe(enemies.zombie.radius);
  });

  it.each(TYPES)('type %s : vie = base × hpMul(vague) × hpMul du type', (type) => {
    const e = createEnemy(type, 'marche', spec(12), enemies, gaits);
    expect(e.hp).toBeCloseTo(enemies.zombie.health * spec(12).hpMul * enemies.variants[type].hpMul, 9);
    expect(e.type).toBe(type);
  });

  it.each(TYPES)('type %s : dégâts = base × damageMul(vague) × damageMul du type', (type) => {
    const e = createEnemy(type, 'lent', spec(7), enemies, gaits);
    expect(e.damage).toBeCloseTo(enemies.zombie.contactDamage * spec(7).damageMul * enemies.variants[type].damageMul, 9);
  });

  it.each(GAITS)('allure %s : vitesse de base à la vague 1, foulée de l\'allure', (gait) => {
    const e = createEnemy('marcheur', gait, spec(1), enemies, gaits);
    expect(e.speed).toBeCloseTo(gaits.gaits[gait].speed, 9);
    expect(e.stride).toBe(gaits.gaits[gait].stride);
    expect(e.gait).toBe(gait);
  });

  it('la vitesse monte avec la vague puis s\'arrête au plafond de l\'allure', () => {
    expect(createEnemy('marcheur', 'lent', spec(10), enemies, gaits).speed).toBeCloseTo(45 * 1.02 ** 9, 9);
    expect(createEnemy('marcheur', 'lent', spec(100), enemies, gaits).speed).toBe(70);
    expect(createEnemy('marcheur', 'course', spec(100), enemies, gaits).speed).toBe(185);
  });

  it('la vitesse du type multiplie celle de l\'allure plafonnée', () => {
    expect(createEnemy('petit', 'marche', spec(1), enemies, gaits).speed).toBeCloseTo(70 * 1.15, 9);
    expect(createEnemy('grand', 'marche', spec(1), enemies, gaits).speed).toBeCloseTo(70 * 0.85, 9);
  });

  it('plafond absolu de 190 : un petit en course reste à 190', () => {
    expect(createEnemy('petit', 'course', spec(100), enemies, gaits).speed).toBe(190);
  });

  it('toute combinaison allure × type × vague de 1 à 200 va à 190 au plus, donc moins vite que le joueur (220)', () => {
    const player = load('player');
    for (let n = 1; n <= 200; n += 1) {
      for (const type of TYPES) {
        for (const gait of GAITS) {
          const e = createEnemy(type, gait, spec(n), enemies, gaits);
          expect(e.speed).toBeLessThanOrEqual(190);
          expect(e.speed).toBeLessThan(player.speed);
          expect(e.speed).toBeGreaterThan(0);
        }
      }
    }
  });

  it('les vitesses ne diminuent jamais d\'une vague à l\'autre pour un même type et une même allure', () => {
    for (const type of TYPES) for (const gait of GAITS) {
      let before = 0;
      for (let n = 1; n <= 200; n += 1) {
        const v = createEnemy(type, gait, spec(n), enemies, gaits).speed;
        expect(v).toBeGreaterThanOrEqual(before);
        before = v;
      }
    }
  });

  it('enemySpeed donne la même valeur que createEnemy', () => {
    expect(enemySpeed('voute', 'rampe', spec(9).speedMul, enemies, gaits)).toBe(createEnemy('voute', 'rampe', spec(9), enemies, gaits).speed);
  });

  it('type ou allure inconnus : marcheur / marche, sans exception', () => {
    const e = createEnemy('dragon', 'vol', spec(3), enemies, gaits);
    expect([e.type, e.gait]).toEqual(['marcheur', 'marche']);
  });

  it.each([null, undefined, 'x', 3, {}, []])('entrées hostiles %s : valeurs finies', (bad) => {
    const e = createEnemy(bad, bad, bad, bad, bad);
    for (const k of ['hp', 'maxHp', 'speed', 'damage', 'radius', 'stride', 'bounty']) expect(Number.isFinite(e[k]), k).toBe(true);
  });

  it('ne modifie pas ses arguments gelés', () => {
    const deep = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deep(v)); return Object.freeze(o); };
    const a = deep(structuredClone(enemies));
    const b = deep(structuredClone(gaits));
    const s = deep(structuredClone(spec(20)));
    expect(() => createEnemy('grand', 'course', s, a, b)).not.toThrow();
  });
});

describe('types : cohérence avec le rendu et le son', () => {
  it('les noms de types sont ceux de zombie-variants.json et de la table de hauteur de voix', () => {
    expect(Object.keys(enemies.variants).sort()).toEqual(variants.zombie.variants.map((v) => v.id).sort());
    expect(Object.keys(enemies.variants).sort()).toEqual(Object.keys(audio.zombieRate).sort());
    expect([...TYPES].sort()).toEqual(Object.keys(enemies.variants).sort());
  });

  it.each(TYPES)('type %s : le rayon de collision suit l\'échelle visuelle (radiusMul = scale)', (type) => {
    const visual = variants.zombie.variants.find((v) => v.id === type);
    expect(enemies.variants[type].radiusMul).toBe(visual.scale);
    expect(createEnemy(type, 'marche', spec(1), enemies, gaits).radius).toBeCloseTo(enemies.zombie.radius * visual.scale, 9);
  });

  it('bounty vaut 0 pour tous les types (réservé au lot 4)', () => {
    for (const t of TYPES) {
      expect(enemies.variants[t].bounty).toBe(0);
      expect(createEnemy(t, 'marche', spec(5), enemies, gaits).bounty).toBe(0);
    }
  });

  it('la foulée de chaque allure est positive et la vitesse du joueur dépasse leur plafond absolu', () => {
    for (const g of GAITS) {
      expect(gaits.gaits[g].stride).toBeGreaterThan(0);
      expect(gaits.gaits[g].cap).toBeGreaterThanOrEqual(gaits.gaits[g].speed);
    }
    expect(gaits.maxSpeed).toBe(190);
    expect(gaits.maxSpeed).toBeLessThan(load('player').speed);
  });
});
