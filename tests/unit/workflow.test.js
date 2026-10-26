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

  it('ne déploie que depuis main et publie seulement _site', () => {
    expect(wf).toContain("github.ref == 'refs/heads/main'");
    expect(wf).toMatch(/path: _site/);
  });

  it('lance lint, tests unitaires et e2e', () => {
    for (const c of ['npm run lint', 'npm test', 'npm run test:e2e']) expect(wf).toContain(c);
  });

  it('publie le site complet (racine, /dev, /lots) avec l\'historique des branches', () => {
    expect(wf).toContain('npm run assemble');
    expect(wf).toMatch(/fetch-depth: 0/);
  });

  it('relance le déploiement depuis main quand une branche de lot est poussée', () => {
    expect(wf).toContain("branches: [main, 'lot-*']");
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toContain('gh workflow run pages.yml');
  });

  it('ne donne le droit actions: write qu\'au seul job de relance', () => {
    expect(wf.match(/actions: write/g)).toHaveLength(1);
    const refresh = wf.slice(wf.indexOf('  refresh:'), wf.indexOf('  deploy:'));
    expect(refresh).toContain('actions: write');
  });

  it('n\'installe aucun navigateur : Playwright pilote le Chrome du runner', () => {
    expect(wf).not.toContain('playwright install');
    expect(readFileSync('playwright.config.js', 'utf8')).toContain("process.env.CI ? 'chrome'");
  });
});
