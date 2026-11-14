import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';

// Lot 3m : les personnages choisis (data/game/persos-choix.json) sont le défaut du jeu ; lot 5e : l'ancien modèle (?perso=actuel) est retiré.
// 667 × 375, step() et hooks de ?test=1 ; suite rapide (fin de la liste ESSENTIAL de playwright.config.js).
const SIZE = { width: 667, height: 375 };
const S = (page) => page.evaluate(() => window.__zs.getState());
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const CHOIX = load('data/game/persos-choix.json');
const SLOTS = ['joueur', 'marcheur', 'petit', 'voute', 'grand'];
const EXPECTED = Object.fromEntries(SLOTS.map((s) => [s, CHOIX.persos[s].variante]));
const OLD = ['/js/core/pose.js', '/js/game/character.js']; // lot 5e : fichiers supprimés, jamais demandés
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
// Résumé logique : positions, vies, tués, vague, argent, étage (aucun champ visuel).
const logic = (page) => page.evaluate(() => {
  const s = window.__zs.getState();
  return { player: [s.player.x, s.player.y, s.player.health], enemies: s.enemies.map((e) => [e.id, e.type, e.gait, e.x, e.y, e.health, e.mode, e.floor ?? null]), kills: s.kills, wave: s.waves.wave, phase: s.waves.phase, money: s.economy?.balance ?? null, floor: s.floor?.player ?? s.floor?.current ?? null, time: s.time };
});
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

test.describe('personnages intégrés (choix par défaut)', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  // Lot 4e (regroupement) : cinq tests ouvraient la même page (?nospawn=1, 667×375) et faisaient apparaître les mêmes 10 zombies :
  // un seul chargement, une étape par ancien test, mêmes assertions, dans un ordre où chaque étape garde ses conditions (lecture d'abord,
  // tirs et sang ensuite ; la console est vérifiée à la fin, sur toute la séquence).
  test('par défaut (?nospawn=1, 10 zombies) : table des choix, fichiers demandés, axe, HUD au-dessus du sang, console propre', async ({ page }, testInfo) => {
    const files = [];
    const errors = [];
    page.on('request', (r) => files.push(new URL(r.url()).pathname));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !/GL Driver|GPU stall|ReadPixels/.test(m.text()))) && errors.push(m.text()));
    await open(page, '&nospawn=1');
    await spawnTen(page);
    await test.step('par défaut : les 5 personnages sont ceux de la table des choix (variante, style, tenues)', async () => {
      await page.evaluate(() => window.__zs.step(0.3));
      const s = await S(page);
      expect(s.persos).toMatchObject({ perso: 'choix', sang: CHOIX.sang, slots: EXPECTED, architecture: 'rigid' });
      for (const id of SLOTS) expect(s.persos.choix[id]).toMatchObject({ variante: CHOIX.persos[id].variante, style: CHOIX.persos[id].style });
      expect(s.pose).toMatchObject({ choice: EXPECTED.joueur, slot: 'joueur' });
      for (const e of s.enemies) expect(e.pose.choice).toBe(EXPECTED[e.pose.slot]);
      expect(new Set(s.enemies.map((e) => e.pose.slot))).toEqual(new Set(T));
    });
    await test.step('par défaut : ni pose.js ni character.js ne sont demandés ; la table des choix l\'est', async () => {
      await page.evaluate(() => window.__zs.step(0.7));
      for (const f of OLD) expect(files).not.toContain(f);
      expect(files).toContain('/data/game/persos-choix.json');
      expect(files).toContain('/js/game/character-v2.js');
      testInfo.annotations.push({ type: 'réseau', description: `${new Set(files.filter((f) => /\.js$/.test(f))).size} fichiers JavaScript` });
    });
    await test.step('axe : aucune violation par défaut', async () => {
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
    });
    await test.step('HUD lisible par-dessus les personnages et le sang : chaque bloc visible est au-dessus du canevas', async () => {
      const r = await page.evaluate(() => {
        const zs = window.__zs;
        zs.setLevels({ degats: 10 });
        zs.step(3); // tirs, sang et cadavres sous le HUD
        const canvasHost = document.getElementById('game-canvas');
        const blocks = [...document.querySelectorAll('#hud .hud-block')].filter((b) => !b.hidden && b.getBoundingClientRect().width > 0);
        // Le HUD laisse passer les touchers (pointer-events: none) : elementFromPoint l'ignorerait. Pour lire l'ordre des couches, il est
        // rendu « touchable » le temps de la mesure (feuille de style ajoutée puis retirée ; rien d'autre ne change).
        const probe = document.createElement('style');
        probe.textContent = '#hud, #hud * { pointer-events: auto !important; }';
        document.head.append(probe);
        const covered = blocks.filter((b) => {
          const box = b.getBoundingClientRect();
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return !top || canvasHost.contains(top) || !document.getElementById('hud').contains(top); // au-dessus : le HUD (le bloc ou sa colonne)
        }).map((b) => b.id);
        probe.remove();
        return { blocks: blocks.length, covered, domInCanvas: [...canvasHost.querySelectorAll('*')].map((n) => n.tagName), blood: zs.getState().persos.blood.taches };
      });
      expect(r.blocks).toBeGreaterThan(2);
      expect(r.covered).toEqual([]);
      expect(r.domInCanvas).toEqual(['CANVAS']); // personnages, sang et cadavres sont dessinés dans le canevas, jamais en HTML
    });
    await test.step('console propre (hors messages du pilote GL) par défaut', async () => {
      await page.evaluate(() => window.__zs.step(1));
      expect(errors).toEqual([]);
    });
  });

  test('?perso=actuel (lot 5e : ancien modèle retiré) : valeur inconnue, personnages par défaut (os rigides), aucun module ancien demandé', async ({ page }) => {
    const files = [];
    page.on('request', (r) => files.push(new URL(r.url()).pathname));
    await open(page, '&nospawn=1&perso=actuel');
    await spawnTen(page);
    const s = await S(page);
    expect(s.persos).toMatchObject({ perso: 'choix', architecture: 'rigid', slots: EXPECTED });
    expect(s.enemies[0].pose.choice).toBe(EXPECTED[s.enemies[0].pose.slot]);
    for (const f of OLD) expect(files).not.toContain(f);
  });

  test('repli (lot 5e) : table des choix absente (404) : les 5 personnages en variante A, sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/data/game/persos-choix.json', (route) => route.fulfill({ status: 404, body: '' }));
    await open(page, '&nospawn=1');
    expect((await S(page)).persos.slots).toEqual(Object.fromEntries(SLOTS.map((id) => [id, 'A'])));
    expect(errors).toEqual([]);
  });

  for (const v of ['A', 'B', 'C', 'riche']) {
    test(`?perso=${v} force la variante pour les 5 personnages`, async ({ page }) => {
      await open(page, `&perso=${v}&nospawn=1`);
      await spawnTen(page);
      await page.evaluate(() => window.__zs.step(0.3));
      const s = await S(page);
      expect(s.persos.slots).toEqual(Object.fromEntries(SLOTS.map((id) => [id, v])));
      expect(s.pose.choice).toBe(v);
      for (const e of s.enemies) expect(e.pose.choice).toBe(v);
    });
  }

  test('animations des allures : marche lente, marche, rampe, course (vitesses inchangées)', async ({ page }) => {
    await open(page, '&nospawn=1');
    const r = await page.evaluate((gaits) => {
      const zs = window.__zs;
      const p = zs.getState().player;
      gaits.forEach((g, i) => zs.spawnEnemy(p.x + 500, p.y - 200 + i * 130, { type: 'marcheur', gait: g, wave: 1 }));
      zs.step(0.3);
      const a = zs.getState().enemies.map((e) => [e.x, e.y]);
      zs.step(0.3);
      const s = zs.getState();
      return s.enemies.map((e, i) => [e.gait, e.pose.anim, Math.round(Math.hypot(e.x - a[i][0], e.y - a[i][1]) / 0.3)]);
    }, G);
    expect(r.map((x) => x.slice(0, 2))).toEqual([['lent', 'marcheLente'], ['marche', 'marche'], ['rampe', 'rampe'], ['course', 'course']]);
    r.forEach(([, , speed], i) => expect(speed).toBeLessThanOrEqual([45, 70, 105, 140][i] + 1));
  });

  test('siège d\'une fenêtre : attente, arracher, puis enjamber', async ({ page }) => {
    await open(page, '&nospawn=1&map=salle');
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
    expect(seen).toContain('escalade:enjamber');
    expect(seen.some((x) => x.startsWith('attente:attente'))).toBe(true);
  });

  test('contact : attaque ; impact non mortel : touché', async ({ page }) => {
    await open(page, '&nospawn=1');
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
        hurt = zs.getState().enemies.some((e) => e.pose?.hurt && e.health > 0);
      }
      return { attack, hurt };
    });
    expect(r).toEqual({ attack: true, hurt: true });
  });

  test('mort : un cadavre en pose de mort, sans effet de jeu (ni cible ni obstacle), puis disparu', async ({ page }) => {
    await open(page, '&nospawn=1');
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

  test('joueur : marche, à terre, relevage, réparation', async ({ page }) => {
    await open(page, '&nospawn=1&map=salle');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const out = {};
      zs.step(0.3);
      out.repos = zs.getState().pose.anim;
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
    expect(r).toEqual({ repos: 'repos', marche: 'marche', terre: 'terre', relevage: 'relevage', reparation: 'reparation' });
  });

  // Hauteur dessinée : game.js relève un rampant de STAIR_CRAWL_LIFT (14) dans un escalier, quel que soit le modèle (vérifié par
  // tests/unit/persos-integres.test.js) ; getState() n'expose pas la hauteur dessinée : ici, la pose et la visibilité.
  test('escalier : pose d\'escalier ; rampants en rampe, visibles dans l\'escalier', async ({ page }) => {
    await open(page, '&nospawn=1&wave=31');
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

  for (const q of ['&perso=A', '&perso=B', '&perso=C', '&perso=riche', '&sang=0', '&sang=reduit', '&sang=1']) { // lot 5e : « &perso=actuel » retiré (ancien modèle)
    test(`invariance : « ${q} » donne le même état logique que le défaut (graine 5, 600 pas)`, async ({ page }) => {
      await openFrozen(page, '&seed=5&wave=3');
      await sixHundredSteps(page);
      const base = await logic(page);
      await openFrozen(page, `&seed=5&wave=3${q}`);
      await sixHundredSteps(page);
      expect(await logic(page)).toEqual(base);
      expect(base.enemies.length + base.kills).toBeGreaterThan(0);
    });
  }

  test('?usure=auto suit la manche ; ?usure=3 impose le dernier palier', async ({ page }) => {
    await open(page, '&wave=25');
    await page.evaluate(() => window.__zs.step(0.1));
    expect((await S(page)).persos).toMatchObject({ usure: 'auto', wear: 2 });
    await open(page, '&wave=5&usure=3');
    expect((await S(page)).persos).toMatchObject({ usure: 3, wear: 3 });
  });

  for (const [id, query, player, floor, wave, aim] of [['R1', '', [2575, 2250], 'rdc', 10, 0], ['R2', '&map=salle', [1800, 900], 'rdc', 10, Math.PI], ['U1', '&wave=21&floor=1', [1195, 1700], 'etage', 21, 0], ['U4', '&wave=31&floor=1', [1990, 2245], 'etage', 31, 0]]) {
    test(`budget ${id} (défaut ; ?perso=riche&sang=1) : au plus 45 000 triangles et 400 appels`, async ({ page }, testInfo) => {
      const out = [];
      for (const extra of ['', '&perso=riche&sang=1']) {
        await open(page, `&nospawn=1&shadows=1${query}${extra}`);
        await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), player);
        await spawnTen(page, wave, floor, aim);
        const r = await measure(page);
        out.push(`${extra || 'défaut'} ${r.calls} / ${r.triangles}`);
        expect(r.calls).toBeLessThanOrEqual(400);
        expect(r.triangles).toBeLessThanOrEqual(45_000);
      }
      testInfo.annotations.push({ type: 'rendu', description: `${id} : ${out.join(' ; ')}` });
      console.log(`BUDGET 3m ${id} : ${out.join(' ; ')}`);
    });
  }

  // Pire cas du sang : cadavres du niveau (complet : 2, lot 3m ; un cadavre « riche » coûte environ 2 100 triangles) et 48 taches, puis 10 zombies vivants.
  for (const [id, query, player, floor, wave] of [['U1', '&wave=21&floor=1', [1195, 1700], 'etage', 21], ['U4', '&wave=31&floor=1', [1990, 2245], 'etage', 31]]) {
    test(`budget ${id}, pire cas du sang (cadavres et taches à pleine charge, 10 zombies vivants) : au plus 45 000 triangles et 400 appels`, async ({ page }, testInfo) => {
      await open(page, `&nospawn=1&shadows=1${query}`);
      const r = await page.evaluate(([pl, f, w, types]) => {
        const zs = window.__zs;
        zs.setPlayer(pl[0], pl[1]);
        zs.setLevels({ degats: 10 });
        zs.setChutes(9);
        zs.setInput({ aim: { angle: 0 } });
        const p = zs.getState().player;
        for (let k = 0; k < 6; k += 1) {
          zs.spawnEnemy(p.x + 90 + k * 8, p.y + (k - 2.5) * 10, { type: types[k % 4], gait: 'lent', wave: 1, floor: f, mode: 'dedans' });
          const before = zs.getState().kills;
          for (let i = 0; i < 120 && zs.getState().kills === before; i += 1) zs.step(0.05);
        }
        zs.killAll();
        zs.setLevels({ degats: 0 });
        zs.setInput({ aim: { angle: Math.PI } });
        for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: types[i % 4], gait: 'marche', wave: w, floor: f });
        zs.step(0.05);
        zs.sampleScreen(0, 0, 8, 8);
        const st = zs.getState();
        return { ...st.render, alive: st.enemies.length, kills: st.kills, blood: st.persos.blood };
      }, [player, floor, wave, T]);
      testInfo.annotations.push({ type: 'rendu', description: `${id} pire cas : ${r.calls} appels, ${r.triangles} triangles, ${r.blood.cadavres} cadavres, ${r.blood.taches} taches` });
      console.log(`BUDGET 3m ${id} pire cas : ${r.calls} / ${r.triangles} (${r.blood.cadavres} cadavres, ${r.blood.taches} taches, ${r.alive} vivants)`);
      expect(r.kills).toBe(6);
      expect(r.alive).toBe(10);
      expect(r.blood.cadavres).toBe(2);
      expect(r.calls).toBeLessThanOrEqual(400);
      expect(r.triangles).toBeLessThanOrEqual(45_000);
    });
  }

  test('?perso=, ?sang= et ?usure= ne déclenchent pas le mode essai : la sauvegarde reste écrite (store=local)', async ({ page }) => {
    await open(page, '&store=local&perso=B&sang=reduit&usure=2');
    // Lot 8h : la progression v2 (zs.save.v2) est écrite à la fin d'une manche (la monnaie jaune, elle, n'est jamais écrite).
    const s = await page.evaluate(() => {
      window.__zs.step(3.2);
      window.__zs.skipWave();
      window.__zs.step(0.2);
      window.__zs.flushSave();
      return { save: window.__zs.getState().save, stored: localStorage.getItem('zs.save.v2') !== null };
    });
    expect(s.save.readOnly).toBe(false);
    expect(s.stored).toBe(true);
  });

  test('aucune fuite de géométrie ni de texture après 10 allers-retours d\'étage et 3 « Rejouer »', async ({ page }) => {
    await open(page, '&nospawn=1&wave=21');
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

  test('personnages et sang suivent l\'étage', async ({ page }) => {
    await open(page, '&nospawn=1&wave=21&floor=1');
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
    expect(r).toMatchObject({ kills: 1, down: 0 });
    expect(r.up).toBeGreaterThan(0);
  });

  test('?map=salle fonctionne par défaut', async ({ page }) => {
    await open(page, '&map=salle&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(1));
    const s = await S(page);
    expect(s.map.id).toBe('salle');
    expect(s.persos.characters.zombies).toBe(10);
  });

});

// Lot 3m-C : leviers de chargement (le sang ne coûte rien tant qu'il ne sert pas) et compatibilité avec les autres refontes de lot-4b.
test.describe('personnages intégrés : chargement et compatibilité', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('?sang=0 : blood-fx.js n\'est jamais demandé ; aucun maillage de sang, personnages v2 quand même', async ({ page }) => {
    const files = [];
    page.on('request', (r) => files.push(new URL(r.url()).pathname));
    await open(page, '&nospawn=1&sang=0');
    await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.spawnEnemy(p.x + 150, p.y, { type: 'petit', gait: 'lent', wave: 1 });
      zs.setInput({ aim: { angle: 0 } });
      for (let i = 0; i < 60 && zs.getState().kills === 0; i += 1) zs.step(0.05);
      zs.step(0.5);
    });
    const s = await S(page);
    expect(files).not.toContain('/js/game/blood-fx.js');
    expect(s.persos).toMatchObject({ sang: '0', slots: EXPECTED, blood: { particules: 0, taches: 0, cadavres: 0, calls: 0 } });
    expect(s.kills).toBeGreaterThan(0);
  });

  test('?perso=actuel&sang=0 (lot 5e : comme ?sang=0) : table des choix et modules v2 demandés, ni le sang ni l\'ancien modèle', async ({ page }) => {
    const files = [];
    page.on('request', (r) => files.push(new URL(r.url()).pathname));
    await open(page, '&nospawn=1&perso=actuel&sang=0');
    for (const f of ['/data/game/persos-choix.json', '/js/game/character-v2.js', '/js/game/persos-runtime.js']) expect(files).toContain(f);
    for (const f of ['/js/game/blood-fx.js', ...OLD]) expect(files).not.toContain(f);
  });

  test('sang au premier usage : aucune tache ni particule avant le premier impact, puis des taches', async ({ page }) => {
    await open(page, '&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(2);
      const before = { ...zs.getState().persos.blood };
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 1 });
      zs.setInput({ aim: { angle: 0 } });
      for (let i = 0; i < 40 && zs.getState().kills === 0; i += 1) zs.step(0.05);
      return { before, after: zs.getState().persos.blood };
    });
    expect(r.before).toMatchObject({ particules: 0, taches: 0, cadavres: 0 });
    expect(r.after.taches).toBeGreaterThan(0);
  });

  for (const q of ['&wave=31', '&wave=31&floor=1']) {
    test(`visite libre (lot 3g, ?nospawn=1${q}) : ni zombie ni cadavre en 30 s ; joueur v2 affiché`, async ({ page }) => {
      await open(page, `&nospawn=1${q}`);
      const r = await page.evaluate(() => {
        const zs = window.__zs;
        zs.setInput({ move: { x: 0.6, y: 0.3 } });
        for (let i = 0; i < 60; i += 1) zs.step(0.5);
        zs.setInput({});
        const s = zs.getState();
        return { enemies: s.enemies.length, corpses: s.persos.blood.cadavres, taches: s.persos.blood.taches, pose: s.pose, slots: s.persos.slots };
      });
      expect(r).toMatchObject({ enemies: 0, corpses: 0, taches: 0 });
      expect(r.pose).toMatchObject({ slot: 'joueur', choice: EXPECTED.joueur });
    });
  }

  test('interface (lot 3l) : le panneau de pause reste au-dessus des personnages, du sang et des cadavres', async ({ page }) => {
    await open(page, '&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => {
      window.__zs.setLevels({ degats: 10 });
      for (let i = 0; i < 80; i += 1) window.__zs.step(0.05);
    });
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-panel')).toBeVisible();
    const r = await page.evaluate(() => {
      const panel = document.getElementById('pause-panel');
      const box = panel.querySelector('.panel, [class*="panel"]')?.getBoundingClientRect() ?? panel.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { inPanel: panel.contains(top), inCanvas: document.getElementById('game-canvas').contains(top), blood: window.__zs.getState().persos.blood.taches };
    });
    expect(r).toMatchObject({ inPanel: true, inCanvas: false });
    expect(r.blood).toBeGreaterThan(0);
  });

  test('sons (lot 3i) : tuer des zombies ne joue que des sons existants (aucun son nouveau du lot)', async ({ page }) => {
    const ids = load('data/game/sounds.json').sounds.map((x) => x.id);
    await open(page, '&nospawn=1');
    await page.mouse.click(300, 200); // premier geste : le son peut démarrer
    await spawnTen(page);
    const log = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setLevels({ degats: 10 });
      for (let i = 0; i < 80; i += 1) zs.step(0.05);
      return zs.getState().audio.log.map((e) => e.sound ?? e.id).filter(Boolean);
    });
    for (const id of new Set(log)) expect(ids, id).toContain(id);
  });

  test('HUD lisible au pire cas (1440 × 900) : cadavres et taches sous chaque bloc du HUD', async ({ page }) => {
    await open(page, '&nospawn=1', { width: 1440, height: 900 });
    const r = await page.evaluate((types) => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.setInput({ aim: { angle: 0 } });
      for (let k = 0; k < 4; k += 1) {
        zs.spawnEnemy(p.x + 90 + k * 8, p.y, { type: types[k], gait: 'lent', wave: 1 });
        const before = zs.getState().kills;
        for (let i = 0; i < 120 && zs.getState().kills === before; i += 1) zs.step(0.05);
      }
      const probe = document.createElement('style');
      probe.textContent = '#hud, #hud * { pointer-events: auto !important; }';
      document.head.append(probe);
      const hud = document.getElementById('hud');
      const covered = [...hud.querySelectorAll('.hud-block')].filter((b) => !b.hidden && b.getBoundingClientRect().width > 0).filter((b) => {
        const box = b.getBoundingClientRect();
        return !hud.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
      }).map((b) => b.id);
      probe.remove();
      return { covered, blood: zs.getState().persos.blood };
    }, T);
    expect(r.covered).toEqual([]);
    expect(r.blood.cadavres).toBeGreaterThan(0);
  });
});
