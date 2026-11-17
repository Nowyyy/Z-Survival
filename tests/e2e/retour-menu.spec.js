// Lot 9d : retour au menu sans rechargement (Docs/ref/retour-menu.md). Une partie libérée ne laisse rien : contexte WebGL, rappels d'image,
// minuteries, calculateur, canal entre onglets, écouteurs de window / document / body, mémoire Three.js ; le tas reste borné.
import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';

// Compteurs injectés avant tout script : contextes WebGL vivants (références faibles), setInterval actifs, rappels d'image en attente,
// calculateurs, canaux entre onglets.
function instrumenter() {
  const ctxs = [];
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = get.call(this, type, ...a);
    if (c && /webgl/.test(type) && !ctxs.some((w) => w.deref() === c)) ctxs.push(new WeakRef(c));
    return c;
  };
  const intervals = new Set();
  const si = window.setInterval.bind(window);
  const ci = window.clearInterval.bind(window);
  window.setInterval = (...a) => {
    const id = si(...a);
    intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    intervals.delete(id);
    return ci(id);
  };
  const rafs = new Set();
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => {
    const id = raf((t) => {
      rafs.delete(id);
      f(t);
    });
    rafs.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafs.delete(id);
    return caf(id);
  };
  const workers = new Set();
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      workers.add(this);
    }
    terminate() {
      workers.delete(this);
      return super.terminate();
    }
  };
  const canaux = new Set();
  const B = window.BroadcastChannel;
  window.BroadcastChannel = class extends B {
    constructor(...a) {
      super(...a);
      canaux.add(this);
    }
    close() {
      canaux.delete(this);
      return super.close();
    }
  };
  window.__ressources = () => ({
    webgl: ctxs.filter((w) => w.deref() && !w.deref().isContextLost()).length,
    intervals: intervals.size, raf: rafs.size, workers: workers.size, canaux: canaux.size, canvas: document.querySelectorAll('canvas').length,
  });
}

// Écouteurs posés sur window, document et body (protocole de débogage de Chrome) et tas après ramasse-miettes (Mo).
async function sonde(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const ecouteurs = {};
    for (const expr of ['window', 'document', 'document.body']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
      ecouteurs[expr] = (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
    }
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    return { ...(await page.evaluate(() => window.__ressources())), ecouteurs, tasMo: m.JSHeapUsedSize / 1048576, zs: await page.evaluate(() => typeof window.__zs) };
  };
}

test.describe('lot 9d : libération de la partie', () => {
  test('dix cycles partie → libération → nouvelle partie dans la même page (libération appelée directement) : rien ne reste, mémoire Three.js à 0, tas borné', async ({ page }) => {
    test.setTimeout(240_000);
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.addInitScript(instrumenter);
    await page.goto('/jeu.html?test=1&seed=1');
    await waitReady(page);
    const mesurer = await sonde(page);
    let reference = null;
    let tas1 = null;
    for (let i = 0; i < 10; i += 1) {
      if (i > 0) {
        await page.evaluate(() => window.__zsCycle.demarrer());
        await waitReady(page);
      }
      await page.evaluate(() => window.__zs.step(1));
      const jeu = await page.evaluate(() => window.__ressources());
      expect([jeu.webgl, jeu.canvas], `cycle ${i + 1} : un seul contexte WebGL vivant pendant la partie`).toEqual([1, 1]);
      const rapport = await page.evaluate(() => window.__zsCycle.liberer());
      expect(rapport, `cycle ${i + 1}`).toEqual({ memoire: { geometries: 0, textures: 0 }, contextePerdu: true, erreurs: [] });
      const apres = await mesurer();
      expect({ webgl: apres.webgl, intervals: apres.intervals, raf: apres.raf, workers: apres.workers, canaux: apres.canaux, canvas: apres.canvas, zs: apres.zs }, `cycle ${i + 1}`)
        .toEqual({ webgl: 0, intervals: 0, raf: 0, workers: 0, canaux: 0, canvas: 0, zs: 'undefined' });
      reference ??= apres.ecouteurs;
      expect(apres.ecouteurs, `cycle ${i + 1} : écouteurs revenus à ceux de la page sans partie`).toEqual(reference);
      tas1 ??= apres.tasMo;
      if (i === 9) expect(apres.tasMo - tas1, 'croissance du tas entre le 1er et le 10e cycle (Mo)').toBeLessThan(4);
    }
    // La page sans partie garde seulement ses propres écouteurs (jeu.html) et ceux de l'outil de test.
    expect(reference.document).toBe(0);
    expect(reference['document.body']).toBe(0);
    expect(erreurs).toEqual([]);
  });
});
