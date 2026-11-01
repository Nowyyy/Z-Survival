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
    // Seul le dernier lot est sondé d'avance (lots.json porte le champ entry des autres).
    if (split.latest && typeof split.latest.entry !== 'string') split.latest = { ...split.latest, entry: await fetchEntry(split.latest) };
    return split;
  } catch {
    return null;
  }
}

// Journal des versions : data/changelog.json de la copie du menu elle-même (le menu d'un aperçu montre le journal de son lot).
// Lot 4b (demande du propriétaire) : si le fichier a une liste « versions » (version, lot, enCours), seules ces entrées sont montrées, de la plus récente (en haut) à la
// plus ancienne, sous leur numéro de version (V0.5…V0.1) ; les autres lots restent dans le fichier (historique) mais ne sont plus affichés. Sans cette liste : tous les lots.
async function readChangelog(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return { lots: [], versions: [] };
    const data = await response.json();
    const lots = Array.isArray(data.lots) ? data.lots.filter((e) => parseLot(e?.name) && typeof e.titre === 'string') : [];
    const versions = Array.isArray(data.versions) ? data.versions.filter((v) => typeof v?.version === 'string' && parseLot(v?.lot) && lots.some((e) => e.name === v.lot)) : [];
    return { lots, versions };
  } catch {
    return { lots: [], versions: [] };
  }
}

// Le menu de main ne connaît pas encore le lot en cours : on lit aussi le journal du dernier lot publié et on garde le plus complet.
async function loadChangelog(latest) {
  const own = await readChangelog('../data/changelog.json');
  if (!latest) return own;
  const fromLatest = await readChangelog(`${ROOT}lots/${latest.name}/data/changelog.json`);
  return fromLatest.lots.length > own.lots.length ? fromLatest : own;
}

// Entrées affichées, de la plus récente à la plus ancienne : les versions majeures (liste « versions », dans l'ordre chronologique du fichier), sinon tous les lots.
function shownEntries(log) {
  if (log.versions.length === 0) return [...log.lots].reverse();
  return log.versions.map((v) => ({ ...log.lots.find((e) => e.name === v.lot), version: v.version, enCours: v.enCours === true })).reverse();
}

const lots = await loadLots();
const changelog = await loadChangelog(lots?.latest ?? null);
const changelogSection = document.getElementById('changelog');
const changelogList = document.getElementById('changelog-list');
const latestLink = document.getElementById('latest');
const latestLabel = latestLink.querySelector('[data-label]');
const latestMeta = latestLink.querySelector('[data-meta]');
document.querySelector('a[href="../"]')?.setAttribute('href', ROOT);
const note = document.getElementById('note');

const formatDate = (iso, lang) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date);
};

function render({ t, lang }) {
  const latest = lots?.latest ?? null;

  latestLink.hidden = !latest;
  if (latest) {
    latestLink.href = lotUrl(latest, ROOT);
    const version = changelog.versions.find((v) => v.lot === latest.name)?.version;
    latestLabel.textContent = t('dev.latest').replace('{lot}', lotLabel(latest.name, latest.nom || version));
    latestMeta.textContent = formatDate(latest.date, lang);
  }

  // Journal : l'ordre du fichier est chronologique, on l'affiche du plus récent au plus ancien ; la date et le lien viennent de lots.json quand le lot y figure.
  const published = new Map((lots ? [lots.latest, ...lots.previous] : []).filter(Boolean).map((lot) => [lot.name, lot]));
  const entries = shownEntries(changelog);
  changelogSection.hidden = entries.length === 0;
  changelogList.replaceChildren(...entries.map((entry) => {
    const lot = published.get(entry.name);
    const item = document.createElement('li');
    const details = document.createElement('details');
    details.className = 'changelog-entry';
    const summary = document.createElement('summary');
    summary.append(`${entry.version ?? lotLabel(entry.name, lot?.nom)} · ${entry.titre}${entry.enCours ? ` (${t('dev.changelog.current')})` : ''}`);
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
}

// Menu de développement : français seulement (la langue se réglera dans le jeu).
await startPage({ base: '../', lang: 'fr', render });
