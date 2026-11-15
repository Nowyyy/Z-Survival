// Lot 8g : textes des licences de l'écran Crédits (data/menu/licences.json), copiés depuis les fichiers déjà présents dans le dépôt, sans aucune requête :
// Three.js (vendor/three/LICENSE-three.txt, recopie de node_modules/three/LICENSE par npm run vendor:three), polices Barlow, Rubik Wet Paint et
// Rubik Dirt (fonts/LICENSE-*.txt, copiés des paquets @fontsource) ; logo de Discord (tracé de Simple Icons, CC0 : aucun fichier de licence dans le
// dépôt, avis écrit ici). Avis de droit d'auteur : les mentions « Copyright … » distinctes de chaque fichier ; texte : le fichier entier, tel quel.
//
// Usage : node scripts/studio/licences.mjs (vérifie : code 1 si data/menu/licences.json manque ou diffère) · node scripts/studio/licences.mjs --ecrire
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const SORTIE = 'data/menu/licences.json';
export const SOURCES = Object.freeze([
  Object.freeze({ id: 'three', nom: 'Three.js', role: 'Rendu 3D du jeu et des ouvertures de caisses', licence: 'Licence MIT', source: 'vendor/three/LICENSE-three.txt' }),
  Object.freeze({ id: 'barlow', nom: 'Barlow', role: 'Police du texte', licence: 'SIL Open Font License 1.1', source: 'fonts/LICENSE-Barlow-OFL.txt' }),
  Object.freeze({ id: 'rubik-wet-paint', nom: 'Rubik Wet Paint', role: 'Police du titre', licence: 'SIL Open Font License 1.1', source: 'fonts/LICENSE-Rubik-Wet-Paint-OFL.txt' }),
  Object.freeze({ id: 'rubik-dirt', nom: 'Rubik Dirt', role: 'Police des libellés', licence: 'SIL Open Font License 1.1', source: 'fonts/LICENSE-Rubik-Dirt-OFL.txt' }),
]);
export const DISCORD = Object.freeze({
  id: 'discord',
  nom: 'Logo de Discord',
  role: 'Icône du lien Discord du menu',
  licence: 'CC0 1.0 (domaine public)',
  source: 'js/menu/menu.js',
  avis: 'Tracé du jeu d\'icônes libre Simple Icons (https://simpleicons.org), versé dans le domaine public.',
  texte: 'Simple Icons : les tracés des icônes sont publiés sous la licence Creative Commons CC0 1.0 Universel (dédicace au domaine public : https://creativecommons.org/publicdomain/zero/1.0/).\n\nDiscord et son logo sont des marques de Discord Inc. Le logo sert seulement à désigner le lien vers le serveur Discord du jeu.',
});

// Mentions « Copyright <année> … » distinctes d'un texte de licence (dans l'ordre), ou de « Copyright © … » (MIT de Three.js), chacune sur une ligne.
export function avisDe(texte) {
  const vus = [];
  for (const m of texte.matchAll(/Copyright (?:©\s*)?\d{4}(?:-\d{4})?[^\n]*?(?=\s+[\w.-]+\.ttf:|\n|$)/g)) {
    const a = m[0].trim();
    if (!vus.includes(a)) vus.push(a);
  }
  return vus.join('\n');
}

export function construire(lire = (p) => readFileSync(resolve(ROOT, p), 'utf8')) {
  const licences = SOURCES.map((s) => {
    const texte = lire(s.source).replace(/\r\n/g, '\n').trimEnd();
    const avis = avisDe(texte);
    if (!avis) throw new Error(`${s.source} : aucun avis de droit d'auteur`);
    return { ...s, avis, texte };
  });
  return {
    _note: 'Écrit par node scripts/studio/licences.mjs --ecrire depuis les fichiers de licence du dépôt (aucune requête) ; ne pas modifier à la main. Lu par l\'écran Crédits (js/menu/credits.js).',
    licences: [...licences, { ...DISCORD }],
  };
}

export const texteJson = (donnees) => `${JSON.stringify(donnees, null, 2)}\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const attendu = texteJson(construire());
  if (process.argv.includes('--ecrire')) {
    writeFileSync(resolve(ROOT, SORTIE), attendu);
    console.log(`${SORTIE} écrit (${Buffer.byteLength(attendu)} octets)`);
  } else {
    let actuel = null;
    try {
      actuel = readFileSync(resolve(ROOT, SORTIE), 'utf8');
    } catch {
      // absent
    }
    if (actuel !== attendu) {
      console.error(`${SORTIE} absent ou périmé : node scripts/studio/licences.mjs --ecrire`);
      process.exit(1);
    }
    console.log(`${SORTIE} à jour`);
  }
}
