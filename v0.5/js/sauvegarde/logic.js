// Logique pure de la page sauvegarde.html (lot 4) : messages d'erreur du code, texte de l'état, aperçu d'un import, confirmation en deux temps.
// Aucun accès au DOM ni au stockage. Les clés de fr.json sont écrites en toutes lettres (pas de clé orpheline).
import { ERROR_CODES, RECORD_KEYS, STAT_KEYS, describeSave } from '../core/save.js';

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

// État affiché : saved (sauvegarde lue), empty (rien d'enregistré), locked (illisible ou version plus récente), unavailable. Le dépôt en mémoire
// (?store=memory, tests) se lit comme un dépôt local : le mode est dans l'attribut data-store de la liste.
export function stateName(status) {
  if (status === 'unavailable') return 'unavailable';
  if (status === 'corrupt' || status === 'future') return 'locked';
  return status === 'ok' ? 'saved' : 'empty';
}
export const STATE_KEYS = {
  saved: 'game.save.page.state.saved',
  empty: 'game.save.page.state.empty',
  locked: 'game.save.page.state.locked',
  unavailable: 'game.save.page.state.unavailable',
};
export const stateKey = (name) => STATE_KEYS[name] ?? STATE_KEYS.empty;

export const STAT_NAME_KEYS = {
  degats: 'game.save.page.stat.degats', portee: 'game.save.page.stat.portee', precision: 'game.save.page.stat.precision', cadence: 'game.save.page.stat.cadence',
  vitesse: 'game.save.page.stat.vitesse', vie: 'game.save.page.stat.vie', regen: 'game.save.page.stat.regen', chutes: 'game.save.page.stat.chutes', reparation: 'game.save.page.stat.reparation',
};
export const RECORD_NAME_KEYS = {
  bestWave: 'game.save.page.record.bestWave', bestKills: 'game.save.page.record.bestKills', runs: 'game.save.page.record.runs', worldsCompleted: 'game.save.page.record.worldsCompleted',
};
export const ROW_NAME_KEYS = { money: 'game.save.page.import.row.money', earned: 'game.save.page.import.row.earned', levelsSum: 'game.save.page.import.row.levelsSum' };
export const statKey = (id) => STAT_NAME_KEYS[id] ?? STAT_NAME_KEYS.degats;
export const recordKey = (id) => RECORD_NAME_KEYS[id] ?? RECORD_NAME_KEYS.bestWave;
// Clé du nom d'une ligne de l'aperçu : solde, total gagné, somme des niveaux ou record.
export const rowKey = (id) => ROW_NAME_KEYS[id] ?? recordKey(id);

// Date de la dernière écriture : null quand elle manque (affichage « jamais »).
export const savedAtDate = (ms) => (Number.isInteger(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms) : null);

// Aperçu d'un import comparé à la sauvegarde actuelle : lignes { id, group, current, incoming, changed } (solde, total gagné, somme des niveaux, records).
export function previewRows(current, incoming) {
  const a = describeSave(current);
  const b = describeSave(incoming);
  const rows = [
    { id: 'money', group: 'money', current: a.money, incoming: b.money },
    { id: 'earned', group: 'money', current: a.earned, incoming: b.earned },
    { id: 'levelsSum', group: 'levels', current: a.levelsSum, incoming: b.levelsSum },
  ];
  for (const key of RECORD_KEYS) rows.push({ id: key, group: 'records', current: a.records[key], incoming: b.records[key] });
  return rows.map((row) => ({ ...row, changed: row.current !== row.incoming }));
}

// Niveaux détaillés des deux sauvegardes : [{ id, current, incoming, changed }] pour les neuf statistiques.
export function levelRows(current, incoming) {
  const get = (save, id) => (Number.isInteger(save?.stats?.[id]) && save.stats[id] > 0 ? save.stats[id] : 0);
  return STAT_KEYS.map((id) => ({ id, current: get(current, id), incoming: get(incoming, id), changed: get(current, id) !== get(incoming, id) }));
}

// Le bouton « Remplacer ma sauvegarde » n'est actif qu'après une vérification réussie ET la case cochée.
export const canReplace = (verified, acknowledged) => verified === true && acknowledged === true;

// Confirmation en deux temps : « armer » (premier bouton), cocher la case si elle est demandée, puis confirmer. Pur : renvoie le nouvel état et si l'action est lancée.
export function confirmStep(state, action, { needsAck = true } = {}) {
  const s = { armed: state?.armed === true, acknowledged: state?.acknowledged === true };
  switch (action) {
    case 'arm': return { state: { armed: true, acknowledged: false }, run: false };
    case 'ack': return { state: { ...s, acknowledged: s.armed }, run: false };
    case 'unack': return { state: { ...s, acknowledged: false }, run: false };
    case 'cancel': return { state: { armed: false, acknowledged: false }, run: false };
    case 'confirm': {
      const ok = s.armed && (!needsAck || s.acknowledged);
      return { state: { armed: false, acknowledged: false }, run: ok };
    }
    default: return { state: s, run: false };
  }
}
