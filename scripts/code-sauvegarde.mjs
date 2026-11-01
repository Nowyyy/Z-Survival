// Imprime un code de sauvegarde valide (même codec que le jeu) pour les essais du propriétaire. N'écrit rien dans le dépôt.
// Usage : node scripts/code-sauvegarde.mjs --money 5000 --levels degats:3,precision:5 [--best-wave 12] [--earned N]
// Colle le code dans la page sauvegarde.html (« Importer »). Refuse les valeurs hors bornes.
import { readFileSync } from 'node:fs';
import { decodeSave, defaultSave, encodeSave, maxMoneyOf, statMaxLevels } from '../js/core/save.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/game/${name}.json`, import.meta.url), 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const fail = (message) => {
  console.error(`Erreur : ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? fail(`--${name} attend une valeur`));
};
const unknown = args.filter((a) => a.startsWith('--') && !['money', 'levels', 'best-wave', 'earned'].includes(a.slice(2)));
if (unknown.length > 0) fail(`option inconnue : ${unknown[0]}`);
const integer = (name, text, max) => {
  if (!/^\d{1,16}$/.test(text)) fail(`--${name} : entier ≥ 0 attendu (reçu « ${text} »)`);
  const n = Number(text);
  if (n > max) fail(`--${name} : ${n} dépasse le maximum ${max}`);
  return n;
};

const save = defaultSave();
const money = option('money');
if (money !== null) save.money = integer('money', money, maxMoneyOf(params));
const earned = option('earned');
save.earned = earned !== null ? integer('earned', earned, Number.MAX_SAFE_INTEGER) : save.money;
const bestWave = option('best-wave');
if (bestWave !== null) save.records.bestWave = integer('best-wave', bestWave, 100_000);
const levels = option('levels');
const maxLevels = statMaxLevels(params);
if (levels !== null) {
  for (const part of levels.split(',').filter((p) => p.trim() !== '')) {
    const m = /^([a-z]+):(\d+)$/.exec(part.trim());
    if (!m) fail(`--levels : « ${part} » n'est pas de la forme statistique:niveau`);
    if (!Object.hasOwn(maxLevels, m[1])) fail(`--levels : statistique inconnue « ${m[1]} » (${Object.keys(maxLevels).join(', ')})`);
    save.stats[m[1]] = integer(`levels ${m[1]}`, m[2], maxLevels[m[1]]);
  }
}
save.rev = 1;
const code = encodeSave(save, params);
const check = decodeSave(code, params);
if (!check.ok) fail(`code invalide (${check.error})`);
console.log(code);
console.error(`(${code.length} caractères ; solde ${save.money}, niveaux ${JSON.stringify(save.stats)}, meilleure manche ${save.records.bestWave})`);
