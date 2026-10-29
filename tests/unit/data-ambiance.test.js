import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { contrast, luminance, mix, parseColor } from '../../js/core/color.js';
import { renderSound, soundBytes, variantCount } from '../../js/core/synth.js';
import { KEYS } from '../../js/core/wave-splash.js';
import { SPLASH_TEXTS, VHS_TEXTS } from '../../js/game/texts.js';

// Cohérence des données du lot 2c : animation de vague, sons d'annonce, effet VHS.
const read = (f) => JSON.parse(readFileSync(`data/game/${f}.json`, 'utf8'));
const { sounds } = read('sounds');
const splash = read('splash');
const vhs = read('vhs');
const audio = read('audio');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const tokensCss = readFileSync('css/tokens.css', 'utf8');
const tokens = Object.fromEntries([...tokensCss.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const color = (name) => parseColor(tokens[name]);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

describe('mémoire et temps de rendu des sons (tous les sons)', () => {
  const timing = { essentiel: 0, fond: 0, annonce: 0 };
  let bytes = 0;
  let annonceBytes = 0;
  let count = 0;
  for (const recipe of sounds) {
    for (let v = 0; v < variantCount(recipe); v += 1) {
      const t0 = performance.now();
      const r = renderSound(recipe, v);
      const ms = performance.now() - t0;
      timing[recipe.set] += ms;
      if (recipe.category === 'annonce') {
        timing.annonce += ms;
        annonceBytes += soundBytes(r);
      }
      bytes += soundBytes(r);
      count += 1;
    }
  }

  it('total des tampons : 8 Mo au plus (valeur mesurée rapportée)', () => {
    console.info(`mémoire audio : ${(bytes / 1048576).toFixed(2)} Mo pour ${count} tampons (dont ${(annonceBytes / 1048576).toFixed(2)} Mo d'annonces)`);
    expect(bytes).toBeLessThanOrEqual(8 * 1048576);
  });

  it('les trois sons d\'annonce pèsent environ 2 Mo (1,5 à 2,5 Mo)', () => {
    expect(annonceBytes).toBeGreaterThan(1.5 * 1048576);
    expect(annonceBytes).toBeLessThan(2.5 * 1048576);
  });

  it('temps de rendu en Node : essentiel et tout (objectifs 800 et 1 500 ms ; seuil large de 4 000 ms en CI)', () => {
    const all = timing.essentiel + timing.fond;
    console.info(`rendu en Node : essentiel ${timing.essentiel.toFixed(0)} ms, fond ${timing.fond.toFixed(0)} ms, tout ${all.toFixed(0)} ms, dont annonces ${timing.annonce.toFixed(0)} ms`);
    expect(timing.essentiel).toBeLessThanOrEqual(4000);
    expect(all).toBeLessThanOrEqual(4000);
  });

  it('les trois sons d\'annonce se calculent en moins de 1 s (valeur mesurée rapportée)', () => {
    expect(timing.annonce).toBeLessThan(1000);
  });
});

describe('animation de vague : durées cohérentes avec les sons', () => {
  const duration = (id) => sounds.find((s) => s.id === id).duration;

  it('annonce : 3,8 s = 3,0 (avance) + 0,3 (tenue) + 0,5 (sortie), égale à la durée de vague-annonce', () => {
    expect(splash.leadTime + splash.debut.holdAfter + splash.debut.exit).toBeCloseTo(3.8, 9);
    expect(duration('vague-annonce')).toBeCloseTo(3.8, 9);
  });

  it('le repère sting (3,0 s) est le moment où les zombies arrivent : leadTime', () => {
    for (const id of ['vague-annonce', 'vague-renforcee']) expect(sounds.find((s) => s.id === id).markers.sting).toBe(splash.leadTime);
  });

  it('le son de la vague renforcée (4,2 s) dure au plus 0,4 s de plus que l\'animation : il n\'enjambe pas la vague suivante', () => {
    expect(duration('vague-renforcee') - (splash.leadTime + splash.debut.holdAfter + splash.debut.exit)).toBeLessThanOrEqual(0.5);
  });

  it('les sons et variantes que l\'animation demande existent dans sounds.json', () => {
    for (const [kind, spec] of Object.entries(splash.sounds)) {
      const recipe = sounds.find((s) => s.id === spec.name);
      expect(recipe, kind).toBeDefined();
      expect(variantCount(recipe), kind).toBe(spec.variants);
      expect(recipe.category).toBe('annonce');
    }
  });

  it('la fin de vague (2,65 s) est plus courte que la pause de 8 s moins l\'avance de 3 s : aucun chevauchement avec le début', () => {
    const waves = read('waves');
    const finTotal = splash.fin.enter + splash.fin.hold + splash.fin.exit;
    expect(finTotal).toBeCloseTo(2.65, 9);
    expect(finTotal).toBeLessThan(waves.intermission.between - splash.leadTime);
  });

  it('données provisoires marquées, chiffres de la spécification', () => {
    expect(splash._provisoire).toMatch(/provisoire/);
    expect([splash.shake.maxPx, splash.rgbSplit.maxPx, splash.flicker.max, splash.shake.rate]).toEqual([3, 4, 0.06, 12]);
    expect([splash.debut.scaleFrom, splash.debut.zoomHold]).toEqual([1.18, 1.04]);
  });
});

describe('contrastes de l\'animation (color.js, pire fond)', () => {
  // Pire fond : voile sombre (opacité au centre) mélangé à la couleur de sol la plus claire de la palette. « Sol » : dalles, route, trottoir,
  // herbe, terre, gravier ; les lignes de la route (--game-line) sont des traits fins, pas un fond.
  const FLOORS = ['game-floor', 'game-tile-a', 'game-tile-b', 'game-grout', 'game-asphalt', 'game-road', 'game-sidewalk', 'game-grass-a', 'game-grass-b', 'game-grass', 'game-soil', 'game-gravel', 'game-ground'];
  const lightest = FLOORS.map(color).reduce((best, c) => (luminance(c) > luminance(best) ? c : best));
  const alpha = Number(tokens['game-splash-veil-alpha']);
  const worst = mix(lightest, color('game-splash-veil'), alpha);

  it('le voile est assez opaque et la couleur de sol la plus claire est bien un sol (pas un trait)', () => {
    expect(alpha).toBeGreaterThanOrEqual(0.8);
    expect(alpha).toBeLessThanOrEqual(0.95);
    expect(luminance(lightest)).toBeLessThan(0.1);
  });

  it('titre de début (rouge sang, grand texte) : au moins 3:1', () => {
    expect(contrast(color('game-splash-title'), worst)).toBeGreaterThanOrEqual(3);
  });

  it('sous-titre « Vague renforcée » : au moins 4,5:1', () => {
    expect(contrast(color('game-splash-sub'), worst)).toBeGreaterThanOrEqual(4.5);
  });

  it('texte de fin de vague : au moins 4,5:1', () => {
    expect(contrast(color('game-splash-end'), worst)).toBeGreaterThanOrEqual(4.5);
  });

  it('sous-titre « Vie restaurée » : au moins 4,5:1', () => {
    expect(contrast(color('game-splash-end-sub'), worst)).toBeGreaterThanOrEqual(4.5);
  });

  it('même sans voile (texte posé sur le fond le plus sombre) les contrastes tiennent ; les ombres rouge et cyan sont décoratives', () => {
    expect(contrast(color('game-splash-title'), color('color-bg'))).toBeGreaterThanOrEqual(3);
    expect(tokens['game-splash-split-red']).toBeDefined();
    expect(tokens['game-splash-split-cyan']).toBeDefined();
  });
});

describe('textes et jetons du lot 2c', () => {
  it('textes game.splash.* : titres avec {n}, sous-titres sans', () => {
    expect(fr['game.splash.debut']).toContain('{n}');
    expect(fr['game.splash.fin']).toContain('{n}');
    expect(fr['game.splash.renforcee']).toBe('Vague renforcée');
    expect(fr['game.splash.vieRestauree']).toBe('Vie restaurée');
  });

  it('textes game.vhs.* : libellé et trois états (activé, coupé, désactivé en mouvement réduit)', () => {
    expect(fr['game.vhs.label']).toBe('Effet VHS');
    expect(fr['game.vhs.on']).toContain('activé');
    expect(fr['game.vhs.off']).toContain('coupé');
    expect(fr['game.vhs.reduced']).toContain('mouvement réduit');
  });

  it('les clés du cœur (wave-splash.js) et celles du jeu (texts.js) sont les mêmes et existent dans fr.json', () => {
    expect(SPLASH_TEXTS).toEqual(KEYS);
    for (const k of [...Object.values(SPLASH_TEXTS), ...Object.values(VHS_TEXTS)]) expect(fr[k], k).toBeTruthy();
  });

  it('étiquettes d\'écoute des trois sons dans fr.json', () => {
    for (const id of ['vague-annonce', 'vague-renforcee', 'vague-fin']) expect(fr[`dev.sons.etiquette.${id}`], id).toBeTruthy();
  });

  it('variables --game-splash-* et --game-vhs-* présentes, valeurs en hexadécimal, chacune commentée', () => {
    const lines = tokensCss.split('\n').filter((l) => /--game-(splash|vhs)-/.test(l));
    const names = lines.map((l) => /--(game-(?:splash|vhs)-[a-z-]+):/.exec(l)[1]);
    for (const n of ['game-splash-title', 'game-splash-sub', 'game-splash-end', 'game-splash-end-sub', 'game-splash-veil', 'game-splash-veil-alpha', 'game-splash-split-red', 'game-splash-split-cyan', 'game-splash-tear', 'game-vhs-scan', 'game-vhs-vignette', 'game-vhs-edge-red', 'game-vhs-edge-cyan', 'game-vhs-track', 'game-vhs-grain-light', 'game-vhs-grain-dark']) expect(names, n).toContain(n);
    for (const l of lines) {
      expect(l, l).toMatch(/\/\*.+\*\//);
      if (!l.includes('veil-alpha')) expect(l, l).toMatch(/--[a-z-]+:\s*#[0-9a-f]{6};/i);
    }
  });

  it('catégorie annonce : gain 0,6 provisoire, un gain par catégorie des recettes', () => {
    expect(audio.categoryGain.annonce).toBe(0.6);
    for (const s of sounds) expect(audio.categoryGain[s.category], s.id).toBeGreaterThan(0);
  });
});

describe('hygiène du lot 2c', () => {
  it('js/core/ : ni Math.random, ni Date.now, ni document, ni window, ni AudioContext, ni minuteur (wave-splash, vhs, texgen, synth)', () => {
    for (const f of ['wave-splash', 'vhs', 'texgen', 'synth', 'audio-mix', 'sound-director']) {
      const text = readFileSync(`js/core/${f}.js`, 'utf8');
      expect(text, f).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|\bwindow\b|AudioContext|setTimeout|setInterval|requestAnimationFrame|localStorage|\bfetch\s*\(/);
    }
  });

  it('aucune couleur en dur dans js/ (wave-splash, vhs compris)', () => {
    const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;
    for (const f of walk('js').filter((n) => n.endsWith('.js'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(COLOR);
  });

  it('css/game.css et jeu.html : l\'effet VHS n\'utilise ni mix-blend-mode, ni filter, ni backdrop-filter (hors commentaires), et ses trois couches suivent le canvas', () => {
    const css = readFileSync('css/game.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/mix-blend-mode|backdrop-filter|(?<![-\w])filter\s*:/);
    const html = readFileSync('jeu.html', 'utf8');
    expect(html).toMatch(/<div id="game-canvas"[^>]*><\/div>\s*<div id="vhs" class="vhs" aria-hidden="true">\s*<div class="vhs-static"><\/div>\s*<div class="vhs-grain"><\/div>\s*<div class="vhs-track"><\/div>\s*<\/div>/);
    expect(html.indexOf('id="vhs"')).toBeLessThan(html.indexOf('id="hud"'));
    expect(html.indexOf('id="hud"')).toBeLessThan(html.indexOf('id="wave-announce"'));
    expect(html).not.toMatch(/id="vhs"[^>]*data-block/);
  });

  it('aucun fichier audio, image ou police ajouté depuis main', () => {
    let added;
    try {
      added = [...execSync('git diff --name-only --diff-filter=A main', { encoding: 'utf8' }).split('\n'), ...execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).split('\n')].filter(Boolean);
    } catch {
      return; // pas de dépôt git ou de branche main : rien à comparer
    }
    expect(added.filter((f) => !f.startsWith('Docs/ref/modele-rdc/') && /\.(wav|mp3|ogg|m4a|flac|webm|aac|opus|aiff?|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot)$/i.test(f))).toEqual([]);
  });

  it('aucun fichier de plus de 5 Mo dans le dépôt', () => {
    // Exception documentée (lot 3c) : les captures du modèle 3D de Docs/ref/modele-rdc/ ne comptent pas dans le contrôle de taille.
    const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && existsSync(f) && !f.startsWith('node_modules/') && !f.startsWith('Docs/ref/modele-rdc/'));
    const big = files.filter((f) => readFileSync(f).length > 5 * 1048576);
    expect(big).toEqual([]);
  });

  it('les données du lot 2c sont du JSON valide, marquées provisoires', () => {
    for (const f of ['splash', 'vhs']) expect(read(f)._provisoire, f).toMatch(/provisoire/);
    expect(typeof vhs.enabled).toBe('boolean');
  });

  it('le workflow, index.html et Docs/seed.md sont inchangés depuis main', () => {
    let changed;
    try {
      changed = execSync('git diff --name-only main -- .github/workflows/pages.yml index.html Docs/seed.md', { encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch {
      return;
    }
    expect(changed).toEqual([]);
  });
});
