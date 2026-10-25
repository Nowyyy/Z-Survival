import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const SECRET = /(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{32,})/;

describe('hygiène du dépôt', () => {
  it('ne suit ni node_modules, ni _site, ni dist, ni .env', () => {
    const bad = tracked.filter((f) => /(^|\/)(node_modules|_site|dist)\//.test(f) || /(^|\/)\.env(\.|$)/.test(f));
    expect(bad).toEqual([]);
  });

  it('ne contient aucun secret apparent', () => {
    const hits = tracked.filter((f) => !/package-lock\.json$/.test(f) && SECRET.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('n\'a aucun fichier de plus de 5 Mo', () => {
    const big = tracked.filter((f) => statSync(f).size > 5 * 1024 * 1024);
    expect(big).toEqual([]);
  });

  it('CLAUDE.md fait moins de 9 000 caractères', () => {
    expect(readFileSync('CLAUDE.md', 'utf8').length).toBeLessThan(9000);
  });

  it('.gitignore couvre les dossiers générés', () => {
    const gi = readFileSync('.gitignore', 'utf8');
    for (const e of ['node_modules', 'dist', '_site', 'coverage', '.env']) expect(gi).toContain(e);
  });
});
