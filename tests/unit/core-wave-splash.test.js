import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDirector, info, startWave, stepDirector } from '../../js/core/wave-director.js';
import { KEYS, KINDS, createSplash, stepSplash } from '../../js/core/wave-splash.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';
import { params, points } from './helpers/sim-vagues.js';

const P = JSON.parse(readFileSync('data/game/splash.json', 'utf8'));
const OPTS = { reducedMotion: false, params: P };
const REDUCED = { reducedMotion: true, params: P };
const DT = 0.05;

// Fait tourner le vrai directeur (aucun zombie : la vague se termine dès que tout est apparu) et l'animation, image par image.
function run({ wave = 1, seconds = 30, dt = DT, options = OPTS, alive = () => 0, alivePlayer = () => true, from = null } = {}) {
  let d = from?.d ?? createDirector(params, { seed: 1, wave });
  let sp = from?.sp ?? createSplash();
  const frames = [];
  let time = 0;
  if (from === null) {
    // Première image du jeu : dt = 0, le directeur n'a pas encore avancé (compte à rebours de 3,0 s).
    const first = stepSplash(sp, { ...info(d), playerAlive: true }, 0, options);
    sp = first.state;
    frames.push({ time: 0, info: { ...info(d), playerAlive: true }, view: first.view });
  }
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const out = stepDirector(d, { dt, alive: alive(time), view: null, points });
    d = out.state;
    const inf = { ...info(d), playerAlive: alivePlayer(time) };
    const res = stepSplash(sp, inf, dt, options);
    sp = res.state;
    time += dt;
    frames.push({ time, info: inf, view: res.view });
  }
  return { frames, d, sp };
}
const visibleFrames = (frames, kind, n) => frames.filter((f) => f.view.visible && (kind === undefined || f.view.kind === kind) && (n === undefined || f.view.title.n === n));
const sounds = (frames) => frames.filter((f) => f.view.sound !== null);
const base = { active: true, phase: 'attente', wave: 1, waitLeft: 3, reinforced: false, playerAlive: true };

describe('wave-splash : chronologie de l\'animation de début', () => {
  it('au démarrage de la vague 1, l\'animation démarre aussitôt (attente de 3,0 s) en entrée, avec le son', () => {
    const { view } = stepSplash(createSplash(), base, 0, OPTS);
    expect(view).toMatchObject({ visible: true, kind: 'debut', step: 'entree', t: 0 });
    expect(view.sound).toMatchObject({ name: 'vague-annonce' });
  });

  it('titre « Vague N » (clé et numéro) sans sous-titre pour une vague ordinaire', () => {
    const { view } = stepSplash(createSplash(), { ...base, wave: 3 }, 0, OPTS);
    expect(view.title).toEqual({ key: KEYS.debut, n: 3 });
    expect(view.subtitle).toBeNull();
  });

  it('vague renforcée : même titre, sous-titre « Vague renforcée », genre renforcee, son vague-renforcee', () => {
    const { view } = stepSplash(createSplash(), { ...base, wave: 5, reinforced: true }, 0, OPTS);
    expect(view).toMatchObject({ kind: 'renforcee', title: { key: KEYS.debut, n: 5 }, subtitle: { key: KEYS.renforcee } });
    expect(view.sound.name).toBe('vague-renforcee');
  });

  it('une vague qui n\'est pas renforcée (4, 6, 9) n\'a jamais le genre renforcee', () => {
    for (const wave of [1, 2, 3, 4, 6, 9]) expect(stepSplash(createSplash(), { ...base, wave }, 0, OPTS).view.kind).toBe('debut');
  });

  it('chronologie exacte : entrée 0,4 s, tenue jusqu\'à 3,3 s, sortie 0,5 s (total 3,8 s)', () => {
    const { frames } = run();
    const at = (t) => frames.reduce((best, f) => (Math.abs(f.time - t) < Math.abs(best.time - t) ? f : best)).view;
    expect(at(0.2).step).toBe('entree');
    expect(at(0.45).step).toBe('tenue');
    expect(at(3.25).step).toBe('tenue');
    expect(at(3.35).step).toBe('sortie');
    expect(at(3.75).step).toBe('sortie');
  });

  it('durée totale de visibilité : 3,8 s de temps de jeu (vague 1)', () => {
    const { frames } = run();
    const v = visibleFrames(frames, 'debut', 1);
    expect(v.length * DT).toBeCloseTo(3.8, 6);
    expect(frames.find((f) => f.time > 3.8 + 1e-9 && f.view.kind === 'debut' && f.view.title.n === 1)).toBeUndefined();
  });

  it('les durées viennent des données : entrée 0,4, tenue après 0,3, sortie 0,5, avance 3,0', () => {
    expect([P.leadTime, P.debut.enter, P.debut.holdAfter, P.debut.exit]).toEqual([3, 0.4, 0.3, 0.5]);
    expect([P.fin.enter, P.fin.hold, P.fin.exit, P.overlapExit]).toEqual([0.25, 2, 0.4, 0.15]);
  });

  it('l\'animation culmine avec l\'arrivée des zombies : au premier pas de la phase d\'apparition, t vaut 3,0 s et la vue est en tenue', () => {
    const { frames } = run();
    const first = frames.find((f) => f.info.phase === 'apparition');
    expect(first.view.t).toBeCloseTo(3, 1);
    expect(first.view.step).toBe('tenue');
    expect(first.view.visible).toBe(true);
  });

  it('vague suivante (pause de 8 s) : elle démarre quand le compte à rebours atteint 3,0 s', () => {
    const { frames } = run({ seconds: 40 });
    const second = frames.find((f) => f.view.visible && f.view.kind === 'debut' && f.view.title.n === 2);
    expect(second.info.waitLeft).toBeLessThanOrEqual(3 + 1e-9);
    expect(second.info.waitLeft).toBeGreaterThan(3 - DT - 1e-9);
    expect(second.view.step).toBe('entree');
  });

  it('?wave=N : l\'animation est celle de la vague N dès le début de l\'attente', () => {
    const { frames } = run({ wave: 7, seconds: 1 });
    expect(frames[0].view).toMatchObject({ visible: true, kind: 'debut', title: { n: 7 } });
  });

  it('startWave (saut à une autre vague) avec un état neuf : animation de la nouvelle vague', () => {
    const d = startWave(createDirector(params, { seed: 1 }), 12);
    const { view } = stepSplash(createSplash(), { ...info(d), playerAlive: true }, 0, OPTS);
    expect(view).toMatchObject({ visible: true, title: { n: 12 } });
  });

  it('avant le seuil (compte à rebours supérieur à 3,0 s) : rien', () => {
    for (const waitLeft of [3.01, 5, 8]) expect(stepSplash(createSplash(), { ...base, waitLeft }, 0.05, OPTS).view.visible).toBe(false);
  });

  it('exactement au seuil (3,0 s) : démarre à t = 0', () => {
    expect(stepSplash(createSplash(), { ...base, waitLeft: 3 }, 0.05, OPTS).view.t).toBe(0);
  });

  it('en dessous du seuil à la première observation : t = dépassement (au plus dt)', () => {
    expect(stepSplash(createSplash(), { ...base, waitLeft: 2.97 }, 0.05, OPTS).view.t).toBeCloseTo(0.03, 9);
    expect(stepSplash(createSplash(), { ...base, waitLeft: 1 }, 0.05, OPTS).view.t).toBeCloseTo(0.05, 9);
    expect(stepSplash(createSplash(), { ...base, waitLeft: 1 }, 0, OPTS).view.t).toBe(0);
  });

  it('les phases apparition, combat et inactif ne démarrent rien', () => {
    for (const phase of ['apparition', 'combat', 'inactif']) expect(stepSplash(createSplash(), { ...base, phase, waitLeft: 0 }, 0.05, OPTS).view.visible, phase).toBe(false);
  });

  it('une animation commencée va à son terme même quand la phase change', () => {
    let sp = createSplash();
    sp = stepSplash(sp, base, 0, OPTS).state;
    for (const phase of ['apparition', 'combat']) {
      const r = stepSplash(sp, { ...base, phase, waitLeft: 0 }, 1, OPTS);
      expect(r.view.visible).toBe(true);
      sp = r.state;
    }
    expect(stepSplash(sp, { ...base, phase: 'combat', waitLeft: 0 }, 5, OPTS).view.visible).toBe(false);
  });
});

describe('wave-splash : animation de fin de vague', () => {
  const fin = () => {
    const { frames } = run({ seconds: 30 });
    return { frames, first: frames.find((f) => f.view.kind === 'fin') };
  };

  it('démarre à l\'état terminee (« Vague N terminée », « Vie restaurée »)', () => {
    const { first } = fin();
    expect(first.info.phase).toBe('terminee');
    expect(first.view).toMatchObject({ visible: true, kind: 'fin', step: 'entree', title: { key: KEYS.fin, n: 1 }, subtitle: { key: KEYS.vieRestauree } });
  });

  it('entrée 0,25 s, tenue 2,0 s, sortie 0,4 s : 2,65 s de visibilité', () => {
    const { frames } = fin();
    expect(visibleFrames(frames, 'fin', 1).length * DT).toBeCloseTo(2.65, 6);
    const steps = visibleFrames(frames, 'fin', 1).map((f) => f.view.step);
    expect(steps.filter((s) => s === 'entree').length * DT).toBeCloseTo(0.25, 6);
    expect(steps.filter((s) => s === 'tenue').length * DT).toBeCloseTo(2, 6);
    expect(steps.filter((s) => s === 'sortie').length * DT).toBeCloseTo(0.4, 6);
  });

  it('son vague-fin une seule fois, au démarrage', () => {
    const { frames } = fin();
    const list = sounds(frames).filter((f) => f.view.kind === 'fin');
    expect(list).toHaveLength(1);
    expect(list[0].view.sound.name).toBe('vague-fin');
  });

  it('avec les paramètres actuels (pause de 8 s), fin et début ne se chevauchent jamais', () => {
    const { frames } = run({ seconds: 80 });
    let lastFin = -Infinity;
    for (const f of frames) {
      if (f.view.kind === 'fin') lastFin = f.time;
      if (f.view.kind === 'debut' || f.view.kind === 'renforcee') expect(f.time - lastFin).toBeGreaterThanOrEqual(DT - 1e-9);
    }
  });

  it('la fin d\'une vague renforcée est une fin ordinaire', () => {
    const { frames } = run({ wave: 5, seconds: 90 });
    expect(visibleFrames(frames).some((f) => f.view.kind === 'renforcee')).toBe(true);
    const f = frames.find((x) => x.view.kind === 'fin');
    expect(f.view.title.n).toBe(5);
    expect(f.view.subtitle.key).toBe(KEYS.vieRestauree);
  });

  it('le texte de fin est calme : secousse et décalage de couleur au quart de ceux du début, aucune déchirure', () => {
    const { frames } = run({ seconds: 60 });
    const maxOf = (kind, key) => Math.max(...visibleFrames(frames, kind).map((f) => Math.abs(f.view[key])));
    expect(maxOf('fin', 'shiftX')).toBeLessThanOrEqual(P.shake.maxPx * P.fin.intensity + 1e-9);
    expect(maxOf('fin', 'rgbSplit')).toBeLessThanOrEqual(P.rgbSplit.maxPx * P.fin.intensity + 1e-9);
    for (const f of visibleFrames(frames, 'fin')) expect(f.view.tears).toEqual([]);
    expect(maxOf('debut', 'shiftX')).toBeGreaterThan(maxOf('fin', 'shiftX'));
  });

  it('pas de fin de vague pour un numéro déjà montré (un seul « terminee » par vague)', () => {
    let sp = createSplash();
    const terminee = { ...base, phase: 'terminee', waitLeft: 0 };
    sp = stepSplash(sp, terminee, 0.05, OPTS).state;
    const again = stepSplash(sp, terminee, 5, OPTS);
    expect(again.view.sound).toBeNull();
  });
});

describe('wave-splash : un son par animation', () => {
  it('une animation par vague et par genre, un son chacune (vagues 1 à 6)', () => {
    const { frames } = run({ seconds: 260 });
    const s = sounds(frames).map((f) => `${f.view.kind}:${f.view.title.n}`);
    expect(new Set(s).size).toBe(s.length);
    for (let w = 1; w <= 6; w += 1) expect(s, `vague ${w}`).toContain(`${w === 5 ? 'renforcee' : 'debut'}:${w}`);
    for (let w = 1; w <= 5; w += 1) expect(s).toContain(`fin:${w}`);
  });

  it('noms de sons : annonce, annonce renforcée, fin', () => {
    const { frames } = run({ seconds: 260 });
    const by = (kind) => new Set(sounds(frames).filter((f) => f.view.kind === kind).map((f) => f.view.sound.name));
    expect([...by('debut')]).toEqual(['vague-annonce']);
    expect([...by('renforcee')]).toEqual(['vague-renforcee']);
    expect([...by('fin')]).toEqual(['vague-fin']);
  });

  it('la variante demandée est dans [0, nombre de variantes[ (3, 2, 2)', () => {
    const { frames } = run({ seconds: 260 });
    for (const f of sounds(frames)) {
      const n = P.sounds[f.view.kind].variants;
      expect(Number.isInteger(f.view.sound.variant) && f.view.sound.variant >= 0 && f.view.sound.variant < n).toBe(true);
    }
  });

  it('la même information répétée pendant longtemps ne redonne jamais de son', () => {
    let sp = stepSplash(createSplash(), base, 0, OPTS).state;
    let count = 0;
    for (let i = 0; i < 400; i += 1) {
      const r = stepSplash(sp, { ...base, waitLeft: 1 }, 0.05, OPTS);
      sp = r.state;
      if (r.view.sound) count += 1;
    }
    expect(count).toBe(0);
  });

  it('le son ne vient qu\'avec l\'image de démarrage : view.sound est nul partout ailleurs', () => {
    const { frames } = run({ seconds: 80 });
    const animations = new Set(visibleFrames(frames).map((f) => `${f.view.kind}:${f.view.title.n}`));
    expect(sounds(frames).length).toBe(animations.size);
    for (const f of sounds(frames)) expect(f.view.t).toBeLessThanOrEqual(DT + 1e-9);
  });
});

describe('wave-splash : pause, mort, absence de vagues', () => {
  it('dt à 0 : la vue reste identique (animation figée) et l\'état ne bouge pas', () => {
    const start = stepSplash(createSplash(), base, 0.05, OPTS);
    let s = start.state;
    const mid = stepSplash(s, { ...base, waitLeft: 2.5 }, 0.5, OPTS);
    s = mid.state;
    const a = stepSplash(s, { ...base, waitLeft: 2.5 }, 0, OPTS);
    const b = stepSplash(a.state, { ...base, waitLeft: 2.5 }, 0, OPTS);
    expect(b.view).toEqual(a.view);
    expect(a.view.t).toBe(mid.view.t);
    expect(b.state).toEqual(a.state);
  });

  it('dt négatif ou NaN : traité comme 0, sans exception', () => {
    const s = stepSplash(createSplash(), base, 0.05, OPTS).state;
    const ref = stepSplash(s, base, 0, OPTS);
    for (const dt of [-1, -0.05, NaN, -Infinity, 'x', null, undefined, {}]) expect(stepSplash(s, base, dt, OPTS).view, String(dt)).toEqual(ref.view);
  });

  it('dt énorme : l\'animation se termine sans exception', () => {
    const s = stepSplash(createSplash(), base, 0, OPTS).state;
    for (const dt of [1e6, Number.MAX_VALUE]) expect(stepSplash(s, { ...base, waitLeft: 0, phase: 'apparition' }, dt, OPTS).view.visible, String(dt)).toBe(false);
    expect(() => stepSplash(s, base, Infinity, OPTS)).not.toThrow(); // non fini : traité comme 0 (figé)
  });

  it('active faux : invisible, aucun son, état vidé', () => {
    const r = stepSplash(createSplash(), { ...base, active: false }, 0, OPTS);
    expect(r.view).toMatchObject({ visible: false, kind: null, sound: null, opacity: 0 });
    expect(r.state.anims).toEqual([]);
  });

  it('?nospawn=1 (directeur inactif) : aucune animation pendant 60 s', () => {
    const d = createDirector(params, { seed: 1, inactive: true });
    let sp = createSplash();
    for (let i = 0; i < 1200; i += 1) {
      sp = stepSplash(sp, { ...info(d), playerAlive: true }, 0.05, OPTS).state;
      expect(stepSplash(sp, { ...info(d), playerAlive: true }, 0.05, OPTS).view.visible).toBe(false);
    }
  });

  it('joueur mort : l\'animation en cours est masquée aussitôt et ne revient pas', () => {
    let sp = stepSplash(createSplash(), base, 0, OPTS).state;
    sp = stepSplash(sp, { ...base, waitLeft: 2.5 }, 0.5, OPTS).state;
    const dead = stepSplash(sp, { ...base, waitLeft: 2.4, playerAlive: false }, 0.05, OPTS);
    expect(dead.view.visible).toBe(false);
    expect(stepSplash(dead.state, { ...base, waitLeft: 2.3 }, 0.05, OPTS).view.visible).toBe(false);
  });

  it('un état neuf (Rejouer) recommence la vague 1 avec une nouvelle animation', () => {
    const first = stepSplash(createSplash(), base, 0, OPTS);
    const replay = stepSplash(createSplash(), base, 0, OPTS);
    expect(replay.view.sound).not.toBeNull();
    expect(replay.view).toEqual(first.view);
  });
});

describe('wave-splash : chevauchement', () => {
  it('si le début arrive pendant la fin (paramètres modifiés), le début l\'emporte et la fin sort en 0,15 s', () => {
    let sp = createSplash();
    sp = stepSplash(sp, { ...base, phase: 'terminee', waitLeft: 0 }, 0, OPTS).state;
    sp = stepSplash(sp, { ...base, wave: 2, waitLeft: 4 }, 0.5, OPTS).state;
    const during = stepSplash(sp, { ...base, wave: 2, waitLeft: 3 }, 0.05, OPTS);
    expect(during.view.kind).toBe('fin'); // sortie rapide de la fin
    expect(during.view.sound).toMatchObject({ name: 'vague-annonce' });
    let state = during.state;
    const kinds = [during.view.kind];
    let fadeFrames = 0;
    for (let i = 0; i < 12; i += 1) {
      const r = stepSplash(state, { ...base, wave: 2, waitLeft: 3 - 0.05 * (i + 1) }, 0.05, OPTS);
      state = r.state;
      kinds.push(r.view.kind);
      if (r.view.kind === 'fin') fadeFrames += 1;
    }
    expect(fadeFrames * DT).toBeLessThanOrEqual(P.overlapExit + 1e-9);
    expect(kinds.at(-1)).toBe('debut');
  });

  it('pendant la sortie rapide de la fin, l\'opacité décroît sans remonter', () => {
    let sp = stepSplash(createSplash(), { ...base, phase: 'terminee', waitLeft: 0 }, 0, OPTS).state;
    sp = stepSplash(sp, { ...base, wave: 2, waitLeft: 4 }, 0.5, OPTS).state;
    let last = Infinity;
    let state = sp;
    for (let i = 0; i < 4; i += 1) {
      const r = stepSplash(state, { ...base, wave: 2, waitLeft: 3 - 0.01 * i }, 0.04, OPTS);
      state = r.state;
      if (r.view.kind === 'fin') {
        expect(r.view.opacity).toBeLessThanOrEqual(last + 1e-12);
        last = r.view.opacity;
      }
    }
  });

  it('la fin ne démarre pas quand une animation de début est déjà en cours', () => {
    let sp = stepSplash(createSplash(), base, 0, OPTS).state;
    const r = stepSplash(sp, { ...base, phase: 'terminee', waitLeft: 0 }, 0.05, OPTS);
    expect(r.view.kind).toBe('debut');
    expect(r.view.sound).toBeNull();
  });
});

describe('wave-splash : mouvement réduit', () => {
  it('aucun mouvement : décalage, secousse, échelle, déchirures, scintillement nuls ; opacité 0 ou 1', () => {
    const { frames } = run({ seconds: 40, options: REDUCED });
    for (const f of visibleFrames(frames)) {
      expect(f.view).toMatchObject({ opacity: 1, scale: 1, shiftX: 0, rgbSplit: 0, flicker: 0, tears: [] });
    }
    for (const f of frames.filter((x) => !x.view.visible)) expect(f.view.opacity).toBe(0);
  });

  it('mêmes durées de visibilité qu\'avec le mouvement (3,8 s et 2,65 s) et mêmes sons', () => {
    const a = run({ seconds: 30 });
    const b = run({ seconds: 30, options: REDUCED });
    for (const kind of ['debut', 'fin']) expect(visibleFrames(b.frames, kind).length).toBe(visibleFrames(a.frames, kind).length);
    expect(sounds(b.frames).map((f) => f.view.sound)).toEqual(sounds(a.frames).map((f) => f.view.sound));
  });

  it('les étapes (entree, tenue, sortie) restent annoncées', () => {
    const { frames } = run({ seconds: 5, options: REDUCED });
    expect(new Set(visibleFrames(frames, 'debut').map((f) => f.view.step))).toEqual(new Set(['entree', 'tenue', 'sortie']));
  });
});

describe('wave-splash : décor déterministe et borné', () => {
  const deco = (f) => ({ shiftX: f.view.shiftX, rgbSplit: f.view.rgbSplit, tears: f.view.tears, flicker: f.view.flicker });

  it('mêmes entrées, mêmes nombres décoratifs (déterminisme par graine)', () => {
    const a = run({ wave: 3, seconds: 10 });
    const b = run({ wave: 3, seconds: 10 });
    expect(a.frames.map((f) => f.view)).toEqual(b.frames.map((f) => f.view));
  });

  it('une autre vague donne d\'autres nombres, et une autre graine aussi', () => {
    const a = run({ wave: 3, seconds: 4 }).frames.map(deco);
    const b = run({ wave: 4, seconds: 4 }).frames.map(deco);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    const other = { reducedMotion: false, params: { ...P, seed: P.seed + 1 } };
    expect(JSON.stringify(run({ wave: 3, seconds: 4, options: other }).frames.map(deco))).not.toBe(JSON.stringify(a));
  });

  it('les nombres changent au pas de 1/12 s, pas à chaque image de 1/20 s', () => {
    const { frames } = run({ seconds: 3.2 });
    const v = visibleFrames(frames, 'debut');
    const distinct = new Set(v.map((f) => f.view.shiftX)).size;
    expect(distinct).toBeLessThanOrEqual(Math.ceil(3.2 * P.shake.rate) + 2);
    expect(distinct).toBeGreaterThan(10);
  });

  it('bornes sur une grille de vagues et de pas de temps : secousse ≤ 3 px, décalage de couleur ≤ 4 px, scintillement ≤ 6 %', () => {
    for (const wave of [1, 2, 5, 10, 33, 100]) {
      for (const dt of [0.01, 0.05, 0.2]) {
        const { frames } = run({ wave, seconds: 20, dt });
        for (const f of visibleFrames(frames)) {
          const v = f.view;
          expect(Math.abs(v.shiftX)).toBeLessThanOrEqual(3 + 1e-9);
          expect(v.rgbSplit).toBeGreaterThanOrEqual(0);
          expect(v.rgbSplit).toBeLessThanOrEqual(4 + 1e-9);
          expect(Math.abs(v.flicker)).toBeLessThanOrEqual(0.06 + 1e-9);
          expect(v.opacity).toBeGreaterThanOrEqual(0);
          expect(v.opacity).toBeLessThanOrEqual(1);
          expect(v.scale).toBeGreaterThanOrEqual(1 - 1e-9);
          expect(v.scale).toBeLessThanOrEqual(P.debut.scaleFrom + 1e-9);
          expect(v.tears.length).toBeLessThanOrEqual(P.tears.max);
          for (const t of v.tears) {
            expect(t.y).toBeGreaterThanOrEqual(0);
            expect(t.h).toBeGreaterThan(0);
            expect(t.h).toBeLessThanOrEqual(P.tears.maxHeight + 1e-9);
            expect(t.y + t.h).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it('une ou deux bandes de déchirure au plus, et il y en a bien pendant l\'animation de début', () => {
    const { frames } = run({ seconds: 4 });
    const counts = visibleFrames(frames, 'debut').map((f) => f.view.tears.length);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
  });

  it('plus de secousse à l\'entrée et au moment de l\'arrivée des zombies qu\'en tenue calme', () => {
    const amp = (pred) => {
      let max = 0;
      for (let wave = 1; wave <= 40; wave += 1) {
        for (const f of visibleFrames(run({ wave, seconds: 4 }).frames, 'debut').filter(pred)) max = Math.max(max, Math.abs(f.view.shiftX));
      }
      return max;
    };
    expect(amp((f) => f.view.step === 'tenue' && f.view.t < 2.9)).toBeLessThan(amp((f) => f.view.step === 'entree') * 0.5 + 1e-9);
  });

  it('sortie monotone : l\'opacité ne remonte jamais, l\'échelle ne diminue jamais', () => {
    for (const wave of [1, 5]) {
      const { frames } = run({ wave, seconds: 4 });
      const out = visibleFrames(frames).filter((f) => f.view.step === 'sortie').map((f) => f.view);
      expect(out.length).toBeGreaterThan(5);
      for (let i = 1; i < out.length; i += 1) {
        expect(out[i].opacity).toBeLessThanOrEqual(out[i - 1].opacity + 1e-12);
        expect(out[i].scale).toBeGreaterThanOrEqual(out[i - 1].scale - 1e-12);
      }
      expect(out.at(-1).opacity).toBeLessThan(0.15);
    }
  });

  it('entrée : l\'échelle passe de 1,18 à 1 et l\'opacité de 0 à 1 ; tenue : zoom lent de 1 à 1,04', () => {
    const { frames } = run({ seconds: 4 });
    const v = visibleFrames(frames, 'debut').map((f) => f.view);
    expect(v[0].opacity).toBeLessThan(0.15);
    expect(v[0].scale).toBeGreaterThan(1.1);
    const hold = v.filter((x) => x.step === 'tenue');
    expect(hold[0].scale).toBeLessThan(1.01);
    expect(hold.at(-1).scale).toBeGreaterThan(1.03);
    expect(hold.at(-1).scale).toBeLessThanOrEqual(P.debut.zoomHold + 1e-9);
    for (const h of hold) expect(h.opacity).toBe(1);
  });

  it('vue : tous les champs attendus, avec leurs types', () => {
    const { frames } = run({ seconds: 2 });
    const v = frames[10].view;
    expect(Object.keys(v).sort()).toEqual(['flicker', 'kind', 'opacity', 'rgbSplit', 'scale', 'shiftX', 'sound', 'step', 'subtitle', 'tears', 'title', 't', 'visible'].sort());
    expect(KINDS).toContain(v.kind);
    expect(Array.isArray(v.tears)).toBe(true);
  });

  it('vue invisible : kind, title, step nuls ; opacité 0', () => {
    const v = stepSplash(createSplash(), { ...base, waitLeft: 8 }, 0, OPTS).view;
    expect(v).toMatchObject({ visible: false, kind: null, title: null, subtitle: null, step: null, opacity: 0, scale: 1, shiftX: 0, rgbSplit: 0, flicker: 0, tears: [], sound: null });
  });
});

describe('wave-splash : entrées hostiles et immutabilité', () => {
  it('numéros de vague invalides : aucune animation', () => {
    for (const wave of [0, -3, 1.5, NaN, Infinity, 'x', null, undefined]) expect(stepSplash(createSplash(), { ...base, wave }, 0, OPTS).view.visible, String(wave)).toBe(false);
  });

  it('entrées absurdes à chaque position : jamais d\'exception, toujours une vue', () => {
    for (const w of WEIRD) {
      expect(() => stepSplash(w, base, 0.05, OPTS), `état ${String(w)}`).not.toThrow();
      expect(() => stepSplash(createSplash(), w, 0.05, OPTS), `info ${String(w)}`).not.toThrow();
      expect(() => stepSplash(createSplash(), base, w, OPTS), `dt ${String(w)}`).not.toThrow();
      expect(() => stepSplash(createSplash(), base, 0.05, w), `options ${String(w)}`).not.toThrow();
      expect(() => stepSplash(createSplash(), base, 0.05, { params: w }), `params ${String(w)}`).not.toThrow();
      const r = stepSplash(w, w, w, w);
      expect(r.view.visible).toBe(false);
      expect(typeof r.state).toBe('object');
    }
  });

  it('champs d\'information absurdes (waitLeft, phase, reinforced) : pas d\'exception, pas d\'animation sauf attente valide', () => {
    for (const w of WEIRD) {
      for (const key of ['waitLeft', 'phase', 'reinforced', 'wave', 'playerAlive', 'active']) expect(() => stepSplash(createSplash(), { ...base, [key]: w }, 0.05, OPTS), `${key}=${String(w)}`).not.toThrow();
    }
    expect(stepSplash(createSplash(), { ...base, waitLeft: NaN }, 0.05, OPTS).view.visible).toBe(false);
    expect(stepSplash(createSplash(), { ...base, phase: 'x' }, 0.05, OPTS).view.visible).toBe(false);
  });

  it('paramètres absurdes (champs manquants) : jamais d\'exception', () => {
    for (const w of WEIRD) {
      for (const key of ['debut', 'fin', 'shake', 'rgbSplit', 'tears', 'flicker', 'sounds', 'leadTime', 'overlapExit', 'seed', 'calmLevel']) {
        const params = { ...P, [key]: w };
        for (const info of [base, { ...base, phase: 'terminee', waitLeft: 0 }]) expect(() => stepSplash(createSplash(), info, 0.05, { params }), `${key}=${String(w)}`).not.toThrow();
      }
    }
  });

  it('arguments gelés : acceptés et jamais modifiés (état, information, options)', () => {
    const state = deepFreeze(stepSplash(createSplash(), base, 0.05, OPTS).state);
    const inf = deepFreeze({ ...base, waitLeft: 2.5 });
    const opts = deepFreeze({ reducedMotion: false, params: JSON.parse(JSON.stringify(P)) });
    const before = JSON.stringify([state, inf, opts]);
    expect(() => stepSplash(state, inf, 0.1, opts)).not.toThrow();
    expect(JSON.stringify([state, inf, opts])).toBe(before);
    const fin = deepFreeze({ ...base, phase: 'terminee', waitLeft: 0 });
    expect(() => stepSplash(state, fin, 0.1, opts)).not.toThrow();
  });

  it('l\'état renvoyé est un nouvel objet : l\'état d\'entrée garde ses valeurs', () => {
    const s0 = stepSplash(createSplash(), base, 0.05, OPTS).state;
    const copy = JSON.parse(JSON.stringify(s0));
    stepSplash(s0, { ...base, waitLeft: 2 }, 1, OPTS);
    expect(JSON.parse(JSON.stringify(s0))).toEqual(copy);
  });
});
