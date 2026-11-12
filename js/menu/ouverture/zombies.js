// Lot 8f : deux zombies au fond de la scène d'ouverture, avec le modèle de zombie du jeu (js/game/character-v2.js, createV2Kit) en lecture seule :
// il se charge seul, sans le jeu (Three.js, modules purs du personnage, data/game/characters-v2.json, poses-v2.json, zombie-variants.json, jetons
// de tokens.css). Animations du jeu (marche lente qui boite, attente, touché, chute) pilotées par la chronologie (js/core/ouverture.js : instant).
import { createV2Kit } from '../../game/character-v2.js';
import { createTokenLookup, readPalette } from '../../game/palette.js';

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path))));
let donnees = null;
export const prechargerZombies = () => (donnees ??= Promise.all(['data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/zombie-variants.json'].map(json)));

// Types de zombies montrés (emplacements du jeu) : un marcheur et un voûté (qui boite).
const TYPES = ['marcheur', 'voute'];
// Échelle : les zombies du jeu font environ 60 unités de haut ; agrandis pour dépasser des caisses posées sur le tapis.
export const ECHELLE_ZOMBIE = 2.35;

export async function creerZombies() {
  const [characters, poses, variants] = await prechargerZombies();
  const ids = variants.zombie.variants.map((v) => v.id);
  const palette = readPalette();
  const kit = createV2Kit({ characters, poses, lookup: createTokenLookup(), hit: palette.hit, zombieIds: ids, seed: 7, wear: () => 1, choice: 'A' });
  const liste = TYPES.map((type, i) => {
    const index = Math.max(0, ids.indexOf(type));
    const c = kit.create('zombie', index, { choice: 'A', outfit: i, wear: 1 + i });
    c.root.scale.multiplyScalar(ECHELLE_ZOMBIE);
    c.root.traverse((o) => {
      if (o.isMesh) o.receiveShadow = false;
    });
    const tete = c.root.getObjectByName('head');
    return { c, tete, base: c.root.scale.x };
  });
  return {
    liste,
    triangles: () => liste.reduce((s, z) => s + (z.c.readPose().triangles ?? 0), 0),
    liberer() {
      for (const z of liste) {
        z.c.root.removeFromParent();
        z.c.dispose();
      }
      kit.dispose();
    },
  };
}
