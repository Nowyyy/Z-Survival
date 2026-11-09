// Lot 8a : démarrage (menu ou partie directe), progression du chargement, astuce, version, onglets, nouveautés, liens, adresse du retour
// (js/core/graphics.js : choixDemarrage ; js/core/menu-etat.js). Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { CANAUX_DEBUG, PARAMS_PARTIE, PARAMS_TEST, acces, choixDemarrage } from '../../js/core/graphics.js';
import {
  ECRANS, ETAPES, MODULES_ATTENDUS, ONGLETS, POIDS, adresseRetour, avancer, basculerMenu, choisirAstuce, choisirOnglet, creerEtatMenu, creerProgression,
  fermerEcran, fermerMenu, lienExterne, nouveauteNonLue, ouvrirEcran, pourcentage, texteVersion,
} from '../../js/core/menu-etat.js';

const read = (f) => readFileSync(f, 'utf8');
const CANAUX = ['source', 'dev', 'release', 'archive', 'prod', null, 'inconnu'];

// Règle attendue, écrite à part du code : ?test=1 pris en compte (canal de débogage) → partie, sauf menu=1 ; sinon un paramètre de Partie pris en
// compte (canal de débogage) et non vide → partie ; sinon menu.
function attendu(canal, { test = false, menu = false, partie = null, vide = false } = {}) {
  const debug = ['source', 'dev', 'release'].includes(canal);
  if (debug && test) return menu ? 'menu' : 'partie';
  return debug && partie && !vide ? 'partie' : 'menu';
}

describe('démarrage (lot 8a)', () => {
  it('listes : menu dans le groupe test ; paramètres de Partie exacts (readOnlyParams, fin et empty)', () => {
    expect(PARAMS_TEST).toContain('menu');
    expect(PARAMS_PARTIE).toEqual(['wave', 'lvl', 'money', 'planks', 'floor', 'map', 'nospawn', 'endless', 'fin', 'empty']);
    expect(Object.isFrozen(PARAMS_PARTIE)).toBe(true);
    for (const c of CANAUX_DEBUG) expect(acces(c, '?menu=1').params.menu, c).toBe(true);
    for (const c of ['archive', 'prod', null]) expect(acces(c, '?test=1&menu=1').params.menu, String(c)).toBe(false);
  });

  it('table complète : canaux × ?test=1 × menu=1 × chaque paramètre de Partie (avec valeur, vide, absent)', () => {
    let rows = 0;
    for (const canal of CANAUX) {
      for (const test of [false, true]) {
        for (const menu of [false, true]) {
          for (const partie of [null, ...PARAMS_PARTIE]) {
            for (const vide of partie ? [false, true] : [false]) {
              const q = new URLSearchParams();
              if (test) q.set('test', '1');
              if (menu) q.set('menu', '1');
              if (partie) q.set(partie, vide ? '' : '1');
              q.set('v', '3');
              expect(choixDemarrage(canal, `?${q}`), `${canal} ${q}`).toBe(attendu(canal, { test, menu, partie, vide }));
              rows += 1;
            }
          }
        }
      }
    }
    expect(rows).toBe(CANAUX.length * 2 * 2 * (1 + PARAMS_PARTIE.length * 2));
  });

  it('cas usuels : sans paramètre, menu ; ?test=1, partie ; ?test=1&menu=1, menu ; ?seed=1, ?perso=B, ?gfx=faible : menu ; ?test=0 ne vaut pas test', () => {
    expect(choixDemarrage('source', '')).toBe('menu');
    expect(choixDemarrage('source', '?test=1&seed=1')).toBe('partie');
    expect(choixDemarrage('source', '?test=1&menu=1')).toBe('menu');
    expect(choixDemarrage('source', '?test=1&menu=0')).toBe('partie');
    for (const s of ['?seed=1', '?perso=B&sang=1', '?gfx=faible', '?store=local', '?v=4', '?menu=1', '?test=0&nospawn=']) expect(choixDemarrage('dev', s), s).toBe('menu');
    expect(choixDemarrage('dev', '?wave=12&nospawn=1&v=4')).toBe('partie');
    expect(choixDemarrage('release', '?fin=monde')).toBe('partie');
    expect(choixDemarrage('prod', '?test=1&wave=5')).toBe('menu'); // refusés en production
    for (const bad of [null, undefined, 42, {}]) expect(() => choixDemarrage('dev', bad)).not.toThrow();
  });
});

// Suite déterministe (LCG) pour les séquences d'avancées.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('progression du chargement (lot 8a)', () => {
  it('étapes et poids : somme 1, toutes pondérées (création du jeu hors chargement : à « JOUER »)', () => {
    expect(ETAPES).toEqual(['modules', 'donnees', 'textures', 'sons']); // la création du jeu se fait à « JOUER »
    expect(Object.values(POIDS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (const e of ETAPES) expect(POIDS[e]).toBeGreaterThan(0);
    expect(MODULES_ATTENDUS).toBeGreaterThan(100);
  });

  it('monotone, de 0 à 100, jamais au-delà ; 100 seulement quand toutes les étapes sont finies (500 séquences)', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const r = lcg(seed);
      let e = creerProgression();
      let last = pourcentage(e);
      expect(last).toBe(0);
      for (let i = 0; i < 60; i += 1) {
        const etape = r() < 0.1 ? 'inconnue' : ETAPES[Math.floor(r() * ETAPES.length)];
        const f = r() < 0.05 ? [Number.NaN, -1, 7, Infinity, undefined][Math.floor(r() * 5)] : r() * 1.2;
        e = avancer(e, etape, f);
        const n = pourcentage(e);
        expect(n).toBeGreaterThanOrEqual(last);
        expect(n).toBeLessThanOrEqual(100);
        expect(n === 100).toBe(ETAPES.every((x) => e.fractions[x] >= 1));
        last = n;
      }
      for (const x of ETAPES) e = avancer(e, x, 1);
      expect([pourcentage(e), e.pret]).toEqual([100, true]);
    }
  });

  it('une étape qui recule ne fait pas reculer la barre ; l\'ancien état n\'est pas modifié ; 99 au plus avant la fin', () => {
    const a = avancer(avancer(creerProgression(), 'textures', 0.8), 'modules', 1);
    const b = avancer(a, 'textures', 0.2);
    expect(b.fractions.textures).toBe(0.8);
    expect(pourcentage(b)).toBe(pourcentage(a));
    expect(a.fractions.sons).toBe(0);
    let c = creerProgression();
    for (const x of ETAPES.slice(0, -1)) c = avancer(c, x, 1);
    expect([pourcentage(c), c.pret]).toEqual([80, false]);
    c = avancer(c, 'sons', 0.999);
    expect(pourcentage(c)).toBe(99);
  });
});

describe('astuce, version, liens (lot 8a)', () => {
  const astuces = JSON.parse(read('data/menu/astuces.json')).astuces;

  it('astuces.json : liste non vide de phrases distinctes', () => {
    expect(astuces.length).toBeGreaterThanOrEqual(3);
    expect(new Set(astuces).size).toBe(astuces.length);
    for (const a of astuces) expect(a.trim().length, a).toBeGreaterThan(10);
  });

  it('choix déterministe avec une graine ; toutes les astuces atteintes ; liste vide ou invalide : null', () => {
    for (const g of [0, 1, 2, 77, 123456789, -5]) expect(choisirAstuce(astuces, g)).toBe(choisirAstuce(astuces, g));
    const vues = new Set();
    for (let g = 0; g < 400; g += 1) vues.add(choisirAstuce(astuces, g));
    expect(vues.size).toBe(astuces.length);
    for (const bad of [[], null, undefined, 'x', [1, '', '  ']]) expect(choisirAstuce(bad, 3)).toBe(null);
    expect(choisirAstuce(['seule'], Number.NaN)).toBe('seule');
  });

  it('version : release « Version V0.7 », dev avec le hash court, source « Arbre source », absente : rien', () => {
    expect(texteVersion({ channel: 'release', version: 'V0.7', sha: 'abcdef1' })).toEqual({ cle: 'game.menu.version', params: { v: 'V0.7' } });
    expect(texteVersion({ channel: 'archive', version: 'V0.6' })).toEqual({ cle: 'game.menu.version', params: { v: 'V0.6' } });
    expect(texteVersion({ channel: 'dev', version: 'V0.7', sha: 'abcdef1' })).toEqual({ cle: 'game.menu.version.dev', params: { sha: 'abcdef1' } });
    expect(texteVersion(JSON.parse(read('build-info.json')))).toEqual({ cle: 'game.menu.version.source', params: {} });
    for (const bad of [null, undefined, 'V0.7', {}, { channel: 'prod' }]) expect(texteVersion(bad)).toBe(null);
  });

  it('lien Discord : https seulement ; vide, autre schéma ou invalide : inactif ; liens.json vide aujourd\'hui', () => {
    expect(lienExterne('https://discord.gg/abc')).toEqual({ actif: true, adresse: 'https://discord.gg/abc' });
    for (const bad of ['', '  ', null, 42, 'http://discord.gg/x', 'javascript:alert(1)', 'discord.gg/x', 'https://']) expect(lienExterne(bad).actif, String(bad)).toBe(false);
    expect(lienExterne(JSON.parse(read('data/menu/liens.json')).discord).actif).toBe(false);
  });
});

describe('onglets, menu à trois barres, nouveautés (lot 8a, état en mémoire)', () => {
  it('onglets dans l\'ordre, Jouer au centre, Event verrouillé ; Jouer actif au départ', () => {
    expect(ONGLETS.map((o) => o.id)).toEqual(['boutique', 'personnage', 'jouer', 'infini', 'event']);
    expect(ONGLETS[2].central).toBe(true);
    expect(ONGLETS.filter((o) => o.verrouille).map((o) => o.id)).toEqual(['event']);
    expect(creerEtatMenu()).toEqual({ onglet: 'jouer', menuOuvert: false, ecran: null, lues: [] });
  });

  it('changement d\'onglet ; verrouillé ou inconnu : sans effet ; le menu à trois barres se ferme', () => {
    let e = basculerMenu(creerEtatMenu());
    expect(e.menuOuvert).toBe(true);
    e = choisirOnglet(e, 'boutique');
    expect([e.onglet, e.menuOuvert]).toEqual(['boutique', false]);
    expect(choisirOnglet(e, 'event')).toBe(e);
    expect(choisirOnglet(e, 'inconnu')).toBe(e);
    expect(fermerMenu(e)).toBe(e);
  });

  it('Information marque les nouveautés lues (point jaune absent ensuite) ; Connexion et Options ne les marquent pas ; écran inconnu : sans effet', () => {
    const infos = JSON.parse(read('data/menu/infos.json')).infos;
    expect(infos.length).toBeGreaterThan(0);
    expect(new Set(infos.map((i) => i.id)).size).toBe(infos.length);
    let e = creerEtatMenu();
    expect(nouveauteNonLue(infos, e.lues)).toBe(true);
    e = ouvrirEcran(basculerMenu(e), 'connexion', infos);
    expect([e.ecran, e.menuOuvert, nouveauteNonLue(infos, e.lues)]).toEqual(['connexion', false, true]);
    e = ouvrirEcran(fermerEcran(e), 'information', infos);
    expect([e.ecran, nouveauteNonLue(infos, e.lues)]).toEqual(['information', false]);
    expect(ouvrirEcran(e, 'boutique')).toBe(e);
    expect(ECRANS).toEqual(['information', 'connexion', 'options']);
    expect(nouveauteNonLue([], [])).toBe(false);
  });
});

describe('adresse du retour au menu (lot 8a)', () => {
  it('retire les paramètres de Partie, garde les autres dans leur ordre ; sous ?test=1, ajoute menu=1', () => {
    expect(adresseRetour('')).toBe('');
    expect(adresseRetour('?wave=40&fin=monde&vhs=0')).toBe('?vhs=0');
    expect(adresseRetour('?v=4&wave=12&nospawn=1')).toBe('?v=4');
    expect(adresseRetour('?test=1&menu=1&store=local')).toBe('?test=1&menu=1&store=local');
    expect(adresseRetour('?test=1&seed=1&nospawn=1')).toBe('?test=1&seed=1&menu=1');
    expect(adresseRetour(`?${PARAMS_PARTIE.map((n) => `${n}=1`).join('&')}`)).toBe('');
    for (const bad of [null, undefined, 42]) expect(adresseRetour(bad)).toBe('');
    // L'adresse obtenue ouvre bien le menu.
    for (const s of ['?wave=40&fin=monde', '?test=1&seed=1&nospawn=1', '?map=salle&v=2']) expect(choixDemarrage('source', adresseRetour(s)), s).toBe('menu');
  });
});

describe('hygiène du menu (lot 8a)', () => {
  const css = read('css/menu.css');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

  it('jeu.html : js/menu/demarrage.js chargé avant boot.js et main.js ; aucune autre balise de js/menu', () => {
    const html = read('jeu.html');
    const at = (s) => html.indexOf(s);
    expect(at('<script type="module" src="js/menu/demarrage.js"></script>')).toBeGreaterThan(0);
    expect(at('src="js/menu/demarrage.js"')).toBeLessThan(at('src="js/game/boot.js"'));
    expect(at('src="js/game/boot.js"')).toBeLessThan(at('src="js/game/main.js"'));
    expect(html.match(/js\/menu\//g)).toHaveLength(1);
    expect(html).not.toMatch(/css\/menu\.css/); // feuille chargée par demarrage.js en mode menu seulement
  });

  it('animations : noms propres à chaque écran (e7-*, e8-*), chacune définie une fois et utilisée ; coupées sous prefers-reduced-motion', () => {
    const defs = [...strip(css).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(defs.length).toBeGreaterThan(0);
    expect(new Set(defs).size).toBe(defs.length);
    for (const d of defs) {
      expect(d, d).toMatch(/^e[78]-/);
      expect(strip(css).split(`@keyframes ${d}`).join(''), d).toMatch(new RegExp(`animation:\\s*${d}\\b`));
    }
    const autres = readdirSync('css').filter((f) => f !== 'menu.css' && f.endsWith('.css')).flatMap((f) => [...read(`css/${f}`).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
    for (const d of defs) expect(autres, d).not.toContain(d);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.e7 \*,\s*\.e7 \{\s*animation: none !important;/);
  });

  it('ni filter, ni mix-blend-mode, ni backdrop-filter ; aucune couleur en dur ; les jetons --menu-* utilisés sont définis', () => {
    expect(strip(css)).not.toMatch(/(?<![\w-])(filter|mix-blend-mode|backdrop-filter)\s*:/);
    const tokens = read('css/tokens.css');
    for (const v of new Set([...css.matchAll(/var\((--(?:menu|rarete)-[a-z0-9-]+)/g)].map((m) => m[1]))) expect(`${tokens}${css}`, v).toMatch(new RegExp(`${v}:`));
    for (const n of ['commun', 'peu-commun', 'rare', 'epique', 'legendaire']) expect(tokens).toMatch(new RegExp(`--rarete-${n}: #[0-9a-f]{6};`));
  });

  it('textes game.menu.* : en français seulement, chacun écrit en entier dans js/menu ou js/core/menu-etat.js ; chaque clé lue existe', () => {
    const fr = JSON.parse(read('data/i18n/fr.json'));
    const en = JSON.parse(read('data/i18n/en.json'));
    const code = [...readdirSync('js/menu').map((f) => read(`js/menu/${f}`)), read('js/core/menu-etat.js')].join('\n');
    const keys = Object.keys(fr).filter((k) => k.startsWith('game.menu.'));
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) {
      expect(en[k], k).toBeUndefined();
      expect(code.includes(`'${k}'`), k).toBe(true);
    }
    for (const m of code.matchAll(/'(game\.(?:menu|pause|loading)\.[\w.]+)'/g)) expect(fr[m[1]], m[1]).toBeDefined();
  });
});
