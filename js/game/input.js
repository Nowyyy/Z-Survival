// Entrées du joueur : clavier lu par event.code (jamais event.key), donc identique en AZERTY et en QWERTY.
const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput({ onCommand = () => {} } = {}) {
  const keys = new Set();

  const keyDown = (event) => {
    if (event.code === 'KeyF' && !event.repeat) onCommand('fullscreen');
    else if (MOVE_CODES.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
  };
  const keyUp = (event) => keys.delete(event.code);
  const releaseAll = () => keys.clear();

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', releaseAll);

  return {
    // Direction voulue ; en diagonale le vecteur n'est pas normalisé ici (movement.js s'en charge).
    move() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    releaseAll,
  };
}
