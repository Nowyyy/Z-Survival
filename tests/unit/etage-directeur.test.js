import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDirector, info, stepDirector } from '../../js/core/wave-director.js';
import { createSplash, KEYS, stepSplash, ZONE_SUBTITLES } from '../../js/core/wave-splash.js';
import { activeSpawnPoints, activeWindows, activeZones, assignWindows, doorsOpenAtStart, nextDoor, parseZones } from '../../js/core/zones.js';
import { floorWorld, wavesCfg, zonesActive, zonesJson } from './helpers/etage.js';

const splashCfg = JSON.parse(readFileSync('data/game/splash.json', 'utf8'));
const parsed = parseZones(zonesJson);
// Les portes 2 et 3 sont actives (planned faux) : le jeu les active aux parties B et C.
const zones = { ...parsed, doors: parsed.doors.map((d) => ({ ...d, planned: false })) };
const DT = 0.05;
const points = [{ id: 'F5-a', x: 3000, y: 2900, fenetre: 'F5', floor: 'rdc' }, { id: 'U1-a', x: 100, y: 2000, fenetre: 'U1', floor: 'etage' }];

function run(d, stop, { maxSeconds = 4000 } = {}) {
  let time = 0;
  const log = [];
  const requests = [];
  for (let i = 0; i < Math.round(maxSeconds / DT); i += 1) {
    const out = stepDirector(d, { dt: DT, alive: 0, view: null, points, playerFloor: 'rdc' });
    d = out.state;
    time += DT;
    for (const e of out.events) log.push({ ...e, time });
    for (const r of out.requests) requests.push({ ...r, time, wave: info(d).wave });
    if (stop(d)) break;
  }
  return { d, time, log, requests };
}
const world = (extra = {}) => ({ seed: 1, doors: zones.doors, wavesPerWorld: zones.wavesPerWorld, ...extra });
const ofType = (log, t) => log.filter((e) => e.type === t);
const near = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

describe('directeur : portes 2 et 3 (fins des manches 20 et 30)', () => {
  const r = run(createDirector(wavesCfg, world({ wave: 19 })), (d) => info(d).wave === 32 && info(d).phase === 'apparition');

  it('une transition de porte à la fin de chacune des manches 20 et 30, aucune ailleurs', () => {
    expect(ofType(r.log, 'doorOpen').map((e) => [e.door, e.wave])).toEqual([['porte-2', 20], ['porte-3', 30]]);
    expect(ofType(r.log, 'doorAnnounce').map((e) => [e.door, e.wave])).toEqual([['porte-2', 20], ['porte-3', 30]]);
  });

  it('pause de 12 s, annonce à 3,0 s, ouverture à 3,6 s après la fin de la manche', () => {
    for (const w of [20, 30]) {
      const end = ofType(r.log, 'waveEnd').find((e) => e.wave === w).time;
      expect(near(ofType(r.log, 'doorAnnounce').find((e) => e.wave === w).time - end, 3.0)).toBe(true);
      expect(near(ofType(r.log, 'doorOpen').find((e) => e.wave === w).time - end, 3.6)).toBe(true);
      expect(near(ofType(r.log, 'waveStart').find((e) => e.wave === w + 1).time - end, 12.0)).toBe(true);
    }
  });

  it('aucune ouverture aux manches 21 à 29 ni après la 31', () => {
    expect(ofType(r.log, 'doorOpen').filter((e) => (e.wave > 20 && e.wave < 30) || e.wave > 30)).toEqual([]);
  });

  it('les portes 1, 2 et 3 sont ouvertes dans l\'ordre', () => {
    expect(info(r.d).openDoors).toEqual(['porte-1', 'porte-2', 'porte-3']);
  });

  it('?wave=21 ouvre les portes 1 et 2 au chargement, ?wave=31 les trois, ?wave=20 et ?wave=30 une de moins', () => {
    const open = (w) => info(createDirector(wavesCfg, world({ wave: w }))).openDoors;
    expect(open(21)).toEqual(['porte-1', 'porte-2']);
    expect(open(31)).toEqual(['porte-1', 'porte-2', 'porte-3']);
    expect(open(20)).toEqual(['porte-1']);
    expect(open(30)).toEqual(['porte-1', 'porte-2']);
    expect(doorsOpenAtStart(zones, 21)).toEqual(['porte-1', 'porte-2']);
    expect(doorsOpenAtStart(zones, 31)).toEqual(['porte-1', 'porte-2', 'porte-3']);
  });

  it('« Prochaine zone : manche N » vaut 11, puis 21, puis 31, puis disparaît', () => {
    expect(nextDoor(zones, 1, [])).toEqual({ id: 'porte-1', wave: 11 });
    expect(nextDoor(zones, 1, ['porte-1'])).toEqual({ id: 'porte-2', wave: 21 });
    expect(nextDoor(zones, 1, ['porte-1', 'porte-2'])).toEqual({ id: 'porte-3', wave: 31 });
    expect(nextDoor(zones, 1, ['porte-1', 'porte-2', 'porte-3'])).toBeNull();
  });

  it('tant que les portes sont « planned » (avant les parties B et C), « Prochaine zone » ne les voit pas', () => {
    expect(nextDoor(parsed, 1, ['porte-1'])).toBeNull();
    expect(doorsOpenAtStart(parsed, 31)).toEqual(['porte-1']);
  });

  it('la fin de monde à la manche 40 est conservée', () => {
    const w = run(createDirector(wavesCfg, world({ wave: 40 })), (d) => info(d).worldEnd);
    expect(info(w.d).worldEnd).toBe(true);
    expect(ofType(w.log, 'worldEnd')).toHaveLength(1);
  });

  it('l\'ancienne carte (aucune porte) n\'a ni transition ni fin de monde', () => {
    const w = run(createDirector(wavesCfg, { seed: 1, wave: 19 }), (d) => info(d).wave === 32);
    expect(ofType(w.log, 'doorOpen')).toEqual([]);
    expect(info(w.d).worldEnd).toBe(false);
  });
});

describe('apparitions sur deux étages (directeur et zones)', () => {
  it('les points de l\'étage sont actifs quand leur zone est ouverte, quel que soit l\'étage du joueur', () => {
    const assignment = { F5: 'depart', U1: 'etage-gauche' };
    expect(activeSpawnPoints(zones, assignment, points, ['porte-1']).map((p) => p.id)).toEqual(['F5-a']);
    expect(activeSpawnPoints(zones, assignment, points, ['porte-1', 'porte-2']).map((p) => p.id)).toEqual(['F5-a', 'U1-a']);
  });

  it('zones actives : etage-gauche après la porte 2, etage-droite après la porte 3', () => {
    expect(activeZones(zones, ['porte-1'])).toEqual(['depart', 'aile']);
    expect(activeZones(zones, ['porte-1', 'porte-2'])).toEqual(['depart', 'aile', 'etage-gauche']);
    expect(activeZones(zones, ['porte-1', 'porte-2', 'porte-3'])).toEqual(['depart', 'aile', 'etage-gauche', 'etage-droite']);
  });

  it('fenêtres actives : U1 à U4 après la porte 2, U5 à U7 après la porte 3', () => {
    const z = zonesActive; // unités du jeu, comme les fenêtres
    const assignment = assignWindows(z, floorWorld.all.map((g) => ({ id: g.id, floor: g.floor, entryInner: g.entryInner })));
    expect(activeWindows(z, assignment, ['porte-1', 'porte-2']).filter((id) => id.startsWith('U'))).toEqual(['U1', 'U2', 'U3', 'U4']);
    expect(activeWindows(z, assignment, ['porte-1', 'porte-2', 'porte-3']).filter((id) => id.startsWith('U'))).toEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']);
    expect(activeWindows(z, assignment, ['porte-1']).filter((id) => id.startsWith('U'))).toEqual([]);
  });

  it('le directeur fait apparaître des zombies à l\'étage même quand le joueur est en bas, sans condition de vue pour ces points', () => {
    const only = [points[1]];
    let d = createDirector(wavesCfg, world({ wave: 21 }));
    const reqs = [];
    for (let i = 0; i < 4000 && reqs.length < 3; i += 1) {
      const out = stepDirector(d, { dt: DT, alive: 0, view: { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }, points: only, playerFloor: 'rdc' });
      d = out.state;
      reqs.push(...out.requests);
    }
    expect(reqs.length).toBe(3);
    expect(reqs.every((q) => q.floor === 'etage' && q.window === 'U1')).toBe(true);
  });

  it('avec le joueur à l\'étage, un point du rez-de-chaussée dans la vue de l\'étage n\'est pas choisi par la règle de vue : il est « hors de la vue »', () => {
    let d = createDirector(wavesCfg, world({ wave: 21 }));
    const got = [];
    for (let i = 0; i < 4000 && got.length < 1; i += 1) {
      const out = stepDirector(d, { dt: DT, alive: 0, view: { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }, points: [points[0]], playerFloor: 'etage' });
      d = out.state;
      got.push(...out.requests);
    }
    expect(got[0]).toMatchObject({ pointId: 'F5-a', floor: 'rdc' });
  });

  it('le plafond de zombies simultanés vaut pour la somme des deux étages', () => {
    let d = createDirector(wavesCfg, world({ wave: 25 }));
    const max = info(d).maxConcurrent;
    let n = 0;
    for (let i = 0; i < 2000; i += 1) {
      const out = stepDirector(d, { dt: DT, alive: max, view: null, points, playerFloor: 'rdc' });
      d = out.state;
      n += out.requests.length;
    }
    expect(n).toBe(0);
    expect(max).toBeLessThanOrEqual(10);
  });

  it('la manche ne se termine que quand les zombies des deux étages sont morts (alive compte les deux)', () => {
    let d = createDirector(wavesCfg, world({ wave: 21 }));
    let ended = false;
    for (let i = 0; i < 6000 && !ended; i += 1) {
      const out = stepDirector(d, { dt: DT, alive: 1, view: null, points, playerFloor: 'rdc' });
      d = out.state;
      ended = out.events.some((e) => e.type === 'waveEnd');
    }
    expect(ended).toBe(false);
    expect(info(d).remaining).toBeGreaterThanOrEqual(1);
  });
});

describe('annonce « Nouvelle zone » : sous-titre selon la porte', () => {
  const sub = (key) => {
    let s = createSplash();
    const opts = { reducedMotion: false, params: splashCfg };
    const first = stepSplash(s, { active: true, phase: 'attente', wave: 21, waitLeft: 9, playerAlive: true, doorAnnounce: 20, doorSubtitle: key }, DT, opts);
    return first.view;
  };

  it('porte 1 : « Une porte s\'ouvre » ; porte 2 : « Un escalier s\'ouvre » ; porte 3 : « Un escalier et une porte s\'ouvrent »', () => {
    expect(sub(KEYS.zoneSubtitle).subtitle.key).toBe('game.splash.zone.subtitle');
    expect(sub('game.splash.zone.sub.escalier').subtitle.key).toBe('game.splash.zone.sub.escalier');
    expect(sub('game.splash.zone.sub.escalier-porte').subtitle.key).toBe('game.splash.zone.sub.escalier-porte');
    expect(sub('game.splash.zone.sub.escalier').title.key).toBe('game.splash.zone.title');
  });

  it('une clé inconnue ou absente retombe sur « Une porte s\'ouvre » ; les trois sous-titres sont les seuls permis', () => {
    expect(sub('autre.cle').subtitle.key).toBe('game.splash.zone.subtitle');
    expect(sub(undefined).subtitle.key).toBe('game.splash.zone.subtitle');
    expect(ZONE_SUBTITLES).toHaveLength(3);
  });

  it('les textes sont dans fr.json et chaque sous-titre de zones.json est un sous-titre permis', () => {
    const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    expect(fr['game.splash.zone.sub.escalier']).toBe('Un escalier s\'ouvre');
    expect(fr['game.splash.zone.sub.escalier-porte']).toBe('Un escalier et une porte s\'ouvrent');
    for (const d of parsed.doors) expect(ZONE_SUBTITLES).toContain(d.subtitleKey);
  });

  it('l\'annonce part une seule fois par ouverture et sans son', () => {
    let s = createSplash();
    const opts = { reducedMotion: false, params: splashCfg };
    let sounds = 0;
    let shows = 0;
    for (let i = 0; i < 120; i += 1) {
      const out = stepSplash(s, { active: true, phase: 'attente', wave: 21, waitLeft: 9, playerAlive: true, doorAnnounce: 20, doorSubtitle: 'game.splash.zone.sub.escalier' }, DT, opts);
      s = out.state;
      if (out.view.sound) sounds += 1;
      if (out.view.visible && out.view.kind === 'zone') shows += 1;
    }
    expect(sounds).toBe(0);
    expect(shows).toBeGreaterThan(10);
    expect(s.shown.zone).toBe(20);
  });
});
