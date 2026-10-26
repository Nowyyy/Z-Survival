import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
// Code sans les commentaires de ligne.
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('pages du test 3D', () => {
  it('les deux pages importent la même pose.js et la même palette', () => {
    for (const f of ['js/test3d/main.js', 'js/test3d/pseudo.js']) {
      expect(read(f), f).toContain("from './pose.js'");
      expect(read(f), f).toContain("from './palette.js'");
      expect(read(f), f).toContain("from './skeleton.js'");
    }
  });

  it('la page pseudo-3D n\'importe ni Three ni Phaser', () => {
    const imports = read('js/test3d/pseudo.js').split('\n').filter((l) => l.startsWith('import '));
    expect(imports.length).toBeGreaterThan(5);
    for (const line of imports) expect(line).toMatch(/from '\.\.?\/(core\/)?[a-z]+\.js'/);
    expect(code('js/test3d/pseudo.js')).not.toMatch(/THREE|WebGLRenderer|getContext\(.webgl/);
  });

  it('pose.js, stats.js et skeleton.js sont purs (ni Three, ni DOM, ni horloge)', () => {
    for (const f of ['pose', 'stats', 'skeleton']) {
      expect(code(`js/test3d/${f}.js`), f).not.toMatch(/three|document|window|performance\.now|requestAnimationFrame|Date\./i);
    }
  });

  it('chaque page de test est noindex, avec noscript, et renvoie vers l\'autre', () => {
    const three = read('test3d/index.html');
    const pseudo = read('test3d/pseudo.html');
    for (const html of [three, pseudo]) {
      expect(html).toContain('<meta name="robots" content="noindex">');
      expect(html).toContain('<noscript>');
      expect(html).toContain('../jeu.html?fps=1');
    }
    expect(three).toContain('href="pseudo.html"');
    expect(pseudo).toContain('href="index.html"');
  });

  it('apercu.txt désigne la page Three.js et reste valide', () => {
    const lines = read('apercu.txt').split('\n');
    expect(lines[0]).toBe('test3d/index.html');
    expect(lines).toContain('type: technique');
    expect(lines).toContain('titre: Test 3D jetable');
  });
});

describe('compteur ?fps=1', () => {
  it('js/fps.js fait moins de 30 lignes, sans Phaser', () => {
    expect(read('js/fps.js').trimEnd().split('\n').length).toBeLessThan(30);
    expect(code('js/fps.js')).not.toMatch(/Phaser|import /);
  });

  it('jeu.html ne charge fps.js que si ?fps=1, et le jeu ne l\'importe pas', () => {
    const html = read('jeu.html');
    expect(html).toContain("get('fps') === '1') import('./js/fps.js')");
    expect(html).not.toMatch(/<script[^>]+src="js\/fps\.js"/);
    for (const f of ['main', 'scene', 'boot', 'ui']) expect(read(`js/game/${f}.js`), f).not.toContain('fps.js');
  });
});
