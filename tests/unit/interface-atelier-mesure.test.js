// Lot 3k-A : calculs purs des mesures de lisibilité (js/core/ui-measure.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, mix, parseColor } from '../../js/core/color.js';
import {
  backgroundsFrom, blinkPerSecond, boxOverlap, compareBoxes, composite, contrastOnWorst, coverage, DEFAULT_RULES, evaluate, inside, isLargeText,
  marginRect, normBox, overlaps, parseCssColor, rulesOf, safeRect, stickZones, tokensFromCss,
} from '../../js/core/ui-measure.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const tokens = tokensFromCss(readFileSync('css/tokens.css', 'utf8'));
const backgrounds = backgroundsFrom(tokens, cfg.worstBackgrounds);
const HOSTILE = [undefined, null, NaN, '', 'x', {}, [], 42, true, { left: 'a' }, { left: 0, top: 0, width: -5, height: 2 }];
const FN = 'rg' + 'b';

describe('couleurs CSS calculées', () => {
  it.each([
    ['#f4f1ec', [244, 241, 236], 1], ['#fff', [255, 255, 255], 1], ['#00000080', [0, 0, 0], 0.502],
    [`${FN}(10, 20, 30)`, [10, 20, 30], 1], [`${FN}a(10, 20, 30, 0.5)`, [10, 20, 30], 0.5], [`${FN}(10 20 30 / 25%)`, [10, 20, 30], 0.25],
    ['color(srgb 0.0196 0.0196 0.0196 / 0.78)', [5, 5, 5], 0.78], ['color(srgb 1 0 0)', [255, 0, 0], 1], ['transparent', [0, 0, 0], 0],
  ])('%s', (text, rgb, alpha) => {
    const c = parseCssColor(text);
    expect(c.rgb).toEqual(rgb);
    expect(c.alpha).toBeCloseTo(alpha, 2);
  });

  it.each([undefined, null, 42, '', 'rouge', '#12', `${FN}(a, b, c)`, 'color(display-p3 1 0 0)'])('illisible : %s donne null', (v) => {
    expect(parseCssColor(v)).toBeNull();
  });

  it('composite : couches semi-transparentes superposées dans l\'ordre', () => {
    expect(composite([], [10, 10, 10])).toEqual([10, 10, 10]);
    expect(composite([{ rgb: [0, 0, 0], alpha: 0.5 }], [200, 200, 200])).toEqual([100, 100, 100]);
    expect(composite(['#ffffff'], [0, 0, 0])).toEqual([255, 255, 255]);
    expect(composite(null, null)).toEqual([0, 0, 0]);
  });
});

describe('contrastOnWorst', () => {
  const bone = parseColor(tokens['--color-text']);
  const money = parseColor(tokens['--color-money']);

  it('les fonds de référence sont lus dans tokens.css (sols, murs, brume)', () => {
    expect(backgrounds.length).toBe(cfg.worstBackgrounds.length);
    expect(backgrounds.map((b) => b.name)).toContain('--game-fog');
  });

  it('texte os sur fond opaque noir : le fond masque le jeu, rapport du jeton', () => {
    const r = contrastOnWorst({ fg: bone, layers: [tokens['--color-bg']] }, backgrounds);
    expect(r.ratio).toBeCloseTo(contrast(bone, parseColor(tokens['--color-bg'])), 1);
  });

  it('même calcul que data-hud.test.js : puce à 78 % sur le sol le plus clair', () => {
    const layer = { rgb: parseColor(tokens['--hud-bg']), alpha: Number(tokens['--hud-bg-alpha']) };
    const r = contrastOnWorst({ fg: bone, layers: [layer] }, backgrounds);
    const worst = Math.min(...backgrounds.map((b) => contrast(bone, mix(b.rgb, layer.rgb, layer.alpha))));
    expect(r.ratio).toBeCloseTo(worst, 1);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('jaune de l\'argent posé sans fond sur le mur le plus clair : sous 4,5 (à rapporter)', () => {
    const r = contrastOnWorst({ fg: money, layers: [] }, backgrounds);
    expect(r.ratio).toBeLessThan(4.5);
    expect(r.worst).toBe('--game-wall-base');
    expect(r.viaOutline).toBe(false);
  });

  it('le même jaune avec un contour noir de 1 px : le contour sert de fond local', () => {
    const r = contrastOnWorst({ fg: money, layers: [], outline: { color: tokens['--color-bg'], px: 1 } }, backgrounds);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
    expect(r.viaOutline).toBe(true);
  });

  it('contour trop fin (0,5 px) : ignoré', () => {
    const r = contrastOnWorst({ fg: money, layers: [], outline: { color: tokens['--color-bg'], px: 0.5 } }, backgrounds);
    expect(r.viaOutline).toBe(false);
  });

  it('texte semi-transparent : son opacité réduit le rapport', () => {
    const full = contrastOnWorst({ fg: bone, layers: ['#050505'] }, backgrounds).ratio;
    const half = contrastOnWorst({ fg: { rgb: bone, alpha: 0.5 }, layers: ['#050505'] }, backgrounds).ratio;
    expect(half).toBeLessThan(full);
  });

  it.each(HOSTILE.map((v, i) => [i, v]))('entrée hostile n° %i : rapport 1, aucune exception', (_i, v) => {
    expect(() => contrastOnWorst(v, v)).not.toThrow();
    expect(contrastOnWorst(v, []).ratio).toBe(1);
  });

  it('grand texte : 24 px, ou 18,66 px en gras', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(19, 700)).toBe(true);
    expect(isLargeText(19, 400)).toBe(false);
    expect(isLargeText('x', 'y')).toBe(false);
  });
});

describe('boîtes : recouvrement, part d\'écran, zones', () => {
  const a = { left: 0, top: 0, width: 100, height: 50 };
  const b = { left: 50, top: 25, width: 100, height: 50 };
  const far = { left: 200, top: 200, width: 10, height: 10 };

  it('normBox accepte width/height ou right/bottom', () => {
    expect(normBox(a)).toEqual({ left: 0, top: 0, right: 100, bottom: 50 });
    expect(normBox({ x: 1, y: 2, right: 3, bottom: 4 })).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
  });

  it('boxOverlap : surface de l\'intersection', () => {
    expect(boxOverlap(a, b)).toBe(50 * 25);
    expect(boxOverlap(a, far)).toBe(0);
    expect(boxOverlap(a, { left: 100, top: 0, width: 10, height: 10 })).toBe(0); // bords qui se touchent
  });

  it('overlaps : tolérance d\'un demi-pixel', () => {
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(a, { left: 99.8, top: 0, width: 10, height: 10 })).toBe(false);
    expect(overlaps(a, { left: 99, top: 0, width: 10, height: 10 })).toBe(true);
  });

  it('coverage : union des boîtes (recouvrement compté une fois), rognée à la fenêtre', () => {
    const vp = { width: 200, height: 100 };
    expect(coverage([a], vp)).toBeCloseTo(0.25, 5);
    expect(coverage([a, a], vp)).toBeCloseTo(0.25, 5);
    expect(coverage([a, b], vp)).toBeCloseTo((5000 + 5000 - 1250) / 20_000, 5);
    expect(coverage([{ left: -50, top: -50, width: 100, height: 100 }], vp)).toBeCloseTo(0.125, 5);
    expect(coverage([{ left: 0, top: 0, width: 999, height: 999 }], vp)).toBe(1);
  });

  it('coverage : interface actuelle à 667×375 (boîtes mesurées) ≈ 8,5 %', () => {
    const boxes = [{ left: 16, top: 16, width: 200, height: 72 }, { left: 220, top: 17, width: 88, height: 20 }, { left: 459, top: 27, width: 144, height: 22 }, { left: 607, top: 16, width: 44, height: 44 }];
    expect(coverage(boxes, { width: 667, height: 375 })).toBeCloseTo(0.085, 3);
  });

  it.each(HOSTILE.map((v, i) => [i, v]))('entrées hostiles n° %i : 0 ou faux, aucune exception', (_i, v) => {
    expect(boxOverlap(v, a)).toBe(0);
    expect(overlaps(v, a)).toBe(false);
    expect(coverage(v, v)).toBe(0);
    expect(coverage([v], { width: 10, height: 10 })).toBe(0);
    expect(inside(v, a)).toBe(false);
  });

  it('safeRect et marginRect : zones de sécurité puis 16 px', () => {
    const vp = { width: 844, height: 390 };
    const safe = { top: 0, right: 47, bottom: 21, left: 47 };
    expect(safeRect(vp, safe)).toEqual({ left: 47, top: 0, right: 797, bottom: 369 });
    expect(marginRect(vp, safe)).toEqual({ left: 63, top: 16, right: 781, bottom: 353 });
    expect(safeRect(vp, { left: -10, top: 'x' })).toEqual({ left: 0, top: 0, right: 844, bottom: 390 });
  });

  it('stickZones : moitiés gauche et droite, bande basse à partir de la moitié de la hauteur', () => {
    const [l, r] = stickZones({ width: 667, height: 375 });
    expect(l).toMatchObject({ left: 0, right: 333.5, top: 187.5, bottom: 375 });
    expect(r).toMatchObject({ left: 333.5, right: 667, top: 187.5, bottom: 375 });
    expect(stickZones({ width: 100, height: 100 }, { stickBandTop: 0.7 })[0].top).toBeCloseTo(70);
  });

  it('compareBoxes : 0 px quand rien ne bouge, sinon le plus grand écart et la liste', () => {
    expect(compareBoxes({ a }, { a: { ...a } })).toEqual({ max: 0, moved: [] });
    const d = compareBoxes({ a, b }, { a: { ...a, width: 103 }, b });
    expect(d.max).toBe(3);
    expect(d.moved).toEqual([{ name: 'a', delta: 3 }]);
    expect(compareBoxes({ a }, {}).max).toBe(Infinity);
    expect(compareBoxes(null, undefined)).toEqual({ max: 0, moved: [] });
  });

  it('blinkPerSecond : cycles par seconde', () => {
    expect(blinkPerSecond(1)).toBe(1);
    expect(blinkPerSecond(0.5)).toBe(2);
    expect(blinkPerSecond(2, 2)).toBe(1);
    expect(blinkPerSecond(0)).toBe(0);
    expect(blinkPerSecond('x')).toBe(0);
  });

  it('rulesOf : règles par défaut identiques à ui-atelier.json, seules les valeurs numériques sont reprises', () => {
    expect(rulesOf(cfg.rules)).toEqual({ ...DEFAULT_RULES, ...cfg.rules });
    expect(rulesOf({ minTextPx: 'x' }).minTextPx).toBe(14);
    expect(rulesOf(null)).toEqual(DEFAULT_RULES);
  });
});

describe('evaluate : chaque écart est rapporté (outOfTarget)', () => {
  const vp = { width: 667, height: 375 };
  const text = (px, fg = '#f4f1ec', layers = ['#050505']) => ({ text: 'Vie', px, weight: 700, fg, layers });
  const ok = { name: 'vie', role: 'hud', box: { left: 16, top: 16, width: 200, height: 40 }, texts: [text(14)] };

  it('aucun écart : liste vide, mesures remplies', () => {
    const r = evaluate({ viewport: vp, elements: [ok, { name: 'pause', role: 'button', target: true, box: { left: 607, top: 16, width: 44, height: 44 }, texts: [] }] }, backgrounds);
    expect(r.outOfTarget).toEqual([]);
    expect(r.minTextPx).toBe(14);
    expect(r.minTargetPx).toBe(44);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.elementCount).toBe(2);
    expect(r.textCount).toBe(1);
  });

  it.each([
    ['texte', { ...ok, texts: [text(12)] }],
    ['contraste', { ...ok, texts: [text(16, '#ffd60a', [])] }],
    ['cible', { name: 'b', role: 'button', target: true, box: { left: 100, top: 16, width: 40, height: 40 }, texts: [] }],
    ['zone-sure', { ...ok, box: { left: -5, top: 16, width: 100, height: 20 } }],
    ['marge', { ...ok, box: { left: 10, top: 16, width: 100, height: 20 } }],
    ['pouces', { ...ok, box: { left: 16, top: 300, width: 100, height: 20 } }],
    ['debordement', { ...ok, overflow: true }],
  ])('règle « %s » rapportée avec la mesure et la raison', (rule, element) => {
    const r = evaluate({ viewport: vp, elements: [element] }, backgrounds);
    const hit = r.outOfTarget.find((o) => o.rule === rule);
    expect(hit).toBeTruthy();
    expect(typeof hit.reason).toBe('string');
    expect(hit.limit).not.toBeUndefined();
  });

  it('chevauchement entre deux éléments (sauf parent et enfant)', () => {
    const b = { ...ok, name: 'argent', box: { left: 100, top: 20, width: 100, height: 20 } };
    expect(evaluate({ viewport: vp, elements: [ok, b] }, backgrounds).outOfTarget.map((o) => o.rule)).toContain('chevauchement');
    expect(evaluate({ viewport: vp, elements: [ok, { ...b, parent: 'vie' }] }, backgrounds).outOfTarget.map((o) => o.rule)).not.toContain('chevauchement');
  });

  it('zones de sécurité simulées : un élément dans l\'encoche est hors de la zone sûre', () => {
    const r = evaluate({ viewport: { width: 844, height: 390 }, safe: { left: 47, right: 47, top: 0, bottom: 21 }, elements: [{ ...ok, box: { left: 19, top: 16, width: 200, height: 40 } }] }, backgrounds);
    expect(r.outOfTarget.map((o) => o.rule)).toContain('zone-sure');
  });

  it('écran modal : pas de contrôle des zones des pouces', () => {
    const el = { ...ok, box: { left: 16, top: 300, width: 100, height: 20 } };
    expect(evaluate({ viewport: vp, modal: true, elements: [el] }, backgrounds).outOfTarget.map((o) => o.rule)).not.toContain('pouces');
  });

  it('grand titre : 3:1 suffit', () => {
    const big = { ...ok, texts: [{ text: 'Pause', px: 28, weight: 400, fg: tokens['--color-action'], layers: [tokens['--color-surface']] }] };
    expect(evaluate({ viewport: vp, elements: [big] }, backgrounds).outOfTarget).toEqual([]);
  });

  it('CLS, clignotements et mouvement réduit', () => {
    const r = evaluate({ viewport: vp, elements: [], cls: 0.2, reducedMotion: true, animations: [{ name: 'rec', kind: 'rec', perSecond: 2.5, running: true }, { name: 'liseré', perSecond: 3, running: false }] }, backgrounds);
    expect(r.outOfTarget.map((o) => o.rule).sort()).toEqual(['clignotement', 'cls', 'mouvement-reduit']);
  });

  it.each(HOSTILE.map((v, i) => [i, v]))('relevé hostile n° %i : aucune exception', (_i, v) => {
    expect(() => evaluate(v, v, v)).not.toThrow();
    expect(evaluate(v, backgrounds).outOfTarget).toEqual([]);
  });
});
