import { describe, it, expect } from 'vitest';
import { arrivalKnockback, createStairWatch, portalsFor, stairArrival, stairHit, stairParams, stairSolid, STAIR_DEFAULTS, stairState, stairTriggers, startStairCooldown, stepStairWatch } from '../../js/core/stairs.js';
import { centerOf, stairsCfg, zonesActive, zonesPlanned } from './helpers/etage.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const stairs = zonesActive.stairs; // portes 2 et 3 actives (le jeu les active aux parties B et C)
const plannedStairs = zonesPlanned.stairs;
const AILE = stairs.find((s) => s.id === 'escalier-aile');
const DEPART = stairs.find((s) => s.id === 'escalier-depart');
const inside = (t) => ({ x: t.cx, y: t.cy, r: 18 });

describe('stairs.js : escaliers utilisables (stairState)', () => {
  it('aucun escalier n\'est utilisable tant que sa porte est fermée', () => {
    expect(stairState(stairs, []).map((s) => s.usable)).toEqual([false, false]);
    expect(stairState(stairs, ['porte-1']).map((s) => s.usable)).toEqual([false, false]);
  });

  it('la porte 2 rend l\'escalier de l\'aile utilisable, la porte 3 celui de la salle de départ', () => {
    expect(stairState(stairs, ['porte-2']).map((s) => [s.id, s.usable])).toEqual([['escalier-aile', true], ['escalier-depart', false]]);
    expect(stairState(stairs, ['porte-3']).map((s) => [s.id, s.usable])).toEqual([['escalier-aile', false], ['escalier-depart', true]]);
    expect(stairState(stairs, ['porte-1', 'porte-2', 'porte-3']).every((s) => s.usable)).toBe(true);
  });

  it('un escalier dont la porte est « planned » n\'est jamais utilisable, même si la porte est dite ouverte', () => {
    expect(plannedStairs.every((s) => s.planned)).toBe(true);
    expect(stairState(plannedStairs, ['porte-2', 'porte-3']).every((s) => !s.usable && s.planned)).toBe(true);
  });

  it('chaque escalier garde l\'identifiant de sa porte', () => {
    expect(stairState(stairs, []).map((s) => [s.id, s.door])).toEqual([['escalier-aile', 'porte-2'], ['escalier-depart', 'porte-3']]);
  });

  it('des identifiants de portes en liste, en Set, ou invalides', () => {
    expect(stairState(stairs, new Set(['porte-2'])).map((s) => s.usable)).toEqual([true, false]);
    expect(stairState(stairs, 'porte-2').map((s) => s.usable)).toEqual([false, false]);
    expect(stairState(stairs, [2, null, 'porte-3']).map((s) => s.usable)).toEqual([false, true]);
  });

  it.each(WEIRD)('entrée hostile %p : liste vide, jamais d\'exception', (bad) => {
    expect(() => stairState(bad, bad)).not.toThrow();
    expect(() => stairTriggers(bad, bad, bad)).not.toThrow();
    expect(() => portalsFor(bad, bad, bad)).not.toThrow();
    expect(() => stairHit(bad, bad)).not.toThrow();
    expect(() => stairArrival(bad, bad)).not.toThrow();
    expect(() => stairSolid(bad, bad)).not.toThrow();
    expect(() => stepStairWatch(bad, bad, bad, bad)).not.toThrow();
  });
});

describe('stairs.js : zones de déclenchement (stairTriggers, stairHit)', () => {
  it('seuls les escaliers utilisables ont une zone de déclenchement, à l\'étage demandé', () => {
    expect(stairTriggers(stairs, 'rdc', [])).toEqual([]);
    expect(stairTriggers(stairs, 'rdc', ['porte-2']).map((t) => t.stair)).toEqual(['escalier-aile']);
    expect(stairTriggers(stairs, 'etage', ['porte-2', 'porte-3']).map((t) => [t.stair, t.floor])).toEqual([['escalier-aile', 'etage'], ['escalier-depart', 'etage']]);
  });

  it('un étage inconnu donne le rez-de-chaussée', () => {
    expect(stairTriggers(stairs, 'cave', ['porte-2'])[0]).toMatchObject({ stair: 'escalier-aile', floor: 'rdc' });
  });

  it('chaque zone est un rectangle d\'au moins 64 × 64 unités, avec son centre', () => {
    for (const t of stairTriggers(stairs, 'rdc', ['porte-2', 'porte-3']).concat(stairTriggers(stairs, 'etage', ['porte-2', 'porte-3']))) {
      expect(t.w, `${t.stair} ${t.floor}`).toBeGreaterThanOrEqual(stairsCfg.triggerMin);
      expect(t.h, `${t.stair} ${t.floor}`).toBeGreaterThanOrEqual(stairsCfg.triggerMin);
      expect(t.cx).toBe(t.x + t.w / 2);
      expect(t.cy).toBe(t.y + t.h / 2);
    }
  });

  it('stairHit : le centre du joueur dans la zone déclenche, à côté non', () => {
    const [t] = stairTriggers(stairs, 'rdc', ['porte-2']);
    expect(stairHit(inside(t), [t])).toBe(t);
    expect(stairHit({ x: t.x + t.w + 1, y: t.cy }, [t])).toBeNull();
    expect(stairHit({ x: t.cx, y: t.y - 1 }, [t])).toBeNull();
    expect(stairHit({ x: t.x, y: t.y }, [t])).toBe(t);
  });

  it('stairHit choisit la zone dont le centre est le plus proche quand deux se recouvrent', () => {
    const a = { stair: 'a', x: 0, y: 0, w: 100, h: 100, cx: 50, cy: 50 };
    const b = { stair: 'b', x: 40, y: 0, w: 100, h: 100, cx: 90, cy: 50 };
    expect(stairHit({ x: 60, y: 50 }, [a, b]).stair).toBe('a');
    expect(stairHit({ x: 80, y: 50 }, [a, b]).stair).toBe('b');
  });

  it('un escalier fermé n\'est pas déclenchable : aucune zone, donc aucun déclenchement', () => {
    const t = stairTriggers(stairs, 'rdc', ['porte-2'])[0];
    const closed = stairTriggers(stairs, 'rdc', []);
    expect(stairHit(inside(t), closed)).toBeNull();
    expect(stepStairWatch(createStairWatch(), 0.05, inside(t), closed).trigger).toBeNull();
  });
});

describe('stairs.js : arrivée et emprise', () => {
  it('stairArrival donne le point de l\'étage d\'arrivée, jamais celui de l\'étage de départ par erreur', () => {
    expect(stairArrival(AILE, 'etage')).toEqual(AILE.floors.etage.arrival);
    expect(stairArrival(AILE, 'rdc')).toEqual(AILE.floors.rdc.arrival);
    expect(stairArrival(AILE, 'etage')).not.toEqual(stairArrival(AILE, 'rdc'));
    expect(stairArrival(AILE, 'cave')).toBeNull();
    expect(stairArrival(null, 'rdc')).toBeNull();
  });

  it('stairSolid donne l\'emprise pleine de l\'étage', () => {
    expect(stairSolid(DEPART, 'rdc')).toEqual(DEPART.floors.rdc.solid);
    expect(stairSolid(DEPART, 'etage')).toEqual(DEPART.floors.etage.solid);
    expect(stairSolid(DEPART, 'cave')).toBeNull();
  });

  it('chaque arrivée est à 60 unités au moins de la zone de déclenchement de son étage', () => {
    for (const s of stairs) {
      for (const f of ['rdc', 'etage']) {
        const t = s.floors[f].trigger;
        const a = s.floors[f].arrival;
        const dx = Math.max(t.x - a.x, 0, a.x - (t.x + t.w));
        const dy = Math.max(t.y - a.y, 0, a.y - (t.y + t.h));
        expect(Math.hypot(dx, dy), `${s.id} ${f}`).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('arrivalKnockback : zone de repoussement de 60 et de 80 autour du point d\'arrivée', () => {
    expect(arrivalKnockback({ x: 10, y: 20 }, stairsCfg)).toEqual({ center: { x: 10, y: 20 }, radius: 60, distance: 80 });
    expect(arrivalKnockback(null, null).radius).toBe(STAIR_DEFAULTS.arrivalPushRadius);
  });
});

describe('stairs.js : points de passage des zombies (portalsFor)', () => {
  it('un point de passage par escalier utilisable de l\'étage, avec l\'étage d\'arrivée et le point d\'arrivée', () => {
    const [p] = portalsFor(stairs, 'rdc', ['porte-2']);
    expect(p).toMatchObject({ stair: 'escalier-aile', from: 'rdc', to: 'etage', door: 'porte-2' });
    expect(p.arrival).toEqual(AILE.floors.etage.arrival);
    expect(p.x).toBe(centerOf(AILE.floors.rdc.trigger).x);
    expect(p.y).toBe(centerOf(AILE.floors.rdc.trigger).y);
  });

  it('de l\'étage, on descend vers le rez-de-chaussée', () => {
    const list = portalsFor(stairs, 'etage', ['porte-2', 'porte-3']);
    expect(list.map((p) => [p.stair, p.from, p.to])).toEqual([['escalier-aile', 'etage', 'rdc'], ['escalier-depart', 'etage', 'rdc']]);
    expect(list[1].arrival).toEqual(DEPART.floors.rdc.arrival);
  });

  it('aucun point de passage quand aucun escalier n\'est utilisable', () => {
    expect(portalsFor(stairs, 'rdc', [])).toEqual([]);
    expect(portalsFor(plannedStairs, 'rdc', ['porte-2'])).toEqual([]);
  });
});

describe('stairs.js : mécanisme de délai (0,8 s dans ces tests, 0 dans le jeu) et absence de rebond (stepStairWatch)', () => {
  const cfg08 = { ...stairsCfg, stairCooldownPlayer: 0.8 };
  const [trig] = stairTriggers(stairs, 'rdc', ['porte-2']);
  const out = { x: trig.x - 200, y: trig.cy, r: 18 };

  it('entrer dans la zone déclenche immédiatement (délai écoulé)', () => {
    const r = stepStairWatch(createStairWatch(), 0.05, inside(trig), [trig]);
    expect(r.trigger).toBe(trig);
    expect(r.watch.lock).toBe('escalier-aile');
  });

  it('après un changement d\'étage, le délai de 0,8 s démarre et se vide avec le temps de jeu', () => {
    let w = startStairCooldown(createStairWatch(), 'escalier-aile', cfg08);
    expect(w.cooldown).toBeCloseTo(0.8, 9);
    for (let i = 0; i < 16; i += 1) w = stepStairWatch(w, 0.05, out, [trig]).watch;
    expect(w.cooldown).toBe(0);
  });

  it('pendant le délai, même hors du verrou, rien ne se déclenche', () => {
    let w = startStairCooldown(createStairWatch(), 'escalier-depart', cfg08);
    w = stepStairWatch(w, 0.05, out, [trig]).watch; // verrou d'un autre escalier levé, délai en cours
    const r = stepStairWatch(w, 0.05, inside(trig), [trig]);
    expect(w.cooldown).toBeGreaterThan(0);
    expect(r.trigger).toBeNull();
  });

  it('aucun rebond : rester dans la zone après un changement d\'étage ne redéclenche pas, même délai écoulé', () => {
    let w = stepStairWatch(createStairWatch(), 0.05, inside(trig), [trig]).watch;
    w = startStairCooldown(w, 'escalier-aile', cfg08);
    for (let i = 0; i < 60; i += 1) {
      const r = stepStairWatch(w, 0.05, inside(trig), [trig]);
      expect(r.trigger).toBeNull();
      w = r.watch;
    }
    expect(w.cooldown).toBe(0);
    expect(w.lock).toBe('escalier-aile');
  });

  it('on redéclenche après être sorti de la zone puis y être revenu (délai écoulé)', () => {
    let w = startStairCooldown(stepStairWatch(createStairWatch(), 0.05, inside(trig), [trig]).watch, 'escalier-aile', cfg08);
    for (let i = 0; i < 20; i += 1) w = stepStairWatch(w, 0.05, inside(trig), [trig]).watch;
    w = stepStairWatch(w, 0.05, out, [trig]).watch;
    expect(w.lock).toBeNull();
    expect(stepStairWatch(w, 0.05, inside(trig), [trig]).trigger).toBe(trig);
  });

  it('sortir de la zone avant la fin du délai ne permet pas de redéclencher avant sa fin', () => {
    let w = startStairCooldown(createStairWatch(), 'escalier-aile', cfg08);
    w = stepStairWatch(w, 0.05, out, [trig]).watch;
    expect(stepStairWatch(w, 0.05, inside(trig), [trig]).trigger).toBeNull();
  });

  it('dt à 0 (pause) : le délai ne baisse pas', () => {
    const w = startStairCooldown(createStairWatch(), 'escalier-aile', cfg08);
    expect(stepStairWatch(w, 0, out, [trig]).watch.cooldown).toBe(w.cooldown);
    expect(stepStairWatch(w, -5, out, [trig]).watch.cooldown).toBe(w.cooldown);
  });

  it('dt énorme : borné à 0,05 s', () => {
    const w = startStairCooldown(createStairWatch(), 'escalier-aile', cfg08);
    expect(stepStairWatch(w, 1e9, out, [trig]).watch.cooldown).toBeCloseTo(0.75, 9);
  });

  it('déterministe', () => {
    const w = startStairCooldown(createStairWatch(), 'escalier-aile', cfg08);
    expect(stepStairWatch(w, 0.05, inside(trig), [trig])).toEqual(stepStairWatch(w, 0.05, inside(trig), [trig]));
  });
});

describe('stairs.js : paramètres et arguments gelés', () => {
  it('stairParams : les valeurs de data/game/stairs.json sont celles des valeurs de repli', () => {
    const { _provisoire, ...file } = stairsCfg;
    expect(_provisoire).toMatch(/provisoire/);
    expect(stairParams(file)).toEqual(STAIR_DEFAULTS);
    expect(file).toEqual(STAIR_DEFAULTS);
  });

  it('stairParams : une valeur invalide prend la valeur de repli', () => {
    expect(stairParams({ stairTime: -1, fadeOut: 'x', stairCooldownPlayer: null })).toEqual(STAIR_DEFAULTS);
    expect(stairParams(null)).toEqual(STAIR_DEFAULTS);
    expect(stairParams({ stairTime: 2 }).stairTime).toBe(2);
  });

  it('le temps de franchissement est 1,5 s, aucun délai du joueur (0), protection 1,0 s, repoussement 80 dans 60', () => {
    expect([stairsCfg.stairTime, stairsCfg.stairCooldownPlayer, stairsCfg.stairGraceAfter, stairsCfg.arrivalPush, stairsCfg.arrivalPushRadius, stairsCfg.triggerMin]).toEqual([1.5, 0, 1.0, 80, 60, 64]);
  });

  it('aucune fonction ne modifie ses arguments gelés', () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(stairs)));
    const opens = deepFreeze(['porte-2', 'porte-3']);
    const triggers = stairTriggers(frozen, 'rdc', opens);
    expect(() => {
      stairState(frozen, opens);
      portalsFor(frozen, 'etage', opens);
      stairHit(deepFreeze({ x: 1, y: 2 }), deepFreeze(triggers));
      stepStairWatch(deepFreeze(createStairWatch()), 0.05, deepFreeze({ x: 1, y: 2 }), deepFreeze(triggers));
      startStairCooldown(deepFreeze(createStairWatch()), 'x', deepFreeze(stairsCfg));
    }).not.toThrow();
  });

  it('les fonctions renvoient de nouveaux objets', () => {
    const [t] = stairTriggers(stairs, 'rdc', ['porte-2']);
    const w = createStairWatch();
    expect(stepStairWatch(w, 0.05, inside(t), [t]).watch).not.toBe(w);
    expect(stairArrival(AILE, 'etage')).not.toBe(AILE.floors.etage.arrival);
    expect(stairSolid(AILE, 'rdc')).not.toBe(AILE.floors.rdc.solid);
  });
});
