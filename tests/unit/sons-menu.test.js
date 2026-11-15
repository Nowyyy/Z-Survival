// Lot 8i-B : sons du menu (data/menu/sons.json, js/menu/sons/synthese.js, js/core/sons-menu.js). Synthèse déterministe (empreintes SHA-256
// stables par graine), durées et niveaux (aucune saturation : crête ≤ −1 dBFS), fichier de choix (chaque son existe ; invalide → variantes par
// défaut), mémoire des tampons dans les bornes, sons d'une ouverture aux instants de la chronologie pure, clic sans accumulation.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { admettreClic, creerClic, GROUPES, indiceSon, instantsPas, lireChoix, lireSons, sonsOuverture, texteChoix } from '../../js/core/sons-menu.js';
import { chronologie, lireOuvertures } from '../../js/core/ouverture.js';
import { CRETE_MAX_DB, FREQUENCE, mesurerSon, rendreSon, SORTES_COUCHES } from '../../js/menu/sons/synthese.js';

const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const brut = lire('data/menu/sons.json');
const { catalogue, erreurs } = lireSons(brut);
const choixFichier = lire('data/menu/sons-choix.json');
const reference = lire('tests/unit/helpers/sons-menu-empreintes.json');
const sha = (samples) => createHash('sha256').update(Buffer.from(samples.buffer)).digest('hex');
const MO = 1024 * 1024;
const rendus = new Map();
const rendu = (s, v, g = 1) => {
  const cle = `${s.id}:${v}:${g}`;
  if (!rendus.has(cle)) rendus.set(cle, rendreSon(s, v, g));
  return rendus.get(cle);
};
const tous = catalogue.sons.flatMap((s) => s.variantes.flatMap((v) => Array.from({ length: s.versions }, (_, k) => [s, v, k + 1])));

describe('catalogue des sons du menu', () => {
  it('data/menu/sons.json est valide : groupes connus, variantes A, B (C), variante par défaut, gains', () => {
    expect(erreurs).toEqual([]);
    expect(catalogue.sons.length).toBe(24); // retours du propriétaire : 32 − 4 (voix des zombies, sang) + 1 (point d'exclamation) − 5 (signatures de rareté)
    for (const s of catalogue.sons) {
      expect(GROUPES).toContain(s.groupe);
      expect(s.variantes.length).toBeGreaterThanOrEqual(2);
      expect(s.variantes.map((v) => v.id)).toContain(s.defaut);
      for (const v of s.variantes) for (const c of v.couches) expect(SORTES_COUCHES, `${s.id}.${v.id}`).toContain(c.t);
    }
  });
  it('les sons demandés par le lot existent tous', () => {
    const ids = catalogue.sons.map((s) => s.id);
    for (const id of ['clic', 'achat', 'equiper', 'retirer', 'ameliorer', 'fusion', 'choisir', 'chute-impact', 'chute-tiret', 'chute-rebond', 'ouv-pas', 'ouv-tapis', 'ouv-tir', 'ouv-impact', 'ouv-couvercle', 'ouv-lumiere', 'ouv-explosion', 'ouv-souffle', 'ouv-ecrasement', 'ouv-zombie-tombe', 'ouv-exclamation', 'ouv-carte', 'ouv-case', 'ouv-passer']) expect(ids).toContain(id);
    expect(ids.filter((id) => id.startsWith('rarete-'))).toEqual([]); // retour du propriétaire : signatures de rareté retirées
  });
  it('un catalogue invalide est refusé avec ses erreurs', () => {
    expect(lireSons(null).catalogue).toBeNull();
    const casse = structuredClone(brut);
    casse.sons[0].defaut = 'Z';
    casse.sons[1].variantes[0].couches = [];
    const r = lireSons(casse);
    expect(r.catalogue).toBeNull();
    expect(r.erreurs.length).toBe(2);
  });
});

describe('synthèse des sons du menu', () => {
  it('empreintes SHA-256 stables : chaque variante, chaque version (graine), égale à la référence', () => {
    expect(Object.keys(reference).length).toBe(tous.length);
    for (const [s, v, g] of tous) expect(sha(rendu(s, v.id, g).samples), `${s.id}:${v.id}:${g}`).toBe(reference[`${s.id}:${v.id}:${g}`]);
  });
  it('déterministe : deux rendus de la même graine sont identiques ; deux graines différentes ne le sont pas pour un son à hasard', () => {
    for (const id of ['clic', 'ouv-explosion', 'ouv-pas', 'achat']) {
      const s = catalogue.sons.find((x) => x.id === id);
      expect(sha(rendreSon(s, 'A', 3).samples)).toBe(sha(rendreSon(s, 'A', 3).samples));
    }
    const pas = catalogue.sons.find((x) => x.id === 'ouv-pas');
    expect(sha(rendu(pas, 'A', 1).samples)).not.toBe(sha(rendu(pas, 'A', 2).samples));
  });
  it('durées : celle de la recette (à un échantillon près), 22 050 Hz, mono Float32', () => {
    for (const [s, v, g] of tous) {
      const r = rendu(s, v.id, g);
      expect(r.sampleRate).toBe(FREQUENCE);
      expect(r.samples).toBeInstanceOf(Float32Array);
      expect(Math.abs(r.samples.length - Math.round(v.dur * FREQUENCE)), `${s.id}:${v.id}`).toBeLessThanOrEqual(1);
    }
  });
  it('niveaux : aucune saturation (crête ≤ −1 dBFS, visée −3), aucun silence, aucune valeur non finie, bouts nuls', () => {
    for (const [s, v, g] of tous) {
      const r = rendu(s, v.id, g);
      const m = mesurerSon(r.samples, r.sampleRate);
      expect(m.creteDb, `${s.id}:${v.id}`).toBeLessThanOrEqual(CRETE_MAX_DB);
      expect(m.creteDb, `${s.id}:${v.id}`).toBeGreaterThan(-3.5);
      expect(m.moyenDb, `${s.id}:${v.id}`).toBeGreaterThan(-32);
      expect(r.samples.every((x) => Number.isFinite(x)), `${s.id}:${v.id}`).toBe(true);
      expect(r.samples[0]).toBe(0);
      expect(r.samples.at(-1)).toBe(0);
    }
  });
  it('retour du propriétaire : plus aucune mélodie de signature de rareté, ni au catalogue ni dans une ouverture, quelle que soit la rareté', () => {
    expect(catalogue.sons.filter((x) => x.id.startsWith('rarete-') || x.groupe === 'raretes')).toEqual([]);
    const raretes = lire('data/menu/raretes.json').raretes.map((r) => r.id);
    const { reglages } = lireOuvertures(lire('data/menu/ouvertures.json'), raretes);
    for (const r of raretes) expect(sonsOuverture(chronologie(reglages, [r], { graine: 5 }), reglages).filter((x) => x.son.startsWith('rarete-'))).toEqual([]);
    expect(readFileSync('js/menu/fusion.js', 'utf8')).not.toMatch(/rarete-\$\{/);
  });
  it('variante inconnue : tampon vide, sans erreur', () => {
    expect(rendreSon(catalogue.sons[0], 'Z').samples.length).toBe(0);
    expect(rendreSon(null, 'A').samples.length).toBe(0);
  });
});

describe('fichier de choix (data/menu/sons-choix.json)', () => {
  it('chaque son du fichier existe, avec une variante qui existe', () => {
    const r = lireChoix(choixFichier, catalogue);
    expect(r.ecarts).toEqual([]);
    for (const [id, v] of Object.entries(choixFichier.choix)) {
      const s = id === 'musique' ? catalogue.musique : catalogue.sons.find((x) => x.id === id);
      expect(s, id).toBeTruthy();
      expect(s.variantes.map((x) => x.id)).toContain(v);
    }
  });
  it('fichier absent ou invalide : variantes par défaut pour tous les sons et la musique', () => {
    for (const mauvais of [null, undefined, 'x', [], {}, { choix: 3 }, { choix: [] }]) {
      const r = lireChoix(mauvais, catalogue);
      expect(r.ecarts.length).toBe(1);
      for (const s of catalogue.sons) expect(r.choix[s.id]).toBe(s.defaut);
      expect(r.choix.musique).toBe(catalogue.musique.defaut);
    }
  });
  it('nom inconnu ignoré, variante inconnue remplacée par celle par défaut, choix valides gardés', () => {
    const r = lireChoix({ choix: { clic: 'C', achat: 'Z', retirer: 'C', inconnu: 'A', musique: 'B', 'ouv-tir': 7 } }, catalogue);
    expect(r.choix.clic).toBe('C');
    expect(r.choix.achat).toBe('A');
    expect(r.choix.retirer).toBe('A'); // retirer n'a que A et B
    expect(r.choix['ouv-tir']).toBe('A');
    expect(r.choix.musique).toBe('B');
    expect(r.choix.inconnu).toBeUndefined();
    expect(r.ecarts.length).toBe(4);
  });
  it('texteChoix : texte du fichier pour des variantes cochées, relu à l\'identique', () => {
    const choix = { ...lireChoix(null, catalogue).choix, clic: 'B', musique: 'C' };
    const texte = texteChoix(choix, catalogue, 'note');
    const relu = lireChoix(JSON.parse(texte), catalogue);
    expect(relu.ecarts).toEqual([]);
    expect(relu.choix).toEqual(choix);
    expect(Object.keys(JSON.parse(texte).choix)).toEqual([...catalogue.sons.map((s) => s.id), 'musique']);
  });
});

describe('mémoire des tampons', () => {
  const octets = (groupes, choix) => catalogue.sons.filter((s) => groupes.includes(s.groupe)).reduce((n, s) => n + Array.from({ length: s.versions }, (_, k) => rendu(s, choix[s.id], k + 1).samples.length * 4).reduce((a, b) => a + b, 0), 0);
  it('menu (chute, menu, raretés) ≤ 3 Mo et ouverture ≤ 4 Mo, pour les variantes retenues comme pour les plus longues', () => {
    const retenues = lireChoix(choixFichier, catalogue).choix;
    const longues = Object.fromEntries(catalogue.sons.map((s) => [s.id, [...s.variantes].sort((a, b) => b.dur - a.dur)[0].id]));
    for (const choix of [retenues, longues]) {
      expect(octets(['chute', 'menu', 'raretes'], choix)).toBeLessThanOrEqual(3 * MO);
      expect(octets(['ouverture'], choix)).toBeLessThanOrEqual(4 * MO);
    }
  });
});

describe('sons d\'une ouverture sur la chronologie pure', () => {
  const raretes = lire('data/menu/raretes.json').raretes.map((r) => r.id);
  const { reglages } = lireOuvertures(lire('data/menu/ouvertures.json'), raretes);
  const ids = new Set(catalogue.sons.map((s) => s.id));
  it('×1 de chaque rareté : sons triés, tous au catalogue, aux instants de la chronologie, signature de la rareté obtenue', () => {
    for (const rarete of raretes) {
      const chrono = chronologie(reglages, [rarete], { graine: 5 });
      const sons = sonsOuverture(chrono, reglages);
      const c = chrono.caisses[0];
      for (let i = 1; i < sons.length; i += 1) expect(sons[i].t).toBeGreaterThanOrEqual(sons[i - 1].t);
      for (const s of sons) {
        expect(ids.has(s.son), s.son).toBe(true);
        expect(s.t).toBeGreaterThanOrEqual(0);
        expect(s.t).toBeLessThanOrEqual(chrono.fin);
      }
      const a = (nom) => sons.filter((s) => s.son === nom).map((s) => s.t);
      expect(a('ouv-tapis')).toEqual([c.tapis[0]]);
      expect(a('ouv-tir')).toEqual([c.tir]);
      expect(a('ouv-impact')).toEqual([c.etincelles[0]]);
      expect(a('ouv-couvercle')).toEqual([c.couvercle[0]]);
      expect(a('ouv-lumiere')).toEqual([c.lumiere[0]]);
      expect(sons.filter((s) => s.son.startsWith('rarete-')).length).toBe(0); // retour du propriétaire : plus de signature de rareté
      expect(a('ouv-pas')).toEqual(instantsPas(chrono.arrivee));
      expect(a('ouv-pas').length).toBe(reglages.arrivee.pas);
      // Ordre des événements d'une caisse : tapis, tir, impact, couvercle, lumière, signature.
      const ordre = ['ouv-tapis', 'ouv-tir', 'ouv-impact', 'ouv-couvercle', 'ouv-lumiere'].map((n) => sons.findIndex((s) => s.son === n));
      expect([...ordre].sort((x, y) => x - y)).toEqual(ordre);
    }
  });
  it('légendaire : explosion, souffle, écrasement et sang aux instants de la projection ; cri et chute du zombie resté au sol', () => {
    const chrono = chronologie(reglages, ['legendaire'], { graine: 5 });
    const sons = sonsOuverture(chrono, reglages);
    const c = chrono.caisses[0];
    const un = (nom) => sons.find((s) => s.son === nom);
    expect(un('ouv-explosion').t).toBe(c.explosion[0]);
    expect(un('ouv-souffle').t).toBe(c.projection.souffle);
    expect(un('ouv-ecrasement').t).toBe(c.projection.impact);
    // Retours du propriétaire : plus de sang qui coule ni de voix de zombie ; un son au point d'exclamation (« !!! » : plein niveau), la chute gardée.
    expect(un('ouv-exclamation').t).toBeCloseTo(c.reactions[0].debut + reglages.reactions['chute-forte'].vue[0], 9);
    expect(un('ouv-exclamation').gain).toBe(1);
    expect(sons.filter((s) => s.son === 'ouv-exclamation').length).toBe(1);
    expect(sons.some((s) => s.son === 'ouv-sang' || /^ouv-zombie-(sursaut|saut|cri)$/.test(s.son))).toBe(false);
    expect(un('ouv-zombie-tombe').t).toBeCloseTo(c.reactions[0].debut + reglages.reactions['chute-forte'].sol[0], 9);
    expect(sons.filter((s) => s.son === 'ouv-zombie-tombe').length).toBe(1); // l'autre zombie est projeté
    const commun = sonsOuverture(chronologie(reglages, ['commun']), reglages);
    for (const nom of ['ouv-explosion', 'ouv-souffle', 'ouv-ecrasement', 'ouv-exclamation', 'ouv-zombie-tombe', 'ouv-carte', 'ouv-case']) expect(commun.some((s) => s.son === nom), nom).toBe(false);
    expect(commun.filter((s) => s.son.startsWith('ouv-zombie-')).length).toBe(0); // sursaut léger : ni voix ni point d'exclamation
    // Point d'exclamation de plus en plus fort : « ! » (saut), « !! » (chute), « !!! » (chute forte).
    const gainMarque = (r) => sonsOuverture(chronologie(reglages, [r], { graine: 5 }), reglages).find((s) => s.son === 'ouv-exclamation').gain;
    expect([gainMarque('rare'), gainMarque('epique'), gainMarque('legendaire')]).toEqual([0.7, 0.85, 1]);
  });
  it('×10 : une signature par caisse dans l\'ordre du tirage, carte et case par caisse, réactions selon la rareté', () => {
    const tirage = ['commun', 'rare', 'commun', 'peu-commun', 'epique', 'commun', 'legendaire', 'commun', 'rare', 'commun'];
    const chrono = chronologie(reglages, tirage, { graine: 9 });
    const sons = sonsOuverture(chrono, reglages);
    expect(sons.filter((s) => s.son.startsWith('rarete-'))).toEqual([]); // retour du propriétaire : plus de signature de rareté
    expect(sons.filter((s) => s.son === 'ouv-lumiere').map((s) => s.t)).toEqual(chrono.caisses.map((c) => c.lumiere[0]));
    expect(sons.filter((s) => s.son === 'ouv-carte').map((s) => s.t)).toEqual(chrono.caisses.map((c) => c.vol[0]));
    expect(sons.filter((s) => s.son === 'ouv-case').map((s) => s.t)).toEqual(chrono.caisses.map((c) => c.case));
    expect(sons.filter((s) => s.son === 'ouv-tir').length).toBe(10);
    // Retours du propriétaire : un point d'exclamation par caisse marquée (deux rares, un épique, un légendaire), le tapis à la première caisse seulement,
    // la chute des zombies gardée (épique : deux zombies ; légendaire : celui qui reste).
    expect(sons.filter((s) => s.son === 'ouv-exclamation').length).toBe(4);
    expect(sons.filter((s) => s.son === 'ouv-tapis').map((s) => s.t)).toEqual([chrono.caisses[0].tapis[0]]);
    expect(sons.filter((s) => s.son === 'ouv-zombie-tombe').length).toBe(3);
    expect(sons.filter((s) => s.son === 'ouv-explosion').length).toBe(1);
    expect(new Set(sons.map((s) => s.cle)).size).toBe(sons.length);
  });
  it('indiceSon : reprise après un saut au premier son d\'instant ≥ t ; chronologie absente : aucun son', () => {
    const sons = sonsOuverture(chronologie(reglages, ['rare']), reglages);
    expect(indiceSon(sons, 0)).toBe(0);
    expect(indiceSon(sons, 1e9)).toBe(sons.length);
    const k = indiceSon(sons, sons[5].t);
    expect(sons[k].t).toBe(sons[5].t);
    expect(sonsOuverture(null, reglages)).toEqual([]);
  });
});

describe('clic : un seul à la fois, volume dégressif', () => {
  const regles = catalogue.clic;
  it('clic isolé : plein niveau ; clic trop proche : pas joué ; clics rapides : de moins en moins forts, jamais sous le plancher', () => {
    let e = creerClic();
    let r = admettreClic(e, 10, regles);
    expect(r).toMatchObject({ jouer: true, gain: 1 });
    e = r.etat;
    r = admettreClic(e, 10 + regles.ecart / 2, regles);
    expect(r.jouer).toBe(false);
    expect(r.etat).toBe(e);
    const gains = [];
    let t = 10;
    for (let i = 0; i < 8; i += 1) {
      t += regles.ecart + 0.01;
      r = admettreClic(e, t, regles);
      e = r.etat;
      gains.push(r.gain);
    }
    expect(gains[0]).toBeCloseTo(regles.degressif, 9);
    for (let i = 1; i < gains.length; i += 1) expect(gains[i]).toBeLessThanOrEqual(gains[i - 1]);
    expect(Math.min(...gains)).toBe(regles.plancher);
    r = admettreClic(e, t + regles.fenetre + 0.01, regles);
    expect(r).toMatchObject({ jouer: true, gain: 1 });
  });
});
