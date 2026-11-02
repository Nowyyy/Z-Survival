// HUD en HTML (bloc E2-2, lot 3a) : barre de vie avec « 100/100 » dedans (role="progressbar"), puces « Vague N », restants (ou compte à rebours), tués et chutes
// (une silhouette avec un « + » par chute restante, et le nombre). N'écrit dans le DOM que si une
// valeur change. L'annonce de vague (E2-8) est une animation centrale : js/game/splash-view.js.
import { displayHealth } from '../core/combat.js';
import { DOWN_TEXTS, FLOOR_TEXTS, fmt } from './texts.js';

const SVG = 'http://www.w3.org/2000/svg';
const SILHOUETTE = 'M5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM2 7.5c0-1 .8-1.7 1.8-1.7h2.4c1 0 1.8.7 1.8 1.7V12H6.5v3.5h-3V12H2Z';
const PLUS = 'M12.5 1.5v5M10 4h5'; // petit « + » à côté de la tête : une chute restante = un revive

// Icône de silhouette d'une chute restante (SVG en ligne, décorative).
function silhouette() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', SILHOUETTE);
  const plus = document.createElementNS(SVG, 'path');
  plus.setAttribute('d', PLUS);
  plus.setAttribute('class', 'hud-plus');
  svg.append(path, plus);
  return svg;
}

export function createHud(dict, root = document) {
  const el = (id) => root.getElementById(id);
  const bar = el('hud-bar');
  const life = el('hud-life');
  const fill = el('hud-fill');
  const kills = el('hud-kills');
  const wave = el('hud-wave');
  const floor = el('hud-floor');
  let shownFloor;
  const remaining = el('hud-remaining');
  const next = el('hud-next');
  const chutes = el('hud-chutes');
  const chuteIcons = el('hud-chutes-icons');
  const chuteText = el('hud-chutes-text');
  let shownChutes = null;
  let last = { hp: null, max: null, kills: null, phase: null };
  const shown = { wave: null, remaining: null, total: null, wait: null }; // dernières valeurs écrites
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    // player : { health, maxHealth } ; waves : sortie de wave-director.info() ; extras : { chutes }.
    update(player, killCount, waves, extras = {}) {
      const hp = displayHealth(player.health);
      if (hp !== last.hp || player.maxHealth !== last.max) {
        life.textContent = fmt(dict['game.hud.life'], { hp, max: player.maxHealth });
        fill.style.transform = `scaleX(${player.maxHealth > 0 ? Math.min(1, hp / player.maxHealth) : 0})`;
        bar.setAttribute('aria-valuenow', String(hp));
        bar.setAttribute('aria-valuemax', String(player.maxHealth));
      }
      if (killCount !== last.kills) kills.textContent = fmt(dict[killCount === 1 ? 'game.hud.kills.one' : 'game.hud.kills'], { n: killCount });
      // Pendant l'attente : seulement le compte à rebours ; pendant la vague : son numéro et les zombies restants ; sans vagues : rien.
      const active = Boolean(waves?.active);
      const waiting = active && waves.phase === 'attente';
      const fighting = active && !waiting;
      const wait = waiting ? Math.ceil(waves.waitLeft) : 0;
      // Le numéro de vague reste affiché en permanence (vague à venir pendant l'attente) ; les restants seulement pendant la vague.
      if (wave.hidden === active) wave.hidden = !active;
      if (fighting !== (last.phase === 'combat')) remaining.hidden = !fighting;
      if (waiting !== (last.phase === 'attente')) next.hidden = !waiting;
      if (active && waves.wave !== shown.wave) {
        shown.wave = waves.wave;
        setText(wave, fmt(dict['game.wave.hud'], { n: waves.wave }));
      }
      if (fighting && (waves.remaining !== shown.remaining || waves.total !== shown.total)) {
        shown.remaining = waves.remaining;
        shown.total = waves.total;
        setText(remaining, fmt(dict[waves.remaining === 1 ? 'game.wave.remaining.one' : 'game.wave.remaining'], { n: waves.remaining }));
      }
      if (waiting && wait !== shown.wait) {
        shown.wait = wait;
        setText(next, fmt(dict['game.wave.next'], { n: wait }));
      }
      // Lot 3e : puce « RDC » ou « Étage » à côté de « Vague N », seulement quand la carte a des étages (extras.floor nul sinon).
      if (extras.floor !== shownFloor) {
        shownFloor = extras.floor;
        floor.hidden = !extras.floor;
        floor.textContent = extras.floor ? dict[FLOOR_TEXTS.chip[extras.floor]] : '';
        floor.dataset.floor = extras.floor ?? '';
      }
      if (extras.chutes !== shownChutes) {
        shownChutes = extras.chutes;
        const n = Number.isInteger(extras.chutes) && extras.chutes > 0 ? extras.chutes : 0;
        chuteIcons.replaceChildren(...Array.from({ length: n }, silhouette));
        chuteText.textContent = fmt(dict[DOWN_TEXTS.chutes], { n });
        chutes.setAttribute('aria-label', fmt(dict[DOWN_TEXTS.chutesLabel], { n }));
      }
      last = { hp, max: player.maxHealth, kills: killCount, phase: fighting ? 'combat' : waiting ? 'attente' : 'inactif' };
    },
  };
}
