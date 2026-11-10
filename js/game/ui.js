// Panneaux HTML : pause (E2-6), fin provisoire (E2-7), message de rotation, région vocale, plein écran. Lot 3l : direction B de l'atelier (icônes du titre de fin,
// pièce devant les montants, étoile du record, « Revenir au menu principal » et « Quitter » sans action tant que le menu n'existe pas).
// Lot 5j : bouton « Options » de la pause (écran E2-12, js/game/options-menu.js importé à la première ouverture) ; « Graphismes » et « Effet VHS » quittent
// la pause (ils sont dans l'écran Options). Pendant l'écran Options, la partie reste en pause.
// Lot 5l : icône « Débogage » de la pause (canaux de débogage seulement) ; menu E2-13 (js/game/debug-menu.js importé au premier clic) ; la partie reste en pause.
// Lot 8a : « Quitter » actif (confirmation construite au premier appui, à la place des boutons de la pause) et « Revenir au menu principal » actif : tous
// deux appellent main.js (onQuit, onMenu : retour au menu par rechargement).
import { formatMoney } from '../core/economy.js';
import { fmt, MONEY_TEXTS, SAVE_TEXTS } from './texts.js';

const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

export function createUi(dict, handlers) {
  const $ = (id) => document.getElementById(id);
  const els = {
    pausePanel: $('pause-panel'), endPanel: $('end-panel'), live: $('hud-live'), rotate: $('rotate'),
    pauseBtn: $('btn-pause'), resume: $('btn-resume'), fullscreen: $('btn-fullscreen'), sound: $('btn-sound'),
    options: $('btn-options'), debug: $('btn-debug'), restart: $('btn-restart'), replay: $('btn-replay'), quit: $('btn-quit'), menuBtn: $('btn-menu'), endKills: $('end-kills'), endWave: $('end-wave'),
    endBox: $('end-box'), endTitle: $('end-title-text'), pauseBalance: $('pause-balance-text'), endEarned: $('end-earned'), endEarnedText: $('end-earned-text'), endBonus: $('end-bonus'), endBonusText: $('end-bonus-text'),
    endBalance: $('end-balance'), endBest: $('end-best'), endRecord: $('end-record'), endRecordText: $('end-record-text'), endSave: $('end-save'),
  };
  // Lot 5j : écran Options (créé à la première ouverture) ; binding : contrôleur graphique et couche VHS, donnés par game.js (bindOptions).
  let binding = null;
  let menu = null;
  let optionsOpen = false;
  // Lot 5l : menu de débogage (créé au premier clic) ; debugBinding : { search, planksMax } donné par main.js sur un canal de débogage, sinon null.
  let debugBinding = null;
  let debugMenu = null;
  let debugOpen = false;
  const rotateQuery = matchMedia(PORTRAIT_PHONE);
  const canFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  let hasAudio = false;
  let quitBox = null; // lot 8a : confirmation de « Quitter » (créée au premier appui)

  const ui = {
    isPaused: () => !els.pausePanel.hidden || optionsOpen || debugOpen || rotateQuery.matches || document.hidden,
    isEnded: () => !els.endPanel.hidden,

    // Lot 3l (retour du propriétaire) : « Prochaine zone » n'est plus affichée dans la pause ; game.js l'appelle toujours, sans effet.
    setNextZone() {},

    setLive(text) {
      els.live.textContent = text;
    },

    openPause() {
      if (ui.isEnded() || optionsOpen || debugOpen) return;
      els.pausePanel.hidden = false;
      els.resume.focus();
      handlers.onPausePanel?.(true);
      handlers.onPauseChange?.(ui.isPaused());
    },

    closePause() {
      ui.closeQuit(false);
      els.pausePanel.hidden = true;
      els.pauseBtn.blur();
      document.activeElement?.blur?.();
      handlers.onPausePanel?.(false);
      handlers.onPauseChange?.(ui.isPaused());
    },

    togglePause() {
      // Lot 5j : Échap dans l'écran Options : ferme la confirmation du rechargement, sinon revient à la pause.
      if (optionsOpen) {
        if (!menu?.escape()) ui.closeOptions();
        return;
      }
      // Lot 5l : de même pour le menu de débogage (confirmation d'abord).
      if (debugOpen) {
        if (!debugMenu?.escape()) ui.closeDebug();
        return;
      }
      // Lot 8a : Échap dans la confirmation de « Quitter » : retour aux boutons de la pause.
      if (quitBox && !quitBox.hidden) {
        ui.closeQuit(true);
        return;
      }
      if (els.pausePanel.hidden) ui.openPause();
      else ui.closePause();
    },

    // wave : vague en cours à la mort (0 ou absente quand les vagues sont coupées par ?nospawn=1 : la ligne est masquée). variant « world » (lot 3c) :
    // « Monde terminé » à la place de « Tu es mort » (la variante de mort est inchangée).
    // Lot 4 : « Solde » (summary : { balance, status }, de js/game/bank.js). Lot 3l (retour du propriétaire) : à côté de « PAUSE » ; l'état de la sauvegarde
    // n'est plus dans la pause (il reste sur l'écran de fin quand il pose problème : illisible, indisponible, échec, mode essai).
    setPauseInfo(summary) {
      els.pauseBalance.textContent = fmt(dict[MONEY_TEXTS.pauseBalance], { n: formatMoney(summary?.balance) });
    },

    // info (lot 4, de bank.runEnd) : { earned, world, balance, best, record, status } ; absent : les lignes d'argent restent vides.
    showEnd(kills, wave = 0, variant = 'death', info = null) {
      els.pausePanel.hidden = true;
      els.endTitle.textContent = dict[variant === 'world' ? 'game.end.world' : 'game.end.title'];
      els.endBox.dataset.variant = variant === 'world' ? 'world' : 'death'; // icône du titre : coche ou crâne (décoratives)
      els.endKills.textContent = fmt(dict['game.end.kills'], { n: kills });
      els.endWave.textContent = wave > 0 ? fmt(dict['game.wave.reached'], { n: wave }) : '';
      els.endWave.hidden = !(wave > 0);
      const money = info !== null && info !== undefined;
      els.endEarned.hidden = !money;
      els.endBalance.hidden = !money;
      els.endBest.hidden = !money;
      if (money) {
        els.endEarnedText.textContent = fmt(dict[MONEY_TEXTS.earned], { n: formatMoney(info.earned) });
        els.endBalance.textContent = fmt(dict[MONEY_TEXTS.balance], { n: formatMoney(info.balance) });
        els.endBest.textContent = fmt(dict[MONEY_TEXTS.best], { n: info.best });
      }
      const world = money && variant === 'world';
      els.endBonus.hidden = !world;
      if (world) els.endBonusText.textContent = fmt(dict[MONEY_TEXTS.worldBonus], { n: formatMoney(info.world) });
      els.endRecord.hidden = !(money && info.record === true);
      els.endRecordText.textContent = dict[MONEY_TEXTS.record];
      // Ligne d'état seulement quand l'argent n'est pas écrit : mode essai (texte propre à l'écran de fin), sauvegarde illisible, indisponible, échec.
      const status = money ? info.status : 'saved';
      const note = status === 'readonly' ? MONEY_TEXTS.trial : status === 'locked' || status === 'unavailable' || status === 'failed' ? SAVE_TEXTS[status] : null;
      els.endSave.hidden = note === null;
      els.endSave.textContent = note === null ? '' : dict[note];
      els.endPanel.hidden = false;
      els.replay.focus();
    },

    hideEnd() {
      els.endPanel.hidden = true;
      document.activeElement?.blur?.();
    },

    toggleFullscreen() {
      if (!canFullscreen) return;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    },

    // Bouton Son selon l'état courant ; masqué sans moteur audio utilisable. Lot 3l (retour du propriétaire) : plus de curseur de volume. Lot 5j-F : icône
    // en haut à droite de la pause (haut-parleur ; barré d'une croix quand le son est coupé : data-muted) ; l'état est dans le nom accessible.
    syncSound(audio) {
      hasAudio = Boolean(audio?.supported);
      els.sound.hidden = !hasAudio;
      if (!hasAudio) return;
      els.sound.dataset.muted = String(Boolean(audio.muted));
      els.sound.setAttribute('aria-label', dict[audio.muted ? 'game.sound.off' : 'game.sound.on']);
    },
  };

  // Lot 5j : écran Options. game.js donne le contrôleur graphique et la couche VHS ; le module n'est importé qu'au premier clic sur « Options ».
  ui.bindOptions = ({ graphics, vhs = null } = {}) => {
    binding = graphics ? { graphics, vhs } : null;
  };
  ui.isOptionsOpen = () => optionsOpen;
  ui.openOptions = async () => {
    if (!binding || optionsOpen || els.pausePanel.hidden) return;
    optionsOpen = true;
    els.pausePanel.hidden = true; // la partie reste en pause (optionsOpen)
    try {
      menu ??= (await import('./options-menu.js')).createOptionsMenu({ dict, graphics: binding.graphics, vhs: binding.vhs, onClose: () => ui.closeOptions() });
    } catch {
      optionsOpen = false;
      els.pausePanel.hidden = false;
      els.options.focus();
      return;
    }
    if (optionsOpen) menu.open();
  };
  ui.closeOptions = () => {
    if (!optionsOpen) return;
    menu?.close();
    optionsOpen = false;
    els.pausePanel.hidden = false;
    els.options.focus();
  };
  // Lot 5b : main.js appelle encore syncGraphics et syncVhs (ligne « Graphismes » et bascule VHS de la pause, retirées au lot 5j) : l'écran Options
  // lit l'état lui-même à chaque ouverture ; seul un écran ouvert est mis à jour.
  ui.syncGraphics = () => {
    if (optionsOpen) menu?.sync();
  };
  ui.syncVhs = () => {};
  els.options.addEventListener('click', () => ui.openOptions());
  // Lot 5l : menu de débogage. allowed : canal de débogage (sinon l'icône reste cachée et le module n'est jamais chargé) ; search : adresse actuelle.
  ui.bindDebug = ({ allowed = false, search = '', planksMax } = {}) => {
    debugBinding = allowed ? { search, planksMax } : null;
    els.debug.hidden = !allowed;
  };
  ui.isDebugOpen = () => debugOpen;
  ui.openDebug = async () => {
    if (!debugBinding || debugOpen || optionsOpen || els.pausePanel.hidden) return;
    debugOpen = true;
    els.pausePanel.hidden = true; // la partie reste en pause (debugOpen)
    try {
      debugMenu ??= (await import('./debug-menu.js')).createDebugMenu({ dict, search: debugBinding.search, planksMax: debugBinding.planksMax, onClose: () => ui.closeDebug() });
    } catch {
      debugOpen = false;
      els.pausePanel.hidden = false;
      els.debug.focus();
      return;
    }
    if (debugOpen) debugMenu.open();
  };
  ui.closeDebug = () => {
    if (!debugOpen) return;
    debugMenu?.close();
    debugOpen = false;
    els.pausePanel.hidden = false;
    els.debug.focus();
  };
  els.debug.addEventListener('click', () => ui.openDebug());
  // Lot 8a : retour au menu (« Quitter » confirmé, « Revenir au menu principal »).
  const actions = els.pausePanel.querySelector('.panel-actions');
  ui.openQuit = () => {
    if (els.pausePanel.hidden) return;
    if (!quitBox) {
      quitBox = document.createElement('div');
      quitBox.id = 'quit-confirm';
      quitBox.setAttribute('role', 'alertdialog');
      quitBox.setAttribute('aria-labelledby', 'quit-confirm-text');
      const text = document.createElement('p');
      text.id = 'quit-confirm-text';
      text.className = 'panel-line';
      text.textContent = dict['game.pause.quitConfirm'];
      const row = document.createElement('div');
      row.className = 'panel-actions';
      const make = (id, cls, key) => {
        const b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.className = `button ${cls}`;
        b.textContent = dict[key];
        row.append(b);
        return b;
      };
      make('btn-quit-ok', 'button-main', 'game.pause.quitOk').addEventListener('click', () => handlers.onQuit?.());
      make('btn-quit-cancel', 'button-quiet', 'game.pause.quitCancel').addEventListener('click', () => ui.closeQuit(true));
      quitBox.append(text, row);
      actions.after(quitBox);
    }
    actions.hidden = true;
    quitBox.hidden = false;
    document.getElementById('btn-quit-cancel').focus();
  };
  ui.closeQuit = (focus) => {
    if (!quitBox || quitBox.hidden) return;
    quitBox.hidden = true;
    actions.hidden = false;
    if (focus) els.quit.focus();
  };
  els.quit.addEventListener('click', () => ui.openQuit());
  els.menuBtn.addEventListener('click', () => handlers.onMenu?.());
  els.fullscreen.hidden = !canFullscreen;
  // Lot 5j-G : icône de plein écran (coins vers l'extérieur ; vers l'intérieur et nom « Quitter le plein écran » quand la page est en plein écran).
  const syncFullscreen = () => {
    const on = Boolean(document.fullscreenElement);
    els.fullscreen.dataset.active = String(on);
    els.fullscreen.setAttribute('aria-label', dict[on ? 'game.pause.fullscreenExit' : 'game.pause.fullscreen']);
  };
  document.addEventListener('fullscreenchange', syncFullscreen);
  syncFullscreen();
  els.pauseBtn.addEventListener('click', () => ui.openPause());
  els.resume.addEventListener('click', () => ui.closePause());
  els.fullscreen.addEventListener('click', () => ui.toggleFullscreen());
  els.sound.addEventListener('click', () => {
    if (hasAudio) handlers.onToggleSound();
  });
  els.restart.addEventListener('click', () => {
    ui.closePause();
    handlers.onRestart();
  });
  els.replay.addEventListener('click', () => {
    ui.hideEnd();
    handlers.onRestart();
  });
  // Onglet caché : la partie est figée et le panneau de pause s'ouvre pour le retour.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ui.openPause();
    handlers.onPauseChange?.(ui.isPaused());
  });
  rotateQuery.addEventListener('change', () => {
    handlers.onRotateChange?.();
    handlers.onPauseChange?.(ui.isPaused());
  });

  return ui;
}
