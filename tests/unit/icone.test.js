import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Icône du site (lot 4, demande du propriétaire) : « Z » en lettres de sang, écrite en adresses data: PNG dans les pages (aucun fichier image) par scripts/icone.mjs.
const PAGES = ['index.html', 'dev/index.html', 'jeu.html'];
const link = (html, rel) => new RegExp(`<link rel="${rel}"[^>]*href="data:image/png;base64,([A-Za-z0-9+/=]+)"`).exec(html)?.[1];
const dims = (b64) => {
  const png = Buffer.from(b64, 'base64');
  return { signature: png.subarray(0, 8).toString('hex'), width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
};

describe.each(PAGES)('icône de %s', (file) => {
  const html = readFileSync(file, 'utf8');

  it('apple-touch-icon : PNG de 180 × 180 en adresse data:', () => {
    const d = dims(link(html, 'apple-touch-icon'));
    expect(d.signature).toBe('89504e470d0a1a0a');
    expect([d.width, d.height]).toEqual([180, 180]);
    expect(d.bytes).toBeLessThan(20_000);
  });

  it('icône d\'onglet : PNG de 48 × 48 en adresse data:', () => {
    const d = dims(link(html, 'icon'));
    expect(d.signature).toBe('89504e470d0a1a0a');
    expect([d.width, d.height]).toEqual([48, 48]);
  });

  it('une seule icône de chaque sorte, aucune requête externe', () => {
    expect(html.match(/rel="apple-touch-icon"/g)).toHaveLength(1);
    expect(html.match(/rel="icon"/g)).toHaveLength(1);
    expect(html).not.toMatch(/(?:href|src)="https?:\/\//);
  });
});

describe('scripts/icone.mjs', () => {
  const script = readFileSync('scripts/icone.mjs', 'utf8');

  it('lit ses couleurs dans css/tokens.css (aucune couleur en dur) et n\'ajoute aucun fichier au dépôt', () => {
    expect(script).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?!\])/);
    expect(script).toContain("token('color-bg')");
    expect(script).toContain("token('color-action')");
  });
});
