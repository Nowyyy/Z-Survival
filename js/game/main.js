// Point d'entrée de jeu.html : charge les textes et les données, prépare le DOM, lance la partie en 3D (Three.js).
import { parseTilt, parseZoom } from '../core/viewport.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { createInput } from './input.js';
import { readPalette } from './palette.js';
import { installSafeArea } from './safe-area.js';
import { installTestHook } from './testhook.js';
import { createUi } from './ui.js';
import { applyTexts, loadDict } from './texts.js';

const DEFAULT_RATIO_CAP = 2;

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
}

// ?dpr=1 : plafond du ratio de pixels (entre 0,5 et 2), pour le diagnostic ; toute autre valeur est ignorée.
function ratioCap(value) {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n >= 0.5 && n <= DEFAULT_RATIO_CAP ? n : DEFAULT_RATIO_CAP;
}

const query = new URLSearchParams(location.search);
const testMode = query.get('test') === '1';
const seedParam = Number.parseInt(query.get('seed') ?? '', 10);

const [dict, room, player, weapons, enemies, render] = await Promise.all([
  loadDict(),
  loadJson('data/game/room.json'),
  loadJson('data/game/player.json'),
  loadJson('data/game/weapons.json'),
  loadJson('data/game/enemies.json'),
  loadJson('data/game/render.json'),
]);

applyTexts(dict);
installSafeArea();

const palette = readPalette();
const root = document.getElementById('game-root');
root.hidden = false;
document.getElementById('boot')?.remove();

const ctx = {
  cfg: { room, player, weapon: weapons.pistol, zombie: enemies.zombie, render },
  palette,
  dict,
  params: {
    nospawn: query.get('nospawn') === '1',
    tilt: parseTilt(query.get('tilt'), render.camera.tilt),
    zoom: parseZoom(query.get('zoom')),
    maxRatio: ratioCap(query.get('dpr')),
    shadows: query.get('shadows') !== '0',
  },
  seed: Number.isFinite(seedParam) ? seedParam : Date.now() % 2147483647,
  seedRun: 0,
  override: {},
  audio: createAudio(),
};

let game = null;
ctx.ui = createUi(dict, {
  onRestart: () => game?.restart(),
  onToggleSound: () => {
    ctx.audio.toggleMute();
    ctx.ui.syncSound(ctx.audio);
  },
  onRotateChange: () => ctx.input.releaseAll(),
});
ctx.input = createInput(root, {
  isBlocked: () => ctx.ui.isPaused(),
  onCommand: (name) => {
    if (name === 'pause') ctx.ui.togglePause();
    else if (name === 'fullscreen') ctx.ui.toggleFullscreen();
    else if (name === 'mute') {
      ctx.audio.toggleMute();
      ctx.ui.syncSound(ctx.audio);
    }
  },
});
ctx.ui.syncSound(ctx.audio);
// Le son ne démarre qu'après le premier geste du joueur.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => ctx.audio.unlock(), { capture: true });

game = createGame(ctx);
if (game === null) {
  // WebGL indisponible : un message à la place du jeu.
  root.hidden = true;
  const error = document.getElementById('game-error');
  error.textContent = dict['game.error.webgl'];
  error.hidden = false;
} else {
  if (query.get('fps') === '1') import('../fps.js');
  if (testMode) installTestHook(ctx, game);
}
