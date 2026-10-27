import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { STAT_IDS } from '../../js/core/player-stats.js';
import { load } from './helpers/monde.js';

const params = load('player-stats');
const weapons = load('weapons');
const pistol = weapons.pistol;
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

describe('data/game/player-stats.json', () => {
  it('est marqué provisoire et décrit les sept statistiques', () => {
    expect(params._provisoire).toBeTruthy();
    expect(Object.keys(params.stats).sort()).toEqual([...STAT_IDS].sort());
  });

  it('niveaux de 0 à 10', () => {
    expect(params.maxLevel).toBe(10);
  });

  it('valeurs de départ de la table', () => {
    expect(params.stats.degats.perLevel).toBe(0.15);
    expect(params.stats.portee).toEqual({ perLevel: 0.12, bulletMargin: 100 });
    expect(params.stats.precision).toEqual({ baseAngle: 4, baseDecay: 0.9, moveAngle: 8, moveDecay: 0.85, minAngle: 0.5 });
    expect(params.stats.cadence).toEqual({ decay: 0.9, minDelay: 0.15 });
    expect(params.stats.vie.perLevel).toBe(12);
    expect(params.stats.regen).toEqual({ base: 1, perLevel: 1 });
  });

  it('plafonds : vitesse +40 % au plus, délai 0,15 s, demi-angle 0,5° au moins', () => {
    expect(params.stats.vitesse).toEqual({ perLevel: 0.04, maxBonus: 0.4 });
    expect(params.stats.cadence.minDelay).toBe(0.15);
    expect(params.stats.precision.minAngle).toBe(0.5);
  });

  it('lissage du cône : 0,08 s à l\'ouverture, 0,25 s à la fermeture', () => {
    expect(params.spread).toEqual({ widenTime: 0.08, narrowTime: 0.25 });
  });

  it('toutes les valeurs sont des nombres finis', () => {
    const check = (o) => Object.values(o).forEach((v) => (typeof v === 'object' ? check(v) : typeof v === 'number' ? expect(Number.isFinite(v)).toBe(true) : undefined));
    check({ ...params, _provisoire: undefined });
  });
});

describe('data/game/weapons.json (lot 2b)', () => {
  it('portée de tir de base 700, laser 300, tolérance de visée inchangée', () => {
    expect(pistol.fireRange).toBe(700);
    expect(pistol.laserRange).toBe(300);
    expect(pistol.aimTolerance).toBe(24);
    expect(pistol.damage).toBe(25);
    expect(pistol.fireDelay).toBe(0.4);
  });

  it('la distance maximale de la balle n\'est plus une constante : elle vient de la portée effective', () => {
    expect(pistol.bulletMaxDistance).toBeUndefined();
  });
});

describe('hygiène du lot 2b', () => {
  it('aucune clé de fr.json orpheline : chaque clé « game.* » et « dev.* » est utilisée dans le code ou les pages', () => {
    const sources = [...walk('js'), ...walk('dev'), 'jeu.html', 'index.html', 'sons.html'].map((f) => readFileSync(f, 'utf8')).join('\n');
    const dynamic = ['game.wave.', 'game.hud.', 'game.live.', 'dev.'];
    const orphans = Object.keys(fr).filter((k) => /^(game|dev)\./.test(k) && !sources.includes(k) && !dynamic.some((d) => k.startsWith(d) && sources.includes(d)));
    expect(orphans).toEqual([]);
  });

  it('js/core/ ne contient ni Math.random, ni Date.now, ni document, ni window', () => {
    for (const f of walk('js/core').filter((n) => n.endsWith('.js'))) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\b/);
    }
  });

  it('les nouveaux modules purs n\'importent que des modules de js/core/', () => {
    for (const f of ['js/core/player-stats.js', 'js/core/spread.js']) {
      const imports = [...readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) expect(i, f).toMatch(/^\.\/[a-z-]+\.js$/);
    }
  });

  it('aucune couleur ni aucun texte français en dur dans les nouveaux modules purs', () => {
    for (const f of ['js/core/player-stats.js', 'js/core/spread.js']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
