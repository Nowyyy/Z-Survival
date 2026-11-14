import { test } from '@playwright/test';
import { fitDistance } from '../../js/core/viewport.js';
import { readFileSync } from 'node:fs';

// Attend que le jeu tourne (le temps de jeu avance : la mise en page est terminée). Si WebGL manque dans l'environnement,
// le jeu affiche son message d'erreur et le test se désactive proprement.
export async function waitReady(page) {
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}

// Zone de jeu (face intérieure des murs, 24 de chaque côté) : la caméra la fait tenir avec 2 % de marge ; zoom : valeur de ?zoom=.
export const PLAY = { width: 1552, height: 852 };
export const DEFAULT_ZOOM = 2.5; // rapprochement par défaut (data/game/render.json) ; ?zoom=1 montre toute la zone de jeu
export const expectedDistance = (aspect, tilt = 75, zoom = DEFAULT_ZOOM) => fitDistance(aspect, PLAY, tilt, 40, 0.02) / zoom;

// Lot 3b : la carte par défaut est le rez-de-chaussée ; les tests écrits pour l'ancienne salle (2000 × 1200, 3 fenêtres) ajoutent ?map=salle à leur adresse.
export const salle = (url) => {
  const i = url.indexOf('?');
  return i < 0 ? `${url}?map=salle` : `${url.slice(0, i + 1)}map=salle&${url.slice(i + 1)}`;
};

// Lot 3l : HUD intégré (direction B) en blocs de taille fixe dans trois colonnes. #hud est le conteneur commun (toute la bande du haut, entre les marges) :
// les mesures de place se font sur les blocs visibles. HUD_BLOCKS : sélecteurs des blocs (dans l'ordre du HTML) ; hudBoxes : leurs boîtes et celle de Pause.
export const HUD_BLOCKS = ['#hud-chrono', '#hud-bar', '#hud-chutes', '#hud-floor', '#hud-trial', '#hud-wave', '#hud-money', '#hud-gain', '#down-body', '#hud-remaining', '#hud-next', '#hud-kills'];
export const hudBoxes = (page) => page.evaluate((sels) => {
  const out = {};
  for (const sel of [...sels, '#btn-pause']) {
    const el = document.querySelector(sel);
    if (!el || el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    out[sel] = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }
  return out;
}, HUD_BLOCKS);
// Part de l'écran couverte par l'union des boîtes (rognées à la fenêtre), entre 0 et 1.
export function screenShare(boxes, width, height) {
  const list = Object.values(boxes).map((b) => ({ l: Math.max(0, b.l), t: Math.max(0, b.t), r: Math.min(width, b.r), b: Math.min(height, b.b) })).filter((b) => b.r > b.l && b.b > b.t);
  const xs = [...new Set(list.flatMap((b) => [b.l, b.r]))].sort((a, c) => a - c);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const spans = list.filter((b) => b.l <= xs[i] && b.r >= xs[i + 1]).map((b) => [b.t, b.b]).sort((a, c) => a[0] - c[0]);
    let covered = 0;
    let cur = null;
    for (const [t, bt] of spans) {
      if (!cur || t > cur[1]) {
        if (cur) covered += cur[1] - cur[0];
        cur = [t, bt];
      } else cur[1] = Math.max(cur[1], bt);
    }
    if (cur) covered += cur[1] - cur[0];
    area += covered * (xs[i + 1] - xs[i]);
  }
  return area / (width * height);
}
// Vrai si deux boîtes { l, t, r, b } ne se recouvrent pas (tolérance d'un demi-pixel).
export const apart = (a, b) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

// Lot 8h : progression v2 de démonstration (zs.save.v2) pour les tests du menu : inventaire et équipement de data/menu/inventaire-depart.json (uid o1 à
// o16, mêmes que le lot 8d), monnaie bleue `bleu`, Survivant choisi. Posée UNE fois (les rechargements gardent ce que le menu a écrit), avant tout
// autre script de la page ; à appeler avant l'espion du stockage (sa propre écriture n'est pas comptée) ; adresse du menu avec &store=local.
export const CLE_V2 = 'zs.save.v2';
export function progressionDemo({ bleu = 100_000, extra = {} } = {}) {
  const inv = JSON.parse(readFileSync('data/menu/inventaire-depart.json', 'utf8'));
  return {
    v: 2, rev: 1, savedAt: 1, bleu: { gagne: bleu, depense: 0 },
    objets: inv.objets.map((o) => ({ u: o.uid, i: o.id, r: o.rarete, n: o.niveau })),
    porte: { ...inv.equipement },
    persos: { debloques: ['survivant'], niveaux: { survivant: 1 }, choisi: 'survivant' },
    ...extra,
  };
}
export async function poserProgression(page, save = progressionDemo()) {
  // Plusieurs poses dans un même test : la dernière l'emporte (même page) ; un rechargement ne repose rien.
  await page.addInitScript(([k, v]) => {
    if (sessionStorage.getItem('zs.test.pose') && !window.__zsPose) return;
    window.__zsPose = true;
    sessionStorage.setItem('zs.test.pose', '1');
    localStorage.setItem(k, v);
  }, [CLE_V2, JSON.stringify(save)]);
}
