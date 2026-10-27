// Partie en 3D : affiche avec Three.js l'état simulé par js/core/. Les règles (tirs, dégâts, mouvements) sont dans js/core/ et
// s'enchaînent dans le même ordre qu'au lot 1. Coordonnées : logique (x, y) -> scène (x, 0, y).
import * as THREE from 'three';
import { aimFromPoint, aimFromStick, createAim } from '../core/aim.js';
import { applyImpacts, createWeaponState, displayHealth, healOnKill, muzzlePoint, stepContact, stepWeapon } from '../core/combat.js';
import { stepEnemies } from '../core/enemy-ai.js';
import { createEnemy, isGait, isType } from '../core/enemy-factory.js';
import { entryWindow } from '../core/layout.js';
import { moveCircle } from '../core/movement.js';
import { effectivePlayer, effectiveWeapon, normalizeLevels, STAT_IDS, statValues } from '../core/player-stats.js';
import { createFlowState, createGrid, stepFlow } from '../core/nav.js';
import { computePose } from '../core/pose.js';
import { createBullet, stepBullets } from '../core/projectile.js';
import { castRay } from '../core/ray.js';
import { createRng } from '../core/rng.js';
import { shotAngle, speedRatio, spreadHalfAngle, stepSpreadRatio, toRadians } from '../core/spread.js';
import { createFootsteps, stepFootsteps } from '../core/footsteps.js';
import { isHidden } from '../core/spawner.js';
import { materialFor } from '../core/sound-director.js';
import { variantFor } from '../core/variants.js';
import { clampDt, num } from '../core/vec.js';
import { createDirector, info as waveInfo, setParams, startWave as jumpToWave, stepDirector } from '../core/wave-director.js';
import { waveSpec } from '../core/waves.js';
import { createCharacter, createKit } from './character.js';
import { createEffects, MAX_SPARKS, SPARK_TIME } from './effects.js';
import { createHud } from './hud.js';
import { pickGround } from './picking.js';
import { STRIDE } from './skeleton.js';
import { fmt } from './texts.js';
import { createThreeTextures } from './textures.js';
import { buildWorld, createCamera } from './world.js';

const RECOIL_TIME = 0.12;
const HIT_FLASH_TIME = 0.1;
const FIRE_POSE_TIME = 0.3;
const STEP = 0.05; // pas de la simulation avancée à la demande (hook de test step)
const ANNOUNCE_TIME = 2.5; // durée de l'annonce de vague (E2-8), en secondes de jeu
const TAU = Math.PI * 2;
// Pose de chaque allure (pose.js : « zombie » reste l'équivalent de « marche »).
const GAIT_POSE = { lent: 'lent', marche: 'zombie', rampe: 'rampe', course: 'course' };
// Surcharge temporaire de waves.json (hook de test) : les sections objet sont fusionnées, le reste est remplacé.
const mergeParams = (base, patch) => Object.fromEntries(Object.entries({ ...base, ...patch }).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) && patch?.[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) ? { ...base[k], ...patch[k] } : v]));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ctx : { cfg: { layout, player, weapon, zombie, enemies, gaits, waves, render, camera, nav }, palette, dict, input, ui, audio, params, override, seed, seedRun }
// Renvoie null si WebGL n'est pas disponible.
export function createGame(ctx) {
  const { cfg, palette, params } = ctx;
  const { layout, render } = cfg;
  const bounds = layout.bounds;
  // Les meubles, les murs (percés de leurs fenêtres : on tire à travers) et les obstacles du décor arrêtent le laser, la ligne de tir et
  // les balles ; elles volent jusqu'au bord du monde. Salle du lot 1m (?empty=1) : les limites de la salle, comme avant.
  const blockers = layout.empty ? [] : [...layout.furniture, ...layout.walls, ...layout.decor.solids];
  const shotBounds = layout.empty ? bounds : layout.worldBounds;
  // Les zombies contournent les meubles par un champ de flux ; la salle du lot 1m (?empty=1) garde la poursuite en ligne droite.
  const grid = layout.empty ? null : createGrid(layout.size, layout.zombieObstacles, { cell: cfg.nav.cell, radius: cfg.zombie.radius, inflate: cfg.nav.inflate });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    // ?test=1 : le tampon de dessin est conservé pour que sampleScreen puisse relire l'image.
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.test });
  } catch {
    return null;
  }
  renderer.shadowMap.enabled = params.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('game-canvas').appendChild(renderer.domElement);

  const textures = createThreeTextures(ctx.textureData, renderer);
  const world = buildWorld({ palette, layout, render, textures });
  const rig = createCamera(render.camera, cfg.camera, layout, params.tilt, params.zoom);
  const kit = createKit({ textures, variants: ctx.variants, hit: palette.hit });
  const effects = createEffects(world.scene, palette, { gunHeight: render.gunHeight, bulletRadius: cfg.weapon.bulletRadius });
  const hud = createHud(ctx.dict);
  const playerChar = createCharacter(kit, 'player');
  world.scene.add(playerChar.root);
  const zombies = new Map(); // id -> { char, phase, x, y, flashing }
  const spare = kit.variants.map(() => []); // personnages retirés, un stock par variante (leurs géométries diffèrent)
  // Type de chaque obstacle (meubles et décor solide) pour le son d'impact ; les murs se reconnaissent à leur identifiant.
  const obstacleKinds = new Map([...layout.furniture, ...(layout.decor?.solids ?? [])].map((o) => [o.id, o.kind]));
  const zombieNames = ctx.variants.zombie.variants.map((v) => v.id);
  const typeIndex = new Map(zombieNames.map((name, i) => [name, i])); // type de zombie -> variante visuelle (mêmes noms)
  const audioWalls = layout.empty ? [] : layout.walls;
  const voices = new Map(); // identifiant de zombie -> nom de sa variante visuelle (hauteur de voix)
  const variantName = (id) => voices.get(id) ?? zombieNames[0];

  // Statistiques du joueur (lot 2b) : niveaux (levels-source.js) -> arme et joueur effectifs. Recalculés quand les niveaux changent.
  const eff = {};
  const applyLevels = (levels, earlier = []) => {
    const normal = normalizeLevels(levels, cfg.stats);
    eff.levels = { levels: normal.levels, warnings: [...earlier, ...normal.warnings] };
    eff.values = statValues(eff.levels.levels, cfg.stats);
    eff.weapon = effectiveWeapon(cfg.weapon, eff.levels.levels, cfg.stats);
    eff.player = effectivePlayer(cfg.player, eff.levels.levels, cfg.stats);
    if (sim) sim.player = { ...sim.player, maxHealth: eff.player.maxHealth, health: Math.min(sim.player.health, eff.player.maxHealth) };
  };

  let sim;
  let anim;
  let lastFire;
  let sparks;
  let laser;
  let lastPose = computePose({});
  let lastInfo = { calls: 0, triangles: 0 };
  const shotLog = []; // journal des tirs : { id, time, angle, aimAngle } (tests)
  const spawnLog = []; // journal des apparitions : { id, time, hidden }
  let size = { width: 1, height: 1, unitsPerPixel: 1 };
  let stale = true; // vrai tant que l'image affichée n'est pas à jour

  // Partie neuve : état pur remis à zéro, zombies retirés (leurs personnages vont dans le stock).
  function reset(seed) {
    for (const z of zombies.values()) {
      world.scene.remove(z.char.root);
      z.char.setFlash(false);
      spare[z.char.variant].push(z.char);
    }
    zombies.clear();
    voices.clear();
    spawnLog.length = 0;
    shotLog.length = 0;
    sim = {
      player: { x: layout.start.x, y: layout.start.y, r: cfg.player.radius, health: eff.player.maxHealth, maxHealth: eff.player.maxHealth },
      aim: createAim(0),
      enemies: [],
      bullets: [],
      weapon: createWeaponState(),
      waves: createDirector(cfg.waves, { seed, wave: params.wave ?? 1, inactive: params.nospawn }),
      waveParams: cfg.waves,
      announce: null,
      flow: createFlowState(),
      rng: createRng(seed),
      walk: { phase: 0, steps: createFootsteps() },
      kills: 0,
      time: 0,
      nextId: 1,
      dead: false,
      flash: 0,
      recoil: 0,
      lifeBucket: 10,
      spread: 0, // rapport de vitesse lissé, de 0 (arrêt) à 1 (pleine vitesse)
    };
    anim = { phase: 0, facing: 0, x: sim.player.x, y: sim.player.y };
    rig.snap(sim.player.x, sim.player.y);
    lastFire = -10;
    sparks = [];
    laser = null;
    ctx.ui.setLive('');
    ctx.audio?.reset(seed);
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

  // Rectangle visible au sol (approximation rectangulaire de la vue de la caméra).
  function visibleRect() {
    const t = rig.view.target;
    const g = rig.view.ground;
    return { minX: t.x - g.width / 2, minY: t.y - g.north, maxX: t.x + g.width / 2, maxY: t.y + g.south };
  }

  // Crée un zombie (createEnemy : type, allure, vague). Sans type (zombie de test), c'est un marcheur de la vague 1 en allure « marche »,
  // dont la variante visuelle vient de variantFor comme avant le lot 2.
  function addEnemy(x, y, { type, gait, spec, from } = {}) {
    const typed = isType(type);
    const created = createEnemy(typed ? type : 'marcheur', isGait(gait) ? gait : 'marche', spec ?? waveSpec(1, sim.waveParams), cfg.enemies, cfg.gaits);
    const visual = typed ? typeIndex.get(type) : variantFor(sim.nextId, ctx.seed, kit.variants.length);
    const enemy = {
      id: sim.nextId, x, y, r: created.radius, health: created.hp, maxHealth: created.maxHp, hitCooldown: 0, flash: 0,
      type: created.type, gait: created.gait, speed: created.speed, damage: created.damage, stride: created.stride, visual, ...(from === undefined || from === null ? {} : { from }),
    };
    voices.set(enemy.id, zombieNames[visual]);
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

  // Demi-angle courant du cône, en degrés.
  const halfAngle = () => spreadHalfAngle(sim.spread, eff.values);

  function step(dt) {
    const { input, override, audio } = ctx;
    const weapon = eff.weapon;
    sim.time += dt;

    const events = []; // événements sonores de cette image (traités par js/core/sound-director.js)
    const dir = override.move ?? input.move();
    const before = sim.player;
    const pos = moveCircle(sim.player, dir, eff.player.speed, dt, layout.room, layout.playerObstacles);
    sim.player = { ...sim.player, ...pos };
    // Pas : la phase de marche avance avec la distance réellement parcourue (même rythme que les poses : STRIDE par unité).
    const moved = Math.hypot(sim.player.x - before.x, sim.player.y - before.y);
    const phase = sim.walk.phase + moved * STRIDE;
    const foot = stepFootsteps(sim.walk.steps, sim.walk.phase, phase, moved / Math.max(dt, 1e-6), sim.time, eff.player.speed, ctx.audioCfg?.footsteps);
    sim.walk = { phase, steps: foot.state };
    // Cône : le rapport de vitesse (vitesse réelle / vitesse maximale effective) est lissé, indépendamment du nombre d'images par seconde.
    sim.spread = stepSpreadRatio(sim.spread, speedRatio(dt > 0 ? moved / dt : 0, eff.player.speed), dt, cfg.stats.spread?.widenTime, cfg.stats.spread?.narrowTime);
    if (foot.step) events.push({ type: 'playerStep', ...foot.step });
    sim.aim = aimAngle(sim.aim);

    // Laser : sert à viser et à déclencher le tir, jamais aux dégâts.
    const muzzle = muzzlePoint(sim.player, sim.aim.angle, weapon.muzzleOffset, bounds);
    const ray = castRay(muzzle, sim.aim.angle, weapon.laserRange, sim.enemies, shotBounds, blockers);
    laser = { from: muzzle, ray, cone: { angle: sim.aim.angle, half: toRadians(halfAngle()), length: weapon.laserRange } };
    // Le tir part aussi quand la visée passe sur un ennemi au-delà de la portée du laser (le trait s'estompe, la balle continue) ;
    // un ennemi caché derrière un meuble ne déclenche jamais de tir.
    // Marge de visée : le tir part si la ligne passe à moins de aimTolerance du bord d'un ennemi ; la balle suit la vraie visée et peut le rater.
    const wide = sim.enemies.map((e) => ({ ...e, r: e.r + num(weapon.aimTolerance) }));
    const aimed = ray.hit !== null || castRay(muzzle, sim.aim.angle, weapon.fireRange, wide, shotBounds, blockers).hit !== null;

    const trigger = stepWeapon(sim.weapon, dt, aimed, weapon, sim.bullets.length);
    sim.weapon = trigger.state;
    if (trigger.fire) {
      // La balle part dans le cône autour de l'axe de visée (tirage triangulaire, graine du jeu) ; ses dégâts sont figés ici.
      const shot = shotAngle(sim.aim.angle, toRadians(halfAngle()), sim.rng);
      sim.rng = shot.rng;
      sim.bullets = [...sim.bullets, createBullet(muzzle, shot.angle, weapon, sim.nextId, sim.aim.angle)];
      shotLog.push({ id: sim.nextId, time: sim.time, angle: shot.angle, aimAngle: sim.aim.angle, half: halfAngle() });
      sim.nextId += 1;
      sim.flash = reduced ? weapon.muzzleFlash / 2 : weapon.muzzleFlash;
      sim.recoil = RECOIL_TIME;
      lastFire = sim.time;
      events.push({ type: 'shot', x: muzzle.x, y: muzzle.y });
    }

    // Balles : les dégâts n'existent qu'à l'impact.
    const flight = stepBullets(sim.bullets, sim.enemies, dt, shotBounds, blockers);
    sim.bullets = flight.bullets;
    const result = applyImpacts(sim.enemies, flight.impacts);
    sim.enemies = result.enemies;
    if (!reduced) {
      for (const impact of flight.impacts) sparks.push({ x: impact.x, y: impact.y, age: 0 });
      // Une balle qui touche un meuble disparaît sans dégâts, avec une petite étincelle.
      for (const gone of flight.gone) if (gone.reason === 'obstacle') sparks.push({ x: gone.x, y: gone.y, age: 0 });
    }
    // Sons à l'impact seulement : un zombie touché (blessure ou mort) ou un obstacle touché (selon sa matière).
    const killedIds = new Set(result.killed.map((k) => k.id));
    for (const impact of flight.impacts) events.push({ type: 'zombieHit', x: impact.x, y: impact.y, killed: killedIds.has(impact.enemyId), zombie: variantName(impact.enemyId) });
    for (const gone of flight.gone) {
      if (gone.reason === 'obstacle') events.push({ type: 'obstacleHit', x: gone.x, y: gone.y, obstacleId: gone.obstacleId, material: materialFor(obstacleKinds.get(gone.obstacleId), gone.obstacleId, ctx.audioMaterials) });
    }
    sim.kills += result.killed.length;
    // Régénération : chaque zombie tué rend des points de vie, jamais au-delà du maximum, jamais après la mort.
    for (let i = 0; i < result.killed.length; i += 1) sim.player = { ...sim.player, health: healOnKill(sim.player.health, sim.player.maxHealth, eff.player.regen, !sim.dead && sim.player.health > 0) };

    if (grid) {
      const t0 = ctx.perf ? performance.now() : 0;
      sim.flow = stepFlow(sim.flow, dt, grid, sim.player, cfg.nav.recompute);
      if (ctx.perf && sim.flow.recomputed) {
        const ms = performance.now() - t0;
        ctx.perf.flowSum += ms;
        ctx.perf.flowCount += 1;
        ctx.perf.flowMax = Math.max(ctx.perf.flowMax, ms);
      }
      sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie, { obstacles: layout.zombieObstacles, bounds: layout.worldBounds, grid, flow: sim.flow.flow, nav: cfg.nav });
      // Par quelle fenêtre chaque zombie est entré : la plus proche de l'endroit où il franchit la limite de la salle.
      sim.enemies = sim.enemies.map((e) => (e.entered || e.x < bounds.minX || e.x > bounds.maxX || e.y < bounds.minY || e.y > bounds.maxY ? e : { ...e, entered: entryWindow(e, layout.windows) }));
    } else {
      sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie);
    }

    // Vagues (js/core/wave-director.js) : jamais à l'écran, seuls les points hors de la vue (agrandie) sont possibles ; la salle du lot 1m
    // (?empty=1) n'a pas de vue limitée. ?nospawn=1 : directeur inactif, aucune vague.
    let waveLive = null;
    if (sim.waves.phase !== 'inactif') {
      const view = layout.empty ? null : visibleRect();
      const out = stepDirector(sim.waves, { dt, alive: sim.enemies.length, view, points: layout.spawnPoints ?? layout.windows });
      sim.waves = out.state;
      for (const r of out.requests) {
        addEnemy(r.x, r.y, { type: r.type, gait: r.gait, spec: out.state.spec, from: r.pointId });
        spawnLog.push({ id: r.pointId, time: sim.time, hidden: view ? isHidden(r, view, 0, 0) : true, type: r.type, gait: r.gait });
      }
      for (const ev of out.events) {
        if (ev.type === 'waveStart') {
          sim.announce = { kind: 'start', wave: ev.wave, reinforced: ev.reinforced, until: sim.time + ANNOUNCE_TIME };
          waveLive = fmt(ctx.dict['game.wave.live'], { n: ev.wave });
        } else if (ev.type === 'waveEnd') {
          // Fin de vague : la vie du joueur est remise à son maximum (healFraction), sans dépasser.
          const max = sim.player.maxHealth;
          sim.player = { ...sim.player, health: Math.min(max, sim.player.health + max * ev.healFraction) };
          sim.announce = { kind: 'end', wave: ev.wave, reinforced: false, until: sim.time + ANNOUNCE_TIME };
          waveLive = fmt(ctx.dict['game.wave.liveDone'], { n: ev.wave });
        }
      }
    }

    const contact = stepContact(sim.player, sim.enemies, dt, cfg.zombie);
    sim.player = contact.player;
    sim.enemies = contact.enemies;
    // Cri d'attaque : les zombies dont le délai de frappe vient d'être relancé ont frappé pendant cette image.
    for (const e of contact.enemies) if (cfg.zombie.contactDelay > 0 && e.hitCooldown === cfg.zombie.contactDelay) events.push({ type: 'zombieAttack', x: e.x, y: e.y, zombie: variantName(e.id) });
    const dying = sim.player.health <= 0;
    if (contact.damage > 0) events.push({ type: dying ? 'playerDeath' : 'playerHurt' });

    audio?.handle({ time: sim.time, listener: sim.player, walls: audioWalls, paused: ctx.ui.isPaused(), events, zombies: sim.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, variant: variantName(e.id), gait: e.gait, stride: e.stride })) });

    const bucket = Math.ceil((displayHealth(sim.player.health) / sim.player.maxHealth) * 10);
    if (bucket !== sim.lifeBucket && sim.player.health > 0) {
      sim.lifeBucket = bucket;
      ctx.ui.setLive(fmt(ctx.dict['game.live.life'], { hp: displayHealth(sim.player.health), max: sim.player.maxHealth }));
    }
    // Le message de vague passe avant le message de vie (le soin de fin de vague change aussi la vie).
    if (waveLive !== null) ctx.ui.setLive(waveLive);
    if (sim.player.health <= 0) {
      sim.dead = true;
      input.releaseAll();
      ctx.ui.setLive(fmt(ctx.dict['game.live.dead'], { n: sim.kills }));
      ctx.ui.showEnd(sim.kills, waveInfo(sim.waves).wave);
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
    lastPose = computePose({ phase: anim.phase, aim, facing: anim.facing, state, time: sim.time, seed: 0, amount: Math.min(1, speed / eff.player.speed), recoil: sim.recoil / RECOIL_TIME });
    playerChar.setPose(lastPose);
    playerChar.root.position.set(p.x, 0, p.y);
    playerChar.root.rotation.y = Math.PI / 2 - anim.facing;

    const alive = new Set();
    for (const e of sim.enemies) {
      alive.add(e.id);
      let z = zombies.get(e.id);
      if (!z) {
        const variant = e.visual;
        z = { char: spare[variant].pop() ?? createCharacter(kit, 'zombie', variant), phase: 0, x: e.x, y: e.y, flashing: false };
        world.scene.add(z.char.root);
        zombies.set(e.id, z);
      }
      const moved = Math.hypot(e.x - z.x, e.y - z.y);
      const zs = moved / safe;
      z.phase += (moved * TAU) / e.stride; // la phase de marche avance de distance / foulée de l'allure
      z.x = e.x;
      z.y = e.y;
      z.char.setPose(computePose({ phase: z.phase, aim: 0, facing: 0, state: GAIT_POSE[e.gait] ?? 'zombie', time: sim.time, seed: e.id, amount: zs > 5 ? 0.7 : 0.15 }));
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
      spare[z.char.variant].push(z.char);
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
    if (sim.announce && sim.time >= sim.announce.until) sim.announce = null;
    hud.update(sim.player, sim.kills, waveInfo(sim.waves), sim.announce);
  }

  // La caméra suit le joueur (js/core/camera.js), la lumière et sa carte d'ombres suivent la caméra.
  function followCamera(dt) {
    rig.follow(dt, sim.player.x, sim.player.y);
    // Carte d'ombres : demi-diagonale de la vue au sol, avec de la marge pour la perspective.
    world.followSun(rig.view.target.x, rig.view.target.y, Math.hypot(rig.view.ground.width / 2, (rig.view.ground.north + rig.view.ground.south) / 2) * 1.3);
  }

  // Position du joueur à l'écran, de 0 à 1 (0,5 = au centre).
  const probe = new THREE.Vector3();
  function screenOf(x, y) {
    probe.set(x, 0, y).project(rig.camera);
    return { x: (probe.x + 1) / 2, y: (1 - probe.y) / 2 };
  }
  const projectPlayer = () => screenOf(sim.player.x, sim.player.y);

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
    followCamera(paused ? 0 : dt);
    renderer.render(world.scene, rig.camera);
    lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }

  // Test : image à jour tout de suite (positions, caméra), recopiée dans un canvas 2D pour en lire les pixels.
  let probeCanvas = null;
  function sample(x, y, w, h) {
    draw(0);
    followCamera(0);
    renderer.render(world.scene, rig.camera);
    lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    const src = renderer.domElement;
    const k = src.width / Math.max(1, window.innerWidth);
    const sw = Math.max(1, Math.round(w * k));
    const sh = Math.max(1, Math.round(h * k));
    probeCanvas ??= document.createElement('canvas');
    probeCanvas.width = sw;
    probeCanvas.height = sh;
    const c2d = probeCanvas.getContext('2d', { willReadFrequently: true });
    c2d.drawImage(src, Math.round(x * k), Math.round(y * k), sw, sh, 0, 0, sw, sh);
    const pixels = c2d.getImageData(0, 0, sw, sh).data;
    const seen = new Set();
    let lum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      seen.add(((pixels[i] >> 4) << 8) | ((pixels[i + 1] >> 4) << 4) | (pixels[i + 2] >> 4));
      lum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    }
    return { distinctColors: seen.size, meanLuminance: lum / (pixels.length / 4) / 255 };
  }

  // État des vagues pour les tests (getState().waves).
  function wavesState() {
    const i = waveInfo(sim.waves);
    const { spec } = sim.waves;
    return {
      active: i.active, phase: i.phase, wave: i.wave, level: i.level, total: i.total, alive: i.alive, toSpawn: i.toSpawn, remaining: i.remaining,
      maxConcurrent: i.maxConcurrent, waitLeft: i.waitLeft, hpMul: spec.hpMul, speedMul: spec.speedMul, damageMul: spec.damageMul, reinforced: i.reinforced,
      announce: sim.announce ? { kind: sim.announce.kind, wave: sim.announce.wave, reinforced: sim.announce.reinforced } : null,
    };
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

  applyLevels(ctx.levels?.levels, ctx.levels?.warnings);
  reset(ctx.seed);
  applySize();
  draw(0);
  followCamera(0);
  if (!document.hidden) start();

  return {
    get sim() {
      return sim;
    },
    addEnemy,
    // Spécification d'une vague (par défaut celle du directeur) pour fabriquer un zombie de test.
    specOf(wave) {
      return Number.isInteger(wave) ? waveSpec(wave, sim.waveParams) : sim.waves.spec;
    },
    sample,
    // Test : avance la simulation de `seconds` par pas de 0,05 s, sans attendre le rendu (puis une image à jour).
    advance(seconds) {
      const n = Math.min(4000, Math.max(0, Math.round(Number(seconds) / STEP) || 0));
      for (let i = 0; i < n && !sim.dead; i += 1) {
        step(STEP);
        followCamera(STEP);
      }
      draw(STEP);
      stale = true;
    },
    // Test : place le joueur d'un coup (caméra comprise).
    placePlayer(x, y) {
      sim.player = { ...sim.player, x: Number(x), y: Number(y) };
      rig.snap(sim.player.x, sim.player.y);
      stale = true;
    },
    // Test : événements sonores injectés dans la direction sonore (journal compris), à la position du joueur courant.
    emitAudio(events) {
      ctx.audio?.handle({ time: sim.time, listener: sim.player, walls: audioWalls, paused: ctx.ui.isPaused(), events: Array.isArray(events) ? events : [] });
    },
    // Test : une balle de plus, tirée de la bouche de l'arme dans la direction `angle`.
    fireBullet(angle) {
      // La bouche n'est pas retenue dans la salle : le test place parfois le joueur dehors (balle sur une voiture, par exemple).
      const muzzle = muzzlePoint(sim.player, Number(angle), eff.weapon.muzzleOffset, shotBounds);
      sim.bullets = [...sim.bullets, createBullet(muzzle, Number(angle), eff.weapon, sim.nextId)];
      sim.nextId += 1;
      ctx.audio?.handle({ time: sim.time, listener: sim.player, walls: audioWalls, paused: ctx.ui.isPaused(), events: [{ type: 'shot', x: muzzle.x, y: muzzle.y }] });
    },
    // Test : montre tout le monde (vrai) ou revient au suivi du joueur (faux) ; l'image est mise à jour au prochain rendu.
    overview(on = true) {
      rig.setOverview(on);
      followCamera(0);
      size = { ...size, unitsPerPixel: (2 * rig.view.distance * Math.tan((render.camera.fov * Math.PI) / 360)) / size.height };
      stale = true;
    },
    // Test : change les niveaux en cours de partie (tous remplacés, absent = 0) ; les balles déjà parties gardent leurs dégâts.
    setLevels(levels) {
      applyLevels(levels);
      stale = true;
    },
    // ?fps=1 : niveaux et demi-angle courant du cône, en texte.
    statsLine() {
      return { levels: STAT_IDS.map((id) => `${id} ${eff.levels.levels[id]}`).join(', '), angle: halfAngle().toFixed(1).replace('.', ',') };
    },
    // Test : saute à la vague n (zombies retirés, compte à rebours de départ) ; sans effet avec ?nospawn=1.
    startWave(n) {
      sim.enemies = [];
      sim.waves = jumpToWave(sim.waves, n);
      sim.announce = null;
      stale = true;
    },
    // Test : tue tous les zombies vivants sans compter de tués ; renvoie leur nombre.
    killAll() {
      const n = sim.enemies.length;
      sim.enemies = [];
      return n;
    },
    // Test : surcharge temporaire de waves.json (sections fusionnées), valable jusqu'à Rejouer.
    setWaveParams(partial) {
      sim.waveParams = mergeParams(sim.waveParams, partial && typeof partial === 'object' ? partial : {});
      sim.waves = setParams(sim.waves, sim.waveParams);
    },
    // Remet une partie propre (Rejouer, Recommencer).
    restart() {
      ctx.seedRun += 1;
      reset(ctx.seed + ctx.seedRun);
    },
    snapshot() {
      const cam = rig.camera.position;
      return {
        player: { x: sim.player.x, y: sim.player.y, health: sim.player.health, maxHp: sim.player.maxHealth, spread: halfAngle(), speedRatio: sim.spread },
        stats: {
          levels: { ...eff.levels.levels },
          warnings: [...eff.levels.warnings],
          values: {
            damage: eff.weapon.damage, fireRange: eff.weapon.fireRange, laserRange: eff.weapon.laserRange, bulletMaxDistance: eff.weapon.bulletMaxDistance, fireDelay: eff.weapon.fireDelay,
            speed: eff.player.speed, maxHealth: eff.player.maxHealth, regen: eff.player.regen, coneStill: eff.weapon.coneStill, coneMove: eff.weapon.coneMove,
          },
        },
        shots: shotLog.map((l) => ({ ...l })),
        aim: sim.aim.angle,
        enemies: sim.enemies.map((e) => ({
          id: e.id, x: e.x, y: e.y, health: e.health, entered: e.entered ?? null, from: e.from ?? null, variant: e.visual, screen: screenOf(e.x, e.y), pose: zombies.get(e.id)?.char.readPose() ?? null,
          type: e.type, gait: e.gait, hp: e.health, maxHp: e.maxHealth, speed: e.speed, damage: e.damage, stride: e.stride, radius: e.r, phase: zombies.get(e.id)?.phase ?? 0,
        })),
        bullets: sim.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, angle: b.angle, aimAngle: b.aimAngle, damage: b.damage, maxDistance: b.maxDistance })),
        kills: sim.kills,
        waves: wavesState(),
        camera: { x: cam.x, y: cam.y, z: cam.z, distance: rig.view.distance, tilt: rig.view.tilt, zoom: rig.view.zoom, target: { ...rig.view.target } },
        render: { ...lastInfo },
        textures: { count: ctx.textureData.count, bytes: ctx.textureData.bytes, readyMs: Math.round(ctx.textureData.ms), ready: true },
        view: visibleRect(),
        playerScreen: projectPlayer(),
        laserEnd: laser ? { x: laser.ray.end.x, y: laser.ray.end.y } : null,
        laser: laser ? { length: laser.ray.length, hit: laser.ray.hit?.id ?? null, stoppedBy: laser.ray.stoppedBy?.id ?? null, range: laser.cone.length, cone: { leftAngle: sim.aim.angle - laser.cone.half, rightAngle: sim.aim.angle + laser.cone.half } } : null,
        world: { width: layout.size.width, height: layout.size.height, empty: layout.empty },
        obstacles: layout.furniture.map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h, hauteur: o.hauteur })),
        windows: layout.windows.map((w) => ({ id: w.id ?? null, x: w.x, y: w.y })),
        spawnPoints: (layout.spawnPoints ?? []).map((p) => ({ id: p.id, fenetre: p.fenetre, x: p.x, y: p.y })),
        spawnLog: spawnLog.map((l) => ({ ...l })),
        pose: { ...playerChar.readPose(), expected: { ...lastPose } },
        paused: ctx.ui.isPaused(),
        dead: sim.dead,
        time: sim.time,
        audio: ctx.audio.state(),
      };
    },
  };
}
