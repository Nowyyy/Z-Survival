// Simulation pure d'une partie : appelle les modules de js/core/ dans le même ordre que le jeu (js/game/game.js, step()).
// root : dossier qui contient js/core/ (le dépôt de travail, ou une copie de main pour établir les valeurs de référence).
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

// legacy : portées du lot 1 (700 pour le laser, le tir et la balle). weaponPatch : valeurs de weapons.json remplacées (ex. fireRange: 1600).
export async function simulate(root, { seconds = 30, seed = 42, fps = 60, legacy = false, weaponPatch = {} } = {}) {
  const load = (name) => import(pathToFileURL(`${root}/js/core/${name}.js`).href);
  const [aimM, combat, ai, movement, projectile, ray, rngM, spawnerM, vec] = await Promise.all(
    ['aim', 'combat', 'enemy-ai', 'movement', 'projectile', 'ray', 'rng', 'spawner', 'vec'].map(load));
  const data = (name) => JSON.parse(readFileSync(`${root}/data/game/${name}.json`, 'utf8'));
  // Lot 1b : la salle du lot 1m est la section « legacy » de world.json (une copie de main garde son room.json).
  const room = existsSync(`${root}/data/game/room.json`) ? data('room') : data('world').legacy;
  const playerCfg = data('player');
  const stored = { ...data('weapons').pistol, ...weaponPatch };
  // Lot 2b : la distance maximale de la balle vient de l'arme effective (niveau 0 : portée de tir + marge) ; une copie de main a encore la clé.
  const base = stored.bulletMaxDistance !== undefined ? stored : (await import(pathToFileURL(`${root}/js/core/player-stats.js`).href)).effectiveWeapon(stored, {}, data('player-stats'));
  // Lot 1 : laser, tir et balle portaient tous à 700.
  const weapon = legacy ? { ...base, laserRange: 700, fireRange: 700, bulletMaxDistance: 700 } : base;
  // Règles du lot 1 : 5 zombies au plus, un toutes les 3 s (le jeu du lot 1b en autorise 8, toutes les 2,5 s).
  const zombie = { ...data('enemies').zombie, maxPresent: 5, spawnInterval: 3 };
  const bounds = movement.innerBounds(room);

  let sim = {
    player: { x: room.width / 2, y: room.height / 2, r: playerCfg.radius, health: playerCfg.health, maxHealth: playerCfg.health },
    aim: aimM.createAim(0), enemies: [], bullets: [], weapon: combat.createWeaponState(), spawner: spawnerM.createSpawner(),
    rng: rngM.createRng(seed), kills: 0, time: 0, nextId: 1, dead: false, shots: 0, impacts: 0,
  };
  const dt = vec.clampDt(1 / fps);
  const steps = Math.round(seconds * fps);
  for (let i = 0; i < steps && !sim.dead; i += 1) {
    sim.time += dt;
    const move = { x: Math.cos(sim.time * 0.5), y: Math.sin(sim.time * 0.8) };
    sim.player = { ...sim.player, ...movement.moveCircle(sim.player, move, playerCfg.speed, dt, room) };
    const near = sim.enemies.reduce((best, e) => {
      const d = Math.hypot(e.x - sim.player.x, e.y - sim.player.y);
      return !best || d < best.d ? { d, e } : best;
    }, null);
    sim.aim = near ? aimM.aimFromPoint(sim.aim, sim.player, near.e) : aimM.createAim(sim.time * 1.5);

    const muzzle = combat.muzzlePoint(sim.player, sim.aim.angle, weapon.muzzleOffset, bounds);
    const hit = ray.castRay(muzzle, sim.aim.angle, weapon.laserRange, sim.enemies, bounds);
    // Depuis le lot 1m : le tir part aussi quand l'ennemi visé est au-delà de la portée du laser (jusqu'à fireRange).
    const aimed = hit.hit !== null || ray.castRay(muzzle, sim.aim.angle, weapon.fireRange ?? weapon.laserRange, sim.enemies, bounds).hit !== null;
    const trigger = combat.stepWeapon(sim.weapon, dt, aimed, weapon, sim.bullets.length);
    sim.weapon = trigger.state;
    if (trigger.fire) {
      sim.bullets = [...sim.bullets, projectile.createBullet(muzzle, sim.aim.angle, weapon, sim.nextId)];
      sim.nextId += 1;
      sim.shots += 1;
    }
    const flight = projectile.stepBullets(sim.bullets, sim.enemies, dt, bounds);
    sim.bullets = flight.bullets;
    sim.impacts += flight.impacts.length;
    const result = combat.applyImpacts(sim.enemies, flight.impacts);
    sim.enemies = result.enemies;
    sim.kills += result.killed.length;
    sim.enemies = ai.stepEnemies(sim.enemies, sim.player, dt, zombie);
    const spawn = spawnerM.stepSpawner(sim.spawner, dt, sim.enemies.length, zombie, room.windows, sim.rng);
    sim.spawner = spawn.state;
    sim.rng = spawn.rng;
    if (spawn.spawn) {
      sim.enemies = [...sim.enemies, { id: sim.nextId, x: spawn.spawn.x, y: spawn.spawn.y, r: zombie.radius, health: zombie.health, maxHealth: zombie.health, hitCooldown: 0, flash: 0 }];
      sim.nextId += 1;
    }
    const contact = combat.stepContact(sim.player, sim.enemies, dt, zombie);
    sim.player = contact.player;
    sim.enemies = contact.enemies;
    if (sim.player.health <= 0) sim.dead = true;
  }
  return { shots: sim.shots, impacts: sim.impacts, kills: sim.kills, health: combat.displayHealth(sim.player.health), dead: sim.dead, enemies: sim.enemies.length, time: Math.round(sim.time * 1000) / 1000 };
}
