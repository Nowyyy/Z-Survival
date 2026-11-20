// Entrées du joueur : clavier (event.code, jamais event.key), souris, deux sticks flottants multi-touch.
import { STICK_RADIUS, stickKnob, stickVector } from '../core/stick.js';

const MOVE_CODES = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
};
const GAME_CODES = new Set(Object.values(MOVE_CODES).flat());
// Lot 9e : armes (event.code : mêmes touches physiques en AZERTY et en QWERTY ; R et E portent la même lettre sur les deux claviers, 1 et 2 sont
// les touches des chiffres de la rangée du haut) : recharger, changer d'arme, sortir le Colt ou l'arme achetée.
export const ARME_CODES = Object.freeze({ KeyR: 'recharger', KeyE: 'changer', Digit1: 'arme1', Digit2: 'arme2' });
export const MOLETTE_PAUSE_MS = 150; // un cran de molette = un changement ; les crans suivants dans ce délai sont ignorés

// root : conteneur du jeu. Les sticks sont des éléments HTML (E2-3, E2-4) posés où le doigt touche.
export function createInput(root, { onCommand = () => {}, isBlocked = () => false } = {}) {
  const keys = new Set();
  const sticks = {
    left: { el: root.querySelector('#stick-left'), id: null, origin: null, vec: { x: 0, y: 0 } },
    right: { el: root.querySelector('#stick-right'), id: null, origin: null, vec: { x: 0, y: 0 } },
  };
  // Lot 9e (retour du propriétaire, iPhone : « avant que je touche l'écran, les balles sont en bas à droite comme sur PC ») : un écran tactile
  // sans souris démarre en mode tactile (boutons, emplacements et sticks de téléphone dès l'ouverture) ; sinon la souris, comme avant.
  const tactile = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const state = { type: tactile ? 'touch' : 'mouse', pointer: null };

  const setType = (type) => {
    if (state.type === type) return;
    state.type = type;
    root.dataset.input = type;
    showIdle();
  };

  function place(stick, x, y) {
    stick.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function moveKnob(stick, current) {
    const knob = stickKnob(stick.origin, current, STICK_RADIUS);
    stick.el.querySelector('.stick-knob').style.transform = `translate(calc(${knob.x - stick.origin.x}px - 50%), calc(${knob.y - stick.origin.y}px - 50%))`;
  }

  // Sticks au repos : discrets, à leur place par défaut, tant que le dernier type d'entrée est tactile.
  function showIdle() {
    const touch = state.type === 'touch';
    for (const [name, stick] of Object.entries(sticks)) {
      if (stick.id !== null) continue;
      stick.el.hidden = !touch;
      stick.el.classList.toggle('is-idle', true);
      stick.el.querySelector('.stick-knob').style.transform = 'translate(-50%, -50%)';
      if (touch) place(stick, window.innerWidth * (name === 'left' ? 0.16 : 0.84), window.innerHeight * 0.68);
    }
  }

  const keyDown = (event) => {
    if (event.repeat && !GAME_CODES.has(event.code)) return;
    if (event.code === 'Escape' || event.code === 'KeyP') onCommand('pause');
    else if (event.code === 'KeyF') onCommand('fullscreen');
    else if (event.code === 'KeyM') onCommand('mute');
    else if (Object.hasOwn(ARME_CODES, event.code)) {
      if (!event.repeat && !isBlocked()) onCommand(ARME_CODES[event.code]);
    }
    else if (GAME_CODES.has(event.code)) {
      keys.add(event.code);
      if (!isBlocked()) event.preventDefault();
    }
  };
  const keyUp = (event) => keys.delete(event.code);

  function pointerDown(event) {
    if (event.pointerType === 'mouse') {
      state.pointer = { x: event.clientX, y: event.clientY };
      setType('mouse');
      return;
    }
    if (event.target.closest?.('button')) return;
    setType('touch');
    const name = event.clientX < window.innerWidth / 2 ? 'left' : 'right';
    const stick = sticks[name];
    if (stick.id !== null) return;
    stick.id = event.pointerId;
    stick.origin = { x: event.clientX, y: event.clientY };
    stick.vec = { x: 0, y: 0 };
    stick.el.hidden = false;
    stick.el.classList.remove('is-idle');
    place(stick, stick.origin.x, stick.origin.y);
    moveKnob(stick, stick.origin);
    root.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function pointerMove(event) {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      state.pointer = { x: event.clientX, y: event.clientY };
      setType('mouse');
      return;
    }
    for (const stick of Object.values(sticks)) {
      if (stick.id !== event.pointerId) continue;
      const current = { x: event.clientX, y: event.clientY };
      stick.vec = stickVector(stick.origin, current, STICK_RADIUS);
      moveKnob(stick, current);
      event.preventDefault();
    }
  }

  function pointerUp(event) {
    for (const stick of Object.values(sticks)) {
      if (stick.id !== event.pointerId) continue;
      stick.id = null;
      stick.origin = null;
      stick.vec = { x: 0, y: 0 };
      showIdle();
    }
  }

  function releaseAll() {
    keys.clear();
    for (const stick of Object.values(sticks)) {
      stick.id = null;
      stick.origin = null;
      stick.vec = { x: 0, y: 0 };
    }
    showIdle();
  }

  // Retour du propriétaire après le lot 9a (téléphone tourné plusieurs fois, ou passage par une autre appli : les commandes ne répondaient plus) :
  // un doigt posé quand la page part en arrière-plan ou pivote ne reçoit jamais son « pointerup » ; son stick restait pris et ignorait tout nouveau
  // toucher de son côté. Tout est relâché quand la page est cachée, quittée ou pivote ; les sticks au repos sont replacés à la nouvelle taille.
  const onVisibility = () => {
    if (document.hidden) releaseAll();
  };
  const onResize = () => showIdle();
  // Lot 9e : molette de la souris : changer d'arme (un cran, puis MOLETTE_PAUSE_MS d'attente) ; horloge de l'événement (timeStamp).
  let derniereMolette = -Infinity;
  const onWheel = (event) => {
    if (isBlocked() || Math.abs(event.deltaY) < 1) return;
    if (event.timeStamp - derniereMolette < MOLETTE_PAUSE_MS) return;
    derniereMolette = event.timeStamp;
    onCommand('changer');
  };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', releaseAll);
  window.addEventListener('orientationchange', releaseAll);
  window.addEventListener('resize', onResize);
  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerUp);
  window.addEventListener('wheel', onWheel, { passive: true }); // fenêtre, comme le clavier : un élément posé au-dessus du jeu ne la bloque pas
  const noMenu = (event) => event.preventDefault();
  root.addEventListener('contextmenu', noMenu);
  root.dataset.input = state.type;
  if (tactile) showIdle();

  return {
    // Direction voulue : clavier d'abord, sinon stick gauche (non normalisée : un stick incliné à moitié avance à moitié vitesse).
    move() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return x || y ? { x, y } : { x: sticks.left.vec.x, y: sticks.left.vec.y };
    },
    aimStick: () => ({ ...sticks.right.vec }),
    pointer: () => (state.pointer ? { ...state.pointer } : null),
    type: () => state.type,
    releaseAll,
    refresh: showIdle,
    destroy() {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', releaseAll);
      window.removeEventListener('orientationchange', releaseAll);
      window.removeEventListener('resize', onResize);
      // Lot 9d : libération de la partie (le nœud lui-même est remplacé par sa copie de départ).
      root.removeEventListener('pointerdown', pointerDown);
      root.removeEventListener('pointermove', pointerMove);
      root.removeEventListener('pointerup', pointerUp);
      root.removeEventListener('pointercancel', pointerUp);
      root.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('wheel', onWheel);
      releaseAll();
    },
  };
}
