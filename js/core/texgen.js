// Générateurs de textures : fonctions pures et déterministes qui calculent des pixels RGBA à partir d'une spécification.
// Aucune image n'est importée. Le bruit est périodique (le réseau boucle), donc les textures répétées n'ont pas de raccord visible.
// spec = { id, kind, width, height, seed, colors: { nom: [r, g, b] }, params } ; les couleurs arrivent en argument (jamais écrites ici).
// Ne lève jamais d'exception : une entrée inattendue donne une valeur neutre et un message dans `warnings`.
import { isColor, shade } from './color.js';
import { createRng, nextFloat } from './rng.js';
import { isNum } from './vec.js';

export const MAX_SIZE = 1024;
export const NEUTRAL = [128, 128, 128];

// ---------------------------------------------------------------------------------------------------------------------------------
// Bruit
// ---------------------------------------------------------------------------------------------------------------------------------

const lattices = new Map(); // mémoïsation des réseaux (déterministe : même clé, mêmes valeurs)

function lattice(seed, px, py) {
  const key = `${seed}|${px}|${py}`;
  let table = lattices.get(key);
  if (table === undefined) {
    if (lattices.size > 500) lattices.clear();
    table = new Float32Array(px * py);
    let rng = createRng((Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(px, 0x85ebca6b) ^ Math.imul(py, 0xc2b2ae35)) >>> 0);
    for (let i = 0; i < table.length; i += 1) {
      const r = nextFloat(rng);
      table[i] = r.value;
      rng = r.rng;
    }
    lattices.set(key, table);
  }
  return table;
}

const cleanSeed = (s) => (isNum(s) ? Math.trunc(s) : 0);
const cleanPeriod = (n) => (isNum(n) ? Math.min(256, Math.max(1, Math.trunc(n))) : 1);
const periods = (period) => (Array.isArray(period) ? [cleanPeriod(period[0]), cleanPeriod(period[1] ?? period[0])] : [cleanPeriod(period), cleanPeriod(period)]);

// Bruit de valeur lissé, périodique de période 1 : renvoie une fonction (u, v) -> [0, 1].
function makeNoise(px, py, seed) {
  const table = lattice(seed, px, py);
  return (u, v) => {
    const x = u * px;
    const y = v * py;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    let fx = x - x0;
    let fy = y - y0;
    fx *= fx * (3 - 2 * fx);
    fy *= fy * (3 - 2 * fy);
    const ix0 = ((x0 % px) + px) % px;
    const iy0 = ((y0 % py) + py) % py;
    const ix1 = ix0 + 1 === px ? 0 : ix0 + 1;
    const iy1 = iy0 + 1 === py ? 0 : iy0 + 1;
    const a = table[iy0 * px + ix0];
    const b = table[iy0 * px + ix1];
    const c = table[iy1 * px + ix0];
    const d = table[iy1 * px + ix1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// Somme d'octaves (période doublée à chaque octave, donc toujours périodique) : renvoie (u, v) -> [0, 1].
function makeFbm(px, py, seed, octaves = 3, gain = 0.5) {
  const n = Math.min(6, Math.max(1, Math.trunc(octaves)));
  const layers = [];
  let total = 0;
  let amp = 1;
  for (let o = 0; o < n; o += 1) {
    const mx = Math.min(256, px * 2 ** o);
    const my = Math.min(256, py * 2 ** o);
    layers.push({ f: makeNoise(mx, my, seed + o * 101), amp });
    total += amp;
    amp *= gain;
  }
  return (u, v) => {
    let sum = 0;
    for (let i = 0; i < layers.length; i += 1) sum += layers[i].f(u, v) * layers[i].amp;
    return sum / total;
  };
}

// Bruit de valeur de (x, y) dans [0, 1[ (période 1) ; `period` : nombre de cellules (ou [cellulesX, cellulesY]). Résultat dans [0, 1].
export function valueNoise(x, y, period, seed) {
  const [px, py] = periods(period);
  return makeNoise(px, py, cleanSeed(seed))(isNum(x) ? x : 0, isNum(y) ? y : 0);
}

export function fbm(x, y, period, seed, octaves = 4, gain = 0.5) {
  const [px, py] = periods(period);
  return makeFbm(px, py, cleanSeed(seed), isNum(octaves) ? octaves : 4, isNum(gain) ? gain : 0.5)(isNum(x) ? x : 0, isNum(y) ? y : 0);
}

// Bruit par pixel (entier) : [0, 1[.
function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fract = (v) => v - Math.floor(v);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const param = (p, name, fallback, lo, hi) => (isNum(p?.[name]) ? Math.min(hi, Math.max(lo, p[name])) : fallback);

// ---------------------------------------------------------------------------------------------------------------------------------
// Genres. make(ctx) renvoie (x, y, out) qui écrit r, g, b (0 à 255) dans out. ctx = { w, h, c, p, seed }.
// ---------------------------------------------------------------------------------------------------------------------------------

const GENRES = {};

// Dalles : carrelage et trottoir.
function slabs(ctx, { cells, joint, wear, crack, bevel, names }) {
  const { w, h, c, seed } = ctx;
  const A = c[names[0]];
  const B = c[names[1]];
  const G = c[names[2]];
  const cw = w / cells;
  const ch = h / cells;
  const jh = joint / 2;
  const stain = makeFbm(3, 3, seed + 1, 3, 0.55);
  const scuff = makeFbm(8, 8, seed + 2, 3, 0.5);
  const fine = makeNoise(64, 64, seed + 3);
  const fissure = makeFbm(5, 5, seed + 4, 2, 0.5);
  const gate = makeNoise(3, 3, seed + 6);
  return (x, y, out) => {
    const tx = Math.floor(x / cw);
    const ty = Math.floor(y / ch);
    const lx = x - tx * cw;
    const ly = y - ty * ch;
    const d = Math.min(lx + 0.5, cw - lx - 0.5, ly + 0.5, ch - ly - 0.5);
    const u = x / w;
    const v = y / h;
    const f = fine(u, v);
    if (d < jh) {
      const k = 0.85 + f * 0.3;
      out[0] = G[0] * k;
      out[1] = G[1] * k;
      out[2] = G[2] * k;
      return;
    }
    const t = hash(tx, ty, seed);
    let k = 1 + (f - 0.5) * 0.14 + (hash(x, y, seed + 5) - 0.5) * 0.07;
    const sc = scuff(u, v);
    const st = stain(u, v);
    if (sc > 0.58) k += (sc - 0.58) * wear * 1.3;
    if (st > 0.58) k -= (st - 0.58) * wear * 1.7;
    if (d < jh + bevel) k *= 0.8 + (0.2 * (d - jh)) / bevel;
    else if (lx < bevel + jh + 1 && ly < bevel + jh + 1) k *= 1.06;
    if (crack > 0 && Math.abs(fissure(u, v) - 0.5) < crack * smooth(0.66, 0.74, gate(u, v))) k *= 0.55;
    out[0] = (A[0] + (B[0] - A[0]) * t) * k;
    out[1] = (A[1] + (B[1] - A[1]) * t) * k;
    out[2] = (A[2] + (B[2] - A[2]) * t) * k;
  };
}

GENRES.tiles = {
  colors: ['a', 'b', 'grout'], main: 'a', tile: 'xy',
  make: (ctx) => slabs(ctx, {
    cells: Math.round(param(ctx.p, 'cells', 8, 1, 64)), joint: param(ctx.p, 'joint', 3, 0, 12), wear: param(ctx.p, 'wear', 0.5, 0, 1), crack: 0.0025, bevel: 2, names: ['a', 'b', 'grout'],
  }),
};

GENRES.sidewalk = {
  colors: ['base', 'grout'], main: 'base', tile: 'xy',
  make: (ctx) => slabs({ ...ctx, c: { ...ctx.c, alt: shade(ctx.c.base, -0.12) } }, {
    cells: Math.round(param(ctx.p, 'cells', 2, 1, 16)), joint: param(ctx.p, 'joint', 3, 0, 12), wear: param(ctx.p, 'wear', 0.6, 0, 1), crack: 0.0035, bevel: 1.5, names: ['base', 'alt', 'grout'],
  }),
};

GENRES.planks = {
  colors: ['wood', 'dark'], main: 'wood', tile: 'xy',
  make({ w, h, c, p, seed }) {
    const rows = Math.round(param(p, 'rows', 8, 1, 64));
    const segs = Math.round(param(p, 'segs', 2, 1, 8));
    const rowH = h / rows;
    const boardLen = w / segs;
    const grain = makeFbm(3, 40, seed + 1, 3, 0.55);
    const wide = makeNoise(3, 3, seed + 2);
    return (x, y, out) => {
      const r = Math.floor(y / rowH);
      const ly = y - r * rowH;
      const off = hash(r, 7, seed) * boardLen;
      const along = (x + 0.5 - off + w) / boardLen;
      const k = Math.floor(along);
      const lx = (along - k) * boardLen;
      const u = x / w;
      const v = y / h;
      const tone = hash(r, (k % segs) + 40, seed + 3);
      const dy = Math.min(ly + 0.5, rowH - ly - 0.5);
      if (dy < 0.9 || Math.min(lx, boardLen - lx) < 0.9) {
        out[0] = c.dark[0] * 0.45;
        out[1] = c.dark[1] * 0.45;
        out[2] = c.dark[2] * 0.45;
        return;
      }
      const g = grain(u, v);
      const vein = Math.abs(Math.sin(g * 22 + tone * 6));
      const t = Math.min(1, tone * 0.5 + vein * 0.28 + (wide(u, v) - 0.5) * 0.2);
      const shadow = dy < 2.5 ? 0.88 : 1;
      out[0] = (c.wood[0] + (c.dark[0] - c.wood[0]) * t) * shadow;
      out[1] = (c.wood[1] + (c.dark[1] - c.wood[1]) * t) * shadow;
      out[2] = (c.wood[2] + (c.dark[2] - c.wood[2]) * t) * shadow;
    };
  },
};

GENRES.crate = {
  colors: ['wood', 'dark'], main: 'wood', tile: 'xy',
  make({ w, h, c, p, seed }) {
    const slats = Math.round(param(p, 'slats', 4, 1, 16));
    const slatH = h / slats;
    const grain = makeFbm(3, 32, seed + 1, 3, 0.55);
    const nailR = Math.max(1.2, w / 64);
    return (x, y, out) => {
      const s = Math.floor(y / slatH);
      const ly = y - s * slatH;
      const u = x / w;
      const v = y / h;
      const dy = Math.min(ly + 0.5, slatH - ly - 0.5);
      if (dy < 1.2) {
        out[0] = c.dark[0] * 0.35;
        out[1] = c.dark[1] * 0.35;
        out[2] = c.dark[2] * 0.35;
        return;
      }
      // Clous de chaque côté de la latte.
      for (const nx of [w / 8, (7 * w) / 8]) {
        const dx = x - nx;
        const dy = ly - slatH / 2;
        if (dx * dx + dy * dy < nailR * nailR) {
          out[0] = 150;
          out[1] = 150;
          out[2] = 155;
          return;
        }
      }
      const tone = hash(s, 3, seed);
      const t = Math.min(1, tone * 0.45 + Math.abs(Math.sin(grain(u, v) * 20 + tone * 5)) * 0.3);
      const edge = dy < 3 ? 0.86 : 1;
      out[0] = (c.wood[0] + (c.dark[0] - c.wood[0]) * t) * edge;
      out[1] = (c.wood[1] + (c.dark[1] - c.wood[1]) * t) * edge;
      out[2] = (c.wood[2] + (c.dark[2] - c.wood[2]) * t) * edge;
    };
  },
};

GENRES.plaster = {
  colors: ['base', 'dirt'], main: 'base', tile: 'xy',
  make({ w, h, c, seed }) {
    const blotch = makeFbm(4, 4, seed + 1, 3, 0.55);
    const drip = makeNoise(40, 2, seed + 2);
    const dripGate = makeNoise(5, 2, seed + 3);
    const rough = makeNoise(96, 96, seed + 4);
    const crack = makeFbm(5, 5, seed + 5, 2, 0.5);
    const gate = makeNoise(3, 3, seed + 6);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const dirt = smooth(0.45, 0.8, blotch(u, v)) * 0.4 + smooth(0.68, 0.92, drip(u, v)) * smooth(0.5, 0.75, dripGate(u, v)) * 0.4;
      let k = 1 + (rough(u, v) - 0.5) * 0.12 + (hash(x, y, seed + 7) - 0.5) * 0.06;
      if (Math.abs(crack(u, v) - 0.5) < 0.003 * smooth(0.66, 0.74, gate(u, v))) k *= 0.5;
      const t = Math.min(0.9, dirt);
      out[0] = (c.base[0] + (c.dirt[0] - c.base[0]) * t) * k;
      out[1] = (c.base[1] + (c.dirt[1] - c.base[1]) * t) * k;
      out[2] = (c.base[2] + (c.dirt[2] - c.base[2]) * t) * k;
    };
  },
};

GENRES.metal = {
  colors: ['metal'], main: 'metal', tile: 'xy',
  make({ w, h, c, p, seed }) {
    const panels = Math.round(param(p, 'panels', 4, 1, 16));
    const panelH = h / panels;
    const brushed = makeNoise(2, 128, seed + 1);
    const dent = makeFbm(3, 3, seed + 2, 3, 0.5);
    const scratch = makeNoise(96, 6, seed + 3);
    const gate = makeNoise(4, 4, seed + 4);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const dy = Math.min((y % panelH) + 0.5, panelH - (y % panelH) - 0.5);
      let k = 1 + (brushed(u, v) - 0.5) * 0.14 + (dent(u, v) - 0.5) * 0.22 + (hash(x, y, seed + 5) - 0.5) * 0.05;
      if (dy < 1) k *= 0.55;
      else if (dy < 2.2) k *= 1.1;
      if (Math.abs(scratch(u, v) - 0.5) < 0.012 && gate(u, v) > 0.45) k *= 1.35;
      out[0] = c.metal[0] * k;
      out[1] = c.metal[1] * k;
      out[2] = c.metal[2] * k;
    };
  },
};

// Asphalte seul : fonction partagée par asphalt et markings.
function asphaltPixel({ w, h, c, p, seed }) {
  const stones = makeNoise(96, 96, seed + 1);
  const coarse = makeFbm(4, 4, seed + 2, 3, 0.55);
  const patch = makeFbm(3, 3, seed + 3, 2, 0.5);
  const crack = makeFbm(6, 6, seed + 4, 2, 0.5);
  const gate = makeNoise(3, 3, seed + 5);
  const seams = Math.round(param(p, 'joints', 2, 0, 8));
  const seamH = seams > 0 ? h / seams : 0;
  return (x, y, out) => {
    const u = x / w;
    const v = y / h;
    let k = 1 + (stones(u, v) - 0.5) * 0.2 + (coarse(u, v) - 0.5) * 0.18 + (hash(x, y, seed + 6) - 0.5) * 0.14;
    if (patch(u, v) > 0.58) k *= 0.88;
    if (Math.abs(crack(u, v) - 0.5) < 0.003 * smooth(0.64, 0.72, gate(u, v))) k *= 0.5;
    if (seamH > 0 && Math.min((y % seamH) + 0.5, seamH - (y % seamH) - 0.5) < 0.9) k *= 0.6;
    out[0] = c.asphalt[0] * k;
    out[1] = c.asphalt[1] * k;
    out[2] = c.asphalt[2] * k;
  };
}

GENRES.asphalt = { colors: ['asphalt'], main: 'asphalt', tile: 'xy', make: asphaltPixel };

// Route : asphalte, ligne centrale en pointillés (le long de x), lignes de rive continues. Se répète le long de x seulement.
GENRES.markings = {
  colors: ['asphalt', 'line'], main: 'asphalt', tile: 'x',
  make(ctx) {
    const { w, h, c, p, seed } = ctx;
    const base = asphaltPixel(ctx);
    const dashes = Math.round(param(p, 'dashes', 1, 1, 8));
    const dashLen = param(p, 'dashLen', 0.56, 0.1, 0.95);
    const lineW = param(p, 'lineWidth', 0.045, 0.01, 0.2);
    const edgeAt = param(p, 'edge', 0.07, 0.02, 0.2);
    const worn = makeNoise(24, 6, seed + 11);
    return (x, y, out) => {
      base(x, y, out);
      const u = x / w;
      const v = y / h;
      const centre = Math.abs(v - 0.5) < lineW / 2 && fract(u * dashes) < dashLen;
      const rim = Math.abs(v - edgeAt) < lineW / 3 || Math.abs(v - (1 - edgeAt)) < lineW / 3;
      if (!centre && !rim) return;
      const wear = smooth(0.35, 0.75, worn(u, v)) * 0.55 + (hash(x, y, seed + 12) - 0.5) * 0.15;
      const t = Math.min(1, Math.max(0, 0.92 - wear));
      out[0] += (c.line[0] - out[0]) * t;
      out[1] += (c.line[1] - out[1]) * t;
      out[2] += (c.line[2] - out[2]) * t;
    };
  },
};

GENRES.grass = {
  colors: ['a', 'b'], main: 'a', tile: 'xy',
  make({ w, h, c, seed }) {
    const patch = makeFbm(4, 4, seed + 1, 3, 0.55);
    const blades = makeNoise(110, 28, seed + 2);
    const tuft = makeNoise(18, 18, seed + 3);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const t = smooth(0.3, 0.7, patch(u, v));
      let k = 1 + (blades(u, v) - 0.5) * 0.45 + (hash(x, y, seed + 4) - 0.5) * 0.2;
      const tf = tuft(u, v);
      if (tf > 0.66) k += (tf - 0.66) * 1.2;
      out[0] = (c.a[0] + (c.b[0] - c.a[0]) * t) * k;
      out[1] = (c.a[1] + (c.b[1] - c.a[1]) * t) * k;
      out[2] = (c.a[2] + (c.b[2] - c.a[2]) * t) * k;
    };
  },
};

GENRES.soil = {
  colors: ['soil', 'gravel'], main: 'soil', tile: 'xy',
  make({ w, h, c, seed }) {
    const lumps = makeFbm(5, 5, seed + 1, 3, 0.55);
    const pebbles = makeNoise(72, 72, seed + 2);
    const speck = makeNoise(150, 150, seed + 3);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      let k = 1 + (lumps(u, v) - 0.5) * 0.5 + (hash(x, y, seed + 4) - 0.5) * 0.14;
      const pb = pebbles(u, v);
      let t = 0;
      if (pb > 0.7) {
        t = smooth(0.7, 0.8, pb) * 0.75;
        k *= pb > 0.72 ? 1 : 0.8;
      }
      if (speck(u, v) > 0.8) t = Math.max(t, 0.4);
      out[0] = (c.soil[0] + (c.gravel[0] - c.soil[0]) * t) * k;
      out[1] = (c.soil[1] + (c.gravel[1] - c.soil[1]) * t) * k;
      out[2] = (c.soil[2] + (c.gravel[2] - c.soil[2]) * t) * k;
    };
  },
};

GENRES.cloth = {
  colors: ['cloth'], main: 'cloth', tile: 'xy',
  make({ w, h, c, p, seed }) {
    const threads = Math.round(param(p, 'threads', 24, 4, 128));
    const fold = makeNoise(7, 1, seed + 1);
    const blotch = makeFbm(4, 4, seed + 2, 2, 0.5);
    const tear = makeFbm(5, 5, seed + 3, 2, 0.5);
    const gate = makeNoise(3, 3, seed + 4);
    const tearAmount = param(p, 'tears', 0, 0, 1);
    const TAU = Math.PI * 2;
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const weave = Math.sin(TAU * u * threads) * Math.sin(TAU * v * threads);
      let k = 1 + weave * 0.1 + (fold(fract(u + v), 0.5) - 0.5) * 0.35 + (blotch(u, v) - 0.5) * 0.2 + (hash(x, y, seed + 5) - 0.5) * 0.05;
      const d = Math.abs(tear(u, v) - 0.5);
      if (tearAmount > 0 && gate(u, v) > 0.5) {
        if (d < 0.01 * tearAmount) k *= 0.35;
        else if (d < 0.02 * tearAmount) k *= 1.15;
      }
      out[0] = c.cloth[0] * k;
      out[1] = c.cloth[1] * k;
      out[2] = c.cloth[2] * k;
    };
  },
};

GENRES.denim = {
  colors: ['denim'], main: 'denim', tile: 'xy',
  make({ w, h, c, p, seed }) {
    const fade = makeFbm(4, 4, seed + 1, 3, 0.55);
    const fibre = makeNoise(64, 64, seed + 2);
    const tear = makeFbm(5, 5, seed + 3, 2, 0.5);
    const gate = makeNoise(3, 3, seed + 4);
    const tearAmount = param(p, 'tears', 0, 0, 1);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const twill = ((x + y) & 3) < 2 ? 1.07 : 0.93;
      const thread = (x & 1) === 0 ? 1.03 : 0.97;
      const f = smooth(0.45, 0.8, fade(u, v));
      let k = twill * thread * (1 + (fibre(u, v) - 0.5) * 0.14 + (hash(x, y, seed + 5) - 0.5) * 0.08);
      const d = Math.abs(tear(u, v) - 0.5);
      if (tearAmount > 0 && gate(u, v) > 0.5 && d < 0.012 * tearAmount) k *= 0.4;
      out[0] = (c.denim[0] + (255 - c.denim[0]) * f * 0.22) * k;
      out[1] = (c.denim[1] + (255 - c.denim[1]) * f * 0.22) * k;
      out[2] = (c.denim[2] + (255 - c.denim[2]) * f * 0.22) * k;
    };
  },
};

GENRES.leather = {
  colors: ['leather'], main: 'leather', tile: 'xy',
  make({ w, h, c, seed }) {
    const crease = makeFbm(22, 22, seed + 1, 2, 0.5);
    const sheen = makeFbm(3, 3, seed + 2, 2, 0.5);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const d = Math.abs(crease(u, v) - 0.5);
      let k = 1 + (sheen(u, v) - 0.5) * 0.35 + (hash(x, y, seed + 3) - 0.5) * 0.08;
      if (d < 0.05) k *= 0.7 + d * 6;
      out[0] = c.leather[0] * k;
      out[1] = c.leather[1] * k;
      out[2] = c.leather[2] * k;
    };
  },
};

GENRES.skin = {
  colors: ['skin', 'vein'], main: 'skin', tile: 'xy',
  make({ w, h, c, seed }) {
    const blotch = makeFbm(4, 4, seed + 1, 3, 0.55);
    const vein = makeFbm(6, 6, seed + 2, 2, 0.5);
    const gate = makeNoise(3, 3, seed + 3);
    const pore = makeNoise(80, 80, seed + 4);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const k = 1 + (blotch(u, v) - 0.5) * 0.22 + (pore(u, v) - 0.5) * 0.1 + (hash(x, y, seed + 5) - 0.5) * 0.05;
      const d = Math.abs(vein(u, v) - 0.5);
      const t = gate(u, v) > 0.5 ? smooth(0.03, 0, d) * 0.55 : 0;
      out[0] = (c.skin[0] + (c.vein[0] - c.skin[0]) * t) * k;
      out[1] = (c.skin[1] + (c.vein[1] - c.skin[1]) * t) * k;
      out[2] = (c.skin[2] + (c.vein[2] - c.skin[2]) * t) * k;
    };
  },
};

GENRES.paint = {
  colors: ['paint', 'rust'], main: 'paint', tile: 'xy',
  make({ w, h, c, seed }) {
    const swirl = makeFbm(3, 3, seed + 1, 3, 0.5);
    const scratch = makeNoise(80, 5, seed + 2);
    const gate = makeNoise(5, 5, seed + 3);
    const rust = makeFbm(5, 5, seed + 4, 3, 0.55);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      let k = 1 + (swirl(u, v) - 0.5) * 0.2 + (hash(x, y, seed + 5) - 0.5) * 0.06;
      if (Math.abs(scratch(u, v) - 0.5) < 0.01 && gate(u, v) > 0.5) k *= 1.4;
      const r = smooth(0.66, 0.8, rust(u, v)) * 0.85;
      out[0] = (c.paint[0] + (c.rust[0] - c.paint[0]) * r) * k;
      out[1] = (c.paint[1] + (c.rust[1] - c.paint[1]) * r) * k;
      out[2] = (c.paint[2] + (c.rust[2] - c.paint[2]) * r) * k;
    };
  },
};

// Vitre teintée : dégradé vertical et deux bandes de reflet plates en diagonale. Ne se répète pas.
GENRES.glass = {
  colors: ['glass'], main: 'glass', tile: '',
  make({ w, h, c, seed }) {
    const smudge = makeFbm(3, 3, seed + 1, 2, 0.5);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const s = fract((u + v) * 1.5);
      let k = 1.12 - v * 0.3 + (smudge(u, v) - 0.5) * 0.12;
      let shine = 0;
      if (s > 0.28 && s < 0.4) shine = 0.22;
      else if (s > 0.5 && s < 0.54) shine = 0.14;
      out[0] = Math.min(255, c.glass[0] * k + 255 * shine);
      out[1] = Math.min(255, c.glass[1] * k + 255 * shine);
      out[2] = Math.min(255, c.glass[2] * k + 255 * shine);
    };
  },
};

GENRES.leaves = {
  colors: ['leaf'], main: 'leaf', tile: 'xy',
  make({ w, h, c, seed }) {
    const clump = makeFbm(9, 9, seed + 1, 3, 0.55);
    const light = makeNoise(40, 40, seed + 2);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const n = clump(u, v);
      let k = 0.55 + n * 0.9 + (hash(x, y, seed + 3) - 0.5) * 0.12;
      const l = light(u, v);
      if (l > 0.72) k += (l - 0.72) * 1.5;
      out[0] = c.leaf[0] * k;
      out[1] = c.leaf[1] * k;
      out[2] = c.leaf[2] * k;
    };
  },
};

GENRES.bark = {
  colors: ['bark'], main: 'bark', tile: 'xy',
  make({ w, h, c, seed }) {
    const furrow = makeFbm(9, 2, seed + 1, 3, 0.55);
    const fine = makeNoise(48, 6, seed + 2);
    return (x, y, out) => {
      const u = x / w;
      const v = y / h;
      const d = Math.abs(furrow(u, v) - 0.5);
      let k = 1 + (fine(u, v) - 0.5) * 0.3 + (hash(x, y, seed + 3) - 0.5) * 0.08;
      k *= d < 0.07 ? 0.55 + d * 6 : 1.05 + (d - 0.07) * 0.5;
      out[0] = c.bark[0] * k;
      out[1] = c.bark[1] * k;
      out[2] = c.bark[2] * k;
    };
  },
};

// Atlas : régions { id, x, y, w, h, kind, colors, params, seed } ; chaque région est entourée d'une marge qui répète son bord.
// Les régions ne se chevauchent pas (marges comprises) : chaque pixel ne dépend que de ses coordonnées.
GENRES.atlas = { colors: [], main: null, tile: '', make: null };

export const KINDS = Object.freeze(Object.keys(GENRES));
export const TILEABLE = Object.freeze(Object.fromEntries(KINDS.map((k) => [k, GENRES[k].tile])));
export const COLOR_NAMES = Object.freeze(Object.fromEntries(KINDS.map((k) => [k, Object.freeze([...GENRES[k].colors])])));
export const MAIN_COLOR = Object.freeze(Object.fromEntries(KINDS.map((k) => [k, GENRES[k].main])));

// ---------------------------------------------------------------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------------------------------------------------------------

const isPow2 = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SIZE && (n & (n - 1)) === 0;
const EMPTY = () => new Uint8ClampedArray(0);

// Lecture des couleurs d'un genre : un nom absent ou invalide donne un gris neutre et un avertissement.
function resolveColors(kind, raw, warnings, label) {
  const out = {};
  const src = raw !== null && typeof raw === 'object' ? raw : {};
  for (const name of GENRES[kind].colors) {
    if (isColor(src[name])) out[name] = [src[name][0], src[name][1], src[name][2]];
    else {
      out[name] = NEUTRAL;
      warnings.push(`${label}couleur « ${name} » absente ou invalide : gris neutre`);
    }
  }
  return out;
}

// Vérifie la spécification. Renvoie { ok, width, height, kind, seed, colors, params, regions, margin, warnings }.
function inspect(spec) {
  const warnings = [];
  const fail = (message) => {
    warnings.push(message);
    return { ok: false, width: 0, height: 0, warnings };
  };
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return fail('spécification absente ou invalide');
  const { width, height } = spec;
  if (!isPow2(width) || !isPow2(height)) return fail(`taille refusée (${String(width)} × ${String(height)}) : puissance de deux de 1 à ${MAX_SIZE} exigée`);
  const kind = typeof spec.kind === 'string' && Object.hasOwn(GENRES, spec.kind) ? spec.kind : null;
  const seed = cleanSeed(spec.seed);
  if (!isNum(spec.seed)) warnings.push('graine absente ou invalide : 0');
  const params = spec.params !== null && typeof spec.params === 'object' ? spec.params : {};
  if (kind === null) {
    warnings.push(`genre inconnu : ${String(spec.kind)} (image neutre)`);
    return { ok: true, width, height, kind: null, seed, colors: {}, params, warnings };
  }
  if (kind === 'atlas') {
    const margin = Math.round(param(params, 'margin', 8, 0, 32));
    const regions = [];
    const list = Array.isArray(params.regions) ? params.regions : [];
    list.forEach((r, i) => {
      const label = `région ${String(r?.id ?? i)} : `;
      const okRect = r && [r.x, r.y, r.w, r.h].every((n) => Number.isInteger(n)) && r.w >= 1 && r.h >= 1 && r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;
      const sub = okRect && typeof r.kind === 'string' && Object.hasOwn(GENRES, r.kind) && r.kind !== 'atlas' ? r.kind : null;
      if (sub === null) {
        warnings.push(`${label}région ignorée (rectangle ou genre invalide)`);
        return;
      }
      regions.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind: sub, seed: isNum(r.seed) ? Math.trunc(r.seed) : seed + 17 * (i + 1), colors: resolveColors(sub, r.colors, warnings, label), params: r.params ?? {} });
    });
    const fill = isColor(spec.colors?.fill) ? spec.colors.fill : [96, 96, 96];
    return { ok: true, width, height, kind, seed, colors: { fill }, params, regions, margin, warnings };
  }
  return { ok: true, width, height, kind, seed, colors: resolveColors(kind, spec.colors, warnings, ''), params, warnings };
}

// Taille et avertissements d'une spécification, sans rien calculer.
export function textureSize(spec) {
  const info = inspect(spec);
  return { width: info.width, height: info.height, warnings: info.warnings };
}

function fillInfo(info, data, y0, y1) {
  const { width: w, height: h } = info;
  const from = Math.max(0, Math.trunc(y0));
  const to = Math.min(h, Math.trunc(y1));
  const out = [0, 0, 0];
  const put = (x, y) => {
    const i = (y * w + x) * 4;
    data[i] = out[0];
    data[i + 1] = out[1];
    data[i + 2] = out[2];
    data[i + 3] = 255;
  };
  if (info.kind === null) {
    out[0] = NEUTRAL[0];
    out[1] = NEUTRAL[1];
    out[2] = NEUTRAL[2];
    for (let y = from; y < to; y += 1) for (let x = 0; x < w; x += 1) put(x, y);
  } else if (info.kind === 'atlas') {
    const [r, g, b] = info.colors.fill;
    for (let y = from; y < to; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    const m = info.margin;
    for (const region of info.regions) {
      const px = GENRES[region.kind].make({ w: region.w, h: region.h, c: region.colors, p: region.params, seed: region.seed });
      const ya = Math.max(from, region.y - m);
      const yb = Math.min(to, region.y + region.h + m);
      const xa = Math.max(0, region.x - m);
      const xb = Math.min(w, region.x + region.w + m);
      for (let y = ya; y < yb; y += 1) {
        const ly = Math.min(region.h - 1, Math.max(0, y - region.y));
        for (let x = xa; x < xb; x += 1) {
          px(Math.min(region.w - 1, Math.max(0, x - region.x)), ly, out);
          put(x, y);
        }
      }
    }
  } else {
    const px = GENRES[info.kind].make({ w, h, c: info.colors, p: info.params, seed: info.seed });
    for (let y = from; y < to; y += 1) {
      for (let x = 0; x < w; x += 1) {
        px(x, y, out);
        put(x, y);
      }
    }
  }
  return Math.max(0, to - from);
}

// Remplit les lignes [y0, y1) de `data` (Uint8ClampedArray ou Uint8Array RGBA de width × height × 4) : même résultat que
// createTextureData, par tranches. Renvoie { rows, warnings }.
export function fillRows(spec, data, y0, y1) {
  const info = inspect(spec);
  if (!info.ok) return { rows: 0, warnings: info.warnings };
  if (!(data instanceof Uint8ClampedArray || data instanceof Uint8Array) || data.length !== info.width * info.height * 4) {
    return { rows: 0, warnings: [...info.warnings, 'tampon de sortie invalide'] };
  }
  if (!isNum(y0) || !isNum(y1)) return { rows: 0, warnings: [...info.warnings, 'lignes invalides'] };
  return { rows: fillInfo(info, data, y0, y1), warnings: info.warnings };
}

// Texture complète : { width, height, data, warnings }. Taille refusée : largeur et hauteur 0, data vide.
export function createTextureData(spec) {
  const info = inspect(spec);
  if (!info.ok) return { width: 0, height: 0, data: EMPTY(), warnings: info.warnings };
  const data = new Uint8ClampedArray(info.width * info.height * 4);
  fillInfo(info, data, 0, info.height);
  return { width: info.width, height: info.height, data, warnings: info.warnings };
}

// Rectangle UV d'une région d'atlas : { u0, v0, u1, v1 } (v = y / hauteur : la première ligne de données est v = 0).
const num0 = (n) => (isNum(n) ? n : 0);
export function regionRect(size, region) {
  const s = isNum(size) && size > 0 ? size : 1;
  return { u0: num0(region?.x) / s, v0: num0(region?.y) / s, u1: (num0(region?.x) + num0(region?.w)) / s, v1: (num0(region?.y) + num0(region?.h)) / s };
}

// Transforme une entrée de data/game/textures.json en spécification : lookup(jeton) -> [r, g, b] ou null (jeton inconnu).
export function buildSpec(entry, lookup) {
  const colorsOf = (map) => Object.fromEntries(Object.entries(map !== null && typeof map === 'object' ? map : {}).map(([name, token]) => [name, lookup(token)]));
  const e = entry !== null && typeof entry === 'object' ? entry : {};
  const params = e.params !== null && typeof e.params === 'object' ? { ...e.params } : {};
  if (Array.isArray(params.regions)) params.regions = params.regions.map((r) => ({ ...r, colors: colorsOf(r?.colors) }));
  return { id: e.id, kind: e.kind, width: e.size ?? e.width, height: e.size ?? e.height, seed: e.seed, colors: colorsOf(e.colors), params };
}

// Moyenne des pixels d'une texture : [r, g, b].
export function meanColor(texture) {
  const d = texture?.data;
  if (!d || d.length < 4) return [0, 0, 0];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  return [r / n, g / n, b / n];
}

