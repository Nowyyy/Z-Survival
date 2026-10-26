// Exécuté avant l'évaluation de Three.js (lourde) : pose les textes et le message de rotation au plus tôt.
import { applyTexts, loadDict } from './texts.js';

applyTexts(await loadDict());
document.getElementById('rotate').hidden = false; // affiché ou non par la feuille de style selon l'orientation
