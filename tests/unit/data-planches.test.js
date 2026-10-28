import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { contrast, parseColor } from '../../js/core/color.js';
import { createTextureData, meanColor } from '../../js/core/texgen.js';
import { FALLBACK, plankSettings, windowTriangles } from '../../js/core/plank-layout.js';
import { load } from './helpers/monde.js';
import { specs, texturesJson, tokens } from './helpers/textures.js';

const windows = load('windows');
const render = load('render');
const token = (name) => parseColor(tokens[name]);
const spec = (id) => specs.find((s) => s.id === id);
const mean = (id) => meanColor(createTextureData(spec(id)));

// Moyenne des pixels d'une région d'un atlas de props (la couleur réellement affichée d'un meuble).
function regionMean(atlasId, regionId) {
  const entry = texturesJson.textures.find((t) => t.id === atlasId);
  const r = entry.params.regions.find((x) => x.id === regionId);
  const t = createTextureData(spec(atlasId));
  let rr = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) {
    const i = (y * t.width + x) * 4;
    rr += t.data[i];
    g += t.data[i + 1];
    b += t.data[i + 2];
    n += 1;
  }
  return [rr / n, g / n, b / n];
}

describe('lot 3a : contrastes des planches (calculés avec color.js)', () => {
  const plank = token('--game-plank');
  const floors = [token('--game-floor'), token('--game-tile-a'), token('--game-tile-b')];
  const lightFloor = token('--game-tile-a');

  it('planches / mur côté intérieur : au moins 2,5 (enduit et couleur moyenne de la texture)', () => {
    expect(contrast(plank, token('--game-wall-base'))).toBeGreaterThanOrEqual(2.5);
    expect(contrast(plank, mean('mur'))).toBeGreaterThanOrEqual(2.5);
    expect(contrast(plank, token('--game-wall'))).toBeGreaterThanOrEqual(2.5);
  });

  it.each(floors.map((c, i) => [['sol', 'carrelage clair', 'carrelage sombre'][i], c]))('planches / %s de la salle : au moins 3', (_name, floor) => {
    expect(contrast(plank, floor)).toBeGreaterThanOrEqual(3);
  });

  it('planches / sol de la salle (moyenne de la texture) : au moins 3', () => {
    expect(contrast(plank, mean('sol-salle'))).toBeGreaterThanOrEqual(3);
  });

  it('planches / bois des meubles : au moins 1,8 (jeton, région « bois », région « bois-sombre »)', () => {
    expect(contrast(plank, token('--game-wood'))).toBeGreaterThanOrEqual(1.8);
    expect(contrast(plank, regionMean('atlas-props', 'bois'))).toBeGreaterThanOrEqual(1.8);
    expect(contrast(plank, regionMean('atlas-props', 'bois-sombre'))).toBeGreaterThanOrEqual(1.8);
  });

  it('planches / meubles de toutes les régions de l\'atlas utilisées (bois, tôle, caisse, colonne, étagère) : au moins 1,8', () => {
    for (const id of ['bois', 'bois-sombre', 'tole', 'caisse', 'colonne', 'etagere']) expect(contrast(plank, regionMean('atlas-props', id)), id).toBeGreaterThanOrEqual(1.8);
  });

  it('pastille pleine / sol : au moins 3 (sol le plus clair, moyenne de la texture)', () => {
    expect(contrast(token('--game-pip-on'), lightFloor)).toBeGreaterThanOrEqual(3);
    expect(contrast(token('--game-pip-on'), mean('sol-salle'))).toBeGreaterThanOrEqual(3);
  });

  it('pastille vide / pastille pleine : au moins 3 (forme et luminosité, jamais la couleur seule)', () => {
    expect(contrast(token('--game-pip-on'), token('--game-window-void'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('--game-pip-on'), token('--game-pip-off'))).toBeGreaterThanOrEqual(2);
  });

  it('couleur moyenne réelle de la texture « planche » : au moins 2,5 sur le mur et 3 sur le sol', () => {
    const real = mean('planche');
    expect(contrast(real, token('--game-wall-base'))).toBeGreaterThanOrEqual(2.5);
    expect(contrast(real, lightFloor)).toBeGreaterThanOrEqual(3);
  });
});

describe('lot 3a : jetons de couleur', () => {
  const names = ['plank', 'plank-dark', 'nail', 'frame', 'window-void', 'pip-on', 'pip-off'];
  const css = readFileSync('css/tokens.css', 'utf8');

  it.each(names)('--game-%s : hexadécimal à six chiffres, commenté', (n) => {
    expect(css).toMatch(new RegExp(`--game-${n}:\\s*#[0-9a-fA-F]{6};\\s*/\\*[^*]+\\*/`));
  });

  it('la texture « planche » n\'utilise que ces jetons', () => {
    const entry = texturesJson.textures.find((t) => t.id === 'planche');
    expect(Object.values(entry.colors).sort()).toEqual(names.map((n) => `--game-${n}`).sort());
  });
});

describe('lot 3a : textures.json et windows.json', () => {
  it('au plus 14 textures et 20 Mo ; « planche » : 128 px, hors atlas', () => {
    const { textures } = texturesJson;
    expect(textures.length).toBeLessThanOrEqual(14);
    expect(textures.reduce((sum, t) => sum + t.size * t.size * 4 * (4 / 3), 0)).toBeLessThanOrEqual(20 * 1024 * 1024);
    const planche = textures.find((t) => t.id === 'planche');
    expect(planche).toMatchObject({ size: 128, kind: 'planche-brute' });
    expect(planche.params.regions).toBeUndefined();
    expect(textures.filter((t) => t.kind === 'atlas').map((t) => t.id)).toEqual(['atlas-props', 'atlas-persos']);
  });

  it('les textures existantes ne changent pas (mêmes entrées que main)', () => {
    let before;
    try {
      before = JSON.parse(execSync('git show main:data/game/textures.json', { encoding: 'utf8' }));
    } catch {
      return; // pas de branche main : rien à comparer
    }
    expect(texturesJson.textures.filter((t) => t.id !== 'planche')).toEqual(before.textures);
    expect(texturesJson.budget).toEqual(before.budget);
  });

  it('planks3d : complet, marqué provisoire, valeurs de départ de la spécification', () => {
    const p = windows.planks3d;
    expect(p._provisoire).toBeTruthy();
    for (const k of Object.keys(FALLBACK).filter((key) => !['count', 'sill', 'lintel', 'wall'].includes(key))) expect(p, k).toHaveProperty(k);
    expect(p).toMatchObject({ thickness: 14, visible: 16, overhang: 16, wallGap: 2, rollMax: 0.12, debrisMax: 12, debrisLife: 0, pipShift: 8, debrisFade: 1, debrisNear: 40, debrisFar: 110, debrisSide: 40, debrisApart: 30, debrisMargin: 6, debrisTries: 12, pip: 16, pipLift: 0.3 });
    for (const [k, v] of Object.entries(p)) if (k !== '_provisoire') expect(Number.isFinite(v) && v >= 0, k).toBe(true);
  });

  it('les réglages lus des données valent les replis du code (aucun écart caché)', () => {
    const settings = plankSettings(windows, render);
    for (const [k, v] of Object.entries(FALLBACK)) if (k !== 'debrisLife') expect(settings[k], k).toBe(v); // la durée de vie des débris : 0 (à l'infini) dans les données, 25 s de repli
  });

  it('les valeurs de rendu utilisées : allège 16, linteau 44, mur 60', () => {
    expect([render.sillHeight, render.lintelBottom, render.wallHeight]).toEqual([16, 44, 60]);
  });

  it('les autres clés de windows.json sont inchangées depuis main (aucune règle ni valeur d\'équilibrage)', () => {
    let before;
    try {
      before = JSON.parse(execSync('git show main:data/game/windows.json', { encoding: 'utf8' }));
    } catch {
      return;
    }
    const { planks3d, ...rest } = windows;
    expect(planks3d).toBeTruthy();
    expect(rest).toEqual(before);
  });
});

describe('lot 3a : budget de dessin d\'une fenêtre', () => {
  it('au plus 42 triangles : 4 poutres × 4 (face avant et dessus), cadre 8, trou 2, 4 pastilles × 4 (carré de cadre 2 + carré intérieur 2)', () => {
    const beams = 4 * 4;
    const frame = 4 * 2;
    const hole = 2;
    const pips = 4 * (2 + 2);
    expect(beams + frame + hole + pips).toBe(42);
    expect(windowTriangles(4)).toBe(42);
  });

  it('un seul maillage et un appel de dessin par fenêtre : trois fenêtres au plus 126 triangles, débris 12 × 4 = 48', () => {
    expect(3 * windowTriangles(4)).toBe(126);
    expect(windows.planks3d.debrisMax * 4).toBe(48);
  });
});

describe('lot 3a : hygiène', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

  it('js/core/plank-layout.js : ni Math.random, Date.now, document, window, Three.js, stockage ni réseau', () => {
    const src = readFileSync('js/core/plank-layout.js', 'utf8');
    for (const re of [/Math\.random/, /Date\.now/, /\bdocument\b/, /(?<![\w.'-])window\s*[.[(]/, /\bTHREE\b|from 'three'/, /localStorage|sessionStorage/, /\bfetch\s*\(/, /performance\.now/]) expect(src).not.toMatch(re);
  });

  it('js/game/windows-mesh.js : aucune couleur en dur, aucun Math.random, aucun aléa', () => {
    const src = readFileSync('js/game/windows-mesh.js', 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|Math\.random|Date\.now/);
  });

  it('aucun fichier audio, image ou police ajouté depuis main', () => {
    let added;
    try {
      added = execSync('git diff --name-only --diff-filter=A main; git ls-files --others --exclude-standard', { encoding: 'utf8' });
    } catch {
      return;
    }
    expect(added.split('\n').filter((f) => /\.(mp3|wav|ogg|m4a|flac|png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
    expect(walk('js').filter((f) => /\.(mp3|wav|ogg|png|jpe?g|woff2?)$/i.test(f))).toEqual([]);
  });

  it('l\'atlas de props n\'est pas touché par la texture « planche » (régions identiques à main)', () => {
    let before;
    try {
      before = JSON.parse(execSync('git show main:data/game/textures.json', { encoding: 'utf8' }));
    } catch {
      return;
    }
    const get = (json) => json.textures.find((t) => t.id === 'atlas-props');
    expect(get(texturesJson)).toEqual(get(before));
  });
});
