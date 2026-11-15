// Vecteurs 2D purs : chaque fonction renvoie un nouvel objet et accepte n'importe quelle entrée.
export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const num = (n, fallback = 0) => (isNum(n) ? n : fallback);

export const vec = (x = 0, y = 0) => ({ x: num(x), y: num(y) });
export const toVec = (v) => vec(v?.x, v?.y);
export const add = (a, b) => vec(num(a?.x) + num(b?.x), num(a?.y) + num(b?.y));
export const sub = (a, b) => vec(num(a?.x) - num(b?.x), num(a?.y) - num(b?.y));
export const scale = (v, k) => vec(num(v?.x) * num(k), num(v?.y) * num(k));
export const dot = (a, b) => num(a?.x) * num(b?.x) + num(a?.y) * num(b?.y);
export const length = (v) => Math.hypot(num(v?.x), num(v?.y));
export const distance = (a, b) => length(sub(a, b));
export const clamp = (n, lo, hi) => Math.min(Math.max(num(n), lo), hi);

// Normalisation sûre : le vecteur nul (ou invalide) reste nul, sans erreur.
export function normalize(v) {
  const x = num(v?.x);
  const y = num(v?.y);
  const len = Math.hypot(x, y);
  return len > 0 && Number.isFinite(len) ? vec(x / len, y / len) : vec(0, 0);
}

export const fromAngle = (angle, len = 1) => vec(Math.cos(num(angle)) * num(len), Math.sin(num(angle)) * num(len));
export const angleOf = (v) => Math.atan2(num(v?.y), num(v?.x));

// Pas de temps du jeu : jamais négatif, jamais plus de 0,05 s.
export const MAX_DT = 0.05;
export const clampDt = (dt) => (isNum(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0);
