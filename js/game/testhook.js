// Accès pour les tests : exposé seulement avec ?test=1. Ne stocke ni n'envoie rien.
import { createRng } from '../core/rng.js';

export function installTestHook(ctx, game) {
  window.__zs = {
    getState: () => game.snapshot(),
    setSeed: (n) => {
      game.sim.rng = createRng(n);
    },
    // Sans options : marcheur de la vague 1 en allure « marche » (comme avant le lot 2). Options : { type, gait, wave } (vague du directeur par défaut).
    spawnEnemy: (x, y, opts = {}) => {
      const typed = opts?.type !== undefined || opts?.gait !== undefined || opts?.wave !== undefined;
      const spec = typed ? game.specOf(opts.wave) : undefined;
      return game.addEnemy(x, y, { type: opts?.type, gait: opts?.gait, spec }).id;
    },
    // Saute à la vague n (zombies retirés, compte à rebours de 3 s) ; sans effet avec ?nospawn=1.
    startWave: (n) => game.startWave(n),
    // Tue tous les zombies vivants sans compter de tués (pour tester la fin de vague) ; renvoie leur nombre.
    killAll: () => game.killAll(),
    // Lot 3c : termine la manche courante (zombies vivants retirés, apparitions restantes annulées, sans compter de tués) ; renvoie le nombre de zombies retirés.
    skipWave: () => game.skipWave(),
    // Lot 3c : ouvre ou ferme une porte d'un coup (sans transition ni annonce) ; renvoie faux si la porte n'existe pas.
    setDoor: (id, open) => game.setDoor(id, open),
    // Surcharge temporaire de data/game/waves.json (sections fusionnées), jusqu'à Rejouer.
    setWaveParams: (partial) => game.setWaveParams(partial),
    // Remplace les niveaux des statistiques (ex. { degats: 5 } ; absent = 0), sans rien stocker ; les balles en vol gardent leurs dégâts.
    setLevels: (levels) => game.setLevels(levels),
    // Avance la simulation de `seconds` secondes de jeu (pas de 0,05 s), sans attendre le rendu.
    step: (seconds) => game.advance(seconds),
    // Injecte des événements sonores (ex. { type: 'zombieHit', x, y, killed: false, zombie: 'marcheur' }) : seul le journal des sons les voit.
    audioEvent: (events) => game.emitAudio(Array.isArray(events) ? events : [events]),
    // Fige l'horloge d'effet VHS à t secondes (null : horloge réelle) ; applique une image tout de suite.
    setVhsClock: (t) => ctx.vhs?.setClock(t),
    // Lot 3 : règle les planches d'une fenêtre (0 à 4) ; crée un zombie en approche à 400 de la fenêtre (type facultatif) et renvoie son identifiant.
    setPlanks: (id, n) => game.setPlanks(id, n),
    spawnAtWindow: (id, type) => game.spawnAtWindow(id, type),
    // Lot 3 : met la vie du joueur à 0 : il tombe au prochain pas s'il lui reste une chute, sinon c'est la mort.
    downPlayer: () => game.downPlayer(),
    // Lot 3 : règle les chutes restantes (0 : la prochaine vie à 0 est la mort) ; sert aux tests de mort des lots précédents.
    setChutes: (n) => game.setChutes(n),
    // Place le joueur (et la caméra) d'un coup.
    setPlayer: (x, y) => game.placePlayer(x, y),
    // Tire une balle dans la direction `angle` depuis la bouche de l'arme, sans passer par la visée (balle d'essai).
    fire: (angle) => game.fireBullet(angle),
    // Règle la caméra pour montrer tout le monde (captures) ; overview(false) rend la caméra au joueur.
    overview: (on = true) => game.overview(on),
    // Pixels de la zone (x, y, w, h) en pixels CSS : { distinctColors (16 niveaux par canal), meanLuminance (0 à 1) }.
    sampleScreen: (x, y, w, h) => game.sample(x, y, w, h),
    setInput: ({ move, aim } = {}) => {
      ctx.override.move = move ?? undefined;
      ctx.override.aim = aim ?? undefined;
    },
  };
}
