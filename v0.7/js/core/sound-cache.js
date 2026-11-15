// Cache des tampons de l'atelier des sons (lot 3h), pur et sans mutation : au plus `limit` octets (24 Mo par défaut), éviction des
// entrées les moins récemment utilisées. Chaque opération renvoie un nouvel état ; les valeurs (tampons) ne sont pas copiées.
import { isNum } from './vec.js';

export const CACHE_LIMIT = 24 * 1024 * 1024;

export const createCache = (limit = CACHE_LIMIT) => ({ limit: isNum(limit) && limit > 0 ? Math.floor(limit) : CACHE_LIMIT, bytes: 0, entries: [] });

const valid = (c) => c && Array.isArray(c.entries) && isNum(c.limit);

// Lecture : { cache, value } (value null si absente) ; une entrée lue devient la plus récente.
export function cacheGet(cache, key) {
  if (!valid(cache)) return { cache: createCache(), value: null };
  const i = cache.entries.findIndex((e) => e.key === key);
  if (i < 0) return { cache, value: null };
  const e = cache.entries[i];
  return { cache: { ...cache, entries: [...cache.entries.slice(0, i), ...cache.entries.slice(i + 1), e] }, value: e.value };
}

// Écriture : { cache, evicted (clés retirées) } ; une entrée plus grosse que la limite n'est pas gardée.
export function cachePut(cache, key, value, bytes) {
  const c = valid(cache) ? cache : createCache();
  const size = isNum(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
  let entries = c.entries.filter((e) => e.key !== key);
  const evicted = [];
  if (size > c.limit) return { cache: { ...c, entries, bytes: entries.reduce((s, e) => s + e.bytes, 0) }, evicted: [key] };
  entries = [...entries, { key, value, bytes: size }];
  let total = entries.reduce((s, e) => s + e.bytes, 0);
  while (total > c.limit && entries.length > 0) {
    const [old, ...rest] = entries;
    evicted.push(old.key);
    total -= old.bytes;
    entries = rest;
  }
  return { cache: { ...c, entries, bytes: total }, evicted };
}

export const cacheBytes = (cache) => (valid(cache) ? cache.entries.reduce((s, e) => s + e.bytes, 0) : 0);
export const cacheKeys = (cache) => (valid(cache) ? cache.entries.map((e) => e.key) : []);
