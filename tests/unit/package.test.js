import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const EXACT = /^\d+\.\d+\.\d+$/;

describe('package.json', () => {
  it('épingle des versions exactes', () => {
    for (const [name, v] of Object.entries(pkg.devDependencies)) {
      expect(v, name).toMatch(EXACT);
    }
  });

  it('n\'a aucune dépendance d\'exécution', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });

  it('expose les scripts attendus', () => {
    for (const s of ['lint', 'test', 'test:e2e', 'build', 'lighthouse']) {
      expect(pkg.scripts[s], s).toBeTruthy();
    }
  });

  it('est un projet ESM privé', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.private).toBe(true);
  });
});
