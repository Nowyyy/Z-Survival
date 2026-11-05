// Lot 5d — Générateur de cas des fonctions de js/core/collision.js (graine fixe, js/core/rng.js) : segments et rectangles tirés au hasard,
// cas limites (segment nul, coin, bord, parallèle à un bord, départ dedans, à l'envers, tangent, rectangles nuls, très grands ou très petits,
// négatifs, -0, NaN, Infinity, entrées mal formées), vraies cartes (world.json et etage.world.json : meubles, murs, portes, décor) et cercles du
// rayon des personnages. Chaque cas est un tableau d'arguments ; les mêmes objets sont passés à l'oracle et au code réécrit (l'obstacle renvoyé
// est comparé par identité). Aucun Math.random.
import { readFileSync } from 'node:fs';
import { createRng, nextFloat } from '../../../js/core/rng.js';
import { layouts } from './etage.js';

const enemies = JSON.parse(readFileSync('data/game/enemies.json', 'utf8'));
const player = JSON.parse(readFileSync('data/game/player.json', 'utf8'));

// Tirage à graine : fonction qui renvoie un flottant dans [0, 1) à chaque appel.
export function stream(seed) {
  let r = createRng(seed);
  return () => {
    const n = nextFloat(r);
    r = n.rng;
    return n.value;
  };
}

// Valeurs particulières (l'ancien code les accepte toutes sans exception : vérifié par les tests, qui comparent aussi les exceptions).
export const SPECIAL = [0, -0, 1, -1, 0.5, -0.5, 1e-9, -1e-9, 1e-12, 5e-324, 1e9, -1e9, 1e300, -1e300, Number.MAX_VALUE, NaN, Infinity, -Infinity];
// Rayons : personnages (joueur, zombie et ses multiplicateurs), zéro, très petits et très grands.
export const RADII = [...new Set([player.radius, enemies.zombie.radius, ...Object.values(enemies.variants ?? {}).map((v) => enemies.zombie.radius * (v.radiusMul ?? 1)), 0, 1e-9, 0.5, 5, 60, 400])].filter((r) => Number.isFinite(r));

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const around = (rnd, lo, hi) => lo + rnd() * (hi - lo);
// Nombre : le plus souvent ordinaire, parfois entier, parfois particulier.
function value(rnd, lo, hi) {
  const u = rnd();
  if (u < 0.04) return pick(rnd, SPECIAL);
  if (u < 0.3) return Math.round(around(rnd, lo, hi));
  return around(rnd, lo, hi);
}

// Rectangle : ordinaire, nul, négatif, minuscule, immense, ou mal formé (null, champs absents, textes).
export function randomRect(rnd) {
  const u = rnd();
  if (u < 0.03) return pick(rnd, [null, undefined, {}, { x: 1, y: 2 }, { x: '1', y: 2, w: 3, h: 4 }, { x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 5, h: -1 }, [], 7]);
  if (u < 0.08) return { x: value(rnd, -100, 100), y: value(rnd, -100, 100), w: pick(rnd, SPECIAL), h: pick(rnd, SPECIAL) };
  if (u < 0.12) return { x: around(rnd, -10, 10), y: around(rnd, -10, 10), w: around(rnd, 0, 1e-6), h: around(rnd, 0, 1e-6) };
  if (u < 0.15) return { x: -1e6 * rnd(), y: -1e6 * rnd(), w: 2e6 * rnd(), h: 2e6 * rnd() };
  const r = { x: value(rnd, -500, 3000), y: value(rnd, -500, 3000), w: value(rnd, 0, 400), h: value(rnd, 0, 400) };
  if (rnd() < 0.2) r.id = `r${Math.floor(rnd() * 1000)}`;
  if (rnd() < 0.1) r.kind = 'meuble';
  return r;
}

// Points caractéristiques d'un rectangle valide : coins, milieux des bords, centre, points juste dedans et juste dehors, prolongements des bords.
export function keyPoints(r) {
  const { x, y, w, h } = r;
  const e = 1e-9;
  return [
    [x, y], [x + w, y], [x, y + h], [x + w, y + h],
    [x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2], [x + w / 2, y + h / 2],
    [x + e, y + e], [x - e, y - e], [x + w + e, y + h / 2], [x - 50, y], [x + w + 50, y], [x, y - 50], [x, y + h + 50],
    [x - 50, y - 50], [x + w + 50, y + h + 50], [x - 50, y + h / 2], [x + w + 50, y + h / 2], [x - 1, y - 1], [x + w + 1, y - 1],
  ];
}

const realLists = () => {
  const out = [];
  for (const f of layouts.floors) {
    const l = layouts[f];
    for (const k of ['playerObstacles', 'zombieObstacles', 'furniture', 'walls', 'gaps']) if (Array.isArray(l[k]) && l[k].length) out.push(l[k]);
    if (Array.isArray(l.decor?.solids) && l.decor.solids.length) out.push(l.decor.solids);
    const doors = (layouts.doors ?? []).flatMap((d) => d.blocks?.[f] ?? []).map((b) => b.rect);
    if (doors.length) out.push(doors);
  }
  return out;
};
// Listes d'obstacles des vraies cartes (rez-de-chaussée et étage) : meubles, murs, ouvertures, décor, portes fermées.
export const REAL_LISTS = realLists();
export const REAL_SIZE = { width: layouts.rdc.size.width, height: layouts.rdc.size.height };

// Liste d'obstacles tirée : rectangles au hasard, doublons (égalités : le premier gagne), mal formés, ou une vraie carte.
export function randomList(rnd) {
  const u = rnd();
  if (u < 0.03) return pick(rnd, [null, undefined, 'x', {}, [], [null, undefined]]);
  if (u < 0.35) return pick(rnd, REAL_LISTS);
  const n = Math.floor(rnd() * 12);
  const list = [];
  for (let i = 0; i < n; i += 1) list.push(randomRect(rnd));
  if (n > 1 && rnd() < 0.3) list.push(list[Math.floor(rnd() * n)]); // même objet deux fois
  if (n > 1 && rnd() < 0.3) list.push({ ...list[0] }); // copie : même t, autre objet
  return list;
}

// Segment dans le voisinage d'une liste (vraie carte : pas de balle, laser 300, portée 700) ou au hasard.
function segmentNear(rnd, list) {
  const valid = Array.isArray(list) ? list.filter((r) => r && Number.isFinite(r.x) && Number.isFinite(r.w)) : [];
  if (valid.length && rnd() < 0.7) {
    const r = pick(rnd, valid);
    const pts = Number.isFinite(r.y) && Number.isFinite(r.h) ? keyPoints(r) : [[r.x, 0]];
    const a = pick(rnd, pts);
    const u = rnd();
    if (u < 0.4) return [...a, ...pick(rnd, pts)];
    const len = pick(rnd, [0, 1e-9, 2.5, 30, 300, 700, around(rnd, 0, 1000)]);
    const ang = rnd() < 0.3 ? (Math.PI / 2) * Math.floor(rnd() * 4) : around(rnd, -Math.PI, Math.PI);
    return [a[0], a[1], a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
  }
  return [value(rnd, -500, 3000), value(rnd, -500, 3000), value(rnd, -500, 3000), value(rnd, -500, 3000)];
}

// --- Cas par fonction ------------------------------------------------------------------------------------------------------------------
export function casSegmentRect(n = 6000, seed = 51) {
  const rnd = stream(seed);
  const out = [];
  // Cas limites systématiques : toutes les paires de points caractéristiques de rectangles fixes (dont nul et minuscule).
  for (const r of [{ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 3, w: 0.5, h: 40 }, { x: 100, y: 100, w: 1e-7, h: 1e-7 }, { x: -0, y: -0, w: 1, h: 1 }]) {
    const pts = keyPoints(r);
    for (const a of pts) for (const b of pts) out.push([a[0], a[1], b[0], b[1], r]);
  }
  for (const r of [{ x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 10, h: -0 }, null, {}, { x: NaN, y: 0, w: 1, h: 1 }]) out.push([0, 0, 5, 5, r]);
  for (const v of SPECIAL) out.push([v, 0, 5, 5, { x: 0, y: 0, w: 10, h: 10 }], [0, 0, v, v, { x: 0, y: 0, w: 10, h: 10 }]);
  while (out.length < n) {
    const r = randomRect(rnd);
    out.push([...segmentNear(rnd, [r]), r]);
  }
  return out;
}

export function casFirstOnSegment(n = 4000, seed = 52) {
  const rnd = stream(seed);
  const out = [];
  const box = { x: 0, y: 0, w: 10, h: 10 };
  out.push([-5, 5, 20, 5, [box, box]], [-5, 5, 20, 5, [box, { ...box }]], [-5, 5, 20, 5, [{ ...box, x: 3 }, box]], [0, 0, 0, 0, []], [0, 0, 1, 1, null], [0, 0, 1, 1, 'x']);
  while (out.length < n) {
    const list = randomList(rnd);
    out.push([...segmentNear(rnd, list), list]);
  }
  return out;
}

export function casClearSegment(n = 3000, seed = 53) {
  const rnd = stream(seed);
  const out = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, [{ x: 4, y: 1, w: 2, h: 2 }], 1], [null, undefined, [], undefined], [{ x: 0, y: 0 }, { x: 10, y: 0 }, null, NaN]];
  // Segments posés sur les bords et les coins du rectangle gonflé (mêmes calculs que inflateRect) : tangents, contact exact.
  while (out.length < n / 3) {
    const r = { x: around(rnd, -300, 300), y: around(rnd, -300, 300), w: around(rnd, 0.1, 200), h: around(rnd, 0.1, 200) };
    const m = pick(rnd, [...RADII, around(rnd, 0, 30)]);
    const g = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
    const pts = keyPoints(g);
    const [a, b] = [pick(rnd, pts), pick(rnd, pts)];
    out.push([{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, [r], m]);
  }
  while (out.length < n) {
    const list = randomList(rnd);
    const [x0, y0, x1, y1] = segmentNear(rnd, list);
    const margin = rnd() < 0.1 ? pick(rnd, [undefined, NaN, -5, Infinity, '3', 0]) : pick(rnd, RADII.map((r) => r + 1));
    out.push([{ x: x0, y: y0 }, { x: x1, y: y1 }, list, margin]);
  }
  return out;
}

export function casMove(n = 4000, seed = 54) {
  const rnd = stream(seed);
  const out = [];
  const box = { x: 0, y: 0, w: 100, h: 100 };
  // Départ dedans (pushOut, centre exact compris), contre un bord, dans un coin, gros pas (sous-pas), bornes.
  for (const r of RADII) {
    for (const p of keyPoints(box)) out.push([{ x: p[0], y: p[1], r }, { x: 3, y: -2 }, [box], undefined]);
    out.push([{ x: 50, y: 50, r }, { x: 0, y: 0 }, [box, { x: 40, y: 40, w: 20, h: 20 }], { minX: 0, minY: 0, maxX: 200, maxY: 200 }]);
    out.push([{ x: -r - 1, y: 50, r }, { x: 500, y: 0 }, [box], { minX: -1000, maxX: 1000 }]);
  }
  out.push([null, null, null, null], [{ x: NaN, y: 1, r: 2 }, { x: 1 }, [], {}], [{ x: 1, y: 1, r: -3 }, { x: Infinity, y: 1 }, [box], undefined]);
  while (out.length < n) {
    const list = randomList(rnd);
    const valid = Array.isArray(list) ? list.filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.w) && Number.isFinite(q.h)) : [];
    let c;
    if (valid.length && rnd() < 0.8) {
      const q = pick(rnd, valid);
      const p = pick(rnd, keyPoints(q));
      c = { x: p[0] + around(rnd, -30, 30), y: p[1] + around(rnd, -30, 30), r: pick(rnd, RADII) };
    } else c = { x: value(rnd, -500, 3000), y: value(rnd, -500, 3000), r: rnd() < 0.05 ? pick(rnd, SPECIAL) : pick(rnd, RADII) };
    const big = rnd() < 0.15;
    const d = { x: big ? value(rnd, -600, 600) : around(rnd, -12, 12), y: big ? value(rnd, -600, 600) : around(rnd, -12, 12) };
    if (rnd() < 0.05) d.x = pick(rnd, SPECIAL);
    const u = rnd();
    const bounds = u < 0.4 ? undefined : u < 0.8 ? { minX: 0, minY: 0, maxX: REAL_SIZE.width, maxY: REAL_SIZE.height } : { minX: value(rnd, -100, 100), maxY: value(rnd, 50, 3000) };
    out.push([c, d, list, bounds]);
  }
  return out;
}

// Petites fonctions (rectangles, distances) : arguments tirés.
export function casRects(n = 3000, seed = 55) {
  const rnd = stream(seed);
  const out = [];
  while (out.length < n) {
    const a = randomRect(rnd);
    const b = randomRect(rnd);
    out.push({ a, b, x: value(rnd, -500, 3000), y: value(rnd, -500, 3000), m: rnd() < 0.1 ? pick(rnd, SPECIAL) : value(rnd, 0, 40), c: { x: value(rnd, -500, 3000), y: value(rnd, -500, 3000), r: pick(rnd, RADII) }, list: randomList(rnd) });
  }
  return out;
}
