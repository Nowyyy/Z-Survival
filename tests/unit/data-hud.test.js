import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, luminance, mix, parseColor } from '../../js/core/color.js';
import { tokens } from './helpers/textures.js';

const css = readFileSync('css/tokens.css', 'utf8');
const gameCss = readFileSync('css/game.css', 'utf8');
const uiCss = readFileSync('css/game-ui.css', 'utf8'); // lot 3l : interface intégrée (HUD B, panneaux, à terre, sticks A)
const color = (name) => parseColor(tokens[name]);
const alpha = Number(tokens['--hud-bg-alpha']);

// Sol le plus clair de la palette du jeu : le pire fond sous un panneau translucide.
const FLOORS = ['--game-floor', '--game-tile-a', '--game-tile-b', '--game-sidewalk', '--game-road', '--game-asphalt', '--game-grass', '--game-grass-a', '--game-grass-b', '--game-soil', '--game-gravel', '--game-ground'];
const lightest = FLOORS.map((n) => ({ n, c: color(n) })).sort((a, b) => luminance(b.c) - luminance(a.c))[0];
const worstPanel = mix(lightest.c, color('--hud-bg'), alpha); // panneau (couleur à son opacité) mélangé sur le sol le plus clair

describe('lot 3a : jetons du HUD', () => {
  // Lot 3l : jetons de l'interface intégrée ajoutés (bloc « Interface intégrée (lot 3l) » en fin de tokens.css).
  it.each(['--hud-bg', '--hud-bg-alpha', '--hud-border', '--hud-radius', '--hud-gap', '--hud-text-scale', '--hud-fs', '--hud-row', '--hud-pause-size', '--hud-target'])('%s est défini et commenté', (name) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*[^;]+;\\s*/\\*[^*]+\\*/`));
  });

  it('opacité entre 0 et 1, sol le plus clair identifié', () => {
    expect(alpha).toBeGreaterThan(0.5);
    expect(alpha).toBeLessThanOrEqual(1);
    expect(luminance(lightest.c)).toBeGreaterThan(0.03);
  });

  it('la grille : espacement et rayon en pixels entiers', () => {
    expect(tokens['--hud-gap']).toMatch(/^\d+px$/);
    expect(tokens['--hud-radius']).toMatch(/^\d+px$/);
  });
});

describe('lot 3a : contrastes du HUD (color.js, pire fond : panneau à son opacité sur le sol le plus clair)', () => {
  it('texte des puces, des fenêtres et des flèches : au moins 4,5', () => {
    expect(contrast(color('--color-text'), worstPanel)).toBeGreaterThanOrEqual(4.5);
  });

  it('« Vague N » (rouge lisible) sur la puce : au moins 4,5', () => {
    expect(contrast(color('--color-action-text'), worstPanel)).toBeGreaterThanOrEqual(4.5);
  });

  // Lot 3l : plus de barre de vie (direction B) ; os sur le rouge plein reste le texte des boutons principaux (Reprendre, Rejouer) et os sur la surface celui des panneaux.
  it('os sur le rouge plein (boutons principaux) et sur la surface sombre (panneaux) : au moins 4,5', () => {
    expect(contrast(color('--color-on-action'), color('--color-action'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-on-action'), color('--color-surface'))).toBeGreaterThanOrEqual(4.5);
  });

  it('contour des puces sur le pire fond : au moins 3 (forme lisible)', () => {
    expect(contrast(color('--hud-border'), worstPanel)).toBeGreaterThanOrEqual(3);
  });

  // Lot 3l (direction B) : avant, un seul rectangle noir (#hud) ; après, un fond par bloc de taille fixe (.hud-block), aucun fond sur le conteneur ni les colonnes.
  it('un fond par bloc du HUD (.hud-block), aucun fond sur .hud ni sur les colonnes, ni sur les libellés et valeurs', () => {
    const rule = (sel) => new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(uiCss)?.[2] ?? '';
    expect(rule('.hud-block')).toMatch(/background: color-mix\(in srgb, var\(--hud-bg\) calc\(var\(--hud-bg-alpha\) \* 100%\), transparent\)/);
    for (const sel of ['.hud', '.hud-col', '.hud-tl', '.hud-tc', '.hud-tr', '.hud-value']) expect(rule(sel), sel).not.toMatch(/background/);
  });
});

// Lot 3l : le HUD, les panneaux, l'état à terre et les sticks sont dans css/game-ui.css (avant : section « HUD (E2-2, lot 3a) » de game.css) ; E2-11 est retiré
// (aucune règle .edges ni .edge-* ne reste).
describe('lot 3a et 3l : interdits sur l\'interface de jeu (css/game.css, css/game-ui.css)', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

  it.each(['filter', 'mix-blend-mode', 'backdrop-filter'])('ni %s dans l\'interface de jeu ni dans game.css', (prop) => {
    for (const text of [uiCss, gameCss]) expect(strip(text)).not.toMatch(new RegExp(`(^|[\\s;{])${prop}\\s*:`));
  });

  it('texte de 14 px au moins : tailles de police en var(--hud-fs) (15,75 px) ou en em d\'au moins 1 dans l\'interface', () => {
    const sizes = [...strip(uiCss).matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(sizes.length).toBeGreaterThan(3);
    for (const v of sizes) {
      if (v === 'var(--hud-fs)') continue;
      expect(v, v).toMatch(/^\d+(\.\d+)?em$/);
      expect(Number.parseFloat(v), v).toBeGreaterThanOrEqual(1);
    }
    expect(14 * Number(tokens['--hud-text-scale'])).toBeGreaterThanOrEqual(14);
  });

  it('aucune couleur en dur dans l\'interface de jeu ni dans game.css', () => {
    for (const text of [uiCss, gameCss]) expect(strip(text)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });

  it('E2-11 retiré : aucune règle .edges ni .edge-arrow (le bloc n\'est jamais réutilisé)', () => {
    for (const text of [uiCss, gameCss]) expect(strip(text)).not.toMatch(/\.edges?\b|\.edge-(arrow|pointer|letter)/);
  });
});
