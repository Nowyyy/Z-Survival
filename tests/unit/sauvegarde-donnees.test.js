import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { seedProblems } from './helpers/seed.js';
import { ERROR_CODES, STAT_KEYS, statMaxLevels } from '../../js/core/save.js';
import { ALL_STAT_IDS } from '../../js/core/player-stats.js';
import { errorKey } from '../../js/sauvegarde/logic.js';
import { TYPES } from '../../js/core/waves.js';
import { sansImagesStudio } from './helpers/images-studio.js'; // lot 8g : logo du studio, exception nominative
// Lot 4c (publication par versions, seul lot autorisé à modifier le workflow) : workflow, accueil, ses textes et tests du journal modifiés ; ce garde-fou de branche
// (comparaison à main ou à lot-4b) n'a plus de sens pour eux après l'entrée dans main : ils sortent de la liste.
// Lot 4e : workflow de tests ajouté (.github/workflows/tests.yml, autorisé par le prompt du lot ; pages.yml intact).
const LOT_4C = ['.github/workflows/pages.yml', '.github/workflows/tests.yml', 'index.html', 'data/i18n/fr.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js'];
const notLot4c = (files) => (files ?? []).filter((f) => !LOT_4C.includes(f));

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const economy = load('economy');
const save = load('save');
const stats = load('player-stats');
const enemies = load('enemies');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
};
// Le code des modules, sans les commentaires.
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s\/\/.*$/gm, '');

describe('data/game/economy.json', () => {
  it('est marqué provisoire et complet (dix clés de réglage)', () => {
    expect(typeof economy._provisoire).toBe('string');
    expect(Object.keys(economy).filter((k) => !k.startsWith('_')).sort()).toEqual(['gainThrottleMs', 'gainWindowMs', 'killGrowthCap', 'killWaveGrowth', 'maxMoney', 'reinforcedBonusMul', 'repairMoney', 'waveBonusBase', 'waveBonusPerWave', 'worldBonus']);
  });

  it('a les valeurs du lot', () => {
    expect(economy).toMatchObject({ killWaveGrowth: 0, repairMoney: 1, killGrowthCap: 3, waveBonusBase: 10, waveBonusPerWave: 2, reinforcedBonusMul: 1.5, worldBonus: 500, maxMoney: 9_999_999, gainWindowMs: 1200, gainThrottleMs: 250 });
  });

  it('toutes les valeurs sont des nombres finis, positifs (killWaveGrowth vaut 0 : montant fixe par zombie)', () => {
    for (const [k, v] of Object.entries(economy)) if (!k.startsWith('_')) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
      if (k !== 'killWaveGrowth') expect(v, k).toBeGreaterThan(0);
    }
  });

  it('les bornes sont cohérentes (plafond ≥ 1, bonus renforcé ≥ 1, limitation < fenêtre, solde maximal entier)', () => {
    expect(economy.killGrowthCap).toBeGreaterThanOrEqual(1);
    expect(economy.reinforcedBonusMul).toBeGreaterThanOrEqual(1);
    expect(economy.gainThrottleMs).toBeLessThan(economy.gainWindowMs);
    expect(Number.isInteger(economy.maxMoney)).toBe(true);
    expect(1000 / economy.gainThrottleMs).toBeLessThanOrEqual(4); // jamais plus de 4 mises à jour du « +N » par seconde
  });
});

describe('data/game/save.json', () => {
  it('est marqué provisoire et complet', () => {
    expect(typeof save._provisoire).toBe('string');
    expect(Object.keys(save).filter((k) => !k.startsWith('_')).sort()).toEqual(['autosaveMs', 'exportPrefix', 'maxCodeLength', 'maxStoredBytes', 'memoryByDefaultWith', 'readOnlyParams', 'schemaVersion', 'storageKey']);
  });

  it('la clé de stockage est zs.save.v1 et la version de schéma 1', () => {
    expect(save.storageKey).toBe('zs.save.v1');
    expect(save.schemaVersion).toBe(1);
    expect(save.exportPrefix).toBe('ZS1');
  });

  it('les limites sont des entiers positifs', () => {
    for (const k of ['autosaveMs', 'maxStoredBytes', 'maxCodeLength']) {
      expect(Number.isInteger(save[k]), k).toBe(true);
      expect(save[k], k).toBeGreaterThan(0);
    }
    expect(save.autosaveMs).toBe(2000);
    expect(save.maxStoredBytes).toBe(16_384);
    expect(save.maxCodeLength).toBe(2048);
  });

  it('les paramètres d\'essai sont ceux du lot, sans doublon', () => {
    expect(save.readOnlyParams).toEqual(['wave', 'lvl', 'planks', 'map', 'empty', 'nospawn', 'endless', 'floor', 'money']);
    expect(new Set(save.readOnlyParams).size).toBe(save.readOnlyParams.length);
    expect(save.memoryByDefaultWith).toEqual(['test']);
  });

  it('?test=1, ?store= et les paramètres d\'affichage ne figurent pas parmi les paramètres de lecture seule', () => {
    for (const k of ['test', 'store', 'tilt', 'zoom', 'vhs', 'labels', 'fps', 'dpr', 'shadows', 'seed']) expect(save.readOnlyParams).not.toContain(k);
  });
});

describe('primes et statistiques', () => {
  it('bounty : 10 pour les quatre types, strictement positif (montant fixe)', () => {
    expect(TYPES.map((t) => enemies.variants[t].bounty)).toEqual([10, 10, 10, 10]);
    for (const t of TYPES) expect(enemies.variants[t].bounty).toBeGreaterThan(0);
  });

  it('bounty est le même pour tous les types (retour du propriétaire : montant fixe) et ne monte pas avec la manche', () => {
    const list = TYPES.map((t) => enemies.variants[t].bounty);
    expect(new Set(list).size).toBe(1);
    expect(economy.killWaveGrowth).toBe(0);
  });

  it('les neuf statistiques du schéma sont celles de player-stats.json (sept + extra)', () => {
    expect([...STAT_KEYS].sort()).toEqual([...Object.keys(stats.stats), ...Object.keys(stats.extra)].sort());
    expect(STAT_KEYS).toEqual(ALL_STAT_IDS);
  });

  it('les niveaux maximaux sont repris de player-stats.json', () => {
    const max = statMaxLevels({ stats });
    for (const id of Object.keys(stats.stats)) expect(max[id]).toBe(stats.maxLevel);
    for (const [id, extra] of Object.entries(stats.extra)) expect(max[id]).toBe(extra.maxLevel);
  });
});

describe('textes', () => {
  it('chaque code d\'erreur du codec a un message dans fr.json, non vide', () => {
    for (const c of ERROR_CODES) {
      expect(fr[errorKey(c)], c).toBeTruthy();
      expect(errorKey(c)).toBe(`game.save.page.error.${c}`);
    }
    expect(errorKey('inconnu')).toBe('game.save.page.error.bad-schema');
    expect(errorKey(undefined)).toBe('game.save.page.error.bad-schema');
  });

  it('aucune clé d\'erreur orpheline : chaque message correspond à un code', () => {
    const keys = Object.keys(fr).filter((k) => k.startsWith('game.save.page.error.'));
    expect(keys.sort()).toEqual(ERROR_CODES.map((c) => `game.save.page.error.${c}`).sort());
  });

  it('les lignes de la pause et de l\'état de la sauvegarde sont écrites en toutes lettres', () => {
    expect(fr['game.pause.balance']).toBe('Solde : {n}');
    expect(fr['game.save.status.saved']).toBe('Sauvegarde : enregistrée');
    expect(fr['game.save.status.pending']).toBe('Sauvegarde : en attente');
    expect(fr['game.save.status.failed']).toBe('Sauvegarde : échec, nouvelle tentative');
    expect(fr['game.save.status.readonly']).toBe('Mode essai : rien n\'est enregistré');
    expect(fr['game.save.status.locked']).toBe('Sauvegarde illisible : rien n\'est enregistré (voir la page Sauvegarde)');
    expect(fr['game.save.status.unavailable']).toBe('Sauvegarde indisponible : le solde reste en mémoire');
  });

  it('les lignes de l\'écran de fin contiennent leurs paramètres', () => {
    expect(fr['game.end.earned']).toContain('{n}');
    expect(fr['game.end.balance']).toContain('{n}');
    expect(fr['game.end.best']).toContain('{n}');
    expect(fr['game.end.worldBonus']).toContain('{n}');
    expect(fr['game.hud.moneyLabel']).toContain('{n}');
    expect(fr['game.live.waveBonus']).toContain('{bonus}');
    expect(fr['game.end.record']).toBe('Nouveau record');
  });

  it('aucune clé « save.page.* » en dehors de « game.* » (le jeu est en français seul)', () => {
    expect(Object.keys(fr).filter((k) => /(^|\.)save\.page\./.test(k) && !k.startsWith('game.'))).toEqual([]);
  });
});

describe('hygiène du lot 4 (partie A)', () => {
  const core = walk('js/core').filter((f) => f.endsWith('.js'));

  it.each(['js/core/economy.js', 'js/core/money-gain.js', 'js/core/save.js'])('%s : ni Math.random, ni Date.now, ni stockage, ni DOM, ni minuteur, ni réseau', (f) => {
    expect(code(f)).not.toMatch(/Math\.random|Date\.now|performance\.now|localStorage|sessionStorage|indexedDB|\bdocument\b|(?<![\w.'-])window\s*[.[(]|\bfetch\s*\(|setTimeout|setInterval|requestAnimationFrame|THREE|AudioContext/);
  });

  it('aucun module de js/core/ n\'utilise localStorage, sessionStorage, indexedDB, document ni window', () => {
    for (const f of core) expect(code(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|\bdocument\b|(?<![\w.'-])window\s*[.[(]/);
  });

  it('les modules du lot ne contiennent aucune couleur en dur', () => {
    for (const f of ['js/core/economy.js', 'js/core/money-gain.js', 'js/core/save.js', 'data/game/economy.json', 'data/game/save.json']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });

  it('aucune valeur d\'équilibrage en dur dans economy.js (500, 0,04, 1,5, 9 999 999 absents)', () => {
    expect(code('js/core/economy.js')).not.toMatch(/\b500\b|0\.04|9999999|9_999_999|\b1\.5\b/);
  });

  it('economy.js, money-gain.js et save.js ne modifient pas leurs arguments : aucune affectation sur un paramètre d\'entrée', () => {
    for (const f of ['js/core/economy.js', 'js/core/money-gain.js', 'js/core/save.js']) expect(code(f)).not.toMatch(/\b(?:ledger|delta|params|events|raw)\.\w+\s*=[^=]/);
  });

  it('aucun fichier audio, image ou police ajouté depuis main', () => {
    const added = git('diff --name-only --diff-filter=A main');
    if (added === null) return;
    expect(sansImagesStudio(added).filter((f) => /\.(mp3|ogg|wav|flac|m4a|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
  });

  it('les cartes, world.json et decor.json sont inchangés (git diff vide)', () => {
    const changed = git('diff --name-only main -- data/game/world.json data/game/decor.json data/game/maps');
    if (changed === null) return;
    // Branche lot-3g (main récupéré dedans) : la carte du rez-de-chaussée et de l'étage est corrigée par l'atelier de la carte (lot 3g), pas par le lot 4.
    expect(changed.filter((f) => !f.startsWith('data/game/maps/rez-de-chaussee/'))).toEqual([]);
  });

  it('les règles de tir, de vague, de siège, de chute, d\'étage et de caméra sont inchangées', () => {
    // Lot 3i : data/game/sounds.json change (sons de l'atelier intégrés, décision du propriétaire) ; ses recettes gardées (tir, mélodie, impacts…) sont
    // comparées à main, objet par objet, dans sons-integres.test.js.
    const changed = git('diff --name-only main -- js/core/waves.js js/core/wave-director.js js/core/projectile.js js/core/ray.js js/core/spread.js js/core/player-stats.js js/core/player-down.js js/core/siege.js js/core/stair-walk.js js/core/camera.js js/core/synth.js data/game/waves.json data/game/gaits.json data/game/weapons.json data/game/player-stats.json data/game/player-down.json data/game/windows.json data/game/textures.json');
    if (changed === null) return;
    // Branche lot-3g : sortie d'escalier par le côté et entrée sans saut (stair-walk.js), textures plus fines (textures.json) : changements de l'atelier (lot 3g).
    expect(changed.filter((f) => !['js/core/stair-walk.js', 'data/game/textures.json'].includes(f))).toEqual([]);
  });

  it('Docs/seed.md et le workflow sont inchangés (index.html : icône du site, demande du propriétaire)', () => {
    // Lot 5b : Docs/seed.md n'est plus comparé à un commit figé (le propriétaire le met à jour) : seuls ses commits le modifient (tests/unit/helpers/seed.js).
    const seed = seedProblems();
    if (seed !== null) expect(seed).toEqual([]);
    const changed = git('diff --name-only main -- .github');
    if (changed === null) return;
    expect(notLot4c(changed)).toEqual([]);
  });

  it('package.json : toujours aucune dépendance d\'exécution', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('le jeu (js/game/) n\'utilise jamais sessionStorage, indexedDB ni les cookies (le seul stockage est la clé zs.save.v1, via js/save/)', () => {
    for (const f of walk('js/game').filter((p) => p.endsWith('.js'))) expect(code(f), f).not.toMatch(/sessionStorage|indexedDB|document\.cookie/);
  });
});
