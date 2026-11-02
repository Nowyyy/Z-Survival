import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createMeasures, gameView as pageView } from '../../js/atelier-personnages/measures.js';
import { createPersoTexture, persoSpec, regionFactor, REGION_KINDS } from '../../js/core/texgen-persos.js';
import { atlasRegionMeans, characters, floorMeans, gameView, load, lookup, poses, readJson, variantMetrics, floorsWithStains } from '../../scripts/personnages/lib.mjs';

// Lot 3j-B : page atelier-personnages.html : textes, hygiène, build, aperçu ; ses mesures sont celles des scripts du lot.
const html = readFileSync('atelier-personnages.html', 'utf8');
const dict = readJson('data/i18n/atelier-personnages.json');
const sources = [html, ...readdirSync('js/atelier-personnages').map((f) => readFileSync(`js/atelier-personnages/${f}`, 'utf8'))].join('\n');

describe('textes de la page (data/i18n/atelier-personnages.json)', () => {
  it('chaque clé utilisée existe (attributs data-i18n et appels t(…), préfixes dynamiques compris)', () => {
    const used = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]));
    for (const m of sources.matchAll(/\bt\('(dev\.persos[^']*)'/g)) used.add(m[1]);
    for (const k of used) expect(dict[k], k).toBeTypeOf('string');
  });
  it('chaque clé du fichier est utilisée (directement ou par un préfixe construit)', () => {
    for (const k of Object.keys(dict).filter((x) => !x.startsWith('_'))) {
      const prefix = k.slice(0, k.lastIndexOf('.') + 1);
      const used = sources.includes(`'${k}'`) || sources.includes(`"${k}"`) || sources.includes(`\`${prefix}\${`);
      expect(used, k).toBe(true);
    }
  });
  it('français seul, clés dev.persos.*, aucun texte vide', () => {
    for (const [k, v] of Object.entries(dict).filter(([x]) => !x.startsWith('_'))) {
      expect(k.startsWith('dev.persos.')).toBe(true);
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('page : hygiène', () => {
  it('lang fr, noindex, noscript, importmap locale de Three.js, aucune adresse externe', () => {
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toMatch(/<noscript>[\s\S]*<\/noscript>/);
    expect(html).toContain('"three":"./vendor/three/three.module.js"');
    expect(sources).not.toMatch(/https?:\/\//);
  });
  it('aucun identifiant en double', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('aucun stockage ni cookie dans les modules de la page', () => {
    expect(sources).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
  it('aucune couleur en dur dans la page, son style et ses scripts', () => {
    const css = readFileSync('css/atelier-personnages.css', 'utf8');
    for (const src of [css, sources]) expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/);
  });
  it('npm run build copie la page (ligne séparée de scripts/build.mjs)', () => {
    expect(readFileSync('scripts/build.mjs', 'utf8')).toContain("ENTRIES.push('atelier-personnages.html'); // lot 3j");
  });
  // Sur la branche du lot seulement : la branche d'intégration (lot 4b) garde son propre apercu.txt (jamais celui du 3j).
  it.skipIf(readFileSync('apercu.txt', 'utf8').split('\n')[0].trim() !== 'atelier-personnages.html')('apercu.txt de la branche lot-3j ouvre la page en premier', () => {
    const lines = readFileSync('apercu.txt', 'utf8').split('\n');
    expect(lines.slice(0, 3)).toEqual(['atelier-personnages.html', 'type: hifi', 'titre: Atelier des personnages']);
  });
  it('les crochets de test ne sont exposés qu\'avec ?test=1', () => {
    expect(sources).toMatch(/if \(testMode\) \{\s*window\.__zsPersos =/);
  });
});

describe('mesures de la page = mesures des scripts', () => {
  const world = readJson('data/game/maps/rez-de-chaussee/world.json');
  const camera = pageView(world, load('render'), load('camera'));
  const factors = (() => {
    const spec = persoSpec({ size: 256, tiles: 2, seed: 1 });
    const tex = createPersoTexture(spec);
    return Object.fromEntries(REGION_KINDS.map((k) => [k, regionFactor(tex, spec, k)]));
  })();
  const m = createMeasures({ characters, poses, enemies: load('enemies'), player: load('player'), lookup, floors: floorMeans(), blood: lookup('--sang-frais'), atlasMeans: atlasRegionMeans(), factors: () => factors, camera });
  it('même caméra du jeu que scripts/personnages/lib.mjs', () => expect(camera).toEqual(gameView()));
  it.each([['marcheur', 'A'], ['grand', 'C'], ['joueur', 'B'], ['petit', 'riche']])('%s %s : triangles, aire, contraste minimal identiques', (slot, variant) => {
    const page = m.v2(slot, variant);
    const ref = variantMetrics(characters.slots.find((s) => s.id === slot), characters.slots.find((s) => s.id === slot).variants.find((v) => v.id === variant), { camera, floors: floorsWithStains() });
    expect(page.stats.triangles).toBe(ref.stats.triangles);
    expect(page.sil.area).toBeCloseTo(ref.area, 9);
    expect(page.minContrast).toBeCloseTo(Math.min(...Object.values(ref.contrasts)), 6);
    expect(page.violations).toEqual([]);
  });
  it('Actuel : la page signale « hors cible » le contraste sur le béton d\'escalier (mesure de l\'état des lieux)', () => {
    const cur = m.current('marcheur');
    expect(cur.violations.map((v) => v.code)).toContain('contraste');
    expect(cur.stats.triangles).toBe(624);
  });
});
