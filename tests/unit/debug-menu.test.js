// Lot 5l-C : menu de débogage de la pause (js/game/debug-menu.js, bloc E2-13) : construction de l'adresse (valeurs non standard seulement, paramètres
// non gérés conservés, bornes, entrées hostiles, ?lvl= au format du jeu), préremplissage depuis une adresse, textes game.debug.* (français seulement,
// aucune clé orpheline), style aux jetons, chargement à la demande. Docs/ref/debug.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAPS, GERES, MONEY, NIVEAU_MAX, STATS, WAVE, adresseDebug, defaults, lireDebug, lireNiveaux, niveauxTexte, paramsDebug } from '../../js/game/debug-menu.js';
import { parseLevelsParam, normalizeLevels } from '../../js/core/player-stats.js';
import { PARAMS_T } from '../../js/core/graphics.js';

const read = (f) => readFileSync(f, 'utf8');
const STATS_CFG = JSON.parse(read('data/game/player-stats.json'));
const SAVE = JSON.parse(read('data/game/save.json'));
const fr = JSON.parse(read('data/i18n/fr.json'));
const en = JSON.parse(read('data/i18n/en.json'));
const withValues = (patch) => ({ ...defaults(), ...patch, levels: { ...defaults().levels, ...(patch.levels ?? {}) } });
// Niveaux que le jeu tire de ?lvl= (js/game/levels-source.js : parseLevelsParam puis normalizeLevels).
const gameLevels = (lvl) => {
  const p = parseLevelsParam(lvl, STATS_CFG);
  return normalizeLevels({ ...p.levels, ...p.extra }, STATS_CFG).levels;
};

describe('menu de débogage : adresse construite (lot 5l)', () => {
  it('paramètres gérés : ceux de Partie et de Mesure, tous dans le groupe T ; ceux de Partie tous dans readOnlyParams, perf et cap jamais', () => {
    expect(GERES).toEqual(['wave', 'money', 'lvl', 'planks', 'floor', 'map', 'nospawn', 'endless', 'fin', 'perf', 'cap']);
    for (const k of GERES) expect(PARAMS_T, k).toContain(k);
    for (const k of ['wave', 'money', 'lvl', 'planks', 'floor', 'map', 'nospawn', 'endless']) expect(SAVE.readOnlyParams, k).toContain(k);
    for (const k of ['perf', 'cap']) expect(SAVE.readOnlyParams).not.toContain(k);
    expect([WAVE, MONEY.min, MONEY.max, NIVEAU_MAX, CAPS]).toEqual([{ min: 1, max: 200 }, 0, 9999999, 10, ['30', '45', '60']]);
    expect(STATS.map((s) => [s[0], s[2]])).toEqual([['degats', 10], ['portee', 10], ['precision', 10], ['cadence', 10], ['vitesse', 10], ['vie', 10], ['regen', 10], ['chutes', 5], ['reparation', 10]]);
    // Mêmes bornes que les données du jeu (player-stats.json).
    expect(STATS_CFG.maxLevel).toBe(NIVEAU_MAX);
    expect([STATS_CFG.extra.chutes.maxLevel, STATS_CFG.extra.reparation.maxLevel]).toEqual([5, 10]);
  });

  it('valeurs standard : aucune valeur écrite (« jeu.html ») ; seulement les valeurs non standard, dans l\'ordre du panneau', () => {
    expect(adresseDebug('', defaults())).toBe('jeu.html');
    expect(paramsDebug(defaults())).toEqual([]);
    const url = adresseDebug('', withValues({ wave: 12, money: 500, all: 3, levels: Object.fromEntries(STATS.map(([id, , max]) => [id, Math.min(3, max)])), nospawn: true }));
    expect(url).toBe('jeu.html?wave=12&money=500&lvl=all:3&nospawn=1');
    expect(adresseDebug('', withValues({ planks: 2, floor: 'etage', map: 'salle', endless: true, fin: true, perf: true, cap: '45' }))).toBe('jeu.html?planks=2&floor=1&map=salle&endless=1&fin=monde&perf=1&cap=45');
    expect(adresseDebug('', withValues({ money: 0 }))).toBe('jeu.html?money=0'); // 0 est une valeur (solde de session nul), absent = solde de la sauvegarde
  });

  it('conserve les paramètres non gérés (v=, test=, gfx=, seed=…) dans leur ordre ; remplace les paramètres gérés d\'avant', () => {
    const search = '?v=12&test=1&wave=5&gfx=faible&perf=1&lvl=degats:9&seed=3&x=a%20b';
    expect(adresseDebug(search, withValues({ wave: 7 }))).toBe('jeu.html?v=12&test=1&gfx=faible&seed=3&x=a+b&wave=7');
    expect(adresseDebug(search, null)).toBe('jeu.html?v=12&test=1&gfx=faible&seed=3&x=a+b');
    expect(adresseDebug('?wave=5&money=9&nospawn=1&perf=1&cap=30', null)).toBe('jeu.html');
  });

  it('bornes : manche 1 à 200, argent 0 à 9 999 999, niveaux 0 à 10, chutes 0 à 5, planches 0 au maximum', () => {
    expect(paramsDebug(withValues({ wave: 0 }))).toEqual([]);
    expect(paramsDebug(withValues({ wave: 999 }))).toEqual([['wave', '200']]);
    expect(paramsDebug(withValues({ money: -5 }))).toEqual([['money', '0']]);
    expect(paramsDebug(withValues({ money: 123456789 }))).toEqual([['money', '9999999']]);
    expect(paramsDebug(withValues({ all: 99, levels: Object.fromEntries(STATS.map(([id]) => [id, 99])) }))).toEqual([['lvl', 'all:10']]);
    expect(paramsDebug(withValues({ levels: { chutes: 9, degats: 12 } }))).toEqual([['lvl', 'degats:10,chutes:5']]);
    expect(paramsDebug(withValues({ planks: 9 }))).toEqual([]);
    expect(paramsDebug(withValues({ planks: -1 }))).toEqual([['planks', '0']]);
    expect(paramsDebug(withValues({ planks: 3 }), { planksMax: 6 })).toEqual([['planks', '3']]);
  });

  it('?lvl= au format du jeu : « degats:3,precision:5 », « all:5 », « all:3,degats:5 » ; le jeu en tire exactement les niveaux du panneau', () => {
    expect(niveauxTexte(0, { degats: 3, precision: 5 })).toBe('degats:3,precision:5');
    const five = Object.fromEntries(STATS.map(([id, , max]) => [id, Math.min(5, max)]));
    expect(niveauxTexte(5, five)).toBe('all:5');
    expect(niveauxTexte(3, { ...Object.fromEntries(STATS.map(([id, , max]) => [id, Math.min(3, max)])), degats: 5, chutes: 0 })).toBe('all:3,degats:5,chutes:0');
    expect(niveauxTexte(0, {})).toBe('');
    for (const [all, levels] of [[0, { degats: 3, precision: 5 }], [5, five], [10, Object.fromEntries(STATS.map(([id, , max]) => [id, max]))], [2, { ...Object.fromEntries(STATS.map(([id]) => [id, 2])), vie: 7, reparation: 0 }]]) {
      const text = niveauxTexte(all, levels);
      const expected = Object.fromEntries(STATS.map(([id, , max]) => [id, Math.min(max, levels[id] ?? (all > 0 ? Math.min(all, max) : 0))]));
      const got = gameLevels(text);
      for (const [id] of STATS) expect(got[id] ?? 0, `${text} ${id}`).toBe(expected[id]);
      expect(parseLevelsParam(text, STATS_CFG).warnings, text).toEqual([]);
    }
  });

  it('entrées hostiles : valeurs de mauvais type, NaN, chaînes, objets : bornées ou valeur standard, jamais d\'exception', () => {
    for (const bad of [null, undefined, 42, 'x', [], { wave: 'abc', money: 'NaN', all: {}, levels: null, planks: '2; drop', floor: '<b>', map: 1, nospawn: 'true', cap: 50 }]) {
      expect(() => paramsDebug(bad)).not.toThrow();
      expect(paramsDebug(bad), JSON.stringify(bad)).toEqual([]);
    }
    expect(paramsDebug(withValues({ wave: '12', money: '500' }))).toEqual([['wave', '12'], ['money', '500']]);
    expect(paramsDebug(withValues({ wave: 12.5, money: 1.5 }))).toEqual([]);
    for (const s of [null, 42, {}, '?%E0%A4%A=1&wave=%ZZ', `?${'v=1&'.repeat(3000)}`]) expect(() => adresseDebug(s, defaults())).not.toThrow();
    expect(adresseDebug('?a=<script>&wave=3', withValues({ wave: 4 }))).toBe('jeu.html?a=%3Cscript%3E&wave=4');
  });
});

describe('menu de débogage : préremplissage depuis l\'adresse (lot 5l)', () => {
  it('lit chaque valeur avec les règles du jeu ; invalide ou absente : valeur standard', () => {
    expect(lireDebug('')).toEqual(defaults());
    const v = lireDebug('?wave=12&money=500&lvl=all:3&nospawn=1&planks=1&floor=1&map=salle&endless=1&fin=monde&perf=1&cap=60&gfx=faible');
    expect(v).toMatchObject({ wave: 12, money: 500, all: 3, nospawn: true, planks: 1, floor: 'etage', map: 'salle', endless: true, fin: true, perf: true, cap: '60' });
    expect(v.levels).toEqual(Object.fromEntries(STATS.map(([id, , max]) => [id, Math.min(3, max)])));
    expect(lireDebug('?wave=0&money=-1&planks=9&floor=2&map=autre&nospawn=oui&fin=1&perf=2&cap=50')).toEqual(defaults());
    expect(lireDebug('?wave=201&money=10000000')).toMatchObject({ wave: 1, money: null });
    expect(lireDebug('?planks=5', { planksMax: 6 }).planks).toBe(5);
  });

  it('niveaux : « all » puis chaque statistique (comme le jeu) ; entrée inconnue ignorée', () => {
    expect(lireNiveaux('all:7,degats:2')).toEqual({ all: 7, levels: { degats: 2, portee: 7, precision: 7, cadence: 7, vitesse: 7, vie: 7, regen: 7, chutes: 5, reparation: 7 } });
    expect(lireNiveaux('degats:3,precision:5,inconnu:4,vie:x')).toEqual({ all: 0, levels: { ...defaults().levels, degats: 3, precision: 5 } });
    expect(lireNiveaux('chutes:9,all:99')).toEqual({ all: 10, levels: { degats: 10, portee: 10, precision: 10, cadence: 10, vitesse: 10, vie: 10, regen: 10, chutes: 5, reparation: 10 } });
    for (const bad of [null, 42, {}, 'all:', ',,,', 'a'.repeat(5000)]) expect(lireNiveaux(bad).all).toBe(0);
  });

  it('aller-retour : préremplir une adresse puis appliquer redonne les mêmes valeurs du panneau', () => {
    for (const s of ['?wave=12&money=500&lvl=all:3&nospawn=1', '?lvl=degats:3,precision:5&floor=1', '?map=salle&planks=0&cap=30&perf=1', '?endless=1&fin=monde&lvl=all:4,vie:9']) {
      const v = lireDebug(s);
      expect(lireDebug(adresseDebug(s, v).slice('jeu.html'.length)), s).toEqual(v);
    }
  });
});

describe('menu de débogage : textes, style et chargement (lot 5l)', () => {
  const src = read('js/game/debug-menu.js');
  const keys = Object.keys(fr).filter((k) => k.startsWith('game.debug.'));

  it('textes game.debug.* en français seulement (comme game.options.*), chacun écrit en entier dans debug-menu.js ou jeu.html (aucune clé orpheline) et défini', () => {
    expect(keys.length).toBeGreaterThan(20);
    expect(Object.keys(en).filter((k) => k.startsWith('game.debug.'))).toEqual([]);
    const page = read('jeu.html');
    for (const k of keys) expect(src.includes(`'${k}'`) || page.includes(`data-i18n-label="${k}"`), k).toBe(true);
    for (const k of new Set(src.match(/'game\.debug\.[A-Za-z0-9.]+'/g).map((m) => m.slice(1, -1)))) expect(fr[k], k).toBeDefined();
    expect(fr['game.debug.title']).toBe('Débogage');
    expect(fr['game.debug.trial']).toBe('Mode essai : ta sauvegarde n\'est pas modifiée.');
    expect(fr['game.debug.confirm']).toMatch(/Cette partie sera perdue/);
    expect([fr['game.debug.apply'], fr['game.debug.normal']]).toEqual(['Appliquer et recharger', 'Revenir au jeu normal']);
  });

  it('bloc E2-13 (jamais E2-9 ni E2-11) ; aucune couleur en dur ; panneau aux classes de l\'écran Options ; aucun import (module isolé)', () => {
    expect(src).toContain("'data-block': 'E2-13'");
    expect(read('jeu.html')).not.toContain('data-block="E2-13"'); // créé par le module, à la première ouverture
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(src).not.toMatch(/^import /m);
    for (const c of ['panel-options', 'options-scroll', 'options-row', 'options-value', 'options-reload']) expect(src).toContain(`'${c}'`);
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|fetch\(/);
  });

  it('chargé par import dynamique au premier clic (ui.js), jamais importé au démarrage', () => {
    const ui = read('js/game/ui.js');
    expect(ui).toContain("(await import('./debug-menu.js')).createDebugMenu(");
    for (const f of ['js/game/main.js', 'js/game/game.js', 'js/game/ui.js', 'js/game/hud.js', 'jeu.html']) expect(read(f)).not.toMatch(/^import .*debug-menu/m);
  });
});
