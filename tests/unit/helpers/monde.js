// Données du monde du lot 1b et outils de test communs.
import { readFileSync } from 'node:fs';
import { buildLayout } from '../../../js/core/layout.js';
import { createGrid } from '../../../js/core/nav.js';

export const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
export const world = load('world');
export const decorCfg = load('decor');
export const navCfg = load('nav');
export const enemies = load('enemies');
export const layout = buildLayout(world, decorCfg);
export const zombieR = enemies.zombie.radius;
export const gridOf = (solids = layout.zombieObstacles, size = layout.size) => createGrid(size, solids, { cell: navCfg.cell, radius: zombieR, inflate: navCfg.inflate });

// Gèle un objet en profondeur : toute écriture lèverait une erreur en mode strict.
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

// Entrées inattendues à passer à chaque fonction pure.
export const WEIRD = [undefined, null, NaN, Infinity, 'x', 42, {}, [], [null], true];
