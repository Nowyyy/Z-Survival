// Préréglage graphique du chargement (lot 5b ; options au lot 5j) : une seule résolution par page (promesse partagée par le chargeur des personnages
// et main.js). data/game/graphics.json, préférence de l'appareil (zs.device.v1 : préréglage et configuration Perso, js/save/device-settings.js), ?gfx=,
// classe d'appareil (pointeur grossier, user-agent : sans identifier l'appareil) et paramètres explicites de l'adresse (ils l'emportent).
// Le vecteur effectif des options donne les réglages du chargement. Rien n'est écrit ici ; ?gfx= n'est jamais mémorisé (?gfx=perso : Perso enregistré).
import { effectiveOptions, explicitParams, parseGraphics, presetSearch, resolvePreset } from '../core/graphics.js';
import { browserStorage, createDeviceSettings } from '../save/device-settings.js';

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
  return { cfg, store, stored, resolved, explicit, device, effective, settings, persosSearch: presetSearch(search, settings), corpses };
}

export function graphicsBoot(search = globalThis.location?.search ?? '') {
  ready ??= boot(String(search).slice(0, 2000));
  return ready;
}
