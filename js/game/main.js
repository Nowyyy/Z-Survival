// Point d'entrée de jeu.html : charge les textes et les données, prépare le DOM, lance la partie en 3D (Three.js).
import { buildLayout } from '../core/layout.js';
import { parseTilt, parseZoom } from '../core/viewport.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { createLoading } from './loading.js';
import { createInput } from './input.js';
import { createTokenLookup, readPalette } from './palette.js';
import { installSafeArea } from './safe-area.js';
import { planSounds, renderSounds, nextVisibleFrame, BACKGROUND_SLICE_MS } from './sound-loader.js';
import { generateTextureData } from './textures.js';
import { installTestHook } from './testhook.js';
import { createUi } from './ui.js';
import { applyTexts, fmt, loadDict, TEXTURE_TEXTS } from './texts.js';

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
const fpsMode = query.get('fps') === '1';
const seedParam = Number.parseInt(query.get('seed') ?? '', 10);

const [dict, world, decor, camera, nav, player, weapons, enemies, render, texturesCfg, variants, soundsCfg, audioCfg, materialsCfg, voiceCfg] = await Promise.all([
  loadDict(),
  loadJson('data/game/world.json'),
  loadJson('data/game/decor.json'),
  loadJson('data/game/camera.json'),
  loadJson('data/game/nav.json'),
  loadJson('data/game/player.json'),
  loadJson('data/game/weapons.json'),
  loadJson('data/game/enemies.json'),
  loadJson('data/game/render.json'),
  loadJson('data/game/textures.json'),
  loadJson('data/game/zombie-variants.json'),
  loadJson('data/game/sounds.json'),
  loadJson('data/game/audio.json'),
  loadJson('data/game/sound-materials.json'),
  loadJson('data/game/zombie-voice.json'),
]);

applyTexts(dict);
installSafeArea();

const palette = readPalette();
const root = document.getElementById('game-root');
document.getElementById('boot')?.remove();

// Textures puis sons « essentiel » : calculés par tranches de 8 ms derrière l'écran de préparation (80 % / 20 % du pourcentage) ;
// la partie ne démarre qu'ensuite.
const TEXTURE_SHARE = 0.8;
const loading = createLoading(dict);
const textureData = await generateTextureData(texturesCfg.textures, { lookup: createTokenLookup(), onProgress: (p) => loading.update(p * TEXTURE_SHARE) });
const audio = createAudio({ config: { audio: audioCfg, materials: materialsCfg, voice: voiceCfg, sounds: soundsCfg.sounds }, test: testMode, seed: Number.isFinite(seedParam) ? seedParam : 1 });
const essential = await renderSounds(planSounds(soundsCfg.sounds, 'essentiel'), { onProgress: (p) => loading.update(TEXTURE_SHARE + (1 - TEXTURE_SHARE) * p) });
audio.addSounds(essential.items);
audio.stats.essentialMs = essential.ms;
loading.done();
root.hidden = false;

// ?empty=1 (seulement avec ?test=1) : la salle du lot 1m sans meuble ni décor, mêmes coordonnées qu'au lot 1m.
const layout = buildLayout(world, decor, { empty: testMode && query.get('empty') === '1', slack: camera.slack });

const ctx = {
  cfg: { layout, player, weapon: weapons.pistol, zombie: enemies.zombie, render, camera, nav },
  palette,
  dict,
  textureData,
  variants,
  perf: fpsMode ? { flowSum: 0, flowCount: 0, flowMax: 0 } : null,
  params: {
    test: testMode,
    nospawn: query.get('nospawn') === '1',
    tilt: parseTilt(query.get('tilt'), render.camera.tilt),
    zoom: parseZoom(query.get('zoom'), camera.zoom),
    maxRatio: ratioCap(query.get('dpr')),
    shadows: query.get('shadows') !== '0',
  },
  seed: Number.isFinite(seedParam) ? seedParam : Date.now() % 2147483647,
  seedRun: 0,
  override: {},
  audio,
  audioCfg,
  audioMaterials: materialsCfg,
};

let game = null;
ctx.ui = createUi(dict, {
  onRestart: () => game?.restart(),
  onToggleSound: () => {
    ctx.audio.toggleMute();
    ctx.ui.syncSound(ctx.audio);
  },
  onVolume: (n) => {
    ctx.audio.setVolume(n);
    ctx.ui.syncSound(ctx.audio);
  },
  onPausePanel: (open) => ctx.audio.ui(open ? 'pause' : 'resume'),
  onPauseChange: (paused) => {
    ctx.audio.setSuspended(paused);
    syncHint();
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
// Téléphone : tant que le contexte audio n'est pas en marche (aucun doigt relâché depuis le début, un stick tenu), une invitation à toucher
// s'affiche après 1,5 s ; un toucher (relâché) suffit à activer le son.
const soundHint = document.getElementById('sound-hint');
const coarse = matchMedia('(pointer: coarse)').matches;
const syncHint = () => { soundHint.hidden = !coarse || !ctx.audio.supported || ctx.audio.running || ctx.audio.suspended || ctx.audio.muted; };
ctx.audio.onChange = syncHint;
setTimeout(syncHint, 1500);
setInterval(syncHint, 2000);
soundHint.addEventListener('click', () => ctx.audio.unlock());
// Le son ne démarre qu'après un geste du joueur. Chrome ne compte pas pointerdown comme geste pour la souris : pointerup, click et touchend
// aussi, et chaque geste retente la reprise tant que le contexte n'est pas en marche.
for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) window.addEventListener(type, () => ctx.audio.unlock(), { capture: true });

game = createGame(ctx);
if (game === null) {
  // WebGL indisponible : un message à la place du jeu.
  root.hidden = true;
  const error = document.getElementById('game-error');
  error.textContent = dict['game.error.webgl'];
  error.hidden = false;
} else {
  if (fpsMode) {
    import('../fps.js').then((fps) => fps.attachPerf(() => {
      const p = ctx.perf;
      const a = ctx.audio.stats;
      const textures = fmt(dict[TEXTURE_TEXTS.fps], { ms: Math.round(textureData.ms), flow: p.flowCount ? (p.flowSum / p.flowCount).toFixed(2) : '0', max: p.flowMax.toFixed(2) });
      return `${textures}\n${fmt(dict[TEXTURE_TEXTS.fpsSons], { essential: Math.round(a.essentialMs), background: Math.round(a.backgroundMs), voices: a.zombieVoices })}`;
    }));
  }
  if (testMode) installTestHook(ctx, game);
}
// Les sons « fond » (voix de zombies, ambiance) sont calculés pendant la partie, 4 ms par image au plus ; ils ne sont joués qu'une fois prêts.
renderSounds(planSounds(soundsCfg.sounds, 'fond'), { sliceMs: BACKGROUND_SLICE_MS, wait: nextVisibleFrame, onItem: (item) => ctx.audio.addSounds([item]) }).then((done) => {
  ctx.audio.stats.backgroundMs = done.ms;
  ctx.audio.stats.ready = true;
}).catch(() => {});
