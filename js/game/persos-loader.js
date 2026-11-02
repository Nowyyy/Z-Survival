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
// Lot 3m : blood-fx.js (maillages et atlas du sang) n'est importé que si le sang peut servir (?sang=0 explicite : jamais).
const v2Files = (fx) => [import('./persos-runtime.js'), json('data/game/characters-v2.json'), json('data/game/poses-v2.json'), json('data/game/blood.json'), fx ? import('./blood-fx.js') : null];

export async function loadPersos(search) {
  const wanted = needsChoices(search);
  const url = readPersosParams(search); // sans la table : exact quand elle ne sert pas (perso, sang et usure dans l'adresse)
  const sang0 = /(?:^|[?&])sang=0(?:&|$)/.test(String(search ?? '').slice(0, 2000));
  const early = wanted || url.active ? Promise.all(v2Files(!sang0)) : null; // en parallèle avec la table
  early?.catch(() => null); // inutile ensuite (table absente : ancien modèle seul) : aucune promesse rejetée sans suite
  const choices = wanted ? await json('data/game/persos-choix.json').catch(() => null) : null;
  const params = readPersosParams(search, choices);
  const [pose, character] = params.actuel ? await Promise.all([import('../core/pose.js'), import('./character.js')]) : [];
  const model = params.actuel ? { computePose: pose.computePose, createKit: character.createKit, createCharacter: character.createCharacter } : v2Model;
  if (!params.active) return { params, model, attach: () => null };
  const [runtime, characters, poses, blood, fx] = await (early ?? Promise.all(v2Files(params.sang !== '0')));
  const bloodFx = params.sang === '0' ? null : fx ?? (await import('./blood-fx.js'));
  return Object.assign(runtime.createPersos(params, { characters, poses, blood, choices, bloodFx }, model), { model });
}
