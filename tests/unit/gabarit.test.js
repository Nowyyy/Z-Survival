import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aCapsule, distanceSegment, distanceZone, echellesCorps, entreeCapsule, estCouche, EPAULE_REFERENCE, lireCorps, rigCorps, varianteCorps, zoneZombie } from '../../js/core/gabarit.js';
import { castRay } from '../../js/core/ray.js';
import { createBullet, stepBullets } from '../../js/core/projectile.js';
import { stepContact } from '../../js/core/combat.js';
import { poseAt, rigOf } from '../../js/core/pose-v2.js';
import { boundsOf, fkPose, posedTriangles } from '../../js/core/character-parts.js';
import { characters, radiusOf, skeletons } from '../../scripts/personnages/lib.mjs';

// Lot 9e — gabarits du corps long (décisions du propriétaire : corps long pour tous, zone des rampants qui couvre tout le corps couché pour les
// balles, le laser et les coups, sans hauteur ; mains au mur à l'arrachage) : js/core/gabarit.js.
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const poses = load('data/game/poses-v2.json');
const enemies = load('data/game/enemies.json');
const player = load('data/game/player.json');
const corps = characters.corps;
const slot = (id) => characters.slots.find((s) => s.id === id);
const riche = (id) => slot(id).variants.find((v) => v.id === 'riche');

// Pose du corps long (comme js/game/character-v2.js : épaules du squelette, os des bras à l'échelle, mains à 1).
function poseLongue(id, anim, phase) {
  const v = varianteCorps(riche(id), corps);
  const pose = poseAt(rigCorps(rigOf(v, skeletons), corps), anim, phase, {}, poses);
  pose.scales = { ...pose.scales, ...echellesCorps(corps) };
  return { v, pose };
}
const devant = (id, anim, phase) => {
  const { v, pose } = poseLongue(id, anim, phase);
  let f = -Infinity;
  for (const t of posedTriangles(v, pose, { skeletons })) if (/hand|fore/i.test(t.part)) for (const p of t.pts) f = Math.max(f, p[2]);
  return f;
};

describe('corps long : une seule donnée, appliquée aux squelettes', () => {
  it('characters-v2.json → corps égale data/armes/poses.json → corps (lot 9c) : épaules ±9, bras ×1,2', () => {
    const atelier = load('data/armes/poses.json').corps;
    expect({ epaules: corps.epaules, bras: corps.bras }).toEqual(atelier);
    expect(lireCorps(corps)).toEqual({ epaules: 9, bras: 1.2 });
    expect(lireCorps(null)).toBeNull();
    expect(lireCorps({ epaules: -1, bras: 1 })).toBeNull();
  });
  it.each(['joueur', 'marcheur', 'petit', 'voute', 'grand'])('%s : épaules ramenées à ±9 × (épaule du type / 11,5), le reste de la variante inchangé', (id) => {
    const v = riche(id);
    const l = varianteCorps(v, corps);
    const k = Math.abs(v.joints.shoulderL[0]) / EPAULE_REFERENCE;
    expect(l.joints.shoulderL[0]).toBeCloseTo(9 * k, 12);
    expect(l.joints.shoulderR[0]).toBeCloseTo(-9 * k, 12);
    expect(l.joints.hipL).toEqual(v.joints.hipL);
    expect(l.parts).toBe(v.parts);
    expect(varianteCorps(v, null)).toBe(v);
    expect(v.joints.shoulderL[0]).toBe(Math.abs(v.joints.shoulderL[0])); // la donnée d'origine n'est pas modifiée
  });
  it('os des bras ×1,2 pour la cinématique inverse ; échelles : épaules ×1,2, poignets ÷1,2 (mains à leur taille)', () => {
    const rig = rigOf(riche('joueur'), skeletons);
    const l = rigCorps(rig, corps);
    expect(l.upper).toBeCloseTo(rig.upper * 1.2, 12);
    expect(l.fore).toBeCloseTo(rig.fore * 1.2, 12);
    expect(echellesCorps(corps)).toEqual({ shoulderL: 1.2, shoulderR: 1.2, wristL: 1 / 1.2, wristR: 1 / 1.2 });
    expect(echellesCorps(null)).toEqual({});
  });
  it('largeur aux épaules du marcheur en marche : 27,8 → 23,8 ; le bas du corps ne change pas', () => {
    const { v, pose } = poseLongue('marcheur', 'marche', 0);
    const avant = fkPose(riche('marcheur'), poseAt(rigOf(riche('marcheur'), skeletons), 'marche', 0, {}, poses), { skeletons });
    const apres = fkPose(v, pose, { skeletons });
    const large = (b) => boundsOf(b.boxes).max[0] - boundsOf(b.boxes).min[0];
    expect(large(avant)).toBeCloseTo(27.8, 0);
    expect(large(apres)).toBeCloseTo(23.8, 0);
    const pieds = (b) => b.boxes.filter((x) => /ankle|knee|hip/.test(x.joint)).map((x) => x.min.map((n) => n.toFixed(6)).join());
    expect(pieds(apres)).toEqual(pieds(avant));
  });
});

describe('animations : marche bras tendus, coup à sa vraie portée', () => {
  // Coup : centres à r_joueur + r_zombie + 1 (combat.js) ; le torse du joueur s'étend à ≈ 9 de son centre : la main doit y arriver.
  it.each([['marcheur', 30], ['petit', 28], ['grand', 33.5]])('%s : main à %d devant lui au coup (corps long) : elle touche le torse du joueur à la distance du coup', (id, attendu) => {
    const f = devant(id, 'attaque', 0.56);
    expect(f).toBeGreaterThan(attendu - 0.6);
    const contact = player.radius + enemies.zombie.radius * enemies.variants[id].radiusMul + 1;
    expect(contact - f).toBeLessThan(9.5);
    expect(contact - f).toBeGreaterThan(0); // jamais à travers le joueur
  });
  it('voûté : posture.brasMarche lève les deux épaules de 0,35 pendant la marche et la course, rien d\'autre (silhouette distincte du marcheur)', () => {
    const v = riche('voute');
    expect(v.posture.brasMarche).toBe(0.35);
    const { brasMarche, ...sans } = v.posture; // eslint-disable-line no-unused-vars
    const rigA = rigOf(v, skeletons);
    const rigB = rigOf({ ...v, posture: sans }, skeletons);
    for (const [anim, ph] of [['marche', 0.1], ['marcheLente', 0.6], ['course', 0.3], ['attente', 0.2], ['attaque', 0.5], ['rampe', 0.4]]) {
      const a = poseAt(rigA, anim, ph, {}, poses);
      const b = poseAt(rigB, anim, ph, {}, poses);
      for (const id of Object.keys(b.angles)) {
        const leve = ['marche', 'marcheLente', 'course'].includes(anim) && /^shoulder[LR]$/.test(id);
        expect(a.angles[id][0], `${anim} ${id}`).toBeCloseTo(b.angles[id][0] - (leve ? 0.35 : 0), 12);
        expect(a.angles[id].slice(1), `${anim} ${id}`).toEqual(b.angles[id].slice(1));
      }
    }
  });
  it('marche : mains levées devant (≥ 27 devant le marcheur au corps long, à hauteur de poitrine)', () => {
    expect(devant('marcheur', 'marche', 0.25)).toBeGreaterThan(27);
  });
  it.each(['marcheur', 'petit', 'voute', 'grand'])('%s : emprise debout du corps long ≤ zombieFootprint × rayon (characters-v2.json)', (id) => {
    for (const [anim, phase] of [['marche', 0], ['marche', 0.25], ['marcheLente', 0.25], ['course', 0], ['attaque', 0.55], ['attente', 0]]) {
      const { v, pose } = poseLongue(id, anim, phase);
      expect(boundsOf(fkPose(v, pose, { skeletons }).boxes).reach, `${anim} ${phase}`).toBeLessThanOrEqual(characters.budget.zombieFootprint * radiusOf(id) + 1e-9);
    }
  });
});

describe('rampants : capsule pour les balles, le laser et les coups', () => {
  const r = enemies.zombie.radius;
  const z = { id: 1, x: 100, y: 100, r, gait: 'rampe', mode: 'dedans' };
  const p = { x: 300, y: 100 };
  it('couché : allure rampe hors arrachage et passage de fenêtre ; debout : aucune capsule (même objet)', () => {
    expect(estCouche(z)).toBe(true);
    expect(estCouche({ ...z, mode: 'arrache' })).toBe(false);
    expect(estCouche({ ...z, mode: 'escalade', climb: { t: 0.4 } })).toBe(false);
    expect(estCouche({ ...z, mode: 'escalade', climb: { t: 0 } })).toBe(true);
    const debout = { ...z, gait: 'marche' };
    expect(zoneZombie(debout, p, enemies.rampant)).toBe(debout);
    expect(zoneZombie(z, p, null)).toBe(z);
  });
  it('axe vers le joueur (comme son dessin) ; dans un escalier : son sens de marche ; valeurs du type (marcheur par défaut)', () => {
    const c = zoneZombie({ ...z, type: 'marcheur' }, p, enemies.rampant);
    expect(aCapsule(c)).toBe(true);
    expect([c.ax, c.ay, c.bx, c.by]).toEqual([100 - 11, 100, 100 + 23.5, 100]);
    expect(c.x).toBe(100);
    const s = zoneZombie({ ...z, type: 'grand', mode: 'escalier', fx: 0, fy: -1 }, p, enemies.rampant);
    expect([s.ay, s.by]).toEqual([100 + 13.5, 100 - 29.5]);
    expect(zoneZombie({ ...z, type: 'inconnu' }, p, enemies.rampant).bx).toBe(123.5);
  });
  // Les plus petites valeurs (pas de 0,5) qui contiennent tout le corps couché : celles des données.
  const corpsCouche = (id) => {
    const pts = [];
    for (let k = 0; k < 40; k += 1) {
      const { v, pose } = poseLongue(id, 'rampe', k / 40);
      for (const t of posedTriangles(v, pose, { skeletons })) for (const q of t.pts) pts.push([q[0], q[2]]);
    }
    return pts;
  };
  it.each(['marcheur', 'petit', 'voute', 'grand'])('%s : la capsule couvre tout le corps couché du corps long (vue de dessus, tout le cycle), rayon du zombie gardé, valeurs minimales', (id) => {
    const rad = r * enemies.variants[id].radiusMul;
    const { arriere, avant } = enemies.rampant[id];
    const pts = corpsCouche(id);
    const dedans = (ar, av) => pts.every(([x, y]) => distanceSegment(x, y, 0, -ar, 0, av) <= rad + 1e-9);
    expect(dedans(arriere, avant)).toBe(true);
    expect(dedans(arriere - 0.5, avant)).toBe(false);
    expect(dedans(arriere, avant - 0.5)).toBe(false);
  });
  it('entreeCapsule : bouts ronds et corps exacts (contre un échantillonnage fin)', () => {
    const c = { ax: 0, ay: 0, bx: 30, by: 10 };
    for (const [x0, y0, sx, sy] of [[-50, 40, 120, -60], [15, -60, 0, 100], [-40, -40, 200, 10], [60, 60, -10, -10], [10, 3, 5, 5]]) {
      let ref = null;
      for (let i = 0; i <= 20000; i += 1) {
        const t = i / 20000;
        if (distanceSegment(x0 + sx * t, y0 + sy * t, c.ax, c.ay, c.bx, c.by) <= 12) {
          ref = t;
          break;
        }
      }
      const t = entreeCapsule(x0, y0, sx, sy, c, 12, 1);
      if (ref === null) expect(t).toBeNull();
      else expect(t).toBeCloseTo(ref, 3);
    }
  });
  it('balle et laser : une ligne qui passe 25 derrière le centre (marcheur par défaut : 11 derrière, rayon 20) touche le rampant (capsule) et rate le cercle', () => {
    const c = zoneZombie(z, p, enemies.rampant);
    const b = createBullet({ x: 100 - 25, y: 300 }, -Math.PI / 2, { damage: 10, bulletSpeed: 10000, bulletRadius: 0, bulletMaxDistance: 1000 }, 7);
    const step = (list) => stepBullets([b], list, 0.05, { minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
    expect(step([c]).impacts.map((i) => i.enemyId)).toEqual([1]);
    expect(step([z]).impacts).toEqual([]);
    expect(castRay({ x: 75, y: 300 }, -Math.PI / 2, 400, [c], null).hit?.id).toBe(1);
    expect(castRay({ x: 75, y: 300 }, -Math.PI / 2, 400, [z], null).hit).toBeNull();
  });
  it('coup : distance du joueur à la capsule ; sans capsule, la règle d\'avant (centres)', () => {
    const c = zoneZombie(z, { x: 100 + 300, y: 100 }, enemies.rampant);
    expect(distanceZone(c, 100 - 11, 150)).toBeCloseTo(50, 9);
    expect(distanceZone(z, 103, 104)).toBeCloseTo(5, 9);
    const touche = { x: 100 - 11 - 3, y: 100 + 38.5, r: 18, health: 100 }; // près de l'arrière du corps couché : 38,6 de la capsule, 41,5 du centre
    expect(stepContact(touche, [c], 0.05, { contactDamage: 10, contactDelay: 1 }).damage).toBe(10);
    expect(stepContact(touche, [z], 0.05, { contactDamage: 10, contactDelay: 1 }).damage).toBe(0);
  });
});
