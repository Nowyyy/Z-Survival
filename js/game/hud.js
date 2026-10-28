// HUD en HTML (bloc E2-2) : barre de vie, « Vie x/y », « Zombies tués », « Vague N », « Restants : x », « Prochaine vague dans N s ».
// L'annonce de vague (E2-8) est une animation centrale : js/game/splash-view.js. N'écrit dans le DOM que si une valeur change.
import { displayHealth } from '../core/combat.js';
import { DOWN_TEXTS, fmt, WINDOW_TEXTS } from './texts.js';

export function createHud(dict, root = document) {
  const life = root.getElementById('hud-life');
  const fill = root.getElementById('hud-fill');
  const kills = root.getElementById('hud-kills');
  const wave = root.getElementById('hud-wave');
  const remaining = root.getElementById('hud-remaining');
  const next = root.getElementById('hud-next');
  const windows = root.getElementById('hud-windows');
  const chutes = root.getElementById('hud-chutes');
  let shownChutes = null;
  let last = { hp: null, max: null, kills: null, phase: null };
  const shown = { wave: null, remaining: null, total: null, wait: null }; // dernières valeurs écrites
  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  return {
    // player : { health, maxHealth } ; waves : sortie de wave-director.info().
    update(player, killCount, waves, extras = {}) {
      const hp = displayHealth(player.health);
      if (hp !== last.hp || player.maxHealth !== last.max) {
        life.textContent = fmt(dict['game.hud.life'], { hp, max: player.maxHealth });
        fill.style.transform = `scaleX(${player.maxHealth > 0 ? Math.min(1, hp / player.maxHealth) : 0})`;
      }
      if (killCount !== last.kills) kills.textContent = fmt(dict['game.hud.kills'], { n: killCount });
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
        setText(remaining, fmt(dict['game.wave.remaining'], { n: waves.remaining, total: waves.total }));
      }
      if (waiting && wait !== shown.wait) {
        shown.wait = wait;
        setText(next, fmt(dict['game.wave.next'], { n: wait }));
      }
      if (extras.chutes !== shownChutes) {
        shownChutes = extras.chutes;
        chutes.textContent = fmt(dict[DOWN_TEXTS.chutes], { n: extras.chutes ?? 0 });
      }
      // Ligne « Fenêtres » (lot 3) : écrite seulement si le texte change ; masquée sans fenêtre (salle du lot 1m).
      const list = Array.isArray(extras.windows) ? extras.windows : [];
      const line = list.length > 0 ? fmt(dict[WINDOW_TEXTS.hud], { list: list.join(dict[WINDOW_TEXTS.sep]) }) : '';
      if (windows.hidden === (list.length > 0)) windows.hidden = list.length === 0;
      setText(windows, line);
      last = { hp, max: player.maxHealth, kills: killCount, phase: fighting ? 'combat' : waiting ? 'attente' : 'inactif' };
    },
  };
}
