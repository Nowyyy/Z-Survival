import { startPage } from '../js/page.js';
import { lotLabel, lotUrl, parseEntry, splitLots } from '../js/lots.js';

// Racine du site : '../' depuis /dev/, '../../../' depuis la copie du menu dans un aperçu (/lots/lot-N/dev/).
const ROOT = /\/lots\/[^/]+\/dev\/?$/.test(location.pathname) ? '../../../' : '../';

// Page d'aperçu d'un lot : champ « entry » de lots.json ; à défaut (lots.json produit par un ancien script), première ligne de son apercu.txt.
async function fetchEntry(lot) {
  try {
    const response = await fetch(`${ROOT}lots/${lot.name}/apercu.txt`);
    return response.ok ? parseEntry(await response.text()) : '';
  } catch {
    return '';
  }
}

async function loadLots() {
  try {
    const response = await fetch(`${ROOT}lots.json`);
    if (!response.ok) return null;
    const data = await response.json();
    const split = splitLots(Array.isArray(data.lots) ? data.lots : []);
    // Seul le dernier lot est sondé d'avance ; les anciens le sont au moment de les ouvrir (pas de requêtes inutiles).
    if (split.latest && typeof split.latest.entry !== 'string') split.latest = { ...split.latest, entry: await fetchEntry(split.latest) };
    return split;
  } catch {
    return null;
  }
}

const lots = await loadLots();
const latestLink = document.getElementById('latest');
const latestLabel = latestLink.querySelector('[data-label]');
const latestMeta = latestLink.querySelector('[data-meta]');
document.querySelector('a[href="../"]')?.setAttribute('href', ROOT);
const picker = document.getElementById('picker');
const select = document.getElementById('previous');
const note = document.getElementById('note');

const formatDate = (iso, lang) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date);
};

function render({ t, lang }) {
  const latest = lots?.latest ?? null;
  const previous = lots?.previous ?? [];

  latestLink.hidden = !latest;
  if (latest) {
    latestLink.href = lotUrl(latest, ROOT);
    latestLabel.textContent = t('dev.latest').replace('{lot}', lotLabel(latest.name));
    latestMeta.textContent = formatDate(latest.date, lang);
  }

  const chosen = select.value;
  select.replaceChildren(new Option(t('dev.choose'), ''));
  for (const lot of previous) {
    const date = formatDate(lot.date, lang);
    select.add(new Option(date ? `${lotLabel(lot.name)} · ${date}` : lotLabel(lot.name), lotUrl(lot, ROOT)));
  }
  select.value = [...select.options].some((o) => o.value === chosen) ? chosen : '';
  picker.hidden = !lots;
  select.disabled = previous.length === 0;
  picker.querySelector('button').disabled = previous.length === 0;

  note.textContent = lots === null ? t('dev.unavailable') : latest ? '' : t('dev.noLots');
  note.hidden = note.textContent === '';
  if (lots && previous.length === 0) select.options[0].textContent = t('dev.noPrevious');
}

picker.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!select.value) return;
  const lot = lots?.previous.find((l) => select.value === lotUrl(l, ROOT));
  location.assign(lot && typeof lot.entry !== 'string' ? lotUrl({ ...lot, entry: await fetchEntry(lot) }, ROOT) : select.value);
});

// Menu de développement : français seulement (la langue se réglera dans le jeu).
await startPage({ base: '../', lang: 'fr', render });
