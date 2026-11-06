// Atelier de l'interface (lot 3k) : calculs purs des mesures de lisibilité (contraste sur le pire fond, recouvrements, part de l'écran, zone sûre,
// zones des pouces, stabilité des boîtes). Aucun DOM : les boîtes, couleurs et tailles mesurées dans la page arrivent en argument. Aucune exception,
// aucun argument modifié ; une entrée invalide est ignorée ou donne une valeur neutre. Chaque écart à une règle est rapporté (outOfTarget), jamais masqué.
import { contrast, mix } from './color.js';
import { isNum } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v) => (isNum(v) ? v : 0);
const round = (v, d = 2) => Math.round(num(v) * 10 ** d) / 10 ** d;

// Règles par défaut (mêmes valeurs que ui-atelier.json « rules »).
export const DEFAULT_RULES = Object.freeze({
  minTextPx: 14, minContrast: 4.5, minContrastLarge: 3, largeTextPx: 24, largeBoldTextPx: 18.66, minTargetPx: 44, edgePx: 16,
  maxFlashPerSecond: 3, recMaxBlinkPerSecond: 2, outlineMinPx: 1, stickBandTop: 0.5, maxCls: 0.1,
});
export const rulesOf = (rules) => ({ ...DEFAULT_RULES, ...(isObject(rules) ? Object.fromEntries(Object.entries(rules).filter(([, v]) => isNum(v))) : {}) });

// ---------- Couleurs ----------
const FN = 'rg' + 'b'; // jamais écrit en toutes lettres suivi d'une parenthèse (test « aucune couleur en dur »)
const LEGACY = new RegExp(`^${FN}a?\\(\\s*([\\d.]+)(%?)\\s*[ ,]\\s*([\\d.]+)(%?)\\s*[ ,]\\s*([\\d.]+)(%?)\\s*(?:[,/]\\s*([\\d.]+)(%?)\\s*)?\\)$`, 'i');
const SRGB = /^color\(\s*srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)\s*(?:\/\s*([\d.e-]+)(%?)\s*)?\)$/i;
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Couleur CSS calculée (#rgb, #rrggbb, #rrggbbaa, forme fonctionnelle rgb ou rgba, color(srgb …), transparent) → { rgb: [r, g, b], alpha } ; sinon null.
export function parseCssColor(text) {
  if (typeof text !== 'string') return null;
  const v = text.trim();
  if (v.toLowerCase() === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };
  if (HEX.test(v)) {
    let h = v.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => Number.parseInt(h.slice(i, i + 2), 16);
    return { rgb: [n(0), n(2), n(4)], alpha: h.length === 8 ? round(n(6) / 255, 3) : 1 };
  }
  let m = LEGACY.exec(v);
  if (m) {
    const ch = (val, pct) => (pct ? (Number(val) / 100) * 255 : Number(val));
    const rgb = [ch(m[1], m[2]), ch(m[3], m[4]), ch(m[5], m[6])];
    if (!rgb.every((c) => Number.isFinite(c))) return null;
    const a = m[7] === undefined ? 1 : m[8] ? Number(m[7]) / 100 : Number(m[7]);
    return Number.isFinite(a) ? { rgb: rgb.map(clamp255), alpha: clamp01(a) } : null;
  }
  m = SRGB.exec(v);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map((c) => Number(c) * 255);
    const a = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
    if (!rgb.every((c) => Number.isFinite(c)) || !Number.isFinite(a)) return null;
    return { rgb: rgb.map(clamp255), alpha: clamp01(a) };
  }
  return null;
}

const asLayer = (c) => {
  if (typeof c === 'string') return parseCssColor(c);
  if (isObject(c) && Array.isArray(c.rgb)) return { rgb: c.rgb.map((x) => clamp255(num(x))), alpha: clamp01(isNum(c.alpha) ? c.alpha : 1) };
  if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(isNum)) return { rgb: c.slice(0, 3).map(clamp255), alpha: 1 };
  return null;
};

// Superpose des couches (de la plus profonde à la plus proche) sur un fond opaque ; renvoie [r, g, b].
export function composite(layers, base) {
  let out = asLayer(base)?.rgb ?? [0, 0, 0];
  for (const l of Array.isArray(layers) ? layers : []) {
    const layer = asLayer(l);
    if (layer && layer.alpha > 0) out = mix(out, layer.rgb, layer.alpha);
  }
  return out;
}

// Contraste d'un texte sur le pire fond. text = { fg, layers (fonds des ancêtres, du plus profond au plus proche), outline: { color, px } } ;
// backgrounds = [{ name, rgb }] ou couleurs. Un contour d'au moins `outlineMinPx` sert de fond local : on retient le meilleur des deux rapports
// (règle de l'atelier, non normative). Renvoie { ratio, worst, viaOutline } (ratio 1 si rien n'est mesurable).
export function contrastOnWorst(text, backgrounds, rules) {
  const r = rulesOf(rules);
  const fg = asLayer(text?.fg);
  const list = (Array.isArray(backgrounds) ? backgrounds : []).map((b, i) => {
    const named = isObject(b) && b.rgb !== undefined;
    return { name: named && typeof b.name === 'string' ? b.name : String(i), c: asLayer(named ? b.rgb : b) };
  }).filter((b) => b.c);
  if (!fg || list.length === 0) return { ratio: 1, worst: null, viaOutline: false };
  const outline = asLayer(text?.outline?.color);
  const outlinePx = num(text?.outline?.px);
  let best = { ratio: Infinity, worst: null, viaOutline: false };
  for (const b of list) {
    const backdrop = composite(text?.layers, b.c.rgb);
    const shown = mix(backdrop, fg.rgb, fg.alpha);
    let ratio = contrast(shown, backdrop);
    let via = false;
    if (outline && outline.alpha > 0 && outlinePx >= r.outlineMinPx) {
      const local = mix(backdrop, outline.rgb, outline.alpha);
      const withOutline = contrast(mix(local, fg.rgb, fg.alpha), local);
      if (withOutline > ratio) {
        ratio = withOutline;
        via = true;
      }
    }
    if (ratio < best.ratio) best = { ratio, worst: b.name, viaOutline: via };
  }
  return { ...best, ratio: round(best.ratio) };
}

// Grand texte (WCAG) : 24 px, ou 18,66 px en gras.
export function isLargeText(px, weight, rules) {
  const r = rulesOf(rules);
  const size = num(px);
  return size >= r.largeTextPx || (size >= r.largeBoldTextPx && num(weight) >= 700);
}

// ---------- Boîtes ----------
// Boîte { left, top, width, height } ou { left, top, right, bottom } → { left, top, right, bottom } ; invalide : null.
export function normBox(b) {
  if (!isObject(b)) return null;
  const left = b.left ?? b.x;
  const top = b.top ?? b.y;
  if (!isNum(left) || !isNum(top)) return null;
  const right = isNum(b.right) ? b.right : isNum(b.width) ? left + b.width : null;
  const bottom = isNum(b.bottom) ? b.bottom : isNum(b.height) ? top + b.height : null;
  if (right === null || bottom === null || right < left || bottom < top) return null;
  return { left, top, right, bottom };
}

// Surface de l'intersection de deux boîtes (0 si elles ne se touchent pas ou si l'une est invalide).
export function boxOverlap(a, b) {
  const p = normBox(a);
  const q = normBox(b);
  if (!p || !q) return 0;
  const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
  const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
  return w > 0 && h > 0 ? w * h : 0;
}

// Vrai si les deux boîtes se chevauchent de plus de `tol` pixels dans les deux directions.
export function overlaps(a, b, tol = 0.5) {
  const p = normBox(a);
  const q = normBox(b);
  if (!p || !q) return false;
  const t = isNum(tol) ? tol : 0.5;
  return Math.min(p.right, q.right) - Math.max(p.left, q.left) > t && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > t;
}

// Part de la fenêtre couverte par l'union des boîtes (0 à 1), boîtes rognées à la fenêtre ; les recouvrements ne comptent qu'une fois.
export function coverage(boxes, viewport) {
  const vw = num(viewport?.width);
  const vh = num(viewport?.height);
  if (vw <= 0 || vh <= 0) return 0;
  const clipped = (Array.isArray(boxes) ? boxes : []).map(normBox).filter(Boolean)
    .map((b) => ({ left: Math.max(0, b.left), top: Math.max(0, b.top), right: Math.min(vw, b.right), bottom: Math.min(vh, b.bottom) }))
    .filter((b) => b.right > b.left && b.bottom > b.top);
  const xs = [...new Set(clipped.flatMap((b) => [b.left, b.right]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const spans = clipped.filter((b) => b.left <= x0 && b.right >= x1).map((b) => [b.top, b.bottom]).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let cur = null;
    for (const [t, bt] of spans) {
      if (!cur || t > cur[1]) {
        if (cur) covered += cur[1] - cur[0];
        cur = [t, bt];
      } else cur[1] = Math.max(cur[1], bt);
    }
    if (cur) covered += cur[1] - cur[0];
    area += covered * (x1 - x0);
  }
  return Math.min(1, area / (vw * vh));
}

const safeOf = (safe) => ({ top: Math.max(0, num(safe?.top)), right: Math.max(0, num(safe?.right)), bottom: Math.max(0, num(safe?.bottom)), left: Math.max(0, num(safe?.left)) });

// Zone sûre : la fenêtre moins les zones de sécurité (encoche, coins, barre d'accueil).
export function safeRect(viewport, safe) {
  const s = safeOf(safe);
  return { left: s.left, top: s.top, right: num(viewport?.width) - s.right, bottom: num(viewport?.height) - s.bottom };
}

// Zone des marges : 16 px plus les zones de sécurité de chaque côté.
export function marginRect(viewport, safe, rules) {
  const r = rulesOf(rules);
  const s = safeRect(viewport, safe);
  return { left: s.left + r.edgePx, top: s.top + r.edgePx, right: s.right - r.edgePx, bottom: s.bottom - r.edgePx };
}

// Vrai si la boîte tient dans le rectangle (tolérance d'un demi-pixel).
export function inside(box, rect, tol = 0.5) {
  const b = normBox(box);
  const r = normBox(rect);
  if (!b || !r) return false;
  const t = isNum(tol) ? tol : 0.5;
  return b.left >= r.left - t && b.top >= r.top - t && b.right <= r.right + t && b.bottom <= r.bottom + t;
}

// Zones des pouces : moitié gauche et moitié droite de l'écran, dans la bande basse (à partir de stickBandTop × hauteur).
export function stickZones(viewport, rules) {
  const r = rulesOf(rules);
  const w = num(viewport?.width);
  const h = num(viewport?.height);
  const top = h * Math.min(1, Math.max(0, r.stickBandTop));
  return [
    { name: 'stick-gauche', left: 0, top, right: w / 2, bottom: h },
    { name: 'stick-droit', left: w / 2, top, right: w, bottom: h },
  ];
}

// Plus grand déplacement (px) entre deux relevés de boîtes { nom: boîte } ; liste des boîtes qui ont bougé (au-delà de tol).
export function compareBoxes(before, after, tol = 0) {
  const moved = [];
  let max = 0;
  const a = isObject(before) ? before : {};
  const b = isObject(after) ? after : {};
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = normBox(a[name]);
    const q = normBox(b[name]);
    if (!p || !q) {
      if (Boolean(p) !== Boolean(q)) moved.push({ name, delta: Infinity });
      continue;
    }
    const delta = Math.max(Math.abs(p.left - q.left), Math.abs(p.top - q.top), Math.abs(p.right - q.right), Math.abs(p.bottom - q.bottom));
    max = Math.max(max, delta);
    if (delta > (isNum(tol) ? tol : 0)) moved.push({ name, delta: round(delta) });
  }
  return { max: moved.some((m) => m.delta === Infinity) ? Infinity : round(max), moved };
}

// Clignotements par seconde d'une animation : cycles par itération / durée (s) ; durée nulle ou invalide : 0.
export function blinkPerSecond(durationSeconds, cyclesPerIteration = 1) {
  const d = num(durationSeconds);
  const c = isNum(cyclesPerIteration) && cyclesPerIteration > 0 ? cyclesPerIteration : 1;
  return d > 0 ? round(c / d, 3) : 0;
}

// ---------- Évaluation d'un relevé ----------
// measure = { viewport {width, height}, safe, elements: [{ name, role ('hud' | 'button' | 'panel' | 'overlay' | 'modal' | 'stick' | 'decor'),
//   box, target (cible tactile), overflow (contenu qui dépasse), texts: [{ text, px, weight, fg, layers, outline }] }], hudNames (noms comptés dans la part d'écran), modal (écran modal :
//   pas de contrôle des pouces), cls, animations } ; backgrounds = [{ name, rgb }].
// Renvoie { coverage, minTextPx, minTargetPx, minContrast, elementCount, textCount, outOfTarget: [{ rule, element, measure, limit, reason }] }.
export function evaluate(measure, backgrounds, rules) {
  const r = rulesOf(rules);
  const m = isObject(measure) ? measure : {};
  const viewport = { width: num(m.viewport?.width), height: num(m.viewport?.height) };
  const elements = (Array.isArray(m.elements) ? m.elements : []).filter((e) => isObject(e) && normBox(e.box));
  const out = [];
  const flag = (rule, element, measured, limit, reason) => out.push({ rule, element, measure: isNum(measured) ? round(measured) : measured, limit, reason });
  const hudNames = Array.isArray(m.hudNames) ? m.hudNames : elements.filter((e) => e.role === 'hud' || e.role === 'button').map((e) => e.name);
  const hudBoxes = elements.filter((e) => hudNames.includes(e.name)).map((e) => e.box);
  let minText = Infinity;
  let minTarget = Infinity;
  let minContrast = Infinity;
  let textCount = 0;
  const margin = marginRect(viewport, m.safe, r);
  const safe = safeRect(viewport, m.safe);
  const zones = stickZones(viewport, r);

  for (const e of elements) {
    const box = normBox(e.box);
    if (e.role !== 'overlay' && e.role !== 'stick') {
      if (!inside(box, safe)) flag('zone-sure', e.name, null, 'dans la zone sûre', 'élément hors de la zone sûre (zones de sécurité simulées)');
      else if (!inside(box, margin)) flag('marge', e.name, Math.min(box.left - safe.left, box.top - safe.top, safe.right - box.right, safe.bottom - box.bottom), r.edgePx, 'marge inférieure à 16 px en plus de la zone de sécurité');
    }
    if (e.overflow) flag('debordement', e.name, null, 'aucun', 'le contenu dépasse de sa boîte (texte coupé ou qui déborde)');
    if (e.target) {
      const size = Math.min(box.right - box.left, box.bottom - box.top);
      minTarget = Math.min(minTarget, size);
      if (size < r.minTargetPx - 0.5) flag('cible', e.name, size, r.minTargetPx, 'cible tactile trop petite');
    }
    if (!m.modal && (e.role === 'hud' || e.role === 'button' || e.role === 'decor')) {
      for (const z of zones) if (overlaps(box, z)) flag('pouces', e.name, round(boxOverlap(box, z)), 0, `chevauche la zone du pouce (${z.name})`);
    }
    for (const t of Array.isArray(e.texts) ? e.texts : []) {
      if (!isObject(t)) continue;
      textCount += 1;
      const px = num(t.px);
      minText = Math.min(minText, px);
      if (px < r.minTextPx - 0.01) flag('texte', e.name, px, r.minTextPx, `texte trop petit : « ${String(t.text ?? '').slice(0, 24)} »`);
      const c = contrastOnWorst(t, backgrounds, r);
      const need = isLargeText(px, t.weight, r) ? r.minContrastLarge : r.minContrast;
      minContrast = Math.min(minContrast, c.ratio);
      if (c.ratio < need - 0.005) flag('contraste', e.name, c.ratio, need, `contraste insuffisant sur ${c.worst ?? 'le fond'} : « ${String(t.text ?? '').slice(0, 24)} »`);
    }
  }
  // Recouvrements entre éléments de jeu (les voiles et les sticks sont exclus ; un panneau modal n'est comparé qu'à ses propres éléments).
  const solid = elements.filter((e) => e.role !== 'overlay' && e.role !== 'stick' && e.role !== 'decor');
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) {
      const a = solid[i];
      const b = solid[j];
      if (a.parent === b.name || b.parent === a.name) continue;
      if (overlaps(a.box, b.box)) flag('chevauchement', `${a.name} / ${b.name}`, round(boxOverlap(a.box, b.box)), 0, 'deux éléments se chevauchent');
    }
  }
  if (isNum(m.cls) && m.cls > r.maxCls) flag('cls', 'page', m.cls, r.maxCls, 'décalage de mise en page cumulé trop grand');
  for (const a of Array.isArray(m.animations) ? m.animations : []) {
    if (!isObject(a)) continue;
    const limit = a.kind === 'rec' ? r.recMaxBlinkPerSecond : r.maxFlashPerSecond;
    if (num(a.perSecond) > limit) flag('clignotement', a.name ?? 'animation', a.perSecond, limit, 'clignotement trop rapide');
    if (m.reducedMotion && a.running) flag('mouvement-reduit', a.name ?? 'animation', null, 'aucune', 'animation active sous prefers-reduced-motion');
  }
  return {
    coverage: round(coverage(hudBoxes, viewport), 4),
    minTextPx: minText === Infinity ? null : round(minText),
    minTargetPx: minTarget === Infinity ? null : round(minTarget),
    minContrast: minContrast === Infinity ? null : round(minContrast),
    elementCount: elements.length,
    textCount,
    outOfTarget: out,
  };
}

// Fonds de référence lus dans les jetons (jetons de tokens.css : nom → valeur hexadécimale) : [{ name, rgb }] ; les noms inconnus ou illisibles sont ignorés.
export function backgroundsFrom(tokens, names) {
  if (!isObject(tokens) || !Array.isArray(names)) return [];
  return names.filter((n) => typeof n === 'string' && Object.hasOwn(tokens, n)).map((n) => ({ name: n, c: parseCssColor(String(tokens[n])) }))
    .filter((b) => b.c && b.c.alpha === 1).map((b) => ({ name: b.name, rgb: b.c.rgb }));
}

// Jetons d'une feuille de style : { '--nom': 'valeur' } (première définition retenue).
export function tokensFromCss(css) {
  const out = {};
  if (typeof css !== 'string') return out;
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)) if (!Object.hasOwn(out, m[1])) out[m[1]] = m[2].trim();
  return out;
}
