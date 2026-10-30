// Règles de l'étage (lot 3e) : vérifications pures des données converties (monde du rez-de-chaussée, monde de l'étage, zones en unités du jeu). Utilisées par
// scripts/plan-vers-monde.mjs (qui échoue si une règle casse) et par les tests. Pur : n'utilise que ses arguments, renvoie une liste de textes (vide : tout est
// bon), ne modifie pas ses arguments, ne lève aucune exception sur des entrées inattendues, déterministe.
// Les règles de la carte du lot 3b et 3c (couloirs, interstices, rognage, profondeur de 150, point de réparation, hauteur, ouverture des portes) sont celles de
// planToWorld (maps.js) et de analyzeMap : elles s'appliquent à l'étage comme au rez-de-chaussée. Ici : ce qui est propre à l'étage et aux escaliers.
import { distanceToRect, rectGap, validRects } from './collision.js';
import { DEFAULT_FLOOR, floorOf, UPPER_FLOOR } from './floors.js';
import { windowZone } from './maps.js';
import { overlapArea, pointInPolygon, polygonRects, segmentRects } from './shape.js';
import { STAIR_DEFAULTS } from './stairs.js';
import { assignWindowsDetailed } from './zones.js';
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

export const FLOOR_RULES = Object.freeze({
  contourTolerance: 100, // le contour de l'étage est contenu dans celui du rez-de-chaussée à 100 unités près
  spawnOutside: 160, // points d'apparition de l'étage : au moins 160 hors du contour du rez-de-chaussée
  windowSpacing: 150, // fenêtres de l'étage : centres à 150 au moins l'un de l'autre
  pathMax: 900, // chemin du point d'apparition à l'entrée extérieure de sa fenêtre
  arrivalFree: 40, // rayon libre autour d'un point d'arrivée
  arrivalFromTrigger: 60, // distance minimale entre un point d'arrivée et la zone de déclenchement de son étage
});

const distToRects = (p, rects) => rects.reduce((best, r) => Math.min(best, distanceToRect(p.x, p.y, r)), Infinity);
const solidsOf = (world) => [...validRects(world?.obstacles), ...segmentRects(world?.walls, num(world?.wallThickness, 40))];

// Liste des problèmes d'une carte à deux étages. entrée : { rdc: world, etage: world (avec spawnPoints), zones: zonesToWorld(...), params, plan?: { rdc, etage } }.
export function floorProblems(input) {
  const out = [];
  const rdc = input?.rdc;
  const up = input?.etage;
  const zones = input?.zones;
  const params = isObject(input?.params) ? input.params : {};
  if (!isObject(rdc) || !isObject(up) || !isObject(zones)) return ['carte à deux étages incomplète'];
  const rules = { ...FLOOR_RULES, ...(isObject(input?.rules) ? input.rules : {}) };
  const t = num(up.wallThickness, 40);
  const rdcFloor = polygonRects(rdc.contour);
  const upFloor = polygonRects(up.contour);
  const upSolids = solidsOf(up);

  // 1. Contour de l'étage contenu dans celui du rez-de-chaussée à 100 unités près.
  for (const [i, c] of (Array.isArray(up.contour) ? up.contour : []).entries()) {
    const d = pointInPolygon(c[0], c[1], rdc.contour) ? 0 : distToRects({ x: c[0], y: c[1] }, rdcFloor);
    if (d > rules.contourTolerance) out.push(`contour de l'étage : le sommet ${i + 1} est à ${Math.round(d)} du rez-de-chaussée (plus de ${rules.contourTolerance})`);
  }

  // 2. Aucun obstacle solide à l'extérieur de l'étage ; hauteur permise ; aucun décor.
  for (const o of validRects(up.obstacles)) {
    if (o.outside === true) out.push(`étage : l'obstacle ${o.id} est à l'extérieur`);
    if (num(o.hauteur) > num(params.maxHeight, 70)) out.push(`étage : ${o.id} trop haute`);
  }

  // 3. Fenêtres : chacune dans une zone de l'étage, centres à 150 au moins, profondeur libre de 150.
  const wins = Array.isArray(up.windows) ? up.windows : [];
  const geoms = wins.map((w) => ({ id: w.id, floor: UPPER_FLOOR, entryInner: windowEntryInner(w, 60) }));
  const assigned = assignWindowsDetailed(zones, geoms);
  for (const w of wins) {
    const zone = zones.zones.find((z) => z.id === assigned.map[w.id]);
    if (!zone || zone.floor !== UPPER_FLOOR || assigned.warnings.some((m) => m.includes(w.id))) out.push(`fenêtre ${w.id} : hors de toute zone de l'étage`);
    const zr = windowZone(w, num(up.windowSize, 72), num(up.windowDepth, 150), t);
    if (zr) for (const o of validRects(up.obstacles)) if (overlapArea(zr, o) > 0) out.push(`fenêtre ${w.id} : ${o.id} dans les 150 de profondeur`);
  }
  for (let i = 0; i < wins.length; i += 1) {
    for (let j = i + 1; j < wins.length; j += 1) {
      const d = Math.hypot(wins[i].x - wins[j].x, wins[i].y - wins[j].y);
      if (d < rules.windowSpacing) out.push(`fenêtres ${wins[i].id} et ${wins[j].id} : à ${Math.round(d)} (moins de ${rules.windowSpacing})`);
    }
  }

  // 4. Points d'apparition : 2 par fenêtre, à 450 et 650 du mur, à 160 au moins hors du rez-de-chaussée, chemin court jusqu'à l'entrée extérieure.
  const distances = Array.isArray(params.spawnDistances) ? params.spawnDistances.slice(0, 2) : [450, 650];
  const size = up.size ?? { width: 0, height: 0 };
  for (const w of wins) {
    const mine = (Array.isArray(up.spawnPoints) ? up.spawnPoints : []).filter((p) => (p.fenetre ?? p.window) === w.id);
    if (mine.length !== distances.length) out.push(`fenêtre ${w.id} : ${mine.length} point(s) d'apparition au lieu de ${distances.length}`);
    for (const p of mine) {
      const outsideBy = pointInPolygon(p.x, p.y, rdc.contour) ? -1 : distToRects(p, rdcFloor);
      if (outsideBy < rules.spawnOutside) out.push(`point ${p.id} : à ${Math.round(Math.max(0, outsideBy))} hors du rez-de-chaussée (moins de ${rules.spawnOutside})`);
      if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) out.push(`point ${p.id} : hors du monde`);
      const away = Math.hypot(p.x - w.x, p.y - w.y);
      if (away > rules.pathMax) out.push(`point ${p.id} : à ${Math.round(away)} de sa fenêtre (plus de ${rules.pathMax})`);
      if (upSolids.some((s) => distanceToRect(p.x, p.y, s) <= 0)) out.push(`point ${p.id} : dans un obstacle de l'étage`);
    }
  }

  // 5. Escaliers : emprise, zone de déclenchement libre et assez grande, arrivée libre à chaque étage.
  const worlds = { [DEFAULT_FLOOR]: rdc, [UPPER_FLOOR]: up };
  const minSide = num(input?.triggerMin, STAIR_DEFAULTS.triggerMin);
  for (const st of Array.isArray(zones.stairs) ? zones.stairs : []) {
    for (const [floor, world] of Object.entries(worlds)) {
      const d = st.floors?.[floor];
      const label = `${st.id} (${floor})`;
      if (!d || !d.trigger || !d.arrival || !d.solid) {
        out.push(`escalier ${label} : description incomplète`);
        continue;
      }
      const solids = solidsOf(world);
      const fl = polygonRects(world.contour);
      if (d.trigger.w < minSide || d.trigger.h < minSide) out.push(`escalier ${label} : zone de déclenchement de ${Math.round(d.trigger.w)} × ${Math.round(d.trigger.h)} (moins de ${minSide})`);
      for (const s of solids) if (overlapArea(d.trigger, s) > 0) out.push(`escalier ${label} : la zone de déclenchement recouvre ${s.id}`);
      if (!fl.some((r) => overlapArea(d.trigger, r) >= d.trigger.w * d.trigger.h - 1e-6) && !pointInPolygon(d.trigger.x + d.trigger.w / 2, d.trigger.y + d.trigger.h / 2, world.contour)) out.push(`escalier ${label} : la zone de déclenchement est hors du bâtiment`);
      if (!pointInPolygon(d.arrival.x, d.arrival.y, world.contour)) out.push(`escalier ${label} : arrivée hors du bâtiment`);
      const free = distToRects(d.arrival, solids);
      if (free < rules.arrivalFree) out.push(`escalier ${label} : arrivée à ${Math.round(free)} d'un obstacle (moins de ${rules.arrivalFree})`);
      const fromTrigger = distanceToRect(d.arrival.x, d.arrival.y, d.trigger);
      if (fromTrigger < rules.arrivalFromTrigger) out.push(`escalier ${label} : arrivée à ${Math.round(fromTrigger)} de la zone de déclenchement (moins de ${rules.arrivalFromTrigger})`);
      // L'emprise pleine est bien un obstacle de la carte de cet étage (celui du plan, éventuellement fusionné avec un pilier voisin).
      const covered = validRects(world.obstacles).some((o) => o.kind === 'escalier' && o.x <= d.solid.x + 1e-6 && o.y <= d.solid.y + 1e-6 && o.x + o.w >= d.solid.x + d.solid.w - 1e-6 && o.y + o.h >= d.solid.y + d.solid.h - 1e-6)
        || validRects(world.stairs).some((o) => o.x <= d.solid.x + 1e-6 && o.y <= d.solid.y + 1e-6 && o.x + o.w >= d.solid.x + d.solid.w - 1e-6 && o.y + o.h >= d.solid.y + d.solid.h - 1e-6);
      if (!covered) out.push(`escalier ${label} : l'emprise pleine n'est pas un obstacle de la carte`);
    }
    // Le bloc de la porte, au rez-de-chaussée, ferme la zone de déclenchement tant que la porte est fermée.
    const door = (Array.isArray(zones.doors) ? zones.doors : []).find((d) => d.id === st.door);
    if (!door) out.push(`escalier ${st.id} : porte ${st.door} inconnue`);
    else {
      const block = door.blocks.find((b) => b.floor === DEFAULT_FLOOR && b.rect);
      const trig = st.floors?.[DEFAULT_FLOOR]?.trigger;
      if (!block || !trig || !(block.rect.x <= trig.x && block.rect.y <= trig.y && block.rect.x + block.rect.w >= trig.x + trig.w && block.rect.y + block.rect.h >= trig.y + trig.h)) out.push(`porte ${door.id} : son bloc du rez-de-chaussée ne couvre pas la zone de déclenchement de ${st.id}`);
    }
  }

  // 6. Les zones de l'étage recouvrent l'intérieur de l'étage sans se chevaucher.
  const upZones = (Array.isArray(zones.zones) ? zones.zones : []).filter((z) => floorOf(z) === UPPER_FLOOR);
  for (let i = 0; i < upZones.length; i += 1) {
    for (let j = i + 1; j < upZones.length; j += 1) {
      const a = polygonRects(upZones[i].region);
      const b = polygonRects(upZones[j].region);
      if (a.some((r) => b.some((q) => overlapArea(r, q) > 0))) out.push(`zones ${upZones[i].id} et ${upZones[j].id} : elles se recouvrent`);
    }
  }
  for (const f of upFloor) {
    const covered = upZones.flatMap((z) => polygonRects(z.region)).reduce((sum, r) => sum + overlapArea(f, r), 0);
    if (covered < f.w * f.h - 1) out.push('zones de l\'étage : une partie de l\'étage n\'est dans aucune zone');
  }
  return out;
}

// Entrée intérieure d'une fenêtre (60 vers l'intérieur depuis son centre) : même règle que maps.js et windows.js.
const NORMALS = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] };
function windowEntryInner(w, inner) {
  const n = NORMALS[w?.side];
  return n && isNum(w?.x) && isNum(w?.y) ? { x: w.x - n[0] * inner, y: w.y - n[1] * inner } : null;
}

export { rectGap };
