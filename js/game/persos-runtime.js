// Essai en jeu des personnages v2 et du sang (lot 3j), chargé seulement avec ?perso= ou ?sang= (js/game/persos-loader.js). Purement
// visuel : il lit l'état du jeu (impacts, morts, coups reçus, étage, manche) et ne l'écrit jamais. Le jeu l'appelle par quelques lignes
// (js/game/game.js) ; les personnages v2 passent par l'aiguillage de createCharacter (js/game/character.js, kit.v2).
import { settings, woundTier } from '../core/blood.js';
import { floorOf } from '../core/floors.js';
import { computePose } from '../core/pose.js';
import { wearTier } from '../core/persos-variants.js';
import { createBloodFx } from './blood-fx.js';
import { createCharacter } from './character.js';
import { createV2Kit } from './character-v2.js';
import { createTokenLookup } from './palette.js';

export function createPersos(params, data) {
  let v2 = null;
  let blood = null;
  let kit = null;
  let wave = 1;
  let lastHp = null;
  let dynamic = null;
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
    if (v2) {
      const c = v2.create('zombie', variant, { outfit: 0 });
      c.setWound(bodyStains ? 3 : 0);
      return mark(c);
    }
    const c = createCharacter(kit, 'zombie', variant);
    c.setPose(computePose({ state: 'terre', time: 0 }));
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
      if (params.perso !== 'actuel') {
        v2 = createV2Kit({ characters: data.characters, poses: data.poses, lookup, hit: palette.hit, choice: params.perso, zombieIds: variants.zombie.variants.map((v) => v.id), seed, wear });
        kit.v2 = v2;
      }
      const lift = (f) => (f === 'etage' && Number.isFinite(render.floorLift) ? render.floorLift : 0);
      if (params.sang !== '0') blood = createBloodFx({ parent: world.dynamic, cfg: data.blood, level: params.sang, lookup, seed, lift, corpse: takeCorpse, corpseRelease: giveCorpse });
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
        if (dead.has(e.id)) blood.kill({ ...ev, x: e.x, y: e.y, type: e.type, variant: e.visual, facing: Math.atan2(player.y - e.y, player.x - e.x) });
        else blood.hit(ev);
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
      blood?.reset();
      lastHp = null;
    },
    state(render) {
      let zombies = 0;
      dynamic?.children.forEach((o) => { if (o.userData.v2 && !o.userData.corpse && o.visible) zombies += 1; });
      const b = blood?.stats() ?? { particles: 0, decals: 0, corpses: 0, calls: 0, triangles: 0, drawnParticles: 0, drawnDecals: 0, corpseMeshes: 0 };
      return {
        perso: params.perso, sang: params.sang, usure: params.usure, wear: wear(), architecture: params.perso === 'actuel' ? 'articulated' : 'rigid',
        characters: { joueur: params.perso, zombies }, blood: { particules: b.particles, taches: b.decals, cadavres: b.corpses, calls: b.calls, triangles: b.triangles, dessines: { particules: b.drawnParticles, taches: b.drawnDecals } },
        textures: v2 ? { count: v2.textureCount(), bytes: v2.textureBytes() } : null, render: { ...render },
      };
    },
  };
}
