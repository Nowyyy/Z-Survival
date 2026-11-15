import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// Lot 8l : js/lots.js (parseLot, compareLots, parseEntry) n'était plus importé par aucune page ni aucun script depuis le retrait du journal de /dev
// (lot 5g-B) ; il est retiré avec ses tests de logique pure (parseLot, compareLots, parseEntry, liste des exports : 14 assertions). Restent les
// gardes sur les fichiers vivants : apercu.txt (première ligne = page d'aperçu valide, ligne « nom: ») et scripts/assemble.mjs.
const PAGE_APERCU = /^[A-Za-z0-9._/-]+$/; // règle de l'ancien parseEntry : caractères sûrs, sans « .. » ni « / » initial
const pageApercu = (text) => {
  const first = text.split(/\r?\n/, 1)[0].trim();
  return PAGE_APERCU.test(first) && !first.includes('..') && !first.startsWith('/') ? first : '';
};

// Lot 4c : aperçus par lot retirés du site (lots.json n'est plus produit) ; apercu.txt reste dans le dépôt, première ligne et ligne « nom: » inchangées.
describe('après le retrait des aperçus par lot (lot 4c)', () => {
  it('js/lots.js retiré (lot 8l : module mort)', () => {
    expect(existsSync('js/lots.js')).toBe(false);
  });

  it('apercu.txt : page jeu.html, ligne « nom: V0.5 » conservée', () => {
    const text = readFileSync('apercu.txt', 'utf8');
    expect(pageApercu(text)).toBe('jeu.html');
    expect(text.split(/\r?\n/)).toContain('nom: V0.5');
  });

  it('scripts/assemble.mjs ne produit plus lots.json ni de dossier lots/lot-*', () => {
    const src = readFileSync('scripts/assemble.mjs', 'utf8');
    expect(src).not.toMatch(/writeFileSync\([^)]*lots\.json/);
    expect(src).not.toContain('js/lots.js');
    expect(src).toMatch(/const FOREIGN = \[[^\]]*'lots', 'lots\.json'/); // lot 5g : retirés de chaque build copié (avant : rmSync(join(out, 'lots.json')))
  });
});
