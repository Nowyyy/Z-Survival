// Zones et portes (lot 3c) : quelles zones du bâtiment sont actives, quelles fenêtres et quels points d'apparition leur appartiennent, quelle
// porte s'ouvre ensuite. Pur : n'utilise que ses arguments (zones.json d'une carte, fenêtres, points), renvoie de nouveaux objets, ne modifie
// pas ses arguments (gelés acceptés), ne lève aucune exception sur des entrées inattendues, déterministe.
// Les polygones et les ouvertures sont dans l'unité de zones.json (pixels du plan) ; zonesToWorld les convertit en unités du jeu, et les autres
// fonctions travaillent dans l'unité des fenêtres qu'on leur donne.
import { DEFAULT_FLOOR, floorOf, isFloorId, parseFloors } from './floors.js';
import { pointInPolygon } from './shape.js';
import { isNum, num } from './vec.js';

export const DEFAULT_WAVES_PER_WORLD = 40;
export const DOOR_KINDS = Object.freeze(['porte', 'escalier']);
export const DOOR_OVERHANG = 4; // la porte déborde de 4 de chaque côté, dans l'épaisseur du mur et le long du mur
export const DEFAULT_ZONE_ID = 'depart';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const isPoint = (p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]);
const SIDE_NORMALS = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] };
export const DEFAULT_SUBTITLE_KEY = 'game.splash.zone.subtitle';

function cleanSegment(s) {
  if (!isObject(s) || ![s.x1, s.y1, s.x2, s.y2].every(isNum)) return null;
  if (s.x1 !== s.x2 && s.y1 !== s.y2) return null; // une ouverture est horizontale ou verticale
  if (s.x1 === s.x2 && s.y1 === s.y2) return null;
  return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
}

// Normalise zones.json. Renvoie { wavesPerWorld, zones, doors, warnings } ; une valeur invalide prend une valeur neutre et ajoute un avertissement.
export function parseZones(json) {
  const warnings = [];
  const src = isObject(json) ? json : {};
  if (!isObject(json)) warnings.push('zones.json absent ou invalide');
  let wavesPerWorld = DEFAULT_WAVES_PER_WORLD;
  if (src.wavesPerWorld !== undefined) {
    if (Number.isInteger(src.wavesPerWorld) && src.wavesPerWorld >= 1 && src.wavesPerWorld <= 1000) wavesPerWorld = src.wavesPerWorld;
    else warnings.push(`wavesPerWorld invalide : ${DEFAULT_WAVES_PER_WORLD}`);
  }
  const floorList = parseFloors(src);
  warnings.push(...floorList.warnings);
  const zones = [];
  const seen = new Set();
  for (const z of Array.isArray(src.zones) ? src.zones : []) {
    if (!isObject(z) || typeof z.id !== 'string' || z.id === '' || seen.has(z.id)) {
      warnings.push('zone ignorée (identifiant absent ou en double)');
      continue;
    }
    seen.add(z.id);
    const region = Array.isArray(z.region) ? z.region.filter(isPoint).map((p) => [p[0], p[1]]) : [];
    if (region.length < 3) warnings.push(`zone ${z.id} : région invalide (3 sommets au moins)`);
    let floor = DEFAULT_FLOOR;
    if (z.floor !== undefined) {
      if (isFloorId(z.floor) && floorList.floors.includes(z.floor)) floor = z.floor;
      else warnings.push(`zone ${z.id} : étage inconnu, rdc`);
    }
    zones.push({ id: z.id, label: typeof z.label === 'string' ? z.label : z.id, floor, openAtStart: z.openAtStart === true, region: region.length >= 3 ? region : [] });
  }
  if (zones.length > 0 && !zones.some((z) => z.openAtStart)) warnings.push('aucune zone ouverte au départ');
  const doors = [];
  const doorIds = new Set();
  for (const d of Array.isArray(src.doors) ? src.doors : []) {
    if (!isObject(d) || typeof d.id !== 'string' || d.id === '' || doorIds.has(d.id)) {
      warnings.push('porte ignorée (identifiant absent ou en double)');
      continue;
    }
    if (!Number.isInteger(d.openAfterWave) || d.openAfterWave < 1) {
      warnings.push(`porte ${d.id} ignorée : openAfterWave invalide`);
      continue;
    }
    doorIds.add(d.id);
    const opens = Array.isArray(d.opens) ? d.opens.filter((id) => typeof id === 'string') : [];
    const planned = d.planned === true;
    const opening = cleanSegment(d.opening);
    const blocks = cleanBlocks(d.blocks, floorList.floors, warnings, d.id);
    if (!planned && opening === null && blocks.length === 0) warnings.push(`porte ${d.id} : ouverture invalide`);
    const stairIds = Array.isArray(d.stairs) ? d.stairs.filter((id) => typeof id === 'string') : [];
    const floor = isFloorId(d.floor) && floorList.floors.includes(d.floor) ? d.floor : DEFAULT_FLOOR;
    doors.push({ id: d.id, kind: DOOR_KINDS.includes(d.kind) ? d.kind : 'porte', floor, openAfterWave: d.openAfterWave, opens, opening, stairs: stairIds, blocks, subtitleKey: typeof d.subtitleKey === 'string' && d.subtitleKey !== '' ? d.subtitleKey : DEFAULT_SUBTITLE_KEY, planned });
  }
  const stairs = cleanStairs(src.stairs, floorList.floors, doors, warnings);
  return { wavesPerWorld, floors: floorList.floors, multiFloor: floorList.multi, zones, doors, stairs, warnings };
}

const cleanRect = (r) => {
  if (!isObject(r) || ![r.x0, r.y0, r.x1, r.y1].every(isNum) || !(r.x1 > r.x0) || !(r.y1 > r.y0)) return null;
  return { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
};
const cleanPoint = (p) => (isObject(p) && isNum(p.x) && isNum(p.y) ? { x: p.x, y: p.y } : null);

// Blocs d'une porte : [{ floor, rect | opening }] (rect en pixels du plan, ou segment d'ouverture) ; un bloc invalide est ignoré avec un avertissement.
function cleanBlocks(blocks, floors, warnings, doorId) {
  const out = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const floor = isObject(b) && isFloorId(b.floor) && floors.includes(b.floor) ? b.floor : null;
    const rect = isObject(b) ? cleanRect(b.rect) : null;
    const opening = isObject(b) ? cleanSegment(b.opening) : null;
    if (floor === null || (rect === null && opening === null)) {
      warnings.push(`porte ${doorId} : bloc invalide ignoré`);
      continue;
    }
    out.push({ floor, rect, opening: rect === null ? opening : null });
  }
  return out;
}

// Escalier physique (lot 3e, mise à jour) : { path: [{ x, y, t }], width } ou null ; t est la fraction de la hauteur d'un étage (0 au pied, 1 en haut).
function cleanWalk(raw) {
  if (!isObject(raw) || !Array.isArray(raw.path) || raw.path.length < 3 || !isNum(raw.width) || raw.width <= 0) return null;
  const path = [];
  for (const q of raw.path) {
    if (!Array.isArray(q) || q.length < 3 || !q.slice(0, 3).every(isNum) || q[2] < 0 || q[2] > 1) return null;
    path.push({ x: q[0], y: q[1], t: q[2] });
  }
  if (path[0].t !== 0 || path[path.length - 1].t !== 1) return null;
  for (let i = 1; i < path.length; i += 1) if (path[i].t < path[i - 1].t) return null;
  return { path, width: raw.width };
}

// Escaliers : { id, label, door, planned, floors: { rdc: { solid, trigger, arrival }, etage: {...} } } ; un escalier dont une description est invalide est ignoré
// avec un avertissement. `planned` vient de sa porte (porte inconnue ou planned : l'escalier n'est pas utilisable).
function cleanStairs(list, floors, doors, warnings) {
  const out = [];
  const seen = new Set();
  for (const st of Array.isArray(list) ? list : []) {
    if (!isObject(st) || typeof st.id !== 'string' || st.id === '' || seen.has(st.id)) {
      warnings.push('escalier ignoré (identifiant absent ou en double)');
      continue;
    }
    const by = {};
    let ok = true;
    for (const f of floors) {
      const d = isObject(st[f]) ? st[f] : {};
      const solid = cleanRect(d.solid);
      const trigger = cleanRect(d.trigger);
      const arrival = cleanPoint(d.arrival);
      if (!solid || !trigger || !arrival) ok = false;
      by[f] = { solid, trigger, arrival };
    }
    if (!ok || floors.length < 2) {
      warnings.push(`escalier ${st.id} ignoré : description invalide (solid, trigger, arrival à chaque étage)`);
      continue;
    }
    seen.add(st.id);
    const walk = cleanWalk(st.walk);
    if (st.walk !== undefined && !walk) warnings.push(`escalier ${st.id} : walk invalide (au moins 3 points [x, y, t], t de 0 à 1, premier t = 0, dernier t = 1, largeur > 0) : escalier instantané`);
    const door = doors.find((d) => d.id === st.door);
    if (!door) warnings.push(`escalier ${st.id} : porte inconnue`);
    out.push({ id: st.id, label: typeof st.label === 'string' ? st.label : st.id, door: typeof st.door === 'string' ? st.door : null, planned: !door || door.planned === true, floors: by, walk });
  }
  return out;
}

// Convertit les polygones et les ouvertures de pixels du plan en unités du jeu : monde = (px - origine) * scale + margin (maps.js).
export function zonesToWorld(parsed, transform) {
  const scale = isNum(transform?.scale) && transform.scale > 0 ? transform.scale : 1;
  const margin = num(transform?.margin);
  const x0 = num(transform?.x0);
  const y0 = num(transform?.y0);
  const X = (px) => Math.round(((px - x0) * scale + margin) * 1e6) / 1e6;
  const Y = (py) => Math.round(((py - y0) * scale + margin) * 1e6) / 1e6;
  const src = isObject(parsed) ? parsed : {};
  const rectW = (r) => (cleanRect(r) ? { x: X(r.x0), y: Y(r.y0), w: Math.round((r.x1 - r.x0) * scale * 1e6) / 1e6, h: Math.round((r.y1 - r.y0) * scale * 1e6) / 1e6 } : null);
  const pointW = (p) => (cleanPoint(p) ? { x: X(p.x), y: Y(p.y) } : null);
  const segW = (o) => (cleanSegment(o) ? { x1: X(o.x1), y1: Y(o.y1), x2: X(o.x2), y2: Y(o.y2) } : null);
  return {
    wavesPerWorld: Number.isInteger(src.wavesPerWorld) ? src.wavesPerWorld : DEFAULT_WAVES_PER_WORLD,
    floors: Array.isArray(src.floors) && src.floors.length > 0 ? [...src.floors] : [DEFAULT_FLOOR],
    multiFloor: src.multiFloor === true,
    zones: (Array.isArray(src.zones) ? src.zones : []).map((z) => ({ ...z, floor: floorOf(z), region: (Array.isArray(z.region) ? z.region : []).filter(isPoint).map((p) => [X(p[0]), Y(p[1])]) })),
    doors: (Array.isArray(src.doors) ? src.doors : []).map((d) => ({
      ...d,
      floor: floorOf(d),
      opens: Array.isArray(d.opens) ? [...d.opens] : [],
      stairs: Array.isArray(d.stairs) ? [...d.stairs] : [],
      blocks: (Array.isArray(d.blocks) ? d.blocks : []).map((b) => ({ floor: floorOf(b), rect: rectW(b.rect), opening: segW(b.opening) })),
      opening: segW(d.opening),
    })),
    // Escaliers en unités du jeu : { id, label, door, planned, floors: { rdc: { solid, trigger, arrival }, ... } } (rectangles { x, y, w, h }, point { x, y }).
    stairs: (Array.isArray(src.stairs) ? src.stairs : []).map((st) => ({
      id: st.id, label: st.label, door: st.door ?? null, planned: st.planned === true,
      floors: Object.fromEntries(Object.entries(isObject(st.floors) ? st.floors : {}).map(([f, d]) => [f, { solid: rectW(d?.solid), trigger: rectW(d?.trigger), arrival: pointW(d?.arrival) }])),
      walk: isObject(st.walk) && Array.isArray(st.walk.path) ? { path: st.walk.path.map((q) => ({ x: X(q.x), y: Y(q.y), t: q.t })), width: Math.round(st.walk.width * scale * 1e6) / 1e6 } : null,
    })),
    warnings: Array.isArray(src.warnings) ? [...src.warnings] : [],
  };
}

const zoneList = (zones) => (Array.isArray(zones?.zones) ? zones.zones.filter((z) => isObject(z) && typeof z.id === 'string') : []);
const doorList = (zones) => (Array.isArray(zones?.doors) ? zones.doors.filter((d) => isObject(d) && typeof d.id === 'string') : []);
const idSet = (ids) => new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : ids instanceof Set ? [...ids].filter((id) => typeof id === 'string') : []);

// Entrée intérieure d'une fenêtre : sa propre entryInner si elle en a une, sinon le point à `inner` du centre vers l'intérieur.
function entryInnerOf(win, inner) {
  if (isObject(win?.entryInner) && isNum(win.entryInner.x) && isNum(win.entryInner.y)) return { x: win.entryInner.x, y: win.entryInner.y };
  const n = SIDE_NORMALS[win?.side];
  if (!n || !isNum(win?.x) || !isNum(win?.y)) return null;
  return { x: win.x - n[0] * inner, y: win.y - n[1] * inner };
}

// { map: { idFenêtre: idZone }, warnings } : chaque fenêtre appartient à la zone de son étage (win.floor, rdc par défaut) dont la région contient son entryInner ; une fenêtre hors de toute
// région est signalée et rattachée à la zone de départ (la première zone ouverte au départ, sinon « depart »).
export function assignWindowsDetailed(zones, windows, inner = 60) {
  const map = {};
  const warnings = [];
  const list = zoneList(zones);
  const fallback = list.find((z) => z.openAtStart)?.id ?? DEFAULT_ZONE_ID;
  const gap = isNum(inner) && inner >= 0 ? inner : 60;
  for (const win of Array.isArray(windows) ? windows : []) {
    if (!isObject(win) || typeof win.id !== 'string') continue;
    const at = entryInnerOf(win, gap);
    const zone = at ? list.find((z) => floorOf(z) === floorOf(win) && pointInPolygon(at.x, at.y, z.region)) : null; // les zones de deux étages se superposent dans le plan
    if (zone) map[win.id] = zone.id;
    else {
      map[win.id] = fallback;
      warnings.push(`fenêtre ${win.id} hors de toute zone : rattachée à ${fallback}`);
    }
  }
  return { map, warnings };
}

export const assignWindows = (zones, windows, inner = 60) => assignWindowsDetailed(zones, windows, inner).map;

// Identifiants des portes actives (non planned) déjà ouvertes quand la partie commence à la manche startWave : openAfterWave < startWave.
export function doorsOpenAtStart(zones, startWave) {
  const wave = Number.isInteger(startWave) && startWave >= 1 ? startWave : 1;
  return doorList(zones).filter((d) => d.planned !== true && Number.isInteger(d.openAfterWave) && d.openAfterWave < wave).map((d) => d.id);
}

// Zones actives : celles ouvertes au départ et celles qu'ouvre une porte ouverte non planned. Renvoie des identifiants, dans l'ordre des zones.
export function activeZones(zones, openDoors) {
  const open = idSet(openDoors);
  const opened = new Set(doorList(zones).filter((d) => d.planned !== true && open.has(d.id)).flatMap((d) => (Array.isArray(d.opens) ? d.opens : [])));
  return zoneList(zones).filter((z) => z.openAtStart === true || opened.has(z.id)).map((z) => z.id);
}

// Identifiants des fenêtres des zones actives (dans l'ordre de assignment).
export function activeWindows(zones, assignment, openDoors) {
  const active = new Set(activeZones(zones, openDoors));
  return Object.entries(isObject(assignment) ? assignment : {}).filter(([, zone]) => active.has(zone)).map(([id]) => id);
}

// Points d'apparition (chacun relié à une fenêtre par `window`, ou `fenetre`) des zones actives ; un point sans fenêtre connue est écarté.
export function activeSpawnPoints(zones, assignment, points, openDoors) {
  const active = new Set(activeWindows(zones, assignment, openDoors));
  return (Array.isArray(points) ? points : []).filter((p) => isObject(p) && active.has(p.window ?? p.fenetre)).map((p) => ({ ...p }));
}

// Prochaine porte non planned encore fermée qui s'ouvre à la fin d'une manche ≥ wave : { id, wave } (wave = openAfterWave + 1), ou null.
export function nextDoor(zones, wave, openDoors) {
  const open = idSet(openDoors);
  const from = Number.isInteger(wave) && wave >= 1 ? wave : 1;
  const closed = doorList(zones).filter((d) => d.planned !== true && !open.has(d.id) && Number.isInteger(d.openAfterWave) && d.openAfterWave >= from);
  if (closed.length === 0) return null;
  const first = closed.reduce((best, d) => (d.openAfterWave < best.openAfterWave ? d : best));
  return { id: first.id, wave: first.openAfterWave + 1 };
}

// Rectangle plein de la porte : le segment de l'ouverture, épaisseur du mur (params.wallThickness), débord de DOOR_OVERHANG de chaque côté, hauteur
// du mur (params.wallHeight). null si la porte n'a pas d'ouverture valide. { id, kind: 'porte', x, y, w, h, hauteur }.
export function doorRect(door, params) {
  const seg = cleanSegment(door?.opening);
  if (!seg) return null;
  const t = isNum(params?.wallThickness) && params.wallThickness > 0 ? params.wallThickness : 40;
  const height = isNum(params?.wallHeight) && params.wallHeight > 0 ? params.wallHeight : 60;
  const o = DOOR_OVERHANG;
  const id = typeof door.id === 'string' ? door.id : 'porte';
  if (seg.x1 === seg.x2) {
    const a = Math.min(seg.y1, seg.y2);
    const b = Math.max(seg.y1, seg.y2);
    return { id, kind: 'porte', x: seg.x1 - t / 2 - o, y: a - o, w: t + 2 * o, h: b - a + 2 * o, hauteur: height };
  }
  const a = Math.min(seg.x1, seg.x2);
  const b = Math.max(seg.x1, seg.x2);
  return { id, kind: 'porte', x: a - o, y: seg.y1 - t / 2 - o, w: b - a + 2 * o, h: t + 2 * o, hauteur: height };
}

// Lot 3e : zones restreintes à certains étages (zones converties en unités du jeu) : seules les zones de ces étages, les portes situées à ces étages (une porte d'escalier est au rez-de-chaussée), et les escaliers dont
// les deux étages sont dans la liste sont gardés ; multiFloor ne reste vrai que si deux étages au moins restent. restrictToFloors(zones, ['rdc']) donne la carte à un seul
// étage (?map=salle, jeu d'avant le lot 3e).
export function restrictToFloors(zones, floors) {
  const keep = new Set(Array.isArray(floors) ? floors.filter(isFloorId) : [DEFAULT_FLOOR]);
  const src = isObject(zones) ? zones : {};
  const kept = (Array.isArray(src.zones) ? src.zones : []).filter((z) => keep.has(floorOf(z)));
  const doors = (Array.isArray(src.doors) ? src.doors : []).filter((d) => keep.has(floorOf(d)))
    .map((d) => ({ ...d, blocks: (Array.isArray(d.blocks) ? d.blocks : []).filter((b) => keep.has(floorOf(b))) }));
  const stairs = (Array.isArray(src.stairs) ? src.stairs : []).filter((st) => isObject(st.floors) && Object.keys(st.floors).every((f) => keep.has(f)));
  const floorIds = (Array.isArray(src.floors) ? src.floors : [DEFAULT_FLOOR]).filter((f) => keep.has(f));
  return { ...src, floors: floorIds, multiFloor: floorIds.length > 1, zones: kept, doors, stairs };
}
