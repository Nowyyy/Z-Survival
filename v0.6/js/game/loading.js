// Écran de préparation : couvre toute la fenêtre (position fixe, aucun décalage de mise en page) et annonce l'avancement par paliers
// de 10 % dans une région role="status". Disparaît quand tout est prêt.
import { fmt, TEXTURE_TEXTS } from './texts.js';

export function createLoading(dict) {
  const root = document.getElementById('loading');
  const text = document.getElementById('loading-text');
  const fill = document.getElementById('loading-fill');
  let shown = -1;
  const update = (ratio) => {
    const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    fill.style.transform = `scaleX(${percent / 100})`;
    const step = Math.floor(percent / 10);
    if (step !== shown) {
      shown = step;
      text.textContent = fmt(dict[TEXTURE_TEXTS.loading], { n: step * 10 });
    }
  };
  update(0);
  return {
    update,
    done() {
      text.textContent = dict[TEXTURE_TEXTS.done];
      root.hidden = true;
    },
  };
}
