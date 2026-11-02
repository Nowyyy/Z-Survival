// Exécuté avant l'évaluation de Three.js (lourde) : pose les textes, le texte de l'écran de préparation et le message de rotation au plus tôt.
import { applyTexts, fmt, loadDict, TEXTURE_TEXTS } from './texts.js';

const dict = await loadDict();
applyTexts(dict);
document.getElementById('loading-text').textContent = fmt(dict[TEXTURE_TEXTS.loading], { n: 0 });
document.getElementById('rotate').hidden = false; // affiché ou non par la feuille de style selon l'orientation
