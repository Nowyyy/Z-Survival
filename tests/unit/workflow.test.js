import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const wf = readFileSync('.github/workflows/pages.yml', 'utf8');

describe('workflow GitHub Pages', () => {
  it('épingle chaque action par commit complet', () => {
    const uses = [...wf.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
  });

  it('n\'utilise ni pull_request_target ni secrets', () => {
    expect(wf).not.toContain('pull_request_target');
    expect(wf).not.toMatch(/secrets\./);
  });

  it('déclare des droits minimaux (lecture par défaut)', () => {
    expect(wf).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  // Lot 4c : main (racine) ou dev (next/) ; avant : main seulement.
  it('ne déploie que depuis main ou dev et publie seulement _site', () => {
    expect(wf).toContain("if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev'");
    expect(wf).toMatch(/path: _site/);
  });

  // Lot 4g : le job e2e (4 tranches Playwright sur dev) est retiré, doublon du palier standard de tests.yml ; avant : lint, Vitest et e2e.
  it('lance lint et tests unitaires (job quick) ; plus aucun test e2e (palier standard de tests.yml)', () => {
    for (const c of ['npm run lint', 'npm test']) expect(wf).toContain(c);
    expect(wf).not.toContain('test:e2e');
    expect(wf).not.toMatch(/^ {2}e2e:$/m);
  });

  // Lot 4c : le site (racine, next/, v0.N/, lots/) est assemblé par scripts/assemble.mjs de main ; avant : npm run assemble et tout l'historique (fetch-depth: 0).
  it('publie le site assemblé (racine, next/, archives) par l\'assembleur de main', () => {
    expect(wf).toContain('node main/scripts/assemble.mjs');
    expect(wf).not.toMatch(/fetch-depth: 0/);
  });

  // Lot 4c : plus aucun aperçu par lot ; avant : branches [main, 'lot-*'] et relance par gh workflow run (job refresh).
  it('ne se déclenche plus sur les branches de lot et ne relance plus rien', () => {
    expect(wf).toContain('branches: [main, dev]');
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).not.toContain("'lot-*'");
    expect(wf).not.toContain('gh workflow run');
  });

  // Lot 4c : le job refresh (seul à avoir actions: write) est retiré ; avant : actions: write sur lui seul.
  it('aucun job n\'a le droit actions: write', () => {
    expect(wf).not.toContain('actions: write');
  });

  it('n\'installe aucun navigateur : Playwright pilote le Chrome du runner', () => {
    expect(wf).not.toContain('playwright install');
    expect(readFileSync('playwright.config.js', 'utf8')).toContain("process.env.CI ? 'chrome'");
  });
});

// Lot 4g : pages.yml = celui de origin/dev au début du lot (ccde5f3, fusion du lot 4f) sans le job e2e (ses deux lignes de commentaire, la tâche et la ligne vide
// qui la suit). Déclencheurs, permissions, concurrence, quick et deploy (build, assemblage, téléversement, déploiement) sont donc inchangés, octet pour octet.
// Sauté si le commit de référence est absent (clone superficiel) ; la CI de tests.yml récupère tout l'historique (fetch-depth: 0).
const BASE_4G = 'ccde5f39b77c7085c9d58351af233cc5d9df487c';
const before = spawnSync('git', ['show', `${BASE_4G}:.github/workflows/pages.yml`], { encoding: 'utf8' });
describe.skipIf(before.status !== 0)('pages.yml : seul le job e2e est retiré (comparaison à origin/dev, ccde5f3)', () => {
  const old = before.stdout;
  const start = old.indexOf('  # Tests de bout en bout (rendu logiciel)');
  const end = old.indexOf('  # Déploiement du site complet');
  const part = (text, from, to) => text.slice(text.indexOf(from), to ? text.indexOf(to) : undefined);

  it('le job e2e existait à la base, et seulement lui disparaît', () => {
    expect(start).toBeGreaterThan(0);
    expect(old.slice(start, end)).toMatch(/^ {2}e2e:$/m);
    expect(wf).toBe(old.slice(0, start) + old.slice(end));
  });

  it('déclencheurs, permissions et concurrence identiques', () => {
    for (const [from, to] of [['\non:', '\npermissions:'], ['\npermissions:', '\nconcurrency:'], ['\nconcurrency:', '\njobs:']]) expect(part(wf, from, to), from).toBe(part(old, from, to));
  });

  it('quick et deploy (build, assemblage, téléversement, déploiement, needs: quick) identiques', () => {
    expect(part(wf, '\n  quick:', '\n  # Déploiement')).toBe(part(old, '\n  quick:', '\n  # Tests de bout en bout'));
    expect(part(wf, '\n  deploy:')).toBe(part(old, '\n  deploy:'));
    expect(part(wf, '\n  deploy:')).toContain('    needs: quick\n');
  });
});
