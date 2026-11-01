// Relevé du modèle (lot 3g) : convertit la sortie brute de scripts/modele/extraire.py (mètres) en
// data/game/maps/rez-de-chaussee/releve.json (PIXELS du plan, géométrie seulement, sans texture ni image).
// Usage : node scripts/modele/releve.mjs <sortie-brute.json> [--ecrire]
// Sans --ecrire, affiche le résumé (calage, sections, objets) sans rien écrire. Rejouable : même entrée, même sortie.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_CALAGE, boxToPlan, classifyObject, cutSections, floorOf, groupStacks, modelToPlan, rasterizeCut, searchCalage,
} from '../../js/core/releve.js';
import { pointInPolygon } from '../../js/core/shape.js';

const DIR = 'data/game/maps/rez-de-chaussee';
const OUT = `${DIR}/releve.json`;
const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
if (!src) {
  console.error('Usage : node scripts/modele/releve.mjs <sortie-brute.json> [--ecrire]');
  process.exit(2);
}
const brut = JSON.parse(readFileSync(src, 'utf8'));
const plan = JSON.parse(readFileSync(`${DIR}/plan.json`, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const calage = { ...DEFAULT_CALAGE };
// Fenêtre de la coupe : boîte du plan ± 20 px (le décor lointain du nœud du bâtiment, au nord, n'y entre pas).
const BOUNDS = { x0: plan.bbox.x0 - 20, y0: plan.bbox.y0 - 20, x1: plan.bbox.x1 + 20, y1: plan.bbox.y1 + 20 };
const toPx = (s) => [...modelToPlan(s[0], s[1], calage), ...modelToPlan(s[2], s[3], calage)];
const inside = (contour, x, y) => pointInPolygon(x, y, contour);

// Parois sans épaisseur (cloisons d'une seule face) : segments de la coupe parallèles aux axes, fusionnés bout à bout, de 6 px au moins,
// qui ne bordent aucun rectangle de mur (les faces des murs pleins sont déjà dans les rectangles).
function thinLines(segs, walls) {
  const lines = new Map();
  for (const [x1, y1, x2, y2] of segs) {
    const h = Math.abs(y2 - y1) < 0.3 && Math.abs(x2 - x1) >= 0.3;
    const v = Math.abs(x2 - x1) < 0.3 && Math.abs(y2 - y1) >= 0.3;
    if (!h && !v) continue;
    const key = `${h ? 'h' : 'v'}:${Math.round((h ? (y1 + y2) / 2 : (x1 + x2) / 2) * 2) / 2}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(h ? [Math.min(x1, x2), Math.max(x1, x2)] : [Math.min(y1, y2), Math.max(y1, y2)]);
  }
  const out = [];
  for (const [key, spans] of [...lines.entries()].sort()) {
    const [axis, at] = [key[0], Number(key.slice(2))];
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of spans) {
      if (merged.length && a <= merged[merged.length - 1][1] + 0.3) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
      else merged.push([a, b]);
    }
    for (const [a, b] of merged) {
      if (b - a < 6) continue;
      const mx = axis === 'h' ? (a + b) / 2 : at;
      const my = axis === 'h' ? at : (a + b) / 2;
      if (walls.some((w) => mx >= w.x0 - 0.6 && mx <= w.x1 + 0.6 && my >= w.y0 - 0.6 && my <= w.y1 + 0.6)) continue;
      out.push(axis === 'h' ? { x1: r1(a), y1: at, x2: r1(b), y2: at } : { x1: at, y1: r1(a), x2: at, y2: r1(b) });
    }
  }
  return out;
}

const floors = {};
let calageResult = null;
const etage = (() => {
  try {
    return JSON.parse(readFileSync(`${DIR}/etage.json`, 'utf8'));
  } catch {
    return null;
  }
})();
for (const [id, level] of Object.entries(brut.levels)) {
  const segs = brut.cuts[id].map(toPx);
  const grid = rasterizeCut(segs, BOUNDS, 0.5);
  const { walls, pillars } = cutSections(grid);
  const ref = id === 'rdc' ? plan : etage;
  if (id === 'rdc') calageResult = searchCalage(plan.contour, grid, 3, 0.5);
  const contour = ref?.contour ?? plan.contour;
  floors[id] = {
    floorZ: level.floor,
    cutZ: level.cut,
    walls: walls.map((w) => ({ ...w, inside: inside(contour, (w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2) })),
    pillars: pillars.map((p, i) => ({ id: `${id === 'rdc' ? 'MP' : 'MQ'}${i + 1}`, ...p, inside: inside(contour, p.x, p.y) })),
    lines: thinLines(segs, [...walls, ...pillars.map((q) => ({ x0: q.x - q.size / 2, y0: q.y - q.size / 2, x1: q.x + q.size / 2, y1: q.y + q.size / 2 }))]).map((l) => ({ ...l, inside: inside(contour, (l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2) })),
  };
}

// Escaliers : premier niveau à 0,5 m au plus du sol (sinon ce n'est pas un escalier) ; hors du contour = escalier extérieur.
const stairs = brut.steps
  .filter((s) => s.levels[0] <= 0.5)
  .map((s, i) => {
    const r = boxToPlan([s.bbox[0], s.bbox[1], 0, s.bbox[2], s.bbox[3], 0], calage);
    return { id: `ME${i + 1}`, ...r, steps: s.levels.length, top: s.levels[s.levels.length - 1], outside: !inside(plan.contour, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) };
  });

// Objets : boîte du plan, étage, hauteurs relatives au sol, classe et règle.
const objects = brut.instances.map((e) => {
  const fl = floorOf(e.bbox[2], brut.levels);
  const floorZ = brut.levels[fl].floor;
  const p = boxToPlan(e.bbox, calage);
  const cx = (p.x0 + p.x1) / 2;
  const cy = (p.y0 + p.y1) / 2;
  const { klass, rule } = classifyObject(e, floorZ);
  const contour = fl === 'etage' && etage ? etage.contour : plan.contour;
  return {
    id: e.id.replace('SketchUp_Instance_', 'O'),
    component: e.component,
    floor: fl,
    plan: p,
    bottom: r2(e.bbox[2] - floorZ),
    top: r2(e.bbox[5] - floorZ),
    klass,
    rule,
    outside: e.scope !== 'batiment' || !inside(contour, cx, cy),
    triangles: e.triangles,
    materials: Object.entries(e.materials).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 3),
  };
});

// Fenêtres du modèle : composants d'ouvrage (planches, cadres) groupés par contact, à l'intérieur ou au ras du contour.
const winObjs = objects.filter((o) => o.klass === 'fenetre');
const windows = groupStacks(winObjs.map((o) => ({ ...o, plan: { x0: o.plan.x0 - 1, y0: o.plan.y0 - 1, x1: o.plan.x1 + 1, y1: o.plan.y1 + 1 } })))
  .map((g, i) => {
    const comps = [...new Set(g.ids.map((id) => objects.find((o) => o.id === id).component))];
    const p = { x0: r1(g.plan.x0 + 1), y0: r1(g.plan.y0 + 1), x1: r1(g.plan.x1 - 1), y1: r1(g.plan.y1 - 1) };
    const axis = p.x1 - p.x0 >= p.y1 - p.y0 ? 'h' : 'v';
    return { id: `MW${i + 1}`, floor: g.floor, ...p, x: r1((p.x0 + p.x1) / 2), y: r1((p.y0 + p.y1) / 2), axis, width: r1(axis === 'h' ? p.x1 - p.x0 : p.y1 - p.y0), components: comps, objects: g.ids };
  });

// Groupes d'objets (piles) hors fenêtres, à l'intérieur du bâtiment : base des associations avec le mobilier.
const furnitureLike = objects.filter((o) => o.klass !== 'fenetre' && !o.outside);
const groups = groupStacks(furnitureLike).map((g, i) => {
  const members = g.ids.map((id) => objects.find((o) => o.id === id));
  const klasses = [...new Set(members.map((m) => m.klass))];
  // Un groupe est un meuble s'il contient un meuble ; sinon décor léger s'il n'en contient que ; sinon inconnu.
  const klass = klasses.includes('meuble') ? 'meuble' : klasses.every((k) => k === 'decor-leger') ? 'decor-leger' : 'inconnu';
  return { key: `G${i + 1}`, ids: g.ids, floor: g.floor, plan: { x0: r1(g.plan.x0), y0: r1(g.plan.y0), x1: r1(g.plan.x1), y1: r1(g.plan.y1) }, bottom: g.bottom, top: g.top, klass, components: [...new Set(members.map((m) => m.component))] };
});

const materials = brut.materials.map((m) => ({ name: m.name, color: m.color, texture: m.texture, triangles: m.triangles }));

const out = {
  _provisoire: 'Lot 3g : relevé du modèle SketchUp du propriétaire (Sanstitre.zip, model.dae, jamais versionné), en PIXELS du plan (12 px par mètre, même repère que plan.json). Généré par scripts/modele/extraire.py puis scripts/modele/releve.mjs ; ne pas éditer à la main. Géométrie seulement : aucune image, aucune texture.',
  source: brut.source,
  calage: { ...calage, formule: 'px = (x + ox) × scale ; py = (oy − y) × scale (mètres du modèle, x est, y nord)', residu: { score: r2(calageResult.base * 100), meilleur: { dx: calageResult.dx, dy: calageResult.dy, score: r2(calageResult.score * 100) } } },
  levels: brut.levels,
  floors,
  stairs,
  windows,
  objects,
  groups,
  materials,
};
const text = `${JSON.stringify(out)}\n`;
const count = (k) => objects.filter((o) => !o.outside && o.klass === k).length;
console.log(`Calage : ${(calageResult.base * 100).toFixed(1)} % des pixels du contour à 1 px de la coupe (meilleur décalage ${calageResult.dx}, ${calageResult.dy} px : ${(calageResult.score * 100).toFixed(1)} %)`);
for (const [id, f] of Object.entries(floors)) console.log(`${id} : ${f.walls.length} rectangles de mur, ${f.lines.length} parois minces, ${f.pillars.length} piliers (${f.pillars.filter((p) => p.inside).length} dedans)`);
console.log(`Escaliers : ${stairs.map((s) => `${s.id} ${s.x0},${s.y0}→${s.x1},${s.y1}${s.outside ? ' (dehors)' : ''}`).join(' ; ')}`);
console.log(`Fenêtres (composants) : ${windows.length} ; objets dedans : meuble ${count('meuble')}, décor léger ${count('decor-leger')}, inconnu ${count('inconnu')} ; groupes ${groups.length} ; dehors ${objects.filter((o) => o.outside).length}`);
console.log(`Taille : ${(Buffer.byteLength(text) / 1024).toFixed(1)} Ko`);
if (args.includes('--ecrire')) {
  writeFileSync(OUT, text);
  console.log(`Écrit : ${OUT}`);
}
