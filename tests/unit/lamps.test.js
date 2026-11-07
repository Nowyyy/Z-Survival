// Lot 5k-B : lampes à huile (décor non solide). Modèle pur (js/core/lamps.js : 60 triangles au plus, déterministe, aucun sommet sous le sol, faces
// orientées), sources en pixels (data/game/maps/rez-de-chaussee/lampes.json) et dérivé lampes.world.json (npm run carte), portée sûre (l'autre étage
// jamais atteint), lampes absentes des données de collision (ni obstacle, ni mur : balles, laser et zombies passent), jetons --game-lamp-*.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAME_TOP, LAMP_COLORS, lampsToWorld, lampTriangles, MAX_TRIANGLES, ORIENTATIONS, parseLampSource } from '../../js/core/lamps.js';
import { firstOnSegment } from '../../js/core/collision.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const SOURCE = load(`${DIR}/lampes.json`);
const DERIVED = load(`${DIR}/lampes.world.json`);
const RDC = load(`${DIR}/world.json`);
const ETAGE = load(`${DIR}/etage.world.json`);
const RENDER = load('data/game/render.json');
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
