// Effet VHS (surcouche HTML/CSS #vhs) côté page : applique les valeurs pures de js/core/vhs.js à trois couches (lignes de balayage et bords,
// grain, bande de suivi) par des variables CSS. Aucun mix-blend-mode, filter ni backdrop-filter. Le temps est l'horloge d'effet : secondes
// réelles fournies par la boucle d'images (elle continue pendant la pause), distincte de l'horloge de jeu. Coupé : l'élément est retiré du
// DOM (aucun coût) ; l'interrupteur de la pause le remet. Réglage en mémoire seulement (aucun stockage avant le lot 4).
import { createTextureData } from '../core/texgen.js';
import { vhsFrame } from '../core/vhs.js';

// ?vhs=0 coupe, ?vhs=1 force l'effet (hors mouvement réduit), toute autre valeur est ignorée : renvoie false, true ou null.
export function parseVhsParam(value) {
  if (value === '0') return false;
  if (value === '1') return true;
  return null;
}

// Grain de pellicule : texture calculée par texgen.js (genre « grain »), copiée une fois dans un canvas puis convertie en adresse data:.
function grainAddress(params, lookup) {
  const size = Math.max(1, Math.floor(params.grain?.size ?? 128));
  const { data } = createTextureData({
    id: 'grain', kind: 'grain', width: size, height: size, seed: params.seed,
    colors: { light: lookup('--game-vhs-grain-light'), dark: lookup('--game-vhs-grain-dark') }, params: { levels: params.grain?.levels },
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  return canvas.toDataURL('image/png');
}

const fixed = (n, digits = 4) => String(Math.round(n * 10 ** digits) / 10 ** digits);

// params : data/game/vhs.json ; lookup : jeton -> [r, g, b] (palette.js) ; forced : valeur de parseVhsParam ; reducedMotion : prefers-reduced-motion.
export function createVhs({ params, lookup, forced = null, reducedMotion = false, root = document }) {
  const template = root.getElementById('vhs').cloneNode(true);
  const anchor = root.getElementById('floor-fade') ?? root.getElementById('game-canvas'); // le voile de fondu (lot 3e) est entre le canvas et #vhs
  let current = root.getElementById('vhs');
  let enabled = forced ?? params.enabled === true;
  let address = null;
  let override = null;
  let clock = 0;
  let last = null;
  const vars = new Map();
  const setVar = (name, value) => {
    if (vars.get(name) === value) return;
    vars.set(name, value);
    current.style.setProperty(name, value);
  };
  const on = () => enabled && !reducedMotion;

  function mount() {
    if (current) return;
    current = template.cloneNode(true);
    anchor.after(current);
    vars.clear();
  }
  function unmount() {
    current?.remove();
    current = null;
    vars.clear();
    last = null;
  }
  function sync() {
    if (on()) {
      mount();
      address ??= grainAddress(params, lookup);
      setVar('--vhs-grain-url', `url("${address}")`);
    } else unmount();
  }
  sync();

  const api = {
    get enabled() {
      return enabled;
    },
    get on() {
      return on() && current !== null;
    },
    get reducedMotion() {
      return reducedMotion;
    },

    // Interrupteur de la pause : sans effet sous mouvement réduit. Renvoie l'état voulu.
    toggle() {
      if (reducedMotion) return enabled;
      enabled = !enabled;
      sync();
      return enabled;
    },

    // Une image : seconds = horloge d'effet réelle (secondes). Rien à faire quand l'effet est coupé.
    update(seconds) {
      clock = override ?? seconds;
      if (!api.on) return;
      const f = vhsFrame(clock, params.seed, { enabled: true, reducedMotion: false, intensity: params.intensity, params });
      last = f;
      setVar('--vhs-scan', fixed(f.scanOpacity));
      setVar('--vhs-edge', fixed(f.edgeOpacity));
      setVar('--vhs-vignette', fixed(f.vignetteOpacity));
      setVar('--vhs-grain-opacity', fixed(f.grain.opacity));
      setVar('--vhs-gx', String(f.grain.x));
      setVar('--vhs-gy', String(f.grain.y));
      setVar('--vhs-flicker', fixed(f.flicker));
      setVar('--vhs-track-y', fixed(f.track.y));
      setVar('--vhs-track-h', fixed(f.track.active ? f.track.height : 0));
      setVar('--vhs-track-opacity', fixed(f.track.opacity));
      setVar('--vhs-track-shift', fixed(f.track.shiftPx, 2));
    },

    // Test (?test=1) : fige l'horloge d'effet à t secondes (null : reprend l'horloge réelle) et applique une image tout de suite.
    setClock(t) {
      override = typeof t === 'number' && Number.isFinite(t) ? t : null;
      api.update(override ?? clock);
    },

    // Pour getState().vhs (?test=1).
    readout() {
      return {
        enabled, on: api.on, layers: current ? current.children.length : 0, reducedMotion, time: clock,
        grain: last ? { ...last.grain } : null, track: last ? { ...last.track } : null, flicker: last ? last.flicker : 0, opacity: last ? { scan: last.scanOpacity, edge: last.edgeOpacity, vignette: last.vignetteOpacity } : null,
      };
    },
  };
  return api;
}
