// Lot 8b : mondes du menu (data/menu/mondes.json), onglet Jouer (panneaux atteints, portes ouvertes, repère du record), monde suivant
// (js/core/menu-etat.js, pur). Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MONDE_DEFAUT, etatJouer, lireMondes, lireRecord, mondeSuivant, premierJouable } from '../../js/core/menu-etat.js';

const read = (f) => readFileSync(f, 'utf8');
const fichier = JSON.parse(read('data/menu/mondes.json'));
const mondes = lireMondes(fichier);
const batiment = mondes[0];
const atteints = (record) => etatJouer(batiment, record).panneaux.filter((p) => p.atteint).map((p) => p.manche);

describe('data/menu/mondes.json (lireMondes)', () => {
  it('monde 1 « Le bâtiment » jouable (40 manches, portes après 10, 20, 30), puis mondes 2 à 6 « [à venir] » verrouillés', () => {
    expect(mondes.map((m) => [m.numero, m.id, m.jouable])).toEqual([[1, 'batiment', true], [2, 'monde-2', false], [3, 'monde-3', false], [4, 'monde-4', false], [5, 'monde-5', false], [6, 'monde-6', false]]);
    expect(batiment).toEqual({ id: 'batiment', numero: 1, nom: 'Le bâtiment', jouable: true, manches: 40, portes: [10, 20, 30] });
    for (const m of mondes.slice(1)) expect([m.nom, m.manches, m.portes]).toEqual(['[à venir]', undefined, undefined]);
    expect(fichier._note).toMatch(/provisoires/);
  });

  it('le monde 1 suit le jeu : 40 manches et portes de zones.json (data/game/maps/rez-de-chaussee)', () => {
    const zones = JSON.parse(read('data/game/maps/rez-de-chaussee/zones.json'));
    expect(batiment.manches).toBe(zones.wavesPerWorld);
    expect(batiment.portes).toEqual(zones.doors.filter((d) => d.planned !== true).map((d) => d.openAfterWave).sort((a, b) => a - b));
    expect(batiment.id).toBe(MONDE_DEFAUT.id);
  });

  it('fichier absent ou illisible : le monde de repli (le bâtiment, jouable)', () => {
    for (const absent of [null, undefined, 'texte', 42, [], {}, { mondes: 'x' }, { mondes: [] }]) {
      const l = lireMondes(absent);
      expect(l, JSON.stringify(absent)).toEqual([{ ...MONDE_DEFAUT, portes: [10, 20, 30] }]);
      expect(premierJouable(l).id).toBe('batiment');
    }
  });

  it('entrées invalides ignorées : identifiant ou numéro absent, en double, hostile ; nom borné ; ordre des numéros', () => {
    const l = lireMondes({
      mondes: [
        null, 'x', { numero: 3, jouable: false }, { id: 'B A D', numero: 4 }, { id: 'ok-2', numero: 2, nom: 'Deux', jouable: false },
        { id: '__proto__', numero: 7 }, { id: 'ok-1', numero: 1, nom: ` ${'n'.repeat(80)} `, jouable: true, manches: 12, portes: [4, 8] },
        { id: 'ok-1', numero: 5 }, { id: 'ok-3', numero: 2 }, { id: 'ok-9', numero: 1.5 }, { id: 'ok-8', numero: 0 },
      ],
    });
    expect(l.map((m) => m.id)).toEqual(['ok-1', 'ok-2']);
    expect(l[0]).toEqual({ id: 'ok-1', numero: 1, nom: 'n'.repeat(40), jouable: true, manches: 12, portes: [4, 8] });
  });

  it('monde jouable sans manches ni portes valides : celles du monde de repli ; « jouable » seulement si true', () => {
    const l = lireMondes({ mondes: [{ id: 'a', numero: 1, jouable: true, manches: -3, portes: [10, 'x'] }, { id: 'b', numero: 2, jouable: 'oui' }] });
    expect(l[0]).toMatchObject({ manches: 40, portes: [10, 20, 30] });
    expect(l[1].jouable).toBe(false);
    expect(lireMondes({ mondes: [{ id: 'a', numero: 1, jouable: true, manches: 20, portes: [25] }] })[0].portes).toEqual([10, 20, 30]);
  });

  it('aucun monde jouable : le monde de repli d\'abord, les verrouillés ensuite', () => {
    const l = lireMondes({ mondes: [{ id: 'monde-2', numero: 2, nom: 'X', jouable: false }] });
    expect(l.map((m) => [m.id, m.jouable])).toEqual([['batiment', true], ['monde-2', false]]);
  });
});

describe('onglet Jouer : record, panneaux atteints, portes ouvertes, repère (etatJouer)', () => {
  it('aucun record : « — », tous les panneaux en bois, 0 / 3 portes, pas de repère', () => {
    for (const r of [null, undefined, 0, -1, 2.5, '12', Number.NaN]) {
      expect(etatJouer(batiment, r), String(r)).toEqual({
        record: null, manches: 40, portesOuvertes: 0, portesTotal: 3, repere: null,
        panneaux: [1, 10, 20, 30, 40].map((manche) => ({ manche, atteint: false })),
      });
    }
  });

  it('panneaux 1, 10, 20, 30, 40 atteints et portes ouvertes selon le record (9, 10, 25, 40, au-delà)', () => {
    expect([atteints(1), etatJouer(batiment, 1).portesOuvertes]).toEqual([[1], 0]);
    expect([atteints(9), etatJouer(batiment, 9).portesOuvertes]).toEqual([[1], 0]);
    expect([atteints(10), etatJouer(batiment, 10).portesOuvertes]).toEqual([[1, 10], 1]);
    expect([atteints(25), etatJouer(batiment, 25).portesOuvertes]).toEqual([[1, 10, 20], 2]);
    expect([atteints(40), etatJouer(batiment, 40).portesOuvertes]).toEqual([[1, 10, 20, 30, 40], 3]);
    expect([atteints(57), etatJouer(batiment, 57).portesOuvertes, etatJouer(batiment, 57).record]).toEqual([[1, 10, 20, 30, 40], 3, 40]); // l'histoire finit à 40
  });

  it('repère sur la route : indice de panneau, fraction entre deux ; au-delà de 40 sur le dernier', () => {
    expect([1, 10, 20, 25, 30, 40, 99].map((r) => etatJouer(batiment, r).repere)).toEqual([0, 1, 2, 2.5, 3, 4, 4]);
    expect(etatJouer(batiment, 9).repere).toBeCloseTo(8 / 9, 10);
  });

  it('monde verrouillé ou absent : modèle du monde de repli ; lireRecord ne garde qu\'un entier ≥ 1', () => {
    expect(etatJouer(mondes[1], 25)).toEqual(etatJouer(batiment, 25));
    expect(etatJouer(null, 10).portesOuvertes).toBe(1);
    expect([lireRecord(1), lireRecord(40), lireRecord(0), lireRecord('3'), lireRecord(3.2), lireRecord(null)]).toEqual([1, 40, null, null, null, null]);
  });

  it('monde suivant du monde 1 : le monde 2, verrouillé ; aucun après le dernier', () => {
    expect(mondeSuivant(mondes, 'batiment')).toMatchObject({ numero: 2, jouable: false });
    expect([mondeSuivant(mondes, 'monde-6'), mondeSuivant(mondes, 'inconnu'), mondeSuivant(null, 'batiment')]).toEqual([null, null, null]);
  });
});

describe('onglet Jouer : code et textes (js/menu/jouer.js)', () => {
  const code = read('js/menu/jouer.js');
  const css = read('css/menu.css');
  it('scène décorative (aria-hidden), aucune couleur ni image dans le JavaScript, aucun innerHTML', () => {
    expect(code).toMatch(/'aria-hidden': 'true'/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|innerHTML|\.png|\.jpg|\.svg'/);
  });

  it('animations e8-jouer-* seulement, en pause hors de l\'écran (data-anim), coupées sous prefers-reduced-motion (zombies absents)', () => {
    const noms = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]).filter((n) => n.startsWith('e8-jouer'));
    expect(noms.length).toBeGreaterThanOrEqual(10);
    for (const m of css.matchAll(/animation: (e8-jouer-[\w-]+)/g)) expect(noms, m[1]).toContain(m[1]);
    expect(css).toMatch(/\.e8-jouer-scene\[data-anim="off"\] \* \{\s*animation-play-state: paused;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.e8-jouer-zombie-proche,\s*\.e8-jouer-rodeur-g,\s*\.e8-jouer-rodeur-d \{\s*display: none;/);
    expect(read('js/menu/menu.js')).toMatch(/document\.addEventListener\('visibilitychange', animer\)/);
  });

  it('aucun clignotement de plus de 3 par seconde : un seul éclair par tir, cycles de 8 et 10 s', () => {
    for (const lettre of ['a', 'b']) {
      const k = css.slice(css.indexOf(`@keyframes e8-jouer-tir-${lettre}`), css.indexOf('}\n}', css.indexOf(`@keyframes e8-jouer-tir-${lettre}`)));
      expect(k.match(/opacity: 1/g), lettre).toHaveLength(1);
    }
    expect(css).toMatch(/\.e8-jouer-tir-a \{ animation: e8-jouer-tir-a 8s/);
    expect(css).toMatch(/\.e8-jouer-tir-b \{ animation: e8-jouer-tir-b 10s/);
  });
});
