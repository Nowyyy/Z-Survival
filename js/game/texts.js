// Textes de jeu.html : chargés une seule fois (français), posés dans les éléments marqués data-i18n.
import { translate } from '../i18n.js';

let pending = null;

export const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));

export function loadDict() {
  pending ??= fetch('data/i18n/fr.json').then((response) => {
    if (!response.ok) throw new Error(`data/i18n/fr.json : ${response.status}`);
    return response.json();
  });
  return pending;
}

export function applyTexts(dict) {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', translate(dict, el.dataset.i18nLabel));
  document.title = translate(dict, 'game.title');
}

// Clés des textes de l'écran de préparation des textures et de la ligne de diagnostic ?fps=1 (fr.json).
export const TEXTURE_TEXTS = { loading: 'game.loading', done: 'game.loading.done', fps: 'game.fps.textures', fpsSons: 'game.fps.sons', fpsStats: 'game.fps.stats', error: 'game.loading.error' };

// Clés du libellé et des états de l'interrupteur « Effet VHS » du panneau de pause (fr.json).
export const VHS_TEXTS = { label: 'game.vhs.label', on: 'game.vhs.on', off: 'game.vhs.off', reduced: 'game.vhs.reduced' };

// Clés des textes de l'animation de vague (E2-8) : les mêmes que js/core/wave-splash.js (KEYS), pour que fr.json n'ait pas de clé orpheline.
export const SPLASH_TEXTS = { debut: 'game.splash.debut', renforcee: 'game.splash.renforcee', fin: 'game.splash.fin', vieRestauree: 'game.splash.vieRestauree' };
