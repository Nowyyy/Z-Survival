import { startPage } from '../js/page.js';
import { parseLot } from '../js/lots.js';

// Lot 4c : publication par versions. Le menu ne lit plus lots.json (aperçus par lot retirés) : les liens « Ouvrir cette version » viennent de versions.json,
// à la racine du site. Racine : '../' depuis /dev/, '../../' depuis le journal du build de développement (/next/dev/, build-info.json du dossier parent : channel « dev »).
async function fetchJson(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const info = await fetchJson('../build-info.json');
const ROOT = info?.channel === 'dev' ? '../../' : '../';
const ID_RE = /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const SAFE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

// Versions publiées (versions.json) : libellé V0.N → { href, date }. Actuelle : la racine du site ; archive : son dossier et sa page d'entrée ; indisponible : aucun lien.
async function loadVersions() {
  const data = await fetchJson(`${ROOT}versions.json`);
  const map = new Map();
  for (const v of Array.isArray(data?.versions) ? data.versions : []) {
    if (!ID_RE.test(v?.id ?? '')) continue;
    const entry = typeof v.entry === 'string' && SAFE_PATH.test(v.entry) && !v.entry.split('/').includes('..') ? v.entry : null;
    const href = v.status === 'actuelle' ? ROOT : v.status === 'archive' && entry ? `${ROOT}${v.id}/${entry}` : null;
    map.set(`V${v.id.slice(1)}`, { href, date: typeof v.date === 'string' ? v.date : '' });
  }
  return map;
}

// Journal des versions : data/changelog.json de la copie du menu elle-même.
// Lot 4b (demande du propriétaire) : si le fichier a une liste « versions » (version, lot, enCours), seules ces entrées sont montrées, de la plus récente (en haut) à la
// plus ancienne, sous leur numéro de version (V0.5…V0.1) ; les autres lots restent dans le fichier (historique) mais ne sont plus affichés. Sans cette liste : tous les lots.
async function readChangelog(url) {
  const data = await fetchJson(url);
  const lots = Array.isArray(data?.lots) ? data.lots.filter((e) => parseLot(e?.name) && typeof e.titre === 'string') : [];
  const versions = Array.isArray(data?.versions) ? data.versions.filter((v) => typeof v?.version === 'string' && parseLot(v?.lot) && lots.some((e) => e.name === v.lot)) : [];
  return { lots, versions };
}

// Entrées affichées, de la plus récente à la plus ancienne : les versions (liste « versions », dans l'ordre chronologique du fichier), sinon tous les lots.
// Lot 4c : aucun identifiant de lot n'est affiché (un lot sans version porte seulement son titre).
function shownEntries(log) {
  if (log.versions.length === 0) return [...log.lots].reverse().map((e) => ({ ...e, version: null }));
  return log.versions.map((v) => ({ ...log.lots.find((e) => e.name === v.lot), version: v.version, enCours: v.enCours === true })).reverse();
}

const [published, changelog] = await Promise.all([loadVersions(), readChangelog('../data/changelog.json')]);
const changelogSection = document.getElementById('changelog');
const changelogList = document.getElementById('changelog-list');
document.querySelector('a[href="../"]')?.setAttribute('href', ROOT);

const formatDate = (iso, lang) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
};

function render({ t, lang }) {
  const entries = shownEntries(changelog);
  changelogSection.hidden = entries.length === 0;
  changelogList.replaceChildren(...entries.map((entry) => {
    const version = entry.version ? published.get(entry.version) : null;
    const item = document.createElement('li');
    const details = document.createElement('details');
    details.className = 'changelog-entry';
    const summary = document.createElement('summary');
    summary.append(`${entry.version ? `${entry.version} · ` : ''}${entry.titre}${entry.enCours ? ` (${t('dev.changelog.current')})` : ''}`);
    const date = version ? formatDate(version.date, lang) : '';
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
    if (version?.href) {
      const link = document.createElement('a');
      link.className = 'changelog-open';
      link.href = version.href;
      link.textContent = t('dev.changelog.open');
      details.append(link);
    }
    item.append(details);
    return item;
  }));
}

// Menu de développement : français seulement (la langue se réglera dans le jeu).
await startPage({ base: '../', lang: 'fr', render });
