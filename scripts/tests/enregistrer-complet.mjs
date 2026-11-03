// Lot 4e-B — Enregistre tests/dernier-complet.json {version, hash, date} après un palier complet réussi sur toutes les zones.
// Usage : node scripts/tests/enregistrer-complet.mjs --rapport <rapport Playwright JSON fusionné> --vitest <rapport Vitest JSON>
// Refuse (code 1, fichier inchangé) si un test a échoué, si un fichier e2e manque au rapport, ou si Vitest n'est pas vert.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verdictComplet } from './lib/complet.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const val = (n) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? undefined : process.argv[i + 1];
};
const lire = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const rapport = lire(val('--rapport'));
const vitest = lire(val('--vitest'));
const attendus = readdirSync(resolve(ROOT, 'tests/e2e')).filter((f) => f.endsWith('.spec.js'));
const verdict = verdictComplet({ rapport, attendus, vitestOk: vitest ? vitest.success === true && vitest.numFailedTests === 0 : false });
if (!verdict.ok) {
  console.error(`Palier complet non enregistré : ${verdict.raison}.`);
  process.exit(1);
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
let versions;
try {
  versions = JSON.parse(git('show', 'origin/main:versions.json'));
} catch {
  versions = JSON.parse(readFileSync(resolve(ROOT, 'versions.json'), 'utf8'));
}
const actuelle = versions.versions.find((v) => v.status === 'actuelle');
const out = { version: actuelle?.id ?? null, hash: git('rev-parse', 'HEAD'), date: new Date().toISOString().slice(0, 10) };
writeFileSync(resolve(ROOT, 'tests/dernier-complet.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`tests/dernier-complet.json : ${out.version} ${out.hash.slice(0, 12)} (${verdict.raison}). À commiter.`);
