// Lot 8c : page Options du menu principal (E5) et Options de la partie (E2-12). Fonctions pures de js/core/graphics.js (réglages appliqués au
// lancement lus dans les données, verrouillage par contexte, préréglage détecté d'Auto, valeurs en attente) et contrôleur graphique
// (js/game/graphics-apply.js) dans les deux contextes, sur un faux stockage : zs.device.v1 écrit dans ses seuls champs existants (v, graphics,
// custom). Appareils fictifs ; aucune horloge, aucun hasard.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTEXTES_OPTIONS, choosePreset, effectiveOptions, optionsAuLancement, optionsState, optionVerrouillee, parseGraphics, presetDetecte, setOption, valeursEnAttente,
} from '../../js/core/graphics.js';
import { createGraphicsController } from '../../js/game/graphics-apply.js';
import { createDeviceSettings, DEVICE_KEY } from '../../js/save/device-settings.js';
import { createFakeStorage } from './helpers/fake-storage.js';

const RAW = JSON.parse(readFileSync('data/game/graphics.json', 'utf8'));
const CFG = parseGraphics(RAW);
const PHONE = { coarse: true, ua: 'Mozilla/5.0 (Linux; Android 14; K) Mobile' };
const DESKTOP = { coarse: false, ua: 'Mozilla/5.0 (X11; Linux x86_64)' };
const LOAD = RAW.options.filter((o) => o.group === 'load').map((o) => o.id); // lus dans les données, jamais recopiés

// Sortie de graphicsBoot() pour un appareil et un stockage donnés (sans lampes ni adresse).
function fauxBoot(device, storage = createFakeStorage()) {
  const store = createDeviceSettings({ search: '', storage });
  const stored = store.read();
  const choice = stored.graphics ?? 'auto';
  const effective = effectiveOptions(choice, stored.custom, {}, device, CFG);
  return { cfg: CFG, store, stored, resolved: { choice, preset: effective.preset, origin: 'stockage', device: 'x' }, explicit: {}, device, effective, settings: effective.settings, lamps: null };
}

describe('lot 8c : réglages appliqués au lancement', () => {
  it('lus dans graphics.json (groupe « load »), dans l\'ordre des données : anticrénelage, carte, textures, personnages', () => {
    expect(optionsAuLancement(CFG)).toEqual(LOAD);
    expect(LOAD).toEqual(['anticrenelage', 'carte', 'textures', 'personnages']);
    expect(optionsAuLancement(null)).toEqual([]); // données absentes : aucune option (rien n'est verrouillé en dur)
  });

  it('verrouillés en partie seulement ; jamais une option « tout de suite » ; contexte inconnu traité comme la partie', () => {
    expect(CONTEXTES_OPTIONS).toEqual(['menu', 'partie']);
    for (const o of CFG.options) {
      expect(optionVerrouillee(CFG, o.id, 'menu'), o.id).toBe(false);
      expect(optionVerrouillee(CFG, o.id, 'partie'), o.id).toBe(o.group === 'load');
      expect(optionVerrouillee(CFG, o.id, 'autre'), o.id).toBe(o.group === 'load');
    }
    expect(optionVerrouillee(CFG, 'inconnue', 'partie')).toBe(false);
    expect(optionVerrouillee(CFG, 'son', 'partie')).toBe(false);
  });
});

describe('lot 8c : libellé « Auto · <détecté> »', () => {
  it('Auto : le préréglage de la classe (téléphone Moyen, ordinateur Élevé), baissé s\'il l\'a été ; autre choix : le préréglage initial de la classe', () => {
    expect(presetDetecte(effectiveOptions('auto', null, {}, PHONE, CFG))).toBe('moyen');
    expect(presetDetecte(effectiveOptions('auto', null, {}, DESKTOP, CFG))).toBe('eleve');
    expect(presetDetecte(effectiveOptions('auto', null, {}, DESKTOP, CFG, 'moyen'))).toBe('moyen');
    expect(presetDetecte(effectiveOptions('faible', null, {}, DESKTOP, CFG))).toBe('eleve');
    expect(presetDetecte(effectiveOptions('perso', { resolution: 'basse' }, {}, PHONE, CFG))).toBe('moyen');
    for (const hostile of [null, undefined, 42, 'x', {}, { choice: 'auto', preset: 'ultra' }]) expect(presetDetecte(hostile)).toBe('eleve');
  });
});

describe('lot 8c : passage sur Perso (règle inchangée)', () => {
  it('un réglage changé depuis un préréglage passe sur Perso, les autres valeurs gardées ; revenir sur Perso restaure la configuration', () => {
    const st = optionsState({ choice: 'moyen', device: DESKTOP, url: '' }, CFG);
    const perso = setOption(st, 'ombres', 'hautes', CFG);
    expect(perso.choice).toBe('perso');
    expect(perso.custom).toEqual({ ...CFG.vectors.moyen, ombres: 'hautes' });
    const faible = choosePreset(perso, 'faible', CFG);
    expect(faible.choice).toBe('faible');
    expect(choosePreset(faible, 'perso', CFG).custom).toEqual(perso.custom);
  });
});

describe('lot 8c : valeurs en attente du prochain chargement', () => {
  it('seulement les réglages appliqués au lancement qui diffèrent, avec la valeur en cours et celle du retour au menu', () => {
    const running = effectiveOptions('eleve', null, {}, DESKTOP, CFG).vector;
    const faible = effectiveOptions('faible', null, {}, DESKTOP, CFG);
    expect(valeursEnAttente(faible, running, CFG)).toEqual([
      { id: 'anticrenelage', enCours: 'oui', retour: 'non' },
      { id: 'carte', enCours: 'complet', retour: 'reduit' },
      { id: 'textures', enCours: 'fines', retour: 'simples' },
      { id: 'personnages', enCours: 'riches', retour: 'simples' },
    ]);
    // Moyen depuis Élevé : la carte et les textures sont égales (complet, fines) ; options « tout de suite » jamais en attente.
    expect(valeursEnAttente(effectiveOptions('moyen', null, {}, DESKTOP, CFG), running, CFG).map((w) => w.id)).toEqual(['anticrenelage', 'personnages']);
    expect(valeursEnAttente(effectiveOptions('eleve', null, {}, DESKTOP, CFG), running, CFG)).toEqual([]);
    for (const hostile of [null, undefined, 42, 'x', []]) expect(valeursEnAttente(hostile, running, CFG)).toEqual([]);
  });
});

describe('lot 8c : contrôleur, contexte « menu »', () => {
  it('tout est modifiable (réglages au lancement compris) ; zs.device.v1 garde ses seuls champs (v, graphics, custom) ; état exposé', () => {
    const storage = createFakeStorage();
    const g = createGraphicsController(fauxBoot(DESKTOP, storage), { contexte: 'menu' });
    expect(g.state()).toMatchObject({ contexte: 'menu', choice: 'auto', detected: 'eleve', lockedOptions: [], waiting: expect.any(Array) });
    expect(g.choosePreset('faible').ok).toBe(true);
    expect(JSON.parse(storage.data.get(DEVICE_KEY))).toEqual({ v: 2, graphics: 'faible', custom: null });
    expect(g.setOption('textures', 'fines').ok).toBe(true); // réglage « au lancement » : permis dans le menu
    const ecrit = JSON.parse(storage.data.get(DEVICE_KEY));
    expect(Object.keys(ecrit).sort()).toEqual(['custom', 'graphics', 'v']);
    expect(ecrit).toEqual({ v: 2, graphics: 'perso', custom: { ...CFG.vectors.faible, textures: 'fines' } });
    expect(g.state()).toMatchObject({ choice: 'perso', detected: 'eleve' });
    expect([...storage.data.keys()]).toEqual([DEVICE_KEY]); // aucune autre clé
  });
});

describe('lot 8c : contrôleur, contexte « partie »', () => {
  it('réglage au lancement refusé à la main (rien d\'écrit) ; option « tout de suite » permise (Perso) ; plus de rechargement', () => {
    const storage = createFakeStorage();
    const g = createGraphicsController(fauxBoot(DESKTOP, storage)); // défaut : partie
    expect(g.state()).toMatchObject({ contexte: 'partie', lockedOptions: LOAD });
    for (const id of LOAD) {
      const o = CFG.options.find((x) => x.id === id);
      for (const v of o.valeurs) expect(g.setOption(id, v.id), `${id}=${v.id}`).toMatchObject({ ok: false, status: 'verrouille-partie' });
    }
    expect(storage.calls.setItem).toBe(0);
    expect(g.setOption('brume', 'simple')).toMatchObject({ ok: true });
    expect(g.state()).toMatchObject({ choice: 'perso', vector: { brume: 'simple' } });
    expect(g.reloadNow).toBeUndefined();
    expect(g.state()).not.toHaveProperty('reloadRequested');
  });

  it('valeurs en attente selon le préréglage choisi en partie ; aucune valeur en cours changée pour un réglage verrouillé tant que la partie dure', () => {
    for (const [device, initial] of [[DESKTOP, 'eleve'], [PHONE, 'moyen']]) {
      const storage = createFakeStorage();
      const g = createGraphicsController(fauxBoot(device, storage));
      const running = g.state().running;
      const load = g.state().load;
      expect(Object.fromEntries(LOAD.map((id) => [id, running[id]]))).toEqual(Object.fromEntries(LOAD.map((id) => [id, CFG.vectors[initial][id]])));
      for (const p of ['faible', 'moyen', 'eleve', 'perso', 'auto', 'faible']) {
        expect(g.choosePreset(p).ok || g.state().choice === p).toBe(true);
        const s = g.state();
        expect(s.running, `${initial} → ${p}`).toEqual(running); // valeurs du chargement : jamais changées
        expect(s.load, `${initial} → ${p}`).toEqual(load); // réglages « load » du rendu en cours : jamais changés
        const voulu = s.vector;
        expect(s.waiting).toEqual(LOAD.filter((id) => voulu[id] !== running[id]).map((id) => ({ id, enCours: running[id], retour: voulu[id] })));
        expect(s.pending).toEqual(s.waiting.map((w) => w.id));
        expect(JSON.parse(storage.data.get(DEVICE_KEY))).toMatchObject({ v: 2, graphics: p }); // enregistré pour le prochain chargement
      }
    }
  });
});
