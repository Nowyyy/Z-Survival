// Copie les dossiers du site dans _site/ (jamais Docs/, tests/ ni node_modules). Lot 5g : plus de dossier dev/ (journal des versions supprimé ;
// dev/ est, dans le site assemblé, le build de la branche dev).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = '_site';
const ENTRIES = ['index.html', 'jeu.html', 'sons.html', 'atelier-sons.html', 'atelier-choix.html', 'carte.html', 'visite.html', 'ecarts.html', 'sauvegarde.html', 'apercu.txt', 'css', 'js', 'data', 'fonts', 'vendor'];
ENTRIES.push('atelier-personnages.html'); // lot 3j : atelier des personnages (ligne séparée, fusion sans conflit avec les autres lots)

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
ENTRIES.push('atelier-interface.html', 'interface-retenue.html'); // lot 3k : atelier de l'interface et interface retenue (ligne à part, voir Docs/ref/fusion-3k.md)
ENTRIES.push('noms-versions-et-lots.txt'); // lot 5h : fichier des noms (lu par l'assembleur dans le build de dev, sinon de main ; textes publics)
for (const entry of ENTRIES) {
  if (existsSync(entry)) cpSync(entry, `${OUT}/${entry}`, { recursive: true });
}
console.log(`Build : ${OUT}/ (${ENTRIES.filter(existsSync).join(', ')})`);
