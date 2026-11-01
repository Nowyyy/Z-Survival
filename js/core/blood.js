// Sang du lot 3j, purement visuel : particules (gerbe orientée par la balle), taches au sol immuables (plafond, éviction de la plus ancienne,
// fondu final), paliers de blessure selon la vie, cadavres visuels (plafond, durée, enfoncement). Aucun effet de jeu : rien ici n'est lu
// par la simulation. Pur : graine (rng.js) pour tout hasard, aucune horloge (le temps arrive en argument), arguments jamais modifiés.
import { createRng, nextFloat } from './rng.js';
import { isNum } from './vec.js';

export const LEVELS = ['0', 'reduit', '1'];
const num = (v, d = 0) => (isNum(v) ? v : d);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const range = (r, d) => (Array.isArray(r) && isNum(r[0]) && isNum(r[1]) ? r : d);

// Niveau d'après le paramètre ?sang= : '0', 'reduit' (ou « réduit »), '1' (ou « complet ») ; toute autre valeur : '0'.
export function levelOf(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : value === 1 ? '1' : '';
  if (v === '1' || v === 'complet') return '1';
  if (v === 'reduit' || v === 'réduit') return 'reduit';
  return '0';
}

// Réglages d'un niveau (blood.json).
export function settings(cfg, level) {
  const c = obj(cfg);
  const l = obj(obj(c.levels)[levelOf(level)]);
  return {
    level: levelOf(level),
    hit: Math.max(0, Math.floor(num(l.hit))),
    kill: Math.max(0, Math.floor(num(l.kill))),
    player: Math.min(4, Math.max(0, Math.floor(num(l.player)))),
    maxParticles: Math.max(0, Math.floor(num(l.maxParticles))),
    maxDecals: Math.max(0, Math.floor(num(l.maxDecals))),
    decalLife: Math.max(0, num(l.decalLife)),
    fade: Math.max(0, num(l.fade)),
    corpses: Math.min(num(obj(c.corpses).max, 6), Math.max(0, Math.floor(num(l.corpses)))),
    corpseLife: Math.max(0, num(l.corpseLife)),
    sink: Math.max(0.01, num(obj(c.corpses).sink, 0.8)),
    bodyStains: l.bodyStains === true,
    tint: typeof l.tint === 'string' ? l.tint : '--sang-frais',
  };
}

// Gerbe de particules : kind 'hit' (tir non mortel), 'kill' (mort), 'player' (joueur touché) ; direction : vitesse de la balle (x, y du
// plan de jeu) ; origin : { x, y, floor } ; renvoie [{ x, y, z (hauteur), vx, vy, vz, life, age, size, shade, floor }] (z vers le haut).
export function burst(seed, kind, direction, level, cfg, origin = {}) {
  const s = settings(cfg, level);
  const n = kind === 'kill' ? s.kill : kind === 'player' ? s.player : s.hit;
  const p = obj(obj(cfg).particles);
  const dx = num(direction?.x);
  const dy = num(direction?.y);
  const len = Math.hypot(dx, dy);
  const base = len > 1e-9 ? Math.atan2(dy, dx) : 0;
  const spread = num(p.spread, 0.9) * (kind === 'kill' ? 1.6 : 1);
  const h = kind === 'kill' ? num(p.killHeight, 28) : kind === 'player' ? num(p.playerHeight, 30) : num(p.hitHeight, 34);
  const sp = range(p.speed, [40, 120]);
  const up = range(p.up, [30, 95]);
  const life = range(p.life, [0.35, 0.9]);
  const size = range(p.size, [0.7, 2.2]);
  let rng = createRng(Math.trunc(num(seed, 1)));
  const draw = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = base + (draw() - 0.5) * spread * (len > 1e-9 ? 1 : 4);
    const v = sp[0] + (sp[1] - sp[0]) * draw();
    out.push({
      x: num(origin.x), y: num(origin.y), z: h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: up[0] + (up[1] - up[0]) * draw(),
      life: life[0] + (life[1] - life[0]) * draw(), age: 0, size: size[0] + (size[1] - size[0]) * draw(), shade: draw(), floor: origin.floor ?? 'rdc',
    });
  }
  return out;
}

// Avance les particules (gravité, aucun rebond) ; une particule qui touche le sol devient une goutte au sol. Renvoie { particles, landed }.
export function stepParticles(particles, dt, cfg) {
  const t = Math.max(0, num(dt));
  const g = num(obj(obj(cfg).particles).gravity, 520);
  const out = [];
  const landed = [];
  for (const q of Array.isArray(particles) ? particles : []) {
    const vz = q.vz - g * t;
    const n = { ...q, x: q.x + q.vx * t, y: q.y + q.vy * t, z: q.z + ((q.vz + vz) / 2) * t, vz, age: q.age + t };
    if (n.z <= 0) landed.push({ x: n.x, y: n.y, size: n.size, shade: n.shade, floor: n.floor });
    else if (n.age < n.life) out.push(n);
  }
  return { particles: out, landed };
}

// Plafond des particules vivantes : les plus anciennes partent d'abord.
export const capParticles = (list, max) => (Array.isArray(list) ? list.slice(Math.max(0, list.length - Math.max(0, Math.floor(num(max))))) : []);

// Taches au sol : objets gelés { x, y, size, shape (0 à 3), angle, born, floor, kind } ; ajout avec plafond (la plus ancienne est évincée).
export function decalsAdd(decals, list, level, cfg, time, seed = 1) {
  const s = settings(cfg, level);
  const d = obj(obj(cfg).decals);
  const shapes = Math.max(1, Math.floor(num(d.shapes, 4)));
  let rng = createRng(Math.trunc(num(seed, 1)));
  const draw = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const added = (Array.isArray(list) ? list : []).map((q) => Object.freeze({
    x: num(q.x), y: num(q.y), size: Math.max(0.1, num(q.size, 2)), shape: Math.floor(draw() * shapes) % shapes, angle: draw() * Math.PI * 2, born: num(time), floor: q.floor ?? 'rdc', kind: q.kind ?? 'goutte',
  }));
  const all = [...(Array.isArray(decals) ? decals : []), ...added];
  return Object.freeze(all.slice(Math.max(0, all.length - s.maxDecals)));
}

// Retire les taches expirées (âge ≥ decalLife).
export function decalsStep(decals, time, level, cfg) {
  const s = settings(cfg, level);
  return Object.freeze((Array.isArray(decals) ? decals : []).filter((d) => num(time) - d.born < s.decalLife));
}

// Opacité d'une tache : 1, puis fondu linéaire pendant les `fade` dernières secondes.
export function decalAlpha(decal, time, level, cfg) {
  const s = settings(cfg, level);
  const age = num(time) - num(decal?.born);
  if (age < 0 || age >= s.decalLife) return 0;
  const left = s.decalLife - age;
  return s.fade > 0 && left < s.fade ? left / s.fade : 1;
}

// Taches d'un tir (gouttes) et d'une mort (une flaque sous le corps) : tailles de blood.json (decals.hitSize, killSize).
export function impactDecals(seed, kind, origin, direction, cfg) {
  const d = obj(obj(cfg).decals);
  let rng = createRng(Math.trunc(num(seed, 1)) + 17);
  const draw = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const sz = range(kind === 'kill' ? d.killSize : d.hitSize, kind === 'kill' ? [16, 24] : [3, 7]);
  const len = Math.hypot(num(direction?.x), num(direction?.y)) || 1;
  const off = kind === 'kill' ? 0 : 6 + 6 * draw();
  return [{ x: num(origin?.x) + (num(direction?.x) / len) * off, y: num(origin?.y) + (num(direction?.y) / len) * off, size: sz[0] + (sz[1] - sz[0]) * draw(), floor: origin?.floor ?? 'rdc', kind }];
}

// Palier de blessure selon la vie restante (0 à 1) : 0 propre, 1 touché, 2 ensanglanté, 3 ensanglanté fort (bornes de blood.json).
export function woundTier(hpFraction, bounds = [0.75, 0.5, 0.25]) {
  const f = isNum(hpFraction) ? Math.min(1, Math.max(0, hpFraction)) : 1;
  const b = Array.isArray(bounds) && bounds.length === 3 ? bounds : [0.75, 0.5, 0.25];
  if (f > b[0]) return 0;
  if (f > b[1]) return 1;
  if (f > b[2]) return 2;
  return 3;
}

// Cadavres visuels { id, x, y, floor, type, anim, born, facing } : au plus `corpses` (6), le plus ancien évincé.
export function corpsesAdd(corpses, corpse, level, cfg) {
  const s = settings(cfg, level);
  if (s.corpses <= 0 || !corpse) return Object.freeze([...(Array.isArray(corpses) ? corpses : [])]);
  const all = [...(Array.isArray(corpses) ? corpses : []), Object.freeze({ ...corpse })];
  return Object.freeze(all.slice(Math.max(0, all.length - s.corpses)));
}
// Retire les cadavres finis : durée de vie (corpseLife, après la chute de 1,2 s) puis enfoncement (sink).
export function corpsesStep(corpses, time, level, cfg, fall = 1.2) {
  const s = settings(cfg, level);
  return Object.freeze((Array.isArray(corpses) ? corpses : []).filter((c) => num(time) - c.born < fall + s.corpseLife + s.sink));
}
// Enfoncement d'un cadavre (0 à 1) : 0 pendant la chute et sa durée de vie, puis de 0 à 1 en `sink` secondes.
export function corpseSink(corpse, time, level, cfg, fall = 1.2) {
  const s = settings(cfg, level);
  const t = num(time) - num(corpse?.born) - fall - s.corpseLife;
  return t <= 0 ? 0 : Math.min(1, t / s.sink);
}

// Coût de dessin du sang à pleine charge : un appel pour les particules, un pour les taches (les cadavres comptent comme des personnages).
export function bloodBudget(cfg, level) {
  const s = settings(cfg, level);
  const b = obj(obj(cfg).budget);
  const particles = s.maxParticles > 0 ? 1 : 0;
  const decals = s.maxDecals > 0 ? 1 : 0;
  return { calls: particles + decals, triangles: s.maxParticles * num(b.particleTriangles, 2) + s.maxDecals * num(b.decalTriangles, 2) };
}

// Atlas des formes de taches (2 × 2 formes, alpha seul, blanc : la couleur vient de la matière) ; renvoie { size, data (RGBA) }.
export function decalAtlas(size = 256, seed = 31) {
  const s = [64, 128, 256].includes(size) ? size : 256;
  const half = s / 2;
  const data = new Uint8ClampedArray(s * s * 4);
  let rng = createRng(Math.trunc(num(seed, 31)));
  const draw = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  // Chaque forme : un disque déformé par des lobes (rayon variable selon l'angle) et quelques gouttes satellites.
  const shapes = Array.from({ length: 4 }, (_, k) => ({
    lobes: Array.from({ length: 5 + k }, () => ({ a: draw() * Math.PI * 2, w: 0.1 + 0.18 * draw(), f: 2 + Math.floor(draw() * 4) })),
    drops: Array.from({ length: 2 + k }, () => ({ a: draw() * Math.PI * 2, d: 0.62 + 0.25 * draw(), r: 0.05 + 0.06 * draw() })).map((d) => ({ ...d, cx: Math.cos(d.a) * d.d * 0.5, cy: Math.sin(d.a) * d.d * 0.5 })),
    base: 0.5 + 0.08 * k,
  }));
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const k = (x >= half ? 1 : 0) + (y >= half ? 2 : 0);
      const u = ((x % half) + 0.5) / half - 0.5;
      const v = ((y % half) + 0.5) / half - 0.5;
      const sh = shapes[k];
      // Les lobes ne font que grandir le rayon (base / 2 au moins) et le disque s'arrête à 0,47 : hors de cette couronne, inutile de les
      // calculer (même résultat, au pixel près, en deux fois moins de temps : l'atlas est construit au démarrage du jeu).
      const dist = Math.hypot(u, v);
      let a = 0;
      if (dist < 0.47 && dist < sh.base * 0.5) a = 1;
      else if (dist < 0.47) {
        const ang = Math.atan2(v, u);
        let r = sh.base * 0.5;
        for (const l of sh.lobes) r += 0.5 * l.w * Math.max(0, Math.cos(l.f * (ang - l.a))) * 0.5;
        a = dist < Math.min(0.47, r) ? 1 : 0;
      }
      for (const d of sh.drops) if (a === 0 && Math.hypot(u - d.cx, v - d.cy) < d.r * 0.5) a = 1;
      const i = (y * s + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  }
  return { size: s, data };
}
