// Aide à l'équilibrage des statistiques du joueur (lot 2b) : valeurs effectives par niveau, puis quatre profils (tout à 0, 3, 5, 10).
// Usage : node scripts/stats-joueur.mjs. N'écrit rien dans le dépôt. Les probabilités de toucher sont approximatives.
import { readFileSync } from 'node:fs';
import { createEnemy } from '../js/core/enemy-factory.js';
import { effectivePlayer, effectiveWeapon, STAT_IDS, statValues } from '../js/core/player-stats.js';
import { spreadHalfAngle } from '../js/core/spread.js';
import { waveSpec } from '../js/core/waves.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/game/${name}.json`, import.meta.url), 'utf8'));
const params = load('player-stats');
const pistol = load('weapons').pistol;
const player = load('player');
const enemies = load('enemies');
const gaits = load('gaits');
const waves = load('waves');
const f = (n, d = 2) => Number(n.toFixed(d));
const levels = Array.from({ length: params.maxLevel + 1 }, (_, i) => i);
const only = (id, level) => ({ [id]: level });

console.log('1. Valeur effective de chaque statistique, niveau 0 à', params.maxLevel);
const cell = {
  degats: (l) => f(effectiveWeapon(pistol, only('degats', l), params).damage),
  portee: (l) => { const w = effectiveWeapon(pistol, only('portee', l), params); return `${f(w.fireRange, 0)} / ${f(w.laserRange, 0)} / ${f(w.bulletMaxDistance, 0)}`; },
  precision: (l) => { const w = effectiveWeapon(pistol, only('precision', l), params); return `${f(w.coneStill)}° / ${f(w.coneMove)}°`; },
  cadence: (l) => f(effectiveWeapon(pistol, only('cadence', l), params).fireDelay, 3),
  vitesse: (l) => f(effectivePlayer(player, only('vitesse', l), params).speed, 1),
  vie: (l) => f(effectivePlayer(player, only('vie', l), params).maxHealth, 0),
  regen: (l) => f(effectivePlayer(player, only('regen', l), params).regen, 0),
};
const unit = { degats: 'dégâts par balle', portee: 'portée de tir / laser / balle max', precision: 'demi-angle à l\'arrêt / à pleine vitesse', cadence: 'délai entre tirs (s)', vitesse: 'vitesse (u/s)', vie: 'vie maximale', regen: 'PV rendus par kill' };
const table = {};
for (const id of STAT_IDS) table[`${id} (${unit[id]})`] = Object.fromEntries(levels.map((l) => [`N${l}`, cell[id](l)]));
console.table(table);

const profiles = { 'tout 0': 0, 'tout 3': 3, 'tout 5': 5, 'tout 10': 10 };
const all = (n) => Object.fromEntries(STAT_IDS.map((id) => [id, n]));
const hpOf = (type, wave) => createEnemy(type, 'marche', waveSpec(wave, waves), enemies, gaits).hp;

console.log('\n2. Dégâts par seconde et temps pour abattre un zombie (secondes, tir en continu à précision parfaite)');
const rows = {};
for (const [name, n] of Object.entries(profiles)) {
  const w = effectiveWeapon(pistol, all(n), params);
  const row = { 'dégâts/s': f(w.damage / w.fireDelay) };
  for (const wave of [1, 5, 10, 20, 28]) {
    for (const type of ['marcheur', 'grand']) {
      const shots = Math.ceil(hpOf(type, wave) / w.damage);
      row[`${type[0].toUpperCase()}${type.slice(1, 3)} v${wave}`] = f((shots - 1) * w.fireDelay + 0, 2);
    }
  }
  rows[name] = row;
}
console.table(rows);
console.log('Temps = (balles nécessaires − 1) × délai : la première balle part sans attente. Mar = marcheur, Gra = grand (allure sans effet sur la vie).');

console.log('\n3. Temps minimal pour abattre toute la vague (précision parfaite, un zombie à la fois, sans déplacement)');
const waveRows = {};
for (const [name, n] of Object.entries(profiles)) {
  const w = effectiveWeapon(pistol, all(n), params);
  const row = {};
  for (const wave of [1, 5, 10, 20, 28]) {
    const spec = waveSpec(wave, waves);
    let shots = 0;
    for (const [type, count] of Object.entries(spec.composition)) shots += count * Math.ceil(hpOf(type, wave) / w.damage);
    row[`v${wave} (${spec.total} zombies)`] = `${f(Math.max(0, shots - 1) * w.fireDelay, 1)} s, ${shots} balles`;
  }
  waveRows[name] = row;
}
console.table(waveRows);

console.log('\n4. Probabilité approximative de toucher un zombie de rayon', enemies.zombie.radius, '(balle de rayon', pistol.bulletRadius, ')');
console.log('   approximation : min(1, (rayon zombie + rayon balle) / (distance × tan(demi-angle))) ; elle suppose un décalage uniforme, la loi réelle est triangulaire (plus de balles près de l\'axe) : valeur indicative seulement.');
const hit = (distance, half) => Math.min(1, (enemies.zombie.radius + pistol.bulletRadius) / (distance * Math.tan((half * Math.PI) / 180)));
const odds = {};
for (const [name, n] of Object.entries(profiles)) {
  const v = statValues(all(n), params);
  const row = {};
  for (const distance of [300, 700]) {
    row[`${distance} à l'arrêt`] = `${f(100 * hit(distance, spreadHalfAngle(0, v)), 0)} %`;
    row[`${distance} pleine vitesse`] = `${f(100 * hit(distance, spreadHalfAngle(1, v)), 0)} %`;
  }
  odds[name] = row;
}
console.table(odds);
