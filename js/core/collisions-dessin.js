// Lot 9h (retours du propriétaire, intérieur) : collisions recalées sur le dessin. Pur : ni Three.js, ni DOM, ni hasard, ni horloge.
// - Meubles : chaque obstacle dessiné d'après le modèle (mobilier.world.json) bloque le rectangle de son dessin (règle du lot 8j), plus le rectangle
//   du plan quand celui-ci débordait du dessin (« murs invisibles » : jusqu'à 40 de plus, joueur et tirs arrêtés dans le vide).
// - Escaliers physiques : les marches dessinées (dix boîtes qui suivent la montée, la dernière prolongée de 26 sous le sol de l'étage, comme
//   js/game/world.js) deviennent la collision de l'escalier, en tranches étroites (une boîte tournée → ses tranches en rectangles alignés), au lieu
//   des grands rectangles du plan (on traversait le bas de l'escalier de l'aile ; on butait trop tôt sur l'escalier courbe).
import { isNum, num } from './vec.js';

export const MARCHES = 10; // js/game/world.js → STEPS
export const PROLONGE = 26; // dernière marche prolongée sous le sol de l'étage (js/game/world.js)
export const SEUIL = 6; // recul minimal d'un bord de meuble recalé (en dessous : écart de dessin, pas un mur invisible)
export const TRANCHES = 4; // tranches d'une marche dans sa largeur (rectangles alignés, débord des marches tournées ≤ quelques unités)

// Montée d'un escalier (zones.json → walk, unités du jeu) : du dernier point à t = 0 au premier à t = 1. Même calcul que js/game/world.js (riseOf).
export function montee(walk) {
  const path = Array.isArray(walk?.path) ? walk.path.filter((q) => q && isNum(q.x) && isNum(q.y) && isNum(q.t)) : [];
  const hi = path.findIndex((q) => q.t >= 1);
  if (path.length < 2 || hi < 1) return null;
  const lo = path.findLastIndex((q, i) => i < hi && q.t <= 0);
  if (lo < 0) return null;
  const points = path.slice(lo, hi + 1).map((q) => ({ x: q.x, y: q.y, t: q.t }));
  const lengths = points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y));
  return { points, lengths, total: lengths.reduce((n, l) => n + l, 0), width: num(walk.width, 100) };
}

// Point de la montée à la fraction k (riseAt de js/game/world.js).
export function pointMontee(rise, k) {
  const at = Math.min(1, Math.max(0, k)) * rise.total;
  let walked = 0;
  for (let i = 0; i < rise.lengths.length; i += 1) {
    const len = rise.lengths[i];
    if (at <= walked + len || i === rise.lengths.length - 1) {
      const a = rise.points[i];
      const b = rise.points[i + 1];
      const f = len > 0 ? Math.min(1, Math.max(0, (at - walked) / len)) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
    }
    walked += len;
  }
  return { ...rise.points[0] };
}

// Marches dessinées : [{ cx, cy, dx, dy (unitaire, sens de la montée), longueur, largeur }] (même géométrie que js/game/world.js → orientedStep).
export function marches(walk, { n = MARCHES, prolonge = PROLONGE } = {}) {
  const rise = montee(walk);
  if (!rise) return [];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = pointMontee(rise, i / n);
    const p1 = pointMontee(rise, (i + 1) / n);
    const run = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const dx = (p1.x - p0.x) / run;
    const dy = (p1.y - p0.y) / run;
    const ext = i === n - 1 ? prolonge : 0;
    out.push({ cx: (p0.x + p1.x) / 2 + dx * (ext / 2), cy: (p0.y + p1.y) / 2 + dy * (ext / 2), dx, dy, longueur: run + 1 + ext, largeur: rise.width });
  }
  return out;
}

const r1 = (v) => Math.round(v * 10) / 10;
// Rectangles alignés couvrant les marches : chaque marche coupée en `tranches` dans sa largeur, chaque tranche → son rectangle englobant.
// Escalier droit (toutes les marches dans la même direction) : un seul rectangle, celui de toutes les marches (un zombie posé dedans en ressort
// par le bord le plus proche ; plusieurs petits rectangles le retiendraient).
export function rectsMarches(walk, { tranches = TRANCHES, ...opts } = {}) {
  const rects = [];
  const liste = marches(walk, opts);
  const droit = liste.length > 0 && liste.every((m) => Math.abs(m.dx * liste[0].dy - m.dy * liste[0].dx) < 0.02 && m.dx * liste[0].dx + m.dy * liste[0].dy > 0);
  if (droit) tranches = 1;
  for (const m of liste) {
    const nx = -m.dy;
    const ny = m.dx;
    for (let k = 0; k < tranches; k += 1) {
      const b0 = -m.largeur / 2 + (k * m.largeur) / tranches;
      const b1 = b0 + m.largeur / tranches;
      const pts = [];
      for (const a of [-m.longueur / 2, m.longueur / 2]) for (const b of [b0, b1]) pts.push([m.cx + m.dx * a + nx * b, m.cy + m.dy * a + ny * b]);
      const x0 = Math.floor(Math.min(...pts.map((p) => p[0])) * 10) / 10;
      const y0 = Math.floor(Math.min(...pts.map((p) => p[1])) * 10) / 10;
      rects.push({ x: x0, y: y0, w: r1(Math.ceil(Math.max(...pts.map((p) => p[0])) * 10) / 10 - x0), h: r1(Math.ceil(Math.max(...pts.map((p) => p[1])) * 10) / 10 - y0) });
    }
  }
  if (droit && rects.length > 0) {
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    return [{ x: x0, y: y0, w: r1(Math.max(...rects.map((r) => r.x + r.w)) - x0), h: r1(Math.max(...rects.map((r) => r.y + r.h)) - y0) }];
  }
  return rects;
}

// Écarts d'axe entre deux rectangles (0 s'ils se recouvrent sur cet axe) : { dx, dy, g } (g : distance, comme rectGap de collision.js).
function ecart(a, b) {
  const dx = Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h));
  return { dx, dy, g: Math.hypot(dx, dy) };
}

// Ferme les interstices plus étroits que `min` (règle de la carte : au contact ou à min au moins) : le bord du rectangle avance jusqu'au contact de
// l'obstacle ou du mur voisin ; borne : rectangle à ne pas dépasser (rectangle du plan d'un meuble), ou aucune (marches).
function fermer(r, voisins, min, borne = null) {
  let q = { ...r };
  for (let passe = 0; passe < 4; passe += 1) {
    let bouge = false;
    for (const o of voisins) {
      const e = ecart(q, o);
      if (!(e.g > 1e-6 && e.g < min)) continue;
      if (e.dx > 0) {
        if (o.x >= q.x + q.w) q.w += e.dx;
        else {
          q.x -= e.dx;
          q.w += e.dx;
        }
      }
      if (e.dy > 0) {
        if (o.y >= q.y + q.h) q.h += e.dy;
        else {
          q.y -= e.dy;
          q.h += e.dy;
        }
      }
      bouge = true;
    }
    if (!bouge) break;
  }
  if (borne) {
    const x0 = Math.max(borne.x, q.x);
    const y0 = Math.max(borne.y, q.y);
    q = { x: x0, y: y0, w: Math.min(borne.x + borne.w, q.x + q.w) - x0, h: Math.min(borne.y + borne.h, q.y + q.h) - y0 };
  }
  return { x: r1(q.x), y: r1(q.y), w: r1(q.w), h: r1(q.h) };
}

// Retire d'un rectangle sa partie dans une zone interdite (zone de déclenchement d'un escalier) en reculant le bord le plus proche ; null s'il disparaît.
function horsZone(r, z) {
  if (ecart(r, z).g > 0 || r.x >= z.x + z.w || z.x >= r.x + r.w || r.y >= z.y + z.h || z.y >= r.y + r.h) return r;
  const choix = [
    { w: z.x - r.x, q: { ...r, w: z.x - r.x } }, { w: r.x + r.w - (z.x + z.w), q: { ...r, x: z.x + z.w, w: r.x + r.w - (z.x + z.w) } },
    { w: z.y - r.y, q: { ...r, h: z.y - r.y } }, { w: r.y + r.h - (z.y + z.h), q: { ...r, y: z.y + z.h, h: r.y + r.h - (z.y + z.h) } },
  ].filter((c) => c.w > 0.5);
  if (choix.length === 0) return null;
  const garde = choix.sort((a, b) => (b.q.w * b.q.h) - (a.q.w * a.q.h))[0].q;
  return { x: r1(garde.x), y: r1(garde.y), w: r1(garde.w), h: r1(garde.h) };
}

// Obstacles d'un étage recalés sur le dessin. obstacles : world.json → obstacles ; pieces : pièces de mobilier.world.json de cet étage ({ obstacle, boxes }) ;
// escaliers : [{ id (obstacle), walk, interdits: [rects] (zones de déclenchement) }] (rez-de-chaussée) ; murs : rectangles des murs (segmentRects) ;
// min : couloir minimal (params.json → minCorridor, 50). Les interstices plus étroits que min sont refermés (au contact). → { obstacles, rapport }.
export function recalerObstacles(obstacles, { pieces = [], escaliers = [], murs = [], min = 50 } = {}) {
  const rapport = [];
  const parObstacle = new Map();
  for (const p of pieces) if (p && typeof p.obstacle === 'string' && Array.isArray(p.boxes)) parObstacle.set(p.obstacle, [...(parObstacle.get(p.obstacle) ?? []), ...p.boxes]);
  const liste = Array.isArray(obstacles) ? obstacles : [];
  const escalierDe = (o) => escaliers.find((e) => o.id === e.id || o.id.startsWith(`${e.id}.`));
  const base = (o) => (escalierDe(o)?.id ?? o.id);
  // Première passe : nouveaux rectangles (marches, dessin des meubles).
  const nouveaux = [];
  const faits = new Set();
  for (const o of liste) {
    const esc = o.kind === 'escalier' ? escalierDe(o) : null;
    if (esc) {
      if (faits.has(esc.id)) continue;
      const rects = rectsMarches(esc.walk);
      if (rects.length === 0) {
        nouveaux.push({ o, rects: [o], fixe: true });
        continue;
      }
      faits.add(esc.id);
      nouveaux.push({ o, esc, rects });
      continue;
    }
    const boxes = parObstacle.get(o.id);
    if (!boxes || boxes.length === 0 || ['pilier', 'escalier', 'sacs', 'bidon'].includes(o.kind)) {
      nouveaux.push({ o, rects: [o], fixe: true });
      continue;
    }
    // Bord recalé seulement s'il recule d'au moins SEUIL (vrai mur invisible) ; arrondi vers l'extérieur au demi : le dessin reste dans la collision.
    const bord = (plan, dessin, sens) => (Math.abs(dessin - plan) >= SEUIL ? (sens < 0 ? Math.floor(dessin * 2) / 2 : Math.ceil(dessin * 2) / 2) : plan);
    const x0 = bord(o.x, Math.max(o.x, Math.min(...boxes.map((b) => b.x0))), -1);
    const x1 = bord(o.x + o.w, Math.min(o.x + o.w, Math.max(...boxes.map((b) => b.x1))), 1);
    const y0 = bord(o.y, Math.max(o.y, Math.min(...boxes.map((b) => b.z0))), -1);
    const y1 = bord(o.y + o.h, Math.min(o.y + o.h, Math.max(...boxes.map((b) => b.z1))), 1);
    nouveaux.push({ o, meuble: true, rects: [{ x: r1(x0), y: r1(y0), w: r1(x1 - x0), h: r1(y1 - y0) }] });
  }
  // Seconde passe : interstices refermés contre les murs et les autres obstacles (jamais entre morceaux d'un même escalier), zones de déclenchement libres.
  const tous = () => nouveaux.flatMap((n) => n.rects.map((r) => ({ ...r, cle: n.esc?.id ?? n.o.id })));
  for (const n of nouveaux) {
    if (n.fixe) continue;
    const cle = n.esc?.id ?? n.o.id;
    const voisins = [...murs, ...tous().filter((r) => r.cle !== cle)];
    n.rects = n.rects.map((r) => fermer(r, voisins, min, n.meuble ? { x: n.o.x, y: n.o.y, w: n.o.w, h: n.o.h } : null));
    if (n.esc) n.rects = n.rects.map((r) => (n.esc.interdits ?? []).reduce((q, z) => (q ? horsZone(q, z) : q), r)).filter(Boolean);
  }
  const out = [];
  for (const n of nouveaux) {
    if (n.fixe) {
      out.push(n.o);
      continue;
    }
    if (n.esc) {
      n.rects.forEach((r, k) => out.push({ id: k === 0 ? n.esc.id : `${n.esc.id}.${k + 1}`, ...r, hauteur: n.o.hauteur, kind: 'escalier' }));
      rapport.push({ id: n.esc.id, avant: liste.filter((q) => base(q) === n.esc.id).length, apres: n.rects.length });
      continue;
    }
    const r = n.rects[0];
    const o = n.o;
    if (Math.abs(r.x - o.x) + Math.abs(r.y - o.y) + Math.abs(r.w - o.w) + Math.abs(r.h - o.h) > 1) {
      rapport.push({ id: o.id, avant: { x: o.x, y: o.y, w: o.w, h: o.h }, apres: r });
      out.push({ ...o, ...r });
    } else out.push(o);
  }
  return { obstacles: out, rapport };
}
