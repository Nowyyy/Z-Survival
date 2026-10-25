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
});
