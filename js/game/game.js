// Partie en 3D : affiche avec Three.js l'état simulé par js/core/. Les règles (tirs, dégâts, mouvements) sont dans js/core/ et
// s'enchaînent dans le même ordre qu'au lot 1. Coordonnées : logique (x, y) -> scène (x, 0, y).
import * as THREE from 'three';
import { aimFromPoint, aimFromStick, createAim } from '../core/aim.js';
import { applyImpacts, createWeaponState, displayHealth, muzzlePoint, stepContact, stepWeapon } from '../core/combat.js';
import { stepEnemies } from '../core/enemy-ai.js';
import { innerBounds, moveCircle } from '../core/movement.js';
import { computePose } from '../core/pose.js';
import { createBullet, stepBullets } from '../core/projectile.js';
import { castRay } from '../core/ray.js';
import { createRng } from '../core/rng.js';
import { createSpawner, stepSpawner } from '../core/spawner.js';
import { clampDt } from '../core/vec.js';
import { createCharacter, createKit } from './character.js';
import { createEffects, MAX_SPARKS, SPARK_TIME } from './effects.js';
import { createHud } from './hud.js';
import { pickGround } from './picking.js';
import { STRIDE } from './skeleton.js';
import { fmt } from './texts.js';
import { buildWorld, createCamera } from './world.js';

const RECOIL_TIME = 0.12;
const HIT_FLASH_TIME = 0.1;
const FIRE_POSE_TIME = 0.3;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ctx : { cfg: { room, player, weapon, zombie, render }, palette, dict, input, ui, audio, params, override, seed, seedRun }
// Renvoie null si WebGL n'est pas disponible.
export function createGame(ctx) {
  const { cfg, palette, params } = ctx;
  const { room, render } = cfg;
  const bounds = innerBounds(room);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.shadowMap.enabled = params.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('game-canvas').appendChild(renderer.domElement);

  const world = buildWorld({ palette, room, render, maxAnisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
  const rig = createCamera(render.camera, room, params.tilt);
  const kit = createKit(palette);
  const effects = createEffects(world.scene, palette, { gunHeight: render.gunHeight, bulletRadius: cfg.weapon.bulletRadius });
  const hud = createHud(ctx.dict);
  const playerChar = createCharacter(kit, 'player');
  world.scene.add(playerChar.root);
  const zombies = new Map(); // id -> { char, phase, x, y, flashing }
  const spare = [];

  let sim;
  let anim;
  let lastFire;
  let sparks;
  let laser;
  let lastPose = computePose({});
  let lastInfo = { calls: 0, triangles: 0 };
  let size = { width: 1, height: 1, unitsPerPixel: 1 };
  let stale = true; // vrai tant que l'image affichée n'est pas à jour

  // Partie neuve : état pur remis à zéro, zombies retirés (leurs personnages vont dans le stock).
  function reset(seed) {
    for (const z of zombies.values()) {
      world.scene.remove(z.char.root);
      z.char.setFlash(false);
      spare.push(z.char);
    }
    zombies.clear();
    sim = {
      player: { x: room.width / 2, y: room.height / 2, r: cfg.player.radius, health: cfg.player.health, maxHealth: cfg.player.health },
      aim: createAim(0),
      enemies: [],
      bullets: [],
      weapon: createWeaponState(),
      spawner: createSpawner(),
      rng: createRng(seed),
      kills: 0,
      time: 0,
      nextId: 1,
      dead: false,
      flash: 0,
      recoil: 0,
      lifeBucket: 10,
    };
    anim = { phase: 0, facing: 0, x: sim.player.x, y: sim.player.y };
    lastFire = -10;
    sparks = [];
    laser = null;
    ctx.ui.setLive('');
  }

  // Taille du canvas = fenêtre × ratio d'écran (plafonné) ; la caméra fait tenir toute la salle.
  function applySize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.maxRatio));
    renderer.setSize(width, height);
    rig.resize(width, height);
    size = { width, height, unitsPerPixel: (2 * rig.view.distance * Math.tan((render.camera.fov * Math.PI) / 360)) / height };
    stale = true;
    ctx.input.refresh();
  }

  function addEnemy(x, y) {
    const { zombie } = cfg;
    const enemy = { id: sim.nextId, x, y, r: zombie.radius, health: zombie.health, maxHealth: zombie.health, hitCooldown: 0, flash: 0 };
    sim.nextId += 1;
    sim.enemies = [...sim.enemies, enemy];
    return enemy;
  }

  // Visée : le dernier point d'écran du pointeur est converti en point du sol à chaque image (donc juste après un redimensionnement).
  function aimAngle(prev) {
    const { input, override } = ctx;
    const from = sim.player;
    if (override.aim) {
      if (typeof override.aim.angle === 'number') return createAim(override.aim.angle);
      return aimFromPoint(prev, from, override.aim);
    }
    if (input.type() === 'touch') return aimFromStick(prev, input.aimStick());
    const ground = pickGround(rig.camera, input.pointer(), { left: 0, top: 0, width: size.width, height: size.height });
    return ground ? aimFromPoint(prev, from, ground) : prev;
  }

  function step(dt) {
    const { input, override, audio } = ctx;
    const weapon = cfg.weapon;
    sim.time += dt;

    const dir = override.move ?? input.move();
    const pos = moveCircle(sim.player, dir, cfg.player.speed, dt, room);
    sim.player = { ...sim.player, ...pos };
    sim.aim = aimAngle(sim.aim);

    // Laser : sert à viser et à déclencher le tir, jamais aux dégâts.
    const muzzle = muzzlePoint(sim.player, sim.aim.angle, weapon.muzzleOffset, bounds);
    const ray = castRay(muzzle, sim.aim.angle, weapon.laserRange, sim.enemies, bounds);
    laser = { from: muzzle, ray };

    const trigger = stepWeapon(sim.weapon, dt, ray.hit !== null, weapon, sim.bullets.length);
    sim.weapon = trigger.state;
    if (trigger.fire) {
      sim.bullets = [...sim.bullets, createBullet(muzzle, sim.aim.angle, weapon, sim.nextId)];
      sim.nextId += 1;
      sim.flash = reduced ? weapon.muzzleFlash / 2 : weapon.muzzleFlash;
      sim.recoil = RECOIL_TIME;
      lastFire = sim.time;
      audio?.play('shoot');
    }

    // Balles : les dégâts n'existent qu'à l'impact.
    const flight = stepBullets(sim.bullets, sim.enemies, dt, bounds);
    sim.bullets = flight.bullets;
    const result = applyImpacts(sim.enemies, flight.impacts);
    sim.enemies = result.enemies;
    if (!reduced) for (const impact of flight.impacts) sparks.push({ x: impact.x, y: impact.y, age: 0 });
    for (const hit of result.hits) if (hit.health > 0) audio?.play('hit');
    for (let i = 0; i < result.killed.length; i += 1) {
      sim.kills += 1;
      audio?.play('kill');
    }

    sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie);

    if (!params.nospawn) {
      const spawn = stepSpawner(sim.spawner, dt, sim.enemies.length, cfg.zombie, room.windows, sim.rng);
      sim.spawner = spawn.state;
      sim.rng = spawn.rng;
      if (spawn.spawn) addEnemy(spawn.spawn.x, spawn.spawn.y);
    }

    const contact = stepContact(sim.player, sim.enemies, dt, cfg.zombie);
    sim.player = contact.player;
    sim.enemies = contact.enemies;
    if (contact.damage > 0) audio?.play('hurt');

    const bucket = Math.ceil((displayHealth(sim.player.health) / sim.player.maxHealth) * 10);
    if (bucket !== sim.lifeBucket && sim.player.health > 0) {
      sim.lifeBucket = bucket;
      ctx.ui.setLive(fmt(ctx.dict['game.live.life'], { hp: displayHealth(sim.player.health), max: sim.player.maxHealth }));
    }
    if (sim.player.health <= 0) {
      sim.dead = true;
      input.releaseAll();
      ctx.ui.setLive(fmt(ctx.dict['game.live.dead'], { n: sim.kills }));
      ctx.ui.showEnd(sim.kills);
    }
  }

  // Place les personnages, le laser et les effets d'après l'état simulé, puis la lumière.
  function draw(dt) {
    sim.flash = Math.max(0, sim.flash - dt);
    sim.recoil = Math.max(0, sim.recoil - dt);
    for (const spark of sparks) spark.age += dt;
    sparks = sparks.filter((s) => s.age < SPARK_TIME).slice(-MAX_SPARKS);

    const p = sim.player;
    const safe = Math.max(dt, 1e-4);
    const speed = Math.hypot(p.x - anim.x, p.y - anim.y) / safe;
    const moving = speed > 8;
    const aim = sim.aim.angle;
    let target = anim.facing;
    let dir = 1;
    if (moving) {
      const moveAngle = Math.atan2(p.y - anim.y, p.x - anim.x);
      dir = Math.abs(wrap(aim - moveAngle)) > Math.PI / 2 ? -1 : 1;
      target = dir > 0 ? moveAngle : moveAngle + Math.PI;
    } else if (Math.abs(wrap(aim - anim.facing)) > 0.9) {
      target = aim;
    }
    anim.facing = wrap(anim.facing + wrap(target - anim.facing) * Math.min(1, dt * 14));
    anim.phase += dir * speed * dt * STRIDE;
    anim.x = p.x;
    anim.y = p.y;
    const state = sim.time - lastFire < FIRE_POSE_TIME ? 'tir' : moving ? 'marche' : 'arret';
    lastPose = computePose({ phase: anim.phase, aim, facing: anim.facing, state, time: sim.time, seed: 0, amount: Math.min(1, speed / cfg.player.speed), recoil: sim.recoil / RECOIL_TIME });
    playerChar.setPose(lastPose);
    playerChar.root.position.set(p.x, 0, p.y);
    playerChar.root.rotation.y = Math.PI / 2 - anim.facing;

    const alive = new Set();
    for (const e of sim.enemies) {
      alive.add(e.id);
      let z = zombies.get(e.id);
      if (!z) {
        z = { char: spare.pop() ?? createCharacter(kit, 'zombie'), phase: 0, x: e.x, y: e.y, flashing: false };
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
      const flashing = e.flash > 0;
      if (flashing !== z.flashing) {
        z.flashing = flashing;
        z.char.setFlash(flashing);
      }
      if (flashing) e.flash = reduced ? 0 : Math.max(0, e.flash - dt / HIT_FLASH_TIME);
    }
    // Les zombies tués disparaissent (sang et corps au lot 8).
    for (const [id, z] of zombies) {
      if (alive.has(id)) continue;
      world.scene.remove(z.char.root);
      z.char.setFlash(false);
      spare.push(z.char);
      zombies.delete(id);
    }

    effects.update({
      laser: laser && !sim.dead ? laser : null,
      bullets: sim.bullets,
      sparks,
      flash: sim.flash,
      flashSize: reduced ? 4 : 7,
      unitsPerPixel: size.unitsPerPixel,
    });
    hud.update(sim.player, sim.kills);
    world.followSun(p.x, p.y);
  }

  let last = null;
  let frameId = 0;
  function frame(now) {
    frameId = requestAnimationFrame(frame);
    const dt = last === null ? 0 : clampDt((now - last) / 1000);
    last = now;
    const paused = ctx.ui.isPaused();
    // En pause rien ne bouge : une dernière image suffit (ou après un redimensionnement), puis on n'affiche plus rien.
    if (paused && !stale) return;
    stale = !paused;
    if (!paused && !sim.dead) step(dt);
    draw(paused ? 0 : dt);
    renderer.render(world.scene, rig.camera);
    lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }

  // Aucune boucle de rendu quand l'onglet est caché.
  function start() {
    if (frameId) return;
    last = null;
    frameId = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('resize', applySize);

  reset(ctx.seed);
  applySize();
  draw(0);
  if (!document.hidden) start();

  return {
    get sim() {
      return sim;
    },
    addEnemy,
    // Remet une partie propre (Rejouer, Recommencer).
    restart() {
      ctx.seedRun += 1;
      reset(ctx.seed + ctx.seedRun);
    },
    snapshot() {
      const cam = rig.camera.position;
      return {
        player: { x: sim.player.x, y: sim.player.y, health: sim.player.health },
        aim: sim.aim.angle,
        enemies: sim.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, health: e.health })),
        bullets: sim.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, angle: b.angle })),
        kills: sim.kills,
        camera: { x: cam.x, y: cam.y, z: cam.z, distance: rig.view.distance, tilt: rig.view.tilt },
        render: { ...lastInfo },
        pose: { ...playerChar.readPose(), expected: { ...lastPose } },
        paused: ctx.ui.isPaused(),
        dead: sim.dead,
        time: sim.time,
        audio: { started: ctx.audio.started, muted: ctx.audio.muted },
      };
    },
  };
}
