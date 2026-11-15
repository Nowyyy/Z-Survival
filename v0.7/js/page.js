// Socle commun des pages : choix de la langue, textes, éclaboussures. Utilisé par index.html et dev/.
import { drawSplat } from './splat.js';
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

async function loadDict(base, lang) {
  try {
    const response = await fetch(`${base}data/i18n/${lang}.json`);
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

// base : chemin relatif vers la racine du site ('' ou '../'). render({ t, lang }) est rappelée à chaque changement de langue.
// lang : impose une langue (page sans bouton de langue) ; sinon choix mémorisé, puis langue du navigateur.
export async function startPage({ base = '', lang: fixedLang = null, render = () => {} } = {}) {
  const fallbackDict = await loadDict(base, DEFAULT_LANG);
  const toggle = document.querySelector('[data-lang-toggle]');
  const toggleLabel = toggle?.querySelector('[data-lang-label]');
  const canvas = document.getElementById('splat');
  const redraw = () => drawSplat(canvas);
  let current = fixedLang ?? pickLanguage({ stored: readStored(), browserLanguages: navigator.languages ?? [navigator.language] });

  async function apply(lang) {
    const dict = lang === DEFAULT_LANG ? fallbackDict : await loadDict(base, lang);
    const t = (key) => translate(dict, key, fallbackDict);
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    document.title = t(document.documentElement.dataset.titleKey ?? 'meta.title');
    if (toggle) {
      toggleLabel.textContent = t('lang.toggle');
      toggle.setAttribute('aria-label', t('lang.toggleLabel'));
      toggle.lang = otherLanguage(lang);
    }
    current = lang;
    render({ t, lang });
    redraw();
  }

  toggle?.addEventListener('click', async () => {
    const next = otherLanguage(current);
    writeStored(next);
    await apply(next);
  });

  await apply(current);
  document.getElementById('app').hidden = false;
  redraw();
  addEventListener('resize', redraw);
  document.fonts?.ready.then(redraw);

  // Rubik Dirt est lourde : on ne la charge qu'une fois la page affichée.
  const loadExtraFonts = () => {
    document.fonts?.load('1em "Rubik Dirt"', 'ABC').then(() => {
      document.documentElement.classList.add('fonts-extra');
      redraw();
    });
  };
  if (document.readyState === 'complete') loadExtraFonts();
  else addEventListener('load', loadExtraFonts);
}
