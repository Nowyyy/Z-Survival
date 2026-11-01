// Imprime le tableau des gains par manche (1 à 40) d'après data/game/economy.json, enemies.json et waves.json : total de zombies, gain des kills si tous sont
// tués, bonus de manche, total, cumul. Usage : node scripts/economie.mjs [manche …] (sans argument : 1 à 40). N'écrit rien dans le dépôt.
import { readFileSync } from 'node:fs';
import { earningsTable, formatMoney, makeEconomy, worldBonus } from '../js/core/economy.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/game/${name}.json`, import.meta.url), 'utf8'));
const economy = makeEconomy(load('economy'), load('enemies'));
const table = earningsTable(load('waves'), economy, null, 40);
const wanted = process.argv.length > 2 ? process.argv.slice(2).map(Number) : table.map((r) => r.wave);
const rows = table.filter((r) => wanted.includes(r.wave)).map((r) => ({
  manche: r.wave,
  zombies: r.zombies + (r.reinforced ? '*' : ''),
  'M/P/V/G': `${r.composition.marcheur}/${r.composition.petit}/${r.composition.voute}/${r.composition.grand}`,
  'gain kills': formatMoney(r.killGain),
  bonus: formatMoney(r.bonus),
  total: formatMoney(r.gain),
  cumul: formatMoney(r.cumulative),
}));
console.table(rows);
console.log(`* manche renforcée. Bonus de fin de monde : ${formatMoney(worldBonus(economy))} (une fois, à la manche 40). Plafond du solde : ${formatMoney(economy.maxMoney)}.`);
