// Lot 5b-B : préréglages graphiques. Logique pure (js/core/graphics.js : lecture, priorités, Auto, paramètres explicites), données
// (data/game/graphics.json : valeurs valides, Élevé = défauts actuels du jeu) et préférence d'appareil (js/save/device-settings.js : schéma, clé,
// valeurs inconnues, JSON invalide jamais écrasé, quota, stockage indisponible, mémoire sous ?test=1). Appareils fictifs, séries de temps simulées.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTO_DEFAULTS, autoDecision, irregularShare, bloodWithCorpses, CHOICES, deviceClass, ELEVE, explicitParams, medianOf, parseGfxParam, parseGraphics, PRESET_IDS, presetSearch, resolvePreset, settingsFor } from '../../js/core/graphics.js';
import { createDeviceSettings, DEVICE_KEY, parseDevice } from '../../js/save/device-settings.js';
// Lot 5j : tests des options (vecteurs, Perso, priorités, stockage v2) : tests/unit/graphics-options.test.js.
import { createFakeStorage, quotaError, securityError } from './helpers/fake-storage.js';
import { buildSpec, createTextureData, meanColor } from '../../js/core/texgen.js';
import { FLOORS, characters, floorsWithStains, gameView, lookup, variantMetrics } from '../../scripts/personnages/lib.mjs';

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const RAW = load('data/game/graphics.json');
const CFG = parseGraphics(RAW);
const HOSTILE = [null, undefined, 42, 'texte', [], { presets: 'x' }, { presets: { eleve: { live: { dprMax: 'x', vhs: 3, feux: null } } } }];
const IPHONE = { coarse: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1' };
const ANDROID = { coarse: true, ua: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' };
const DESKTOP = { coarse: false, ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36' };
const TABLET_FINE = { coarse: false, ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' };

// Lot 5j : graphics.json passe au schéma 2 (options et vecteurs) ; les réglages de chaque préréglage (cfg.presets, forme du lot 5b) sont comparés à la
// copie figée des valeurs d'avant (origin/dev 7130dc7) : avant, RAW.presets[id].live/load ; après, vectorSettings(RAW.presets[id]) = la même copie.
const AVANT_7130DC7 = {
  faible: { live: { dprMax: 1, ombres: false, ombreTaille: 512, vhs: 'off', brouillard: 'simple', feux: { voitureFoyers: 1, fumeeHelico: 0, particules: 0.5, lueur: false }, sang: 'reduit', cadavres: 0 }, load: { personnages: 'A', anticrenelage: false, texturesFines: false, decor: 'reduit' } },
  moyen: { live: { dprMax: 1.5, ombres: true, ombreTaille: 512, vhs: 'statique', brouillard: 'reduit', feux: { voitureFoyers: 2, fumeeHelico: 0.5, particules: 1, lueur: true }, sang: 'reduit', cadavres: 1 }, load: { personnages: 'A', anticrenelage: false, texturesFines: true, decor: 'complet' } },
  eleve: { live: { dprMax: 2, ombres: true, ombreTaille: 1024, vhs: 'anime', brouillard: 'complet', feux: { voitureFoyers: 2, fumeeHelico: 1, particules: 1, lueur: true }, sang: '1', cadavres: 2 }, load: { personnages: 'choix', anticrenelage: true, texturesFines: true, decor: 'complet' } },
};

// Lot 5k : deux réglages « live » de plus (lampes, lumieres) ; les autres réglages restent ceux de AVANT_7130DC7. Lot 5k-F (décision du propriétaire) :
// les lampes sont toujours sur la carte ; ELEVE (repli) et Faible, Moyen : « decor » (sans lumière dynamique) ; Élevé : « eclairage ».
const LOT_5K = { faible: { lampes: 'decor', lumieres: 2 }, moyen: { lampes: 'decor', lumieres: 2 }, eleve: { lampes: 'eclairage', lumieres: 4 } };
const sans5k = (live) => {
  const { lampes, lumieres, ...rest } = live;
  return { rest, lamps: { lampes, lumieres } };
};

describe('graphics.json', () => {
  it('schéma 2, trois préréglages, chaque valeur reconnue telle quelle (aucune n\'est ramenée à un défaut)', () => {
    expect(RAW.schema).toBe(2);
    expect(Object.keys(RAW.presets).sort()).toEqual(['eleve', 'faible', 'moyen']);
    for (const id of PRESET_IDS) {
      expect(CFG.vectors[id]).toEqual(RAW.presets[id]); // chaque valeur du vecteur est une valeur permise de son option
      expect(sans5k(CFG.presets[id].live).rest).toEqual(AVANT_7130DC7[id].live);
      expect(sans5k(CFG.presets[id].live).lamps).toEqual(LOT_5K[id]);
      expect(CFG.presets[id].load).toEqual(AVANT_7130DC7[id].load);
    }
    expect(CFG.auto).toEqual(RAW.auto);
    expect(RAW._provisoire).toMatch(/PROVISOIRES/);
  });
  it('Élevé = les valeurs actuelles du jeu (render.json, blood.json, vhs.json, persos-choix.json, ?dpr par défaut), épaves comprises', () => {
    const render = load('data/game/render.json');
    const blood = load('data/game/blood.json');
    const vhs = load('data/game/vhs.json');
    const choix = load('data/game/persos-choix.json');
    const e = CFG.presets.eleve;
    expect({ live: sans5k(e.live).rest, load: e.load }).toEqual({ live: sans5k({ ...ELEVE.live, feux: { ...ELEVE.live.feux } }).rest, load: { ...ELEVE.load } });
    expect(ELEVE.live).toMatchObject({ lampes: 'decor', lumieres: 4 }); // lot 5k-F : repli = lampes présentes, sans lumière dynamique
    expect(e.live).toMatchObject({ lampes: 'eclairage', lumieres: 4 }); // lot 5k : Élevé choisit l'éclairage
    expect(e.live.ombreTaille).toBe(render.light.shadowMap);
    expect(e.live.ombres).toBe(true);
    expect(e.live.brouillard).toBe('complet');
    expect(e.live.sang).toBe(choix.sang);
    expect(e.live.cadavres).toBe(blood.levels[choix.sang].corpses);
    expect(e.live.vhs).toBe(vhs.enabled ? 'anime' : 'off');
    expect(e.live.dprMax).toBe(2); // DEFAULT_RATIO_CAP de js/game/main.js
    expect(readFileSync('js/game/main.js', 'utf8')).toMatch(/const DEFAULT_RATIO_CAP = 2;/);
    expect(e.live.feux).toEqual({ voitureFoyers: 2, fumeeHelico: 1, particules: 1, lueur: true }); // voiture à deux foyers, fumée de l'hélicoptère entière
    expect(e.load).toEqual({ personnages: 'choix', anticrenelage: true, texturesFines: true, decor: 'complet' });
    // Élevé ne change pas l'adresse des personnages : seulement « sang=1 », égal au défaut de la table.
    expect(presetSearch('?test=1', settingsFor(CFG, 'eleve', {}))).toBe(`?test=1&sang=${choix.sang}`);
  });
  it('Faible et Moyen : valeurs de départ proposées (provisoires)', () => {
    const f = CFG.presets.faible;
    const m = CFG.presets.moyen;
    expect(f.live).toMatchObject({ dprMax: 1, ombres: false, vhs: 'off', brouillard: 'simple', sang: 'reduit', cadavres: 0, feux: { voitureFoyers: 1, fumeeHelico: 0, lueur: false } });
    expect(f.live.feux.particules).toBeLessThan(1);
    expect(f.load).toEqual({ personnages: 'A', anticrenelage: false, texturesFines: false, decor: 'reduit' });
    expect(m.live).toMatchObject({ dprMax: 1.5, ombres: true, ombreTaille: 512, vhs: 'statique', brouillard: 'reduit', sang: 'reduit', cadavres: 1, feux: { voitureFoyers: 2, fumeeHelico: 0.5, particules: 1, lueur: true } });
    expect(m.load).toEqual({ personnages: 'A', anticrenelage: false, texturesFines: true, decor: 'complet' });
    expect(RAW.auto).toEqual({ initial: { grossier: 'moyen', autre: 'eleve' }, seuilMs: 22, fenetreSecondes: 10, irregulier: { part: 0.1, facteur: 1.5 }, baisse: 'entre-manches', remonte: false });
  });
  it('entrées hostiles : aucune exception, valeurs de l\'Élevé et Auto par défaut', () => {
    for (const h of HOSTILE) {
      const c = parseGraphics(h);
      for (const id of PRESET_IDS) {
        expect(c.presets[id].live.dprMax).toBeGreaterThanOrEqual(0.5);
        expect(['off', 'statique', 'anime']).toContain(c.presets[id].live.vhs);
      }
      expect(c.auto.seuilMs).toBe(AUTO_DEFAULTS.seuilMs);
      expect(c.auto.remonte).toBe(false);
    }
    expect(parseGraphics({ auto: { remonte: true, baisse: 'toujours', seuilMs: -4 } }).auto).toMatchObject({ remonte: false, baisse: 'entre-manches', seuilMs: 22 });
  });
});

describe('priorités : ?gfx= > choix mémorisé > auto', () => {
  it('?gfx= l\'emporte, puis la préférence de l\'appareil, puis Auto', () => {
    expect(resolvePreset('faible', 'eleve', IPHONE, CFG)).toEqual({ choice: 'faible', preset: 'faible', origin: 'parametre', auto: false, device: 'grossier' });
    expect(resolvePreset(null, 'eleve', IPHONE, CFG)).toMatchObject({ choice: 'eleve', preset: 'eleve', origin: 'memorise' });
    expect(resolvePreset(null, null, IPHONE, CFG)).toMatchObject({ choice: 'auto', preset: 'moyen', origin: 'defaut', auto: true });
    expect(resolvePreset('auto', 'faible', DESKTOP, CFG)).toMatchObject({ choice: 'auto', preset: 'eleve', origin: 'parametre' });
    expect(resolvePreset('ultra', 'inconnu', DESKTOP, CFG)).toMatchObject({ choice: 'auto', preset: 'eleve', origin: 'defaut' });
    expect(CHOICES.map(parseGfxParam)).toEqual(CHOICES);
    for (const v of ['', 'Eleve', 'élevé', ' moyen', 1, null, {}]) expect(parseGfxParam(v)).toBeNull();
  });
  it('appareils fictifs : pointeur grossier ou téléphone : Moyen ; sinon Élevé (sans identifier l\'appareil)', () => {
    expect(deviceClass(IPHONE)).toBe('grossier');
    expect(deviceClass(ANDROID)).toBe('grossier');
    expect(deviceClass({ coarse: false, ua: ANDROID.ua })).toBe('grossier');
    expect(deviceClass(TABLET_FINE)).toBe('grossier');
    expect(deviceClass(DESKTOP)).toBe('autre');
    for (const h of HOSTILE) expect(['grossier', 'autre']).toContain(deviceClass(h));
    expect(resolvePreset(null, null, ANDROID, CFG).preset).toBe('moyen');
    expect(resolvePreset(null, null, DESKTOP, CFG).preset).toBe('eleve');
    expect(resolvePreset(null, null, null, null).preset).toBe('eleve');
  });
  it('paramètres explicites de l\'adresse par-dessus le préréglage (perso, sang, detail, vhs, shadows, dpr, lum)', () => {
    const e = explicitParams('?perso=riche&sang=1&detail=1&vhs=1&shadows=1&dpr=1.25&usure=2');
    expect(e).toEqual({ perso: 'riche', sang: '1', usure: '2', detail: '1', vhs: '1', shadows: '1', dpr: 1.25, lum: null });
    // Lot 5k : ?lum=decor|eclairage impose l'option « Lumière des lampes » (réglage lampes), jamais le nombre de lumières ; lot 5k-F : ?lum=off (sans
    // lampes, rendu d'avant le lot) seulement sous ?test=1, pour les références des tests.
    for (const v of ['off', 'decor', 'eclairage']) {
      const l = settingsFor(CFG, 'moyen', explicitParams(`?test=1&lum=${v}`));
      expect(l.live.lampes).toBe(v);
      expect(l.overridden).toEqual(['lampes']);
      expect(l.live.lumieres).toBe(CFG.presets.moyen.live.lumieres);
    }
    expect(explicitParams('?lum=oui').lum).toBeNull();
    expect(explicitParams('?lum=off').lum).toBeNull(); // hors ?test=1 : les lampes restent sur la carte
    expect(explicitParams('?lum=decor').lum).toBe('decor');
    const s = settingsFor(CFG, 'faible', e);
    expect(s.load).toMatchObject({ personnages: 'riche', texturesFines: true, decor: 'complet' });
    expect(s.live).toMatchObject({ sang: '1', cadavres: null, vhs: 'anime', ombres: true, dprMax: 1.25 });
    expect(s.overridden.sort()).toEqual(['cadavres', 'decor', 'dprMax', 'ombres', 'personnages', 'sang', 'texturesFines', 'vhs']);
    expect(settingsFor(CFG, 'eleve', explicitParams('?detail=0&vhs=0&shadows=0')).live).toMatchObject({ vhs: 'off', ombres: false });
    expect(explicitParams('?perso=x&sang=2&detail=oui&vhs=&shadows=2&dpr=9')).toEqual({ perso: null, sang: null, usure: null, detail: null, vhs: null, shadows: null, dpr: null, lum: null });
    for (const h of HOSTILE) expect(() => settingsFor(CFG, h, explicitParams(h))).not.toThrow();
    expect(presetSearch('?perso=B&sang=0', settingsFor(CFG, 'faible', {}))).toBe('?perso=B&sang=0');
    expect(presetSearch('', settingsFor(CFG, 'moyen', {}))).toBe('?perso=A&sang=reduit');
  });
  it('cadavres du préréglage : copie de blood.json, l\'original intact ; valeur invalide : l\'original', () => {
    const blood = load('data/game/blood.json');
    const copy = bloodWithCorpses(blood, 'reduit', 0);
    expect(copy.levels.reduit.corpses).toBe(0);
    expect(blood.levels.reduit.corpses).toBe(2);
    expect(copy.levels['1']).toBe(blood.levels['1']);
    expect(bloodWithCorpses(blood, 'reduit', -1)).toBe(blood);
    expect(bloodWithCorpses(blood, 'x', 1)).toBe(blood);
    expect(bloodWithCorpses(null, '1', 1)).toBeNull();
  });
});

describe('Auto : séries de temps simulées', () => {
  const between = (ms, seconds = 12) => ({ medianMs: ms, activeSeconds: seconds, betweenWaves: true });
  it('descend d\'un cran au-delà de 22 ms, entre deux manches seulement, jamais sous Faible, jamais de remontée', () => {
    expect(autoDecision(between(30), 'eleve', CFG.auto)).toEqual({ preset: 'moyen', changed: true, reason: 'baisse', cause: 'lent' });
    expect(autoDecision(between(30), 'moyen', CFG.auto)).toEqual({ preset: 'faible', changed: true, reason: 'baisse', cause: 'lent' });
    expect(autoDecision(between(80), 'faible', CFG.auto)).toEqual({ preset: 'faible', changed: false, reason: 'plancher' });
    expect(autoDecision(between(8), 'faible', CFG.auto)).toEqual({ preset: 'faible', changed: false, reason: 'fluide' });
    expect(autoDecision(between(22), 'eleve', CFG.auto).changed).toBe(false);
    expect(autoDecision({ ...between(40), betweenWaves: false }, 'eleve', CFG.auto)).toMatchObject({ changed: false, reason: 'en-manche' });
    expect(autoDecision(between(40, 9.9), 'eleve', CFG.auto)).toMatchObject({ changed: false, reason: 'mesure-courte' });
  });
  it('une série de manches lentes : Élevé → Moyen → Faible, puis plus rien, même redevenue fluide', () => {
    const series = [40, 35, 50, 12, 9];
    let preset = 'eleve';
    const path = [];
    for (const ms of series) {
      preset = autoDecision(between(ms), preset, CFG.auto).preset;
      path.push(preset);
    }
    expect(path).toEqual(['moyen', 'faible', 'faible', 'faible', 'faible']);
    const frames = Array.from({ length: 600 }, (_, i) => (i % 10 === 0 ? 60 : 16.7));
    expect(medianOf(frames)).toBeCloseTo(16.7, 5); // quelques images longues ne suffisent pas
    expect(medianOf([])).toBeNull();
    expect(medianOf([3, 'x', NaN, 1])).toBe(2);
  });
  it('entrées hostiles : aucune exception, aucune baisse', () => {
    for (const h of HOSTILE) {
      expect(() => autoDecision(h, h, h)).not.toThrow();
      expect(autoDecision(h, 'eleve', h).changed).toBe(false);
    }
  });
});

describe('préférence d\'appareil (zs.device.v1)', () => {
  it('clé et schéma ; écrite en mode essai ; lue telle quelle', () => {
    expect(DEVICE_KEY).toBe('zs.device.v1');
    const storage = createFakeStorage();
    const d = createDeviceSettings({ search: '?wave=5', storage });
    expect(d.read()).toEqual({ status: 'absent', graphics: 'auto', custom: null });
    expect(d.write('moyen')).toEqual({ ok: true, status: 'ok', persisted: true });
    expect([...storage.data.keys()]).toEqual(['zs.device.v1']);
    expect(JSON.parse(storage.data.get(DEVICE_KEY))).toEqual({ v: 2, graphics: 'moyen', custom: null }); // lot 5j : schéma 2 (avant : { v: 1, graphics })
    expect(createDeviceSettings({ search: '', storage }).read()).toEqual({ status: 'ok', graphics: 'moyen', custom: null });
  });
  it('valeur inconnue : auto (et réécrite au prochain choix) ; JSON invalide ou version future : auto, jamais écrasé', () => {
    expect(parseDevice('{"v":1,"graphics":"ultra"}')).toEqual({ status: 'ok', graphics: 'auto', custom: null, from: 1 });
    for (const raw of ['{bad', '[]', '"x"', '{"graphics":"faible"}', '{"v":0,"graphics":"faible"}', 'null', 'x'.repeat(5000)]) expect(parseDevice(raw).status, raw).toBe('corrompu');
    expect(parseDevice('{"v":3,"graphics":"faible"}')).toEqual({ status: 'future', graphics: 'auto', custom: null }); // lot 5j : v 2 est le schéma courant, v 3 est futur
    for (const raw of ['{bad', '{"v":3,"graphics":"faible"}']) {
      const storage = createFakeStorage({ [DEVICE_KEY]: raw });
      const d = createDeviceSettings({ search: '', storage });
      expect(d.read().graphics).toBe('auto');
      expect(d.write('faible')).toEqual({ ok: false, status: 'verrouille', persisted: false });
      expect(storage.data.get(DEVICE_KEY)).toBe(raw);
      expect(storage.calls.setItem).toBe(0);
    }
    const storage = createFakeStorage({ [DEVICE_KEY]: '{"v":1,"graphics":"ultra"}' });
    expect(createDeviceSettings({ search: '', storage }).write('eleve').ok).toBe(true);
    expect(createDeviceSettings({ search: '', storage }).write('ultra')).toMatchObject({ ok: false, status: 'invalide' });
  });
  it('quota dépassé : refus sans exception ; stockage indisponible (absent ou qui lève) : mémoire et message', () => {
    const full = createFakeStorage();
    full.failSet = quotaError();
    expect(createDeviceSettings({ search: '', storage: full }).write('faible')).toEqual({ ok: false, status: 'echec', persisted: false });
    const blocked = createFakeStorage();
    blocked.failGet = securityError();
    const d = createDeviceSettings({ search: '', storage: blocked });
    expect(d.read()).toEqual({ graphics: 'auto', custom: null, status: 'indisponible' });
    expect(d.write('moyen')).toEqual({ ok: true, status: 'indisponible', persisted: false });
    expect(d.state().mode).toBe('unavailable');
    expect(blocked.calls.setItem).toBe(0);
    const none = createDeviceSettings({ search: '', storage: null });
    expect(none.write('faible')).toMatchObject({ status: 'indisponible', persisted: false });
    expect(none.read()).toEqual({ graphics: 'faible', custom: null, status: 'indisponible' });
  });
  it('?test=1 sans ?store=local : mémoire, aucun appel au stockage ; ?test=1&store=local : le vrai stockage', () => {
    const storage = createFakeStorage();
    const mem = createDeviceSettings({ search: '?test=1&gfx=faible', storage });
    expect(mem.mode).toBe('memory');
    expect(mem.write('faible')).toEqual({ ok: true, status: 'memoire', persisted: false });
    expect(mem.read()).toEqual({ graphics: 'faible', custom: null, status: 'memoire' });
    expect(storage.calls.getItem + storage.calls.setItem).toBe(0);
    const local = createDeviceSettings({ search: '?test=1&store=local', storage });
    expect(local.write('eleve').persisted).toBe(true);
    expect([...storage.data.keys()]).toEqual(['zs.device.v1']);
  });
  it('entrées hostiles : aucune exception', () => {
    for (const h of [...HOSTILE, Symbol('x')]) expect(() => parseDevice(h)).not.toThrow();
    for (const h of HOSTILE) expect(() => createDeviceSettings({ search: h, storage: h }).write('faible')).not.toThrow();
  });
});

describe('séparation : rien de la logique du jeu ne lit le préréglage', () => {
  it('js/core/graphics.js est pur et aucun module de logique ne l\'importe', () => {
    const src = readFileSync('js/core/graphics.js', 'utf8');
    expect(src).not.toMatch(/localStorage|sessionStorage|\bdocument\b|\bfetch\s*\(|Math\.random|Date\.now|performance\.now|setTimeout|THREE/);
    for (const f of ['waves', 'projectile', 'ray', 'siege', 'save', 'economy', 'collision', 'enemy-ai', 'combat', 'floor-sim', 'wave-director']) {
      expect(readFileSync(`js/core/${f}.js`, 'utf8'), f).not.toMatch(/graphics/);
    }
  });
  it('?gfx=, ?perf= et ?cap= ne mettent pas la sauvegarde en lecture seule (absents de readOnlyParams)', () => {
    const save = load('data/game/save.json');
    for (const k of ['gfx', 'perf', 'cap']) expect(save.readOnlyParams).not.toContain(k);
  });
});

describe('lisibilité à chaque préréglage : personnages A (Faible, Moyen) sur les sols avec et sans textures fines, tachés compris', () => {
  const textures = load('data/game/textures.json').textures;
  const floorsFor = (detail) => floorsWithStains(Object.fromEntries(Object.entries(FLOORS).map(([name, id]) => [name, meanColor(createTextureData(buildSpec(textures.find((t) => t.id === id), lookup, { detail })))])));
  const camera = gameView();
  it.each(characters.slots.map((s) => [s.id, s]))('%s A : contraste ≥ 3:1 sur chaque sol (textures fines non : Faible ; oui : Moyen), toutes tenues', (sid, slot) => {
    const v = slot.variants.find((x) => x.id === 'A');
    for (const detail of [false, true]) {
      const floors = floorsFor(detail);
      for (let outfit = 0; outfit < v.outfits.length; outfit += 1) {
        for (const wear of sid === 'joueur' ? [0] : [0, 3]) {
          const m = variantMetrics(slot, v, { camera, floors, outfit, wear });
          for (const [k, c] of Object.entries(m.contrasts)) expect(c, `fines ${detail} tenue ${outfit} usure ${wear} sur ${k}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

describe('feux (lot 5b) : réglages des préréglages et feux hors champ (5b-C)', () => {
  const palette = { fire: '#000001', fireEdge: '#000002', smoke: '#000003' };
  const spec = { id: 'feu-test', x: 100, z: 100, y: 37, w: 120, d: 90, spots: [{ x: 80, z: 100, y: 30, w: 40, d: 40 }, { x: 130, z: 100, y: 40, w: 40, d: 40 }] };
  const buffers = (f) => f.group.children.slice(0, 2).map((c) => ['position', 'aSize', 'aColor'].map((n) => [...c.geometry.attributes[n].array]));
  it('hors du champ, les particules avancent sans réécrire les tampons ; de retour dans le champ, le feu est identique à celui toujours visible', async () => {
    const { createFire } = await import('../../js/game/fire.js');
    const seen = createFire(spec, palette);
    const hidden = createFire(spec, palette);
    for (let i = 0; i < 40; i += 1) seen.update(0.05, true);
    const frozen = buffers(hidden);
    for (let i = 0; i < 39; i += 1) hidden.update(0.05, false);
    expect(buffers(hidden)).toEqual(frozen); // rien d'écrit hors du champ
    hidden.update(0.05, true);
    expect(buffers(hidden)).toEqual(buffers(seen));
    expect(hidden.stats().time).toBeCloseTo(seen.stats().time, 9);
    hidden.update(0, false);
    hidden.update(0, true); // pause : rien ne bouge, rien à réécrire
    expect(buffers(hidden)).toEqual(buffers(seen));
  });
  it('setOptions : valeurs par défaut sans effet ; part des particules, foyers, lueur, feu caché', async () => {
    const { createFire } = await import('../../js/game/fire.js');
    const a = createFire(spec, palette);
    const b = createFire(spec, palette);
    b.setOptions({});
    for (let i = 0; i < 20; i += 1) {
      a.update(0.05);
      b.update(0.05);
    }
    expect(buffers(b)).toEqual(buffers(a));
    expect(b.stats().drawn).toEqual({ flames: 64, smoke: 64, spots: 2, glow: true, visible: true });
    b.setOptions({ particles: 0.5, spots: 1, glow: false, visible: false });
    expect(b.stats().drawn).toEqual({ flames: 32, smoke: 32, spots: 1, glow: false, visible: false });
    b.setOptions({ particles: 'x', spots: -2 });
    expect(b.stats().drawn).toMatchObject({ flames: 64, smoke: 64, spots: 2 });
  });
});

describe('Auto, lot 5b-G : régularité des images (une médiane basse peut cacher des à-coups)', () => {
  const between = (values) => ({ medianMs: medianOf(values), longShare: irregularShare(values, CFG.auto.irregulier.facteur), activeSeconds: 12, betweenWaves: true });
  it('Pixel 7 à l\'Élevé (90 Hz) : médiane 11,1 ms mais un tiers d\'images longues : baisse ; à Moyen (0,5 %) : rien', () => {
    const eleve = [...Array(66).fill(11.1), ...Array(25).fill(22.2), ...Array(9).fill(33.3)];
    expect(medianOf(eleve)).toBeCloseTo(11.1, 6);
    expect(irregularShare(eleve)).toBeCloseTo(0.34, 6);
    expect(autoDecision(between(eleve), 'eleve', CFG.auto)).toEqual({ preset: 'moyen', changed: true, reason: 'baisse', cause: 'irregulier' });
    const moyen = [...Array(995).fill(11.1), ...Array(5).fill(22.2)];
    expect(autoDecision(between(moyen), 'moyen', CFG.auto)).toMatchObject({ changed: false, reason: 'fluide' });
  });
  it('iPhone à l\'Élevé (60 Hz, médiane 21 ms) : baisse ; lent et irrégulier : la lenteur est citée en premier', () => {
    const eleve = [...Array(40).fill(16.7), ...Array(45).fill(25), ...Array(15).fill(33.4)];
    expect(medianOf(eleve)).toBe(25);
    expect(irregularShare(eleve)).toBeCloseTo(0.15, 6); // 25 ms reste sous 1,5 × 16,7 ms
    expect(autoDecision(between(eleve), 'eleve', CFG.auto)).toMatchObject({ preset: 'moyen', changed: true, cause: 'lent' });
    expect(autoDecision(between(Array(100).fill(40)), 'moyen', CFG.auto)).toMatchObject({ preset: 'faible', cause: 'lent' }); // lent mais régulier
  });
  it('part irrégulière : 10 % au plus permis, seuil et facteur lus dans graphics.json, entrées hostiles sans exception', () => {
    const ten = [...Array(90).fill(16.7), ...Array(10).fill(40)];
    expect(irregularShare(ten)).toBeCloseTo(0.1, 6);
    expect(autoDecision(between(ten), 'eleve', CFG.auto).changed).toBe(false); // exactement 10 % : pas au-delà
    expect(irregularShare([])).toBe(0);
    for (const h of [null, 'x', [NaN, -1, 'a'], {}]) expect(() => irregularShare(h, h)).not.toThrow();
    expect(parseGraphics({ auto: { irregulier: { part: 7, facteur: 'x' } } }).auto.irregulier).toEqual({ part: 0.1, facteur: 1.5 });
  });
});
