// Lot 8g : exception nominative décidée par le propriétaire au pilier « aucune image importée » : le logo du studio (fourni par lui, jamais retouché)
// et sa copie fixe dérivée par script (scripts/studio/logo-fixe.mjs) sont les seules images admises, chacune à ce chemin et avec cette somme SHA-256
// exactement (un autre chemin, ou le même fichier modifié, reste refusé par les garde-fous « aucune image ajoutée »).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export const IMAGES_STUDIO = Object.freeze({
  'assets/studio/no-way-studio-logo-anime.svg': '1969029df4e24f796677ba06db25cf733898290fac49e38e0288dfcef19526e0',
  'assets/studio/no-way-studio-logo-fixe.svg': 'e4daf572c179f890dd26c757aeb16a3b6e8abbef0443697a1d9d85a1f12ec43d',
});

export const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
export const imageStudio = (f) => Object.hasOwn(IMAGES_STUDIO, f) && existsSync(f) && sha256(f) === IMAGES_STUDIO[f];
// Liste de chemins sans les images du studio admises.
export const sansImagesStudio = (files) => (files ?? []).filter((f) => !imageStudio(f));
