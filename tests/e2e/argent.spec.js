import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { defaultSave, encodeSave } from '../../js/core/save.js';
import { waitReady } from './helpers.js';

// Lot 4-C : argent et sauvegarde dans le jeu. 667×375, step() et les hooks (aucune durée réelle attendue). Les adresses de gain n'ont AUCUN paramètre d'essai
// (wave, lvl, map, planks, empty, nospawn, endless, floor, money) : sinon la sauvegarde est en lecture seule.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const KEY = params.save.storageKey;
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const LOCAL = '/jeu.html?test=1&store=local&seed=1';
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const storedJson = async (page) => JSON.parse(await stored(page));
const seedStorage = (value) => `if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('${KEY}', ${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))}); sessionStorage.setItem('__seeded', '1'); }`;
// Espion sur les écritures du stockage, posé avant tout script de la page.
const SPY = `
  window.__writes = [];
  const set = Storage.prototype.setItem; const remove = Storage.prototype.removeItem; const clear = Storage.prototype.clear;
  Storage.prototype.setItem = function (k, v) { window.__writes.push(['set', k, String(v).length]); return set.call(this, k, v); };
  Storage.prototype.removeItem = function (k) { window.__writes.push(['remove', k]); return remove.call(this, k); };
  Storage.prototype.clear = function () { window.__writes.push(['clear']); return clear.call(this); };`;
const writes = (page) => page.evaluate(() => window.__writes.filter((w) => w[1] === 'zs.save.v1' || w[0] === 'clear'));

// Ouvre le jeu ; par défaut la boucle de rendu est arrêtée (requestAnimationFrame neutralisé) : le temps de jeu n'avance que par step().
async function open(page, url = LOCAL, { live = false, size = SIZE } = {}) {
  await page.setViewportSize(size);
  await page.goto(url);
  await waitReady(page);
  if (live) return;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => { window.__zs.step(0.05); });
}

// Tue un zombie du type donné avec des balles d'essai (le laser vise, les dégâts arrivent à l'impact) ; renvoie le gain observé.
async function shoot(page, type) {
  return page.evaluate(async (t) => {
    const zs = window.__zs;
    const before = zs.getState();
    const p = before.player;
    zs.setPlayer(p.x, p.y);
    zs.spawnEnemy(p.x + 150, p.y, { type: t, gait: 'lent' });
    const kills = before.kills;
    for (let i = 0; i < 200 && zs.getState().kills === kills; i += 1) {
      zs.fire(0);
      zs.fire(0);
      zs.step(0.25);
    }
    return zs.getState().kills - kills;
  }, type);
}
const balance = async (page) => (await state(page)).save.balance;

test.describe('gains', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  for (const [type, amount] of [['marcheur', 10]]) {
    test(`un ${type} tué par une balle rapporte ${amount} (montant fixe)`, async ({ page }) => {
      await open(page);
      expect(await shoot(page, type)).toBe(1);
      const s = await state(page);
      expect(s.save.pending).toBe(amount);
      expect(s.save.balance).toBe(amount);
      expect(s.economy.byKind.kill).toBe(amount);
      expect(s.economy.killsRun).toBe(1);
    });
  }

  test('le montant est fixe : 10 par zombie à la manche 11 comme à la manche 80', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.startWave(11));
    await step(page, 0.1);
    expect(await shoot(page, 'grand')).toBe(1);
    expect((await state(page)).economy.byKind.kill).toBe(10);
    await page.evaluate(() => window.__zs.startWave(80));
    await step(page, 0.1);
    const before = (await state(page)).economy.byKind.kill;
    expect(await shoot(page, 'petit')).toBe(1);
    expect((await state(page)).economy.byKind.kill - before).toBe(10);
  });

  test('réparer une fenêtre : chaque planche posée rapporte 1', async ({ page }) => {
    await open(page);
    const id = await page.evaluate(() => {
      const zs = window.__zs;
      const w = zs.getState().windows.find((q) => q.floor === 'rdc' && q.active) ?? zs.getState().windows[0];
      zs.setPlanks(w.id, 1);
      zs.setPlayer(w.repairSpot.x, w.repairSpot.y);
      return w.id;
    });
    await step(page, 6);
    const s = await state(page);
    const planks = s.windows.find((q) => q.id === id).planks;
    expect(planks).toBeGreaterThanOrEqual(3);
    expect(s.economy.byKind.repair).toBe(planks - 1);
    expect(s.save.balance).toBe(planks - 1);
    expect(s.economy.killsRun).toBe(0);
  });

  test('killAll() et skipWave() ne rapportent aucun kill ; la fin de manche rapporte son bonus (12 à la manche 1)', async ({ page }) => {
    await open(page);
    await step(page, 3.2);
    await page.evaluate(() => { const p = window.__zs.getState().player; window.__zs.spawnEnemy(p.x + 400, p.y); window.__zs.spawnEnemy(p.x + 420, p.y); });
    expect(await page.evaluate(() => window.__zs.killAll())).toBeGreaterThanOrEqual(2);
    let s = await state(page);
    expect(s.economy.byKind.kill).toBe(0);
    expect(s.economy.killsRun).toBe(0);
    expect(s.kills).toBe(0);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.2);
    s = await state(page);
    expect(s.economy.byKind).toMatchObject({ kill: 0, wave: 12 });
    expect(s.save.balance).toBe(12);
    expect((await storedJson(page)).money).toBe(12);
  });

  test('un seul bonus par manche : une fin de manche ne rapporte pas deux fois', async ({ page }) => {
    await open(page);
    await step(page, 3.2);
    expect(await page.evaluate(() => [window.__zs.skipWave(), window.__zs.skipWave()].length)).toBe(2);
    await step(page, 0.5);
    expect((await state(page)).economy.byKind.wave).toBe(12);
  });

  test('la manche 5 (renforcée) rapporte 30', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.startWave(5));
    await step(page, 3.2);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.2);
    expect((await state(page)).economy.byKind.wave).toBe(30);
  });

  test('giveMoney(n) ajoute au journal (type test) et flushSave() écrit tout de suite', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.giveMoney(250));
    expect((await state(page)).economy.byKind.test).toBe(250);
    const r = await page.evaluate(() => window.__zs.flushSave());
    expect(r.ok).toBe(true);
    expect((await storedJson(page)).money).toBe(250);
    expect((await state(page)).save).toMatchObject({ status: 'saved', pending: 0, balance: 250, kind: 'local', readOnly: false, key: KEY });
  });
});

test.describe('gains (suite)', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('aucun gain pendant l\'animation de transition de porte ni en double (manche 10 : une seule fois 45)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.startWave(10));
    await step(page, 3.2);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.2);
    expect((await state(page)).economy.byKind.wave).toBe(45);
    for (let i = 0; i < 12; i += 1) await step(page, 1);
    const s = await state(page);
    expect(s.economy.byKind).toMatchObject({ kill: 0, wave: 45, world: 0 });
    expect(s.zones.doors?.length ?? 1).toBeGreaterThan(0);
  });

  test('la fin du monde rapporte 500 une seule fois, et worldsCompleted passe à 1', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.startWave(40));
    await step(page, 3.2);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.3);
    await expect(page.locator('#end-panel')).toBeVisible();
    let s = await state(page);
    expect(s.economy.byKind).toMatchObject({ wave: 135, world: 500 });
    await step(page, 5);
    s = await state(page);
    expect(s.economy.byKind.world).toBe(500);
    const saved = await storedJson(page);
    expect(saved.money).toBe(635);
    expect(saved.records).toMatchObject({ worldsCompleted: 1, bestWave: 40, runs: 1 });
    await expect(page.locator('#end-bonus')).toHaveText('Bonus de fin de monde : 500');
  });
});

test.describe('conservation à la mort', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  async function dieAfterKill(page, wave = 3) {
    await page.evaluate((w) => window.__zs.startWave(w), wave);
    await step(page, 3.2);
    expect(await shoot(page, 'marcheur')).toBe(1);
    await page.evaluate(() => { window.__zs.killAll(); window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    await expect(page.locator('#end-panel')).toBeVisible();
  }

  test('la mort conserve tout : E2-7 affiche « Argent gagné » et « Solde » ; « Rejouer » repart avec le même solde ; la page rechargée aussi', async ({ page }) => {
    await open(page);
    await dieAfterKill(page);
    await expect(page.locator('#end-earned')).toHaveText('Argent gagné : 10');
    await expect(page.locator('#end-balance')).toHaveText('Solde : 10');
    await expect(page.locator('#end-best')).toHaveText('Meilleure manche : 3');
    expect((await storedJson(page)).money).toBe(10);
    await page.locator('#btn-replay').click();
    await step(page, 0.1);
    expect((await state(page)).save.balance).toBe(10);
    expect((await state(page)).economy.earnedRun).toBe(0);
    await page.reload();
    await waitReady(page);
    const s = await state(page);
    expect(s.save).toMatchObject({ balance: 10, status: 'saved' });
    expect(s.save.saved.records).toMatchObject({ bestWave: 3, bestKills: 1, runs: 1 });
  });

  test('localStorage ne contient que zs.save.v1, JSON conforme au schéma, moins de 1 Ko ; runs, bestWave et bestKills justes', async ({ page }) => {
    await open(page);
    await dieAfterKill(page, 4);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toEqual([KEY]);
    const raw = await stored(page);
    expect(raw.length).toBeLessThan(1024);
    const saved = JSON.parse(raw);
    expect(Object.keys(saved).sort()).toEqual(['earned', 'money', 'records', 'rev', 'savedAt', 'stats', 'v']);
    expect(saved.v).toBe(1);
    expect(saved.records).toEqual({ bestWave: 4, bestKills: 1, runs: 1, worldsCompleted: 0 });
    expect(saved.savedAt).toBeGreaterThan(1_600_000_000_000);
    expect(await page.evaluate(() => [sessionStorage.length, document.cookie])).toEqual([0, '']);
  });

  test('« Nouveau record » seulement quand la manche dépasse l\'ancien record', async ({ page }) => {
    await page.addInitScript(seedStorage({ ...defaultSave(), records: { bestWave: 4, bestKills: 0, runs: 1, worldsCompleted: 0 } }));
    await open(page);
    await dieAfterKill(page, 4);
    await expect(page.locator('#end-record')).toBeHidden();
    await page.locator('#btn-replay').click();
    await dieAfterKill(page, 6);
    await expect(page.locator('#end-record')).toHaveText('Nouveau record');
    await expect(page.locator('#end-best')).toHaveText('Meilleure manche : 6');
  });
});

test.describe('écriture', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('rien n\'est écrit tant qu\'aucun gain ni aucune manche n\'a eu lieu (pause, flushSave comprises)', async ({ page }) => {
    await page.addInitScript(SPY);
    await open(page);
    await step(page, 1);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Reprendre' }).click();
    expect((await page.evaluate(() => window.__zs.flushSave())).skipped).toBe(true);
    expect(await writes(page)).toEqual([]);
    expect(await stored(page)).toBeNull();
  });

  test('10 kills en 1 s produisent au plus 2 écritures', async ({ page }) => {
    await page.addInitScript(SPY);
    await open(page);
    await page.evaluate(() => {
      const z = window.__zs;
      for (let i = 0; i < 10; i += 1) {
        const p = z.getState().player;
        z.spawnEnemy(p.x + 100, p.y, { type: 'marcheur', gait: 'lent' });
        z.fire(0);
        z.fire(0);
        z.step(0.1);
      }
    });
    await step(page, 3);
    const s = await state(page);
    expect(s.economy.killsRun).toBe(10);
    expect((await writes(page)).length).toBeLessThanOrEqual(2);
    expect((await storedJson(page)).money).toBe(100);
    expect(s.save.pending).toBe(0);
  });

  test('écriture immédiate à la fin de manche', async ({ page }) => {
    await page.addInitScript(SPY);
    await open(page);
    await step(page, 3.2);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.2);
    expect(await writes(page)).toHaveLength(1);
    expect((await storedJson(page)).money).toBe(12);
  });

  test('écriture immédiate à l\'ouverture de la pause', async ({ page }) => {
    await page.addInitScript(SPY);
    await open(page);
    await page.evaluate(() => window.__zs.giveMoney(30));
    expect(await writes(page)).toEqual([]);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-panel')).toBeVisible();
    expect(await writes(page)).toHaveLength(1);
    expect((await storedJson(page)).money).toBe(30);
  });

  test('écriture immédiate à visibilitychange (caché) et à pagehide', async ({ page }) => {
    await page.addInitScript(SPY);
    await open(page);
    await page.evaluate(() => window.__zs.giveMoney(10));
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect((await storedJson(page)).money).toBe(10);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); window.__zs.giveMoney(5); });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect((await storedJson(page)).money).toBe(15);
  });

  test('écriture immédiate à la mort', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.giveMoney(40); window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    await expect(page.locator('#end-panel')).toBeVisible();
    expect((await storedJson(page)).money).toBe(40);
  });

  test('regroupement : le commit part après 2 s de temps de jeu, pas avant', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.giveMoney(8));
    await step(page, 1.5);
    expect(await stored(page)).toBeNull();
    expect((await state(page)).save.status).toBe('pending');
    await step(page, 0.6);
    expect((await storedJson(page)).money).toBe(8);
    expect((await state(page)).save.status).toBe('saved');
  });
});

test.describe('multi-onglets', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('deux pages additionnent leurs gains ; la page affichée suit le signal storage', async ({ page, context }) => {
    await open(page);
    const other = await context.newPage();
    await open(other);
    expect(await shoot(page, 'marcheur')).toBe(1);
    expect(await shoot(other, 'marcheur')).toBe(1);
    expect((await page.evaluate(() => window.__zs.flushSave())).ok).toBe(true);
    expect((await other.evaluate(() => window.__zs.flushSave())).ok).toBe(true);
    expect((await storedJson(page)).money).toBe(20);
    await expect.poll(() => balance(page)).toBe(20);
    expect(await balance(other)).toBe(20);
  });
});

test.describe('échecs de stockage', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('QuotaExceededError : le jeu continue, état « failed », ligne de pause, puis le bon total ni perdu ni doublé', async ({ page }) => {
    await page.addInitScript(`
      window.__fail = true;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === '${KEY}' && window.__fail) throw new DOMException('quota', 'QuotaExceededError'); return set.call(this, k, v); };`);
    await open(page);
    expect(await shoot(page, 'marcheur')).toBe(1);
    const r = await page.evaluate(() => window.__zs.flushSave());
    expect(r).toMatchObject({ ok: false, error: 'QuotaExceededError' });
    let s = await state(page);
    expect(s.save).toMatchObject({ status: 'failed', pending: 10, balance: 10 });
    expect(s.save.lastCommit).toMatchObject({ ok: false, error: 'QuotaExceededError' });
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-save')).toHaveText('Sauvegarde : échec, nouvelle tentative');
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await page.evaluate(() => { window.__fail = false; });
    await step(page, 2.5);
    s = await state(page);
    expect(s.save).toMatchObject({ pending: 0, balance: 10 });
    expect((await storedJson(page)).money).toBe(10);
    await step(page, 5);
    expect((await storedJson(page)).money).toBe(10);
    expect((await state(page)).save.status).toBe('saved');
  });

  test('localStorage inaccessible : « unavailable », le jeu continue, console propre, solde en mémoire', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('refusé', 'SecurityError'); }, configurable: true });
    });
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    await open(page);
    expect(await shoot(page, 'petit')).toBe(1);
    await page.evaluate(() => window.__zs.flushSave());
    const s = await state(page);
    expect(s.save).toMatchObject({ status: 'unavailable', balance: 10, locked: true });
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-save')).toHaveText('Sauvegarde indisponible : le solde reste en mémoire');
    expect(problems).toEqual([]);
  });

  for (const [label, raw] of [['illisible ({bad)', '{bad'], ['version future', '{"v":99,"money":5}']]) {
    test(`sauvegarde ${label} : « locked », aucune écriture pendant toute une partie, pause et E2-7 le disent, lien vers la page`, async ({ page }) => {
      await page.addInitScript(`${SPY}\n${seedStorage(raw)}`);
      await open(page);
      await page.evaluate(() => window.__zs.startWave(2));
      await step(page, 3.2);
      expect(await shoot(page, 'marcheur')).toBe(1);
      await page.evaluate(() => window.__zs.skipWave());
      await step(page, 0.3);
      await page.getByRole('button', { name: 'Pause' }).click();
      await expect(page.locator('#pause-save')).toHaveText('Sauvegarde illisible : rien n\'est enregistré (voir la page Sauvegarde)');
      // La ligne la plus longue de la pause tient aussi à 667×375, sans défilement.
      expect(await page.evaluate(() => { const p = document.querySelector('#pause-panel .panel'); return p.scrollHeight > p.clientHeight || p.getBoundingClientRect().bottom > innerHeight; })).toBe(false);
      await page.getByRole('button', { name: 'Reprendre' }).click();
      await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); });
      await step(page, 0.3);
      await expect(page.locator('#end-save')).toHaveText('Sauvegarde illisible : rien n\'est enregistré (voir la page Sauvegarde)');
      await expect(page.locator('#end-save-link')).toHaveAttribute('href', 'sauvegarde.html');
      expect((await state(page)).save).toMatchObject({ status: 'locked', locked: true });
      expect(await writes(page)).toHaveLength(1); // le semis de l'init
      expect(await stored(page)).toBe(raw);
    });
  }
});

test.describe('mode essai', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');
  const REAL = { ...defaultSave(), rev: 2, savedAt: 1_700_000_000_000, money: 300, earned: 300, stats: { ...defaultSave().stats, degats: 2 } };

  test('?wave=5 : les gains s\'affichent (solde de session) mais localStorage est inchangé ; pause et E2-7 disent « Mode essai »', async ({ page }) => {
    await page.addInitScript(`${SPY}\n${seedStorage(REAL)}`);
    await open(page, `${LOCAL}&wave=5`);
    const before = await stored(page);
    expect((await state(page)).save).toMatchObject({ status: 'readonly', readOnly: true, balance: 300 });
    expect(await shoot(page, 'marcheur')).toBe(1);
    await page.evaluate(() => window.__zs.flushSave());
    expect((await state(page)).save.balance).toBe(310);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-save')).toHaveText('Mode essai : rien n\'est enregistré');
    await expect(page.locator('#pause-balance')).toHaveText('Solde : 310');
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    await expect(page.locator('#end-save')).toHaveText('Mode essai : cet argent n\'est pas enregistré');
    await expect(page.locator('#end-record')).toBeHidden();
    expect(await stored(page)).toBe(before);
    expect(await writes(page)).toHaveLength(1);
  });

  for (const [name, value] of [['wave', '3'], ['lvl', 'degats:3'], ['money', '500']]) {
    test(`?${name}=${value} déclenche le mode essai, zéro écriture`, async ({ page }) => {
      await page.addInitScript(`${SPY}\n${seedStorage(REAL)}`);
      await open(page, `${LOCAL}&${name}=${value}`);
      await page.evaluate(() => { window.__zs.giveMoney(25); window.__zs.flushSave(); });
      const s = await state(page);
      expect(s.save.readOnly).toBe(true);
      expect(s.save.status).toBe('readonly');
      expect(s.save.reasons).toContain(name);
      expect(await writes(page)).toHaveLength(1);
    });
  }

  test('?tilt=60&vhs=0&labels=1&fps=1&zoom=1 ne déclenche pas le mode essai', async ({ page }) => {
    await open(page, `${LOCAL}&tilt=60&vhs=0&labels=1&fps=1&zoom=1`);
    const s = (await state(page)).save;
    expect(s).toMatchObject({ readOnly: false, kind: 'local', reasons: [] });
  });

  test('?money=500 fixe le solde à 500 sans rien écrire ; le vrai solde reste 300', async ({ page }) => {
    await page.addInitScript(seedStorage(REAL));
    await open(page, `${LOCAL}&money=500`);
    const before = await stored(page);
    expect((await state(page)).save.balance).toBe(500);
    await page.evaluate(() => { window.__zs.giveMoney(5); window.__zs.flushSave(); });
    expect((await state(page)).save.balance).toBe(505);
    expect(await stored(page)).toBe(before);
    expect(JSON.parse(before).money).toBe(300);
  });

  test('?lvl=degats:3 : source « url », dégâts × 1,45, sauvegarde inchangée', async ({ page }) => {
    await page.addInitScript(seedStorage(REAL));
    await open(page, `${LOCAL}&lvl=degats:3`);
    const before = await stored(page);
    const s = await state(page);
    expect(s.stats.source).toBe('url');
    expect(s.stats.values.damage).toBeCloseTo(25 * 1.45, 9);
    expect(await stored(page)).toBe(before);
  });
});

test.describe('niveaux depuis la sauvegarde', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('sans ?lvl= : source « save », et degats 2 donne des dégâts × 1,3', async ({ page }) => {
    await page.addInitScript(seedStorage({ ...defaultSave(), stats: { ...defaultSave().stats, degats: 2, chutes: 2 } }));
    await open(page);
    const s = await state(page);
    expect(s.stats.source).toBe('save');
    expect(s.stats.levels.degats).toBe(2);
    expect(s.stats.values.damage).toBeCloseTo(25 * 1.3, 9);
    expect(s.stats.values.maxFalls).toBe(3);
  });

  test('un code importé par sauvegarde.html est pris en compte après rechargement', async ({ page }) => {
    const code = encodeSave({ ...defaultSave(), money: 90, stats: { ...defaultSave().stats, degats: 2 } }, params);
    await page.goto('/sauvegarde.html');
    await page.locator('#import-code').fill(code);
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await page.locator('#import-ack').check();
    await page.getByRole('button', { name: 'Remplacer ma sauvegarde' }).click();
    await expect(page.locator('#live')).toHaveText('Sauvegarde importée.');
    await open(page);
    const s = await state(page);
    expect(s.stats.source).toBe('save');
    expect(s.stats.values.damage).toBeCloseTo(32.5, 9);
    expect(s.save.balance).toBe(90);
  });

  test('sans sauvegarde : source « default », zéros', async ({ page }) => {
    await open(page);
    const s = await state(page);
    expect(s.stats.source).toBe('default');
    expect(Object.values(s.stats.levels).every((v) => v === 0)).toBe(true);
  });
});

test.describe('par défaut (sans ?test=1)', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('la page lit zs.save.v1 et n\'écrit rien tant que rien n\'est gagné ; aucun cookie, sessionStorage vide, aucun IndexedDB, aucune requête externe', async ({ page, context, baseURL }) => {
    const external = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
    await page.addInitScript(`${SPY}
      window.__reads = 0;
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) { if (k === '${KEY}') window.__reads += 1; return get.call(this, k); };`);
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?seed=1');
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-panel')).toBeVisible();
    expect(await page.evaluate(() => window.__reads)).toBeGreaterThanOrEqual(1);
    expect(await writes(page)).toEqual([]);
    const stores = await page.evaluate(async () => [localStorage.length, sessionStorage.length, document.cookie, (await indexedDB.databases()).length]);
    expect(stores).toEqual([0, 0, '', 0]);
    expect(await context.cookies()).toEqual([]);
    expect(external).toEqual([]);
    await expect(page.locator('#pause-save')).toHaveText('Sauvegarde : enregistrée');
  });

  test('rien n\'est exposé sans ?test=1 (ni window.__zs, ni solde)', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?money=500');
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
    await expect(page.locator('#hud-money')).toHaveAttribute('aria-label', 'Argent : 500');
  });
});

test.describe('interface', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('puce d\'argent : montant court, aria-label avec le montant entier', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.giveMoney(12345); window.__zs.step(0.1); });
    await expect(page.locator('#hud-money-text')).toHaveText(`12,3${String.fromCharCode(0xa0)}k`);
    await expect(page.locator('#hud-money')).toHaveAttribute('aria-label', `Argent : 12${String.fromCharCode(0x202f)}345`);
    await expect(page.locator('#hud-money svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('haut de l\'écran : bloc d\'interface, argent à sa droite, « Vague 1 / 40 » avant le bouton Pause (icône) ; largeur du HUD indépendante du montant', async ({ page }) => {
    await open(page);
    await step(page, 0.2);
    await expect(page.locator('#hud-wave')).toHaveText('Vague 1 / 40');
    await expect(page.locator('#btn-pause')).toHaveAccessibleName('Pause');
    await expect(page.locator('#btn-pause')).toHaveText('');
    const rows = () => page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      return { hud: r('#hud'), money: r('#hud-money'), wave: r('#hud-wave'), pause: r('#btn-pause') };
    });
    const a = await rows();
    expect(a.money.left).toBeGreaterThanOrEqual(a.hud.right);
    expect(a.wave.left).toBeGreaterThan(a.money.right);
    expect(a.wave.right).toBeLessThanOrEqual(a.pause.left);
    expect(a.pause.width).toBeGreaterThanOrEqual(44);
    expect(a.pause.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => { window.__zs.giveMoney(9_999_999); window.__zs.step(0.1); });
    const b = await rows();
    expect(b.hud.width).toBe(a.hud.width);
  });

  test('blocs de taille fixe : #hud, #hud-money et #hud-wave gardent leur rectangle quand le montant, la phase de vague et les chutes changent', async ({ page }) => {
    await open(page);
    const size = () => page.evaluate(() => ['hud', 'hud-money', 'hud-wave'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width * 10), Math.round(r.height * 10)]; }));
    const first = await size();
    await page.evaluate(() => { window.__zs.giveMoney(9_999_999); window.__zs.setChutes(6); window.__zs.step(0.3); });
    expect(await size()).toEqual(first);
    await step(page, 3.5); // « Début dans N s » devient « N restants »
    expect(await size()).toEqual(first);
    await page.evaluate(() => window.__zs.startWave(40));
    await step(page, 0.3);
    expect(await size()).toEqual(first);
  });

  test('HUD ≤ 300 × 96 px à 667×375 dans le pire cas, sans chevauchement avec Pause et E2-10', async ({ page }) => {
    await open(page, `${LOCAL}&floor=1&wave=40`);
    const m = await page.evaluate(() => {
      const z = window.__zs;
      z.setChutes(3);
      z.setWaveParams({ total: { base: 10, linear: 0, quadratic: 0, cap: 10 } });
      z.giveMoney(9_999_999);
      z.step(0.1);
      const p = z.getState().player;
      for (let i = 0; i < 10; i += 1) z.spawnEnemy(p.x + 500 + i * 20, p.y, { type: 'marcheur' });
      z.step(3.5);
      z.giveMoney(9_999_999);
      z.step(0.3);
      const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
      return { vh: innerHeight, hud: rect('hud'), pause: rect('btn-pause'), text: document.getElementById('hud').innerText };
    });
    expect(m.text).toContain('Étage');
    expect(m.hud.width).toBeLessThanOrEqual(300);
    expect(m.hud.height).toBeLessThanOrEqual(96);
    expect(m.hud.right).toBeLessThanOrEqual(m.pause.left);
    expect(m.hud.bottom).toBeLessThan(m.vh * 0.5); // E2-10 est au tiers bas (84 % de la hauteur) : jamais sous le HUD
  });

  test('« +N » : un seul élément, agrégé, décoratif (aria-hidden), qui s\'efface ensuite', async ({ page }) => {
    await open(page);
    await shoot(page, 'marcheur');
    await shoot(page, 'petit');
    await step(page, 0.3);
    await expect(page.locator('[id="hud-gain"]')).toHaveCount(1);
    await expect(page.locator('#hud-gain')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#hud-gain')).toHaveText(/^\+\d+$/);
    expect((await state(page)).economy.gainText).toMatch(/^\+\d+$/);
    await step(page, 2);
    await expect(page.locator('#hud-gain')).toBeHidden();
  });

  test('« +N » sans animation sous prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await shoot(page, 'marcheur');
    await step(page, 0.3);
    await expect(page.locator('#hud-gain')).toBeVisible();
    await expect(page.locator('#hud-gain')).toHaveCSS('animation-name', 'none');
    expect(parseFloat(await page.locator('#hud-gain').evaluate((n) => getComputedStyle(n).transitionDuration))).toBeLessThan(0.001);
    await step(page, 2);
    await expect(page.locator('#hud-gain')).toBeHidden();
  });

  test('pause : « Solde » et état de la sauvegarde, le panneau tient à 667×375, aucune cible sous 44 px', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.giveMoney(1234));
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-balance')).toHaveText(`Solde : 1${String.fromCharCode(0x202f)}234`);
    await expect(page.locator('#pause-save')).toHaveText('Sauvegarde : enregistrée');
    const m = await page.evaluate(() => {
      const panel = document.querySelector('#pause-panel .panel');
      const r = panel.getBoundingClientRect();
      const small = [...panel.querySelectorAll('button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 43.5).map((b) => b.id);
      return { top: r.top, bottom: r.bottom, vh: innerHeight, scroll: panel.scrollHeight > panel.clientHeight, small };
    });
    expect(m.top).toBeGreaterThanOrEqual(0);
    expect(m.bottom).toBeLessThanOrEqual(m.vh);
    expect(m.scroll).toBe(false);
    expect(m.small).toEqual([]);
  });

  for (const size of [SIZE]) {
    for (const variant of ['death', 'world']) {
      test(`E2-7 (${variant}) à ${size.width}×${size.height} : toutes les lignes visibles, sans débordement, lien de 44 px`, async ({ page }) => {
        await open(page, LOCAL, { size });
        if (variant === 'world') {
          await page.evaluate(() => window.__zs.startWave(40));
          await step(page, 3.2);
          await page.evaluate(() => window.__zs.skipWave());
          await step(page, 0.3);
        } else {
          await page.evaluate(() => { window.__zs.giveMoney(123456); window.__zs.setChutes(0); window.__zs.downPlayer(); });
          await step(page, 0.3);
        }
        await expect(page.locator('#end-panel')).toBeVisible();
        const ids = ['end-title', 'end-kills', 'end-earned', 'end-balance', 'end-best', 'btn-replay', 'end-save-link', ...(variant === 'world' ? ['end-bonus'] : [])];
        for (const id of ids) await expect(page.locator(`#${id}`), id).toBeVisible();
        const m = await page.evaluate(() => {
          const panel = document.querySelector('#end-panel .panel');
          const r = panel.getBoundingClientRect();
          const link = document.getElementById('end-save-link').getBoundingClientRect();
          const replay = document.getElementById('btn-replay').getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight, scroll: panel.scrollHeight > panel.clientHeight, link: link.height, replay: replay.height };
        });
        expect(m.top).toBeGreaterThanOrEqual(0);
        expect(m.bottom).toBeLessThanOrEqual(m.vh);
        expect(m.left).toBeGreaterThanOrEqual(0);
        expect(m.right).toBeLessThanOrEqual(m.vw);
        expect(m.scroll).toBe(false);
        expect(m.link).toBeGreaterThanOrEqual(44);
        expect(m.replay).toBeGreaterThanOrEqual(44);
      });
    }
  }

  test('E2-7 : « Monde terminé » avec la mention du bonus de fin de monde', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.startWave(40));
    await step(page, 3.2);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.3);
    await expect(page.locator('#end-title')).toHaveText('Monde terminé');
    await expect(page.locator('#end-bonus')).toBeVisible();
  });

  test('#hud-live : « Manche N terminée, bonus +X » une fois par manche, « Nouveau record » une fois, jamais par kill', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
    });
    await step(page, 3.2);
    expect(await shoot(page, 'marcheur')).toBe(1);
    await page.evaluate(() => window.__zs.skipWave());
    await step(page, 0.3);
    await expect(page.locator('#hud-live')).toHaveText('Manche 1 terminée, bonus +12.');
    await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    const log = await page.evaluate(() => window.__live);
    expect(log.filter((t) => t.startsWith('Manche 1 terminée'))).toHaveLength(1);
    expect(log.filter((t) => t.includes('Nouveau record : manche 1'))).toHaveLength(1);
    expect(log.filter((t) => /Argent|\+10\b/.test(t) && !t.startsWith('Manche'))).toEqual([]);
  });

  test('l\'ordre des blocs E2 est inchangé, sans nouveau bloc', async ({ page }) => {
    await open(page);
    const blocks = await page.evaluate(() => [...document.querySelectorAll('[data-block]')].map((n) => n.dataset.block));
    expect(blocks).toEqual(['E2-1', 'E2-2', 'E2-8', 'E2-10', 'E2-5', 'E2-3', 'E2-4', 'E2-6', 'E2-7']);
  });

  test('axe : aucune violation (jeu, pause, écran de fin) et aucune couleur seule', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.giveMoney(50));
    const check = async () => {
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    };
    await check();
    await page.getByRole('button', { name: 'Pause' }).click();
    await check();
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    await expect(page.locator('#end-panel')).toBeVisible();
    await check();
  });

  test('console propre et aucune requête externe pendant une partie avec gains', async ({ page, baseURL }) => {
    const problems = [];
    const external = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    await open(page);
    await shoot(page, 'marcheur');
    await page.evaluate(() => window.__zs.flushSave());
    await step(page, 3.2);
    expect(problems).toEqual([]);
    expect(external).toEqual([]);
  });
});

test.describe('budget et performance', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');
  // Références mesurées avant le lot (partie C non commencée) : 10 zombies variés, ombres, joueur au départ / près d'une fenêtre / à l'étage.
  const REF = { R1: [198, 13800], U1: [207, 15346] };
  // Branche lot-3g (main récupéré) : l'atelier de la carte ajoute du rendu (mobilier, portes, feux, extérieur, brume). Le lot 4 n'ajoute rien : sans le détail de
  // l'atelier (?detail=0), la référence à quelques éléments près (+ 2 appels : nappes de brume ; + 1 : fenêtre ; triangles à 120 près) ; avec : les plafonds du projet.
  const measure = (page, mode) => page.evaluate((m) => {
    const zs = window.__zs;
    if (m === 'window') {
      const w = zs.getState().windows.find((q) => q.floor === 'rdc') ?? zs.getState().windows[0];
      zs.setPlayer(w.repairSpot.x, w.repairSpot.y);
    }
    const p = zs.getState().player;
    const fl = zs.getState().floor?.player ?? 'rdc';
    zs.setInput({ aim: { angle: Math.PI } });
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    const G = ['lent', 'marche', 'rampe', 'course'];
    for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 40 + (i % 5) * 30, p.y + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10, floor: typeof fl === 'string' ? fl : 'rdc' });
    zs.step(0.05);
    zs.sampleScreen(0, 0, 8, 8);
    const s = zs.getState();
    return { calls: s.render.calls, triangles: s.render.triangles };
  }, mode);
  for (const [name, extra, where] of [['R1', '&nospawn=1', 'start'], ['U1', '&wave=21&floor=1&nospawn=1', 'start']]) {
    test(`${name} : sans le détail de l'atelier, la référence (à la brume près) ; avec, 30 000 triangles et 240 appels au plus`, async ({ page }) => {
      await open(page, `/jeu.html?test=1&seed=1&shadows=1${extra}&detail=0`);
      const off = await measure(page, where);
      expect(off.calls).toBeGreaterThanOrEqual(REF[name][0] - 1);
      expect(off.calls).toBeLessThanOrEqual(REF[name][0] + 3);
      expect(Math.abs(off.triangles - REF[name][1])).toBeLessThanOrEqual(120);
      await open(page, `/jeu.html?test=1&seed=1&shadows=1${extra}`);
      const on = await measure(page, where);
      console.log(`BUDGET lot 4 / 3g ${name} : detail=0 ${off.calls} / ${off.triangles} ; detail=1 ${on.calls} / ${on.triangles} (référence ${REF[name].join(' / ')})`);
      expect(on.triangles).toBeLessThanOrEqual(30000);
      expect(on.calls).toBeLessThanOrEqual(240);
    });
  }

  for (const width of [360]) {
    test(`CLS avec les données retardées de 400 ms (${width} px) : au plus 0,1`, async ({ browser, baseURL }, testInfo) => {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 640 : 800 } });
      const page = await context.newPage();
      await page.route('**/data/**', async (route) => {
        await new Promise((r) => setTimeout(r, 400));
        await route.continue();
      });
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${baseURL}${LOCAL}`);
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.3, null, { timeout: 90_000 });
      const cls = await page.evaluate(() => window.__cls);
      testInfo.annotations.push({ type: 'cls', description: `${width} px : ${cls.toFixed(4)}` });
      expect(cls).toBeLessThanOrEqual(0.1);
      await context.close();
    });
  }
});
