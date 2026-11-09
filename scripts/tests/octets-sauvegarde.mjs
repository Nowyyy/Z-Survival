#!/usr/bin/env node
// Lot 5o : preuve « un seul onglet : la valeur stockée est identique, octet pour octet, à celle d'avant le correctif ». Des sessions scriptées (graine
// fixe : gains, pertes d'argent, records, échecs d'écriture, import, effacement, dates égales ou non) sont jouées par le dépôt local de <ref> (par défaut
// origin/dev, copie `git worktree` jetable, supprimée à la fin, jamais dans l'arbre de travail) et par celui de l'arbre de travail AVEC son canal entre
// onglets (le jeu l'ouvre toujours). Les textes écrits doivent être identiques. Lecture seule pour le dépôt.
//   node scripts/tests/octets-sauvegarde.mjs [--ref origin/dev] [--sessions 200] [--operations 60]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ref = opt('ref', 'origin/dev');
const sessions = Number(opt('sessions', '200'));
const operations = Number(opt('operations', '60'));
const load = (name) => JSON.parse(readFileSync(join(ROOT, `data/game/${name}.json`), 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const KEY = params.save.storageKey;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Joue une session : renvoie la suite des textes écrits (et des effacements).
function play(createLocalRepository, seed, options) {
  const r = rng(seed);
  const pick = (n) => Math.floor(r() * n);
  const data = new Map();
  let fail = false;
  const out = [];
  const storage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (fail) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      data.set(k, String(v));
      out.push(String(v));
    },
    removeItem: (k) => {
      data.delete(k);
      out.push('<effacé>');
    },
  };
  if (r() < 0.5) data.set(KEY, JSON.stringify({ v: 1, rev: 3, savedAt: 17, money: 40, earned: 90, stats: { vie: 1 }, records: { bestWave: 2, bestKills: 4, runs: 1, worldsCompleted: 0 } }));
  const repo = createLocalRepository(storage, params, options);
  repo.load();
  let now = 1000;
  for (let k = 0; k < operations; k += 1) {
    now += pick(3) === 0 ? 0 : pick(5000);
    const x = pick(20);
    fail = x === 0;
    if (x <= 14) repo.commit({ money: pick(40) - (x === 1 ? 50 : 0), earned: pick(40), runs: pick(2), worlds: x === 2 ? 1 : 0, bestWave: pick(30), bestKills: pick(90) }, now);
    else if (x <= 16) repo.commit({}, now);
    else if (x === 17) repo.replace({ v: 1, money: pick(500), earned: pick(900), stats: { vie: pick(3) }, records: { bestWave: pick(9) } }, now);
    else if (x === 18) repo.clear();
    else out.push(JSON.stringify(repo.load().save));
    fail = false;
  }
  return out;
}

const worktree = mkdtempSync(join(tmpdir(), 'zs-octets-'));
let code = 0;
try {
  const add = spawnSync('git', ['worktree', 'add', '--detach', worktree, ref], { cwd: ROOT, encoding: 'utf8' });
  if (add.status !== 0) throw new Error(add.stderr);
  const before = await import(pathToFileURL(join(worktree, 'js/save/local-repository.js')).href);
  const after = await import(pathToFileURL(join(ROOT, 'js/save/local-repository.js')).href);
  const mergeModule = await import(pathToFileURL(join(ROOT, 'js/core/save-merge.js')).href);
  let texts = 0;
  let differences = 0;
  for (let s = 1; s <= sessions; s += 1) {
    const sent = [];
    const a = play(before.createLocalRepository, s, {});
    const b = play(after.createLocalRepository, s, { channel: () => ({ postMessage: (m) => sent.push(m), addEventListener: () => {} }), merge: mergeModule, now: () => 0 });
    texts += a.length;
    if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
      differences += 1;
      if (differences <= 3) console.log(`session ${s} : différence\n  avant : ${a.find((t, i) => t !== b[i])}\n  après : ${b.find((t, i) => t !== a[i])}`);
    }
  }
  console.log(`octets-sauvegarde : ${sessions} sessions, ${texts} textes comparés (${ref} contre l'arbre de travail avec canal), ${differences} session(s) différente(s)`);
  if (differences > 0 || texts === 0) code = 1;
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT });
  if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
}
process.exit(code);
