// Couleurs de la scène : lues dans css/tokens.css (variables --game-*) au démarrage. readPalette donne des chaînes « #rrggbb » pour
// Three.js ; tokenColor donne un tableau [r, g, b] pour les générateurs de textures (js/core/texgen.js).
import { parseColor, toHex } from '../core/color.js';

const NAMES = ['floor', 'wall', 'ground', 'player', 'zombie', 'laser', 'hit', 'bullet', 'muzzle', 'skin', 'trousers', 'boot', 'gun',
  'zombie-clothes', 'zombie-trousers', 'sun', 'ambient', 'fog', 'void', 'stairs-mark', 'road', 'grass', 'car', 'tree', 'furniture'];
const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

// Renvoie { floor, wall, ground, player, zombieClothes, ... } en chaînes CSS ; lève une erreur si un jeton manque.
export function readPalette(root = document.documentElement) {
  const style = getComputedStyle(root);
  return Object.fromEntries(NAMES.map((name) => {
    const value = parseColor(style.getPropertyValue(`--game-${name}`));
    if (value === null) throw new Error(`Jeton de couleur illisible : --game-${name}`);
    return [camel(name), toHex(value)];
  }));
}

// Renvoie jeton (« --game-wood ») -> [r, g, b], ou null si le jeton est absent ou illisible.
export function createTokenLookup(root = document.documentElement) {
  const style = getComputedStyle(root);
  return (token) => parseColor(style.getPropertyValue(String(token)));
}
