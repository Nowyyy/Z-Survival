import { describe, it, expect } from 'vitest';
import { applyHeal, canFire, canHealOnKill, canMove, createPlayerDown, isInvulnerable, knockbackZombies, stepPlayerDown } from '../../js/core/player-down.js';
import { stepContact } from '../../js/core/combat.js';
import { effectivePlayer } from '../../js/core/player-stats.js';
import { deepFreeze, layout, load, WEIRD } from './helpers/monde.js';

const cfg = load('player-down');
const stats = load('player-stats');
const playerCfg = load('player');
const vit = (hp, maxHp = 100) => ({ hp, maxHp });
// Fait avancer l'état de `seconds` secondes par pas de 0,05 s ; renvoie l'état final, la vie et tous les événements.
function run(down, hp, seconds, maxHp = 100, dt = 0.05) {
  let d = down;
  let h = hp;
  const events = [];
  const knocks = [];
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const out = stepPlayerDown(d, vit(h, maxHp), dt, cfg);
    d = out.down;
    h = out.hp;
    events.push(...out.events);
    if (out.knockback) knocks.push(out.knockback);
  }
  return { down: d, hp: h, events, knocks };
}

describe('player-down.js : machine d\'états', () => {
  it('départ : debout, avec les chutes données', () => {
    expect(createPlayerDown(1)).toEqual({ state: 'debout', chutes: 1, chutesMax: 1, timeLeft: 0, grace: 0, pendingHeal: 0 });
  });

  it('debout avec de la vie : rien ne se passe', () => {
    const out = stepPlayerDown(createPlayerDown(1), vit(50), 0.05, cfg);
    expect(out.down.state).toBe('debout');
    expect(out.hp).toBe(50);
    expect(out.events).toEqual([]);
    expect(out.knockback).toBeNull();
  });

  it('0 de vie avec une chute : tombe (chute décomptée, 5 s, vie 0), événement fall, repoussement de chute', () => {
    const out = stepPlayerDown(createPlayerDown(1), vit(0), 0.05, cfg);
    expect(out.down).toMatchObject({ state: 'terre', chutes: 0, chutesMax: 1, timeLeft: 5 });
    expect(out.hp).toBe(0);
    expect(out.events).toEqual(['fall']);
    expect(out.knockback).toEqual({ radius: 220, distance: 160, reason: 'fall' });
  });

  it('0 de vie sans chute : mort, événement death, pas de repoussement', () => {
    const out = stepPlayerDown(createPlayerDown(0), vit(0), 0.05, cfg);
    expect(out.down.state).toBe('mort');
    expect(out.events).toEqual(['death']);
    expect(out.knockback).toBeNull();
  });

  it('à terre pendant exactement 5 s de jeu, puis il se relève', () => {
    const fall = stepPlayerDown(createPlayerDown(1), vit(0), 0.05, cfg);
    const almost = run(fall.down, 0, 4.95);
    expect(almost.down.state).toBe('terre');
    const up = run(almost.down, 0, 0.05);
    expect(up.down.state).toBe('debout');
    expect(up.events).toEqual(['standup']);
  });

  it('au relevage : 50 % de la vie maximale effective, protection de 2 s, repoussement de relevage', () => {
    for (const maxHp of [100, 160, 220]) {
      const fall = stepPlayerDown(createPlayerDown(1), vit(0, maxHp), 0.05, cfg);
      const up = run(fall.down, 0, 5, maxHp);
      expect(up.hp).toBe(maxHp / 2);
      expect(up.down.grace).toBe(2);
      expect(up.knocks).toEqual([{ radius: 220, distance: 200, reason: 'standup' }]);
    }
  });

  it('la protection décroît jusqu\'à 0 en 2 s', () => {
    let d = { ...createPlayerDown(1), grace: 2 };
    for (let i = 0; i < 39; i += 1) d = stepPlayerDown(d, vit(50), 0.05, cfg).down;
    expect(d.grace).toBeGreaterThan(0);
    d = stepPlayerDown(d, vit(50), 0.05, cfg).down;
    expect(d.grace).toBeCloseTo(0, 9);
  });

  it('un deuxième 0 de vie sans chute restante : mort (le compteur n\'est pas rechargé)', () => {
    const first = run(createPlayerDown(1), 0, 5.1);
    expect(first.down.state).toBe('debout');
    const second = stepPlayerDown(first.down, vit(0), 0.05, cfg);
    expect(second.down.state).toBe('mort');
    expect(second.events).toEqual(['death']);
  });

  it.each([1, 2, 6])('%s chute(s) : autant de chutes avant la mort', (n) => {
    let d = createPlayerDown(n);
    let falls = 0;
    for (let k = 0; k < n + 2; k += 1) {
      const out = stepPlayerDown(d, vit(0), 0.05, cfg);
      d = out.down;
      if (out.events.includes('fall')) {
        falls += 1;
        d = run(d, 0, 5.1).down;
      }
    }
    expect(falls).toBe(n);
    expect(d.state).toBe('mort');
  });

  it('mort : état définitif, vie 0', () => {
    const dead = stepPlayerDown(createPlayerDown(0), vit(0), 0.05, cfg).down;
    const out = stepPlayerDown(dead, vit(80), 5, cfg);
    expect(out.down.state).toBe('mort');
    expect(out.hp).toBe(0);
  });

  it('pause (dt = 0) : le compte à rebours à terre est figé', () => {
    const fall = stepPlayerDown(createPlayerDown(1), vit(0), 0.05, cfg).down;
    let paused = fall;
    for (let i = 0; i < 100; i += 1) paused = stepPlayerDown(paused, vit(0), 0, cfg).down;
    expect(paused.timeLeft).toBe(5);
    const half = run(fall, 0, 2).down;
    expect(stepPlayerDown(half, vit(0), 0, cfg).down.timeLeft).toBe(half.timeLeft);
  });
});

describe('player-down.js : invulnérabilité, mouvements, tir, soins', () => {
  const down = stepPlayerDown(createPlayerDown(1), vit(0), 0.05, cfg).down;
  const up = run(down, 0, 5.05).down;

  it('invulnérable à terre et pendant la protection, vulnérable ensuite et mort', () => {
    expect(isInvulnerable(createPlayerDown(1))).toBe(false);
    expect(isInvulnerable(down)).toBe(true);
    expect(isInvulnerable(up)).toBe(true);
    expect(isInvulnerable(run(up, 50, 2.1).down)).toBe(false);
    expect(isInvulnerable({ ...up, state: 'mort' })).toBe(false);
  });

  it('canMove et canFire sont faux à terre et mort, vrais debout (même protégé)', () => {
    expect([canMove(createPlayerDown(1)), canFire(createPlayerDown(1))]).toEqual([true, true]);
    expect([canMove(down), canFire(down)]).toEqual([false, false]);
    expect([canMove(up), canFire(up)]).toEqual([true, true]);
    expect([canMove({ state: 'mort' }), canFire({ state: 'mort' })]).toEqual([false, false]);
  });

  it('aucun soin par zombie tué à terre ou mort', () => {
    expect(canHealOnKill(createPlayerDown(1))).toBe(true);
    expect(canHealOnKill(down)).toBe(false);
    expect(canHealOnKill({ state: 'mort' })).toBe(false);
  });

  it('combat.js : aucun dégât de contact pour un joueur invulnérable, et les délais des zombies ne sont pas relancés', () => {
    const z = { id: 1, x: 100, y: 100, r: 20, damage: 10, hitCooldown: 0 };
    const player = { x: 100, y: 100, r: 18, health: 50 };
    const hit = stepContact(player, [z], 0.05, { contactDelay: 1, contactDamage: 10 }, true);
    expect(hit.damage).toBe(0);
    expect(hit.player.health).toBe(50);
    expect(hit.enemies[0].hitCooldown).toBe(0);
    expect(stepContact(player, [z], 0.05, { contactDelay: 1, contactDamage: 10 }).damage).toBe(10);
  });

  it('applyHeal debout : soin de fraction × vie maximale, plafonné', () => {
    expect(applyHeal(40, 100, 1, createPlayerDown(1)).hp).toBe(100);
    expect(applyHeal(40, 100, 0.25, createPlayerDown(1)).hp).toBe(65);
    expect(applyHeal(95, 100, 0.25, createPlayerDown(1)).hp).toBe(100);
  });

  it('applyHeal à terre : reporté au relevage (la vie reste à 0, le soin est mémorisé)', () => {
    const out = applyHeal(0, 100, 1, down);
    expect(out.hp).toBe(0);
    expect(out.down.pendingHeal).toBe(1);
  });

  it('un soin de fin de vague à 100 % reporté donne la vie pleine au relevage', () => {
    const healed = applyHeal(0, 100, 1, down).down;
    const standing = run(healed, 0, 5.05);
    expect(standing.hp).toBe(100);
    expect(standing.down.pendingHeal).toBe(0);
  });

  it('applyHeal mort : rien', () => {
    expect(applyHeal(0, 100, 1, { state: 'mort' }).hp).toBe(0);
  });
});

describe('player-down.js : knockbackZombies', () => {
  const params = { radius: 220, distance: 160 };
  const room = { bounds: layout.bounds, furniture: layout.furniture, walls: layout.walls, gaps: layout.gaps };
  const center = { x: 1800, y: 1400 };
  const z = (id, x, y, extra = {}) => ({ id, x, y, r: 20, mode: 'dedans', ...extra });
  const away = (a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y);

  it('un zombie proche est repoussé le long de la direction qui l\'éloigne, de la distance demandée', () => {
    const out = knockbackZombies([z(1, 1900, 1400)], center, params, room)[0];
    expect(out.x).toBeCloseTo(2060, 6);
    expect(out.y).toBeCloseTo(1400, 6);
  });

  it('direction oblique : la distance parcourue est celle demandée', () => {
    const out = knockbackZombies([z(1, 1860, 1460)], center, params, room)[0];
    expect(Math.hypot(out.x - 1860, out.y - 1460)).toBeCloseTo(160, 5);
    expect((out.x - 1860) / (out.y - 1460)).toBeCloseTo(1, 6);
  });

  it('un zombie hors du rayon ne bouge pas', () => {
    const far = z(1, 2100, 1400);
    expect(knockbackZombies([far], center, params, room)[0]).toEqual(far);
  });

  it('les zombies libres sont repoussés comme ceux qui sont dedans', () => {
    expect(knockbackZombies([z(1, 1900, 1400, { mode: 'libre' })], center, params, room)[0].x).toBeGreaterThan(2000);
  });

  it.each(['arrache', 'attente', 'escalade', 'approche'])('un zombie en mode %s n\'est pas déplacé', (mode) => {
    const e = z(1, 1900, 1400, { mode });
    expect(knockbackZombies([e], center, params, room)[0]).toEqual(e);
  });

  it('un zombie hors de la salle n\'est pas déplacé', () => {
    const e = z(1, 700, 1400, { mode: 'libre' });
    expect(knockbackZombies([e], { x: 760, y: 1400 }, params, room)[0]).toEqual(e);
  });

  it('s\'arrête contre un mur : jamais hors de la salle', () => {
    const out = knockbackZombies([z(1, 2700, 1100)], { x: 2600, y: 1100 }, params, room)[0];
    expect(out.x).toBeLessThanOrEqual(layout.bounds.maxX - 20 + 1e-6);
    expect(out.x).toBeGreaterThan(2700);
  });

  it('s\'arrête contre un meuble (table-3 : 2400..2500 × 1300..1500)', () => {
    const out = knockbackZombies([z(1, 2300, 1400)], { x: 2200, y: 1400 }, params, room)[0];
    expect(out.x).toBeLessThanOrEqual(2400 - 20 + 1e-6);
    expect(out.x).toBeGreaterThan(2300);
  });

  it('les fenêtres comptent comme des murs, même ouvertes : le zombie n\'est jamais expulsé par la fenêtre nord', () => {
    const out = knockbackZombies([z(1, 1800, 900)], { x: 1800, y: 1000 }, { radius: 220, distance: 300 }, room)[0];
    expect(out.y).toBeGreaterThanOrEqual(layout.bounds.minY + 20 - 1e-6);
  });

  it('plusieurs zombies, positions superposées au centre : directions fixes et déterministes', () => {
    const list = [z(2, 1800, 1400), z(3, 1800, 1400)];
    const a = knockbackZombies(list, center, params, room);
    expect(a[0].x).toBeGreaterThan(1800);
    expect(a[1].x).toBeLessThan(1800);
    expect(knockbackZombies(list, center, params, room)).toEqual(a);
  });

  it('chaque zombie s\'éloigne du joueur', () => {
    const list = [z(1, 1900, 1400), z(2, 1700, 1450), z(3, 1800, 1500)];
    const out = knockbackZombies(list, center, params, room);
    out.forEach((o, i) => expect(away(o, list[i])).toBeGreaterThan(0));
  });

  it('aucune exception sur des entrées hostiles, arguments gelés non modifiés', () => {
    for (const a of WEIRD) for (const b of WEIRD) expect(() => knockbackZombies(a, b, a, b)).not.toThrow();
    const frozen = deepFreeze([z(1, 1900, 1400)]);
    expect(() => knockbackZombies(frozen, center, deepFreeze({ ...params }), deepFreeze({ ...room }))).not.toThrow();
    expect(frozen[0].x).toBe(1900);
  });
});

describe('player-down.js : entrées hostiles, arguments gelés, déterminisme', () => {
  it('aucune exception, état toujours valide', () => {
    for (const a of WEIRD) {
      for (const b of WEIRD) {
        expect(() => stepPlayerDown(a, b, a, b)).not.toThrow();
        expect(() => createPlayerDown(a)).not.toThrow();
        expect(() => isInvulnerable(a)).not.toThrow();
        expect(() => applyHeal(a, b, a, b)).not.toThrow();
        expect(['debout', 'terre', 'mort']).toContain(stepPlayerDown(a, b, 0.05, b).down.state);
      }
    }
  });

  it('arguments gelés non modifiés', () => {
    const d = deepFreeze(createPlayerDown(1));
    const v = deepFreeze(vit(0));
    const p = deepFreeze({ ...cfg });
    expect(() => stepPlayerDown(d, v, 0.05, p)).not.toThrow();
    expect(d.state).toBe('debout');
  });

  it('mêmes entrées, mêmes sorties', () => {
    expect(run(createPlayerDown(2), 0, 6)).toEqual(run(createPlayerDown(2), 0, 6));
  });

  it('les chutes viennent de la statistique : 1 + niveau, plafond du niveau 5', () => {
    const falls = (lvl) => effectivePlayer(playerCfg, { chutes: lvl }, stats).maxFalls;
    expect([0, 1, 2, 5].map(falls)).toEqual([1, 2, 3, 6]);
    expect(cfg.chutesBase).toBe(stats.extra.chutes.base);
  });
});
