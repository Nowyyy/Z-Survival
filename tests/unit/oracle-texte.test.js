import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Lot 5d-A : les oracles (tests/unit/helpers/oracle/) sont des copies verbatim des sources à origin/dev d18023c, plus deux lignes d'en-tête.
// Tant qu'une source n'est pas réécrite, son oracle doit lui être identique au caractère près. Quand une partie réécrit une source (B :
// collision.js ; C : pose-v2.js et character-parts.js), sa ligne est retirée d'ici et remplacée par son test d'identité (Object.is sur des
// milliers de cas) : l'oracle, lui, ne change jamais.
const BASE = 'd18023c5657406d6c5a531c40844ebb133b91489';
// Lot 5d-B : collision.js réécrit, remplacé par tests/unit/collision-identite.test.js.
const NON_REECRITS = ['pose-v2', 'character-parts'];
const read = (p) => readFileSync(p, 'utf8');

describe('oracles figés du lot 5d', () => {
  it.each(['collision', 'pose-v2', 'character-parts'])('%s.oracle.js : en-tête de la référence figée (hash de la base)', (f) => {
    const lines = read(`tests/unit/helpers/oracle/${f}.oracle.js`).split('\n');
    expect(lines[0]).toContain('RÉFÉRENCE FIGÉE, NE JAMAIS MODIFIER');
    expect(lines[0]).toContain(BASE);
  });
  it.each(NON_REECRITS)('%s.oracle.js identique à js/core/%s.js (source pas encore réécrite)', (f) => {
    const body = read(`tests/unit/helpers/oracle/${f}.oracle.js`).split('\n').slice(2).join('\n');
    expect(body).toBe(read(`js/core/${f}.js`));
  });
});
