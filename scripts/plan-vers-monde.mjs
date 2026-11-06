// Plan -> monde (lot 3b) : lit data/game/maps/<id>/plan.json (pixels du plan) et data/game/maps/params.json, appelle planToWorld (js/core/maps.js)
// et écrit world.json et decor.json de la carte, dans le même dossier (lot 5a : avec les épaves de epaves.json, si le fichier existe). Usage : npm run carte [-- <id>] ; avec --verifie, n'écrit rien et échoue si
// les fichiers versionnés diffèrent de la sortie. Les deux fichiers générés ne s'éditent jamais à la main.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clearanceZones, decorToWorld, placeDecor, totalTriangles } from '../js/core/decor-interieur.js';
import { compareFloor } from '../js/core/ecarts.js';
import { floorProblems } from '../js/core/floor-rules.js';
import { boxTriangles, lookOf, pieceBoxes } from '../js/core/mobilier-aspect.js';
import { planToWorld } from '../js/core/maps.js';
import { decorProblems, generateDecor } from '../js/core/decor.js';
import { polygonRects } from '../js/core/shape.js';
import { rectGap } from '../js/core/collision.js';
import { parseZones, zonesToWorld } from '../js/core/zones.js';

const ROOT = new URL('../data/game/maps/', import.meta.url);
const isPrimitive = (v) => v === null || typeof v !== 'object';

// JSON lisible : un objet qui ne contient que des valeurs simples, et un tableau de nombres, tiennent sur une seule ligne.
export function formatJson(value, indent = '') {
  const next = `${indent}  `;
  if (isPrimitive(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const simple = value.every((v) => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)));
    const flat = simple ? `[${value.map((v) => formatJson(v, next)).join(', ')}]` : '';
    if (simple && flat.length + indent.length <= 140) return flat;
    return `[\n${value.map((v) => `${next}${formatJson(v, next)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  if (entries.every(([, v]) => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)))) {
    const flat = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${formatJson(v, next)}`).join(', ')} }`;
    if (flat.length + indent.length <= 140) return flat;
  }
  return `{\n${entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`).join(',\n')}\n${indent}}`;
}

// Textes de world.json et decor.json d'une carte, d'après ses sources. Lot 3e : si la carte a un étage (etage.json), son monde etage.world.json est aussi généré
// (même conversion, mêmes règles, même origine ; ses points d'apparition sont dans la clé spawnPoints, sans décor) et les règles de l'étage (js/core/floor-rules.js)
// sont vérifiées. Renvoie { world, decor, etage (texte ou null), report, etageReport, problems }.
export function generateMapFiles(id = 'rez-de-chaussee') {
  const plan = JSON.parse(readFileSync(new URL(`${id}/plan.json`, ROOT), 'utf8'));
  const params = JSON.parse(readFileSync(new URL('params.json', ROOT), 'utf8'));
  const zones = parseZones(JSON.parse(readFileSync(new URL(`${id}/zones.json`, ROOT), 'utf8')));
  // Lot 5a : épaves du décor extérieur (epaves.json, pixels du plan), facultatives.
  const epavesUrl = new URL(`${id}/epaves.json`, ROOT);
  const epaves = existsSync(epavesUrl) ? JSON.parse(readFileSync(epavesUrl, 'utf8')) : null;
  const out = planToWorld(plan, params, { doors: zones.doors.filter((d) => !d.planned), epaves });
  if (!out.world) throw new Error(`plan invalide : ${out.report.errors.join(' ; ')}`);
  const result = { world: `${formatJson(out.world)}\n`, decor: `${formatJson(out.decor)}\n`, etage: null, report: out.report, etageReport: null, problems: [], decorInterieur: null, decorReport: null, mobilier: null, mobilierReport: null, wrecksReport: null };
  // Lot 5a : décor extérieur généré (graine) avec ses épaves : règles du décor (decorProblems) et voiture en flammes (existe, à 160 du bâtiment au moins).
  if (out.decor.wrecks) result.wrecksReport = wrecksCheck(out.world, out.decor, params);
  let etageWorldOut = null;
  let etagePlanOut = null;
  const etageUrl = new URL(`${id}/etage.json`, ROOT);
  if (existsSync(etageUrl)) {
    const etagePlan = JSON.parse(readFileSync(etageUrl, 'utf8'));
    // Les portes de l'étage (ouvertures de etage.json) servent à tenir les pièces à 100 de leur ouverture.
    const doors = zones.doors.flatMap((d) => d.blocks.filter((b) => b.floor === 'etage' && b.opening).map((b, i) => ({ id: `${d.id}-etage-${i + 1}`, opening: b.opening })));
    const up = planToWorld(etagePlan, params, { doors });
    if (!up.world) throw new Error(`etage.json invalide : ${up.report.errors.join(' ; ')}`);
    const etageWorld = { ...up.world, _provisoire: 'Étage généré par npm run carte (scripts/plan-vers-monde.mjs) d\'après etage.json : ne jamais éditer à la main, changer etage.json puis relancer la commande. Même repère et mêmes unités que world.json (rez-de-chaussée) ; pas de décor, aucun obstacle à l\'extérieur ; spawnPoints : 2 par fenêtre, à 450 et 650 du mur. Valeurs provisoires.', spawnPoints: up.decor.spawnPoints.map((p) => ({ ...p })) };
    result.etage = `${formatJson(etageWorld)}\n`;
    etageWorldOut = etageWorld;
    etagePlanOut = etagePlan;
    result.etageReport = up.report;
    const world = out.world;
    result.problems = floorProblems({ rdc: world, etage: etageWorld, zones: zonesToWorld(zones, world.transform), params, plan: { rdc: plan, etage: etagePlan } });
    if (!up.report.valid) result.problems.push(...up.report.violations.map((v) => `étage : ${v}`));
  }
  // Lot 3g : décor léger intérieur (non solide) d'après decor-interieur.json (pixels) : unités du jeu, coupé autour des fenêtres et des escaliers,
  // éléments au sol retirés des zones de dégagement. Écrit decor-interieur.world.json (jamais édité à la main).
  const decorUrl = new URL(`${id}/decor-interieur.json`, ROOT);
  if (existsSync(decorUrl)) {
    const source = JSON.parse(readFileSync(decorUrl, 'utf8'));
    const zw = zonesToWorld(zones, out.world.transform);
    const conv = decorToWorld(source, { rdc: plan, etage: etagePlanOut }, out.world.transform, { wallThickness: params.wallThickness });
    const worlds = { rdc: out.world, etage: etageWorldOut };
    const zonesBy = Object.fromEntries(Object.entries(worlds).filter(([, w]) => w).map(([f, w]) => [f, clearanceZones(w, zw, params, f)]));
    const windowsBy = Object.fromEntries(Object.entries(worlds).filter(([, w]) => w).map(([f, w]) => [f, w.windows]));
    const placed = placeDecor(conv.items, zonesBy, windowsBy, { windowSize: params.windowSize });
    const doc = { _provisoire: 'Décor léger intérieur généré par npm run carte (scripts/plan-vers-monde.mjs) d\'après decor-interieur.json : ne jamais éditer à la main. Unités du jeu ; non solide (aucune collision, aucun effet sur le chemin, les tirs ni les règles). Valeurs provisoires.', triangles: totalTriangles(placed.items), items: placed.items };
    result.decorInterieur = `${formatJson(doc)}\n`;
    result.decorReport = { warnings: conv.warnings, removed: placed.removed, count: placed.items.length, triangles: doc.triangles };
  }
  // Lot 3g (retour du propriétaire) : aspect du mobilier d'après le modèle (releve.json) : boîtes de dessin par pièce, limitées au rectangle de collision de
  // son obstacle (le dessin seulement). Écrit mobilier.world.json (jamais édité à la main) ; ?detail=0 garde l'ancien dessin.
  const releveUrl = new URL(`${id}/releve.json`, ROOT);
  if (existsSync(releveUrl)) {
    const releve = JSON.parse(readFileSync(releveUrl, 'utf8'));
    const t = out.world.transform;
    const X = (px) => (px - (t.x0 ?? 0)) * t.scale + t.margin;
    const Y = (py) => (py - (t.y0 ?? 0)) * t.scale + t.margin;
    const pieces = {};
    let triangles = 0;
    for (const [floor, src, w] of [['rdc', plan, out.world], ['etage', etagePlanOut, etageWorldOut]]) {
      if (!src || !w) continue;
      const rows = compareFloor(src, releve, floor).rows.filter((r) => r.nature === 'meuble');
      for (const f of src.furniture ?? []) {
        const obstacle = w.obstacles.find((o) => (o.parts ?? [o.id]).includes(f.id));
        if (!obstacle) continue; // pièce retirée par la conversion : rien à dessiner
        const row = rows.find((r) => r.id === f.id);
        const group = row?.ref ? (releve.groups ?? []).find((g) => g.key === row.ref) : null;
        const objs = group ? group.ids.map((oid) => releve.objects.find((o) => o.id === oid)).filter((o) => o && o.klass !== 'fenetre') : [];
        const look = lookOf(f, group ? group.components : []);
        const rect = { x: X(f.x0), y: Y(f.y0), w: (f.x1 - f.x0) * t.scale, h: (f.y1 - f.y0) * t.scale };
        const objects = objs.map((o) => ({ x0: X(o.plan.x0), x1: X(o.plan.x1), z0: Y(o.plan.y0), z1: Y(o.plan.y1), y0: o.bottom * 60, y1: o.top * 60 }));
        const clip = (b) => ({ ...b, x0: Math.max(b.x0, obstacle.x), x1: Math.min(b.x1, obstacle.x + obstacle.w), z0: Math.max(b.z0, obstacle.y), z1: Math.min(b.z1, obstacle.y + obstacle.h) });
        const boxes = pieceBoxes({ id: f.id, kind: f.kind, ...rect }, objects, { look, maxHeight: obstacle.hauteur }).map(clip).filter((b) => b.x1 - b.x0 > 0.5 && b.z1 - b.z0 > 0.5);
        if (boxes.length === 0) continue;
        pieces[f.id] = { floor, look, obstacle: obstacle.id, ...(group ? { modele: group.ids } : {}), boxes };
        triangles += boxTriangles(boxes);
      }
    }
    result.mobilier = `${formatJson({ _provisoire: 'Aspect du mobilier généré par npm run carte (scripts/plan-vers-monde.mjs) d\'après plan.json, etage.json et releve.json (objets du modèle associés à chaque pièce) : ne jamais éditer à la main. Dessin seulement (unités du jeu ; y = hauteur, z = y du jeu) : les collisions gardent les rectangles de world.json. Valeurs provisoires.', triangles, pieces })}\n`;
    result.mobilierReport = { count: Object.keys(pieces).length, triangles };
  }
  return result;
}

// Lot 5a : contrôle des épaves sur le décor généré. Renvoie { car, helicopter, problems }.
export function wrecksCheck(world, decorCfg, params) {
  const decor = generateDecor(decorCfg, world);
  const problems = decorProblems(decor, world);
  const fp = polygonRects(world.contour);
  const car = decor.cars.find((c) => c.burning === true) ?? null;
  if (decorCfg.wrecks.burningCar && !car) problems.push('voiture en flammes absente du décor');
  if (car) {
    const gap = Math.min(...fp.map((f) => rectGap(car, f)));
    if (gap < params.decor.distanceSalle) problems.push(`${car.id} à ${Math.round(gap)} du bâtiment`);
  }
  const h = decor.helicopter;
  const gapH = h ? Math.min(...h.rects.flatMap((r) => fp.map((f) => rectGap(r, f)))) : null;
  return { car: car ? { id: car.id, x: car.x, y: car.y, gap: Math.round(Math.min(...fp.map((f) => rectGap(car, f)))) } : null, helicopter: h ? { corner: h.corner, rects: h.rects.length, gap: Math.round(gapH), edge: decorCfg.wrecks.helicopter?.edge, triangles: decorCfg.wrecks.helicopter?.triangles, height: h.height } : null, problems };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--verifie');
  const id = args.find((a) => !a.startsWith('--')) ?? 'rez-de-chaussee';
  const { world, decor, etage, report, etageReport, problems, decorInterieur, decorReport, mobilier, mobilierReport, wrecksReport } = generateMapFiles(id);
  const files = [['world.json', world], ['decor.json', decor], ...(etage === null ? [] : [['etage.world.json', etage]]), ...(decorInterieur === null ? [] : [['decor-interieur.world.json', decorInterieur]]), ...(mobilier ? [['mobilier.world.json', mobilier]] : [])].map(([name, text]) => [name, text, new URL(`${id}/${name}`, ROOT)]);
  if (check) {
    const stale = files.filter(([, text, url]) => !existsSync(url) || readFileSync(url, 'utf8') !== text).map(([name]) => name);
    if (stale.length > 0) {
      console.error(`Fichiers périmés : ${stale.join(', ')} (lance npm run carte)`);
      process.exit(1);
    }
    console.log('Carte à jour.');
  } else {
    for (const [, text, url] of files) writeFileSync(url, text);
    console.log(`Carte ${id} : ${files.map(([name]) => name).join(', ')} écrits.`);
  }
  console.log(`Monde ${report.size.width} × ${report.size.height} ; aire intérieure ${report.areas.interior}, libre ${report.areas.free}.`);
  for (const w of report.shifts) console.log(`Fenêtre ${w.id} décalée de ${w.units} unités${w.auto ? ' (automatique)' : ''}.`);
  for (const m of report.merged) console.log(`Fusion : ${m.id}`);
  for (const r of report.retired) console.log(`Retiré : ${r.id} (${r.reason})`);
  for (const v of report.violations) console.log(`PROBLÈME : ${v}`);
  if (etageReport) {
    for (const w of etageReport.shifts) console.log(`Étage : fenêtre ${w.id} décalée de ${w.units} unités${w.auto ? ' (automatique)' : ''}.`);
    for (const r of etageReport.retired) console.log(`Étage : retiré ${r.id} (${r.reason})`);
  }
  for (const v of problems) console.log(`PROBLÈME (étage) : ${v}`);
  if (mobilierReport) console.log(`Mobilier d'après le modèle : ${mobilierReport.count} pièces, ${mobilierReport.triangles} triangles.`);
  if (decorReport) {
    console.log(`Décor léger : ${decorReport.count} éléments, ${decorReport.triangles} triangles.`);
    for (const w of decorReport.warnings) console.log(`Décor léger : ${w}`);
    for (const r of decorReport.removed) console.log(`Décor léger : retiré ${r.id} (${r.reasons.join(', ')})`);
  }
  if (wrecksReport) {
    const { car, helicopter: h } = wrecksReport;
    if (car) console.log(`Épaves : voiture en flammes ${car.id} (${car.x}, ${car.y}), à ${car.gap} du bâtiment.`);
    if (h) console.log(`Épaves : hélicoptère dans l'angle du L (${h.corner.x}, ${h.corner.y}), ${h.rects} rectangles de collision à ${h.gap} du bâtiment au moins (bord ${h.edge}), ${h.triangles} triangles, hauteur ${h.height}.`);
    for (const v of wrecksReport.problems) console.log(`PROBLÈME (décor) : ${v}`);
  }
  if (!report.valid || problems.length > 0 || (wrecksReport?.problems.length ?? 0) > 0) process.exit(1);
}
