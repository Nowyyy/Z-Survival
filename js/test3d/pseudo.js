// Page pseudo-3D : le rendu qu'on aurait en restant sur Phaser (2D, vue strictement verticale, relief peint),
// animé par les mêmes angles de pose.js que la page Three.js.
import { clampDt } from '../core/vec.js';
import { drawFloor } from './floor.js';
import { readPalette } from './palette.js';
import { computePose } from './pose.js';
import { buildReport, collectEnvironment, testDate } from './report.js';
import { FORE, HIP_X, SHIN, SHOULDER_X, STRIDE, THIGH, UPPER } from './skeleton.js';
import { summarize } from './stats.js';
import { T, applyTextes, fmt } from './textes.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const QUICK = params.get('bench') === 'quick';
const MEASURE = QUICK ? 1 : 6;
const WARMUP = QUICK ? 0.25 : 1;
const WORLD = { w: 1600, h: 900 };
const CENTER = { x: 800, y: 450 };
const VIEW_HEIGHT = 530; // unités visibles en hauteur : la même couverture que la page Three.js à 75°
const RELIEF = 0.22; // décalage d'écran par unité de hauteur : l'effet « relief peint »
const LIGHT = { x: 0.55, y: 0.4 }; // ombres portées vers le bas à droite
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

applyTextes();
const canvas = $('t3d-canvas');
const ctx = canvas.getContext('2d');
const palette = readPalette();
const floor = drawFloor(Object.assign(document.createElement('canvas'), { width: 1024, height: 576 }), palette);

let scale = 1;
let ratio = 1;
function resize() {
  ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(innerWidth * ratio));
  canvas.height = Math.max(1, Math.round(innerHeight * ratio));
  scale = (canvas.height / VIEW_HEIGHT);
}

// Monde -> écran (pixels du canvas), centré sur la salle.
const sx = (x) => canvas.width / 2 + (x - CENTER.x) * scale;
const sy = (y) => canvas.height / 2 + (y - CENTER.y) * scale;

function softShadow(x, y, rx, ry, rot = 0) {
  ctx.fillStyle = palette.shade;
  for (let i = 0; i < 4; i += 1) {
    const k = 1 + (3 - i) * 0.22;
    ctx.globalAlpha = 0.085;
    ctx.beginPath();
    ctx.ellipse(sx(x), sy(y), rx * k * scale, ry * k * scale, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function line(ax, ay, bx, by, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx(ax), sy(ay));
  ctx.lineTo(sx(bx), sy(by));
  ctx.stroke();
}

function blob(x, y, rx, ry, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(sx(x), sy(y), rx * scale, ry * scale, rot, 0, Math.PI * 2);
  ctx.fill();
}

// Rectangle arrondi orienté : l'axe local x regarde vers l'angle rot.
function plate(x, y, w, d, rot, color, light = 0.14) {
  ctx.save();
  ctx.translate(sx(x), sy(y));
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect((-w / 2) * scale, (-d / 2) * scale, w * scale, d * scale, Math.min(w, d) * 0.3 * scale);
  ctx.fill();
  ctx.fillStyle = palette.highlight;
  ctx.globalAlpha = light;
  ctx.beginPath();
  ctx.roundRect((-w / 2) * scale, (-d / 2) * scale, w * scale, (d / 3) * scale, Math.min(w, d) * 0.25 * scale);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Personnage vu du dessus, dessiné avec les angles de computePose(). kind : 'player' ou 'zombie'.
function drawCharacter(c, pose) {
  const colors = c.kind === 'player'
    ? { skin: palette.skin, outfit: palette.outfit, trousers: palette.trousers, boot: palette.boot }
    : { skin: palette.zombieSkin, outfit: palette.zombieClothes, trousers: palette.zombieTrousers, boot: palette.zombieTrousers };
  const up = (z) => z * RELIEF; // relief : plus c'est haut, plus c'est décalé vers le haut de l'écran
  const f = { x: Math.cos(c.facing), y: Math.sin(c.facing) };
  const r = { x: -f.y, y: f.x };
  const torsoYaw = c.facing + pose.torsoTwist;
  const tf = { x: Math.cos(torsoYaw), y: Math.sin(torsoYaw) };
  const tr = { x: -tf.y, y: tf.x };

  softShadow(c.x + LIGHT.x * 26, c.y + LIGHT.y * 26, 17, 11);

  // Jambes : la projection d'une jambe qui balance se raccourcit et s'allonge ; le pied levé se décale vers le haut de l'écran.
  for (const [name, side] of [['L', -1], ['R', 1]]) {
    const h = pose[`hip${name}`];
    const k = pose[`knee${name}`];
    const reach = THIGH * Math.sin(h) + SHIN * Math.sin(h - k);
    const drop = THIGH * Math.cos(h) + SHIN * Math.cos(h - k);
    const hx = c.x + r.x * side * HIP_X;
    const hy = c.y + r.y * side * HIP_X - up(26);
    const fx = hx + f.x * reach;
    const fy = hy + f.y * reach + up(26 - drop);
    const kx = hx + f.x * THIGH * Math.sin(h);
    const ky = hy + f.y * THIGH * Math.sin(h);
    line(hx, hy, kx, ky, 6.4, colors.trousers);
    line(kx, ky, fx, fy, 5.6, colors.trousers);
    plate(fx + f.x * 2.6, fy + f.y * 2.6, 11, 6, c.facing, colors.boot, 0.1);
  }
  plate(c.x, c.y - up(28), 9, 15, c.facing, colors.trousers);

  // Tronc, tourné vers la visée.
  plate(c.x, c.y - up(38), 10, 19, torsoYaw, colors.outfit);

  // Bras : épaule et coude, bras du joueur ramenés vers l'arme.
  const hands = {};
  for (const [name, side] of [['L', -1], ['R', 1]]) {
    const shoulder = pose[`shoulder${name}`];
    const elbow = pose[`elbow${name}`];
    const inward = pose[`inward${name}`];
    const yaw = torsoYaw - side * inward;
    const d = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const ax = c.x + tr.x * side * SHOULDER_X;
    const ay = c.y + tr.y * side * SHOULDER_X - up(44);
    const ex = ax + d.x * UPPER * Math.sin(shoulder);
    const ey = ay + d.y * UPPER * Math.sin(shoulder);
    const hx = ex + d.x * FORE * Math.sin(shoulder + elbow);
    const hy = ey + d.y * FORE * Math.sin(shoulder + elbow);
    line(ax, ay, ex, ey, 5.2, colors.outfit);
    line(ex, ey, hx, hy, 4.4, colors.skin);
    blob(hx, hy, 2.6, 2.6, 0, colors.skin);
    hands[name] = { x: hx, y: hy };
  }
  if (c.kind === 'player') {
    const h = hands.R;
    line(h.x - tf.x * 1, h.y - tf.y * 1, h.x + tf.x * 8, h.y + tf.y * 8, 3, palette.gun);
    blob(hands.L.x, hands.L.y, 2.6, 2.6, 0, colors.skin);
  }

  // Tête : au-dessus du tronc, penchée vers l'avant par headTilt.
  const hx = c.x + tf.x * pose.headTilt * 6;
  const hy = c.y + tf.y * pose.headTilt * 6 - up(52);
  blob(hx, hy, 5.2, 5.8, torsoYaw, colors.skin);
  if (c.kind === 'player') blob(hx - tf.x * 1.2, hy - tf.y * 1.2, 5.3, 5.6, torsoYaw, colors.trousers);
  ctx.globalAlpha = 0.18;
  blob(hx - 1.2, hy - 1.6, 2.6, 2, 0, palette.highlight);
  ctx.globalAlpha = 1;
}

function drawBox(f) {
  const side = f.h * RELIEF;
  softShadow(f.x + LIGHT.x * f.h * 0.9, f.y + LIGHT.y * f.h * 0.9, f.w * 0.62, f.d * 0.62);
  ctx.fillStyle = palette.furnitureA;
  ctx.fillRect(sx(f.x - f.w / 2), sy(f.y - f.d / 2 + f.d) - side * scale, f.w * scale, side * scale + 0.5);
  ctx.fillStyle = palette.shade;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(sx(f.x - f.w / 2), sy(f.y - f.d / 2 + f.d) - side * scale, f.w * scale, side * scale + 0.5);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.furnitureA;
  ctx.fillRect(sx(f.x - f.w / 2), sy(f.y - f.d / 2) - side * scale, f.w * scale, f.d * scale);
  ctx.fillStyle = palette.highlight;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(sx(f.x - f.w / 2), sy(f.y - f.d / 2) - side * scale, f.w * scale, (f.d / 3) * scale);
  ctx.globalAlpha = 1;
}

// --- Scène animée : un joueur qui tourne en tirant, trois zombies qui marchent en boucle ---
const FURNITURE = { x: 1010, y: 380, w: 90, d: 60, h: 40 };
const ZOMBIES = [
  { seed: 11, cx: 640, cy: 330, radius: 60, speed: 38, start: 0 },
  { seed: 12, cx: 960, cy: 560, radius: 80, speed: 44, start: 2 },
  { seed: 13, cx: 700, cy: 590, radius: 50, speed: 34, start: 4 },
];

function sceneAt(t) {
  const loop = 0.8;
  const pa = t * loop;
  const player = { x: CENTER.x + Math.cos(pa) * 110, y: CENTER.y + Math.sin(pa) * 110, kind: 'player' };
  const heading = pa + Math.PI / 2;
  const speed = 110 * loop;
  const dist = speed * t;
  const target = ZOMBIES[0];
  const zp = (z) => {
    const a = (t * z.speed) / z.radius + z.start;
    return { x: z.cx + Math.cos(a) * z.radius, y: z.cy + Math.sin(a) * z.radius, heading: a + Math.PI / 2 };
  };
  const tp = zp(target);
  const aim = Math.atan2(tp.y - player.y, tp.x - player.x);
  const since = t % 1.2;
  const recoil = since < 0.12 ? 1 - since / 0.12 : 0;
  const playerPose = computePose({ phase: dist * STRIDE, aim, facing: heading, state: since < 0.4 ? 'tir' : 'marche', time: t, seed: 0, amount: 1, recoil });
  const zombies = ZOMBIES.map((z) => {
    const p = zp(z);
    const walked = t * z.speed;
    return { c: { x: p.x, y: p.y, facing: p.heading, kind: 'zombie' }, pose: computePose({ phase: walked * STRIDE, aim: 0, facing: 0, state: 'zombie', time: t, seed: z.seed, amount: 0.7 }) };
  });
  return { player: { c: { ...player, facing: heading }, pose: playerPose }, zombies, aim, recoil };
}

function render(t) {
  const w = WORLD.w * scale;
  const h = WORLD.h * scale;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(floor, sx(0), sy(0), w, h);
  const s = sceneAt(reduced ? Math.floor(t * 2) / 2 : t);
  drawBox(FURNITURE);
  const actors = [...s.zombies.map((z) => ({ y: z.c.y, ...z })), { y: s.player.c.y, ...s.player }].sort((a, b) => a.y - b.y);
  for (const a of actors) drawCharacter(a.c, a.pose);
  // Laser rouge : de l'arme vers la visée.
  const p = s.player.c;
  const mx = p.x + Math.cos(s.aim) * 26;
  const my = p.y + Math.sin(s.aim) * 26 - 43 * RELIEF;
  line(mx, my, mx + Math.cos(s.aim) * 260, my + Math.sin(s.aim) * 260, 1.6, palette.laser);
}

// --- Mesures ---
const recent = [];
const results = [];
let measuring = null; // { elapsed, frames }
let reportText = '';
const metrics = $('t3d-metrics');
let metricsAt = 0;
const status = (text) => {
  $('t3d-status').textContent = text;
};
function currentReport() {
  return buildReport({
    title: 'Z-Survival — Test 3D jetable — rapport de la page pseudo-3D (Canvas 2D)',
    threeVersion: 'non utilisée (page 2D, rendu qu\'on aurait avec Phaser)',
    date: testDate(),
    env: collectEnvironment(window, ''),
    results,
    total: results.length,
    quick: QUICK,
  });
}
function finishMeasure() {
  results.push({ config: { label: 'pseudo-3D Canvas 2D, 1 joueur, 3 zombies' }, ...summarize(measuring.frames), calls: 0, triangles: 0, pixelRatio: ratio, width: canvas.width, height: canvas.height });
  measuring = null;
  reportText = currentReport();
  $('t3d-report').value = reportText;
  $('t3d-measure').textContent = fmt(T.mesure, { s: MEASURE });
  status(T.mesureFinie);
  $('t3d-panel').hidden = false;
  $('t3d-toggle').setAttribute('aria-expanded', 'true');
}

let raf = 0;
let last = 0;
let time = 0;
let frames = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const ms = last ? now - last : 0;
  last = now;
  if (ms <= 0) return;
  frames += 1;
  time += clampDt(ms / 1000);
  render(time);
  recent.push({ t: now, ms });
  while (recent.length > 1 && recent[0].t < now - 2000) recent.shift();
  if (measuring) {
    measuring.elapsed += ms / 1000;
    if (measuring.elapsed > WARMUP) measuring.frames.push(ms);
    if (measuring.elapsed >= MEASURE) finishMeasure();
  }
  if (now - metricsAt >= 250) {
    metricsAt = now;
    const times = summarize(recent.map((f) => f.ms));
    metrics.textContent = `${T.fps} : ${times.fps.toFixed(1)} · ${T.median} ${times.median.toFixed(1)} ms · ${T.canvas} ${canvas.width}×${canvas.height}${measuring ? ` · ${T.mesureEnCours}` : ''}`;
  }
}

function startMeasure() {
  if (measuring) return;
  measuring = { elapsed: 0, frames: [] };
  $('t3d-measure').textContent = T.mesureEnCours;
  status(T.mesureEnCours);
}

async function copyReport() {
  const text = reportText || currentReport();
  $('t3d-report').value = text;
  try {
    await navigator.clipboard.writeText(text);
    status(T.copie);
  } catch {
    $('t3d-report').focus();
    $('t3d-report').select();
    status(T.copieRefusee);
  }
}

function togglePanel() {
  const panel = $('t3d-panel');
  panel.hidden = !panel.hidden;
  $('t3d-toggle').setAttribute('aria-expanded', String(!panel.hidden));
}

$('t3d-toggle').addEventListener('click', togglePanel);
$('t3d-measure').addEventListener('click', startMeasure);
$('t3d-copy').addEventListener('click', copyReport);
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
    if (measuring) {
      measuring = null;
      $('t3d-measure').textContent = fmt(T.mesure, { s: MEASURE });
      status(T.benchInterrompu);
    }
  } else if (!raf) {
    last = 0;
    raf = requestAnimationFrame(frame);
  }
});

resize();
$('t3d-measure').textContent = fmt(T.mesure, { s: MEASURE });
canvas.hidden = false;
$('t3d-toggle').hidden = false;
metrics.hidden = false;
if (innerHeight >= 600) togglePanel();
if (!document.hidden) raf = requestAnimationFrame(frame);

if (TEST) {
  window.__t3dPseudo = {
    getState: () => ({
      ready: frames > 0,
      time,
      frames,
      canvas: { width: canvas.width, height: canvas.height },
      measure: { running: measuring !== null, results: results.length },
      report: reportText,
    }),
  };
}
