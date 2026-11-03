import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildLayout } from '../../js/core/layout.js';
import { waitReady, salle } from './helpers.js';

// Lot 1d-C : voix de zombies, ambiance, étouffement. Le journal des lectures (?test=1) remplace l'écoute ; 667×375 pour un rendu rapide.
const SIZE = { width: 667, height: 375 };
const world = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
const decor = JSON.parse(readFileSync('data/game/decor.json', 'utf8'));
const layout = buildLayout(world, decor, {});
// Les sons « fond » se calculent image par image (4 ms) : sur un runner chargé (rendu logiciel) ils sont prêts plus tard que 30 s.
test.setTimeout(120_000);
const state = (page) => page.evaluate(() => window.__zs.getState());
const audio = async (page) => (await state(page)).audio;
async function unlock(page) {
  await page.mouse.click(40, 40);
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
}
// Fait vivre une partie de `seconds` secondes avec 8 zombies toujours présents. Chaque seconde, le joueur est replacé au point de la salle
// le plus proche de la meute parmi ceux qui sont à 400 au moins de tout zombie : la meute reste à portée d'audition sans jamais toucher
// le joueur (la partie ne finit pas), et vise à l'opposé de la meute pour ne pas tirer. Renvoie les entrées du journal vues, avec `ready` et `loaded` à ce moment.

test.describe('voix de zombies', () => {

  test('un zombie à l\'extérieur derrière un mur est joué étouffé ; le même devant une fenêtre ne l\'est pas', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto(salle('/jeu.html?test=1&nospawn=1&seed=1'));
    await waitReady(page);
    await unlock(page);
    const win = layout.windows.find((w) => w.side === 'nord');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [win.x, win.y + 300]);
    const emit = async (x, y) => {
      const before = (await audio(page)).log.length;
      await page.evaluate(([px, py]) => window.__zs.audioEvent({ type: 'zombieHit', x: px, y: py, killed: false, zombie: 'marcheur' }), [x, y]);
      // Lot 4e (échec hérité corrigé) : les entrées de boucle d'ambiance (loop: true, sans lowpass) ne sont pas des voix.
      return (await audio(page)).log.slice(before).filter((e) => !e.loop);
    };
    const behind = await emit(win.x + 400, win.y - 250);
    expect(behind.map((e) => e.sound)).toContain('zombie-blessure');
    for (const e of behind) expect(e.lowpass, e.sound).toBe(true);
    await page.evaluate(() => window.__zs.step(0.5)); // laisse passer le délai minimal de la blessure
    const front = await emit(win.x, win.y - 250);
    expect(front.map((e) => e.sound)).toContain('zombie-blessure');
    for (const e of front) expect(e.lowpass, e.sound).toBe(false);
    expect(behind[0].gain).toBeLessThan(front[0].gain);
  });

});

