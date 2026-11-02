// Oscillogramme d'un tampon (lot 3h), pur : chemin SVG de 200 points au plus (maximum et minimum par colonne), dans un cadre
// width × height. Aucune couleur ici : la page la donne par une variable de css/tokens.css.
import { isNum } from './vec.js';

export const MAX_POINTS = 200;

export function waveToSvg(samples, { width = 200, height = 48, points = MAX_POINTS } = {}) {
  const n = samples && isNum(samples.length) ? Math.floor(samples.length) : 0;
  const w = isNum(width) && width > 0 ? width : 200;
  const h = isNum(height) && height > 0 ? height : 48;
  const cols = Math.max(1, Math.min(MAX_POINTS, Math.floor(isNum(points) ? points : MAX_POINTS) || 1));
  if (n === 0) return { d: `M0 ${h / 2}H${w}`, points: 0, width: w, height: h };
  const mid = h / 2;
  const top = [];
  const bottom = [];
  const half = Math.max(1, Math.floor(cols / 2));
  for (let c = 0; c < half; c += 1) {
    const a = Math.floor((c / half) * n);
    const b = Math.max(a + 1, Math.floor(((c + 1) / half) * n));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < Math.min(b, n); i += 1) {
      const v = isNum(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const x = Math.round(((c + 0.5) / half) * w * 10) / 10;
    top.push(`${x} ${Math.round((mid - hi * (mid - 1)) * 10) / 10}`);
    bottom.push(`${x} ${Math.round((mid - lo * (mid - 1)) * 10) / 10}`);
  }
  const pts = [...top, ...bottom.reverse()];
  return { d: `M${pts.join('L')}Z`, points: pts.length, width: w, height: h };
}
