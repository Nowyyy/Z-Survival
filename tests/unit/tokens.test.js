import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { contrast, parseColor } from '../../js/core/color.js';

const tokens = readFileSync('css/tokens.css', 'utf8');
const vars = Object.fromEntries([...tokens.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const contrastOf = (a, b) => contrast(parseColor(vars[a]), parseColor(vars[b]));

describe('contrastes des jetons (minimum 4,5:1)', () => {
  const PAIRS = [
    ['color-text', 'color-bg'], ['color-text', 'color-surface'], ['color-text', 'color-surface-raised'],
    ['color-text-muted', 'color-bg'], ['color-text-muted', 'color-surface'],
    ['color-on-action', 'color-action'], ['color-on-action', 'color-action-active'],
    ['color-action', 'color-text'],               // rouge sang lu sur le coup de pinceau
    ['color-action-text', 'color-bg'], ['color-action-text', 'color-surface'],
    ['color-danger', 'color-bg'], ['color-danger', 'color-danger-surface'],
    ['color-success', 'color-bg'], ['color-success', 'color-success-surface'],
    ['color-warning', 'color-bg'], ['color-warning', 'color-warning-surface'],
    ['color-money', 'color-bg'], ['color-money', 'color-surface'], ['color-focus', 'color-bg'],
  ];
  it.each(PAIRS)('%s sur %s', (fg, bg) => {
    expect(contrastOf(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('grands textes sur fond sombre (minimum 3:1)', () => {
  it('le rouge sang du titre', () => {
    expect(contrastOf('color-action', 'color-bg')).toBeGreaterThanOrEqual(3);
  });

  it('le rouge de bordure et d\'éclaboussure se détache du fond', () => {
    expect(contrastOf('color-action', 'color-bg')).toBeGreaterThanOrEqual(3);
    expect(contrastOf('color-border', 'color-bg')).toBeGreaterThanOrEqual(3);
  });
});

describe('jetons requis', () => {
  it.each(['color-bg', 'color-surface', 'color-text', 'color-text-muted', 'color-action', 'color-danger',
    'color-success', 'color-warning', 'color-money', 'color-action-deep', 'font-sans', 'font-display', 'font-label', 'text-md', 'space-4', 'radius-md', 'duration-fast', 'touch-target'])(
    '--%s est défini', (name) => {
      expect(vars[name]).toBeTruthy();
    });

  it('la cible tactile fait 44 px', () => {
    expect(vars['touch-target']).toBe('44px');
  });
});

describe('couleurs en dur', () => {
  const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;
  it('aucun fichier CSS hors tokens.css ne définit de couleur', () => {
    for (const f of readdirSync('css').filter((n) => n.endsWith('.css') && n !== 'tokens.css')) {
      expect(readFileSync(`css/${f}`, 'utf8'), f).not.toMatch(COLOR);
    }
  });
});
