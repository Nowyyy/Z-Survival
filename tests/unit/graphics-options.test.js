// Lot 5j-A : options graphiques séparées. Logique pure (js/core/graphics.js : vecteurs des préréglages, vecteur effectif et origines, règle Perso,
// priorités adresse > enregistré > défaut, options en attente de rechargement, entrées hostiles) et stockage zs.device.v1 schéma 2 (migration du
// schéma 1, custom hostile, quota, mémoire sous ?test=1, aucune clé nouvelle). Appareils fictifs ; aucune horloge, aucun hasard.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  autoDecision, choosePreset, CHOICES, effectiveOptions, explicitParams, nearestPreset, optionsState, parseGraphics, pendingReload, PRESET_IDS, resolvePreset,
  sanitizeCustom, setOption, settingsFor, SETTING_KEYS, valueFor, vectorSettings,
} from '../../js/core/graphics.js';
import { createDeviceSettings, customShape, DEVICE_KEY, parseDevice } from '../../js/save/device-settings.js';
import { createFakeStorage, quotaError } from './helpers/fake-storage.js';

const RAW = JSON.parse(readFileSync('data/game/graphics.json', 'utf8'));
const CFG = parseGraphics(RAW);
const PHONE = { coarse: true, ua: 'Mozilla/5.0 (Linux; Android 14; K) Mobile' };
const DESKTOP = { coarse: false, ua: 'Mozilla/5.0 (X11; Linux x86_64)' };
const HOSTILE = [null, undefined, 42, 'texte', [], {}, { choice: 'ultra', custom: [], url: 7 }, { custom: { resolution: 9, __proto__: { x: 1 } } }];
// Copie figée des vecteurs (origin/dev 7130dc7 → schéma 2) : une valeur par option, lue des valeurs du lot 5b (tests/unit/graphics.test.js, AVANT_7130DC7).
// Lot 5j-D (retour du propriétaire) : « Feux » et « Fumée de l'hélicoptère » regroupés en « Feux et fumées » (réduits, moyens, complets) : 11 options ;
// les réglages de chaque préréglage restent identiques à AVANT_7130DC7 (vérifié par vectorSettings ci-dessous et par graphics.test.js).
const VECTEURS = {
  faible: { resolution: 'basse', anticrenelage: 'non', ombres: 'aucune', vhs: 'off', carte: 'reduit', textures: 'simples', brume: 'simple', feux: 'reduits', personnages: 'simples', sang: 'reduit', cadavres: '0' },
  moyen: { resolution: 'moyenne', anticrenelage: 'non', ombres: 'basses', vhs: 'statique', carte: 'complet', textures: 'fines', brume: 'reduite', feux: 'moyens', personnages: 'simples', sang: 'reduit', cadavres: '1' },
  eleve: { resolution: 'haute', anticrenelage: 'oui', ombres: 'hautes', vhs: 'anime', carte: 'complet', textures: 'fines', brume: 'complete', feux: 'complets', personnages: 'riches', sang: 'complet', cadavres: '2' },
};
// Groupes du lot 5b (graphics.json d'origin/dev : parties live et load de chaque préréglage).
const LIVE_5B = ['dprMax', 'ombres', 'ombreTaille', 'vhs', 'brouillard', 'feux', 'sang', 'cadavres'];
const LOAD_5B = ['personnages', 'anticrenelage', 'texturesFines', 'decor'];
const ids = CFG.options.map((o) => o.id);
const other = (o, v) => o.valeurs.map((x) => x.id).find((x) => x !== v);
const base = (choice, extra = {}) => optionsState({ choice, custom: null, url: '', device: DESKTOP, ...extra }, CFG);
const eff = (s) => effectiveOptions(s.choice, s.custom, s.url, s.device, CFG, s.current);

describe('options : données (schéma 2)', () => {
  it('11 options en 3 sections (Image, Carte, Personnages), groupes du lot 5b, identifiants uniques, au moins deux valeurs chacune ; feux et fumées regroupés', () => {
    expect(CFG.sections).toEqual(['image', 'carte', 'personnages']);
    expect(ids).toEqual(['resolution', 'anticrenelage', 'ombres', 'vhs', 'carte', 'textures', 'brume', 'feux', 'personnages', 'sang', 'cadavres']); // lot 5j-D : sans « fumee »
    expect(CFG.options.find((o) => o.id === 'feux').valeurs.map((v) => Object.keys(v.reglages).sort())).toEqual(Array(3).fill(['feux.fumeeHelico', 'feux.lueur', 'feux.particules', 'feux.voitureFoyers']));
    expect(CFG.options.length).toBe(RAW.options.length); // aucune option ignorée à la lecture
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of CFG.options) {
      expect(o.valeurs.length, o.id).toBeGreaterThanOrEqual(2);
      expect(o.valeurs.length).toBe(RAW.options.find((r) => r.id === o.id).valeurs.length);
      const keys = new Set(o.valeurs.flatMap((v) => Object.keys(v.reglages).map((k) => k.split('.')[0])));
      for (const k of keys) expect(o.group === 'live' ? LIVE_5B : LOAD_5B, `${o.id} : ${k}`).toContain(k);
    }
    expect(CFG.options.filter((o) => o.group === 'load').map((o) => o.id)).toEqual(['anticrenelage', 'carte', 'textures', 'personnages']);
    // Chaque réglage du lot 5b est fixé par au moins une option (aucun réglage oublié).
    const covered = new Set(CFG.options.flatMap((o) => o.valeurs.flatMap((v) => Object.keys(v.reglages))));
    expect([...covered].sort()).toEqual([...SETTING_KEYS.live, ...SETTING_KEYS.load].sort());
  });
  it('textes : chaque libellé (sections, options, valeurs) est une clé de fr.json, en français seulement (game.*), aucune absente de en.json par erreur', () => {
    const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    const en = JSON.parse(readFileSync('data/i18n/en.json', 'utf8'));
    const keys = [...Object.values(CFG.sectionTexts), ...CFG.options.flatMap((o) => [o.texte, ...o.valeurs.map((v) => v.texte)])];
    expect(Object.keys(CFG.sectionTexts)).toEqual(CFG.sections);
    for (const k of keys) {
      expect(fr[k], k).toBeTruthy();
      expect(k).toMatch(/^game\./);
      expect(en[k], k).toBeUndefined(); // le jeu est en français seulement (tests/unit/data-i18n.test.js)
    }
  });
  it('vecteurs des préréglages : identiques, option par option, à la copie figée ; réglages identiques à settingsFor (lot 5b)', () => {
    for (const id of PRESET_IDS) {
      for (const o of ids) expect(RAW.presets[id][o], `${id}.${o}`).toBe(VECTEURS[id][o]);
      expect(CFG.vectors[id]).toEqual(VECTEURS[id]);
      expect(vectorSettings(CFG, VECTEURS[id])).toEqual({ live: CFG.presets[id].live, load: CFG.presets[id].load });
      // Valeur d'option retrouvée depuis les réglages : aller-retour exact.
      for (const o of CFG.options) expect(valueFor(o, CFG.presets[id]), `${id}.${o.id}`).toBe(VECTEURS[id][o.id]);
    }
  });
  it('entrées hostiles : options invalides ignorées, aucune exception, réglages de l\'Élevé', () => {
    const bad = { ...RAW, sections: [RAW.sections[0], { id: 'x y', texte: 'game.x' }, 3, 'carte', { id: 'image', texte: 'game.double' }], options: [...RAW.options.slice(0, 2), { id: 'Bad id', section: 'image', group: 'live', texte: 'game.x', valeurs: [] }, { id: 'pirate', section: 'image', group: 'live', texte: 'game.x', valeurs: [{ id: 'a', texte: 'game.a', reglages: { 'feux.__proto__': 1 } }, { id: 'b', texte: 'game.b', reglages: { autre: 1 } }] }, { ...RAW.options[0] }] };
    const c = parseGraphics(bad);
    expect(c.options.map((o) => o.id)).toEqual(['resolution', 'anticrenelage']);
    expect(c.sectionTexts).toEqual({ image: 'game.options.section.image' });
    for (const h of [null, 42, 'x', [], { options: 'x' }, { options: [null, 1, 'a', {}] }]) {
      const p = parseGraphics(h);
      expect(p.options).toEqual([]);
      expect(p.presets.eleve).toEqual(parseGraphics(null).presets.eleve);
      expect(() => effectiveOptions('perso', h, h, h, p, h)).not.toThrow();
    }
  });
});

describe('vecteur effectif et origines', () => {
  it('Faible, Moyen, Élevé, Auto : réglages identiques à ceux du lot 5b (settingsFor), origines « preset »', () => {
    for (const id of PRESET_IDS) {
      for (const url of ['', '?shadows=0&vhs=1', '?detail=0&perso=B&sang=1&dpr=1.25']) {
        const e = effectiveOptions(id, null, url, DESKTOP, CFG);
        expect(e.settings).toEqual(settingsFor(CFG, id, explicitParams(url)));
      }
      expect(Object.values(effectiveOptions(id, null, '', DESKTOP, CFG).origins).every((o) => o === 'preset')).toBe(true);
    }
    expect(effectiveOptions('auto', null, '', PHONE, CFG)).toMatchObject({ preset: 'moyen', vector: VECTEURS.moyen });
    expect(effectiveOptions('auto', null, '', DESKTOP, CFG)).toMatchObject({ preset: 'eleve', vector: VECTEURS.eleve });
    expect(effectiveOptions('auto', null, '', PHONE, CFG).settings).toEqual(settingsFor(CFG, 'moyen', {}));
  });
  it('Auto baissé entre deux manches : options « live » du préréglage en cours, « load » du préréglage initial (comme au lot 5b)', () => {
    const e = effectiveOptions('auto', null, '', DESKTOP, CFG, 'faible');
    for (const o of CFG.options) expect(e.vector[o.id], o.id).toBe((o.group === 'load' ? VECTEURS.eleve : VECTEURS.faible)[o.id]);
    expect(e.settings.live).toEqual(settingsFor(CFG, 'faible', {}).live);
    expect(e.settings.load).toEqual(settingsFor(CFG, 'eleve', {}).load);
    expect(autoDecision({ medianMs: 30, activeSeconds: 12, betweenWaves: true }, 'eleve', CFG.auto)).toEqual({ preset: 'moyen', changed: true, reason: 'baisse', cause: 'lent' }); // inchangé
  });
  it('priorité : adresse > Perso enregistré > préréglage ; option imposée marquée « adresse », valeur hors liste : null', () => {
    const custom = { ...VECTEURS.faible, ombres: 'hautes', vhs: 'anime' };
    const p = effectiveOptions('perso', custom, '', DESKTOP, CFG);
    expect(p.vector).toEqual(custom);
    expect(Object.values(p.origins).every((o) => o === 'perso')).toBe(true);
    const u = effectiveOptions('perso', custom, '?shadows=0&vhs=0&dpr=1.25&detail=1', DESKTOP, CFG);
    expect(u.imposed.sort()).toEqual(['carte', 'ombres', 'resolution', 'textures', 'vhs']);
    expect(u.vector).toMatchObject({ ombres: 'aucune', vhs: 'off', resolution: null, carte: 'complet', textures: 'fines', brume: 'simple' });
    expect(u.base).toEqual(custom); // les valeurs d'avant l'adresse restent connues
    expect(effectiveOptions('faible', null, '?shadows=1', DESKTOP, CFG).vector.ombres).toBe('basses'); // ombres 512 de Faible
    expect(effectiveOptions('eleve', null, '?sang=reduit', DESKTOP, CFG)).toMatchObject({ vector: { sang: 'reduit', cadavres: null }, imposed: ['sang', 'cadavres'] });
    // Priorité du choix : ?gfx= > zs.device.v1 > auto ; ?gfx=perso utilise le Perso enregistré.
    expect(resolvePreset('perso', 'faible', DESKTOP, CFG)).toMatchObject({ choice: 'perso', origin: 'parametre' });
    expect(resolvePreset(null, 'perso', DESKTOP, CFG)).toMatchObject({ choice: 'perso', origin: 'memorise' });
    expect(resolvePreset(null, null, DESKTOP, CFG)).toMatchObject({ choice: 'auto', origin: 'defaut' });
    expect(CHOICES).toEqual(['auto', 'faible', 'moyen', 'eleve', 'perso']);
  });
});

describe('règle Perso', () => {
  const starts = [['auto (bureau)', base('auto')], ['auto (téléphone)', base('auto', { device: PHONE })], ['auto baissé', base('auto', { current: 'faible' })], ['faible', base('faible')], ['moyen', base('moyen')], ['eleve', base('eleve')]];
  it.each(starts)('depuis %s : une option modifiée passe à Perso, les autres gardent leur valeur effective', (_, s0) => {
    const before = eff(s0).vector;
    for (const o of CFG.options) {
      const v = other(o, before[o.id]);
      const s1 = setOption(s0, o.id, v, CFG);
      expect(s1.choice, o.id).toBe('perso');
      const after = eff(s1);
      expect(after.vector[o.id]).toBe(v);
      for (const k of ids.filter((x) => x !== o.id)) expect(after.vector[k], `${o.id} → ${k}`).toBe(before[k]);
      expect(Object.values(after.origins).every((x) => x === 'perso')).toBe(true);
    }
  });
  it('retour à un préréglage puis à Perso : la configuration Perso est restaurée ; Perso modifié reste Perso', () => {
    let s = setOption(base('moyen'), 'ombres', 'hautes', CFG);
    s = setOption(s, 'vhs', 'off', CFG);
    expect(s.choice).toBe('perso');
    const mine = { ...VECTEURS.moyen, ombres: 'hautes', vhs: 'off' };
    expect(eff(s).vector).toEqual(mine);
    for (const p of ['faible', 'eleve', 'auto']) {
      const t = choosePreset(s, p, CFG);
      expect(t.choice).toBe(p);
      expect(t.custom).toEqual(mine); // gardée à part
      if (p !== 'auto') expect(eff(t).vector).toEqual(VECTEURS[p]);
      expect(eff(choosePreset(t, 'perso', CFG)).vector).toEqual(mine);
    }
    expect(choosePreset(s, 'perso', CFG)).toBe(s); // déjà sur Perso : rien
  });
  it('première fois sur Perso sans configuration : valeurs effectives du moment (Auto baissé compris)', () => {
    expect(eff(choosePreset(base('faible'), 'perso', CFG)).vector).toEqual(VECTEURS.faible);
    const low = base('auto', { current: 'moyen' });
    const p = choosePreset(low, 'perso', CFG);
    expect(p.custom).toEqual(eff(low).vector);
  });
  it('option imposée par l\'adresse ou ?gfx= (verrouillé) : rien ne change ; l\'adresse n\'entre jamais dans Perso', () => {
    const s = base('moyen', { url: '?shadows=0' });
    expect(setOption(s, 'ombres', 'hautes', CFG)).toBe(s);
    const t = setOption(s, 'brume', 'complete', CFG);
    expect(t.custom.ombres).toBe('basses'); // valeur de Moyen, pas celle de l'adresse
    expect(eff(t).vector.ombres).toBe('aucune'); // l'adresse l'emporte toujours
    const locked = base('moyen', { locked: true });
    expect(setOption(locked, 'brume', 'complete', CFG)).toBe(locked);
    expect(choosePreset(locked, 'faible', CFG)).toBe(locked);
  });
  it('entrées hostiles : option ou valeur inconnue, nom inconnu : l\'état tel quel, aucune exception', () => {
    const s = base('moyen');
    for (const [id, v] of [['inconnue', 'x'], ['ombres', 'ultra'], ['ombres', 3], [null, null], ['__proto__', 'x'], ['constructor', 'x']]) expect(setOption(s, id, v, CFG)).toBe(s);
    for (const n of ['ultra', '', null, 3, 'Perso']) expect(choosePreset(s, n, CFG)).toBe(s);
    for (const h of HOSTILE) {
      expect(() => setOption(h, 'ombres', 'hautes', CFG)).not.toThrow();
      expect(() => choosePreset(h, 'perso', h)).not.toThrow();
      expect(() => optionsState(h, h)).not.toThrow();
      expect(() => pendingReload(h, h, h)).not.toThrow();
    }
  });
});

describe('Perso enregistré : validation et préréglage le plus proche', () => {
  it('identifiants inconnus ignorés, valeurs inconnues ou absentes : celles du préréglage le plus proche', () => {
    expect(sanitizeCustom(CFG, null)).toBeNull();
    expect(sanitizeCustom(CFG, 'x')).toBeNull();
    expect(nearestPreset(CFG, { ...VECTEURS.faible, ombres: 'hautes' })).toBe('faible');
    expect(sanitizeCustom(CFG, { ...VECTEURS.faible, ombres: 'ultra', lampes: 'oui' })).toEqual(VECTEURS.faible);
    expect(sanitizeCustom(CFG, { resolution: 'haute', anticrenelage: 'oui', ombres: 'hautes' })).toEqual(VECTEURS.eleve);
    expect(sanitizeCustom(CFG, {})).toEqual(VECTEURS.moyen); // aucune valeur : Moyen (le préréglage du milieu)
  });
});

describe('options en attente de rechargement', () => {
  it('seules les options « load » qui diffèrent du jeu en cours ; « live » jamais en attente', () => {
    const running = effectiveOptions('eleve', null, '', DESKTOP, CFG).vector;
    expect(pendingReload(effectiveOptions('eleve', null, '', DESKTOP, CFG), running, CFG)).toEqual([]);
    expect(pendingReload(effectiveOptions('faible', null, '', DESKTOP, CFG), running, CFG)).toEqual(['anticrenelage', 'carte', 'textures', 'personnages']);
    expect(pendingReload(effectiveOptions('moyen', null, '', DESKTOP, CFG), running, CFG)).toEqual(['anticrenelage', 'personnages']);
    const s = setOption(base('eleve'), 'textures', 'simples', CFG);
    expect(pendingReload(eff(s), running, CFG)).toEqual(['textures']);
    expect(pendingReload(eff(setOption(base('eleve'), 'ombres', 'aucune', CFG)), running, CFG)).toEqual([]);
    // Auto baissé : les options « load » restent celles du chargement : rien en attente.
    expect(pendingReload(effectiveOptions('auto', null, '', DESKTOP, CFG, 'faible'), running, CFG)).toEqual([]);
    // Option « load » imposée par l'adresse : jamais en attente (elle ne changera pas au rechargement).
    const url = '?detail=1';
    expect(pendingReload(effectiveOptions('faible', null, url, DESKTOP, CFG), effectiveOptions('eleve', null, url, DESKTOP, CFG), CFG)).toEqual(['anticrenelage', 'personnages']);
  });
});

describe('stockage zs.device.v1, schéma 2', () => {
  it('migration du schéma 1 à la lecture (rien n\'est écrit) ; le prochain choix écrit le schéma 2', () => {
    const storage = createFakeStorage({ [DEVICE_KEY]: '{"v":1,"graphics":"faible"}' });
    const d = createDeviceSettings({ search: '', storage });
    expect(d.read()).toEqual({ status: 'ok', graphics: 'faible', custom: null, migrated: true });
    expect(storage.calls.setItem).toBe(0);
    expect(d.write('perso', VECTEURS.moyen)).toEqual({ ok: true, status: 'ok', persisted: true });
    expect(JSON.parse(storage.data.get(DEVICE_KEY))).toEqual({ v: 2, graphics: 'perso', custom: VECTEURS.moyen });
    expect(d.write('eleve')).toMatchObject({ ok: true }); // custom absent : la configuration Perso est gardée
    expect(JSON.parse(storage.data.get(DEVICE_KEY))).toEqual({ v: 2, graphics: 'eleve', custom: VECTEURS.moyen });
    expect(createDeviceSettings({ search: '', storage }).read()).toEqual({ status: 'ok', graphics: 'eleve', custom: VECTEURS.moyen });
    expect([...storage.data.keys()]).toEqual([DEVICE_KEY]); // aucune clé nouvelle
    expect(parseDevice('{"v":1,"graphics":"perso"}')).toMatchObject({ graphics: 'auto' }); // Perso n'existait pas au schéma 1
  });
  it('custom hostile : forme seulement (identifiants et valeurs courts, 32 au plus) ; JSON invalide ou version future : verrouillé, jamais écrasé', () => {
    expect(parseDevice('{"v":2,"graphics":"perso","custom":{"ombres":"hautes","x y":"a","vhs":3,"sang":"' + 'z'.repeat(40) + '","feux":"ok"}}')).toEqual({ status: 'ok', graphics: 'perso', custom: { ombres: 'hautes', feux: 'ok' }, from: 2 });
    expect(parseDevice('{"v":2,"graphics":"ultra","custom":[1]}')).toEqual({ status: 'ok', graphics: 'auto', custom: null, from: 2 });
    expect(Object.keys(customShape(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`o${i}`, 'v'])))).length).toBe(32);
    for (const h of [null, 1, 'x', [], {}, { a: {} }]) expect(customShape(h)).toBeNull();
    for (const raw of ['{bad', '{"v":3,"graphics":"faible"}', '{"v":2.5}']) {
      const storage = createFakeStorage({ [DEVICE_KEY]: raw });
      const d = createDeviceSettings({ search: '', storage });
      expect(d.write('perso', VECTEURS.faible)).toEqual({ ok: false, status: 'verrouille', persisted: false });
      expect(storage.data.get(DEVICE_KEY)).toBe(raw);
    }
    // Perso hostile relu puis validé par la logique : valeurs du préréglage le plus proche.
    const read = parseDevice(JSON.stringify({ v: 2, graphics: 'perso', custom: { ...VECTEURS.faible, ombres: 'ultra', inconnue: 'x' } }));
    expect(effectiveOptions(read.graphics, read.custom, '', DESKTOP, CFG).vector).toEqual(VECTEURS.faible);
  });
  it('quota : refus sans exception ; ?test=1 sans store=local : mémoire (Perso compris), aucun appel au stockage', () => {
    const full = createFakeStorage();
    full.failSet = quotaError();
    expect(createDeviceSettings({ search: '', storage: full }).write('perso', VECTEURS.faible)).toEqual({ ok: false, status: 'echec', persisted: false });
    const storage = createFakeStorage();
    const mem = createDeviceSettings({ search: '?test=1', storage });
    expect(mem.write('perso', VECTEURS.eleve)).toEqual({ ok: true, status: 'memoire', persisted: false });
    expect(mem.read()).toEqual({ graphics: 'perso', custom: VECTEURS.eleve, status: 'memoire' });
    expect(storage.calls.getItem + storage.calls.setItem).toBe(0);
    for (const h of [...HOSTILE, Symbol('x')]) expect(() => createDeviceSettings({ search: '', storage: createFakeStorage() }).write('perso', h)).not.toThrow();
  });
});
