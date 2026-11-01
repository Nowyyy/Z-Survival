// Pack de sons d'avant le lot 3i (recettes remplacées par les sons de l'atelier) : chargé seulement avec ?sons=ancien, par import dynamique
// depuis sound-loader.js et audio.js. Par défaut, ni ce module ni data/game/sounds-legacy.json ne sont demandés.
let promise = null;
export function loadLegacySounds() {
  promise ??= fetch('data/game/sounds-legacy.json').then((r) => {
    if (!r.ok) throw new Error(`sounds-legacy.json : ${r.status}`);
    return r.json();
  }).then((d) => (Array.isArray(d?.sounds) ? d.sounds : []));
  return promise;
}
