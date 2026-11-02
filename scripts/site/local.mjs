// Exécution à blanc locale du déploiement (lot 4c) : la même séquence que le job deploy du workflow, les checkouts remplacés par des worktrees.
//   node scripts/site/local.mjs [--main <ref>] [--dev <ref> | --no-dev] [--archive <ref> | --no-archive] [--out _site] [--no-install]
// Par défaut : main = HEAD, dev = origin/dev s'il existe, archive = origin/archive (sinon archive locale) s'il existe.
// Étapes : worktrees détachés dans un dossier temporaire ; npm ci + npm run build dans main et dev ; assembleur de main (main/scripts/assemble.mjs)
// avec main/versions.json ; sortie dans _site/ du dépôt ; worktrees retirés. Servir ensuite : npm run serve:site (http://localhost:4180/Z-Survival/).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} a échoué (${cwd ?? '.'})`);
};
const exists = (ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore' }).status === 0;

const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
const out = resolve(value('--out') ?? join(repo, '_site'));
const refs = {
  main: value('--main') ?? 'HEAD',
  dev: flag('--no-dev') ? null : value('--dev') ?? (exists('origin/dev') ? 'origin/dev' : null),
  archive: flag('--no-archive') ? null : value('--archive') ?? (exists('origin/archive') ? 'origin/archive' : exists('archive') ? 'archive' : null),
};
if (spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim()) console.warn('Attention : l\'arbre de travail a des changements non commités ; ils ne sont pas dans le site (worktree de HEAD).');

const tmp = mkdtempSync(join(tmpdir(), 'zs-site-'));
const started = Date.now();
const added = [];
try {
  for (const [name, ref] of Object.entries(refs)) {
    if (!ref) continue;
    run('git', ['worktree', 'add', '--quiet', '--detach', join(tmp, name), ref], repo);
    added.push(join(tmp, name));
  }
  for (const name of ['main', 'dev']) {
    if (!refs[name]) continue;
    if (!flag('--no-install')) run('npm', ['ci', '--no-audit', '--no-fund'], join(tmp, name));
    run('npm', ['run', 'build', '--silent'], join(tmp, name));
  }
  run('node', [join(tmp, 'main/scripts/assemble.mjs'), '--main', join(tmp, 'main/_site'), '--versions', join(tmp, 'main/versions.json'), '--out', out,
    ...(refs.dev ? ['--dev', join(tmp, 'dev/_site')] : []), ...(refs.archive ? ['--archive', join(tmp, 'archive')] : [])], repo);
  console.log(`Exécution à blanc terminée en ${((Date.now() - started) / 1000).toFixed(1)} s : main ${refs.main}, dev ${refs.dev ?? 'absente'}, archive ${refs.archive ?? 'absente'} → ${out}`);
} finally {
  for (const dir of added) spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: repo, stdio: 'ignore' });
  spawnSync('git', ['worktree', 'prune'], { cwd: repo, stdio: 'ignore' });
  rmSync(tmp, { recursive: true, force: true });
}
