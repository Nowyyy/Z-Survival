// Logique pure de la page sauvegarde.html (lot 4) : messages d'erreur du code, texte de l'état, aperçu d'un import, confirmation en deux temps.
// Aucun accès au DOM ni au stockage. Les clés de fr.json sont écrites en toutes lettres (pas de clé orpheline).
// Lot 8h : la page montre la progression v2 (zs.save.v2, js/core/progression.js) ; les lignes de l'aperçu viennent de decrire().
import { ERROR_CODES, STAT_KEYS } from '../core/save.js';
import { decrire, MODES } from '../core/progression.js';

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
export const ROW_NAME_KEYS = {
  money: 'game.save.page.import.row.money', earned: 'game.save.page.import.row.earned', levelsSum: 'game.save.page.import.row.levelsSum',
  objets: 'game.save.page.import.row.objets', persos: 'game.save.page.import.row.persos', tenues: 'game.save.page.import.row.tenues', mondes: 'game.save.page.import.row.mondes',
  tues: 'game.save.page.import.row.tues', parties: 'game.save.page.import.row.parties',
};
// Record d'un mode (histoire, infini) et d'un monde : clé du texte (le monde est passé en paramètre {monde}).
export const MODE_RECORD_KEYS = { histoire: 'game.save.page.record.histoire', infini: 'game.save.page.record.infini' };
export const statKey = (id) => STAT_NAME_KEYS[id] ?? STAT_NAME_KEYS.degats;
export const recordKey = (id) => RECORD_NAME_KEYS[id] ?? RECORD_NAME_KEYS.bestWave;
// Clé du nom d'une ligne de l'aperçu : solde, total gagné, somme des niveaux ou record.
export const rowKey = (id) => ROW_NAME_KEYS[id] ?? recordKey(id);

// Date de la dernière écriture : null quand elle manque (affichage « jamais »).
export const savedAtDate = (ms) => (Number.isInteger(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms) : null);

// Aperçu d'un import comparé à la progression actuelle : lignes { id, group, current, incoming, changed, mode?, monde? } (monnaie bleue, total gagné,
// objets, personnages, tenues, somme des niveaux, mondes terminés, zombies tués, parties, puis un record par mode et par monde).
export function previewRows(current, incoming, params) {
  const a = decrire(current, params);
  const b = decrire(incoming, params);
  const rows = [
    { id: 'money', group: 'money', current: a.solde, incoming: b.solde },
    { id: 'earned', group: 'money', current: a.gagne, incoming: b.gagne },
    { id: 'objets', group: 'menu', current: a.objets, incoming: b.objets },
    { id: 'persos', group: 'menu', current: a.persos, incoming: b.persos },
    { id: 'tenues', group: 'menu', current: a.tenues, incoming: b.tenues },
    { id: 'levelsSum', group: 'levels', current: a.niveaux, incoming: b.niveaux },
    { id: 'mondes', group: 'profil', current: a.mondes, incoming: b.mondes },
    { id: 'tues', group: 'profil', current: a.tues, incoming: b.tues },
    { id: 'parties', group: 'profil', current: a.parties, incoming: b.parties },
  ];
  for (const mode of MODES) {
    const mondes = [...new Set([...Object.keys(a.records[mode]), ...Object.keys(b.records[mode])])].sort();
    for (const monde of mondes) rows.push({ id: `${mode}.${monde}`, group: 'records', mode, monde, current: a.records[mode][monde] ?? 0, incoming: b.records[mode][monde] ?? 0 });
  }
  return rows.map((row) => ({ ...row, changed: row.current !== row.incoming }));
}

// Niveaux de base détaillés des deux progressions : [{ id, current, incoming, changed }] pour les neuf statistiques.
export function levelRows(current, incoming) {
  const get = (save, id) => (Number.isInteger(save?.niveaux?.[id]) && save.niveaux[id] > 0 ? save.niveaux[id] : 0);
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
