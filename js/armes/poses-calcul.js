// Lot 9c — Calcul des poses de tenue (data/armes/poses.json) : même code dans l'atelier et sous Node (test de cohérence du fichier). Une
// instance neuve du personnage par arme et par mode (pose « repos » de character-v2.js en lecture seule, puis js/armes/tenue.js).
import * as THREE from 'three';
import { createV2Kit } from '../game/character-v2.js';
import { armeParId, echelleJeu, maillageArme, sectionsBretelle } from '../core/armes/armes.js';
import { REGLES, echantillons, poserArme } from './tenue.js';

// Arme → modes calculés (le pistolet : à deux mains et à une main).
export const MODES = (arme) => (arme?.prises?.tenue === 'pistolet' ? ['deux-mains', 'une-main'] : ['deux-mains']);

// ctx : { characters, poses (poses-v2.json), donnees (lireArmes, échelle commune appliquée), regles, ids (armes à poser), lookup, corps (essai : même corps pour toutes, CORPS_LONG) }.
// Renvoie { facteur, regles, armes: { id: { pose, modes: { mode: pose calculée } } } }.
export function calculerPoses({ characters, poses, donnees, regles = REGLES, ids, lookup = () => [128, 128, 128], corps = null }) {
  const kit = createV2Kit({ characters, poses, lookup, hit: 0xffffff, choice: 'riche', styleAnim: { joueur: 'A' }, outfitsOf: { joueur: ['sable'] }, seed: 3 });
  const armes = {};
  for (const id of ids) {
    const a = armeParId(donnees, id);
    if (!a) continue;
    const points = echantillons(maillageArme(donnees, a, a.variantes[0], { pose: 'seule', sansBretelle: true }).positions);
    const bretelle = sectionsBretelle(donnees, a, a.variantes[0]);
    const modes = {};
    for (const mode of MODES(a)) {
      const perso = kit.create('player', 0, { choice: 'riche' });
      perso.setAnim('repos', 0.25, {}, 0);
      perso.root.updateMatrixWorld(true);
      modes[mode] = poserArme(perso, a, echelleJeu(donnees, a), new THREE.Group(), { points, regles, mode, bretelle, corps });
      perso.dispose();
    }
    armes[id] = { pose: a.prises.tenue, modes };
  }
  kit.dispose();
  return { facteur: donnees.echelle.lisibilite, regles, armes };
}

export const NOTE = "Lot 9c — Poses de tenue des armes (décision du propriétaire), calculées dans l'atelier sur une instance du personnage (js/armes/tenue.js, js/armes/poses-calcul.js) ; le personnage du jeu et js/game/character-v2.js ne changent pas. regles : torses essayés (degrés, épaule gauche vers l'avant), écartements des épaules (x ; 11,5 = personnage), allongements des bras et avant-bras (1,2 au plus), places de la main ou de la crosse par pose (unités du jeu ; repère du personnage ou de l'os chest). facteur : facteur commun de taille des armes pour lequel les poses valent (data/armes/armes.json → echelle.lisibilite ; le Colt M1911 a sa taille propre, ×1,2 : armes.json → taille). armes.<id>.modes.<mode> : torse (degrés), epaules, bras, arme.position (repère du personnage, arme dans l'axe de visée), angles (radians, ordre YXZ des os de character-v2.js) et controle (écarts des mains à leurs prises, points de l'arme dans la tête ou le torse, visée en degrés, bouche devant le corps ; bretelle : points de la bretelle dans un bras, une main ou le torse). arme.bretelle : sections de la bretelle déviées contre le bras (mm, repère de l'arme ; la main tient l'arme, jamais la bretelle). Données pour le lot d'intégration (dos : réservoirs du lance-flammes, décalage en mm et rotation en degrés du groupe « dos »). Ne pas modifier à la main : recalculer avec fichierPoses (mode d'emploi : Docs/ref/armes.md) ; tests/unit/armes-poses.test.js vérifie que ce fichier est à jour.";
// Armes posées : les dix (M1911, Kar98k et MG42 d'abord ; les sept autres après « OK poses » du propriétaire).
export const ARMES_POSEES = Object.freeze(['m1911', 'kar98k', 'thompson', 'winchester1897', 'garand', 'stg44', 'bar', 'mg42', 'panzerschreck', 'm2lanceflammes']);

// Contenu complet de data/armes/poses.json.
export function fichierPoses(ctx) {
  return { _note: NOTE, version: 1, ...calculerPoses({ ids: ARMES_POSEES, ...ctx }) };
}
