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

const [dict, room, player] = await Promise.all([
  loadJson('data/i18n/fr.json'),
  loadJson('data/game/room.json'),
  loadJson('data/game/player.json'),
]);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', translate(dict, el.dataset.i18nLabel));
document.title = translate(dict, 'game.title');

const palette = readPalette();
const root = document.getElementById('game-root');
root.hidden = false;
document.getElementById('rotate').hidden = false;

const ctx = { cfg: { room, player }, palette, dict, override: {} };
ctx.ui = createUi({ onRotateChange: () => ctx.input.releaseAll() });
ctx.input = createInput({ onCommand: (name) => name === 'fullscreen' && ctx.ui.toggleFullscreen() });
const scene = new GameScene(ctx);

const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
// Phaser 4 n'a pas de réglage de résolution : le canvas est dimensionné en pixels écran × ratio (plafonné à 2) par la scène.
new Phaser.Game({
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

if (testMode) installTestHook(() => scene);
