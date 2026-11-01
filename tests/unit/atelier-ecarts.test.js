// Lot 3g, partie A : comparaison carte / relevé (js/core/ecarts.js), dessin SVG (js/core/ecarts-svg.js), visite (js/core/visite.js),
// releve.json (taille, schéma) et ecarts-decisions.json (brouillon). Fixtures en mémoire ; aucun test ne lit le modèle.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { ACTIONS, NATURES, WINDOW_MAX_SHIFT, compareFloor, countByLevel, distToSegments, draftDecisions, groupTouching, kindOf, modelWindows, rowBox } from '../../js/core/ecarts.js';
import { ecartsToSvg, pxRect } from '../../js/core/ecarts-svg.js';
import { hasUpperFloor, visitLinks, visitWave } from '../../js/core/visite.js';
import { LEVELS } from '../../js/core/releve.js';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));

// Petite carte de fixture (pixels) : une salle de 100 × 60, une fenêtre au nord, un pilier, deux meubles (dont un provisoire).
const PLAN = {
  contour: [[0, 0], [100, 0], [100, 60], [0, 60]],
  walls: [],
  openings: [],
  windows: [{ id: 'F1', side: 'nord', x: 50, y: 0 }],
  pillars: [[30, 30]],
  stairs: [],
  furniture: [{ id: 'M1', x0: 70, y0: 40, x1: 80, y1: 50, kind: 'table' }, { id: 'P1', x0: 10, y0: 40, x1: 20, y1: 50, kind: 'caisse', provisional: true }],
};
const wall = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, inside: false, axis: x1 - x0 >= y1 - y0 ? 'h' : 'v', thickness: Math.min(x1 - x0, y1 - y0) });
const RELEVE = {
  floors: {
    rdc: {
      walls: [wall(-2, -2, 44, 2), wall(56, -2, 102, 2), wall(-2, 58, 102, 62), wall(-2, -2, 2, 62), wall(98, -2, 102, 62)],
      pillars: [{ id: 'MP1', x: 34, y: 30, size: 7 }, { id: 'MP2', x: 60, y: 20, size: 7 }],
      lines: [],
    },
  },
  stairs: [],
  windows: [{ id: 'MW1', floor: 'rdc', x0: 44, y0: -1, x1: 56, y1: 1, x: 50, y: 0, width: 12, axis: 'h', components: ['Component_6'] }],
  groups: [
    { key: 'G1', floor: 'rdc', plan: { x0: 73, y0: 40, x1: 83, y1: 50 }, klass: 'meuble', components: ['Component_2'], ids: ['O1'], top: 0.6 },
    { key: 'G2', floor: 'rdc', plan: { x0: 11, y0: 41, x1: 21, y1: 49 }, klass: 'meuble', components: ['shelf'], ids: ['O2'], top: 2.1 },
    { key: 'G3', floor: 'rdc', plan: { x0: 40, y0: 20, x1: 48, y1: 26 }, klass: 'meuble', components: ['shelf'], ids: ['O3'], top: 2.1 },
    { key: 'G4', floor: 'rdc', plan: { x0: 85, y0: 10, x1: 90, y1: 14 }, klass: 'decor-leger', components: ['sandbag'], ids: ['O4'], top: 0.1 },
  ],
  objects: [{ id: 'O9', floor: 'rdc', outside: false, rule: 'haut', component: 'Component_9', bottom: 1.6, top: 2 }],
};
const result = compareFloor(PLAN, RELEVE, 'rdc');
const byId = (id) => result.rows.find((r) => r.id === id);

describe('comparaison d\'un étage (fixture)', () => {
  it('chaque ligne a une nature, un niveau et une action connus', () => {
    for (const r of result.rows) {
      expect(NATURES).toContain(r.nature);
      expect(LEVELS).toContain(r.level);
      expect(ACTIONS).toContain(r.action);
    }
  });

  it('murs du contour conformes : écart sous 15, « garder »', () => {
    for (const id of ['contour-1', 'contour-2', 'contour-3', 'contour-4']) expect(byId(id)).toMatchObject({ nature: 'mur', level: 'moins-15', action: 'garder' });
  });

  it('fenêtre F1 associée à l\'ouvrage du modèle, sans écart', () => {
    expect(byId('F1')).toMatchObject({ ref: 'MW1', level: 'moins-15', action: 'garder' });
  });

  it('pilier décalé de 4 px (20 unités) : corriger vers le modèle', () => {
    expect(byId('pilier 30,30')).toMatchObject({ ref: 'MP1', delta: 20, level: '15-60', action: 'corriger', to: { at: [34, 30] } });
  });

  it('pilier du modèle sans équivalent : à approuver (plus de 60)', () => {
    expect(byId('MP2')).toMatchObject({ level: 'plus-60', action: 'ajouter' });
  });

  it('meuble relevé décalé de 3 px : corriger', () => {
    expect(byId('M1')).toMatchObject({ ref: 'G1', delta: 15, level: '15-60', action: 'corriger' });
    expect(byId('M1').to).toMatchObject({ x0: 73, x1: 83, kind: 'table' });
  });

  it('pièce provisoire associée : remplacer par la pièce du modèle (genre du composant)', () => {
    expect(byId('P1')).toMatchObject({ ref: 'G2', action: 'remplacer' });
    expect(byId('P1').to.kind).toBe('etagere');
  });

  it('objet du modèle sans équivalent : meuble → ajouter (15-60), décor léger → garder', () => {
    expect(byId('G3')).toMatchObject({ nature: 'objet', action: 'ajouter', level: '15-60' });
    expect(byId('G4')).toMatchObject({ nature: 'objet', action: 'garder', level: 'moins-15' });
    expect(result.unmatchedObjects.map((g) => g.key)).toEqual(['G3', 'G4']);
  });

  it('objets au-dessus de 1,2 m listés à part', () => {
    expect(result.high.map((o) => o.id)).toEqual(['O9']);
  });

  it('chaque ligne a une boîte (pixels) pour le dessin', () => {
    for (const r of result.rows) expect(r.box, r.id).toBeTruthy();
  });

  it('comptes par niveau et par nature', () => {
    const c = countByLevel(result.rows);
    expect(c['15-60'].pilier).toBe(1);
    expect(c['plus-60'].pilier).toBe(1);
    expect(countByLevel(null)).toEqual({});
  });

  it('entrées invalides : aucune ligne, aucune exception', () => {
    expect(compareFloor(null, null).rows).toEqual([]);
    expect(compareFloor(PLAN, { floors: {} }, 'rdc').rows).toEqual([]);
  });

  it('une fenêtre ne bouge jamais de plus de 50 unités par rapport à sa position d\'origine', () => {
    expect(WINDOW_MAX_SHIFT).toBe(50);
    const plan = { ...PLAN, windows: [{ id: 'F1', side: 'nord', x: 45, y: 0, planX: 38 }] };
    const r = compareFloor(plan, RELEVE, 'rdc').rows.find((x) => x.id === 'F1');
    expect(r.action).toBe('garder');
    expect(r.reason).toMatch(/plus de 50/);
  });

  it('un mur longé sur moins de la moitié n\'est jamais corrigé (modèle peu net)', () => {
    const rel = { ...RELEVE, floors: { rdc: { ...RELEVE.floors.rdc, walls: [wall(-2, 4, 20, 8), wall(-2, 58, 102, 62), wall(-2, -2, 2, 62), wall(98, -2, 102, 62)] } } };
    expect(compareFloor(PLAN, rel, 'rdc').rows.find((x) => x.id === 'contour-1')).toMatchObject({ action: 'garder' });
  });
});

describe('aides de comparaison', () => {
  it('distance à des segments', () => {
    expect(distToSegments(5, 3, [{ x1: 0, y1: 0, x2: 10, y2: 0 }])).toBe(3);
    expect(distToSegments(0, 0, [])).toBe(Infinity);
  });

  it('genre proposé d\'après le composant', () => {
    expect(kindOf(['shelf'])).toBe('etagere');
    expect(kindOf(['Vertical_filing_short'])).toBe('armoire');
    expect(kindOf(['Bar_stool'])).toBe('table');
    expect(kindOf(['Call_of_Duty__World_at_War_Nazi_Zombies__Mystery_Box_'])).toBe('caisse');
    expect(kindOf(null)).toBe('caisse');
  });

  it('rectangles qui se touchent : un groupe', () => {
    const g = groupTouching([{ x0: 0, y0: 0, x1: 10, y1: 1 }, { x0: 10, y0: 0, x1: 11, y1: 10 }, { x0: 50, y0: 50, x1: 51, y1: 51 }]);
    expect(g.map((x) => x.ids.length).sort()).toEqual([1, 2]);
  });

  it('fenêtres du modèle : un ouvrage loin du contour (barrière extérieure) est écarté', () => {
    const rel = { windows: [{ id: 'a', floor: 'rdc', x: 50, y: 0, width: 12 }, { id: 'b', floor: 'rdc', x: 50, y: -40, width: 12 }] };
    expect(modelWindows(rel, 'rdc', [], PLAN.contour).map((w) => w.id)).toEqual(['a']);
  });

  it('boîte d\'une ligne inconnue : nulle', () => {
    expect(rowBox({ nature: 'autre' }, { plan: PLAN })).toBeNull();
  });
});

describe('brouillon de décisions', () => {
  const rows = [
    { id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 1 }, reason: 'r', level: '15-60' },
    { id: 'G9', floor: 'rdc', action: 'ajouter', to: { x0: 1 }, reason: 'r', level: 'plus-60' },
  ];

  it('plus-60 : approved false ; 15-60 : sans approved', () => {
    const d = draftDecisions(rows);
    expect(d[0].approved).toBeUndefined();
    expect(d[1].approved).toBe(false);
  });

  it('l\'accord du propriétaire déjà donné est conservé', () => {
    const d = draftDecisions(rows, [{ id: 'G9', floor: 'rdc', approved: true }]);
    expect(d[1].approved).toBe(true);
  });

  it('champs exacts : id, floor, action, to, reason, level (et approved)', () => {
    for (const d of draftDecisions(rows)) expect(Object.keys(d).filter((k) => k !== 'approved').sort()).toEqual(['action', 'floor', 'id', 'level', 'reason', 'to']);
    expect(draftDecisions(null)).toEqual([]);
  });
});

describe('dessin SVG des écarts', () => {
  const world = load(`${DIR}/world.json`);
  const releve = load(`${DIR}/releve.json`);
  const plan = load(`${DIR}/plan.json`);
  const rows = compareFloor(plan, releve, 'rdc').rows;
  const svg = ecartsToSvg(releve, world, { floor: 'rdc', rows, labels: { title: 'Titre <&>', desc: 'd', scale: '500 unités', big: '> 60' } });

  it('produit un SVG avec titre échappé', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Titre &lt;&amp;&gt;');
    expect(svg).toContain('&gt; 60');
  });

  it('identifiants du mobilier et des fenêtres dessinés', () => {
    for (const id of ['F1', 'F8', 'P13', 'M22']) expect(svg).toContain(`>${id}<`);
  });

  it('relevé en pointillés (classe releve) et objets sans équivalent (classe objet-sans)', () => {
    expect((svg.match(/class="releve /g) ?? []).length).toBeGreaterThan(50);
    expect(svg).toContain('objet-sans');
  });

  it('un cadre par écart de plus de 60 unités', () => {
    const big = rows.filter((r) => r.level === 'plus-60').length;
    expect((svg.match(/class="ecart"/g) ?? []).length).toBe(big);
  });

  it('échelle de 500 unités', () => {
    const m = /<line class="echelle-trait" x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"/.exec(svg);
    expect(Number(m[2]) - Number(m[1])).toBe(500);
  });

  it('déterministe, aucune couleur en dur', () => {
    expect(ecartsToSvg(releve, world, { floor: 'rdc', rows })).toBe(ecartsToSvg(releve, world, { floor: 'rdc', rows }));
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}\b(?!-)|rgb\(/);
  });

  it('entrées invalides : chaîne vide, aucune exception', () => {
    expect(ecartsToSvg(null, null)).toBe('');
    expect(ecartsToSvg({}, { size: { width: 0, height: 0 } })).toBe('');
    expect(typeof ecartsToSvg(null, world, null)).toBe('string');
  });

  it('pxRect : 1 px = 5 unités', () => {
    expect(pxRect({ x0: 0, y0: 0, x1: 2, y1: 4 }, world.transform)).toMatchObject({ w: 10, h: 20 });
    expect(pxRect(null)).toBeNull();
  });
});

describe('visite libre (logique pure)', () => {
  it('N_VISITE = dernière porte non planned + 1', () => {
    expect(visitWave({ doors: [{ openAfterWave: 10 }, { openAfterWave: 30 }, { openAfterWave: 20 }] })).toBe(31);
    expect(visitWave({ doors: [{ openAfterWave: 10 }, { openAfterWave: 30, planned: true }] })).toBe(11);
  });

  it('aucune porte : 1 ; entrées inattendues : 1, sans exception', () => {
    expect(visitWave({ doors: [] })).toBe(1);
    for (const z of [null, undefined, 'x', 3, [], { doors: 'x' }, { doors: [null, { openAfterWave: 'x' }, { openAfterWave: -5 }] }]) expect(visitWave(z)).toBe(1);
  });

  it('zones.json réel : 31 (portes 10, 20, 30)', () => {
    expect(visitWave(load(`${DIR}/zones.json`))).toBe(31);
  });

  it('étage présent dans zones.json', () => {
    expect(hasUpperFloor(load(`${DIR}/zones.json`))).toBe(true);
    expect(hasUpperFloor({ floors: ['rdc'] })).toBe(false);
    expect(hasUpperFloor(null)).toBe(false);
  });

  it('liens : nospawn et la manche, zoom, étiquettes, étage, écarts', () => {
    const links = visitLinks(31, true);
    expect(links.map((l) => l.href)).toEqual(['jeu.html?nospawn=1&wave=31', 'jeu.html?nospawn=1&wave=31&zoom=1', 'jeu.html?nospawn=1&wave=31&labels=1', 'jeu.html?nospawn=1&wave=31&floor=1', 'jeu.html?nospawn=1&wave=31&floor=1&zoom=1', 'ecarts.html']);
    expect(visitLinks(11, false).some((l) => l.href.includes('floor'))).toBe(false);
    expect(visitLinks('x')[0].href).toBe('jeu.html?nospawn=1&wave=1');
  });

  it('chaque lien a un texte dans fr.json', () => {
    const fr = load('data/i18n/fr.json');
    for (const l of visitLinks(31, true)) expect(typeof fr[l.key], l.key).toBe('string');
  });
});

describe('releve.json et ecarts-decisions.json', () => {
  const releve = load(`${DIR}/releve.json`);
  const decisions = load(`${DIR}/ecarts-decisions.json`);

  it('releve.json fait 300 Ko au plus', () => {
    expect(statSync(`${DIR}/releve.json`).size).toBeLessThanOrEqual(300 * 1024);
  });

  it('schéma : calage, niveaux, étages (murs, parois, piliers), escaliers, fenêtres, objets, groupes, matières', () => {
    expect(Object.keys(releve).sort()).toEqual(['_provisoire', 'calage', 'floors', 'groups', 'levels', 'materials', 'objects', 'source', 'stairs', 'windows'].sort());
    expect(Object.keys(releve.floors).sort()).toEqual(['etage', 'rdc']);
    for (const f of Object.values(releve.floors)) {
      expect(f.walls.length).toBeGreaterThan(20);
      for (const w of f.walls) expect(w.x1 > w.x0 && w.y1 > w.y0).toBe(true);
      expect(Array.isArray(f.lines) && Array.isArray(f.pillars)).toBe(true);
    }
    for (const o of releve.objects) expect(['meuble', 'pilier', 'escalier', 'decor-leger', 'inconnu', 'fenetre']).toContain(o.klass);
  });

  it('géométrie seulement : aucune image, aucune donnée encodée', () => {
    const text = readFileSync(`${DIR}/releve.json`, 'utf8');
    expect(text).not.toMatch(/data:|base64|<svg|\.(png|jpe?g)"\s*:/i);
    for (const m of releve.materials) expect(Object.keys(m).sort()).toEqual(['color', 'name', 'texture', 'triangles']);
  });

  it('calage : au moins 85 % du contour à 1 px de la coupe', () => {
    expect(releve.calage.residu.score).toBeGreaterThanOrEqual(85);
  });

  it('décisions : champs valides ; plus-60 jamais approuvée par défaut', () => {
    for (const d of decisions.decisions) {
      expect(ACTIONS).toContain(d.action);
      expect(LEVELS).toContain(d.level);
      expect(['rdc', 'etage']).toContain(d.floor);
      if (d.level === 'plus-60') expect(d.approved).not.toBe(true);
    }
  });

  it('le rapport Docs/ref/ecarts-modele.md existe et cite chaque niveau', () => {
    const md = readFileSync('Docs/ref/ecarts-modele.md', 'utf8');
    for (const lv of LEVELS) expect(md).toContain(lv);
    expect(md).toMatch(/Calage/);
  });
});
