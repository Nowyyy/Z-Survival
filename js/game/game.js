// Partie en 3D : affiche avec Three.js l'état simulé par js/core/. Les règles (tirs, dégâts, mouvements) sont dans js/core/ et
// s'enchaînent dans le même ordre qu'au lot 1. Coordonnées : logique (x, y) -> scène (x, 0, y).
import * as THREE from 'three';
import { aimFromPoint, aimFromStick, createAim } from '../core/aim.js';
import { applyImpacts, createWeaponState, displayHealth, healOnKill, muzzlePoint, stepContact, stepWeapon } from '../core/combat.js';
import { stepEnemies } from '../core/enemy-ai.js';
import { createEnemy, isGait, isType } from '../core/enemy-factory.js';
import { floorOf, otherFloor } from '../core/floors.js';
import { createFloorState, createFloorWorld, setPlayerFloor, stepFloors, stepPlayerFlow, syncDoors, syncWindowGrid } from '../core/floor-sim.js';
import { cancelTransition, createTransition, startTransition, stepTransition } from '../core/floor-transition.js';
import { closedDoors, entryWindow } from '../core/layout.js';
import { occupancy } from '../core/siege.js';
import { edgeIndicator } from '../core/edge-arrow.js';
import { urgentWindows, windowChips } from '../core/hud-windows.js';
import { SWAP_UP, entryDirection, heightOf, startWalk, stepWalk, wantsStairs } from '../core/stair-walk.js';
import { arrivalKnockback, createStairWatch, stairArrival, stairParams, stairState, stairTriggers, startStairCooldown, stepStairWatch } from '../core/stairs.js';
import { createWindowsState } from '../core/windows.js';
import { moveCircle } from '../core/movement.js';
import { addDebris, createDebris, plankSettings, removeDebris, stepDebris } from '../core/plank-layout.js';
import { applyHeal, canFire, canHealOnKill, canMove, createPlayerDown, isInvulnerable, knockbackZombies, stepPlayerDown } from '../core/player-down.js';
import { effectivePlayer, effectiveWeapon, normalizeLevels, STAT_IDS, statValues } from '../core/player-stats.js';
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
import { createDirector, finishWave, info as waveInfo, markDoor, setParams, startWave as jumpToWave, stepDirector } from '../core/wave-director.js';
import { createSplash, stepSplash } from '../core/wave-splash.js';
import { waveSpec } from '../core/waves.js';
import { activeSpawnPoints, activeWindows, activeZones, assignWindows, doorsOpenAtStart, nextDoor } from '../core/zones.js';
import { createCharacter, createKit } from './character.js';
import { createEffects, MAX_SPARKS, SPARK_TIME } from './effects.js';
import { createFloorFade } from './floor-fade.js';
import { createHud } from './hud.js';
import { createSplashView } from './splash-view.js';
import { pickGround } from './picking.js';
import { STRIDE } from './skeleton.js';
import { DOWN_TEXTS, FLOOR_TEXTS, fmt, SPLASH_TEXTS, WINDOW_INITIALS, WINDOW_NAMES, WINDOW_TEXTS, ZONE_TEXTS } from './texts.js';
import { createThreeTextures } from './textures.js';
import { buildWorld, createCamera } from './world.js';

const RECOIL_TIME = 0.12;
const HIT_FLASH_TIME = 0.1;
const FIRE_POSE_TIME = 0.3;
const STEP = 0.05; // pas de la simulation avancée à la demande (hook de test step)
const STAIR_CRAWL_LIFT = 14; // unités dont un zombie rampant est relevé dans un escalier
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
  // Lot 3e : une couche de collisions par étage (layouts) ; layout reste la couche du rez-de-chaussée (dimensions du monde, caméra, départ).
  const layouts = cfg.layouts ?? { floors: ['rdc'], multi: false, rdc: layout, doors: layout.doors ?? [], stairs: [], zones: layout.zones };
  const multi = layouts.multi === true;
  const layoutOf = (f) => layouts[f] ?? layout;
  const stairCfg = stairParams(cfg.stairs);
  const shotBounds = layout.empty ? layout.bounds : layout.worldBounds;
  // Les meubles, les murs (percés de leurs fenêtres : on tire à travers) et les obstacles du décor arrêtent le laser, la ligne de tir et les balles ; elles volent
  // jusqu'au bord du monde. Salle du lot 1m (?empty=1) : les limites de la salle, comme avant. Lot 3c : les portes fermées arrêtent aussi les balles et le laser (sans
  // dégâts) ; la liste suit l'état des portes et l'étage du joueur (syncSolids). Lot 3e : ce sont toujours les solides de l'étage du joueur.
  let blockers = [];
  let playerSolids = layout.playerObstacles;
  // Lot 3 : les fenêtres ont des planches (siège par les zombies) ; la salle du lot 1m (?empty=1) n'a ni planches ni siège. Lot 3e : tout ce qui est par étage (grilles de
  // chemin, planches, champs de flux, escaliers) vit dans js/core/floor-sim.js, une seule fois au chargement.
  const windowsCfg = cfg.windows;
  const siegeOn = !layout.empty;
  const gridOpts = { cell: cfg.nav.cell, radius: cfg.zombie.radius, inflate: cfg.nav.inflate };
  const fieldStart = performance.now();
  const fw = siegeOn ? createFloorWorld(layouts, { windows: windowsCfg, grid: gridOpts, nav: cfg.nav, zombie: cfg.zombie, stair: cfg.stairs }) : null;
  const fieldMs = performance.now() - fieldStart;
  if (ctx.perf) ctx.perf.windowsMs = fieldMs;
  const geoms = siegeOn ? fw.all : [];
  const geomById = siegeOn ? fw.geomById : new Map();
  // Zones et portes (lot 3c) : layout.zones (zones.json en unités du jeu) existe seulement sur la carte à zones ; l'ancienne salle (?map=salle, ?empty=1) n'a qu'une
  // zone, aucune porte et aucune fin de monde. Lot 3e : les zones de l'étage et les portes 2 et 3 (escaliers) en font partie.
  const zoneCfg = layout.zones;
  const doorCfgs = layouts.doors ?? [];
  const zoneOf = zoneCfg ? assignWindows(zoneCfg, geoms.map((g) => ({ id: g.id, floor: g.floor, entryInner: g.entryInner }))) : Object.fromEntries(geoms.map((g) => [g.id, 'depart']));
  const doorSink = num(cfg.waves.doorSinkTime, 1.2);
  // Débris des planches arrachées (lot 3a) : jamais dans un meuble ni hors de la salle de leur étage ; la géométrie des planches est dans js/core/plank-layout.js.
  const plankCfg = plankSettings(windowsCfg, cfg.render);
  const debrisLayoutOf = (f) => ({ params: plankCfg, obstacles: layoutOf(f).furniture, bounds: layoutOf(f).bounds, inside: layoutOf(f).inside });
  const debrisGeoms = new Map(geoms.map((g) => [g.id, { ...g, inner: layoutOf(g.floor).faceInner(g) }]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fadeOptions = { fadeOut: stairCfg.fadeOut, fadeIn: stairCfg.fadeIn, fadeLockReduced: stairCfg.fadeLockReduced, reduced };
  const stairsWorld = multi ? layouts.stairs : [];

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
  // ?wave=N ouvre les portes dont openAfterWave < N dès le chargement : leur maillage n'est même pas construit.
  const startOpen = zoneCfg ? doorsOpenAtStart(zoneCfg, params.wave ?? 1) : [];
  // Étage de départ (lot 3e, ?floor=1) : seulement si un escalier est ouvert au chargement ; sinon ignoré.
  const stairsOpenAtStart = stairState(stairsWorld, startOpen).filter((st) => st.usable);
  const startFloor = multi && params.floor === 'etage' && stairsOpenAtStart.length > 0 ? 'etage' : 'rdc';
  // Les deux étages sont construits une seule fois, ici, derrière l'écran de préparation ; durée exposée par ?fps=1.
  const buildStart = performance.now();
  const world = buildWorld({ palette, layout, layouts, render, textures, windowGeoms: geoms, windowsCfg, seed: ctx.seed, closedDoors: doorCfgs.filter((d) => !startOpen.includes(d.id)).map((d) => d.id), stairs: stairsWorld });
  if (ctx.perf) ctx.perf.floorsMs = performance.now() - buildStart;
  const rig = createCamera(render.camera, cfg.camera, layout, params.tilt, params.zoom);
  const kit = createKit({ textures, variants: ctx.variants, hit: palette.hit });
  const effects = createEffects(world.effectsRoot, palette, { gunHeight: render.gunHeight, bulletRadius: cfg.weapon.bulletRadius });
  const hud = createHud(ctx.dict);
  const floorFade = createFloorFade();
  const splashView = createSplashView(ctx.dict);
  const splashOptions = { reducedMotion: reduced, params: ctx.splashCfg };
  const playerChar = createCharacter(kit, 'player');
  world.scene.add(playerChar.root);
  // Hauteur d'un étage (render.json) : le joueur reste à y = 0, c'est le monde qui descend quand il monte (world.setElevation).
  const LIFT = Number.isFinite(render.floorLift) ? render.floorLift : 0;
  const liftOf = (f) => (f === 'etage' ? LIFT : 0);
  const zombies = new Map(); // id -> { char, phase, x, y, flashing }
  const spare = kit.variants.map(() => []); // personnages retirés, un stock par variante (leurs géométries diffèrent)
  // Type de chaque obstacle (meubles et décor solide, des deux étages) pour le son d'impact ; les murs se reconnaissent à leur identifiant.
  const obstacleKinds = new Map(layouts.floors.flatMap((f) => [...layoutOf(f).furniture, ...(layoutOf(f).decor?.solids ?? [])]).map((o) => [o.id, o.kind]));
  const zombieNames = ctx.variants.zombie.variants.map((v) => v.id);
  const typeIndex = new Map(zombieNames.map((name, i) => [name, i])); // type de zombie -> variante visuelle (mêmes noms)
  const wallsOf = (f) => (layoutOf(f).empty ? [] : layoutOf(f).walls);
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
  const eventLog = []; // journal des événements de zone : { type: 'doorAnnounce' | 'doorOpen', door, wave, time } (tests)
  const stairWalks = Object.fromEntries(stairsWorld.filter((q) => q.walk).map((q) => [q.id, { path: q.walk.path, width: q.walk.width }]));
  const stairLog = []; // journal des escaliers : { type: 'stairStart' | 'stairArrive' | 'playerStairs', ... } (tests)
  let anim;
  let lastFire;
  let sparks;
  let laser;
  let lastPose = computePose({});
  let lastInfo = { calls: 0, triangles: 0 };
  const shotLog = []; // journal des tirs : { id, time, angle, aimAngle } (tests)
  const spawnLog = []; // journal des apparitions : { id, time, hidden, floor }
  let size = { width: 1, height: 1, unitsPerPixel: 1 };
  let stale = true; // vrai tant que l'image affichée n'est pas à jour

  // Étage du joueur : un état du jeu (js/core/floor-sim.js le porte avec les grilles) ; tout calcul qui le concerne ne voit que les entités de cet étage.
  const pf = () => sim.fs?.playerFloor ?? 'rdc';
  // Portes (lot 3c) : une porte fermée est un obstacle plein pour le joueur, les zombies (grille de chemin), les balles et le laser ; ouverte, elle n'est nulle part.
  // Lot 3e : un bloc par étage ; les escaliers dont la porte est ouverte deviennent utilisables.
  const doorById = new Map(doorCfgs.map((d) => [d.id, d]));
  const openIds = () => doorCfgs.filter((d) => sim.doors[d.id]?.open).map((d) => d.id);
  function syncSolids() {
    const open = openIds();
    const l = layoutOf(pf());
    playerSolids = [...l.playerObstacles, ...closedDoors(l, open)];
    blockers = l.empty ? [] : [...l.furniture.filter((f) => f.kind !== 'escalier'), ...l.walls, ...(l.decor?.solids ?? []), ...closedDoors(l, open)];
  }
  const activeIdsNow = () => (zoneCfg ? activeWindows(zoneCfg, zoneOf, openIds()) : geoms.map((g) => g.id));
  const allSpawnPoints = () => layouts.floors.flatMap((f) => (layoutOf(f).spawnPoints ?? layoutOf(f).windows).map((p) => ({ ...p, floor: f })));
  const activePointsNow = () => (zoneCfg ? activeSpawnPoints(zoneCfg, zoneOf, allSpawnPoints(), openIds()) : layout.spawnPoints ?? layout.windows);
  // Marques au sol des zones de déclenchement : seulement celles des escaliers utilisables.
  function syncStairMarks() {
    for (const st of stairState(stairsWorld, openIds())) world.setStairUsable(st.id, st.usable);
  }
  // Les portes ont changé : collisions, grilles de chemin, escaliers utilisables et champs de flux vers eux (calculés ici, jamais par image), marques.
  function syncDoorState() {
    syncSolids();
    if (siegeOn) sim.fs = syncDoors(fw, sim.fs, openIds());
    syncStairMarks();
    world.windowMeshes?.sync(sim.win);
  }
  // Ouverture d'une porte (événement doorOpen du directeur), dans l'ordre : les blocs quittent les collisions et la grille de chemin, les escaliers deviennent utilisables
  // et leurs champs de flux sont recalculés, le champ du joueur est recalculé, les fenêtres et points d'apparition de la zone s'activent (activeIdsNow, activePointsNow
  // lisent l'état), le rendu lance l'enfoncement. Rien d'autre ne change : planches, débris et chutes sont conservés.
  function openDoor(id) {
    if (!doorById.has(id) || sim.doors[id]?.open || doorById.get(id).planned) return;
    const animate = !reduced;
    sim.doors = { ...sim.doors, [id]: { open: true, sink: animate ? 0 : 1, sinking: animate } };
    syncDoorState();
    if (!animate) world.doors.remove(id);
  }
  // Test (setDoor, startWave) : ouvre ou ferme une porte d'un coup, sans transition ni annonce.
  function setDoorInstant(id, open) {
    if (!doorById.has(id)) return false;
    sim.doors = { ...sim.doors, [id]: { open, sink: open ? 1 : 0, sinking: false } };
    if (open) world.doors.remove(id);
    else {
      world.doors.add(id);
      world.doors.sink(id, 0);
    }
    syncDoorState();
    return true;
  }
  // Enfoncement : avance avec le temps de jeu (figé par la pause) ; la porte est retirée de la scène, géométrie libérée, quand elle a disparu.
  function advanceDoors(dt) {
    for (const d of doorCfgs) {
      const st = sim.doors[d.id];
      if (!st?.sinking) continue;
      const sink = Math.min(1, st.sink + dt / Math.max(0.05, doorSink));
      sim.doors = { ...sim.doors, [d.id]: { open: true, sink, sinking: sink < 1 } };
      if (sink >= 1) world.doors.remove(d.id);
      else world.doors.sink(d.id, sink);
    }
  }

  // Débris : une planche arrachée en laisse un au sol (le plus ancien disparaît au-delà de 12, tous après 25 s) ; une planche réparée en retire un.
  const dropDebris = (id, n) => {
    const g = debrisGeoms.get(id);
    for (let i = 0; i < n && g; i += 1) sim.debris = addDebris(sim.debris, g, ctx.seed, debrisLayoutOf(g.floor));
  };
  function dictName(id) {
    const key = WINDOW_NAMES[id];
    return key ? ctx.dict[key] : id;
  }

  // Étage affiché : seul l'étage du joueur est dessiné (l'extérieur toujours) ; aucune reconstruction.
  function showFloor(f) {
    sim.elev = liftOf(f);
    world.showFloor(f);
    syncSolids();
    stale = true;
  }
  // Où le joueur est placé en arrivant à un étage : le point d'arrivée de l'escalier.
  const floorStart = (f) => {
    if (f === 'rdc') return { ...layout.start };
    const st = stairsOpenAtStart[0] ?? stairState(stairsWorld, openIds()).find((q) => q.usable);
    const a = st ? stairArrival(stairsWorld.find((q) => q.id === st.id), 'etage') : null;
    return a ?? { ...layout.start };
  };

  // Partie neuve : état pur remis à zéro, zombies retirés (leurs personnages vont dans le stock).
  function reset(seed) {
    for (const z of zombies.values()) {
      world.dynamic.remove(z.char.root);
      z.char.setFlash(false);
      spare[z.char.variant].push(z.char);
    }
    zombies.clear();
    voices.clear();
    spawnLog.length = 0;
    shotLog.length = 0;
    eventLog.length = 0;
    stairLog.length = 0;
    const opened = Object.fromEntries(doorCfgs.map((d) => [d.id, startOpen.includes(d.id) ? { open: true, sink: 1, sinking: false } : { open: false, sink: 0, sinking: false }]));
    const first = startFloor === 'etage' ? floorStart('etage') : layout.start;
    const fs = siegeOn ? createFloorState(fw, { planks: params.planks ?? undefined, openDoors: startOpen, playerFloor: startFloor }) : null;
    sim = {
      fs,
      player: { x: first.x, y: first.y, r: cfg.player.radius, health: eff.player.maxHealth, maxHealth: eff.player.maxHealth, floor: startFloor },
      aim: createAim(0),
      enemies: [],
      bullets: [],
      weapon: createWeaponState(),
      waves: createDirector(cfg.waves, { seed, wave: params.wave ?? 1, inactive: params.nospawn, doors: doorCfgs.map((d) => ({ id: d.id, openAfterWave: d.openAfterWave, planned: d.planned === true })), wavesPerWorld: zoneCfg ? zoneCfg.wavesPerWorld : null, endless: params.endless === true }),
      doors: opened,
      worldOver: false,
      waveParams: cfg.waves,
      splash: createSplash(),
      splashView: stepSplash(createSplash(), null, 0, splashOptions).view,
      win: fs ? fs.win : createWindowsState([], windowsCfg),
      repair: {},
      announced: {},
      announcedBusy: {},
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
      tr: createTransition(), // fondu entre étages (js/core/floor-transition.js)
      trView: { veil: 0, locked: false, swap: false, phase: 'idle' },
      stairWatch: createStairWatch(),
      sw: null, // escalier physique en cours : { stair, s, floor, from, auto } (js/core/stair-walk.js)
      elev: liftOf(startFloor), // hauteur du joueur, de 0 à floorLift
      floorGrace: 0, // protection de 1,0 s après l'arrivée à un étage (en plus du verrou du fondu)
      floorLive: null,
    };
    splashView.apply(sim.splashView);
    sim.debris = createDebris();
    for (const g of geoms) dropDebris(g.id, g.id in sim.win.windows ? sim.win.windows[g.id].maxPlanks - sim.win.windows[g.id].planks : 0);
    world.doors.reset(doorCfgs.filter((d) => !sim.doors[d.id].open).map((d) => d.id));
    for (const d of doorCfgs) if (sim.doors[d.id].open) world.doors.remove(d.id);
    syncStairMarks();
    floorFade.set(0);
    world.showFloor(startFloor);
    syncSolids();
    world.windowMeshes?.sync(sim.win);
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
    world.setFog(rig.view.distance);
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
  function addEnemy(x, y, { type, gait, spec, from, window: windowId = null, mode = 'libre', floor = 'rdc' } = {}) {
    const at = layouts.floors.includes(floor) ? floor : 'rdc';
    const typed = isType(type);
    const created = createEnemy(typed ? type : 'marcheur', isGait(gait) ? gait : 'marche', spec ?? waveSpec(1, sim.waveParams), cfg.enemies, cfg.gaits);
    const visual = typed ? typeIndex.get(type) : variantFor(sim.nextId, ctx.seed, kit.variants.length);
    const enemy = {
      id: sim.nextId, x, y, r: created.radius, health: created.hp, maxHealth: created.maxHp, hitCooldown: 0, flash: 0,
      type: created.type, gait: created.gait, speed: created.speed, damage: created.damage, stride: created.stride, visual, tearMul: created.tearMul, mode: typeof mode === 'string' ? mode : 'libre', window: windowId, slot: null, floor: at, ...(from === undefined || from === null ? {} : { from }),
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

  // Les zombies trop proches du point d'arrivée du joueur sont repoussés (même routine que la chute, restreinte à l'étage d'arrivée).
  function knockArrival(at, to) {
    const kb = arrivalKnockback(at, stairCfg);
    const l = layoutOf(to);
    sim.enemies = knockbackZombies(sim.enemies, { ...kb.center, floor: to }, { radius: kb.radius, distance: kb.distance }, { bounds: l.bounds, inside: l.inside, furniture: [...l.furniture, ...closedDoors(l, openIds())], walls: l.walls, gaps: l.gaps });
  }

  // Escalier physique (mise à jour du lot 3e) : le joueur marche dans l'escalier, sa position suit le chemin et sa hauteur monte (js/core/stair-walk.js) ; son étage
  // logique change à mi-hauteur (collisions, étage dessiné pour les zombies, balles supprimées), sans fondu ni téléportation.
  function startPhysical(stairId, auto = false) {
    const usable = stairState(stairsWorld, openIds()).find((q) => q.id === stairId)?.usable === true;
    const def = stairsWorld.find((q) => q.id === stairId);
    if (!usable || !def?.walk || sim.sw !== null || sim.dead || sim.tr.phase !== 'idle') return false;
    sim.sw = startWalk(stairId, pf(), auto);
    if (sim.sw !== null && auto) {
      // Hook de test : le joueur est placé au bout du chemin de son étage (premier point au rez-de-chaussée, dernier à l'étage) avant la marche automatique.
      const path = def.walk.path;
      const end = pf() === 'etage' ? path[path.length - 1] : path[0];
      sim.player = { ...sim.player, x: end.x, y: end.y };
      anim = { ...anim, x: end.x, y: end.y };
    }
    return sim.sw !== null;
  }
  // Cible des zombies de l'étage du joueur : dans l'escalier le joueur est au milieu de l'emprise (un obstacle, donc sans chemin) ; ils le suivent jusqu'au bout de l'escalier
  // de son étage logique (le pied au rez-de-chaussée, le palier à l'étage) et le rejoignent dès qu'il en sort.
  // Un zombie est dessiné : ceux de l'étage du joueur ; depuis l'étage aussi ceux du rez-de-chaussée (plus bas, vus par le trou) ; ceux qui marchent dans un escalier
  // tant qu'ils sont à portée de vue (toute la rampe depuis l'étage, sa moitié basse depuis le rez-de-chaussée).
  function drawnOf(e) {
    const zf = floorOf(e);
    if (e.mode === 'escalier') return pf() === 'etage' || num(e.stairT) < SWAP_UP + 0.1;
    return zf === pf() || (pf() === 'etage' && zf === 'rdc');
  }
  function chaseTarget() {
    if (sim.sw === null) return sim.player;
    const path = stairsWorld.find((q) => q.id === sim.sw.stair)?.walk?.path;
    const end = path ? (pf() === 'etage' ? path[path.length - 1] : path[0]) : null;
    return end ? { ...sim.player, x: end.x, y: end.y } : sim.player;
  }
  function crossFloor(to) {
    const from = pf();
    sim.fs = setPlayerFloor(fw, sim.fs, to);
    sim.player = { ...sim.player, floor: to };
    sim.bullets = [];
    laser = null;
    syncSolids();
    sim.floorLive = ctx.dict[FLOOR_TEXTS.live[to]];
    stairLog.push({ type: 'playerStairs', stair: sim.sw?.stair ?? null, from, to, time: sim.time, instant: false, walk: true });
  }
  function advanceWalk(dir, dt) {
    const def = stairsWorld.find((q) => q.id === sim.sw.stair);
    const r = stepWalk(sim.sw, def?.walk?.path, { pos: sim.player, dir, speed: eff.player.speed, dt, width: def?.walk?.width, radius: sim.player.r });
    sim.player = { ...sim.player, x: r.pos.x, y: r.pos.y };
    sim.elev = heightOf(r.point.t, LIFT);
    if (r.floor !== pf() && !r.done) crossFloor(r.floor);
    if (r.done === null) {
      sim.sw = r.walk;
      return;
    }
    // Sortie de l'escalier par un bout (en haut, en bas, ou demi-tour) : délai de 0,8 s et verrou tant que le joueur reste dans la zone ; protection de 1,0 s s'il a changé d'étage.
    if (r.done !== pf()) crossFloor(r.done);
    const from = sim.sw.from;
    sim.sw = null;
    sim.elev = liftOf(r.done);
    // Pas de verrou de zone à la sortie : le joueur sort dans la zone de déclenchement et doit pouvoir reprendre l'escalier en y marchant (délai de 0,8 s seulement).
    sim.stairWatch = { cooldown: stairCfg.stairCooldownPlayer, lock: null };
    if (r.done !== from) sim.floorGrace = stairCfg.stairGraceAfter; // pas de repoussement : les zombies sont libres dans l'escalier, aucun saut à la sortie
    stale = true;
  }

  // Change l'étage du joueur (au milieu du fondu, ou d'un coup pour le hook setFloor) : il est placé au point d'arrivée de l'escalier, les balles en vol disparaissent,
  // les zombies trop proches de l'arrivée sont repoussés (même routine que la chute, restreinte à l'étage d'arrivée), il est protégé 1,0 s.
  function arriveAt(stairId, to, { instant = false } = {}) {
    const st = stairsWorld.find((q) => q.id === stairId);
    const at = st ? stairArrival(st, to) : null;
    if (!at) return false;
    const from = pf();
    sim.fs = setPlayerFloor(fw, sim.fs, to);
    sim.player = { ...sim.player, x: at.x, y: at.y, floor: to };
    sim.bullets = [];
    sim.floorGrace = stairCfg.stairGraceAfter;
    sim.stairWatch = startStairCooldown(sim.stairWatch, stairId, stairCfg);
    knockArrival(at, to);
    showFloor(to);
    rig.snap(at.x, at.y);
    anim = { ...anim, x: at.x, y: at.y };
    laser = null;
    sim.floorLive = ctx.dict[FLOOR_TEXTS.live[to]];
    stairLog.push({ type: 'playerStairs', stair: stairId, from, to, time: sim.time, instant });
    return true;
  }

  // Démarre le fondu vers l'autre étage par l'escalier `stairId` (le joueur a marché dans sa zone de déclenchement, ou hook useStair).
  function beginFloorChange(stairId) {
    const st = stairState(stairsWorld, openIds()).find((q) => q.id === stairId);
    if (!st?.usable || sim.tr.phase !== 'idle' || sim.dead) return false;
    sim.tr = startTransition(sim.tr, pf(), otherFloor(pf()), stairId, fadeOptions);
    sim.pendingStair = stairId;
    return true;
  }

  function step(dt) {
    const { input, override, audio } = ctx;
    const weapon = eff.weapon;
    sim.time += dt;

    // Fondu entre étages : il avance avec le temps de jeu (figé par la pause) ; à l'image où le voile est plein, l'étage du joueur change, une seule fois. Pendant la
    // transition (0,5 s) le joueur est verrouillé : immobile, sans tir, invulnérable ; les zombies continuent.
    const fade = stepTransition(sim.tr, dt, fadeOptions);
    sim.tr = fade.state;
    sim.trView = fade.view;
    if (fade.view.swap) arriveAt(sim.pendingStair ?? fade.view.stair, fade.view.to);
    const locked = fade.view.locked;
    sim.floorGrace = Math.max(0, sim.floorGrace - dt);

    const events = []; // événements sonores de cette image (traités par js/core/sound-director.js)
    // À terre ou pendant le fondu, le joueur ne bouge pas, ne tire pas et son laser est masqué (js/core/player-down.js).
    const standing = canMove(sim.down) && !locked;
    const firing = canFire(sim.down) && !locked;
    const dir = standing ? override.move ?? input.move() : { x: 0, y: 0 };
    const before = sim.player;
    advanceDoors(dt);
    if (sim.sw !== null) advanceWalk(dir, dt);
    else {
      const pos = moveCircle(sim.player, dir, eff.player.speed, dt, layout.moveRoom, playerSolids);
      sim.player = { ...sim.player, ...pos };
    }
    // Pas : la phase de marche avance avec la distance réellement parcourue (même rythme que les poses : STRIDE par unité).
    const moved = Math.hypot(sim.player.x - before.x, sim.player.y - before.y);
    const phase = sim.walk.phase + moved * STRIDE;
    const foot = stepFootsteps(sim.walk.steps, sim.walk.phase, phase, moved / Math.max(dt, 1e-6), sim.time, eff.player.speed, ctx.audioCfg?.footsteps);
    sim.walk = { phase, steps: foot.state };
    // Cône : le rapport de vitesse (vitesse réelle / vitesse maximale effective) est lissé, indépendamment du nombre d'images par seconde.
    sim.spread = stepSpreadRatio(sim.spread, speedRatio(dt > 0 ? moved / dt : 0, eff.player.speed), dt, cfg.stats.spread?.widenTime, cfg.stats.spread?.narrowTime);
    if (foot.step) events.push({ type: 'playerStep', ...foot.step });
    sim.aim = aimAngle(sim.aim);

    // Escaliers (lot 3e) : le centre du joueur dans la zone de déclenchement d'un escalier utilisable de son étage, délai de 0,8 s écoulé et sorti de la zone du
    // dernier escalier pris : le fondu démarre. Un escalier fermé n'a aucune zone.
    if (multi && !locked && standing && !sim.dead && sim.sw === null) {
      const watch = stepStairWatch(sim.stairWatch, dt, sim.player, stairTriggers(stairsWorld, pf(), openIds()));
      sim.stairWatch = watch.watch;
      if (watch.trigger) {
        const def = stairsWorld.find((q) => q.id === watch.trigger.stair);
        if (reduced || !def?.walk) beginFloorChange(watch.trigger.stair);
        else if (wantsStairs(dir, entryDirection(def.walk.path, pf()))) startPhysical(watch.trigger.stair);
        else sim.stairWatch = { cooldown: watch.watch.cooldown, lock: null }; // passe à côté : l'escalier n'est pris qu'en marchant vers lui
      }
    } else if (sim.sw !== null) sim.stairWatch = { cooldown: 0, lock: sim.sw.stair };
    else sim.stairWatch = stepStairWatch(sim.stairWatch, dt, { x: NaN, y: NaN }, []).watch;

    // Laser : sert à viser et à déclencher le tir, jamais aux dégâts.
    const muzzle = muzzlePoint(sim.player, sim.aim.angle, weapon.muzzleOffset, layout.muzzleBounds);
    const ray = castRay(muzzle, sim.aim.angle, weapon.laserRange, sim.enemies, shotBounds, blockers, pf());
    laser = !firing ? null : { from: muzzle, ray, cone: { angle: sim.aim.angle, half: toRadians(halfAngle()), length: weapon.laserRange } };
    // Le tir part aussi quand la visée passe sur un ennemi au-delà de la portée du laser (le trait s'estompe, la balle continue) ;
    // un ennemi caché derrière un meuble ne déclenche jamais de tir.
    // Marge de visée : le tir part si la ligne passe à moins de aimTolerance du bord d'un ennemi ; la balle suit la vraie visée et peut le rater.
    const wide = sim.enemies.map((e) => ({ ...e, r: e.r + num(weapon.aimTolerance) }));
    const aimed = firing && (ray.hit !== null || castRay(muzzle, sim.aim.angle, weapon.fireRange, wide, shotBounds, blockers, pf()).hit !== null);

    const trigger = stepWeapon(sim.weapon, dt, aimed, weapon, sim.bullets.length);
    sim.weapon = trigger.state;
    if (trigger.fire) {
      // La balle part dans le cône autour de l'axe de visée (tirage triangulaire, graine du jeu) ; ses dégâts sont figés ici.
      const shot = shotAngle(sim.aim.angle, toRadians(halfAngle()), sim.rng);
      sim.rng = shot.rng;
      sim.bullets = [...sim.bullets, { ...createBullet(muzzle, shot.angle, weapon, sim.nextId, sim.aim.angle), floor: pf() }];
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

    if (siegeOn) {
      // Champ de flux du joueur (à son étage) : recalculé au plus toutes les 0,25 s de jeu et seulement s'il change de cellule ; durée mesurée (?fps=1).
      const t0 = ctx.perf ? performance.now() : 0;
      const before = sim.fs.flow;
      sim.fs = stepPlayerFlow(fw, sim.fs, dt, chaseTarget());
      if (ctx.perf && sim.fs.flow !== before && sim.fs.flow.recomputed) {
        const ms = performance.now() - t0;
        ctx.perf.flowSum += ms;
        ctx.perf.flowCount += 1;
        ctx.perf.flowMax = Math.max(ctx.perf.flowMax, ms);
      }
      let windowLive = null;
      // Siège de chaque étage (js/core/siege.js), planches, réparation automatique près d'une fenêtre de l'étage du joueur, déplacement des zombies de chaque étage
      // (poursuite du joueur à son étage, champ de flux vers l'escalier le plus proche à l'autre), franchissement des escaliers (js/core/floor-sim.js).
      const activeIds = activeIdsNow();
      const out = stepFloors(fw, sim.fs, { enemies: sim.enemies, player: chaseTarget(), dt, active: activeIds, canRepair: !sim.dead && !locked, repairTime: eff.player.repairTime, flowDone: true, follow: sim.sw?.stair, realPlayer: sim.player, walks: stairWalks });
      sim.fs = out.state;
      sim.enemies = out.enemies;
      sim.win = out.state.win;
      sim.repair = Object.fromEntries(geoms.map((g) => [g.id, { repairing: out.repair[g.id].repairing, blocked: out.repair[g.id].blocked, progress: sim.win.windows[g.id].repairProgress, attacked: out.repair[g.id].attacked }]));
      // Réparation bloquée : phrase longue annoncée par #hud-live, au plus une fois par fenêtre et par 10 s (E2-9 reste muet pour les lecteurs d'écran).
      for (const g of geoms) {
        if (out.repair[g.id].repairing === false && g.floor === pf() && !sim.dead && activeIds.includes(g.id) && out.repairBlocked[g.id] === true && Math.hypot(sim.player.x - g.repairSpot.x, sim.player.y - g.repairSpot.y) <= windowsCfg.repairRadius && sim.win.windows[g.id].planks < sim.win.windows[g.id].maxPlanks && sim.time - (sim.announcedBusy[g.id] ?? -Infinity) >= 10) {
          sim.announcedBusy[g.id] = sim.time;
          windowLive = fmt(ctx.dict[WINDOW_TEXTS.liveBusy], { name: dictName(g.id) });
        }
      }
      for (const ev of out.events) {
        const g = geomById.get(ev.windowId);
        if (ev.type === 'plank-torn') {
          events.push({ type: 'plankTorn', x: g.center.x, y: g.center.y, windowId: ev.windowId, floor: ev.floor });
          dropDebris(ev.windowId, 1);
        } else if (ev.type === 'plank-repaired') {
          events.push({ type: 'plankRepaired', x: g.center.x, y: g.center.y, windowId: ev.windowId, floor: ev.floor });
          sim.debris = removeDebris(sim.debris, ev.windowId, 1);
        } else if (ev.type === 'stairStart' || ev.type === 'stairArrive') {
          stairLog.push({ type: ev.type, id: ev.id, stair: ev.stair, from: ev.from, to: ev.to, time: sim.time });
        }
        // Annonces vocales : « ouverte » au plus une fois par fenêtre et par 10 s (même pour une fenêtre de l'autre étage : annonce vocale seulement), « réparée »
        // quand toutes les planches sont revenues.
        if (ev.type === 'window-open' && sim.time - (sim.announced[ev.windowId] ?? -Infinity) >= 10) {
          sim.announced[ev.windowId] = sim.time;
          windowLive = fmt(ctx.dict[WINDOW_TEXTS.liveOpen], { name: dictName(ev.windowId) });
        } else if (ev.type === 'plank-repaired' && ev.planks === sim.win.windows[ev.windowId].maxPlanks) windowLive = fmt(ctx.dict[WINDOW_TEXTS.liveRepaired], { name: dictName(ev.windowId) });
      }
      world.windowMeshes?.sync(sim.win); // planche arrachée ou posée : le maillage suit (seules les planches modifiées sont réécrites)
      if (windowLive !== null) ctx.ui.setLive(windowLive);
      sim.debris = stepDebris(sim.debris, dt, plankCfg);
      // Par quelle fenêtre chaque zombie est entré : la plus proche de l'endroit où il franchit la limite de la salle de son étage.
      sim.enemies = sim.enemies.map((e) => (e.entered || e.mode === 'escalier' || !layoutOf(floorOf(e)).inside(e.x, e.y) ? e : { ...e, entered: entryWindow(e, layoutOf(floorOf(e)).windows) }));
    } else {
      sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie);
    }

    // Vagues (js/core/wave-director.js) : jamais à l'écran, seuls les points hors de la vue (agrandie) sont possibles ; la salle du lot 1m
    // (?empty=1) n'a pas de vue limitée. ?nospawn=1 : directeur inactif, aucune vague.
    let waveLive = null;
    let announcedDoor; // manche qui vient de s'achever, à l'image où le directeur annonce la nouvelle zone
    let announcedKey; // sous-titre de cette annonce (selon la porte : porte, escalier, escalier et porte)
    let worldEnded = false;
    if (sim.waves.phase !== 'inactif') {
      const view = layout.empty ? null : visibleRect();
      // Les points d'apparition sont ceux des zones ouvertes de tous les étages ; la règle « jamais dans la vue » ne vaut que pour l'étage du joueur.
      const out = stepDirector(sim.waves, { dt, alive: sim.enemies.length, view, points: activePointsNow(), playerFloor: pf(), siege: siegeOn });
      sim.waves = out.state;
      for (const r of out.requests) {
        const at = r.floor ?? 'rdc';
        addEnemy(r.x, r.y, { type: r.type, gait: r.gait, spec: out.state.spec, from: r.pointId, window: r.window, mode: siegeOn ? r.mode : 'libre', floor: at });
        spawnLog.push({ id: r.pointId, time: sim.time, hidden: view && at === pf() ? isHidden(r, view, 0, 0) : true, type: r.type, gait: r.gait, floor: at });
      }
      for (const ev of out.events) {
        if (ev.type === 'waveStart') {
          waveLive = fmt(ctx.dict['game.wave.live'], { n: ev.wave });
        } else if (ev.type === 'doorAnnounce') {
          announcedDoor = ev.wave;
          eventLog.push({ type: 'doorAnnounce', door: ev.door, wave: ev.wave, time: sim.time });
          announcedKey = doorById.get(ev.door)?.subtitleKey ?? zoneCfg?.doors?.find((q) => q.id === ev.door)?.subtitleKey;
          // « Nouvelle zone » une fois dans #hud-live, avec le sous-titre de la porte (la porte 1 garde son texte d'avant).
          waveLive = announcedKey && announcedKey !== SPLASH_TEXTS.zoneSubtitle ? `${ctx.dict[SPLASH_TEXTS.zoneTitle]}. ${ctx.dict[announcedKey]}.` : ctx.dict[ZONE_TEXTS.liveZone];
        } else if (ev.type === 'doorOpen') {
          openDoor(ev.door);
          eventLog.push({ type: 'doorOpen', door: ev.door, wave: ev.wave, time: sim.time });
        } else if (ev.type === 'worldEnd') {
          worldEnded = true;
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
    const spl = stepSplash(sim.splash, { ...waveInfo(sim.waves), playerAlive: sim.player.health > 0, doorAnnounce: announcedDoor, doorSubtitle: announcedKey }, dt, splashOptions);
    sim.splash = spl.state;
    sim.splashView = spl.view;
    if (spl.view.sound) events.push(spl.view.sound.name === 'vague-fin' ? { type: 'waveEnd', variant: spl.view.sound.variant } : { type: 'waveSplash', sound: spl.view.sound.name, variant: spl.view.sound.variant });

    const contact = stepContact(sim.player, sim.enemies, dt, cfg.zombie, isInvulnerable(sim.down) || locked || sim.floorGrace > 0);
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
      // Le repoussement de la chute et du relevage ne concerne que les zombies de l'étage du joueur.
      const l = layoutOf(pf());
      sim.enemies = knockbackZombies(sim.enemies, sim.player, pd.knockback, { bounds: l.bounds, inside: l.inside, furniture: [...l.furniture, ...closedDoors(l, openIds())], walls: l.walls, gaps: l.gaps });
    }

    // Sons : chaque événement et chaque zombie porte son étage ; ceux de l'autre étage sont entendus étouffés (js/core/sound-director.js).
    audio?.handle({ time: sim.time, listener: sim.player, floor: pf(), walls: wallsOf(pf()), paused: ctx.ui.isPaused(), events, zombies: sim.enemies.filter((e) => e.mode !== 'escalier').map((e) => ({ id: e.id, x: e.x, y: e.y, variant: variantName(e.id), gait: e.gait, stride: e.stride, floor: floorOf(e) })) });

    const bucket = Math.ceil((displayHealth(sim.player.health) / sim.player.maxHealth) * 10);
    if (bucket !== sim.lifeBucket && sim.player.health > 0 && sim.down.state === 'debout') {
      sim.lifeBucket = bucket;
      ctx.ui.setLive(fmt(ctx.dict['game.live.life'], { hp: displayHealth(sim.player.health), max: sim.player.maxHealth }));
    }
    // Le message d'étage (Étage, Rez-de-chaussée) est annoncé une fois par changement ; le message de vague passe avant le message de vie (le soin de fin de vague
    // change aussi la vie).
    if (sim.floorLive !== null) {
      ctx.ui.setLive(sim.floorLive);
      sim.floorLive = null;
    }
    if (waveLive !== null) ctx.ui.setLive(waveLive);
    if (downLive !== null) ctx.ui.setLive(downLive);
    if (sim.down.state === 'mort') {
      sim.dead = true;
      // Mort : le fondu est annulé aussitôt (voile à 0) et l'étage affiché est le rez-de-chaussée.
      sim.tr = cancelTransition();
      sim.trView = { veil: 0, locked: false, swap: false, phase: 'idle' };
      if (multi && (pf() !== 'rdc' || sim.sw !== null || sim.elev > 0)) {
        sim.sw = null;
        sim.fs = setPlayerFloor(fw, sim.fs, 'rdc');
        sim.player = { ...sim.player, floor: 'rdc' };
        showFloor('rdc');
      }
      // Mort : l'animation est masquée aussitôt et la mélodie s'arrête en fondu (0,3 s).
      const off = stepSplash(sim.splash, { ...waveInfo(sim.waves), playerAlive: false }, 0, splashOptions);
      sim.splash = off.state;
      sim.splashView = off.view;
      audio?.stopAnnounce();
      input.releaseAll();
      ctx.ui.setLive(fmt(ctx.dict['game.live.dead'], { n: sim.kills }));
      ctx.ui.showEnd(sim.kills, waveInfo(sim.waves).wave);
    }
    // Fin du monde (lot 3c) : la manche wavesPerWorld est terminée ; écran provisoire « Monde terminé », la partie s'arrête (Rejouer repart de la manche 1).
    if (worldEnded && !sim.dead) {
      sim.worldOver = true;
      sim.splash = createSplash();
      sim.splashView = stepSplash(sim.splash, null, 0, splashOptions).view;
      audio?.stopAnnounce();
      input.releaseAll();
      ctx.ui.setLive(ctx.dict[ZONE_TEXTS.liveWorld]);
      ctx.ui.showEnd(sim.kills, waveInfo(sim.waves).wave, 'world');
    }
  }

  // Panneau de pause (E2-6) : « Prochaine zone : manche N » tant qu'une porte active reste fermée ; écrit seulement si la valeur change.
  let nextZoneShown;
  function updateNextZone() {
    const next = zoneCfg ? nextDoor(zoneCfg, 1, openIds()) : null;
    const wave = next ? next.wave : null;
    if (wave === nextZoneShown) return;
    nextZoneShown = wave;
    ctx.ui.setNextZone(wave);
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

  // Fenêtres en alerte (js/core/hud-windows.js) : attaquées ou ouvertes, les plus urgentes d'abord ; elles guident les flèches E2-11 (plus de rangée dans le HUD).
  const hudLabels = Object.fromEntries(geoms.map((g) => [g.id, ctx.dict[WINDOW_INITIALS[g.id]] ?? '']));
  const hudWindows = () => geoms.filter((g) => g.floor === pf()).map((g) => ({ id: g.id, planks: sim.win.windows[g.id].planks, maxPlanks: sim.win.windows[g.id].maxPlanks, attacked: sim.repair[g.id]?.attacked === true }));

  // E2-11 : flèches au bord de l'écran vers les 2 fenêtres en alerte les plus urgentes qui ne sont pas à l'écran (js/core/edge-arrow.js). Aucune
  // pulsation ni clic ; les flèches glissent le long du bord pour ne pas recouvrir le HUD, le bouton Pause ni l'indicateur de réparation.
  const edgeEls = [...document.querySelectorAll('#edges .edge-arrow')];
  const EDGE_HALF = 20;
  let edgeShown = [];
  const edgeState = []; // { id, x, y, angle, label } des flèches affichées (tests)
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function updateEdgeArrows() {
    if (edgeEls.length === 0) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const css = getComputedStyle(document.documentElement);
    const safe = ['top', 'right', 'bottom', 'left'].map((side) => Number.parseFloat(css.getPropertyValue(`--safe-${side}`)) || 0);
    const inset = { top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] };
    const view = { width: Math.max(1, w - inset.left - inset.right), height: Math.max(1, h - inset.top - inset.bottom) };
    const margin = 16 + EDGE_HALF;
    const shots = [];
    if (!sim.dead) {
      for (const chip of urgentWindows(hudWindows(), { labels: hudLabels })) {
        const g = debrisGeoms.get(chip.id);
        const away = g.inner + plankCfg.wallGap + plankCfg.thickness / 2;
        const at = screenAt(g.center.x - g.normal.x * away, (plankCfg.sill + plankCfg.lintel) / 2, g.center.y - g.normal.y * away);
        const point = { x: (at.x * w - inset.left) / view.width, y: (at.y * h - inset.top) / view.height, behind: at.behind };
        const arrow = edgeIndicator(point, view, margin);
        if (arrow.visible) shots.push({ id: chip.id, label: chip.label, x: arrow.x + inset.left, y: arrow.y + inset.top, angle: arrow.angle });
        if (shots.length >= 2) break;
      }
    }
    // Obstacles à éviter : le HUD, le bouton Pause, les cadres des sticks (rectangles réels, lus seulement si une flèche est affichée).
    if (shots.length > 0) {
      const blockers = [...['hud', 'btn-pause'].map((id) => document.getElementById(id)), ...document.querySelectorAll('.stick:not([hidden]) .stick-base')].filter((node) => node && !node.hidden).map((node) => node.getBoundingClientRect());
      const placed = [];
      for (const shot of shots) {
        const onVertical = shot.x <= inset.left + margin + 0.5 || shot.x >= w - inset.right - margin - 0.5;
        const box = () => ({ left: shot.x - EDGE_HALF - 4, right: shot.x + EDGE_HALF + 4, top: shot.y - EDGE_HALF - 4, bottom: shot.y + EDGE_HALF + 4 });
        for (let tries = 0; tries < 6; tries += 1) {
          const hit = [...blockers, ...placed].find((r) => overlaps(box(), r));
          if (!hit) break;
          if (onVertical) shot.y = shot.y < (hit.top + hit.bottom) / 2 ? hit.top - EDGE_HALF - 5 : hit.bottom + EDGE_HALF + 5;
          else shot.x = shot.x < (hit.left + hit.right) / 2 ? hit.left - EDGE_HALF - 5 : hit.right + EDGE_HALF + 5;
        }
        shot.x = Math.min(w - inset.right - margin, Math.max(inset.left + margin, shot.x));
        shot.y = Math.min(h - inset.bottom - margin, Math.max(inset.top + margin, shot.y));
        placed.push(box());
      }
    }
    const signature = shots.map((a) => `${a.id}:${a.x.toFixed(1)}:${a.y.toFixed(1)}:${a.angle.toFixed(3)}`).join('|');
    if (signature === edgeShown.join('|')) return;
    edgeShown = signature === '' ? [] : [signature];
    edgeState.length = 0;
    edgeEls.forEach((node, i) => {
      const a = shots[i];
      node.hidden = !a;
      if (!a) return;
      node.style.setProperty('--edge-x', `${a.x}px`);
      node.style.setProperty('--edge-y', `${a.y}px`);
      node.style.setProperty('--edge-angle', `${a.angle}rad`);
      node.querySelector('.edge-letter').textContent = a.label;
      edgeState.push({ id: a.id, label: a.label, x: a.x, y: a.y, angle: a.angle });
    });
  }

  // ?labels=1 : étiquettes F1 à F8 en HTML, projetées à l'écran à chaque image (même mécanisme que les flèches). Décoratives, jamais mémorisées.
  const labelsRoot = params.labels ? document.getElementById('labels') : null;
  const labelEls = new Map();
  const labelState = []; // { id, x, y, visible } en pixels CSS (tests)
  if (labelsRoot) {
    labelsRoot.hidden = false;
    for (const g of geoms) {
      const el = document.createElement('span');
      el.className = 'map-label';
      el.textContent = ctx.dict[WINDOW_INITIALS[g.id]] ?? g.id;
      el.hidden = true;
      labelsRoot.appendChild(el);
      labelEls.set(g.id, el);
    }
  }
  function updateLabels() {
    if (!labelsRoot) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    labelState.length = 0;
    for (const g of geoms) {
      // Lot 3e : seules les étiquettes des fenêtres de l'étage affiché (F1 à F8 en bas, U1 à U7 en haut).
      if (g.floor !== pf()) {
        const hiddenEl = labelEls.get(g.id);
        if (!hiddenEl.hidden) hiddenEl.hidden = true;
        continue;
      }
      const away = debrisGeoms.get(g.id).inner + plankCfg.wallGap + plankCfg.thickness / 2;
      const at = screenAt(g.center.x - g.normal.x * away, (plankCfg.sill + plankCfg.lintel) / 2, g.center.y - g.normal.y * away);
      const visible = !at.behind && at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
      const el = labelEls.get(g.id);
      if (el.hidden === visible) el.hidden = !visible;
      if (visible) {
        el.style.setProperty('--label-x', `${(at.x * w).toFixed(1)}px`);
        el.style.setProperty('--label-y', `${(at.y * h).toFixed(1)}px`);
      }
      labelState.push({ id: g.id, x: at.x * w, y: at.y * h, visible });
    }
  }

  // Tests : mesures du HUD lues dans le DOM (hauteur, largeur, puces, flèches, indicateur de réparation).
  function hudState() {
    const rect = (id) => document.getElementById(id)?.getBoundingClientRect();
    const hud = rect('hud');
    const chips = windowChips(hudWindows(), { labels: hudLabels });
    return {
      height: hud.height,
      width: hud.width,
      chips: chips.chips.map((c) => ({ ...c })),
      more: chips.more,
      arrows: edgeState.map((a) => ({ ...a })),
    };
  }

  // Place les personnages, le laser et les effets d'après l'état simulé, puis la lumière.
  function draw(dt) {
    world.setElevation(sim.elev, pf());
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
        world.dynamic.add(z.char.root);
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
      // Lot 3e : un zombie de l'étage du joueur est dessiné ; depuis l'étage on voit aussi ceux du rez-de-chaussée, plus bas de floorLift, par le trou des escaliers et
      // dans la partie découverte (le sol de l'étage les cache ailleurs) ; depuis le rez-de-chaussée ceux de l'étage ne sont pas dessinés (ni ombrés). Leur logique continue.
      const zf = floorOf(e);
      let at = { x: e.x, y: e.y, h: zf === pf() ? 0 : liftOf(zf) - liftOf(pf()) };
      let face = null;
      const visible = drawnOf(e);
      if (e.mode === 'escalier') {
        // Dans un escalier : il marche librement comme le joueur ; sa hauteur suit sa position sur la rampe (t × floorLift), face à son sens de marche.
        // Les rampants sont relevés (ils se cachaient derrière les marches) ; les autres un peu aussi.
        at = { x: e.x, y: e.y, h: LIFT * num(e.stairT) - liftOf(pf()) + (e.gait === 'rampe' ? STAIR_CRAWL_LIFT : 3) };
        face = { x: num(e.fx), y: num(e.fy) };
      }
      z.char.root.position.set(at.x, at.h, at.y);
      if (z.char.root.visible !== visible) z.char.root.visible = visible;
      z.char.root.rotation.y = face && (face.x !== 0 || face.y !== 0) ? Math.PI / 2 - Math.atan2(face.y, face.x) : sieging ? Math.PI / 2 - Math.atan2(-gw.normal.y, -gw.normal.x) : Math.PI / 2 - Math.atan2(p.y - e.y, p.x - e.x);
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
      world.dynamic.remove(z.char.root);
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
    hud.update(sim.player, sim.kills, waveInfo(sim.waves), { chutes: sim.down.chutes, floor: multi ? pf() : null });
    floorFade.set(sim.trView.veil);
    updateDownView();
    world.windowMeshes?.sync(sim.win); // pastille de la planche en cours de réparation : elle se remplit peu à peu
    updateEdgeArrows();
    updateLabels();
    updateNextZone();
    world.debris?.sync(sim.debris.items, reduced);
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
  // Point de la scène (x, hauteur, y du jeu) à l'écran, de 0 à 1 (tests : fenêtres, meubles, luminance autour d'un point).
  function screenAt(x, height, y) {
    probe.set(x, height, y).applyMatrix4(rig.camera.matrixWorldInverse);
    const behind = probe.z > 0; // la caméra regarde vers -z : un point de z positif est derrière elle
    probe.applyMatrix4(rig.camera.projectionMatrix);
    return { x: (probe.x + 1) / 2, y: (1 - probe.y) / 2, behind };
  }

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
    if (!paused && !sim.dead && !sim.worldOver) step(dt);
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

  // Zones et portes pour les tests (getState().zones). L'ancienne salle n'a qu'une zone, aucune porte, aucune fin de monde.
  function zonesState() {
    const open = openIds();
    const points = layout.spawnPoints ?? [];
    const pointsOf = (zoneId) => allSpawnPoints().filter((p) => zoneOf[p.window ?? p.fenetre] === zoneId).map((p) => p.id);
    if (!zoneCfg) {
      return { list: [{ id: 'depart', open: true, windows: geoms.map((g) => g.id), spawnPoints: points.map((p) => p.id) }], doors: [], next: null, activeSpawnPoints: points.map((p) => p.id), activeWindows: geoms.map((g) => g.id) };
    }
    const active = activeZones(zoneCfg, open);
    return {
      list: zoneCfg.zones.map((z) => ({ id: z.id, floor: floorOf(z), open: active.includes(z.id), windows: geoms.filter((g) => zoneOf[g.id] === z.id).map((g) => g.id), spawnPoints: pointsOf(z.id) })),
      doors: zoneCfg.doors.map((d) => ({ id: d.id, floor: floorOf(d), open: sim.doors[d.id]?.open === true, planned: d.planned === true, openAfterWave: d.openAfterWave, sinkProgress: sim.doors[d.id]?.sink ?? 0 })),
      next: nextDoor(zoneCfg, 1, open),
      activeSpawnPoints: activePointsNow().map((p) => p.id),
      activeWindows: activeIdsNow(),
    };
  }

  // Étage pour les tests (getState().floor) : étage courant, fondu, escaliers, nombre de zombies par étage, zombies cachés.
  function floorState() {
    const counts = { rdc: 0, etage: 0 };
    for (const e of sim.enemies) counts[floorOf(e)] += 1;
    return {
      current: pf(),
      multi,
      fade: { state: sim.trView.phase, t: sim.tr.t, veil: sim.trView.veil, locked: sim.trView.locked },
      stairs: stairState(stairsWorld, openIds()).map((q) => ({ id: q.id, usable: q.usable, planned: q.planned, cooldown: sim.stairWatch.cooldown })),
      byFloor: counts,
      hidden: sim.enemies.filter((e) => floorOf(e) !== pf()).length,
      grace: sim.floorGrace,
      elevation: sim.elev,
      walk: sim.sw === null ? null : { stair: sim.sw.stair, armed: sim.sw.armed, floor: sim.sw.floor, from: sim.sw.from, auto: sim.sw.auto },
    };
  }

  // État des vagues pour les tests (getState().waves).
  function wavesState() {
    const i = waveInfo(sim.waves);
    const { spec } = sim.waves;
    return {
      active: i.active, phase: i.phase, wave: i.wave, level: i.level, total: i.total, alive: i.alive, toSpawn: i.toSpawn, remaining: i.remaining,
      maxConcurrent: i.maxConcurrent, waitLeft: i.waitLeft, hpMul: spec.hpMul, speedMul: spec.speedMul, damageMul: spec.damageMul, reinforced: i.reinforced,
      doorPending: i.doorPending ? { ...i.doorPending } : null, worldEnd: i.worldEnd,
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
      for (let i = 0; i < n && !sim.dead && !sim.worldOver; i += 1) {
        step(STEP);
        followCamera(STEP);
      }
      draw(STEP);
      stale = true;
    },
    // Test : place le joueur d'un coup (caméra comprise).
    placePlayer(x, y) {
      sim.player = { ...sim.player, x: Number(x), y: Number(y), floor: pf() };
      rig.snap(sim.player.x, sim.player.y);
      stale = true;
    },
    // Test : événements sonores injectés dans la direction sonore (journal compris), à la position du joueur courant.
    emitAudio(events) {
      ctx.audio?.handle({ time: sim.time, listener: sim.player, floor: pf(), walls: wallsOf(pf()), paused: ctx.ui.isPaused(), events: Array.isArray(events) ? events : [] });
    },
    // Test : une balle de plus, tirée de la bouche de l'arme dans la direction `angle`.
    fireBullet(angle) {
      // La bouche n'est pas retenue dans la salle : le test place parfois le joueur dehors (balle sur une voiture, par exemple).
      const muzzle = muzzlePoint(sim.player, Number(angle), eff.weapon.muzzleOffset, shotBounds);
      sim.bullets = [...sim.bullets, { ...createBullet(muzzle, Number(angle), eff.weapon, sim.nextId), floor: pf() }];
      sim.nextId += 1;
      ctx.audio?.handle({ time: sim.time, listener: sim.player, floor: pf(), walls: wallsOf(pf()), paused: ctx.ui.isPaused(), events: [{ type: 'shot', x: muzzle.x, y: muzzle.y }] });
    },
    // Test : montre tout le monde (vrai) ou revient au suivi du joueur (faux) ; l'image est mise à jour au prochain rendu.
    overview(on = true) {
      rig.setOverview(on);
      world.setFog(rig.view.distance);
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
      // Les portes se ferment ou s'ouvrent comme au chargement de ?wave=n (openAfterWave < n : ouvertes), d'un coup.
      const openNow = zoneCfg ? doorsOpenAtStart(zoneCfg, n) : [];
      for (const d of doorCfgs) setDoorInstant(d.id, openNow.includes(d.id));
      // Un joueur à l'étage dont l'escalier se referme revient au rez-de-chaussée.
      sim.tr = cancelTransition();
      sim.trView = { veil: 0, locked: false, swap: false, phase: 'idle' };
      if (sim.sw !== null || (pf() !== 'rdc' && !stairState(stairsWorld, openNow).some((q) => q.usable))) {
        const to = sim.sw !== null && stairState(stairsWorld, openNow).some((q) => q.usable) ? pf() : 'rdc';
        sim.sw = null;
        sim.fs = setPlayerFloor(fw, sim.fs, to);
        sim.player = { ...sim.player, ...floorStart(to), floor: to };
        showFloor(to);
        rig.snap(sim.player.x, sim.player.y);
      }
      floorFade.set(0);
      sim.worldOver = false;
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
    // Test (lot 3c) : termine la manche courante : zombies vivants tués (sans compter de tués), apparitions restantes annulées ; la fin de manche suit au pas
    // suivant. Sans effet pendant la pause d'une porte ni hors d'une manche ; renvoie le nombre de zombies retirés.
    skipWave() {
      const next = finishWave(sim.waves);
      if (next === sim.waves) return 0;
      const n = sim.enemies.length;
      sim.enemies = [];
      sim.waves = next;
      return n;
    },
    // Test (lot 3c) : ouvre ou ferme une porte d'un coup, sans transition ni annonce ; renvoie faux si la porte n'existe pas.
    setDoor(id, open) {
      const ok = setDoorInstant(id, open === true);
      if (ok) sim.waves = markDoor(sim.waves, id, open === true);
      stale = true;
      return ok;
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
      if (n < w.planks) dropDebris(id, w.planks - n);
      else if (n > w.planks) sim.debris = removeDebris(sim.debris, id, n - w.planks);
      sim.fs = syncWindowGrid(fw, { ...sim.fs, win: sim.win }, geomById.get(id).floor);
      world.windowMeshes?.sync(sim.win);
      stale = true;
      return true;
    },
    // Test (lot 3e) : change l'étage du joueur d'un coup, sans fondu, si un escalier est utilisable (arrivée de cet escalier) ; renvoie faux sinon.
    setFloor(n) {
      const target = n === 1 || n === 'etage' ? 'etage' : n === 0 || n === 'rdc' ? 'rdc' : null;
      if (!multi || target === null || target === pf()) return target === pf();
      const open = stairState(stairsWorld, openIds()).filter((q) => q.usable);
      if (open.length === 0) return false;
      sim.tr = cancelTransition();
      sim.trView = { veil: 0, locked: false, swap: false, phase: 'idle' };
      sim.sw = null;
      floorFade.set(0);
      const ok = arriveAt(open[0].id, target, { instant: true });
      sim.floorGrace = 0;
      stale = true;
      return ok;
    },
    // Test (lot 3e) : déclenche le fondu comme si le joueur avait marché dans la zone de déclenchement de l'escalier (de son étage) ; faux si l'escalier est fermé.
    useStair(id) {
      stale = true;
      return multi ? (reduced ? beginFloorChange(id) : startPhysical(id, true)) : false;
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
      return addEnemy(g.center.x + g.normal.x * 400, g.center.y + g.normal.y * 400, { type: typed ? type : 'marcheur', gait: 'marche', spec: waveSpec(1, sim.waveParams), window: id, mode: 'approche', floor: g.floor }).id;
    },
    // Remet une partie propre (Rejouer, Recommencer).
    restart() {
      ctx.seedRun += 1;
      reset(ctx.seed + ctx.seedRun);
    },
    snapshot() {
      const cam = rig.camera.position;
      const meshStats = world.windowMeshes?.stats(rig.camera) ?? [];
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
          floor: floorOf(e), visible: drawnOf(e), stair: e.stair ?? null, stairT: e.stairT ?? 0,
        })),
        bullets: sim.bullets.map((b) => ({ id: b.id, floor: floorOf(b), x: b.x, y: b.y, angle: b.angle, aimAngle: b.aimAngle, damage: b.damage, maxDistance: b.maxDistance })),
        kills: sim.kills,
        waves: wavesState(),
        camera: { x: cam.x, y: cam.y, z: cam.z, distance: rig.view.distance, tilt: rig.view.tilt, zoom: rig.view.zoom, target: { ...rig.view.target } },
        render: { ...lastInfo, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
        floor: floorState(),
        stairLog: stairLog.map((l) => ({ ...l })),
        floorsMs: ctx.perf?.floorsMs ?? null,
        scene: world.floorStats(),
        zones: zonesState(),
        events: eventLog.map((e) => ({ ...e })),
        doorMeshes: { ids: world.doors.ids(), ...world.doors.stats(), scaleY: Object.fromEntries(world.doors.ids().map((id) => [id, world.doors.scaleY(id)])) },
        worldOver: sim.worldOver === true,
        textures: { count: ctx.textureData.count, bytes: ctx.textureData.bytes, readyMs: Math.round(ctx.textureData.ms), ready: true },
        view: visibleRect(),
        playerScreen: projectPlayer(),
        laserEnd: laser ? { x: laser.ray.end.x, y: laser.ray.end.y } : null,
        laser: laser ? { length: laser.ray.length, hit: laser.ray.hit?.id ?? null, stoppedBy: laser.ray.stoppedBy?.id ?? null, range: laser.cone.length, cone: { leftAngle: sim.aim.angle - laser.cone.half, rightAngle: sim.aim.angle + laser.cone.half } } : null,
        world: { width: layout.size.width, height: layout.size.height, empty: layout.empty },
        map: { id: layout.id, size: { width: layout.size.width, height: layout.size.height }, windowIds: geoms.map((g) => g.id), pillars: layout.pillars.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h })), start: { ...layout.start } },
        labels: labelState.map((l) => ({ ...l })),
        obstacles: layout.furniture.map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h, hauteur: o.hauteur, screen: screenAt(o.x + o.w / 2, o.hauteur, o.y + o.h / 2) })),
        windows: !siegeOn ? layout.windows.map((w) => ({ id: w.id ?? null, x: w.x, y: w.y })) : geoms.map((g) => {
          const activeNow = activeIdsNow();
          const w = sim.win.windows[g.id];
          const r = sim.repair[g.id] ?? { repairing: false, blocked: false, progress: 0 };
          const o = occupancy(sim.enemies, g.id);
          const m = meshStats.find((e) => e.id === g.id);
          return { id: g.id, floor: g.floor, zone: zoneOf[g.id], active: activeNow.includes(g.id), planks: w.planks, maxPlanks: w.maxPlanks, tearers: o.tearers, climbers: o.climbers, queue: o.queue, repairing: r.repairing, repairProgress: w.repairProgress, repairBlocked: r.blocked, open: w.planks === 0, x: g.center.x, y: g.center.y, repairSpot: { x: g.repairSpot.x, y: g.repairSpot.y }, screen: screenAt(g.center.x - g.normal.x * (debrisGeoms.get(g.id).inner + plankCfg.wallGap + plankCfg.thickness / 2), (plankCfg.sill + plankCfg.lintel) / 2, g.center.y - g.normal.y * (debrisGeoms.get(g.id).inner + plankCfg.wallGap + plankCfg.thickness / 2)), mesh: m ? { triangles: m.triangles, inFrustum: m.inFrustum, minY: m.minY, minWallGap: m.minWallGap, beams: m.beams, voidVisible: m.voidVisible, pipsOn: m.pipsOn, pipY: m.pipY } : null };
        }),
        hud: hudState(),
        plankMesh: { nailed: world.windowMeshes?.nailed() ?? 0, debris: sim.debris.items.length },
        debrisMeshes: world.debris?.stats(rig.camera) ?? [],
        debris: sim.debris.items.map((d) => ({ x: d.x, y: d.y, z: d.z, yaw: d.yaw, age: d.age })),
        windowPositions: layouts.floors.flatMap((f) => layoutOf(f).windows).map((w) => ({ id: w.id ?? null, x: w.x, y: w.y })),
        spawnPoints: allSpawnPoints().map((p) => ({ id: p.id, fenetre: p.fenetre, x: p.x, y: p.y, floor: p.floor })),
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
