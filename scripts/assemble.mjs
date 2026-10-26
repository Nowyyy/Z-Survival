// Assemble le site complet dans _site/ :
//  - la racine = la branche courante (main), construite par scripts/build.mjs ;
//  - _site/lots/<lot>/ = chaque branche lot-*, construite avec son propre build ;
//  - _site/lots.json = la liste des lots (nom, commit, date) lue par /dev.
// Les branches sont lues dans origin/* : le dépôt doit être cloné avec tout l'historique.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEntry, parseLot, sortLots } from '../js/lots.js';

const OUT = '_site';
const WORK = '.lots';
const FALLBACK_ENTRIES = ['index.html', 'css', 'js', 'data', 'fonts', 'vendor'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK);

const refs = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/').split('\n');
const names = refs.map((ref) => ref.replace(/^origin\//, '')).filter((name) => parseLot(name));
const lots = [];

for (const name of names) {
  const dir = join(WORK, name);
  try {
    git('worktree', 'add', '--detach', dir, `origin/${name}`);
    if (existsSync(join(dir, 'scripts/build.mjs'))) {
      execFileSync('node', ['scripts/build.mjs'], { cwd: dir, stdio: 'inherit' });
    } else {
      mkdirSync(join(dir, OUT));
      for (const entry of FALLBACK_ENTRIES) {
        if (existsSync(join(dir, entry))) cpSync(join(dir, entry), join(dir, OUT, entry), { recursive: true });
      }
    }
    cpSync(join(dir, OUT), join(OUT, 'lots', name), { recursive: true });
    const [sha, date] = git('log', '-1', '--format=%h|%cI', `origin/${name}`).split('|');
    // apercu.txt (première ligne) désigne la page à ouvrir pour ce lot, par exemple jeu.html.
    const entry = existsSync(join(dir, 'apercu.txt')) ? parseEntry(readFileSync(join(dir, 'apercu.txt'), 'utf8')) : '';
    lots.push({ name, sha, date, entry });
  } catch (error) {
    console.warn(`Lot ignoré (${name}) : ${error.message.split('\n')[0]}`);
  }
}

for (const name of names) {
  try {
    git('worktree', 'remove', '--force', join(WORK, name));
  } catch {
    // Le nettoyage final supprime de toute façon le dossier.
  }
}
rmSync(WORK, { recursive: true, force: true });

writeFileSync(join(OUT, 'lots.json'), `${JSON.stringify({ lots: sortLots(lots) }, null, 2)}\n`);
console.log(`Site assemblé : ${OUT}/ (${lots.length} lot(s) : ${sortLots(lots).map((l) => l.name).join(', ') || 'aucun'})`);
