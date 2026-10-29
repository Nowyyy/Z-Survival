import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDirector, finishWave, info, markDoor, PHASES, setParams, startWave, stepDirector } from '../../js/core/wave-director.js';
import { doorsOpenAtStart, parseZones } from '../../js/core/zones.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const params = JSON.parse(readFileSync('data/game/waves.json', 'utf8'));
const decor = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8'));
// Lot 3e : porte-2 est active ; ces tests du lot 3c décrivent l'état d'avant (porte-2 planned), la porte 2 est testée dans etage-directeur.test.js.
const rawZones = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/zones.json', 'utf8'));
const zones = parseZones({ ...rawZones, doors: rawZones.doors.map((d) => (d.id === 'porte-2' ? { ...d, planned: true } : d)) });
const DOORS = zones.doors; // porte-1 active, porte-2 et porte-3 planned
const points = decor.spawnPoints.slice(0, 10);
const DT = 0.05;
const input = (extra = {}) => ({ dt: DT, alive: 0, view: null, points, ...extra });
const world = (extra = {}) => ({ seed: 1, doors: DOORS, wavesPerWorld: zones.wavesPerWorld, ...extra });

// Fait tourner le directeur (aucun zombie vivant : la manche se termine dès que tout est apparu) jusqu'à ce que stop(state, out) soit vrai ; journal des événements avec le temps.
function run(director, { stop, maxSeconds = 20000, step = input() } = {}) {
  let d = director;
  let time = 0;
  const log = [];
  const requests = [];
  for (let i = 0; i < Math.round(maxSeconds / DT); i += 1) {
    const out = stepDirector(d, step);
    d = out.state;
    time += step.dt ?? DT;
    for (const e of out.events) log.push({ ...e, time });
    for (const r of out.requests) requests.push({ ...r, time, wave: info(d).wave });
    if (stop?.(d, out)) break;
  }
  return { d, time, log, requests };
}
const ofType = (log, type) => log.filter((e) => e.type === type);
const near = (a, b, tol = DT * 1.5) => Math.abs(a - b) <= tol;

describe('directeur : porte 1 (fin de la manche 10)', () => {
  const full = run(createDirector(params, world()), { stop: (d) => info(d).wave === 13 && info(d).phase === 'apparition' });

  it('exactement une transition de porte dans les douze premières manches, à la fin de la manche 10', () => {
    expect(ofType(full.log, 'doorOpen')).toHaveLength(1);
    expect(ofType(full.log, 'doorAnnounce')).toHaveLength(1);
    expect(ofType(full.log, 'doorOpen')[0]).toMatchObject({ door: 'porte-1', wave: 10 });
    const end10 = ofType(full.log, 'waveEnd').find((e) => e.wave === 10);
    const start11 = ofType(full.log, 'waveStart').find((e) => e.wave === 11);
    const open = ofType(full.log, 'doorOpen')[0];
    expect(open.time).toBeGreaterThan(end10.time);
    expect(open.time).toBeLessThan(start11.time);
  });

  it('doorAnnounce à 3,0 s et doorOpen à 3,6 s après la fin de la manche 10, dans cet ordre', () => {
    const end10 = ofType(full.log, 'waveEnd').find((e) => e.wave === 10);
    const [announce] = ofType(full.log, 'doorAnnounce');
    const [open] = ofType(full.log, 'doorOpen');
    expect(near(announce.time - end10.time, 3.0, DT * 2)).toBe(true);
    expect(near(open.time - end10.time, 3.6, DT * 2)).toBe(true);
    expect(announce.time).toBeLessThan(open.time);
  });

  it('la pause dure 12 s (de la fin de la manche 10 au début de la manche 11)', () => {
    const end10 = ofType(full.log, 'waveEnd').find((e) => e.wave === 10);
    const start11 = ofType(full.log, 'waveStart').find((e) => e.wave === 11);
    expect(near(start11.time - end10.time, 12, DT * 2)).toBe(true);
  });

  it('la première apparition de la manche 11 vient après l\'attente normale de 12 s', () => {
    const end10 = ofType(full.log, 'waveEnd').find((e) => e.wave === 10);
    const first = full.requests.find((r) => r.wave === 11);
    expect(first.time - end10.time).toBeGreaterThanOrEqual(12 - DT);
    expect(full.requests.filter((r) => r.wave === 10).every((r) => r.time <= end10.time)).toBe(true);
  });

  it('aucune autre fin de manche ne porte de pause plus longue : toutes les autres font 8 s', () => {
    const ends = ofType(full.log, 'waveEnd');
    const starts = ofType(full.log, 'waveStart');
    for (const end of ends) {
      const next = starts.find((s) => s.wave === end.wave + 1);
      if (!next) continue;
      const pause = next.time - end.time;
      if (end.wave === 10) expect(near(pause, 12, DT * 2)).toBe(true);
      else expect(near(pause, 8, DT * 2), `après la manche ${end.wave} : ${pause}`).toBe(true);
    }
  });

  it('info().doorPending : la porte 1 pendant la manche 10, null ailleurs', () => {
    const at = (n) => info(startWave(createDirector(params, world()), n)).doorPending;
    expect(at(10)).toEqual({ id: 'porte-1', openAfterWave: 10 });
    for (const n of [1, 5, 9, 11, 20, 30, 40]) expect(at(n), `manche ${n}`).toBeNull();
  });

  it('info().openDoors suit les événements : vide avant doorOpen, porte-1 après', () => {
    const before = run(createDirector(params, world()), { stop: (d, out) => ofType(out.events.map((e) => ({ ...e })), 'doorAnnounce').length > 0 });
    expect(info(before.d).openDoors).toEqual([]);
    const after = run(before.d, { stop: (d, out) => out.events.some((e) => e.type === 'doorOpen') });
    expect(info(after.d).openDoors).toEqual(['porte-1']);
  });

  it('la pause (dt = 0) fige la transition : ni annonce, ni ouverture, ni compte à rebours', () => {
    const atEnd = run(createDirector(params, world()), { stop: (d, out) => out.events.some((e) => e.type === 'waveEnd' && e.wave === 10) });
    const waiting = run(atEnd.d, { maxSeconds: 1 });
    const frozen = run(waiting.d, { maxSeconds: 30, step: input({ dt: 0 }) });
    expect(frozen.log).toEqual([]);
    expect(info(frozen.d).waitLeft).toBe(info(waiting.d).waitLeft);
    expect(info(frozen.d).openDoors).toEqual([]);
  });

  it('les portes 2 et 3 (planned) n\'ont aucun effet : pas d\'événement, pause de 8 s aux manches 20 et 30', () => {
    const r = run(createDirector(params, world({ wave: 18 })), { stop: (d) => info(d).wave === 32 && info(d).phase === 'apparition' });
    expect(ofType(r.log, 'doorOpen')).toEqual([]);
    expect(ofType(r.log, 'doorAnnounce')).toEqual([]);
    for (const n of [20, 30]) {
      const end = ofType(r.log, 'waveEnd').find((e) => e.wave === n);
      const next = ofType(r.log, 'waveStart').find((e) => e.wave === n + 1);
      expect(near(next.time - end.time, 8, DT * 2), `manche ${n}`).toBe(true);
    }
    expect(info(createDirector(params, world({ wave: 20 }))).doorPending).toBeNull();
  });

  it('une porte planned passée en argument est ignorée ; une porte sans openAfterWave valide aussi', () => {
    const d = createDirector(params, world({ doors: [{ id: 'x', openAfterWave: 2, planned: true }, { id: 'y', openAfterWave: 0 }, { id: 'z', openAfterWave: 'a' }, null, 5] }));
    const r = run(d, { stop: (s) => info(s).wave === 4 });
    expect(r.log.filter((e) => e.type.startsWith('door'))).toEqual([]);
    expect(info(d).doorPending).toBeNull();
  });

  it('une autre porte active (manche 3) donne la même séquence à sa propre manche', () => {
    const d = createDirector(params, world({ doors: [{ id: 'p', openAfterWave: 3 }] }));
    const r = run(d, { stop: (s) => info(s).wave === 5 });
    expect(ofType(r.log, 'doorOpen')).toMatchObject([{ door: 'p', wave: 3 }]);
    const end = ofType(r.log, 'waveEnd').find((e) => e.wave === 3);
    expect(near(ofType(r.log, 'doorOpen')[0].time - end.time, 3.6, DT * 2)).toBe(true);
  });
});

describe('directeur : ?wave=N, Rejouer, startWave', () => {
  it('?wave=11 : la porte 1 est ouverte au départ, sans aucune transition', () => {
    const d = createDirector(params, world({ wave: 11 }));
    expect(info(d).openDoors).toEqual(['porte-1']);
    const r = run(d, { stop: (s) => info(s).wave === 14 });
    expect(r.log.filter((e) => e.type.startsWith('door'))).toEqual([]);
  });

  it('?wave=10 : la porte reste fermée pendant la manche 10, puis s\'ouvre à sa fin', () => {
    const d = createDirector(params, world({ wave: 10 }));
    expect(info(d).openDoors).toEqual([]);
    const r = run(d, { stop: (s) => info(s).wave === 11 && info(s).phase === 'apparition' });
    expect(ofType(r.log, 'doorOpen')).toHaveLength(1);
  });

  it.each([[1, []], [10, []], [11, ['porte-1']], [26, ['porte-1']], [40, ['porte-1']]])('?wave=%i : portes ouvertes au départ = %j (même règle que doorsOpenAtStart)', (wave, ids) => {
    expect(info(createDirector(params, world({ wave }))).openDoors).toEqual(ids);
    expect(doorsOpenAtStart(zones, wave)).toEqual(ids);
  });

  it('startWave (hook de test) referme ou rouvre les portes selon la manche visée et abandonne une transition', () => {
    const d = createDirector(params, world());
    expect(info(startWave(d, 11)).openDoors).toEqual(['porte-1']);
    expect(info(startWave(startWave(d, 11), 10)).openDoors).toEqual([]);
    const atEnd = run(d, { stop: (s, out) => out.events.some((e) => e.type === 'waveEnd' && e.wave === 10) });
    const mid = run(atEnd.d, { maxSeconds: 4 });
    expect(info(mid.d).openDoors).toEqual(['porte-1']);
    const jumped = startWave(mid.d, 3);
    expect(info(jumped).openDoors).toEqual([]);
    expect(run(jumped, { maxSeconds: 2 }).log).toEqual([]);
  });

  it('« Rejouer » : un nouveau directeur referme les portes et repart à la manche 1 (ou à ?wave=N)', () => {
    const played = run(createDirector(params, world()), { stop: (s) => info(s).wave === 12 });
    expect(info(played.d).openDoors).toEqual(['porte-1']);
    expect(info(createDirector(params, world({ seed: 2 }))).openDoors).toEqual([]);
    expect(info(createDirector(params, world({ seed: 2 }))).wave).toBe(1);
    expect(info(createDirector(params, world({ seed: 2, wave: 12 }))).openDoors).toEqual(['porte-1']);
  });

  it('setParams conserve les portes et la fin de monde', () => {
    const d = setParams(createDirector(params, world()), { ...params, intermission: { first: 3, between: 4 } });
    expect(info(d).doorPending).toBeNull();
    const atTen = setParams(startWave(createDirector(params, world()), 10), params);
    expect(info(atTen).doorPending).toEqual({ id: 'porte-1', openAfterWave: 10 });
  });
});

describe('directeur : 40 manches et fin de monde', () => {
  const toEnd = run(createDirector(params, world({ wave: 39 })), { stop: (d) => info(d).phase === 'monde-termine' });

  it('PHASES contient « monde-termine »', () => {
    expect(PHASES).toContain('monde-termine');
  });

  it('la manche 40 terminée : état monde-termine, un événement worldEnd (manche 40), le soin de fin de manche reste émis', () => {
    expect(info(toEnd.d)).toMatchObject({ phase: 'monde-termine', worldEnd: true, wave: 40, toSpawn: 0 });
    expect(ofType(toEnd.log, 'worldEnd')).toMatchObject([{ wave: 40 }]);
    expect(ofType(toEnd.log, 'waveEnd')).toMatchObject([{ wave: 39 }, { wave: 40, healFraction: 1 }]);
  });

  it('ensuite : plus d\'apparition, plus de manche, plus d\'événement, même en laissant couler le temps', () => {
    const after = run(toEnd.d, { maxSeconds: 200 });
    expect(after.log).toEqual([]);
    expect(after.requests).toEqual([]);
    expect(info(after.d)).toMatchObject({ phase: 'monde-termine', wave: 40, worldEnd: true });
  });

  it('aucune fin de monde avant la manche 40', () => {
    const r = run(createDirector(params, world({ wave: 38 })), { stop: (d) => info(d).wave === 40 });
    expect(ofType(r.log, 'worldEnd')).toEqual([]);
    expect(info(r.d).worldEnd).toBe(false);
  });

  it('?endless=1 : la manche 41 démarre, aucune fin de monde', () => {
    const r = run(createDirector(params, world({ wave: 39, endless: true })), { stop: (d) => info(d).wave === 42 && info(d).phase === 'apparition' });
    expect(ofType(r.log, 'worldEnd')).toEqual([]);
    expect(ofType(r.log, 'waveStart').map((e) => e.wave)).toContain(41);
    expect(info(r.d).worldEnd).toBe(false);
  });

  it('la pause entre la manche 40 et 41 en mode endless est de 8 s', () => {
    const r = run(createDirector(params, world({ wave: 40, endless: true })), { stop: (d) => info(d).wave === 41 && info(d).phase === 'apparition' });
    const end = ofType(r.log, 'waveEnd').find((e) => e.wave === 40);
    const next = ofType(r.log, 'waveStart').find((e) => e.wave === 41);
    expect(near(next.time - end.time, 8, DT * 2)).toBe(true);
  });

  it('wavesPerWorld court (3) : la fin de monde suit cette valeur, pas un 40 en dur', () => {
    const r = run(createDirector(params, world({ wavesPerWorld: 3 })), { stop: (d) => info(d).worldEnd });
    expect(info(r.d).wave).toBe(3);
  });

  it('une manche au-delà de wavesPerWorld (?wave=45) : la première manche jouée termine le monde', () => {
    const r = run(createDirector(params, world({ wave: 45 })), { stop: (d) => info(d).worldEnd });
    expect(info(r.d)).toMatchObject({ worldEnd: true, wave: 45 });
  });
});

describe('directeur : ancienne salle (sans zones) strictement inchangée', () => {
  const plain = () => createDirector(params, { seed: 1 });
  const explicit = () => createDirector(params, { seed: 1, doors: [], wavesPerWorld: null, endless: false });

  it('mêmes états, événements et demandes avec ou sans les options de zone, sur 12 manches', () => {
    const a = run(plain(), { stop: (d) => info(d).wave === 13 });
    const b = run(explicit(), { stop: (d) => info(d).wave === 13 });
    expect(b.log).toEqual(a.log);
    expect(b.requests).toEqual(a.requests);
    expect(b.d).toEqual({ ...a.d });
  });

  it('pause de 8 s après chaque manche, y compris la 10, jamais de porte', () => {
    const r = run(plain(), { stop: (d) => info(d).wave === 13 });
    for (const end of ofType(r.log, 'waveEnd')) {
      const next = ofType(r.log, 'waveStart').find((s) => s.wave === end.wave + 1);
      if (next) expect(near(next.time - end.time, 8, DT * 2), `manche ${end.wave}`).toBe(true);
    }
    expect(r.log.filter((e) => e.type.startsWith('door'))).toEqual([]);
  });

  it('jamais de fin de monde, même après la manche 40', () => {
    const r = run(createDirector(params, { seed: 1, wave: 40 }), { stop: (d) => info(d).wave === 42 });
    expect(ofType(r.log, 'worldEnd')).toEqual([]);
    expect(info(r.d).worldEnd).toBe(false);
    expect(info(plain()).doorPending).toBeNull();
    expect(info(plain()).openDoors).toEqual([]);
  });
});

describe('directeur : paramètres, déterminisme, arguments gelés, entrées hostiles', () => {
  it('doorIntermission lu de waves.json : 6 s donne une pause de 6 s, annonce et ouverture comprises', () => {
    const short = { ...params, doorIntermission: 6 };
    const r = run(createDirector(short, world({ wave: 10 })), { stop: (d) => info(d).wave === 11 && info(d).phase === 'apparition' });
    const end = ofType(r.log, 'waveEnd').find((e) => e.wave === 10);
    const start = ofType(r.log, 'waveStart').find((e) => e.wave === 11);
    expect(near(start.time - end.time, 6, DT * 2)).toBe(true);
    expect(ofType(r.log, 'doorOpen')).toHaveLength(1);
  });

  it('des instants incohérents (ouverture après la fin de la pause) sont ramenés : annonce, ouverture, puis départ de la manche, toujours dans l\'ordre', () => {
    const odd = { ...params, doorIntermission: 2, doorSplashAt: 9, doorOpenAt: 5 };
    const r = run(createDirector(odd, world({ wave: 10 })), { stop: (d) => info(d).wave === 11 && info(d).phase === 'apparition' });
    const kinds = r.log.filter((e) => ['waveEnd', 'doorAnnounce', 'doorOpen', 'waveStart'].includes(e.type) && (e.wave === 10 || e.type === 'waveStart')).map((e) => e.type);
    expect(kinds.slice(-4)).toEqual(['waveEnd', 'doorAnnounce', 'doorOpen', 'waveStart']);
  });

  it('valeurs de repli sans les clés de porte dans waves.json : 12 s, 3,0 s, 3,6 s', () => {
    const { doorIntermission, doorSplashAt, doorOpenAt, doorSinkTime, ...old } = params;
    expect([doorIntermission, doorSplashAt, doorOpenAt, doorSinkTime]).toEqual([12, 3, 3.6, 1.2]);
    const r = run(createDirector(old, world({ wave: 10 })), { stop: (d) => info(d).wave === 11 && info(d).phase === 'apparition' });
    const end = ofType(r.log, 'waveEnd').find((e) => e.wave === 10);
    expect(near(ofType(r.log, 'doorOpen')[0].time - end.time, 3.6, DT * 2)).toBe(true);
  });

  it('même graine : mêmes événements, mêmes demandes, mêmes états', () => {
    const a = run(createDirector(params, world({ seed: 7 })), { stop: (d) => info(d).wave === 12 });
    const b = run(createDirector(params, world({ seed: 7 })), { stop: (d) => info(d).wave === 12 });
    expect(b).toEqual(a);
  });

  it('arguments gelés : ni les paramètres, ni les portes, ni l\'état, ni l\'entrée ne sont modifiés', () => {
    const p = deepFreeze(JSON.parse(JSON.stringify(params)));
    const doors = deepFreeze(JSON.parse(JSON.stringify(DOORS)));
    let d = deepFreeze(createDirector(p, { seed: 1, wave: 10, doors, wavesPerWorld: 40 }));
    const pts = deepFreeze(JSON.parse(JSON.stringify(points)));
    for (let i = 0; i < 1600; i += 1) {
      const out = stepDirector(d, deepFreeze({ dt: DT, alive: 0, view: null, points: pts }));
      d = deepFreeze(out.state);
    }
    expect(info(d).wave).toBeGreaterThanOrEqual(11);
    expect(params).toEqual(JSON.parse(readFileSync('data/game/waves.json', 'utf8')));
  });

  it.each(WEIRD)('entrées hostiles (%s) : aucune exception', (bad) => {
    expect(() => {
      createDirector(bad, bad);
      createDirector(params, { doors: bad, wavesPerWorld: bad, endless: bad, wave: bad, seed: bad });
      stepDirector(bad, bad);
      startWave(createDirector(params, world()), bad);
      info(bad);
    }).not.toThrow();
    const d = createDirector(params, { seed: 1, doors: bad, wavesPerWorld: bad });
    expect(info(d).openDoors).toEqual([]);
    expect(info(d).worldEnd).toBe(false);
  });

  it('un directeur inactif (?nospawn=1) ne connaît ni porte ni fin de monde', () => {
    const d = createDirector(params, world({ inactive: true }));
    const r = run(d, { maxSeconds: 100 });
    expect(r.log).toEqual([]);
    expect(info(r.d)).toMatchObject({ active: false, worldEnd: false, doorPending: null });
  });

  it('une mort pendant la transition : un nouveau directeur (Rejouer) repart propre, sans porte ouverte', () => {
    const mid = run(createDirector(params, world({ wave: 10 })), { stop: (d, out) => out.events.some((e) => e.type === 'doorOpen') });
    expect(info(mid.d).openDoors).toEqual(['porte-1']);
    const again = createDirector(params, world({ seed: 99 }));
    expect(info(again)).toMatchObject({ wave: 1, openDoors: [], phase: 'attente' });
  });
});

describe('directeur : hooks de test finishWave et markDoor', () => {
  it('finishWave annule les apparitions restantes : la manche passe en combat et se termine au pas suivant, sans demande', () => {
    const d = run(createDirector(params, world({ wave: 7 })), { stop: (s) => info(s).phase === 'apparition' }).d;
    expect(info(d).toSpawn).toBeGreaterThan(0);
    const skipped = finishWave(d);
    expect(info(skipped)).toMatchObject({ phase: 'combat', toSpawn: 0 });
    const out = stepDirector(skipped, input());
    expect(out.requests).toEqual([]);
    expect(out.events).toEqual([{ type: 'waveEnd', wave: 7, healFraction: 1 }]);
  });

  it('finishWave pendant le compte à rebours de départ termine aussi la manche (sans apparition)', () => {
    const d = finishWave(createDirector(params, world({ wave: 10 })));
    const out = stepDirector(d, input());
    expect(out.events).toMatchObject([{ type: 'waveEnd', wave: 10 }]);
    expect(info(out.state).doorPending).toEqual({ id: 'porte-1', openAfterWave: 10 });
  });

  it('finishWave ne fait rien hors d\'une manche : directeur inactif, fin de monde, pause d\'une porte', () => {
    const inactive = createDirector(params, world({ inactive: true }));
    expect(finishWave(inactive)).toBe(inactive);
    const ended = run(createDirector(params, world({ wave: 40 })), { stop: (s) => info(s).worldEnd }).d;
    expect(finishWave(ended)).toBe(ended);
    const pause = run(createDirector(params, world({ wave: 10 })), { stop: (s, out) => out.events.some((e) => e.type === 'waveEnd') }).d;
    const mid = run(pause, { maxSeconds: 1 }).d;
    expect(finishWave(mid)).toBe(mid);
  });

  it('markDoor ouvre ou ferme une porte connue d\'un coup, abandonne la transition, ignore une porte inconnue', () => {
    const d = createDirector(params, world());
    expect(info(markDoor(d, 'porte-1', true)).openDoors).toEqual(['porte-1']);
    expect(info(markDoor(markDoor(d, 'porte-1', true), 'porte-1', false)).openDoors).toEqual([]);
    expect(markDoor(d, 'inconnue', true)).toBe(d);
    const atEnd = run(createDirector(params, world({ wave: 10 })), { stop: (s, out) => out.events.some((e) => e.type === 'waveEnd') }).d;
    const cut = run(markDoor(atEnd, 'porte-1', true), { maxSeconds: 6 });
    expect(cut.log.filter((e) => e.type === 'doorOpen')).toEqual([]);
    expect(info(cut.d).openDoors).toEqual(['porte-1']);
  });

  it('finishWave et markDoor : arguments gelés et entrées hostiles sans exception', () => {
    const frozen = deepFreeze(createDirector(params, world()));
    expect(() => { finishWave(frozen); markDoor(frozen, 'porte-1', true); }).not.toThrow();
    for (const bad of WEIRD) expect(() => { finishWave(bad); markDoor(bad, bad, bad); }).not.toThrow();
  });
});
