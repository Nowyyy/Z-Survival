// Lot 8b : mondes du menu (data/menu/mondes.json), onglet Jouer (panneaux atteints, portes ouvertes, repère du record), monde suivant
// (js/core/menu-etat.js, pur) ; onglet Infini (carrousel, classement d'exemple), option de démarrage, mode infini = ?endless=1 sans lecture seule.
// Docs/ref/menu-principal.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODES, MONDE_DEFAUT, choisirCarte, creerCarrousel, etatJouer, lireClassement, lireMondes, lireOptionDemarrage, lireRecord, mondeSuivant, premierJouable } from '../../js/core/menu-etat.js';
import { createDirector, info, stepDirector } from '../../js/core/wave-director.js';
import { parseZones } from '../../js/core/zones.js';
import { readOnlyMode } from '../../js/core/save.js';
import { createRepository } from '../../js/save/index.js';

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

// --- Partie C : onglet Infini, option de démarrage, mode infini réel ------------------------------------------------------------------------------

describe('carrousel de l\'onglet Infini (choisirCarte)', () => {
  it('carte choisie au départ : le premier monde jouable ; un monde verrouillé ou inconnu ne se choisit pas', () => {
    const c = creerCarrousel(mondes);
    expect(c).toEqual({ choisi: 'batiment' });
    for (const id of ['monde-2', 'monde-6', 'inconnu', '', null, undefined, 42, '__proto__']) expect(choisirCarte(c, mondes, id), String(id)).toBe(c);
    expect(choisirCarte(c, mondes, 'batiment')).toEqual({ choisi: 'batiment' });
    expect(creerCarrousel(null)).toEqual({ choisi: 'batiment' });
  });

  it('plusieurs mondes jouables : la sélection suit le clic ; état d\'origine non modifié', () => {
    const deux = lireMondes({ mondes: [{ id: 'a', numero: 1, jouable: true }, { id: 'b', numero: 2, jouable: true }, { id: 'c', numero: 3 }] });
    const c = creerCarrousel(deux);
    const d = choisirCarte(c, deux, 'b');
    expect([c.choisi, d.choisi, choisirCarte(d, deux, 'c').choisi]).toEqual(['a', 'b', 'b']);
  });

  it('classement d\'exemple : 5 lignes au plus, rangs 1 à 5, entrées invalides ignorées ; fichier marqué « exemple »', () => {
    const fichierC = JSON.parse(read('data/menu/classement.json'));
    expect(fichierC.exemple).toBe(true);
    expect(fichierC._note).toMatch(/EXEMPLE/);
    expect(lireClassement(fichierC).map((l) => [l.rang, l.pseudo])).toEqual([1, 2, 3, 4, 5].map((r) => [r, '[pseudo]']));
    expect(lireClassement({ lignes: [null, { pseudo: ' x ', manche: 3 }, { pseudo: '', manche: 2 }, { pseudo: 'y', manche: 0 }, { pseudo: 'z', manche: '9' }] })).toEqual([{ rang: 1, pseudo: 'x', manche: 3 }]);
    for (const bad of [null, {}, { lignes: 'x' }, []]) expect(lireClassement(bad)).toEqual([]);
  });
});

describe('option de démarrage (lireOptionDemarrage)', () => {
  it('histoire et infini sur le bâtiment ; monde inconnu ou verrouillé → histoire sur le monde 1', () => {
    expect(MODES).toEqual(['histoire', 'infini']);
    expect(lireOptionDemarrage({ mode: 'histoire', monde: 'batiment' }, mondes)).toEqual({ mode: 'histoire', monde: 'batiment' });
    expect(lireOptionDemarrage({ mode: 'infini', monde: 'batiment' }, mondes)).toEqual({ mode: 'infini', monde: 'batiment' });
    for (const monde of ['monde-2', 'inconnu', '']) expect(lireOptionDemarrage({ mode: 'infini', monde }, mondes), monde).toEqual({ mode: 'histoire', monde: 'batiment' });
  });

  it('entrée hostile : histoire sur le monde 1, sans exception ni champ en plus', () => {
    const hostile = [null, undefined, 'infini', 42, [], ['infini', 'batiment'], { mode: 'INFINI', monde: 'batiment' }, { mode: 'infini' }, { monde: 'batiment' },
      { mode: ['infini'], monde: 'batiment' }, { mode: 'infini', monde: { id: 'batiment' } }, JSON.parse('{"__proto__": {"mode": "infini"}, "monde": "batiment"}'),
      Object.create({ mode: 'infini', monde: 'batiment' }), { mode: 'infini', monde: 'batiment', extra: 'x', toString: () => 'y' }];
    for (const h of hostile.slice(0, -1)) expect(lireOptionDemarrage(h, mondes)).toEqual({ mode: 'histoire', monde: 'batiment' });
    expect(Object.keys(lireOptionDemarrage(hostile.at(-1), mondes))).toEqual(['mode', 'monde']);
    expect(lireOptionDemarrage({ mode: 'infini', monde: 'batiment' }, null)).toEqual({ mode: 'histoire', monde: 'batiment' });
  });

  it('le jeu lit l\'option sans paramètre d\'adresse : main.js (endless = ?endless=1 ou mode infini), demarrage.js (deux champs connus), game.js (records filtrés)', () => {
    const main = read('js/game/main.js');
    expect(main).toContain("endless: query.get('endless') === '1' || optionPartie().mode === 'infini',");
    expect(main).toContain('modePartie: optionPartie().mode,');
    const dem = read('js/menu/demarrage.js');
    expect(dem).toContain("if (option?.mode === 'infini' && typeof option.monde === 'string') partie = Object.freeze({ mode: 'infini', monde: option.monde });");
    expect(dem).toContain("let partie = Object.freeze({ mode: 'histoire', monde: 'batiment' });");
    expect(read('js/game/game.js')).toContain("const depot = ctx.modePartie === 'infini' ? { ...ctx.repository, commit: (delta, at) => ctx.repository.commit({ ...delta, bestWave: 0, bestKills: 0 }, at) } : ctx.repository;");
    expect(read('js/menu/menu.js')).toContain('jouer(lireOptionDemarrage(option, mondes));');
  });
});

describe('mode infini réel = logique de ?endless=1, sans lecture seule', () => {
  const params = JSON.parse(read('data/game/waves.json'));
  const zonesJson = JSON.parse(read('data/game/maps/rez-de-chaussee/zones.json'));
  const zones = parseZones(zonesJson);
  const decor = JSON.parse(read('data/game/maps/rez-de-chaussee/decor.json'));
  const points = decor.spawnPoints.slice(0, 10);
  // Paramètre endless comme main.js le calcule : ?endless=1 dans l'adresse, ou option « infini » du menu (adresse vide).
  const endlessDe = (search, option) => new URLSearchParams(search).get('endless') === '1' || option.mode === 'infini';
  const directeur = (search, option, seed) => createDirector(params, { seed, wave: 1, doors: zones.doors.map((d) => ({ id: d.id, openAfterWave: d.openAfterWave, planned: d.planned === true })), wavesPerWorld: zones.wavesPerWorld, endless: endlessDe(search, option) });
  // Trace : chaque pas (aucun zombie vivant : chaque manche se termine dès que tout est apparu), jusqu'à la manche 45 ; état et événements sérialisés.
  function trace(d0) {
    let d = d0;
    const pas = [];
    for (let i = 0; i < 400000 && !(info(d).wave === 45 && info(d).phase === 'apparition'); i += 1) {
      const out = stepDirector(d, { dt: 0.05, alive: 0, view: null, points });
      d = out.state;
      if (out.events.length || out.requests.length || i % 500 === 0) pas.push(JSON.stringify([i, info(d), out.events, out.requests]));
      if (info(d).worldEnd) break;
    }
    return { pas, fin: info(d) };
  }

  for (const seed of [1, 7]) {
    it(`graine ${seed} : trace identique (option « infini » / ?endless=1) jusqu'à la manche 45, aucune fin de monde ; l'histoire s'arrête à 40`, () => {
      const infini = trace(directeur('', lireOptionDemarrage({ mode: 'infini', monde: 'batiment' }, mondes), seed));
      const endless = trace(directeur('?endless=1', { mode: 'histoire' }, seed));
      expect(infini.pas.length).toBeGreaterThan(100);
      expect(infini.pas).toEqual(endless.pas);
      expect([infini.fin.wave, infini.fin.worldEnd]).toEqual([45, false]);
      const histoire = trace(directeur('', lireOptionDemarrage({ mode: 'histoire', monde: 'batiment' }, mondes), seed));
      expect([histoire.fin.wave, histoire.fin.worldEnd]).toEqual([40, true]);
      expect(histoire.pas.slice(0, 50)).toEqual(infini.pas.slice(0, 50)); // mêmes premières manches
    });
  }

  it('sauvegarde : ?endless=1 la met en lecture seule (mode essai) ; le mode infini (adresse sans paramètre) non', () => {
    const save = JSON.parse(read('data/game/save.json'));
    const economy = JSON.parse(read('data/game/economy.json'));
    const stats = JSON.parse(read('data/game/player-stats.json'));
    expect(readOnlyMode('?endless=1', { save })).toEqual({ readOnly: true, reasons: ['endless'] });
    expect(readOnlyMode('', { save })).toEqual({ readOnly: false, reasons: [] });
    expect(readOnlyMode('?test=1&menu=1&store=local&seed=3', { save })).toEqual({ readOnly: false, reasons: [] });
    const stockage = new Map();
    const storage = { getItem: (k) => (stockage.has(k) ? stockage.get(k) : null), setItem: (k, v) => stockage.set(k, String(v)), removeItem: (k) => stockage.delete(k), key: () => null, length: 0 };
    const { repository, mode } = createRepository({ search: '', storage, params: { save, economy, stats } });
    expect([mode.kind, mode.readOnly]).toEqual(['local', false]);
    expect(repository.commit({ money: 30 }, 1).ok).toBe(true);
    expect(JSON.parse(stockage.get(save.storageKey)).money).toBe(30);
  });
});
