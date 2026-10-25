import { DEFAULT_LANG, otherLanguage, pickLanguage, translate } from './i18n.js';

const STORAGE_KEY = 'mobile-games.lang';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Stockage indisponible : le choix n'est simplement pas mémorisé.
  }
}

async function loadDict(lang) {
  try {
    const response = await fetch(`data/i18n/${lang}.json`);
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

const fallbackDict = await loadDict(DEFAULT_LANG);
const toggle = document.querySelector('[data-lang-toggle]');
let current = pickLanguage({ stored: readStored(), browserLanguages: navigator.languages ?? [navigator.language] });

async function apply(lang) {
  const dict = lang === DEFAULT_LANG ? fallbackDict : await loadDict(lang);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = translate(dict, el.dataset.i18n, fallbackDict);
  }
  document.title = translate(dict, 'meta.title', fallbackDict);
  toggle.textContent = translate(dict, 'lang.toggle', fallbackDict);
  toggle.setAttribute('aria-label', translate(dict, 'lang.toggleLabel', fallbackDict));
  toggle.lang = otherLanguage(lang);
  current = lang;
}

toggle.addEventListener('click', async () => {
  const next = otherLanguage(current);
  writeStored(next);
  await apply(next);
});

await apply(current);
document.getElementById('app').hidden = false;
