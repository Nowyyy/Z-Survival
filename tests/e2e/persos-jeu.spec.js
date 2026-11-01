import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';

// Lot 3j-D : essai en jeu derrière ?perso= et ?sang= (667 × 375, step() et hooks de ?test=1). Le jeu par défaut est inchangé.
// Lancer : E2E_FULL=1 npx playwright test tests/e2e/persos-jeu.spec.js
const SIZE = { width: 667, height: 375 };
const S = (page) => page.evaluate(() => window.__zs.getState());
const LOT_FILES = /persos-|character-v2|character-parts|pose-v2|texgen-persos|blood|arena|crowd|characters-v2|poses-v2/;
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const zw = zonesToWorld(parseZones(load('data/game/maps/rez-de-chaussee/zones.json')), load('data/game/maps/rez-de-chaussee/world.json').transform);
const DEPART = zw.stairs.find((s) => s.id === 'escalier-depart');
const T = ['marcheur', 'petit', 'voute', 'grand'];
const G = ['lent', 'marche', 'rampe', 'course'];

async function open(page, query, size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1${query}`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}
// 10 zombies variés devant le joueur (même placement que les mesures de budget du jeu).
const spawnTen = (page, wave = 10, floor = 'rdc', aim = 0) => page.evaluate(([w, f, a, types, gaits]) => {
  const zs = window.__zs;
  const p = zs.getState().player;
  zs.setInput({ aim: { angle: a } });
  for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: types[i % 4], gait: gaits[(i + Math.floor(i / 4)) % 4], wave: w, floor: f });
}, [wave, floor, aim, T, G]);
const measure = (page) => page.evaluate(() => {
  window.__zs.step(0.05);
  window.__zs.sampleScreen(0, 0, 8, 8);
  return window.__zs.getState().render;
});
// Résumé logique d'une partie : positions, vies, tués, vague, argent (aucun champ visuel).
const logic = (page) => page.evaluate(() => {
  const s = window.__zs.getState();
  return { player: [s.player.x, s.player.y, s.player.health], enemies: s.enemies.map((e) => [e.id, e.type, e.gait, e.x, e.y, e.health, e.mode]), kills: s.kills, wave: s.waves.wave, phase: s.waves.phase, money: s.economy?.balance ?? null, time: s.time };
});
// Jeu figé : la page se croit cachée dès le chargement, la boucle d'images ne démarre jamais ; seul step() fait avancer la partie (aucune
// image réelle ne glisse entre deux appels du test : comparaison exacte).
async function openFrozen(page, query) {
  await page.setViewportSize(SIZE);
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`/jeu.html?test=1${query}`);
  await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}
const sixHundredSteps = (page) => page.evaluate(() => {
  const zs = window.__zs;
  zs.setInput({ aim: { angle: 0.4 }, move: { x: 0.3, y: -0.2 } });
  for (let i = 0; i < 600; i += 1) zs.step(0.05);
  zs.setInput({});
});

test.describe('essai en jeu des personnages v2 et du sang', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test.describe('par défaut', () => {
    test('aucun module ni aucune donnée du lot 3j n\'est demandé au réseau', async ({ page }, testInfo) => {
      const files = [];
      page.on('request', (r) => files.push(new URL(r.url()).pathname));
      await open(page, '');
      await page.waitForTimeout(500);
      expect(files.filter((f) => LOT_FILES.test(f))).toEqual([]);
      testInfo.annotations.push({ type: 'réseau', description: `${files.filter((f) => /\.js$/.test(f)).length} fichiers JavaScript (référence main : 85)` });
    });
    test('getState().persos absent ; personnages actuels (pièces articulées)', async ({ page }) => {
      await open(page, '&nospawn=1');
      await spawnTen(page);
      const s = await S(page);
      expect(s.persos).toBeUndefined();
      expect(s.enemies[0].pose).toHaveProperty('hipL');
    });
    test('sans ?test=1, aucun crochet n\'est exposé, même avec ?perso=B&sang=1', async ({ page }) => {
      await page.setViewportSize(SIZE);
      await page.goto('/jeu.html?perso=B&sang=1');
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => [typeof window.__zs, typeof window.__zsPersos])).toEqual(['undefined', 'undefined']);
    });
    test('?perso=actuel&sang=0 : aucun module du lot au-delà du chargeur et des paramètres', async ({ page }) => {
      const files = [];
      page.on('request', (r) => files.push(new URL(r.url()).pathname));
      await open(page, '&perso=actuel&sang=0');
      expect(files.filter((f) => LOT_FILES.test(f)).sort()).toEqual(['/js/game/persos-loader.js', '/js/game/persos-params.js']);
      expect((await S(page)).persos).toBeUndefined();
    });
  });

  for (const v of ['A', 'B', 'C', 'riche']) {
    test(`?perso=${v} : le joueur et les 4 types de zombies sont des personnages v2 de la variante ${v}`, async ({ page }) => {
      await open(page, `&perso=${v}&nospawn=1`);
      await spawnTen(page);
      await page.evaluate(() => window.__zs.step(0.3));
      const s = await S(page);
      expect(s.persos).toMatchObject({ perso: v, sang: '0', architecture: 'rigid', characters: { joueur: v } });
      expect(s.persos.characters.zombies).toBe(10);
      expect(s.pose.choice).toBe(v);
      expect(new Set(s.enemies.map((e) => e.pose.slot))).toEqual(new Set(T));
      for (const e of s.enemies) expect(e.pose.choice).toBe(v);
    });
  }

  test('poses v2 : marche lente, marche, course, rampe selon l\'allure', async ({ page }) => {
    await open(page, '&perso=A&nospawn=1');
    const anims = await page.evaluate((gaits) => {
      const zs = window.__zs;
      const p = zs.getState().player;
      gaits.forEach((g, i) => zs.spawnEnemy(p.x + 500, p.y - 200 + i * 130, { type: 'marcheur', gait: g, wave: 1 }));
      zs.step(0.3); // première image : le personnage apparaît (immobile)
      zs.step(0.3); // seconde image : il a bougé, l'allure se lit
      return zs.getState().enemies.map((e) => [e.gait, e.pose.anim]);
    }, G);
    expect(anims).toEqual([['lent', 'marcheLente'], ['marche', 'marche'], ['rampe', 'rampe'], ['course', 'course']]);
  });

  test('poses v2 du siège : attente, arracher, puis escalade', async ({ page }) => {
    await open(page, '&perso=B&nospawn=1&map=salle');
    const seen = await page.evaluate(() => {
      const zs = window.__zs;
      for (let i = 0; i < 3; i += 1) zs.spawnAtWindow('fenetre-nord', 'marcheur');
      const anims = new Set();
      for (let i = 0; i < 400; i += 1) {
        zs.step(0.05);
        for (const e of zs.getState().enemies) anims.add(`${e.mode}:${e.pose.anim}`);
      }
      return [...anims];
    });
    expect(seen).toContain('arrache:arracher');
    expect(seen).toContain('escalade:escalade');
    expect(seen.some((x) => x.startsWith('attente:attente'))).toBe(true);
  });

  test('poses v2 : attaque au contact, touché au tir', async ({ page }) => {
    await open(page, '&perso=C&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(9);
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 30, p.y, { type: 'grand', gait: 'lent', wave: 1 });
      let attack = false;
      for (let i = 0; i < 60 && !attack; i += 1) {
        zs.step(0.05);
        attack = zs.getState().enemies[0]?.pose.anim === 'attaque';
      }
      zs.spawnEnemy(p.x - 260, p.y, { type: 'grand', gait: 'lent', wave: 1 });
      zs.fire(Math.PI);
      let hurt = false;
      for (let i = 0; i < 20 && !hurt; i += 1) {
        zs.step(0.05);
        hurt = zs.getState().enemies.some((e) => e.pose?.hurt);
      }
      return { attack, hurt };
    });
    expect(r).toEqual({ attack: true, hurt: true });
  });

  test('joueur v2 : marche, à terre, relevage, réparation', async ({ page }) => {
    await open(page, '&perso=A&nospawn=1&map=salle');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const out = {};
      zs.setInput({ move: { x: 1, y: 0 } });
      zs.step(0.3);
      out.marche = zs.getState().pose.anim;
      zs.setInput({});
      zs.downPlayer();
      zs.step(0.3);
      out.terre = zs.getState().pose.anim;
      for (let i = 0; i < 140 && zs.getState().player.down.state !== 'debout'; i += 1) zs.step(0.05);
      zs.step(0.1);
      out.relevage = zs.getState().pose.anim;
      const w = zs.getState().windows.find((x) => x.id === 'fenetre-nord');
      zs.setPlanks('fenetre-nord', 2);
      zs.setPlayer(w.repairSpot.x, w.repairSpot.y);
      zs.step(1.5);
      out.reparation = zs.getState().pose.anim;
      return out;
    });
    expect(r).toEqual({ marche: 'marche', terre: 'terre', relevage: 'relevage', reparation: 'reparation' });
  });

  test('escalier : les zombies v2 prennent l\'escalier (marche d\'escalier ; rampants en rampe), visibles', async ({ page }) => {
    await open(page, '&perso=B&nospawn=1&wave=31');
    const seen = await page.evaluate(([a]) => {
      const zs = window.__zs;
      zs.spawnEnemy(a.x, a.y + 40, { floor: 'etage', mode: 'dedans', type: 'marcheur', gait: 'marche' });
      zs.spawnEnemy(a.x + 14, a.y + 60, { floor: 'etage', mode: 'dedans', type: 'petit', gait: 'rampe' });
      const out = new Set();
      for (let i = 0; i < 600 && out.size < 2; i += 1) {
        zs.step(0.05);
        for (const e of zs.getState().enemies) if (e.mode === 'escalier' && e.visible) out.add(`${e.gait}:${e.pose.anim}`);
      }
      return [...out].sort();
    }, [DEPART.floors.etage.arrival]);
    expect(seen).toEqual(['marche:escalier', 'rampe:rampe']);
  });

  for (const [level, maxP, maxD] of [['reduit', 96, 12], ['1', 256, 48]]) {
    test(`?sang=${level} : 60 s de partie, particules, taches et cadavres dans leurs plafonds`, async ({ page }) => {
      await open(page, `&perso=A&sang=${level}&nospawn=1`);
      const max = await page.evaluate(([types]) => {
        const zs = window.__zs;
        zs.setChutes(99);
        const m = { particules: 0, taches: 0, cadavres: 0 };
        for (let s = 0; s < 60; s += 1) {
          if (s % 6 === 0) {
            const p = zs.getState().player;
            for (let i = 0; i < 4; i += 1) zs.spawnEnemy(p.x + 200 + i * 40, p.y - 60 + i * 40, { type: types[i], gait: 'marche', wave: 1 });
            zs.setInput({ aim: { angle: 0 } });
          }
          zs.step(1);
          const b = zs.getState().persos.blood;
          for (const k of Object.keys(m)) m[k] = Math.max(m[k], b[k]);
        }
        return { ...m, kills: zs.getState().kills };
      }, [T]);
      expect(max.kills).toBeGreaterThan(5);
      expect(max.particules).toBeLessThanOrEqual(maxP);
      expect(max.taches).toBeLessThanOrEqual(maxD);
      expect(max.taches).toBeGreaterThan(0);
      expect(max.cadavres).toBeLessThanOrEqual(6);
      expect(max.cadavres).toBeGreaterThan(0);
    });
  }

  test('?sang=0 (avec ?perso=B) : aucune particule, aucune tache, aucun cadavre', async ({ page }) => {
    await open(page, '&perso=B&sang=0&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(6));
    expect((await S(page)).persos.blood).toMatchObject({ particules: 0, taches: 0, cadavres: 0 });
  });

  test('cadavres : jamais ciblés ni solides (le laser et les zombies les ignorent), disparus après leur durée', async ({ page }) => {
    await open(page, '&perso=A&sang=1&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.spawnEnemy(p.x + 150, p.y, { type: 'petit', gait: 'lent', wave: 1 });
      zs.setInput({ aim: { angle: 0 } });
      for (let i = 0; i < 40 && zs.getState().kills === 0; i += 1) zs.step(0.05);
      const after = zs.getState();
      zs.step(0.1);
      const laser = zs.getState().laser;
      for (let i = 0; i < 180; i += 1) zs.step(0.05);
      return { kills: after.kills, enemies: after.enemies.length, corpses: after.persos.blood.cadavres, laserHit: laser?.hit ?? null, later: zs.getState().persos.blood.cadavres };
    });
    expect(r).toEqual({ kills: 1, enemies: 0, corpses: 1, laserHit: null, later: 0 });
  });

  test('sang et personnages suivent l\'étage : une tache de l\'étage n\'est pas dessinée quand le joueur descend', async ({ page }) => {
    await open(page, '&perso=A&sang=1&nospawn=1&wave=21&floor=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.spawnEnemy(p.x + 120, p.y, { type: 'petit', gait: 'lent', wave: 1, floor: 'etage', mode: 'dedans' });
      zs.setInput({ aim: { angle: 0 } });
      for (let i = 0; i < 60 && zs.getState().kills === 0; i += 1) zs.step(0.05);
      zs.step(0.5);
      const up = zs.getState().persos.blood.dessines.taches;
      zs.setFloor(0);
      zs.step(0.05);
      return { up, down: zs.getState().persos.blood.dessines.taches, kills: zs.getState().kills };
    });
    expect(r.kills).toBe(1);
    expect(r.up).toBeGreaterThan(0);
    expect(r.down).toBe(0);
  });

  test('?usure=auto suit la manche ; ?usure=1 l\'impose', async ({ page }) => {
    await open(page, '&perso=A&wave=25');
    await page.evaluate(() => window.__zs.step(0.1));
    expect((await S(page)).persos.wear).toBe(2);
    await open(page, '&perso=A&wave=25&usure=1');
    expect((await S(page)).persos.wear).toBe(1);
  });

  test('?perso= et ?sang= ne déclenchent pas le mode essai : la sauvegarde reste écrite (store=local)', async ({ page }) => {
    await open(page, '&store=local&perso=B&sang=1'); // ?nospawn=1 est lui-même un paramètre d'essai : absent ici
    const s = await page.evaluate(() => {
      window.__zs.giveMoney(25);
      window.__zs.flushSave();
      return { save: window.__zs.getState().save, stored: localStorage.getItem('zs.save.v1') !== null };
    });
    expect(s.save.readOnly).toBe(false);
    expect(s.stored).toBe(true);
  });

  for (const q of ['&perso=A', '&perso=B', '&perso=C', '&perso=riche', '&sang=reduit', '&sang=1', '&perso=B&sang=1']) {
    test(`invariance : ${q} donne le même état logique que le jeu par défaut (graine 5, 600 pas)`, async ({ page }) => {
      await openFrozen(page, '&seed=5&wave=3');
      await sixHundredSteps(page);
      const base = await logic(page);
      await openFrozen(page, `&seed=5&wave=3${q}`);
      await sixHundredSteps(page);
      expect(await logic(page)).toEqual(base);
      expect(base.enemies.length + base.kills).toBeGreaterThan(0);
    });
  }

  for (const [id, query, player, floor, wave, aim] of [['R1', '', [2575, 2250], 'rdc', 10, 0], ['R2', '&map=salle', [1800, 900], 'rdc', 10, Math.PI], ['U1', '&wave=21&floor=1', [1195, 1700], 'etage', 21, 0], ['U4', '&wave=31&floor=1', [1990, 2245], 'etage', 31, 0]]) {
    test(`budget ${id} avec ?perso=B&sang=1, ombres et cône : au plus 45 000 triangles et 400 appels`, async ({ page }, testInfo) => {
      await open(page, `&nospawn=1&shadows=1&perso=B&sang=1${query}`);
      await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), player);
      await spawnTen(page, wave, floor, aim);
      const r = await measure(page);
      testInfo.annotations.push({ type: 'rendu', description: `${id} : ${r.calls} appels, ${r.triangles} triangles` });
      console.log(`BUDGET 3j ${id} perso=B&sang=1 : ${r.calls} appels, ${r.triangles} triangles`);
      expect(r.calls).toBeLessThanOrEqual(400);
      expect(r.triangles).toBeLessThanOrEqual(45_000);
    });
  }

  test('aucune fuite de géométrie ni de texture après 10 allers-retours d\'étage et 3 « Rejouer »', async ({ page }) => {
    await open(page, '&perso=B&sang=1&nospawn=1&wave=21');
    const round = () => page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.setInput({ aim: { angle: 0 } });
      for (let i = 0; i < 6; i += 1) zs.spawnEnemy(p.x + 100 + i * 30, p.y - 50 + i * 10, { type: ['marcheur', 'petit', 'voute', 'grand'][i % 4], gait: 'marche', wave: 1 });
      zs.step(3);
      for (let k = 0; k < 10; k += 1) {
        zs.setFloor(1);
        zs.step(0.1);
        zs.setFloor(0);
        zs.step(0.1);
      }
      zs.killAll();
      zs.step(9);
      zs.sampleScreen(0, 0, 4, 4);
      const s = zs.getState().render;
      return [s.geometries, s.textures];
    });
    const first = await round();
    let last = first;
    for (let k = 0; k < 3; k += 1) {
      await page.locator('#btn-pause').click();
      await page.locator('#btn-restart').click();
      last = await round();
    }
    expect(last[0]).toBeLessThanOrEqual(first[0] + 4);
    expect(last[1]).toBeLessThanOrEqual(first[1] + 2);
  });

  test('?map=salle fonctionne avec ?perso=C&sang=reduit', async ({ page }) => {
    await open(page, '&map=salle&perso=C&sang=reduit&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(1));
    const s = await S(page);
    expect(s.map.id).toBe('salle');
    expect(s.persos.characters.zombies).toBe(10);
  });

  test('console propre (hors messages du pilote GL) avec ?perso=B&sang=1', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !/GL Driver|GPU stall|ReadPixels/.test(m.text()))) && errors.push(m.text()));
    await open(page, '&perso=B&sang=1&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(5));
    expect(errors).toEqual([]);
  });

  test('axe : aucune violation avec ?perso=B&sang=1', async ({ page }) => {
    await open(page, '&perso=B&sang=1&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(1));
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
  });
});
