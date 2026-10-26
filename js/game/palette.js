// Couleurs de la scène : lues dans css/tokens.css (variables --game-*) au démarrage, sous forme de chaînes « #rrggbb ».
const NAMES = ['floor', 'wall', 'ground', 'player', 'zombie', 'laser', 'hit', 'bullet', 'muzzle', 'skin', 'trousers', 'boot', 'gun',
  'zombie-clothes', 'zombie-trousers', 'sun', 'ambient', 'road', 'grass', 'car', 'tree', 'furniture'];
const HEX = /^#[0-9a-f]{6}$/i;
const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

export function parseColor(text) {
  const value = String(text ?? '').trim();
  return HEX.test(value) ? value.toLowerCase() : null;
}

// Renvoie { floor, wall, ground, player, zombieClothes, ... } en chaînes CSS ; lève une erreur si un jeton manque.
export function readPalette(root = document.documentElement) {
  const style = getComputedStyle(root);
  return Object.fromEntries(NAMES.map((name) => {
    const value = parseColor(style.getPropertyValue(`--game-${name}`));
    if (value === null) throw new Error(`Jeton de couleur illisible : --game-${name}`);
    return [camel(name), value];
  }));
}
