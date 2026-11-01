// Atelier de l'interface (lot 3k) : relevé des boîtes, textes, couleurs et animations dans un document (la page d'atelier, le document du jeu dans son
// cadre, ou jeu.html ouvert directement par scripts/interface/mesures.mjs). Lecture seule : rien n'est modifié. Les verdicts sont calculés par
// js/core/ui-measure.js (pur).
import { blinkPerSecond } from '../core/ui-measure.js';

const TEXT_TAGS = /^(SCRIPT|STYLE|SVG|svg|path|circle)$/;

function visible(el, win) {
  if (!el || el.hidden) return false;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.hidden) return false;
    const s = win.getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
  }
  return el.getClientRects().length > 0;
}

// Contour d'un texte : -webkit-text-stroke, ou ombres de texte nettes (sans flou) d'une même couleur tout autour.
function outlineOf(style) {
  const stroke = Number.parseFloat(style.webkitTextStrokeWidth);
  if (stroke > 0) return { color: style.webkitTextStrokeColor, px: stroke };
  const shadow = style.textShadow;
  if (!shadow || shadow === 'none') return null;
  const parts = shadow.split(/,(?![^()]*\))/).map((p) => p.trim());
  if (parts.length < 4) return null;
  let color = null;
  let px = 0;
  for (const p of parts) {
    const c = /^(.*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*(-?[\d.]+px)?/.exec(p) ?? /^(\S+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*(-?[\d.]+px)?/.exec(p);
    if (!c) return null;
    if (Number.parseFloat(c[4] ?? '0') > 0.5) return null;
    if (color !== null && color !== c[1]) return null;
    color = c[1];
    px = Math.max(px, Math.abs(Number(c[2])), Math.abs(Number(c[3])));
  }
  return { color, px };
}

// Fonds des ancêtres jusqu'à `root` exclu, du plus profond (le plus éloigné) au plus proche. Les fonds de la scène (body, #game-root, la scène de
// l'atelier) ne comptent pas : le pire fond est un sol, un mur ou la brume du jeu (ui-atelier.json).
const SCENE = 'html, body, #game-root, .ui3k-stage';
function layersOf(el, root, win) {
  const out = [];
  for (let n = el; n && n.nodeType === 1 && n !== root; n = n.parentElement) {
    if (n.matches(SCENE)) continue;
    const bg = win.getComputedStyle(n).backgroundColor;
    if (bg && bg !== 'transparent' && !/\/\s*0\)$|,\s*0\)$/.test(bg)) out.push(bg);
  }
  return out.reverse();
}

// Textes visibles portés par un élément et ses descendants : { text, px, weight, fg, layers, outline, lines }.
export function textsOf(el, root, win) {
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, 4);
  const seen = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const host = node.parentElement;
    if (!host || seen.has(host) || TEXT_TAGS.test(host.tagName) || node.textContent.trim() === '') continue;
    if (host.closest('.sr-only') || !visible(host, win)) continue;
    seen.add(host);
    const s = win.getComputedStyle(host);
    if (s.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)/.test(s.clipPath)) continue;
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(host);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    out.push({ text: host.textContent.trim().slice(0, 60), px: Number.parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400, fg: s.color, layers: layersOf(host, root, win), outline: outlineOf(s), lines });
  }
  return out;
}

// Relevé. spec = { root (élément de référence des fonds), origin (élément dont le coin haut gauche est l'origine), scale, viewport, safe, modal,
// hudNames, items: [{ name, selector | element, role, target, parent, all (tous les éléments du sélecteur) }] }.
export function collect(doc, spec) {
  const win = doc.defaultView;
  const scale = spec.scale > 0 ? spec.scale : 1;
  const o = spec.origin ? spec.origin.getBoundingClientRect() : { left: 0, top: 0 };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: (r.left - o.left) / scale, top: (r.top - o.top) / scale, width: r.width / scale, height: r.height / scale };
  };
  const elements = [];
  for (const item of spec.items ?? []) {
    const nodes = item.element ? [item.element] : item.all ? [...doc.querySelectorAll(item.selector)] : [doc.querySelector(item.selector)].filter(Boolean);
    nodes.forEach((el, i) => {
      if (!visible(el, win)) return;
      const name = nodes.length > 1 ? `${item.name}${el.id ? `#${el.id}` : `-${i + 1}`}` : item.name;
      const overflow = item.checkOverflow ? el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 : false;
      elements.push({ name, role: item.role, target: Boolean(item.target), parent: item.parent ?? null, overflow, box: box(el), texts: item.noText ? [] : textsOf(el, spec.root ?? doc.body, win) });
    });
  }
  return { viewport: spec.viewport, safe: spec.safe, modal: Boolean(spec.modal), hudNames: spec.hudNames, elements };
}

// Animations en cours sous `root` : { name, running, perSecond, kind }.
export function animationsUnder(root) {
  const doc = root.ownerDocument;
  return (doc.getAnimations ? doc.getAnimations() : []).filter((a) => a.effect?.target && root.contains(a.effect.target)).map((a) => {
    const t = a.effect.target;
    const timing = a.effect.getTiming();
    const duration = Number(timing.duration) / 1000;
    return { name: a.animationName ?? t.dataset?.ui ?? t.className, running: a.playState === 'running', perSecond: blinkPerSecond(duration, Number(t.dataset?.blinkCycles) || 1), kind: t.dataset?.blink ?? 'flash' };
  });
}

// Boîtes { nom: boîte } (pour la stabilité).
export function boxesOf(doc, items, origin, scale = 1) {
  const o = origin ? origin.getBoundingClientRect() : { left: 0, top: 0 };
  const out = {};
  for (const item of items) {
    const el = item.element ?? doc.querySelector(item.selector);
    if (!el || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    out[item.name] = { left: (r.left - o.left) / scale, top: (r.top - o.top) / scale, width: r.width / scale, height: r.height / scale };
  }
  return out;
}

// Nombre d'éléments du DOM sous `root` (compris).
export const domCount = (root) => 1 + root.querySelectorAll('*').length;
