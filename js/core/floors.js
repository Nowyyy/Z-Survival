// Étages (lot 3e) : identifiants, lecture de la liste des étages d'une carte, étage d'une entité, couche de collisions d'un étage. Pur : n'utilise que ses
// arguments, renvoie de nouveaux objets, ne modifie pas ses arguments (gelés acceptés), ne lève aucune exception sur des entrées inattendues, déterministe.
// Règle de rétrocompatibilité : toute donnée ou entité sans étage est au rez-de-chaussée (« rdc ») ; une carte sans liste d'étages n'a que ce seul étage.
export const FLOOR_IDS = Object.freeze(['rdc', 'etage']);
export const DEFAULT_FLOOR = 'rdc';
export const UPPER_FLOOR = 'etage';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Vrai si `id` est un identifiant d'étage connu.
export const isFloorId = (id) => typeof id === 'string' && FLOOR_IDS.includes(id);

// Liste des étages d'une carte (zones.json) : { floors: ['rdc'] ou ['rdc', 'etage'] (dans l'ordre canonique), multi, warnings }. Un champ absent donne le seul
// étage « rdc » ; une valeur invalide aussi, avec un avertissement ; les identifiants inconnus ou en double sont ignorés avec un avertissement ; « rdc » est
// toujours présent.
export function parseFloors(json) {
  const warnings = [];
  if (!isObject(json) || json.floors === undefined) return { floors: [DEFAULT_FLOOR], multi: false, warnings };
  if (!Array.isArray(json.floors)) {
    warnings.push('floors invalide : un seul étage (rdc)');
    return { floors: [DEFAULT_FLOOR], multi: false, warnings };
  }
  const seen = new Set();
  for (const id of json.floors) {
    if (!isFloorId(id)) warnings.push(`étage inconnu ignoré : ${typeof id === 'string' ? id : typeof id}`);
    else if (seen.has(id)) warnings.push(`étage en double ignoré : ${id}`);
    else seen.add(id);
  }
  if (!seen.has(DEFAULT_FLOOR)) warnings.push('floors sans rdc : rdc ajouté');
  seen.add(DEFAULT_FLOOR);
  const floors = FLOOR_IDS.filter((id) => seen.has(id));
  return { floors, multi: floors.length > 1, warnings };
}

// Étage d'une entité (zombie, balle, fenêtre, obstacle, point d'apparition, zone, effet…) : son champ `floor` s'il est valide, sinon « rdc ».
export const floorOf = (entity) => (isObject(entity) && isFloorId(entity.floor) ? entity.floor : DEFAULT_FLOOR);

// Deux entités sont-elles au même étage ? Chacune peut aussi être un identifiant d'étage.
export function sameFloor(a, b) {
  const f = (v) => (typeof v === 'string' ? (isFloorId(v) ? v : DEFAULT_FLOOR) : floorOf(v));
  return f(a) === f(b);
}

// Couche de l'étage demandé : layouts est { rdc, etage, … } ; un étage inconnu ou absent donne la couche du rez-de-chaussée ; null s'il n'y en a aucune.
export function layoutFor(layouts, floor) {
  if (!isObject(layouts)) return null;
  const id = isFloorId(floor) ? floor : DEFAULT_FLOOR;
  return layouts[id] ?? layouts[DEFAULT_FLOOR] ?? null;
}

// Les éléments de la liste qui sont à l'étage `floor` (même ordre, mêmes objets).
export const onFloor = (list, floor) => (Array.isArray(list) ? list : []).filter((e) => e !== null && e !== undefined && floorOf(e) === (isFloorId(floor) ? floor : DEFAULT_FLOOR));

// Applique fn au sous-ensemble de list qui est à l'étage `floor` et remet les résultats à leur place : les éléments des autres étages sont rendus tels quels
// (même objet), dans le même ordre. fn reçoit la liste filtrée et doit rendre une liste de même longueur ; sinon la liste d'origine est rendue.
export function withFloor(list, floor, fn) {
  const all = Array.isArray(list) ? list : [];
  const id = isFloorId(floor) ? floor : DEFAULT_FLOOR;
  const mine = all.filter((e) => e !== null && e !== undefined && floorOf(e) === id);
  const out = fn(mine);
  if (!Array.isArray(out) || out.length !== mine.length) return all.slice();
  let k = 0;
  return all.map((e) => (e !== null && e !== undefined && floorOf(e) === id ? out[k++] : e));
}

// L'autre étage (le seul autre d'une carte à deux étages) ; le rez-de-chaussée pour un identifiant inconnu.
export const otherFloor = (floor) => (floor === DEFAULT_FLOOR ? UPPER_FLOOR : DEFAULT_FLOOR);

// Nombre d'éléments par étage : { rdc: n, etage: n }.
export function countByFloor(list) {
  const out = Object.fromEntries(FLOOR_IDS.map((id) => [id, 0]));
  for (const e of Array.isArray(list) ? list : []) if (e !== null && e !== undefined) out[floorOf(e)] += 1;
  return out;
}
