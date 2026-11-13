// Lot 8g : logo du studio (exception nominative au pilier des images, copie fixe dérivée par script), introduction (choix au démarrage, repère du
// retour au menu), Crédits et licences, Connexion et Profil (validations pures, statistiques, export et import réutilisés). Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CANAUX_DEBUG, PARAMS_PARTIE, PARAMS_TEST, REPERES_RETOUR, REPERE_RETOUR, acces, choixDemarrage, introAuDemarrage } from '../../js/core/graphics.js';
import { FIXE, ORIGINAL, REGLE_FIXE, logoFixe } from '../../scripts/studio/logo-fixe.mjs';
import { ORIGINAL as NOVEN_ORIGINAL, SORTIE as NOVEN_SORTIE, copieTransparente, decoderPng, forceContour } from '../../scripts/studio/noven-transparent.mjs';
import { ARGS as ARGS_SON, ORIGINAL as SON_ORIGINAL, SORTIE as SON_SORTIE } from '../../scripts/studio/son.mjs';
import { FICHIERS_STUDIO, IMAGES_STUDIO, SONS_STUDIO, imageStudio, sha256 } from './helpers/images-studio.js';

const read = (f) => readFileSync(f, 'utf8');
const CANAUX = ['source', 'dev', 'release', 'archive', 'prod', null, 'inconnu'];

describe('logo du studio (lot 8g)', () => {
  it('original fourni (retour du propriétaire : nouvelle version calée sur le son) : chemin, SHA-256, aucun script, gestionnaire, objet étranger, image ni adresse externe ; viewBox ; ≤ 16 Ko', () => {
    expect(sha256(ORIGINAL)).toBe('4bfe9df41eac6eaf70ebdcf55a9b5686a14f0724c5d2bdcef3a21723840aa197'); // avant : 1969029d… (partie 0)
    const svg = read(ORIGINAL);
    expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(16 * 1024);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/viewBox="-20 -62 824 628"/);
    expect(svg).not.toMatch(/<script|<foreignObject|<iframe|<image|\son[a-z]+\s*=|href|data:|@import|@font-face|font-family/i);
    // Seules adresses : les deux déclarations d'espace de noms ; seule référence : url(#band), interne.
    expect(svg.match(/https?:\/\/[^"]+/g)).toEqual(['http://www.w3.org/2000/svg', 'http://c2pa.org/manifest']);
    expect(svg.match(/url\([^)]*\)/g)).toEqual(['url(#band)']);
    expect(svg).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\.tilt\{transform:rotate\(-4deg\)\}\}/);
  });

  it('copie fixe : sortie exacte du script (règle « mouvement réduit » de l\'original rendue permanente, sans manifeste) ; mêmes formes que l\'original', () => {
    const original = read(ORIGINAL);
    const fixe = read(FIXE);
    expect(fixe).toBe(logoFixe(original));
    expect(fixe).not.toMatch(/<metadata|c2pa|prefers-reduced-motion/);
    expect(REGLE_FIXE).toBe('*{animation:none!important}.tilt{transform:rotate(-4deg)}');
    expect(fixe.split(REGLE_FIXE)).toHaveLength(2); // hors de tout @media : toujours appliquée
    expect(fixe).toMatch(/\.flash\{opacity:0;/); // éléments cachés hors animation : gardés cachés
    const formes = (x) => x.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '').replace(/\s+xmlns:c2pa="[^"]*"/, '');
    expect(formes(fixe)).toBe(formes(original));
    expect(() => logoFixe('<svg><style>a{}</style></svg>')).toThrow();
    expect(() => logoFixe('<svg></svg>')).toThrow();
  });

  it('exception nominative : ces deux chemins avec leur somme exacte seulement ; un autre chemin ou une autre somme reste refusé', () => {
    expect(Object.keys(IMAGES_STUDIO)).toEqual([ORIGINAL, FIXE, NOVEN_ORIGINAL, NOVEN_SORTIE]);
    const png = readFileSync(NOVEN_ORIGINAL);
    expect([png.subarray(0, 8).toString('hex'), png.readUInt32BE(16), png.readUInt32BE(20), png.length <= 32 * 1024]).toEqual(['89504e470d0a1a0a', 480, 290, true]);
    expect(Object.keys(SONS_STUDIO)).toEqual([SON_ORIGINAL, SON_SORTIE]);
    for (const f of Object.keys(FICHIERS_STUDIO)) expect(imageStudio(f), f).toBe(true);
    expect(imageStudio('assets/studio/no-way-studio-logo-son.wav')).toBe(false);
    expect(imageStudio('Docs/studio/no-way-studio-logo-anime.svg')).toBe(false);
    expect(imageStudio('assets/studio/autre.svg')).toBe(false);
    expect(imageStudio('__proto__')).toBe(false);
  });

  it('son du logo (retour du propriétaire) : WAV d\'origine (PCM 16 bits, stéréo, 44,1 kHz, 6,8 s) non publié (Docs/) ; MP3 dérivé par scripts/studio/son.mjs (128 kbit/s, ≤ 150 Ko), publié', () => {
    const wav = readFileSync(SON_ORIGINAL);
    expect([wav.toString('ascii', 0, 4), wav.toString('ascii', 8, 12), wav.readUInt16LE(20), wav.readUInt16LE(22), wav.readUInt32LE(24), wav.readUInt16LE(34)]).toEqual(['RIFF', 'WAVE', 1, 2, 44100, 16]);
    const mp3 = readFileSync(SON_SORTIE);
    expect(mp3.length).toBeLessThanOrEqual(150 * 1024);
    expect([mp3[0], mp3[1] & 0xe0]).toEqual([0xff, 0xe0]); // trame MP3 dès le début (aucune étiquette ID3)
    expect(ARGS_SON).toEqual(expect.arrayContaining(['-i', SON_ORIGINAL, 'libmp3lame', '128k', SON_SORTIE]));
    expect(SON_ORIGINAL.startsWith('Docs/')).toBe(true); // Docs/ n'est jamais publié (build.test)
  });

  it('logo de Noven Studio (retours du propriétaire) : copie = sortie exacte du script ; fond noir extérieur transparent, fond intérieur de l\'ovale gardé, contour bleu et lettres intacts ; original non publié', () => {
    expect(readFileSync(NOVEN_SORTIE).equals(copieTransparente(readFileSync(NOVEN_ORIGINAL)))).toBe(true);
    const o = decoderPng(readFileSync(NOVEN_ORIGINAL));
    const c = decoderPng(readFileSync(NOVEN_SORTIE));
    expect([c.largeur, c.hauteur]).toEqual([480, 290]);
    const px = (img, x, y) => Array.from(img.pixels.subarray((y * img.largeur + x) * 4, (y * img.largeur + x) * 4 + 4));
    expect(px(o, 0, 0)).toEqual([0, 0, 0, 255]); // coin : noir opaque dans l'original
    for (const [x, y] of [[0, 0], [479, 289], [5, 145], [240, 3]]) expect(px(c, x, y), `${x},${y}`).toEqual([0, 0, 0, 0]); // dehors : transparent
    expect(px(c, 240, 145)[3]).toBe(255); // centre de l'ovale : fond gardé, opaque
    expect(px(c, 240, 145)).toEqual(px(o, 240, 145));
    // Hors du liseré extérieur, tout pixel gardé est identique à l'original.
    let diff = 0;
    let transparents = 0;
    for (let i = 0; i < c.pixels.length; i += 4) {
      if (c.pixels[i + 3] === 0) transparents += 1;
      else if (c.pixels[i + 3] === 255 && (c.pixels[i] !== o.pixels[i] || c.pixels[i + 1] !== o.pixels[i + 1] || c.pixels[i + 2] !== o.pixels[i + 2])) diff += 1;
    }
    expect(diff).toBe(0);
    expect(transparents).toBeGreaterThan(480 * 290 * 0.2);
    expect(transparents).toBeLessThan(480 * 290 * 0.6); // 53 % : le fond autour de l'ovale
    expect(forceContour(o.pixels)).toBeGreaterThan(150);
    expect(NOVEN_ORIGINAL.startsWith('Docs/')).toBe(true);
    expect(read('js/menu/credits.js')).toMatch(/LOGO_NOVEN = 'assets\/studio\/noven-studio-logo-transparent\.png'/);
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
    expect(d).toMatch(/intro\.then\(\(\) => import\('\.\/chargement\.js'\)\)/); // retour du propriétaire : le menu se charge après le logo
    expect(d).not.toMatch(/^import .*intro\.js/m);
    // Aucune écriture dans le stockage pour l'introduction ni le repère.
    for (const f of ['js/menu/demarrage.js', 'js/menu/intro.js']) expect(read(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    // Retour du propriétaire (barre de chargement entrevue avant « Toucher pour commencer ») : jeu.html cache l'écran de préparation dès son analyse
    // (classe posée par le script en ligne, avant les modules) ; demarrage.js ne le montre qu'en partie directe.
    const html = read('jeu.html');
    expect(html).toMatch(/<style>\.zs-attente #boot, \.zs-attente #loading \{ visibility: hidden; \}<\/style>/);
    expect(html.indexOf("classList.add('zs-attente')")).toBeLessThan(html.indexOf('<script type="module"'));
    expect(d).toMatch(/if \(!modeMenu\) \{\n {2}document\.documentElement\.classList\.remove\('zs-attente'\);/);
    // Retour du propriétaire (son du logo) : contexte audio créé seulement dans le geste (aucun son avant un geste : CLAUDE.md).
    const intro = read('js/menu/intro.js');
    expect(intro.match(/new AC\(\)/g)).toHaveLength(1);
    const geste = intro.slice(intro.indexOf('function geste()'), intro.indexOf('function passer()'));
    expect(geste).toMatch(/new AC\(\)/);
    expect(intro).toMatch(/export const SON = 'assets\/studio\/no-way-studio-logo-son\.mp3';/);
    // Retour du propriétaire (iPhone : rectangle vide avant le logo) : logo caché dès sa création, montré seulement dans affiche(), après lecture
    // et décodage de l'image ; jamais montré sans adresse.
    expect(intro.match(/logo\.hidden = (true|false)/g)).toEqual(['logo.hidden = true', 'logo.hidden = false']);
    const affiche = intro.slice(intro.indexOf('const affiche = () =>'), intro.indexOf("logo.addEventListener('error'"));
    expect(affiche).toMatch(/logo\.hidden = false;/);
    expect(intro).toMatch(/logo\.addEventListener\('load', \(\) => \{\n\s+const decodee = [^\n]*logo\.decode\(\)/);
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
    expect(credits).toMatch(/const fichier = LOGO_STUDIO_FIXE;\n {2}adresseStudio\(fichier\)/); // retour du propriétaire : logo fixe
  });
});

describe('Connexion et Profil (lot 8g)', () => {
  it('pseudo : 2 à 20 caractères Unicode, espaces des bords retirés et suites réduites, caractères de contrôle et invisibles refusés', async () => {
    const { ERREURS_PSEUDO, PSEUDO_MAX, PSEUDO_MIN, validerPseudo } = await import('../../js/menu/profil-etat.js');
    expect([PSEUDO_MIN, PSEUDO_MAX]).toEqual([2, 20]);
    expect(validerPseudo('Nowy')).toEqual({ ok: true, pseudo: 'Nowy' });
    expect(validerPseudo('  Le   Survivant  ')).toEqual({ ok: true, pseudo: 'Le Survivant' });
    expect(validerPseudo('Zoé 🧟')).toEqual({ ok: true, pseudo: 'Zoé 🧟' });
    expect(validerPseudo('ab')).toEqual({ ok: true, pseudo: 'ab' });
    expect(validerPseudo('a'.repeat(20))).toEqual({ ok: true, pseudo: 'a'.repeat(20) });
    expect(validerPseudo('🧟'.repeat(20)).ok).toBe(true); // un emoji = un caractère
    for (const [saisie, erreur] of [['', 'court'], ['a', 'court'], ['   ', 'court'], [' a ', 'court'], ['a'.repeat(21), 'long'], ['🧟'.repeat(21), 'long'],
      ['ab\ncd', 'controle'], ['ab\tcd', 'controle'], ['ab\u0000', 'controle'], ['ab\u007f', 'controle'], ['ab\u0085', 'controle'], ['a​b', 'controle'], ['a‮b', 'controle'], ['a﻿b', 'controle'],
      [null, 'court'], [undefined, 'court'], [42, 'court'], [{}, 'court']]) {
      expect(validerPseudo(saisie), JSON.stringify(saisie)).toEqual({ ok: false, erreur });
    }
    for (const k of Object.values(ERREURS_PSEUDO)) expect(JSON.parse(read('data/i18n/fr.json'))[k], k).toBeTruthy();
  });

  it('avatars (retours du propriétaire) : par défaut un personnage tout gris, puis trois d\'après le joueur, trois d\'après les zombies ; ordre de la liste (avatarSuivant) ; couleurs des personnages (jetons --perso-*)', async () => {
    const { AVATARS, avatarSuivant } = await import('../../js/menu/profil-etat.js');
    expect(AVATARS.map((a) => a.id)).toEqual(['anonyme', 'survivant', 'eclaireur', 'tireur', 'rodeur', 'ouvrier', 'affame']);
    expect(AVATARS.map((a) => a.type)).toEqual(['neutre', 'joueur', 'joueur', 'joueur', 'zombie', 'zombie', 'zombie']);
    let id = 'anonyme';
    const vus = [];
    for (let i = 0; i < AVATARS.length; i += 1) {
      id = avatarSuivant(id).id;
      vus.push(id);
    }
    expect(vus).toEqual(['survivant', 'eclaireur', 'tireur', 'rodeur', 'ouvrier', 'affame', 'anonyme']);
    expect(avatarSuivant('inconnu').id).toBe('anonyme');
    const css = read('css/menu.css');
    // Par défaut : deux gris neutres (rouge = vert = bleu), sans visage (aucun œil, aucune bouche).
    expect(css).toMatch(/\.e10-avatar-anonyme \{ --av-peau: var\(--perso-anonyme-tete\); --av-habit: var\(--perso-anonyme\); \}/);
    const tokens = read('css/tokens.css');
    for (const nom of ['--perso-anonyme', '--perso-anonyme-tete']) expect(tokens, nom).toMatch(new RegExp(`${nom}: #([0-9a-f]{2})\\1\\1;`));
    expect(read('js/menu/avatar.js')).toMatch(/if \(t === 'silhouette'\) \{\n(?:.*\n){1,3}\s+return g;\n/); // buste et tête seulement (vérifié aussi en e2e)
    for (const a of AVATARS.slice(1)) expect(css, a.id).toMatch(new RegExp(`\\.e10-avatar-${a.id} \\{ --av-peau: var\\(--perso-peau-[a-z]+\\); --av-habit: var\\(--perso-[a-z-]+\\);`));
    const fr = JSON.parse(read('data/i18n/fr.json'));
    for (const a of AVATARS) expect(fr[`game.menu.profil.avatar.${a.id}`], a.id).toBeTruthy();
    // Retour du propriétaire : petit menu de choix (groupe de boutons radio) sous le grand portrait ; « Valider » seul pose l'avatar.
    expect([fr['game.menu.profil.avatar.choix'], fr['game.menu.profil.avatar.valider'], fr['game.menu.profil.avatar.fait']]).toEqual(['Choisis ton avatar', 'Valider', 'Avatar changé : {nom}.']);
    const compte = read('js/menu/compte.js');
    expect(compte).toMatch(/role: 'radiogroup'/);
    expect(compte.match(/poserProfil\(\{ avatar/g)).toHaveLength(1); // seulement dans « Valider »
    const valider = compte.slice(compte.indexOf("choixValider.addEventListener('click'"), compte.indexOf('// Pseudo : affichage'));
    expect(valider).toMatch(/poserProfil\(\{ avatar: a\.id \}\)/);
  });

  it('en-tête (retour du propriétaire) : avatar et pseudo partagés par js/menu/avatar.js (mémoire seule, abonnés prévenus) ; réexport par profil-etat.js ; menu.js affiche portrait et pseudo', async () => {
    const av = await import('../../js/menu/avatar.js');
    const pe = await import('../../js/menu/profil-etat.js');
    expect([pe.AVATARS, pe.avatarSuivant]).toEqual([av.AVATARS, av.avatarSuivant]);
    expect(av.lireProfil()).toEqual({ avatar: 'anonyme', pseudo: null }); // retour du propriétaire : personnage tout gris par défaut
    const vus = [];
    const fin = av.suivreProfil((p) => vus.push(p));
    av.poserProfil({ pseudo: 'Nowy' });
    av.poserProfil({ avatar: 'affame' });
    fin();
    av.poserProfil({ avatar: 'anonyme', pseudo: null });
    expect(vus).toEqual([{ avatar: 'anonyme', pseudo: 'Nowy' }, { avatar: 'affame', pseudo: 'Nowy' }]);
    expect(av.lireProfil()).toEqual({ avatar: 'anonyme', pseudo: null });
    const src = read('js/menu/avatar.js');
    expect(src).not.toMatch(/localStorage|sessionStorage|fetch\(|document\.cookie/);
    const menu = read('js/menu/menu.js');
    expect(menu).toMatch(/from '\.\/avatar\.js'/);
    expect(menu).toMatch(/suivreProfil\(/);
    const fr = JSON.parse(read('data/i18n/fr.json'));
    expect(fr['game.menu.profil.entete']).toBe('Profil : {pseudo}');
    expect(fr['game.menu.profil']).toBeUndefined();
  });

  it('statistiques : lues dans la sauvegarde quand elles existent (meilleure manche, parties, argent gagné), « — » sinon ; illisible : tout à « — »', async () => {
    const { STATS_EN_ATTENTE, STATS_PROFIL, statsProfil } = await import('../../js/menu/profil-etat.js');
    const { defaultSave } = await import('../../js/core/save.js');
    expect(STATS_PROFIL).toEqual(['meilleureManche', 'tues', 'partiesHistoire', 'partiesInfini', 'temps', 'argent']); // retour du propriétaire : sans record infini
    expect(STATS_EN_ATTENTE).toEqual(['tues', 'partiesHistoire', 'partiesInfini', 'temps']);
    const save = { ...defaultSave(), money: 900, earned: 1234, records: { bestWave: 17, bestKills: 88, runs: 6, worldsCompleted: 0 } };
    const v = (lu, m) => Object.fromEntries(statsProfil(lu, m).map((s) => [s.id, s.valeur]));
    expect(v({ status: 'ok', save }, 40)).toEqual({ meilleureManche: 17, tues: null, partiesHistoire: null, partiesInfini: null, temps: null, argent: 1234 }); // records.runs : les deux modes ensemble
    expect(statsProfil({ status: 'ok', save }, 40)[0]).toEqual({ id: 'meilleureManche', valeur: 17, max: 40 });
    expect(v({ status: 'empty', save: defaultSave() })).toEqual({ meilleureManche: null, tues: null, partiesHistoire: null, partiesInfini: null, temps: null, argent: 0 });
    const vide = { meilleureManche: null, tues: null, partiesHistoire: null, partiesInfini: null, temps: null, argent: null };
    for (const lu of [{ status: 'corrupt', save }, { status: 'future', save }, { status: 'unavailable', save }, null, undefined, {}, { status: 'ok', save: null }]) expect(v(lu), JSON.stringify(lu)).toEqual(vide);
    expect(statsProfil({ status: 'ok', save }, 'x')[0].max).toBe(null);
  });

  it('export et import réutilisés : code ZS1 de encodeSave relu par decodeSave (aller-retour), code abîmé refusé avec le message de sauvegarde.html ; aperçu et confirmation de js/sauvegarde/logic.js ; aucun format nouveau', async () => {
    const { decodeSave, defaultSave, encodeSave } = await import('../../js/core/save.js');
    const { canReplace, errorKey, previewRows } = await import('../../js/sauvegarde/logic.js');
    const params = { save: JSON.parse(read('data/game/save.json')), economy: JSON.parse(read('data/game/economy.json')), stats: JSON.parse(read('data/game/player-stats.json')) };
    const save = { ...defaultSave(), money: 321, earned: 4321, records: { bestWave: 9, bestKills: 40, runs: 3, worldsCompleted: 0 } };
    const code = encodeSave(save, params);
    expect(code).toMatch(/^ZS1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    const r = decodeSave(code, params);
    expect(r.ok).toBe(true);
    expect([r.save.money, r.save.earned, r.save.records.bestWave]).toEqual([321, 4321, 9]);
    const abime = `${code.slice(0, -3)}${code.endsWith('000') ? '111' : '000'}`;
    const e = decodeSave(abime, params);
    expect([e.ok, e.error, errorKey(e.error)]).toEqual([false, 'bad-checksum', 'game.save.page.error.bad-checksum']);
    expect(decodeSave('', params).error).toBe('empty');
    expect(previewRows(defaultSave(), r.save).find((x) => x.id === 'money')).toMatchObject({ current: 0, incoming: 321, changed: true });
    expect([canReplace(true, false), canReplace(false, true), canReplace(true, true)]).toEqual([false, false, true]);
    // Le Profil n'écrit que par repository.replace, après vérification et case cochée, en décodant de nouveau le champ (comme sauvegarde.html).
    const compte = read('js/menu/compte.js');
    expect(compte).toMatch(/import \{ decodeSave, encodeSave \} from '\.\.\/core\/save\.js';/);
    expect(compte).toMatch(/import \{ canReplace, errorKey, levelRows, previewRows, recordKey, rowKey, statKey \} from '\.\.\/sauvegarde\/logic\.js';/);
    expect(compte.match(/repository\.(replace|commit|clear)\(/g)).toEqual(['repository.replace(']);
    expect(compte).toMatch(/if \(!canReplace\(verifie !== null, caseAck\.checked\)\) return;\n {6}\/\/[^\n]*\n {6}const encore = decodeSave\(zone\.value, params\);/);
    expect(compte).not.toMatch(/localStorage\.setItem|sessionStorage|indexedDB|innerHTML/);
    for (const f of ['js/menu/compte.js', 'js/menu/profil-etat.js', 'js/menu/credits.js', 'js/menu/credits-donnees.js']) expect(read(f), f).not.toMatch(/fetch\(['"`]https?:/);
  });
});
