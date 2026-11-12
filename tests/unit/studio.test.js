// Lot 8g : logo du studio (exception nominative au pilier des images, copie fixe dérivée par script), introduction (choix au démarrage, repère du
// retour au menu), Crédits et licences, Connexion et Profil (validations pures, statistiques, export et import réutilisés). Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CANAUX_DEBUG, PARAMS_PARTIE, PARAMS_TEST, REPERES_RETOUR, REPERE_RETOUR, acces, choixDemarrage, introAuDemarrage } from '../../js/core/graphics.js';
import { FIXE, ORIGINAL, logoFixe } from '../../scripts/studio/logo-fixe.mjs';
import { IMAGES_STUDIO, imageStudio, sha256 } from './helpers/images-studio.js';

const read = (f) => readFileSync(f, 'utf8');
const CANAUX = ['source', 'dev', 'release', 'archive', 'prod', null, 'inconnu'];

describe('logo du studio (lot 8g)', () => {
  it('original fourni : chemin, SHA-256 de la partie 0, aucun script, gestionnaire, objet étranger, image ni adresse externe ; viewBox ; ≤ 16 Ko', () => {
    expect(sha256(ORIGINAL)).toBe('1969029df4e24f796677ba06db25cf733898290fac49e38e0288dfcef19526e0');
    const svg = read(ORIGINAL);
    expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(16 * 1024);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/viewBox="-44 -84 792 556"/);
    expect(svg).not.toMatch(/<script|<foreignObject|<iframe|<image|\son[a-z]+\s*=|href|data:|@import|@font-face|font-family/i);
    // Seules adresses : les deux déclarations d'espace de noms ; seule référence : url(#band), interne.
    expect(svg.match(/https?:\/\/[^"]+/g)).toEqual(['http://www.w3.org/2000/svg', 'http://c2pa.org/manifest']);
    expect(svg.match(/url\([^)]*\)/g)).toEqual(['url(#band)']);
    expect(svg).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\.tilt\{transform:rotate\(-4deg\)\}\}/);
  });

  it('copie fixe : sortie exacte du script (état final, sans animation ni manifeste) ; mêmes formes que l\'original', () => {
    const original = read(ORIGINAL);
    const fixe = read(FIXE);
    expect(fixe).toBe(logoFixe(original));
    expect(fixe).not.toMatch(/animation|@keyframes|<metadata|c2pa|prefers-reduced-motion/);
    expect(fixe).toMatch(/<style>\.tilt\{transform:rotate\(-4deg\)\}<\/style>/);
    const formes = (s) => s.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '').replace(/\s+xmlns:c2pa="[^"]*"/, '');
    expect(formes(fixe)).toBe(formes(original));
    expect(() => logoFixe('<svg><style>a{}</style></svg>')).toThrow();
    expect(() => logoFixe('<svg></svg>')).toThrow();
  });

  it('exception nominative : ces deux chemins avec leur somme exacte seulement ; un autre chemin ou une autre somme reste refusé', () => {
    expect(Object.keys(IMAGES_STUDIO)).toEqual([ORIGINAL, FIXE]);
    for (const f of Object.keys(IMAGES_STUDIO)) expect(imageStudio(f), f).toBe(true);
    expect(imageStudio('Docs/studio/no-way-studio-logo-anime.svg')).toBe(false);
    expect(imageStudio('assets/studio/autre.svg')).toBe(false);
    expect(imageStudio('__proto__')).toBe(false);
  });

  it('servi par le build (assets/) ; jamais par la partie : aucun fichier de js/game/ ne le cite', () => {
    expect(read('scripts/build.mjs')).toMatch(/ENTRIES\.push\('assets'\)/);
    for (const f of ['js/game/main.js', 'js/game/game.js', 'js/game/ui.js']) expect(read(f), f).not.toMatch(/assets\/studio/);
  });
});

// Règle attendue, écrite à part du code : pas de menu → non ; repère #retour ou #plein-ecran → non ; ?test=1 pris en compte → seulement avec
// intro=1 pris en compte ; sinon oui.
function attendu(canal, { test, menu, partie, intro, fragment }) {
  const debug = ['source', 'dev', 'release'].includes(canal);
  const enMenu = debug && test ? menu : !(debug && partie);
  if (!enMenu) return false;
  if (['#retour', '#plein-ecran'].includes(fragment)) return false;
  if (debug && test) return intro;
  return true;
}

describe('introduction au démarrage (lot 8g)', () => {
  it('paramètre intro dans le groupe test : pris en compte sur les canaux de débogage seulement ; repères du retour', () => {
    expect(PARAMS_TEST).toContain('intro');
    for (const c of CANAUX_DEBUG) expect(acces(c, '?intro=1').params.intro, c).toBe(true);
    for (const c of ['archive', 'prod', null]) expect(acces(c, '?test=1&intro=1').params.intro, String(c)).toBe(false);
    expect(REPERE_RETOUR).toBe('#retour');
    expect(REPERES_RETOUR).toEqual(['#retour', '#plein-ecran']);
    expect(Object.isFrozen(REPERES_RETOUR)).toBe(true);
  });

  it('table complète : canaux × ?test=1 × menu=1 × intro=1 × Partie × fragment', () => {
    let rows = 0;
    for (const canal of CANAUX) {
      for (const test of [false, true]) {
        for (const menu of [false, true]) {
          for (const intro of [false, true]) {
            for (const partie of [null, 'wave', 'map']) {
              for (const fragment of ['', '#retour', '#plein-ecran', '#autre']) {
                const q = new URLSearchParams();
                if (test) q.set('test', '1');
                if (menu) q.set('menu', '1');
                if (intro) q.set('intro', '1');
                if (partie) q.set(partie, '1');
                const v = introAuDemarrage(canal, `?${q}`, fragment);
                expect(v, `${canal} ?${q} ${fragment}`).toBe(attendu(canal, { test, menu, partie, intro, fragment }));
                if (v) expect(choixDemarrage(canal, `?${q}`)).toBe('menu'); // jamais en partie directe
                rows += 1;
              }
            }
          }
        }
      }
    }
    expect(rows).toBe(CANAUX.length * 2 * 2 * 2 * 3 * 4);
  });

  it('cas usuels : lancement sans paramètre → introduction ; retour (#retour, #plein-ecran) → non ; ?test=1&menu=1 → non ; &intro=1 → oui ; partie directe → non', () => {
    expect(introAuDemarrage('source', '', '')).toBe(true);
    expect(introAuDemarrage('release', '?seed=1', '')).toBe(true);
    expect(introAuDemarrage('archive', '?test=1&intro=0', '')).toBe(true); // paramètres refusés : menu sans test, donc introduction
    expect(introAuDemarrage('dev', '', '#retour')).toBe(false);
    expect(introAuDemarrage('dev', '', '#plein-ecran')).toBe(false);
    expect(introAuDemarrage('source', '?test=1&menu=1', '')).toBe(false);
    expect(introAuDemarrage('source', '?test=1&menu=1&intro=1', '')).toBe(true);
    expect(introAuDemarrage('source', '?test=1&menu=1&intro=1', '#retour')).toBe(false);
    expect(introAuDemarrage('source', '?test=1&intro=1', '')).toBe(false); // partie directe
    for (const p of PARAMS_PARTIE) expect(introAuDemarrage('dev', `?${p}=1`, ''), p).toBe(false);
    for (const bad of [null, undefined, 42, {}]) {
      expect(() => introAuDemarrage('dev', bad, bad)).not.toThrow();
      expect(introAuDemarrage('dev', '', bad)).toBe(true);
    }
  });

  it('démarrage : demarrage.js lit le fragment, retire #retour de l\'adresse, pose #retour (ou #plein-ecran) au retour ; intro.js seulement à la demande', () => {
    const d = read('js/menu/demarrage.js');
    expect(d).toMatch(/introAuDemarrage\(pageCanal\(\), pageSearch\(\), fragment\)/);
    expect(d).toMatch(/if \(fragment === REPERE_RETOUR\) globalThis\.history\?\.replaceState/);
    expect(d).toMatch(/doc\?\.fullscreenElement \? REPERE_PLEIN_ECRAN : REPERE_RETOUR/);
    expect(d).toMatch(/avecIntro\s*\? import\('\.\/intro\.js'\)/);
    expect(d).not.toMatch(/^import .*intro\.js/m);
    // Aucune écriture dans le stockage pour l'introduction ni le repère.
    for (const f of ['js/menu/demarrage.js', 'js/menu/intro.js']) expect(read(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});
