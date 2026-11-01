// Faux Storage en mémoire pour les tests de la sauvegarde (lot 4) : peut lever à volonté et compte chaque appel.
export function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const calls = { getItem: 0, setItem: 0, removeItem: 0, clear: 0 };
  const fake = {
    calls,
    data,
    // failGet / failSet / failRemove : erreur levée par l'appel suivant (et les suivants tant qu'elle est posée).
    failGet: null,
    failSet: null,
    failRemove: null,
    getItem(key) {
      calls.getItem += 1;
      if (fake.failGet) throw fake.failGet;
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      calls.setItem += 1;
      if (fake.failSet) throw fake.failSet;
      data.set(key, String(value));
    },
    removeItem(key) {
      calls.removeItem += 1;
      if (fake.failRemove) throw fake.failRemove;
      data.delete(key);
    },
    clear() {
      calls.clear += 1;
      data.clear();
    },
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
  return fake;
}

export const quotaError = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
export const securityError = () => Object.assign(new Error('denied'), { name: 'SecurityError' });
