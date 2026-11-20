import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 9h-C : décor extérieur d'époque dans la partie (decor.json → epoque, npm run carte). L'avion remplace l'hélicoptère (sans rotor), un véhicule
// d'époque la voiture en flammes (même feu à deux foyers), des objets s'ajoutent ; ?test=1&decor=avant rend le décor d'avant (référence). Budget : au plus
// +4 appels et +3 000 triangles par rapport au décor d'avant, plafonds 400 appels et 45 000 triangles (R1, R2, U1, U4 × Élevé, Moyen, Faible).
const decor = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8'));
const U = (px) => px * 5 + 800; // scripts/perf/mesurer.mjs : position en pixels du plan → unités du jeu
const SCENES = [
  { id: 'R1', url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10 },
  { id: 'R2', url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10 },
  { id: 'U1', url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21 },
  { id: 'U4', url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31 },
];

async function ouvrir(page, extra = '') {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
}
const mesurer = (page, sc) => page.evaluate(({ at, floor, wave }) => {
  const zs = window.__zs;
  zs.setPlayer(at[0], at[1]);
  zs.setInput({ aim: { angle: Math.PI } });
  const T = ['marcheur', 'petit', 'voute', 'grand'];
  const G = ['lent', 'marche', 'rampe', 'course'];
  for (let i = 0; i < 10; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
  zs.step(0.05);
  zs.sampleScreen(0, 0, 8, 8);
  return zs.getState().render;
}, sc);

test.describe('décor d\'époque en partie', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('objets dessinés, hélicoptère et rotor retirés, véhicule en flammes (deux foyers), fumée de l\'avion ; ?decor=avant : décor d\'avant', async ({ page }) => {
    await ouvrir(page, '&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const a = zs.getState().scene.wrecks;
      zs.step(1);
      return { a, b: zs.getState().scene.wrecks };
    });
    expect(r.a.helicopter).toBeNull();
    expect(r.a.rotor).toBeNull();
    expect(r.a.epoque).toMatchObject({ objets: decor.epoque.objets.length, atlas: 256 });
    expect(r.a.epoque.vehicules).toBeGreaterThan(0); // les quatre véhicules aux places des voitures (maillage à ombre portée)
    expect(r.a.propsTriangles).toBe(0); // plus aucune voiture moderne
    expect(r.a.burningCar.id).toBe('voiture-en-flammes');
    expect(r.a.fires).toHaveLength(1);
    expect(r.a.fires[0]).toMatchObject({ spots: 2, glow: false, flames: 64, smoke: 64 });
    expect(r.b.fires[0].time).toBeGreaterThan(r.a.fires[0].time + 0.9);
    expect(r.a.heliSmoke).toHaveLength(1); // fumée légère de l'avion (même réglage que celle de l'hélicoptère)
    await ouvrir(page, '&nospawn=1&decor=avant');
    const avant = await page.evaluate(() => window.__zs.getState().scene.wrecks);
    expect(avant.epoque).toBeNull();
    expect(avant.helicopter.id).toBe('helicoptere');
    expect(avant.propsTriangles).toBe(632);
  });

  test('tirs : le laser s\'arrête sur le fuselage de l\'avion (dessiné à 44) et passe par-dessus son aile (10)', async ({ page }) => {
    await ouvrir(page, '&nospawn=1');
    const avion = decor.epoque.objets.find((o) => o.type === 'avion');
    const fuselage = avion.rects.find((q) => q.id === 'avion-fuselage');
    const aile = avion.rects.find((q) => q.id === 'avion-aile');
    const tir = (from, to) => page.evaluate(([f, t]) => {
      const zs = window.__zs;
      zs.setPlayer(f[0], f[1]);
      zs.spawnEnemy(t[0], t[1]);
      zs.setInput({ aim: { angle: Math.atan2(t[1] - f[1], t[0] - f[0]) } });
      zs.step(0.1);
      return zs.getState().laser;
    }, [from, to]);
    const xf = fuselage.x + fuselage.w / 2;
    const l1 = await tir([xf, fuselage.y - 60], [xf, fuselage.y + fuselage.h + 40]);
    expect(l1.stoppedBy).toBe('avion-fuselage');
    const xa = aile.x + aile.w / 2;
    const l2 = await tir([xa, aile.y - 40], [xa, aile.y + 60]);
    expect(l2.stoppedBy).not.toBe('avion-aile');
  });

  test('budget : au plus +4 appels et +3 000 triangles par rapport au décor d\'avant ; 400 appels et 45 000 triangles au plus (R1, R2, U1, U4 × 3 préréglages)', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const notes = [];
    for (const gfx of ['eleve', 'moyen', 'faible']) {
      for (const sc of SCENES) {
        await ouvrir(page, `${sc.url}&gfx=${gfx}&perso=A&sang=0&lum=off&decor=avant`);
        const avant = await mesurer(page, sc);
        await ouvrir(page, `${sc.url}&gfx=${gfx}&perso=A&sang=0&lum=off`);
        const apres = await mesurer(page, sc);
        notes.push(`${gfx} ${sc.id} : ${avant.calls} → ${apres.calls} appels, ${avant.triangles} → ${apres.triangles} triangles`);
        expect(apres.calls - avant.calls, `${gfx} ${sc.id}`).toBeLessThanOrEqual(4);
        expect(apres.triangles - avant.triangles, `${gfx} ${sc.id}`).toBeLessThanOrEqual(3000);
        expect(apres.calls).toBeLessThanOrEqual(400);
        expect(apres.triangles).toBeLessThanOrEqual(45000);
      }
    }
    testInfo.annotations.push({ type: 'rendu', description: notes.join(' ; ') });
    console.log(`BUDGET lot 9h ${notes.join(' ; ')}`);
  });
});
