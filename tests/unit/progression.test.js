import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeSave, defaultSave as defaultV1 } from '../../js/core/save.js';
import {
  appliquerOps, decoder, decrire, defaultProgression, depuisV1, EMPLACEMENTS, encoder, lire, sanitize, serialiser, solde, SOLDE_MAX, JOURNAL_MAX,
} from '../../js/core/progression.js';
import { createRepository } from '../../js/save/index.js';
import { codecV2 } from '../../js/save/codecs.js';
import { createFakeStorage, quotaError, securityError } from './helpers/fake-storage.js';
import { campagneV2, simulateV2 } from './helpers/onglets-v2-simulateur.js';

// Lot 8h : progression v2 (zs.save.v2, js/core/progression.js, Docs/ref/sauvegarde-v2.md) : format, réparation champ par champ, départ (la V0.8 ne lit
// ni n'écrit zs.save.v1 : tout le monde repart de zéro), refus d'une version plus récente sans effacement, opérations atomiques, ZS2 et ZS1, onglets.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const V2 = params.save.v2.storageKey;
const V1 = params.save.storageKey;
const gain = (id, bleu, extra = {}) => ({ id, t: 'gain', bleu, ...extra });
const avec = (bleu) => appliquerOps(defaultProgression(), [gain('g0', bleu)], 1, params).save;
const objet = (u, i = 'casque-kevlar', r = 'commun') => ({ u, i, r });
const repo = (storage, search = '') => createRepository({ search, storage, params, format: 'v2' }).repository;

describe('format v2 : défaut et réparation champ par champ', () => {
  it('nouveau joueur : Survivant choisi, rien d\'équipé, inventaire vide, 0 bleu, niveaux et records à 0', () => {
    const d = defaultProgression();
    expect(d.v).toBe(2);
    expect(solde(d)).toBe(0);
    expect(d.objets).toEqual([]);
    expect(Object.keys(d.porte)).toEqual(EMPLACEMENTS);
    expect(Object.values(d.porte).every((u) => u === null)).toBe(true);
    expect(d.persos).toEqual({ debloques: ['survivant'], niveaux: { survivant: 1 }, choisi: 'survivant' });
    expect(Object.values(d.niveaux).every((n) => n === 0)).toBe(true);
    expect(d.records).toEqual({ histoire: {}, infini: {} });
  });

  it('chaque champ invalide prend son défaut, le reste est gardé (jamais d\'effacement silencieux)', () => {
    const raw = {
      v: 2, rev: 4, savedAt: 9, bleu: { gagne: 500, depense: 'x' }, objets: [objet('a.0'), { u: 'a.0', i: 'gilet', r: 'rare', n: 1 }, { u: 'b.0', i: 'Bad id', r: 'rare', n: 1 }, { ...objet('c.0'), n: 2 }],
      porte: { tete: 'c.0', torse: 'zz', gants: 'c.0' }, persos: { debloques: ['personnage-2', 'x y'], niveaux: { 'personnage-2': 300 }, choisi: 'inconnu' },
      niveaux: { vie: 50, degats: -2 }, records: { histoire: { batiment: 12, 'Mauvais id': 3 }, infini: 'non' }, profil: { pseudo: '\u0000x', tues: 3.5, avatar: 'tireur' },
      lues: ['info-1', 'info-1', 7], journal: ['g1'], dates: { porte: -1 },
    };
    const { save, warnings } = sanitize(raw, params);
    expect(save.rev).toBe(4);
    expect(save.bleu).toEqual({ gagne: 500, depense: 0 });
    expect(save.objets.map((o) => o.u)).toEqual(['a.0', 'c.0']); // a.0 sans niveau retiré (le second a.0, valide, est gardé), id invalide retiré
    expect(save.porte.tete).toBe('c.0');
    expect(save.porte.gants).toBe(null); // déjà porté ailleurs
    expect(save.porte.torse).toBe(null); // absent de l'inventaire
    expect(save.persos.debloques).toEqual(['survivant', 'personnage-2']);
    expect(save.persos.niveaux['personnage-2']).toBe(99);
    expect(save.persos.choisi).toBe('survivant');
    expect(save.niveaux.vie).toBe(10);
    expect(save.niveaux.degats).toBe(0);
    expect(save.records).toEqual({ histoire: { batiment: 12 }, infini: {} });
    expect(save.profil.pseudo).toBe(null);
    expect(save.profil.avatar).toBe('tireur');
    expect(save.profil.tues).toBe(0);
    expect(save.lues).toEqual(['info-1']);
    expect(save.journal).toEqual(['g1']);
    expect(save.dates.porte).toBe(0);
    expect(warnings.length).toBeGreaterThan(5);
  });

  it('dépensé supérieur au gagné : ramené au gagné (solde 0, jamais négatif) ; solde au plus 9 999 999', () => {
    expect(sanitize({ v: 2, bleu: { gagne: 10, depense: 50 } }, params).save.bleu).toEqual({ gagne: 10, depense: 10 });
    expect(solde(sanitize({ v: 2, bleu: { gagne: 99_999_999, depense: 0 } }, params).save)).toBe(SOLDE_MAX);
  });

  it('catalogue connu : objet inconnu ou d\'une rareté absente retiré, emplacement du mauvais type libéré', () => {
    const catalogue = new Map([['casque-kevlar', { type: 'tete', raretes: ['commun'] }]]);
    const raw = { v: 2, objets: [{ ...objet('a.0'), n: 1 }, { ...objet('b.0', 'pistolet'), n: 1 }, { ...objet('c.0', 'casque-kevlar', 'rare'), n: 1 }], porte: { torse: 'a.0' } };
    const { save } = sanitize(raw, { ...params, catalogue });
    expect(save.objets.map((o) => o.u)).toEqual(['a.0']);
    expect(save.porte.torse).toBe(null);
  });

  it('champs inconnus de la racine gardés à la réécriture (version plus récente du même format) ; __proto__ jamais lu', () => {
    const raw = JSON.parse('{"v":2,"futur":{"a":1},"__proto__":{"x":1}}');
    const { extra } = sanitize(raw, params);
    expect(extra).toEqual({ futur: { a: 1 } });
    const texte = JSON.stringify(serialiser(sanitize(raw, params).save, extra));
    expect(JSON.parse(texte).futur).toEqual({ a: 1 });
    expect(Object.hasOwn(JSON.parse(texte), 'x')).toBe(false);
  });

  it('lire : v > 2 refusée (future-version), v manquante ou autre (bad-schema)', () => {
    expect(lire({ v: 3 }, params)).toEqual({ ok: false, error: 'future-version' });
    expect(lire({ v: 1 }, params).ok).toBe(false);
    expect(lire([], params).ok).toBe(false);
    expect(lire({ v: 2 }, params).ok).toBe(true);
  });
});

describe('opérations : gains, achats atomiques, refus', () => {
  it('gain de manche : bleu, tués, temps, partie, record par monde et par mode, monde terminé', () => {
    const r = appliquerOps(defaultProgression(), [gain('p1.1', 12, { tues: 4, tempsMs: 30_000, partie: 'histoire', record: { mode: 'histoire', monde: 'batiment', manche: 1 } }), gain('p1.40', 500, { record: { mode: 'histoire', monde: 'batiment', manche: 40 }, monde: 'batiment' })], 7, params);
    expect(r.refused).toEqual([]);
    expect(r.save.bleu.gagne).toBe(512);
    expect(r.save.profil).toMatchObject({ tues: 4, tempsMs: 30_000, partiesHistoire: 1, partiesInfini: 0 });
    expect(r.save.records.histoire.batiment).toBe(40);
    expect(r.save.mondes).toEqual(['batiment']);
    expect(r.save.rev).toBe(1);
    expect(r.save.savedAt).toBe(7);
  });

  it('record infini séparé : il ne remplace jamais celui de l\'histoire', () => {
    const s = appliquerOps(avec(0), [gain('a', 0, { record: { mode: 'histoire', monde: 'batiment', manche: 12 } }), gain('b', 0, { record: { mode: 'infini', monde: 'batiment', manche: 55 } })], 1, params).save;
    expect(s.records).toEqual({ histoire: { batiment: 12 }, infini: { batiment: 55 } });
  });

  it('plafond : solde bloqué à 9 999 999 (le gain au-delà est perdu, jamais négatif)', () => {
    const s = appliquerOps(avec(SOLDE_MAX - 5), [gain('g1', 100)], 1, params).save;
    expect(solde(s)).toBe(SOLDE_MAX);
  });

  it('une opération déjà au journal n\'est jamais appliquée deux fois', () => {
    const s1 = appliquerOps(defaultProgression(), [gain('g1', 10)], 1, params).save;
    const s2 = appliquerOps(s1, [gain('g1', 10)], 2, params).save;
    expect(s2.bleu.gagne).toBe(10);
    expect(s2.journal.filter((id) => id === 'g1')).toHaveLength(1);
  });

  it('journal limité aux 64 derniers identifiants', () => {
    const ops = Array.from({ length: 80 }, (_, i) => gain(`g${i}`, 1));
    const s = appliquerOps(defaultProgression(), ops, 1, params).save;
    expect(s.journal).toHaveLength(JOURNAL_MAX);
    expect(s.journal.at(-1)).toBe('g79');
  });

  it.each([
    ['suffisant', 100, 60, true],
    ['exact', 60, 60, true],
    ['insuffisant', 59, 60, false],
  ])('achat, solde %s : prix prélevé et objets ajoutés dans la même écriture, ou rien du tout', (_n, avoir, prix, ok) => {
    const r = appliquerOps(avec(avoir), [{ id: 'a1', t: 'achat', prix, place: 100, objets: [objet('a1.0'), objet('a1.1')] }], 2, params);
    expect(r.save.objets.length).toBe(ok ? 2 : 0);
    expect(r.save.bleu.depense).toBe(ok ? prix : 0);
    expect(r.refused).toEqual(ok ? [] : [{ id: 'a1', raison: 'solde' }]);
    expect(solde(r.save)).toBeGreaterThanOrEqual(0);
  });

  it('deux achats concurrents pour un solde qui n\'en paie qu\'un : le second est refusé, jamais de solde négatif', () => {
    const r = appliquerOps(avec(100), [{ id: 'a1', t: 'achat', prix: 80, objets: [objet('a1.0')] }, { id: 'a2', t: 'achat', prix: 80, objets: [objet('a2.0')] }], 2, params);
    expect(r.save.objets.map((o) => o.u)).toEqual(['a1.0']);
    expect(r.refused).toEqual([{ id: 'a2', raison: 'solde' }]);
    expect(solde(r.save)).toBe(20);
  });

  it('inventaire plein (plafond de l\'achat, 100 dans objets.json) : achat refusé en entier', () => {
    const plein = appliquerOps(avec(1000), [{ id: 'a0', t: 'achat', prix: 0, place: 100, objets: Array.from({ length: 95 }, (_, i) => objet(`a0.${i}`)) }], 1, params).save;
    const r = appliquerOps(plein, [{ id: 'a1', t: 'achat', prix: 10, place: 100, objets: Array.from({ length: 10 }, (_, i) => objet(`a1.${i}`)) }], 2, params);
    expect(r.refused).toEqual([{ id: 'a1', raison: 'plein' }]);
    expect(r.save.objets).toHaveLength(95);
    expect(r.save.bleu.depense).toBe(0);
  });

  it('offre du jour : achetée une fois par jour ; un autre jour remet la liste à zéro', () => {
    const op = (id, jour, cle) => ({ id, t: 'achat', prix: 10, offre: { jour, cle }, objets: [objet(`${id}.0`)] });
    const r = appliquerOps(avec(100), [op('a1', 20406, '20406-2'), op('a2', 20406, '20406-2'), op('a3', 20407, '20407-2')], 1, params);
    expect(r.refused).toEqual([{ id: 'a2', raison: 'offre' }]);
    expect(r.save.offres).toEqual({ jour: 20407, achetees: ['20407-2'] });
    expect(r.save.bleu.depense).toBe(20);
  });

  it('personnages : nouveau débloqué, doublon +1 niveau au plus son maximum ; tenues ajoutées une fois', () => {
    const r = appliquerOps(avec(0), [{ id: 'a1', t: 'achat', prix: 0, persos: [{ id: 'personnage-2', max: 2 }], tenues: ['t1'] }, { id: 'a2', t: 'achat', prix: 0, persos: [{ id: 'personnage-2', max: 2 }, { id: 'personnage-2', max: 2 }], tenues: ['t1'] }], 1, params);
    expect(r.save.persos.debloques).toEqual(['survivant', 'personnage-2']);
    expect(r.save.persos.niveaux['personnage-2']).toBe(2);
    expect(r.save.tenues).toEqual(['t1']);
  });

  it('amélioration : niveau n → n + 1 et prix prélevé ; refusée si le niveau a changé (autre onglet) ou si le solde manque', () => {
    const base = appliquerOps(avec(100), [{ id: 'a1', t: 'achat', prix: 0, objets: [objet('a1.0')] }], 1, params).save;
    const r = appliquerOps(base, [{ id: 'm1', t: 'ameliorer', u: 'a1.0', de: 1, prix: 40 }, { id: 'm2', t: 'ameliorer', u: 'a1.0', de: 1, prix: 40 }, { id: 'm3', t: 'ameliorer', u: 'a1.0', de: 2, prix: 80 }], 2, params);
    expect(r.save.objets[0].n).toBe(2);
    expect(r.refused).toEqual([{ id: 'm2', raison: 'niveau' }, { id: 'm3', raison: 'solde' }]);
    expect(r.save.bleu.depense).toBe(40);
  });

  it('fusion : trois retirés, un créé, emplacement porté repris ; refusée si un des trois manque', () => {
    const base = appliquerOps(avec(500), [{ id: 'a1', t: 'achat', prix: 0, objets: [objet('a1.0'), objet('a1.1'), objet('a1.2')] }, { id: 'c1', t: 'choix', champ: 'porte', valeur: { tete: 'a1.1' }, date: 5 }], 1, params).save;
    const r = appliquerOps(base, [{ id: 'f1', t: 'fusion', uids: ['a1.0', 'a1.1', 'a1.2'], nouveau: { u: 'f1.0', i: 'casque-kevlar', r: 'peu-commun', n: 1 }, prix: 100 }, { id: 'f2', t: 'fusion', uids: ['a1.0', 'a1.1', 'a1.2'], nouveau: { u: 'f2.0', i: 'casque-kevlar', r: 'peu-commun', n: 1 }, prix: 100 }], 2, params);
    expect(r.save.objets.map((o) => o.u)).toEqual(['f1.0']);
    expect(r.save.porte.tete).toBe('f1.0');
    expect(r.refused).toEqual([{ id: 'f2', raison: 'absent' }]);
    expect(r.save.bleu.depense).toBe(100);
  });

  it('choix datés : le plus récent gagne (avatar, pseudo, personnage choisi, équipement)', () => {
    const r = appliquerOps(defaultProgression(), [
      { id: 'c1', t: 'choix', champ: 'avatar', valeur: 'tireur', date: 20 },
      { id: 'c2', t: 'choix', champ: 'avatar', valeur: 'rodeur', date: 10 },
      { id: 'c3', t: 'choix', champ: 'pseudo', valeur: '  Ana   Lou ', date: 5 },
      { id: 'c4', t: 'choix', champ: 'choisi', valeur: 'personnage-9', date: 5 },
    ], 1, params);
    expect(r.save.profil.avatar).toBe('tireur');
    expect(r.save.profil.pseudo).toBe('Ana Lou');
    expect(r.save.persos.choisi).toBe('survivant');
    expect(r.refused).toEqual([{ id: 'c4', raison: 'absent' }]);
  });
});

describe('export ZS2, import ZS1', () => {
  it('aller-retour ZS2 : toute la progression revient à l\'identique', () => {
    const s = appliquerOps(avec(300), [{ id: 'a1', t: 'achat', prix: 50, objets: [objet('a1.0')], tenues: ['t1'] }, gain('p.1', 0, { record: { mode: 'infini', monde: 'batiment', manche: 9 }, tues: 3 })], 5, params).save;
    const code = encoder(s, params);
    expect(code.startsWith('ZS2.')).toBe(true);
    const back = decoder(code, params);
    expect(back.ok).toBe(true);
    expect(back.source).toBe('ZS2');
    expect(serialiser(back.save)).toEqual(serialiser(s));
  });

  it('code ZS2 abîmé : somme de contrôle, préfixe, format, version plus récente', () => {
    const code = encoder(defaultProgression(), params);
    expect(decoder(`${code.slice(0, -1)}${code.endsWith('0') ? '1' : '0'}`, params).error).toBe('bad-checksum');
    expect(decoder('ZS9.abc.00000000', params).error).toBe('bad-prefix');
    expect(decoder('ZS2.abc', params).error).toBe('bad-format');
    expect(decoder('', params).error).toBe('empty');
    expect(decoder(42, params).error).toBe('bad-format');
  });

  it('code ZS1 importé : migré comme une sauvegarde v1 (niveaux, record de l\'histoire, parties, monde terminé ; argent non converti)', () => {
    const v1 = { ...defaultV1(), money: 4321, earned: 9000, stats: { ...defaultV1().stats, vie: 3, chutes: 1 }, records: { bestWave: 17, bestKills: 40, runs: 9, worldsCompleted: 1 } };
    const r = decoder(encodeSave(v1, params), params);
    expect(r.ok).toBe(true);
    expect(r.source).toBe('ZS1');
    expect(solde(r.save)).toBe(0);
    expect(r.save.niveaux.vie).toBe(3);
    expect(r.save.records.histoire.batiment).toBe(17);
    expect(r.save.profil.partiesHistoire).toBe(9);
    expect(r.save.mondes).toEqual(['batiment']);
    expect(depuisV1(null)).toEqual(defaultProgression());
    expect(decrire(r.save, params)).toMatchObject({ solde: 0, objets: 0, niveaux: 4 });
  });
});

describe('dépôt v2 : départ, refus, stockage indisponible', () => {
  it('stockage vide : nouveau joueur, rien écrit au chargement', () => {
    const st = createFakeStorage();
    const r = repo(st).load();
    expect(r.status).toBe('empty');
    expect(st.calls.setItem).toBe(0);
  });

  it('zs.save.v1 seule (lisible, corrompue ou plus récente) : nouveau joueur ; zs.save.v1 jamais lue en v2 ni écrite', () => {
    for (const v1 of [JSON.stringify({ ...defaultV1(), money: 999, records: { bestWave: 30, bestKills: 1, runs: 2, worldsCompleted: 0 } }), '{oups', JSON.stringify({ v: 9 })]) {
      const st = createFakeStorage({ [V1]: v1 });
      const d = repo(st);
      expect(d.load().status).toBe('empty');
      expect(d.commit([gain('g1', 12)], 5).ok).toBe(true);
      expect(st.data.get(V1)).toBe(v1);
      expect(solde(JSON.parse(st.data.get(V2)))).toBe(12);
      expect(JSON.parse(st.data.get(V2)).records).toEqual({ histoire: {}, infini: {} });
    }
  });

  it('v2 corrompue : verrouillée, rien écrit, texte brut gardé ; v2 plus récente : refus sans effacement', () => {
    for (const [texte, statut] of [['{oups', 'corrupt'], [JSON.stringify({ v: 3, bleu: 1 }), 'future'], ['x'.repeat(70_000), 'corrupt']]) {
      const st = createFakeStorage({ [V2]: texte });
      const d = repo(st);
      const r = d.load();
      expect(r.status).toBe(statut);
      expect(r.raw).toBe(texte.slice(0, 65_536));
      expect(d.commit([gain('g1', 12)], 5)).toMatchObject({ ok: false, error: 'locked' });
      expect(st.data.get(V2)).toBe(texte);
      expect(st.calls.removeItem).toBe(0);
    }
  });

  it('stockage indisponible : jouable, rien écrit (statut unavailable) ; quota refusé : échec, rien perdu de ce qui est écrit', () => {
    const st = createFakeStorage();
    st.failGet = securityError();
    const d = repo(st);
    expect(d.load().status).toBe('unavailable');
    expect(d.commit([gain('g1', 12)], 5).ok).toBe(false);
    const st2 = createFakeStorage();
    const d2 = repo(st2);
    d2.commit([gain('g1', 12)], 5);
    const avant = st2.data.get(V2);
    st2.failSet = quotaError();
    expect(d2.commit([gain('g2', 12)], 6).ok).toBe(false);
    expect(st2.data.get(V2)).toBe(avant);
  });

  it('mode essai (paramètres de test) et ?test=1 : aucune écriture', () => {
    for (const search of ['?wave=5', '?endless=1', '?money=500', '?test=1']) {
      const st = createFakeStorage();
      const d = repo(st, search);
      expect(d.commit([gain('g1', 12)], 5).ok).toBe(true);
      expect(st.calls.setItem).toBe(0);
    }
  });

  it('import (remplacement) permis sur une v2 verrouillée, jamais sur un stockage indisponible', () => {
    const st = createFakeStorage({ [V2]: '{oups' });
    const d = repo(st);
    expect(d.replace(avec(77), 9).ok).toBe(true);
    expect(solde(JSON.parse(st.data.get(V2)))).toBe(77);
  });

  it('écriture d\'une progression typique : quelques Ko, sous le plafond de 65 536 octets même inventaire plein (100)', () => {
    const plein = appliquerOps(avec(9000), [{ id: 'a0', t: 'achat', prix: 0, place: 100, objets: Array.from({ length: 100 }, (_, i) => objet(`7a1c09e2.${i}`, 'gilet-pare-balles', 'legendaire')) }], 1, params).save;
    const octets = new TextEncoder().encode(JSON.stringify(serialiser(plein))).length;
    expect(octets).toBeLessThan(10_000);
    expect(codecV2(params).maxBytes).toBe(65_536);
  });
});

describe('plusieurs onglets (simulateur, modèle du cache de Chromium du lot 5o)', () => {
  it('déterministe : même graine, même déroulé', () => {
    expect(simulateV2({ seed: 7, tabs: 3, params })).toEqual(simulateV2({ seed: 7, tabs: 3, params }));
  });

  it('témoin sans fusion : le simulateur trouve des pertes (il voit bien le défaut)', () => {
    expect(campagneV2({ n: 200, params, sansFusion: true }).pertes).toBeGreaterThan(0);
  });

  it('10 000 suites, 2 à 4 onglets : 0 perte, 0 double compte, aucune double dépense, jamais négatif, achats jamais coupés', () => {
    const c = campagneV2({ n: 10_000, params });
    expect({ echecs: c.echecs, pertes: c.pertes, doubles: c.doubles, doublesDepenses: c.doublesDepenses, negatifs: c.negatifs, coupes: c.coupes, confirmesAbsents: c.confirmesAbsents }).toEqual({ echecs: 0, pertes: 0, doubles: 0, doublesDepenses: 0, negatifs: 0, coupes: 0, confirmesAbsents: 0 });
    expect(c.achatsAnnules).toBeGreaterThan(0); // limite connue : un achat payé deux fois en même temps est annulé après coup (l'onglet est prévenu)
  }, 60_000);
});
