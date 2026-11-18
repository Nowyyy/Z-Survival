import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { armeJeu, lireTable, lourdeur, paletteArmes, statsAvecArme, tempsPourTuer } from '../../js/core/armes/partie.js';
import { aSec, armeActive, armeMontree, avancerInventaire, changerArme, creerInventaire, donnerArme, enRecharge, maxEmplacements, munitionsIllimitees, peutTirer, progressionRecharge, recharger, remplirMunitions, texteMunitions, tirer, RANGER } from '../../js/core/armes/inventaire.js';
import { effectiveWeapon, statValues } from '../../js/core/player-stats.js';
import { waveSpec } from '../../js/core/waves.js';
import { armeParId, echelleJeu, lireArmes, maillageArme } from '../../js/core/armes/armes.js';
import { boucheDevant, OS_TENUE, pointeCanon, tenueArme } from '../../js/core/armes/tenue-jeu.js';
import { echellesCorps, rigCorps, varianteCorps } from '../../js/core/gabarit.js';
import { jointMatrices, jointsOf } from '../../js/core/character-parts.js';
import { poseAt, rigOf } from '../../js/core/pose-v2.js';
import { resolveVariant } from '../../js/core/persos-variants.js';

// Lot 9e — table des armes de la partie (data/game/armes-partie.json), calibrage calculé depuis les vagues et les zombies, inventaire
// (emplacements, chargeurs, rechargement, changement d'arme). Décisions du propriétaire : Colt chargeur de 7, réserve illimitée, dégâts et cadence
// de l'arme d'avant ; une arme achetée en plus (donnée) ; armes spéciales dans la table, pas utilisables.
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const json = load('data/game/armes-partie.json');
const table = lireTable(json);
const waves = load('data/game/waves.json');
const enemies = load('data/game/enemies.json');
const weapons = load('data/game/weapons.json');
const statsCfg = load('data/game/player-stats.json');
const vie = (w) => enemies.zombie.health * waveSpec(w, waves).hpMul;
const UTILES = ['m1911', 'kar98k', 'winchester1897', 'thompson', 'garand', 'stg44', 'bar', 'mg42'];

describe('table des armes', () => {
  it('huit armes utilisables (Colt et sept armes), deux spéciales inactives ; identifiants = ceux de data/armes/armes.json', () => {
    expect(table.actives).toEqual(UTILES);
    expect(table.ids).toEqual([...UTILES, 'panzerschreck', 'm2lanceflammes']);
    for (const id of ['panzerschreck', 'm2lanceflammes']) {
      expect(table.armes[id].active).toBe(false);
      expect(table.armes[id].degats).toBeUndefined();
    }
    const modeles = lireArmes(load('data/armes/armes.json')).armes.map((a) => a.id);
    expect([...table.ids].sort()).toEqual([...modeles].sort());
    expect(table.armeDepart).toBe('m1911');
    expect(table.emplacementsAchetes).toBe(1);
  });
  it('chaque arme utilisable a toutes ses statistiques (dégâts, cadence, portée, dispersion, vitesse, chargeur, réserve, recharge, sortie, prix, plombs)', () => {
    for (const id of UTILES) {
      const e = json.armes[id];
      for (const k of ['categorie', 'palier', 'masse', 'degats', 'cadence', 'portee', 'dispersion', 'dispersionMouvement', 'vitesse', 'chargeur', 'reserve', 'rechargement', 'sortie', 'prix', 'plombs']) expect(Object.hasOwn(e, k), `${id}.${k}`).toBe(true);
    }
    expect(json.armes.winchester1897.plombs).toBe(8);
    for (const id of UTILES.filter((x) => x !== 'winchester1897')) expect(json.armes[id].plombs).toBe(1);
  });
  it('noms : game.armes.<id> dans fr.json pour les dix armes', () => {
    const fr = load('data/i18n/fr.json');
    for (const id of table.ids) expect(fr[`game.armes.${id}`], id).toMatch(/\S/);
  });
  it('Colt : chargeur 7, réserve illimitée, dégâts et cadence de l\'arme d\'avant (weapons.json → pistol), cône d\'avant (4 / +8)', () => {
    const c = table.armes.m1911;
    expect([c.chargeur, c.reserve, c.degats, c.cadence, c.portee]).toEqual([7, Infinity, weapons.pistol.damage, weapons.pistol.fireDelay, weapons.pistol.fireRange]);
    expect([c.dispersion, c.dispersionMouvement]).toEqual([statsCfg.stats.precision.baseAngle, statsCfg.stats.precision.moveAngle]);
    const w = armeJeu(c, weapons.pistol, weapons.pistol.muzzleOffset);
    expect(effectiveWeapon(w, {}, statsAvecArme(statsCfg, c))).toEqual({ ...effectiveWeapon(weapons.pistol, {}, statsCfg), id: 'm1911', plombs: 1, vitesse: 1 });
  });
  it('paliers dans l\'ordre décidé : 0 Colt ; 1 Kar98k, Winchester ; 2 Thompson, Garand ; 3 StG 44, BAR ; 4 MG42', () => {
    expect(UTILES.map((id) => table.armes[id].palier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('lourdeur d\'après la masse réelle : vitesse, temps de sortie, dispersion en mouvement (règle de la fiche)', () => {
    for (const id of UTILES) {
      const e = table.armes[id];
      const l = lourdeur(e.masse);
      expect(e.vitesse, id).toBeCloseTo(l.vitesse, 9);
      expect(e.sortie, id).toBeCloseTo(l.sortie, 9);
      expect(e.dispersionMouvement, id).toBeCloseTo(l.dispersionMouvement, 9);
    }
  });
  it('plus puissante = plus lourde : vitesse et sortie ne s\'améliorent jamais d\'un palier au suivant (meilleure arme de chaque palier)', () => {
    const parPalier = [0, 1, 2, 3, 4].map((p) => UTILES.map((id) => table.armes[id]).filter((e) => e.palier === p));
    for (let p = 1; p < 5; p += 1) {
      expect(Math.min(...parPalier[p].map((e) => e.vitesse))).toBeLessThanOrEqual(Math.min(...parPalier[p - 1].map((e) => e.vitesse)));
      expect(Math.max(...parPalier[p].map((e) => e.sortie))).toBeGreaterThanOrEqual(Math.max(...parPalier[p - 1].map((e) => e.sortie)));
    }
  });
  it('paletteArmes : jetons --arm-* de css/armes.css', () => {
    const p = paletteArmes(readFileSync('css/armes.css', 'utf8'));
    expect(p.bruni).toEqual([0x23, 0x27, 0x2d]);
    expect(Object.keys(p).length).toBeGreaterThan(20);
  });
});

describe('calibrage (calculé depuis waves.json et enemies.json)', () => {
  const REF = tempsPourTuer(table.armes.m1911, vie(1)); // Colt en manche 1 : 2 tirs × 0,4 s
  it('référence : Colt en manche 1 = 0,8 s par marcheur', () => expect(REF).toBeCloseTo(0.8, 9));
  it.each([['kar98k', 11], ['winchester1897', 11], ['thompson', 21], ['garand', 21], ['stg44', 31], ['bar', 31]])('%s : à la manche %i (ouverture du palier), un marcheur tombe en 0,8 s ± 15 %', (id, w) => {
    expect(tempsPourTuer(table.armes[id], vie(w)) / REF).toBeGreaterThan(0.85);
    expect(tempsPourTuer(table.armes[id], vie(w)) / REF).toBeLessThan(1.15);
  });
  it('MG42 (palier 4, fin de monde) : vie plafonnée de la manche 31 à 40, calibrée sur le nombre de zombies (150 / 98) ± 15 %', () => {
    expect(vie(40)).toBe(vie(31));
    const k = waveSpec(40, waves).total / waveSpec(31, waves).total;
    const t = tempsPourTuer(table.armes.mg42, vie(40));
    expect(t * k / REF).toBeGreaterThan(0.85);
    expect(t * k / REF).toBeLessThan(1.15);
  });
  it('chaque arme s\'essouffle : à la manche d\'ouverture du palier suivant, au moins 1,8 fois plus lente qu\'à la sienne', () => {
    for (const [id, a, b] of [['m1911', 1, 11], ['kar98k', 11, 21], ['winchester1897', 11, 21], ['thompson', 21, 31], ['garand', 21, 31]]) {
      expect(tempsPourTuer(table.armes[id], vie(b)), id).toBeGreaterThanOrEqual(1.8 * tempsPourTuer(table.armes[id], vie(a)) - 1e-9);
    }
  });
  it('munitions : chargeur + réserve tuent les zombies d\'une manche d\'ouverture à 75 % de tirs au but (arrondi au chargeur)', () => {
    for (const [id, w] of [['kar98k', 11], ['winchester1897', 11], ['thompson', 21], ['garand', 21], ['stg44', 31], ['bar', 31], ['mg42', 40]]) {
      const e = table.armes[id];
      const touche = e.plombs > 1 ? 0.75 : 1;
      const besoin = Math.ceil((waveSpec(w, waves).total * Math.ceil(vie(w) / (e.degats * e.plombs * touche) - 1e-9)) / 0.75);
      expect(e.chargeur + e.reserve, id).toBe(Math.ceil(besoin / e.chargeur) * e.chargeur);
    }
  });
  it('prix : 60 % des Zollars gagnés (10 par zombie) depuis l\'ouverture du palier précédent, arrondis à 100', () => {
    const z = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => waveSpec(a + i, waves).total * 10).reduce((s, x) => s + x, 0);
    const blocs = { 1: z(1, 10), 2: z(11, 20), 3: z(21, 30), 4: z(31, 39) };
    for (const id of UTILES.slice(1)) expect(table.armes[id].prix, id).toBe(Math.round((0.6 * blocs[table.armes[id].palier]) / 100) * 100);
  });
});

describe('plombs et cône propre à chaque arme', () => {
  it('le cône de l\'arme remplace celui des statistiques, les niveaux de précision s\'y appliquent', () => {
    const k = table.armes.kar98k;
    const v = statValues({ precision: 5 }, statsAvecArme(statsCfg, k));
    expect(v.stillAngle).toBeCloseTo(1.5 * 0.9 ** 5, 12);
    expect(v.moveAngle).toBeCloseTo(9.3 * 0.85 ** 5, 12);
    expect(statsCfg.stats.precision.baseAngle).toBe(4); // la donnée n'est pas modifiée
  });
  it('arme au format du jeu : dégâts, cadence, portée, plombs, vitesse, bouche ; laser et balle de la base commune', () => {
    const w = armeJeu(table.armes.winchester1897, weapons.pistol, 32.7);
    expect([w.damage, w.fireDelay, w.fireRange, w.plombs, w.vitesse, w.muzzleOffset, w.laserRange, w.bulletSpeed]).toEqual([55, 0.9, 350, 8, 0.95, 32.7, 300, weapons.pistol.bulletSpeed]);
  });
});

describe('inventaire : emplacements, chargeurs, rechargement, changement', () => {
  const run = (s, dt, n) => {
    let st = s;
    const ev = [];
    for (let i = 0; i < n; i += 1) {
      const r = avancerInventaire(st, table, dt);
      st = r.state;
      ev.push(...r.evenements);
    }
    return { st, ev };
  };
  it('départ : le Colt seul, plein (7 / ∞), un emplacement acheté en plus (donnée)', () => {
    const s = creerInventaire(table);
    expect(s.emplacements).toEqual([{ id: 'm1911', chargeur: 7, reserve: Infinity, recharge: null }]);
    expect(maxEmplacements(table)).toBe(2);
    expect(maxEmplacements({ emplacementsAchetes: 3 })).toBe(4);
    expect(texteMunitions(s)).toBe('7 / ∞');
    expect(peutTirer(s)).toBe(true);
  });
  it('Colt : 7 tirs, rechargement automatique de 1,4 s, jamais à sec', () => {
    let s = creerInventaire(table);
    for (let i = 0; i < 7; i += 1) s = tirer(s);
    expect(armeActive(s).chargeur).toBe(0);
    let r = run(s, 0.05, 1);
    expect(r.ev).toEqual([{ type: 'rechargeDebut', id: 'm1911', auto: true }]);
    expect(peutTirer(r.st)).toBe(false);
    expect(enRecharge(r.st)).toBe(true);
    r = run(r.st, 0.05, 27);
    expect(armeActive(r.st).chargeur).toBe(0);
    expect(progressionRecharge(r.st, table)).toBeCloseTo(1.35 / 1.4, 9);
    r = run(r.st, 0.05, 1);
    expect(r.ev.map((e) => e.type)).toEqual(['rechargeFin']);
    expect(armeActive(r.st)).toEqual({ id: 'm1911', chargeur: 7, reserve: Infinity, recharge: null });
    expect(aSec(r.st)).toBe(false);
  });
  it('rechargement à la main : chargeur incomplet seulement ; pas pendant un rechargement ; la réserve diminue de ce qui manque', () => {
    let s = donnerArme(creerInventaire(table), table, 'kar98k').state;
    s = run(s, 0.05, 20).st; // sortie de 0,57 s
    expect(recharger(s, table).debut).toBe(false); // plein
    s = tirer(tirer(s));
    const r = recharger(s, table);
    expect(r.debut).toBe(true);
    expect(recharger(r.state, table).debut).toBe(false);
    const fin = run(r.state, 0.05, 49).st; // 2,4 s (et un pas d'arrondi)
    expect(armeActive(fin)).toEqual({ id: 'kar98k', chargeur: 5, reserve: 28, recharge: null });
  });
  it('arme à sec (chargeur et réserve vides) : plus de tir, aucun rechargement ; le Colt reste disponible', () => {
    let s = donnerArme(creerInventaire(table), table, 'kar98k').state;
    s = run(s, 0.05, 20).st;
    s = { ...s, emplacements: s.emplacements.map((e, i) => (i === 1 ? { ...e, chargeur: 0, reserve: 0 } : e)) };
    expect(aSec(s)).toBe(true);
    expect(peutTirer(s)).toBe(false);
    expect(run(s, 0.05, 5).ev).toEqual([]);
    const c = changerArme(s, table).state;
    expect(armeActive(c).id).toBe('m1911');
  });
  it('donner une arme : emplacement libre, sinon elle remplace l\'arme achetée tenue (jamais le Colt) ; elle arrive pleine et elle est sortie', () => {
    let s = donnerArme(creerInventaire(table), table, 'thompson').state;
    expect(s.emplacements.map((e) => e.id)).toEqual(['m1911', 'thompson']);
    expect(s.actif).toBe(1);
    expect(s.sortie).toEqual({ t: 0, total: 0.64, de: 0, ancien: null });
    s = run(s, 0.05, 13).st;
    expect(s.sortie).toBeNull();
    const r = donnerArme(s, table, 'mg42');
    expect(r.state.emplacements.map((e) => e.id)).toEqual(['m1911', 'mg42']);
    expect(r.state.sortie.ancien).toBe('thompson');
    expect(armeMontree(r.state).id).toBe('thompson');
    expect(armeMontree(run(r.state, 0.05, 10).st).id).toBe('mg42');
    // Colt en main : la première arme achetée est remplacée
    const colt = changerArme(run(r.state, 0.05, 30).st, table).state;
    const s2 = donnerArme(run(colt, 0.05, 20).st, table, 'garand').state;
    expect(s2.emplacements.map((e) => e.id)).toEqual(['m1911', 'garand']);
    expect(donnerArme(s2, table, 'panzerschreck').change).toBe(false);
    expect(donnerArme(s2, table, 'inconnue').change).toBe(false);
  });
  it('changement : durée = temps de sortie de l\'arme qui arrive (40 % ranger, 60 % sortir) ; pas de tir pendant ; un rechargement interrompu reprend à la sortie suivante', () => {
    let s = run(donnerArme(creerInventaire(table), table, 'bar').state, 0.05, 20).st;
    s = tirer(s);
    s = recharger(s, table).state;
    s = run(s, 0.05, 20).st; // 1 s de rechargement sur 2,8
    const avant = armeActive(s).recharge;
    expect(avant).toBeCloseTo(1, 9);
    s = changerArme(s, table).state;
    expect(armeActive(s).id).toBe('m1911');
    expect(s.sortie.total).toBe(0.38);
    expect(armeMontree(s).id).toBe('bar');
    expect(RANGER).toBe(0.4);
    expect(peutTirer(s)).toBe(false);
    s = run(s, 0.05, 8).st;
    expect(s.sortie).toBeNull();
    expect(peutTirer(s)).toBe(true);
    expect(s.emplacements[1].recharge).toBeCloseTo(1, 9); // gardé
    s = changerArme(s, table).state;
    s = run(s, 0.05, 19).st; // sortie du BAR (0,92 s)
    expect(s.sortie).toBeNull();
    expect(enRecharge(s)).toBe(true);
    s = run(s, 0.05, 36).st; // 1,8 s de plus
    expect(armeActive(s).chargeur).toBe(20);
    expect(changerArme(creerInventaire(table), table).change).toBe(false); // une seule arme
  });
  it('munitions illimitées (débogage, référence de la trace) : jamais de cartouche en moins, jamais de rechargement ; remplir : tout plein', () => {
    let s = munitionsIllimitees(creerInventaire(table), true);
    for (let i = 0; i < 30; i += 1) s = tirer(s);
    expect(armeActive(s).chargeur).toBe(7);
    expect(texteMunitions(s)).toBe('7 / ∞');
    expect(recharger(s, table).debut).toBe(false);
    s = munitionsIllimitees(s, false);
    let k = run(donnerArme(s, table, 'stg44').state, 0.05, 20).st;
    for (let i = 0; i < 12; i += 1) k = tirer(k);
    k = remplirMunitions(k, table);
    expect(k.emplacements.map((e) => [e.id, e.chargeur, e.reserve])).toEqual([['m1911', 7, Infinity], ['stg44', 30, 900]]);
  });
  it('arguments jamais modifiés', () => {
    const s = Object.freeze(creerInventaire(table));
    expect(() => avancerInventaire(s, table, 0.05)).not.toThrow();
    expect(() => tirer(s)).not.toThrow();
    expect(() => donnerArme(s, table, 'mg42')).not.toThrow();
  });
});

describe('tenue en partie (pose du lot 9c dans le repère de l\'os chest, corps long)', () => {
  const characters = load('data/game/characters-v2.json');
  const posesV2 = load('data/game/poses-v2.json');
  const posesArmes = load('data/armes/poses.json');
  const donnees = lireArmes(load('data/armes/armes.json'));
  const variant = characters.slots.find((s) => s.id === 'joueur').variants.find((v) => v.id === 'riche');
  it.each(UTILES)('%s : mains sur leurs prises (poignet à moins de 4,5 de la prise : la paume est contre l\'arme), bouche devant le joueur', (id) => {
    const t = tenueArme({ variant, skeletons: posesV2.skeletons, posesV2, posesArmes, id, corps: characters.corps });
    expect(Object.keys(t.angles).every((k) => OS_TENUE.includes(k))).toBe(true);
    const res = varianteCorps(resolveVariant(variant, {}), characters.corps);
    const pose = poseAt(rigCorps(rigOf(res, posesV2.skeletons), characters.corps), 'repos', 0.25, {}, posesV2);
    const M = jointMatrices(jointsOf(res, posesV2.skeletons), { angles: { ...pose.angles, ...t.angles }, offsets: pose.offsets, scales: { ...pose.scales, ...echellesCorps(characters.corps) } }, 1);
    const a = armeParId(donnees, id);
    const s = echelleJeu(donnees, a);
    const prise = (p) => p.map((v, i) => v * s + t.position[i]);
    const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    expect(d(M.wristR.t, prise(a.prises.droite))).toBeLessThan(4.5);
    if (a.prises.gauche) expect(d(M.wristL.t, prise(a.prises.gauche))).toBeLessThan(4.5);
    // L'arme placée par la transformation locale de l'os chest retombe à la position de la pose (repère du personnage).
    const c = M.chest;
    const back = [0, 1, 2].map((r) => c.m[r * 3] * t.local.t[0] + c.m[r * 3 + 1] * t.local.t[1] + c.m[r * 3 + 2] * t.local.t[2] + c.t[r]);
    expect(d(back, t.position)).toBeLessThan(1e-9);
    const m = maillageArme(donnees, a, a.variantes[0], { pose: 'main', enJeu: true });
    const b = boucheDevant(t, pointeCanon(m.positions));
    expect(b).toBeGreaterThan(26);
    expect(b).toBeLessThan(40);
  });
  it('arme ou mode inconnus : null ; pointe du canon : le point le plus avancé près de l\'axe (le bipied du BAR est écarté)', () => {
    expect(tenueArme({ variant, skeletons: posesV2.skeletons, posesV2, posesArmes, id: 'inconnue', corps: characters.corps })).toBeNull();
    expect(pointeCanon(new Float32Array([0, 0, 1, 0, 9, 50, 1, 1, 20]))).toEqual([1, 1, 20]);
    expect(pointeCanon([])).toEqual([0, 0, 0]);
  });
});

describe('sons des armes (data/game/sons-armes.json)', () => {
  const sonsJson = load('data/game/sons-armes.json');
  it('deux variantes (a, b) par arme utilisable autre que le Colt, le rechargement et le changement ; recettes complètes et audibles', async () => {
    const { renderSound } = await import('../../js/core/synth.js');
    const ids = sonsJson.recettes.map((r) => r.id);
    for (const id of UTILES.slice(1)) for (const v of ['a', 'b']) expect(ids, id).toContain(`tir-${id}-${v}`);
    expect(ids).toContain('arme-recharge');
    expect(ids).toContain('arme-change');
    expect(ids.some((x) => x.startsWith('tir-m1911'))).toBe(false); // le Colt garde « tir »
    for (const r of sonsJson.recettes) {
      expect(['essentiel'], r.id).toContain(r.set);
      expect(r.category, r.id).toBe('tir');
      expect(r.duration, r.id).toBeLessThanOrEqual(1);
      const o = renderSound(r, 0);
      expect(Math.max(...o.samples.map(Math.abs)), r.id).toBeGreaterThan(0.05);
      expect(Math.max(...o.samples.map(Math.abs)), r.id).toBeLessThanOrEqual(1);
    }
  });
  it('sonsChoisis : la variante choisie de chaque arme, le rechargement et le changement ; le Colt joue « tir »', async () => {
    const { sonsChoisis } = await import('../../js/core/armes/partie.js');
    const s = sonsChoisis(sonsJson, table.actives);
    expect(s.tir.m1911).toBe('tir');
    for (const id of UTILES.slice(1)) expect(s.tir[id]).toBe(`tir-${id}-${sonsJson.choix[id]}`);
    expect(s.recettes.map((r) => r.id)).toEqual([...UTILES.slice(1).map((id) => `tir-${id}-${sonsJson.choix[id]}`), 'arme-recharge', 'arme-change']);
    expect(sonsChoisis({ ...sonsJson, choix: { kar98k: 'b' } }, ['kar98k']).tir.kar98k).toBe('tir-kar98k-b');
    expect(sonsChoisis(null, ['kar98k']).tir.kar98k).toBe('tir');
  });
  it('directeur des sons : tir de l\'arme (son), sinon « tir » ; rechargement et changement d\'arme', async () => {
    const { createDirector, direct, soundTable } = await import('../../js/core/sound-director.js');
    const sounds = [...load('data/game/sounds.json').sounds, ...sonsJson.recettes];
    const cfg = { audio: load('data/game/audio.json'), materials: load('data/game/sound-materials.json'), voice: load('data/game/zombie-voice.json'), sounds: soundTable(sounds) };
    const frame = (events) => ({ time: 1, listener: { x: 0, y: 0 }, walls: [], events });
    const ask = (events) => direct(createDirector(3), frame(events), cfg).requests.map((r) => r.sound);
    expect(ask([{ type: 'shot', x: 0, y: 0, son: 'tir-mg42-a' }])).toContain('tir-mg42-a');
    expect(ask([{ type: 'shot', x: 0, y: 0, son: 'inconnu' }])).toContain('tir');
    expect(ask([{ type: 'shot', x: 0, y: 0 }])).toContain('tir');
    expect(ask([{ type: 'armeRecharge', x: 0, y: 0 }])).toEqual(['arme-recharge']);
    expect(ask([{ type: 'armeChange', x: 0, y: 0 }])).toEqual(['arme-change']);
  });
});
