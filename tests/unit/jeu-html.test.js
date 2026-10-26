import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('jeu.html', 'utf8');

describe('jeu.html : table d\'import et modules', () => {
  it('la table d\'import (importmap) précède tout modulepreload et tout script de module (Firefox l\'ignore sinon)', () => {
    const map = html.indexOf('type="importmap"');
    expect(map).toBeGreaterThan(-1);
    for (const re of [/rel="modulepreload"/g, /<script type="module"/g]) {
      for (const m of html.matchAll(re)) expect(m.index, String(re)).toBeGreaterThan(map);
    }
  });

  it('une seule table d\'import, qui remappe three vers vendor/three/ en chemin relatif', () => {
    expect(html.match(/type="importmap"/g)).toHaveLength(1);
    expect(html).toContain('"three":"./vendor/three/three.module.js"');
  });
});
