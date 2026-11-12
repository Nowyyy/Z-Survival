// Lot 8f : deux zombies au fond de la scène d'ouverture, avec le modèle de zombie du jeu (js/game/character-v2.js, createV2Kit) en lecture seule :
// il se charge seul, sans le jeu (Three.js, modules purs du personnage, data/game/characters-v2.json, poses-v2.json, zombie-variants.json, jetons
// de tokens.css). Animations du jeu (marche lente qui boite, attente, touché, chute) pilotées par la chronologie (js/core/ouverture.js : instant).
// Retour du propriétaire (« qu'ils ressemblent aux zombies de base de la partie, avec des textures ») : mêmes réglages que la partie par défaut
// (?perso=choix) : table data/game/persos-choix.json lue par les fonctions du jeu (slotVariants, choiceOptions : variante « riche », tenues tirées,
// macros), usure d'une manche moyenne (wearTier), textures du jeu (atlas de createV2Kit).
import * as THREE from 'three';
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
// Paliers de blessure (taches de sang) des deux zombies.
const TACHES = [2, 1];
// Échelle : les zombies du jeu font environ 60 unités de haut ; agrandis pour dépasser des caisses posées sur le tapis.
export const ECHELLE_ZOMBIE = 2.6;

// Couleurs ravivées pour l'ouverture : la partie dessine ses personnages très pâles (vus de dessus sur un sol sombre, contraste ≥ 3:1) ; dans le
// hangar de nuit, cette pâleur paraît grise (retour du propriétaire). Couleurs par sommet de nos propres géométries (kit de cette ouverture,
// libéré à la fin) : saturation × RAVIVE.s, luminosité × RAVIVE.l ; une seule fois par géométrie. La partie n'est pas touchée.
const RAVIVE = Object.freeze({ s: 1.6, l: 0.8 });
const ravivees = new WeakSet();
const hsl = { h: 0, s: 0, l: 0 };
function raviver(root) {
  const c = new THREE.Color();
  root.traverse((o) => {
    const attr = o.isMesh ? o.geometry?.getAttribute('color') : null;
    if (!attr || ravivees.has(attr)) return;
    ravivees.add(attr);
    for (let i = 0; i < attr.count; i += 1) {
      c.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i)).getHSL(hsl);
      c.setHSL(hsl.h, Math.min(1, hsl.s * RAVIVE.s), hsl.l * RAVIVE.l);
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  });
}

export async function creerZombies({ graine = 7 } = {}) {
  const [characters, poses, variants, choix] = await prechargerZombies();
  const ids = variants.zombie.variants.map((v) => v.id);
  const palette = readPalette();
  const slots = slotVariants('choix', choix);
  const usure = wearTier(MANCHE, characters.wearByWave);
  const kit = createV2Kit({ characters, poses, lookup: createTokenLookup(), hit: palette.hit, choice: 'choix', styleOf: slots, ...choiceOptions({ perso: 'choix', slots }, choix), zombieIds: ids, seed: graine, wear: () => usure });
  const liste = [];
  for (const type of TYPES) {
    const index = Math.max(0, ids.indexOf(type));
    // Tenue tirée parmi celles retenues par la table (comme une apparition en partie), d'après la graine de l'achat.
    const k = kit.slotKit(type, slots[type]);
    const outfit = k.allowed[Math.min(k.allowed.length - 1, Math.floor(kit.random() * k.allowed.length))] ?? 0;
    const c = kit.create('zombie', index, { outfit, wear: usure });
    // Retour du propriétaire (« les zombies semblent gris ») : taches de sang du jeu sur le corps et les vêtements (paliers de blessure de
    // l'atlas, comme un zombie touché en partie), un palier différent pour chacun.
    c.setWound?.(TACHES[liste.length] ?? 2);
    raviver(c.root);
    c.root.scale.multiplyScalar(ECHELLE_ZOMBIE);
    c.root.traverse((o) => {
      if (o.isMesh) o.receiveShadow = false;
    });
    const tete = c.root.getObjectByName('head');
    liste.push({ c, tete, base: c.root.scale.x });
  }
  return {
    liste,
    triangles: () => liste.reduce((s, z) => s + (z.c.readPose().triangles ?? 0), 0),
    liberer() {
      // Matières des taches (paliers de blessure) et copies de l'atlas qu'elles portent : créées à la demande par le kit, qui ne libère que
      // l'atlas de base ; libérées ici (tout doit revenir à 0 texture à la fin de l'ouverture).
      const matieres = new Set();
      for (const z of liste) {
        z.c.root.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) matieres.add(m);
        });
      }
      for (const z of liste) {
        z.c.root.removeFromParent();
        z.c.dispose();
      }
      kit.dispose();
      for (const m of matieres) {
        m.map?.dispose();
        m.dispose();
      }
    },
  };
}
