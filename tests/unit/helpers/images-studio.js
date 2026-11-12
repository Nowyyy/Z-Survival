// Lot 8g : exception nominative décidée par le propriétaire aux piliers « aucune image importée » et « aucun fichier audio » : le logo du studio
// (fourni par lui, jamais retouché) et sa copie fixe dérivée par script (scripts/studio/logo-fixe.mjs) ; retour du propriétaire : le son du logo
// (WAV d'origine, non publié, et sa copie MP3 dérivée par scripts/studio/son.mjs). Seuls admis, chacun à ce chemin et avec cette somme SHA-256
// exactement (un autre chemin, ou le même fichier modifié, reste refusé par les garde-fous « aucune image ni aucun son ajouté »).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export const IMAGES_STUDIO = Object.freeze({
  'assets/studio/no-way-studio-logo-anime.svg': '4bfe9df41eac6eaf70ebdcf55a9b5686a14f0724c5d2bdcef3a21723840aa197',
  'assets/studio/no-way-studio-logo-fixe.svg': 'd8244715dbf08381c329a8f8cc4f22612f4ce6c4ddcd8fc91c6cfe990666fd6b',
  // Retour du propriétaire : logo de Noven Studio (PNG fourni par lui, non publié) et sa copie transparente dérivée par
  // scripts/studio/noven-transparent.mjs (affichée dans les Crédits).
  'Docs/studio/noven-studio-logo.png': '5d9798611ee8d0d8ca98d681a3a6b6e6544cb5e3f38fe8145c606b753e678718',
  'assets/studio/noven-studio-logo-transparent.png': 'f827c6cdc287eaf64e8488fef7623ef0083f0b1855e42252918d32cac62206dd',
});
export const SONS_STUDIO = Object.freeze({
  'Docs/studio/no-way-studio-logo-son.wav': 'a78cfd56ddb94f9bc6801dd7e2a917a7b7ca5077a0928062394fff7722556256',
  'assets/studio/no-way-studio-logo-son.mp3': '9c162310c6bea51562e3948fe8e83b6b8e4dd91eaa0427f3afda3163cff30af8',
});
export const FICHIERS_STUDIO = Object.freeze({ ...IMAGES_STUDIO, ...SONS_STUDIO });

export const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
// Fichier du studio admis (image ou son) : chemin exact et somme exacte.
export const imageStudio = (f) => Object.hasOwn(FICHIERS_STUDIO, f) && existsSync(f) && sha256(f) === FICHIERS_STUDIO[f];
export const fichierStudio = imageStudio;
// Liste de chemins sans les fichiers du studio admis.
export const sansImagesStudio = (files) => (files ?? []).filter((f) => !imageStudio(f));
