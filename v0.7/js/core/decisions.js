// Décisions rejouables (lot 3g) : applique ecarts-decisions.json aux SOURCES de la carte (plan.json, etage.json ; pixels du plan).
// Pur : reçoit des objets, renvoie des copies et un rapport ; idempotent (deux passes = même résultat) ; ne lève aucune exception.
// Statuts : « appliquée », « déjà appliquée », « ignorée (non approuvée) », « introuvable ». Un élément ne se déplace jamais de plus
// de 60 unités sans `approved: true` ; une décision de niveau plus-60 n'est jamais appliquée sans `approved: true`.
import { isNum } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const list = (a) => (Array.isArray(a) ? a : []);
export const MAX_SHIFT = 60; // unités
export const WINDOW_MAX_FROM_ORIGIN = 50; // unités, règle des fenêtres (lot 3b)
const UNITS = 5; // unités par pixel
export const STATUS = Object.freeze({ done: 'appliquée', already: 'déjà appliquée', refused: 'ignorée (non approuvée)', missing: 'introuvable' });
const RECT = (r) => isObject(r) && [r.x0, r.y0, r.x1, r.y1].every(isNum) && r.x1 > r.x0 && r.y1 > r.y0;
const sameRect = (a, b) => a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
const rectShift = (a, b) => Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.y0 - b.y0), Math.abs(a.x1 - b.x1), Math.abs(a.y1 - b.y1)) * UNITS;
const clone = (o) => JSON.parse(JSON.stringify(o));

// Identifiant de la pièce ajoutée par une décision « ajouter » : to.id, sinon « R- » + identifiant de la décision.
export const addedId = (d) => (typeof d?.to?.id === 'string' && d.to.id !== '' ? d.to.id : `R-${d?.id ?? ''}`);

// Une décision : renvoie { status, details } et modifie `plan` (copie de travail) si elle s'applique.
function applyOne(plan, d) {
  const approved = d.approved === true;
  if (d.level === 'plus-60' && !approved) return { status: STATUS.refused, details: 'niveau plus-60 sans accord (approved: true)' };
  const too = (units) => units > MAX_SHIFT && !approved;
  const furniture = list(plan.furniture);
  const id = String(d.id ?? '');
  const to = isObject(d.to) ? d.to : null;

  if (d.action === 'garder') return { status: STATUS.already, details: 'rien à faire (garder)' };

  // Pilier sans identifiant : « pilier x,y ».
  const pm = /^pilier (-?[\d.]+),(-?[\d.]+)$/.exec(id);
  if (pm) {
    const [x, y] = [Number(pm[1]), Number(pm[2])];
    const pillars = list(plan.pillars);
    const at = Array.isArray(to?.at) && to.at.every(isNum) ? to.at : null;
    if (d.action !== 'corriger' || !at) return { status: STATUS.missing, details: 'pilier : seule « corriger » avec to.at est prise en charge' };
    if (pillars.some((p) => p[0] === at[0] && p[1] === at[1]) && !pillars.some((p) => p[0] === x && p[1] === y)) return { status: STATUS.already, details: `pilier en ${at}` };
    const k = pillars.findIndex((p) => p[0] === x && p[1] === y);
    if (k < 0) return { status: STATUS.missing, details: `aucun pilier en ${x},${y}` };
    const shift = Math.hypot(at[0] - x, at[1] - y) * UNITS;
    if (too(shift)) return { status: STATUS.refused, details: `déplacement de ${Math.round(shift)} unités sans accord` };
    pillars[k] = [at[0], at[1]];
    return { status: STATUS.done, details: `pilier ${x},${y} → ${at} (${Math.round(shift)} unités)` };
  }

  // Ajout d'un pilier du modèle.
  if (d.action === 'ajouter' && Array.isArray(to?.at) && to.at.every(isNum)) {
    plan.pillars = list(plan.pillars);
    if (plan.pillars.some((p) => p[0] === to.at[0] && p[1] === to.at[1])) return { status: STATUS.already, details: `pilier en ${to.at}` };
    plan.pillars.push([to.at[0], to.at[1]]);
    return { status: STATUS.done, details: `pilier ajouté en ${to.at}` };
  }

  // Ajout d'une pièce (meuble du modèle).
  if (d.action === 'ajouter') {
    if (!RECT(to)) return { status: STATUS.missing, details: 'ajouter : to doit être un rectangle' };
    const nid = addedId(d);
    plan.furniture = furniture;
    const kind = to.kind === 'cloison' ? 'comptoir' : (typeof to.kind === 'string' ? to.kind : 'caisse');
    const piece = { id: nid, x0: to.x0, y0: to.y0, x1: to.x1, y1: to.y1, kind, source: 'modele' };
    const k = furniture.findIndex((f) => f.id === nid);
    if (k >= 0 && sameRect(furniture[k], piece) && furniture[k].kind === kind) return { status: STATUS.already, details: nid };
    if (k >= 0) furniture[k] = piece;
    else furniture.push(piece);
    return { status: STATUS.done, details: `${nid} ajoutée (${kind})` };
  }

  // Escalier (lot 3g, retour du propriétaire) : « corriger » avec to.free = parties libres de son emprise (l'obstacle suit les marches) ; la forme, walk.path et la zone
  // de déclenchement ne changent pas.
  const stair = list(plan.stairs).find((q) => q.id === id);
  if (stair) {
    if (!approved) return { status: STATUS.refused, details: 'escalier : accord du propriétaire exigé (approved: true)' };
    if (d.action !== 'corriger' || !Array.isArray(to?.free) || !to.free.every(RECT)) return { status: STATUS.missing, details: 'escalier : seule « corriger » avec to.free (rectangles) est prise en charge' };
    const free = to.free.map((f) => ({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1 }));
    if (JSON.stringify(stair.free ?? null) === JSON.stringify(free)) return { status: STATUS.already, details: `${id} : ${free.length} partie(s) libre(s)` };
    stair.free = free;
    return { status: STATUS.done, details: `${id} : ${free.length} partie(s) libre(s) dans l'emprise` };
  }

  // Fenêtre : décalage le long de son mur (x pour nord et sud, y pour est et ouest), 50 unités au plus de sa position d'origine ; « retirer » (lot 3g, accord exigé) :
  // la fenêtre devient un mur plein.
  const win = list(plan.windows).find((w) => w.id === id);
  if (d.action === 'retirer' && /^[FU]\d+$/.test(id)) {
    if (!win) return { status: STATUS.already, details: `${id} absente` };
    if (!approved) return { status: STATUS.refused, details: 'retirer une fenêtre : accord du propriétaire exigé (approved: true)' };
    plan.windows = list(plan.windows).filter((w) => w.id !== id);
    return { status: STATUS.done, details: `${id} retirée (mur plein)` };
  }
  if (win) {
    if (d.action !== 'corriger' || !to) return { status: STATUS.missing, details: 'fenêtre : seule « corriger » est prise en charge' };
    const horiz = win.side === 'nord' || win.side === 'sud';
    const key = horiz ? 'x' : 'y';
    const value = to[key];
    if (!isNum(value)) return { status: STATUS.missing, details: `fenêtre ${id} : to.${key} manquant` };
    if (win[key] === value) return { status: STATUS.already, details: `${id} en ${key} = ${value}` };
    const originKey = horiz ? 'planX' : 'planY';
    const origin = isNum(win[originKey]) ? win[originKey] : win[key];
    const fromOrigin = Math.abs(value - origin) * UNITS;
    if (fromOrigin > WINDOW_MAX_FROM_ORIGIN) return { status: STATUS.refused, details: `${id} : ${Math.round(fromOrigin)} unités de sa position d'origine (plus de ${WINDOW_MAX_FROM_ORIGIN})` };
    const shift = Math.abs(value - win[key]) * UNITS;
    if (too(shift)) return { status: STATUS.refused, details: `déplacement de ${Math.round(shift)} unités sans accord` };
    if (!isNum(win[originKey])) win[originKey] = win[key];
    win[key] = value;
    return { status: STATUS.done, details: `${id} : ${key} → ${value} (${Math.round(shift)} unités)` };
  }

  // Mur : arête du contour (contour-N) ou mur intérieur, ligne déplacée (to.line) ; les fenêtres posées sur la ligne suivent.
  const cm = /^contour-(\d+)$/.exec(id);
  const wall = list(plan.walls).find((w) => w.id === id);
  if (cm || wall) {
    if (d.action !== 'corriger' || !isNum(to?.line)) return { status: STATUS.missing, details: 'mur : seule « corriger » avec to.line est prise en charge' };
    const contour = list(plan.contour);
    let pts;
    if (cm) {
      const i = Number(cm[1]) - 1;
      if (i < 0 || i >= contour.length) return { status: STATUS.missing, details: `${id} hors du contour` };
      pts = [contour[i], contour[(i + 1) % contour.length]];
    }
    const seg = cm ? { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] } : wall;
    const h = seg.y1 === seg.y2;
    const line = h ? seg.y1 : seg.x1;
    if (line === to.line) return { status: STATUS.already, details: `${id} en ${to.line}` };
    const shift = Math.abs(to.line - line) * UNITS;
    if (too(shift)) return { status: STATUS.refused, details: `déplacement de ${Math.round(shift)} unités sans accord` };
    const a0 = Math.min(h ? seg.x1 : seg.y1, h ? seg.x2 : seg.y2);
    const a1 = Math.max(h ? seg.x1 : seg.y1, h ? seg.x2 : seg.y2);
    for (const w of list(plan.windows)) {
      const on = h ? w.y === line && w.x >= a0 && w.x <= a1 : w.x === line && w.y >= a0 && w.y <= a1;
      if (on) w[h ? 'y' : 'x'] = to.line;
    }
    if (cm) for (const p of pts) p[h ? 1 : 0] = to.line;
    else if (h) { wall.y1 = to.line; wall.y2 = to.line; } else { wall.x1 = to.line; wall.x2 = to.line; }
    return { status: STATUS.done, details: `${id} : ${h ? 'y' : 'x'} ${line} → ${to.line} (${Math.round(shift)} unités)` };
  }

  // Mobilier.
  const k = furniture.findIndex((f) => f.id === id);
  if (d.action === 'retirer') {
    if (k < 0) return { status: STATUS.already, details: `${id} absente` };
    plan.furniture = furniture.filter((f) => f.id !== id);
    return { status: STATUS.done, details: `${id} retirée` };
  }
  if (k < 0) return { status: STATUS.missing, details: `${id} n'existe pas dans la source` };
  if (!RECT(to)) return { status: STATUS.missing, details: `${id} : to doit être un rectangle` };
  const f = furniture[k];
  const target = { x0: to.x0, y0: to.y0, x1: to.x1, y1: to.y1 };
  if (d.action === 'remplacer') {
    const kind = typeof to.kind === 'string' ? to.kind : f.kind;
    if (sameRect(f, target) && f.source === 'modele' && f.provisional !== true && f.kind === kind) return { status: STATUS.already, details: id };
    const shift = rectShift(f, target);
    if (too(shift)) return { status: STATUS.refused, details: `déplacement de ${Math.round(shift)} unités sans accord` };
    const rest = { ...f };
    delete rest.provisional;
    furniture[k] = { ...rest, ...target, kind, source: 'modele' };
    return { status: STATUS.done, details: `${id} remplacée par la pièce du modèle (${kind}, ${Math.round(shift)} unités)` };
  }
  if (d.action === 'corriger') {
    if (sameRect(f, target)) return { status: STATUS.already, details: id };
    const shift = rectShift(f, target);
    if (too(shift)) return { status: STATUS.refused, details: `déplacement de ${Math.round(shift)} unités sans accord` };
    furniture[k] = { ...f, ...target };
    return { status: STATUS.done, details: `${id} corrigée (${Math.round(shift)} unités)` };
  }
  return { status: STATUS.missing, details: `action inconnue : ${d.action}` };
}

// sources : { rdc: plan.json, etage: etage.json | null } ; decisions : liste de ecarts-decisions.json.
// Renvoie { sources (copies modifiées), report: [{ id, floor, action, status, details }] }.
export function applyDecisions(sources, decisions) {
  const out = {};
  for (const [k, v] of Object.entries(isObject(sources) ? sources : {})) out[k] = isObject(v) ? clone(v) : null;
  const report = [];
  for (const d of list(decisions)) {
    if (!isObject(d)) continue;
    const plan = out[d.floor];
    if (!isObject(plan)) {
      report.push({ id: d.id, floor: d.floor, action: d.action, status: STATUS.missing, details: `aucune source pour l'étage ${d.floor}` });
      continue;
    }
    let r;
    try {
      r = applyOne(plan, d);
    } catch (e) {
      r = { status: STATUS.missing, details: `décision illisible (${e?.message ?? e})` };
    }
    report.push({ id: d.id, floor: d.floor, action: d.action, ...r });
  }
  return { sources: out, report };
}

// Écriture d'une source au format du dépôt : clés de premier niveau sur une ligne, listes d'objets à un objet par ligne.
const inline = (v) => {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (isObject(v)) {
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
};
export function formatSource(o) {
  if (!isObject(o)) return '';
  return `{\n${Object.entries(o).map(([k, v]) => {
    const key = `  ${JSON.stringify(k)}: `;
    if (Array.isArray(v) && v.length && v.every(isObject)) return `${key}[\n${v.map((x) => `    ${inline(x)}`).join(',\n')}\n  ]`;
    return key + inline(v);
  }).join(',\n')}\n}\n`;
}
