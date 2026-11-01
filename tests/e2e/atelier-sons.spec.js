import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

// Lot 3h-B : page d'écoute atelier-sons.html. Le journal window.__zsSons (?test=1) remplace l'écoute : aucun test n'attend la durée
// réelle d'un son. Taille de référence 667×375.
const atelier = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
const P1 = atelier.slots.filter((s) => s.priority === 1);
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message/;
const sons = (page) => page.evaluate(() => window.__zsSons);
const logOf = (page) => page.evaluate(() => window.__zsSons.log());
const stateOf = (page) => page.evaluate(() => window.__zsSons.state());

async function open(page, query = '?test=1', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/atelier-sons.html${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}
const slotCard = (page, id) => page.locator(`.slot[data-slot="${id}"]`);
async function unlock(page) {
  await page.getByRole('button', { name: 'Activer le son' }).click();
  await expect.poll(async () => (await stateOf(page)).unlocked).toBe(true);
}
async function playVariant(page, slot, variant) {
  const before = (await logOf(page)).length;
  await slotCard(page, slot).locator(`button[data-variant="${variant}"]`).click();
  await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(before + 1);
  return (await logOf(page)).at(-1);
}

test('se charge sans erreur ni requête externe, noindex, console propre, rien d\'enregistré', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#status')).toContainText('emplacements');
  await unlock(page);
  await playVariant(page, 'pas-joueur-dur', 'A');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('sans ?test=1, window.__zsSons n\'existe pas', async ({ page }) => {
  await open(page, '');
  expect(await page.evaluate(() => typeof window.__zsSons)).toBe('undefined');
});

test('liste tous les emplacements de la priorité 1 avec « Actuel », A, B, C et « Variante suivante »', async ({ page }) => {
  await open(page);
  await expect(page.locator('.slot[data-priority="1"]')).toHaveCount(P1.length);
  for (const s of P1) {
    const card = slotCard(page, s.id);
    await expect(card.locator('button[data-variant]')).toHaveCount(s.variants.length);
    await expect(card.locator('button[data-action="current"]')).toHaveText(s.current ? 'Actuel' : 'Aucun son actuel');
    if (!s.current) await expect(card.locator('button[data-action="current"]')).toBeDisabled();
    await expect(card.locator('button[data-action="next"]')).toHaveText('Variante suivante');
    await expect(card.locator('input[type="range"]')).toHaveCount(5);
  }
  await expect(page.locator('a[href="sons.html"]')).toBeVisible();
});

test('« Activer le son » puis un son : le journal reçoit le son, sa variante, sa graine, ses macros et ses mesures', async ({ page }) => {
  await open(page);
  expect((await stateOf(page)).unlocked).toBe(false);
  await unlock(page);
  const e = await playVariant(page, 'voix-grand-errance', 'B');
  expect(e).toMatchObject({ kind: 'variant', slot: 'voix-grand-errance', variant: 'B', seed: 1, played: true, sampleRate: 22050, ok: true, out: [] });
  expect(Object.keys(e.macros).sort()).toEqual(['ampleur', 'duree', 'grain', 'hauteur', 'matiere']);
  expect(e.measures.f0).toBeGreaterThan(50);
  expect(e.measures.f0).toBeLessThan(80);
  expect(e.bytes).toBe(Math.round(e.measures.duration * 22050) * 4);
  await expect(slotCard(page, 'voix-grand-errance').locator('.slot-measures')).toContainText('Dans la cible');
});

test('aucun son ne part avant un geste : sans « Activer le son », le contexte n\'existe pas', async ({ page }) => {
  await open(page);
  const s = await stateOf(page);
  expect([s.unlocked, s.contextState]).toEqual([false, 'aucun']);
  expect(await logOf(page)).toEqual([]);
});

test('le curseur « Hauteur » change la mesure : hauteur plus basse -> fondamentale plus basse', async ({ page }) => {
  await open(page);
  await unlock(page);
  const base = await playVariant(page, 'voix-marcheur-errance', 'A');
  const before = (await logOf(page)).length;
  await slotCard(page, 'voix-marcheur-errance').locator('input[data-macro="hauteur"]').evaluate((input) => {
    input.value = '-5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(before + 1);
  const low = (await logOf(page)).at(-1);
  expect(low.macros.hauteur).toBe(-5);
  expect(low.measures.f0).toBeLessThan(base.measures.f0 * 0.85);
  await expect(slotCard(page, 'voix-marcheur-errance').locator('output').first()).toHaveText('-5 demi-tons');
});

test('« Variante suivante » parcourt les cinq versions sans jamais répéter la précédente', async ({ page }) => {
  await open(page);
  await unlock(page);
  await playVariant(page, 'pas-zombie-marche', 'A');
  const seeds = [1];
  for (let k = 0; k < 6; k += 1) {
    const before = (await logOf(page)).length;
    await slotCard(page, 'pas-zombie-marche').locator('button[data-action="next"]').click();
    await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(before + 1);
    seeds.push((await logOf(page)).at(-1).seed);
  }
  for (let k = 1; k < seeds.length; k += 1) {
    expect(seeds[k]).not.toBe(seeds[k - 1]);
    expect(seeds[k] >= 1 && seeds[k] <= 5).toBe(true);
  }
});

test('« Actuel » joue le son du jeu à la hauteur du type de zombie', async ({ page }) => {
  await open(page);
  await unlock(page);
  const before = (await logOf(page)).length;
  await slotCard(page, 'voix-grand-errance').locator('button[data-action="current"]').click();
  await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(before + 1);
  expect((await logOf(page)).at(-1)).toMatchObject({ kind: 'current', source: 'zombie-gemissement', rate: 0.82, played: true });
});

test('le favori de chaque emplacement apparaît dans « Mes choix » au format attendu', async ({ page }) => {
  await open(page);
  await expect(page.locator('#choices-empty')).toBeVisible();
  await slotCard(page, 'pas-joueur-dur').getByLabel('B', { exact: true }).check();
  await slotCard(page, 'reparation').getByLabel('C', { exact: true }).check();
  await expect(page.locator('#choices-empty')).toBeHidden();
  const text = await page.evaluate(() => window.__zsSons.choices());
  expect(text.split('\n')).toEqual(['pas-joueur-dur=B(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0.3)', 'reparation=C(hauteur=0,matiere=0,grain=1,duree=1.8,ampleur=0)']);
  await expect(page.locator('#choices-text')).toHaveValue(text);
  for (const line of text.split('\n')) expect(line).toMatch(/^[a-z0-9-]+=[A-C]\(hauteur=-?[\d.]+,matiere=-?[\d.]+,grain=-?[\d.]+,duree=-?[\d.]+,ampleur=-?[\d.]+\)$/);
  // Un seul favori par emplacement : en choisir un autre remplace le premier.
  await slotCard(page, 'pas-joueur-dur').getByLabel('A', { exact: true }).check();
  expect((await page.evaluate(() => window.__zsSons.choices())).split('\n')[0]).toMatch(/^pas-joueur-dur=A\(/);
});

test('« Copier mes choix » passe par le presse-papiers (simulé)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copied = text; } } });
  });
  await open(page);
  await slotCard(page, 'escalade').getByLabel('B', { exact: true }).check();
  await page.getByRole('button', { name: 'Copier mes choix' }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe('escalade=B(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0.3)');
  await expect(page.locator('#status')).toContainText('copiés');
});

test('« Copier mes choix » sans presse-papiers : repli par la sélection du texte', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await open(page);
  await slotCard(page, 'planche-chute').getByLabel('A', { exact: true }).check();
  await page.getByRole('button', { name: 'Copier mes choix' }).click();
  await expect(page.locator('#status')).toContainText('sélectionné');
  expect(await page.locator('#choices-text').evaluate((t) => [t.selectionStart, t.selectionEnd, t.value.length])).toEqual([0, 'planche-chute=A(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0.1)'.length, 'planche-chute=A(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0.1)'.length]);
});

test('volume maître à 40 % au départ, limiteur (compresseur) en sortie du graphe', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('slider', { name: 'Volume maître' })).toHaveValue('40');
  await expect(page.locator('#volume-value')).toHaveText('40 %');
  await unlock(page);
  const g = await page.evaluate(() => window.__zsSons.graph());
  expect(g.nodes).toEqual(['source', 'gain', 'volume', 'limiteur', 'sortie']);
  expect(g.volume).toBeCloseTo(0.4, 5);
  expect(g.limiter).toMatchObject({ type: 'DynamicsCompressorNode', ratio: 20, knee: 0 });
  expect(g.limiter.threshold).toBeCloseTo(-6, 3);
});

test('la référence « Coup de feu » joue la recette inchangée du jeu (même durée, même niveau)', async ({ page }) => {
  await open(page);
  await unlock(page);
  await page.locator('button[data-ref="ref-tir"]').click();
  await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(1);
  const e = (await logOf(page))[0];
  expect(e).toMatchObject({ kind: 'reference', source: 'tir', seed: 1, sampleRate: 44100, played: true, gain: 1 });
  expect(e.bytes).toBe(Math.round(0.75 * 44100) * 4);
  // Niveau court de la variante 1 du tir : −4,22 dBFS, soit +0,33 dB par rapport à la moyenne des trois variantes (levelRef).
  expect(Math.abs(e.measures.levelRel - 0.33)).toBeLessThan(0.1);
  await expect(page.locator('#status')).toContainText('Son fort');
  await expect(page.locator('button[data-ref="ref-tir"]')).toContainText('fort');
});

test('« Tout arrêter » coupe toutes les voix', async ({ page }) => {
  await open(page);
  await unlock(page);
  await playVariant(page, 'voix-voute-mort', 'B');
  await page.getByRole('button', { name: 'Tout arrêter' }).click();
  await expect.poll(async () => (await stateOf(page)).activeVoices).toBe(0);
  await expect(page.locator('#status')).toContainText('arrêtés');
});

test('le cache garde les tampons déjà calculés (24 Mo au plus)', async ({ page }) => {
  await open(page);
  await unlock(page);
  await playVariant(page, 'planche-arrachage', 'A');
  const second = await playVariant(page, 'planche-arrachage', 'A');
  expect(second.cached).toBe(true);
  const s = await stateOf(page);
  expect(s.cacheLimit).toBe(24 * 1024 * 1024);
  expect(s.cacheBytes).toBeGreaterThan(0);
  expect(s.cacheBytes).toBeLessThanOrEqual(s.cacheLimit);
});

test('sans JavaScript, seul le message noscript est visible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/atelier-sons.html');
  await expect(page.locator('#app')).toBeHidden();
  expect(await page.locator('body').innerText()).toContain('Cette page a besoin de JavaScript');
  await context.close();
});

test('sans AudioContext, la page l\'explique et reste utilisable sans erreur', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(() => {
    delete window.AudioContext;
    delete window.webkitAudioContext;
  });
  await open(page);
  await expect(page.locator('#status')).toContainText('ne permet pas de produire du son');
  await expect(slotCard(page, 'pas-joueur-dur').locator('button[data-variant="A"]')).toBeDisabled();
  await slotCard(page, 'pas-joueur-dur').getByLabel('C', { exact: true }).check();
  await expect(page.locator('#choices-text')).toHaveValue(/^pas-joueur-dur=C\(/);
  expect(problems).toEqual([]);
  expect(await sons(page)).toBeTruthy();
});

for (const size of [SIZE, { width: 1440, height: 900 }]) {
  test(`axe : aucune violation ; cibles d'au moins 44 px (${size.width}×${size.height})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule fois par taille');
    await open(page, '?test=1', size);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    const targets = page.locator('button, input[type="range"], .slot-fav label, .atelier-nav-list a, .atelier-link');
    const boxes = await Promise.all((await targets.all()).map((b) => b.boundingBox()));
    expect(boxes.length).toBeGreaterThan(P1.length * 10);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  });
}

for (const width of [360, 768, 1440]) {
  test(`CLS au plus 0,1 avec les données retardées de 400 ms (${width} px)`, async ({ browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 640 : 800 } });
    const page = await context.newPage();
    await page.route('**/data/**', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${baseURL}/atelier-sons.html?test=1`);
    await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const cls = await page.evaluate(() => window.__cls);
    testInfo.annotations.push({ type: 'cls', description: `${width} px : ${cls.toFixed(4)}` });
    expect(cls).toBeLessThanOrEqual(0.1);
    await context.close();
  });
}
