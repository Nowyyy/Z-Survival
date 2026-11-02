// Chargeur des personnages et du sang (lots 3j et 3m), importé par game.js. Par défaut (?perso=choix), il lit la table des choix
// (data/game/persos-choix.json) en même temps que le module d'exécution v2 et ses données ; l'ancien modèle (js/core/pose.js,
// js/game/character.js) n'est importé que si un personnage est « actuel » (?perso=actuel ou table). ?perso=actuel&sang=0 : rien d'autre.
import { needsChoices, readPersosParams } from './persos-params.js';

const json = (path) => fetch(path).then((r) => {
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
});
const NO_POSE = Object.freeze({}); // personnages v2 : la pose v1 n'est pas calculée (setPose lit l'entrée de la pose)
const v2Model = { computePose: () => NO_POSE, createKit: ({ variants }) => ({ variants: variants.zombie.variants }), createCharacter: (kit, kind, variant) => kit.v2.create(kind, variant) };
const v2Files = () => [import('./persos-runtime.js'), json('data/game/characters-v2.json'), json('data/game/poses-v2.json'), json('data/game/blood.json')];

export async function loadPersos(search) {
  const wanted = needsChoices(search);
  const early = wanted || readPersosParams(search).active ? Promise.all(v2Files()) : null; // en parallèle avec la table
  early?.catch(() => null); // inutile ensuite (table absente : ancien modèle seul) : aucune promesse rejetée sans suite
  const choices = wanted ? await json('data/game/persos-choix.json').catch(() => null) : null;
  const params = readPersosParams(search, choices);
  const [pose, character] = params.actuel ? await Promise.all([import('../core/pose.js'), import('./character.js')]) : [];
  const model = params.actuel ? { computePose: pose.computePose, createKit: character.createKit, createCharacter: character.createCharacter } : v2Model;
  if (!params.active) return { params, model, attach: () => null };
  const [runtime, characters, poses, blood] = await (early ?? Promise.all(v2Files()));
  return Object.assign(runtime.createPersos(params, { characters, poses, blood, choices }, model), { model });
}
