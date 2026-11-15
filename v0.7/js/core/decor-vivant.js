// Lot 3g (retour du propriétaire) : extérieur plus vivant, provisoire. Décor non solide (ni collision, ni tir, ni chemin des zombies) ajouté autour du bâtiment, d'après
// le décor extérieur déjà généré (js/core/decor.js) : arbres morts aux branches nues, clôture de barbelés (poteaux et trois fils, ouverte devant chaque couloir
// d'approche), poteaux électriques et câbles le long du trottoir, flaques, touffes d'herbes hautes, tas de gravats et deux bidons en feu. Jamais sur un couloir
// d'approche ni près d'un point d'apparition, jamais près du bâtiment. Pur et déterministe (graine) : même entrée, même décor.
import { isNum, num } from './vec.js';
import { createRng, nextFloat } from './rng.js';
import { rectGap } from './collision.js';

export const DEFAULTS = Object.freeze({
  seed: 7351, deadTrees: 22, puddles: 14, tufts: 30, rubble: 5, barrels: 2, poleGap: 420, postGap: 70, fenceGap: 300, fromRoom: 140, fromSpawn: 90, fromCorridor: 24,
});

const okRect = (r) => r && [r.x, r.y, r.w, r.h].every(isNum) && r.w > 0 && r.h > 0;
const list = (a) => (Array.isArray(a) ? a : []);
const r1 = (v) => Math.round(v * 10) / 10;

// input : { size: { width, height }, footprint: [rects du bâtiment], decor: { ground, corridors, spawnPoints, lamps, solids, keepOut } } ; opts : DEFAULTS.
export function generateLivelyDecor(input, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const W = num(input?.size?.width);
  const H = num(input?.size?.height);
  const footprint = list(input?.footprint).filter(okRect);
  const decor = input?.decor ?? {};
  const corridors = list(decor.corridors).filter(okRect);
  const spawns = list(decor.spawnPoints).filter((p) => p && isNum(p.x) && isNum(p.y));
  const ground = list(decor.ground).filter(okRect);
  // Lot 5a : les épaves ne changent pas le tirage (même suite qu'avant) ; ce qui les touche est retiré à la fin.
  const wrecks = [...list(decor.keepOut), ...list(decor.wreckSolids)].filter(okRect);
  const isWreck = (s) => s.kind === 'helicoptere' || s.burning === true;
  const solids = list(decor.solids).filter(okRect).filter((s) => !isWreck(s));
  const lamps = list(decor.lamps).filter((p) => p && isNum(p.x) && isNum(p.y));
  if (W <= 0 || H <= 0 || footprint.length === 0) return { deadTrees: [], fence: { posts: [], wires: [] }, poles: [], cables: [], puddles: [], tufts: [], rubble: [], barrels: [] };
  let rng = createRng(isNum(o.seed) ? o.seed : 1);
  const rand = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const between = (a, b) => a + rand() * (b - a);
  const fromRoom = (r) => Math.min(...footprint.map((f) => rectGap(r, f)));
  const clearOf = (r, m = o.fromCorridor) => !corridors.some((c) => rectGap(r, c) < m) && !spawns.some((p) => rectGap(r, { x: p.x, y: p.y, w: 1, h: 1 }) < o.fromSpawn)
    && !solids.some((s) => rectGap(r, s) < 20);
  const onGround = (r) => ground.some((g) => rectGap(r, g) === 0);
  const inside = (r, m) => r.x >= m && r.y >= m && r.x + r.w <= W - m && r.y + r.h <= H - m;
  const place = (count, make, accept) => {
    const out = [];
    for (let attempt = 0; out.length < count && attempt < count * 80; attempt += 1) {
      const item = make(out.length + 1);
      if (accept(item, out)) out.push(item);
    }
    return out;
  };
  const apart = (r, others, m) => !others.some((q) => rectGap(r, q.box ?? q) < m);

  // Arbres morts : tronc fin et haut, trois branches nues inclinées, une brindille.
  const deadTrees = place(o.deadTrees, (n) => {
    const x = r1(between(60, W - 60));
    const y = r1(between(60, H - 60));
    const hauteur = r1(between(120, 175));
    const branches = Array.from({ length: 4 }, (_, k) => ({ at: r1(hauteur * (k < 3 ? between(0.45, 0.85) : between(0.75, 0.95))), len: r1(k < 3 ? between(35, 70) : between(18, 30)), tilt: r1(between(0.55, 1.15) * 100) / 100, rot: r1(((k * 2.4) + between(-0.5, 0.5)) * 100) / 100, r: k < 3 ? 2.2 : 1.2 }));
    return { id: `arbre-mort-${n}`, x, y, hauteur, rayon: r1(between(4.5, 7)), branches, box: { x: x - 10, y: y - 10, w: 20, h: 20 } };
  }, (t, out) => inside(t.box, 40) && fromRoom(t.box) >= o.fromRoom && clearOf(t.box, 40) && !onGround(t.box) && apart(t.box, out, 140));

  // Clôture de barbelés : rectangle autour du bâtiment, à fenceGap de son emprise, ouvert devant chaque couloir d'approche et hors du monde coupé.
  const bx0 = Math.min(...footprint.map((f) => f.x)) - o.fenceGap;
  const by0 = Math.min(...footprint.map((f) => f.y)) - o.fenceGap;
  const bx1 = Math.max(...footprint.map((f) => f.x + f.w)) + o.fenceGap;
  const by1 = Math.max(...footprint.map((f) => f.y + f.h)) + o.fenceGap;
  const posts = [];
  const wires = [];
  const side = (ax, ay, bx, by) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / o.postGap));
    let run = null;
    for (let i = 0; i <= n; i += 1) {
      const x = r1(ax + ((bx - ax) * i) / n);
      const y = r1(ay + ((by - ay) * i) / n);
      const box = { x: x - 3, y: y - 3, w: 6, h: 6 };
      const ok = inside(box, 10) && clearOf(box) && !onGround(box);
      if (ok) {
        posts.push({ x, y, hauteur: r1(between(36, 44)), lean: r1(between(-0.12, 0.12) * 100) / 100 });
        if (run === null) run = { x0: x, y0: y };
        run.x1 = x;
        run.y1 = y;
      } else if (run !== null) {
        if (run.x1 !== run.x0 || run.y1 !== run.y0) wires.push(run);
        run = null;
      }
    }
    if (run !== null && (run.x1 !== run.x0 || run.y1 !== run.y0)) wires.push(run);
  };
  side(bx0, by0, bx1, by0);
  side(bx1, by0, bx1, by1);
  side(bx0, by1, bx1, by1);
  side(bx0, by0, bx0, by1);

  // Poteaux électriques le long du bord nord du trottoir (loin des lampadaires), câbles entre deux poteaux voisins.
  const walk = ground.find((g) => g.kind === 'trottoir');
  const poles = [];
  if (walk) {
    for (let x = walk.x + o.poleGap / 2; x < walk.x + walk.w - 40; x += o.poleGap) {
      const px = r1(x + between(-30, 30));
      const py = r1(walk.y + 12);
      const box = { x: px - 4, y: py - 4, w: 8, h: 8 };
      if (lamps.some((l) => Math.abs(l.x - px) < 60) || !clearOf(box, 10)) continue;
      poles.push({ x: px, y: py, hauteur: 150 });
    }
  }
  const cables = poles.slice(1).map((p, i) => ({ x0: poles[i].x, x1: p.x, y: p.y, h: 138 }));

  // Flaques (sur la terre, pas sur la route), touffes d'herbes hautes, tas de gravats, bidons en feu.
  const puddles = place(o.puddles, (n) => {
    const w = r1(between(50, 130));
    const h = r1(between(30, 70));
    return { id: `flaque-${n}`, x: r1(between(40, W - 40 - w)), y: r1(between(40, H - 40 - h)), w, h };
  }, (p, out) => inside(p, 30) && fromRoom(p) >= 80 && clearOf(p, 0) && !onGround(p) && apart(p, out, 60));
  const tufts = place(o.tufts, (n) => {
    const x = r1(between(30, W - 30));
    const y = r1(between(30, H - 30));
    return { id: `herbes-${n}`, x, y, r: r1(between(8, 14)), hauteur: r1(between(16, 30)), rot: r1(between(0, 3)), box: { x: x - 14, y: y - 14, w: 28, h: 28 } };
  }, (t, out) => inside(t.box, 20) && fromRoom(t.box) >= 70 && !onGround(t.box) && !spawns.some((p) => rectGap(t.box, { x: p.x, y: p.y, w: 1, h: 1 }) < 40) && apart(t.box, out, 30));
  const rubble = place(o.rubble, (n) => {
    const w = r1(between(40, 80));
    const h = r1(between(30, 60));
    return { id: `gravats-ext-${n}`, x: r1(between(40, W - 40 - w)), y: r1(between(40, H - 40 - h)), w, h };
  }, (r, out) => inside(r, 30) && fromRoom(r) >= o.fromRoom && clearOf(r) && apart(r, [...out, ...deadTrees], 80));
  const barrels = place(o.barrels, (n) => {
    const x = r1(between(80, W - 80));
    const y = r1(between(80, H - 80));
    return { id: `bidon-feu-${n}`, x, y, r: 11, hauteur: 30, box: { x: x - 12, y: y - 12, w: 24, h: 24 } };
  }, (b, out) => inside(b.box, 60) && fromRoom(b.box) >= 220 && fromRoom(b.box) <= 600 && clearOf(b.box, 40) && !onGround(b.box) && apart(b.box, out, 900));

  if (wrecks.length === 0) return { deadTrees, fence: { posts, wires }, poles, cables, puddles, tufts, rubble, barrels };
  const clear = (r, m) => !wrecks.some((k) => rectGap(r, k) < m);
  const postBox = (p) => ({ x: p.x - 3, y: p.y - 3, w: 6, h: 6 });
  const wireBox = (w) => ({ x: Math.min(w.x0, w.x1) - 1, y: Math.min(w.y0, w.y1) - 1, w: Math.abs(w.x1 - w.x0) + 2, h: Math.abs(w.y1 - w.y0) + 2 });
  return {
    deadTrees: deadTrees.filter((t) => clear(t.box, 30)),
    fence: { posts: posts.filter((p) => clear(postBox(p), 10)), wires: wires.filter((w) => clear(wireBox(w), 10)) },
    poles, cables,
    puddles: puddles.filter((p) => clear(p, 0.5)),
    tufts: tufts.filter((t) => clear(t.box, 10)),
    rubble: rubble.filter((r) => clear(r, 20)),
    barrels: barrels.filter((b) => clear(b.box, 40)),
  };
}
