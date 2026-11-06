// Chargeur des personnages et du sang (lots 3j et 3m), importé par game.js. Par défaut (?perso=choix), il lit la table des choix
// (data/game/persos-choix.json) en même temps que le module d'exécution v2 et ses données. Lot 5e : l'ancien modèle (pose.js, character.js)
// est retiré ; tout personnage est un personnage v2 (table absente ou variante inconnue : variante A).
import { needsChoices, readPersosParams } from './persos-params.js';

const json = (path) => fetch(path).then((r) => {
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
});
const NO_POSE = Object.freeze({}); // personnages v2 : la pose v1 n'est pas calculée (setPose lit l'entrée de la pose)
export const v2Model = { computePose: () => NO_POSE, createKit: ({ variants }) => ({ variants: variants.zombie.variants }), createCharacter: (kit, kind, variant) => kit.v2.create(kind, variant) };
// Lot 3m : blood-fx.js (maillages et atlas du sang) n'est importé que si le sang peut servir (?sang=0 explicite : jamais).
const v2Files = (fx) => [import('./persos-runtime.js'), json('data/game/characters-v2.json'), json('data/game/poses-v2.json'), json('data/game/blood.json'), fx ? import('./blood-fx.js') : null];

export async function loadPersos(search, { corpses = null } = {}) { // lot 5b : corpses = cadavres du préréglage graphique (null : blood.json)
  const wanted = needsChoices(search);
  const url = readPersosParams(search); // sans la table : exact quand elle ne sert pas (perso, sang et usure dans l'adresse)
  const sang0 = /(?:^|[?&])sang=0(?:&|$)/.test(String(search ?? '').slice(0, 2000));
  const early = wanted || url.active ? Promise.all(v2Files(!sang0)) : null; // en parallèle avec la table
  early?.catch(() => null); // aucune promesse rejetée sans suite
  const choices = wanted ? await json('data/game/persos-choix.json').catch(() => null) : null;
  const params = readPersosParams(search, choices);
  const model = v2Model;
  if (!params.active) return { params, model, attach: () => null };
  const [runtime, characters, poses, blood, fx] = await (early ?? Promise.all(v2Files(params.sang !== '0')));
  if (Number.isInteger(corpses) && blood?.levels?.[params.sang]) blood.levels[params.sang].corpses = corpses; // copie lue à l'instant : blood.json n'est pas modifié
  const bloodFx = params.sang === '0' ? null : fx ?? (await import('./blood-fx.js'));
  return Object.assign(runtime.createPersos(params, { characters, poses, blood, choices, bloodFx }), { model });
}
