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

// Lot 9f (Docs/ref/cache.md) : paramètres de cache, jamais des paramètres de partie ni de test : v (version des adresses du site construit),
// r (adresse unique : lien de l'accueil, rechargement) et rv (rechargement déjà fait : garde contre les boucles). Le script en ligne de jeu.html
// les retire de l'adresse avant tout module (même règle que sansParamsCache) ; ces fonctions servent aux rechargements et aux tests.
export const PARAMS_CACHE = Object.freeze(['v', 'r', 'rv']);
const nomParam = (morceau) => {
  try {
    return decodeURIComponent(morceau.split('=')[0].replace(/\+/g, ' '));
  } catch {
    return morceau.split('=')[0];
  }
};

// Chaîne de requête sans v, r ni rv ; les autres paramètres gardés octet pour octet, dans leur ordre (« ?… » ou vide).
export function sansParamsCache(search) {
  const s = typeof search === 'string' ? search.replace(/^\?/, '') : '';
  const gardes = s.split('&').filter((m) => m !== '' && !PARAMS_CACHE.includes(nomParam(m)));
  return gardes.length ? `?${gardes.join('&')}` : '';
}

// Version embarquée par le build dans jeu.html (<meta name="zs-version">, 7 caractères hexadécimaux), ou null (source, tests : aucune vérification).
export function versionEmbarquee(doc = globalThis.document) {
  try {
    const v = doc?.querySelector?.('meta[name="zs-version"]')?.getAttribute('content') ?? '';
    return /^[0-9a-f]{7}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

// Vrai si build-info.json (lu sans cache) annonce une autre version que celle de la page ; faux si l'une des deux est inconnue (aucun rechargement).
export function versionPerimee(embarquee, info) {
  const sha = typeof info?.sha === 'string' ? info.sha : '';
  return /^[0-9a-f]{7}$/.test(embarquee ?? '') && /^[0-9a-f]{7,40}$/.test(sha) && sha.slice(0, 7) !== embarquee;
}

// Adresse du rechargement vers la version déployée : même page, mêmes paramètres (sans v, r, rv), puis rv=1 (un seul rechargement) et r=<maintenant>
// (adresse jamais vue : la page ne vient pas du cache) ; fragment donné (par défaut celui de l'adresse).
export function adresseRechargement(loc, maintenant, fragment = loc?.hash ?? '') {
  const reste = sansParamsCache(loc?.search ?? '');
  const r = Number.isFinite(maintenant) ? Math.max(0, Math.floor(maintenant)) : 0;
  return `${loc?.pathname ?? ''}${reste ? `${reste}&` : '?'}rv=1&r=${r}${fragment}`;
}
