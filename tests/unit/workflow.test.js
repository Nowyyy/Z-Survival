import { describe, it, expect } from 'vitest';
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

  it('lance lint, tests unitaires et e2e', () => {
    for (const c of ['npm run lint', 'npm test', 'npm run test:e2e']) expect(wf).toContain(c);
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
