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

describe('Crédits et licences (lot 8g)', () => {
  it('data/menu/credits.json : « Création » (Nowy) en tête, « Remerciements » provisoire ; note pour le propriétaire ; lecture tolérante', async () => {
    const { lireCredits } = await import('../../js/menu/credits-donnees.js');
    const brut = JSON.parse(read('data/menu/credits.json'));
    expect(brut._note).toMatch(/sans lot/);
    expect(lireCredits(brut)).toEqual([{ titre: 'Création', noms: ['Nowy'], provisoire: false }, { titre: 'Remerciements', noms: [], provisoire: true }]);
    for (const bad of [null, undefined, 42, 'x', [], {}, { sections: 'x' }, { sections: [null, 1, {}, { titre: '' }, { titre: 'Vide', noms: [] }] }]) expect(lireCredits(bad), JSON.stringify(bad)).toEqual([]);
    const hostile = lireCredits({ sections: [{ titre: `A\u0000B${'x'.repeat(100)}`, noms: ['  Bob  ', '', 7, `C\nD`, 'z'.repeat(200)] }] });
    expect(hostile[0].titre).toHaveLength(60);
    expect(hostile[0].titre.startsWith('A B')).toBe(true);
    expect(hostile[0].noms).toEqual(['Bob', 'C D', 'z'.repeat(80)]);
    const proto = JSON.parse('{"sections":[{"titre":"T","noms":["n"],"__proto__":{"provisoire":true}}]}');
    expect(lireCredits(proto)).toEqual([{ titre: 'T', noms: ['n'], provisoire: false }]);
  });

  it('data/menu/licences.json = sortie exacte de scripts/studio/licences.mjs (textes copiés des fichiers du dépôt, aucune requête) ; Three.js, trois polices, Discord', async () => {
    const { construire, texteJson, SORTIE, SOURCES } = await import('../../scripts/studio/licences.mjs');
    const { LICENCES_OBLIGATOIRES, licencesManquantes, lireLicences } = await import('../../js/menu/credits-donnees.js');
    expect(read(SORTIE)).toBe(texteJson(construire()));
    const licences = lireLicences(JSON.parse(read(SORTIE)));
    expect(licences.map((l) => l.id)).toEqual(['three', 'barlow', 'rubik-wet-paint', 'rubik-dirt', 'discord']);
    expect(LICENCES_OBLIGATOIRES).toEqual(['three', 'barlow', 'rubik-wet-paint', 'rubik-dirt', 'discord']);
    expect(licencesManquantes(licences)).toEqual([]);
    const par = Object.fromEntries(licences.map((l) => [l.id, l]));
    expect(par.three.licence).toBe('Licence MIT');
    expect(par.three.avis).toBe('Copyright © 2010-2026 three.js authors');
    expect(par.three.texte).toBe(read('node_modules/three/LICENSE').trimEnd()); // = vendor/three/LICENSE-three.txt
    expect(par.three.texte).toMatch(/^The MIT License[\s\S]*Permission is hereby granted, free of charge/);
    for (const s of SOURCES.filter((x) => x.id !== 'three')) {
      expect(par[s.id].licence, s.id).toBe('SIL Open Font License 1.1');
      expect(par[s.id].texte, s.id).toBe(read(s.source).trimEnd());
      expect(par[s.id].texte, s.id).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    }
    expect(par.barlow.avis).toBe('Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)');
    expect(par['rubik-wet-paint'].avis).toBe('Copyright 2020 The Rubik Filtered Project Authors (https://github.com/NaN-xyz/Rubik-Filtered)');
    expect(par['rubik-dirt'].avis).toBe(par['rubik-wet-paint'].avis);
    expect([par.discord.licence, par.discord.texte]).toEqual(['CC0 1.0 (domaine public)', expect.stringMatching(/Simple Icons[\s\S]*CC0 1\.0[\s\S]*marques de Discord Inc\./)]);
    expect(read('js/menu/menu.js')).toMatch(/Simple Icons, CC0/); // le tracé cité est bien celui du menu
    for (const bad of [null, {}, { licences: [{ id: 'X Y', nom: 'a', licence: 'b', avis: 'c', texte: 'd' }, { id: 'a', nom: '', licence: 'b', avis: 'c', texte: 'd' }] }]) expect(lireLicences(bad)).toEqual([]);
    expect(lireLicences({ licences: [{ id: 'a', nom: 'n', licence: 'l', avis: 'v', texte: 't' }, { id: 'a', nom: 'n2', licence: 'l', avis: 'v', texte: 't' }] }).map((l) => l.nom)).toEqual(['n']);
  });

  it('écran : chargé à la demande (aucun import statique de credits.js), textes en texte brut, zones dépliables (aria-expanded) ; roue de chargement ; entrée entre Information et Discord', () => {
    const menu = read('js/menu/menu.js');
    const credits = read('js/menu/credits.js');
    expect(menu).not.toMatch(/^import .*credits/m);
    expect(menu).toMatch(/import\('\.\/credits\.js'\)/);
    expect(menu).toMatch(/haut\.append\(li\(btOptions\), li\(btInfo\), li\(btCredits\), discordPlace\)/);
    expect(menu).toMatch(/roueDifferee\(box, \{ fixe: true, texte: t\('game\.menu\.chargement\.texte'\) \}\);\n {6}try \{\n {8}chargementCredits/);
    expect(credits).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    expect(credits).toMatch(/'aria-expanded': 'false'/);
    expect(credits).toMatch(/adresseStudio\(fichier, \{ neuve: !fixe \}\)/);
  });
});
