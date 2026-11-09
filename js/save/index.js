// Choix du dépôt de sauvegarde (lot 4) : mémoire pour ?test=1 (sauf ?store=local), stockage du navigateur sinon ; enveloppé dans le dépôt en lecture
// seule (mode essai) dès qu'un paramètre de save.json `readOnlyParams` est présent dans l'adresse ; ?money=N fixe le solde de session.
import { parseMoneyParam, readOnlyMode } from '../core/save.js';
import { createLocalRepository } from './local-repository.js';
import { createMemoryRepository } from './memory-repository.js';
import { createReadOnlyRepository } from './readonly-repository.js';

const isOn = (query, name) => query.get(name) === '1';

// { search, storage, params, listen, persist, page, channel, merge, now } -> { repository, mode }. page : vrai pour sauvegarde.html (toujours le stockage du navigateur,
// jamais de lecture seule ; ?store=memory force la mémoire pour les tests). mode : { kind: 'local' | 'memory' | 'readonly', base: 'local' | 'memory', readOnly, reasons, test, money }.
// Lot 5o : channel, merge et now (suivi entre onglets, voir local-repository.js) ne servent qu'au stockage du navigateur hors lecture seule.
export function createRepository({ search = '', storage = null, params, listen, persist, page = false, channel, merge, now } = {}) {
  const query = new URLSearchParams(typeof search === 'string' ? search : '');
  const store = query.get('store');
  const testDefault = (params?.save?.memoryByDefaultWith ?? []).some((name) => isOn(query, name));
  const useMemory = store === 'memory' || (!page && testDefault && store !== 'local');
  const ro = page ? { readOnly: false, reasons: [] } : readOnlyMode(search, params);
  const tabs = ro.readOnly ? {} : { channel, merge, now };
  const inner = useMemory ? createMemoryRepository(undefined, params) : createLocalRepository(storage, params, { listen, persist, ...tabs });
  const money = page ? null : parseMoneyParam(search, params);
  const repository = ro.readOnly ? createReadOnlyRepository(inner, { money }, params) : inner;
  const base = useMemory ? 'memory' : 'local';
  return { repository, mode: { kind: ro.readOnly ? 'readonly' : base, base, readOnly: ro.readOnly, reasons: ro.reasons, test: testDefault, money } };
}
