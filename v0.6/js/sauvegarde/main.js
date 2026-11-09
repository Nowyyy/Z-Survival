// Page technique sauvegarde.html (lot 4) : état de la sauvegarde, export et import par code, section « sauvegarde illisible », effacement.
// Utilise js/core/save.js (codec) et js/save/ (le seul endroit qui touche le stockage) ; aucun Three.js. Les textes viennent de fr.json (game.save.page.*).
// Cette page utilise toujours le stockage du navigateur ; ?store=memory force la mémoire (tests).
import { decodeSave, describeSave, encodeSave, STAT_KEYS } from '../core/save.js';
import { createRepository } from '../save/index.js';
import { translate } from '../i18n.js';
import { canReplace, confirmStep, errorKey, levelRows, previewRows, recordKey, rowKey, savedAtDate, statKey, stateKey, stateName } from './logic.js';

const fmt = (text, p) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const $ = (id) => document.getElementById(id);

const [dict, saveCfg, economyCfg, statsCfg] = await Promise.all([loadJson('data/i18n/fr.json'), loadJson('data/game/save.json'), loadJson('data/game/economy.json'), loadJson('data/game/player-stats.json')]);
const params = { save: saveCfg, economy: economyCfg, stats: statsCfg };
const t = (key, p) => fmt(translate(dict, key), p);
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
document.title = `Z-Survival · ${t('game.save.page.title')}`;
$('app').hidden = false;

// Stockage du navigateur : l'accès peut lever (stockage bloqué) ; la page continue alors avec l'état « indisponible ».
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const { repository, mode } = createRepository({
  search: location.search,
  storage,
  params,
  page: true,
  listen: (handler) => {
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
  persist: () => navigator.storage?.persist?.(),
});

const live = $('live');
const say = (text) => {
  live.textContent = text;
};
let persistent = null; // true, false ou null (inconnu)
let verified = null; // sauvegarde décodée du code vérifié, ou null
let lockedConfirm = { armed: false, acknowledged: false };
let clearConfirm = { armed: false, acknowledged: false };

function addFact(list, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  list.append(dt, dd);
}

function render() {
  const loaded = repository.load();
  const name = stateName(loaded.status);
  const list = $('state-list');
  list.replaceChildren();
  const s = loaded.save;
  const d = describeSave(s);
  addFact(list, t('game.save.page.state.balance'), String(d.money));
  addFact(list, t('game.save.page.state.earned'), String(d.earned));
  addFact(list, t('game.save.page.state.levels'), STAT_KEYS.map((id) => `${t(statKey(id))} ${s.stats[id]}`).join(' · '));
  addFact(list, t('game.save.page.state.records'), Object.entries(d.records).map(([id, n]) => `${t(recordKey(id))} ${n}`).join(' · '));
  const when = savedAtDate(s.savedAt);
  addFact(list, t('game.save.page.state.lastWrite'), when ? when.toLocaleString('fr-FR') : t('game.save.page.state.never'));
  addFact(list, t('game.save.page.state.status'), t(stateKey(name)));
  addFact(list, t('game.save.page.state.persistent'), t(persistent === true ? 'game.save.page.persistent.yes' : persistent === false ? 'game.save.page.persistent.no' : 'game.save.page.persistent.unknown'));
  list.dataset.state = name;

  const readable = loaded.status === 'ok' || loaded.status === 'empty';
  const code = readable ? encodeSave(s, params) : '';
  $('export-code').value = code;
  $('export-length').textContent = code ? t('game.save.page.export.length', { n: code.length }) : '';
  $('btn-copy').disabled = !readable;

  const locked = loaded.status === 'corrupt' || loaded.status === 'future';
  $('locked-section').hidden = !locked;
  $('locked-raw').value = locked ? (loaded.raw ?? '') : '';
  $('locked-confirm').hidden = !lockedConfirm.armed;
  $('btn-locked-reset').hidden = lockedConfirm.armed;
  $('btn-replace').disabled = !canReplace(verified !== null, $('import-ack').checked);
  $('clear-confirm').hidden = !clearConfirm.armed;
  $('btn-clear').hidden = clearConfirm.armed;
  $('btn-clear-yes').disabled = !clearConfirm.acknowledged;
  return loaded;
}

async function refreshPersistence() {
  try {
    persistent = (await repository.requestPersistence()) ?? (typeof navigator.storage?.persisted === 'function' ? await navigator.storage.persisted() : null);
  } catch {
    persistent = null;
  }
  if (typeof persistent !== 'boolean') persistent = null;
  render();
}

// Copie dans le presse-papiers ; repli : sélection du texte et message.
async function copyFrom(textarea) {
  try {
    await navigator.clipboard.writeText(textarea.value);
    say(t('game.save.page.export.copied'));
  } catch {
    textarea.focus();
    textarea.select();
    say(t('game.save.page.export.manual'));
  }
}
$('btn-copy').addEventListener('click', () => copyFrom($('export-code')));
$('btn-copy-raw').addEventListener('click', () => copyFrom($('locked-raw')));

// --- Importer -----------------------------------------------------------------------------------------------------------------------------------
function resetImport() {
  verified = null;
  $('import-preview').hidden = true;
  $('import-error').hidden = true;
  $('import-error').textContent = '';
  $('import-ack').checked = false;
  $('btn-replace').disabled = true;
}
$('import-code').addEventListener('input', resetImport);
$('import-ack').addEventListener('change', () => {
  $('btn-replace').disabled = !canReplace(verified !== null, $('import-ack').checked);
});

function cell(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

$('btn-verify').addEventListener('click', () => {
  resetImport();
  const result = decodeSave($('import-code').value, params);
  if (!result.ok) {
    const error = $('import-error');
    error.textContent = t(errorKey(result.error));
    error.hidden = false;
    say(error.textContent);
    return;
  }
  verified = result.save;
  const current = repository.load().save;
  const rows = $('import-rows');
  rows.replaceChildren();
  const add = (labelText, row) => {
    const tr = document.createElement('tr');
    tr.append(cell('th', labelText), cell('td', String(row.current)), cell('td', row.changed ? `→ ${row.incoming}` : String(row.incoming), row.changed ? 'changed' : ''));
    tr.dataset.changed = String(row.changed);
    rows.append(tr);
  };
  const preview = previewRows(current, verified);
  for (const row of preview.filter((r) => r.group !== 'records')) add(t(rowKey(row.id)), row);
  for (const row of levelRows(current, verified)) add(t(statKey(row.id)), row);
  for (const row of preview.filter((r) => r.group === 'records')) add(t(recordKey(row.id)), row);
  const warnings = $('import-warnings');
  warnings.hidden = result.warnings.length === 0;
  warnings.textContent = result.warnings.length ? t('game.save.page.import.warnings', { n: result.warnings.length }) : '';
  $('import-preview').hidden = false;
  say(t('game.save.page.import.ok'));
});

$('btn-replace').addEventListener('click', () => {
  if (!canReplace(verified !== null, $('import-ack').checked)) return;
  // Le texte est décodé de nouveau : on importe exactement ce qui est dans le champ, jamais une version périmée.
  const again = decodeSave($('import-code').value, params);
  if (!again.ok) {
    resetImport();
    return;
  }
  const result = repository.replace(again.save, Date.now());
  if (!result.ok) {
    const unavailable = repository.info().status === 'unavailable';
    say(unavailable ? t('game.save.page.write.unavailable') : result.error === 'locked' ? t('game.save.page.write.locked') : t('game.save.page.write.failed', { error: result.error }));
    return;
  }
  $('import-code').value = '';
  resetImport();
  say(t('game.save.page.import.done'));
  render();
  refreshPersistence();
});

// --- Sauvegarde illisible ---------------------------------------------------------------------------------------------------------------------
$('btn-locked-import').addEventListener('click', () => {
  $('import-section').scrollIntoView({ block: 'start' });
  $('import-code').focus();
});
$('btn-locked-reset').addEventListener('click', () => {
  lockedConfirm = confirmStep(lockedConfirm, 'arm', { needsAck: false }).state;
  render();
  $('btn-locked-reset-yes').focus();
});
$('btn-locked-reset-no').addEventListener('click', () => {
  lockedConfirm = confirmStep(lockedConfirm, 'cancel').state;
  render();
  $('btn-locked-reset').focus();
});
$('btn-locked-reset-yes').addEventListener('click', () => {
  const step = confirmStep(lockedConfirm, 'confirm', { needsAck: false });
  lockedConfirm = step.state;
  if (step.run) {
    const result = repository.clear();
    say(result.ok ? t('game.save.page.locked.resetDone') : t('game.save.page.write.failed', { error: result.error }));
  }
  render();
});

// --- Tout effacer -----------------------------------------------------------------------------------------------------------------------------
$('btn-clear').addEventListener('click', () => {
  clearConfirm = confirmStep(clearConfirm, 'arm').state;
  $('clear-ack').checked = false;
  render();
  $('clear-ack').focus();
});
$('clear-ack').addEventListener('change', () => {
  clearConfirm = confirmStep(clearConfirm, $('clear-ack').checked ? 'ack' : 'unack').state;
  render();
});
$('btn-clear-no').addEventListener('click', () => {
  clearConfirm = confirmStep(clearConfirm, 'cancel').state;
  render();
  $('btn-clear').focus();
});
$('btn-clear-yes').addEventListener('click', () => {
  const step = confirmStep(clearConfirm, 'confirm');
  clearConfirm = step.state;
  if (step.run) {
    const result = repository.clear();
    say(result.ok ? t('game.save.page.clear.done') : t('game.save.page.write.failed', { error: result.error }));
  }
  render();
  $('btn-clear').focus();
});

repository.subscribe(() => render());
render();
refreshPersistence();
// Aide aux tests : ?store=memory n'expose rien ; le mode est lisible dans l'attribut de la liste d'état.
$('state-list').dataset.store = mode.base;
