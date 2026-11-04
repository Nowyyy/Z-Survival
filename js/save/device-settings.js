// Préférence d'appareil (lot 5b) : préréglage graphique choisi dans la pause. Clé zs.device.v1, schéma { v: 1, graphics: "auto" | "faible" | "moyen" | "eleve" }.
// Ce n'est pas la progression (zs.save.v1) : elle est écrite même en mode essai, mais jamais sous ?test=1 sans ?store=local (mémoire). Elle reste propre à
// l'appareil (jamais synchronisée avec un futur compte). Mêmes règles que le dépôt de sauvegarde : valeur inconnue ramenée à « auto » ; JSON illisible ou
// version future : lu comme « auto » et jamais écrasé (verrouillé) ; stockage indisponible : mémoire de la session et message ; aucune exception.
export const DEVICE_KEY = 'zs.device.v1';
export const DEVICE_VERSION = 1;
export const GRAPHICS_VALUES = ['auto', 'faible', 'moyen', 'eleve'];

// Lecture d'une valeur brute : { status: 'absent' | 'ok' | 'corrompu' | 'future', graphics }.
export function parseDevice(raw) {
  if (raw === null || raw === undefined) return { status: 'absent', graphics: 'auto' };
  if (typeof raw !== 'string' || raw.length > 4096) return { status: 'corrompu', graphics: 'auto' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 'corrompu', graphics: 'auto' };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || !Number.isInteger(data.v)) return { status: 'corrompu', graphics: 'auto' };
  if (data.v > DEVICE_VERSION) return { status: 'future', graphics: 'auto' };
  if (data.v !== DEVICE_VERSION) return { status: 'corrompu', graphics: 'auto' };
  return { status: 'ok', graphics: GRAPHICS_VALUES.includes(data.graphics) ? data.graphics : 'auto' };
}

// Accès au stockage du navigateur (peut lever : stockage bloqué) ; null s'il est inaccessible.
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// { search, storage } -> { mode: 'local' | 'memory', read(), write(graphics), state() }. read : { graphics, status } ; write : { ok, status, persisted }.
// status : ok, absent, corrompu, future (verrouillé), indisponible (mémoire), echec (écriture refusée : quota), memoire (?test=1).
export function createDeviceSettings({ search = '', storage = null } = {}) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    q = new URLSearchParams('');
  }
  const memoryMode = q.get('test') === '1' && q.get('store') !== 'local';
  let memory = 'auto';
  let unavailable = !memoryMode && (storage === null || typeof storage?.getItem !== 'function');
  let last = { graphics: 'auto', status: memoryMode ? 'memoire' : 'absent' };

  const read = () => {
    if (memoryMode) {
      last = { graphics: memory, status: 'memoire' };
      return last;
    }
    if (unavailable) {
      last = { graphics: memory, status: 'indisponible' };
      return last;
    }
    let raw;
    try {
      raw = storage.getItem(DEVICE_KEY);
    } catch {
      unavailable = true;
      last = { graphics: memory, status: 'indisponible' };
      return last;
    }
    last = parseDevice(raw);
    return last;
  };

  return {
    mode: memoryMode ? 'memory' : 'local',
    key: DEVICE_KEY,
    read,
    write(graphics) {
      if (!GRAPHICS_VALUES.includes(graphics)) return { ok: false, status: 'invalide', persisted: false };
      if (memoryMode) {
        memory = graphics;
        return { ok: true, status: 'memoire', persisted: false };
      }
      const current = read();
      if (current.status === 'corrompu' || current.status === 'future') return { ok: false, status: 'verrouille', persisted: false };
      if (unavailable) {
        memory = graphics;
        return { ok: true, status: 'indisponible', persisted: false };
      }
      try {
        storage.setItem(DEVICE_KEY, JSON.stringify({ v: DEVICE_VERSION, graphics }));
        last = { graphics, status: 'ok' };
        return { ok: true, status: 'ok', persisted: true };
      } catch {
        memory = graphics;
        return { ok: false, status: 'echec', persisted: false };
      }
    },
    state: () => ({ mode: memoryMode ? 'memory' : unavailable ? 'unavailable' : 'local', ...last }),
  };
}
