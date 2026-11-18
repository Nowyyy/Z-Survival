// Lot 9e — Données des armes de la partie, lues à chaque partie (jamais au démarrage du menu) : table (data/game/armes-partie.json), modèles du
// lot 9c (data/armes/armes.json, choix des variantes et de l'échelle armes-choix.json, poses de tenue poses.json), couleurs (css/armes.css :
// jetons lus dans le texte pour l'atlas ; la feuille est aussi posée dans la page pour les visuels 2D du bouton de changement, puis retirée).
import { avecEchelle, lireArmes, lireChoix } from '../core/armes/armes.js';
import { lireTable, paletteArmes } from '../core/armes/partie.js';

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path} : ${r.status}`))));

// reg : registre de libération de la partie (js/game/liberation.js). → { table, donnees, choix, poses, palette } ou null (données illisibles).
export async function chargerArmes(reg) {
  try {
    const [tableJson, armesJson, choixJson, poses, css] = await Promise.all([
      json('data/game/armes-partie.json'),
      json('data/armes/armes.json'),
      json('data/armes/armes-choix.json'),
      json('data/armes/poses.json'),
      fetch('css/armes.css').then((r) => (r.ok ? r.text() : '')),
    ]);
    const base = lireArmes(armesJson);
    const choix = lireChoix(base, choixJson);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/armes.css';
    link.dataset.armes = '9e';
    document.head.append(link);
    reg?.ajouter(() => link.remove());
    return { table: lireTable(tableJson), donnees: avecEchelle(base, choix.echelle), choix, poses, palette: paletteArmes(css) };
  } catch {
    return null;
  }
}
