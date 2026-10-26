// Page Three.js du test jetable : jeu minimal (logique de js/core/ sans modification), mesures en direct, banc d'essai, rapport.
import * as THREE from '../../vendor/three/three.module.js';
import { aimFromPoint, aimFromStick, createAim } from '../core/aim.js';
import { applyImpacts, createWeaponState, muzzlePoint, stepContact, stepWeapon } from '../core/combat.js';
import { stepEnemies } from '../core/enemy-ai.js';
import { innerBounds, moveCircle } from '../core/movement.js';
import { createBullet, stepBullets } from '../core/projectile.js';
import { castRay } from '../core/ray.js';
import { createRng, nextFloat, nextInt } from '../core/rng.js';
import { createSpawner, stepSpawner } from '../core/spawner.js';
import { clampDt, fromAngle } from '../core/vec.js';
import { createBench } from './bench.js';
import { createCharacter, createKit } from './character.js';
import { createInput } from './input.js';
import { readPalette } from './palette.js';
import { computePose } from './pose.js';
import { buildReport, collectEnvironment, readRendererName, testDate } from './report.js';
import { buildWorld, createCameraRig } from './scene.js';
import { STRIDE } from './skeleton.js';
import { median, mean } from './stats.js';
import { T, applyTextes, fmt } from './textes.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const QUICK = params.get('bench') === 'quick';
const SEED = Number.isFinite(Number(params.get('seed'))) && params.get('seed') !== null ? Number(params.get('seed')) : 1;
const NO_SPAWN = params.get('nospawn') === '1';
const json = (path) => fetch(new URL(path, import.meta.url)).then((r) => r.json());

const RECOIL_TIME = 0.12;
const GUN_Y = 43; // hauteur du canon, laser et balles
const LIVE_WINDOW = 2000;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const fail = (message) => {
  $('t3d-root').hidden = true;
  $('t3d-error').textContent = message;
  $('t3d-error').hidden = false;
  if (TEST) window.__t3d = { getState: () => ({ webgl: false, ready: false }) };
};

applyTextes();
const [sceneCfg, benchCfg, room, playerCfg, enemiesCfg, weaponsCfg, vendor] = await Promise.all([
  json('../../data/test3d/scene.json'), json('../../data/test3d/bench.json'), json('../../data/game/room.json'),
  json('../../data/game/player.json'), json('../../data/game/enemies.json'), json('../../data/game/weapons.json'),
  json('../../vendor/three/version.json').catch(() => ({ version: `r${THREE.REVISION}` })),
]);
const cfg = { room, player: playerCfg, zombie: enemiesCfg.zombie, weapon: weaponsCfg.pistol };
const bounds = innerBounds(room);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  renderer = null;
}
if (!renderer) {
  fail(T.webglAbsent);
} else {
  start();
}

function start() {
  const palette = readPalette();
  const settings = { camera: sceneCfg.camera.default, shadows: true, maxPixelRatio: 2, zombies: 5, autoplay: false };
  renderer.shadowMap.enabled = true;
  $('t3d-view').appendChild(renderer.domElement);
  const world = buildWorld({ palette, sceneCfg, room, maxAnisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
  const rig = createCameraRig(sceneCfg.camera, innerWidth / innerHeight);
  const kit = createKit(palette);
  const raycaster = new THREE.Raycaster();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_Y);
  const aimHit = new THREE.Vector3();

  // Laser, balles, flash de bouche : matériaux et géométries partagés.
  const laserMat = new THREE.MeshBasicMaterial({ color: palette.laser, fog: false });
  const bulletMat = new THREE.MeshBasicMaterial({ color: palette.bullet, fog: false });
  const dotGeo = new THREE.SphereGeometry(1, 8, 6);
  const laser = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), laserMat);
  const laserDot = new THREE.Mesh(dotGeo, laserMat);
  laserDot.scale.setScalar(3);
  const flash = new THREE.Mesh(dotGeo, bulletMat);
  flash.scale.setScalar(6);
  flash.visible = false;
  world.scene.add(laser, laserDot, flash);
  const bulletMeshes = new Map();

  const playerChar = createCharacter(kit, 'player');
  world.scene.add(playerChar.root);
  const zombies = new Map(); // id -> { char, phase, x, z }
  const spare = [];

  const root = $('t3d-root');
  const input = createInput(root, { onCommand: (c) => c === 'pause' && togglePanel() });
  const override = {};
  let sim;
  let anim;
  let lastFire = -10;

  function resetSim(seed) {
    for (const z of zombies.values()) {
      world.scene.remove(z.char.root);
      spare.push(z.char);
    }
    zombies.clear();
    for (const mesh of bulletMeshes.values()) world.scene.remove(mesh);
    bulletMeshes.clear();
    sim = {
      player: { x: room.width / 2, y: room.height / 2, r: cfg.player.radius, health: cfg.player.health, maxHealth: cfg.player.health },
      aim: createAim(0), enemies: [], bullets: [], weapon: createWeaponState(), spawner: createSpawner(), rng: createRng(seed),
      kills: 0, time: 0, nextId: 1, dead: false, deadTimer: 0, flash: 0, recoil: 0, laser: null,
    };
    anim = { phase: 0, facing: 0, x: sim.player.x, y: sim.player.y };
    lastFire = -10;
    // La population de départ est là d'emblée : les mesures partent d'un état comparable.
    for (let i = 0; i < settings.zombies && !NO_SPAWN; i += 1) {
      const at = spawnPoint();
      addEnemy(at.x, at.y);
    }
    rig.snap(sim.player.x, sim.player.y);
  }

  // Apparition : aux fenêtres en jeu normal ; en autoplay (donc au banc d'essai), sur un anneau autour du joueur, pour que la scène reste chargée.
  function spawnPoint() {
    if (!settings.autoplay) {
      const pick = nextInt(sim.rng, room.windows.length);
      sim.rng = pick.rng;
      return room.windows[pick.value];
    }
    const a = nextFloat(sim.rng);
    const d = nextFloat(a.rng);
    sim.rng = d.rng;
    const angle = a.value * Math.PI * 2;
    const dist = 160 + d.value * 180;
    const r = cfg.zombie.radius;
    return {
      x: Math.min(Math.max(sim.player.x + Math.cos(angle) * dist, bounds.minX + r), bounds.maxX - r),
      y: Math.min(Math.max(sim.player.y + Math.sin(angle) * dist, bounds.minY + r), bounds.maxY - r),
    };
  }

  function addEnemy(x, y) {
    const z = cfg.zombie;
    const enemy = { id: sim.nextId, x, y, r: z.radius, health: z.health, maxHealth: z.health, hitCooldown: 0, flash: 0 };
    sim.nextId += 1;
    sim.enemies = [...sim.enemies, enemy];
    return enemy;
  }

  function aimAngle(prev) {
    if (override.aim) return typeof override.aim.angle === 'number' ? createAim(override.aim.angle) : aimFromPoint(prev, sim.player, override.aim);
    if (settings.autoplay) {
      const near = sim.enemies.reduce((best, e) => {
        const d = Math.hypot(e.x - sim.player.x, e.y - sim.player.y);
        return !best || d < best.d ? { d, e } : best;
      }, null);
      return near ? aimFromPoint(prev, sim.player, near.e) : createAim(sim.time * 1.5);
    }
    if (input.type() === 'touch') return aimFromStick(prev, input.aimStick());
    const pointer = input.pointer();
    if (!pointer) return prev;
    raycaster.setFromCamera(new THREE.Vector2((pointer.x / innerWidth) * 2 - 1, -(pointer.y / innerHeight) * 2 + 1), rig.camera);
    return raycaster.ray.intersectPlane(aimPlane, aimHit) ? aimFromPoint(prev, sim.player, { x: aimHit.x, y: aimHit.z }) : prev;
  }

  function moveDir() {
    if (override.move) return override.move;
    if (settings.autoplay) return fromAngle(sim.time * 0.7);
    return input.move();
  }

  function step(dt) {
    sim.time += dt;
    if (sim.dead) {
      sim.deadTimer -= dt;
      if (sim.deadTimer <= 0) resetSim(SEED);
      return;
    }
    const weapon = cfg.weapon;
    const pos = moveCircle(sim.player, moveDir(), cfg.player.speed, dt, room);
    sim.player = { ...sim.player, ...pos };
    sim.aim = aimAngle(sim.aim);

    // Laser : vise et déclenche le tir, ne blesse jamais. Les dégâts viennent des balles (impact).
    const muzzle = muzzlePoint(sim.player, sim.aim.angle, weapon.muzzleOffset, bounds);
    const ray = castRay(muzzle, sim.aim.angle, weapon.laserRange, sim.enemies, bounds);
    sim.laser = { from: muzzle, ray };
    const trigger = stepWeapon(sim.weapon, dt, ray.hit !== null, weapon, sim.bullets.length);
    sim.weapon = trigger.state;
    if (trigger.fire) {
      sim.bullets = [...sim.bullets, createBullet(muzzle, sim.aim.angle, weapon, sim.nextId)];
      sim.nextId += 1;
      sim.flash = reduced ? 0 : weapon.muzzleFlash;
      sim.recoil = RECOIL_TIME;
      lastFire = sim.time;
    }
    const flight = stepBullets(sim.bullets, sim.enemies, dt, bounds);
    sim.bullets = flight.bullets;
    const result = applyImpacts(sim.enemies, flight.impacts);
    sim.enemies = result.enemies;
    sim.kills += result.killed.length;
    sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie);
    if (!NO_SPAWN) {
      const spawn = stepSpawner(sim.spawner, dt, sim.enemies.length, { ...cfg.zombie, maxPresent: settings.zombies, spawnInterval: 0.8 }, room.windows, sim.rng);
      sim.spawner = spawn.state;
      sim.rng = spawn.rng;
      if (spawn.spawn) {
        const at = settings.autoplay ? spawnPoint() : spawn.spawn;
        addEnemy(at.x, at.y);
      }
    }
    const contact = stepContact(sim.player, sim.enemies, dt, cfg.zombie);
    sim.player = settings.autoplay ? { ...sim.player, health: sim.player.maxHealth } : contact.player;
    sim.enemies = contact.enemies;
    if (sim.player.health <= 0) {
      sim.dead = true;
      sim.deadTimer = 1.5;
      input.releaseAll();
    }
  }

  // Place les personnages, le laser et les balles d'après l'état simulé.
  function sync(dt) {
    sim.flash = Math.max(0, sim.flash - dt);
    sim.recoil = Math.max(0, sim.recoil - dt);
    const safe = Math.max(dt, 1e-4);
    const p = sim.player;
    const vx = (p.x - anim.x) / safe;
    const vy = (p.y - anim.y) / safe;
    const speed = Math.hypot(vx, vy);
    const moving = speed > 8;
    const aim = sim.aim.angle;
    let target = anim.facing;
    let dir = 1;
    if (moving) {
      const moveAngle = Math.atan2(vy, vx);
      dir = Math.abs(wrap(aim - moveAngle)) > Math.PI / 2 ? -1 : 1;
      target = dir > 0 ? moveAngle : moveAngle + Math.PI;
    } else if (Math.abs(wrap(aim - anim.facing)) > 0.9) {
      target = aim;
    }
    anim.facing = wrap(anim.facing + wrap(target - anim.facing) * Math.min(1, dt * 14));
    anim.phase += dir * speed * dt * STRIDE;
    anim.x = p.x;
    anim.y = p.y;
    const state = sim.time - lastFire < 0.3 ? 'tir' : moving ? 'marche' : 'arret';
    playerChar.setPose(computePose({ phase: anim.phase, aim, facing: anim.facing, state, time: sim.time, seed: 0, amount: Math.min(1, speed / cfg.player.speed), recoil: sim.recoil / RECOIL_TIME }));
    playerChar.root.position.set(p.x, 0, p.y);
    playerChar.root.rotation.y = Math.PI / 2 - anim.facing;

    const alive = new Set();
    for (const e of sim.enemies) {
      alive.add(e.id);
      let z = zombies.get(e.id);
      if (!z) {
        z = { char: spare.pop() ?? createCharacter(kit, 'zombie'), phase: 0, x: e.x, y: e.y };
        world.scene.add(z.char.root);
        zombies.set(e.id, z);
      }
      const zs = Math.hypot(e.x - z.x, e.y - z.y) / safe;
      z.phase += zs * dt * STRIDE;
      z.x = e.x;
      z.y = e.y;
      z.char.setPose(computePose({ phase: z.phase, aim: 0, facing: 0, state: 'zombie', time: sim.time, seed: e.id, amount: zs > 5 ? 0.7 : 0.15 }));
      z.char.root.position.set(e.x, 0, e.y);
      z.char.root.rotation.y = Math.PI / 2 - Math.atan2(p.y - e.y, p.x - e.x);
    }
    for (const [id, z] of zombies) {
      if (alive.has(id)) continue;
      world.scene.remove(z.char.root);
      spare.push(z.char);
      zombies.delete(id);
    }

    const visibleBullets = new Set();
    for (const b of sim.bullets) {
      visibleBullets.add(b.id);
      let mesh = bulletMeshes.get(b.id);
      if (!mesh) {
        mesh = new THREE.Mesh(dotGeo, bulletMat);
        mesh.scale.set(cfg.weapon.bulletRadius, cfg.weapon.bulletRadius, cfg.weapon.bulletRadius * 3);
        world.scene.add(mesh);
        bulletMeshes.set(b.id, mesh);
      }
      mesh.position.set(b.x, GUN_Y, b.y);
      mesh.rotation.y = Math.PI / 2 - b.angle;
    }
    for (const [id, mesh] of bulletMeshes) {
      if (visibleBullets.has(id)) continue;
      world.scene.remove(mesh);
      bulletMeshes.delete(id);
    }

    const show = Boolean(sim.laser) && !sim.dead;
    laser.visible = show;
    laserDot.visible = show;
    if (show) {
      const { from, ray } = sim.laser;
      const len = Math.max(0.01, ray.length);
      laser.scale.set(0.9, 0.9, len);
      laser.position.set((from.x + ray.end.x) / 2, GUN_Y, (from.y + ray.end.y) / 2);
      laser.rotation.y = Math.PI / 2 - sim.aim.angle;
      laserDot.position.set(ray.end.x, GUN_Y, ray.end.y);
      flash.visible = sim.flash > 0;
      flash.position.set(from.x, GUN_Y, from.y);
    }
    rig.update(dt, p.x, p.y);
    world.followSun(rig.target.x, rig.target.z);
  }

  // --- Taille, résolution ---
  function applySize() {
    const ratio = Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight));
    rig.setAspect(innerWidth / innerHeight);
  }

  // --- Mesures en direct ---
  const recent = [];
  const metrics = $('t3d-metrics');
  let metricsAt = 0;
  function updateMetrics(now) {
    if (now - metricsAt < 250) return;
    metricsAt = now;
    const times = recent.map((f) => f.ms);
    const avg = mean(times);
    const info = renderer.info.render;
    const c = renderer.domElement;
    const text = `${T.fps} : ${avg > 0 ? (1000 / avg).toFixed(1) : '0.0'} · ${T.median} ${median(times).toFixed(1)} ms · ${T.appels} ${info.calls} · ${T.triangles} ${info.triangles} · ${T.canvas} ${c.width}×${c.height}`;
    if (benchRun.status === 'running') {
      metrics.textContent = `${fmt(T.benchEtat, { n: benchRun.index + 1, total: benchRun.total })} · ${text}`;
    } else {
      metrics.textContent = text;
    }
  }

  // --- Banc d'essai et rapport ---
  let benchRun = createBench(benchCfg, { quick: QUICK });
  let saved = null;
  let reportText = '';
  let rendererName = '';
  const status = (text) => {
    $('t3d-status').textContent = text;
  };
  const currentReport = (interrupted = null) => buildReport({
    threeVersion: `${vendor.version} (r${THREE.REVISION})`, date: testDate(), env: collectEnvironment(window, rendererName), results: benchRun.results,
    total: benchRun.total, quick: QUICK, interrupted,
  });

  function applyConfig(c) {
    settings.zombies = c.zombies;
    settings.shadows = c.shadows;
    settings.maxPixelRatio = c.maxPixelRatio;
    settings.autoplay = true;
    world.setShadows(settings.shadows);
    applySize();
    resetSim(benchCfg.seed);
    refreshUi();
  }

  function startBench() {
    saved = { ...settings };
    const first = benchRun.start();
    status('');
    $('t3d-report').value = '';
    if (first) applyConfig(first);
    refreshUi();
  }

  function finishBench(interrupted = null) {
    reportText = currentReport(interrupted);
    $('t3d-report').value = reportText;
    Object.assign(settings, saved ?? {});
    world.setShadows(settings.shadows);
    applySize();
    resetSim(SEED);
    status(interrupted === 'hidden' ? T.benchInterrompu : T.benchFini);
    $('t3d-panel').hidden = false;
    $('t3d-toggle').setAttribute('aria-expanded', 'true');
    refreshUi();
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

  // --- Interface ---
  function refreshUi() {
    const press = (el, on) => el.setAttribute('aria-pressed', String(on));
    for (const b of document.querySelectorAll('[data-cam]')) press(b, b.dataset.cam === settings.camera);
    for (const b of document.querySelectorAll('[data-res]')) press(b, Number(b.dataset.res) === settings.maxPixelRatio);
    for (const b of document.querySelectorAll('[data-zombies]')) press(b, Number(b.dataset.zombies) === settings.zombies);
    $('t3d-shadows').textContent = settings.shadows ? T.ombresOui : T.ombresNon;
    press($('t3d-shadows'), settings.shadows);
    $('t3d-autoplay').textContent = settings.autoplay ? T.autoplayOui : T.autoplayNon;
    press($('t3d-autoplay'), settings.autoplay);
    $('t3d-bench').textContent = benchRun.status === 'running' ? T.benchStop : T.benchLance;
  }

  function togglePanel() {
    const panel = $('t3d-panel');
    panel.hidden = !panel.hidden;
    $('t3d-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  }

  $('t3d-toggle').addEventListener('click', togglePanel);
  for (const b of document.querySelectorAll('[data-cam]')) {
    b.addEventListener('click', () => {
      if (rig.setPreset(b.dataset.cam)) settings.camera = b.dataset.cam;
      refreshUi();
    });
  }
  for (const b of document.querySelectorAll('[data-res]')) {
    b.addEventListener('click', () => {
      settings.maxPixelRatio = Number(b.dataset.res);
      applySize();
      refreshUi();
    });
  }
  for (const b of document.querySelectorAll('[data-zombies]')) {
    b.addEventListener('click', () => {
      settings.zombies = Number(b.dataset.zombies);
      resetSim(SEED);
      refreshUi();
    });
  }
  $('t3d-shadows').addEventListener('click', () => {
    settings.shadows = !settings.shadows;
    world.setShadows(settings.shadows);
    refreshUi();
  });
  $('t3d-autoplay').addEventListener('click', () => {
    settings.autoplay = !settings.autoplay;
    refreshUi();
  });
  $('t3d-bench').addEventListener('click', () => {
    if (benchRun.status === 'running') {
      benchRun.interrupt();
      finishBench('stop');
    } else {
      benchRun = createBench(benchCfg, { quick: QUICK });
      startBench();
    }
  });
  $('t3d-copy').addEventListener('click', copyReport);
  window.addEventListener('resize', applySize);

  // --- Boucle de rendu : arrêtée quand l'onglet est caché ---
  let raf = 0;
  let last = 0;
  let frames = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const ms = last ? now - last : 0;
    last = now;
    if (ms <= 0) return;
    frames += 1;
    const dt = clampDt(ms / 1000);
    step(dt);
    sync(dt);
    renderer.render(world.scene, rig.camera);
    recent.push({ t: now, ms });
    while (recent.length > 1 && recent[0].t < now - LIVE_WINDOW) recent.shift();
    if (benchRun.status === 'running') {
      const c = renderer.domElement;
      const info = renderer.info.render;
      const out = benchRun.tick(ms, { calls: info.calls, triangles: info.triangles, pixelRatio: renderer.getPixelRatio(), width: c.width, height: c.height });
      if (out.next) applyConfig(out.next);
      else if (out.done) finishBench();
    }
    updateMetrics(now);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      if (benchRun.status === 'running') {
        benchRun.interrupt();
        finishBench('hidden');
      }
    } else if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });

  // --- Démarrage ---
  rendererName = readRendererName(renderer.getContext());
  rig.setPreset(settings.camera);
  world.setShadows(settings.shadows);
  applySize();
  resetSim(SEED);
  $('t3d-bench').textContent = T.benchLance;
  $('t3d-report').placeholder = T.rapportVide;
  refreshUi();
  root.hidden = false;
  $('t3d-toggle').hidden = false;
  metrics.hidden = false;
  if (innerHeight >= 600) togglePanel();
  if (!document.hidden) raf = requestAnimationFrame(frame);

  if (TEST) {
    window.__t3d = {
      getState: () => ({
        webgl: true,
        ready: true,
        camera: { preset: rig.preset, angle: rig.angle },
        shadows: settings.shadows,
        shadowsActive: world.sun.castShadow,
        maxPixelRatio: settings.maxPixelRatio,
        pixelRatio: renderer.getPixelRatio(),
        zombies: settings.zombies,
        enemies: sim.enemies.length,
        autoplay: settings.autoplay,
        player: { x: sim.player.x, y: sim.player.y },
        aim: sim.aim.angle,
        kills: sim.kills,
        time: sim.time,
        frames,
        canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
        bench: { status: benchRun.status, index: benchRun.index, total: benchRun.total, results: benchRun.results.length },
        report: reportText,
        three: { revision: THREE.REVISION, version: vendor.version },
      }),
      setInput: ({ move, aim } = {}) => {
        override.move = move ?? undefined;
        override.aim = aim ?? undefined;
      },
      spawnEnemy: (x, y) => addEnemy(x, y).id,
    };
  }
}
