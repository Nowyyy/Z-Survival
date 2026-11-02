// Chargeur des personnages v2 et du sang (lot 3j), importé par game.js. Par défaut (variantes « riche », sang complet), il importe le module
// d'exécution et ses données ; avec ?perso=actuel&sang=0, il n'importe rien (le jeu d'avant le lot 3j).
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
