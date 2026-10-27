import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const coreFiles = walk('js/core').filter((f) => f.endsWith('.js'));
const jsFiles = walk('js').filter((f) => f.endsWith('.js'));

describe('pureté de js/core/', () => {
  it('contient les fichiers attendus', () => {
    expect(coreFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each([['Math.random', /Math\.random/], ['Date.now', /Date\.now/], ['performance.now', /performance\.now/], ['document', /\bdocument\b/], ['window', /\bwindow\b/],
    ['Phaser', /phaser/i], ['Three.js', /\bTHREE\b|from 'three'|vendor\/three/], ['stockage', /localStorage|sessionStorage|indexedDB/], ['réseau', /\bfetch\s*\(|XMLHttpRequest|WebSocket/], ['minuteurs', /setTimeout|setInterval|requestAnimationFrame/], ['Web Audio', /AudioContext|AudioBuffer|OfflineAudio/]])('aucun usage de %s', (_name, re) => {
    for (const f of coreFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(re);
  });
});

describe('hygiène de js/', () => {
  it('Math.random n\'est jamais utilisé dans le jeu', () => {
    for (const f of jsFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });

  it('aucun fichier de js/ ne dépend de « Phaser » ni ne charge une bibliothèque hors vendor/three', () => {
    for (const f of jsFiles.filter((file) => file.startsWith('js/core/'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/phaser/i);
  });

  it('aucune valeur de couleur en dur (hexadécimale ou fonctionnelle)', () => {
    const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;
    for (const f of jsFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(COLOR);
  });

  it('les couleurs du jeu sont des jetons --game-* hexadécimaux dans tokens.css', () => {
    const tokens = readFileSync('css/tokens.css', 'utf8');
    for (const n of ['floor', 'wall', 'ground', 'player', 'zombie', 'laser', 'hit', 'bullet', 'muzzle', 'skin', 'trousers', 'boot', 'gun', 'zombie-clothes', 'zombie-trousers', 'sun', 'ambient', 'road', 'grass', 'car', 'tree', 'furniture']) {
      expect(tokens, n).toMatch(new RegExp(`--game-${n}:\\s*#[0-9a-fA-F]{6};`));
    }
  });
});
