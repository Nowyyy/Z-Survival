// Couleurs du test 3D : lues dans css/tokens.css (variables --t3d-*) au démarrage, sous forme de chaînes CSS.
const NAMES = ['bg', 'floor-a', 'floor-b', 'grout', 'stain', 'wall', 'wall-top', 'furniture-a', 'furniture-b', 'furniture-c', 'skin', 'outfit', 'trousers', 'boot', 'gun',
  'zombie-skin', 'zombie-clothes', 'zombie-trousers', 'laser', 'bullet', 'sun', 'ambient', 'fog', 'highlight', 'shade'];
const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

export function readPalette(root = document.documentElement) {
  const style = getComputedStyle(root);
  const palette = {};
  for (const name of NAMES) {
    const value = style.getPropertyValue(`--t3d-${name}`).trim();
    if (!value) throw new Error(`Jeton de couleur manquant : --t3d-${name}`);
    palette[camel(name)] = value;
  }
  return palette;
}
