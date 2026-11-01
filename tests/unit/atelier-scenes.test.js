import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMAT, renderVariant, resolveAtelier, rotateToSeam } from '../../js/core/synth2.js';
import { checkTargets, measureSound } from '../../js/core/atelier-check.js';
import { loopSeam, onsets, spectralDistance } from '../../js/core/audio-analysis.js';
import { SCENE_DURATION, SCENE_IDS, createScene, listenerFloor, mixFor } from '../../js/core/scenes-sons.js';
import { formatNumber, parseChoices, serializeChoices } from '../../js/core/atelier-choices.js';
import { project } from '../../scripts/sons/projection.mjs';
import { synthRecipes } from './helpers/sons-anciens.js';

// Lot 3h-C : propositions (priorité 2), boucles sans raccord, scènes de 30 s, projection du poids, format de « Mes choix ».
const raw = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
const data = resolveAtelier(raw);
const audio = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
// Lot 3i : recettes de synth.js (les recettes remplacées par l'atelier viennent de sounds-legacy.json ; l'atelier : sons-integres.test.js).
const sounds = synthRecipes();
const dict = JSON.parse(readFileSync('data/i18n/atelier-sons.json', 'utf8'));
const p2 = data.slots.filter((s) => s.priority === 2);
const slotOf = (id) => data.slots.find((s) => s.id === id);
const memo = new Map();
const renderOnce = (id, v, seed = 1) => {
  const k = `${id}|${v}|${seed}`;
  if (!memo.has(k)) memo.set(k, renderVariant(slotOf(id), v, {}, seed));
  return memo.get(k);
};

describe('propositions (priorité 2)', () => {
  it('au plus 10 emplacements, au moins 2 variantes chacun, expliqués en une phrase', () => {
    expect(p2.length).toBeGreaterThanOrEqual(1);
    expect(p2.length).toBeLessThanOrEqual(10);
    for (const s of p2) {
      expect(s.variants.length, s.id).toBeGreaterThanOrEqual(2);
      const sentence = dict[s.currentNote];
      expect(sentence, s.id).toMatch(/^[^.]+\.$/);
      for (const v of s.variants) expect(dict[v.label], `${s.id} ${v.id}`).toBeDefined();
    }
  });

  it('couvre les propositions du cadrage (vent, grincements, néon, cœur, souffle, gémissements lointains, porte, pièce, achat) et le feu demandé par le propriétaire', () => {
    expect(p2.map((s) => s.id).sort()).toEqual(['ambiance-feu', 'ambiance-grincements', 'ambiance-lointains', 'ambiance-neon', 'ambiance-vent', 'interface-achat', 'interface-piece', 'joueur-coeur', 'joueur-essouffle', 'porte-enfoncee']);
  });

  it.each(p2.flatMap((s) => s.variants.map((v) => [s.id, v.id])))('%s %s : dans ses cibles (version 1, macros par défaut)', (id, v) => {
    const s = slotOf(id);
    const r = renderOnce(id, v);
    expect(checkTargets(measureSound(r.samples, r.sampleRate, s, raw.levelRef), s.target, raw.levelRef.tolerance).items.filter((i) => !i.ok)).toEqual([]);
  });

  it.each(p2.filter((s) => s.id !== 'joueur-coeur').map((s) => s.id))('%s : A et B diffèrent par leur couleur (distance spectrale au-dessus du seuil)', (id) => {
    expect(spectralDistance(renderOnce(id, 'A').samples, renderOnce(id, 'B').samples, FORMAT.sampleRate)).toBeGreaterThan(raw.distinctness.threshold);
  });

  it('battement de cœur : A et B diffèrent par le rythme (75 et 112 battements par minute), mesuré par les coups', () => {
    const count = (v) => onsets(renderOnce('joueur-coeur', v).samples, FORMAT.sampleRate, { threshold: 0.3, minGap: 0.08 }).length;
    expect(count('B')).toBeGreaterThan(count('A'));
  });

  it('la porte qui s\'enfonce dure 1,2 s', () => {
    for (const v of ['A', 'B']) expect(renderOnce('porte-enfoncee', v).duration).toBeCloseTo(1.2, 3);
  });
});

describe('boucles sans raccord (vent, néon, feu)', () => {
  const loops = p2.filter((s) => s.loop);
  it('les boucles sont le vent, le néon et le feu, de 8 à 12 s, recettes en boucle', () => {
    expect(loops.map((s) => s.id).sort()).toEqual(['ambiance-feu', 'ambiance-neon', 'ambiance-vent']);
    for (const s of loops) for (const v of s.variants) {
      expect(v.recipe.loop, `${s.id} ${v.id}`).toBe(true);
      expect(v.recipe.dur).toBeGreaterThanOrEqual(8);
      expect(v.recipe.dur).toBeLessThanOrEqual(12);
    }
  });

  it.each(loops.flatMap((s) => s.variants.map((v) => [s.id, v.id])))('%s %s : jonction fin -> début sans saut (< 0,002) et même énergie (±10 %) sur 50 ms de chaque côté, cinq versions', (id, v) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = renderOnce(id, v, seed);
      const s = loopSeam(r.samples, r.sampleRate, 0.05);
      expect(s.jump).toBeLessThan(0.002);
      expect(Math.abs(s.energyRatio - 1)).toBeLessThanOrEqual(0.1);
    }
  });

  it('les cinq versions d\'une boucle sont toutes différentes', () => {
    for (const s of loops) for (const v of s.variants) {
      const bufs = [1, 2, 3, 4, 5].map((seed) => Buffer.from(renderOnce(s.id, v.id, seed).samples.buffer));
      for (let i = 0; i < 5; i += 1) for (let j = i + 1; j < 5; j += 1) expect(bufs[i].equals(bufs[j]), `${s.id} ${v.id} ${i}-${j}`).toBe(false);
    }
  });

  it('rotateToSeam : le point de bouclage choisi a le plus petit saut parmi les points à énergie équilibrée', () => {
    const n = 4410;
    const x = Float64Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 7 * i) / n));
    const y = rotateToSeam(x, 200);
    expect(Math.abs(y[0] - y[n - 1])).toBeLessThanOrEqual(Math.abs(x[0] - x[n - 1]) + 1e-12);
    expect(y.length).toBe(n);
  });

  it('rotateToSeam : rotation pure (mêmes échantillons, autre départ), entrée intacte, entrée hostile sans exception', () => {
    const x = Float64Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.37) * (1 + (i % 7) / 10));
    const copy = Float64Array.from(x);
    const y = rotateToSeam(x, 50);
    expect([...y].sort((a, b) => a - b)).toEqual([...x].sort((a, b) => a - b));
    expect(x).toEqual(copy);
    expect(() => rotateToSeam(null, 'x')).not.toThrow();
  });
});

describe('scènes de 30 s', () => {
  it.each(SCENE_IDS)('%s : déterministe (même graine, mêmes événements ; autre graine, autres événements)', (id) => {
    expect(createScene(id, 1)).toEqual(createScene(id, 1));
    expect(createScene(id, 2).events).not.toEqual(createScene(id, 1).events);
  });

  it.each(SCENE_IDS)('%s : entre 20 et 150 événements, tous dans les 30 s, triés', (id) => {
    const { events, duration } = createScene(id, 1);
    expect(duration).toBe(SCENE_DURATION);
    expect(events.length).toBeGreaterThanOrEqual(20);
    expect(events.length).toBeLessThanOrEqual(150);
    for (let i = 0; i < events.length; i += 1) {
      expect(events[i].t >= 0 && events[i].t < SCENE_DURATION).toBe(true);
      if (i > 0) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
  });

  it('chaque son d\'une scène existe (emplacement de l\'atelier ou son du jeu « ref: »), au bon format', () => {
    const ids = new Set(data.slots.map((s) => s.id));
    const game = new Set(sounds.map((s) => s.id));
    for (const id of SCENE_IDS) for (const e of createScene(id, 1).events) {
      expect(e.sonId.startsWith('ref:') ? game.has(e.sonId.slice(4)) : ids.has(e.sonId), `${id} ${e.sonId}`).toBe(true);
      expect(Object.keys(e).sort()).toEqual(['distance', 'etage', 'etouffement', 'graine', 't', 'sonId', 'variante'].sort());
      expect(['rdc', 'etage']).toContain(e.etage);
      expect(e.variante).toBe(null);
    }
  });

  it('versions : de 1 à 5, jamais deux fois la même de suite pour un même son', () => {
    for (const id of SCENE_IDS) {
      const last = {};
      for (const e of createScene(id, 3).events) {
        expect(e.graine >= 1 && e.graine <= 5).toBe(true);
        expect(e.graine).not.toBe(last[e.sonId]);
        last[e.sonId] = e.graine;
      }
    }
  });

  it('contenu attendu : couloir (pas sur carrelage, voix lointaines étouffées), siège (arrachages, chutes, escalade, une réparation, un coup de feu), meute (pas, voix, frottements)', () => {
    const has = (id, re) => createScene(id, 1).events.filter((e) => re.test(e.sonId));
    expect(has('couloir', /^pas-joueur-dur$/).length).toBeGreaterThan(20);
    expect(has('couloir', /errance$/).every((e) => e.etouffement && e.distance >= 600)).toBe(true);
    expect(has('siege', /^planche-arrachage$/).length).toBe(4);
    expect(has('siege', /^planche-chute$/).length).toBe(4);
    expect(has('siege', /^escalade$/).length).toBe(1);
    expect(has('siege', /^reparation$/).length).toBe(1);
    expect(has('siege', /^ref:tir$/).length).toBe(1);
    expect(has('meute', /^pas-zombie-/).length).toBeGreaterThan(20);
    expect(has('meute', /^zombie-rampe$/).length).toBeGreaterThanOrEqual(2);
    expect(has('meute', /^voix-/).length).toBeGreaterThan(5);
  });

  it('réparation : la durée choisie change la scène (0,4 s : plus de planches que 1,8 s)', () => {
    const n = (d) => createScene('reparation', 1, { repairDuration: d }).events.filter((e) => e.sonId === 'reparation').length;
    expect(n(0.4)).toBeGreaterThan(n(1.8));
    expect(createScene('reparation', 1, { repairDuration: 99 })).toEqual(createScene('reparation', 1, { repairDuration: 1.8 }));
  });

  it('identifiant ou graine hostile : une scène valide, sans exception', () => {
    expect(createScene('inconnue', 'x').id).toBe('couloir');
    expect(() => createScene(null, Number.NaN, null)).not.toThrow();
  });

  it('étage du joueur : la meute monte à 6 s ; les autres restent au rez-de-chaussée', () => {
    const m = createScene('meute', 1);
    expect([listenerFloor(m, 0), listenerFloor(m, 5.9), listenerFloor(m, 6), listenerFloor(m, 29)]).toEqual(['rdc', 'rdc', 'etage', 'etage']);
    expect(listenerFloor(createScene('siege', 1), 20)).toBe('rdc');
    expect(listenerFloor(null, 3)).toBe('rdc');
  });

  it('niveaux relatifs (règles du jeu) : plein gain sous 150, décroissant avec la distance, nul à 1 100', () => {
    const g = (d) => mixFor({ distance: d, etage: 'rdc', etouffement: false }, audio, 'rdc').gain;
    expect(g(0)).toBe(1);
    expect(g(150)).toBe(1);
    expect(g(300)).toBeLessThan(g(200));
    expect(g(1100)).toBe(0);
  });

  it('étouffement : un mur (900 Hz, × 0,6) ; un autre étage (700 Hz, × 0,5, un seul filtre)', () => {
    const wall = mixFor({ distance: 100, etage: 'rdc', etouffement: true }, audio, 'rdc');
    const floor = mixFor({ distance: 100, etage: 'rdc', etouffement: true }, audio, 'etage');
    expect(wall).toEqual({ gain: audio.muffle.gain, lowpassHz: audio.muffle.lowpass });
    expect(floor).toEqual({ gain: audio.floorGain, lowpassHz: audio.floorLowpass });
  });

  it('dans chaque scène, les sons lointains ou étouffés sont moins forts que les sons du joueur', () => {
    for (const id of SCENE_IDS) {
      const sc = createScene(id, 1);
      for (const e of sc.events) {
        const m = mixFor(e, audio, listenerFloor(sc, e.t));
        expect(m.gain >= 0 && m.gain <= 1).toBe(true);
        if (e.distance >= 600 || e.etouffement) expect(m.gain).toBeLessThan(0.5);
      }
    }
  });
});

// Lot 3i : la limite de poids est levée par décision du propriétaire ; la projection affiche le poids et la mémoire sans les comparer
// (avant : limite de huit mégaoctets, champs limit et over).
describe('projection du poids et de la mémoire (sans plafond)', () => {
  const choicesFor = (v) => ({ atelierRaw: raw, sounds, variant: v, measureTime: false });
  const a = project(choicesFor('A'));
  it('variante A partout : poids = référence − tampons remplacés + tampons ajoutés', () => {
    expect(a.refBytes).toBe(6894612);
    expect(a.total).toBe(a.refBytes - a.removedBytes + a.added);
    expect(a.decodedBytes).toBe(a.total);
    expect(a).not.toHaveProperty('limit');
    expect(a.removed.sort()).toEqual(['joueur-chute', 'joueur-releve', 'pas', 'pas-zombie', 'planche-arrachee', 'planche-posee', 'zombie-attaque', 'zombie-blessure', 'zombie-gemissement', 'zombie-mort']);
  });

  it('variante B partout : plus lourde que A (durées × 1,2 pour les voix)', () => {
    expect(project(choicesFor('B')).total).toBeGreaterThan(a.total);
  });

  it('priorité 1 seule, voix lues à la hauteur du type (comme aujourd\'hui) : plus légère que tout intégrer', () => {
    const r = project({ ...choicesFor('A'), p1Only: true, voicePlan: 'hauteur' });
    expect(r.total).toBeLessThan(a.total);
    expect(r.rows.some((row) => row.slot === 'voix-grand-errance')).toBe(false);
  });

  it('un fichier « Mes choix » remplace la variante par défaut des emplacements cités', () => {
    const { choices } = parseChoices('pas-joueur-dur=C(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0)\n', data.slots);
    const r = project({ ...choicesFor('A'), choices });
    expect(r.rows.find((row) => row.slot === 'pas-joueur-dur').variant).toBe('C');
    expect(r.rows.find((row) => row.slot === 'pas-joueur-escalier').variant).toBe('A');
  });

  it('chaque emplacement a un plan d\'intégration (identifiants, remplacés, versions)', () => {
    for (const s of raw.slots) {
      expect(Array.isArray(s.integration?.ids), s.id).toBe(true);
      expect(Array.isArray(s.integration.replaces), s.id).toBe(true);
      expect(Number.isInteger(s.integration.versions), s.id).toBe(true);
      for (const id of s.integration.replaces) expect(sounds.some((x) => x.id === id), id).toBe(true);
    }
  });
});

describe('itération 2 : retours du propriétaire', () => {
  it('le fichier de choix du propriétaire se relit sans erreur (variantes, macros, « actuel », « aucun »)', () => {
    const { choices, errors } = parseChoices(readFileSync('data/game/sounds-atelier-choix.txt', 'utf8'), data.slots);
    expect(errors).toEqual([]);
    expect(choices['voix-marcheur-attaque']).toEqual({ variant: 'C', macros: { hauteur: -6, matiere: 0, grain: 1, duree: 0.7, ampleur: 0 } });
    expect(choices['joueur-relevage']).toEqual({ variant: 'actuel' });
    expect(choices['ambiance-neon']).toEqual({ variant: 'aucun' });
  });

  it('« actuel » et « aucun » : écrits et relus ; « actuel » refusé pour un emplacement sans son actuel', () => {
    const text = serializeChoices({ 'joueur-chute-x': { variant: 'aucun' }, 'joueur-relevage': { variant: 'actuel' } }, data.slots);
    expect(text.split('\n')).toEqual(['joueur-relevage=actuel', 'joueur-chute-x=aucun']);
    expect(parseChoices('escalade=actuel', data.slots).errors.map((e) => e.reason)).toEqual(['actuel']);
  });

  it('projection d\'un fichier de choix : seuls les emplacements cités sont intégrés ; « actuel » et « aucun » n\'ajoutent rien', () => {
    const { choices } = parseChoices('joueur-relevage=actuel\nambiance-neon=aucun\npas-joueur-exterieur=A()', data.slots);
    const r = project({ atelierRaw: raw, sounds, choices, measureTime: false, onlyChosen: true });
    expect(r.rows.map((row) => row.slot)).toEqual(['pas-joueur-exterieur']);
    expect(r.removed).toEqual([]);
  });

  it('pas sur pierre : énergie au-delà de 1 kHz (centroïde ≥ 1 000 Hz), attaque sèche (≤ 6 ms), plus aucun mode accordé au médium', () => {
    for (const id of ['pas-joueur-dur', 'pas-joueur-escalier']) for (const v of ['A', 'B', 'C']) {
      const s = slotOf(id);
      const m = measureSound(renderOnce(id, v).samples, FORMAT.sampleRate, s, raw.levelRef);
      expect(m.centroid, `${id} ${v}`).toBeGreaterThanOrEqual(1000);
      expect(m.attackMs, `${id} ${v}`).toBeLessThanOrEqual(6);
      expect(s.variants.find((x) => x.id === v).recipe.modes ?? [], `${id} ${v}`).toEqual([]);
    }
  });

  it('escalade B : plus de grognement ; gémissements lointains B : faits des voix d\'errance choisies (C) des quatre types', () => {
    expect(slotOf('escalade').variants.find((v) => v.id === 'B').recipe.grunt).toBeUndefined();
    const parts = slotOf('ambiance-lointains').variants.find((v) => v.id === 'B').recipe.parts;
    expect(parts.length).toBe(4);
    for (const type of ['marcheur', 'petit', 'voute', 'grand']) {
      const voice = slotOf(`voix-${type}-errance`).variants.find((v) => v.id === 'C').recipe;
      expect(parts.some((p) => p.f0 === voice.f0 && p.formantScale === voice.formantScale), type).toBe(true);
    }
  });

  it('bois et marteau de la réparation : modes denses très amortis (≥ 10 modes, décroissance ≤ 40 ms), plus de résonance accordée', () => {
    for (const id of ['planche-arrachage', 'planche-chute', 'reparation']) for (const v of slotOf(id).variants) {
      const r = v.recipe;
      const dense = r.splinter?.dense ?? r.dense ?? r.hit?.body?.dense;
      expect(dense.count, `${id} ${v.id}`).toBeGreaterThanOrEqual(10);
      expect(dense.decay, `${id} ${v.id}`).toBeLessThanOrEqual(0.04);
    }
  });

  it('planche arrachée : on entend le bois céder puis la planche tomber (au moins trois coups séparés)', () => {
    for (const v of ['A', 'B', 'C']) expect(onsets(renderOnce('planche-arrachage', v).samples, FORMAT.sampleRate, { threshold: 0.2, minGap: 0.08 }).length, v).toBeGreaterThanOrEqual(3);
  });
});

describe('format de « Mes choix »', () => {
  it('nombres : deux décimales au plus, jamais « -0 »', () => {
    expect([formatNumber(1.234), formatNumber(-0.001), formatNumber(2), formatNumber(Number.NaN), formatNumber(-1.5)]).toEqual(['1.23', '0', '2', '0', '-1.5']);
  });

  it('ordre des lignes : celui des emplacements', () => {
    const text = serializeChoices({ 'joueur-relevage': { variant: 'A', macros: {} }, 'pas-joueur-dur': { variant: 'C', macros: {} } }, data.slots);
    expect(text.split('\n').map((l) => l.split('=')[0])).toEqual(['pas-joueur-dur', 'joueur-relevage']);
  });

  it('lecture : lignes vides et commentaires ignorés, macros bornées aux limites de la variante', () => {
    const r = parseChoices('# mes choix\n\npas-joueur-dur=B(hauteur=-99,grain=5)\n', data.slots);
    expect(r.errors).toEqual([]);
    expect(r.choices['pas-joueur-dur'].macros.hauteur).toBe(-6);
    expect(r.choices['pas-joueur-dur'].macros.grain).toBe(2);
  });

  it('lecture : chaque ligne invalide est signalée avec sa raison (format, macro, emplacement, variante)', () => {
    const r = parseChoices('n importe quoi\npas-joueur-dur=A(volume=3)\ninconnu=A()\npas-joueur-dur=Z()', data.slots);
    expect(r.errors.map((e) => e.reason)).toEqual(['format', 'macro', 'emplacement', 'variante']);
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4]);
  });

  it('sans liste d\'emplacements : lecture brute, sans bornes', () => {
    expect(parseChoices('x-y=B(hauteur=12)').choices).toEqual({ 'x-y': { variant: 'B', macros: { hauteur: 12 } } });
  });

  it('entrées hostiles : jamais d\'exception, résultat vide', () => {
    for (const bad of [null, undefined, 42, {}, [], 'a'.repeat(10000)]) {
      expect(() => parseChoices(bad, data.slots)).not.toThrow();
      expect(() => serializeChoices(bad, data.slots)).not.toThrow();
    }
    expect(serializeChoices({ 'pas-joueur-dur': { variant: 'trop long', macros: {} }, 'Bad Id': { variant: 'A' } })).toBe('');
  });

  it('aller-retour pour tous les emplacements à la fois (macros aux bornes)', () => {
    const choices = {};
    for (const s of data.slots) choices[s.id] = { variant: s.variants.at(-1).id, macros: { hauteur: -6, matiere: 1, grain: 0, ampleur: 0.6 } };
    const text = serializeChoices(choices, data.slots);
    expect(text.split('\n').length).toBe(data.slots.length);
    const back = parseChoices(text, data.slots);
    expect(back.errors).toEqual([]);
    expect(serializeChoices(back.choices, data.slots)).toBe(text);
  });
});
