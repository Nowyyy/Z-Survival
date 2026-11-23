import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PERMIS_9K } from './helpers/lot9k.js';

// Lot 9k : équivalent des tests d'hygiène des lots précédents pour waves.json (helpers/lot9k.js) : par rapport à main, seule la vie des zombies
// (hp : pente, manche de départ de l'exponentielle, facteur ; plafond inchangé) change, et l'ancienne valeur est gardée dans
// data/game/equilibrage-avant-9k.json ; le texte _provisoire d'avant reste la fin du nouveau. Sans historique git (CI superficielle) : rien à comparer.
const show = (path) => {
  try {
    return JSON.parse(execSync(`git show main:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
};
const now = (path) => JSON.parse(readFileSync(path, 'utf8'));

describe('lot 9k : données de règles changées par le choix du propriétaire', () => {
  it('waves.json : seule la vie des zombies diffère de main ; l\'ancienne est celle de equilibrage-avant-9k.json ; plafond, nombres, coups inchangés', () => {
    expect(Object.hasOwn(PERMIS_9K, 'data/game/waves.json')).toBe(true);
    const before = show('data/game/waves.json');
    const after = now('data/game/waves.json');
    const avant = now('data/game/equilibrage-avant-9k.json');
    expect(after.hp).toEqual({ hpLinearPerRound: 0.1, hpExpStartRound: 21, hpExpFactor: 1.04, hpCap: 30 });
    if (before === null) return;
    expect(before.hp).toEqual(avant.waves.hp);
    const { _provisoire: t0, hp: h0, ...b } = before;
    const { _provisoire: t1, hp: h1, ...a } = after;
    expect(a).toEqual(b);
    expect(h1.hpCap).toBe(h0.hpCap);
    expect(t1.endsWith(t0)).toBe(true);
  });
  it('les fichiers permis sont nommés avec leur raison', () => {
    for (const [f, why] of Object.entries(PERMIS_9K)) {
      expect(f).toMatch(/^(js\/core|data\/game)\//);
      expect(why.length).toBeGreaterThan(10);
    }
  });
});
