// Écarts entre la carte (plan.json, etage.json : pixels du plan) et le relevé du modèle (releve.json) — lot 3g.
// Pur : renvoie des lignes de rapport et des brouillons de décisions ; ne lit ni n'écrit aucun fichier, ne lève aucune exception sur des entrées inattendues.
// Chaque ligne : { id, floor, nature, ref, delta (unités), level, action, to, reason, details }.
import { compareWall, deltaLevel, matchFurniture, matchPoints, planSegments, pxToUnits, rectDelta, rectOverlap, iou } from './releve.js';
import { pointInPolygon } from './shape.js';
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const list = (a) => (Array.isArray(a) ? a : []);
const round = (v, d = 1) => Math.round(num(v) * 10 ** d) / 10 ** d;
const ri = (v) => Math.round(num(v));

export const NATURES = Object.freeze(['mur', 'ouverture', 'fenetre', 'pilier', 'escalier', 'meuble', 'objet']);
export const ACTIONS = Object.freeze(['corriger', 'remplacer', 'ajouter', 'retirer', 'garder']);
// Écart maximal d'une fenêtre par rapport à sa position d'origine (règle du lot 3b : 10 px = 50 unités).
export const WINDOW_MAX_SHIFT = 50;
// Une ouverture (porte) qui s'écarte du modèle de plus de 25 unités est seulement signalée.
export const OPENING_SIGNAL = 25;
// Un mur du modèle n'est « net » que s'il longe au moins la moitié du segment de la carte.
export const WALL_MIN_COVER = 0.5;

// Distance (pixels) d'un point au segment le plus proche d'une liste { x1, y1, x2, y2 }.
export function distToSegments(x, y, segs) {
  let best = Infinity;
  for (const s of list(segs)) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - (s.x1 + t * dx), y - (s.y1 + t * dy)));
  }
  return best;
}

// Genre de pièce de la carte proposé pour un composant du modèle.
const KIND_OF = { shelf: 'etagere', Vertical_filing_short: 'armoire', Component_1: 'caisse', Component_2: 'caisse', Component_3: 'comptoir', Computer_desk_30x36x27: 'table', Bar_stool: 'table', table_half: 'table' };
export function kindOf(components) {
  for (const c of list(components)) {
    if (KIND_OF[c]) return KIND_OF[c];
    if (/Mystery_Box/i.test(String(c))) return 'caisse';
  }
  return 'caisse';
}

const row = (r) => ({ details: '', to: null, ...r, delta: round(r.delta), level: r.level ?? deltaLevel(r.delta) });
const rectPx = (r) => ({ x0: ri(r.x0), y0: ri(r.y0), x1: ri(r.x1), y1: ri(r.y1) });

// Fenêtres du modèle sur un étage : composants d'ouvrage (MW…) et trous des murs le long du contour de la carte (MG…, sans composant).
// Les ouvrages à plus de 8 px du contour de la carte (barrières de planches du décor extérieur) n'en sont pas.
export function modelWindows(releve, floor, wallRows = [], contour = null) {
  const segs = Array.isArray(contour) ? contour.map((a, i) => { const b = contour[(i + 1) % contour.length]; return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }) : null;
  const near = (w) => !segs || pointInPolygon(w.x, w.y, contour) || distToSegments(w.x, w.y, segs) <= 8;
  const comps = list(releve?.windows).filter((w) => isObject(w) && w.floor === floor && isNum(w.x) && isNum(w.y) && num(w.width) >= 6 && near(w));
  const gaps = [];
  let k = 0;
  for (const wr of list(wallRows)) {
    if (!wr.id.startsWith('contour')) continue;
    for (const g of list(wr.gaps)) {
      const mid = (g.a + g.b) / 2;
      const p = wr.axis === 'h' ? { x: mid, y: wr.line } : { x: wr.line, y: mid };
      const width = g.b - g.a;
      if (width < 10 || width > 40) continue;
      if (comps.some((c) => Math.hypot(c.x - p.x, c.y - p.y) <= Math.max(10, width / 2))) continue;
      k += 1;
      gaps.push({ id: `${floor === 'rdc' ? 'MG' : 'MH'}${k}`, ...p, width: round(width), axis: wr.axis, components: [], gap: true });
    }
  }
  return [...comps, ...gaps];
}

// Demi-épaisseur des murs du jeu en pixels (murs de 40 unités, `params.json` wallThickness) : les murs du modèle sont plus minces, une pièce
// posée contre un mur du modèle entrerait dans le mur du jeu et serait rognée ; elle est poussée contre sa face, sans changer de taille.
export const WALL_HALF_PX = 4;

// Rectangle (pixels) poussé hors des bandes des murs de la carte (ligne ± half), sur l'axe perpendiculaire à chaque mur, vers l'intérieur
// (côté du centre du rectangle). Renvoie un nouveau rectangle de même taille.
export function pushOutOfWalls(rect, segs, half = WALL_HALF_PX) {
  if (!isObject(rect) || ![rect.x0, rect.y0, rect.x1, rect.y1].every(isNum)) return rect;
  let r = { ...rect };
  for (let pass = 0; pass < 2; pass += 1) {
    for (const s of list(segs)) {
      const h = s.y1 === s.y2;
      const line = h ? s.y1 : s.x1;
      const a0 = Math.min(h ? s.x1 : s.y1, h ? s.x2 : s.y2);
      const a1 = Math.max(h ? s.x1 : s.y1, h ? s.x2 : s.y2);
      const r0 = h ? r.x0 : r.y0;
      const r1 = h ? r.x1 : r.y1;
      if (Math.min(r1, a1) - Math.max(r0, a0) <= 0) continue;
      const p0 = h ? r.y0 : r.x0;
      const p1 = h ? r.y1 : r.x1;
      if (p1 <= line - half || p0 >= line + half) continue;
      const shift = (p0 + p1) / 2 >= line ? line + half - p0 : line - half - p1;
      r = h ? { ...r, y0: r.y0 + shift, y1: r.y1 + shift } : { ...r, x0: r.x0 + shift, x1: r.x1 + shift };
    }
  }
  return r;
}

// Regroupe des rectangles { x0, y0, x1, y1 } qui se touchent (à `gap` pixels près) : [{ ids: [indices], plan: boîte englobante }].
export function groupTouching(rects, gap = 1) {
  const R = list(rects).filter((r) => isObject(r) && [r.x0, r.y0, r.x1, r.y1].every(isNum));
  const parent = R.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < R.length; i += 1) {
    for (let j = i + 1; j < R.length; j += 1) {
      const a = R[i];
      const b = R[j];
      if (a.x0 <= b.x1 + gap && b.x0 <= a.x1 + gap && a.y0 <= b.y1 + gap && b.y0 <= a.y1 + gap) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  R.forEach((r, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  return [...groups.values()].map((ids) => ({ ids, plan: { x0: Math.min(...ids.map((i) => R[i].x0)), y0: Math.min(...ids.map((i) => R[i].y0)), x1: Math.max(...ids.map((i) => R[i].x1)), y1: Math.max(...ids.map((i) => R[i].y1)) } }));
}

// Compare un étage. plan : plan.json ou etage.json (pixels) ; releve : releve.json ; floor : 'rdc' | 'etage'.
// Renvoie { rows, unmatchedObjects: [groupes du modèle sans équivalent], high: [objets au-dessus de 1,2 m], walls: [comparaisons de murs] }.
// opts.decisions : décisions de ecarts-decisions.json ; chaque ligne qui en a une reçoit `decision` { action, reason, approved } (la décision réelle,
// par exemple « garder » quand une règle de la carte refuse la correction proposée).
export function compareFloor(plan, releve, floor = 'rdc', opts = {}) {
  const decisionOf = new Map(list(opts?.decisions).filter((d) => isObject(d) && d.floor === floor).map((d) => [String(d.id), d]));
  const rows = [];
  if (!isObject(plan) || !isObject(releve) || !isObject(releve.floors?.[floor])) return { rows, unmatchedObjects: [], high: [], walls: [] };
  const fl = releve.floors[floor];
  const modelWalls = list(fl.walls).filter((w) => isObject(w));

  // Murs : ligne médiane du modèle face à chaque segment de la carte.
  const walls = planSegments(plan).map((s) => compareWall(s, modelWalls));
  for (const w of walls) {
    if (w.offset === null) {
      rows.push(row({ id: w.id, floor, nature: 'mur', ref: null, delta: 0, level: 'plus-60', action: 'garder', reason: 'aucun mur du modèle le long de ce segment à 1,2 m du sol', details: `couvert ${Math.round(w.covered * 100)} %` }));
      continue;
    }
    if (w.covered < WALL_MIN_COVER) {
      rows.push(row({ id: w.id, floor, nature: 'mur', ref: 'coupe', delta: Math.abs(w.offset), level: deltaLevel(w.offset), action: 'garder', reason: `modèle peu net : un mur du modèle ne longe que ${Math.round(w.covered * 100)} % du segment (moins de ${WALL_MIN_COVER * 100} %)`, details: `ligne médiane du modèle à ${round(w.line + w.offset / 5)} px (carte ${w.line})` }));
      continue;
    }
    const level = deltaLevel(w.offset);
    const to = { line: ri(w.line + w.offset / 5) };
    rows.push(row({
      id: w.id, floor, nature: 'mur', ref: 'coupe', delta: Math.abs(w.offset), level,
      action: level === 'moins-15' ? 'garder' : 'corriger', to: level === 'moins-15' ? null : to,
      reason: level === 'moins-15' ? 'écart sous 15 unités : ignoré' : `ligne médiane du modèle à ${w.axis === 'h' ? 'y' : 'x'} = ${round(w.line + w.offset / 5)} px (carte ${w.line})`,
      details: `${w.axis === 'h' ? 'horizontal' : 'vertical'}, couvert ${Math.round(w.covered * 100)} %`,
    }));
  }

  // Fenêtres : décalage le long du mur (le décalage perpendiculaire est celui du mur).
  const contour = list(plan.contour).filter((q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]));
  const mw = modelWindows(releve, floor, walls, contour);
  const pw = list(plan.windows).filter((w) => isObject(w) && isNum(w.x) && isNum(w.y));
  const wm = matchPoints(pw.map((w) => ({ id: w.id, x: w.x, y: w.y })), mw.map((w) => ({ id: w.id, x: w.x, y: w.y })), 14);
  for (const m of wm.matches) {
    const w = pw.find((q) => q.id === m.id);
    const horiz = w.side === 'nord' || w.side === 'sud';
    if (!m.other) {
      rows.push(row({ id: m.id, floor, nature: 'fenetre', ref: null, delta: 0, level: 'plus-60', action: 'garder', reason: 'aucune fenêtre du modèle à moins de 70 unités : gardée (identifiant, largeur 72 et mur conservés)' }));
      continue;
    }
    const along = horiz ? m.dx : m.dy;
    const o = mw.find((q) => q.id === m.other);
    const origin = horiz ? num(w.planX, w.x) : num(w.planY, w.y);
    const target = (horiz ? w.x : w.y) + along / 5;
    const fromOrigin = Math.abs(target - origin) * 5;
    const level = deltaLevel(along);
    const allowed = fromOrigin <= WINDOW_MAX_SHIFT;
    rows.push(row({
      id: m.id, floor, nature: 'fenetre', ref: m.other, delta: Math.abs(along), level,
      action: level === 'moins-15' || !allowed ? 'garder' : 'corriger', to: level === 'moins-15' || !allowed ? null : (horiz ? { x: ri(target) } : { y: ri(target) }),
      reason: level === 'moins-15' ? 'écart sous 15 unités : ignoré' : allowed ? `centre du modèle (${o.gap ? 'trou du mur' : o.components.join(', ')}) à ${round(target)} px` : `le modèle est à ${round(fromOrigin)} unités de la position d'origine (plus de ${WINDOW_MAX_SHIFT}) : gardée`,
      details: `largeur du modèle ${round(pxToUnits(o.width))} unités`,
    }));
  }
  const extraWindows = mw.filter((w) => wm.unmatched.includes(w.id));
  for (const w of extraWindows) {
    rows.push(row({ id: w.id, floor, nature: 'fenetre', ref: w.id, delta: pxToUnits(w.width), level: 'plus-60', action: 'garder', reason: 'fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres)', details: `${w.gap ? 'trou du mur' : list(w.components).join(', ')} en ${round(w.x)}, ${round(w.y)} px, ${round(pxToUnits(w.width))} unités` }));
  }

  // Piliers.
  const pp = list(plan.pillars).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])).map((p, i) => ({ id: `pilier ${p[0]},${p[1]}`, n: i, x: p[0], y: p[1] }));
  const segsAll = planSegments(plan);
  // Pilastres : un « pilier » de la coupe à 4 px au plus d'un mur de la carte est un renfort du mur, pas un pilier.
  const mp = list(fl.pillars).filter((p) => isObject(p) && p.inside !== false && distToSegments(p.x, p.y, segsAll) > 4);
  const pm = matchPoints(pp, mp, 10);
  // Seconde passe : un pilier de la carte sans voisin à 50 unités, mais à 100 au plus d'un pilier du modèle libre (déplacé exprès, par exemple).
  const second = matchPoints(pp.filter((p) => !pm.matches.find((m) => m.id === p.id)?.other), mp.filter((q) => pm.unmatched.includes(q.id)), 20);
  for (const m of second.matches) if (m.other) { const k = pm.matches.findIndex((x) => x.id === m.id); pm.matches[k] = { ...m, far: true }; pm.unmatched = pm.unmatched.filter((id) => id !== m.other); }
  for (const m of pm.matches) {
    const p = pp.find((q) => q.id === m.id);
    if (!m.other) {
      rows.push(row({ id: m.id, floor, nature: 'pilier', ref: null, delta: 0, level: 'plus-60', action: 'garder', reason: 'aucun pilier isolé du modèle à moins de 50 unités (pilier adossé ou absent) : gardé' }));
      continue;
    }
    const level = deltaLevel(m.dist);
    const o = mp.find((q) => q.id === m.other);
    if (m.far) {
      rows.push(row({ id: m.id, floor, nature: 'pilier', ref: m.other, delta: m.dist, level, action: 'corriger', to: { at: [ri(o.x), ri(o.y)] }, reason: `pilier du modèle en ${o.x}, ${o.y} px (déplacé par un lot précédent ?) : à approuver`, details: `index ${p.n}` }));
      continue;
    }
    rows.push(row({ id: m.id, floor, nature: 'pilier', ref: m.other, delta: m.dist, level, action: level === 'moins-15' ? 'garder' : 'corriger', to: level === 'moins-15' ? null : { at: [ri(o.x), ri(o.y)] }, reason: level === 'moins-15' ? 'écart sous 15 unités : ignoré' : `pilier du modèle en ${o.x}, ${o.y} px`, details: `index ${p.n}` }));
  }
  for (const id of pm.unmatched) {
    const o = mp.find((q) => q.id === id);
    rows.push(row({ id, floor, nature: 'pilier', ref: id, delta: pxToUnits(o.size), level: 'plus-60', action: 'ajouter', to: { at: [ri(o.x), ri(o.y)] }, reason: 'pilier du modèle sans pilier de la carte : à approuver', details: `${o.x}, ${o.y} px` }));
  }

  // Escaliers : jamais changés dans ce lot (formes, walk.path, trous) ; l'écart est seulement rapporté.
  const ms = list(releve.stairs).filter((s) => isObject(s) && !s.outside);
  for (const s of list(plan.stairs).filter((q) => isObject(q))) {
    let best = null;
    for (const o of ms) {
      const v = iou(s, o);
      if (v > 0 && (!best || v > best.v)) best = { v, o };
    }
    const d = best ? rectDelta(s, best.o) : null;
    rows.push(row({ id: s.id, floor, nature: 'escalier', ref: best ? best.o.id : null, delta: d ? d.max : 0, level: d ? deltaLevel(d.max) : 'plus-60', action: 'garder', reason: 'règle du lot : escaliers inchangés (formes, walk.path, trous, garde-corps)', details: d ? `marches du modèle ${best.o.x0},${best.o.y0} → ${best.o.x1},${best.o.y1} px` : 'aucune marche du modèle' }));
  }

  // Ouvertures (sans porte) : comparées aux trous du modèle le long de la même ligne ; signalées au-delà de 25 unités, jamais corrigées ici.
  for (const o of list(plan.openings).filter((q) => isObject(q) && [q.x1, q.y1, q.x2, q.y2].every(isNum))) {
    const c = compareWall({ id: o.id, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, axis: o.y1 === o.y2 ? 'h' : 'v' }, modelWalls);
    const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
    const blocked = c ? c.covered * len : 0;
    const delta = pxToUnits(blocked);
    rows.push(row({ id: o.id, floor, nature: 'ouverture', ref: 'coupe', delta, level: deltaLevel(delta), action: 'garder', reason: delta > OPENING_SIGNAL ? `le modèle ferme ${round(delta)} unités de cette ouverture : signalé (porte et ouverture inchangées)` : 'ouverture conforme au modèle', details: `longueur ${round(pxToUnits(len))} unités` }));
  }

  // Mobilier : association aux groupes d'objets du modèle de cet étage.
  const groups = list(releve.groups).filter((g) => isObject(g) && g.floor === floor);
  const pieces = list(plan.furniture).filter((f) => isObject(f) && [f.x0, f.y0, f.x1, f.y1].every(isNum));
  const fm = matchFurniture(pieces, groups.map((g) => ({ key: g.key, plan: g.plan })), { minIou: 0.2 });
  const matchedGroups = fm.matches.filter((m) => m.key).map((m) => ({ by: m.id, g: groups.find((q) => q.key === m.key) }));
  const inner = modelWalls.filter((w) => w.inside);
  for (const m of fm.matches) {
    const f = pieces.find((q) => q.id === m.id);
    const g = groups.find((q) => q.key === m.key);
    if (!g) {
      const area = (f.x1 - f.x0) * (f.y1 - f.y0);
      const win = mw.find((w) => !w.gap && rectOverlap(f, { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 }) > 0);
      const dup = matchedGroups.find((x) => rectOverlap(f, x.g.plan) >= 0.5 * area);
      const onCut = inner.reduce((sum, w) => sum + rectOverlap(f, w), 0) >= 0.3 * area;
      if (f.provisional) rows.push(row({ id: f.id, floor, nature: 'meuble', ref: null, delta: 0, level: 'moins-15', action: 'garder', reason: 'pièce provisoire sans objet du modèle : gardée, toujours provisional', details: f.kind }));
      else if (win) rows.push(row({ id: f.id, floor, nature: 'meuble', ref: win.id, delta: pxToUnits(Math.max(f.x1 - f.x0, f.y1 - f.y0)), level: 'plus-60', action: 'retirer', reason: `recouvre l'ouvrage de fenêtre ${win.id} (${list(win.components).join(', ')}) : sans doute le cadre de la fenêtre, pas un meuble`, details: f.kind }));
      else if (dup) rows.push(row({ id: f.id, floor, nature: 'meuble', ref: dup.g.key, delta: pxToUnits(Math.max(f.x1 - f.x0, f.y1 - f.y0)), level: '15-60', action: 'retirer', reason: `doublon : recouverte à plus de 50 % par l'objet ${dup.g.ids.join(' + ')} déjà associé à ${dup.by}`, details: f.kind }));
      else if (onCut) rows.push(row({ id: f.id, floor, nature: 'meuble', ref: 'coupe', delta: 0, level: 'moins-15', action: 'garder', reason: 'relevée sur la coupe du bâti (cloison basse, pas un composant) : conforme', details: f.kind }));
      else rows.push(row({ id: f.id, floor, nature: 'meuble', ref: null, delta: 0, level: 'plus-60', action: 'garder', reason: 'pièce relevée sans objet du modèle : signalée', details: f.kind }));
      continue;
    }
    // Pièce déjà posée contre la face du mur du jeu (le modèle poussé hors de la bande du mur) : l'écart se mesure à cette position.
    const pushed = pushOutOfWalls(g.plan, segsAll);
    const atWall = rectDelta(f, pushed);
    if (atWall.max < m.delta.max && atWall.max < 15) m.delta = { ...atWall };
    const level = deltaLevel(m.delta.max);
    const to = { ...rectPx(pushed), kind: f.provisional ? kindOf(g.components) : f.kind };
    const action = f.provisional ? 'remplacer' : level === 'moins-15' ? 'garder' : 'corriger';
    rows.push(row({
      id: f.id, floor, nature: 'meuble', ref: g.key, delta: m.delta.max, level, action, to: action === 'garder' ? null : to,
      reason: f.provisional ? `pièce provisoire associée à ${g.ids.join(' + ')} (${g.components.join(', ')}) : remplacée par la pièce du modèle` : level === 'moins-15' ? 'écart sous 15 unités : ignoré' : `objet du modèle ${g.ids.join(' + ')} (${g.components.join(', ')})`,
      details: `recouvrement ${Math.round(m.iou * 100)} %, centre ${m.delta.dx}, ${m.delta.dy} ; taille ${m.delta.dw}, ${m.delta.dh}`,
    }));
  }
  const unmatchedObjects = groups.filter((g) => fm.unmatched.includes(g.key));
  for (const g of unmatchedObjects) {
    const meuble = g.klass === 'meuble';
    rows.push(row({
      id: g.key, floor, nature: 'objet', ref: g.key, delta: pxToUnits(Math.max(g.plan.x1 - g.plan.x0, g.plan.y1 - g.plan.y0)), level: meuble ? '15-60' : 'moins-15',
      action: meuble ? 'ajouter' : 'garder', to: meuble ? { ...rectPx(pushOutOfWalls(g.plan, segsAll)), kind: kindOf(g.components) } : null,
      reason: meuble ? 'objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte)' : g.klass === 'decor-leger' ? 'décor léger (non solide) : catalogue de la partie C' : 'objet non classé : ignoré',
      details: `${g.ids.join(' + ')} (${g.components.join(', ')}), ${g.plan.x0},${g.plan.y0} → ${g.plan.x1},${g.plan.y1} px, sommet ${g.top} m`,
    }));
  }
  // Cloisons et blocs du bâti sans équivalent : rectangles de la coupe à l'intérieur, à plus de 6 px de tout mur de la carte, hors escaliers.
  const stairsRects = [...list(plan.stairs), ...list(releve.stairs).filter((s) => !s.outside)].filter((q) => isObject(q));
  const extra = inner.filter((w) => distToSegments((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, segsAll) > 6 && Math.max(w.x1 - w.x0, w.y1 - w.y0) >= 4
    && !stairsRects.some((q) => rectOverlap(w, q) > 0) && !pieces.some((f) => rectOverlap(w, f) >= 0.5 * (w.x1 - w.x0) * (w.y1 - w.y0)));
  const thin = list(fl.lines).filter((l) => isObject(l) && l.inside && distToSegments((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2, segsAll) > 6)
    .map((l) => ({ x0: Math.min(l.x1, l.x2), y0: Math.min(l.y1, l.y2), x1: Math.max(l.x1, l.x2), y1: Math.max(l.y1, l.y2) }))
    .filter((w) => !stairsRects.some((q) => rectOverlap({ x0: w.x0 - 0.5, y0: w.y0 - 0.5, x1: w.x1 + 0.5, y1: w.y1 + 0.5 }, q) > 0));
  const blocks = groupTouching([...extra, ...thin], 1);
  blocks.forEach((b, i) => {
    const r = b.plan;
    const size = pxToUnits(Math.max(r.x1 - r.x0, r.y1 - r.y0));
    rows.push(row({ id: `${floor === 'rdc' ? 'MC' : 'MD'}${i + 1}`, floor, nature: 'mur', ref: 'coupe', delta: size, level: size > 60 ? 'plus-60' : 'moins-15', action: size > 60 ? 'ajouter' : 'garder', to: size > 60 ? { ...rectPx(r), kind: 'cloison' } : null, reason: size > 60 ? 'cloison ou bloc du bâti sans équivalent dans la carte : à approuver' : 'petit morceau de la coupe : ignoré', details: `${round(r.x0)},${round(r.y0)} → ${round(r.x1)},${round(r.y1)} px, ${b.ids.length} rectangle(s)` }));
  });
  const high = list(releve.objects).filter((o) => isObject(o) && o.floor === floor && !o.outside && o.rule === 'haut');
  const ctx = { plan, releve, floor, mw, groups, mp, stairs: ms };
  const withDecision = (r) => {
    const d = decisionOf.get(String(r.id));
    return d ? { ...r, decision: { action: d.action, reason: d.reason, ...(typeof d.approved === 'boolean' ? { approved: d.approved } : {}) } } : r;
  };
  return { rows: rows.map((r) => withDecision({ ...r, box: rowBox(r, ctx) })), unmatchedObjects, high, walls };
}

const union = (a, b) => (a && b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a ?? b ?? null);
const around = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
const segBox = (s, r = 4) => (s ? { x0: Math.min(s.x1, s.x2) - r, y0: Math.min(s.y1, s.y2) - r, x1: Math.max(s.x1, s.x2) + r, y1: Math.max(s.y1, s.y2) + r } : null);

// Boîte (pixels du plan) d'une ligne d'écart : l'élément de la carte et son correspondant du modèle, pour l'encadrer sur le dessin.
export function rowBox(r, ctx) {
  const { plan, mw, groups, mp, stairs } = ctx;
  const rectOf = (x) => (x && [x.x0, x.y0, x.x1, x.y1].every(isNum) ? { x0: x.x0, y0: x.y0, x1: x.x1, y1: x.y1 } : null);
  const toRect = r.to && [r.to.x0, r.to.y0, r.to.x1, r.to.y1].every(isNum) ? rectOf(r.to) : null;
  if (r.nature === 'mur') {
    const seg = planSegments(plan).find((q) => q.id === r.id);
    return seg ? segBox(seg) : toRect ?? (typeof r.details === 'string' ? parseBox(r.details) : null);
  }
  if (r.nature === 'ouverture') return segBox(list(plan.openings).find((q) => q.id === r.id));
  if (r.nature === 'fenetre') {
    const w = list(plan.windows).find((q) => q.id === r.id);
    const m = list(mw).find((q) => q.id === r.ref);
    return union(w ? around(w.x, w.y, 8) : null, m ? (m.gap ? around(m.x, m.y, m.width / 2) : rectOf(m)) : null);
  }
  if (r.nature === 'pilier') {
    const m = list(mp).find((q) => q.id === r.ref);
    const at = /pilier (-?[\d.]+),(-?[\d.]+)/.exec(r.id);
    return union(at ? around(Number(at[1]), Number(at[2]), 5) : null, m ? around(m.x, m.y, 5) : null);
  }
  if (r.nature === 'escalier') return union(rectOf(list(plan.stairs).find((q) => q.id === r.id)), rectOf(list(stairs).find((q) => q.id === r.ref)));
  if (r.nature === 'meuble') return union(rectOf(list(plan.furniture).find((q) => q.id === r.id)), rectOf(list(groups).find((g) => g.key === r.ref)?.plan));
  if (r.nature === 'objet') return rectOf(list(groups).find((g) => g.key === r.ref)?.plan);
  return null;
}

// « x0,y0 → x1,y1 px » d'un texte de détails.
function parseBox(text) {
  const m = /(-?[\d.]+),(-?[\d.]+) → (-?[\d.]+),(-?[\d.]+) px/.exec(text);
  return m ? { x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]) } : null;
}

// Brouillon de décisions d'après les lignes : { id, floor, action, to, reason, level } ; approved absent (appliqué en partie B) pour 15-60,
// approved: false pour plus-60 (jamais appliqué sans accord du propriétaire) ; moins-15 et garder : action « garder ».
// previous : décisions existantes (ecarts-decisions.json) dont `approved` (accord du propriétaire) est conservé tel quel.
export function draftDecisions(rows, previous = []) {
  const prev = new Map(list(previous).filter((d) => isObject(d)).map((d) => [`${d.floor}:${d.id}`, d]));
  return list(rows).filter((r) => isObject(r)).map((r) => {
    const d = { id: r.id, floor: r.floor, action: r.action, to: r.to, reason: r.reason, level: r.level };
    if (r.level === 'plus-60') d.approved = false;
    const old = prev.get(`${r.floor}:${r.id}`);
    if (old && typeof old.approved === 'boolean') d.approved = old.approved;
    return d;
  });
}

// Écart 15-60 encore ouvert : ni corrigé (sinon il serait sous 15), ni gardé par une décision (règle de la carte, escalier, porte).
export const openMid = (rows) => list(rows).filter((r) => isObject(r) && r.level === '15-60' && r.action !== 'garder' && r.decision?.action !== 'garder');

// Comptes du rapport : { [niveau]: { [nature]: n } }.
export function countByLevel(rows) {
  const out = {};
  for (const r of list(rows)) {
    if (!isObject(r)) continue;
    out[r.level] ??= {};
    out[r.level][r.nature] = (out[r.level][r.nature] ?? 0) + 1;
  }
  return out;
}
