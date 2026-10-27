// Imprime la courbe de difficulté (vagues 1 à 40) d'après data/game/waves.json, en la comparant à la formule de Black Ops 3 pour la vie.
// Usage : node scripts/courbe-vagues.mjs [vague …] (sans argument : 1 à 40). N'écrit rien dans le dépôt.
import { readFileSync } from 'node:fs';
import { waveSpec } from '../js/core/waves.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/game/${name}.json`, import.meta.url), 'utf8'));
const params = load('waves');
const enemies = load('enemies');

// Black Ops 3 : 150 de vie, +100 par manche jusqu'à la manche 9 (950), puis ×1,1 par manche, sans plafond. Relatif à la manche 1.
const bo3 = (n) => (n <= 9 ? 150 + 100 * (n - 1) : 950 * 1.1 ** (n - 9)) / 150;

const waves = process.argv.length > 2 ? process.argv.slice(2).map(Number) : Array.from({ length: 40 }, (_, i) => i + 1);
const rows = waves.map((n) => {
  const s = waveSpec(n, params);
  const c = s.composition;
  const g = s.gaitCounts;
  // Vie totale à abattre, en points de vie : somme des vies de chaque type (marcheur de base = enemies.zombie.health).
  const hp = Object.entries(c).reduce((sum, [type, count]) => sum + count * enemies.variants[type].hpMul, 0) * enemies.zombie.health * s.hpMul;
  return {
    vague: n,
    total: s.total + (s.reinforced ? '*' : ''),
    simult: s.maxConcurrent,
    'interv. (s)': s.spawnInterval.toFixed(2),
    'vie ×': s.hpMul.toFixed(2),
    'BO3 ×': bo3(n).toFixed(2),
    'vitesse ×': s.speedMul.toFixed(2),
    'dégâts ×': s.damageMul.toFixed(2),
    'M/P/V/G': `${c.marcheur}/${c.petit}/${c.voute}/${c.grand}`,
    'L/M/R/C': `${g.lent}/${g.marche}/${g.rampe}/${g.course}`,
    'PV à abattre': Math.round(hp),
    'apparition min (s)': ((s.total - 1) * s.spawnInterval).toFixed(1),
  };
});
console.table(rows);
console.log('* vague renforcée. M/P/V/G : marcheur/petit/voûté/grand. L/M/R/C : lent/marche/rampe/course. BO3 : vie relative à la manche 1 (150 +100 par manche jusqu\'à 950 à la manche 9, puis ×1,1, sans plafond).');
