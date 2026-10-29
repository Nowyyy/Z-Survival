import { describe, it, expect } from 'vitest';
import { cancelTransition, createTransition, startTransition, stepTransition, transitionDuration, transitionView } from '../../js/core/floor-transition.js';
import { stairsCfg } from './helpers/etage.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const OPT = { fadeOut: stairsCfg.fadeOut, fadeIn: stairsCfg.fadeIn, fadeLockReduced: stairsCfg.fadeLockReduced };
const RED = { ...OPT, reduced: true };

// Joue une transition jusqu'à son terme ; renvoie les vues image par image.
function play(options = OPT, dt = 0.05, max = 200) {
  let s = startTransition(createTransition(), 'rdc', 'etage', 'escalier-aile', options);
  const views = [];
  for (let i = 0; i < max && s.phase !== 'idle'; i += 1) {
    const r = stepTransition(s, dt, options);
    s = r.state;
    views.push(r.view);
  }
  return { views, state: s };
}

describe('floor-transition.js : machine à états', () => {
  it('au repos : voile 0, pas de verrou, pas d\'échange', () => {
    const r = stepTransition(createTransition(), 0.05, OPT);
    expect(r.view).toMatchObject({ veil: 0, locked: false, swap: false, phase: 'idle' });
    expect(r.state.phase).toBe('idle');
  });

  it('startTransition passe en « out » avec le départ, l\'arrivée et l\'escalier', () => {
    expect(startTransition(createTransition(), 'rdc', 'etage', 'escalier-aile', OPT)).toMatchObject({ phase: 'out', from: 'rdc', to: 'etage', stair: 'escalier-aile', t: 0, swapped: false });
  });

  it('départ et arrivée identiques ou inconnus : rien ne démarre', () => {
    for (const [a, b] of [['rdc', 'rdc'], ['rdc', 'cave'], [null, 'etage'], ['etage', undefined]]) expect(startTransition(createTransition(), a, b, 'x', OPT).phase).toBe('idle');
  });

  it('une transition en cours n\'est pas remplacée (le joueur est verrouillé)', () => {
    const s = startTransition(createTransition(), 'rdc', 'etage', 'a', OPT);
    expect(startTransition(s, 'etage', 'rdc', 'b', OPT)).toEqual(s);
  });

  it('swap est vrai exactement une fois par transition', () => {
    for (const dt of [0.05, 0.02, 0.0125, 0.033, 0.07]) expect(play(OPT, dt).views.filter((v) => v.swap)).toHaveLength(1);
  });

  it('le voile vaut 1 à l\'image de l\'échange', () => {
    for (const dt of [0.05, 0.02, 0.033]) expect(play(OPT, dt).views.find((v) => v.swap).veil).toBe(1);
  });

  it('le voile monte puis redescend de façon monotone par morceaux', () => {
    const v = play(OPT, 0.0125).views.map((q) => q.veil);
    const top = v.indexOf(1);
    for (let i = 1; i <= top; i += 1) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    for (let i = top + 1; i < v.length; i += 1) expect(v[i]).toBeLessThanOrEqual(v[i - 1]);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBe(1);
  });

  it('durée totale 0,5 s à 20 images par seconde (10 pas de 0,05 s)', () => {
    const { views, state } = play(OPT, 0.05);
    expect(views).toHaveLength(10);
    expect(state.phase).toBe('idle');
    expect(transitionDuration(OPT)).toBeCloseTo(0.5, 9);
  });

  it('la moitié de la montée à 0,125 s ; le voile est plein à 0,25 s ; la moitié de la descente à 0,375 s', () => {
    const v = play(OPT, 0.025).views;
    expect(v[4].veil).toBeCloseTo(0.5, 6);
    expect(v[9].veil).toBe(1);
    expect(v[14].veil).toBeCloseTo(0.5, 6);
    expect(v[19].veil).toBe(0);
  });

  it('le dernier pas ramène au repos : voile 0, verrou levé', () => {
    const last = play(OPT, 0.05).views.at(-1);
    expect(last).toMatchObject({ veil: 0, locked: false });
  });

  it('le verrou dure toute la transition', () => {
    const { views } = play(OPT, 0.05);
    expect(views.slice(0, -1).every((v) => v.locked)).toBe(true);
  });

  it('dt à 0 (pause) : la vue est figée, aucun échange', () => {
    let s = startTransition(createTransition(), 'rdc', 'etage', 'a', OPT);
    s = stepTransition(s, 0.1, OPT).state;
    const a = stepTransition(s, 0, OPT);
    const b = stepTransition(a.state, 0, OPT);
    expect(b.view).toEqual(a.view);
    expect(b.state).toEqual(a.state);
    expect(a.view.swap).toBe(false);
  });

  it('dt négatif ou énorme : jamais d\'exception, vue valide', () => {
    for (const dt of [-1, 1e9, Infinity, NaN, undefined, 'x']) {
      const r = stepTransition(startTransition(createTransition(), 'rdc', 'etage', 'a', OPT), dt, OPT);
      expect(r.view.veil).toBeGreaterThanOrEqual(0);
      expect(r.view.veil).toBeLessThanOrEqual(1);
    }
  });

  it('une transition interrompue (mort, Rejouer) retourne au repos sans échange', () => {
    let s = startTransition(createTransition(), 'rdc', 'etage', 'a', OPT);
    s = stepTransition(s, 0.1, OPT).state;
    const c = cancelTransition(s);
    expect(c.phase).toBe('idle');
    expect(stepTransition(c, 0.05, OPT).view).toMatchObject({ veil: 0, locked: false, swap: false });
  });

  it('une fois terminée, une nouvelle transition peut démarrer et échange à nouveau une fois', () => {
    let s = play(OPT).state;
    s = startTransition(s, 'etage', 'rdc', 'a', OPT);
    let swaps = 0;
    for (let i = 0; i < 40 && s.phase !== 'idle'; i += 1) {
      const r = stepTransition(s, 0.05, OPT);
      s = r.state;
      if (r.view.swap) swaps += 1;
    }
    expect(swaps).toBe(1);
  });

  it('la vue indique le départ, l\'arrivée et l\'escalier', () => {
    expect(play(OPT).views[0]).toMatchObject({ from: 'rdc', to: 'etage', stair: 'escalier-aile' });
  });

  it('transitionView lit l\'état sans l\'avancer', () => {
    const s = stepTransition(startTransition(createTransition(), 'rdc', 'etage', 'a', OPT), 0.1, OPT).state;
    expect(transitionView(s, OPT).veil).toBeCloseTo(0.2, 6);
    expect(transitionView(createTransition(), OPT).veil).toBe(0);
  });
});

describe('floor-transition.js : prefers-reduced-motion', () => {
  it('aucun voile, échange à la première image, verrou de 0,2 s', () => {
    const { views } = play(RED, 0.05);
    expect(views.every((v) => v.veil === 0)).toBe(true);
    expect(views[0].swap).toBe(true);
    expect(views.filter((v) => v.swap)).toHaveLength(1);
    expect(views).toHaveLength(4);
    expect(transitionDuration(RED)).toBeCloseTo(0.2, 9);
  });

  it('l\'échange a lieu même avec une première image de durée 0', () => {
    const s = startTransition(createTransition(), 'rdc', 'etage', 'a', RED);
    expect(stepTransition(s, 0, RED).view.swap).toBe(true);
  });

  it('le verrou est levé à la fin des 0,2 s', () => {
    const { views } = play(RED, 0.05);
    expect(views.slice(0, -1).every((v) => v.locked)).toBe(true);
    expect(views.at(-1).locked).toBe(false);
  });
});

describe('floor-transition.js : entrées hostiles, déterminisme, arguments gelés', () => {
  it.each(WEIRD)('état et options hostiles %p : jamais d\'exception', (bad) => {
    expect(() => stepTransition(bad, 0.05, bad)).not.toThrow();
    expect(() => startTransition(bad, bad, bad, bad, bad)).not.toThrow();
    expect(() => transitionView(bad, bad)).not.toThrow();
    expect(() => transitionDuration(bad)).not.toThrow();
    expect(stepTransition(bad, 0.05, bad).view.veil).toBe(0);
  });

  it('déterministe', () => {
    expect(play(OPT, 0.033)).toEqual(play(OPT, 0.033));
  });

  it('n\'altère pas un état ni des options gelés', () => {
    const s = deepFreeze(startTransition(createTransition(), 'rdc', 'etage', 'a', OPT));
    expect(() => stepTransition(s, 0.05, deepFreeze({ ...OPT }))).not.toThrow();
    expect(() => startTransition(deepFreeze(createTransition()), 'rdc', 'etage', 'a', deepFreeze({ ...OPT }))).not.toThrow();
  });

  it('les durées viennent de stairs.json : 0,25 + 0,25 s et 0,2 s', () => {
    expect([stairsCfg.fadeOut, stairsCfg.fadeIn, stairsCfg.fadeLockReduced]).toEqual([0.25, 0.25, 0.2]);
  });
});
