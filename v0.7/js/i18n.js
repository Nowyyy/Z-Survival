// Logique pure de langue : aucun DOM, réseau ni stockage.
export const SUPPORTED_LANGS = ['fr', 'en'];
export const DEFAULT_LANG = 'fr';

function normalize(tag) {
  if (typeof tag !== 'string') return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGS.includes(base) ? base : null;
}

// Choisit la langue : préférence mémorisée, sinon langues du navigateur, sinon français.
export function pickLanguage({ stored = null, browserLanguages = [] } = {}) {
  const fromStore = normalize(stored);
  if (fromStore) return fromStore;
  const list = Array.isArray(browserLanguages) ? browserLanguages : [browserLanguages];
  for (const tag of list) {
    const lang = normalize(tag);
    if (lang) return lang;
  }
  return DEFAULT_LANG;
}

export function otherLanguage(lang) {
  return lang === 'fr' ? 'en' : 'fr';
}

// Lit une clé ; repli sur le dictionnaire de secours, puis sur la clé elle-même. Ne lève jamais.
export function translate(dict, key, fallbackDict = null) {
  const own = dict?.[key];
  if (typeof own === 'string') return own;
  const fallback = fallbackDict?.[key];
  if (typeof fallback === 'string') return fallback;
  return String(key);
}
