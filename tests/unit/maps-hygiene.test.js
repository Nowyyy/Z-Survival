import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { plan, params } from './helpers/carte.js';

const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null; // pas de dépôt git ou de branche main : rien à comparer
  }
};
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const en = JSON.parse(readFileSync('data/i18n/en.json', 'utf8'));

describe('hygiène du lot 3b', () => {
  it.each(['js/core/maps.js', 'js/core/shape.js', 'js/core/map-svg.js'])('%s : ni Math.random, ni Date.now, ni document, ni window', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/Math\.random|Date\.now|\bdocument\b|(?<![\w.'-])window\s*[.[(]/);
  });

  it('clés « dev.carte.* » de fr.json : toutes utilisées par carte.html ou js/carte/main.js, aucune en anglais', () => {
    const sources = readFileSync('carte.html', 'utf8') + readFileSync('js/carte/main.js', 'utf8');
    const keys = Object.keys(fr).filter((k) => k.startsWith('dev.carte.'));
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(sources.includes(k), k).toBe(true);
    expect(Object.keys(en).filter((k) => k.startsWith('dev.carte.'))).toEqual([]);
  });

  it('aucun fichier audio, image ou police ajouté par le lot', () => {
    const added = git('diff --name-only --diff-filter=A main');
    if (added === null) return;
    const files = [...added, ...(git('ls-files --others --exclude-standard') ?? [])];
    expect(files.filter((f) => /\.(png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|flac|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
  });

  it('data/game/world.json et decor.json d\'origine sont inchangés (git diff vide)', () => {
    const changed = git('diff --name-only main -- data/game/world.json data/game/decor.json');
    if (changed === null) return;
    expect(changed).toEqual([]);
  });

  it('règles de tir, vagues, statistiques, chutes, caméra, textures et sons inchangées (git diff vide)', () => {
    const changed = git('diff --name-only main -- js/core/waves.js js/core/wave-director.js js/core/wave-splash.js js/core/vhs.js js/core/projectile.js js/core/ray.js js/core/spread.js js/core/player-stats.js js/core/camera.js js/core/synth.js data/game/waves.json data/game/gaits.json data/game/weapons.json data/game/player-stats.json data/game/player-down.json data/game/windows.json data/game/textures.json data/game/sounds.json');
    if (changed === null) return;
    expect(changed).toEqual([]);
  });

  it('plan.json ne contient que des pixels : aucune clé d\'unité de jeu, tout tient dans la boîte englobante', () => {
    expect(JSON.stringify(plan)).not.toMatch(/scale|margin|wallThickness|hauteur|size"/);
    const { x0, y0, x1, y1 } = plan.bbox;
    for (const [x, y] of [...plan.contour, ...plan.pillars, plan.start]) {
      expect(x).toBeGreaterThanOrEqual(x0);
      expect(x).toBeLessThanOrEqual(x1);
      expect(y).toBeGreaterThanOrEqual(y0);
      expect(y).toBeLessThanOrEqual(y1);
    }
    expect(plan._provisoire).toBeTypeOf('string');
    expect(params._provisoire).toBeTypeOf('string');
  });

  it('les fichiers générés sont marqués provisoires et générés', () => {
    for (const f of ['world', 'decor']) {
      const data = JSON.parse(readFileSync(`data/game/maps/rez-de-chaussee/${f}.json`, 'utf8'));
      expect(data._provisoire).toMatch(/npm run carte/);
    }
  });

  it('carte.html : noindex, noscript, aucune ressource externe ; css/carte.css : aucune couleur en dur', () => {
    const html = readFileSync('carte.html', 'utf8');
    expect(html).toMatch(/<meta name="robots" content="noindex">/);
    expect(html).toMatch(/<noscript>/);
    expect(html).not.toMatch(/(?:src|href)="https?:/);
    expect(readFileSync('css/carte.css', 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('npm run carte et npm run build : script déclaré, carte.html copiée', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.carte).toBe('node scripts/plan-vers-monde.mjs');
    expect(readFileSync('scripts/build.mjs', 'utf8')).toContain("'carte.html'");
    expect(existsSync('data/game/maps/rez-de-chaussee/world.json')).toBe(true);
  });

  it('aucune dépendance d\'exécution ajoutée', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {}).toEqual({});
  });
});
