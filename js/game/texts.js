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
export const TEXTURE_TEXTS = { loading: 'game.loading', done: 'game.loading.done', fps: 'game.fps.textures', fpsSons: 'game.fps.sons', fpsStats: 'game.fps.stats', fpsWindows: 'game.fps.windows', error: 'game.loading.error' };

// Clés du libellé et des états de l'interrupteur « Effet VHS » du panneau de pause (fr.json).
export const VHS_TEXTS = { label: 'game.vhs.label', on: 'game.vhs.on', off: 'game.vhs.off', reduced: 'game.vhs.reduced' };

// Clés des textes de l'animation de vague (E2-8) : les mêmes que js/core/wave-splash.js (KEYS), pour que fr.json n'ait pas de clé orpheline.
export const SPLASH_TEXTS = { debut: 'game.splash.debut', renforcee: 'game.splash.renforcee', fin: 'game.splash.fin', vieRestauree: 'game.splash.vieRestauree', zoneTitle: 'game.splash.zone.title', zoneSubtitle: 'game.splash.zone.subtitle', zoneSubEscalier: 'game.splash.zone.sub.escalier', zoneSubEscalierPorte: 'game.splash.zone.sub.escalier-porte' };

// Lot 3c : zones et fin de monde (ligne de la pause, variante de l'écran de fin, annonces vocales) ; l'annonce centrale « zone » est dans wave-splash.js.
export const ZONE_TEXTS = { nextZone: 'game.pause.nextZone', endWorld: 'game.end.world', liveZone: 'game.live.zone', liveWorld: 'game.live.world' };

// Lot 3 et 3a : textes des fenêtres (puces du HUD, indicateur de réparation E2-9 sur une ligne, annonces vocales) et de l'état à terre (E2-10).
// Le nom d'une fenêtre vient de son identifiant dans world.json ; une fenêtre inconnue garde son identifiant.
export const WINDOW_TEXTS = {
  liveBusy: 'game.windows.live.busy', liveOpen: 'game.windows.live.open', liveRepaired: 'game.windows.live.repaired',
};
export const WINDOW_NAMES = {
  'fenetre-nord': 'game.windows.name.nord', 'fenetre-ouest': 'game.windows.name.ouest', 'fenetre-est': 'game.windows.name.est', 'fenetre-sud': 'game.windows.name.sud',
  // Carte du lot 3b : fenêtres F1 à F8 (clés écrites en toutes lettres : pas de clé orpheline).
  F1: 'game.windows.name.F1', F2: 'game.windows.name.F2', F3: 'game.windows.name.F3', F4: 'game.windows.name.F4', F5: 'game.windows.name.F5', F6: 'game.windows.name.F6', F7: 'game.windows.name.F7', F8: 'game.windows.name.F8',
  // Étage du lot 3e : fenêtres U1 à U7.
  U1: 'game.windows.name.U1', U2: 'game.windows.name.U2', U3: 'game.windows.name.U3', U4: 'game.windows.name.U4', U5: 'game.windows.name.U5', U6: 'game.windows.name.U6', U7: 'game.windows.name.U7',
};
// Initiale du nom de chaque fenêtre (puces du HUD, flèches au bord) : une donnée de fr.json, jamais calculée dans le code.
export const WINDOW_INITIALS = {
  'fenetre-nord': 'game.windows.initial.nord', 'fenetre-ouest': 'game.windows.initial.ouest', 'fenetre-est': 'game.windows.initial.est', 'fenetre-sud': 'game.windows.initial.sud',
  F1: 'game.windows.initial.F1', F2: 'game.windows.initial.F2', F3: 'game.windows.initial.F3', F4: 'game.windows.initial.F4', F5: 'game.windows.initial.F5', F6: 'game.windows.initial.F6', F7: 'game.windows.initial.F7', F8: 'game.windows.initial.F8',
  U1: 'game.windows.initial.U1', U2: 'game.windows.initial.U2', U3: 'game.windows.initial.U3', U4: 'game.windows.initial.U4', U5: 'game.windows.initial.U5', U6: 'game.windows.initial.U6', U7: 'game.windows.initial.U7',
};
// Lot 3e : étage du joueur (puce du HUD E2-2 et annonce vocale à chaque changement d'étage).
export const FLOOR_TEXTS = { chip: { rdc: 'game.hud.floor.rdc', etage: 'game.hud.floor.etage' }, live: { rdc: 'game.live.floor.rdc', etage: 'game.live.floor.etage' } };
export const DOWN_TEXTS = {
  chutes: 'game.down.chutes', chutesLabel: 'game.down.chutes.label', title: 'game.down.title', countdown: 'game.down.countdown', grace: 'game.down.grace', liveDown: 'game.down.live.down', liveUp: 'game.down.live.up',
};
