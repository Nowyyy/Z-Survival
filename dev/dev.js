import { startPage } from '../js/page.js';
import { lotLabel, lotUrl, parseEntry, parseLot, splitLots } from '../js/lots.js';

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

// Journal des versions : data/changelog.json de la copie du menu elle-même (le menu d'un aperçu montre le journal de son lot).
async function loadChangelog() {
  try {
    const response = await fetch('../data/changelog.json');
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.lots) ? data.lots.filter((e) => parseLot(e?.name) && typeof e.titre === 'string') : [];
  } catch {
    return [];
  }
}

const lots = await loadLots();
const changelog = await loadChangelog();
const changelogSection = document.getElementById('changelog');
const changelogList = document.getElementById('changelog-list');
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

  // Journal : l'ordre du fichier est chronologique, on l'affiche du plus récent au plus ancien ; la date et le lien viennent de lots.json quand le lot y figure.
  const published = new Map((lots ? [lots.latest, ...lots.previous] : []).filter(Boolean).map((lot) => [lot.name, lot]));
  const entries = [...changelog].reverse();
  changelogSection.hidden = entries.length === 0;
  changelogList.replaceChildren(...entries.map((entry) => {
    const lot = published.get(entry.name);
    const item = document.createElement('li');
    const details = document.createElement('details');
    details.className = 'changelog-entry';
    const summary = document.createElement('summary');
    summary.append(`${lotLabel(entry.name)} · ${entry.titre}`);
    const date = lot ? formatDate(lot.date, lang) : '';
    if (date) {
      const small = document.createElement('span');
      small.className = 'changelog-date';
      small.textContent = date;
      summary.append(small);
    }
    const points = document.createElement('ul');
    points.className = 'changelog-points';
    for (const text of Array.isArray(entry.points) ? entry.points : []) {
      const li = document.createElement('li');
      li.textContent = String(text);
      points.append(li);
    }
    details.append(summary, points);
    if (lot) {
      const link = document.createElement('a');
      link.className = 'changelog-open';
      link.href = lotUrl(lot, ROOT);
      link.textContent = t('dev.changelog.open');
      details.append(link);
    }
    item.append(details);
    return item;
  }));

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
