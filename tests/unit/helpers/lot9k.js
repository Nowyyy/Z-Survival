// Lot 9k (achat d'armes sur la carte, équilibrage : choix du propriétaire au GO) : fichiers de règles gelés par les tests d'hygiène des lots
// précédents que ce lot a le droit de changer. Chaque test d'hygiène les retire de sa liste (hors9k) ; l'équivalent est vérifié dans
// tests/unit/lot9k-gel.test.js (seules les valeurs choisies diffèrent de la base, les anciennes sont dans data/game/equilibrage-avant-9k.json).
export const PERMIS_9K = Object.freeze({
  'data/game/waves.json': 'vie des zombies (hp : hpLinearPerRound, hpExpStartRound, hpExpFactor) et texte _provisoire ; le reste inchangé',
});
export const hors9k = (list) => (Array.isArray(list) ? list.filter((f) => !Object.hasOwn(PERMIS_9K, f)) : list);
