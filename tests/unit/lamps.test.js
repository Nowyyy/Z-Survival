// Lot 5k-B : lampes à huile (décor non solide). Modèle pur (js/core/lamps.js : 60 triangles au plus, déterministe, aucun sommet sous le sol, faces
// orientées), sources en pixels (data/game/maps/rez-de-chaussee/lampes.json) et dérivé lampes.world.json (npm run carte), portée sûre (l'autre étage
// jamais atteint), lampes absentes des données de collision (ni obstacle, ni mur : balles, laser et zombies passent), jetons --game-lamp-*.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseFactors, firesToWorld, FLAME_TOP, FLICKER_MAX, flicker, LAMP_COLORS, lampPhase, lampsToWorld, lampTriangles, LIGHT_DEFAULTS, MAX_TRIANGLES, ORIENTATIONS, parseLampSource, parseLightConfig, selectLamps, stepSlots } from '../../js/core/lamps.js';
import { firstOnSegment } from '../../js/core/collision.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const SOURCE = load(`${DIR}/lampes.json`);
const DERIVED = load(`${DIR}/lampes.world.json`);
const RDC = load(`${DIR}/world.json`);
const ETAGE = load(`${DIR}/etage.world.json`);
const RENDER = load('data/game/render.json');
const LUMIERES = load('data/game/lumieres.json');
const PARAMS = load('data/game/maps/params.json');
const LAMPS = DERIVED.lampes;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

describe('modèle d\'une lampe', () => {
  it('60 triangles au plus par lampe, 8 triangles de flamme émissive, déterministe, aucun sommet sous le sol, faces orientées vers leur normale', () => {
    expect(LAMPS.length).toBeGreaterThan(0);
    for (const l of LAMPS) {
      const t = lampTriangles(l);
      expect(t.length, l.id).toBeLessThanOrEqual(MAX_TRIANGLES);
      expect(MAX_TRIANGLES).toBe(60);
      expect(t.filter((q) => q.glow === 1)).toHaveLength(8);
      expect(lampTriangles(structuredClone(l))).toEqual(t); // mêmes entrées, mêmes triangles (aucun hasard)
      for (const q of t) {
        expect(Object.values(LAMP_COLORS)).toContain(q.color);
        for (const p of q.p) {
          expect(p.every(Number.isFinite)).toBe(true);
          expect(p[1], l.id).toBeGreaterThan(0); // aucun sommet sous le sol de son étage
          expect(p[1]).toBeLessThan(l.hauteur + FLAME_TOP + 0.01);
        }
        expect(dot(cross(sub(q.p[1], q.p[0]), sub(q.p[2], q.p[0])), q.n), l.id).toBeGreaterThan(0); // face avant du côté de la normale
      }
      // La lampe sort de son support (rien derrière la face du mur ou du pilier, sauf le collier qui l'entoure).
      if (l.support === 'mur') for (const q of t) for (const p of q.p) expect((p[0] - l.x) * l.n.x + (p[2] - l.y) * l.n.y).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(DERIVED.triangles).toBe(LAMPS.reduce((n, l) => n + lampTriangles(l).length, 0));
    expect(DERIVED.triangles).toBeLessThanOrEqual(1500); // budget du lot : triangles ≤ +1 500 pour l'ensemble
  });
  it('jetons --game-lamp-* dans un bloc isolé de tokens.css, lus par palette.js ; aucune couleur dans le JavaScript des lampes', () => {
    const css = readFileSync('css/tokens.css', 'utf8');
    const block = css.slice(css.indexOf('/* Lampes à huile (lot 5k)'));
    const body = block.slice(0, block.indexOf('}'));
    for (const token of [...Object.values(LAMP_COLORS), '--game-lamp-light']) expect(body, token).toMatch(new RegExp(`${token}: #[0-9a-f]{6};`));
    const palette = readFileSync('js/game/palette.js', 'utf8');
    for (const name of ['lamp-metal', 'lamp-reservoir', 'lamp-flame', 'lamp-core', 'lamp-light']) expect(palette).toContain(`'${name}'`);
    for (const f of ['js/core/lamps.js', 'js/game/lamps.js']) expect(readFileSync(f, 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
  });
});

describe('sources des lampes et dérivé', () => {
  it('lampes.json valide : 8 à 10 lampes au rez-de-chaussée, 6 à 8 à l\'étage, sur des piliers et des murs des deux étages, provisoires', () => {
    const { items, warnings } = parseLampSource(SOURCE);
    expect(warnings).toEqual([]);
    expect(items).toHaveLength(SOURCE.lampes.length);
    const of = (f) => items.filter((l) => l.floor === f);
    expect(of('rdc').length).toBeGreaterThanOrEqual(8);
    expect(of('rdc').length).toBeLessThanOrEqual(10);
    expect(of('etage').length).toBeGreaterThanOrEqual(6);
    expect(of('etage').length).toBeLessThanOrEqual(8);
    for (const f of ['rdc', 'etage']) for (const s of ['pilier', 'mur']) expect(of(f).some((l) => l.support === s), `${f} ${s}`).toBe(true);
    expect(SOURCE._provisoire).toMatch(/PIXELS/);
  });
  it('entrées hostiles : lampe invalide ignorée avec un avertissement, aucune exception', () => {
    for (const h of [null, 42, 'x', [], {}, { lampes: 'x' }, { lampes: [null, 1, {}] }]) expect(() => parseLampSource(h)).not.toThrow();
    const bad = parseLampSource({ lampes: [
      { id: 'a', floor: 'cave', support: 'mur', x: 1, y: 1, orientation: 'n', hauteur: 40 },
      { id: 'b', floor: 'rdc', support: 'plafond', x: 1, y: 1, orientation: 'n', hauteur: 40 },
      { id: 'c', floor: 'rdc', support: 'mur', x: 1, y: 1, orientation: 'nord', hauteur: 40 },
      { id: 'd', floor: 'rdc', support: 'mur', x: 1, y: 1, orientation: 'n', hauteur: 5 },
      { id: 'Mauvais id', floor: 'rdc', support: 'mur', x: 1, y: 1, orientation: 'n', hauteur: 40 },
      { id: 'e', floor: 'rdc', support: 'mur', x: 1, y: 1, orientation: 'n', hauteur: 40 },
      { id: 'e', floor: 'rdc', support: 'mur', x: 2, y: 2, orientation: 'n', hauteur: 40 },
    ] });
    expect(bad.items.map((l) => l.id)).toEqual(['e']);
    expect(bad.warnings).toHaveLength(6);
    // Sans support à moins de 40 unités, hors du bâtiment ou sur une fenêtre : un problème (npm run carte échoue).
    const far = lampsToWorld({ lampes: [{ id: 'loin', floor: 'rdc', support: 'pilier', x: 10, y: 10, orientation: 's', hauteur: 48 }, { id: 'f1', floor: 'rdc', support: 'mur', x: 75, y: 24, orientation: 's', hauteur: 48 }] }, { rdc: RDC, etage: ETAGE }, { floorLift: RENDER.floorLift });
    expect(far.lamps).toEqual([]);
    expect(far.problems).toHaveLength(2);
    expect(far.problems[1]).toMatch(/fenêtre F1/);
  });
  it('npm run carte : lampes.world.json à jour, aucune règle cassée, mondes et décor inchangés par les lampes', () => {
    const out = generateMapFiles('rez-de-chaussee');
    expect(out.lampes).toBe(readFileSync(`${DIR}/lampes.world.json`, 'utf8'));
    expect(out.problems).toEqual([]);
    expect(out.report.valid).toBe(true);
    expect(out.lampesReport).toMatchObject({ count: SOURCE.lampes.length, problems: [], warnings: [] });
    expect(out.world).toBe(readFileSync(`${DIR}/world.json`, 'utf8'));
    expect(out.etage).toBe(readFileSync(`${DIR}/etage.world.json`, 'utf8'));
    expect(out.decorInterieur).toBe(readFileSync(`${DIR}/decor-interieur.world.json`, 'utf8'));
    expect(DERIVED._provisoire).toMatch(/ne jamais éditer à la main/);
  });
  it('chaque lampe est collée à la face de son support (pilier ou mur), dans le bâtiment, loin des fenêtres', () => {
    for (const l of LAMPS) {
      const w = l.floor === 'rdc' ? RDC : ETAGE;
      expect(ORIENTATIONS[l.orientation]).toEqual([l.n.x, l.n.y]);
      if (l.support === 'pilier') {
        const p = w.obstacles.find((o) => o.id === l.on);
        expect(p.kind).toBe('pilier');
        const onFace = [p.x, p.x + p.w].includes(l.x) || [p.y, p.y + p.h].includes(l.y);
        expect(onFace, l.id).toBe(true);
      } else {
        const s = w.walls.find((q) => q.id === l.on);
        expect(s, l.id).toBeTruthy();
        const face = s.x1 === s.x2 ? Math.abs(l.x - s.x1) : Math.abs(l.y - s.y1);
        expect(face, l.id).toBe(PARAMS.wallThickness / 2);
      }
      for (const win of w.windows) expect(Math.hypot(win.x - l.x, win.y - l.y), `${l.id} ${win.id}`).toBeGreaterThan(150); // hors des couloirs d'approche
    }
  });
});

describe('portée sûre : l\'autre étage n\'est jamais atteint', () => {
  it('rez-de-chaussée : portée < hauteur d\'étage − hauteur de la lumière (le sol de l\'étage est au-dessus) ; étage : portée < distance aux trous des escaliers', () => {
    const lift = RENDER.floorLift;
    for (const l of LAMPS) {
      expect(l.portee, l.id).toBeGreaterThan(0);
      if (l.floor === 'rdc') expect(l.portee + l.light.h, l.id).toBeLessThan(lift);
      else {
        for (const s of ETAGE.stairs) {
          const dx = Math.max(s.x - l.light.x, 0, l.light.x - (s.x + s.w));
          const dy = Math.max(s.y - l.light.y, 0, l.light.y - (s.y + s.h));
          expect(l.portee, `${l.id} ${s.id}`).toBeLessThan(Math.hypot(dx, dy, l.light.h));
        }
      }
    }
  });
});

describe('feux comme sources de lumière (lot 5k-G)', () => {
  it('feux intérieurs de feux.json : dans lampes.world.json, au-dessus de leur pièce, portée sûre (jamais l\'autre étage)', () => {
    const feux = load(`${DIR}/feux.json`).feux;
    const pieces = load(`${DIR}/mobilier.world.json`).pieces;
    const out = firesToWorld(feux, pieces, { rdc: RDC, etage: ETAGE }, { wallThickness: PARAMS.wallThickness, floorLift: RENDER.floorLift });
    expect(out).toEqual(DERIVED.feux);
    expect(out.map((f) => f.id)).toEqual(feux.map((f) => f.id));
    for (const f of out) {
      const top = Math.max(...pieces[feux.find((q) => q.id === f.id).piece].boxes.map((b) => b.y1));
      expect(f.light.h, f.id).toBeGreaterThan(top);
      expect(f.portee, f.id).toBeGreaterThan(0);
      if (f.floor === 'rdc') expect(f.portee + f.light.h, f.id).toBeLessThan(RENDER.floorLift);
      else for (const st of ETAGE.stairs) {
        const dx = Math.max(st.x - f.light.x, 0, f.light.x - (st.x + st.w));
        const dy = Math.max(st.y - f.light.y, 0, f.light.y - (st.y + st.h));
        expect(f.portee, `${f.id} ${st.id}`).toBeLessThan(Math.hypot(dx, dy, f.light.h));
      }
    }
    // Vacillement des feux : borné comme celui des lampes.
    const c = parseLightConfig(LUMIERES);
    expect(c.feux.vacillement.amplitude).toBeLessThanOrEqual(0.15);
    for (const fq of c.feux.vacillement.frequences) expect(fq).toBeLessThanOrEqual(1.4);
    expect(parseLightConfig({ feux: { vacillement: { amplitude: 0.5, frequences: [9] } } }).feux.vacillement).toEqual(LIGHT_DEFAULTS.feux.vacillement);
  });
});

describe('lampes couvertes par l\'étage', () => {
  it('une lampe du rez-de-chaussée sous le sol de l\'étage est marquée « couverte » (jamais dessinée quand l\'étage est affiché) ; les autres non', () => {
    const rdc = LAMPS.filter((l) => l.floor === 'rdc');
    expect(rdc.every((l) => typeof l.couverte === 'boolean')).toBe(true);
    expect(LAMPS.filter((l) => l.floor === 'etage').every((l) => !('couverte' in l))).toBe(true);
    // L'aile est du rez-de-chaussée (au-delà de x 2 265) n'a pas d'étage au-dessus : ses lampes restent visibles d'en haut.
    for (const l of rdc) if (l.x > 2290) expect(l.couverte, l.id).toBe(false);
    expect(rdc.filter((l) => l.couverte).length).toBeGreaterThan(0);
  });
});

describe('non solide', () => {
  it('aucune lampe dans les obstacles, les murs, les ouvertures ou les zones : balles, laser et zombies passent', () => {
    const ids = new Set(LAMPS.map((l) => l.id));
    for (const w of [RDC, ETAGE]) {
      for (const list of [w.obstacles, w.walls, w.openings, w.pillars, w.stairs]) for (const o of list ?? []) expect(ids.has(o.id)).toBe(false);
      expect(JSON.stringify(w)).not.toMatch(/lampe/);
    }
    // Un tir qui frôle la lampe devant son support (12 unités devant la face, parallèle à elle) ne touche ni la lampe ni son support.
    for (const l of LAMPS) {
      const w = l.floor === 'rdc' ? RDC : ETAGE;
      const support = w.obstacles.filter((o) => o.id === l.on);
      const [cx, cy] = [l.x + l.n.x * 12, l.y + l.n.y * 12];
      const [sx, sy] = [-l.n.y * 20, l.n.x * 20];
      expect(firstOnSegment(cx - sx, cy - sy, cx + sx, cy + sy, support), l.id).toBeNull();
    }
  });
});

// ---- Lot 5k-C : lumières dynamiques (logique pure) ----
describe('lumieres.json et lumière de base', () => {
  it('valeurs reconnues telles quelles (aucune ramenée au défaut), provisoires ; plancher : l\'ambiante ne descend jamais sous plancherAmbiance', () => {
    const c = parseLightConfig(LUMIERES);
    for (const k of ['ambiance', 'plancherAmbiance', 'intensite', 'distance', 'decroissance', 'fondu', 'max', 'distanceActivation']) expect(c[k], k).toBe(LUMIERES[k]);
    expect(c.vacillement).toEqual(LUMIERES.vacillement);
    // Lot 5k-G : lune (et ses ombres) séparée, ombres des lumières, feux comme sources.
    expect(c.lune).toBe(LUMIERES.lune);
    expect(c.ombres).toEqual(LUMIERES.ombres);
    expect(c.feux).toEqual(LUMIERES.feux);
    expect(LUMIERES._provisoire).toMatch(/PROVISOIRES/);
    expect(baseFactors(c)).toEqual({ ambient: Math.max(c.ambiance, c.plancherAmbiance), sun: c.lune });
    expect(baseFactors({ ...c, ambiance: 0 }).ambient).toBe(c.plancherAmbiance);
    expect(c.plancherAmbiance).toBeGreaterThan(0);
  });
  it('entrées hostiles : défauts, aucune exception ; vacillement borné (amplitude ≤ 0,15, fréquences ≤ 1,4 Hz)', () => {
    for (const h of [null, 42, 'x', [], {}, { vacillement: 3 }]) expect(parseLightConfig(h)).toEqual(parseLightConfig(null));
    expect(parseLightConfig(null)).toMatchObject({ ambiance: LIGHT_DEFAULTS.ambiance, max: 4 });
    const wild = parseLightConfig({ ambiance: 3, plancherAmbiance: 0, max: 5, vacillement: { amplitude: 0.9, frequences: [12, 0.5, -1] } });
    expect(wild.ambiance).toBe(LIGHT_DEFAULTS.ambiance);
    expect(wild.plancherAmbiance).toBe(LIGHT_DEFAULTS.plancherAmbiance); // jamais 0 : pas de noir complet
    expect(wild.max).toBe(4);
    expect(wild.vacillement.amplitude).toBe(LIGHT_DEFAULTS.vacillement.amplitude);
    expect(wild.vacillement.frequences).toEqual([0.5]);
    expect(FLICKER_MAX).toEqual({ amplitude: 0.15, frequence: 1.4 });
  });
});

describe('vacillement', () => {
  // Série simulée à 60 images par seconde pendant 20 s : changements de sens (extremums) par seconde et amplitude relative.
  const series = (cfg, phase, reduced = false) => Array.from({ length: 1200 }, (_, i) => flicker(i / 60, phase, cfg, reduced));
  const extremaPerSecond = (v) => {
    let n = 0;
    for (let i = 1; i < v.length - 1; i += 1) if ((v[i] - v[i - 1]) * (v[i + 1] - v[i]) < 0) n += 1;
    return n / (v.length / 60);
  };
  it('lent et faible : au plus 3 variations par seconde, amplitude ≤ 15 % de l\'intensité, aucun saut entre deux images', () => {
    const configs = [parseLightConfig(LUMIERES), parseLightConfig({ vacillement: { amplitude: 0.15, frequences: [1.4, 1.37] } }), { vacillement: parseLightConfig(LUMIERES).feux.vacillement }]; // 5k-G : feux
    for (const cfg of configs) {
      for (const id of LAMPS.map((l) => l.id)) {
        const v = series(cfg, lampPhase(id));
        expect(extremaPerSecond(v), id).toBeLessThanOrEqual(3);
        expect((Math.max(...v) - Math.min(...v)) / Math.max(...v), id).toBeLessThanOrEqual(0.15 + 1e-12);
        expect(Math.min(...v)).toBeGreaterThanOrEqual(1 - cfg.vacillement.amplitude - 1e-12);
        expect(Math.max(...v)).toBeLessThanOrEqual(1);
        for (let i = 1; i < v.length; i += 1) expect(Math.abs(v[i] - v[i - 1])).toBeLessThan(0.02); // aucun scintillement brusque
      }
    }
  });
  it('prefers-reduced-motion : lumière constante', () => {
    const v = series(parseLightConfig(LUMIERES), 1.3, true);
    expect(new Set(v)).toEqual(new Set([1]));
  });
});

describe('choix des lampes éclairées et fondu', () => {
  const rdc = LAMPS.filter((l) => l.floor === 'rdc');
  it('les N plus proches du joueur parmi les lampes visibles de l\'étage affiché, à moins de distanceActivation ; à égalité, l\'identifiant', () => {
    const out = [];
    const all = rdc.map(() => true);
    const p = { x: 2740, y: 2100 };
    const byDist = [...rdc].sort((a, b) => Math.hypot(a.light.x - p.x, a.light.y - p.y) - Math.hypot(b.light.x - p.x, b.light.y - p.y));
    for (const n of [2, 4, 6]) expect(selectLamps(out, rdc, all, p.x, p.y, n, 1e9)).toEqual(byDist.slice(0, n).map((l) => l.id));
    // Invisibles (hors du champ) : jamais choisies.
    const hidden = rdc.map((l) => l.id !== byDist[0].id);
    expect(selectLamps(out, rdc, hidden, p.x, p.y, 4, 1e9)).not.toContain(byDist[0].id);
    // distanceActivation.
    expect(selectLamps(out, rdc, all, p.x, p.y, 6, 1)).toEqual([]);
    // Égalité : ordre des identifiants, quel que soit l'ordre de la liste.
    const twins = [{ id: 'b', light: { x: 10, y: 0 } }, { id: 'a', light: { x: -10, y: 0 } }, { id: 'c', light: { x: 0, y: 10 } }];
    expect(selectLamps(out, twins, [true, true, true], 0, 0, 2, 1e9)).toEqual(['a', 'b']);
    expect(selectLamps(out, [...twins].reverse(), [true, true, true], 0, 0, 2, 1e9)).toEqual(['a', 'b']);
    // Le tableau de sortie est réutilisé (aucune allocation de tableau par image).
    expect(selectLamps(out, rdc, all, p.x, p.y, 2, 1e9)).toBe(out);
  });
  it('fondu : une lampe garde son emplacement, sort en fondu puis cède sa place, la nouvelle entre en fondu ; jamais de saut d\'intensité', () => {
    const fondu = 0.6;
    const dt = 1 / 60;
    const slots = [{ id: null, w: 0 }, { id: null, w: 0 }];
    const trace = [];
    const run = (wanted, n) => {
      for (let i = 0; i < n; i += 1) {
        // Intensité de chaque lampe (absente = 0) avant et après : variation ≤ dt / fondu pour chacune (entrée, sortie, changement d'emplacement).
        const level = () => Object.fromEntries(slots.filter((q) => q.id !== null).map((q) => [q.id, q.w]));
        const before = level();
        stepSlots(slots, wanted, dt, fondu);
        const after = level();
        for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) expect(Math.abs((after[id] ?? 0) - (before[id] ?? 0)), id).toBeLessThanOrEqual(dt / fondu + 1e-12);
        expect(new Set(slots.filter((q) => q.id !== null).map((q) => q.id)).size).toBe(slots.filter((q) => q.id !== null).length); // une lampe, un emplacement
        trace.push(slots.map((s) => `${s.id}:${s.w.toFixed(3)}`).join(' '));
      }
    };
    run(['a', 'b'], 60);
    expect(slots).toEqual([{ id: 'a', w: 1 }, { id: 'b', w: 1 }]);
    run(['b', 'c'], 20); // a sort, c attend une place
    expect(slots[0].id).toBe('a');
    expect(slots[0].w).toBeCloseTo(1 - 20 / 36, 6);
    expect(slots[1]).toEqual({ id: 'b', w: 1 }); // b garde son emplacement (ordre stable)
    run(['b', 'c'], 60);
    expect(slots).toEqual([{ id: 'c', w: expect.any(Number) }, { id: 'b', w: 1 }]);
    expect(slots[0].w).toBeGreaterThan(0);
    run(['b', 'c'], 60);
    expect(slots[0]).toEqual({ id: 'c', w: 1 });
    run([], 40);
    expect(slots).toEqual([{ id: null, w: 0 }, { id: null, w: 0 }]);
    expect(trace.length).toBe(240);
  });
});
