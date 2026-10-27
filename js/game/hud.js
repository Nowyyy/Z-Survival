// HUD en HTML (blocs E2-2 et E2-8) : barre de vie, « Vie x/y », « Zombies tués », « Vague N », « Restants : x », « Prochaine vague dans N s »
// et l'annonce de vague. N'écrit dans le DOM que si une valeur change.
import { displayHealth } from '../core/combat.js';
import { fmt } from './texts.js';

export function createHud(dict, root = document) {
  const life = root.getElementById('hud-life');
  const fill = root.getElementById('hud-fill');
  const kills = root.getElementById('hud-kills');
  const wave = root.getElementById('hud-wave');
  const remaining = root.getElementById('hud-remaining');
  const next = root.getElementById('hud-next');
  const announce = root.getElementById('wave-announce');
  const title = root.getElementById('wave-announce-title');
  const sub = root.getElementById('wave-announce-sub');
  let last = { hp: null, max: null, kills: null, phase: null, announce: null };
  const shown = { wave: null, remaining: null, wait: null }; // dernières valeurs écrites
  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  return {
    // player : { health, maxHealth } ; waves : sortie de wave-director.info() ; note : { kind: 'start' | 'end', wave, reinforced } ou null.
    update(player, killCount, waves, note = null) {
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
      if (fighting !== (last.phase === 'combat')) {
        wave.hidden = !fighting;
        remaining.hidden = !fighting;
      }
      if (waiting !== (last.phase === 'attente')) next.hidden = !waiting;
      if (fighting && waves.wave !== shown.wave) {
        shown.wave = waves.wave;
        setText(wave, fmt(dict['game.wave.hud'], { n: waves.wave }));
      }
      if (fighting && waves.remaining !== shown.remaining) {
        shown.remaining = waves.remaining;
        setText(remaining, fmt(dict['game.wave.remaining'], { n: waves.remaining }));
      }
      if (waiting && wait !== shown.wait) {
        shown.wait = wait;
        setText(next, fmt(dict['game.wave.next'], { n: wait }));
      }
      const key = note ? `${note.kind}${note.wave}` : null;
      if (key !== last.announce) {
        if (note) {
          setText(title, fmt(dict[note.kind === 'end' ? 'game.wave.done' : 'game.wave.announce'], { n: note.wave }));
          setText(sub, note.kind === 'start' && note.reinforced ? dict['game.wave.reinforced'] : '');
          sub.hidden = sub.textContent === '';
        }
        announce.classList.toggle('is-visible', Boolean(note));
      }
      last = { hp, max: player.maxHealth, kills: killCount, phase: fighting ? 'combat' : waiting ? 'attente' : 'inactif', announce: key };
    },
  };
}
