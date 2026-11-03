// Lot 4e-C — Décompte statique des tests, des assertions et des chargements de page d'un fichier de test.
// Méthode (écrite aussi dans Docs/ref/tests-paliers.md) :
//  - assertions : appels expect(…), expect.soft(…), expect.poll(…) dans le texte du fichier (une assertion écrite une fois dans une boucle
//    compte une fois) ;
//  - chargements : appels page.goto(…) et appels des fonctions locales qui contiennent page.goto (open, openFrozen…), hors leur définition ;
//  - tests : appels test(…) et it(…) (un test écrit une fois dans une boucle compte une fois).
// Usage : node scripts/tests/compter.mjs [--reference scripts/tests/assertions-reference.json] [--ecrire] [fichiers…]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chargeurs } from './lib/rapports.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

export function compter(source) {
  const loaders = chargeurs(source);
  const sansDefs = source.split('\n').filter((l) => !(loaders.length && new RegExp(`(?:async\\s+function\\s+(?:${loaders.join('|')})\\b|const\\s+(?:${loaders.join('|')})\\s*=)`).test(l))).join('\n');
  const appels = loaders.length ? (sansDefs.match(new RegExp(`\\b(?:${loaders.join('|')})\\(`, 'g')) ?? []).length : 0;
  // page.goto écrits dans le corps d'un chargeur (fonction de premier niveau, jusqu'à sa « } » en colonne 0) : comptés par ses appels.
  let gotoHorsChargeurs = (source.match(/\.goto\(/g) ?? []).length;
  for (const name of loaders) {
    const m = new RegExp(`(?:async\\s+function\\s+${name}\\s*\\(|const\\s+${name}\\s*=\\s*async\\s*\\()`).exec(source);
    if (!m) continue;
    const fin = source.slice(m.index).search(/\n\};?\n/);
    gotoHorsChargeurs -= (source.slice(m.index, fin < 0 ? undefined : m.index + fin).match(/\.goto\(/g) ?? []).length;
  }
  return {
    tests: (source.match(/^\s*(?:test|it)(?:\.each\([^)]*\))?\(/gm) ?? []).length,
    assertions: (source.match(/\bexpect(?:\.soft|\.poll)?\(/g) ?? []).length,
    chargements: gotoHorsChargeurs + appels,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const refPath = args.includes('--reference') ? args[args.indexOf('--reference') + 1] : 'scripts/tests/assertions-reference.json';
  const fichiers = args.filter((a) => /\.(?:spec|test)\.js$/.test(a));
  const liste = fichiers.length ? fichiers : readdirSync(resolve(ROOT, 'tests/e2e')).filter((f) => f.endsWith('.spec.js')).map((f) => `tests/e2e/${f}`);
  const out = Object.fromEntries(liste.filter((f) => existsSync(resolve(ROOT, f))).map((f) => [f, compter(readFileSync(resolve(ROOT, f), 'utf8'))]));
  if (args.includes('--ecrire')) writeFileSync(resolve(ROOT, refPath), `${JSON.stringify({ description: 'Lot 4e-C : décompte de référence (avant regroupements) des fichiers e2e G et P (scripts/tests/compter.mjs).', fichiers: out }, null, 1)}\n`);
  else console.log(JSON.stringify(out, null, 1));
}
