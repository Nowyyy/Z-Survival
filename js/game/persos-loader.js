// Chargeur des personnages v2 et du sang (lot 3j). jeu.html ne le demande que si l'adresse porte ?perso=, ?sang= ou ?usure= (test dans
// game.js) : par défaut, aucun module ni aucune donnée de ce lot n'est chargé. Ici, les modules et les données ne sont importés que si un
// paramètre a une valeur autre que son défaut ; sinon, rien (le jeu reste celui d'aujourd'hui).
import { readPersosParams } from './persos-params.js';

const json = (path) => fetch(path).then((r) => {
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
});

export async function loadPersos(search) {
  const params = readPersosParams(search);
  if (!params.active) return null;
  const [runtime, characters, poses, blood] = await Promise.all([
    import('./persos-runtime.js'),
    json('data/game/characters-v2.json'),
    json('data/game/poses-v2.json'),
    json('data/game/blood.json'),
  ]);
  return runtime.createPersos(params, { characters, poses, blood });
}
