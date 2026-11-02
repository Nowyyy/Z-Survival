// Personnages v2 et sang en jeu (lot 3j ; défaut du jeu depuis le lot 3m), chargé par js/game/persos-loader.js. Purement
// visuel : il lit l'état du jeu (impacts, morts, coups reçus, étage, manche) et ne l'écrit jamais. Le jeu l'appelle par quelques lignes
// (js/game/game.js) ; les personnages v2 passent par l'aiguillage de createCharacter (js/game/character.js, kit.v2).
import { settings, woundTier } from '../core/blood.js';
import { floorOf } from '../core/floors.js';
import { wearTier } from '../core/persos-variants.js';
import { createV2Kit } from './character-v2.js';
import { createTokenLookup } from './palette.js';

// Zombies préparés d'avance, une tenue par tâche (moins de 50 ms, même sur téléphone) quand le navigateur est libre : sinon texture et géométrie
// seraient construites dans l'image où le zombie apparaît (tâche longue). Purement un cache : rien ne change dans le jeu.
function prewarm(v2, count, handles = () => true) {
  const idle = globalThis.requestIdleCallback ? (f) => globalThis.requestIdleCallback(f, { timeout: 2000 }) : (f) => setTimeout(f, 50);
  const ids = Array.from({ length: count }, (_, i) => i).filter((i) => handles(i));
  const jobs = [...ids];
  let outfit = 0;
  let max = 1;
  const next = () => {
    if (!jobs.length) {
      outfit += 1;
      if (outfit >= max) return;
      jobs.push(...ids);
    }
    max = Math.max(max, v2.prewarm(jobs.shift(), outfit));
    idle(next);
  };
  if (jobs.length) idle(next);
}

// Réglages de la table des choix (?perso=choix seulement) : macros, macros d'animation, style d'animation et tenues de chaque personnage.
const CHOICE_KEYS = { macros: 'macros', animation: 'animMacros', style: 'styleAnim', tenues: 'outfitsOf' };
export function choiceOptions(params, choices) {
  if (params.perso !== 'choix') return {};
  const table = choices?.persos ?? {};
  const out = {};
  for (const [key, opt] of Object.entries(CHOICE_KEYS)) {
    out[opt] = Object.fromEntries(Object.entries(table).filter(([slot, c]) => params.slots[slot] && params.slots[slot] !== 'actuel' && c?.[key] !== undefined).map(([slot, c]) => [slot, c[key]]));
  }
  return out;
}

// Lot 3m : model = ancien modèle ({ computePose, createKit, createCharacter } de pose.js et character.js, importés seulement si un personnage
// est « actuel ») ou modèle v2 seul ; data.choices = table des choix (persos-choix.json, ?perso=choix).
export function createPersos(params, data, model) {
  let v2 = null;
  let blood = null;
  let kit = null;
  let wave = 1;
  let lastHp = null;
  let dynamic = null;
  const facings = new Map(); // orientation dessinée de chaque zombie (identifiant -> radians), pour la chute de son cadavre
  const pools = new Map(); // cadavres réutilisés, par variante de zombie (aucune création à chaque mort)
  const bodyStains = settings(data.blood, params.sang).bodyStains;
  const wear = () => (params.usure === 'auto' ? wearTier(wave, data.characters.wearByWave) : params.usure);

  // Cadavre : personnage v2 de la variante choisie (pose de mort) ou personnage actuel posé « à terre » (il n'a pas d'animation de mort).
  function takeCorpse(_type, variant) {
    const pool = pools.get(variant) ?? [];
    pools.set(variant, pool);
    if (pool.length) return pool.pop();
    const mark = (c) => {
      c.root.userData.corpse = true;
      return c;
    };
    if (v2?.handles('zombie', variant)) {
      const c = v2.create('zombie', variant, { outfit: 0 });
      c.setWound(bodyStains ? 3 : 0);
      return mark(c);
    }
    const c = model.createCharacter(kit, 'zombie', variant);
    c.setPose(model.computePose({ state: 'terre', time: 0 }));
    return mark({ root: c.root, variant, setAnim() {} });
  }
  const giveCorpse = (c) => pools.get(c.variant)?.push(c);

  return {
    params,
    // Appelé une fois après createKit : kit.v2 aiguille createCharacter vers les personnages v2 ; le sang est posé dans world.dynamic.
    attach({ kit: k, world, render, palette, variants, seed }) {
      kit = k;
      dynamic = world.dynamic;
      const lookup = createTokenLookup();
      if (params.v2) {
        // Lot 3m : variante de chaque personnage (params.slots ; « actuel » : ancien modèle) ; avec ?perso=choix, macros, style, macros
        // d'animation et tenues de la table des choix.
        v2 = createV2Kit({ characters: data.characters, poses: data.poses, lookup, hit: palette.hit, choice: params.perso, styleOf: params.slots, ...choiceOptions(params, data.choices), zombieIds: variants.zombie.variants.map((v) => v.id), seed, wear, sill: render.sillHeight });
        kit.v2 = v2;
        prewarm(v2, variants.zombie.variants.length, (i) => v2.handles('zombie', i));
      }
      const lift = (f) => (f === 'etage' && Number.isFinite(render.floorLift) ? render.floorLift : 0);
      // Lot 3m (levier 2) : blood-fx.js fourni par le chargeur, jamais importé avec ?sang=0.
      if (params.sang !== '0' && data.bloodFx) blood = data.bloodFx.createBloodFx({ parent: world.dynamic, cfg: data.blood, level: params.sang, lookup, seed, lift, corpse: takeCorpse, corpseRelease: giveCorpse });
      return this;
    },
    // Impacts de balles (avant leur application : enemies = zombies avant le tir) : gerbe dans le sens du tir, mort : flaque et cadavre.
    impacts(impacts, killed, enemies, player) {
      if (!blood) return;
      const dead = new Set(killed.map((k) => k.id));
      for (const i of impacts) {
        const e = enemies.find((x) => x.id === i.enemyId);
        if (!e) continue;
        const d = Math.hypot(e.x - player.x, e.y - player.y) || 1;
        const ev = { x: i.x, y: i.y, floor: floorOf(e), dir: { x: (e.x - player.x) / d, y: (e.y - player.y) / d } };
        // Le cadavre garde l'orientation du zombie (dessinée à l'image précédente ; inconnue : face au joueur) : touché de face, il tombe en arrière.
        if (dead.has(e.id)) {
          blood.kill({ ...ev, x: e.x, y: e.y, type: e.type, variant: e.visual, facing: facings.get(e.id) ?? Math.atan2(player.y - e.y, player.x - e.x) });
          facings.delete(e.id);
        } else blood.hit(ev);
      }
    },
    playerHit(p, floor) {
      blood?.playerHit({ x: p.x, y: p.y, floor });
    },
    // Contexte du joueur pour ses animations v2 (à terre, réparation, coup reçu).
    playerCtx(sim, eff) {
      const hurt = lastHp !== null && sim.player.health < lastHp - 1e-9;
      lastHp = sim.player.health;
      return { down: sim.down.state, repairing: Object.values(sim.repair ?? {}).some((r) => r?.repairing), repairTime: eff.player.repairTime, hurt };
    },
    // Taches sur le corps d'un zombie v2 selon sa vie (niveau complet seulement).
    zombie(char, e) {
      if (facings.size > 64 && !facings.has(e.id)) facings.clear(); // zombies retirés sans mort (killAll, fin de manche) : rien ne s'accumule
      facings.set(e.id, Math.PI / 2 - char.root.rotation.y);
      if (char.v2) char.setWound(bodyStains ? woundTier(e.health / Math.max(1e-9, e.maxHealth), data.blood.wounds) : 0);
    },
    update(dt) {
      blood?.update(dt);
    },
    sync(floor, w) {
      wave = Number.isFinite(w) && w > 0 ? w : 1;
      blood?.sync(floor);
    },
    reset() {
      facings.clear();
      blood?.reset();
      lastHp = null;
    },
    state(render) {
      let zombies = 0;
      dynamic?.children.forEach((o) => { if (o.userData.v2 && !o.userData.corpse && o.visible) zombies += 1; });
      const b = blood?.stats() ?? { particles: 0, decals: 0, corpses: 0, calls: 0, triangles: 0, drawnParticles: 0, drawnDecals: 0, corpseMeshes: 0 };
      return {
        perso: params.perso, sang: params.sang, usure: params.usure, wear: wear(), architecture: params.actuel ? (params.v2 ? 'mixed' : 'articulated') : 'rigid',
        characters: { joueur: params.slots.joueur, zombies }, slots: { ...params.slots }, choix: v2?.choices() ?? null, blood: { particules: b.particles, taches: b.decals, cadavres: b.corpses, calls: b.calls, triangles: b.triangles, dessines: { particules: b.drawnParticles, taches: b.drawnDecals } },
        textures: v2 ? { count: v2.textureCount(), bytes: v2.textureBytes() } : null, render: { ...render },
      };
    },
  };
}
