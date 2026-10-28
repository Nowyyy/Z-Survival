// Disposition 3D des planches de fenêtre (lot 3a) : poses des planches clouées, coins en coordonnées du monde, distance à la face
// intérieure du mur, débris à plat au sol et leur durée de vie. Pur : les paramètres (data/game/windows.json, clé planks3d, plus les hauteurs
// d'allège et de linteau de render.json) et la graine arrivent en argument ; aucun argument n'est modifié, aucune exception, aucun hasard hors
// de la graine, aucune horloge (le temps passe en `dt`, borné à 0,05 s).
// Repère : logique (x, y) ; scène (x, hauteur, y). `geom` vient de windows.js (center, normal sortante du mur, tangent, width) avec `inner` :
// distance du centre de l'ouverture à la face intérieure du mur (données du monde). La salle est du côté de -normal.
// Une planche est une poutre de `size` = [longueur, hauteur, épaisseur]. Son `center` est le centre de la boîte avant inclinaison ; l'inclinaison
// `roll` tourne autour de l'axe normal au mur, avec le PIVOT AU BAS de la planche (milieu du bord inférieur) : jamais autour du centre.
import { clampDt, isNum } from './vec.js';

// Valeurs de repli si windows.json (planks3d) manque ou est invalide ; les vraies valeurs vivent dans les données.
export const FALLBACK = {
  count: 4, thickness: 14, height: 6, visible: 16, overhang: 16, wallGap: 2, rollMax: 0.12, spacing: 1.5, sill: 16, lintel: 44,
  frameWidth: 5, frameGap: 0.4, voidGap: 0.2, pip: 16, pipStep: 18, pipInner: 8, pipLift: 0.3,
  debrisLength: 62, debrisWidth: 12, debrisThickness: 6, debrisMax: 12, debrisLife: 25, debrisFade: 1, debrisYaw: 0.61,
  debrisNear: 40, debrisFar: 110, debrisSide: 40, debrisApart: 30, debrisMargin: 6, debrisTries: 12,
};

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const pos = (n, fallback) => (isNum(n) && n > 0 ? n : fallback);
const nonNeg = (n, fallback) => (isNum(n) && n >= 0 ? n : fallback);
const whole = (n, fallback, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(pos(n, fallback))));

// Paramètres nettoyés d'après un objet plat (clés de FALLBACK) ; toute valeur absente ou invalide prend son repli.
export function cleanParams(raw) {
  const p = isObject(raw) ? raw : {};
  const f = FALLBACK;
  const sill = isNum(p.sill) ? p.sill : f.sill;
  return {
    count: whole(p.count, f.count, 1, 8),
    thickness: pos(p.thickness, f.thickness),
    height: pos(p.height, f.height),
    visible: pos(p.visible, f.visible),
    overhang: nonNeg(p.overhang, f.overhang),
    wallGap: nonNeg(p.wallGap, f.wallGap),
    rollMax: Math.min(0.5, nonNeg(p.rollMax, f.rollMax)),
    spacing: isNum(p.spacing) && p.spacing >= 1 ? p.spacing : f.spacing,
    sill,
    lintel: isNum(p.lintel) && p.lintel > sill ? p.lintel : Math.max(f.lintel, sill + 1),
    frameWidth: pos(p.frameWidth, f.frameWidth),
    frameGap: nonNeg(p.frameGap, f.frameGap),
    voidGap: nonNeg(p.voidGap, f.voidGap),
    pip: pos(p.pip, f.pip),
    pipStep: pos(p.pipStep, f.pipStep),
    pipInner: pos(p.pipInner, f.pipInner),
    pipLift: nonNeg(p.pipLift, f.pipLift),
    debrisLength: pos(p.debrisLength, f.debrisLength),
    debrisWidth: pos(p.debrisWidth, f.debrisWidth),
    debrisThickness: pos(p.debrisThickness, f.debrisThickness),
    debrisMax: whole(p.debrisMax, f.debrisMax, 1, 64),
    debrisLife: pos(p.debrisLife, f.debrisLife),
    debrisFade: nonNeg(p.debrisFade, f.debrisFade),
    debrisYaw: Math.min(Math.PI / 2, nonNeg(p.debrisYaw, f.debrisYaw)),
    debrisNear: pos(p.debrisNear, f.debrisNear),
    debrisFar: pos(p.debrisFar, f.debrisFar),
    debrisSide: nonNeg(p.debrisSide, f.debrisSide),
    debrisApart: pos(p.debrisApart, f.debrisApart),
    debrisMargin: nonNeg(p.debrisMargin, f.debrisMargin),
    debrisTries: whole(p.debrisTries, f.debrisTries, 1, 64),
  };
}

// Paramètres d'après les fichiers de données : windows.json (planks = nombre de planches, planks3d = géométrie) et render.json (sillHeight, lintelBottom).
export function plankSettings(windowsCfg, render) {
  const w = isObject(windowsCfg) ? windowsCfg : {};
  const r = isObject(render) ? render : {};
  return cleanParams({ ...(isObject(w.planks3d) ? w.planks3d : {}), count: w.planks, sill: r.sillHeight, lintel: r.lintelBottom });
}

// Géométrie nettoyée d'une fenêtre ou null : { id, center, normal, tangent, width, inner }.
function cleanGeom(geom) {
  if (!isObject(geom) || !isObject(geom.center) || !isObject(geom.normal) || !isObject(geom.tangent)) return null;
  if (![geom.center.x, geom.center.y, geom.normal.x, geom.normal.y, geom.tangent.x, geom.tangent.y].every(isNum)) return null;
  return {
    id: typeof geom.id === 'string' ? geom.id : '',
    center: { x: geom.center.x, y: geom.center.y },
    normal: { x: geom.normal.x, y: geom.normal.y },
    tangent: { x: geom.tangent.x, y: geom.tangent.y },
    width: pos(geom.width, 140),
    inner: isNum(geom.inner) ? geom.inner : 12,
  };
}

// Distance du centre de l'ouverture d'une fenêtre (windows.js) à la face intérieure du mur (room : salle de world.json, avec wall) ; 12 si l'entrée est invalide.
export function faceDistance(room, geom) {
  if (!isObject(room) || !isObject(geom) || !isObject(geom.center) || ![room.x, room.y, room.width, room.height, room.wall, geom.center.x, geom.center.y].every(isNum)) return 12;
  const { x, y } = geom.center;
  if (geom.side === 'nord') return room.y + room.wall - y;
  if (geom.side === 'sud') return y - (room.y + room.height - room.wall);
  if (geom.side === 'ouest') return room.x + room.wall - x;
  if (geom.side === 'est') return x - (room.x + room.width - room.wall);
  return 12;
}

// Triangles d'un maillage de fenêtre : poutres (face avant et dessus, 4 chacune), cadre (4 bandes, 8), trou sombre (2), pastilles (carré de cadre
// et carré intérieur, 4 chacune). 42 pour 4 planches.
export const windowTriangles = (count) => {
  const n = isNum(count) && count >= 1 ? Math.floor(count) : FALLBACK.count;
  return n * 4 + 8 + 2 + n * 4;
};

// Nombre pseudo-aléatoire dans [0, 1[ à partir d'une graine, d'un texte et de trois entiers (aucun état).
function unit(seed, text, a, b, c = 0) {
  let h = Math.imul((isNum(seed) ? Math.trunc(seed) : 0) | 0, 374761393) ^ 0x2545f491;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = (h + Math.imul(a | 0, 668265263) + Math.imul(b | 0, 2246822519) + Math.imul(c | 0, 3266489917)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const signed = (u) => u * 2 - 1;

// Poses des planches 0 à count-1 d'une fenêtre : [{ center: [x, y, z], size: [longueur, hauteur, épaisseur], roll }] ; [] si la géométrie est invalide.
// Disposition : une pile de planches de bas en haut entre l'allège (+ 0,5) et le linteau + `visible`, centrée sur l'ouverture. Les inclinaisons d'une
// même fenêtre se ressemblent (même sens, petites différences) et chaque intervalle tient compte de la pente et du décalage des deux planches voisines :
// elles ne se croisent jamais (écart vertical d'au moins `spacing`). L'amplitude est réduite au besoin (jamais au-delà de rollMax) pour que toute la pile
// tienne : aucun coin ne passe sous l'allège ni au-dessus de la limite, et la planche déborde de l'ouverture de `overhang` au plus de chaque côté.
export function plankPoses(geom, params, seed) {
  const g = cleanGeom(geom);
  if (g === null) return [];
  const p = cleanParams(params);
  const n = p.count;
  const yMin = p.sill + 0.5;
  const yMax = p.lintel + p.visible;
  const reach = g.width / 2 + p.overhang;
  // Marge latérale : une planche inclinée dépasse de sa demi-longueur d'au plus height·sin(rollMax).
  const margin = p.height * Math.sin(p.rollMax);
  const oMax = Math.max(0, p.overhang - margin);
  const items = [];
  for (let i = 0; i < n; i += 1) {
    const o = oMax * (0.6 + 0.4 * unit(seed, g.id, i, 1));
    items.push({ half: g.width / 2 + o, shift: signed(unit(seed, g.id, i, 2)) * (oMax - o), mix: signed(unit(seed, g.id, i, 3)) });
  }
  const base = signed(unit(seed, g.id, 99, 4));
  // Pile pour une amplitude k·rollMax : pivots (milieu du bord inférieur) de bas en haut, plus les ordonnées extrêmes des coins.
  const build = (k) => {
    const rolls = items.map((it) => k * p.rollMax * (0.8 * base + 0.2 * it.mix));
    const pivots = [];
    let y = yMin + items[0].half * Math.sin(Math.abs(rolls[0]));
    for (let i = 0; i < n; i += 1) {
      if (i > 0) {
        const t0 = Math.tan(rolls[i - 1]);
        const t1 = Math.tan(rolls[i]);
        y += p.height / Math.cos(rolls[i - 1]) + p.spacing + reach * Math.abs(t1 - t0) + Math.abs(items[i].shift * t1 - items[i - 1].shift * t0);
      }
      pivots.push(y);
    }
    let bottom = Infinity;
    let top = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const s = items[i].half * Math.sin(Math.abs(rolls[i]));
      bottom = Math.min(bottom, pivots[i] - s);
      top = Math.max(top, pivots[i] + s + p.height * Math.cos(rolls[i]));
    }
    return { rolls, pivots, bottom, top };
  };
  let found = null;
  for (let step = 10; step >= 0 && found === null; step -= 1) {
    const attempt = build(step / 10);
    if (attempt.top - attempt.bottom <= yMax - yMin) found = attempt;
  }
  found ??= build(0); // paramètres extrêmes : planches à plat, ramenées vers le bas (jamais sous l'allège)
  let lift = (p.sill + p.lintel) / 2 - (found.bottom + found.top) / 2; // pile centrée sur l'ouverture
  lift = Math.min(lift, yMax - found.top);
  lift = Math.max(lift, yMin - found.bottom);
  const away = g.inner + p.wallGap + p.thickness / 2; // du centre de l'ouverture au centre de la boîte, vers la salle
  return items.map((it, i) => ({
    center: [
      g.center.x + g.tangent.x * it.shift - g.normal.x * away,
      found.pivots[i] + lift + p.height / 2,
      g.center.y + g.tangent.y * it.shift - g.normal.y * away,
    ],
    size: [2 * it.half, p.height, p.thickness],
    roll: found.rolls[i],
  }));
}

// Les 8 coins d'une planche en coordonnées du monde ([x, y, z] chacun, y = hauteur) ; [] si la pose ou la géométrie est invalide.
// La boîte est d'abord posée sans inclinaison (centre `center`), puis tournée de `roll` autour de l'axe normal au mur passant par le milieu de son bord inférieur.
export function plankCorners(pose, geom) {
  const g = cleanGeom(geom);
  const c = pose?.center;
  const s = pose?.size;
  if (g === null || !Array.isArray(c) || !Array.isArray(s) || c.length < 3 || s.length < 3 || !c.every(isNum) || !s.every(isNum) || !isNum(pose.roll)) return [];
  const cos = Math.cos(pose.roll);
  const sin = Math.sin(pose.roll);
  const out = [];
  for (const a of [-s[0] / 2, s[0] / 2]) {
    for (const b of [0, s[1]]) {
      for (const d of [-s[2] / 2, s[2] / 2]) {
        const along = a * cos - b * sin; // le long du mur (tangente)
        const up = a * sin + b * cos; // vers le haut
        out.push([
          c[0] + g.tangent.x * along - g.normal.x * d,
          c[1] - s[1] / 2 + up,
          c[2] + g.tangent.y * along - g.normal.y * d,
        ]);
      }
    }
  }
  return out;
}

// Distance signée d'un coin [x, y, z] à la face intérieure du mur de la fenêtre : positive côté salle, négative dans le mur ; NaN si l'entrée est invalide.
export function wallGap(corner, geom) {
  const g = cleanGeom(geom);
  if (g === null || !Array.isArray(corner) || corner.length < 3 || !isNum(corner[0]) || !isNum(corner[2])) return Number.NaN;
  return -((corner[0] - g.center.x) * g.normal.x + (corner[2] - g.center.y) * g.normal.y) - g.inner;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Débris : planches arrachées, à plat sur le sol
// ---------------------------------------------------------------------------------------------------------------------------------

// Quatre coins du pied d'un débris { x, z, yaw, size }.
function footprint(d) {
  const ux = Math.cos(d.yaw);
  const uz = Math.sin(d.yaw);
  const hl = d.size[0] / 2;
  const hw = d.size[2] / 2;
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([a, b]) => [d.x + ux * a - uz * b, d.z + uz * a + ux * b]);
}

// Vrai si le rectangle orienté du débris (élargi de `grow`) touche le rectangle droit { x, y, w, h } (axes séparateurs : x, z et les deux axes du débris).
function touchesRect(d, rect, grow) {
  const x0 = rect.x - grow;
  const x1 = rect.x + rect.w + grow;
  const z0 = rect.y - grow;
  const z1 = rect.y + rect.h + grow;
  const pts = footprint(d);
  if (Math.max(...pts.map((q) => q[0])) < x0 || Math.min(...pts.map((q) => q[0])) > x1) return false;
  if (Math.max(...pts.map((q) => q[1])) < z0 || Math.min(...pts.map((q) => q[1])) > z1) return false;
  const rc = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (const axis of [[Math.cos(d.yaw), Math.sin(d.yaw)], [-Math.sin(d.yaw), Math.cos(d.yaw)]]) {
    const a = pts.map((q) => q[0] * axis[0] + q[1] * axis[1]);
    const b = rc.map((q) => q[0] * axis[0] + q[1] * axis[1]);
    if (Math.max(...a) < Math.min(...b) || Math.min(...a) > Math.max(...b)) return false;
  }
  return true;
}

// Vrai si deux rectangles orientés (débris) se touchent (4 axes séparateurs).
function touchesDebris(a, b, grow) {
  const grown = (d) => ({ ...d, size: [d.size[0] + 2 * grow, d.size[1], d.size[2] + 2 * grow] });
  const pa = footprint(grown(a));
  const pb = footprint(grown(b));
  for (const yaw of [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2]) {
    const ax = Math.cos(yaw);
    const az = Math.sin(yaw);
    const sa = pa.map((q) => q[0] * ax + q[1] * az);
    const sb = pb.map((q) => q[0] * ax + q[1] * az);
    if (Math.max(...sa) < Math.min(...sb) || Math.min(...sa) > Math.max(...sb)) return false;
  }
  return true;
}

// Pose du débris numéro k d'une fenêtre : { x, y, z, yaw, size: [longueur, épaisseur, largeur] } ou null (aucune place trouvée).
// layout : { params (objet plat, voir cleanParams), obstacles: [{ x, y, w, h }] (meubles), bounds: { minX, minY, maxX, maxY } (limites de la salle),
// others: [{ x, z, yaw?, size? }] (débris déjà posés) }. La planche gît à plat (y = demi-épaisseur + 0,3), tournée autour de la verticale seulement
// (± debrisYaw par rapport au mur), à debrisNear..debrisFar de la face intérieure et à ± (largeur / 2 + debrisSide) le long du mur ; jamais dans
// un obstacle (élargi de debrisMargin), jamais à moins de debrisApart d'un autre débris, jamais hors de la salle ; debrisTries tentatives.
export function debrisPose(geom, k, seed, layout) {
  const g = cleanGeom(geom);
  if (g === null) return null;
  const p = cleanParams(layout?.params);
  const b = layout?.bounds;
  const obstacles = Array.isArray(layout?.obstacles) ? layout.obstacles.filter((o) => isObject(o) && [o.x, o.y, o.w, o.h].every(isNum)) : [];
  const others = Array.isArray(layout?.others) ? layout.others.filter((o) => isObject(o) && isNum(o.x) && isNum(o.z)) : [];
  const index = isNum(k) ? Math.trunc(k) : 0;
  const size = [p.debrisLength, p.debrisThickness, p.debrisWidth];
  const axis = Math.atan2(g.tangent.y, g.tangent.x);
  for (let attempt = 0; attempt < p.debrisTries; attempt += 1) {
    const depth = p.debrisNear + unit(seed, g.id, index, 10 + attempt, 1) * Math.max(0, p.debrisFar - p.debrisNear);
    const along = signed(unit(seed, g.id, index, 10 + attempt, 2)) * (g.width / 2 + p.debrisSide);
    const yaw = axis + signed(unit(seed, g.id, index, 10 + attempt, 3)) * p.debrisYaw;
    const d = {
      x: g.center.x + g.tangent.x * along - g.normal.x * (g.inner + depth),
      y: p.debrisThickness / 2 + 0.3,
      z: g.center.y + g.tangent.y * along - g.normal.y * (g.inner + depth),
      yaw,
      size,
    };
    if (isObject(b) && [b.minX, b.minY, b.maxX, b.maxY].every(isNum) && footprint(d).some((q) => q[0] < b.minX || q[0] > b.maxX || q[1] < b.minY || q[1] > b.maxY)) continue;
    if (obstacles.some((o) => touchesRect(d, o, p.debrisMargin))) continue;
    if (others.some((o) => Math.hypot(o.x - d.x, o.z - d.z) < p.debrisApart || (Array.isArray(o.size) && isNum(o.yaw) && touchesDebris(d, o, 0.5)))) continue;
    return d;
  }
  return null;
}

// État des débris : liste dans l'ordre d'apparition (le plus ancien d'abord) ; { items: [{ id, window, x, y, z, yaw, size, age }], serial }.
export const createDebris = () => ({ items: [], serial: 0 });

const itemsOf = (state) => (Array.isArray(state?.items) ? state.items : []);
const serialOf = (state) => (isNum(state?.serial) && state.serial >= 0 ? Math.trunc(state.serial) : 0);

// Ajoute le débris suivant d'une fenêtre (rien si aucune place) ; s'il y en a déjà debrisMax, le plus ancien disparaît. Renvoie un nouvel état.
// layout : comme debrisPose, sans `others` (calculé d'après l'état).
export function addDebris(state, geom, seed, layout) {
  const items = itemsOf(state);
  const serial = serialOf(state);
  const p = cleanParams(layout?.params);
  const g = cleanGeom(geom);
  const next = { items: items.map((d) => ({ ...d })), serial: serial + 1 };
  if (g === null) return next;
  const room = items.length >= p.debrisMax ? items.slice(1) : items; // la place du plus ancien se libère avant le tirage
  const pose = debrisPose(g, serial, seed, { ...layout, params: p, others: room.map((d) => ({ x: d.x, z: d.z, yaw: d.yaw, size: d.size })) });
  if (pose === null) return next;
  const kept = items.length >= p.debrisMax ? next.items.slice(1) : next.items;
  return { items: [...kept, { id: serial, window: g.id, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, size: [...pose.size], age: 0 }], serial: serial + 1 };
}

// Retire les n débris les plus récents d'une fenêtre (une planche réparée en consomme un). Renvoie un nouvel état.
export function removeDebris(state, windowId, n) {
  const items = itemsOf(state).map((d) => ({ ...d }));
  let left = isNum(n) && n > 0 ? Math.floor(n) : 0;
  for (let i = items.length - 1; i >= 0 && left > 0; i -= 1) {
    if (items[i].window === windowId) {
      items.splice(i, 1);
      left -= 1;
    }
  }
  return { items, serial: serialOf(state) };
}

// Fait vieillir les débris de dt (borné à 0,05 s) ; ceux qui ont atteint debrisLife secondes de temps de jeu disparaissent. Renvoie un nouvel état.
export function stepDebris(state, dt, params) {
  const p = cleanParams(params);
  const step = clampDt(dt);
  return { items: itemsOf(state).filter((d) => isNum(d?.age)).map((d) => ({ ...d, age: d.age + step })).filter((d) => d.age < p.debrisLife), serial: serialOf(state) };
}

// Échelle d'affichage d'un débris : 1, puis de 1 à 0 pendant la dernière seconde (debrisFade) ; toujours 1 sous mouvement réduit (disparition immédiate).
export function debrisScale(item, params, reduced = false) {
  const p = cleanParams(params);
  const age = isNum(item?.age) ? item.age : 0;
  if (reduced === true || p.debrisFade <= 0) return age >= p.debrisLife ? 0 : 1;
  return Math.max(0, Math.min(1, (p.debrisLife - age) / p.debrisFade));
}
