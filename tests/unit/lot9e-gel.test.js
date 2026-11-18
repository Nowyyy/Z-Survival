import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PERMIS_9E } from './helpers/lot9e.js';

// Lot 9e : équivalent des tests d'hygiène des lots précédents pour les fichiers de règles que ce lot change (helpers/lot9e.js) : par rapport à
// main, seules les clés prévues sont ajoutées, aucune valeur existante ne change, aucune clé n'est retirée ; le texte _provisoire d'avant reste
// le début du nouveau. Sans historique git (CI superficielle) : rien à comparer.
const show = (path) => {
  try {
    return JSON.parse(execSync(`git show main:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
};
const now = (path) => JSON.parse(readFileSync(path, 'utf8'));
const AJOUTS = { 'data/game/windows.json': ['slotMains'], 'data/game/enemies.json': ['rampant'] };

describe('lot 9e : données de règles changées, seulement par ajout', () => {
  it.each(Object.entries(AJOUTS))('%s : clés ajoutées %j, le reste identique à main', (path, keys) => {
    expect(Object.hasOwn(PERMIS_9E, path)).toBe(true);
    const before = show(path);
    if (before === null) return;
    const after = now(path);
    const { _provisoire: t0, ...b } = before;
    const { _provisoire: t1, ...a } = after;
    for (const k of keys) {
      expect(Object.hasOwn(a, k), k).toBe(true);
      expect(Object.hasOwn(b, k), k).toBe(false);
      delete a[k];
    }
    expect(a).toEqual(b);
    expect(t1.startsWith(t0)).toBe(true);
  });
  it('les fichiers de code permis sont nommés avec leur raison', () => {
    for (const [f, why] of Object.entries(PERMIS_9E)) {
      expect(f).toMatch(/^(js\/core|data\/game)\//);
      expect(why.length).toBeGreaterThan(10);
    }
  });
});
