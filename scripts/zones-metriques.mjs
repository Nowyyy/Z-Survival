// Mesures des zones et du mobilier (lot 3c) : imprime, sans rien écrire, par zone : aire intérieure, aire libre et rapport, plus petit couloir, fenêtres,
// points d'apparition, zombies bloqués en simulation pure ; avant puis après l'ouverture de la porte 1. Usage : node scripts/zones-metriques.mjs [id] [--rapide]
// (--rapide : sans simulation).
import { fileURLToPath } from 'node:url';
import { doorsOpenAtStart } from '../js/core/zones.js';
import { activeZonesFor, floorView, floorZoneStats, globalStats, gridFor, gridForFloor, loadMap, loadMapFloors, reachable, simulateEachSpawn, smallestCorridor, stairLinks, zoneStats } from './lib/carte-zones.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')} %`;

export function metrics(map, { simulation = true } = {}) {
  const openAll = map.doors.map((d) => d.id);
  const g = globalStats(map);
  const rows = [];
  for (const state of [{ label: 'avant', open: [] }, { label: 'après', open: openAll }]) {
    const active = map.zones.zones.filter((z) => z.openAtStart || map.zones.doors.some((d) => !d.planned && state.open.includes(d.id) && d.opens.includes(z.id))).map((z) => z.id);
    const grid = gridFor(map, state.open);
    const points = map.decor.spawnPoints.filter((p) => active.includes(map.assignment[p.window ?? p.fenetre]));
    const sims = simulation ? simulateEachSpawn(map, points, { seconds: 60, openIds: state.open }) : [];
    const blocked = sims.filter((s) => s.maxStill > 2);
    const entries = map.geoms.filter((w) => active.includes(map.assignment[w.id])).map((w) => ({ id: w.id, ok: reachable(grid, w.entryInner, map.layout.start) }));
    rows.push({ ...state, active, points: points.length, sims, blocked, entries });
  }
  const zones = map.zones.zones.map((z) => ({ ...zoneStats(map, z.id), corridor: smallestCorridor(map, z.id) }));
  return { global: g, zones, rows };
}

// Lot 3e : mesures par étage et par zone, avant puis après chaque porte (porte-1, puis porte-2, puis porte-3 : planned ou non, l'état « ouvert » est calculé quand même).
// Renvoie { zones: [{ id, floor, interior, free, ratio, corridor, windows, spawnPoints }], states: [{ label, open, active: { rdc, etage }, floors: { rdc: { points, entries, blocked, sims }, etage: {...} }, links }] }.
export function metricsFloors(map, { simulation = true } = {}) {
  const order = ['porte-1', 'porte-2', 'porte-3'].filter((id) => map.zones.doors.some((d) => d.id === id));
  const stateList = [{ label: 'avant', open: [] }, ...order.map((id, i) => ({ label: `après ${id}`, open: order.slice(0, i + 1) }))];
  const zones = map.zones.zones.map((z) => ({ ...floorZoneStats(map, z.id), corridor: z.floor === 'etage' ? null : smallestCorridor(map, z.id) }));
  const states = stateList.map((st) => {
    const floors = {};
    const active = {};
    for (const floor of map.floors) {
      const view = floorView(map, floor);
      const grid = gridForFloor(map, floor, st.open);
      const zs = activeZonesFor(map, floor, st.open);
      active[floor] = zs;
      const assignment = view.assignment;
      const spawn = floor === 'etage' ? map.up.world.spawnPoints : map.decor.spawnPoints;
      const points = spawn.filter((p) => zs.includes(assignment[p.window ?? p.fenetre]));
      // Le joueur attend là où il est arrivé : au point de départ (rez-de-chaussée) ou à l'arrivée du premier escalier ouvert (étage).
      const open = map.zones.stairs.filter((q) => st.open.includes(q.door));
      const player = floor === 'etage' && open.length > 0 ? { ...open[0].floors.etage.arrival, r: 18 } : null;
      const sims = simulation && points.length > 0 ? simulateEachSpawn(view, points, { seconds: 60, openIds: st.open, player }) : [];
      // Départ : le point de départ du joueur au rez-de-chaussée ; à l'étage, les points d'arrivée des escaliers dont la porte est ouverte.
      const starts = floor === 'etage' ? map.zones.stairs.filter((q) => st.open.includes(q.door)).map((q) => q.floors.etage.arrival) : [map.layout.start];
      const entries = view.geoms.filter((w) => zs.includes(assignment[w.id])).map((w) => ({ id: w.id, ok: starts.some((a) => reachable(grid, w.entryInner, a)) }));
      floors[floor] = { points: points.length, entries, blocked: sims.filter((q) => q.maxStill > 2), sims };
    }
    return { ...st, active, floors, links: stairLinks(map, st.open) };
  });
  return { zones, states };
}

if (isMain && process.argv.includes('--etages')) {
  const id = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'rez-de-chaussee';
  const map = loadMapFloors(id);
  const m = metricsFloors(map, { simulation: !process.argv.includes('--rapide') });
  console.log(`Carte ${id} : étages ${map.floors.join(', ')}.`);
  console.log('étage | zone         | aire intérieure | aire libre | rapport | plus petit couloir | fenêtres | points');
  for (const z of m.zones) console.log(`${z.floor.padEnd(5)} | ${z.id.padEnd(12)} | ${String(Math.round(z.interior)).padStart(15)} | ${String(Math.round(z.free)).padStart(10)} | ${pct(z.ratio).padStart(7)} | ${String(z.corridor ?? '-').padStart(18)} | ${z.windows.join(' ')} | ${z.spawnPoints.length}`);
  let bad = m.zones.some((z) => z.ratio < 0.7);
  for (const st of m.states) {
    for (const floor of map.floors) {
      const f = st.floors[floor];
      const stuck = f.sims.length ? `${f.blocked.length} bloqué(s) sur ${f.sims.length} (plus long arrêt ${Math.max(0, ...f.sims.map((q) => q.maxStill)).toFixed(2)} s)` : 'simulation non lancée';
      console.log(`${st.label.padEnd(14)} | ${floor.padEnd(5)} | zones actives ${f.points > 0 || st.active[floor].length > 0 ? st.active[floor].join(', ') || '-' : '-'} ; ${f.points} points d'apparition ; entrées reliées au départ de l'étage : ${f.entries.filter((e) => e.ok).length}/${f.entries.length} ; ${stuck}.`);
      for (const b of f.blocked) console.log(`  BLOQUÉ : ${b.id} (${b.maxStill.toFixed(2)} s) ${JSON.stringify(b.stillWhere)}`);
      if (f.blocked.length > 0 || f.entries.some((e) => !e.ok)) bad = true;
    }
    for (const l of st.links) {
      const ok = l.windows.every((w) => w.ok) && l.arrival;
      console.log(`  escalier ${l.stair} (${l.floor}) : zone de déclenchement reliée à ${l.windows.filter((w) => w.ok).length}/${l.windows.length} fenêtre(s) actives et ${l.arrival ? 'à son arrivée' : 'PAS à son arrivée'}${ok ? '' : ' — certaines fenêtres actives de cet étage ne sont pas reliées'}.`);
    }
  }
  if (bad) process.exit(1);
} else if (isMain) {
  const id = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'rez-de-chaussee';
  const map = loadMap(id);
  const m = metrics(map, { simulation: !process.argv.includes('--rapide') });
  console.log(`Carte ${id} : intérieur ${m.global.interior}, libre ${m.global.free} (${pct(m.global.ratio)}) ; espace libre en ${m.global.components} morceau(x) ; fenêtres sans chemin large : ${m.global.unreachable.join(', ') || 'aucune'}.`);
  console.log('zone      | aire intérieure | aire libre | rapport | plus petit couloir | fenêtres | points');
  for (const z of m.zones) console.log(`${z.id.padEnd(9)} | ${String(Math.round(z.interior)).padStart(15)} | ${String(Math.round(z.free)).padStart(10)} | ${pct(z.ratio).padStart(7)} | ${String(z.corridor ?? '-').padStart(18)} | ${z.windows.join(' ')} | ${z.spawnPoints.length}`);
  for (const r of m.rows) {
    const stuck = r.sims.length ? `${r.blocked.length} bloqué(s) sur ${r.sims.length} (plus long arrêt ${Math.max(0, ...r.sims.map((s) => s.maxStill)).toFixed(2)} s)` : 'simulation non lancée';
    console.log(`Porte 1 ${r.label === 'avant' ? 'fermée' : 'ouverte'} : zones actives ${r.active.join(', ')} ; ${r.points} points d'apparition ; entrées reliées au départ : ${r.entries.filter((e) => e.ok).length}/${r.entries.length} ; ${stuck}.`);
    for (const b of r.blocked) console.log(`  BLOQUÉ : ${b.id} (${b.maxStill.toFixed(2)} s) ${JSON.stringify(b.stillWhere)}`);
  }
  console.log(`Portes ouvertes dès la manche 11 : ${doorsOpenAtStart(map.zones, 11).join(', ')}.`);
  const bad = m.rows.some((r) => r.blocked.length > 0 || r.entries.some((e) => !e.ok)) || m.zones.some((z) => z.ratio < 0.7);
  if (bad) process.exit(1);
}
