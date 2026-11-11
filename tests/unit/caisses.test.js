// Lot 8e : caisses mystère de la Boutique (js/core/caisses.js, pur) : données data/menu/caisses.json, chances affichées, tirage déterministe par
// graine, ×10, répartition conforme aux chances (graines fixées : aucun hasard dans le test), refus sans exception, ajout à l'inventaire du lot 8d
// (ajouterObjets de js/core/equipement.js) : objets obtenus utilisables comme les autres (équiper, fusionner, statistiques). Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TEINTE_DEFAUT, TIRAGES_X10, ajouterCosmetiques, bornes, chances, elementsDe, lireCaisses, lireCosmetiques, lireOffres, objetsDeRarete, offresDuJour, prixAchat, resume, tirer, tirer10, tirerN } from '../../js/core/caisses.js';
import { ajouterObjets, ameliorerPersonnage, choisirPersonnage, creerEtatEquipement, equiper, estDebloque, etatFusion, fusionner, infoPersonnage, lireCatalogue, objetDe, obtenirPersonnages, statistiquesEffectives } from '../../js/core/equipement.js';

const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const DONNEES = { raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') };
const JSON_CAISSES = lire('data/menu/caisses.json');
const PARAMS = lire('data/game/player-stats.json');
const { cat: catBase, depart } = lireCatalogue(DONNEES);
// Lot 8e, retour du propriétaire : catalogue complété des tenues (cosmétiques) ; caisses d'équipement, de personnages et de tenues, offres du jour.
const JSON_COSM = lire('data/menu/cosmetiques.json');
const erreursCosm = [];
const cat = { ...catBase, cosmetiques: lireCosmetiques(JSON_COSM, catBase.raretes, erreursCosm) };
const { caisses: toutes, erreurs } = lireCaisses(JSON_CAISSES, cat);
const caisses = toutes.filter((c) => c.type === 'equipement');
const caisse = (id) => caisses.find((c) => c.id === id);
const RARETES = cat.raretes.map((r) => r.id);
const TOKENS = readFileSync('css/tokens.css', 'utf8');
const N = 10_000;
// Écart toléré entre fréquence observée et chance : 4 écarts-types de la loi binomiale (√(p(1 − p) / n)). Les graines sont fixées (0 à n − 1) : le
// test est déterministe ; pour un tirage réellement uniforme, un écart de plus de 4 σ n'arrive qu'environ 6 fois sur 100 000 par fréquence.
const borne = (p, n) => 4 * Math.sqrt((p * (1 - p)) / n);

describe('données data/menu/caisses.json (lireCaisses)', () => {
  it('fichier valide, sans erreur, marqué provisoire ; trois caisses dans l\'ordre, raretés de la demande', () => {
    expect([erreurs, erreursCosm]).toEqual([[], []]);
    expect([JSON_CAISSES._provisoire, JSON_COSM._provisoire]).toEqual([expect.stringMatching(/provisoire/i), expect.stringMatching(/exemple/i)]);
    expect(toutes.map((c) => [c.id, c.type])).toEqual([['ravitaillement', 'equipement'], ['militaire', 'equipement'], ['elite', 'equipement'], ['recrues', 'personnage'], ['tenues', 'cosmetique']]);
    expect(caisses.map((c) => c.id)).toEqual(['ravitaillement', 'militaire', 'elite']);
    expect(caisses.map((c) => c.nom)).toEqual(['Caisse de ravitaillement', 'Caisse militaire', 'Caisse d\'élite']);
    expect(caisse('ravitaillement').chances.map((x) => x.rarete)).toEqual(['commun', 'peu-commun', 'rare']);
    expect(caisse('militaire').chances.map((x) => x.rarete)).toEqual(['peu-commun', 'rare', 'epique']);
    expect(caisse('elite').chances.map((x) => x.rarete)).toEqual(['epique', 'legendaire']);
  });

  it('chances : somme de 100 par caisse, raretés connues, pour cent > 0 ; chaque rareté tirable a des objets dans le catalogue', () => {
    for (const c of caisses) {
      expect(c.chances.reduce((s, x) => s + x.pourcent, 0), c.id).toBeCloseTo(100, 9);
      for (const x of c.chances) {
        expect(RARETES, c.id).toContain(x.rarete);
        expect(x.pourcent).toBeGreaterThan(0);
        expect(objetsDeRarete(cat, x.rarete).length, `${c.id} ${x.rarete}`).toBeGreaterThan(0);
      }
      // Les mêmes valeurs que le fichier (aucune rareté perdue ni ajoutée).
      expect(Object.fromEntries(c.chances.map((x) => [x.rarete, x.pourcent]))).toEqual(JSON_CAISSES.caisses.find((j) => j.id === c.id).chances);
    }
  });

  it('prix entiers (×1 et ×10) ; teintes : jetons existants de tokens.css, doré pour l\'élite', () => {
    for (const c of caisses) {
      expect(Number.isInteger(c.prix) && Number.isInteger(c.prix10)).toBe(true);
      expect(prixAchat(c, 1)).toBe(c.prix);
      expect(prixAchat(c, 10)).toBe(c.prix10);
      expect(prixAchat(c, 3)).toBeNull();
      expect(TOKENS, c.teinte).toMatch(new RegExp(`${c.teinte}:`));
    }
    expect(caisse('elite').teinte).toBe('--rarete-legendaire');
    expect(TOKENS).toMatch(new RegExp(`${TEINTE_DEFAUT}:`));
  });

  it('entrées invalides refusées sans exception (erreur listée, caisse ignorée) : somme ≠ 100, rareté inconnue, chance nulle, prix, identifiant, teinte', () => {
    const base = JSON_CAISSES.caisses[0];
    const un = (c) => lireCaisses({ caisses: [{ ...base, ...c }] }, cat);
    expect(un({ chances: { commun: 70, 'peu-commun': 25 } }).caisses).toEqual([]);
    expect(un({ chances: { commun: 95, inconnue: 5 } }).caisses).toEqual([]);
    expect(un({ chances: { commun: 100, rare: 0 } }).caisses).toEqual([]);
    expect(un({ chances: { commun: '100' } }).caisses).toEqual([]);
    expect(un({ prix: -1 }).caisses).toEqual([]);
    expect(un({ prix10: 1.5 }).caisses).toEqual([]);
    expect(un({ id: 'Avec Espace' }).caisses).toEqual([]);
    expect(un({ nom: '' }).caisses).toEqual([]);
    const teinte = un({ teinte: 'red' });
    expect(teinte.caisses[0].teinte).toBe(TEINTE_DEFAUT);
    expect(teinte.erreurs.join()).toMatch(/teinte/);
    expect(lireCaisses({ caisses: [base, base] }, cat).caisses).toHaveLength(1);
    for (const j of [null, undefined, 3, 'x', [], {}, { caisses: 'x' }]) expect(() => lireCaisses(j, cat)).not.toThrow();
    expect(lireCaisses(JSON_CAISSES, null)).toEqual({ caisses: [], erreurs: ['caisses : catalogue absent'] });
    // 0,1 + 0,2 + 99,7 : somme à 10⁻⁹ près acceptée.
    expect(un({ chances: { commun: 0.1, 'peu-commun': 0.2, rare: 99.7 } }).caisses).toHaveLength(1);
  });

  it('règle écrite : une rareté tirable sans objet dans le catalogue fait refuser la caisse (et le tirage d\'une caisse forgée rend null)', () => {
    const objetsSansLegendaire = { ...DONNEES.objets, objets: DONNEES.objets.objets.map((o) => ({ ...o, raretes: Object.fromEntries(Object.entries(o.raretes).filter(([r]) => r !== 'legendaire')) })) };
    const cat2 = { ...lireCatalogue({ ...DONNEES, objets: objetsSansLegendaire }).cat, cosmetiques: cat.cosmetiques };
    expect(objetsDeRarete(cat2, 'legendaire')).toEqual([]);
    const lu = lireCaisses(JSON_CAISSES, cat2);
    expect(lu.caisses.map((c) => c.id)).toEqual(['ravitaillement', 'militaire', 'recrues', 'tenues']);
    expect(lu.erreurs).toEqual(['caisse elite : aucun objet legendaire dans le catalogue']);
    // Caisse valide pour le catalogue complet, tirée avec le catalogue réduit : jamais d'objet inventé.
    const legendaires = Array.from({ length: 400 }, (_, g) => tirer(caisse('elite'), cat2, g));
    expect(legendaires.some((o) => o === null)).toBe(true);
    expect(legendaires.filter(Boolean).every((o) => o.rarete === 'epique')).toBe(true);
  });
});

describe('chances affichées (E3-6)', () => {
  it('liste « rareté, pour cent » dans l\'ordre des raretés, noms des données, objets possibles par rareté (ordre du catalogue)', () => {
    const c = chances(caisse('ravitaillement'), cat);
    expect(c.map((x) => [x.rarete, x.nom, x.pourcent])).toEqual([['commun', 'Commun', 70], ['peu-commun', 'Peu commun', 25], ['rare', 'Rare', 5]]);
    for (const x of c) expect(x.objets.map((o) => o.id)).toEqual([...cat.objets.values()].filter((o) => o.raretes[x.rarete]).map((o) => o.id));
    expect(c[0].objets[0]).toEqual({ id: 'pistolet', nom: 'Pistolet' });
    expect(bornes(caisse('militaire'), cat)).toEqual({ min: 'peu-commun', max: 'epique', n: 3 });
    expect(bornes(caisse('elite'), cat)).toEqual({ min: 'epique', max: 'legendaire', n: 2 });
    for (const x of [null, {}, { chances: [] }, { chances: [{ rarete: 'x', pourcent: 5 }] }]) {
      expect(chances(x, cat)).toEqual([]);
      expect(bornes(x, cat)).toBeNull();
    }
    expect(chances(caisse('elite'), null)).toEqual([]);
  });
});

describe('tirage (tirer, tirer10)', () => {
  it('déterministe pour une graine donnée ; objet du catalogue dans une rareté de la caisse, niveau 1 ; l\'entrée n\'est pas modifiée', () => {
    for (const c of caisses) {
      const avant = JSON.stringify(c);
      for (const g of [0, 1, 2, 42, 123456789, 2 ** 32 - 1, 2 ** 40]) {
        const o = tirer(c, cat, g);
        expect(o).toEqual(tirer(c, cat, g));
        expect(Object.keys(o).sort()).toEqual(['id', 'niveau', 'rarete']);
        expect(o.niveau).toBe(1);
        expect(c.chances.map((x) => x.rarete)).toContain(o.rarete);
        expect(cat.objets.get(o.id).raretes[o.rarete]).toBeTruthy();
      }
      expect(JSON.stringify(c)).toBe(avant);
    }
    // Graines différentes : résultats différents (au moins une fois sur 20).
    const vus = new Set(Array.from({ length: 20 }, (_, g) => JSON.stringify(tirer(caisse('ravitaillement'), cat, g))));
    expect(vus.size).toBeGreaterThan(1);
  });

  it('×10 = dix tirages à la suite du même générateur (le premier est celui de ×1), déterministe, aucune garantie de rareté', () => {
    const c = caisse('ravitaillement');
    expect(TIRAGES_X10).toBe(10);
    for (const g of [0, 7, 99, 31337]) {
      const dix = tirer10(c, cat, g);
      expect(dix).toHaveLength(10);
      expect(dix).toEqual(tirer10(c, cat, g));
      expect(dix[0]).toEqual(tirer(c, cat, g));
      expect(dix).toEqual(tirerN(c, cat, g, 10));
      expect(tirerN(c, cat, g, 3)).toEqual(dix.slice(0, 3));
    }
    // Aucune garantie : parmi 2 000 ×10 de la caisse de ravitaillement, certains ne contiennent que des communs (0,7¹⁰ ≈ 2,8 %).
    const seulementCommuns = Array.from({ length: 2000 }, (_, g) => tirer10(c, cat, g)).filter((d) => d.every((o) => o.rarete === 'commun')).length;
    expect(seulementCommuns).toBeGreaterThan(0);
  });

  it('entrées invalides : null, sans exception (caisse, catalogue, graine négative, fractionnaire, non numérique, trop grande ; nombre de tirages)', () => {
    const c = caisse('militaire');
    for (const g of [-1, 1.5, NaN, Infinity, '3', null, undefined, 2 ** 60, {}]) {
      expect(tirer(c, cat, g), String(g)).toBeNull();
      expect(tirer10(c, cat, g)).toBeNull();
    }
    for (const x of [null, undefined, {}, [], 'caisse', { chances: [] }, { chances: [{ rarete: 'rare', pourcent: -5 }] }]) {
      expect(() => tirer(x, cat, 1)).not.toThrow();
      expect(tirer(x, cat, 1)).toBeNull();
    }
    expect(tirer(c, null, 1)).toBeNull();
    expect(tirer(c, { raretes: [], objets: {} }, 1)).toBeNull();
    for (const n of [0, -1, 1.5, 101, '2']) expect(tirerN(c, cat, 1, n)).toBeNull();
  });

  it(`répartition sur ${N} graines fixées (0 à ${N - 1}) conforme aux chances (écart ≤ 4 σ), objets uniformes dans chaque rareté ; idem sur 1 000 ×10`, () => {
    for (const c of caisses) {
      const parRarete = new Map();
      const parObjet = new Map();
      for (let g = 0; g < N; g += 1) {
        const o = tirer(c, cat, g);
        parRarete.set(o.rarete, (parRarete.get(o.rarete) ?? 0) + 1);
        parObjet.set(`${o.rarete}|${o.id}`, (parObjet.get(`${o.rarete}|${o.id}`) ?? 0) + 1);
      }
      for (const x of c.chances) {
        const p = x.pourcent / 100;
        const n = parRarete.get(x.rarete) ?? 0;
        expect(Math.abs(n / N - p), `${c.id} ${x.rarete} : ${n} / ${N}`).toBeLessThanOrEqual(borne(p, N));
        // Objets d'une rareté : chacun 1 / k des tirages de cette rareté.
        const objets = objetsDeRarete(cat, x.rarete);
        for (const o of objets) {
          const k = parObjet.get(`${x.rarete}|${o.id}`) ?? 0;
          expect(Math.abs(k / n - 1 / objets.length), `${c.id} ${x.rarete} ${o.id} : ${k} / ${n}`).toBeLessThanOrEqual(borne(1 / objets.length, n));
        }
      }
      expect([...parRarete.keys()].every((r) => c.chances.some((x) => x.rarete === r))).toBe(true);
      // ×10 : 1 000 graines × 10 tirages.
      const dix = new Map();
      for (let g = 0; g < 1000; g += 1) for (const o of tirer10(c, cat, g)) dix.set(o.rarete, (dix.get(o.rarete) ?? 0) + 1);
      for (const x of c.chances) {
        const p = x.pourcent / 100;
        expect(Math.abs((dix.get(x.rarete) ?? 0) / N - p), `${c.id} ×10 ${x.rarete}`).toBeLessThanOrEqual(borne(p, N));
      }
    }
  });
});

describe('résumé d\'un résultat (E3-5)', () => {
  it('nombre par rareté (dans l\'ordre des raretés, présentes seulement) et meilleur objet (le premier de la rareté la plus haute)', () => {
    const objets = [
      { id: 'gilet', rarete: 'commun', niveau: 1 }, { id: 'bottes', rarete: 'peu-commun', niveau: 1 }, { id: 'amulette', rarete: 'epique', niveau: 1 },
      { id: 'gilet', rarete: 'commun', niveau: 1 }, { id: 'bague', rarete: 'epique', niveau: 1 },
    ];
    expect(resume(objets, cat)).toEqual({ compte: [{ rarete: 'commun', n: 2 }, { rarete: 'peu-commun', n: 1 }, { rarete: 'epique', n: 2 }], meilleur: objets[2] });
    expect(resume([], cat)).toEqual({ compte: [], meilleur: null });
    expect(resume(null, cat)).toEqual({ compte: [], meilleur: null });
    expect(resume([null, { id: 'x', rarete: 'inconnue' }], cat)).toEqual({ compte: [], meilleur: null });
    const dix = tirer10(caisse('militaire'), cat, 5);
    expect(resume(dix, cat).compte.reduce((s, x) => s + x.n, 0)).toBe(10);
  });
});

describe('ajout à l\'inventaire (ajouterObjets, js/core/equipement.js)', () => {
  const neuf = () => creerEtatEquipement(cat, depart);

  it('un exemplaire de niveau 1 par objet tiré, uid « c<N> » unique, non porté, à la fin de l\'inventaire ; l\'ancien état n\'est pas modifié', () => {
    const e0 = neuf();
    const avant = JSON.stringify(e0);
    const dix = tirer10(caisse('ravitaillement'), cat, 12);
    const { etat, uids } = ajouterObjets(e0, cat, dix);
    expect(JSON.stringify(e0)).toBe(avant);
    expect(uids).toHaveLength(10);
    expect(new Set(etat.objets.map((o) => o.uid)).size).toBe(etat.objets.length);
    expect(etat.objets.slice(0, e0.objets.length)).toEqual(e0.objets);
    expect(etat.objets.slice(e0.objets.length).map((o) => ({ id: o.id, rarete: o.rarete, niveau: o.niveau }))).toEqual(dix.map((o) => ({ ...o })));
    expect(uids.every((u) => /^c\d+$/.test(u))).toBe(true);
    expect(etat.porte).toEqual(e0.porte);
    expect(Object.isFrozen(etat) && Object.isFrozen(etat.objets)).toBe(true);
    // Deux achats successifs : uids toujours nouveaux.
    const deux = ajouterObjets(etat, cat, [tirer(caisse('elite'), cat, 3)]);
    expect(etat.objets.map((o) => o.uid)).not.toContain(deux.uids[0]);
  });

  it('refus (même état) : liste vide ou invalide, objet ou rareté inconnus ; jamais d\'exception', () => {
    const e0 = neuf();
    for (const x of [[], null, undefined, 'x', [null], [{ id: 'inconnu', rarete: 'commun' }], [{ id: 'gilet', rarete: 'mythique' }], [{ id: 'gilet', rarete: 'commun' }, 5]]) {
      const r = ajouterObjets(e0, cat, x);
      expect(r.etat).toBe(e0);
      expect(r.uids).toEqual([]);
    }
  });

  it('objet obtenu utilisable comme ceux du lot 8d : se porte, compte dans les statistiques effectives, fusionne avec ceux de l\'inventaire de départ', () => {
    const e0 = neuf();
    // Fusion avec deux exemplaires de départ identiques (un triplet complété par un objet obtenu).
    const groupes = new Map();
    for (const o of e0.objets) groupes.set(`${o.id}|${o.rarete}`, [...(groupes.get(`${o.id}|${o.rarete}`) ?? []), o.uid]);
    const [cle, paire] = [...groupes].find(([k, v]) => v.length >= 2 && !k.endsWith('|legendaire'));
    const [id, rarete] = cle.split('|');
    const { etat: e1, uids: [obtenu] } = ajouterObjets(e0, cat, [{ id, rarete, niveau: 1 }]);
    const places = [paire[0], paire[1], obtenu];
    expect(etatFusion(e1, cat, places).possible).toBe(true);
    const f = fusionner(e1, cat, places);
    expect(f.uid).toMatch(/^f\d+$/);
    expect(objetDe(f.etat, obtenu)).toBeNull();
    expect(new Set(f.etat.objets.map((o) => o.uid)).size).toBe(f.etat.objets.length);
    // Trois objets obtenus identiques : fusionnables entre eux.
    const trois = ajouterObjets(e0, cat, [{ id: 'montre', rarete: 'rare' }, { id: 'montre', rarete: 'rare' }, { id: 'montre', rarete: 'rare' }]);
    expect(etatFusion(trois.etat, cat, trois.uids).possible).toBe(true);
    // Porté : les statistiques effectives le comptent.
    const { etat: e2, uids: [gants] } = ajouterObjets(e0, cat, [{ id: 'gants', rarete: 'legendaire' }]);
    const e3 = equiper(e2, cat, gants, 'gants');
    expect(e3.porte.gants).toBe(gants);
    const sans = statistiquesEffectives(null, e2, cat, PARAMS).niveaux;
    const avec = statistiquesEffectives(null, e3, cat, PARAMS).niveaux;
    expect(avec.cadence).toBe(Math.min(PARAMS.maxLevel, sans.cadence + 5));
  });
});

// --- Retour du propriétaire : caisses de personnages et de tenues, offres du jour -----------------------------------------------------------
describe('caisses de personnages et de tenues', () => {
  const recrues = toutes.find((c) => c.id === 'recrues');
  const tenues = toutes.find((c) => c.id === 'tenues');

  it('données : tenues valides (raretés connues, au moins une par rareté tirable) ; chances de la caisse de recrues sur des personnages existants, somme de 100', () => {
    expect(cat.cosmetiques.length).toBeGreaterThanOrEqual(5);
    for (const x of tenues.chances) expect(elementsDe('cosmetique', cat, x.rarete).length, x.rarete).toBeGreaterThan(0);
    expect(recrues.chances.map((x) => x.personnage)).toEqual(cat.personnages.map((p) => p.id));
    expect(recrues.chances.reduce((s, x) => s + x.pourcent, 0)).toBeCloseTo(100, 9);
    expect(chances(recrues, cat).map((x) => x.nom)).toEqual(cat.personnages.map((p) => p.nom));
    expect(bornes(recrues, cat)).toBeNull();
    expect(bornes(tenues, cat)).toEqual({ min: 'commun', max: 'legendaire', n: 5 });
    // Personnage inconnu, tenue de rareté inconnue : refus.
    expect(lireCaisses({ caisses: [{ ...JSON_CAISSES.caisses[3], chances: { inconnu: 100 } }] }, cat).caisses).toEqual([]);
    expect(lireCaisses({ caisses: [{ ...JSON_CAISSES.caisses[0], type: 'autre' }] }, cat).caisses).toEqual([]);
    expect(lireCosmetiques({ cosmetiques: [{ id: 'x', nom: 'X', rarete: 'mythique' }, { id: 'X Y', rarete: 'commun' }] }, cat.raretes)).toEqual([]);
  });

  it('tirage déterministe ; personnage { type, id } ; tenue { type, id, rarete } ; répartition sur 10 000 graines conforme aux chances (4 σ)', () => {
    for (const c of [recrues, tenues]) {
      const n = new Map();
      for (let g = 0; g < N; g += 1) {
        const o = tirer(c, cat, g);
        expect(o).toEqual(tirer(c, cat, g));
        n.set(o.rarete ?? o.id, (n.get(o.rarete ?? o.id) ?? 0) + 1);
      }
      for (const x of c.chances) {
        const p = x.pourcent / 100;
        expect(Math.abs((n.get(x.rarete ?? x.personnage) ?? 0) / N - p), `${c.id} ${x.rarete ?? x.personnage}`).toBeLessThanOrEqual(borne(p, N));
      }
    }
    expect(Object.keys(tirer(recrues, cat, 3)).sort()).toEqual(['id', 'type']);
    expect(Object.keys(tirer(tenues, cat, 3)).sort()).toEqual(['id', 'rarete', 'type']);
    expect(tirer10(recrues, cat, 4)).toHaveLength(10);
  });

  it('personnages obtenus (obtenirPersonnages) : verrouillé → débloqué, choisissable, compté ; déjà obtenu → un niveau de plus (au plus le maximum) ; refus sans exception', () => {
    const e0 = creerEtatEquipement(cat, depart);
    expect(e0.debloques).toEqual([]);
    const p3 = cat.personnages.find((p) => p.id === 'personnage-3');
    expect([estDebloque(e0, p3), infoPersonnage(e0, cat, 'personnage-3').verrouille]).toEqual([false, true]);
    expect(choisirPersonnage(e0, cat, 'personnage-3')).toBe(e0);
    const { etat: e1, issues } = obtenirPersonnages(e0, cat, ['personnage-3', 'survivant', 'personnage-3']);
    expect(issues).toEqual([
      { id: 'personnage-3', nouveau: true, niveau: 1, max: false },
      { id: 'survivant', nouveau: false, niveau: 2, max: false },
      { id: 'personnage-3', nouveau: false, niveau: 2, max: false },
    ]);
    expect([estDebloque(e1, p3), e1.debloques, e0.debloques]).toEqual([true, ['personnage-3'], []]);
    expect(choisirPersonnage(e1, cat, 'personnage-3').choisi).toBe('personnage-3');
    expect(ameliorerPersonnage(e1, cat, 'personnage-3').persos['personnage-3']).toBe(3);
    // Au maximum : le niveau ne dépasse pas niveauMax.
    const max = cat.personnages.find((p) => p.id === 'survivant').niveauMax;
    const plein = obtenirPersonnages(e0, cat, Array.from({ length: max + 3 }, () => 'survivant'));
    expect([plein.etat.persos.survivant, plein.issues.at(-1)]).toEqual([max, { id: 'survivant', nouveau: false, niveau: max, max: true }]);
    for (const x of [[], null, ['inconnu'], ['survivant', 3]]) expect(obtenirPersonnages(e0, cat, x)).toEqual({ etat: e0, issues: [] });
  });

  it('collection de tenues (ajouterCosmetiques) : compte, nouvelle ou déjà obtenue ; refus d\'une tenue inconnue', () => {
    const a = ajouterCosmetiques({}, cat, ['treillis', 'doree', 'treillis']);
    expect(a).toEqual({ collection: { treillis: 2, doree: 1 }, nouveaux: [true, true, false] });
    expect(Object.isFrozen(a.collection)).toBe(true);
    expect(ajouterCosmetiques(a.collection, cat, ['doree']).nouveaux).toEqual([false]);
    for (const x of [[], null, ['inconnue']]) expect(ajouterCosmetiques(a.collection, cat, x)).toEqual({ collection: a.collection, nouveaux: [] });
  });
});

describe('offres du jour (lireOffres, offresDuJour)', () => {
  const { regles, erreurs: erreursOffres } = lireOffres(JSON_CAISSES, cat);

  it('règles valides : six offres, chances de somme 100, prix par rareté', () => {
    expect(erreursOffres).toEqual([]);
    expect(regles.nombre).toBe(6);
    expect(regles.chances.reduce((s, x) => s + x.pourcent, 0)).toBeCloseTo(100, 9);
    expect(lireOffres({ offres: { ...JSON_CAISSES.offres, nombre: 0 } }, cat).regles).toBeNull();
    expect(lireOffres({ offres: { ...JSON_CAISSES.offres, chances: { commun: 50 } } }, cat).regles).toBeNull();
    expect(lireOffres({}, cat).regles).toBeNull();
  });

  it('déterministes pour un jour, six objets différents du catalogue au prix de leur rareté ; un autre jour, d\'autres offres ; jour invalide : aucune', () => {
    const j = 20_768;
    const o = offresDuJour(regles, cat, j);
    expect(o).toEqual(offresDuJour(regles, cat, j));
    expect(o).toHaveLength(6);
    expect(new Set(o.map((x) => x.id)).size).toBe(6);
    for (const x of o) {
      expect(cat.objets.get(x.id).raretes[x.rarete]).toBeTruthy();
      expect(x.prix).toBe(JSON_CAISSES.offres.prix[x.rarete]);
    }
    const autres = Array.from({ length: 30 }, (_, i) => JSON.stringify(offresDuJour(regles, cat, j + 1 + i)));
    expect(autres.filter((x) => x !== JSON.stringify(o)).length).toBe(30);
    for (const x of [-1, 1.5, NaN, '3', null]) expect(offresDuJour(regles, cat, x)).toEqual([]);
    expect(offresDuJour(null, cat, j)).toEqual([]);
    // Raretés sur 3 000 jours : conformes aux chances (première offre de chaque jour, 4 σ).
    const n = new Map();
    for (let d = 0; d < 3000; d += 1) { const r = offresDuJour(regles, cat, d)[0].rarete; n.set(r, (n.get(r) ?? 0) + 1); }
    for (const x of regles.chances) expect(Math.abs((n.get(x.rarete) ?? 0) / 3000 - x.pourcent / 100), x.rarete).toBeLessThanOrEqual(borne(x.pourcent / 100, 3000));
  });
});
