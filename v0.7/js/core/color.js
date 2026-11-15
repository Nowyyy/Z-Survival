// Couleurs pures : lecture de chaînes CSS, luminance, contraste, mélange. Une couleur est un tableau [r, g, b] (0 à 255).
// Aucune fonction ne lève d'exception ni ne modifie ses arguments ; une entrée invalide donne null (lecture) ou noir (calcul).
import { isNum } from './vec.js';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FUNC = new RegExp(String.raw`^rgba?\(\s*([\d.]+)\s*[ ,]\s*([\d.]+)\s*[ ,]\s*([\d.]+)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$`.replace('rgb', 'rg' + 'b'), 'i');

const channel = (v) => Math.min(255, Math.max(0, Math.round(v)));

// Vrai pour un tableau de trois nombres finis.
export const isColor = (c) => Array.isArray(c) && c.length >= 3 && isNum(c[0]) && isNum(c[1]) && isNum(c[2]);

// Formats : #rgb, #rrggbb et la forme fonctionnelle rgb à virgules ou à espaces. Toute autre valeur donne null.
export function parseColor(text) {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  if (HEX.test(value)) {
    const hex = value.length === 4 ? [...value.slice(1)].map((c) => c + c).join('') : value.slice(1);
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = FUNC.exec(value);
  if (!m) return null;
  const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  return rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 255) ? rgb.map(Math.round) : null;
}

// Couleur [r, g, b] bornée et arrondie ; entrée invalide : noir.
export function toRgb(c) {
  if (typeof c === 'string') return parseColor(c) ?? [0, 0, 0];
  return isColor(c) ? [channel(c[0]), channel(c[1]), channel(c[2])] : [0, 0, 0];
}

export function toHex(c) {
  const [r, g, b] = toRgb(c);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Luminance relative WCAG, de 0 (noir) à 1 (blanc).
export function luminance(c) {
  const [r, g, b] = toRgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Rapport de contraste WCAG, de 1 (identiques) à 21 ; symétrique.
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Mélange linéaire : t = 0 donne a, t = 1 donne b (t borné à [0, 1]).
export function mix(a, b, t) {
  const k = isNum(t) ? Math.min(1, Math.max(0, t)) : 0;
  const ca = toRgb(a);
  const cb = toRgb(b);
  return ca.map((v, i) => channel(v + (cb[i] - v) * k));
}

// amount de -1 (noir) à 1 (blanc) : assombrit ou éclaircit en mélangeant avec du noir ou du blanc.
export function shade(c, amount) {
  const k = isNum(amount) ? Math.min(1, Math.max(-1, amount)) : 0;
  return k < 0 ? mix(c, [0, 0, 0], -k) : mix(c, [255, 255, 255], k);
}
