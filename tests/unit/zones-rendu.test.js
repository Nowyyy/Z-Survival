import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, luminance } from '../../js/core/color.js';
import { buildSpec, createTextureData } from '../../js/core/texgen.js';
import { SPLASH_TEXTS, ZONE_TEXTS } from '../../js/game/texts.js';
import { KEYS } from '../../js/core/wave-splash.js';
import { lookup, texturesJson } from './helpers/textures.js';

const byId = Object.fromEntries(texturesJson.textures.map((t) => [t.id, t]));
const world = readFileSync('js/game/world.js', 'utf8');
const game = readFileSync('js/game/game.js', 'utf8');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));

function mean(data, x0, y0, w, h, width) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
  }
  const n = w * h;
  return [r / n, g / n, b / n];
}

describe('rendu de la porte (lot 3c) : matière existante, lisible contre le mur', () => {
  const wall = createTextureData(buildSpec(byId.mur, lookup));
  const wallMean = mean(wall.data, 0, 0, wall.width, wall.height, wall.width);
  const atlas = createTextureData(buildSpec(byId['atlas-props'], lookup));
  const region = byId['atlas-props'].params.regions.find((r) => r.id === 'tole');
  const doorMean = mean(atlas.data, region.x, region.y, region.w, region.h, atlas.width);

  it('la porte utilise la région « tole » de l\'atlas de props (aucune nouvelle texture ni variable de teinte)', () => {
    expect(world).toMatch(/region\('tole'\)/);
    expect(readFileSync('css/tokens.css', 'utf8')).not.toMatch(/--game-door/);
    expect(texturesJson.textures.map((t) => t.id)).toEqual(['sol-salle', 'mur', 'route', 'trottoir', 'herbe', 'sol-exterieur', 'atlas-props', 'atlas-persos', 'planche']);
  });

  it('luminance de la porte contre le mur voisin : au moins 1,5:1 (color.js, moyennes des textures)', () => {
    expect(contrast(doorMean, wallMean)).toBeGreaterThanOrEqual(1.5);
    expect(luminance(doorMean)).toBeGreaterThan(luminance(wallMean));
  });

  it('un maillage par porte fermée, boîte sans dessous (10 triangles, 12 au plus), sans ombre portée ; l\'enfoncement libère la géométrie', () => {
    expect(world).toMatch(/builder\.box\(rectBox\(visual, 0, r\.hauteur - 1\)/);
    expect(world).toMatch(/cast: false, receive: true/);
    expect(world).toMatch(/mesh\.geometry\.dispose\(\)/);
    expect(world).toMatch(/\(1 - Math\.min\(1, Math\.max\(0, progress\)\)\) \*\* 2/);
    expect(world).toMatch(/Math\.max\(0\.001/);
  });

  it('le jeu ne construit pas le maillage d\'une porte ouverte au chargement (?wave=N) et retire la géométrie quand la porte a disparu', () => {
    expect(game).toMatch(/closedDoors: doorCfgs\.filter\(\(d\) => !startOpen\.includes\(d\.id\)\)/);
    expect(game).toMatch(/if \(sink >= 1\) world\.doors\.remove\(d\.id\)/);
    expect(game).toMatch(/if \(!animate\) world\.doors\.remove\(id\)/);
  });

  it('l\'enfoncement avance avec le temps de jeu (step), donc la pause le fige ; le temps vient de waves.json (doorSinkTime)', () => {
    expect(game).toMatch(/advanceDoors\(dt\)/);
    expect(game).toMatch(/doorSink = num\(cfg\.waves\.doorSinkTime, 1\.2\)/);
  });

  it('aucune couleur en dur dans le code des zones et de la porte', () => {
    for (const src of [game, world, readFileSync('js/core/zones.js', 'utf8'), readFileSync('js/game/ui.js', 'utf8')]) expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b|rgba?\(/);
  });
});

describe('textes de zone : les clés du jeu et du noyau sont les mêmes et existent dans fr.json', () => {
  it('SPLASH_TEXTS et KEYS donnent les mêmes clés de l\'annonce « zone »', () => {
    expect(SPLASH_TEXTS.zoneTitle).toBe(KEYS.zoneTitle);
    expect(SPLASH_TEXTS.zoneSubtitle).toBe(KEYS.zoneSubtitle);
    for (const k of [...Object.values(ZONE_TEXTS), SPLASH_TEXTS.zoneTitle, SPLASH_TEXTS.zoneSubtitle]) expect(fr[k], k).toBeTruthy();
  });
});
