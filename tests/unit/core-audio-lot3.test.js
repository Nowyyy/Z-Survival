import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { admitGap, admitVoice, createVoiceState } from '../../js/core/audio-mix.js';
import { createDirector, direct, soundTable } from '../../js/core/sound-director.js';
import { buildLayout } from '../../js/core/layout.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const read = (f) => JSON.parse(readFileSync(`data/game/${f}.json`, 'utf8'));
const audio = read('audio');
const sounds = read('sounds').sounds;
const cfg = { audio, materials: read('sound-materials'), voice: read('zombie-voice'), sounds: soundTable(sounds) };
const layout = buildLayout(read('world'), read('decor'), {});
const LISTENER = { x: 1800, y: 1400 };
const WIN = { x: 1800, y: 812, windowId: 'fenetre-nord' };
const frame = (events, extra = {}) => ({ time: 10, listener: LISTENER, walls: layout.walls, paused: false, events, ...extra });
const run = (events, extra, state = createDirector(1)) => direct(state, frame(events, extra), cfg);
const names = (r) => r.requests.map((q) => q.sound);

describe('audio-mix.js (lot 3) : admitGap et priorité de la catégorie fenetre', () => {
  it('admitGap : accepte, refuse sous le délai, puis accepte de nouveau', () => {
    const a = admitGap({}, 'w', 1, 0.12);
    expect(a).toEqual({ ok: true, last: { w: 1 } });
    expect(admitGap(a.last, 'w', 1.1, 0.12).ok).toBe(false);
    expect(admitGap(a.last, 'w', 1.12, 0.12).ok).toBe(true);
  });

  it('admitGap : une autre clé n\'est pas gênée, l\'argument n\'est pas modifié, aucune exception', () => {
    const last = deepFreeze({ w: 1 });
    expect(admitGap(last, 'v', 1.01, 0.12).ok).toBe(true);
    expect(last).toEqual({ w: 1 });
    for (const a of WEIRD) for (const b of WEIRD) expect(() => admitGap(a, b, a, b)).not.toThrow();
  });

  it('priorité : fenetre est entre annonce et voix, et audio.json a son gain', () => {
    const p = audio.priority;
    expect(p.fenetre).toBeLessThan(p.annonce);
    expect(p.fenetre).toBeGreaterThan(p.voix);
    expect(audio.categoryGain.fenetre).toBe(0.7);
  });

  it('voix pleines : un son de fenêtre vole la place d\'une voix de zombie, pas celle d\'une annonce', () => {
    const full = { maxVoices: 2, minDelay: {} };
    let s = createVoiceState();
    s = admitVoice(s, { sound: 'vague-annonce', category: 'annonce', priority: audio.priority.annonce, duration: 4 }, 0, full).state;
    s = admitVoice(s, { sound: 'zombie-gemissement', category: 'voix', priority: audio.priority.voix, duration: 4 }, 0.1, full).state;
    const win = admitVoice(s, { sound: 'planche-arrachee', category: 'fenetre', priority: audio.priority.fenetre, duration: 0.5 }, 0.2, full);
    expect(win.play).toBe(true);
    expect(win.state.voices.some((v) => v.sound === 'vague-annonce')).toBe(true);
    expect(win.state.voices.some((v) => v.sound === 'zombie-gemissement')).toBe(false);
  });
});

describe('sound-director.js (lot 3) : planches, chute et relevage', () => {
  it('une planche arrachée demande planche-arrachee, catégorie fenetre, au départ de la fenêtre', () => {
    const r = run([{ type: 'plankTorn', ...WIN }]);
    expect(names(r)).toEqual(['planche-arrachee']);
    expect(r.requests[0].category).toBe('fenetre');
  });

  it('une planche posée demande planche-posee', () => {
    expect(names(run([{ type: 'plankRepaired', ...WIN }]))).toEqual(['planche-posee']);
  });

  it('délai minimal de 120 ms par fenêtre : un deuxième son 60 ms après est refusé, 130 ms après accepté', () => {
    let r = run([{ type: 'plankTorn', ...WIN }], { time: 10 });
    r = direct(r.state, frame([{ type: 'plankTorn', ...WIN }], { time: 10.06 }), cfg);
    expect(names(r)).toEqual([]);
    r = direct(r.state, frame([{ type: 'plankTorn', ...WIN }], { time: 10.13 }), cfg);
    expect(names(r)).toEqual(['planche-arrachee']);
  });

  it('le délai est propre à chaque fenêtre : une autre fenêtre sonne 60 ms plus tard (le délai global du son est de 50 ms)', () => {
    let r = run([{ type: 'plankTorn', ...WIN }], { time: 20 }, createDirector(2));
    r = direct(r.state, frame([{ type: 'plankTorn', x: 812, y: 1400, windowId: 'fenetre-ouest' }], { time: 20.06 }), cfg);
    expect(names(r)).toEqual(['planche-arrachee']);
    r = direct(r.state, frame([{ type: 'plankTorn', ...WIN }], { time: 20.1 }), cfg); // la première fenêtre a sonné il y a 100 ms : refusée
    expect(names(r)).toEqual([]);
  });

  it('gain plus faible pour une fenêtre lointaine, balance selon le côté', () => {
    const near = run([{ type: 'plankTorn', x: 1850, y: 1500, windowId: 'a' }]).requests[0];
    const far = run([{ type: 'plankTorn', ...WIN }]).requests[0];
    const side = run([{ type: 'plankTorn', x: 2788, y: 1400, windowId: 'fenetre-est' }]).requests[0];
    expect(far.gain).toBeLessThan(near.gain);
    expect(side.pan).toBeGreaterThan(0.5);
    expect(run([{ type: 'plankTorn', x: 812, y: 1400, windowId: 'fenetre-ouest' }]).requests[0].pan).toBeLessThan(-0.5);
  });

  it('pas d\'étouffement pour un son de fenêtre, même avec un mur sur le trajet ; un impact de balle derrière un mur reste étouffé', () => {
    const wall = [{ x: 1000, y: 1000, w: 1600, h: 20 }];
    const r = run([{ type: 'plankTorn', x: 1800, y: 900, windowId: 'n' }], { walls: wall });
    expect(r.requests[0].lowpass).toBe(false);
    expect(r.requests[0].gain).toBeGreaterThan(0.25);
    const hit = run([{ type: 'zombieHit', x: 1800, y: 900, killed: false, zombie: 'marcheur' }], { walls: wall });
    expect(hit.requests.every((q) => q.lowpass)).toBe(true);
  });

  it('jamais la même variante deux fois d\'affilée', () => {
    let s = createDirector(5);
    let last = -1;
    for (let i = 0; i < 20; i += 1) {
      const r = direct(s, frame([{ type: 'plankTorn', ...WIN }], { time: 10 + i }), cfg);
      s = r.state;
      expect(r.requests[0].variant).not.toBe(last);
      last = r.requests[0].variant;
    }
  });

  it('chute et relevage : sons sans position (joueur-chute, joueur-releve), catégorie joueur', () => {
    const down = run([{ type: 'playerDown' }]);
    const up = run([{ type: 'playerUp' }]);
    expect(names(down)).toEqual(['joueur-chute']);
    expect(names(up)).toEqual(['joueur-releve']);
    expect(down.requests[0]).toMatchObject({ category: 'joueur', gain: 1, pan: 0 });
  });

  it('rien ne sonne pendant la pause', () => {
    const r = run([{ type: 'plankTorn', ...WIN }, { type: 'plankRepaired', ...WIN }, { type: 'playerDown' }, { type: 'playerUp' }], { paused: true });
    expect(names(r)).toEqual([]);
  });

  it('un son trop lointain (gain < 0,01) ne prend pas le créneau de la fenêtre', () => {
    let r = run([{ type: 'plankTorn', x: 100000, y: 100000, windowId: 'loin' }], { time: 30 });
    expect(names(r)).toEqual([]);
    r = direct(r.state, frame([{ type: 'plankTorn', x: 1800, y: 1500, windowId: 'loin' }], { time: 30.01 }), cfg);
    expect(names(r)).toEqual(['planche-arrachee']);
  });

  it('état gelé accepté et non modifié, entrées hostiles sans exception', () => {
    const state = deepFreeze(createDirector(3));
    expect(() => direct(state, frame([{ type: 'plankTorn', ...WIN }]), cfg)).not.toThrow();
    for (const a of WEIRD) for (const b of WEIRD) {
      expect(() => direct(a, frame([a, { type: 'plankTorn', x: a, y: b, windowId: a }]), cfg)).not.toThrow();
      expect(() => direct(state, frame([{ type: 'plankRepaired', x: b, windowId: b }, { type: 'playerDown', x: a }]), cfg)).not.toThrow();
    }
  });
});
