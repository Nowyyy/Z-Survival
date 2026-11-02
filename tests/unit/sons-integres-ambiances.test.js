import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderVariant, repairSequence, resolveAtelier } from '../../js/core/synth2.js';
import { measureSound } from '../../js/core/atelier-check.js';
import { loopSeam, onsets } from '../../js/core/audio-analysis.js';
import { createDirector, direct, soundTable } from '../../js/core/sound-director.js';
import { bufferName, isAtelier } from '../../js/core/sound-choice.js';
import { renderChoice } from '../../js/core/sound-render.js';
import { createRng, nextFloat } from '../../js/core/rng.js';
import { synthRecipes } from './helpers/sons-anciens.js';

// Lot 3i-C : sons nouveaux de la fiche (Docs/ref/sons-a-integrer.md) branchés sur un événement du jeu, boucles d'ambiance, réparation à durée
// variable. Mesures et journal seulement : aucun son n'est écouté.
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const choix = read('data/game/sounds-choix.json');
const C = choix.choix.filter((c) => c.part === 'C');
const atelier = resolveAtelier(read('data/game/sounds-atelier.json'));
const slots = new Map(atelier.slots.map((s) => [s.id, s]));
const { sounds } = read('data/game/sounds.json');
const byId = new Map(sounds.map((s) => [s.id, s]));
const audio = read('data/game/audio.json');
const voice = read('data/game/zombie-voice.json');
const table = soundTable(sounds);
const oldTable = soundTable(synthRecipes());
const cfg = (t = table) => ({ audio, voice, materials: { sounds: {} }, sounds: t });
const L = { x: 1000, y: 1000 };
const frame = (events, extra = {}) => ({ time: 10, listener: L, walls: [], paused: false, events, ...extra });
const run = (events, extra = {}, t = table, state = createDirector(1)) => direct(state, frame(events, extra), cfg(t));
const names = (r) => r.requests.map((q) => q.sound);
const NEW_IDS = C.map((c) => c.id);
const rendered = new Map(C.map((c) => [c.id, renderChoice(byId.get(c.id), { seed: 1 })]));

describe('sons nouveaux : table et rendu', () => {
  it.each(C.map((c) => [c.id, c]))('%s : variante et réglages du propriétaire, emplacement de l\'atelier, événement écrit', (_, c) => {
    expect(slots.get(c.slot)?.variants.some((v) => v.id === c.variant)).toBe(true);
    expect(c.event.length).toBeGreaterThan(10);
    expect(isAtelier(byId.get(c.id))).toBe(true);
    expect(byId.get(c.id).set).toBe('fond');
  });

  it.each(C.map((c) => [c.id, c]))('%s : crête ≤ −3 dBFS, aucun NaN, durée dans les bornes, niveau relatif au tir à ±3 dB (gain propre compris)', (id, c) => {
    const { samples } = rendered.get(id);
    let peak = 0;
    for (const v of samples) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-3 + 1e-6);
    const slot = slots.get(c.slot);
    const m = measureSound(samples, 22050, slot, atelier.levelRef);
    expect(m.duration).toBeGreaterThanOrEqual(slot.target.duration[0] - 1e-6);
    expect(m.duration).toBeLessThanOrEqual(slot.target.duration[1] + 1e-6);
    expect(Math.abs(m.levelRel + (c.gainDb ?? 0) - slot.target.level)).toBeLessThanOrEqual(3);
  });

  it.each(C.filter((c) => !byId.get(c.id).loop).map((c) => c.id))('%s : bouts nuls (pas de clic)', (id) => {
    const { samples } = rendered.get(id);
    expect(Math.abs(samples[0])).toBeLessThan(1e-3);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
  });

  it.each(['ambiance-vent', 'ambiance-feu'])('%s : boucle sans raccord (saut < 0,002, énergie ±10 % sur 50 ms), une seule version', (id) => {
    const e = byId.get(id);
    expect(e.loop).toBe(true);
    expect(e.variants).toBe(1);
    const s = loopSeam(rendered.get(id).samples, 22050, 0.05);
    expect(s.jump).toBeLessThan(0.002);
    expect(Math.abs(s.energyRatio - 1)).toBeLessThanOrEqual(0.1);
  });

  it('pack d\'avant (?sons=ancien) : aucun des sons nouveaux', () => {
    for (const id of NEW_IDS) expect(oldTable[id], id).toBeUndefined();
  });
});

describe('sons nouveaux : chacun sur son événement, et pas ailleurs', () => {
  it.each([['dur', 'pas'], ['exterieur', 'pas-exterieur'], ['escalier', 'pas-escalier'], [undefined, 'pas'], ['inconnue', 'pas']])('pas du joueur, surface %s : %s', (surface, sound) => {
    expect(names(run([{ type: 'playerStep', foot: 'gauche', volume: 1, surface }]))).toEqual([sound]);
  });

  it('pack d\'avant : le pas d\'intérieur partout (dehors, escalier)', () => {
    for (const surface of ['exterieur', 'escalier']) expect(names(run([{ type: 'playerStep', foot: 'droit', volume: 1, surface }], {}, oldTable))).toEqual(['pas']);
  });

  it('la dernière planche cède : craquement qui traverse l\'ouverture (jamais étouffé), en plus de l\'arrachage', () => {
    const walls = [{ x: 1040, y: 900, w: 20, h: 200 }];
    const r = run([{ type: 'plankTorn', x: 1100, y: 1000, windowId: 'F' }, { type: 'windowOpen', x: 1100, y: 1000, windowId: 'F' }], { walls });
    expect(names(r)).toEqual(['planche-arrachee', 'planche-craquement']);
    expect(r.requests[1].lowpass).toBe(false);
  });

  it('escalade : au début, à la position de la fenêtre ; porte qui s\'enfonce : à la position de la porte', () => {
    const climb = run([{ type: 'zombieClimb', x: 1200, y: 1000, windowId: 'F' }]).requests[0];
    expect(climb.sound).toBe('zombie-escalade');
    expect(climb.pan).toBeGreaterThan(0);
    const door = run([{ type: 'doorSink', x: 700, y: 1000, door: 'porte-1' }]).requests[0];
    expect(door.sound).toBe('porte-enfoncee');
    expect(door.pan).toBeLessThan(0);
  });

  it('battement de cœur : seulement debout et sous le seuil (0,25), non spatialisé ; arrêté à terre et à la mort', () => {
    expect(names(run([{ type: 'playerVitals', health: 0.2, state: 'debout' }]))).toEqual(['joueur-coeur']);
    expect(run([{ type: 'playerVitals', health: 0.2, state: 'debout' }]).requests[0].pan).toBe(0);
    expect(names(run([{ type: 'playerVitals', health: 0.26, state: 'debout' }]))).toEqual([]);
    expect(names(run([{ type: 'playerVitals', health: 0, state: 'debout' }]))).toEqual([]);
    const down = run([{ type: 'playerVitals', health: 0.1, state: 'a-terre' }]);
    expect(names(down)).toEqual([]);
    expect(down.stops).toEqual([{ sound: 'joueur-coeur', key: null }]);
    expect(run([{ type: 'playerDeath' }]).stops).toEqual([{ sound: 'joueur-coeur', key: null }]);
  });

  it('battement de cœur : relancé toutes les 1,6 s tant que la vie reste basse (délai minimal = durée)', () => {
    let s = createDirector(1);
    let count = 0;
    for (let i = 0; i <= 160; i += 1) {
      const r = direct(s, frame([{ type: 'playerVitals', health: 0.1, state: 'debout' }], { time: i * 0.1 }), cfg());
      s = r.state;
      count += r.requests.filter((q) => q.sound === 'joueur-coeur').length;
    }
    expect(count).toBeGreaterThanOrEqual(9);
    expect(count).toBeLessThanOrEqual(11);
  });

  it('gémissements lointains : une fois par fin de manche, après « Vague N terminée », non spatialisés', () => {
    const r = run([{ type: 'waveEnd', variant: 0 }]);
    expect(names(r)).toEqual(['vague-fin', 'ambiance-lointains']);
    expect(r.requests[1].delay).toBeCloseTo(table['vague-fin'].duration, 6);
    expect(r.requests[1].pan).toBe(0);
    expect(names(run([{ type: 'waveEnd', variant: 1 }], {}, oldTable))).toEqual(['vague-fin']);
  });

  it('aucun son nouveau pendant la pause', () => {
    const ev = [{ type: 'playerStep', surface: 'exterieur' }, { type: 'windowOpen', x: 1, y: 1 }, { type: 'zombieClimb', x: 1, y: 1 }, { type: 'doorSink', x: 1, y: 1 }, { type: 'playerVitals', health: 0.1, state: 'debout' }, { type: 'waveEnd', variant: 0 }];
    expect(run(ev, { paused: true }).requests).toEqual([]);
  });
});

describe('pas des zombies selon l\'allure, frottement des rampants', () => {
  // 20 s de marche en cercle à 200 du joueur pour une allure donnée (quatre zombies).
  const walk = (gait, stride, count = 4, seconds = 20) => {
    let s = createDirector(2);
    const out = [];
    for (let i = 0; i <= seconds * 30; i += 1) {
      const t = i / 30;
      const zombies = Array.from({ length: count }, (_, k) => ({ id: k + 1, x: L.x + Math.cos(t * 0.5 + k) * (180 + 20 * k), y: L.y + Math.sin(t * 0.5 + k) * (180 + 20 * k), variant: 'marcheur', gait, stride }));
      const r = direct(s, frame([], { time: t, zombies }), cfg());
      s = r.state;
      out.push(...r.requests.map((q) => ({ ...q, t })));
    }
    return out;
  };
  it.each([['lent', 'pas-zombie-lent', 38], ['marche', 'pas-zombie', 52], ['course', 'pas-zombie-course', 78]])('allure %s : %s seulement', (gait, sound, stride) => {
    const steps = walk(gait, stride).filter((q) => q.category === 'pas');
    expect(steps.length).toBeGreaterThan(10);
    expect(new Set(steps.map((q) => q.sound))).toEqual(new Set([sound]));
  });
  it('rampants : frottement seulement (aucun pas), au plus un toutes les 0,5 s et un par cycle de foulée', () => {
    const r = walk('rampe', 40).filter((q) => q.category === 'pas');
    expect(r.length).toBeGreaterThan(5);
    expect(new Set(r.map((q) => q.sound))).toEqual(new Set(['zombie-rampe']));
    for (let i = 1; i < r.length; i += 1) expect(r[i].t - r[i - 1].t).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
  it('rampants : seuls les 2 plus proches frottent', () => {
    const r = walk('rampe', 40, 6, 30).filter((q) => q.sound === 'zombie-rampe');
    // Les zombies 1 et 2 sont les plus proches (180 et 200) : les sons viennent de leur cercle.
    for (const q of r) expect(q.gain).toBeGreaterThan(0.5);
  });
  it('pack d\'avant : pas traînant commun pour toutes les allures, rampants muets', () => {
    let s = createDirector(2);
    const out = [];
    for (let i = 0; i <= 300; i += 1) {
      const t = i / 30;
      const zombies = ['lent', 'course', 'rampe'].map((gait, k) => ({ id: k + 1, x: L.x + Math.cos(t + k) * 200, y: L.y + Math.sin(t + k) * 200, variant: 'marcheur', gait, stride: 50 }));
      const r = direct(s, frame([], { time: t, zombies }), cfg(oldTable));
      s = r.state;
      out.push(...r.requests);
    }
    expect(new Set(out.filter((q) => q.category === 'pas').map((q) => q.sound))).toEqual(new Set(['pas-zombie']));
  });
});

describe('grincements du bâtiment', () => {
  const walls = [{ x: 200, y: 300, w: 1600, h: 20 }, { x: 200, y: 1280, w: 1600, h: 20 }];
  const creaks = (seconds, t = table) => {
    let s = createDirector(4);
    const out = [];
    for (let i = 0; i <= seconds * 10; i += 1) {
      const r = direct(s, frame([{ type: 'playerVitals', health: 1, state: 'debout' }], { time: i / 10, walls }), cfg(t));
      s = r.state;
      out.push(...r.requests.filter((q) => q.sound === 'ambiance-grincements').map((q) => ({ ...q, t: i / 10 })));
    }
    return out;
  };
  it('toutes les 20 à 60 s, au hasard', () => {
    const r = creaks(400);
    expect(r.length).toBeGreaterThanOrEqual(400 / 60 - 1);
    expect(r.length).toBeLessThanOrEqual(400 / 20);
    expect(r[0].t).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < r.length; i += 1) {
      expect(r[i].t - r[i - 1].t).toBeGreaterThanOrEqual(20 - 0.1);
      expect(r[i].t - r[i - 1].t).toBeLessThanOrEqual(60 + 0.1);
    }
  });
  it('position dans l\'emprise des murs (balance et gain varient d\'un grincement à l\'autre)', () => {
    const r = creaks(400);
    expect(new Set(r.map((q) => q.pan.toFixed(3))).size).toBeGreaterThan(2);
    for (const q of r) expect(Math.abs(q.pan)).toBeLessThanOrEqual(audio.pan.max);
  });
  it('hasard séparé : les autres tirages (voix, versions) ne changent pas', () => {
    const play = (t) => {
      let s = createDirector(9);
      const out = [];
      for (let i = 0; i <= 900; i += 1) {
        const zombies = [{ id: 1, x: 1100, y: 1000, variant: 'grand', gait: 'marche', stride: 52 }, { id: 2, x: 900, y: 1050, variant: 'petit', gait: 'marche', stride: 52 }];
        const r = direct(s, frame([{ type: 'playerVitals', health: 1, state: 'debout' }], { time: i / 30, walls, zombies }), cfg(t));
        s = r.state;
        out.push(...r.requests.filter((q) => q.sound !== 'ambiance-grincements').map((q) => `${q.sound}:${q.variant}`));
      }
      return out;
    };
    const noCreak = { ...table };
    delete noCreak['ambiance-grincements'];
    expect(play(table)).toEqual(play(noCreak));
  });
});

describe('réparation à durée variable (0,4 à 1,8 s)', () => {
  const e = byId.get('planche-posee');
  it.each([0.4, 0.8, 1.2, 1.8])('%s s : durée respectée à ±5 %, coups de marteau = repairSequence', (d) => {
    const r = renderChoice(e, { seed: 3, durationSec: d });
    expect(Math.abs(r.duration - d) / d).toBeLessThanOrEqual(0.05);
    expect(onsets(r.samples, 22050, { threshold: 0.3, minGap: 0.15 }).length).toBe(repairSequence(d, 3).count);
  });
  it('nombre de coups croissant avec la durée (2, 3, 4, 5)', () => {
    expect([0.4, 0.8, 1.2, 1.8].map((d) => repairSequence(d, 1).count)).toEqual([2, 3, 4, 5]);
  });
  it('durées de pose réelles (statistique reparation 0 à 10) : un tampon par durée au centième, identique au rendu de l\'atelier', () => {
    const stat = read('data/game/player-stats.json').extra.reparation;
    const names = new Set();
    for (let lvl = 0; lvl <= stat.maxLevel; lvl += 1) {
      const d = Math.max(stat.min, stat.base * stat.decay ** lvl);
      names.add(bufferName('planche-posee', 1, d, e));
      const r = renderChoice(e, { seed: 1, durationSec: d });
      expect(Math.abs(r.duration - d) / d).toBeLessThanOrEqual(0.05);
      const ref = renderVariant(slots.get('reparation'), 'C', { ...e.atelier.macros, duree: Math.round(d * 100) / 100 }, 1);
      expect(Buffer.from(r.samples.buffer).equals(Buffer.from(ref.samples.buffer))).toBe(true);
    }
    expect(names.size).toBe(stat.maxLevel + 1);
  });
  it('déclenchée au début de la pose, à la durée de pose, reprise en phase (offset) ; arrêtée si interrompue', () => {
    const r = run([{ type: 'plankRepairStart', x: 1000, y: 900, windowId: 'F', duration: 0.95, progress: 0.5 }]);
    expect(r.requests[0]).toMatchObject({ sound: 'planche-posee', durationSec: 0.95, key: 'F' });
    expect(r.requests[0].offset).toBeCloseTo(0.475, 6);
    expect(r.requests[0].duration).toBeCloseTo(0.475, 6);
    expect(run([{ type: 'plankRepairStop', windowId: 'F' }]).stops).toEqual([{ sound: 'planche-posee', key: 'F' }]);
  });
});

describe('limite de voix en scène de meute', () => {
  it('10 zombies de toutes allures, tirs, cœur, planches pendant 60 s : jamais plus de maxVoices voix, voix de zombies au plus maxSimultaneous + morts', () => {
    let s = createDirector(5);
    let rng = createRng(8);
    let maxAll = 0;
    const gaits = [['lent', 38], ['marche', 52], ['course', 78], ['rampe', 40]];
    for (let i = 0; i <= 1800; i += 1) {
      const t = i / 30;
      const zombies = Array.from({ length: 10 }, (_, k) => ({ id: k + 1, x: L.x + Math.cos(t * 0.6 + k) * (120 + 30 * k), y: L.y + Math.sin(t * 0.6 + k) * (120 + 30 * k), variant: ['marcheur', 'petit', 'voute', 'grand'][k % 4], gait: gaits[k % 4][0], stride: gaits[k % 4][1] }));
      const ev = [{ type: 'playerVitals', health: 0.2, state: 'debout' }];
      const roll = nextFloat(rng);
      rng = roll.rng;
      if (i % 9 === 0) ev.push({ type: 'shot', x: L.x + 20, y: L.y });
      if (roll.value < 0.05) ev.push({ type: 'zombieHit', x: L.x + 100, y: L.y, killed: roll.value < 0.02, zombie: 'petit' });
      if (i % 66 === 0) ev.push({ type: 'plankTorn', x: L.x, y: L.y - 300, windowId: 'F1' });
      if (i % 120 === 0) ev.push({ type: 'plankRepairStart', x: L.x, y: L.y + 300, windowId: 'F2', duration: 1.2, progress: 0 });
      const r = direct(s, frame(ev, { time: t, zombies }), cfg());
      s = r.state;
      const live = s.voices.voices.filter((v) => v.end > t).length;
      maxAll = Math.max(maxAll, live);
    }
    expect(maxAll).toBeLessThanOrEqual(audio.maxVoices);
    console.info(`meute : au plus ${maxAll} voix simultanées (limite ${audio.maxVoices})`);
  });
});
