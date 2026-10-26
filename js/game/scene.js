// Scène de jeu : affichage Phaser de l'état simulé par js/core/. Les règles (mouvement) sont dans js/core/.
import { innerBounds, moveCircle } from '../core/movement.js';
import { clampDt } from '../core/vec.js';
import { computeViewport } from '../core/viewport.js';
import { TS, makeTextures } from './textures.js';

const MAX_RATIO = 2;

export class GameScene extends Phaser.Scene {
  // ctx : { cfg: { room, player }, palette, input, ui }
  constructor(ctx) {
    super('game');
    this.ctx = ctx;
  }

  create() {
    const { cfg, palette } = this.ctx;
    this.room = cfg.room;
    this.bounds = innerBounds(cfg.room);
    makeTextures(this, palette, cfg);
    this.cameras.main.setBackgroundColor(palette.ground);
    this.add.image(-cfg.room.margin, -cfg.room.margin, 'decor').setOrigin(0, 0).setScale(2).setDepth(0);
    this.add.image(0, 0, 'room').setOrigin(0, 0).setScale(1 / TS).setDepth(1);
    this.playerSprite = this.add.image(0, 0, 'player').setScale(1 / TS).setDepth(4);
    this.gunSprite = this.add.image(0, 0, 'gun').setOrigin(0, 0.5).setScale(1 / TS).setDepth(5);
    this.player = { x: cfg.room.width / 2, y: cfg.room.height / 2, r: cfg.player.radius };
    this.time0 = 0;
    this.applySize();
    this.onResize = () => this.applySize();
    window.addEventListener('resize', this.onResize);
    this.events.once('shutdown', () => window.removeEventListener('resize', this.onResize));
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
    this.viewport = vp;
  }

  update(_time, delta) {
    const { cfg, input, ui } = this.ctx;
    const dt = clampDt(delta / 1000);
    if (!ui.isPaused()) {
      this.time0 += dt;
      const pos = moveCircle(this.player, input.move(), cfg.player.speed, dt, this.room);
      this.player = { ...this.player, ...pos };
    }
    this.playerSprite.setPosition(this.player.x, this.player.y);
    this.gunSprite.setPosition(this.player.x + this.player.r * 0.5, this.player.y);
  }

  snapshot() {
    if (!this.viewport) return null;
    return {
      player: { x: this.player.x, y: this.player.y },
      zoom: this.viewport.zoom,
      paused: this.ctx.ui.isPaused(),
      time: this.time0,
    };
  }
}
