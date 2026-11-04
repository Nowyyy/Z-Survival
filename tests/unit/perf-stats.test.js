// Lot 5b-A : mesure de fluidité (?perf=1). Logique pure de js/core/perf-stats.js, profileur (js/game/profiler.js, horloge simulée) et plafond
// d'images (js/game/frame-cap.js) : percentiles, images longues, fréquence d'écran, accrocs au premier usage, rapport, entrées hostiles.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capPlan, createFrameLog, createHistogram, firstUseHitches, formatReport, fr, frameSummary, longFrames, paramsLine, parseCap, percentile, refreshRate, summarizeUA } from '../../js/core/perf-stats.js';
import { createProfiler, STAGES } from '../../js/game/profiler.js';
import { createFrameGate, gateFromParam } from '../../js/game/frame-cap.js';
import { EVENT_TEXTS, PANEL_TEXTS, REPORT_TEXTS } from '../../js/game/perf-panel.js';

const HOSTILE = [null, undefined, 42, 'texte', {}, [NaN, -1, Infinity, '3', null], Symbol('x')];

describe('percentiles et images longues', () => {
  it('percentile par rang le plus proche ; liste vide ou hostile : 0', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([7], 99)).toBe(7);
    for (const h of HOSTILE) expect(percentile(h, 50)).toBe(0);
    expect(percentile([3, 1, 2], 'x')).toBe(2);
  });
  it('images longues : au-delà de 1,5 × et 2 × la médiane', () => {
    const v = [16, 16, 16, 16, 25, 33, 40];
    expect(longFrames(v)).toEqual({ over15: 3, over2: 2 });
    expect(longFrames([], 0)).toEqual({ over15: 0, over2: 0 });
  });
  it('résumé : médiane, p95, p99, maximum ; les valeurs invalides sont ignorées', () => {
    const s = frameSummary([16.7, 16.7, 16.6, 33.4, NaN, -5, 'a']);
    expect(s).toMatchObject({ count: 4, median: 16.7, max: 33.4, over15: 1, over2: 0 });
    expect(frameSummary(null)).toEqual({ count: 0, median: 0, p95: 0, p99: 0, max: 0, over15: 0, over2: 0, fps: 0 });
    expect(frameSummary(Array(60).fill(1000 / 60)).fps).toBeCloseTo(60, 6);
    expect(frameSummary([10, 30]).fps).toBeCloseTo(50, 6); // 2 images en 40 ms
  });
  it('fréquence d\'écran arrondie à 30, 60, 90 ou 120 Hz ; sans mesure : null', () => {
    expect(refreshRate(Array(20).fill(16.67))).toBe(60);
    expect(refreshRate(Array(20).fill(11.1))).toBe(90);
    expect(refreshRate(Array(20).fill(8.33))).toBe(120);
    expect(refreshRate(Array(20).fill(33.3))).toBe(30);
    expect(refreshRate([12.5, 12.5])).toBe(90); // 80 Hz : 90 est le plus proche
    expect(refreshRate([])).toBeNull();
    for (const h of HOSTILE) expect(() => refreshRate(h)).not.toThrow();
  });
  it('lot 5b-F : jeu trop lent pour la cadence proposée : la cadence reste celle de la page, les images obtenues disent la lenteur', () => {
    // Élevé sur l'iPhone 16 Pro Max (Safari, 60 images/s proposées) : une partie des images à 16,7 ms, les autres sautent une ou deux cadences.
    const elevé = [...Array(30).fill(16.7), ...Array(50).fill(33.3), ...Array(20).fill(50)];
    expect(percentile(elevé, 50)).toBeCloseTo(33.3, 6); // l'ancienne estimation (médiane) donnait 30 Hz
    expect(refreshRate(elevé)).toBe(60);
    expect(frameSummary(elevé).fps).toBeCloseTo(100000 / (30 * 16.7 + 50 * 33.3 + 20 * 50), 6);
    // Téléphone à 120 Hz qui n'en tient que la moitié la plupart du temps : 120 Hz proposés, environ 65 images/s obtenues.
    const android = [...Array(15).fill(8.33), ...Array(85).fill(16.67)];
    expect(refreshRate(android)).toBe(120);
    expect(Math.round(frameSummary(android).fps)).toBe(65);
    // Jamais une image à la cadence (toutes au double) : la page est lue à la moitié, faute d'autre indice ; les images obtenues le montrent.
    expect(refreshRate(Array(50).fill(33.3))).toBe(30);
  });
});

describe('histogramme de session', () => {
  it('percentiles à la largeur de case près, maximum exact, images longues', () => {
    const h = createHistogram(0.25, 250);
    for (let i = 0; i < 95; i += 1) h.add(16.7);
    for (let i = 0; i < 5; i += 1) h.add(40);
    h.add(NaN);
    h.add(-3);
    const s = h.summary();
    expect(s.count).toBe(100);
    expect(Math.abs(s.median - 16.7)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(s.p99 - 40)).toBeLessThanOrEqual(0.25);
    expect(s.max).toBe(40);
    expect(s.over2).toBe(5);
    h.add(900); // au-delà du dernier seuil : maximum gardé
    expect(h.summary().max).toBe(900);
    expect(h.summary().fps).toBeCloseTo((1000 * 101) / (95 * 16.7 + 5 * 40 + 900), 6);
    h.clear();
    expect(h.summary().count).toBe(0);
  });
});

describe('journal d\'images glissant', () => {
  it('garde les dernières entrées, fenêtre par horodatage, capacité bornée', () => {
    const log = createFrameLog(16);
    for (let i = 1; i <= 40; i += 1) log.push(i * 100, 16 + (i % 3), 4);
    log.push(NaN, 3);
    log.push(5000, -1);
    expect(log.size).toBe(16);
    const w = log.since(4000, 500);
    expect(w.at).toEqual([3600, 3700, 3800, 3900, 4000]);
    expect(log.since().interval.length).toBe(16);
    log.clear();
    expect(log.size).toBe(0);
  });
});

describe('accrocs au premier usage', () => {
  it('image la plus longue parmi celles qui finissent après l\'événement et commencent dans les 600 ms', () => {
    const frames = [{ at: 1000, duration: 16 }, { at: 1050, duration: 50 }, { at: 1700, duration: 120 }, { at: 2000, duration: 16 }];
    const h = firstUseHitches([{ name: 'tir', at: 1000 }, { name: 'feu', at: 5000 }, { name: 1 }, null], frames);
    expect(h).toEqual([{ name: 'tir', at: 1000, max: 120, frames: 3 }, { name: 'feu', at: 5000, max: null, frames: 0 }]);
    expect(firstUseHitches('x', 'y')).toEqual([]);
  });
});

describe('plafond d\'images (?cap=)', () => {
  it('valeurs acceptées 0, 30, 45, 60 ; tout le reste ignoré', () => {
    expect(['0', '30', '45', '60'].map(parseCap)).toEqual([0, 30, 45, 60]);
    for (const v of ['', '50', '-30', '30.5', '6e1', ' 30', '9999', null, 30, {}]) expect(parseCap(v)).toBeNull();
  });
  it('aligné sur la fréquence de l\'écran ; avertissement quand le plafond ne la divise pas', () => {
    expect(capPlan(60, 30)).toEqual({ every: 2, fps: 30, aligned: true, active: true });
    expect(capPlan(120, 60)).toEqual({ every: 2, fps: 60, aligned: true, active: true });
    expect(capPlan(60, 60)).toEqual({ every: 1, fps: 60, aligned: true, active: false });
    expect(capPlan(90, 60)).toMatchObject({ every: 2, fps: 45, aligned: false });
    expect(capPlan(60, 45)).toMatchObject({ every: 1, aligned: false });
    expect(capPlan(null, 30)).toMatchObject({ every: 1, active: false });
    expect(capPlan(60, 0)).toMatchObject({ every: 1, active: false });
  });
  it('la barrière laisse passer 30 images de calibrage, puis une sur deux à 60 Hz pour ?cap=30', () => {
    const gate = createFrameGate(30);
    let t = 0;
    const passed = [];
    for (let i = 0; i < 60; i += 1) passed.push(gate((t += 16.67)));
    expect(passed.slice(0, 31).every(Boolean)).toBe(true);
    expect(passed.slice(31).filter(Boolean).length).toBe(14);
    expect(gate.state()).toMatchObject({ value: 30, hz: 60, every: 2, aligned: true, calibrating: false });
    expect(gateFromParam('0')).toBeNull();
    expect(gateFromParam('abc')).toBeNull();
    expect(typeof gateFromParam('60')).toBe('function');
  });
});

describe('système, paramètres et rapport', () => {
  it('user-agent résumé sans identifier l\'appareil', () => {
    expect(summarizeUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toEqual({ os: 'iOS 17.4', browser: 'Safari 17.4', mobile: true });
    expect(summarizeUA('Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')).toEqual({ os: 'Android 14', browser: 'Chrome 130', mobile: true });
    expect(summarizeUA('Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36').browser).toBe('Samsung Internet 24');
    for (const h of HOSTILE) expect(() => summarizeUA(h)).not.toThrow();
    expect(summarizeUA(null)).toEqual({ os: 'autre', browser: 'autre', mobile: false });
    // Lot 5b-E : depuis iOS 26, Safari fige iOS à 18.x dans le user-agent ; la version de Safari donne celle d'iOS (iPhone 16 Pro Max du propriétaire : iOS 27).
    const ios27 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
    expect(summarizeUA(ios27)).toEqual({ os: 'iOS 27', browser: 'Safari 27.0', mobile: true, uaOs: '18.7' });
    expect(summarizeUA(ios27.replace('Version/27.0', 'Version/18.7'))).toEqual({ os: 'iOS 18.7', browser: 'Safari 18.7', mobile: true });
    expect(summarizeUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1').os).toBe('iOS 18.7');
    const text = formatReport({ system: summarizeUA(ios27), refresh: 60, stages: { sim: 1, rendu: 0 }, stagesMean: { sim: 0.42, rendu: 1.37 } }).split('\n');
    expect(text[1]).toBe('Système : iOS 27 (user-agent figé à 18.7) · Safari 27.0 · cadence de la page 60 Hz (Safari : 60 images/s par défaut, même sur un écran 120 Hz) · DPR — · canvas 0×0');
    expect(text[5]).toBe('Travail/image (moyenne, ms) : sim 0,4 · rendu 1,4');
  });
  it('paramètres de l\'adresse nettoyés et bornés', () => {
    expect(paramsLine('?perf=1&gfx=moyen&cap=60')).toBe('perf=1&gfx=moyen&cap=60');
    expect(paramsLine('?a=<script>&b')).toBe('a=script&b');
    expect(paramsLine(42)).toBe('');
    expect(paramsLine(`?${'x=1&'.repeat(40)}`).split('&').length).toBe(12);
  });
  it('rapport : une ligne par rubrique, nombres à la française, valeurs absentes sans exception', () => {
    const text = formatReport({
      window: frameSummary([16.7, 16.7, 33.4]), session: frameSummary([16.7]), refresh: 60, dpr: 2, canvas: { width: 1334, height: 750 },
      system: { os: 'Android 14', browser: 'Chrome 130' }, preset: 'moyen (auto)', params: 'perf=1', stages: { sim: 1.25, rendu: 4 },
      renderer: { calls: 62, triangles: 38479, programs: 14, geometries: 200, textures: 18 }, longTasks: { supported: true, count: 2, max: 87, total: 140 },
      hitches: [{ name: 'tir', max: 45.4 }, { name: 'feu', max: null }], heapMB: 45.25, cap: { value: 60, every: 2, aligned: false },
    });
    const lines = text.split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe('Z-Survival — rapport de fluidité v1');
    expect(lines[1]).toBe('Système : Android 14 · Chrome 130 · cadence de la page 60 Hz · DPR 2,00 · canvas 1334×750');
    expect(lines[3]).toContain('médiane 16,7 ms');
    expect(lines[3]).toMatch(/^5 s : 3 images \(45 i\/s obtenues\) · /);
    expect(lines[5]).toBe('Travail/image (moyenne, ms) : sim 1,3 · rendu 4,0');
    expect(lines[6]).toBe('Rendu : 62 appels · 38479 triangles · 14 programmes · 200 géométries · 18 textures');
    expect(lines[8]).toBe('Premier usage (max image dans les 600 ms) : tir 45 ms · feu —');
    expect(lines[9]).toBe('Mémoire JS : 45,3 Mo');
    expect(lines[10]).toContain('non aligné');
    for (const h of HOSTILE) expect(() => formatReport(h)).not.toThrow();
    const empty = formatReport({ longTasks: { supported: false } }).split('\n');
    expect(empty[7]).toBe('Tâches longues : non prises en charge');
    expect(empty[9]).toBe('Mémoire JS : non disponible');
    expect(fr(1.25)).toBe('1,3');
    expect(fr(undefined)).toBe('—');
  });
  it('les libellés viennent de fr.json (game.perf.report.*) et chaque clé utilisée existe', () => {
    const dict = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    for (const key of [...Object.values(PANEL_TEXTS), ...Object.values(REPORT_TEXTS), ...Object.values(EVENT_TEXTS)]) expect(dict[key], key).toBeTypeOf('string');
    expect(Object.keys(EVENT_TEXTS).filter((k) => k.startsWith('zombie-')).sort()).toEqual(['zombie-grand', 'zombie-marcheur', 'zombie-petit', 'zombie-voute']);
  });
});

describe('profileur (horloge simulée)', () => {
  const fakeClock = () => {
    let t = 0;
    return { now: () => t, add: (d) => { t += d; } };
  };
  it('temps par étape, intervalles, images en pause écartées, premiers usages', () => {
    const c = fakeClock();
    const p = createProfiler({ now: c.now, search: '?perf=1', ua: 'Mozilla/5.0 (Linux; Android 14; K) Chrome/130.0 Mobile', observe: null });
    const sim = { bullets: [], enemies: [], kills: 0, waves: { phase: 'attente' } };
    let ts = 0;
    for (let i = 0; i < 40; i += 1) {
      p.begin((ts += 16.7), false);
      for (const k of STAGES) {
        c.add(1);
        p.mark(k);
      }
      if (i === 10) sim.bullets = [{ id: 1 }];
      if (i === 20) sim.enemies = [{ type: 'grand', health: 5, maxHealth: 10 }];
      if (i === 30) sim.waves = { phase: 'combat' };
      p.end(sim);
    }
    p.begin(ts + 16.7, true); // pause : non comptée
    p.mark('sim');
    p.end(sim);
    const s = p.state({ preset: 'eleve' });
    expect(s.session.count).toBe(39);
    expect(s.window.median).toBeCloseTo(16.7, 3);
    expect(s.refresh).toBe(60);
    expect(s.stages).toMatchObject({ sim: 1, poses: 1, rendu: 1, total: 6 });
    expect(s.hitches.map((h) => h.name)).toEqual(['tir', 'sang', 'zombie-grand', 'manche', 'pause']);
    expect(s.hitches[0].max).toBeCloseTo(16.7, 3);
    expect(s.longTasks.supported).toBe(false);
    expect(s.system).toMatchObject({ os: 'Android 14', mobile: true });
    expect(s.preset).toBe('eleve');
    p.reset();
    expect(p.state().session.count).toBe(0);
    expect(p.state().hitches).toHaveLength(5); // les premiers usages restent
  });
  it('appels hors image et entrées hostiles : sans exception ni effet', () => {
    const p = createProfiler({ now: () => 0, observe: null });
    expect(() => {
      p.mark('sim');
      p.end(null);
      p.begin('x');
      p.begin(NaN);
      p.mark('inconnu');
      p.end(42);
      p.attach({});
      p.attach();
    }).not.toThrow();
    expect(p.state().session.count).toBe(0);
  });
});
