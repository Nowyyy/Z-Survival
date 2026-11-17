// Lot 9d : adresse de la page pour le menu (démarrage allégé) : canal (balise zs-canal de jeu.html) et adresse filtrée par canal, mêmes fonctions et
// même résultat que js/game/graphics-boot.js (pageCanal, pageSearch : Docs/ref/debug.md), sans en importer le reste (préréglage graphique, carte :
// js/core/maps.js et ses dépendances, ≈ 118 Ko), que le menu n'a pas à charger avant « JOUER » ou l'écran Options.
import { filtrerAdresse, lireCanal } from '../core/graphics.js';

// Canal de la page : source, dev, release, archive, prod, ou null (balise absente ou valeur inconnue : traité comme la production).
export function pageCanal(doc = globalThis.document) {
  try {
    return lireCanal(doc?.querySelector?.('meta[name="zs-canal"]')?.getAttribute('content') ?? null);
  } catch {
    return null;
  }
}

// Adresse de la page lue par le menu (calculée une fois) : celle de la barre d'adresse sans les paramètres refusés pour le canal ; identique sur source.
let filtree = null;
export function pageSearch() {
  filtree ??= filtrerAdresse(String(globalThis.location?.search ?? ''), pageCanal());
  return filtree;
}
