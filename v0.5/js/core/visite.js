// Visite libre de la carte (lot 3g) : manche de départ qui ouvre toutes les portes, et liens de la page visite.html.
// Pur : ne lit ni n'écrit rien, ne lève aucune exception sur des entrées inattendues. La visite n'ajoute aucun paramètre au jeu :
// jeu.html?nospawn=1&wave=N (aucun zombie, aucune manche : directeur inactif ; portes dont openAfterWave < N ouvertes et jamais construites).
import { isNum } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Manche de la visite : la plus grande valeur d'openAfterWave des portes non `planned` (zones.json), plus 1 ; 1 si aucune porte.
export function visitWave(zones) {
  const doors = isObject(zones) && Array.isArray(zones.doors) ? zones.doors : [];
  let last = 0;
  for (const d of doors) {
    if (!isObject(d) || d.planned === true || !isNum(d.openAfterWave) || d.openAfterWave < 0) continue;
    last = Math.max(last, Math.floor(d.openAfterWave));
  }
  return last + 1;
}

// L'étage existe-t-il dans les données ? (zones.json déclare au moins deux étages, dont « etage »).
export function hasUpperFloor(zones) {
  const floors = isObject(zones) && Array.isArray(zones.floors) ? zones.floors : [];
  return floors.length > 1 && floors.some((f) => (isObject(f) ? f.id : f) === 'etage');
}

// Liens de la visite : [{ id, key (texte de fr.json), href }]. wave : manche de la visite ; upper : étage présent ; detail : ajoute la
// comparaison « sans les nouveaux détails » (?detail=0, partie C du lot).
export function visitLinks(wave, upper = false, detail = false) {
  const n = isNum(wave) && wave >= 1 ? Math.floor(wave) : 1;
  const base = `jeu.html?nospawn=1&wave=${n}`;
  const links = [
    { id: 'visite-rdc', key: 'dev.visite.rdc', href: base },
    { id: 'visite-rdc-zoom', key: 'dev.visite.rdcZoom', href: `${base}&zoom=1` },
    { id: 'visite-labels', key: 'dev.visite.labels', href: `${base}&labels=1` },
  ];
  if (upper === true) {
    links.push({ id: 'visite-etage', key: 'dev.visite.etage', href: `${base}&floor=1` });
    links.push({ id: 'visite-etage-zoom', key: 'dev.visite.etageZoom', href: `${base}&floor=1&zoom=1` });
  }
  if (detail === true) links.push({ id: 'visite-detail0', key: 'dev.visite.detail0', href: `${base}&detail=0` });
  links.push({ id: 'visite-ecarts', key: 'dev.visite.ecarts', href: 'ecarts.html' });
  return links;
}
