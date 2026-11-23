// Lot 9k — Achat d'armes sur la carte : caisse active seulement quand sa pièce est ouverte (ou débogage « armes ouvertes »), message à deux cases,
// touche B, bouton tactile, achat (Zollars retirés, arme dans l'emplacement acheté, Colt intact), rachat, refus expliqués ; aucune écriture dans
// le stockage, aucune requête externe ; ?test=1&equilibrage=avant : carte sans caisses. ?test=1 : step() seulement, jamais une durée réelle.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

const table = JSON.parse(readFileSync('data/game/armes-partie.json', 'utf8'));
const PRIX = table.armes.winchester1897.prix;
const RACHAT = table.armes.winchester1897.rachat ?? Math.round((PRIX * 0.35) / 10) * 10;
const fmtZ = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function watch(page) {
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/GL Driver Message/.test(m.text()) && problems.push(m.text()));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:4173/') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  return { problems, external };
}
const espion = () => {
  window.__ecritures = [];
  for (const f of ['setItem', 'removeItem', 'clear']) {
    const orig = Storage.prototype[f];
    Storage.prototype[f] = function patched(...a) {
      window.__ecritures.push(f);
      return orig.apply(this, a);
    };
  }
};
// Joueur posé devant la caisse du pompe (aile), à 40 de son bord ouest ; quelques pas pour que le message suive.
const devantPompe = (page) => page.evaluate(() => {
  const zs = window.__zs;
  const c = zs.getState().caisses.liste.find((x) => x.arme === 'winchester1897');
  zs.setPlayer(c.x - 40, c.y + c.h / 2);
  for (let i = 0; i < 4; i += 1) zs.step(0.05);
  return zs.getState().caisses;
});

test.describe('achat d\'armes sur la carte', () => {
  test('caisse du pompe : active à l\'ouverture de l\'aile ; message à deux cases ; touche B : achat, Zollars retirés, arme en main, Colt intact ; rachat refusé si plein ; aucune écriture', async ({ page }) => {
    test.setTimeout(120_000);
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto(`/jeu.html?test=1&seed=1&wave=11&nospawn=1&lum=off&vhs=0&zollars=${PRIX + 500}`);
    await waitReady(page);
    const c = await devantPompe(page);
    expect(c.liste.map((x) => [x.arme, x.active])).toEqual([['winchester1897', true], ['kar98k', false], ['thompson', false]]);
    expect(c.proche).toMatchObject({ arme: 'winchester1897', action: 'acheter', prix: PRIX, possible: true });
    await expect(page.locator('#achat-message')).toBeVisible();
    await expect(page.locator('#achat-message')).toContainText(`Acheter Winchester M1897 — ${fmtZ(PRIX)} Z`);
    await page.keyboard.press('KeyB');
    const apres = await page.evaluate(() => { for (let i = 0; i < 30; i += 1) window.__zs.step(0.05); const s = window.__zs.getState(); return { c: s.caisses, armes: s.armes }; });
    expect(apres.c.depense).toBe(PRIX);
    expect(apres.c.zollars).toBe(500);
    expect(apres.c.achats).toEqual([expect.objectContaining({ arme: 'winchester1897', action: 'acheter', cout: PRIX })]);
    expect(apres.armes.emplacements.map((e) => e.id)).toEqual(['m1911', 'winchester1897']);
    expect(apres.armes.actif).toBe('winchester1897');
    expect(apres.c.proche).toMatchObject({ action: 'munitions', prix: RACHAT, refus: 'plein' });
    await expect(page.locator('#achat-message')).toContainText(`Munitions — ${fmtZ(RACHAT)} Z`);
    // Munitions déjà pleines : le rachat est refusé, rien n'est retiré.
    const rachat = await page.evaluate(() => window.__zs.acheter());
    expect(rachat.ok).toBe(false);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect(w.external).toEqual([]);
    expect(w.problems).toEqual([]);
  });

  test('pas assez de Zollars : message grisé avec le manque, achat refusé ; avant l\'ouverture de l\'aile, aucun message ; débogage « armes ouvertes »', async ({ page }) => {
    test.setTimeout(120_000);
    const w = watch(page);
    await page.goto('/jeu.html?test=1&seed=1&wave=11&nospawn=1&lum=off&vhs=0&zollars=100');
    await waitReady(page);
    await devantPompe(page);
    await expect(page.locator('#achat-message')).toContainText(`Il manque ${fmtZ(PRIX - 100)} Z`);
    await expect(page.locator('#achat-message')).toHaveAttribute('data-possible', 'false');
    expect(await page.evaluate(() => window.__zs.acheter())).toMatchObject({ ok: false, etat: { refus: 'zollars', manque: PRIX - 100 } });
    expect(await page.evaluate(() => window.__zs.getState().caisses.depense)).toBe(0);
    await page.goto('/jeu.html?test=1&seed=1&wave=1&nospawn=1&lum=off&vhs=0&zollars=5000');
    await waitReady(page);
    const ferme = await devantPompe(page);
    expect(ferme.liste[0].active).toBe(false);
    expect(ferme.proche).toBeNull();
    await expect(page.locator('#achat-message')).toBeHidden();
    const ouvert = await page.evaluate(() => { window.__zs.armesOuvertes(true); for (let i = 0; i < 2; i += 1) window.__zs.step(0.05); return window.__zs.getState().caisses; });
    expect(ouvert.toutes).toBe(true);
    expect(ouvert.proche).toMatchObject({ arme: 'winchester1897', possible: true });
    expect(w.problems).toEqual([]);
  });

  test('?test=1&equilibrage=avant : aucune caisse (ni obstacle, ni dessin, ni message)', async ({ page }) => {
    await page.goto('/jeu.html?test=1&seed=1&wave=11&nospawn=1&equilibrage=avant');
    await waitReady(page);
    const s = await page.evaluate(() => window.__zs.getState());
    expect(s.caisses.liste).toEqual([]);
    expect(s.caisses.dessin).toBeNull();
    expect(s.obstacles.filter((o) => o.kind === 'caisse-arme')).toEqual([]);
  });
});

test.describe('achat d\'armes au toucher', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 812, height: 375 } });
  test('bouton contextuel (44 px au moins, dans l\'écran, sans chevaucher les emplacements d\'armes) : achat au toucher ; axe sans violation', async ({ page }) => {
    test.setTimeout(120_000);
    const w = watch(page);
    await page.goto(`/jeu.html?test=1&seed=1&wave=11&nospawn=1&lum=off&vhs=0&zollars=${PRIX}`);
    await waitReady(page);
    await page.touchscreen.tap(200, 200);
    await devantPompe(page);
    const bouton = page.locator('#achat-bouton');
    await expect(bouton).toBeVisible();
    const b = await bouton.boundingBox();
    const slots = await page.locator('#armes-slots').boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= 812 && b.y + b.height <= 375).toBe(true);
    if (slots) expect(b.y + b.height <= slots.y + 0.5 || slots.y + slots.height <= b.y + 0.5).toBe(true);
    await expect(page.locator('.achat-touche')).toBeHidden();
    const resultat = await new AxeBuilder({ page }).include('#achat-bouton').include('#achat-message').analyze();
    expect(resultat.violations.map((v) => v.id)).toEqual([]);
    await bouton.tap();
    const c = await page.evaluate(() => window.__zs.getState().caisses);
    expect(c.depense).toBe(PRIX);
    expect(w.problems).toEqual([]);
  });
});
