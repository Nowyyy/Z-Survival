// Lot 9e (armes en main, corps long : prompt du lot, décisions du propriétaire) : fichiers de règles gelés par les tests d'hygiène des lots
// précédents que ce lot a le droit de changer. Chaque test d'hygiène les retire de sa liste (hors9e) ; l'équivalent est vérifié dans
// tests/unit/lot9e-gel.test.js (données : seules les clés ajoutées diffèrent de main) et tests/unit/gabarit.test.js (code : sans capsule ni
// slotMains, résultats identiques à l'ancienne règle).
export const PERMIS_9E = Object.freeze({
  'data/game/windows.json': 'slotMains ajouté (mains au mur), texte _provisoire complété',
  'data/game/enemies.json': 'rampant ajouté (capsule des rampants), texte _provisoire inchangé',
  'js/core/windows.js': 'emplacement à slotMains du nu extérieur du mur (sans slotMains : slotDistance)',
  'js/core/projectile.js': 'balle contre la capsule d\'un rampant',
  'js/core/ray.js': 'laser contre la capsule d\'un rampant',
  'js/core/combat.js': 'coup d\'un rampant : distance à sa capsule',
});
export const hors9e = (list) => (Array.isArray(list) ? list.filter((f) => !Object.hasOwn(PERMIS_9E, f)) : list);
