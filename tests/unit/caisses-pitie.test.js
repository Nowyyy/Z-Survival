import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { avantGarantie, chancesTirage, compteursApres, lireCaisses, lireCosmetiques, lirePitie, tirerPitie, COMPTEURS_ZERO, TIRAGES_X10 } from '../../js/core/caisses.js';
import { lireCatalogue } from '../../js/core/equipement.js';
import { appliquerOps, defaultProgression, solde, soldeMedailles } from '../../js/core/progression.js';
import { campagneMedailles, simulateMedailles } from './helpers/onglets-medailles-simulateur.js';

// Lot 8k (Docs/ref/economie.md) : une caisse par rubrique (Équipement, Personnages, Cosmétiques), payée en médailles (100 ; ×10 : 1 000), pitié par
// rubrique : épique ou mieux garanti au 10e tirage, légendaire à 1 % jusqu'au 50e puis +5 points par tirage, garanti au 70e.
const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const { cat: base } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json') });
const cat = { ...base, cosmetiques: lireCosmetiques(lire('data/menu/cosmetiques.json'), base.raretes) };
const donnees = lire('data/menu/caisses.json');
const { caisses, erreurs } = lireCaisses(donnees, cat);
const { regles } = lirePitie(donnees, cat);
const params = { save: lire('data/game/save.json'), economy: lire('data/game/economy.json'), stats: lire('data/game/player-stats.json') };
const RANG = Object.fromEntries(cat.raretes.map((r, i) => [r.id, i]));

// Graine pseudo-aléatoire déterministe (aucun Math.random) pour les longues séries.
const graines = (n, depart = 12345) => {
  let x = depart >>> 0;
  return Array.from({ length: n }, () => {
    x = (Math.imul(x ^ (x >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return x;
  });
};

describe('données : trois caisses, prix en médailles, chances et pitié (caisses.json)', () => {
  it('une caisse par rubrique, dans l\'ordre : Équipement, Personnages, Cosmétiques ; 100 et 1 000 ; dessins militaire, veterans, tenues ; aucune erreur', () => {
    expect(erreurs).toEqual([]);
    expect(caisses.map((c) => [c.id, c.type, c.modele, c.prix, c.prix10])).toEqual([
      ['equipement', 'equipement', 'militaire', 100, 1000], ['personnages', 'personnage', 'veterans', 100, 1000], ['cosmetiques', 'cosmetique', 'tenues', 100, 1000]]);
  });

  it('chances de base : 54 / 30 / 10 / 5 / 1 (équipement, cosmétiques) ; personnages : rare 94, épique 5, légendaire 1 (rareté de chaque personnage dans personnages.json)', () => {
    const pc = (c) => Object.fromEntries(c.chances.map((x) => [x.rarete, x.pourcent]));
    expect(pc(caisses[0])).toEqual({ commun: 54, 'peu-commun': 30, rare: 10, epique: 5, legendaire: 1 });
    expect(pc(caisses[2])).toEqual({ commun: 54, 'peu-commun': 30, rare: 10, epique: 5, legendaire: 1 });
    expect(pc(caisses[1])).toEqual({ rare: 94, epique: 5, legendaire: 1 });
    expect(cat.personnages.map((p) => [p.id, p.rarete])).toEqual([['survivant', 'rare'], ['personnage-2', 'rare'], ['personnage-3', 'rare'], ['personnage-4', 'epique'], ['personnage-5', 'epique'], ['personnage-6', 'legendaire']]);
  });

  it('règles de pitié : épique garanti au 10e, légendaire 1 % jusqu\'au 50e, +5 points, garanti au 70e ; règles invalides refusées', () => {
    expect(regles).toEqual({ haute: { rarete: 'epique', garanti: 10 }, top: { rarete: 'legendaire', douce: 50, pas: 5, garanti: 70 } });
    expect(lirePitie({ pitie: { haute: { rarete: 'epique', garanti: 10 }, top: { rarete: 'legendaire', douce: 70, pas: 5, garanti: 70 } } }, cat).regles).toBeNull();
    expect(lirePitie({ pitie: { haute: { rarete: 'inconnue', garanti: 10 }, top: regles.top } }, cat).regles).toBeNull();
    expect(lirePitie({}, cat).regles).toBeNull();
  });
});

describe('chances d\'un tirage selon les compteurs', () => {
  const c = caisses[0];
  const pc = (cpt) => Object.fromEntries(chancesTirage(c, cat, regles, cpt).map((x) => [x.rarete, Math.round(x.pourcent * 1e6) / 1e6]));
  it('compteurs à 0 : chances de base', () => {
    expect(pc(COMPTEURS_ZERO)).toEqual({ commun: 54, 'peu-commun': 30, rare: 10, epique: 5, legendaire: 1 });
  });
  it('10e tirage sans épique : épique 99 %, légendaire 1 %, rien d\'autre', () => {
    expect(pc({ e: 9, l: 9 })).toEqual({ commun: 0, 'peu-commun': 0, rare: 0, epique: 99, legendaire: 1 });
  });
  it('légendaire : 1 % jusqu\'au 50e tirage, 6 % au 51e, 96 % au 69e, 100 % au 70e ; les autres raretés gardent leurs proportions', () => {
    expect(pc({ e: 0, l: 49 }).legendaire).toBe(1);
    expect(pc({ e: 0, l: 50 }).legendaire).toBe(6);
    expect(pc({ e: 0, l: 68 }).legendaire).toBe(96);
    expect(pc({ e: 0, l: 69 })).toEqual({ commun: 0, 'peu-commun': 0, rare: 0, epique: 0, legendaire: 100 });
    const p = Object.fromEntries(chancesTirage(c, cat, regles, { e: 0, l: 50 }).map((x) => [x.rarete, x.pourcent]));
    expect(p.commun / p['peu-commun']).toBeCloseTo(54 / 30, 9);
    expect(Object.values(p).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 9);
  });
  it('compteurs après un tirage : épique remet e à 0, légendaire remet les deux ; le reste les avance de 1', () => {
    expect(compteursApres(cat, regles, { e: 3, l: 30 }, 'rare')).toEqual({ e: 4, l: 31 });
    expect(compteursApres(cat, regles, { e: 3, l: 30 }, 'epique')).toEqual({ e: 0, l: 31 });
    expect(compteursApres(cat, regles, { e: 3, l: 30 }, 'legendaire')).toEqual({ e: 0, l: 0 });
  });
  it('affichage : « Épique garanti dans N tirages », « Légendaire garanti dans N tirages au plus »', () => {
    expect(avantGarantie(regles, COMPTEURS_ZERO)).toEqual({ haute: 10, top: 70 });
    expect(avantGarantie(regles, { e: 9, l: 69 })).toEqual({ haute: 1, top: 1 });
  });
});

describe('garantie 3 : 100 000 tirages simulés par rubrique', () => {
  for (const c of caisses) {
    it(`${c.nom} : jamais plus de 10 tirages sans épique ou mieux, jamais plus de 70 sans légendaire ; taux consolidés relevés`, () => {
      const N = 100_000;
      let cpt = COMPTEURS_ZERO;
      let sansE = 0;
      let sansL = 0;
      let maxE = 0;
      let maxL = 0;
      const compte = {};
      const premiers = []; // tirages jusqu'à chaque légendaire
      let depuis = 0;
      const gs = graines(N / TIRAGES_X10, 777 + c.id.length);
      for (const g of gs) {
        const r = tirerPitie(c, cat, regles, cpt, g, TIRAGES_X10);
        for (const o of r.objets) {
          compte[o.rarete] = (compte[o.rarete] ?? 0) + 1;
          sansE = RANG[o.rarete] >= RANG.epique ? 0 : sansE + 1;
          depuis += 1;
          if (o.rarete === 'legendaire') {
            premiers.push(depuis);
            depuis = 0;
            sansL = 0;
          } else sansL += 1;
          maxE = Math.max(maxE, sansE);
          maxL = Math.max(maxL, sansL);
        }
        cpt = r.compteurs;
      }
      expect(maxE).toBeLessThanOrEqual(9); // le 10e tirage sans épique en donne un
      expect(maxL).toBeLessThanOrEqual(69); // le 70e tirage sans légendaire en donne un
      const taux = Object.fromEntries(Object.entries(compte).map(([k, v]) => [k, Math.round((v / N) * 10000) / 100]));
      const moyenne = premiers.reduce((s, v) => s + v, 0) / premiers.length;
      // Taux consolidés attendus (calcul exact de la chaîne) : légendaire ≈ 2,35 %, épique ou mieux ≈ 13 % ; attente du légendaire ≈ 42,6 tirages.
      expect(taux.legendaire).toBeGreaterThan(2.1);
      expect(taux.legendaire).toBeLessThan(2.6);
      expect(moyenne).toBeGreaterThan(40);
      expect(moyenne).toBeLessThan(45);
      console.info(`[pitié] ${c.id} : taux ${JSON.stringify(taux)} ; tirages moyens jusqu'au légendaire ${moyenne.toFixed(2)} ; plus longues séries sans épique ${maxE}, sans légendaire ${maxL}`);
    });
  }
});

describe('×10 et déterminisme', () => {
  const c = caisses[0];
  it('×10 avance les compteurs dans l\'ordre (chaque tirage part des compteurs laissés par le précédent)', () => {
    for (const g of graines(200, 9)) {
      const depart = { e: g % 10, l: g % 70 };
      const r = tirerPitie(c, cat, regles, depart, g, TIRAGES_X10);
      let cpt = depart;
      r.objets.forEach((o, i) => {
        cpt = compteursApres(cat, regles, cpt, o.rarete);
        expect(r.suite[i]).toEqual(cpt);
      });
      expect(r.compteurs).toEqual(cpt);
    }
  });
  it('compteurs préparés : {e: 9} → épique ou mieux au premier tirage ; {l: 69} → légendaire', () => {
    for (const g of graines(300, 3)) {
      expect(RANG[tirerPitie(c, cat, regles, { e: 9, l: 0 }, g, 1).objets[0].rarete]).toBeGreaterThanOrEqual(RANG.epique);
      expect(tirerPitie(c, cat, regles, { e: 0, l: 69 }, g, 1).objets[0].rarete).toBe('legendaire');
    }
  });
  it('tirage identique à graine et compteurs égaux (×1 et ×10, les trois rubriques) ; entrée invalide : null', () => {
    for (const k of caisses) for (const g of graines(50, 5)) {
      expect(tirerPitie(k, cat, regles, { e: 4, l: 20 }, g, 10)).toEqual(tirerPitie(k, cat, regles, { e: 4, l: 20 }, g, 10));
      expect(tirerPitie(k, cat, regles, { e: 4, l: 20 }, g, 1).objets[0]).toEqual(tirerPitie(k, cat, regles, { e: 4, l: 20 }, g, 10).objets[0]);
    }
    expect(tirerPitie(c, cat, regles, { e: -1, l: 0 }, 1, 1)).toBeNull();
    expect(tirerPitie(c, cat, null, COMPTEURS_ZERO, 1, 1)).toBeNull();
    expect(tirerPitie(c, cat, regles, COMPTEURS_ZERO, 1.5, 1)).toBeNull();
  });
  it('personnages : un personnage de la rareté tirée ; tenues : une tenue de la rareté tirée', () => {
    for (const g of graines(100, 21)) {
      for (const o of tirerPitie(caisses[1], cat, regles, COMPTEURS_ZERO, g, 10).objets) expect(cat.personnages.find((p) => p.id === o.id).rarete).toBe(o.rarete);
      for (const o of tirerPitie(caisses[2], cat, regles, COMPTEURS_ZERO, g, 10).objets) expect(cat.cosmetiques.find((p) => p.id === o.id).rarete).toBe(o.rarete);
    }
  });
});

describe('achats atomiques en médailles (garantie 5)', () => {
  const avec = (medailles, bleu = 0) => appliquerOps(defaultProgression(), [{ id: 'g', t: 'gain', medailles, bleu }], 1, params).save;
  const achat = (id, prix, de, a, extra = {}) => ({ id, t: 'achat', monnaie: 'medailles', prix, place: 100, objets: [{ u: `${id}.0`, i: 'casque-kevlar', r: 'commun' }], pitie: { r: 'equipement', de, a }, ...extra });
  it('prix en médailles, objet et compteurs dans la MÊME écriture ; la bleue n\'est pas touchée', () => {
    const r = appliquerOps(avec(250, 40), [achat('a1', 100, { e: 0, l: 0 }, { e: 1, l: 1 })], 2, params);
    expect(r.refused).toEqual([]);
    expect([soldeMedailles(r.save), solde(r.save), r.save.objets.length, r.save.pitie.equipement]).toEqual([150, 40, 1, { e: 1, l: 1 }]);
  });
  it('médailles insuffisantes : refusé en entier (rien prélevé, rien ajouté, compteurs inchangés), jamais négatif', () => {
    const r = appliquerOps(avec(99), [achat('a1', 100, { e: 0, l: 0 }, { e: 1, l: 1 })], 2, params);
    expect(r.refused).toEqual([{ id: 'a1', raison: 'solde' }]);
    expect([soldeMedailles(r.save), r.save.objets.length, r.save.pitie.equipement, r.save.medailles.depense]).toEqual([99, 0, { e: 0, l: 0 }, 0]);
  });
  it('compteurs changés depuis le tirage (autre onglet) : refusé en entier (raison « pitie »)', () => {
    const s = appliquerOps(avec(500), [achat('a1', 100, { e: 0, l: 0 }, { e: 1, l: 1 })], 2, params).save;
    const r = appliquerOps(s, [achat('a2', 100, { e: 0, l: 0 }, { e: 1, l: 1 })], 3, params);
    expect(r.refused).toEqual([{ id: 'a2', raison: 'pitie' }]);
    expect([soldeMedailles(r.save), r.save.objets.length, r.save.pitie.equipement]).toEqual([400, 1, { e: 1, l: 1 }]);
  });
  it('rejouée (même identifiant) : jamais appliquée deux fois', () => {
    const s = appliquerOps(avec(500), [achat('a1', 100, { e: 0, l: 0 }, { e: 1, l: 1 })], 2, params).save;
    const r = appliquerOps(s, [achat('a1', 100, { e: 0, l: 0 }, { e: 1, l: 1 })], 3, params);
    expect([soldeMedailles(r.save), r.save.objets.length]).toEqual([400, 1]);
  });
  it('outil de débogage : pitié remise à zéro (opération « pitie »)', () => {
    const s = appliquerOps(avec(500), [achat('a1', 100, { e: 0, l: 0 }, { e: 5, l: 33 })], 2, params).save;
    const r = appliquerOps(s, [{ id: 'z', t: 'pitie', valeurs: { equipement: { e: 0, l: 0 }, personnage: { e: 0, l: 0 }, cosmetique: { e: 0, l: 0 } } }], 3, params);
    expect(r.save.pitie.equipement).toEqual({ e: 0, l: 0 });
  });
});

describe('garantie 4 : plusieurs onglets (simulateur du lot 8h étendu aux médailles, paliers, jour et pitié)', () => {
  it('déterministe : même graine, même déroulé', () => {
    expect(simulateMedailles({ seed: 11, tabs: 3, params, caisse: caisses[0], cat, regles })).toEqual(simulateMedailles({ seed: 11, tabs: 3, params, caisse: caisses[0], cat, regles }));
  });
  it('10 000 suites, 2 à 4 onglets : 0 perte, 0 double compte, aucune double dépense, aucune garantie perdue ni dupliquée, palier et jour jamais deux fois', () => {
    const c = campagneMedailles({ n: 10_000, params, caisse: caisses[0], cat, regles });
    expect({ echecs: c.echecs, pertes: c.pertes, doubles: c.doubles, doublesDepenses: c.doublesDepenses, negatifs: c.negatifs, coupes: c.coupes, pitie: c.pitie, paliers: c.paliers, jours: c.jours }).toEqual({ echecs: 0, pertes: 0, doubles: 0, doublesDepenses: 0, negatifs: 0, coupes: 0, pitie: 0, paliers: 0, jours: 0 });
    expect(c.achats).toBeGreaterThan(1000);
    console.info(`[onglets] ${JSON.stringify(c)}`);
  }, 120_000);
});
