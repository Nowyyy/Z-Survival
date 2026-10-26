import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLayout } from '../../js/core/layout.js';
import { createDirector, direct, materialFor, soundTable } from '../../js/core/sound-director.js';

const read = (f) => JSON.parse(readFileSync(`data/game/${f}.json`, 'utf8'));
const audio = read('audio');
const materials = read('sound-materials');
const cfg = { audio, materials, sounds: soundTable(read('sounds').sounds) };
const layout = buildLayout(read('world'), read('decor'), {});
const LISTENER = { x: 800, y: 600 };
const frame = (events, extra = {}) => ({ time: 10, listener: LISTENER, walls: [], paused: false, events, ...extra });
const run = (events, extra, state = createDirector(1)) => direct(state, frame(events, extra), cfg);
const names = (r) => r.requests.map((q) => q.sound);

describe('sound-director.js : tir et douille', () => {
  it('un tir demande le son de tir au départ de la balle (sans aucune blessure de zombie)', () => {
    const r = run([{ type: 'shot', x: LISTENER.x + 26, y: LISTENER.y }]);
    expect(names(r)).toContain('tir');
    expect(names(r)).not.toContain('zombie-blessure');
    const tir = r.requests.find((q) => q.sound === 'tir');
    expect(tir.delay).toBe(0);
    expect(tir.gain).toBe(1);
    expect(tir.lowpass).toBe(false);
  });
  it('la douille tombe 0,25 à 0,4 s après un tir lent', () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const r = run([{ type: 'shot', x: 826, y: 600 }], {}, createDirector(seed));
      const douille = r.requests.find((q) => q.sound === 'douille');
      expect(douille).toBeDefined();
      expect(douille.delay).toBeGreaterThanOrEqual(0.25);
      expect(douille.delay).toBeLessThanOrEqual(0.4);
    }
  });
  it('pas de douille à 3 tirs par seconde ou plus ; la douille revient quand la cadence ralentit', () => {
    let s = run([{ type: 'shot', x: 826, y: 600 }], { time: 10 }).state;
    const fast = direct(s, frame([{ type: 'shot', x: 826, y: 600 }], { time: 10.1 }), cfg); // 10 tirs/s
    expect(names(fast)).toEqual(['tir']);
    s = fast.state;
    const slow = direct(s, frame([{ type: 'shot', x: 826, y: 600 }], { time: 10.6 }), cfg); // 2 tirs/s
    expect(names(slow)).toContain('douille');
    const edge = direct(slow.state, frame([{ type: 'shot', x: 826, y: 600 }], { time: 10.6 + 1 / 3 - 0.001 }), cfg); // juste au-dessus de 3 tirs/s
    expect(names(edge)).not.toContain('douille');
  });
  it('le pistolet (un tir toutes les 0,4 s) fait toujours tomber une douille', () => {
    let s = createDirector(2);
    let casings = 0;
    for (let i = 0; i < 10; i += 1) {
      const r = direct(s, frame([{ type: 'shot', x: 826, y: 600 }], { time: 10 + i * 0.4 }), cfg);
      s = r.state;
      casings += names(r).filter((n) => n === 'douille').length;
    }
    expect(casings).toBe(10);
  });
  it('la variante de tir change à chaque tir', () => {
    let s = createDirector(5);
    let last = null;
    for (let i = 0; i < 40; i += 1) {
      const r = direct(s, frame([{ type: 'shot', x: 826, y: 600 }], { time: 10 + i * 0.4 }), cfg);
      s = r.state;
      const v = r.requests.find((q) => q.sound === 'tir').variant;
      expect(v).not.toBe(last);
      last = v;
    }
  });
});

describe('sound-director.js : impacts', () => {
  const hit = (extra) => run([{ type: 'zombieHit', x: 900, y: 600, killed: false, zombie: 'marcheur', ...extra }]);
  it('un zombie touché : choc sur le corps et blessure, à l\'impact', () => {
    expect(names(hit({}))).toEqual(['impact-zombie', 'zombie-blessure']);
  });
  it('un zombie tué : choc et mort, pas de blessure', () => {
    expect(names(hit({ killed: true }))).toEqual(['impact-zombie', 'zombie-mort']);
  });
  it('la hauteur de la voix suit la variante du zombie (table de audio.json)', () => {
    for (const [name, rate] of Object.entries(audio.zombieRate)) {
      const voice = hit({ zombie: name }).requests.find((q) => q.sound === 'zombie-blessure');
      expect(voice.rate).toBe(rate);
    }
    expect(hit({ zombie: 'inconnu' }).requests[1].rate).toBe(1);
  });
  it('une balle sur un obstacle joue la matière de son type', () => {
    const expected = { table: 'impact-bois', comptoir: 'impact-bois', caisse: 'impact-bois', armoire: 'impact-bois', etagere: 'impact-metal', colonne: 'impact-pierre', voiture: 'impact-voiture', arbre: 'impact-bois' };
    for (const [kind, sound] of Object.entries(expected)) expect(names(run([{ type: 'obstacleHit', x: 900, y: 600, kind }])), kind).toEqual([sound]);
  });
  it('un mur donne la pierre ; un type inconnu la matière par défaut', () => {
    expect(names(run([{ type: 'obstacleHit', x: 900, y: 600, obstacleId: 'mur-nord-1' }]))).toEqual(['impact-pierre']);
    expect(materialFor('table', 'x', materials)).toBe('bois');
    expect(materialFor('inconnu', 'zzz', materials)).toBe(materials.default);
    expect(materialFor(undefined, 'mur-est-2', materials)).toBe(materials.wallMaterial);
  });
  it('un impact trop lointain (au-delà de la distance maximale) ne fait aucun bruit', () => {
    expect(run([{ type: 'zombieHit', x: 800 + 2000, y: 600, killed: false, zombie: 'marcheur' }]).requests).toEqual([]);
  });
  it('le gain baisse avec la distance et la balance suit le côté', () => {
    const near = run([{ type: 'obstacleHit', x: 900, y: 600, kind: 'table' }]).requests[0];
    const far = run([{ type: 'obstacleHit', x: 1500, y: 600, kind: 'table' }]).requests[0];
    const left = run([{ type: 'obstacleHit', x: 500, y: 600, kind: 'table' }]).requests[0];
    expect(far.gain).toBeLessThan(near.gain);
    expect(near.pan).toBeGreaterThan(0);
    expect(left.pan).toBeLessThan(0);
  });
});

describe('sound-director.js : étouffement par les murs', () => {
  const win = layout.windows.find((w) => w.side === 'nord');
  const inside = { x: win.x, y: win.y + 300 };
  const at = (x, y) => run([{ type: 'zombieHit', x, y, killed: false, zombie: 'marcheur' }], { listener: inside, walls: layout.walls });
  it('un zombie à l\'extérieur derrière un mur est étouffé', () => {
    const r = at(win.x + 400, win.y - 250).requests;
    expect(r.length).toBeGreaterThan(0);
    for (const q of r) {
      expect(q.lowpass).toBe(true);
    }
  });
  it('le même zombie dans l\'axe d\'une fenêtre n\'est pas étouffé', () => {
    for (const q of at(win.x, win.y - 250).requests) expect(q.lowpass).toBe(false);
  });
  it('l\'étouffement baisse aussi le gain', () => {
    const muffled = at(win.x + 300, win.y - 250);
    const clear = at(win.x, win.y - 250);
    expect(muffled.requests[0].gain / clear.requests[0].gain).toBeLessThan(0.7);
  });
  it('le tir du joueur n\'est jamais étouffé', () => {
    for (const q of run([{ type: 'shot', x: inside.x, y: inside.y - 26 }], { listener: inside, walls: layout.walls }).requests) expect(q.lowpass).toBe(false);
  });
});

describe('sound-director.js : joueur, pas, interface et pause', () => {
  it('joueur blessé, mort et pas', () => {
    expect(names(run([{ type: 'playerHurt' }]))).toEqual(['joueur-blesse']);
    expect(names(run([{ type: 'playerDeath' }]))).toEqual(['joueur-mort']);
    const step = run([{ type: 'playerStep', volume: 0.6, foot: 'droit' }]).requests[0];
    expect(step.sound).toBe('pas');
    expect(step.gain).toBeCloseTo(0.6, 6);
    expect(step.pan).toBeGreaterThan(0);
  });
  it('pause et reprise : sons d\'interface', () => {
    expect(names(run([{ type: 'pause' }]))).toEqual(['ui-pause']);
    expect(names(run([{ type: 'resume' }]))).toEqual(['ui-reprise']);
  });
  it('pendant la pause, aucun événement de jeu ne produit de demande', () => {
    const events = [{ type: 'shot', x: 826, y: 600 }, { type: 'zombieHit', x: 900, y: 600, killed: true, zombie: 'petit' }, { type: 'playerHurt' }, { type: 'playerStep', volume: 1, foot: 'gauche' }, { type: 'obstacleHit', x: 900, y: 600, kind: 'table' }];
    expect(run(events, { paused: true }).requests).toEqual([]);
  });
  it('une rafale de 100 événements ne dépasse jamais 16 voix', () => {
    const events = Array.from({ length: 100 }, (_, i) => ({ type: 'obstacleHit', x: 900 + i, y: 600, kind: 'caisse' }));
    expect(run(events).requests.length).toBeLessThanOrEqual(16);
  });
  it('le délai minimal par son est respecté (blessure de zombie : 60 ms)', () => {
    const hurt = (time) => ({ type: 'zombieHit', x: 900, y: 600, killed: false, zombie: 'marcheur', time });
    let s = direct(createDirector(1), frame([hurt()], { time: 5 }), cfg);
    expect(names(s)).toContain('zombie-blessure');
    s = direct(s.state, frame([hurt()], { time: 5.03 }), cfg);
    expect(names(s)).not.toContain('zombie-blessure');
    s = direct(s.state, frame([hurt()], { time: 5.2 }), cfg);
    expect(names(s)).toContain('zombie-blessure');
  });
});

describe('sound-director.js : pureté et robustesse', () => {
  const events = [{ type: 'shot', x: 826, y: 600 }, { type: 'zombieHit', x: 900, y: 600, killed: true, zombie: 'grand' }, { type: 'obstacleHit', x: 950, y: 620, kind: 'etagere' }];
  it('déterministe : mêmes entrées, mêmes demandes et même état', () => {
    expect(run(events, {}, createDirector(7))).toEqual(run(events, {}, createDirector(7)));
    expect(run(events, {}, createDirector(7)).requests).not.toEqual(run(events, {}, createDirector(8)).requests);
  });
  it('ne modifie pas ses arguments, même gelés', () => {
    const deep = (o) => {
      if (o && typeof o === 'object') {
        Object.freeze(o);
        for (const v of Object.values(o)) deep(v);
      }
      return o;
    };
    const state = deep(createDirector(3));
    const f = deep(structuredClone(frame(events, { walls: layout.walls })));
    const c = deep(structuredClone(cfg));
    const before = JSON.stringify([state, f, c]);
    expect(() => direct(state, f, c)).not.toThrow();
    expect(JSON.stringify([state, f, c])).toBe(before);
  });
  it('chaque demande a les champs attendus, bien formés', () => {
    for (const q of run(events).requests) {
      expect(typeof q.sound).toBe('string');
      expect(Number.isInteger(q.variant) && q.variant >= 0).toBe(true);
      for (const key of ['gain', 'pan', 'delay', 'rate']) expect(Number.isFinite(q[key]), key).toBe(true);
      expect(typeof q.lowpass).toBe('boolean');
      expect(q.gain).toBeGreaterThan(0);
      expect(Math.abs(q.pan)).toBeLessThanOrEqual(1);
    }
  });
  it('les variantes demandées existent', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      for (const q of run(events, {}, createDirector(seed)).requests) expect(q.variant).toBeLessThan(cfg.sounds[q.sound].variants);
    }
  });
  it('entrées hostiles : aucune exception, aucune demande', () => {
    for (const bad of [null, undefined, NaN, 'x', 5, {}, []]) {
      expect(() => direct(bad, bad, bad)).not.toThrow();
      expect(direct(bad, bad, bad).requests).toEqual([]);
      expect(() => direct(createDirector(1), { events: [bad, { type: 5 }, { type: 'inconnu' }, { type: 'shot', x: NaN, y: 'a' }] }, cfg)).not.toThrow();
    }
  });
});
