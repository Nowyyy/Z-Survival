// Copie les dossiers du site dans _site/ (jamais Docs/, tests/ ni node_modules).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = '_site';
const ENTRIES = ['index.html', 'jeu.html', 'sons.html', 'carte.html', 'apercu.txt', 'dev', 'css', 'js', 'data', 'fonts', 'vendor'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of ENTRIES) {
  if (existsSync(entry)) cpSync(entry, `${OUT}/${entry}`, { recursive: true });
}
console.log(`Build : ${OUT}/ (${ENTRIES.filter(existsSync).join(', ')})`);
