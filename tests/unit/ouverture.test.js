// Lot 8f : chronologie pure des ouvertures de caisses en 3D (js/core/ouverture.js, data/menu/ouvertures.json ; Docs/ref/menu-principal.md) :
// ordre des événements ×1 et ×10, durées, caisse dorée plus longue, objet jamais montré avant le couvercle, case remplie à l'arrivée de la carte,
// caisse suivante après le départ de la carte, forces des effets croissantes avec la rareté, réactions des zombies, légendaire (délai avant la
// projection, glissade, réapparition à gauche ou à droite selon la graine), éclairs d'écran limités, données invalides refusées. Aucun rendu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ECLAIRS_PAR_SECONDE, EVENEMENTS, REACTIONS, choixLegendaire, chronologie, chronologieAchat, eclairsParSeconde, effets, instant, limiterEclairs, lireOuvertures, prochainSaut, promenade, rareteEffets } from '../../js/core/ouverture.js';

const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const JSON_OUV = lire('data/menu/ouvertures.json');
const RARETES = lire('data/menu/raretes.json').raretes;
const IDS = RARETES.map((r) => r.id);
const { reglages: R, erreurs } = lireOuvertures(JSON_OUV, IDS);
const copie = () => JSON.parse(JSON.stringify(JSON_OUV));
const ORDRE = ['tapis', 'tir', 'etincelles', 'couvercle', 'lumiere', 'rayons', 'objet'];
const debutDe = (c, e) => (e === 'tir' ? c.tir : c[e][0]);
// Pas d'échantillonnage du temps (secondes).
const PAS = 1 / 120;
const echantillons = (chrono) => Array.from({ length: Math.ceil(chrono.fin / PAS) + 2 }, (_, k) => k * PAS);

describe('données data/menu/ouvertures.json (lireOuvertures)', () => {
  it('fichier valide, sans erreur, marqué provisoire ; effets de chaque rareté du catalogue', () => {
    expect(erreurs).toEqual([]);
    expect(R).not.toBeNull();
    expect(JSON_OUV._provisoire).toMatch(/provisoire/i);
    expect(Object.keys(R.effets)).toEqual(IDS);
    expect(R.arrivee.duree).toBeCloseTo(3.4, 6); // maquette : marche jusqu'au tapis en 3,4 s environ
    expect(R.x10.periode).toBe(3); // environ 3 s par caisse
    expect(R.legendaire.duree).toBeCloseTo(6.5, 6); // caisse dorée : environ 6,5 s
  });

  it('forces des effets croissantes avec la rareté (rayons, éventail, éclair, onde, étincelles, secousse, réaction)', () => {
    const fx = IDS.map((id) => effets(R, id));
    for (const f of ['rayons', 'eventail', 'eclair', 'onde', 'etincelles', 'secousse']) {
      for (let i = 1; i < fx.length; i += 1) expect(fx[i][f], `${f} ${IDS[i]}`).toBeGreaterThanOrEqual(fx[i - 1][f]);
    }
    const rang = fx.map((e) => REACTIONS.indexOf(e.reaction));
    for (let i = 1; i < rang.length; i += 1) expect(rang[i]).toBeGreaterThan(rang[i - 1]);
    // Table du prompt : rayons 1, 3, 3, 5, 7 ; étincelles 0, 2, 3, 8, 14 ; commun : ni éclair, ni onde, ni secousse ; peu commun : pas de secousse.
    expect(fx.map((e) => e.rayons)).toEqual([1, 3, 3, 5, 7]);
    expect(fx.map((e) => e.etincelles)).toEqual([0, 2, 3, 8, 14]);
    expect([fx[0].eclair, fx[0].onde, fx[0].secousse, fx[1].secousse]).toEqual([0, 0, 0, 0]);
    expect(fx[1].largeur).toBeLessThan(fx[2].largeur); // peu commun : trois rayons fins
    expect(fx.map((e) => e.ondeDouble)).toEqual([false, false, false, false, true]);
    expect(fx.map((e) => e.reaction)).toEqual(['sursaut-leger', 'sursaut', 'saut', 'chute', 'projection']);
  });

  it('données invalides refusées (aucune ouverture jouée), sans exception', () => {
    expect(lireOuvertures(null, IDS).reglages).toBeNull();
    expect(lireOuvertures('x', IDS).reglages).toBeNull();
    expect(lireOuvertures(JSON_OUV, []).reglages).toBeNull();
    const cas = [
      (j) => { delete j.effets.epique; },
      (j) => { j.effets.rare.rayons = 2.5; },
      (j) => { j.effets.rare.rayons = 9; },
      (j) => { j.effets.rare.reaction = 'danse'; },
      (j) => { j.effets.commun.eclair = 2; },
      (j) => { j.x1.ouverture.objet = [0.01, 1]; }, // objet avant le couvercle
      (j) => { j.x10.ouverture.couvercle = [0.5, 0.2]; }, // plage à l'envers
      (j) => { j.x10.vol = [2.5, 3.5]; }, // carte encore là à l'arrivée de la caisse suivante
      (j) => { j.x10.vol = [0.5, 0.9]; }, // vol avant la sortie de la carte
      (j) => { j.x10.tir = 0.2; }, // tir avant la fin du tapis
      (j) => { j.legendaire.duree = 2.5; }, // caisse dorée pas plus longue
      (j) => { j.legendaire.retour.marche = 9; }, // zombie pas revenu avant la caisse suivante
      (j) => { j.reactions.saut.marque = '?'; },
      (j) => { j.promenade.pop(); },
      (j) => { j.arrivee.duree = 'long'; },
    ];
    for (const [k, f] of cas.entries()) {
      const j = copie();
      f(j);
      const r = lireOuvertures(j, IDS);
      expect([k, r.reglages]).toEqual([k, null]);
      expect(r.erreurs.length, String(k)).toBeGreaterThan(0);
    }
  });
});

describe('chronologie ×1', () => {
  it('ordre des événements : arrivée, tapis, tir, étincelles, couvercle, lumière, rayons, objet, boutons', () => {
    for (const rid of IDS) {
      const ch = chronologie(R, [rid], { graine: 7 });
      expect(ch.quantite).toBe(1);
      const c = ch.caisses[0];
      expect(c.debut).toBeCloseTo(R.arrivee.duree, 9);
      const t = ORDRE.map((e) => debutDe(c, e));
      for (let i = 1; i < t.length; i += 1) expect(t[i], `${rid} ${ORDRE[i]}`).toBeGreaterThanOrEqual(t[i - 1]);
      expect(c.objet[0]).toBeGreaterThanOrEqual(c.couvercle[0]);
      expect(c.boutons[0]).toBeGreaterThanOrEqual(c.objet[1]);
      expect(ch.fin).toBe(c.boutons[1]);
      expect([c.vol, c.case]).toEqual([null, null]); // ×1 : pas de rangée de cases
    }
  });

  it('instants de la maquette (épique) : tir 4,9 s, carte 5,68 → 6,88, boutons 7,12 → 7,6', () => {
    const c = chronologie(R, ['epique']).caisses[0];
    expect(c.tir).toBeCloseTo(4.9, 6);
    expect(c.objet[0]).toBeCloseTo(5.68, 6);
    expect(c.objet[1]).toBeCloseTo(6.88, 6);
    expect(c.boutons[0]).toBeCloseTo(7.12, 6);
    expect(c.boutons[1]).toBeCloseTo(7.6, 6);
  });

  it('l\'objet n\'est jamais montré avant le départ du couvercle ; aucune couleur de rareté avant l\'ouverture', () => {
    for (const rid of IDS) {
      const ch = chronologie(R, [rid]);
      const c = ch.caisses[0];
      for (const t of echantillons(ch)) {
        const s = instant(ch, R, t);
        const k = s.caisses[0];
        if (k.objet) expect(t).toBeGreaterThanOrEqual(c.couvercle[0]);
        if (!k.ouverte) expect([k.lumiere, k.rayons, k.onde, k.particules, s.eclair.force], `${rid} ${t}`).toEqual([0, 0, 0, 0, 0]);
      }
    }
  });

  it('arrivée : fondu depuis le noir, marche puis arrêt ; boutons à la fin', () => {
    const ch = chronologie(R, ['rare']);
    expect(instant(ch, R, 0).fondu).toBe(1);
    expect(instant(ch, R, 1.5).fondu).toBe(0);
    expect(instant(ch, R, 1).marche.enMarche).toBe(true);
    expect(instant(ch, R, 3.5).marche).toMatchObject({ avance: 1, enMarche: false });
    expect(instant(ch, R, 0).caisses[0].position).toBe(1); // en attente à gauche
    expect(instant(ch, R, ch.caisses[0].tir).caisses[0].position).toBe(0); // au centre au moment du tir
    expect(instant(ch, R, ch.fin).boutons).toBe(1);
    expect(instant(ch, R, ch.fin).fini).toBe(true);
    expect(instant(ch, R, ch.fin - 0.01).fini).toBe(false);
  });
});

describe('chronologie ×10', () => {
  const tirage = ['commun', 'peu-commun', 'rare', 'commun', 'peu-commun', 'rare', 'epique', 'commun', 'peu-commun', 'legendaire'];
  const ch = chronologie(R, tirage, { graine: 12345 });

  it('dix caisses dans l\'ordre du tirage, environ 3 s chacune, la dorée plus longue (environ 6,5 s)', () => {
    expect(ch.caisses.map((c) => c.rarete)).toEqual(tirage);
    for (const c of ch.caisses) {
      const d = c.fin - c.debut;
      expect(d, c.rarete).toBeCloseTo(c.rarete === 'legendaire' ? 6.5 : 3, 6);
    }
    for (let i = 1; i < 10; i += 1) expect(ch.caisses[i].debut).toBeCloseTo(ch.caisses[i - 1].fin, 9);
    expect(ch.caisses[0].debut).toBeCloseTo(3.4, 9);
    // Maquette : premier tir à 4,17 s, carte dans sa case à 5,71 s.
    expect(ch.caisses[0].tir).toBeCloseTo(4.17, 6);
    expect(ch.caisses[0].case).toBeCloseTo(5.71, 6);
  });

  it('case remplie à l\'arrivée de la carte ; caisse suivante après le départ de la carte ; cases dans l\'ordre', () => {
    for (const [i, c] of ch.caisses.entries()) {
      expect(c.case).toBe(c.vol[1]);
      expect(c.vol[0]).toBeGreaterThanOrEqual(c.objet[1]);
      if (i < 9) expect(ch.caisses[i + 1].tapis[0]).toBeGreaterThan(c.case);
    }
    let avant = 0;
    for (const t of echantillons(ch)) {
      const s = instant(ch, R, t);
      expect(s.cases).toBeGreaterThanOrEqual(avant);
      avant = s.cases;
      const n = ch.caisses.filter((c) => t >= c.case).length;
      expect(s.cases).toBe(n);
      // Une seule carte à la fois, et jamais pendant que la caisse suivante roule vers le centre.
      const cartes = s.caisses.filter((k) => k.objet);
      expect(cartes.length).toBeLessThanOrEqual(1);
      if (cartes.length) {
        const suivante = ch.caisses[cartes[0].i + 1];
        if (suivante) expect(t).toBeLessThan(suivante.tapis[0]);
      }
    }
    expect(instant(ch, R, ch.fin).cases).toBe(10);
    expect(ch.fin).toBeGreaterThan(ch.caisses[9].case);
  });

  it('objet jamais montré avant le couvercle de sa caisse ; tapis : chaque caisse au centre au moment de son tir', () => {
    for (const t of echantillons(ch)) {
      const s = instant(ch, R, t);
      for (const k of s.caisses) if (k.objet) expect(t).toBeGreaterThanOrEqual(ch.caisses[k.i].couvercle[0]);
    }
    for (const c of ch.caisses) expect(instant(ch, R, c.tir).caisses[c.i].position).toBeCloseTo(0, 9);
  });

  it('éclairs d\'écran : jamais plus de 3 par seconde ; commun sans éclair', () => {
    expect(eclairsParSeconde(ch)).toBeLessThanOrEqual(ECLAIRS_PAR_SECONDE);
    expect(ch.eclairs.map((e) => e.rarete)).toEqual(tirage.filter((r) => r !== 'commun'));
    // Éclairs serrés (atténués au-delà de 3 par seconde).
    const serres = limiterEclairs([0, 0.1, 0.2, 0.3, 0.4, 1.5].map((d, i) => ({ caisse: i, debut: d, fin: d + 0.3, force: 0.5 })));
    expect(serres.map((e) => e.force)).toEqual([0.5, 0.5, 0.5, 0, 0, 0.5]);
  });
});

describe('réactions des zombies', () => {
  it('par rareté : sursaut léger, sursaut, saut et « ! », chute et « !! », projection et « !!! » (l\'autre zombie)', () => {
    const attendu = { commun: ['sursaut-leger', null], 'peu-commun': ['sursaut', null], rare: ['saut', '!'], epique: ['chute', '!!'] };
    for (const [rid, [geste, marque]] of Object.entries(attendu)) {
      const ch = chronologie(R, [rid]);
      const c = ch.caisses[0];
      expect(c.reactions.map((r) => r.geste)).toEqual([geste, geste]);
      expect(c.reactions[0].debut).toBeGreaterThan(c.tir); // après le tir
      const s = instant(ch, R, c.reactions[0].debut + 0.2);
      expect(s.zombies[0].geste).toBe(geste);
      expect(s.zombies[0].marque).toBe(marque);
      expect(s.zombies[0].hauteur).toBeGreaterThan(0);
    }
    // Hauteur du saut croissante avec la rareté.
    const h = ['sursaut-leger', 'sursaut', 'saut', 'chute', 'chute-forte'].map((g) => R.reactions[g].hauteur);
    for (let i = 1; i < h.length; i += 1) expect(h[i]).toBeGreaterThan(h[i - 1]);
    // Épique : au sol puis relevé.
    const ch = chronologie(R, ['epique']);
    const r = ch.caisses[0].reactions[0];
    expect(instant(ch, R, r.debut + 1.2).zombies[0].sol).toBe(1);
    expect(instant(ch, R, r.fin + 0.01).zombies[0].sol).toBe(0);
  });

  it('promenade : aller, demi-tour, retour (période des données)', () => {
    const p = R.promenade[0];
    expect(promenade(p, 0).x).toBeCloseTo(p.x, 9);
    expect(promenade(p, p.periode * 0.5).x).toBeCloseTo(p.x + p.amplitude, 9);
    expect(promenade(p, p.periode * 0.25).sens).toBe(1);
    expect(promenade(p, p.periode * 0.75).sens).toBe(-1);
    expect(promenade(p, p.periode).x).toBeCloseTo(p.x, 9);
  });
});

describe('légendaire : explosion, projection, glissade, réapparition', () => {
  it('projection avec la brillance jaune ; collé, glissade, assombrissement, traînées ; carte dorée révélée par la glissade', () => {
    const ch = chronologie(R, ['legendaire'], { graine: 3 });
    const c = ch.caisses[0];
    const P = c.projection;
    expect(c.explosion[0]).toBeGreaterThan(c.tir);
    expect(P.depart).toBeCloseTo(c.eclair[0] + R.legendaire.projection.delai, 9);
    expect(P.depart < P.impact && P.impact < P.decolle && P.decolle < P.bas && P.bas < P.apparition && P.apparition < P.place).toBe(true);
    expect(c.sombre[0]).toBe(P.impact);
    expect(c.trainees[0]).toBe(P.decolle);
    expect(c.objet[0]).toBe(P.decolle); // derrière le zombie, découverte par le sang qui s'écoule
    expect(c.devoile).toEqual([P.decolle, P.bas]);
    expect(c.objet[0]).toBeGreaterThanOrEqual(c.couvercle[0]);
    expect(c.boutons[0]).toBeGreaterThan(P.bas); // ×1 : boutons après la glissade
    const phases = [P.depart + 0.05, P.impact + 0.1, P.decolle + 0.1, P.bas + 0.1, P.apparition + 0.1].map((t) => instant(ch, R, t).zombies[P.zombie].projection.phase);
    expect(phases).toEqual(['vol', 'colle', 'glisse', 'absent', 'retour']);
    expect(instant(ch, R, P.impact + 0.3).sombre).toBeGreaterThan(0.5);
    expect(instant(ch, R, P.place + 0.01).zombies[P.zombie].projection).toBeNull();
    // L'autre zombie : grand saut, « !!! », chute.
    const autre = 1 - P.zombie;
    expect(c.reactions.map((r) => [r.zombie, r.geste])).toEqual([[autre, 'chute-forte']]);
    expect(instant(ch, R, c.reactions[0].debut + 0.2).zombies[autre].marque).toBe('!!!');
    // Secousse et éclair les plus forts.
    expect(c.effets.secousse).toBe(Math.max(...IDS.map((id) => effets(R, id).secousse)));
    expect(c.onde2).not.toBeNull();
  });

  it('réapparition de son côté (zombie de gauche : à gauche ; de droite : à droite ; zombie projeté selon la graine, déterministe), puis marche jusqu\'à sa place', () => {
    for (let g = 0; g < 64; g += 1) {
      const a = choixLegendaire(g, 9);
      expect(a.cote, String(g)).toBe(a.zombie === 0 ? 'gauche' : 'droite');
      expect(Math.sign(R.promenade[a.zombie].x)).toBe(a.cote === 'gauche' ? -1 : 1);
    }
    const cotes = new Set();
    const zombies = new Set();
    for (let g = 0; g < 64; g += 1) {
      const a = choixLegendaire(g, 9);
      expect(choixLegendaire(g, 9)).toEqual(a);
      cotes.add(a.cote);
      zombies.add(a.zombie);
    }
    expect([...cotes].sort()).toEqual(['droite', 'gauche']);
    expect([...zombies].sort()).toEqual([0, 1]);
    const g = [...Array(64).keys()].find((k) => choixLegendaire(k, 0).cote === 'gauche');
    const d = [...Array(64).keys()].find((k) => choixLegendaire(k, 0).cote === 'droite');
    for (const [graine, signe] of [[g, -1], [d, 1]]) {
      const ch = chronologie(R, ['legendaire'], { graine });
      const P = ch.caisses[0].projection;
      const z = instant(ch, R, P.apparition + 0.001).zombies[P.zombie];
      expect(Math.sign(z.x)).toBe(signe);
      expect(Math.abs(z.x)).toBeGreaterThan(0.55);
      const place = instant(ch, R, P.place - 0.001).zombies[P.zombie];
      expect(place.x).toBeCloseTo(promenade(R.promenade[P.zombie], P.place).x, 2);
    }
  });

  it('×10 : la caisse dorée laisse le temps au zombie de revenir avant la caisse suivante', () => {
    const ch = chronologie(R, ['legendaire', 'commun', 'commun', 'commun', 'commun', 'commun', 'commun', 'commun', 'commun', 'legendaire'], { graine: 9 });
    const c = ch.caisses[0];
    expect(c.projection.place).toBeLessThan(ch.caisses[1].debut);
    expect(c.case).toBeLessThan(ch.caisses[1].tapis[0]);
    expect(ch.fin).toBeGreaterThanOrEqual(ch.caisses[9].projection.place);
  });
});

describe('rareté qui règle les effets (rareteEffets) et achats', () => {
  const caisse = (teinte) => ({ id: 'x', teinte });
  it('objet et tenue : leur rareté ; personnage nouveau : rareté de la teinte de sa caisse ; déjà obtenu : commun', () => {
    expect(rareteEffets({ type: 'equipement', objets: [{ id: 'a', rarete: 'epique' }] }, 0, RARETES)).toBe('epique');
    expect(rareteEffets({ type: 'cosmetique', objets: [{ id: 'a', rarete: 'rare' }] }, 0, RARETES)).toBe('rare');
    const perso = (teinte, nouveau) => ({ type: 'personnage', caisse: caisse(teinte), objets: [{ id: 'p' }], issues: [{ id: 'p', nouveau }] });
    expect(rareteEffets(perso('--rarete-rare', true), 0, RARETES)).toBe('rare');
    expect(rareteEffets(perso('--rarete-epique', true), 0, RARETES)).toBe('epique');
    expect(rareteEffets(perso('--rarete-legendaire', true), 0, RARETES)).toBe('legendaire');
    expect(rareteEffets(perso('--menu-bois', true), 0, RARETES)).toBe('legendaire'); // teinte sans rareté : la plus haute
    expect(rareteEffets(perso('--rarete-legendaire', false), 0, RARETES)).toBe('commun');
    expect(rareteEffets(null, 0, RARETES)).toBe('commun');
    expect(rareteEffets({ type: 'equipement', objets: [{ id: 'a', rarete: 'mythique' }] }, 0, RARETES)).toBe('commun');
    // Caisses de personnages des données : recrues (rare), vétérans (épique), légendes (légendaire).
    const caisses = lire('data/menu/caisses.json').caisses.filter((c) => c.type === 'personnage');
    expect(caisses.map((c) => rareteEffets({ type: 'personnage', caisse: c, objets: [{ id: 'p' }], issues: [{ nouveau: true }] }, 0, RARETES))).toEqual(['rare', 'epique', 'legendaire']);
  });

  it('chronologie d\'un achat : même ordre que le tirage ; offre du jour : aucune ouverture', () => {
    const r = { type: 'equipement', caisse: caisse('--rarete-rare'), quantite: 10, graine: 5, objets: IDS.concat(IDS).map((rid, i) => ({ id: `o${i}`, rarete: rid })) };
    expect(chronologieAchat(R, r, RARETES).caisses.map((c) => c.rarete)).toEqual(r.objets.map((o) => o.rarete));
    expect(chronologieAchat(R, { type: 'offre', caisse: null, objets: [{ id: 'a', rarete: 'rare' }] }, RARETES)).toBeNull();
    expect(chronologie(R, ['rare', 'rare'])).toBeNull(); // ni 1 ni 10
    expect(chronologie(null, ['rare'])).toBeNull();
  });

  it('chaque événement de la chronologie a une plage dans les données', () => {
    for (const e of EVENEMENTS) {
      expect(R.x1.ouverture[e], e).toHaveLength(2);
      expect(R.x10.ouverture[e], e).toHaveLength(2);
    }
  });
});

describe('retours du propriétaire (après la fusion, PR #96)', () => {
  it('chute en étapes : saut, chute (avec recul), au sol, relevé ; le zombie revient à sa place', () => {
    for (const rid of ['epique', 'legendaire']) {
      const ch = chronologie(R, [rid], { graine: 3 });
      const r = ch.caisses[0].reactions[0];
      const d = R.reactions[r.geste];
      const etapes = [];
      for (let t = r.debut; t < r.fin; t += 0.02) {
        const z = instant(ch, R, t).zombies[r.zombie];
        if (etapes.at(-1) !== z.etape) etapes.push(z.etape);
        expect(z.pe).toBeGreaterThanOrEqual(0);
        expect(z.pe).toBeLessThanOrEqual(1);
      }
      expect(etapes, rid).toEqual(['saut', 'chute', 'sol', 'releve']);
      expect(instant(ch, R, r.debut + d.sol[0] + 0.5).zombies[r.zombie].recul).toBe(1);
      expect(instant(ch, R, r.fin + 0.01).zombies[r.zombie]).toMatchObject({ etape: null, recul: 0, sol: 0 });
    }
    // Sursauts et saut : sans étapes de chute.
    const ch = chronologie(R, ['rare']);
    expect(instant(ch, R, ch.caisses[0].reactions[0].debut + 0.2).zombies[0].etape).toBeNull();
  });

  it('toucher l\'écran : arrivée → première caisse ; ×10 : caisse suivante (la dernière : fin, donc le résultat) ; ×1 : fin', () => {
    const tirage = ['commun', 'rare', 'legendaire', 'commun', 'peu-commun', 'rare', 'epique', 'commun', 'peu-commun', 'rare'];
    const ch = chronologie(R, tirage, { graine: 2 });
    expect(prochainSaut(ch, 0.5)).toBe(ch.caisses[0].debut);
    for (const c of ch.caisses.slice(0, -1)) {
      expect(prochainSaut(ch, c.debut + 0.01)).toBe(c.fin);
      expect(prochainSaut(ch, c.fin - 0.01)).toBe(c.fin);
      // Sauter là : la carte de cette caisse est déjà dans sa case, la suivante arrive.
      const s = instant(ch, R, c.fin);
      expect(s.cases).toBe(c.i + 1);
      expect(s.zombies.every((z) => z.projection === null)).toBe(true);
    }
    expect(prochainSaut(ch, ch.caisses[9].debut + 0.5)).toBe(ch.fin);
    expect(prochainSaut(ch, ch.fin)).toBeNull();
    expect(instant(ch, R, ch.fin).cases).toBe(10);
    const un = chronologie(R, ['epique']);
    expect(prochainSaut(un, 1)).toBe(un.caisses[0].debut);
    expect(prochainSaut(un, un.caisses[0].debut + 0.1)).toBe(un.fin);
    expect(prochainSaut(un, un.fin + 1)).toBeNull();
    expect(prochainSaut(null, 0)).toBeNull();
  });

  it('légendaire : l\'explosion dure plus longtemps que l\'éclair d\'écran (elle reste visible après lui)', () => {
    const c = chronologie(R, ['legendaire']).caisses[0];
    expect(c.explosion[1]).toBeGreaterThan(c.eclair[1] + 0.3);
  });
});

describe('retour du propriétaire (après la PR #98) : seconde explosion sous le zombie', () => {
  it('souffle au départ du vol, montée hors de l\'écran jusqu\'au sommet, puis retombée sur l\'écran ; carte dorée sortie après l\'impact', () => {
    const ch = chronologie(R, ['legendaire'], { graine: 4 });
    const c = ch.caisses[0];
    const P = c.projection;
    expect(P.souffle).toBe(P.depart);
    expect(P.sommet).toBeCloseTo(P.depart + R.legendaire.projection.vol * R.legendaire.projection.montee, 9);
    expect(P.depart < P.sommet && P.sommet < P.impact).toBe(true);
    const z = (t) => instant(ch, R, t).zombies[P.zombie].projection;
    expect([z(P.depart + 0.01).etapeVol, z(P.sommet + 0.01).etapeVol, z(P.impact + 0.01).etapeVol]).toEqual(['montee', 'retombe', null]);
    expect(z((P.depart + P.sommet) / 2).pv).toBeCloseTo(0.5, 6);
    expect(c.objet[0]).toBeGreaterThan(P.impact);
    expect(c.objet[0]).toBeLessThan(P.bas);
  });
});

describe('retour du propriétaire (après la PR #101) : explosion sous le zombie avec la brillance jaune, objet découvert par le sang', () => {
  it('la seconde explosion part au début de l\'éclair d\'écran de la caisse dorée (×1 et ×10)', () => {
    expect(R.legendaire.projection.delai).toBe(0);
    for (const raretes of [['legendaire'], ['commun', 'legendaire', ...Array(8).fill('rare')]]) {
      const c = chronologie(R, raretes, { graine: 2 }).caisses.find((k) => k.legendaire);
      expect(c.projection.souffle).toBeCloseTo(c.eclair[0], 9);
      expect(c.projection.souffle).toBeGreaterThanOrEqual(c.explosion[0]); // pas avant l'explosion de la caisse
    }
  });

  it('objet invisible avant l\'écoulement, déjà à sa place, découvert de 0 à 1 pendant la glissade ; jamais révélé ailleurs', () => {
    const ch = chronologie(R, ['legendaire'], { graine: 5 });
    const c = ch.caisses[0];
    const P = c.projection;
    for (const t of [c.tir, P.depart + 0.2, P.impact + 0.05, P.decolle - 0.01]) expect(instant(ch, R, t).caisses[0].objet).toBeNull();
    const o = (t) => instant(ch, R, t).caisses[0].objet;
    expect(o(P.decolle + 0.001).sortie).toBe(1);
    expect(o(P.decolle + 0.001).devoile).toBeLessThan(0.01);
    expect(o((P.decolle + P.bas) / 2).devoile).toBeCloseTo(0.5, 6);
    expect(o(P.bas + 0.01).devoile).toBe(1);
    // Caisses ordinaires : carte entière dès sa sortie.
    const ch2 = chronologie(R, ['epique']);
    expect(instant(ch2, R, ch2.caisses[0].objet[0] + 0.1).caisses[0].objet.devoile).toBe(1);
  });

  it('×10 : la carte dorée part vers sa case après avoir été découverte', () => {
    const ch = chronologie(R, ['legendaire', ...Array(9).fill('commun')], { graine: 9 });
    const c = ch.caisses[0];
    expect(c.vol[0]).toBeGreaterThanOrEqual(c.devoile[1]);
    expect(c.projection.place).toBeLessThanOrEqual(c.fin);
  });

  it('réglages refusés : carte qui part avant d\'être découverte', () => {
    const j = structuredClone(JSON_OUV);
    j.legendaire.projection.glissade = 3.5;
    expect(lireOuvertures(j, IDS).erreurs.join(' ')).toMatch(/découverte/);
  });
});
