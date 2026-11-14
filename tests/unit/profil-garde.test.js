// Lot 8h-E : Profil, records et réglages gardés : avatar et pseudo (progression v2, js/menu/avatar.js), nouveautés lues, record de l'infini par
// carte (onglet Infini), son et volumes de l'appareil (zs.device.v1, champ son : js/save/device-settings.js, relus et écrits par demarrage.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appliquerOps, defaultProgression } from '../../js/core/progression.js';
import { AVATARS, brancherProfil, lireProfil, poserProfil, suivreProfil } from '../../js/menu/avatar.js';
import { createDeviceSettings, DEVICE_KEY, parseDevice, sonShape } from '../../js/save/device-settings.js';
import { createFakeStorage } from './helpers/fake-storage.js';

const read = (f) => readFileSync(f, 'utf8');
const lire = (f) => JSON.parse(read(f));
const params = { save: lire('data/game/save.json'), economy: lire('data/game/economy.json'), stats: lire('data/game/player-stats.json') };

// Fausse progression du menu (même contrat que js/menu/progression-etat.js : lire, choisir, abonner), sur appliquerOps.
function fausseProgression(save = defaultProgression()) {
  let lu = { status: 'ok', save };
  const abonnes = new Set();
  const ecrits = [];
  let n = 0;
  return {
    ecrits,
    lire: () => lu,
    choisir(champ, valeur) {
      n += 1;
      const op = { id: `op${n}`, t: 'choix', champ, valeur, date: n };
      ecrits.push(op);
      lu = { ...lu, save: appliquerOps(lu.save, [op], n, params).save };
      return { ok: true, refused: [] };
    },
    autreOnglet(profil) {
      lu = { ...lu, save: { ...lu.save, profil: { ...lu.save.profil, ...profil } } };
      for (const f of abonnes) f(lu.save, []);
    },
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
}

describe('avatar et pseudo gardés (progression v2)', () => {
  it('relus à la connexion ; chaque validation écrit une opération « choix » (seulement le champ changé) ; un autre onglet met l\'en-tête à jour', () => {
    const save = appliquerOps(defaultProgression(), [{ id: 'a', t: 'choix', champ: 'avatar', valeur: 'rodeur', date: 1 }, { id: 'b', t: 'choix', champ: 'pseudo', valeur: 'Le Chef', date: 1 }], 1, params).save;
    const prog = fausseProgression(save);
    brancherProfil(prog);
    expect(lireProfil()).toEqual({ avatar: 'rodeur', pseudo: 'Le Chef' });
    const vus = [];
    const fin = suivreProfil((p) => vus.push(p));
    poserProfil({ avatar: 'eclaireur' });
    expect(prog.ecrits.map((o) => [o.champ, o.valeur])).toEqual([['avatar', 'eclaireur']]);
    poserProfil({ pseudo: 'Rex' });
    poserProfil({ pseudo: 'Rex' }); // rien de changé : aucune écriture
    expect(prog.ecrits.map((o) => [o.champ, o.valeur])).toEqual([['avatar', 'eclaireur'], ['pseudo', 'Rex']]);
    expect(prog.lire().save.profil).toMatchObject({ avatar: 'eclaireur', pseudo: 'Rex' });
    prog.autreOnglet({ avatar: 'affame' });
    expect(vus.at(-1)).toEqual({ avatar: 'affame', pseudo: 'Rex' });
    fin();
  });

  it('avatar inconnu (version plus récente) : avatar par défaut affiché ; le choix le plus récent l\'emporte entre onglets', () => {
    brancherProfil(fausseProgression({ ...defaultProgression(), profil: { ...defaultProgression().profil, avatar: 'futur' } }));
    expect(lireProfil().avatar).toBe(AVATARS[0].id);
    const s = appliquerOps(defaultProgression(), [{ id: 'x', t: 'choix', champ: 'avatar', valeur: 'tireur', date: 20 }, { id: 'y', t: 'choix', champ: 'avatar', valeur: 'ouvrier', date: 10 }], 30, params).save;
    expect(s.profil.avatar).toBe('tireur');
  });

  it('menu.js branche le Profil sur la progression (preparerMenu) ; compte.js passe toujours par poserProfil (aucun stockage direct)', () => {
    expect(read('js/menu/menu.js')).toMatch(/brancherProfil\(prog\)/);
    expect(read('js/menu/compte.js')).not.toMatch(/localStorage\.setItem|sessionStorage/);
    expect(read('js/menu/avatar.js')).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe('nouveautés lues et record de l\'infini', () => {
  it('opération « lues » : identifiants gardés une fois, dans l\'ordre ; marquerLues n\'écrit rien quand tout est déjà lu', () => {
    const s = appliquerOps(defaultProgression(), [{ id: 'l1', t: 'lues', ids: ['v0.8-studio', 'v0.8-menu'] }, { id: 'l2', t: 'lues', ids: ['v0.8-menu', 'v0.8-x'] }], 1, params).save;
    expect(s.lues).toEqual(['v0.8-studio', 'v0.8-menu', 'v0.8-x']);
    const p = read('js/menu/progression-etat.js');
    expect(p).toMatch(/nouveaux\.length \? this\.commit\(\[\{ id: nouvelId\(\), t: 'lues', ids: nouveaux \}\]\) : \{ ok: true, refused: \[\] \}/);
    expect(read('js/menu/menu.js')).toMatch(/if \(etat\.lues\.length > avant\) chargerProgression\(\)\.then\(\(p\) => p\.marquerLues\(etat\.lues\)\)/);
  });

  it('onglet Infini : record de la carte lu dans records.infini (texte « Record : manche {n} »), séparé de celui de l\'histoire', () => {
    expect(lire('data/i18n/fr.json')['game.menu.infini.record']).toBe('Record : manche {n}');
    expect(read('js/menu/menu.js')).toMatch(/recordsInfini = \{ \.\.\.\(lu\?\.save\?\.records\?\.infini \?\? \{\}\) \}/);
    expect(read('js/menu/infini.js')).toMatch(/records = \{\} \}\) \{/);
  });
});

describe('son et volumes de l\'appareil (zs.device.v1)', () => {
  it('writeSon : graphismes et Perso gardés ; relu ; null (ou rien de choisi) retire le champ : texte identique à celui d\'avant le lot 8h', () => {
    const storage = createFakeStorage({ [DEVICE_KEY]: JSON.stringify({ v: 2, graphics: 'moyen', custom: null }) });
    const d = createDeviceSettings({ search: '', storage });
    expect(d.read().son).toBeUndefined();
    expect(d.writeSon({ coupe: true, jeu: 70, musique: 40 }).ok).toBe(true);
    expect(JSON.parse(storage.data.get(DEVICE_KEY))).toEqual({ v: 2, graphics: 'moyen', custom: null, son: { coupe: true, jeu: 70, musique: 40 } });
    expect(createDeviceSettings({ search: '', storage }).read().son).toEqual({ coupe: true, jeu: 70, musique: 40 });
    d.write('faible');
    expect(JSON.parse(storage.data.get(DEVICE_KEY)).son).toEqual({ coupe: true, jeu: 70, musique: 40 }); // le préréglage garde le son
    d.writeSon({ coupe: false, jeu: null, musique: null });
    expect(storage.data.get(DEVICE_KEY)).toBe(JSON.stringify({ v: 2, graphics: 'faible', custom: null }));
    d.writeSon({ coupe: false, jeu: 30, musique: null });
    d.writeSon(null);
    expect(storage.data.get(DEVICE_KEY)).toBe(JSON.stringify({ v: 2, graphics: 'faible', custom: null }));
  });

  it('sonShape et parseDevice : volumes hors bornes ou non entiers = défaut ; schéma 2 sans son lu comme avant ; ?test=1 sans store=local : mémoire, rien d\'écrit', () => {
    expect(sonShape({ coupe: 'oui', jeu: 101, musique: 4.5 })).toBeNull();
    expect(sonShape({ coupe: false, jeu: 0, musique: 100 })).toEqual({ coupe: false, jeu: 0, musique: 100 });
    expect(parseDevice(JSON.stringify({ v: 2, graphics: 'eleve', custom: null }))).not.toHaveProperty('son');
    const storage = createFakeStorage();
    const d = createDeviceSettings({ search: '?test=1', storage });
    d.writeSon({ coupe: true, jeu: 10, musique: 10 });
    expect(storage.calls.setItem).toBe(0);
  });

  it('demarrage.js : réglages relus au chargement, écrits seulement quand ils changent (writeSon), sans accès direct au stockage ; la pause écrit par poserSon ; l\'introduction respecte « Son coupé »', () => {
    const d = read('js/menu/demarrage.js');
    expect(d).toMatch(/appareil\?\.read\(\)\?\.son/);
    expect(d).toMatch(/if \(son\.coupe !== avant\.coupe \|\| son\.volume !== avant\.volume \|\| son\.musique !== avant\.musique\) \{/);
    expect(d).toMatch(/appareil\?\.writeSon\(\{ coupe: son\.coupe, jeu: son\.volume, musique: son\.musique \}\)/);
    expect(d).toMatch(/jouerIntro\(\{ coupe: son\.coupe \}\)/);
    const m = read('js/game/main.js');
    for (const s of ['poserSon({ coupe: ctx.audio.muted })', 'poserSon({ volume: ctx.audio.setVolume(n) })', 'poserSon({ musique: ctx.audio.setMusicVolume(n) })']) expect(m, s).toContain(s);
    expect(read('js/menu/intro.js')).toMatch(/if \(coupe \|\| !ctx \|\| !tampon \|\| phase !== 'joue'\) return;/);
  });
});
