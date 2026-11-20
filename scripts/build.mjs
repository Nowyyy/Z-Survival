// Copie les dossiers du site dans _site/ (jamais Docs/, tests/ ni node_modules). Lot 5g : plus de dossier dev/ (journal des versions supprimé ;
// dev/ est, dans le site assemblé, le build de la branche dev).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { appliquerEmpreintes } from './site/empreinte.mjs';

const OUT = '_site';
const ENTRIES = ['index.html', 'jeu.html', 'sons.html', 'atelier-sons.html', 'atelier-choix.html', 'carte.html', 'visite.html', 'ecarts.html', 'sauvegarde.html', 'apercu.txt', 'css', 'js', 'data', 'fonts', 'vendor'];
ENTRIES.push('atelier-personnages.html'); // lot 3j : atelier des personnages (ligne séparée, fusion sans conflit avec les autres lots)

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
ENTRIES.push('atelier-interface.html', 'interface-retenue.html'); // lot 3k : atelier de l'interface et interface retenue (ligne à part, voir Docs/ref/fusion-3k.md)
ENTRIES.push('noms-versions-et-lots.txt'); // lot 5h : fichier des noms (lu par l'assembleur dans le build de dev, sinon de main ; textes publics)
ENTRIES.push('assets'); // lot 8g : logo du studio (assets/studio/ : original fourni par le propriétaire et sa copie fixe dérivée par script)
ENTRIES.push('atelier-sons-menu.html'); // lot 8i : page d'écoute des sons du menu (page technique)
ENTRIES.push('atelier-armes.html'); // lot 9c : atelier des armes (page technique, à retirer au lot 13)
ENTRIES.push('atelier-decor.html'); // lot 9h : atelier du décor extérieur d'époque (page technique)
for (const entry of ENTRIES) {
  if (existsSync(entry)) cpSync(entry, `${OUT}/${entry}`, { recursive: true });
}
console.log(`Build : ${OUT}/ (${ENTRIES.filter(existsSync).join(', ')})`);

// Lot 9f (Docs/ref/cache.md) : adresses à l'empreinte du déploiement (?v=<hash court du commit>), dans _site/ seulement ; contrôle bloquant :
// toute adresse relative restée sans empreinte (non déclarée dans scripts/site/empreinte.mjs) fait échouer la construction.
const empreinte = appliquerEmpreintes(OUT);
console.log(`Empreinte : v=${empreinte.version} (${empreinte.source}) — ${empreinte.adresses} adresses dans ${empreinte.reecrits} fichiers sur ${empreinte.fichiers}`);
if (empreinte.source === 'contenu') console.warn('Avertissement : ni ZS_BUILD_SHA ni dépôt git : version tirée du contenu (différente du sha de build-info.json).');
if (empreinte.restes.length || empreinte.inutiles.length) {
  for (const r of empreinte.restes) console.error(`Adresse sans empreinte (${r.forme}) : ${r.fichier} : ${r.texte.slice(0, 160)}`);
  for (const d of empreinte.inutiles) console.error(`Déclaration inutile : ${d.fichier} : ${d.texte ?? d.formes.join(', ')}`);
  console.error(`Construction refusée : ${empreinte.restes.length} adresse(s) sans empreinte, ${empreinte.inutiles.length} déclaration(s) inutile(s) (réécrire la forme ou la déclarer avec sa raison : scripts/site/empreinte.mjs).`);
  process.exit(1);
}
