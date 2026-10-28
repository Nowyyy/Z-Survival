// HUD en HTML (bloc E2-2, lot 3a) : barre de vie avec « 100/100 » dedans (role="progressbar"), puces « Vague N », restants (ou compte à rebours), tués et chutes
// (une silhouette par chute restante et le nombre), puis la rangée des fenêtres attaquées ou ouvertes (js/core/hud-windows.js). N'écrit dans le DOM que si une
// valeur change. L'annonce de vague (E2-8) est une animation centrale : js/game/splash-view.js.
import { displayHealth } from '../core/combat.js';
import { DOWN_TEXTS, fmt, WINDOW_TEXTS } from './texts.js';

const SVG = 'http://www.w3.org/2000/svg';
const SILHOUETTE = 'M5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM2 7.5c0-1 .8-1.7 1.8-1.7h2.4c1 0 1.8.7 1.8 1.7V12H6.5v3.5h-3V12H2Z';

// Icône de silhouette d'une chute restante (SVG en ligne, décorative).
function silhouette() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 10 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', SILHOUETTE);
  svg.append(path);
  return svg;
}

export function createHud(dict, root = document) {
  const el = (id) => root.getElementById(id);
  const bar = el('hud-bar');
  const life = el('hud-life');
  const fill = el('hud-fill');
  const kills = el('hud-kills');
  const wave = el('hud-wave');
  const remaining = el('hud-remaining');
  const next = el('hud-next');
  const windows = el('hud-windows');
  const chutes = el('hud-chutes');
  const chuteIcons = el('hud-chutes-icons');
  const chuteText = el('hud-chutes-text');
  let shownChutes = null;
  let shownWindows = null;
  let last = { hp: null, max: null, kills: null, phase: null };
  const shown = { wave: null, remaining: null, total: null, wait: null }; // dernières valeurs écrites
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  const span = (cls, text) => {
    const node = document.createElement('span');
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Une puce de fenêtre : initiale, encoches pleines ou vides et « ! », ou le mot « ouverte » à 0 planche.
  function chipNode(chip, name) {
    const node = span('hud-win');
    node.dataset.id = chip.id;
    node.dataset.state = chip.open ? 'open' : 'attacked';
    const key = chip.open ? WINDOW_TEXTS.chipLabelOpen : chip.attacked ? WINDOW_TEXTS.chipLabelAttacked : WINDOW_TEXTS.chipLabel;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', fmt(dict[key], { name, n: chip.planks, max: chip.max }));
    node.append(span('hud-win-letter', chip.label));
    if (chip.open) {
      node.append(span('hud-win-open', dict[WINDOW_TEXTS.chipOpen]));
    } else {
      const notches = span('hud-win-notches');
      notches.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < chip.max; i += 1) {
        const notch = span('hud-win-notch');
        notch.dataset.on = i < chip.planks ? '1' : '0';
        notches.append(notch);
      }
      node.append(notches);
      if (chip.attacked) node.append(span('hud-win-alert', dict[WINDOW_TEXTS.chipAttacked]));
    }
    return node;
  }

  return {
    // player : { health, maxHealth } ; waves : sortie de wave-director.info() ; extras : { chutes, chips: { chips, more }, names: { id: nom } }.
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
      if (extras.chutes !== shownChutes) {
        shownChutes = extras.chutes;
        const n = Number.isInteger(extras.chutes) && extras.chutes > 0 ? extras.chutes : 0;
        chuteIcons.replaceChildren(...Array.from({ length: n }, silhouette));
        chuteText.textContent = fmt(dict[DOWN_TEXTS.chutes], { n });
        chutes.setAttribute('aria-label', fmt(dict[DOWN_TEXTS.chutesLabel], { n }));
      }
      // Rangée des fenêtres (lot 3a) : seulement les fenêtres attaquées ou ouvertes ; masquée sans hauteur réservée quand tout va bien.
      const chips = Array.isArray(extras.chips?.chips) ? extras.chips.chips : [];
      const more = Number.isInteger(extras.chips?.more) ? extras.chips.more : 0;
      const signature = chips.map((c) => `${c.id}:${c.planks}:${c.attacked ? 1 : 0}`).join('|') + `+${more}`;
      if (signature !== shownWindows) {
        shownWindows = signature;
        const nodes = chips.map((c) => chipNode(c, extras.names?.[c.id] ?? c.id));
        if (more > 0) {
          const node = span('hud-win hud-win-more', fmt(dict[WINDOW_TEXTS.chipMore], { n: more }));
          node.setAttribute('role', 'img');
          node.setAttribute('aria-label', fmt(dict[WINDOW_TEXTS.chipMoreLabel], { n: more }));
          nodes.push(node);
        }
        windows.replaceChildren(...nodes);
        windows.hidden = nodes.length === 0;
      }
      last = { hp, max: player.maxHealth, kills: killCount, phase: fighting ? 'combat' : waiting ? 'attente' : 'inactif' };
    },
  };
}
