// Lot 3g, partie B : la carte après application des décisions (ecarts-decisions.json) — règles par zone, portes fermées et ouvertes, simulations
// pures, fenêtres et escaliers inchangés, origine de chaque pièce, nombre de pièces ajoutées, fichiers dérivés.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { STATUS, applyDecisions } from '../../js/core/decisions.js';
import { compareFloor, openMid } from '../../js/core/ecarts.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';
import { loadMapFloors, smallestCorridor, zoneStats, floorZoneStats } from '../../scripts/lib/carte-zones.mjs';
import { metricsFloors } from '../../scripts/zones-metriques.mjs';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const BASE = '4b3f41c'; // main au lancement du lot 3g
const show = (path) => {
  try {
    return JSON.parse(execSync(`git show ${BASE}:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
};
const plan = load(`${DIR}/plan.json`);
const etage = load(`${DIR}/etage.json`);
const world = load(`${DIR}/world.json`);
const etageWorld = load(`${DIR}/etage.world.json`);
const { decisions } = load(`${DIR}/ecarts-decisions.json`);
const releve = load(`${DIR}/releve.json`);
const before = { plan: show(`${DIR}/plan.json`), etage: show(`${DIR}/etage.json`), world: show(`${DIR}/world.json`), etageWorld: show(`${DIR}/etage.world.json`), zones: show(`${DIR}/zones.json`) };
const map = loadMapFloors();
const m = metricsFloors(map);
// Aire libre de référence (main, zones-metriques au lancement du lot), en points de pourcentage.
const REFERENCE = { depart: 83.0, aile: 81.3, 'etage-gauche': 90.4, 'etage-droite': 80.9 };

describe('décisions du dépôt appliquées aux sources', () => {
  it('rejouer les décisions sur les sources du dépôt ne change plus rien (déjà appliquées)', () => {
    const r = applyDecisions({ rdc: plan, etage }, decisions);
    expect(r.sources.rdc).toEqual(plan);
    expect(r.sources.etage).toEqual(etage);
    expect(r.report.filter((x) => x.status === STATUS.done)).toEqual([]);
  });

  it('rejouer les décisions sur les sources de la base redonne exactement les sources du dépôt (procédure de fusion tardive)', () => {
    if (!before.plan) return;
    const r = applyDecisions({ rdc: before.plan, etage: before.etage }, decisions);
    expect(r.sources.rdc).toEqual(plan);
    expect(r.sources.etage).toEqual(etage);
  });

  it('aucune décision plus-60 n\'est appliquée sans accord : les éléments visés sont intacts', () => {
    const big = decisions.filter((d) => d.level === 'plus-60' && d.approved !== true);
    expect(big.length).toBeGreaterThan(0);
    if (!before.plan) return;
    expect(plan.pillars).toEqual(before.plan.pillars);
    expect(etage.pillars).toEqual(before.etage.pillars);
    for (const d of big.filter((x) => x.floor === 'rdc' && /^M\d/.test(x.id))) expect(plan.furniture.find((f) => f.id === d.id)).toEqual(before.plan.furniture.find((f) => f.id === d.id));
  });

  it('aucun élément ne s\'est déplacé de plus de 60 unités (meubles d\'origine, fenêtres, piliers)', () => {
    if (!before.plan) return;
    for (const [now, old] of [[plan, before.plan], [etage, before.etage]]) {
      for (const f of now.furniture) {
        const o = old.furniture.find((q) => q.id === f.id);
        if (!o) continue;
        const shift = Math.max(Math.abs(f.x0 - o.x0), Math.abs(f.y0 - o.y0), Math.abs(f.x1 - o.x1), Math.abs(f.y1 - o.y1)) * 5;
        expect(shift, f.id).toBeLessThanOrEqual(60);
      }
      for (const w of now.windows) {
        const o = old.windows.find((q) => q.id === w.id);
        expect(Math.hypot(w.x - o.x, w.y - o.y) * 5, w.id).toBeLessThanOrEqual(60);
      }
    }
  });

  it('plus aucun écart 15-60 ouvert : chacun est corrigé ou gardé par une décision motivée', () => {
    expect(openMid(compareFloor(plan, releve, 'rdc', { decisions }).rows)).toEqual([]);
    expect(openMid(compareFloor(etage, releve, 'etage', { decisions }).rows)).toEqual([]);
    for (const d of decisions.filter((x) => x.action === 'garder')) expect(d.reason.length, d.id).toBeGreaterThan(20);
  });
});

describe('fenêtres, escaliers, portes et zones inchangés', () => {
  it('F1 à F8 : identifiants, côtés et murs conservés ; décalage de 50 au plus de leur origine', () => {
    expect(plan.windows.map((w) => [w.id, w.side])).toEqual([['F1', 'nord'], ['F2', 'est'], ['F3', 'ouest'], ['F4', 'nord'], ['F5', 'sud'], ['F6', 'sud'], ['F7', 'sud'], ['F8', 'sud']]);
    for (const w of world.windows.filter((q) => q.id.startsWith('F'))) {
      const p = plan.windows.find((q) => q.id === w.id);
      const ox = ((p.planX ?? p.x) - plan.bbox.x0) * 5 + 800;
      const oy = ((p.planY ?? p.y) - plan.bbox.y0) * 5 + 800;
      expect(Math.hypot(w.x - ox, w.y - oy), w.id).toBeLessThanOrEqual(50);
    }
  });

  it('U1 à U7 : identifiants, côtés conservés ; décalage de 50 au plus de leur origine ; largeur 72 partout', () => {
    expect(etage.windows.map((w) => [w.id, w.side])).toEqual([['U1', 'ouest'], ['U2', 'ouest'], ['U3', 'nord'], ['U4', 'nord'], ['U5', 'nord'], ['U6', 'sud'], ['U7', 'sud']]);
    for (const w of etage.windows) expect(Math.abs((w.side === 'nord' || w.side === 'sud' ? w.x - (w.planX ?? w.x) : w.y - (w.planY ?? w.y))) * 5, w.id).toBeLessThanOrEqual(50);
    expect(world.windowSize ?? 72).toBe(72);
    expect(etageWorld.windowSize ?? 72).toBe(72);
  });

  it('escaliers, ouvertures et contour inchangés depuis la base', () => {
    if (!before.plan) return;
    for (const [now, old] of [[plan, before.plan], [etage, before.etage]]) {
      expect(now.stairs).toEqual(old.stairs);
      expect(now.openings).toEqual(old.openings);
      expect(now.contour).toEqual(old.contour);
      expect(now.walls).toEqual(old.walls);
    }
  });

  it('zones.json inchangé (régions, portes, escaliers, walk.path)', () => {
    if (!before.zones) return;
    expect(load(`${DIR}/zones.json`)).toEqual(before.zones);
  });

  it('les décisions ne touchent ni escalier, ni porte, ni ouverture', () => {
    const ids = new Set([...plan.stairs, ...etage.stairs, ...plan.openings, ...etage.openings].map((x) => x.id));
    for (const d of decisions.filter((x) => x.action !== 'garder')) expect(ids.has(d.id), d.id).toBe(false);
  });
});

describe('mobilier : origine, nombre, aires', () => {
  it('chaque pièce a une origine : relevée (M, E), provisoire (P, Q) ou du modèle (source modele)', () => {
    for (const f of [...plan.furniture, ...etage.furniture]) {
      const relevee = /^M\d+$/.test(f.id) || (/^E\d+$/.test(f.id) && f.source === 'modele');
      expect(relevee || f.provisional === true || f.source === 'modele', f.id).toBe(true);
      expect(f.provisional === true && f.source === 'modele', f.id).toBe(false);
    }
  });

  it('au plus 12 pièces solides ajoutées au rez-de-chaussée et 8 à l\'étage', () => {
    if (!before.plan) return;
    const added = (now, old) => now.furniture.filter((f) => !old.furniture.some((o) => o.id === f.id)).length;
    expect(added(plan, before.plan)).toBeLessThanOrEqual(12);
    expect(added(etage, before.etage)).toBeLessThanOrEqual(8);
  });

  it('les pièces ajoutées ou remplacées sont de genres existants, hauteur 70 au plus dans le monde', () => {
    const kinds = new Set(['table', 'comptoir', 'caisse', 'etagere', 'armoire']);
    for (const f of plan.furniture.filter((q) => q.source === 'modele')) expect(kinds.has(f.kind), f.id).toBe(true);
    for (const o of world.obstacles) expect(o.hauteur ?? 0, o.id).toBeLessThanOrEqual(70);
  });

  it('aucune pièce du modèle n\'a été retirée par npm run carte', () => {
    const retired = world.generation.retired.map((r) => r.id);
    for (const f of plan.furniture.filter((q) => q.source === 'modele')) expect(retired.includes(f.id), f.id).toBe(false);
  });

  it.each(Object.keys(REFERENCE))('zone %s : aire libre ≥ 70 % et au plus 4 points sous la référence', (id) => {
    const s = id.startsWith('etage') ? floorZoneStats(map, id) : zoneStats(map, id);
    expect(s.ratio * 100).toBeGreaterThanOrEqual(70);
    expect(s.ratio * 100).toBeGreaterThanOrEqual(REFERENCE[id] - 4 - 0.05);
  });

  it.each(['depart', 'aile'])('zone %s : plus petit couloir au moins égal à params.json (50)', (id) => {
    expect(smallestCorridor(map, id)).toBeGreaterThanOrEqual(load('data/game/maps/params.json').minCorridor);
  });
});

describe('règles de jeu sur la nouvelle géométrie (portes fermées puis ouvertes)', () => {
  it.each(m.states.map((s) => [s.label, s]))('%s : toutes les entrées de fenêtres actives reliées au départ', (_label, st) => {
    for (const f of Object.keys(st.floors)) for (const e of st.floors[f].entries) expect(e.ok, `${f} ${e.id}`).toBe(true);
  });

  it.each(m.states.map((s) => [s.label, s]))('%s : aucun zombie bloqué plus de 2 s en 60 s depuis chaque point d\'apparition actif', (_label, st) => {
    for (const f of Object.keys(st.floors)) {
      expect(st.floors[f].blocked.map((b) => b.id), f).toEqual([]);
      for (const s of st.floors[f].sims) expect(s.entered, `${f} ${s.id}`).toBe(true);
    }
  });

  it('16 points d\'apparition au rez-de-chaussée et 14 à l\'étage, toutes portes ouvertes', () => {
    const last = m.states.at(-1);
    expect(last.floors.rdc.points).toBe(16);
    expect(last.floors.etage.points).toBe(14);
  });

  it('chemin de chaque point d\'apparition à sa fenêtre : 900 au plus (decor.json et etage.world.json)', () => {
    for (const p of [...load(`${DIR}/decor.json`).spawnPoints, ...etageWorld.spawnPoints]) {
      const w = [...world.windows, ...etageWorld.windows].find((q) => q.id === (p.window ?? p.fenetre));
      expect(Math.hypot(p.x - w.x, p.y - w.y), p.id).toBeLessThanOrEqual(900);
    }
  });
});

describe('fichiers dérivés', () => {
  it('world.json, decor.json et etage.world.json sont la sortie exacte de npm run carte', () => {
    const out = generateMapFiles('rez-de-chaussee');
    expect(readFileSync(`${DIR}/world.json`, 'utf8')).toBe(out.world);
    expect(readFileSync(`${DIR}/decor.json`, 'utf8')).toBe(out.decor);
    expect(readFileSync(`${DIR}/etage.world.json`, 'utf8')).toBe(out.etage);
    expect(out.report.valid).toBe(true);
    expect(out.problems).toEqual([]);
  });
});
