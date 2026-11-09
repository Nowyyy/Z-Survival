// Lot 5l-B : paramètres d'adresse par canal (js/core/graphics.js : acces, filtrerAdresse ; js/game/graphics-boot.js : pageCanal, pageSearch).
// Table complète canal × paramètre, avec et sans ?test=1 ; groupes G et T ; ?test=1 refusé en production ; entrées hostiles ; readOnlyParams inchangé ;
// mention « imposé par l'adresse » seulement quand l'adresse est prise en compte. Docs/ref/debug.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CANAUX, CANAUX_DEBUG, PARAMS_G, PARAMS_T, PARAMS_TEST, acces, effectiveOptions, explicitParams, filtrerAdresse, groupeParam, lireCanal, parseGraphics,
} from '../../js/core/graphics.js';
import { readOnlyMode } from '../../js/core/save.js';
import { pageCanal } from '../../js/game/graphics-boot.js';

const SAVE = JSON.parse(readFileSync('data/game/save.json', 'utf8'));
const CFG = parseGraphics(JSON.parse(readFileSync('data/game/graphics.json', 'utf8')));
const read = (f) => readFileSync(f, 'utf8');
const ALL = [...PARAMS_G, ...PARAMS_T, ...PARAMS_TEST];
// Canaux essayés : les cinq connus, absent (null), et des valeurs inconnues ou hostiles (traitées comme la production).
const CASES = ['source', 'dev', 'release', 'archive', 'prod', null, undefined, '', 'Dev', 'RELEASE', ' source', 'source ', 'production', 'inconnu', 42, {}, ['dev']];

// Règle attendue, écrite à part du code : G sous test=1 autorisé ou sur source ; T et test sur source, dev, release ; autres noms toujours.
function attendu(canal, name, withTest) {
  const debug = ['source', 'dev', 'release'].includes(canal);
  const test = debug && withTest;
  if (['gfx', 'lum', 'lampgain', 'shadows', 'vhs', 'dpr', 'detail', 'perso', 'sang', 'usure', 'percee'].includes(name)) return test || canal === 'source';
  if (['wave', 'lvl', 'money', 'planks', 'floor', 'map', 'nospawn', 'endless', 'fin', 'perf', 'cap', 'fps', 'zoom', 'tilt', 'labels', 'sons', 'test', 'store', 'seed', 'empty'].includes(name)) return debug;
  return true;
}

describe('canaux et groupes (lot 5l)', () => {
  it('listes : canaux, canaux de débogage, groupes G, T et test (sans recouvrement)', () => {
    expect(CANAUX).toEqual(['source', 'dev', 'release', 'archive', 'prod']);
    expect(CANAUX_DEBUG).toEqual(['source', 'dev', 'release']);
    expect(PARAMS_G).toEqual(['gfx', 'lum', 'lampgain', 'shadows', 'vhs', 'dpr', 'detail', 'perso', 'sang', 'usure', 'percee']);
    expect(PARAMS_T).toEqual(['wave', 'lvl', 'money', 'planks', 'floor', 'map', 'nospawn', 'endless', 'fin', 'perf', 'cap', 'fps', 'zoom', 'tilt', 'labels', 'sons']);
    expect(PARAMS_TEST).toEqual(['test', 'store', 'seed', 'empty']);
    expect(new Set(ALL).size).toBe(ALL.length);
    for (const list of [CANAUX, CANAUX_DEBUG, PARAMS_G, PARAMS_T, PARAMS_TEST]) expect(Object.isFrozen(list)).toBe(true);
    expect(['gfx', 'wave', 'test', 'v', 'x'].map(groupeParam)).toEqual(['G', 'T', 'test', 'autre', 'autre']);
  });

  it('lireCanal : valeur exacte seulement ; absent, vide, casse ou espaces différents, autre type : null', () => {
    for (const c of CANAUX) expect(lireCanal(c)).toBe(c);
    for (const bad of [null, undefined, '', 'Dev', ' source', 'source ', 'production', 'prod\n', 42, {}, ['dev'], true]) expect(lireCanal(bad), String(bad)).toBe(null);
  });

  it('table complète canal × paramètre, avec et sans ?test=1 (tous les paramètres connus, plus ?v= et un nom inconnu)', () => {
    let rows = 0;
    for (const canal of CASES) {
      for (const withTest of [false, true]) {
        const search = `?${ALL.filter((n) => n !== 'test').map((n) => `${n}=1`).join('&')}&v=3&inconnu=x${withTest ? '&test=1' : ''}`;
        const a = acces(canal, search);
        const known = lireCanal(canal);
        expect(a.canal, String(canal)).toBe(known);
        expect(a.debug, String(canal)).toBe(['source', 'dev', 'release'].includes(known));
        expect(a.test, String(canal)).toBe(a.debug && withTest);
        for (const name of [...ALL, 'v', 'inconnu']) {
          expect(a.params[name], `${String(canal)} ${withTest ? 'test=1' : 'sans test'} ${name}`).toBe(attendu(known, name, withTest));
          rows += 1;
        }
      }
    }
    expect(rows).toBe(CASES.length * 2 * (ALL.length + 2));
  });

  it('groupe G : sans effet sur dev et release sans ?test=1 ; pris en compte sous ?test=1 ou sur source ; jamais sur archive, prod ou absent', () => {
    for (const name of PARAMS_G) {
      expect([acces('dev', '').params[name], acces('release', '').params[name]], name).toEqual([false, false]);
      expect([acces('dev', '?test=1').params[name], acces('release', '?test=1').params[name], acces('source', '').params[name]], name).toEqual([true, true, true]);
      for (const c of ['archive', 'prod', null]) expect([acces(c, '').params[name], acces(c, '?test=1').params[name]], `${c} ${name}`).toEqual([false, false]);
    }
  });

  it('groupe T : sur source, dev et release avec ou sans ?test=1 ; jamais sur archive, prod ou absent', () => {
    for (const name of PARAMS_T) {
      for (const c of CANAUX_DEBUG) expect([acces(c, '').params[name], acces(c, '?test=1').params[name]], `${c} ${name}`).toEqual([true, true]);
      for (const c of ['archive', 'prod', null, 'inconnu']) expect([acces(c, '').params[name], acces(c, '?test=1').params[name]], `${c} ${name}`).toEqual([false, false]);
    }
  });

  it('?test=1 refusé en production (prod, archive, absent, inconnu) : ni test, ni store, ni seed, ni empty ; ?test=0 ou ?test=oui ne valent pas test=1', () => {
    for (const c of ['prod', 'archive', null, 'inconnu']) {
      const a = acces(c, '?test=1&store=local&seed=7&empty=1');
      expect([a.test, a.debug, a.params.test, a.params.store, a.params.seed, a.params.empty], String(c)).toEqual([false, false, false, false, false, false]);
      expect(filtrerAdresse('?test=1&store=local&seed=7&empty=1&nospawn=1&wave=5&shadows=0', c), String(c)).toBe('');
    }
    for (const v of ['0', 'oui', 'true', '', '1 ']) expect(acces('dev', `?test=${encodeURIComponent(v)}`).test, v).toBe(false);
    expect(acces('dev', '?test=1').test).toBe(true);
  });

  it('filtrerAdresse : chaîne identique quand rien n\'est refusé (toujours sur source) ; sinon les seuls paramètres refusés retirés, ordre gardé', () => {
    const urls = ['', '?', '?test=1&gfx=faible&wave=5', '?perso=B&sang=1', '?a=%20b&b=c+d&v=12', '?x=1#b', '?shadows=0&shadows=1'];
    for (const u of urls) expect(filtrerAdresse(u, 'source'), u).toBe(u);
    expect(filtrerAdresse('?shadows=0&wave=5&v=3&vhs=0&nospawn=1', 'dev')).toBe('?wave=5&v=3&nospawn=1');
    expect(filtrerAdresse('?shadows=0&wave=5&v=3', 'release')).toBe('?wave=5&v=3');
    expect(filtrerAdresse('?test=1&shadows=0&wave=5&v=3', 'dev')).toBe('?test=1&shadows=0&wave=5&v=3');
    expect(filtrerAdresse('?wave=5&v=3&perf=1', 'dev')).toBe('?wave=5&v=3&perf=1');
    expect(filtrerAdresse('?test=1&wave=5&v=2&perf=1', 'prod')).toBe('?v=2');
    expect(filtrerAdresse('?gfx=eleve', 'archive')).toBe('');
    expect(filtrerAdresse('?shadows=0&shadows=1&v=1', 'dev')).toBe('?v=1');
  });

  it('entrées hostiles : noms spéciaux, encodages, très longue adresse, autres types : jamais d\'exception, aucun prototype modifié', () => {
    const hostile = '?__proto__=1&constructor=x&toString=y&test=1&%E0%A4%A=1&%ZZ=2&wave=5';
    const a = acces('dev', hostile);
    expect(Object.getPrototypeOf(a.params)).toBe(null);
    expect([a.params.__proto__, a.params.constructor, a.params.toString, a.params.wave]).toEqual([true, true, true, true]);
    expect({}.polluted).toBeUndefined();
    expect(acces('prod', hostile).params.wave).toBe(false);
    const long = `?${'shadows=0&'.repeat(5000)}wave=5`;
    expect(filtrerAdresse(long, 'dev')).toBe('?wave=5');
    expect(filtrerAdresse(long, 'source')).toBe(long);
    for (const bad of [null, undefined, 42, {}, [], () => 1]) {
      expect(() => acces('dev', bad)).not.toThrow();
      expect(filtrerAdresse(bad, 'dev')).toBe('');
    }
    expect(acces('dev', new URLSearchParams('wave=5&shadows=0')).params).toMatchObject({ wave: true, shadows: false });
  });
});

describe('mode essai et Options selon le canal (lot 5l)', () => {
  it('readOnlyParams inchangé (data/game/save.json) ; ni gfx, ni perf, ni cap', () => {
    expect(SAVE.readOnlyParams).toEqual(['wave', 'lvl', 'planks', 'map', 'empty', 'nospawn', 'endless', 'floor', 'money']);
    for (const name of ['gfx', 'perf', 'cap']) expect(SAVE.readOnlyParams).not.toContain(name);
    expect(SAVE.memoryByDefaultWith).toEqual(['test']);
  });

  it('un paramètre refusé ne déclenche pas le mode essai (sauvegarde normale) ; accepté, il le déclenche comme avant', () => {
    const params = { save: SAVE };
    expect(readOnlyMode(filtrerAdresse('?wave=5&money=9', 'dev'), params)).toEqual({ readOnly: true, reasons: ['wave', 'money'] });
    expect(readOnlyMode(filtrerAdresse('?wave=5&money=9', 'source'), params)).toEqual({ readOnly: true, reasons: ['wave', 'money'] });
    for (const c of ['prod', 'archive', null]) expect(readOnlyMode(filtrerAdresse('?wave=5&money=9&test=1&empty=1', c), params), String(c)).toEqual({ readOnly: false, reasons: [] });
  });

  it('Options : « imposé par l\'adresse » (origine adresse) seulement quand l\'adresse est prise en compte (?test=1 autorisé ou source)', () => {
    const device = { coarse: false, ua: '' };
    const imposed = (search, canal) => effectiveOptions('auto', null, explicitParams(filtrerAdresse(search, canal)), device, CFG).imposed;
    expect(imposed('?shadows=0&vhs=0', 'source')).toEqual(expect.arrayContaining(['ombres', 'vhs']));
    expect(imposed('?shadows=0&vhs=0&test=1', 'dev')).toEqual(expect.arrayContaining(['ombres', 'vhs']));
    expect(imposed('?shadows=0&vhs=0&test=1', 'release')).toEqual(expect.arrayContaining(['ombres', 'vhs']));
    for (const c of ['dev', 'release']) expect(imposed('?shadows=0&vhs=0&dpr=1&detail=0&perso=A&sang=1', c), c).toEqual([]);
    for (const c of ['archive', 'prod', null]) expect(imposed('?shadows=0&vhs=0&test=1', c), String(c)).toEqual([]);
    // Sans paramètre explicite : identique quel que soit le canal.
    expect(imposed('?wave=5', 'dev')).toEqual(imposed('', 'source'));
  });
});

describe('lecture du canal et des lecteurs de l\'adresse (lot 5l)', () => {
  it('pageCanal : balise <meta name="zs-canal"> lue sans requête ; absente, inconnue ou document hostile : null', () => {
    const doc = (value) => ({ querySelector: (sel) => (sel === 'meta[name="zs-canal"]' && value !== undefined ? { getAttribute: (k) => (k === 'content' ? value : null) } : null) });
    expect(['source', 'dev', 'release', 'archive', 'prod'].map((v) => pageCanal(doc(v)))).toEqual(['source', 'dev', 'release', 'archive', 'prod']);
    for (const v of [undefined, null, '', 'Dev', 'inconnu']) expect(pageCanal(doc(v)), String(v)).toBe(null);
    expect(pageCanal({ querySelector: () => { throw new Error('x'); } })).toBe(null);
    expect(pageCanal(null)).toBe(null);
    expect(pageCanal(undefined)).toBe(null);
  });

  it('les lecteurs du jeu lisent l\'adresse filtrée, jamais location.search (main.js, game.js, graphics-boot.js) ; lights.js vérifie le canal', () => {
    const main = read('js/game/main.js');
    expect(main).toContain('const search = pageSearch();');
    expect(main).toContain('const query = new URLSearchParams(search);');
    // Seule exception (lot 5l-C) : le menu de débogage reçoit l'adresse réelle (préremplissage, paramètres conservés), sur un canal de débogage seulement.
    expect(main.replace(/\/\/[^\n]*/g, '').match(/location\.search/g)).toEqual(['location.search']);
    expect(main).toContain("ctx.ui.bindDebug({ allowed: CANAUX_DEBUG.includes(canal), search: location.search, planksMax: windowsCfg.planks });");
    for (const piece of ['resolveMapId(search)', 'graphicsBoot(search)', 'readLevels(search,', 'createProfiler({ search,', 'mode: soundMode });', 'mode: soundMode })']) expect(main, piece).toContain(piece);
    expect(main.match(/mode: soundMode/g)).toHaveLength(3); // createAudio et les deux renderSounds
    expect(read('js/game/game.js').replace(/\/\/[^\n]*/g, '')).not.toContain('location.search');
    // lights.js (lampgain, sous ?test=1) : ?test=1 seulement sur les canaux de débogage, même liste que CANAUX_DEBUG.
    const lights = read('js/game/lights.js');
    expect(lights).toContain(`const DEBUG_CANAUX = ${JSON.stringify(CANAUX_DEBUG).replace(/"/g, "'").replace(/,/g, ', ')};`);
    expect(lights).toContain("return q.get('test') === '1' && debugCanal() && q.has('lampgain')");
    const boot = read('js/game/graphics-boot.js');
    expect(boot).toContain('export function graphicsBoot(search = pageSearch()) {');
    expect(boot).toContain("filtered ??= filtrerAdresse(String(globalThis.location?.search ?? ''), pageCanal());");
  });

  it('jeu.html du dépôt : canal « source » (tout paramètre d\'aujourd\'hui marche comme avant dans les tests)', () => {
    expect([...read('jeu.html').matchAll(/<meta name="zs-canal" content="([^"]*)">/g)].map((m) => m[1])).toEqual(['source']);
  });
});
