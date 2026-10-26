// HUD en HTML (bloc E2-2) : barre de vie, « Vie x/y », « Zombies tués ». N'écrit dans le DOM que si une valeur change.
import { displayHealth } from '../core/combat.js';
import { fmt } from './texts.js';

export function createHud(dict, root = document) {
  const life = root.getElementById('hud-life');
  const fill = root.getElementById('hud-fill');
  const kills = root.getElementById('hud-kills');
  let last = { hp: null, max: null, kills: null };
  return {
    update(player, killCount) {
      const hp = displayHealth(player.health);
      if (hp !== last.hp || player.maxHealth !== last.max) {
        life.textContent = fmt(dict['game.hud.life'], { hp, max: player.maxHealth });
        fill.style.transform = `scaleX(${player.maxHealth > 0 ? Math.min(1, hp / player.maxHealth) : 0})`;
      }
      if (killCount !== last.kills) kills.textContent = fmt(dict['game.hud.kills'], { n: killCount });
      last = { hp, max: player.maxHealth, kills: killCount };
    },
  };
}
