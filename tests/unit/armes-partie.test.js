import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { armeJeu, lireTable, lourdeur, paletteArmes, statsAvecArme, tempsPourTuer } from '../../js/core/armes/partie.js';
import { aSec, armeActive, armeMontree, avancerInventaire, changerArme, creerInventaire, donnerArme, dureeRecharge, dureesChangement, enRecharge, gesteRecharge, maxEmplacements, munitionsIllimitees, peutTirer, progressionRecharge, recharger, remplirMunitions, texteMunitions, tirer, RANGER } from '../../js/core/armes/inventaire.js';
import { effectiveWeapon, statValues } from '../../js/core/player-stats.js';
import { waveSpec } from '../../js/core/waves.js';
import { armeParId, echelleJeu, lireArmes, maillageArme } from '../../js/core/armes/armes.js';
import { boucheCanon, boucheDevant, OS_TENUE, pointeCanon, tenueArme } from '../../js/core/armes/tenue-jeu.js';
import { muzzlePoint } from '../../js/core/combat.js';
import { departLibre } from '../../js/core/ray.js';
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
    expect(effectiveWeapon(w, {}, statsAvecArme(statsCfg, c))).toEqual({ ...effectiveWeapon(weapons.pistol, {}, statsCfg), id: 'm1911', plombs: 1, vitesse: 1, muzzleSide: 0 }); // retour du propriétaire : muzzleSide (0 sur l'axe)
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
  it.each([['winchester1897', 11], ['thompson', 21], ['garand', 21], ['stg44', 31], ['bar', 31]])('%s : à la manche %i (ouverture du palier), un marcheur tombe en 0,8 s ± 15 %', (id, w) => {
    expect(tempsPourTuer(table.armes[id], vie(w)) / REF).toBeGreaterThan(0.85);
    expect(tempsPourTuer(table.armes[id], vie(w)) / REF).toBeLessThan(1.15);
  });
  it('kar98k : un tir tue un marcheur à la manche 11 ; décision du propriétaire (partie K) : une pause après le verrou, cadence 1,05 s (temps pour tuer 1,05 s, au-dessus de la règle de 0,8 ± 15 %)', () => {
    expect(Math.ceil(vie(11) / table.armes.kar98k.degats - 1e-9)).toBe(1);
    expect(table.armes.kar98k.cadence).toBeGreaterThan(table.armes.kar98k.manoeuvre.debut + table.armes.kar98k.manoeuvre.duree + 0.15);
    expect(tempsPourTuer(table.armes.kar98k, vie(11))).toBeCloseTo(1.05, 9);
  });
  it('MG42 (palier 4, fin de monde) : vie plafonnée de la manche 31 à 40, calibrée sur le nombre de zombies (150 / 98) ± 15 %', () => {
    expect(vie(40)).toBe(vie(31));
    const k = waveSpec(40, waves).total / waveSpec(31, waves).total;
    const t = tempsPourTuer(table.armes.mg42, vie(40));
    expect(t * k / REF).toBeGreaterThan(0.85);
    expect(t * k / REF).toBeLessThan(1.15);
  });
  it('chaque arme s\'essouffle : à la manche d\'ouverture du palier suivant, au moins 1,8 fois plus lente qu\'à la sienne', () => {
    for (const [id, a, b] of [['m1911', 1, 11], ['kar98k', 11, 21], ['winchester1897', 11, 21], ['thompson', 21, 31], ['garand', 21, 31]]) { // kar98k : même rapport avec la cadence de la partie K
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
    expect(s.emplacements).toEqual([{ id: 'm1911', chargeur: 7, reserve: Infinity, recharge: null, prevu: null, vide: false }]);
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
    // Retour du propriétaire : étapes du rechargement (chargeur retiré qui tombe, chargeur remis, glissière relâchée : le Colt était vide).
    expect(r.ev).toEqual([
      { type: 'rechargeEtape', id: 'm1911', son: 'arme-chargeur-sort', lacher: true },
      { type: 'rechargeEtape', id: 'm1911', son: 'arme-chargeur-entre', lacher: false },
      { type: 'rechargeEtape', id: 'm1911', son: 'arme-glissiere-tiree', lacher: false }, // partie J : glissière tirée et relâchée
    ]);
    expect(progressionRecharge(r.st, table)).toBeCloseTo(1.35 / 1.4, 9);
    r = run(r.st, 0.05, 1);
    expect(r.ev.map((e) => e.type)).toEqual(['rechargeFin']);
    expect(armeActive(r.st)).toEqual({ id: 'm1911', chargeur: 7, reserve: Infinity, recharge: null, prevu: null, vide: false });
    // Chargeur pas vide (rechargement à la main) : pas de glissière.
    const partiel = recharger(tirer(r.st), table).state;
    expect(run(partiel, 0.05, 29).ev.filter((e) => e.type === 'rechargeEtape').map((e) => e.son)).toEqual(['arme-chargeur-sort', 'arme-chargeur-entre']);
    expect(aSec(r.st)).toBe(false);
  });
  it('rechargement à la main : chargeur incomplet seulement ; pas pendant un rechargement ; la réserve diminue de ce qui manque', () => {
    let s = donnerArme(creerInventaire(table), table, 'kar98k').state;
    s = run(s, 0.05, 20).st; // sortie
    expect(recharger(s, table).debut).toBe(false); // plein
    s = tirer(tirer(s));
    const r = recharger(s, table);
    expect(r.debut).toBe(true);
    expect(recharger(r.state, table).debut).toBe(false);
    // Retour du propriétaire : le Kar98k se recharge balle par balle (verrou ouvert dès le début, cartouches prises une fois dans la poche puis
    // mises une à une, verrou fermé au début du geste final ; plus de « ching », partie I ; plus lent, partie J).
    expect(armeActive(r.state).prevu).toBe(2);
    expect(dureeRecharge(armeActive(r.state), table.armes.kar98k)).toBeCloseTo(0.95 + 2 * 0.5 + 0.45, 9);
    const fin = run(r.state, 0.05, 49); // 2,4 s (et un pas d'arrondi)
    expect(fin.ev.map((e) => [e.type, e.son])).toEqual([['rechargeEtape', 'arme-verrou-ouvre'], ['rechargeBalle', 'arme-cartouche'], ['rechargeBalle', 'arme-cartouche'], ['rechargeEtape', 'arme-verrou-ferme'], ['rechargeFin', null]]);
    expect(table.armes.kar98k.recharge.poche).toBe('une');
    expect(table.armes.kar98k.rechargement).toBeCloseTo(3.9, 9);
    expect(armeActive(fin.st)).toEqual({ id: 'kar98k', chargeur: 5, reserve: 28, recharge: null, prevu: null, vide: false });
  });
  it('balle par balle (Winchester, Kar98k) : chaque cartouche compte dès qu\'elle est mise ; interrompu, le rechargement garde ses cartouches et reprend', () => {
    let s = run(donnerArme(creerInventaire(table), table, 'winchester1897').state, 0.05, 20).st;
    for (let i = 0; i < 6; i += 1) s = tirer(s);
    let r = run(s, 0.05, 1); // départ automatique : chargeur vide
    expect(armeActive(r.st).prevu).toBe(6);
    expect(table.armes.winchester1897.rechargement).toBeCloseTo(0.75 + 6 * 0.36 + 0.4, 9); // partie K : une seule fois à la poche
    r = run(r.st, 0.05, 23); // 1,15 s : une cartouche (0,75 + 0,36 = 1,11)
    expect(armeActive(r.st).chargeur).toBe(1);
    expect(armeActive(r.st).reserve).toBe(29);
    expect(gesteRecharge(r.st, table).balle).toBe(true);
    s = changerArme(r.st, table).state; // interrompu
    expect(s.emplacements[1].chargeur).toBe(1);
    s = run(s, 0.05, 20).st;
    s = changerArme(s, table).state;
    s = run(s, 0.05, 80).st;
    expect(armeActive(s)).toEqual({ id: 'winchester1897', chargeur: 6, reserve: 24, recharge: null, prevu: null, vide: false });
  });
  it('Garand : « ping » seulement au dernier tir (retour du propriétaire, partie I) ; rechargé avec des cartouches restantes, le clip tombe sans ping', () => {
    const pret = run(donnerArme(creerInventaire(table), table, 'garand').state, 0.05, 20).st;
    let s = recharger(tirer(pret), table).state;
    expect(run(s, 0.05, 41).ev.filter((e) => e.type === 'rechargeEtape').map((e) => [e.son, e.lacher])).toEqual([[null, true], ['arme-chargeur-entre', false], ['arme-glissiere', false]]);
    s = pret;
    for (let i = 0; i < 8; i += 1) s = tirer(s);
    expect(run(s, 0.05, 42).ev.filter((e) => e.type === 'rechargeEtape').map((e) => e.son)).toEqual(['arme-chargeur-entre', 'arme-glissiere']);
    expect(table.armes.garand.dernierTir).toEqual({ son: 'arme-ping', lacher: true });
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
    // Retour du propriétaire : ranger le Colt (moitié de son maniement, 0,19 s) puis sortir la Thompson (moitié du sien, 0,32 s).
    expect(s.sortie.ranger).toBeCloseTo(0.19, 9);
    expect(s.sortie.total).toBeCloseTo(0.51, 9);
    expect([s.sortie.t, s.sortie.de, s.sortie.ancien]).toEqual([0, 0, null]);
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
  it('changement : ranger l\'arme tenue à son rythme, sortir la nouvelle au sien (moitié du maniement de chacune) ; pas de tir pendant ; un rechargement interrompu reprend à la sortie suivante', () => {
    let s = run(donnerArme(creerInventaire(table), table, 'bar').state, 0.05, 20).st;
    s = tirer(s);
    s = recharger(s, table).state;
    s = run(s, 0.05, 20).st; // 1 s de rechargement sur 2,8
    const avant = armeActive(s).recharge;
    expect(avant).toBeCloseTo(1, 9);
    s = changerArme(s, table).state;
    expect(armeActive(s).id).toBe('m1911');
    // Retour du propriétaire : ranger le BAR est lent (0,46 s), sortir le Colt rapide (0,19 s) ; dans l'autre sens, l'inverse.
    expect(s.sortie.ranger).toBeCloseTo(0.46, 9);
    expect(s.sortie.total).toBeCloseTo(0.65, 9);
    expect(armeMontree(s).id).toBe('bar');
    expect(armeMontree(run(s, 0.05, 9).st).id).toBe('bar'); // 0,45 s : on range encore
    expect(armeMontree(run(s, 0.05, 10).st).id).toBe('m1911');
    expect(RANGER).toBe(0.5);
    expect(dureesChangement(table, 'm1911', 'bar')).toEqual({ t: 0, ranger: 0.19, total: 0.19 + 0.46 });
    expect(peutTirer(s)).toBe(false);
    s = run(s, 0.05, 14).st;
    expect(s.sortie).toBeNull();
    expect(peutTirer(s)).toBe(true);
    expect(s.emplacements[1].recharge).toBeCloseTo(1, 9); // gardé
    s = changerArme(s, table).state;
    expect(s.sortie.ranger).toBeCloseTo(0.19, 9); // ranger le Colt : rapide
    s = run(s, 0.05, 14).st; // 0,19 + 0,46 s
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
  it('retour du propriétaire : bout du canon (avant et côté) = position de la pose + rotation × pointe ; balles et laser en partent', () => {
    const t = { position: [-5, 40, 18], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
    expect(boucheCanon(t, [0, 1, 30])).toEqual({ avant: 48, cote: -5, hauteur: 41 });
    const c = Math.cos(Math.PI / 6);
    const r30 = { position: [0, 0, 0], rotation: [c, 0, 0.5, 0, 1, 0, -0.5, 0, c] }; // lacet de 30°
    expect(boucheCanon(r30, [0, 0, 10]).cote).toBeCloseTo(5, 9);
    expect(boucheCanon(r30, [0, 0, 10]).avant).toBeCloseTo(10 * c, 9);
    // muzzlePoint : côté = x du repère du personnage tourné comme lui ((sin a, −cos a)) ; 0 : exactement le point d'avant.
    expect(muzzlePoint({ x: 0, y: 0 }, 0, 30, null, -5)).toEqual({ x: 30, y: 5 });
    expect(muzzlePoint({ x: 1, y: 2 }, 1, 26, null, 0)).toEqual(muzzlePoint({ x: 1, y: 2 }, 1, 26, null));
    for (const id of UTILES) {
      const tn = tenueArme({ variant, skeletons: posesV2.skeletons, posesV2, posesArmes, id, corps: characters.corps });
      const m = maillageArme(donnees, armeParId(donnees, id), armeParId(donnees, id).variantes[0], { pose: 'main', enJeu: true });
      const b = boucheCanon(tn, pointeCanon(m.positions));
      expect(b.avant, id).toBeGreaterThan(26);
      expect(Math.abs(b.cote), id).toBeLessThan(15);
    }
  });
  it('retour du propriétaire : collé à un mur, le départ est ramené devant lui (jamais de l\'autre côté)', () => {
    const mur = [{ id: 'mur', x: 20, y: -50, w: 10, h: 100 }];
    const d = departLibre({ x: 0, y: 0 }, { x: 40, y: 0 }, null, mur);
    expect(d.x).toBeCloseTo(19.5, 9);
    expect(d.y).toBeCloseTo(0, 9);
    expect(departLibre({ x: 0, y: 0 }, { x: 15, y: 3 }, null, mur)).toEqual({ x: 15, y: 3 });
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
    expect(s.recettes.map((r) => r.id)).toEqual([...UTILES.slice(1).map((id) => `tir-${id}-${sonsJson.choix[id]}`), ...sonsJson.recettes.filter((r) => !r.id.startsWith('tir-')).map((r) => r.id)]);
    // Retour du propriétaire : chaque son nommé par la table (étapes, balle par balle, manœuvre, dernier tir) existe.
    const noms = new Set(s.recettes.map((r) => r.id));
    for (const id of table.actives) {
      const e = table.armes[id];
      const sons = [...(e.recharge.etapes ?? []).map((x) => x.son), ...Object.values(e.recharge.sons ?? {}), e.manoeuvre?.son, e.dernierTir?.son].filter(Boolean);
      for (const n of sons) expect(noms.has(n), `${id} : ${n}`).toBe(true);
    }
    expect(noms.has('arme-tombe')).toBe(true);
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
    expect(ask([{ type: 'armeSon', son: 'arme-verrou-ferme', x: 0, y: 0 }])).toEqual(['arme-verrou-ferme']);
    expect(ask([{ type: 'armeSon', son: 'inconnu', x: 0, y: 0 }])).toEqual([]);
    const tombe = direct(createDirector(3), frame([{ type: 'armeSon', son: 'arme-tombe', delay: 0.4, x: 0, y: 0 }]), cfg).requests[0];
    expect([tombe.sound, tombe.delay]).toEqual(['arme-tombe', 0.4]);
  });
});

// Retours du propriétaire, partie I : la main va prendre le chargeur dans la poche ; chargeur au sol de la forme, de la taille et de la couleur
// de celui de l'arme ; arme plus animée ; tirs qui sonnent différemment.
describe('rechargement animé et chargeurs des modèles (partie I)', () => {
  it('chorégraphie « chargeur » : retirer (il tombe), poche (le chargeur neuf est dans la main), le claquer, culasse seulement si l\'arme était vide', async () => {
    const { choregraphieChargeur, entreCles, dans, secousse, surCorps } = await import('../../js/core/armes/geste.js');
    const vide = choregraphieChargeur(table.armes.m1911, true);
    // Partie J : glissière atteinte, saisie au début du son, tirée (0,12 s), lâchée (0,17 s).
    expect(vide.cles.map((k) => k.cible)).toEqual(['prise', 'chargeur', 'chargeur', 'poche', 'poche', 'chargeur', 'culasse', 'culasse', 'culasse2', 'culasse2', 'prise', 'prise']);
    const g = vide.cles.findIndex((k) => k.cible === 'culasse2');
    expect((vide.cles[g].t - vide.cles[g - 1].t) * table.armes.m1911.rechargement).toBeCloseTo(0.12, 9);
    expect(vide.clesD).toBeNull(); // glissière : main gauche
    const mg = choregraphieChargeur(table.armes.mg42, true); // levier à droite : main droite, la gauche reste sur sa prise
    expect(mg.clesD.map((k) => k.cible)).toContain('culasse2');
    expect(mg.cles.map((k) => k.cible)).not.toContain('culasse');
    const partiel = choregraphieChargeur(table.armes.m1911, false);
    expect(partiel.cles.map((k) => k.cible)).not.toContain('culasse');
    for (const k of [...vide.cles, ...partiel.cles]) expect(k.t).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < vide.cles.length; i += 1) expect(vide.cles[i].t).toBeGreaterThanOrEqual(vide.cles[i - 1].t);
    // Le chargeur neuf est dans la main de la poche à l'arme ; l'arme est sans chargeur du retrait à l'insertion.
    const [o0, o1] = vide.objet[0];
    expect(dans(vide.objet, (o0 + o1) / 2)).toBe(true);
    expect(entreCles(vide.cles, o0).vers).toBe('poche');
    expect(vide.sans).toEqual([[0.12, 0.6]]);
    expect(surCorps('poche')).toBe(true);
    expect(surCorps('chargeur')).toBe(false);
    expect(secousse(vide.secousses, 0.6)).toBe(1);
    expect(secousse(vide.secousses, 0.3)).toBe(0);
    // Chaque arme à chargeur a un geste à chaque étape qui compte (retirer, insérer).
    for (const id of ['m1911', 'thompson', 'garand', 'stg44', 'bar', 'mg42']) {
      expect(table.armes[id].piece, id).toBe(true);
      expect(table.armes[id].recharge.etapes.some((e) => e.geste === 'insere' || e.geste === 'pousse'), id).toBe(true); // Garand : clip poussé par le dessus (partie K)
    }
  });
  it('chorégraphie « balle » : Winchester et Kar98k, une seule fois à la poche, cartouches enfoncées une à une (par-dessous, par le dessus) ; pompe ou verrou à la fin', async () => {
    const { choregraphieBalle } = await import('../../js/core/armes/geste.js');
    // Partie J : Kar98k, une seule fois à la poche, puis les cartouches enfoncées une à une ; verrou à la main droite.
    const k = choregraphieBalle(table.armes.kar98k, 3);
    // Partie L : la main gauche tient l'arme tout du long ; la droite fait tout (verrou, poche droite, cartouches) ; le verrou dessiné suit.
    expect(k.cles.every((c) => c.cible === 'prise')).toBe(true);
    expect(k.clesD.filter((c) => c.cible === 'pocheD').length).toBe(2);
    expect(k.clesD.filter((c) => c.cible === 'portApprocheD').length).toBe(3);
    expect(k.clesD.map((c) => c.cible)).toContain('culasse2');
    expect(k.objet.length).toBe(1);
    expect(k.objetCote).toBe('droite');
    const { entreValeurs } = await import('../../js/core/armes/geste.js');
    expect(entreValeurs(k.verrou, 0.5)).toEqual({ lift: 1, back: 1 }); // culasse ouverte pendant le chargement
    expect(entreValeurs(k.verrou, 1)).toEqual({ lift: 0, back: 0 });
    const w = choregraphieBalle(table.armes.winchester1897, 2);
    expect(w.cles.map((c) => c.cible)).toContain('pompe2');
    expect(w.cles.filter((c) => c.cible === 'poche').length).toBe(2); // partie K : une seule fois à la poche
    expect(w.objet.length).toBe(1);
    expect(w.cles.filter((c) => c.cible === 'portApproche').length).toBe(2);
    // Garand (partie K) : le clip est présenté au-dessus du boîtier puis enfoncé ; le pouce se retire vers le haut.
    const { choregraphieChargeur } = await import('../../js/core/armes/geste.js');
    const g = choregraphieChargeur(table.armes.garand, true).cles.map((c) => c.cible);
    expect(g.slice(g.indexOf('poche'))).toEqual(['poche', 'poche', 'dessus', 'chargeur', 'chargeur', 'dessus', 'prise', 'prise']);
    expect(table.armes.garand.rechargement).toBeCloseTo(2.8, 9);
    expect(w.cles.at(-1)).toEqual({ t: 1, cible: 'prise' });
  });
  it('chargeur au sol = pièces du chargeur du modèle (forme, taille, matière de l\'arme) ; pièces cachées (Colt, Garand) jamais sur l\'arme tenue', async () => {
    const { maillageChargeur, piecesArme } = await import('../../js/core/armes/armes.js');
    const donnees = lireArmes(load('data/armes/armes.json'));
    for (const id of UTILES) {
      const a = armeParId(donnees, id);
      const c = maillageChargeur(donnees, a, a.variantes[0]);
      if (!table.armes[id].piece) {
        expect(c, id).toBeNull(); // Kar98k et Winchester : pas de chargeur
        continue;
      }
      expect(c.positions.length, id).toBeGreaterThan(0);
      expect(c.colors.length / 3, id).toBe(c.positions.length / 3); // couleurs de la matière de l'arme
      expect(Math.max(...c.dims), id).toBeLessThan(12);
      const toutes = piecesArme(a, a.variantes[0]);
      expect(toutes.some((p) => p.seulChargeur), id).toBe(false);
      const sans = piecesArme(a, a.variantes[0], 'main', { chargeur: 'sans' });
      if (id === 'garand') expect(sans.length, id).toBe(toutes.length); // son clip est caché dans le boîtier : rien à retirer de l'arme tenue
      else expect(sans.length, id).toBeLessThan(toutes.length);
      expect(sans.some((p) => p.chargeur), id).toBe(false);
    }
    // Pièces cachées : seulement dans le chargeur lâché (corps du chargeur du Colt, clip du Garand).
    for (const id of ['m1911', 'garand']) expect(piecesArme(armeParId(donnees, id), null, 'main', { chargeur: true }).some((p) => p.seulChargeur), id).toBe(true);
  });
  it('tirs : chaque arme a son propre son (recettes a toutes différentes, durées audibles de 0,25 à 1 s) ; culasse et pompe ôtées des tirs (jouées à la manœuvre) ; plus de « ching »', () => {
    const sons = load('data/game/sons-armes.json');
    const a = UTILES.slice(1).map((id) => sons.recettes.find((r) => r.id === `tir-${id}-a`));
    const formes = new Set(a.map((r) => JSON.stringify(r.layers)));
    expect(formes.size).toBe(a.length);
    expect(new Set(a.map((r) => r.duration)).size).toBeGreaterThanOrEqual(5);
    for (const id of ['kar98k', 'winchester1897']) for (const v of ['a', 'b']) {
      const r = sons.recettes.find((x) => x.id === `tir-${id}-${v}`);
      expect(r.layers.some((l) => l.type === 'ring' && l.start >= 0.5), `${id}-${v}`).toBe(false);
    }
    expect(sons.recettes.some((r) => r.id === 'arme-verrou-ching')).toBe(false);
    expect(table.armes.winchester1897.manoeuvre.son).toBe('arme-pompe');
    expect(table.armes.winchester1897.recharge.sons.fin).toBe('arme-pompe');
  });
});

// Retours du propriétaire, partie J : mains sur l'arme (poignets de la pose de tenue), leviers d'armement aux places du modèle, chargeurs au sol
// grossis, sons calés sur les gestes.
describe('mains, leviers et sons calés (partie J)', () => {
  const characters = load('data/game/characters-v2.json');
  const posesV2 = load('data/game/poses-v2.json');
  const posesArmes = load('data/armes/poses.json');
  const variant = characters.slots.find((s) => s.id === 'joueur').variants.find((v) => v.id === 'A');
  it.each(UTILES)('%s : poignets de la tenue dans le repère de l\'arme, près des prises (la main ne rentre plus dans l\'arme)', (id) => {
    const t = tenueArme({ variant, skeletons: posesV2.skeletons, posesV2, posesArmes, id, corps: characters.corps });
    const donnees = lireArmes(load('data/armes/armes.json'));
    const a = armeParId(donnees, id);
    const sc = echelleJeu(donnees, a);
    const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    expect(d(t.poignets.droit, a.prises.droite.map((v) => v * sc)), id).toBeLessThan(4.5);
    expect(d(t.poignets.droit, a.prises.droite.map((v) => v * sc)), id).toBeGreaterThan(0.5); // le poignet n'est pas le point tenu
    if (a.prises.gauche) expect(d(t.poignets.gauche, a.prises.gauche.map((v) => v * sc)), id).toBeLessThan(4.5);
  });
  it('leviers d\'armement : Colt (glissière), Thompson, StG 44, BAR à gauche ; Garand, MG42, Kar98k à droite ; chargeurs au sol grossis', () => {
    expect(table.echellePieces).toBeGreaterThan(1);
    for (const [id, main] of [['m1911', 'gauche'], ['thompson', 'gauche'], ['stg44', 'gauche'], ['bar', 'gauche'], ['garand', 'droite'], ['mg42', 'droite'], ['kar98k', 'droite']]) {
      expect(table.armes[id].levier?.main, id).toBe(main);
      expect(table.armes[id].levier.course, id).toBeGreaterThan(0);
    }
    // Après un chargeur vide : glissière ou levier tiré (étape culasse siVide) pour le Colt, la Thompson, la StG 44, le BAR et la MG42.
    for (const id of ['m1911', 'thompson', 'stg44', 'bar', 'mg42']) expect(table.armes[id].recharge.etapes.some((e) => e.geste === 'culasse' && e.siVide), id).toBe(true);
  });
  it('manœuvres calées sur leur son : pompe (arrière 0,06 s, avant 0,21 s) ; verrou du Kar98k un peu plus lent (butée 0,16, rabattu 0,50) et dans la cadence', async () => {
    const { entreClesManoeuvre } = await import('../../js/core/armes/geste.js');
    const w = table.armes.winchester1897.manoeuvre;
    expect(entreClesManoeuvre(w, w.debut + 0.06)).toMatchObject({ vers: 'pompe2', k: 1 });
    expect(entreClesManoeuvre(w, w.debut + 0.21)).toMatchObject({ de: 'pompe2', vers: 'pompe', k: 1 });
    const k = table.armes.kar98k.manoeuvre;
    expect(entreClesManoeuvre(k, k.debut + 0.16).vers).toBe('culasse2');
    expect(k.debut + k.duree).toBeLessThanOrEqual(table.armes.kar98k.cadence);
    const sons = load('data/game/sons-armes.json');
    expect(sons.recettes.find((r) => r.id === 'arme-verrou').duration).toBeGreaterThanOrEqual(0.6);
    expect(sons.recettes.some((r) => r.id === 'arme-glissiere-tiree')).toBe(true);
  });
});


// Retours du propriétaire, partie M : un léger délai après chaque rechargement avant de pouvoir tirer ; tintement des cartouches remises une à une.
describe('délai après le rechargement et tintement des cartouches (partie M)', () => {
  const run = (s0, dt, n) => {
    let st = s0;
    const ev = [];
    for (let i = 0; i < n; i += 1) {
      const r = avancerInventaire(st, table, dt);
      st = r.state;
      ev.push(...r.evenements);
    }
    return { st, ev };
  };
  it('rechargement fini : pas de tir pendant apresRecharge (0,3 s), puis le tir revient ; un changement d\'arme l\'annule (la sortie le remplace)', async () => {
    const { enAttente } = await import('../../js/core/armes/inventaire.js');
    expect(table.apresRecharge).toBeCloseTo(0.3, 9);
    let s = creerInventaire(table);
    for (let i = 0; i < 7; i += 1) s = tirer(s);
    let r = run(s, 0.05, 30); // 1,4 s de rechargement (et le pas qui le démarre)
    expect(r.ev.some((e) => e.type === 'rechargeFin')).toBe(true);
    expect(armeActive(r.st).chargeur).toBe(7);
    expect(peutTirer(r.st)).toBe(false);
    expect(enAttente(r.st)).toBe(true);
    r = run(r.st, 0.05, 5);
    expect(peutTirer(r.st)).toBe(false); // 0,25 s
    r = run(r.st, 0.05, 1);
    expect(peutTirer(r.st)).toBe(true); // 0,3 s
    expect(enAttente(r.st)).toBe(false);
    // Balle par balle aussi.
    let k = run(donnerArme(creerInventaire(table), table, 'kar98k').state, 0.05, 20).st;
    k = recharger(tirer(k), table).state;
    const fin = run(k, 0.05, 39); // 0,95 + 0,5 + 0,45 = 1,9 s
    expect(fin.ev.some((e) => e.type === 'rechargeFin')).toBe(true);
    expect(peutTirer(fin.st)).toBe(false);
    expect(changerArme(fin.st, table).state.attente).toBe(0);
  });
  it('cartouches remises une à une (Kar98k, Winchester) : petit son métallique et froid (partiels aigus amortis tout de suite, bref)', () => {
    const sons = load('data/game/sons-armes.json');
    const c = sons.recettes.find((r) => r.id === 'arme-cartouche');
    expect(c.duration).toBeLessThanOrEqual(0.25);
    const partiels = c.layers.filter((l) => l.type === 'ring').flatMap((l) => l.partials.map((x) => x.freq));
    expect(Math.min(...partiels.filter((f) => f > 4000))).toBeGreaterThan(4000);
    expect(c.layers.some((l) => l.type === 'osc')).toBe(false); // pas de coup sourd : un tintement
    // Partie N : métallique et froid, pas de clochette : aucun partiel qui tient (amortis en 10 ms au plus), son très bref.
    expect(Math.max(...c.layers.filter((l) => l.type === 'ring').flatMap((l) => l.partials.map((x) => x.decay)))).toBeLessThanOrEqual(0.01);
    expect(c.duration).toBeLessThanOrEqual(0.12);
    for (const id of ['kar98k', 'winchester1897']) expect(table.armes[id].recharge.sons.balle).toBe('arme-cartouche');
  });
});
