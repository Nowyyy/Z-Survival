// Logique pure de la page sauvegarde.html (lot 4) : messages d'erreur du code, texte de l'état, aperçu d'un import, confirmation en deux temps.
// Aucun accès au DOM ni au stockage. Les clés de fr.json sont écrites en toutes lettres (pas de clé orpheline).
import { ERROR_CODES } from '../core/save.js';

// Clé de fr.json du message de chaque code d'erreur du codec (un code inconnu donne le message de « bad-schema »).
export const ERROR_KEYS = {
  empty: 'game.save.page.error.empty',
  'too-long': 'game.save.page.error.too-long',
  'bad-prefix': 'game.save.page.error.bad-prefix',
  'bad-format': 'game.save.page.error.bad-format',
  'bad-base64': 'game.save.page.error.bad-base64',
  'bad-checksum': 'game.save.page.error.bad-checksum',
  'bad-json': 'game.save.page.error.bad-json',
  'bad-schema': 'game.save.page.error.bad-schema',
  'future-version': 'game.save.page.error.future-version',
};
export const errorKey = (code) => (ERROR_CODES.includes(code) ? ERROR_KEYS[code] : ERROR_KEYS['bad-schema']);
