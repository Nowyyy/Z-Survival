// Préférence d'appareil (lot 5b ; schéma 2 au lot 5j) : préréglage graphique et configuration Perso choisis dans l'écran Options de la pause.
// Clé zs.device.v1, schéma { v: 2, graphics: "auto" | "faible" | "moyen" | "eleve" | "perso", custom: { <option>: <valeur> } | null }.
// Schéma 1 ({ v: 1, graphics }) : lu comme { graphics, custom: null } (migration à la lecture ; la clé n'est réécrite en schéma 2 qu'au prochain choix).
// Ce n'est pas la progression (zs.save.v1) : elle est écrite même en mode essai, mais jamais sous ?test=1 sans ?store=local (mémoire). Elle reste propre à
// l'appareil (jamais synchronisée avec un futur compte). Mêmes règles que le dépôt de sauvegarde : valeur inconnue ramenée à « auto » ; JSON illisible ou
// version future : lu comme « auto » et jamais écrasé (verrouillé) ; stockage indisponible : mémoire de la session et message ; aucune exception.
// Ici seulement la forme de custom (identifiants et valeurs courts) ; les options et leurs valeurs permises sont vérifiées par js/core/graphics.js.
export const DEVICE_KEY = 'zs.device.v1';
export const DEVICE_VERSION = 2;
export const GRAPHICS_VALUES = ['auto', 'faible', 'moyen', 'eleve', 'perso'];
const V1_VALUES = ['auto', 'faible', 'moyen', 'eleve'];
const ID_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
const VALUE_RE = /^[A-Za-z0-9._-]{1,16}$/;
const MAX_ENTRIES = 32;

// Forme de custom : objet d'au plus 32 paires identifiant → valeur (chaînes courtes) ; le reste est ignoré ; rien de valable : null.
export function customShape(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= MAX_ENTRIES) break;
    if (!ID_RE.test(k) || typeof v !== 'string' || !VALUE_RE.test(v)) continue;
    out[k] = v;
    n += 1;
  }
  return n ? out : null;
}

// Lecture d'une valeur brute : { status: 'absent' | 'ok' | 'corrompu' | 'future', graphics, custom, from } (from : schéma lu, 1 ou 2).
export function parseDevice(raw) {
  const none = (status) => ({ status, graphics: 'auto', custom: null });
  if (raw === null || raw === undefined) return none('absent');
  if (typeof raw !== 'string' || raw.length > 4096) return none('corrompu');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return none('corrompu');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || !Number.isInteger(data.v)) return none('corrompu');
  if (data.v > DEVICE_VERSION) return none('future');
  if (data.v === 1) return { status: 'ok', graphics: V1_VALUES.includes(data.graphics) ? data.graphics : 'auto', custom: null, from: 1 };
  if (data.v !== DEVICE_VERSION) return none('corrompu');
  return { status: 'ok', graphics: GRAPHICS_VALUES.includes(data.graphics) ? data.graphics : 'auto', custom: customShape(data.custom), from: 2 };
}

// Accès au stockage du navigateur (peut lever : stockage bloqué) ; null s'il est inaccessible.
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// { search, storage } -> { mode: 'local' | 'memory', read(), write(graphics, custom), state() }. read : { graphics, custom, status } ;
// write : { ok, status, persisted } (custom absent : la configuration Perso déjà connue est gardée).
// status : ok, absent, corrompu, future (verrouillé), indisponible (mémoire), echec (écriture refusée : quota), memoire (?test=1).
export function createDeviceSettings({ search = '', storage = null } = {}) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    q = new URLSearchParams('');
  }
  const memoryMode = q.get('test') === '1' && q.get('store') !== 'local';
  let memory = { graphics: 'auto', custom: null };
  let unavailable = !memoryMode && (storage === null || typeof storage?.getItem !== 'function');
  let last = { graphics: 'auto', custom: null, status: memoryMode ? 'memoire' : 'absent' };

  const read = () => {
    if (memoryMode) {
      last = { ...memory, status: 'memoire' };
      return last;
    }
    if (unavailable) {
      last = { ...memory, status: 'indisponible' };
      return last;
    }
    let raw;
    try {
      raw = storage.getItem(DEVICE_KEY);
    } catch {
      unavailable = true;
      last = { ...memory, status: 'indisponible' };
      return last;
    }
    const p = parseDevice(raw);
    last = { status: p.status, graphics: p.graphics, custom: p.custom };
    if (p.from === 1) last.migrated = true;
    return last;
  };

  return {
    mode: memoryMode ? 'memory' : 'local',
    key: DEVICE_KEY,
    read,
    write(graphics, custom) {
      if (!GRAPHICS_VALUES.includes(graphics)) return { ok: false, status: 'invalide', persisted: false };
      if (memoryMode) {
        memory = { graphics, custom: custom === undefined ? memory.custom : customShape(custom) };
        return { ok: true, status: 'memoire', persisted: false };
      }
      const current = read();
      if (current.status === 'corrompu' || current.status === 'future') return { ok: false, status: 'verrouille', persisted: false };
      const next = { graphics, custom: custom === undefined ? current.custom : customShape(custom) };
      if (unavailable) {
        memory = next;
        return { ok: true, status: 'indisponible', persisted: false };
      }
      try {
        storage.setItem(DEVICE_KEY, JSON.stringify({ v: DEVICE_VERSION, graphics: next.graphics, custom: next.custom }));
        last = { ...next, status: 'ok' };
        return { ok: true, status: 'ok', persisted: true };
      } catch {
        memory = next;
        return { ok: false, status: 'echec', persisted: false };
      }
    },
    state: () => ({ mode: memoryMode ? 'memory' : unavailable ? 'unavailable' : 'local', ...last }),
  };
}
