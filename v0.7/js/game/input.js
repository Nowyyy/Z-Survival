// Entrées du joueur : clavier (event.code, jamais event.key), souris, deux sticks flottants multi-touch.
import { STICK_RADIUS, stickKnob, stickVector } from '../core/stick.js';

const MOVE_CODES = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
};
const GAME_CODES = new Set(Object.values(MOVE_CODES).flat());

// root : conteneur du jeu. Les sticks sont des éléments HTML (E2-3, E2-4) posés où le doigt touche.
export function createInput(root, { onCommand = () => {}, isBlocked = () => false } = {}) {
  const keys = new Set();
  const sticks = {
    left: { el: root.querySelector('#stick-left'), id: null, origin: null, vec: { x: 0, y: 0 } },
    right: { el: root.querySelector('#stick-right'), id: null, origin: null, vec: { x: 0, y: 0 } },
  };
  const state = { type: 'mouse', pointer: null };

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

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', releaseAll);
  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerUp);
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  root.dataset.input = state.type;

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
    },
  };
}
