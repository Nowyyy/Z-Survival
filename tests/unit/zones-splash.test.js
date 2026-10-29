import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, luminance, mix, parseColor } from '../../js/core/color.js';
import { createDirector, info, stepDirector } from '../../js/core/wave-director.js';
import { KEYS, KINDS, createSplash, stepSplash } from '../../js/core/wave-splash.js';
import { parseZones } from '../../js/core/zones.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const P = JSON.parse(readFileSync('data/game/splash.json', 'utf8'));
const params = JSON.parse(readFileSync('data/game/waves.json', 'utf8'));
const decor = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const zones = parseZones(JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/zones.json', 'utf8')));
const OPTS = { reducedMotion: false, params: P };
const REDUCED = { reducedMotion: true, params: P };
const DT = 0.05;
const calm = { active: true, phase: 'attente', wave: 11, waitLeft: 12, reinforced: false, playerAlive: true };

// Avance l'animation seule : l'annonce arrive à la première image, puis le temps passe.
function play(seconds, { options = OPTS, announce = 10, info: base = calm } = {}) {
  let sp = createSplash();
  const frames = [];
  for (let i = 0; i <= Math.round(seconds / DT); i += 1) {
    const res = stepSplash(sp, { ...base, doorAnnounce: i === 0 ? announce : undefined }, i === 0 ? 0 : DT, options);
    sp = res.state;
    frames.push({ time: i * DT, view: res.view });
  }
  return frames;
}

describe('wave-splash : annonce « Nouvelle zone » (type zone)', () => {
  it('« zone » est un genre connu, avec ses clés de texte dans fr.json', () => {
    expect(KINDS).toContain('zone');
    expect(KEYS.zoneTitle).toBe('game.splash.zone.title');
    expect(KEYS.zoneSubtitle).toBe('game.splash.zone.subtitle');
    expect(fr[KEYS.zoneTitle]).toBe('Nouvelle zone');
    expect(fr[KEYS.zoneSubtitle]).toBe('Une porte s\'ouvre');
  });

  it('à doorAnnounce, l\'animation démarre aussitôt en entrée, titre et sous-titre de zone, sans son', () => {
    const { view } = stepSplash(createSplash(), { ...calm, doorAnnounce: 10 }, 0, OPTS);
    expect(view).toMatchObject({ visible: true, kind: 'zone', step: 'entree', t: 0, title: { key: KEYS.zoneTitle }, subtitle: { key: KEYS.zoneSubtitle }, sound: null });
  });

  it('chronologie de splash.json : entrée 0,4 s, tenue 2,2 s, sortie 0,5 s, puis plus rien', () => {
    expect(P.zone).toMatchObject({ enter: 0.4, hold: 2.2, exit: 0.5 });
    const frames = play(4);
    const at = (t) => frames.find((f) => Math.abs(f.time - t) < DT / 2).view;
    expect(at(0.2).step).toBe('entree');
    expect(at(1.0).step).toBe('tenue');
    expect(at(2.5).step).toBe('tenue');
    expect(at(2.8).step).toBe('sortie');
    expect(at(3.2).visible).toBe(false);
    const total = frames.filter((f) => f.view.visible).length * DT;
    expect(total).toBeGreaterThan(3.0);
    expect(total).toBeLessThan(3.2);
  });

  it('aucune image de l\'animation ne demande de son (aucune entrée « zone » dans sounds)', () => {
    expect(P.sounds.zone).toBeUndefined();
    expect(play(4).every((f) => f.view.sound === null)).toBe(true);
  });

  it('une seule animation par ouverture : répéter la même annonce ne la relance pas', () => {
    let sp = createSplash();
    let starts = 0;
    for (let i = 0; i < 80; i += 1) {
      const res = stepSplash(sp, { ...calm, doorAnnounce: 10 }, DT, OPTS);
      if (res.view.visible && res.view.t === 0) starts += 1;
      sp = res.state;
    }
    expect(starts).toBe(1);
    const again = stepSplash(sp, { ...calm, doorAnnounce: 20 }, DT, OPTS);
    expect(again.view).toMatchObject({ visible: true, kind: 'zone' });
  });

  it('mouvement réduit : opacité 0 ou 1 seulement, échelle 1, aucun décalage, aucune déchirure, aucun scintillement', () => {
    for (const f of play(4, { options: REDUCED }).filter((q) => q.view.visible)) {
      expect(f.view).toMatchObject({ opacity: 1, scale: 1, shiftX: 0, rgbSplit: 0, flicker: 0, tears: [] });
    }
  });

  it('mêmes bornes que les autres annonces : secousse 3 px, décalage de couleur 4 px, scintillement 6 % au plus, aucune déchirure', () => {
    for (const f of play(4).filter((q) => q.view.visible)) {
      expect(Math.abs(f.view.shiftX)).toBeLessThanOrEqual(3);
      expect(f.view.rgbSplit).toBeGreaterThanOrEqual(0);
      expect(f.view.rgbSplit).toBeLessThanOrEqual(4);
      expect(Math.abs(f.view.flicker)).toBeLessThanOrEqual(0.06);
      expect(f.view.tears).toEqual([]);
    }
  });

  it('contrastes sur le pire fond : titre d\'au moins 3:1 (grand texte), sous-titre d\'au moins 4,5:1', () => {
    const tokens = Object.fromEntries([...readFileSync('css/tokens.css', 'utf8').matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const color = (n) => parseColor(tokens[n]);
    const FLOORS = ['game-floor', 'game-tile-a', 'game-tile-b', 'game-grout', 'game-asphalt', 'game-road', 'game-sidewalk', 'game-grass-a', 'game-grass-b', 'game-grass', 'game-soil', 'game-gravel', 'game-ground'];
    const lightest = FLOORS.map(color).reduce((best, c) => (luminance(c) > luminance(best) ? c : best));
    const worst = mix(lightest, color('game-splash-veil'), Number(tokens['game-splash-veil-alpha']));
    expect(contrast(color('game-splash-end'), worst)).toBeGreaterThanOrEqual(3);
    expect(contrast(color('game-splash-end-sub'), worst)).toBeGreaterThanOrEqual(4.5);
  });

  it('chevauchement avec « Vague N terminée » : la fin de la manche 10 sort quand « Nouvelle zone » arrive', () => {
    let sp = createSplash();
    const end = stepSplash(sp, { active: true, phase: 'terminee', wave: 10, waitLeft: 0, playerAlive: true }, 0, OPTS);
    sp = end.state;
    expect(end.view.kind).toBe('fin');
    for (let t = DT; t < 1.0; t += DT) sp = stepSplash(sp, { ...calm, wave: 11 }, DT, OPTS).state;
    const zone = stepSplash(sp, { ...calm, wave: 11, doorAnnounce: 10 }, DT, OPTS);
    const frames = [zone.view];
    expect(zone.view.kind).toBe('fin'); // la fin encore visible sort en overlapExit (0,15 s) ...
    let cur = zone.state;
    for (let t = 0; t < 0.5; t += DT) {
      const r = stepSplash(cur, { ...calm, wave: 11 }, DT, OPTS);
      cur = r.state;
      frames.push(r.view);
    }
    expect(frames.some((v) => v.kind === 'zone')).toBe(true); // ... puis « Nouvelle zone » s'affiche
  });

  it('séquence du directeur : fin de la manche 10 de 0 à 2,65 s, zone de 3,0 à 6,1 s, début de la manche 11 à 9,0 s, sans chevauchement', () => {
    const points = decor.spawnPoints.slice(0, 10);
    let d = createDirector(params, { seed: 1, wave: 10, doors: zones.doors, wavesPerWorld: 40 });
    let sp = createSplash();
    let endTime = null;
    let time = 0;
    const seen = [];
    for (let i = 0; i < 6000 && !(info(d).wave === 11 && info(d).phase === 'apparition'); i += 1) {
      const out = stepDirector(d, { dt: DT, alive: 0, view: null, points });
      d = out.state;
      time += DT;
      const announce = out.events.find((e) => e.type === 'doorAnnounce');
      if (out.events.some((e) => e.type === 'waveEnd' && e.wave === 10)) endTime = time;
      const res = stepSplash(sp, { ...info(d), playerAlive: true, doorAnnounce: announce?.wave }, DT, OPTS);
      sp = res.state;
      if (endTime !== null && res.view.visible) seen.push({ t: time - endTime, kind: res.view.kind });
    }
    const span = (kind) => { const l = seen.filter((s) => s.kind === kind).map((s) => s.t); return [Math.min(...l), Math.max(...l)]; };
    const [finA, finB] = span('fin');
    const [zoneA, zoneB] = span('zone');
    const [debutA] = span('debut');
    expect(finA).toBeLessThan(0.3);
    expect(finB).toBeLessThan(3.0);
    expect(zoneA).toBeGreaterThanOrEqual(2.9);
    expect(zoneA).toBeLessThanOrEqual(3.2);
    expect(zoneB).toBeLessThan(6.3);
    expect(debutA).toBeGreaterThanOrEqual(8.9);
    expect(debutA).toBeLessThanOrEqual(9.2);
    expect(zoneB).toBeLessThan(debutA);
  });

  it('si l\'annonce de début de manche est déjà visible, elle l\'emporte : « Nouvelle zone » ne s\'affiche pas', () => {
    let sp = createSplash();
    sp = stepSplash(sp, { ...calm, waitLeft: 2.9 }, 0, OPTS).state; // début de la manche 11 démarré
    const res = stepSplash(sp, { ...calm, waitLeft: 2.8, doorAnnounce: 10 }, DT, OPTS);
    expect(res.view.kind).toBe('debut');
    expect(res.state.anims.some((a) => a.kind === 'zone')).toBe(false);
  });

  it('mort du joueur pendant l\'animation : tout est masqué', () => {
    let sp = createSplash();
    sp = stepSplash(sp, { ...calm, doorAnnounce: 10 }, 0, OPTS).state;
    const res = stepSplash(sp, { ...calm, playerAlive: false }, DT, OPTS);
    expect(res.view.visible).toBe(false);
    expect(res.state.anims).toEqual([]);
  });

  it('déterministe, arguments gelés, entrées hostiles sans exception', () => {
    const a = play(4);
    expect(play(4)).toEqual(a);
    expect(() => stepSplash(deepFreeze(createSplash()), deepFreeze({ ...calm, doorAnnounce: 10 }), DT, deepFreeze({ ...OPTS, params: JSON.parse(JSON.stringify(P)) }))).not.toThrow();
    for (const bad of WEIRD) {
      expect(() => stepSplash(bad, { ...calm, doorAnnounce: bad }, bad, bad)).not.toThrow();
      expect(() => stepSplash(createSplash(), { ...calm, doorAnnounce: bad }, DT, OPTS)).not.toThrow();
    }
    expect(stepSplash(createSplash(), { ...calm, doorAnnounce: 0.5 }, DT, OPTS).view.visible).toBe(false);
    expect(stepSplash(createSplash(), { ...calm, doorAnnounce: -3 }, DT, OPTS).view.visible).toBe(false);
  });

  it('paramètres sans entrée « zone » : aucune annonce, aucune exception', () => {
    const old = Object.fromEntries(Object.entries(P).filter(([k]) => k !== 'zone'));
    const res = stepSplash(createSplash(), { ...calm, doorAnnounce: 10 }, DT, { reducedMotion: false, params: old });
    expect(res.view.visible).toBe(false);
  });
});
