import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { defaultSave as defaultV1, encodeSave } from '../../js/core/save.js';
import { decoder, defaultProgression, encoder } from '../../js/core/progression.js';

// Lot 4-B : page technique sauvegarde.html. 667×375, ?store=memory sauf mention (« local » : le vrai localStorage).
// Lot 8h : la page montre et écrit la progression v2 (zs.save.v2, code ZS2) ; un code ZS1 reste importable ; zs.save.v1 n'est ni lue ni écrite.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const KEY = params.save.v2.storageKey;
const V1 = params.save.storageKey;
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const defaultSave = defaultProgression;
const sample = (extra = {}) => ({
  ...defaultSave(), rev: 3, savedAt: 1_700_000_000_000, bleu: { gagne: 5678, depense: 4444 }, niveaux: { ...defaultSave().niveaux, degats: 3, precision: 5 },
  objets: [{ u: 'a1.0', i: 'casque-kevlar', r: 'rare', n: 2 }], records: { histoire: { batiment: 12 }, infini: { batiment: 20 } }, mondes: ['batiment'],
  profil: { ...defaultSave().profil, tues: 80, partiesHistoire: 5 }, ...extra,
});
const CODE = encoder(sample(), params);
const CODE_V1 = encodeSave({ ...defaultV1(), money: 999, earned: 999, stats: { ...defaultV1().stats, vie: 4 }, records: { bestWave: 17, bestKills: 3, runs: 2, worldsCompleted: 0 } }, params);
const BROWSER_NOISE = /GL Driver Message/;

async function open(page, search = '?store=memory', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/sauvegarde.html${search}`);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#state-list dd').first()).toBeVisible();
}
const state = (page) => page.locator('#state-list');
const writesSpy = (extra = '') => `
  window.__writes = [];
  const set = Storage.prototype.setItem; const remove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push(['set', k]); return set.call(this, k, v); };
  Storage.prototype.removeItem = function (k) { window.__writes.push(['remove', k]); return remove.call(this, k); };
  ${extra}`;
const writes = (page) => page.evaluate((k) => window.__writes.filter((w) => w[1] === k), KEY);
const seed = (value) => `if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('${KEY}', ${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))}); sessionStorage.setItem('__seeded', '1'); }`;
async function importCode(page, code) {
  await page.locator('#import-code').fill(code);
  await page.getByRole('button', { name: 'Vérifier' }).click();
}
async function replaceWith(page, code) {
  await importCode(page, code);
  await expect(page.locator('#import-preview')).toBeVisible();
  await page.locator('#import-ack').check();
  await page.getByRole('button', { name: 'Remplacer ma sauvegarde' }).click();
}

test('se charge sans erreur ni requête externe ; noindex, français, aucun cookie, aucun IndexedDB', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('h1')).toHaveText('Sauvegarde');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  const stores = await page.evaluate(async () => [localStorage.length, sessionStorage.length, document.cookie, (await indexedDB.databases()).length]);
  expect(stores).toEqual([0, 0, '', 0]);
});

test('état vide : solde 0, « jamais », état « vide », stockage persistant inconnu ou non', async ({ page }) => {
  await open(page);
  await expect(state(page)).toContainText('Monnaie bleue0');
  await expect(state(page)).toContainText('Dernière écriturejamais');
  await expect(state(page)).toContainText('État de la sauvegardevide');
  await expect(state(page)).toContainText('Stockage persistant');
  await expect(state(page)).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#locked-section')).toBeHidden();
});

test('l\'avertissement sur Safari et les sept jours est affiché', async ({ page }) => {
  await open(page);
  await expect(page.locator('.save-warning')).toHaveText(fr['game.save.page.warning']);
  await expect(page.locator('.save-warning')).toContainText('7 jours d\'usage');
  await expect(page.locator('.save-warning')).toContainText('Exporte ton code régulièrement');
});

test('exporter : le champ en lecture seule contient un code qui se décode, avec sa longueur', async ({ page }) => {
  await open(page);
  const field = page.locator('#export-code');
  await expect(field).toHaveAttribute('readonly', '');
  const code = await field.inputValue();
  expect(code).toMatch(/^ZS2\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  expect(decoder(code, params)).toMatchObject({ ok: true, source: 'ZS2', save: defaultSave() });
  await expect(page.locator('#export-length')).toHaveText(`${code.length} caractères`);
});

test('« Copier » utilise le presse-papiers ; sans lui, le texte est sélectionné et un message le dit', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.getByRole('button', { name: 'Copier' }).first().click();
  await expect(page.locator('#live')).toHaveText('Code copié.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('#export-code').inputValue());
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('refusé')) }, configurable: true }));
  await page.getByRole('button', { name: 'Copier' }).first().click();
  await expect(page.locator('#live')).toHaveText(fr['game.save.page.export.manual']);
});

test('importer un code valide : aperçu, case à cocher, remplacement, relecture', async ({ page }) => {
  await open(page);
  await importCode(page, CODE);
  await expect(page.locator('#import-preview')).toBeVisible();
  await expect(page.locator('#import-rows tr').first()).toContainText('Monnaie bleue');
  await expect(page.locator('#import-rows')).toContainText('→ 1234');
  await expect(page.locator('#import-rows')).toContainText('Dégâts');
  await expect(page.locator('#import-rows')).toContainText('Record histoire (batiment)');
  await expect(page.locator('#import-rows')).toContainText('Record infini (batiment)');
  const replace = page.getByRole('button', { name: 'Remplacer ma sauvegarde' });
  await expect(replace).toBeDisabled();
  await page.locator('#import-ack').check();
  await expect(replace).toBeEnabled();
  await replace.click();
  await expect(page.locator('#live')).toHaveText('Sauvegarde importée.');
  await expect(state(page)).toContainText('Monnaie bleue1234');
  await expect(state(page)).toContainText('Monnaie bleue gagnée (total)5678');
  await expect(state(page)).toContainText('Dégâts 3');
  await expect(state(page)).toContainText('1 objet(s)');
  await expect(state(page)).toContainText('État de la sauvegardeenregistrée');
  expect(decoder(await page.locator('#export-code').inputValue(), params).save).toMatchObject({ bleu: { gagne: 5678, depense: 4444 }, rev: 1, records: { histoire: { batiment: 12 }, infini: { batiment: 20 } } });
  await expect(page.locator('#import-code')).toHaveValue('');
  await expect(page.locator('#import-preview')).toBeHidden();
});

test('modifier le champ après la vérification retire l\'aperçu : on ne remplace jamais un code non vérifié', async ({ page }) => {
  await open(page);
  await importCode(page, CODE);
  await page.locator('#import-ack').check();
  await expect(page.getByRole('button', { name: 'Remplacer ma sauvegarde' })).toBeEnabled();
  await page.locator('#import-code').fill(`${CODE}x`);
  await expect(page.locator('#import-preview')).toBeHidden();
  await expect(page.locator('#btn-replace')).toBeDisabled();
});

// Somme de contrôle du codec (CRC32 du texte base64url), recalculée ici pour fabriquer des codes dont seul le contenu est faux.
const crc32 = (text) => {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(text)) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
};
const signed = (value) => {
  const body = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  return `ZS2.${body}.${crc32(body)}`;
};

// Un code de chaque famille d'erreur du codec (le texte du message attendu est dans fr.json, clé game.save.page.error.<code>).
const ERRORS = () => {
  const [, body, crc] = CODE.split('.');
  return [
    ['empty', '   '],
    ['too-long', `ZS2.${'A'.repeat(params.save.v2.maxCodeLength)}`],
    ['bad-prefix', `XX1.${body}.${crc}`],
    ['bad-format', `ZS2.${body}`],
    ['bad-base64', 'ZS2.@@@@.00000000'],
    ['bad-checksum', `ZS2.${body}.00000000`],
    ['bad-json', signed('{pas du json')],
    ['bad-schema', signed({ argent: 5 })],
    ['future-version', signed({ v: 3, bleu: 5 })],
  ];
};

for (const [code, text] of ERRORS()) {
  test(`code erroné « ${code} » : message précis, sauvegarde inchangée`, async ({ page }) => {
    await open(page);
    const before = await page.locator('#export-code').inputValue();
    await importCode(page, text);
    await expect(page.locator('#import-error')).toHaveText(fr[`game.save.page.error.${code}`]);
    await expect(page.locator('#import-preview')).toBeHidden();
    await expect(page.locator('#btn-replace')).toBeDisabled();
    expect(await page.locator('#export-code').inputValue()).toBe(before);
  });
}

test('un code collé avec des espaces, des retours à la ligne et des espaces insécables est accepté', async ({ page }) => {
  await open(page);
  const messy = ` \n${CODE.replace(/(.{30})/g, '$1\n')}${String.fromCharCode(0xa0)}${String.fromCharCode(0x200b)} \n`;
  await importCode(page, messy);
  await expect(page.locator('#import-preview')).toBeVisible();
  await expect(page.locator('#import-error')).toBeHidden();
});

test('sauvegarde illisible : section visible, texte brut copiable, aucune écriture avant « Repartir de zéro », puis écriture', async ({ page }) => {
  await page.addInitScript(`${writesSpy(seed('{bad'))}`);
  await open(page, '');
  await expect(state(page)).toHaveAttribute('data-state', 'locked');
  await expect(page.locator('#locked-section')).toBeVisible();
  await expect(page.locator('#locked-raw')).toHaveValue('{bad');
  await expect(page.locator('#locked-raw')).toHaveAttribute('readonly', '');
  await expect(page.locator('#btn-copy')).toBeDisabled();
  await page.getByRole('button', { name: 'Copier' }).last().click();
  expect(await writes(page)).toHaveLength(1); // le semis de l'init seulement
  await page.getByRole('button', { name: 'Repartir de zéro' }).click();
  await expect(page.locator('#locked-confirm')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('{bad');
  await page.getByRole('button', { name: 'Oui, repartir de zéro' }).click();
  await expect(page.locator('#live')).toHaveText('Sauvegarde remise à zéro.');
  await expect(page.locator('#locked-section')).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await replaceWith(page, CODE);
  await expect(page.locator('#live')).toHaveText('Sauvegarde importée.');
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))).toMatchObject({ v: 2, bleu: { gagne: 5678, depense: 4444 } });
});

test('sauvegarde de version future : verrouillée aussi, jamais écrasée par la page', async ({ page }) => {
  await page.addInitScript(`${writesSpy(seed('{"v":99,"bleu":5}'))}`);
  await open(page, '');
  await expect(state(page)).toHaveAttribute('data-state', 'locked');
  await expect(page.locator('#locked-raw')).toHaveValue('{"v":99,"bleu":5}');
  await importCode(page, 'ZS2.@@@@.00000000');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('{"v":99,"bleu":5}');
});

test('« Importer un code » de la section illisible descend à l\'import et déverrouille', async ({ page }) => {
  await page.addInitScript(seed('[1,2]'));
  await open(page, '');
  await page.getByRole('button', { name: 'Importer un code' }).click();
  await expect(page.locator('#import-code')).toBeFocused();
  await replaceWith(page, CODE);
  await expect(page.locator('#locked-section')).toBeHidden();
  await expect(state(page)).toContainText('Monnaie bleue1234');
});

test('« Repartir de zéro » demande une confirmation et peut être annulée', async ({ page }) => {
  await page.addInitScript(seed('{bad'));
  await open(page, '');
  await page.getByRole('button', { name: 'Repartir de zéro' }).click();
  await page.locator('#locked-confirm').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('#locked-confirm')).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('{bad');
});

test('« Tout effacer » en deux temps : bouton, puis case et second bouton', async ({ page }) => {
  await page.addInitScript(seed(sample()));
  await open(page, '');
  await expect(state(page)).toContainText('Monnaie bleue1234');
  await page.getByRole('button', { name: 'Tout effacer…' }).click();
  await expect(page.locator('#clear-confirm')).toBeVisible();
  const yes = page.getByRole('button', { name: 'Effacer définitivement' });
  await expect(yes).toBeDisabled();
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, KEY)).toBe(true);
  await page.locator('#clear-ack').check();
  await expect(yes).toBeEnabled();
  await yes.click();
  await expect(page.locator('#live')).toHaveText('Sauvegarde effacée.');
  await expect(state(page)).toContainText('Monnaie bleue0');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
});

test('« Tout effacer » annulé ne touche à rien', async ({ page }) => {
  await page.addInitScript(seed(sample()));
  await open(page, '');
  await page.getByRole('button', { name: 'Tout effacer…' }).click();
  await page.locator('#clear-ack').check();
  await page.locator('#clear-confirm').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('#clear-confirm')).toBeHidden();
  await expect(state(page)).toContainText('Monnaie bleue1234');
});

test('la sauvegarde réelle est lue au chargement (stockage local) et la page se met à jour quand un autre onglet la modifie', async ({ page, context }) => {
  await open(page, '');
  await expect(state(page)).toContainText('Monnaie bleue0');
  const other = await context.newPage();
  await other.setViewportSize(SIZE);
  await other.goto('/sauvegarde.html');
  await expect(other.locator('#app')).toBeVisible();
  await replaceWith(other, CODE);
  await expect(other.locator('#live')).toHaveText('Sauvegarde importée.');
  await expect(state(page)).toContainText('Monnaie bleue1234');
});

test('seules clés zs.save.v2 et zs.device.v1 (laissée intacte) dans localStorage après toutes les actions ; aucun cookie, sessionStorage vide, aucun IndexedDB', async ({ page }) => {
  // Lot 5b (décision du propriétaire) : la préférence graphique de l'appareil (zs.device.v1) est la seule autre clé permise ; la page de sauvegarde ne la touche pas.
  await page.addInitScript(() => localStorage.setItem('zs.device.v1', '{"v":1,"graphics":"moyen"}'));
  await open(page, '');
  await replaceWith(page, CODE);
  await expect(page.locator('#live')).toHaveText('Sauvegarde importée.');
  await page.getByRole('button', { name: 'Tout effacer…' }).click();
  await page.locator('#clear-ack').check();
  await page.getByRole('button', { name: 'Effacer définitivement' }).click();
  await replaceWith(page, CODE);
  const stores = await page.evaluate(async () => ({ keys: Object.keys(localStorage).sort(), session: sessionStorage.length, cookie: document.cookie, idb: (await indexedDB.databases()).length }));
  expect(stores).toEqual({ keys: ['zs.device.v1', KEY], session: 0, cookie: '', idb: 0 }); // ordre alphabétique
  expect(await page.evaluate(() => localStorage.getItem('zs.device.v1'))).toBe('{"v":1,"graphics":"moyen"}');
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY)).bleu).toEqual({ gagne: 5678, depense: 4444 });
});

test('lot 8h : zs.save.v1 (V0.7) jamais lue ni écrite ; un code ZS1 importé remplace la progression (niveaux et record de l\'histoire, argent non converti)', async ({ page }) => {
  const v1 = JSON.stringify({ ...defaultV1(), money: 5000, earned: 5000, records: { bestWave: 30, bestKills: 9, runs: 4, worldsCompleted: 0 } });
  await page.addInitScript(`${writesSpy(`if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('${V1}', ${JSON.stringify(v1)}); sessionStorage.setItem('__seeded', '1'); }`)}`);
  await open(page, '');
  await expect(state(page)).toHaveAttribute('data-state', 'empty'); // la V0.8 repart de zéro
  await expect(state(page)).toContainText('Monnaie bleue0');
  await replaceWith(page, CODE);
  await importCode(page, CODE_V1);
  await expect(page.locator('#import-warnings')).toContainText('version plus ancienne (ZS1)');
  await expect(page.locator('#import-rows')).toContainText('Record histoire (batiment)');
  await page.locator('#import-ack').check();
  await page.getByRole('button', { name: 'Remplacer ma sauvegarde' }).click();
  await expect(page.locator('#live')).toHaveText('Sauvegarde importée.');
  const v2 = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
  expect([v2.bleu, v2.objets, v2.niveaux.vie, v2.records.histoire.batiment]).toEqual([{ gagne: 0, depense: 0 }, [], 4, 17]);
  expect(await page.evaluate((k) => localStorage.getItem(k), V1)).toBe(v1);
  expect((await page.evaluate(() => window.__writes)).filter((w) => w[1] === V1)).toHaveLength(1); // le semis du test seulement
});

test('le stockage bloqué par le navigateur : état « indisponible », la page reste utilisable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('refusé', 'SecurityError'); }, configurable: true });
  });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await open(page, '');
  await expect(state(page)).toHaveAttribute('data-state', 'unavailable');
  await importCode(page, CODE);
  await page.locator('#import-ack').check();
  await page.getByRole('button', { name: 'Remplacer ma sauvegarde' }).click();
  await expect(page.locator('#live')).toContainText('Le navigateur refuse le stockage');
  expect(problems).toEqual([]);
});

test('sans JavaScript, seul le message noscript est visible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/sauvegarde.html');
  await expect(page.locator('.noscript')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await context.close();
});

test('un seul lien vers le jeu : « Retour au jeu » (44 px), et aucun lien vers l\'accueil', async ({ page }) => {
  await open(page);
  const links = page.locator('a');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveText('Retour au jeu');
  await expect(links.first()).toHaveAttribute('href', 'jeu.html');
  expect((await links.first().boundingBox()).height).toBeGreaterThanOrEqual(44);
});

for (const size of [SIZE, BIG]) {
  test(`axe : aucune violation (${size.width}×${size.height}, état normal, aperçu, erreur)`, async ({ page }) => {
    await open(page, '?store=memory', size);
    const check = async () => {
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    };
    await check();
    await importCode(page, 'ZS2.@@@@.00000000');
    await check();
    await importCode(page, CODE);
    await expect(page.locator('#import-preview')).toBeVisible();
    await check();
    await page.getByRole('button', { name: 'Tout effacer…' }).click();
    await check();
  });

  test(`axe : section « illisible » sans violation (${size.width}×${size.height})`, async ({ page }) => {
    await page.addInitScript(seed('{bad'));
    await open(page, '', size);
    await expect(page.locator('#locked-section')).toBeVisible();
    await page.getByRole('button', { name: 'Repartir de zéro' }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
}

test('aucune cible de moins de 44 px (boutons, lien, cases à cocher) et aucun défilement horizontal', async ({ page }) => {
  await page.addInitScript(seed('{bad'));
  await open(page, '');
  await importCode(page, CODE);
  await page.getByRole('button', { name: 'Repartir de zéro' }).click();
  await page.getByRole('button', { name: 'Tout effacer…' }).click();
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a, .save-check, textarea')].filter((el) => el.offsetParent !== null).map((el) => [el.id || el.className || el.tagName, el.getBoundingClientRect()]).filter(([, r]) => r.height < 43.5 || r.width < 43.5).map(([n]) => n));
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// Lot 8h : compatibilité réelle entre versions servies sur la MÊME origine (comme le site : /Recette/ = V0.7 de main, /dev/ = V0.8 de l'arbre de
// travail) : la V0.7 joue et écrit zs.save.v1, la V0.8 écrit zs.save.v2, puis la V0.7 rejoue. Chaque côté garde sa progression, octet pour octet pour
// la clé de l'autre. Sauté si origin/main est absent (copie sans historique) ; projet bureau seulement.
test.describe('compatibilité V0.7 ↔ V0.8, même origine', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau seulement (deux versions du jeu chargées)');
  let server = null;
  let dir = null;
  const PORT = 4191;
  const BASE = `http://127.0.0.1:${PORT}`;
  test.beforeAll(async () => {
    const { execSync } = await import('node:child_process');
    const { mkdtempSync, mkdirSync, symlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    try {
      execSync('git rev-parse --verify --quiet origin/main', { stdio: 'ignore' });
    } catch {
      return;
    }
    dir = mkdtempSync(join(tmpdir(), 'zs-compat-'));
    mkdirSync(join(dir, 'Recette'));
    execSync(`git archive origin/main | tar -x -C "${join(dir, 'Recette')}"`, { stdio: 'ignore', shell: '/bin/bash' });
    symlinkSync(process.cwd(), join(dir, 'dev'), 'dir');
    const { startServer } = await import('../../scripts/site/serve.mjs');
    server = await startServer({ root: dir, port: PORT, base: '/', quiet: true });
  });
  test.afterAll(async () => {
    server?.close();
    if (dir) (await import('node:fs')).rmSync(dir, { recursive: true, force: true });
  });

  // Joue dans une version (vrai stockage) : 50 d'argent d'essai, une manche terminée, écriture ; renvoie le temps de jeu et l'état de la sauvegarde.
  const jouer = async (page, version) => {
    await page.goto(`${BASE}/${version}/jeu.html?test=1&store=local&seed=1`);
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
    return page.evaluate(() => {
      const zs = window.__zs;
      window.requestAnimationFrame = () => 0;
      for (let i = 0; i < 40; i += 1) zs.step(0.05);
      zs.giveMoney(50);
      zs.skipWave();
      for (let i = 0; i < 40; i += 1) zs.step(0.05);
      zs.flushSave();
      const s = zs.getState();
      return { time: s.time, status: s.save.status };
    });
  };
  const lire = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

  test('V0.7 → V0.8 → V0.7 : progression de chaque côté intacte, la Recette démarre et joue', async ({ page }) => {
    test.skip(server === null, 'origin/main absent : versions côte à côte impossibles');
    test.setTimeout(120_000);
    await page.setViewportSize(SIZE);
    // 1. V0.7 : joue et écrit zs.save.v1.
    const a = await jouer(page, 'Recette');
    expect(a.time).toBeGreaterThan(1);
    const v1 = (await lire(page))[V1];
    expect(JSON.parse(v1).money).toBe(62); // 50 d'essai + bonus de la manche 1 (12), règle de la V0.7
    expect((await lire(page))[KEY]).toBeUndefined();
    // 2. V0.8 : repart de zéro (zs.save.v1 ignorée), écrit sa progression par un import ZS2.
    await page.goto(`${BASE}/dev/sauvegarde.html`);
    await expect(page.locator('#state-list')).toHaveAttribute('data-state', 'empty');
    await replaceWith(page, CODE);
    await expect(page.locator('#live')).toHaveText('Sauvegarde importée.');
    // 2 bis. La partie de la V0.8 joue : la manche terminée rapporte 12 bleus, écrits dans zs.save.v2 ; zs.save.v1 intacte.
    const c = await jouer(page, 'dev');
    expect(c.time).toBeGreaterThan(1);
    const apres08 = await lire(page);
    expect(apres08[V1]).toBe(v1);
    const v2 = apres08[KEY];
    expect(JSON.parse(v2).bleu).toEqual({ gagne: 5678 + 12, depense: 4444 });
    // 3. V0.7 rejoue : elle relit sa progression, l'augmente, et ne touche jamais zs.save.v2.
    const b = await jouer(page, 'Recette');
    expect(b.time).toBeGreaterThan(1);
    const apres07 = await lire(page);
    expect(JSON.parse(apres07[V1]).money).toBe(62 + 62);
    expect(apres07[KEY]).toBe(v2);
    // 4. V0.8 : sa progression est là, intacte.
    await page.goto(`${BASE}/dev/sauvegarde.html`);
    await expect(page.locator('#state-list')).toContainText('Monnaie bleue1246');
    expect((await lire(page))[KEY]).toBe(v2);
  });
});
