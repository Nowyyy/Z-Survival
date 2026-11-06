// Lot 5h-C : redirection /recette/ → /Recette/ (404.html de l'assembleur, scripts/site/casse.mjs), garde-fou de casse, serveur local sensible à la casse.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterAll, describe, expect, it } from 'vitest';
import { AssembleError, NOT_FOUND_SCRIPT, assembleSite, listPaths, notFoundPage } from '../../scripts/assemble.mjs';
import { cheminsEnCollision, corrigerCasse } from '../../scripts/site/casse.mjs';
import { exactCase, notFoundBody, startServer } from '../../scripts/site/serve.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'zs-test-casse-'));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

describe('corrigerCasse (fonction pure, recopiée dans 404.html)', () => {
  it.each([
    ['/Z-Survival/recette/', '/Z-Survival/Recette/'],
    ['/Z-Survival/recette/jeu.html', '/Z-Survival/Recette/jeu.html'],
    ['/recette/jeu.html', '/Recette/jeu.html'],
    ['/recette', '/Recette'],
    ['/RECETTE/', '/Recette/'],
    ['/ReCeTtE/data/x.json', '/Recette/data/x.json'],
    ['/a/b/recette/c', '/a/b/Recette/c'],
    ['/Recette/recette/', '/Recette/Recette/'],
    ['/recette/recette/', '/Recette/recette/'],
  ])('%s → %s', (chemin, attendu) => {
    expect(corrigerCasse(chemin)).toBe(attendu);
  });
  it.each([
    '/Recette/', '/Z-Survival/Recette/inconnu', '/Z-Survival/Recette/jeu.html', '/', '', '/Z-Survival/', '/recettes/', '/recette.html', '/ma-recette/',
    '/%72ecette/', '/dev/jeu.html', '/v0.4/', '/Z-Survival/Recette',
  ])('%j : inchangé (aucune redirection)', (chemin) => {
    expect(corrigerCasse(chemin)).toBeNull();
  });
  it('entrées hostiles : jamais d\'exception, null', () => {
    for (const x of [null, undefined, 42, {}, [], 'x'.repeat(5000), `/${'recette/'.repeat(1000)}`]) expect(corrigerCasse(x)).toBeNull();
    expect(corrigerCasse('/<script>/recette/"onload=x')).toBe('/<script>/Recette/"onload=x');
  });
  it('aucune boucle : en réappliquant la correction, on atteint toujours un chemin inchangé (au plus une correction par segment fautif)', () => {
    for (const start of ['/recette/', '/RECETTE/recette/Recette/rEcEtTe/', '/a/recette']) {
      let chemin = start;
      let n = 0;
      for (let next = corrigerCasse(chemin); next !== null; next = corrigerCasse(chemin)) {
        chemin = next;
        n += 1;
        expect(n).toBeLessThanOrEqual(4);
      }
      expect(chemin.toLowerCase()).toBe(start.toLowerCase());
    }
  });
});

describe('404.html', () => {
  const html = notFoundPage();
  const run = (pathname, search = '', hash = '') => {
    const calls = [];
    vm.runInNewContext(NOT_FOUND_SCRIPT, { location: { pathname, search, hash, replace: (u) => calls.push(u) } });
    return calls;
  };
  it('page autonome : lang fr, noindex, « Page introuvable. » (18 px), <noscript>, style et script en ligne, aucune ressource ni lien', () => {
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<p>Page introuvable.</p>');
    expect(html).toMatch(/<noscript><p>Sans JavaScript, une adresse écrite \/recette\/ en minuscules n'est pas corrigée : écris \/Recette\/ avec un R majuscule\.<\/p><\/noscript>/);
    expect(html).toContain('font:400 1.125rem/1.5 system-ui');
    expect(html).not.toMatch(/<a\b|\ssrc=|<link rel="stylesheet"|<img|url\(|http-equiv|https?:/);
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual(['data:,']);
    expect(html).toContain(`<script>${NOT_FOUND_SCRIPT}</script>`);
    expect(NOT_FOUND_SCRIPT).toContain(corrigerCasse.toString());
  });
  it('script : /recette/… → location.replace(/Recette/… + requête + fragment) ; sinon aucune redirection', () => {
    expect(run('/Z-Survival/recette/')).toEqual(['/Z-Survival/Recette/']);
    expect(run('/Z-Survival/recette/jeu.html', '?x=1', '#b')).toEqual(['/Z-Survival/Recette/jeu.html?x=1#b']);
    expect(run('/Z-Survival/RECETTE', '?a=1&b=2')).toEqual(['/Z-Survival/Recette?a=1&b=2']);
    for (const p of ['/Z-Survival/Recette/inconnu', '/Z-Survival/', '/Z-Survival/jeu.html', '/Z-Survival/dev/absent']) expect(run(p, '?a=1', '#b'), p).toEqual([]);
  });
  it('assembleur : 404.html à la racine (icône en ligne), aucun dossier « recette/ » ; chemins qui ne diffèrent que par la casse refusés', () => {
    const main = join(ROOT, 'main');
    mkdirSync(main, { recursive: true });
    writeFileSync(join(main, 'index.html'), '<!doctype html><title>a</title>');
    writeFileSync(join(main, 'jeu.html'), '<!doctype html><title>j</title>');
    const out = join(ROOT, 'out');
    assembleSite({ mainDir: main, versions, out, main: { sha: 'a'.repeat(40) }, genere: '2026-11-06T12:00:00Z' });
    expect(readFileSync(join(out, '404.html'), 'utf8')).toBe(notFoundPage());
    const paths = listPaths(out);
    expect(paths.filter((p) => p.split('/').some((s) => s.toLowerCase() === 'recette' && s !== 'Recette'))).toEqual([]);
    expect(cheminsEnCollision(paths)).toEqual([]);
    writeFileSync(join(main, 'JEU.html'), 'x');
    expect(() => assembleSite({ mainDir: main, versions, out: join(ROOT, 'out2'), genere: '2026-11-06T12:00:00Z' })).toThrow(AssembleError);
    expect(() => assembleSite({ mainDir: main, versions, out: join(ROOT, 'out2'), genere: '2026-11-06T12:00:00Z' })).toThrow(/Chemins qui ne diffèrent que par la casse : Recette\/JEU\.html \/ Recette\/jeu\.html/);
  });
  it('garde-fou : aucune paire de chemins du dépôt (donc des builds publiés) ne diffère que par la casse ; aucun « recette » autre que « Recette »', () => {
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(cheminsEnCollision(files)).toEqual([]);
    expect(files.filter((p) => p.split('/').some((s) => s.toLowerCase() === 'recette'))).toEqual([]);
    expect(cheminsEnCollision(['a/B/c', 'a/b/d', 'x', 'X/y', 'ok/1', 'ok/2'])).toEqual([['a/B', 'a/b'], ['X', 'x']]);
    expect(cheminsEnCollision(null)).toEqual([]);
  });
});

describe('serveur local : sensible à la casse comme GitHub Pages, 404.html pour une adresse inconnue', () => {
  const root = join(ROOT, 'served');
  mkdirSync(join(root, 'Recette'), { recursive: true });
  writeFileSync(join(root, 'Recette/index.html'), '<p>accueil</p>');
  writeFileSync(join(root, 'Recette/jeu.html'), '<p>jeu</p>');
  writeFileSync(join(root, '404.html'), '<p>introuvable</p>');
  const multi = join(ROOT, 'multi');
  mkdirSync(join(multi, 'full/Recette'), { recursive: true });
  writeFileSync(join(multi, 'full/Recette/index.html'), 'a');
  writeFileSync(join(multi, 'full/404.html'), '<p>404 de full</p>');
  mkdirSync(join(multi, 'nu'), { recursive: true });

  it('exactCase compare chaque segment au contenu réel du dossier', async () => {
    expect(await exactCase(root, '/Recette/jeu.html')).toBe(true);
    expect(await exactCase(root, '/recette/jeu.html')).toBe(false);
    expect(await exactCase(root, '/Recette/JEU.html')).toBe(false);
    expect(await exactCase(root, '/')).toBe(true);
    expect(String(await notFoundBody(multi, '/full/x'))).toBe('<p>404 de full</p>');
    expect(await notFoundBody(multi, '/nu/x')).toBeNull();
  });
  it('/Recette/ : 200 ; /recette/, /Recette/JEU.html, /Recette/inconnu : 404 avec le contenu de 404.html ; sans 404.html : « Not found »', async () => {
    const server = await startServer({ root, port: 0, base: '/Z-Survival/', quiet: true });
    const other = await startServer({ root: multi, port: 0, base: '/', quiet: true });
    const url = (s, p) => `http://127.0.0.1:${s.address().port}${p}`;
    try {
      expect((await fetch(url(server, '/Z-Survival/Recette/'))).status).toBe(200);
      expect(await (await fetch(url(server, '/Z-Survival/Recette/jeu.html'))).text()).toBe('<p>jeu</p>');
      for (const p of ['/Z-Survival/recette/', '/Z-Survival/recette', '/Z-Survival/RECETTE/jeu.html', '/Z-Survival/Recette/JEU.html', '/Z-Survival/Recette/inconnu', '/Z-Survival/absent/']) {
        const r = await fetch(url(server, p), { redirect: 'manual' });
        expect(r.status, p).toBe(404);
        expect(r.headers.get('content-type'), p).toContain('text/html');
        expect(await r.text(), p).toBe('<p>introuvable</p>');
      }
      expect((await fetch(url(server, '/Z-Survival/Recette'), { redirect: 'manual' })).status).toBe(301);
      const head = await fetch(url(server, '/Z-Survival/recette/'), { method: 'HEAD' });
      expect(head.status).toBe(404);
      expect(await (await fetch(url(other, '/full/recette/'))).text()).toBe('<p>404 de full</p>');
      const bare = await fetch(url(other, '/nu/x'));
      expect([bare.status, await bare.text()]).toEqual([404, 'Not found']);
    } finally {
      server.close();
      other.close();
    }
  });
});
