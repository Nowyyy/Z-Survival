import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, luminance, mix, parseColor } from '../../js/core/color.js';
import { tokens } from './helpers/textures.js';

const css = readFileSync('css/tokens.css', 'utf8');
const gameCss = readFileSync('css/game.css', 'utf8');
const color = (name) => parseColor(tokens[name]);
const alpha = Number(tokens['--hud-bg-alpha']);

// Sol le plus clair de la palette du jeu : le pire fond sous un panneau translucide.
const FLOORS = ['--game-floor', '--game-tile-a', '--game-tile-b', '--game-sidewalk', '--game-road', '--game-asphalt', '--game-grass', '--game-grass-a', '--game-grass-b', '--game-soil', '--game-gravel', '--game-ground'];
const lightest = FLOORS.map((n) => ({ n, c: color(n) })).sort((a, b) => luminance(b.c) - luminance(a.c))[0];
const worstPanel = mix(lightest.c, color('--hud-bg'), alpha); // panneau (couleur à son opacité) mélangé sur le sol le plus clair

describe('lot 3a : jetons du HUD', () => {
  it.each(['--hud-bg', '--hud-bg-alpha', '--hud-border', '--hud-radius', '--hud-gap'])('%s est défini et commenté', (name) => {
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

  it('« 100/100 » dans la barre : os sur le rouge plein et sur la piste sombre, au moins 4,5 des deux côtés', () => {
    expect(contrast(color('--color-on-action'), color('--color-action'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-on-action'), color('--color-surface'))).toBeGreaterThanOrEqual(4.5);
  });

  it('indicateur de réparation (E2-9) : texte sur son panneau plein, au moins 4,5', () => {
    expect(contrast(color('--game-repair-text'), color('--game-repair-panel'))).toBeGreaterThanOrEqual(4.5);
  });

  it('anneau de progression et croix sur le panneau : au moins 3', () => {
    expect(contrast(color('--game-repair-ring'), color('--game-repair-panel'))).toBeGreaterThanOrEqual(3);
    expect(contrast(color('--game-repair-track'), color('--game-repair-panel'))).toBeGreaterThanOrEqual(3);
  });

  it('contour des puces sur le pire fond : au moins 3 (forme lisible)', () => {
    expect(contrast(color('--hud-border'), worstPanel)).toBeGreaterThanOrEqual(3);
  });

  it('encoche pleine (bone) sur la puce : au moins 3, et l\'encoche vide se distingue par sa forme (contour seul)', () => {
    expect(contrast(color('--color-text'), worstPanel)).toBeGreaterThanOrEqual(3);
    expect(gameCss).toMatch(/\.hud-win-notch\[data-on="1"\]\s*{[^}]*background/);
  });
});

describe('lot 3a : interdits sur le HUD (css/game.css)', () => {
  const block = (start, end) => gameCss.slice(gameCss.indexOf(start), gameCss.indexOf(end));
  const hudCss = block('/* HUD (E2-2, lot 3a)', '/* Annonce de vague (E2-8');
  const repairCss = block('/* Indicateur de réparation (E2-9, lots 3 et 3a)', '/* État à terre (E2-10');

  it.each(['filter', 'mix-blend-mode', 'backdrop-filter'])('ni %s dans le HUD, E2-9 ni E2-11', (prop) => {
    for (const text of [hudCss, repairCss]) expect(text.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(new RegExp(`(^|[\\s;{])${prop}\\s*:`));
  });

  it('texte de 14 px au moins : aucune taille de police sous var(--text-sm) dans le HUD', () => {
    for (const m of hudCss.matchAll(/font-size:\s*([^;]+);/g)) expect(['var(--text-sm)', 'var(--text-md)', '1.375rem']).toContain(m[1].trim());
  });

  it('aucune couleur en dur dans le HUD', () => {
    expect(hudCss + repairCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
  });
});
