import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { soundTable } from '../../js/core/sound-director.js';
import { createVoicePlanner, planVoice } from '../../js/core/zombie-voice.js';

const read = (f) => JSON.parse(readFileSync(`data/game/${f}.json`, 'utf8'));
const voice = read('zombie-voice');
const audio = read('audio');
const names = read('zombie-variants').zombie.variants.map((v) => v.id);
const cfg = { voice, sounds: soundTable(read('sounds').sounds), rates: audio.zombieRate };
const PLAYER = { x: 1000, y: 1000 };
const ring = (n, dist = (i) => 150 + i * 110) => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: PLAYER.x + Math.cos(i) * dist(i), y: PLAYER.y + Math.sin(i) * dist(i), variant: names[i % names.length] }));

// Simule `seconds` secondes à 20 images par seconde ; renvoie les voix { time, ...voix }.
function simulate(seed, zombies, seconds = 600, dt = 0.05, extra = {}) {
  let state = createVoicePlanner(seed);
  const out = [];
  for (let step = 1; step * dt <= seconds + 1e-9; step += 1) {
    const time = step * dt;
    const r = planVoice(state, { time, player: PLAYER, zombies: typeof zombies === 'function' ? zombies(time) : zombies, ...extra }, cfg);
    state = r.state;
    if (r.voice) out.push({ time, ...r.voice });
  }
  return out;
}
const perMinute = (voices, seconds) => (voices.length / seconds) * 60;

describe('zombie-voice.js : cadence avec 8 zombies (simulations de 600 s)', () => {
  for (const seed of [1, 2, 3, 42, 777]) {
    it(`graine ${seed} : entre 8 et 20 voix par minute`, () => {
      const rate = perMinute(simulate(seed, ring(8)), 600);
      expect(rate).toBeGreaterThanOrEqual(16);
      expect(rate).toBeLessThanOrEqual(36);
    });
  }
  it('même tous proches ou tous lointains, la cadence reste raisonnable (16 à 36 par minute avec 8 zombies)', () => {
    for (const dist of [200, 1000]) {
      const rate = perMinute(simulate(6, ring(8, () => dist)), 600);
      expect(rate).toBeGreaterThanOrEqual(16);
      expect(rate).toBeLessThanOrEqual(36);
    }
  });
  it('jamais deux voix à moins de 1,2 s', () => {
    for (const seed of [1, 2, 3]) {
      const v = simulate(seed, ring(8));
      for (let i = 1; i < v.length; i += 1) expect(v[i].time - v[i - 1].time).toBeGreaterThanOrEqual(1.2 - 1e-9);
    }
  });
  it('un même zombie parle au plus une fois toutes les 6 s', () => {
    for (const seed of [1, 2, 3]) {
      const last = {};
      for (const v of simulate(seed, ring(8))) {
        if (last[v.id] !== undefined) expect(v.time - last[v.id]).toBeGreaterThanOrEqual(6 - 1e-9);
        last[v.id] = v.time;
      }
    }
  });
  it('jamais plus de 2 voix de zombie simultanées', () => {
    for (const seed of [1, 2, 3]) {
      const v = simulate(seed, ring(8));
      for (const a of v) expect(v.filter((b) => b.time <= a.time && b.time + b.duration > a.time).length).toBeLessThanOrEqual(3);
    }
  });
  it('plusieurs zombies différents parlent, avec plusieurs types de voix', () => {
    const v = simulate(5, ring(8));
    expect(new Set(v.map((x) => x.id)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(v.map((x) => x.sound)).size).toBeGreaterThanOrEqual(3);
    for (const x of v) expect(['zombie-gemissement', 'zombie-grognement', 'zombie-plainte', 'zombie-souffle']).toContain(x.sound);
  });
  it('les zombies proches parlent plus souvent que les lointains', () => {
    const v = simulate(9, ring(8, (i) => (i < 4 ? 200 : 900)));
    const near = v.filter((x) => x.distance < 300).length;
    expect(near).toBeGreaterThan(v.length - near);
  });
  it('les lointains restent audibles (ils parlent, jusqu\'à la portée)', () => {
    const v = simulate(9, ring(8, () => 1000));
    expect(v.length).toBeGreaterThan(20);
    for (const x of v) expect(x.distance).toBeLessThanOrEqual(voice.hearingRange);
  });
  it('fonctionne aussi avec des images de 1/60 s', () => {
    const rate = perMinute(simulate(4, ring(8), 600, 1 / 60), 600);
    expect(rate).toBeGreaterThanOrEqual(16);
    expect(rate).toBeLessThanOrEqual(36);
  });
});

describe('zombie-voice.js : cas limites', () => {
  it('aucun zombie hors de la portée d\'audition n\'est choisi', () => {
    const far = ring(8, () => voice.hearingRange + 50);
    expect(simulate(1, far, 300)).toEqual([]);
    const mixed = [...ring(4, () => 400), ...ring(4, () => 2000).map((z) => ({ ...z, id: z.id + 100 }))];
    for (const v of simulate(1, mixed, 300)) expect(v.id).toBeLessThan(100);
  });
  it('zéro zombie = aucune voix', () => {
    expect(simulate(1, [], 300)).toEqual([]);
  });
  it('un zombie seul : voix plus rares, mais présentes', () => {
    const solo = simulate(3, ring(1), 600);
    const crowd = simulate(3, ring(8), 600);
    expect(solo.length).toBeGreaterThan(5);
    expect(solo.length).toBeLessThan(crowd.length / 2);
  });
  it('reproductible : même graine = mêmes voix ; autre graine = autres voix', () => {
    expect(simulate(11, ring(8), 120)).toEqual(simulate(11, ring(8), 120));
    expect(simulate(11, ring(8), 120)).not.toEqual(simulate(12, ring(8), 120));
  });
  it('une voix déjà en cours ailleurs (busy) compte dans la limite de 3', () => {
    expect(simulate(1, ring(8), 120, 0.05, { busy: 3 })).toEqual([]);
  });
  it('un zombie qui s\'éloigne au-delà de la portée ne parle plus', () => {
    const v = simulate(2, (time) => [{ id: 1, x: PLAYER.x + 300 + time * 20, y: PLAYER.y, variant: 'marcheur' }], 600);
    for (const x of v) expect(x.distance).toBeLessThanOrEqual(1100);
    expect(v.at(-1).time).toBeLessThan(45);
  });
  it('un grand saut de temps (pause) n\'accumule pas de voix : dt est borné', () => {
    let state = createVoicePlanner(1);
    let r = planVoice(state, { time: 0, player: PLAYER, zombies: ring(8) }, cfg);
    state = r.state;
    r = planVoice(state, { time: 5000, player: PLAYER, zombies: ring(8) }, cfg);
    expect(r.state.time).toBe(5000);
    expect(r.voice === null || typeof r.voice.sound === 'string').toBe(true);
  });
  it('ne modifie pas ses arguments, même gelés', () => {
    const deep = (o) => {
      if (o && typeof o === 'object') {
        Object.freeze(o);
        for (const x of Object.values(o)) deep(x);
      }
      return o;
    };
    const state = deep(createVoicePlanner(3));
    const frame = deep({ time: 1, player: { ...PLAYER }, zombies: ring(8) });
    const frozenCfg = deep(structuredClone(cfg));
    const before = JSON.stringify([state, frame, frozenCfg]);
    expect(() => planVoice(state, frame, frozenCfg)).not.toThrow();
    expect(JSON.stringify([state, frame, frozenCfg])).toBe(before);
    expect(planVoice(state, frame, frozenCfg).state).not.toBe(state);
  });
  it('entrées hostiles : aucune exception, aucune voix', () => {
    for (const bad of [null, undefined, NaN, 'x', 5, {}, []]) {
      expect(() => planVoice(bad, bad, bad)).not.toThrow();
      expect(planVoice(bad, bad, bad).voice).toBeNull();
    }
    const hostileZombies = [null, { id: 1 }, { id: 2, x: NaN, y: 3 }, 'z', { id: 3, x: 'a', y: 1 }];
    expect(planVoice(createVoicePlanner(1), { time: 1, player: PLAYER, zombies: hostileZombies }, cfg).voice).toBeNull();
  });
});

describe('zombie-voice.js : hauteur par variante', () => {
  it('la hauteur de lecture de chaque variante est dans [0,8 ; 1,4]', () => {
    for (const name of names) {
      expect(audio.zombieRate[name]).toBeGreaterThanOrEqual(0.8);
      expect(audio.zombieRate[name]).toBeLessThanOrEqual(1.4);
    }
  });
  it('la durée d\'une voix tient compte de la hauteur de lecture (petit : plus court, grand : plus long)', () => {
    const one = (variant) => {
      for (let seed = 1; seed < 400; seed += 1) {
        const r = planVoice({ ...createVoicePlanner(seed), time: 0 }, { time: 0.25, player: PLAYER, zombies: [{ id: 1, x: 1100, y: 1000, variant }] }, { ...cfg, voice: { ...voice, ratePerZombie: 50, types: { gemissement: 1 } } });
        if (r.voice) return r.voice.duration;
      }
      return 0;
    };
    expect(one('petit')).toBeLessThan(one('marcheur'));
    expect(one('grand')).toBeGreaterThan(one('marcheur'));
  });
});
