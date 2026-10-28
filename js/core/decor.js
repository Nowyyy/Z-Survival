// Décor extérieur : placement déterministe depuis la graine de decor.json (le même à chaque partie), couloirs d'approche devant les
// fenêtres et vérifications. Voitures et arbres sont des obstacles pleins pour les zombies ; buissons, lampadaires et barrières
// sont décoratifs. Rien ici ne crée d'objet de rendu.
import { rectGap, validRects } from './collision.js';
import { createRng, nextFloat } from './rng.js';
import { polygonRects } from './shape.js';
import { isNum, num } from './vec.js';

const round = (n) => Math.round(n);
const side = (w) => w?.side;

// Une bande de largeur `width` devant chaque fenêtre, de la face extérieure du mur au bord du monde. world : world.json.
// Renvoie [{ id (fenêtre), x, y, w, h }].
export function approachCorridors(world, width = 160) {
  if (Array.isArray(world?.walls) && Array.isArray(world?.contour)) return segmentedCorridors(world, width);
  const room = world?.room ?? {};
  const half = Math.max(0, num(width, 160)) / 2;
  const outer = num(room.wall) - num(world?.wallThickness, 40); // face extérieure du mur, relative au bord de la salle
  const size = num(world?.size?.width);
  const sizeY = num(world?.size?.height);
  const rects = [];
  for (const w of Array.isArray(world?.windows) ? world.windows : []) {
    if (!w || !isNum(w.x) || !isNum(w.y)) continue;
    if (side(w) === 'nord') rects.push({ id: w.id, x: w.x - half, y: 0, w: half * 2, h: Math.max(0, room.y + outer) });
    else if (side(w) === 'sud') rects.push({ id: w.id, x: w.x - half, y: room.y + room.height - outer, w: half * 2, h: Math.max(0, sizeY - (room.y + room.height - outer)) });
    else if (side(w) === 'ouest') rects.push({ id: w.id, x: 0, y: w.y - half, w: Math.max(0, room.x + outer), h: half * 2 });
    else if (side(w) === 'est') rects.push({ id: w.id, x: room.x + room.width - outer, y: w.y - half, w: Math.max(0, size - (room.x + room.width - outer)), h: half * 2 });
  }
  return rects.filter((r) => r.w > 0 && r.h > 0);
}

// Carte à segments de mur (lot 3b) : la bande part de la face extérieure du mur (centre de la fenêtre + demi-épaisseur) jusqu'au bord du monde.
function segmentedCorridors(world, width) {
  const half = Math.max(0, num(width, 160)) / 2;
  const face = num(world?.wallThickness, 40) / 2;
  const W = num(world?.size?.width);
  const H = num(world?.size?.height);
  const rects = [];
  for (const w of Array.isArray(world?.windows) ? world.windows : []) {
    if (!w || !isNum(w.x) || !isNum(w.y)) continue;
    if (side(w) === 'nord') rects.push({ id: w.id, x: w.x - half, y: 0, w: half * 2, h: w.y - face });
    else if (side(w) === 'sud') rects.push({ id: w.id, x: w.x - half, y: w.y + face, w: half * 2, h: H - (w.y + face) });
    else if (side(w) === 'ouest') rects.push({ id: w.id, x: 0, y: w.y - half, w: w.x - face, h: half * 2 });
    else if (side(w) === 'est') rects.push({ id: w.id, x: w.x + face, y: w.y - half, w: W - (w.x + face), h: half * 2 });
  }
  return rects.filter((r) => r.w > 0 && r.h > 0);
}

// Emprise du bâtiment : la salle, ou les rectangles du contour d'une carte à segments.
const footprint = (world) => (Array.isArray(world?.contour) ? polygonRects(world.contour) : [roomRect(world)]);
const gapToFootprint = (r, world) => Math.min(...footprint(world).map((f) => rectGap(r, f)));

const roomRect = (world) => ({ x: num(world?.room?.x), y: num(world?.room?.y), w: num(world?.room?.width), h: num(world?.room?.height) });

// Génère le décor. cfg : decor.json ; world : world.json. Renvoie
// { ground, cars, trees, bushes, lamps, fences, solids, spawnPoints, corridors }. Mêmes entrées, même décor.
export function generateDecor(cfg, world) {
  const s = cfg?.scatter ?? {};
  const W = num(world?.size?.width);
  const H = num(world?.size?.height);
  const corridors = approachCorridors(world, num(cfg?.approachWidth, 160));
  const ground = validRects(cfg?.ground).map((g) => ({ ...g }));
  const spawnPoints = (Array.isArray(cfg?.spawnPoints) ? cfg.spawnPoints : []).filter((p) => p && isNum(p.x) && isNum(p.y)).map((p) => ({ ...p }));
  let rng = createRng(isNum(cfg?.seed) ? cfg.seed : 1);
  const rand = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const between = (a, b) => a + rand() * (b - a);

  const solids = [];
  const decorative = [];
  const spacing = num(s.espaceSolides, 80);
  const fromRoom = num(s.distanceSalle, 120);
  const fromSpawn = num(s.distanceApparition, 70);
  const onGround = (r) => ground.some((g) => rectGap(r, g) === 0);
  const nearCorridor = (r, m) => corridors.some((c) => rectGap(r, c) < m);
  const nearSpawn = (r) => spawnPoints.some((p) => rectGap(r, { x: p.x, y: p.y, w: 1, h: 1 }) < fromSpawn);
  const inside = (r, m) => r.x >= m && r.y >= m && r.x + r.w <= W - m && r.y + r.h <= H - m;

  const place = (count, make, accept) => {
    const out = [];
    for (let attempt = 0; out.length < count && attempt < count * 80; attempt += 1) {
      const item = make(out.length + 1);
      if (accept(item, out)) out.push(item);
    }
    return out;
  };
  const solidOk = (r, out) => inside(r, 40) && gapToFootprint(r, world) >= fromRoom && !nearCorridor(r, 20) && !nearSpawn(r)
    && ![...solids, ...out].some((o) => rectGap(r, o) < spacing);

  // Voitures abandonnées sur la route (la première bande de sol de type « route »).
  const road = ground.find((g) => g.kind === 'route');
  const cars = road
    ? place(num(s.voitures?.count), (n) => {
      const w = num(s.voitures?.long, 92);
      const h = num(s.voitures?.court, 46);
      return { id: `voiture-${n}`, kind: 'voiture', x: round(between(road.x + 40, road.x + road.w - 40 - w)), y: round(between(road.y + 10, road.y + road.h - 10 - h)), w, h, hauteur: num(s.voitures?.hauteur, 55) };
    }, solidOk)
    : [];
  solids.push(...cars);

  const trunk = num(s.arbres?.tronc, 32);
  const trees = place(num(s.arbres?.count), (n) => ({
    id: `arbre-${n}`, kind: 'arbre', x: round(between(40, W - 40 - trunk)), y: round(between(40, H - 40 - trunk)), w: trunk, h: trunk,
    hauteur: num(s.arbres?.hauteur, 50), couronne: num(s.arbres?.couronne, 46),
  }), (r, out) => solidOk(r, out) && !onGround(r));
  solids.push(...trees);

  const decoOk = (r) => inside(r, 20) && gapToFootprint(r, world) >= 60 && !nearCorridor(r, 10);
  const bushes = place(num(s.buissons?.count), (n) => {
    const radius = round(between(num(s.buissons?.rayonMin, 12), num(s.buissons?.rayonMax, 22)));
    return { id: `buisson-${n}`, kind: 'buisson', x: round(between(30, W - 30)), y: round(between(30, H - 30)), r: radius, hauteur: num(s.buissons?.hauteur, 18) };
  }, (b) => decoOk({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }) && !onGround({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }));
  decorative.push(...bushes);

  // Lampadaires espacés le long du trottoir.
  const walk = ground.find((g) => g.kind === 'trottoir');
  const lampCount = num(s.lampadaires?.count);
  const lamps = [];
  if (walk && lampCount > 0) {
    const gap = (walk.w - 200) / lampCount;
    for (let i = 0; i < lampCount; i += 1) {
      const x = round(100 + gap * (i + 0.5) + between(-20, 20));
      const y = round(walk.y + walk.h / 2);
      if (!nearCorridor({ x: x - 6, y: y - 6, w: 12, h: 12 }, 20)) lamps.push({ id: `lampadaire-${lamps.length + 1}`, kind: 'lampadaire', x, y, hauteur: num(s.lampadaires?.hauteur, 90) });
    }
  }

  const fenceLong = num(s.barrieres?.long, 120);
  const fenceThick = num(s.barrieres?.epaisseur, 8);
  const fences = place(num(s.barrieres?.count), (n) => {
    const horizontal = rand() < 0.5;
    return { id: `barriere-${n}`, kind: 'barriere', x: round(between(60, W - 60 - fenceLong)), y: round(between(60, H - 60 - fenceLong)), w: horizontal ? fenceLong : fenceThick, h: horizontal ? fenceThick : fenceLong, hauteur: num(s.barrieres?.hauteur, 26) };
  }, (f) => decoOk(f) && !onGround(f));

  return { ground, cars, trees, bushes, lamps, fences, solids, spawnPoints, corridors };
}

// Problèmes de cohérence d'un décor (liste de textes, vide si tout va bien) : tout reste dans le monde, aucun obstacle plein ni
// décor haut dans un couloir d'approche, aucun obstacle plein sur un point d'apparition ni dans la salle.
export function decorProblems(decor, world) {
  const out = [];
  const W = num(world?.size?.width);
  const H = num(world?.size?.height);
  const corridors = Array.isArray(decor?.corridors) ? decor.corridors : [];
  const tall = [...(decor?.solids ?? []), ...(decor?.fences ?? [])];
  for (const o of tall) {
    if (!(o.x >= 0 && o.y >= 0 && o.x + o.w <= W && o.y + o.h <= H)) out.push(`${o.id} sort du monde`);
    for (const c of corridors) if (rectGap(o, c) === 0) out.push(`${o.id} entre dans le couloir de ${c.id}`);
    if (gapToFootprint(o, world) === 0) out.push(`${o.id} entre dans la salle`);
    for (const p of decor?.spawnPoints ?? []) if (rectGap(o, { x: p.x, y: p.y, w: 1, h: 1 }) === 0) out.push(`${o.id} recouvre ${p.id}`);
  }
  for (const b of [...(decor?.bushes ?? []), ...(decor?.lamps ?? [])]) {
    const r = isNum(b.r) ? { x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r } : { x: b.x - 6, y: b.y - 6, w: 12, h: 12 };
    for (const c of corridors) if (rectGap(r, c) === 0) out.push(`${b.id} entre dans le couloir de ${c.id}`);
  }
  return out;
}
