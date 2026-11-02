// Scène de jeu : affichage Phaser de l'état simulé par js/core/. Les règles (tirs, dégâts, mouvements) sont dans js/core/.
import { aimFromPoint, aimFromStick, createAim } from '../core/aim.js';
import { applyImpacts, createWeaponState, displayHealth, muzzlePoint, stepContact, stepWeapon } from '../core/combat.js';
import { stepEnemies } from '../core/enemy-ai.js';
import { innerBounds, moveCircle } from '../core/movement.js';
import { createBullet, stepBullets } from '../core/projectile.js';
import { castRay } from '../core/ray.js';
import { createRng } from '../core/rng.js';
import { createSpawner, stepSpawner } from '../core/spawner.js';
import { clampDt, fromAngle } from '../core/vec.js';
import { computeViewport } from '../core/viewport.js';
import { TS, makeTextures } from './textures.js';

const MAX_RATIO = 2;
const SPARK_TIME = 0.18;
const RECOIL_TIME = 0.12;
const HIT_FLASH_TIME = 0.1;

export const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));

export class GameScene extends Phaser.Scene {
  // ctx : { cfg, palette, dict, input, ui, audio, params, override }
  constructor(ctx) {
    super('game');
    this.ctx = ctx;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  create() {
    const { cfg, palette } = this.ctx;
    this.room = cfg.room;
    this.bounds = innerBounds(cfg.room);
    makeTextures(this, palette, cfg);
    this.cameras.main.setBackgroundColor(palette.ground);
    this.uiCam = this.cameras.add(0, 0, 1, 1);
    this.uiCam.transparent = true;
    this.uiObjects = [];
    this.worldObjects = [];
    this.enemySprites = new Map();

    const margin = cfg.room.margin;
    this.addWorld(this.add.image(-margin, -margin, 'decor').setOrigin(0, 0).setScale(2).setDepth(0));
    this.addWorld(this.add.image(0, 0, 'room').setOrigin(0, 0).setScale(1 / TS).setDepth(1));
    this.laserGfx = this.addWorld(this.add.graphics().setDepth(2));
    this.player = this.addWorld(this.add.image(0, 0, 'player').setScale(1 / TS).setDepth(4));
    this.gun = this.addWorld(this.add.image(0, 0, 'gun').setOrigin(0, 0.5).setScale(1 / TS).setDepth(5));
    this.fx = this.addWorld(this.add.graphics().setDepth(6));

    const { text, textShadow } = palette;
    const style = { fontFamily: 'Barlow, system-ui, sans-serif', fontStyle: 'bold', color: text, stroke: textShadow };
    this.hudBar = this.addUi(this.add.graphics());
    this.lifeText = this.addUi(this.add.text(0, 0, '', style));
    this.killsText = this.addUi(this.add.text(0, 0, '', style).setOrigin(1, 0));
    this.hudStyle = style;

    this.reset(this.ctx.seed);
    this.applySize();
    this.onResize = () => this.applySize();
    window.addEventListener('resize', this.onResize);
    this.events.once('shutdown', () => window.removeEventListener('resize', this.onResize));
  }

  addWorld(obj) {
    this.uiCam.ignore(obj);
    this.worldObjects.push(obj);
    return obj;
  }

  addUi(obj) {
    this.cameras.main.ignore(obj);
    this.uiObjects.push(obj);
    return obj;
  }

  // Partie neuve : état pur remis à zéro, zombies retirés.
  reset(seed) {
    const { cfg } = this.ctx;
    for (const sprite of this.enemySprites.values()) sprite.destroy();
    this.enemySprites.clear();
    this.sim = {
      player: { x: cfg.room.width / 2, y: cfg.room.height / 2, r: cfg.player.radius, health: cfg.player.health, maxHealth: cfg.player.health },
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
    this.sparks = [];
    this.laser = null;
    this.hudDirty = true;
    this.ctx.ui.setLive('');
  }

  // Taille du canvas = fenêtre × ratio d'écran (plafonné à 2) ; la caméra applique le zoom de js/core/viewport.js.
  applySize() {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const w = Math.round(cssW * ratio);
    const h = Math.round(cssH * ratio);
    this.scale.resize(w, h);
    const vp = computeViewport({ width: cssW, height: cssH }, this.room);
    const cam = this.cameras.main;
    cam.setSize(w, h);
    cam.setZoom(vp.zoom * ratio);
    cam.centerOn(vp.centerX, vp.centerY);
    this.uiCam.setSize(w, h);
    this.ratio = ratio;
    this.viewport = vp;
    this.hudDirty = true;
    this.ctx.input.refresh();
  }

  addEnemy(x, y) {
    const { zombie } = this.ctx.cfg;
    const enemy = { id: this.sim.nextId, x, y, r: zombie.radius, health: zombie.health, maxHealth: zombie.health, hitCooldown: 0, flash: 0 };
    this.sim.nextId += 1;
    this.sim.enemies = [...this.sim.enemies, enemy];
    return enemy;
  }

  aimAngle(prev) {
    const { input, override } = this.ctx;
    const from = this.sim.player;
    if (override.aim) {
      if (typeof override.aim.angle === 'number') return createAim(override.aim.angle);
      return aimFromPoint(prev, from, override.aim);
    }
    if (input.type() === 'touch') return aimFromStick(prev, input.aimStick());
    const pointer = input.pointer();
    if (!pointer) return prev;
    const world = this.cameras.main.getWorldPoint(pointer.x * this.ratio, pointer.y * this.ratio);
    return aimFromPoint(prev, from, world);
  }

  update(_time, delta) {
    const { ui } = this.ctx;
    if (!ui.isPaused() && !this.sim.dead) this.step(clampDt(delta / 1000));
    this.draw(ui.isPaused() ? 0 : clampDt(delta / 1000));
  }

  step(dt) {
    const { cfg, input, override, params, audio } = this.ctx;
    const sim = this.sim;
    const weapon = cfg.weapon;
    sim.time += dt;

    const dir = override.move ?? input.move();
    const pos = moveCircle(sim.player, dir, cfg.player.speed, dt, this.room);
    sim.player = { ...sim.player, ...pos };
    sim.aim = this.aimAngle(sim.aim);

    // Laser : sert à viser et à déclencher le tir, jamais aux dégâts.
    const muzzle = muzzlePoint(sim.player, sim.aim.angle, weapon.muzzleOffset, this.bounds);
    const ray = castRay(muzzle, sim.aim.angle, weapon.laserRange, sim.enemies, this.bounds);
    this.laser = { from: muzzle, ray };

    const trigger = stepWeapon(sim.weapon, dt, ray.hit !== null, weapon, sim.bullets.length);
    sim.weapon = trigger.state;
    if (trigger.fire) {
      sim.bullets = [...sim.bullets, createBullet(muzzle, sim.aim.angle, weapon, sim.nextId)];
      sim.nextId += 1;
      sim.flash = this.reduced ? weapon.muzzleFlash / 2 : weapon.muzzleFlash;
      sim.recoil = RECOIL_TIME;
      audio?.play('shoot');
    }

    // Balles : les dégâts n'existent qu'à l'impact.
    const flight = stepBullets(sim.bullets, sim.enemies, dt, this.bounds);
    sim.bullets = flight.bullets;
    const result = applyImpacts(sim.enemies, flight.impacts);
    sim.enemies = result.enemies;
    if (!this.reduced) for (const impact of flight.impacts) this.sparks.push({ x: impact.x, y: impact.y, age: 0 });
    for (const hit of result.hits) if (hit.health > 0) audio?.play('hit');
    for (const dead of result.killed) {
      sim.kills += 1;
      audio?.play('kill');
      const sprite = this.enemySprites.get(dead.id);
      if (sprite) {
        sprite.destroy();
        this.enemySprites.delete(dead.id);
      }
    }
    if (result.killed.length > 0) this.hudDirty = true;

    sim.enemies = stepEnemies(sim.enemies, sim.player, dt, cfg.zombie);

    if (!params.nospawn) {
      const spawn = stepSpawner(sim.spawner, dt, sim.enemies.length, cfg.zombie, this.room.windows, sim.rng);
      sim.spawner = spawn.state;
      sim.rng = spawn.rng;
      if (spawn.spawn) this.addEnemy(spawn.spawn.x, spawn.spawn.y);
    }

    const contact = stepContact(sim.player, sim.enemies, dt, cfg.zombie);
    sim.player = contact.player;
    sim.enemies = contact.enemies;
    if (contact.damage > 0) {
      audio?.play('hurt');
      this.hudDirty = true;
    }

    const bucket = Math.ceil((displayHealth(sim.player.health) / sim.player.maxHealth) * 10);
    if (bucket !== sim.lifeBucket && sim.player.health > 0) {
      sim.lifeBucket = bucket;
      this.ctx.ui.setLive(fmt(this.ctx.dict['game.live.life'], { hp: displayHealth(sim.player.health), max: sim.player.maxHealth }));
    }
    if (sim.player.health <= 0) {
      sim.dead = true;
      input.releaseAll();
      this.hudDirty = true;
      this.ctx.ui.setLive(fmt(this.ctx.dict['game.live.dead'], { n: sim.kills }));
      this.ctx.ui.showEnd(sim.kills);
    }
  }

  draw(dt) {
    const { palette, cfg, dict } = this.ctx;
    const sim = this.sim;
    const angle = sim.aim.angle;
    const dir = fromAngle(angle);

    sim.flash = Math.max(0, sim.flash - dt);
    sim.recoil = Math.max(0, sim.recoil - dt);
    for (const spark of this.sparks) spark.age += dt;
    this.sparks = this.sparks.filter((s) => s.age < SPARK_TIME);

    const kick = (sim.recoil / RECOIL_TIME) * 4;
    this.player.setPosition(sim.player.x, sim.player.y);
    this.gun.setPosition(sim.player.x + dir.x * (sim.player.r * 0.5 - kick), sim.player.y + dir.y * (sim.player.r * 0.5 - kick)).setRotation(angle);

    for (const enemy of sim.enemies) {
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        sprite = this.addWorld(this.add.image(enemy.x, enemy.y, 'zombie').setScale(1 / TS).setDepth(3));
        this.enemySprites.set(enemy.id, sprite);
      }
      sprite.setPosition(enemy.x, enemy.y).setRotation(Math.atan2(sim.player.y - enemy.y, sim.player.x - enemy.x));
      const flashing = enemy.flash > 0;
      sprite.setTexture(flashing ? 'zombie-hit' : 'zombie');
      if (flashing) enemy.flash = this.reduced ? 0 : Math.max(0, enemy.flash - dt / HIT_FLASH_TIME);
    }

    const laser = this.laserGfx.clear();
    if (this.laser && !sim.dead) {
      const { from, ray } = this.laser;
      // Épaisseur en pixels écran à peu près constante, quel que soit le zoom de la caméra.
      const px = 1 / this.viewport.zoom;
      laser.lineStyle(5 * px, palette.laser, 0.22).lineBetween(from.x, from.y, ray.end.x, ray.end.y);
      laser.lineStyle(2 * px, palette.laser, 0.9).lineBetween(from.x, from.y, ray.end.x, ray.end.y);
      laser.fillStyle(palette.laser, 1).fillCircle(ray.end.x, ray.end.y, ray.hit ? 4 : 2.5);
    }

    const fx = this.fx.clear();
    for (const bullet of sim.bullets) {
      const pts = [{ x: bullet.x, y: bullet.y }, ...bullet.trail];
      for (let i = 0; i < pts.length - 1; i += 1) {
        fx.lineStyle(Math.max(1, 4 - i), palette.bullet, 0.65 - i * 0.2).lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
      const len = cfg.weapon.bulletRadius * 4;
      fx.lineStyle(cfg.weapon.bulletRadius * 1.4, palette.bullet, 1).lineBetween(bullet.x - bullet.dirX * len, bullet.y - bullet.dirY * len, bullet.x, bullet.y);
    }
    for (const spark of this.sparks) {
      const k = spark.age / SPARK_TIME;
      fx.lineStyle(2, palette.hit, 1 - k);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        fx.lineBetween(spark.x + Math.cos(a) * (3 + 8 * k), spark.y + Math.sin(a) * (3 + 8 * k), spark.x + Math.cos(a) * (6 + 14 * k), spark.y + Math.sin(a) * (6 + 14 * k));
      }
    }
    if (sim.flash > 0 && this.laser) {
      const { from } = this.laser;
      fx.fillStyle(palette.muzzle, 0.9).fillCircle(from.x, from.y, this.reduced ? 5 : 9);
      fx.fillStyle(palette.hit, 0.9).fillCircle(from.x, from.y, this.reduced ? 2 : 4);
    }

    if (this.hudDirty) this.drawHud(dict);
  }

  drawHud(dict) {
    const { palette } = this.ctx;
    const sim = this.sim;
    const k = this.ratio;
    const hp = displayHealth(sim.player.health);
    const barW = 200 * k;
    const barH = 14 * k;
    const x = 12 * k;
    const size = `${Math.round(18 * k)}px`;
    this.lifeText.setFontSize(size).setStroke(palette.textShadow, 3 * k).setPosition(x, 8 * k).setText(fmt(dict['game.hud.life'], { hp, max: sim.player.maxHealth }));
    this.killsText.setFontSize(size).setStroke(palette.textShadow, 3 * k).setPosition(this.scale.width - 12 * k, 62 * k).setText(fmt(dict['game.hud.kills'], { n: sim.kills }));
    const y = 8 * k + 26 * k;
    this.hudBar.clear();
    this.hudBar.fillStyle(palette.dark, 0.8).fillRect(x - 2 * k, y - 2 * k, barW + 4 * k, barH + 4 * k);
    this.hudBar.fillStyle(palette.surface, 1).fillRect(x, y, barW, barH);
    this.hudBar.fillStyle(palette.action, 1).fillRect(x, y, barW * (hp / sim.player.maxHealth), barH);
    this.hudDirty = false;
  }

  // Remet une partie propre (Rejouer, Recommencer).
  restart() {
    this.ctx.seedRun += 1;
    this.reset(this.ctx.seed + this.ctx.seedRun);
  }

  snapshot() {
    if (!this.viewport || !this.sim) return null;
    const sim = this.sim;
    return {
      player: { x: sim.player.x, y: sim.player.y, health: sim.player.health },
      aim: sim.aim.angle,
      enemies: sim.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, health: e.health })),
      bullets: sim.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, angle: b.angle })),
      kills: sim.kills,
      zoom: this.viewport.zoom,
      paused: this.ctx.ui.isPaused(),
      dead: sim.dead,
      time: sim.time,
      audio: { started: this.ctx.audio.started, muted: this.ctx.audio.muted },
    };
  }
}
