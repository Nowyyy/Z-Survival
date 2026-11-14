// Point d'entrée de jeu.html : charge les textes et les données, prépare le DOM, lance la partie en 3D (Three.js).
import { buildLayouts } from '../core/layout.js';
import { resolveMapId } from '../core/maps.js';
import { parseZones, zonesToWorld } from '../core/zones.js';
import { parseTilt, parseZoom } from '../core/viewport.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { createLoading } from './loading.js';
import { readLevels } from './levels-source.js';
import { normalizeLevels } from '../core/player-stats.js';
import { makeEconomy } from '../core/economy.js';
import { createRepository } from '../save/index.js';
import { createInput } from './input.js';
import { createTokenLookup, readPalette } from './palette.js';
import { createVhs, parseVhsParam } from './vhs-layer.js';
import { graphicsBoot, pageCanal, pageSearch } from './graphics-boot.js';
import { parseSoundMode } from '../core/sound-choice.js';
import { CANAUX_DEBUG } from '../core/graphics.js';
import { createGraphicsController } from './graphics-apply.js';
import { installSafeArea } from './safe-area.js';
import { planSounds, renderSounds, nextVisibleFrame, BACKGROUND_SLICE_MS } from './sound-loader.js';
import { generateTextureData } from './textures.js';
import { installTestHook } from './testhook.js';
import { createUi } from './ui.js';
import { applyTexts, fmt, loadDict, TEXTURE_TEXTS } from './texts.js';
import { feuilleMenu, menuChute, menuProgres, menuRetour, modeMenu, optionPartie, reglagesSon } from '../menu/demarrage.js';

const DEFAULT_RATIO_CAP = 2;
menuProgres('modules', 1); // lot 8a : modules et Three.js évalués (écran de chargement du jeu après « JOUER » ; sans effet en partie directe)

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

// ?planks=N : nombre de planches de départ de chaque fenêtre (entier de 0 à max) ; toute autre valeur est ignorée (null : le maximum).
function planksParam(value, max) {
  const n = Number(value);
  return value !== null && /^\d+$/.test(value) && n >= 0 && n <= max ? n : null;
}

// ?wave=N : démarre à la vague N (entier de 1 à 200) ; toute autre valeur est ignorée.
function waveParam(value) {
  const n = Number(value);
  return value !== null && /^\d+$/.test(value) && n >= 1 && n <= 200 ? n : null;
}

// ?floor=N (lot 3e) : 0 (rez-de-chaussée) ou 1 (étage) ; toute autre valeur est ignorée.
function floorParam(value) {
  return value === '1' ? 'etage' : value === '0' ? 'rdc' : null;
}

// Lot 5l : adresse filtrée par canal (balise zs-canal de jeu.html, Docs/ref/debug.md) : un paramètre refusé n'a aucun effet et ne déclenche pas le mode
// essai ; sur le canal source (dépôt, tests), l'adresse est lue telle quelle. Tous les lecteurs ci-dessous lisent `search`, jamais location.search.
const canal = pageCanal();
const search = pageSearch();
const query = new URLSearchParams(search);
const testMode = query.get('test') === '1';
const fpsMode = query.get('fps') === '1';
// Lot 5b : ?perf=1 (outil de mesure, panneau et profileur) et ?cap=N (expérience de plafond) : modules importés seulement avec le paramètre.
const perfMode = query.get('perf') === '1';
const seedParam = Number.parseInt(query.get('seed') ?? '', 10);

// Carte (lot 3b) : ?map=salle charge l'ancienne salle (data/game/world.json et decor.json), sinon la carte par défaut (data/game/maps/<id>/) ; ?empty=1
// (avec ?test=1) garde la salle du lot 1m, donc les anciens fichiers.
const emptyMode = testMode && query.get('empty') === '1';
const mapId = emptyMode ? 'salle' : resolveMapId(search);
const mapDir = mapId === 'salle' ? 'data/game' : `data/game/maps/${mapId}`;

// Zones et portes (lot 3c) : zones.json de la carte (pixels du plan), absent de l'ancienne salle (?map=salle, ?empty=1) qui garde une seule zone.
const zonesJson = mapId === 'salle' ? null : await loadJson(`${mapDir}/zones.json`);
// Étage (lot 3e) : etage.world.json de la carte (généré par npm run carte) ; l'ancienne salle n'a qu'un étage.
const upperWorld = mapId === 'salle' ? null : await loadJson(`${mapDir}/etage.world.json`);
// Lot 3g : ?detail=0|1 (1 par défaut ; jamais mémorisé) : 0 = textures et décor d'avant le lot, pour comparer. Décor léger intérieur (non solide) :
// decor-interieur.world.json de la carte (généré par npm run carte), passé au rendu par render.decorInterieur ; absent de l'ancienne salle.
const detail = query.get('detail') !== '0';
// Lot 5b : préréglage graphique (?gfx= > préférence de l'appareil zs.device.v1 > auto) ; les paramètres explicites de l'adresse l'emportent.
const gfx = await graphicsBoot(search);
const gfxLoad = gfx.settings.load;
const decorInterieur = detail && gfxLoad.decor !== 'reduit' && mapId !== 'salle' ? await loadJson(`${mapDir}/decor-interieur.world.json`).catch(() => null) : null;
// Retours du propriétaire : mobilier dessiné d'après le modèle (mobilier.world.json, avec le détail).
const mobilier = detail && mapId !== 'salle' ? await loadJson(`${mapDir}/mobilier.world.json`).catch(() => null) : null;

const [dict, world, decor, camera, nav, player, weapons, enemies, render, texturesCfg, variants, soundsCfg, audioCfg, materialsCfg, voiceCfg, wavesCfg, gaitsCfg, statsCfg, splashCfg, vhsCfg, windowsCfg, downCfg, stairsCfg, economyCfg, saveCfg] = await Promise.all([

  loadDict(),
  loadJson(`${mapDir}/world.json`),
  loadJson(`${mapDir}/decor.json`),
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
  loadJson('data/game/waves.json'),
  loadJson('data/game/gaits.json'),
  loadJson('data/game/player-stats.json'),
  loadJson('data/game/splash.json'),
  loadJson('data/game/vhs.json'),
  loadJson('data/game/windows.json'),
  loadJson('data/game/player-down.json'),
  loadJson('data/game/stairs.json'),
  loadJson('data/game/economy.json'),
  loadJson('data/game/save.json'),
]);
menuProgres('donnees', 1);

applyTexts(dict);
installSafeArea();

const palette = readPalette();
const root = document.getElementById('game-root');
document.getElementById('boot')?.remove();

// Textures puis sons « essentiel » : calculés par tranches de 8 ms derrière l'écran de préparation (80 % / 20 % du pourcentage) ;
// la partie ne démarre qu'ensuite.
const TEXTURE_SHARE = 0.8;
const loading = createLoading(dict);
// Police du titre de l'animation de vague : chargée à la demande derrière l'écran de préparation (aucune nouvelle police, aucune requête externe).
const titleFont = document.fonts?.load ? Promise.race([document.fonts.load('1em "Rubik Wet Paint"'), new Promise((resolve) => setTimeout(resolve, 2000))]).catch(() => {}) : Promise.resolve();
render.decorInterieur = decorInterieur?.items ?? []; // lot 3g
render.mobilier = mobilier?.pieces ?? null;
render.ceilingWalls = mapId !== 'salle' && render.ceilingWalls === true;
render.detailDoors = detail; // vraies portes et éboulis (lot 3g, retours) ; ?detail=0 : anciens blocs
render.seeThrough = query.get('percee') === '0' ? null : (render.seeThrough ?? null); // mur percé autour du joueur caché (lot 3g, retours) ; ?percee=0 l'enlève
render.feux = detail && mapId !== 'salle' ? ((await loadJson(`${mapDir}/feux.json`).catch(() => null))?.feux ?? []) : []; // feux sur des caisses (lot 3g, retours)
render.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const textureData = await generateTextureData(texturesCfg.textures, { lookup: createTokenLookup(), onProgress: (p) => {
  loading.update(p * TEXTURE_SHARE);
  menuProgres('textures', p);
}, detail: detail && gfxLoad.texturesFines });
const soundMode = parseSoundMode(search); // ?sons= (groupe T)
const audio = createAudio({ config: { audio: audioCfg, materials: materialsCfg, voice: voiceCfg, sounds: soundsCfg.sounds }, test: testMode, seed: Number.isFinite(seedParam) ? seedParam : 1, mode: soundMode });
const sonMenu = reglagesSon(); // lot 8c : son et volume choisis dans les Options du menu (mémoire de la page ; partie directe : défauts, rien ne change)
if (sonMenu.coupe) audio.toggleMute();
if (sonMenu.volume !== null) audio.setVolume(sonMenu.volume);
if (sonMenu.musique !== null) audio.setMusicVolume(sonMenu.musique); // lot 8i : volume de la musique (mélodie d'annonce de vague)
const essential = await renderSounds(planSounds(soundsCfg.sounds, 'essentiel'), { onProgress: (p) => {
  loading.update(TEXTURE_SHARE + (1 - TEXTURE_SHARE) * p);
  menuProgres('sons', p);
}, mode: soundMode });
audio.addSounds(essential.items);
audio.stats.essentialMs = essential.ms;
// Effet VHS : le grain est généré (texgen.js) et converti en adresse data: une seule fois, derrière l'écran de préparation.
const vhs = createVhs({ params: vhsCfg, lookup: createTokenLookup(), forced: parseVhsParam(query.get('vhs')), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, mode: gfx.settings.live.vhs });
await titleFont;

// ?empty=1 (seulement avec ?test=1) : la salle du lot 1m sans meuble ni décor, mêmes coordonnées qu'au lot 1m.
const zones = zonesJson ? zonesToWorld(parseZones(zonesJson), world.transform) : null;
// Une couche de collisions par étage (lot 3e) ; layouts.rdc est la couche d'avant, qui sert aussi à la caméra et aux dimensions du monde.
const layouts = buildLayouts({ rdc: { world, decor }, etage: upperWorld ? { world: upperWorld } : null, zones }, { empty: emptyMode, slack: camera.slack });
const layout = layouts.rdc;

// Sauvegarde (lot 4) : le dépôt est choisi d'après l'adresse (mémoire pour ?test=1, lecture seule pour les paramètres d'essai) ; lot 8h : progression v2
// (zs.save.v2 ; zs.save.v1 n'est ni lue ni écrite). L'accès à localStorage peut lever (stockage bloqué) : le dépôt local passe à « indisponible ».
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const saveParams = { save: saveCfg, economy: economyCfg, stats: statsCfg };
const { repository, mode: saveMode } = createRepository({
  search,
  storage,
  params: saveParams,
  format: 'v2',
  listen: (handler) => {
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
  persist: () => navigator.storage?.persist?.(),
  // Lot 5o : canal entre onglets (défaut des deux onglets) ; save-merge.js n'est chargé que si un autre onglet se manifeste. Sans BroadcastChannel : null.
  channel: () => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(saveCfg.v2.storageKey) : null),
  merge: () => import('../core/save-merge.js'),
  now: () => Date.now(),
});
const loadedSave = repository.load();
// Lot 8d : niveaux effectifs calculés par le menu (équipement porté, capacité du personnage), reçus par l'option de démarrage (jamais par l'adresse) :
// ils remplacent ceux de la sauvegarde pour cette partie seulement (source « menu ») ; ?lvl= garde la priorité ; rien n'est écrit (la banque ne
// recopie que les niveaux de la sauvegarde). Partie directe : aucune option, niveaux lus comme avant.
const niveauxPartie = (lus) => (optionPartie().stats && lus.source !== 'url' ? { ...normalizeLevels(optionPartie().stats, statsCfg), source: 'menu' } : lus);

const ctx = {
  cfg: { layout, layouts, stairs: stairsCfg, player, weapon: weapons.pistol, stats: statsCfg, zombie: enemies.zombie, enemies, gaits: gaitsCfg, waves: wavesCfg, render, camera, nav, windows: windowsCfg, down: downCfg },
  palette,
  dict,
  textureData,
  variants,
  perf: fpsMode ? { flowSum: 0, flowCount: 0, flowMax: 0, windowsMs: 0, floorsMs: 0 } : null,
  params: {
    test: testMode,
    nospawn: query.get('nospawn') === '1',
    wave: waveParam(query.get('wave')),
    // ?endless=1 (lot 3c) : les manches continuent après la manche 40, sans fin de monde ; fonctionne sans ?test=1, n'expose rien et n'est jamais mémorisé.
    // Lot 8b : le mode infini du menu (option de démarrage, sans paramètre d'adresse, donc sans lecture seule) fait exactement la même chose.
    endless: query.get('endless') === '1' || optionPartie().mode === 'infini',
    planks: planksParam(query.get('planks'), windowsCfg.planks),
    tilt: parseTilt(query.get('tilt'), render.camera.tilt),
    zoom: parseZoom(query.get('zoom'), layout.zoom ?? camera.zoom),
    labels: query.get('labels') === '1',
    // ?floor=N (lot 3e) : démarre à l'étage (1) ou au rez-de-chaussée (0) si l'escalier correspondant est ouvert au chargement ; sinon ignoré, jamais mémorisé.
    floor: floorParam(query.get('floor')),
    maxRatio: Math.min(ratioCap(query.get('dpr')), gfx.settings.live.dprMax), // lot 5b : plafond du préréglage, sauf ?dpr= explicite (settingsFor)
    shadows: gfx.settings.live.ombres, // lot 5b : préréglage, sauf ?shadows= explicite
  },
  seed: Number.isFinite(seedParam) ? seedParam : Date.now() % 2147483647,
  seedRun: 0,
  levels: niveauxPartie(readLevels(search, statsCfg, loadedSave.status === 'ok' ? { stats: loadedSave.save.niveaux } : null)),
  repository,
  mode: saveMode,
  economy: makeEconomy(economyCfg, enemies),
  saveCfg,
  override: {},
  splashCfg,
  vhs,
  audio,
  audioCfg,
  audioMaterials: materialsCfg,
  canal, // lot 5l : canal de la page (null : refusé) ; l'icône de débogage de la pause n'existe que sur les canaux de débogage
  monde: optionPartie().monde ?? 'batiment', // lot 8h : monde de la partie (record par monde et par mode)
  modePartie: optionPartie().mode, // lot 8b : option de démarrage posée par le menu (histoire, ou infini sans paramètre d'adresse) ; partie directe : histoire
};

// Lot 5b : préréglages graphiques en jeu (réglages « live », Auto entre deux manches) ; lot 8c : réglages « load » verrouillés en partie, sans rechargement.
ctx.graphics = createGraphicsController(gfx, { vhs, dict, announce: (text) => ctx.ui?.setLive(text) });
ctx.graphicsLabel = () => ctx.graphics.label();
if (perfMode) ctx.profiler = (await import('./profiler.js')).createProfiler({ search, ua: navigator.userAgent });
if (query.has('cap')) ctx.gate = (await import('./frame-cap.js')).gateFromParam(query.get('cap'));

let game = null;
ctx.ui = createUi(dict, {
  onRestart: () => game?.restart(),
  chargerStyles: feuilleMenu, // lot 8c : feuille des Options (composant partagé avec le menu), chargée à leur première ouverture
  onToggleSound: () => {
    ctx.audio.toggleMute();
    ctx.ui.syncSound(ctx.audio);
  },
  onVolume: (n) => {
    ctx.audio.setVolume(n);
    ctx.ui.syncSound(ctx.audio);
  },
  onMusicVolume: (n) => {
    ctx.audio.setMusicVolume(n);
    ctx.ui.syncSound(ctx.audio);
  },
  onToggleVhs: () => {
    ctx.vhs.toggle();
    ctx.ui.syncVhs(ctx.vhs);
  },
  onPausePanel: (open) => {
    ctx.audio.ui(open ? 'pause' : 'resume');
    if (open) game?.onPauseOpen();
    if (open) ctx.ui.syncGraphics(ctx.graphics.state()); // lot 5b : « Auto (Moyen) », baisse éventuelle
  },
  onGraphicsChoice: (choice) => ctx.graphics.choose(choice), // lot 5b : préférence écrite puis rechargement (confirmé dans la pause)
  onPauseChange: (paused) => {
    ctx.audio.setSuspended(paused);
    ctx.perfPanel?.setPaused(paused); // retour du propriétaire (lot 5k) : panneau de mesure inerte pendant la pause
    syncHint();
  },
  onRotateChange: () => ctx.input.releaseAll(),
  // Lot 8a : « Quitter » confirmé (argent écrit par bank.runEnd, comme à la mort) et « Revenir au menu principal » : rechargement vers le menu.
  onQuit: () => {
    game?.quit();
    menuRetour();
  },
  onMenu: () => menuRetour(),
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
// Lot 5l : icône « Débogage » de la pause sur les canaux de débogage seulement ; le menu lit l'adresse réelle (préremplissage, paramètres conservés).
ctx.ui.bindDebug({ allowed: CANAUX_DEBUG.includes(canal), search: location.search, planksMax: windowsCfg.planks });
ctx.ui.syncVhs(ctx.vhs);
ctx.ui.syncGraphics(ctx.graphics.state());
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

if (modeMenu) await menuChute(); // lot 8a : mode menu, la partie n'est créée (et ne tourne) qu'une fois la chute du Z finie
game = createGame(ctx);
// Lot 5b-G : l'écran de préparation reste affiché pendant la création du jeu (monde, programmes, premier rendu complet, zombies préparés) :
// le joueur ne voit pas la première image lente ; la boucle d'images ne démarre qu'à l'image suivante, une fois l'écran retiré.
// Lot 5b-H : garder aussi le premier « commit » du navigateur sous l'écran (deux images d'attente) a été essayé puis retiré : Lighthouse tombait
// de 55 à 30 (temps de blocage 1,3 à 1,6 s), sous le seuil de 45 ; ce commit reste dans la première seconde de la partie (compte à rebours « DÉBUT »).
loading.done();
root.hidden = false;
menuProgres('compilation', 1); // lot 8a : partie créée ; en mode menu, l'écran de chargement du jeu laisse voir la partie
if (game === null) {
  // WebGL indisponible : un message à la place du jeu.
  root.hidden = true;
  document.getElementById('e7')?.remove(); // lot 8a : mode menu, le message remplace l'écran de chargement
  const error = document.getElementById('game-error');
  error.textContent = dict['game.error.webgl'];
  error.hidden = false;
} else {
  if (fpsMode) {
    import('../fps.js').then((fps) => fps.attachPerf(() => {
      const p = ctx.perf;
      const a = ctx.audio.stats;
      const textures = fmt(dict[TEXTURE_TEXTS.fps], { ms: Math.round(textureData.ms), flow: p.flowCount ? (p.flowSum / p.flowCount).toFixed(2) : '0', max: p.flowMax.toFixed(2) });
      const stats = game.statsLine();
      const windowsLine = `${fmt(dict[TEXTURE_TEXTS.fpsWindows], { ms: p.windowsMs.toFixed(1) })}\n${fmt(dict[TEXTURE_TEXTS.fpsEtage], { ms: (p.floorsMs ?? 0).toFixed(1) })}`;
      return `${textures}\n${windowsLine}\n${fmt(dict[TEXTURE_TEXTS.fpsSons], { essential: Math.round(a.essentialMs), background: Math.round(a.backgroundMs), voices: a.zombieVoices })}\n${fmt(dict[TEXTURE_TEXTS.fpsStats], { levels: stats.levels, angle: stats.angle })}`;
    }));
  }
  if (perfMode) {
    ctx.perfState = () => ctx.profiler.state({ preset: ctx.graphicsLabel?.() ?? null, cap: ctx.gate?.state() ?? null });
    ctx.perfPanel = (await import('./perf-panel.js')).createPerfPanel({ read: ctx.perfState, reset: () => ctx.profiler.reset(), dict });
    ctx.perfPanel.setPaused(ctx.ui.isPaused());
  }
  if (testMode) installTestHook(ctx, game);
  // Lot 3l (demande du propriétaire) : ?fin=monde montre tout de suite l'écran de victoire « Monde terminé » : la dernière manche du monde est lancée puis
  // terminée d'office (vrais calculs : bonus, record). Seulement en mode essai (sauvegarde en lecture seule, par exemple avec ?wave=40) : rien n'est
  // jamais écrit ; ignoré sinon, et sur une carte sans fin de monde (?map=salle).
  if (query.get('fin') === 'monde' && saveMode.readOnly && Number.isInteger(zonesJson?.wavesPerWorld)) {
    game.startWave(zonesJson.wavesPerWorld);
    game.advance(3.2);
    game.skipWave();
    game.advance(0.3);
  }
}
// Les sons « fond » (voix de zombies, ambiance) sont calculés pendant la partie, 4 ms par image au plus ; ils ne sont joués qu'une fois prêts.
renderSounds(planSounds(soundsCfg.sounds, 'fond'), { sliceMs: BACKGROUND_SLICE_MS, wait: nextVisibleFrame, onItem: (item) => ctx.audio.addSounds([item]), mode: soundMode }).then((done) => {
  ctx.audio.stats.backgroundMs = done.ms;
  ctx.audio.stats.ready = true;
}).catch(() => {});
