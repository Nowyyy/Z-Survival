// Lot 8j-C : message des portes (js/core/porte-message.js) et tirage des sons des zombies (js/core/sons-coups.js), fonctions pures ; réglages de
// data/game/reglages-partie.json.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLayouts } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { createRng, nextFloat } from '../../js/core/rng.js';
import { PORTE_DEFAUT, porteProche, reglagesPorte } from '../../js/core/porte-message.js';
import { COUPS_DEFAUT, estCoup, filtrerCoups, reglagesCoups, rngCoups } from '../../js/core/sons-coups.js';
import { BLEU_MANCHE_DEFAUT, reglagesBleuManche, texteBleuManche } from '../../js/game/bleu-manche.js';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const world = json(`${D}world.json`);
const layouts = buildLayouts({ rdc: { world, decor: json(`${D}decor.json`) }, etage: { world: json(`${D}etage.world.json`) }, zones: zonesToWorld(parseZones(json(`${D}zones.json`)), world.transform) });
const portes = layouts.doors;
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const bloc = (id, etage = 'rdc') => portes.find((p) => p.id === id).blocks[etage][0].rect;

describe('message « Porte ouverte à la manche X »', () => {
  it('données : trois portes, manche = openAfterWave + 1 (11, 21, 31), blocs par étage', () => {
    expect(portes.map((p) => [p.id, p.openAfterWave])).toEqual([['porte-1', 10], ['porte-2', 20], ['porte-3', 30]]);
    expect(portes.find((p) => p.id === 'porte-3').blocks.etage.length).toBeGreaterThan(0);
  });
  it('porte la plus proche du joueur, sur son étage, à la distance réglée au plus (bord du bloc)', () => {
    const r = bloc('porte-1');
    const pres = { x: r.x - 120, y: r.y + r.h / 2 };
    expect(porteProche(portes, {}, pres, 'rdc', 200)).toEqual({ id: 'porte-1', manche: 11, distance: 120 });
    expect(porteProche(portes, {}, { x: r.x - 201, y: r.y + r.h / 2 }, 'rdc', 200)).toBeNull();
    expect(porteProche(portes, {}, { x: r.x - 200, y: r.y + r.h / 2 }, 'rdc', 200)?.id).toBe('porte-1');
    // Dans le bloc : distance 0.
    expect(porteProche(portes, {}, centre(r), 'rdc', 200).distance).toBe(0);
    // Deux portes à portée : la plus proche.
    const a = bloc('porte-2');
    expect(porteProche(portes, {}, centre(a), 'rdc', 5000).id).toBe('porte-2');
    // Étage : seuls les blocs de l'étage du joueur.
    const e = bloc('porte-3', 'etage');
    expect(porteProche(portes, {}, centre(e), 'etage', 200)).toMatchObject({ id: 'porte-3', manche: 31 });
    expect(porteProche(portes, {}, centre(e), 'rdc', 10)).toBeNull();
  });
  it('jamais pour une porte ouverte ni « planned » ; entrées invalides : null', () => {
    const r = bloc('porte-1');
    expect(porteProche(portes, { 'porte-1': { open: true } }, centre(r), 'rdc', 200)).toBeNull();
    expect(porteProche(portes.map((p) => ({ ...p, planned: true })), {}, centre(r), 'rdc', 200)).toBeNull();
    expect(porteProche(portes.map((p) => ({ ...p, openAfterWave: 0 })), {}, centre(r), 'rdc', 200)).toBeNull();
    expect(porteProche(null, {}, centre(r))).toBeNull();
    expect(porteProche(portes, {}, null)).toBeNull();
    expect(porteProche(portes, {}, { x: Number.NaN, y: 0 })).toBeNull();
  });
  it('lecture seule : portes et état non modifiés', () => {
    const avant = JSON.stringify(portes);
    const etat = Object.freeze({ 'porte-2': Object.freeze({ open: false }) });
    porteProche(portes, etat, centre(bloc('porte-2')), 'rdc', 200);
    expect(JSON.stringify(portes)).toBe(avant);
  });
  // Lot 9a : défaut 120 (deux cases du dallage, demande du propriétaire ; avant : 60).
  it('distance réglable : 20 à 2000 unités, sinon le défaut (120 : deux cases, lot 9a ; avant 60, retour du propriétaire)', () => {
    expect(PORTE_DEFAUT.distance).toBe(120);
    expect(reglagesPorte({ distance: 350 }).distance).toBe(350);
    for (const d of [10, 2001, '300', null, Number.NaN]) expect(reglagesPorte({ distance: d }).distance).toBe(120);
    expect(reglagesPorte(undefined).distance).toBe(120);
  });
});

describe('sons des zombies : environ un coup sur quatre', () => {
  const p = { x: 0, y: 0 };
  it('proportion des coups sonores sur 10 000 coups reçus et portés : 0,25 ± 4 σ ; toutes les morts sonnent', () => {
    let rng = rngCoups(1);
    const n = 10_000;
    const types = ['zombieHit', 'zombieAttack', 'plankTorn'];
    let gardes = 0;
    let morts = 0;
    for (let i = 0; i < n; i += 1) {
      const coup = { type: types[i % 3], ...p, killed: false };
      const mort = { type: 'zombieHit', ...p, killed: true };
      const out = filtrerCoups([coup, mort, { type: 'shot', ...p }], rng);
      rng = out.rng;
      gardes += out.events.filter((e) => e === coup).length;
      morts += out.events.filter((e) => e === mort).length;
      expect(out.events.some((e) => e.type === 'shot')).toBe(true);
    }
    const sigma = Math.sqrt((0.25 * 0.75) / n);
    expect(Math.abs(gardes / n - 0.25)).toBeLessThan(4 * sigma);
    expect(morts).toBe(n);
  });
  it('générateur propre au son : graine décalée, jamais celui de la logique ; état d\'entrée non modifié ; sans coup, aucun tirage', () => {
    const logique = createRng(1);
    const coups = rngCoups(1);
    expect(coups.state).not.toBe(logique.state);
    expect(nextFloat(coups).value).not.toBe(nextFloat(logique).value);
    const gele = Object.freeze({ state: 12345 });
    const out = filtrerCoups([{ type: 'zombieAttack' }], gele);
    expect(gele.state).toBe(12345);
    expect(out.rng).not.toBe(gele);
    const sans = filtrerCoups([{ type: 'shot' }, { type: 'zombieHit', killed: true }], gele);
    expect(sans.rng).toBe(gele);
    // Déterministe : même graine, même tri.
    const ev = Array.from({ length: 40 }, () => ({ type: 'zombieHit', killed: false }));
    expect(filtrerCoups(ev, rngCoups(7)).events.length).toBe(filtrerCoups(ev, rngCoups(7)).events.length);
  });
  it('probabilité 0 : aucun coup ; 1 : tous ; hors bornes ou invalide : défaut 0,25 ; types : parmi les trois permis', () => {
    const ev = [{ type: 'zombieHit', killed: false }, { type: 'zombieAttack' }, { type: 'plankTorn' }, { type: 'zombieHit', killed: true }];
    expect(filtrerCoups(ev, rngCoups(1), reglagesCoups({ probabilite: 0 })).events.map((e) => e.type)).toEqual(['zombieHit']);
    expect(filtrerCoups(ev, rngCoups(1), reglagesCoups({ probabilite: 1 })).events).toHaveLength(4);
    for (const v of [-0.1, 1.5, '0.5', null, Number.NaN, undefined]) expect(reglagesCoups({ probabilite: v }).probabilite, String(v)).toBe(0.25);
    expect(reglagesCoups({ types: ['plankTorn', 'shot'] }).types).toEqual(['plankTorn']);
    expect(reglagesCoups({ types: ['shot'] }).types).toEqual(COUPS_DEFAUT.types);
    expect(estCoup({ type: 'plankTorn' }, ['zombieHit'])).toBe(false);
    expect(estCoup({ type: 'zombieHit', killed: true })).toBe(false);
  });
  it('data/game/reglages-partie.json : distance et probabilité dans leurs bornes (0,25 par défaut), types connus', () => {
    const r = json('data/game/reglages-partie.json');
    expect(reglagesPorte(r.porte).distance).toBe(r.porte.distance);
    expect(reglagesCoups(r.sonsZombies).probabilite).toBe(r.sonsZombies.probabilite);
    expect(r.sonsZombies.probabilite).toBe(0.25);
    expect(reglagesCoups(r.sonsZombies).types).toEqual(r.sonsZombies.types);
  });
});

describe('fin de manche : solde bleu et gain sous la vague (retour du propriétaire)', () => {
  it('texte « solde (+gain) » après la gemme (fr.json ; retour du propriétaire : seulement le logo), montants mis en forme ; durée 1 à 15 s de jeu, sinon 4', () => {
    const fr = json('data/i18n/fr.json');
    expect(fr['game.hud.bleuManche']).toBe('{solde} (+{gain})');
    expect(texteBleuManche(fr['game.hud.bleuManche'], 168, 12)).toBe('168 (+12)');
    expect(BLEU_MANCHE_DEFAUT.duree).toBe(4);
    expect(reglagesBleuManche({ duree: 6 }).duree).toBe(6);
    for (const d of [0, 16, '5', null, Number.NaN]) expect(reglagesBleuManche({ duree: d }).duree).toBe(4);
    expect(reglagesBleuManche(json('data/game/reglages-partie.json').bleuManche).duree).toBe(4);
  });
});

