// Lot 3g, partie B : décisions rejouables (js/core/decisions.js) sur des fixtures en mémoire : idempotence, refus des décisions non approuvées,
// identifiant introuvable, plafond de 60 unités, fenêtres (50 unités de leur origine), format des sources.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_SHIFT, STATUS, WINDOW_MAX_FROM_ORIGIN, addedId, applyDecisions, formatSource } from '../../js/core/decisions.js';

const PLAN = {
  id: 'fixture',
  contour: [[0, 0], [100, 0], [100, 60], [0, 60]],
  walls: [{ id: 'mur-interieur-1', x1: 50, y1: 0, x2: 50, y2: 30 }],
  windows: [{ id: 'F1', side: 'nord', x: 20, y: 0 }, { id: 'F2', side: 'est', x: 100, y: 30, planY: 28 }],
  pillars: [[30, 30], [70, 30]],
  furniture: [
    { id: 'M1', x0: 10, y0: 40, x1: 20, y1: 50, kind: 'table' },
    { id: 'P1', x0: 60, y0: 40, x1: 70, y1: 50, kind: 'caisse', provisional: true },
    { id: 'M2', x0: 80, y0: 40, x1: 90, y1: 50, kind: 'comptoir' },
  ],
};
const ETAGE = { id: 'etage', contour: [[0, 0], [50, 0], [50, 50], [0, 50]], windows: [{ id: 'U1', side: 'ouest', x: 0, y: 20 }], pillars: [], furniture: [] };
const SRC = { rdc: PLAN, etage: ETAGE };
const run = (decisions, src = SRC) => applyDecisions(src, decisions);
const status = (r, id) => r.report.find((x) => x.id === id)?.status;

describe('décisions : application', () => {
  it('corriger un meuble (15-60) : rectangle remplacé, genre conservé', () => {
    const r = run([{ id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 12, y0: 40, x1: 22, y1: 50, kind: 'table' }, level: '15-60' }]);
    expect(status(r, 'M1')).toBe(STATUS.done);
    expect(r.sources.rdc.furniture[0]).toEqual({ id: 'M1', x0: 12, y0: 40, x1: 22, y1: 50, kind: 'table' });
  });

  it('remplacer une pièce provisoire : plus de provisional, source modele, nouveau genre', () => {
    const r = run([{ id: 'P1', floor: 'rdc', action: 'remplacer', to: { x0: 61, y0: 40, x1: 68, y1: 52, kind: 'etagere' }, level: '15-60' }]);
    expect(r.sources.rdc.furniture[1]).toEqual({ id: 'P1', x0: 61, y0: 40, x1: 68, y1: 52, kind: 'etagere', source: 'modele' });
  });

  it('retirer : la pièce disparaît ; absente ensuite = déjà appliquée', () => {
    const d = [{ id: 'M2', floor: 'rdc', action: 'retirer', to: null, level: '15-60' }];
    const r = run(d);
    expect(r.sources.rdc.furniture.map((f) => f.id)).toEqual(['M1', 'P1']);
    expect(status(run(d, r.sources), 'M2')).toBe(STATUS.already);
  });

  it('ajouter une pièce du modèle : identifiant to.id (ou R-<id>), source modele', () => {
    const r = run([
      { id: 'G1', floor: 'rdc', action: 'ajouter', to: { id: 'R1', x0: 40, y0: 50, x1: 47, y1: 58, kind: 'etagere' }, level: '15-60' },
      { id: 'G2', floor: 'rdc', action: 'ajouter', to: { x0: 5, y0: 5, x1: 9, y1: 9, kind: 'caisse' }, level: '15-60' },
    ]);
    expect(r.sources.rdc.furniture.slice(-2)).toEqual([
      { id: 'R1', x0: 40, y0: 50, x1: 47, y1: 58, kind: 'etagere', source: 'modele' },
      { id: 'R-G2', x0: 5, y0: 5, x1: 9, y1: 9, kind: 'caisse', source: 'modele' },
    ]);
    expect(addedId({ id: 'G7' })).toBe('R-G7');
  });

  it('corriger un pilier désigné par ses coordonnées', () => {
    const r = run([{ id: 'pilier 30,30', floor: 'rdc', action: 'corriger', to: { at: [33, 30] }, level: '15-60' }]);
    expect(r.sources.rdc.pillars).toEqual([[33, 30], [70, 30]]);
  });

  it('corriger une fenêtre : position d\'origine mémorisée (planX), largeur et mur inchangés', () => {
    const r = run([{ id: 'F1', floor: 'rdc', action: 'corriger', to: { x: 24 }, level: '15-60' }]);
    expect(r.sources.rdc.windows[0]).toEqual({ id: 'F1', side: 'nord', x: 24, y: 0, planX: 20 });
  });

  it('une fenêtre ne s\'éloigne jamais de plus de 50 unités de son origine', () => {
    expect(WINDOW_MAX_FROM_ORIGIN).toBe(50);
    const r = run([{ id: 'F2', floor: 'etage', action: 'corriger', to: { y: 40 }, level: '15-60' }, { id: 'F2', floor: 'rdc', action: 'corriger', to: { y: 40 }, level: '15-60' }]);
    expect(r.report[0].status).toBe(STATUS.missing); // F2 n'est pas à l'étage
    expect(r.report[1].status).toBe(STATUS.refused); // 40 − 28 = 12 px = 60 unités
    expect(r.sources.rdc.windows[1].y).toBe(30);
  });

  it('corriger un mur : la ligne bouge, les fenêtres posées dessus suivent', () => {
    const r = run([{ id: 'contour-1', floor: 'rdc', action: 'corriger', to: { line: 3 }, level: '15-60' }]);
    expect(r.sources.rdc.contour.slice(0, 2)).toEqual([[0, 3], [100, 3]]);
    expect(r.sources.rdc.windows[0].y).toBe(3);
    const w = run([{ id: 'mur-interieur-1', floor: 'rdc', action: 'corriger', to: { line: 53 }, level: '15-60' }]);
    expect(w.sources.rdc.walls[0]).toMatchObject({ x1: 53, x2: 53 });
  });

  it('les sources d\'entrée ne sont jamais modifiées', () => {
    const before = JSON.stringify(SRC);
    run([{ id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 12, y0: 40, x1: 22, y1: 50 }, level: '15-60' }, { id: 'M2', floor: 'rdc', action: 'retirer', level: '15-60' }]);
    expect(JSON.stringify(SRC)).toBe(before);
  });
});

describe('décisions : garde-fous', () => {
  it('plus-60 sans approved : ignorée, rien ne change', () => {
    const r = run([{ id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 40, y0: 40, x1: 50, y1: 50 }, level: 'plus-60', approved: false }]);
    expect(status(r, 'M1')).toBe(STATUS.refused);
    expect(r.sources.rdc).toEqual(PLAN);
  });

  it('plus-60 avec approved: true : appliquée', () => {
    const r = run([{ id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 40, y0: 40, x1: 50, y1: 50 }, level: 'plus-60', approved: true }]);
    expect(status(r, 'M1')).toBe(STATUS.done);
  });

  it(`plafond de ${MAX_SHIFT} unités : un déplacement plus grand est refusé même si la décision est marquée 15-60`, () => {
    expect(MAX_SHIFT).toBe(60);
    const r = run([
      { id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 23, y0: 40, x1: 33, y1: 50 }, level: '15-60' },
      { id: 'pilier 30,30', floor: 'rdc', action: 'corriger', to: { at: [43, 30] }, level: '15-60' },
      { id: 'P1', floor: 'rdc', action: 'remplacer', to: { x0: 60, y0: 40, x1: 83, y1: 50 }, level: '15-60' },
      { id: 'contour-1', floor: 'rdc', action: 'corriger', to: { line: 13 }, level: '15-60' },
    ]);
    expect(r.report.map((x) => x.status)).toEqual([STATUS.refused, STATUS.refused, STATUS.refused, STATUS.refused]);
    expect(r.sources.rdc).toEqual(PLAN);
  });

  it('exactement 60 unités : accepté', () => {
    const r = run([{ id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 22, y0: 40, x1: 32, y1: 50 }, level: '15-60' }]);
    expect(status(r, 'M1')).toBe(STATUS.done);
  });

  it('identifiant introuvable : avertissement dans le rapport, jamais d\'exception, rien ne change', () => {
    const r = run([{ id: 'M99', floor: 'rdc', action: 'corriger', to: { x0: 1, y0: 1, x1: 2, y1: 2 }, level: '15-60' }, { id: 'pilier 1,1', floor: 'rdc', action: 'corriger', to: { at: [2, 2] }, level: '15-60' }, { id: 'X', floor: 'grenier', action: 'corriger', level: '15-60' }]);
    expect(r.report.map((x) => x.status)).toEqual([STATUS.missing, STATUS.missing, STATUS.missing]);
    expect(r.sources.rdc).toEqual(PLAN);
  });

  it('entrées inattendues : aucune exception', () => {
    expect(() => applyDecisions(null, null)).not.toThrow();
    expect(applyDecisions(null, null)).toEqual({ sources: {}, report: [] });
    expect(() => run([null, 3, 'x', { id: 'M1', floor: 'rdc', action: 'corriger', to: 'x', level: '15-60' }, { floor: 'rdc', action: 'inconnue', level: '15-60' }])).not.toThrow();
  });

  it('garder : déjà appliquée (rien à faire)', () => {
    expect(status(run([{ id: 'F1', floor: 'rdc', action: 'garder', level: 'moins-15' }]), 'F1')).toBe(STATUS.already);
  });
});

describe('décisions : idempotence et déterminisme', () => {
  const D = [
    { id: 'M1', floor: 'rdc', action: 'corriger', to: { x0: 12, y0: 41, x1: 22, y1: 51, kind: 'table' }, level: '15-60' },
    { id: 'P1', floor: 'rdc', action: 'remplacer', to: { x0: 61, y0: 40, x1: 68, y1: 52, kind: 'etagere' }, level: '15-60' },
    { id: 'M2', floor: 'rdc', action: 'retirer', to: null, level: '15-60' },
    { id: 'G1', floor: 'rdc', action: 'ajouter', to: { id: 'R1', x0: 40, y0: 50, x1: 47, y1: 58, kind: 'etagere' }, level: '15-60' },
    { id: 'pilier 70,30', floor: 'rdc', action: 'corriger', to: { at: [72, 30] }, level: '15-60' },
    { id: 'F1', floor: 'rdc', action: 'corriger', to: { x: 23 }, level: '15-60' },
    { id: 'U1', floor: 'etage', action: 'corriger', to: { y: 22 }, level: '15-60' },
    { id: 'G9', floor: 'rdc', action: 'ajouter', to: { at: [10, 10] }, level: 'plus-60', approved: false },
  ];

  it('deux passes donnent exactement le même résultat ; la seconde ne rapporte que « déjà appliquée » ou « ignorée »', () => {
    const a = run(D);
    const b = run(D, a.sources);
    expect(b.sources).toEqual(a.sources);
    expect(b.report.every((x) => x.status === STATUS.already || x.status === STATUS.refused)).toBe(true);
    expect(a.report.filter((x) => x.status === STATUS.done)).toHaveLength(7);
  });

  it('déterministe : même entrée, même sortie', () => {
    expect(JSON.stringify(run(D))).toBe(JSON.stringify(run(D)));
  });

  it('les décisions du dépôt sont idempotentes sur les sources du dépôt', () => {
    const src = { rdc: JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/plan.json', 'utf8')), etage: JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/etage.json', 'utf8')) };
    const { decisions } = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/ecarts-decisions.json', 'utf8'));
    const a = applyDecisions(src, decisions);
    expect(applyDecisions(a.sources, decisions).sources).toEqual(a.sources);
    expect(a.report.filter((x) => x.status === STATUS.missing)).toEqual([]);
  });
});

describe('format des sources', () => {
  it.each(['plan', 'etage'])('%s.json est réécrit à l\'identique (même format que le dépôt)', (f) => {
    const text = readFileSync(`data/game/maps/rez-de-chaussee/${f}.json`, 'utf8');
    expect(formatSource(JSON.parse(text))).toBe(text);
  });

  it('entrée invalide : chaîne vide', () => {
    expect(formatSource(null)).toBe('');
  });
});
