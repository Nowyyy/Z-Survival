// Préréglage graphique du chargement (lot 5b ; options au lot 5j) : une seule résolution par page (promesse partagée par le chargeur des personnages
// et main.js). data/game/graphics.json, préférence de l'appareil (zs.device.v1 : préréglage et configuration Perso, js/save/device-settings.js), ?gfx=,
// classe d'appareil (pointeur grossier, user-agent : sans identifier l'appareil) et paramètres explicites de l'adresse (ils l'emportent).
// Le vecteur effectif des options donne les réglages du chargement. Rien n'est écrit ici ; ?gfx= n'est jamais mémorisé (?gfx=perso : Perso enregistré).
// Lot 5l : canal de la page (balise <meta name="zs-canal"> de jeu.html, sans requête) et adresse filtrée (paramètres refusés pour ce canal retirés,
// Docs/ref/debug.md) : tout lecteur de l'adresse du jeu lit pageSearch(), jamais location.search.
import { effectiveOptions, explicitParams, filtrerAdresse, lireCanal, parseGraphics, presetSearch, resolvePreset } from '../core/graphics.js';
import { browserStorage, createDeviceSettings } from '../save/device-settings.js';
import { resolveMapId } from '../core/maps.js';

let ready = null;

async function boot(search) {
  const json = await fetch('data/game/graphics.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const cfg = parseGraphics(json);
  const store = createDeviceSettings({ search, storage: browserStorage() });
  const stored = store.read();
  const device = { coarse: globalThis.matchMedia?.('(pointer: coarse)').matches === true, ua: globalThis.navigator?.userAgent ?? '' };
  const resolved = resolvePreset(new URLSearchParams(search).get('gfx'), stored.graphics, device, cfg);
  const explicit = explicitParams(search);
  const effective = effectiveOptions(resolved.choice, stored.custom, explicit, device, cfg);
  const settings = effective.settings; // { preset, live, load, overridden } : pour Faible, Moyen, Élevé et Auto, exactement les réglages du lot 5b
  // Chargeur des personnages (game.js) : adresse avec la variante et le sang du préréglage, cadavres du préréglage (sauf ?sang= explicite).
  const corpses = settings.overridden.includes('cadavres') ? null : settings.live.cadavres;
  // Lot 5k : lampes (et lumières) préchargées avant la création du jeu, seulement hors de « off » (avec « off », aucun fichier de plus) ; elles sont
  // alors dans la scène dès la première image et précompilées avec le reste.
  const q = new URLSearchParams(search);
  const mapId = q.get('test') === '1' && q.get('empty') === '1' ? 'salle' : resolveMapId(search);
  const lamps = settings.live.lampes !== 'off' ? await import('./lamps.js').then((m) => m.preloadLamps(settings.live.lampes, mapId)).catch(() => null) : null;
  return { cfg, store, stored, resolved, explicit, device, effective, settings, persosSearch: presetSearch(search, settings), corpses, lamps, mapId };
}

// Canal de la page : source, dev, release, archive, prod, ou null (balise absente ou valeur inconnue : traité comme la production).
export function pageCanal(doc = globalThis.document) {
  try {
    return lireCanal(doc?.querySelector?.('meta[name="zs-canal"]')?.getAttribute('content') ?? null);
  } catch {
    return null;
  }
}

// Adresse de la page lue par le jeu (calculée une fois) : celle de la barre d'adresse sans les paramètres refusés pour le canal ; identique sur source.
let filtered = null;
export function pageSearch() {
  filtered ??= filtrerAdresse(String(globalThis.location?.search ?? ''), pageCanal());
  return filtered;
}

export function graphicsBoot(search = pageSearch()) {
  ready ??= boot(String(search).slice(0, 2000));
  return ready;
}
