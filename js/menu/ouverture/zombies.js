// Lot 8f : deux zombies au fond de la scène d'ouverture, avec le modèle de zombie du jeu (js/game/character-v2.js, createV2Kit) en lecture seule :
// il se charge seul, sans le jeu (Three.js, modules purs du personnage, data/game/characters-v2.json, poses-v2.json, zombie-variants.json, jetons
// de tokens.css). Animations du jeu (marche lente qui boite, attente, touché, chute) pilotées par la chronologie (js/core/ouverture.js : instant).
// Retour du propriétaire (« qu'ils ressemblent aux zombies de base de la partie, avec des textures ») : mêmes réglages que la partie par défaut
// (?perso=choix) : table data/game/persos-choix.json lue par les fonctions du jeu (slotVariants, choiceOptions : variante « riche », tenues tirées,
// macros), usure d'une manche moyenne (wearTier), textures du jeu (atlas de createV2Kit).
import { createV2Kit } from '../../game/character-v2.js';
import { createTokenLookup, readPalette } from '../../game/palette.js';
import { slotVariants } from '../../game/persos-params.js';
import { choiceOptions } from '../../game/persos-runtime.js';
import { wearTier } from '../../core/persos-variants.js';

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path))));
let donnees = null;
export const prechargerZombies = () => (donnees ??= Promise.all(['data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/zombie-variants.json', 'data/game/persos-choix.json'].map(json)));

// Types de zombies montrés (emplacements du jeu) : un marcheur et un voûté (qui boite).
const TYPES = ['marcheur', 'voute'];
// Manche de référence pour l'usure (vêtements abîmés comme en milieu de partie).
const MANCHE = 6;
// Échelle : les zombies du jeu font environ 60 unités de haut ; agrandis pour dépasser des caisses posées sur le tapis.
export const ECHELLE_ZOMBIE = 2.6;

export async function creerZombies({ graine = 7 } = {}) {
  const [characters, poses, variants, choix] = await prechargerZombies();
  const ids = variants.zombie.variants.map((v) => v.id);
  const palette = readPalette();
  const slots = slotVariants('choix', choix);
  const usure = wearTier(MANCHE, characters.wearByWave);
  const kit = createV2Kit({ characters, poses, lookup: createTokenLookup(), hit: palette.hit, choice: 'choix', styleOf: slots, ...choiceOptions({ perso: 'choix', slots }, choix), zombieIds: ids, seed: graine, wear: () => usure });
  const liste = TYPES.map((type) => {
    const index = Math.max(0, ids.indexOf(type));
    // Tenue tirée parmi celles retenues par la table (comme une apparition en partie), d'après la graine de l'achat.
    const k = kit.slotKit(type, slots[type]);
    const outfit = k.allowed[Math.min(k.allowed.length - 1, Math.floor(kit.random() * k.allowed.length))] ?? 0;
    const c = kit.create('zombie', index, { outfit, wear: usure });
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
