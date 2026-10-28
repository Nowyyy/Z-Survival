// Partie en 3D : affiche avec Three.js l'état simulé par js/core/. Les règles (tirs, dégâts, mouvements) sont dans js/core/ et
// s'enchaînent dans le même ordre qu'au lot 1. Coordonnées : logique (x, y) -> scène (x, 0, y).
import * as THREE from 'three';
import { aimFromPoint, aimFromStick, createAim } from '../core/aim.js';
import { applyImpacts, createWeaponState, displayHealth, healOnKill, muzzlePoint, stepContact, stepWeapon } from '../core/combat.js';
import { stepEnemies } from '../core/enemy-ai.js';
import { createEnemy, isGait, isType } from '../core/enemy-factory.js';
import { entryWindow, windowsWithGaps } from '../core/layout.js';
import { occupancy, stepSiege } from '../core/siege.js';
import { closedRects, createWindowsState, stepWindows, windowGeometries } from '../core/windows.js';
import { moveCircle } from '../core/movement.js';
import { applyHeal, canFire, canHealOnKill, canMove, createPlayerDown, isInvulnerable, knockbackZombies, stepPlayerDown } from '../core/player-down.js';
import { effectivePlayer, effectiveWeapon, normalizeLevels, STAT_IDS, statValues } from '../core/player-stats.js';
import { buildWindowField, createFlowState, createGrid, stepFlow } from '../core/nav.js';
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
import { createSplash, stepSplash } from '../core/wave-splash.js';
import { waveSpec } from '../core/waves.js';
import { createCharacter, createKit } from './character.js';
import { createEffects, MAX_SPARKS, SPARK_TIME } from './effects.js';
import { createHud } from './hud.js';
import { createSplashView } from './splash-view.js';
import { pickGround } from './picking.js';
import { STRIDE } from './skeleton.js';
import { DOWN_TEXTS, fmt, WINDOW_NAMES, WINDOW_TEXTS } from './texts.js';
import { createThreeTextures } from './textures.js';
import { buildWorld, createCamera } from './world.js';

const RECOIL_TIME = 0.12;
const HIT_FLASH_TIME = 0.1;
const FIRE_POSE_TIME = 0.3;
const STEP = 0.05; // pas de la simulation avancée à la demande (hook de test step)
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
  // Lot 3 : les fenêtres de la salle ont des planches (siège par les zombies) ; la salle du lot 1m (?empty=1) n'a ni planches ni siège.
  const windowsCfg = cfg.windows;
  const siegeOn = !layout.empty;
  const geoms = siegeOn ? windowGeometries(windowsWithGaps(layout), windowsCfg) : [];
  const geomById = new Map(geoms.map((g) => [g.id, g]));
  const siegeParams = { ...windowsCfg, bounds: layout.bounds };
  const gridOpts = { cell: cfg.nav.cell, radius: cfg.zombie.radius, inflate: cfg.nav.inflate };
  // Champ de flux de chaque fenêtre, calculé une seule fois au chargement sur la grille extérieure (ouvertures bloquées) ; durée mesurée (?fps=1).
  const fieldStart = performance.now();
  const closedGrid = siegeOn ? createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], gridOpts) : null;
  const windowFields = Object.fromEntries(geoms.map((g) => [g.id, buildWindowField({ grid: closedGrid }, g)]));
  const fieldMs = performance.now() - fieldStart;
  if (ctx.perf) ctx.perf.windowsMs = fieldMs;
  // Obstacles des zombies : décor, murs et meubles, plus les ouvertures qui ont encore des planches (mis à jour quand une fenêtre s'ouvre ou se ferme).
  let zombieSolids = layout.zombieObstacles;
  let grid = layout.empty ? null : createGrid(layout.size, zombieSolids, gridOpts);
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
  const world = buildWorld({ palette, layout, render, textures, windowGeoms: geoms, windowsCfg, seed: ctx.seed, plankStyle: ctx.params.pk });
  const rig = createCamera(render.camera, cfg.camera, layout, params.tilt, params.zoom);
  const kit = createKit({ textures, variants: ctx.variants, hit: palette.hit });
  const effects = createEffects(world.scene, palette, { gunHeight: render.gunHeight, bulletRadius: cfg.weapon.bulletRadius });
  const hud = createHud(ctx.dict);
  const splashView = createSplashView(ctx.dict);
  const splashOptions = { reducedMotion: reduced, params: ctx.splashCfg };
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

  // Planches : les obstacles et la grille des zombies suivent l'état des fenêtres (seulement quand une fenêtre s'ouvre ou se ferme), le maillage
  // des planches aussi.
  function syncWindows() {
    zombieSolids = siegeOn ? [...layout.zombieObstacles, ...closedRects(sim.win, geoms)] : layout.zombieObstacles;
    if (grid) {
      grid = createGrid(layout.size, zombieSolids, gridOpts);
      sim.flow = createFlowState();
    }
    world.planks?.sync(sim.win);
  }
  function dictName(id) {
    const key = WINDOW_NAMES[id];
    return key ? ctx.dict[key] : id;
  }

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
      splash: createSplash(),
      splashView: stepSplash(createSplash(), null, 0, splashOptions).view,
      flow: createFlowState(),
      win: createWindowsState(geoms, windowsCfg, { planks: params.planks ?? undefined }),
      repair: {},
      announced: {},
      rng: createRng(seed),
      walk: { phase: 0, steps: createFootsteps() },
      kills: 0,
      time: 0,
      nextId: 1,
      down: createPlayerDown(eff.player.maxFalls),
      dead: false,
      flash: 0,
      recoil: 0,
      lifeBucket: 10,
      spread: 0, // rapport de vitesse lissé, de 0 (arrêt) à 1 (pleine vitesse)
    };
    splashView.apply(sim.splashView);
    syncWindows();
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
  function addEnemy(x, y, { type, gait, spec, from, window: windowId = null, mode = 'libre' } = {}) {
    const typed = isType(type);
    const created = createEnemy(typed ? type : 'marcheur', isGait(gait) ? gait : 'marche', spec ?? waveSpec(1, sim.waveParams), cfg.enemies, cfg.gaits);
    const visual = typed ? typeIndex.get(type) : variantFor(sim.nextId, ctx.seed, kit.variants.length);
    const enemy = {
      id: sim.nextId, x, y, r: created.radius, health: created.hp, maxHealth: created.maxHp, hitCooldown: 0, flash: 0,
      type: created.type, gait: created.gait, speed: created.speed, damage: created.damage, stride: created.stride, visual, tearMul: created.tearMul, mode, window: windowId, slot: null, ...(from === undefined || from === null ? {} : { from }),
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
    // À terre, le joueur ne bouge pas, ne tire pas et son laser est masqué (js/core/player-down.js).
    const standing = canMove(sim.down);
    const dir = standing ? override.move ?? input.move() : { x: 0, y: 0 };
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
    laser = !canFire(sim.down) ? null : { from: muzzle, ray, cone: { angle: sim.aim.angle, half: toRadians(halfAngle()), length: weapon.laserRange } };
    // Le tir part aussi quand la visée passe sur un ennemi au-delà de la portée du laser (le trait s'estompe, la balle continue) ;
    // un ennemi caché derrière un meuble ne déclenche jamais de tir.
    // Marge de visée : le tir part si la ligne passe à moins de aimTolerance du bord d'un ennemi ; la balle suit la vraie visée et peut le rater.
    const wide = sim.enemies.map((e) => ({ ...e, r: e.r + num(weapon.aimTolerance) }));
    const aimed = canFire(sim.down) && (ray.hit !== null || castRay(muzzle, sim.aim.angle, weapon.fireRange, wide, shotBounds, blockers).hit !== null);

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
    for (let i = 0; i < result.killed.length; i += 1) sim.player = { ...sim.player, health: healOnKill(sim.player.health, sim.player.maxHealth, eff.player.regen, !sim.dead && canHealOnKill(sim.down) && sim.player.health > 0) };

    if (grid) {
      const t0 = ctx.perf ? performance.now() : 0;
      sim.flow = stepFlow(sim.flow, dt, grid, sim.player, cfg.nav.recompute);
      if (ctx.perf && sim.flow.recomputed) {
        const ms = performance.now() - t0;
        ctx.perf.flowSum += ms;
        ctx.perf.flowCount += 1;
        ctx.perf.flowMax = Math.max(ctx.perf.flowMax, ms);
      }
      let windowLive = null;
      if (siegeOn) {
        // Siège (js/core/siege.js) : modes et intentions des zombies, arrachage des planches ; réparation automatique près de la fenêtre.
        const sg = stepSiege(sim.enemies, sim.win, geoms, dt, siegeParams);
        sim.enemies = sg.zombies;
        const repairing = {};
        for (const g of geoms) {
          const w = sim.win.windows[g.id];
          repairing[g.id] = !sim.dead && Math.hypot(sim.player.x - g.repairSpot.x, sim.player.y - g.repairSpot.y) <= windowsCfg.repairRadius && w.planks < w.maxPlanks;
        }
        const wr = stepWindows(sim.win, { tearing: sg.tearing, repairing, repairBlocked: sg.repairBlocked, repairTime: eff.player.repairTime }, dt, windowsCfg);
        sim.win = wr.state;
        sim.repair = Object.fromEntries(geoms.map((g) => [g.id, { repairing: repairing[g.id] === true && sg.repairBlocked[g.id] !== true, blocked: sg.repairBlocked[g.id] === true, progress: sim.win.windows[g.id].repairProgress, attacked: (sg.tearing[g.id] ?? []).length > 0 }]));
        let changed = false;
        for (const ev of wr.events) {
          const g = geomById.get(ev.windowId);
          if (ev.type === 'plank-torn') events.push({ type: 'plankTorn', x: g.center.x, y: g.center.y, windowId: ev.windowId });
          else if (ev.type === 'plank-repaired') events.push({ type: 'plankRepaired', x: g.center.x, y: g.center.y, windowId: ev.windowId });
          if (ev.type === 'window-open' || ev.type === 'window-closed') changed = true;
          // Annonces vocales : « ouverte » au plus une fois par fenêtre et par 10 s, « réparée » quand toutes les planches sont revenues.
          if (ev.type === 'window-open' && sim.time - (sim.announced[ev.windowId] ?? -Infinity) >= 10) {
            sim.announced[ev.windowId] = sim.time;
            windowLive = fmt(ctx.dict[WINDOW_TEXTS.liveOpen], { name: dictName(ev.windowId) });
          } else if (ev.type === 'plank-repaired' && ev.planks === sim.win.windows[ev.windowId].maxPlanks) windowLive = fmt(ctx.dict[WINDOW_TEXTS.liveRepaired], { name: dictName(ev.windowId) });
        }
        if (changed) syncWindows();
        else if (wr.events.length > 0) world.planks?.sync(sim.win); // planche arrachée ou posée : le maillage suit (seules les planches modifiées sont réécrites)
      }
      if (windowLive !== null) ctx.ui.setLive(windowLive);
      sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie, { obstacles: zombieSolids, bounds: layout.worldBounds, grid, flow: sim.flow.flow, nav: cfg.nav, windows: { fields: windowFields } });
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
      const out = stepDirector(sim.waves, { dt, alive: sim.enemies.length, view, points: layout.spawnPoints ?? layout.windows, siege: siegeOn });
      sim.waves = out.state;
      for (const r of out.requests) {
        addEnemy(r.x, r.y, { type: r.type, gait: r.gait, spec: out.state.spec, from: r.pointId, window: r.window, mode: siegeOn ? r.mode : 'libre' });
        spawnLog.push({ id: r.pointId, time: sim.time, hidden: view ? isHidden(r, view, 0, 0) : true, type: r.type, gait: r.gait });
      }
      for (const ev of out.events) {
        if (ev.type === 'waveStart') {
          waveLive = fmt(ctx.dict['game.wave.live'], { n: ev.wave });
        } else if (ev.type === 'waveEnd') {
          // Fin de vague : la vie du joueur est remise à son maximum (healFraction), sans dépasser ; à terre, le soin attend le relevage.
          const healed = applyHeal(sim.player.health, sim.player.maxHealth, ev.healFraction, sim.down);
          sim.player = { ...sim.player, health: healed.hp };
          sim.down = healed.down;
          waveLive = fmt(ctx.dict['game.wave.liveDone'], { n: ev.wave });
        }
      }
    }

    // Animation de vague (E2-8) : état pur (wave-splash.js) avancé avec le temps de jeu, donc figé par la pause ; sa mélodie part avec l'image
    // de démarrage (une demande par animation). Une animation de début démarre 3,0 s avant les apparitions, celle de fin à l'état terminee.
    const spl = stepSplash(sim.splash, { ...waveInfo(sim.waves), playerAlive: sim.player.health > 0 }, dt, splashOptions);
    sim.splash = spl.state;
    sim.splashView = spl.view;
    if (spl.view.sound) events.push(spl.view.sound.name === 'vague-fin' ? { type: 'waveEnd', variant: spl.view.sound.variant } : { type: 'waveSplash', sound: spl.view.sound.name, variant: spl.view.sound.variant });

    const contact = stepContact(sim.player, sim.enemies, dt, cfg.zombie, isInvulnerable(sim.down));
    sim.player = contact.player;
    sim.enemies = contact.enemies;
    // Cri d'attaque : les zombies dont le délai de frappe vient d'être relancé ont frappé pendant cette image.
    for (const e of contact.enemies) if (cfg.zombie.contactDelay > 0 && e.hitCooldown === cfg.zombie.contactDelay) events.push({ type: 'zombieAttack', x: e.x, y: e.y, zombie: variantName(e.id) });
    // Chutes : à 0 de vie, le joueur tombe s'il lui reste une chute (son « joueur-chute »), sinon c'est la mort.
    const lethal = sim.player.health <= 0;
    const willFall = lethal && sim.down.state === 'debout' && sim.down.chutes > 0;
    if (contact.damage > 0 && !willFall) events.push({ type: lethal ? 'playerDeath' : 'playerHurt' });
    const pd = stepPlayerDown(sim.down, { hp: sim.player.health, maxHp: sim.player.maxHealth }, dt, cfg.down);
    sim.down = pd.down;
    sim.player = { ...sim.player, health: pd.hp };
    let downLive = null;
    for (const ev of pd.events) {
      if (ev === 'fall') {
        events.push({ type: 'playerDown' });
        downLive = ctx.dict[DOWN_TEXTS.liveDown];
      } else if (ev === 'standup') {
        events.push({ type: 'playerUp' });
        downLive = ctx.dict[DOWN_TEXTS.liveUp];
      }
    }
    if (pd.knockback) {
      sim.enemies = knockbackZombies(sim.enemies, sim.player, pd.knockback, { bounds: layout.bounds, furniture: layout.furniture, walls: layout.walls, gaps: layout.gaps });
    }

    audio?.handle({ time: sim.time, listener: sim.player, walls: audioWalls, paused: ctx.ui.isPaused(), events, zombies: sim.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, variant: variantName(e.id), gait: e.gait, stride: e.stride })) });

    const bucket = Math.ceil((displayHealth(sim.player.health) / sim.player.maxHealth) * 10);
    if (bucket !== sim.lifeBucket && sim.player.health > 0 && sim.down.state === 'debout') {
      sim.lifeBucket = bucket;
      ctx.ui.setLive(fmt(ctx.dict['game.live.life'], { hp: displayHealth(sim.player.health), max: sim.player.maxHealth }));
    }
    // Le message de vague passe avant le message de vie (le soin de fin de vague change aussi la vie).
    if (waveLive !== null) ctx.ui.setLive(waveLive);
    if (downLive !== null) ctx.ui.setLive(downLive);
    if (sim.down.state === 'mort') {
      sim.dead = true;
      // Mort : l'animation est masquée aussitôt et la mélodie s'arrête en fondu (0,3 s).
      const off = stepSplash(sim.splash, { ...waveInfo(sim.waves), playerAlive: false }, 0, splashOptions);
      sim.splash = off.state;
      sim.splashView = off.view;
      audio?.stopAnnounce();
      input.releaseAll();
      ctx.ui.setLive(fmt(ctx.dict['game.live.dead'], { n: sim.kills }));
      ctx.ui.showEnd(sim.kills, waveInfo(sim.waves).wave);
    }
  }

  // E2-10 : état à terre (« À terre », « Tu te relèves dans N s », voile de bord) puis « Protégé N s » pendant la protection ; écrit seulement si le texte change.
  const downEl = document.getElementById('down');
  const downTitle = document.getElementById('down-title');
  const downSub = document.getElementById('down-sub');
  let downShown = { mode: null, sub: null };
  function updateDownView() {
    if (!downEl) return;
    const grounded = sim.down.state === 'terre';
    const guarded = sim.down.state === 'debout' && sim.down.grace > 0 && !sim.dead;
    const mode = grounded ? 'terre' : guarded ? 'grace' : null;
    const sub = grounded ? fmt(ctx.dict[DOWN_TEXTS.countdown], { n: Math.ceil(sim.down.timeLeft - 1e-6) }) : guarded ? fmt(ctx.dict[DOWN_TEXTS.grace], { n: Math.ceil(sim.down.grace - 1e-6) }) : '';
    if (mode !== downShown.mode) {
      downEl.hidden = mode === null;
      downEl.dataset.mode = mode ?? '';
      downTitle.hidden = mode !== 'terre';
      if (mode === 'terre') downTitle.textContent = ctx.dict[DOWN_TEXTS.title];
    }
    if (sub !== downShown.sub) downSub.textContent = sub;
    downShown = { mode, sub };
  }

  // Ligne « Fenêtres » du HUD : une entrée par fenêtre (initiale, planches ou « ouverte », « ! » si elle est attaquée).
  function windowsHud() {
    return geoms.map((g) => {
      const w = sim.win.windows[g.id];
      const name = dictName(g.id);
      const initial = name.charAt(0).toUpperCase();
      const entry = w.planks === 0 ? fmt(ctx.dict[WINDOW_TEXTS.open], { initial }) : fmt(ctx.dict[WINDOW_TEXTS.entry], { initial, n: w.planks });
      return sim.repair[g.id]?.attacked ? fmt(ctx.dict[WINDOW_TEXTS.attacked], { entry }) : entry;
    });
  }

  // E2-9 : indicateur de réparation, fixe en haut au centre de l'écran (hors du titre de vague et de l'état à terre) ; affiché quand le joueur est
  // près d'une fenêtre qui manque de planches. Un seul tour d'anneau pour toute la fenêtre : (planches posées + progression de la planche en
  // cours) / maximum. Texte : la fenêtre et le nombre de planches à poser, ou la raison du blocage.
  const repairEl = document.getElementById('repair');
  const repairLabel = document.getElementById('repair-label');
  const repairSub = document.getElementById('repair-sub');
  let repairShown = { visible: null, label: null, sub: null, progress: null };
  function updateRepairIndicator() {
    if (!repairEl) return;
    let best = null;
    let bestD = Infinity;
    for (const g of geoms) {
      const w = sim.win.windows[g.id];
      const d = Math.hypot(sim.player.x - g.repairSpot.x, sim.player.y - g.repairSpot.y);
      if (w.planks < w.maxPlanks && d <= 2 * windowsCfg.repairRadius && d < bestD) {
        bestD = d;
        best = g;
      }
    }
    const visible = best !== null && !sim.dead;
    let label = '';
    let sub = '';
    let progress = 0;
    if (visible) {
      const w = sim.win.windows[best.id];
      const info = sim.repair[best.id];
      const todo = w.maxPlanks - w.planks;
      label = fmt(ctx.dict[WINDOW_TEXTS.repair], { name: dictName(best.id) });
      sub = info?.blocked ? ctx.dict[WINDOW_TEXTS.busy] : fmt(ctx.dict[todo === 1 ? WINDOW_TEXTS.todoOne : WINDOW_TEXTS.todoMany], { n: todo });
      progress = Math.round(((w.planks + num(w.repairProgress)) / w.maxPlanks) * 100) / 100;
    }
    if (visible !== repairShown.visible) repairEl.hidden = !visible;
    if (visible) {
      if (label !== repairShown.label) repairLabel.textContent = label;
      if (sub !== repairShown.sub) repairSub.textContent = sub;
      if (progress !== repairShown.progress) repairEl.style.setProperty('--repair-progress', String(progress));
    }
    repairShown = { visible, label: visible ? label : null, sub: visible ? sub : null, progress: visible ? progress : null };
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
    const state = sim.down.state === 'terre' ? 'terre' : sim.time - lastFire < FIRE_POSE_TIME ? 'tir' : moving ? 'marche' : 'arret';
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
      // Siège : poses « arracher » (au rythme du temps d'arrachage de son type) et « escalade » ; il fait face à la fenêtre tant qu'il est dehors.
      const gw = geomById.get(e.window);
      const sieging = gw && (e.mode === 'arrache' || e.mode === 'escalade');
      const tearRate = (TAU * num(e.tearMul, 1)) / Math.max(0.1, windowsCfg.tearTime);
      const poseState = e.mode === 'arrache' ? 'arracher' : e.mode === 'escalade' ? 'escalade' : GAIT_POSE[e.gait] ?? 'zombie';
      z.char.setPose(computePose({ phase: e.mode === 'arrache' ? sim.time * tearRate + e.id : z.phase, aim: 0, facing: 0, state: poseState, time: sim.time, seed: e.id, amount: zs > 5 ? 0.7 : 0.15 }));
      z.char.root.position.set(e.x, 0, e.y);
      z.char.root.rotation.y = sieging ? Math.PI / 2 - Math.atan2(-gw.normal.y, -gw.normal.x) : Math.PI / 2 - Math.atan2(p.y - e.y, p.x - e.x);
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
    hud.update(sim.player, sim.kills, waveInfo(sim.waves), { windows: windowsHud(), chutes: sim.down.chutes });
    updateDownView();
    updateRepairIndicator();
    splashView.apply(sim.splashView);
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
    ctx.vhs?.update(now / 1000); // horloge d'effet : secondes réelles, elle continue pendant la pause
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
      sim.splash = createSplash();
      sim.splashView = stepSplash(sim.splash, null, 0, splashOptions).view;
      splashView.apply(sim.splashView);
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
    // Test : règle le nombre de planches d'une fenêtre (0 à son maximum) ; renvoie vrai si la fenêtre existe.
    setPlanks(id, n) {
      const w = sim.win.windows[id];
      if (!w || !Number.isInteger(n) || n < 0 || n > w.maxPlanks) return false;
      sim.win = { ...sim.win, windows: { ...sim.win.windows, [id]: { ...w, planks: n, tearProgress: 0, repairProgress: 0 } } };
      syncWindows();
      stale = true;
      return true;
    },
    // Test : règle le nombre de chutes restantes (0 : la prochaine vie à 0 est la mort, comme avant le lot 3).
    setChutes(n) {
      const k = Number.isInteger(n) && n >= 0 && n <= 99 ? n : sim.down.chutes;
      sim.down = { ...sim.down, chutes: k, chutesMax: Math.max(k, sim.down.chutesMax) };
    },
    // Test : met la vie à 0 pour déclencher la chute (ou la mort s'il ne reste aucune chute) au prochain pas.
    downPlayer() {
      sim.player = { ...sim.player, health: 0 };
      stale = true;
    },
    // Test : un zombie en approche à 400 du mur de la fenêtre ; renvoie son identifiant (null si la fenêtre n'existe pas).
    spawnAtWindow(id, type) {
      const g = geomById.get(id);
      if (!g) return null;
      const typed = isType(type);
      return addEnemy(g.center.x + g.normal.x * 400, g.center.y + g.normal.y * 400, { type: typed ? type : 'marcheur', gait: 'marche', spec: waveSpec(1, sim.waveParams), window: id, mode: 'approche' }).id;
    },
    // Remet une partie propre (Rejouer, Recommencer).
    restart() {
      ctx.seedRun += 1;
      reset(ctx.seed + ctx.seedRun);
    },
    snapshot() {
      const cam = rig.camera.position;
      return {
        player: { x: sim.player.x, y: sim.player.y, health: sim.player.health, maxHp: sim.player.maxHealth, spread: halfAngle(), speedRatio: sim.spread, down: { state: sim.down.state, chutes: sim.down.chutes, chutesMax: sim.down.chutesMax, timeLeft: sim.down.timeLeft, grace: sim.down.grace, invulnerable: isInvulnerable(sim.down) } },
        stats: {
          levels: Object.fromEntries(STAT_IDS.map((id) => [id, eff.levels.levels[id]])), // les sept d'origine ; chutes et reparation dans extraLevels
          extraLevels: { chutes: eff.levels.levels.chutes ?? 0, reparation: eff.levels.levels.reparation ?? 0 },
          warnings: [...eff.levels.warnings],
          values: {
            damage: eff.weapon.damage, fireRange: eff.weapon.fireRange, laserRange: eff.weapon.laserRange, bulletMaxDistance: eff.weapon.bulletMaxDistance, fireDelay: eff.weapon.fireDelay,
            speed: eff.player.speed, maxHealth: eff.player.maxHealth, regen: eff.player.regen, maxFalls: eff.player.maxFalls, repairTime: eff.player.repairTime, coneStill: eff.weapon.coneStill, coneMove: eff.weapon.coneMove,
          },
        },
        shots: shotLog.map((l) => ({ ...l })),
        aim: sim.aim.angle,
        enemies: sim.enemies.map((e) => ({
          id: e.id, x: e.x, y: e.y, health: e.health, entered: e.entered ?? null, from: e.from ?? null, variant: e.visual, screen: screenOf(e.x, e.y), pose: zombies.get(e.id)?.char.readPose() ?? null,
          type: e.type, gait: e.gait, hp: e.health, maxHp: e.maxHealth, speed: e.speed, damage: e.damage, stride: e.stride, radius: e.r, phase: zombies.get(e.id)?.phase ?? 0,
          mode: e.mode ?? 'libre', window: e.window ?? null, slot: e.slot ?? null, climb: e.climb ? { t: e.climb.t } : null,
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
        windows: !siegeOn ? layout.windows.map((w) => ({ id: w.id ?? null, x: w.x, y: w.y })) : geoms.map((g) => {
          const w = sim.win.windows[g.id];
          const r = sim.repair[g.id] ?? { repairing: false, blocked: false, progress: 0 };
          const o = occupancy(sim.enemies, g.id);
          return { id: g.id, planks: w.planks, maxPlanks: w.maxPlanks, tearers: o.tearers, climbers: o.climbers, queue: o.queue, repairing: r.repairing, repairProgress: w.repairProgress, repairBlocked: r.blocked, open: w.planks === 0, x: g.center.x, y: g.center.y };
        }),
        plankMesh: world.planks?.counts() ?? { nailed: 0, debris: 0 },
        windowPositions: layout.windows.map((w) => ({ id: w.id ?? null, x: w.x, y: w.y })),
        spawnPoints: (layout.spawnPoints ?? []).map((p) => ({ id: p.id, fenetre: p.fenetre, x: p.x, y: p.y })),
        spawnLog: spawnLog.map((l) => ({ ...l })),
        pose: { ...playerChar.readPose(), expected: { ...lastPose } },
        paused: ctx.ui.isPaused(),
        dead: sim.dead,
        time: sim.time,
        audio: ctx.audio.state(),
        splash: splashView.readout(),
        vhs: ctx.vhs.readout(),
      };
    },
  };
}
