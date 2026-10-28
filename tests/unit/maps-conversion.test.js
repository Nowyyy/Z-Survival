import { describe, it, expect } from 'vitest';
import { cleanParams, cleanPlan, DEFAULT_MAP_ID, DEFAULT_PARAMS, mergeInterstices, planToWorld, resolveMapId, windowGap, windowZone } from '../../js/core/maps.js';
import { formatJson, generateMapFiles } from '../../scripts/plan-vers-monde.mjs';
import { readFileSync } from 'node:fs';
import { deepFreeze, params, plan, px, WEIRD, world } from './helpers/carte.js';

const out = planToWorld(plan, params);
const bySide = (id) => world.windows.find((w) => w.id === id);

describe('conversion plan -> monde : formule, origine, échelle', () => {
  it('x_monde = (x_px - x0) * 5 + 800 et y_monde = (y_px - y0) * 5 + 800, (x0, y0) = coin haut gauche de la boîte englobante', () => {
    const { x0, y0 } = plan.bbox;
    expect(px(x0, y0)).toEqual({ x: 800, y: 800 });
    expect(px(x0 + 100, y0 + 40)).toEqual({ x: 1300, y: 1000 });
  });

  it('planToWorld applique la formule aux sommets du contour (12 sommets)', () => {
    expect(out.world.contour.length).toBe(12);
    plan.contour.forEach(([x, y], i) => expect(out.world.contour[i]).toEqual([px(x, y).x, px(x, y).y]));
    expect(out.world.contour[0]).toEqual([1045, 900]);
  });

  it('le départ du joueur est converti avec la même formule', () => {
    expect(out.world.start).toEqual(px(plan.start[0], plan.start[1]));
  });

  it('taille du monde = boîte englobante du plan + 2 × 800, arrondie au multiple de 20 supérieur : 4 040 × 3 460', () => {
    const { x0, y0, x1, y1 } = plan.bbox;
    expect(out.world.size).toEqual({ width: Math.ceil(((x1 - x0) * 5 + 1600) / 20) * 20, height: Math.ceil(((y1 - y0) * 5 + 1600) / 20) * 20 });
    expect(out.world.size).toEqual({ width: 4040, height: 3460 });
  });

  it('la boîte englobante du bâtiment (room) est celle du contour converti', () => {
    const xs = out.world.contour.map((c) => c[0]);
    const ys = out.world.contour.map((c) => c[1]);
    expect(out.world.room).toEqual({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), wall: 0 });
  });

  it('une autre échelle ou une autre marge change le monde en conséquence (aucun chiffre en dur)', () => {
    const big = planToWorld(plan, { ...params, scale: 4, margin: 400 });
    const [cx, cy] = plan.contour[0];
    expect(big.world.contour[0]).toEqual([(cx - plan.bbox.x0) * 4 + 400, (cy - plan.bbox.y0) * 4 + 400]);
    expect(big.world.size.width).toBe(Math.ceil(((plan.bbox.x1 - plan.bbox.x0) * 4 + 800) / 20) * 20);
  });

  it('les ouvertures sans porte sont converties : aile / grande salle (85 de large) et passage vers le haut de l\'aile', () => {
    const aile = out.world.openings.find((o) => o.id === 'ouverture-aile');
    const haut = out.world.openings.find((o) => o.id === 'ouverture-haut');
    expect(Math.abs(aile.y2 - aile.y1)).toBe(85);
    expect(Math.abs(haut.x2 - haut.x1)).toBeGreaterThan(300);
  });

  it('les murs sont des segments (contour puis murs intérieurs) d\'épaisseur 40', () => {
    expect(out.world.walls.length).toBe(15);
    expect(out.world.wallThickness).toBe(40);
    expect(out.world.wallHeight).toBe(60);
  });
});

describe('fenêtres : positions du plan, largeur 72, décalage maximal de 50 unités', () => {
  it('les fenêtres du plan (relevées sur le modèle) ne sont pas décalées', () => {
    expect(out.report.shifts).toEqual([]);
    for (const w of plan.windows) expect(bySide(w.id)).toMatchObject({ x: px(w.x, w.y).x, y: px(w.x, w.y).y, side: w.side });
  });

  it('aucune fenêtre n\'est décalée de plus de 50 unités (décalages automatiques compris)', () => {
    for (const s of out.report.shifts) expect(s.units, s.id).toBeLessThanOrEqual(50);
  });

  it('un pilier dans la zone d\'une fenêtre la fait glisser le long du mur, sans dépasser 50 unités', () => {
    const tiny = {
      bbox: { x0: 0, y0: 0, x1: 100, y1: 80 },
      contour: [[10, 10], [90, 10], [90, 70], [10, 70]],
      windows: [{ id: 'A', side: 'nord', x: 50, y: 10 }],
      pillars: [[58, 18]],
      pillarSize: 6,
      start: [20, 60],
    };
    const r = planToWorld(tiny, params);
    const shift = r.report.shifts.find((s) => s.id === 'A');
    expect(shift.auto).toBe(true);
    expect(shift.units).toBeGreaterThan(0);
    expect(shift.units).toBeLessThanOrEqual(50);
    const zone = windowZone(r.world.windows[0], 72, 150, 40);
    for (const o of r.world.obstacles) expect(o.x >= zone.x + zone.w || o.x + o.w <= zone.x || o.y >= zone.y + zone.h || o.y + o.h <= zone.y).toBe(true);
  });

  it('windowGap et windowZone : ouverture de toute l\'épaisseur, zone de 150 derrière la face intérieure', () => {
    expect(windowGap({ side: 'nord', x: 1000, y: 800 }, 140, 40)).toEqual({ x: 930, y: 780, w: 140, h: 40 });
    expect(windowGap({ side: 'est', x: 1000, y: 800 }, 140, 40)).toEqual({ x: 980, y: 730, w: 40, h: 140 });
    expect(windowZone({ side: 'sud', x: 1000, y: 800 }, 140, 150, 40)).toEqual({ x: 930, y: 630, w: 140, h: 150 });
    expect(windowZone({ side: 'ouest', x: 1000, y: 800 }, 140, 150, 40)).toEqual({ x: 1020, y: 730, w: 150, h: 140 });
    expect(windowGap({ side: 'x' }, 140, 40)).toBeNull();
  });
});

describe('fusion des interstices', () => {
  const item = (id, x, y, w = 50, h = 50) => ({ id, rect: { x, y, w, h } });

  it('deux obstacles à 40 unités l\'un de l\'autre sont fusionnés : le rectangle englobant les remplace', () => {
    const r = mergeInterstices([item('a', 0, 0), item('b', 90, 0)], 90);
    expect(r.items.length).toBe(1);
    expect(r.items[0].rect).toEqual({ x: 0, y: 0, w: 140, h: 50 });
    expect(r.items[0].parts).toEqual(['a', 'b']);
    expect(r.merges).toEqual([{ id: 'a+b', parts: ['a', 'b'] }]);
  });

  it('deux obstacles à 90 unités restent séparés', () => {
    expect(mergeInterstices([item('a', 0, 0), item('b', 140, 0)], 90).items.length).toBe(2);
  });

  it('deux obstacles au contact restent séparés', () => {
    expect(mergeInterstices([item('a', 0, 0), item('b', 50, 0)], 90).items.length).toBe(2);
  });

  it('deux obstacles qui se recouvrent sont fusionnés', () => {
    expect(mergeInterstices([item('a', 0, 0), item('b', 30, 10)], 90).items.length).toBe(1);
  });

  it('la fusion se propage en chaîne (a-b à 40, b-c à 40 : un seul bloc)', () => {
    const r = mergeInterstices([item('a', 0, 0), item('b', 90, 0), item('c', 180, 0)], 90);
    expect(r.items.length).toBe(1);
    expect(r.items[0].rect.w).toBe(230);
  });

  it('canMerge peut interdire une fusion ; la hauteur du bloc est la plus grande', () => {
    expect(mergeInterstices([item('a', 0, 0), item('b', 90, 0)], 90, () => false).items.length).toBe(2);
    const r = mergeInterstices([{ ...item('a', 0, 0), hauteur: 40 }, { ...item('b', 90, 0), hauteur: 70 }], 90);
    expect(r.items[0].hauteur).toBe(70);
  });

  it('dans la carte : les blocs fusionnés du rapport sont des obstacles du monde', () => {
    for (const m of out.report.merged) expect(out.world.obstacles.find((o) => o.id === m.id), m.id).toBeDefined();
    expect(out.world.generation.merged).toEqual(out.report.merged);
  });
});

describe('resolveMapId', () => {
  it.each([
    [undefined, DEFAULT_MAP_ID], [null, DEFAULT_MAP_ID], ['', DEFAULT_MAP_ID], ['?', DEFAULT_MAP_ID], ['?test=1', DEFAULT_MAP_ID],
    ['?map=salle', 'salle'], ['map=salle', 'salle'], ['?test=1&map=salle&seed=3', 'salle'], ['?map=rez-de-chaussee', 'rez-de-chaussee'],
    ['?map=inconnue', DEFAULT_MAP_ID], ['?map=', DEFAULT_MAP_ID], ['?map=SALLE', DEFAULT_MAP_ID], ['?map=salle%00', DEFAULT_MAP_ID],
    ['?map=../etc', DEFAULT_MAP_ID], ['?map=<script>', DEFAULT_MAP_ID], [42, DEFAULT_MAP_ID], [{}, DEFAULT_MAP_ID], [['map=salle'], DEFAULT_MAP_ID],
  ])('%j -> %s', (input, expected) => {
    expect(resolveMapId(input)).toBe(expected);
  });

  it('une chaîne démesurée ou mal encodée retombe sur la carte par défaut sans exception', () => {
    expect(resolveMapId(`?map=salle${'a'.repeat(5000)}`)).toBe(DEFAULT_MAP_ID);
    expect(() => resolveMapId('?map=%E0%A4%A')).not.toThrow();
    expect(resolveMapId('?map=salle&map=x')).toBe('salle');
  });
});

describe('planToWorld : pureté, déterminisme, entrées hostiles', () => {
  it('déterministe : deux appels donnent exactement le même résultat', () => {
    expect(planToWorld(plan, params)).toEqual(planToWorld(plan, params));
  });

  it('ne modifie pas ses arguments (plan et paramètres gelés en profondeur)', () => {
    const frozenPlan = deepFreeze(structuredClone(plan));
    const frozenParams = deepFreeze(structuredClone(params));
    expect(() => planToWorld(frozenPlan, frozenParams)).not.toThrow();
    expect(planToWorld(frozenPlan, frozenParams).world).toEqual(out.world);
  });

  it('renvoie de nouveaux objets : modifier le résultat ne change pas un second appel', () => {
    const a = planToWorld(plan, params);
    a.world.obstacles.length = 0;
    a.world.windows[0].x = -1;
    expect(planToWorld(plan, params).world.windows[0].x).toBe(out.world.windows[0].x);
  });

  it.each(WEIRD.map((w) => [JSON.stringify(w) ?? String(w), w]))('plan hostile %s : aucun monde, aucune exception', (_n, bad) => {
    const r = planToWorld(bad, params);
    expect(r.world).toBeNull();
    expect(r.decor).toBeNull();
    expect(r.report.valid).toBe(false);
  });

  it('paramètres hostiles : les valeurs de repli s\'appliquent', () => {
    for (const bad of WEIRD) expect(() => planToWorld(plan, bad)).not.toThrow();
    expect(planToWorld(plan, null).world.size).toEqual({ width: 4040, height: 3460 });
    expect(planToWorld(plan, { scale: -3, margin: 'x', windowSize: NaN }).world.windowSize).toBe(72);
  });

  it('cleanPlan et cleanParams ne lèvent pas d\'exception', () => {
    for (const bad of WEIRD) {
      expect(() => cleanPlan(bad)).not.toThrow();
      expect(() => cleanParams(bad)).not.toThrow();
    }
    expect(cleanPlan({})).toBeNull();
    expect(cleanPlan({ bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, contour: [[0, 0]] })).toBeNull();
  });

  it('DEFAULT_PARAMS est identique à data/game/maps/params.json (hors clés commentaires)', () => {
    const { _provisoire, ...file } = params;
    expect(_provisoire).toBeTypeOf('string');
    expect(cleanParams(file)).toEqual(cleanParams(DEFAULT_PARAMS));
    expect(file).toEqual(DEFAULT_PARAMS);
  });

  it('un plan sans fenêtre ni obstacle donne un monde valide', () => {
    const r = planToWorld({ bbox: { x0: 0, y0: 0, x1: 100, y1: 100 }, contour: [[10, 10], [90, 10], [90, 90], [10, 90]] }, params);
    expect(r.world.windows).toEqual([]);
    expect(r.world.obstacles).toEqual([]);
    expect(r.report.valid).toBe(true);
  });
});

describe('fichiers versionnés = sortie du script (aucune retouche à la main)', () => {
  const files = generateMapFiles('rez-de-chaussee');

  it('world.json est identique à la sortie de npm run carte', () => {
    expect(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8')).toBe(files.world);
  });

  it('decor.json est identique à la sortie de npm run carte', () => {
    expect(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8')).toBe(files.decor);
  });

  it('les fichiers se relisent en JSON et correspondent à planToWorld', () => {
    expect(JSON.parse(files.world)).toEqual(JSON.parse(JSON.stringify(out.world)));
    expect(JSON.parse(files.decor)).toEqual(JSON.parse(JSON.stringify(out.decor)));
  });

  it('formatJson : objets simples sur une ligne, tableaux de nombres aussi, résultat toujours du JSON valide', () => {
    const text = formatJson({ a: 1, b: [1, 2], c: { d: 'x', e: [{ f: 1 }] } });
    expect(JSON.parse(text)).toEqual({ a: 1, b: [1, 2], c: { d: 'x', e: [{ f: 1 }] } });
    expect(formatJson({ a: 1, b: [1, 2] })).toBe('{ "a": 1, "b": [1, 2] }');
    expect(formatJson([])).toBe('[]');
  });

  it('une carte inconnue fait échouer le script avec un message clair', () => {
    expect(() => generateMapFiles('nexiste-pas')).toThrow();
  });
});
