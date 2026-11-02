// Couleurs de la scène : lues dans css/tokens.css au démarrage, converties en nombres pour Phaser.
const NAMES = ['floor', 'wall', 'ground', 'player', 'zombie', 'laser', 'hit', 'bullet', 'muzzle'];
const HEX = /^#([0-9a-f]{6})$/i;

export function parseColor(text) {
  const m = HEX.exec(String(text ?? '').trim());
  return m ? parseInt(m[1], 16) : null;
}

export function toCss(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

// Renvoie { floor, wall, ... } en nombres, plus text et textShadow (texte du HUD) en chaînes CSS.
export function readPalette(root = document.documentElement) {
  const style = getComputedStyle(root);
  const read = (name) => {
    const value = parseColor(style.getPropertyValue(name));
    if (value === null) throw new Error(`Jeton de couleur illisible : ${name}`);
    return value;
  };
  const palette = Object.fromEntries(NAMES.map((n) => [n, read(`--game-${n}`)]));
  palette.dark = read('--color-bg');
  palette.text = toCss(read('--color-text'));
  palette.textShadow = toCss(palette.dark);
  palette.action = read('--color-action');
  palette.surface = read('--color-surface');
  palette.border = read('--color-border');
  return palette;
}
