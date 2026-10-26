// Simulation pure d'une partie : appelle les modules de js/core/ dans le même ordre que le jeu (js/game/game.js, step()).
// root : dossier qui contient js/core/ (le dépôt de travail, ou une copie de main pour établir les valeurs de référence).
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

export async function simulate(root, { seconds = 30, seed = 42, fps = 60 } = {}) {
  const load = (name) => import(pathToFileURL(`${root}/js/core/${name}.js`).href);
  const [aimM, combat, ai, movement, projectile, ray, rngM, spawnerM, vec] = await Promise.all(
    ['aim', 'combat', 'enemy-ai', 'movement', 'projectile', 'ray', 'rng', 'spawner', 'vec'].map(load));
  const data = (name) => JSON.parse(readFileSync(`${root}/data/game/${name}.json`, 'utf8'));
  const room = data('room');
  const playerCfg = data('player');
  const weapon = data('weapons').pistol;
  const zombie = data('enemies').zombie;
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
    const trigger = combat.stepWeapon(sim.weapon, dt, hit.hit !== null, weapon, sim.bullets.length);
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
