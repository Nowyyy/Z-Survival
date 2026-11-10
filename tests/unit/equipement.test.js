// Lot 8d : objets, équipement, fusion, personnages et statistiques effectives (js/core/equipement.js, pur), option de démarrage étendue (stats,
// js/core/menu-etat.js), données data/menu/ (raretes, objets, personnages, inventaire-depart). Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EMPLACEMENTS, EPSILON, TYPES, ameliorer, ameliorerPersonnage, bonusObjet, bonusTotal, choisirPersonnage, compatibles, creerEtatEquipement, effetCapacite,
  emplacementDe, equiper, etatFusion, fusionnable, fusionner, identiques, infoAmelioration, infoPersonnage, lireCatalogue, objetDe, remplirAuto, retirer,
  statistiquesEffectives,
} from '../../js/core/equipement.js';
import { lireMondes, lireOptionDemarrage, lireStatsOption } from '../../js/core/menu-etat.js';
import { ALL_STAT_IDS, normalizeLevels } from '../../js/core/player-stats.js';
import { readLevels } from '../../js/game/levels-source.js';

const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const DONNEES = { raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') };
const PARAMS = lire('data/game/player-stats.json');
const { cat, depart, erreurs } = lireCatalogue(DONNEES);
const neuf = () => creerEtatEquipement(cat, depart);
// État sans objet porté, Survivant choisi.
const nu = () => EMPLACEMENTS.reduce((e, x) => retirer(e, x), neuf());
const mondes = lireMondes(lire('data/menu/mondes.json'));

describe('données data/menu/ (lireCatalogue)', () => {
  it('fichiers valides, sans erreur ; marqués provisoires', () => {
    expect(erreurs).toEqual([]);
    for (const d of Object.values(DONNEES)) expect(d._provisoire).toMatch(/provisoire|exemple/i);
  });

  it('cinq raretés dans l\'ordre, jetons --rarete-* de tokens.css ; la plus haute sans prix de fusion', () => {
    expect(cat.raretes.map((r) => [r.id, r.nom])).toEqual([['commun', 'Commun'], ['peu-commun', 'Peu commun'], ['rare', 'Rare'], ['epique', 'Épique'], ['legendaire', 'Légendaire']]);
    const tokens = readFileSync('css/tokens.css', 'utf8');
    for (const r of cat.raretes) expect(tokens, r.jeton).toMatch(new RegExp(`${r.jeton}:\\s*#[0-9a-f]{6};`));
    expect(cat.raretes.map((r) => r.prixFusion)).toEqual([100, 250, 600, 1500, null]);
  });

  it('une douzaine d\'objets couvrant les cinq types, chacun dans les cinq raretés, niveaux maximaux croissants', () => {
    expect(cat.objets.size).toBeGreaterThanOrEqual(12);
    expect(new Set([...cat.objets.values()].map((o) => o.type))).toEqual(new Set(TYPES));
    for (const o of ['pistolet', 'gilet', 'bottes', 'gants', 'casquette', 'bague', 'amulette', 'couteau']) expect(cat.objets.has(o), o).toBe(true);
    for (const o of cat.objets.values()) {
      expect(Object.keys(o.raretes), o.id).toEqual(cat.raretes.map((r) => r.id));
      const max = Object.values(o.raretes).map((d) => d.niveauMax);
      expect(max, o.id).toEqual([...max].sort((a, b) => a - b));
      for (const d of Object.values(o.raretes)) expect(Object.keys(d.bonus).length, o.id).toBeGreaterThan(0);
    }
  });

  it('inventaire de départ : 12 objets au moins, toutes raretés, trois triplets identiques ; équipement de la maquette', () => {
    expect(depart.objets.length).toBeGreaterThanOrEqual(12);
    expect(new Set(depart.objets.map((o) => o.rarete)).size).toBe(5);
    const groupes = {};
    for (const o of depart.objets) groupes[`${o.id}|${o.rarete}`] = (groupes[`${o.id}|${o.rarete}`] ?? 0) + 1;
    expect(Object.entries(groupes).filter(([, n]) => n >= 3).map(([k]) => k).sort()).toEqual(['bague|rare', 'bottes|commun', 'gilet|commun']);
    const porte = Object.fromEntries(EMPLACEMENTS.map((e) => [e, depart.porte[e] && objetDe(neuf(), depart.porte[e])]).map(([e, o]) => [e, o ? `${o.id} ${o.rarete}` : null]));
    expect(porte).toEqual({ arme: 'pistolet rare', tenue: 'gilet commun', gants: null, bottes: 'bottes peu-commun', accessoire1: 'amulette epique', accessoire2: null });
  });

  it('personnages : Survivant débloqué et choisi (capacité « [à définir] » sans effet), [Personnage 2] débloqué (capacité d\'exemple), quatre verrouillés ; teintes en jetons', () => {
    expect(cat.personnages.map((p) => [p.id, p.debloque])).toEqual([['survivant', true], ['personnage-2', true], ['personnage-3', false], ['personnage-4', false], ['personnage-5', false], ['personnage-6', false]]);
    expect(depart.choisi).toBe('survivant');
    const [s, p2] = cat.personnages;
    expect([s.capacite.nom, s.capacite.effet, s.capacite.effetParNiveau]).toEqual(['[à définir]', {}, {}]);
    expect(p2.capacite.nom).toMatch(/exemple/);
    expect(Object.keys(p2.capacite.effet).length).toBeGreaterThan(0);
    for (const p of cat.personnages.slice(2)) expect(p.nom).toMatch(/^\[Personnage \d\]$/);
    const tokens = readFileSync('css/tokens.css', 'utf8');
    for (const p of cat.personnages) expect(tokens, p.teinte).toMatch(new RegExp(`${p.teinte}:\\s*#[0-9a-f]{6};`));
  });

  it('validation : objet sans rareté, type inconnu, rareté inconnue, statistique inconnue, personnage sans capacité, exemplaire inconnu, emplacement impossible', () => {
    const objets = { objets: [
      { id: 'vide', nom: 'Vide', type: 'arme', raretes: {} },
      { id: 'bizarre', nom: 'Bizarre', type: 'chapeau', raretes: { commun: { bonus: { vie: 1 }, niveauMax: 5 } } },
      { id: 'ok', nom: 'Ok', type: 'arme', raretes: { commun: { bonus: { vie: 1, magie: 2, degats: -1 }, niveauMax: 5 }, mythique: { niveauMax: 3 } } },
    ] };
    const personnages = { personnages: [{ id: 'sans', nom: 'Sans', teinte: '--menu-perso-2', debloque: true }, { id: 'p', nom: 'P', teinte: 'red', debloque: true, capacite: { nom: 'C' } }] };
    const inventaire = { objets: [{ uid: 'a', id: 'ok', rarete: 'commun', niveau: 99 }, { uid: 'b', id: 'fantome', rarete: 'commun' }, { uid: 'a', id: 'ok', rarete: 'commun' }], equipement: { tenue: 'a', arme: 'zz' } };
    const r = lireCatalogue({ raretes: DONNEES.raretes, objets, personnages, inventaire });
    expect(r.erreurs).toEqual(expect.arrayContaining([
      'objet vide : sans rareté', 'objet bizarre : type inconnu chapeau', 'objet ok : rareté inconnue mythique', 'objet ok (commun) bonus : statistique inconnue magie',
      'objet ok (commun) bonus : valeur invalide pour degats', 'personnage sans : sans capacité', 'personnage p : teinte invalide', 'inventaire : exemplaire invalide b',
      'inventaire : exemplaire invalide a', 'équipement : tenue invalide', 'équipement : arme invalide',
    ]));
    expect([...r.cat.objets.keys()]).toEqual(['ok']);
    expect(r.cat.objets.get('ok').raretes.commun.bonus).toEqual({ vie: 1 });
    expect(r.cat.personnages.map((p) => [p.id, p.teinte])).toEqual([['p', '--menu-perso-inconnu']]);
    expect(r.depart.objets).toEqual([{ uid: 'a', id: 'ok', rarete: 'commun', niveau: 5 }]); // niveau borné au maximum
    expect(Object.values(r.depart.porte).every((u) => u === null)).toBe(true);
    // Fichiers absents : catalogue vide, aucune exception.
    const vide = lireCatalogue({});
    expect([vide.cat.objets.size, vide.cat.personnages.length, vide.depart.objets.length, vide.depart.choisi]).toEqual([0, 0, 0, null]);
    expect(vide.erreurs.length).toBeGreaterThan(0);
  });
});

describe('statistiques effectives', () => {
  const base = { degats: 2, portee: 0, precision: 1, cadence: 0, vitesse: 3, vie: 4, regen: 0, chutes: 1, reparation: 0 };

  it('sans objet porté et avec le Survivant (capacité sans effet) : exactement les niveaux de la sauvegarde (garantie 2)', () => {
    const e = nu();
    expect(Object.values(e.porte)).toEqual([null, null, null, null, null, null]);
    expect(statistiquesEffectives(base, e, cat, PARAMS).niveaux).toEqual(normalizeLevels(base, PARAMS).levels);
    expect(statistiquesEffectives(base, e, cat, PARAMS).bonus).toEqual({});
    // Même valeur que celle que la partie lit dans la sauvegarde (levels-source.js), avec ou sans statistiques « extra », et sans sauvegarde.
    for (const save of [{ stats: base }, { stats: { degats: 10, vie: 3 } }, { stats: {} }]) {
      expect(statistiquesEffectives(save.stats, e, cat, PARAMS).niveaux).toEqual(readLevels('', PARAMS, save).levels);
    }
    expect(statistiquesEffectives(null, e, cat, PARAMS).niveaux).toEqual(readLevels('', PARAMS, null).levels);
    // Partie : normalizeLevels de l'option reçue (main.js) = mêmes niveaux.
    const transmis = lireOptionDemarrage({ mode: 'histoire', monde: 'batiment', stats: statistiquesEffectives(base, e, cat, PARAMS).niveaux }, mondes).stats;
    expect(normalizeLevels(transmis, PARAMS).levels).toEqual(readLevels('', PARAMS, { stats: base }).levels);
  });

  it('un objet : bonus + bonusParNiveau × (niveau − 1) ; arrondi à l\'entier inférieur seulement à la fin', () => {
    let e = equiper(nu(), cat, 'o2'); // Gilet commun niv. 3 : vie 1 + 0,2 × 2 = 1,4
    expect(bonusObjet(cat, objetDe(e, 'o2'))).toEqual({ vie: 1 + 0.2 * 2 });
    expect(statistiquesEffectives({}, e, cat, PARAMS).niveaux.vie).toBe(1);
    expect(statistiquesEffectives({ vie: 4 }, e, cat, PARAMS).niveaux.vie).toBe(5);
    e = ameliorer(ameliorer(e, cat, 'o2'), cat, 'o2'); // niv. 5 : 1 + 0,2 × 4 = 1,8 → 1
    expect(statistiquesEffectives({}, e, cat, PARAMS).niveaux.vie).toBe(1);
  });

  it('plusieurs objets et accessoires doubles : bonus additionnés sans arrondi intermédiaire', () => {
    // Équipement de départ : Pistolet rare 3 (degats 3,6), Gilet commun 3 (vie 1,4), Bottes peu communes 2 (vitesse 2,25), Amulette épique 1 (vie 4).
    const d = statistiquesEffectives({}, neuf(), cat, PARAMS);
    expect(d.bonus).toEqual({ degats: 3 + 0.3 * 2, vie: 1 + 0.2 * 2 + 4, vitesse: 2 + 0.25 });
    expect([d.niveaux.degats, d.niveaux.vie, d.niveaux.vitesse]).toEqual([3, 5, 2]);
    // Deux accessoires : Amulette (vie 4) et Bague rare (regen 3) ; deux bonus fractionnaires (0,4 + 0,6 = 1) comptent ensemble.
    let e = equiper(neuf(), cat, 'o13', 'accessoire2');
    expect([e.porte.accessoire1, e.porte.accessoire2]).toEqual(['o4', 'o13']);
    expect(statistiquesEffectives({}, e, cat, PARAMS).niveaux.regen).toBe(3);
    e = equiper(retirer(e, 'accessoire1'), cat, 'o14', 'accessoire1'); // Bague rare niv. 2 : regen 3,3 ; avec niv. 1 : 3 → 6,3
    expect(statistiquesEffectives({}, e, cat, PARAMS).niveaux.regen).toBe(6);
  });

  it('tolérance de l\'arrondi : 0,2 + 0,7 + 0,1 compte pour 1 ; bornes de player-stats.json (10, chutes 5)', () => {
    const c = { raretes: cat.raretes, objets: new Map([
      ['a', { id: 'a', nom: 'A', type: 'arme', raretes: { commun: { bonus: { vie: 0.2, chutes: 9 }, bonusParNiveau: {}, niveauMax: 1, prixAmelioration: 0 } } }],
      ['b', { id: 'b', nom: 'B', type: 'tenue', raretes: { commun: { bonus: { vie: 0.7, degats: 99 }, bonusParNiveau: {}, niveauMax: 1, prixAmelioration: 0 } } }],
      ['c', { id: 'c', nom: 'C', type: 'gants', raretes: { commun: { bonus: { vie: 0.1 }, bonusParNiveau: {}, niveauMax: 1, prixAmelioration: 0 } } }],
    ]), personnages: [] };
    const e = creerEtatEquipement(c, { objets: ['a', 'b', 'c'].map((id) => ({ uid: id, id, rarete: 'commun', niveau: 1 })), porte: { arme: 'a', tenue: 'b', gants: 'c' }, choisi: null });
    expect(0.2 + 0.7 + 0.1).toBeLessThan(1); // 0,9999999999999999 en virgule flottante (ordre des emplacements : arme, tenue, gants)
    expect(EPSILON).toBe(1e-9);
    const n = statistiquesEffectives({ degats: 4 }, e, c, PARAMS).niveaux;
    expect([n.vie, n.degats, n.chutes]).toEqual([1, 10, 5]);
  });

  it('capacité du personnage : effet + effetParNiveau × (niveau − 1), seulement pour le personnage choisi ; verrouillé : aucun effet', () => {
    const p2 = cat.personnages[1];
    expect(effetCapacite(p2, 1)).toEqual({ vitesse: 1 });
    expect(effetCapacite(p2, 4)).toEqual({ vitesse: 2.5 });
    let e = choisirPersonnage(nu(), cat, 'personnage-2');
    expect(statistiquesEffectives({ vitesse: 1 }, e, cat, PARAMS).niveaux.vitesse).toBe(2);
    e = ameliorerPersonnage(ameliorerPersonnage(e, cat, 'personnage-2'), cat, 'personnage-2'); // niv. 3 : 1 + 0,5 × 2 = 2
    expect(statistiquesEffectives({ vitesse: 1 }, e, cat, PARAMS).niveaux.vitesse).toBe(3);
    expect(bonusTotal(e, cat, 'survivant')).toEqual({}); // aperçu d'un autre personnage (écran Personnages)
    expect(bonusTotal(e, cat, 'personnage-3')).toEqual({});
  });
});

describe('équiper, retirer', () => {
  it('l\'objet va dans l\'emplacement de son type et remplace celui qui y était ; retirer libère l\'emplacement', () => {
    let e = equiper(neuf(), cat, 'o5'); // autre Gilet commun
    expect(e.porte.tenue).toBe('o5');
    e = equiper(e, cat, 'o10'); // Gants commun → emplacement vide
    expect(e.porte.gants).toBe('o10');
    e = retirer(e, 'gants');
    expect(e.porte.gants).toBeNull();
    e = retirer(e, 'o5'); // par l'exemplaire
    expect(e.porte.tenue).toBeNull();
  });

  it('accessoires : premier emplacement libre, sinon le premier ; emplacement demandé ; un objet porté ailleurs est d\'abord retiré', () => {
    let e = equiper(neuf(), cat, 'o12'); // Casquette → accessoire2 (libre)
    expect([e.porte.accessoire1, e.porte.accessoire2]).toEqual(['o4', 'o12']);
    e = equiper(e, cat, 'o13'); // aucun libre → accessoire1
    expect([e.porte.accessoire1, e.porte.accessoire2]).toEqual(['o13', 'o12']);
    e = equiper(e, cat, 'o13', 'accessoire2'); // déplacé : retiré de accessoire1
    expect([e.porte.accessoire1, e.porte.accessoire2]).toEqual([null, 'o13']);
    expect(emplacementDe(e, 'o13')).toBe('accessoire2');
  });

  it('refusé sans exception (même état) : objet inconnu, emplacement impossible, déjà porté, rien à retirer', () => {
    const e = neuf();
    expect(equiper(e, cat, 'inconnu')).toBe(e);
    expect(equiper(e, cat, 'o5', 'arme')).toBe(e);
    expect(equiper(e, cat, 'o5', 'nulle-part')).toBe(e);
    expect(equiper(e, cat, 'o1')).toBe(e);
    expect(equiper(e, cat, 'o1', 'arme')).toBe(e);
    expect(retirer(e, 'gants')).toBe(e);
    expect(retirer(e, 'o5')).toBe(e);
    expect(retirer(e, 'xyz')).toBe(e);
    expect(Object.isFrozen(e) && Object.isFrozen(e.porte) && Object.isFrozen(e.objets)).toBe(true);
  });
});

describe('améliorer', () => {
  it('niveau + 1 jusqu\'à niveauMax ; prix affiché (prixAmelioration), état d\'origine intact ; au maximum : refusé, raison « max »', () => {
    const e0 = neuf();
    expect(infoAmelioration(e0, cat, 'o2')).toEqual({ possible: true, prix: 40, raison: null, niveauMax: 5 });
    let e = ameliorer(e0, cat, 'o2');
    expect([objetDe(e, 'o2').niveau, objetDe(e0, 'o2').niveau]).toEqual([4, 3]);
    e = ameliorer(e, cat, 'o2');
    expect(objetDe(e, 'o2').niveau).toBe(5);
    expect(infoAmelioration(e, cat, 'o2')).toEqual({ possible: false, prix: null, raison: 'max', niveauMax: 5 });
    expect(ameliorer(e, cat, 'o2')).toBe(e);
    expect(ameliorer(e, cat, 'inconnu')).toBe(e);
    expect(infoAmelioration(e, cat, 'inconnu')).toEqual({ possible: false, prix: null, raison: 'inconnu' });
  });
});

describe('fusionner', () => {
  it('triplet valide : un objet de la rareté supérieure (même id), niveau = le plus haut des trois ; porté à la place de l\'objet porté du triplet', () => {
    const e0 = neuf();
    expect(etatFusion(e0, cat, ['o5', 'o6', 'o2'])).toMatchObject({ possible: true, manque: 0, objet: 'gilet', rarete: 'commun', resultat: 'peu-commun', prix: 100, raison: null });
    const { etat: e, uid } = fusionner(e0, cat, ['o5', 'o6', 'o2']);
    expect(uid).toBe('f1');
    expect(objetDe(e, 'f1')).toEqual({ uid: 'f1', id: 'gilet', rarete: 'peu-commun', niveau: 3 });
    expect(['o2', 'o5', 'o6'].map((u) => objetDe(e, u))).toEqual([null, null, null]);
    expect(e.objets.length).toBe(e0.objets.length - 2);
    expect(e.porte.tenue).toBe('f1');
    expect(e0.porte.tenue).toBe('o2'); // ancien état intact
    // Deuxième fusion : uid suivant, résultat non porté.
    const r2 = fusionner(e, cat, ['o7', 'o8', 'o9']);
    expect([r2.uid, objetDe(r2.etat, r2.uid).niveau, emplacementDe(r2.etat, r2.uid)]).toEqual(['f2', 4, null]);
  });

  it('niveau du résultat borné au niveauMax de la nouvelle rareté ; deux accessoires du triplet portés : le résultat en prend un, l\'autre est libéré', () => {
    const c = { raretes: cat.raretes, objets: new Map([['x', { id: 'x', nom: 'X', type: 'accessoire', raretes: { commun: { bonus: { vie: 1 }, bonusParNiveau: {}, niveauMax: 9, prixAmelioration: 0 }, 'peu-commun': { bonus: { vie: 2 }, bonusParNiveau: {}, niveauMax: 4, prixAmelioration: 0 } } }]]), personnages: [] };
    const e0 = creerEtatEquipement(c, { objets: ['a', 'b', 'd'].map((uid, i) => ({ uid, id: 'x', rarete: 'commun', niveau: [9, 2, 1][i] })), porte: { accessoire1: 'b', accessoire2: 'd' }, choisi: null });
    const { etat, uid } = fusionner(e0, c, ['a', 'b', 'd']);
    expect(objetDe(etat, uid).niveau).toBe(4);
    expect([etat.porte.accessoire1, etat.porte.accessoire2]).toEqual([uid, null]);
    expect(fusionnable(c, objetDe(etat, uid))).toBe(false); // pas de rareté supérieure pour cet objet
  });

  it('refusé (état inchangé) : rareté mélangée, id différent, légendaire, incomplet, doublon, inconnu ; « il manque N »', () => {
    const e = neuf();
    expect(etatFusion(e, cat, ['o7', 'o8', 'o3'])).toMatchObject({ possible: false, raison: 'different' }); // Bottes commun ×2 + peu commune
    expect(etatFusion(e, cat, ['o5', 'o6', 'o7'])).toMatchObject({ possible: false, raison: 'different' }); // Gilet ×2 + Bottes
    expect(etatFusion(e, cat, ['o16'])).toMatchObject({ possible: false, raison: 'max', resultat: null }); // Couteau légendaire
    expect(etatFusion(e, cat, ['o5', 'o6', null])).toMatchObject({ possible: false, manque: 1, raison: null, objet: 'gilet', rarete: 'commun', resultat: 'peu-commun' });
    expect(etatFusion(e, cat, ['o5', 'o5', 'o6'])).toMatchObject({ possible: false, raison: 'double' });
    expect(etatFusion(e, cat, ['o5', 'zz', 'o6'])).toMatchObject({ possible: false, raison: 'inconnu' });
    expect(etatFusion(e, cat, [])).toMatchObject({ possible: false, manque: 3, raison: 'vide' });
    expect(etatFusion(e, cat, 'n\'importe quoi')).toMatchObject({ possible: false, raison: 'vide' });
    for (const p of [['o7', 'o8', 'o3'], ['o5', 'o6'], ['o16', 'o16', 'o16'], ['o5', 'o5', 'o6'], null]) expect(fusionner(e, cat, p)).toEqual({ etat: e, uid: null });
  });

  it('objets compatibles (même id et rareté que le premier placé, sinon tous les fusionnables) ; remplir automatiquement (d\'abord les non portés)', () => {
    const e = neuf();
    expect(compatibles(e, cat, ['o5', null, null]).map((o) => o.uid)).toEqual(['o2', 'o5', 'o6']);
    expect(compatibles(e, cat, [null, null, null]).map((o) => o.uid)).not.toContain('o16'); // légendaire exclu
    expect(compatibles(e, cat, ['o16']).length).toBe(0);
    expect(identiques(e, 'o5').map((o) => o.uid)).toEqual(['o2', 'o5', 'o6']);
    expect(remplirAuto(e, cat, ['o2', null, null])).toEqual(['o2', 'o5', 'o6']);
    expect(remplirAuto(e, cat, [null, 'o6', null])).toEqual(['o5', 'o6', 'o2']); // le Gilet porté (o2) en dernier
    // Sans objet placé : groupe de trois de la rareté la plus haute (Bague rare).
    expect(remplirAuto(e, cat, [null, null, null])).toEqual(['o13', 'o14', 'o15']);
    expect(remplirAuto(e, cat, ['o11', null, null])).toEqual(['o11', null, null]); // Gants rare : seul exemplaire
  });
});

describe('personnages', () => {
  it('choisir un personnage débloqué ; verrouillé ou inconnu : refusé', () => {
    const e = neuf();
    const e2 = choisirPersonnage(e, cat, 'personnage-2');
    expect([e.choisi, e2.choisi]).toEqual(['survivant', 'personnage-2']);
    expect(choisirPersonnage(e2, cat, 'personnage-2')).toBe(e2);
    expect(choisirPersonnage(e, cat, 'personnage-3')).toBe(e);
    expect(choisirPersonnage(e, cat, 'inconnu')).toBe(e);
  });

  it('améliorer : niveau + 1 jusqu\'à niveauMax, prix affiché ; verrouillé : ni améliorable ni choisissable', () => {
    let e = neuf();
    expect(infoPersonnage(e, cat, 'survivant')).toEqual({ niveau: 1, niveauMax: 10, prix: 300, choisi: true, verrouille: false, peutAmeliorer: true, raison: null });
    for (let i = 0; i < 12; i += 1) e = ameliorerPersonnage(e, cat, 'survivant');
    expect(infoPersonnage(e, cat, 'survivant')).toMatchObject({ niveau: 10, peutAmeliorer: false, raison: 'max', prix: null });
    expect(ameliorerPersonnage(e, cat, 'survivant')).toBe(e);
    expect(infoPersonnage(e, cat, 'personnage-4')).toMatchObject({ verrouille: true, peutAmeliorer: false, raison: 'verrouille' });
    expect(ameliorerPersonnage(e, cat, 'personnage-4')).toBe(e);
    expect(infoPersonnage(e, cat, 'inconnu')).toBeNull();
    // Le Survivant au niveau 10 n'apporte toujours rien (capacité à définir).
    expect(statistiquesEffectives({ vie: 2 }, EMPLACEMENTS.reduce((x, s) => retirer(x, s), e), cat, PARAMS).niveaux).toEqual(normalizeLevels({ vie: 2 }, PARAMS).levels);
  });
});

describe('option de démarrage : stats (lireOptionDemarrage, lireStatsOption)', () => {
  it('stats absentes : option d\'avant ({ mode, monde }) ; valides : gardées (copie gelée)', () => {
    expect(lireOptionDemarrage({ mode: 'histoire', monde: 'batiment' }, mondes)).toEqual({ mode: 'histoire', monde: 'batiment' });
    const s = { degats: 3, vie: 5, vitesse: 2, chutes: 0 };
    const o = lireOptionDemarrage({ mode: 'infini', monde: 'batiment', stats: s }, mondes);
    expect(o).toEqual({ mode: 'infini', monde: 'batiment', stats: s });
    expect(o.stats).not.toBe(s);
    expect(Object.isFrozen(o.stats)).toBe(true);
    // Mode ou monde invalide : histoire sur le premier monde, stats valides gardées.
    expect(lireOptionDemarrage({ mode: 'pirate', monde: 'batiment', stats: { vie: 1 } }, mondes)).toEqual({ mode: 'histoire', monde: 'batiment', stats: { vie: 1 } });
    const tous = Object.fromEntries(ALL_STAT_IDS.map((k) => [k, 99]));
    expect(lireStatsOption(tous)).toEqual(tous);
  });

  it('stats invalides ou hostiles : champ retiré (la partie lit la sauvegarde)', () => {
    const accesseur = {};
    Object.defineProperty(accesseur, 'vie', { enumerable: true, get: () => 3 });
    class Faux { constructor() { this.vie = 1; } }
    const symbole = { vie: 1, [Symbol('x')]: 2 };
    const herite = Object.create({ vie: 1 });
    const hostiles = [null, 'vie:3', 3, [], [1, 2], {}, { vie: 1.5 }, { vie: -1 }, { vie: 100 }, { vie: '3' }, { vie: Number.NaN }, { magie: 1 }, { vie: 1, __proto__: { degats: 2 } },
      JSON.parse('{"__proto__": {"vie": 1}}'), accesseur, new Faux(), symbole, herite, { vie: 1, degats: Infinity }];
    for (const h of hostiles) {
      expect(lireStatsOption(h), String(h)).toBeNull();
      expect(lireOptionDemarrage({ mode: 'histoire', monde: 'batiment', stats: h }, mondes)).toEqual({ mode: 'histoire', monde: 'batiment' });
    }
    const opt = {};
    Object.defineProperty(opt, 'stats', { enumerable: true, get: () => ({ vie: 3 }) });
    expect(lireOptionDemarrage(Object.assign(opt, { mode: 'histoire', monde: 'batiment' }), mondes)).toEqual({ mode: 'histoire', monde: 'batiment' });
    expect(lireStatsOption(Object.assign(Object.create(null), { vie: 2 }))).toEqual({ vie: 2 });
  });
});
