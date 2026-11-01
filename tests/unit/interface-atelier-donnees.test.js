// Lot 3k-A : données de l'atelier de l'interface (data/game/ui-atelier.json, data/i18n/atelier-interface.json).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tokensFromCss } from '../../js/core/ui-measure.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const texts = JSON.parse(readFileSync('data/i18n/atelier-interface.json', 'utf8'));
const stats = JSON.parse(readFileSync('data/game/player-stats.json', 'utf8'));
const waves = JSON.parse(readFileSync('data/game/waves.json', 'utf8'));
const save = JSON.parse(readFileSync('data/game/save.json', 'utf8'));
const tokens = tokensFromCss(readFileSync('css/tokens.css', 'utf8'));
const unique = (list) => new Set(list).size === list.length;

describe('ui-atelier.json : tailles et zones de sécurité', () => {
  it('provisoire et honnête : les données fictives sont annoncées comme telles', () => {
    expect(cfg._provisoire).toMatch(/FAUSSES DONNÉES/);
    expect(cfg.fake._fictif).toMatch(/inventés/);
  });

  it('les 7 tailles demandées, dans l\'ordre, sans doublon', () => {
    expect(cfg.sizes.map((s) => s.id)).toEqual(['667x375', '812x375', '844x390', '932x430', '1024x768', '1440x900', '2560x1080']);
    expect(unique(cfg.sizes.map((s) => s.id))).toBe(true);
  });

  it.each(cfg.sizes.map((s) => [s.id, s]))('%s : identifiant = largeur × hauteur, paysage, zones de sécurité entières', (id, s) => {
    expect(id).toBe(`${s.width}x${s.height}`);
    expect(s.width).toBeGreaterThan(s.height);
    for (const k of ['top', 'right', 'bottom', 'left']) {
      expect(Number.isInteger(s.safe[k])).toBe(true);
      expect(s.safe[k]).toBeGreaterThanOrEqual(0);
      expect(s.safe[k]).toBeLessThan(s.width / 8);
    }
  });

  it('812×375 et 844×390 ont des zones de sécurité simulées ; 667×375 n\'en a aucune', () => {
    const by = Object.fromEntries(cfg.sizes.map((s) => [s.id, s.safe]));
    expect(by['812x375'].left + by['812x375'].right).toBeGreaterThan(0);
    expect(by['844x390'].left + by['844x390'].right).toBeGreaterThan(0);
    expect(Object.values(by['667x375'])).toEqual([0, 0, 0, 0]);
  });

  it('préréglages de zone de sécurité : identifiants uniques, le premier reprend la taille choisie', () => {
    expect(unique(cfg.safePresets.map((p) => p.id))).toBe(true);
    expect(cfg.safePresets[0]).toEqual({ id: 'preset', safe: null });
  });
});

describe('ui-atelier.json : règles et fonds', () => {
  it('règles de lisibilité du lot (14 px, 4,5:1, 3:1 grands titres, 44 px, 16 px, 3 et 2 clignotements par seconde)', () => {
    expect(cfg.rules).toMatchObject({ minTextPx: 14, minContrast: 4.5, minContrastLarge: 3, minTargetPx: 44, edgePx: 16, maxFlashPerSecond: 3, recMaxBlinkPerSecond: 2, maxCls: 0.1 });
  });

  it('les fonds de référence existent dans tokens.css (sols, murs, brume), sans doublon', () => {
    expect(unique(cfg.worstBackgrounds)).toBe(true);
    for (const n of cfg.worstBackgrounds) expect(tokens[n], n).toMatch(/^#[0-9a-f]{6}$/i);
    for (const n of ['--game-floor', '--game-wall', '--game-fog']) expect(cfg.worstBackgrounds).toContain(n);
  });
});

describe('ui-atelier.json : plages, états et écrans', () => {
  it('plages cohérentes avec le jeu (manches du monde, plafond de l\'argent, chutes)', () => {
    expect(cfg.maxWave).toBe(waves.wavesPerWorld);
    expect(cfg.ranges.money[1]).toBe(9_999_999);
    expect(cfg.ranges.chutes[1]).toBe(stats.extra.chutes.maxLevel);
    for (const [k, r] of Object.entries(cfg.ranges)) expect(r[0], k).toBeLessThanOrEqual(r[1]);
  });

  it('états de sauvegarde : ceux du jeu (lot 4), sans doublon', () => {
    expect(cfg.saveStatuses).toEqual(['saved', 'pending', 'failed', 'readonly', 'locked', 'unavailable', 'memory']);
    expect(save.readOnlyParams.length).toBeGreaterThan(0);
  });

  it('états nommés : identifiants uniques en minuscules, un seul « pire cas »', () => {
    const ids = cfg.states.map((s) => s.id);
    expect(unique(ids)).toBe(true);
    for (const id of ids) expect(id).toMatch(/^[a-z-]+$/);
    expect(cfg.states.filter((s) => s.worst)).toHaveLength(1);
  });

  it.each(cfg.states.map((s) => [s.id, s]))('état « %s » : seulement des champs connus', (_id, s) => {
    for (const k of Object.keys(s.params)) expect(Object.keys(cfg.defaults), k).toContain(k);
  });

  it('écrans : les 10 demandés ; directions : Actuel, A, B, C', () => {
    expect(cfg.screens).toEqual(['hud', 'pause', 'fin-mort', 'fin-monde', 'a-terre', 'sticks', 'menu', 'boutique', 'reglages', 'classement']);
    expect(cfg.directions).toEqual(['actuel', 'A', 'B', 'C']);
    for (const s of cfg.gameScreens) expect(cfg.screens).toContain(s);
  });

  it('macros : les 5 curseurs et leurs valeurs ; défauts valides pour A, B, C', () => {
    expect(Object.keys(cfg.macros)).toEqual(['texte', 'densite', 'fond', 'argent', 'contour']);
    for (const dir of ['A', 'B', 'C']) {
      for (const [k, v] of Object.entries(cfg.macroDefaults[dir])) expect(cfg.macros[k], `${dir}.${k}`).toContain(v);
    }
  });

  it('macros : échelle du texte croissante, opacités de fond de 0 à 1, contours de 0 à 2 px', () => {
    const t = cfg.macroValues.texte;
    expect(t.S).toBeLessThan(t.M);
    expect(t.M).toBeLessThan(t.L);
    expect(Object.values(cfg.macroValues.fondAlpha)).toEqual([0, 0.78, 1]);
    expect(Object.values(cfg.macroValues.contourPx)).toEqual([0, 1, 2]);
  });

  it('priorité 2 : au plus 5 propositions, 2 variantes chacune', () => {
    expect(cfg.priority2.length).toBeLessThanOrEqual(5);
    for (const p of cfg.priority2) expect(p.variants).toHaveLength(2);
    expect(unique(cfg.priority2.map((p) => p.id))).toBe(true);
  });
});

describe('ui-atelier.json : fausses données des écrans hors partie', () => {
  it('les 9 améliorations de player-stats.json (7 statistiques + chutes + réparation)', () => {
    expect(cfg.fake.stats).toEqual([...Object.keys(stats.stats), ...Object.keys(stats.extra)]);
    expect(cfg.fake.stats).toHaveLength(9);
  });

  it('niveaux fictifs dans les bornes du jeu (dont un niveau maximal pour l\'état « niveau maximal »)', () => {
    for (const k of cfg.fake.stats) {
      const max = stats.extra[k]?.maxLevel ?? stats.maxLevel;
      expect(cfg.fake.levels[k]).toBeGreaterThanOrEqual(0);
      expect(cfg.fake.levels[k]).toBeLessThanOrEqual(max);
    }
    expect(cfg.fake.stats.some((k) => cfg.fake.levels[k] === (stats.extra[k]?.maxLevel ?? stats.maxLevel))).toBe(true);
  });

  it('3 armes fictives, une seule possédée ; 3 mondes, seul le premier déverrouillé', () => {
    expect(cfg.fake.weapons).toHaveLength(3);
    expect(cfg.fake.weapons.filter((w) => w.owned)).toHaveLength(1);
    expect(cfg.fake.worlds.map((w) => w.unlocked)).toEqual([true, false, false]);
  });

  it('trois niveaux de sang (?sang=0|reduit|1 du lot 3j) ; pseudo de 3 à 20 caractères', () => {
    expect(cfg.fake.blood).toEqual(['0', 'reduit', '1']);
    expect(cfg.fake.pseudo).toEqual({ min: 3, max: 20 });
  });

  it('classement fictif : un tableau par monde, rangs croissants, pseudos « Exemple… », ligne du joueur marquée exemple', () => {
    for (const w of cfg.fake.worlds) {
      const rows = cfg.fake.leaderboard[w.id];
      expect(Array.isArray(rows)).toBe(true);
      rows.forEach((r, i) => {
        expect(r.rank).toBe(i + 1);
        expect(r.pseudo).toMatch(/^Exemple\d+$/);
        expect(r.wave).toBeLessThanOrEqual(cfg.maxWave);
      });
    }
    expect(cfg.fake.player.pseudo).toMatch(/exemple/);
  });
});

describe('atelier-interface.json : textes de l\'atelier (français, fichier séparé)', () => {
  it('clés « atelier.* » ou « ui3k.* », aucune valeur vide', () => {
    for (const [k, v] of Object.entries(texts)) {
      expect(k).toMatch(/^(atelier|ui3k)\./);
      expect(typeof v).toBe('string');
      expect(v.trim()).not.toBe('');
    }
  });

  it('dit que l\'agent ne juge pas l\'esthétique et que les données sont fausses', () => {
    expect(texts['atelier.honesty']).toMatch(/pas jugés/);
    expect(texts['atelier.intro']).toMatch(/fausses données/);
  });

  it('aucune clé commune avec fr.json (aucun conflit avec les textes du jeu)', () => {
    const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    for (const k of Object.keys(texts)) expect(Object.hasOwn(fr, k), k).toBe(false);
  });
});
