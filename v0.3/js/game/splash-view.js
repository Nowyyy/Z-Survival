// Animation de changement de vague (E2-8), côté page : applique la vue pure de js/core/wave-splash.js à l'élément #wave-announce. Tout passe
// par des variables CSS (--splash-*) mises à jour à chaque image avec l'horloge du jeu : aucune animation CSS autonome, donc l'animation est
// figée par la pause. N'écrit dans le DOM que si une valeur change.
import { fmt } from './texts.js';

const fixed = (n, digits = 3) => String(Math.round(n * 10 ** digits) / 10 ** digits);

export function createSplashView(dict, root = document) {
  const el = root.getElementById('wave-announce');
  const title = root.getElementById('wave-announce-title');
  const sub = root.getElementById('wave-announce-sub');
  const tears = [...el.querySelectorAll('.wave-announce-tear')];
  const shown = { text: null, sub: null, kind: null, visible: null };
  const vars = new Map();
  let last = null;
  const setVar = (name, value) => {
    if (vars.get(name) === value) return;
    vars.set(name, value);
    el.style.setProperty(name, value);
  };
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    // view : sortie de stepSplash().view.
    apply(view) {
      last = view;
      if (view.visible) {
        const text = fmt(dict[view.title.key], { n: view.title.n });
        if (text !== shown.text) {
          shown.text = text;
          setText(title, text);
          for (const node of tears) setText(node, text); // copies décoratives clippées : les déchirures
        }
        const subText = view.subtitle ? dict[view.subtitle.key] : '';
        if (subText !== shown.sub) {
          shown.sub = subText;
          setText(sub, subText);
          sub.hidden = subText === '';
        }
        if (view.kind !== shown.kind) {
          shown.kind = view.kind;
          el.classList.toggle('is-fin', view.kind === 'fin');
          el.classList.toggle('is-renforcee', view.kind === 'renforcee');
        }
      }
      if (view.visible !== shown.visible) {
        shown.visible = view.visible;
        el.classList.toggle('is-visible', view.visible);
      }
      setVar('--splash-opacity', fixed(view.opacity));
      setVar('--splash-scale', fixed(view.scale));
      setVar('--splash-shift', fixed(view.shiftX, 2));
      setVar('--splash-split', fixed(view.rgbSplit, 2));
      setVar('--splash-flicker', fixed(view.flicker));
      tears.forEach((_, i) => {
        const t = view.tears[i];
        setVar(`--splash-tear${i + 1}-y`, fixed(t ? t.y : 0));
        setVar(`--splash-tear${i + 1}-h`, fixed(t ? t.h : 0));
      });
    },

    // Pour getState().splash (?test=1) : ce qui est affiché.
    readout() {
      const v = last;
      if (!v) return { visible: false, kind: null, step: null, t: 0, opacity: 0, title: null, subtitle: null, wave: 0 };
      return {
        visible: v.visible, kind: v.kind, step: v.step, t: v.t, opacity: v.opacity,
        title: v.visible ? shown.text : null, subtitle: v.visible && shown.sub ? shown.sub : null, wave: v.title?.n ?? 0,
        scale: v.scale, shiftX: v.shiftX, rgbSplit: v.rgbSplit, flicker: v.flicker, tears: v.tears.map((t) => ({ ...t })),
      };
    },
  };
}
