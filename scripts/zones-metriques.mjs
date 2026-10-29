// Mesures des zones et du mobilier (lot 3c) : imprime, sans rien écrire, par zone : aire intérieure, aire libre et rapport, plus petit couloir, fenêtres,
// points d'apparition, zombies bloqués en simulation pure ; avant puis après l'ouverture de la porte 1. Usage : node scripts/zones-metriques.mjs [id] [--rapide]
// (--rapide : sans simulation).
import { fileURLToPath } from 'node:url';
import { doorsOpenAtStart } from '../js/core/zones.js';
import { globalStats, gridFor, loadMap, reachable, simulateEachSpawn, smallestCorridor, zoneStats } from './lib/carte-zones.mjs';

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

if (isMain) {
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
