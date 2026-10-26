// Point d'entrée de jeu.html : charge les textes et les données, prépare le DOM, lance Phaser.
import { createInput } from './input.js';
import { readPalette } from './palette.js';
import { GameScene } from './scene.js';
import { installTestHook } from './testhook.js';
import { createUi } from './ui.js';
import { translate } from '../i18n.js';

const MAX_RATIO = 2;

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
}

const params = new URLSearchParams(location.search);
const testMode = params.get('test') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);

const [dict, room, player, weapons, enemies] = await Promise.all([
  loadJson('data/i18n/fr.json'),
  loadJson('data/game/room.json'),
  loadJson('data/game/player.json'),
  loadJson('data/game/weapons.json'),
  loadJson('data/game/enemies.json'),
]);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', translate(dict, el.dataset.i18nLabel));
document.title = translate(dict, 'game.title');

// Les textes du HUD sont dessinés avec Barlow : on attend qu'elle soit prête.
await Promise.all([document.fonts.load('700 16px Barlow'), document.fonts.load('400 16px Barlow')]).catch(() => {});

const palette = readPalette();
const root = document.getElementById('game-root');
root.hidden = false;
document.getElementById('rotate').hidden = false; // affiché ou non par la feuille de style selon l'orientation

const ctx = {
  cfg: { room, player, weapon: weapons.pistol, zombie: enemies.zombie },
  palette,
  dict,
  params: { nospawn: params.get('nospawn') === '1' },
  seed: Number.isFinite(seedParam) ? seedParam : Date.now() % 2147483647,
  seedRun: 0,
  override: {},
  audio: null,
};

let scene;
ctx.ui = createUi(dict, {
  onRestart: () => scene.restart(),
  onToggleSound: () => {},
  onRotateChange: () => ctx.input.releaseAll(),
});
ctx.input = createInput(root, {
  isBlocked: () => ctx.ui.isPaused(),
  onCommand: (name) => {
    if (name === 'pause') ctx.ui.togglePause();
    else if (name === 'fullscreen') ctx.ui.toggleFullscreen();
  },
});
scene = new GameScene(ctx);

const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
// Phaser 4 n'a pas de réglage de résolution : le canvas est dimensionné en pixels écran × ratio (plafonné à 2) par la scène.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-canvas',
  width: Math.round(window.innerWidth * ratio),
  height: Math.round(window.innerHeight * ratio),
  backgroundColor: palette.ground,
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  disableContextMenu: true,
  banner: false,
  scene,
});

if (testMode) installTestHook(ctx, () => scene, game);
