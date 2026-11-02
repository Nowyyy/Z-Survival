// Accueil du site (lot 4c) : version actuelle, « Jouer », build de développement, journal et versions précédentes.
// Lit build-info.json et versions.json (dossier courant) et next/build-info.json (racine publiée seulement). Requêtes de même origine seulement.
import { startPage } from '../page.js';
import { fill, formatDate, homeModel } from './home.js';

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

// build-info.json et versions.json sont dans le dossier courant (racine, next/ ou dépôt) : lus en parallèle, préchargés par index.html.
const [info, versions] = await Promise.all([fetchJson('build-info.json'), fetchJson('versions.json')]);
const probe = homeModel({ versions, info });
// Le build de développement n'est sondé qu'à la racine publiée (next/build-info.json y existe toujours, même sans build : hash vide).
const nextInfo = probe.channel === 'release' ? await fetchJson(`${probe.devPath}build-info.json`) : null;
const model = homeModel({ versions, info, nextInfo });

const $ = (id) => document.getElementById(id);

function item(label, meta, href) {
  const li = document.createElement('li');
  const node = document.createElement(href ? 'a' : 'p');
  node.className = href ? 'item' : 'item is-off';
  if (href) node.href = href;
  const brush = document.createElement('span');
  brush.className = 'brush';
  brush.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'item-label';
  name.textContent = label;
  node.append(brush, name);
  if (meta) {
    const small = document.createElement('span');
    small.className = 'meta';
    small.textContent = meta;
    node.append(small);
  }
  li.append(node);
  return li;
}

function render({ t, lang }) {
  $('version').textContent = model.version ? fill(t('home.version'), { channel: t(`home.channel.${model.channelKey}`), version: model.version }) : t('home.versionUnknown');
  $('play').href = model.play;

  const banner = $('dev-banner');
  banner.hidden = !model.banner;
  if (model.banner) banner.textContent = fill(t('home.devBanner'), { sha: model.banner.sha || '—', date: formatDate(model.banner.date, lang) || '—' });

  const devSection = $('dev-section');
  devSection.hidden = !model.devSection;
  if (model.devSection) {
    const nextLink = $('next-link');
    const nextNone = $('next-none');
    const next = model.devSection.next;
    nextLink.hidden = !next;
    nextNone.hidden = Boolean(next);
    if (next) {
      nextLink.href = model.devSection.nextHref;
      nextLink.querySelector('.meta').textContent = fill(t('home.nextMeta'), { sha: next.sha, date: formatDate(next.date, lang) });
    }
    $('journal-link').href = model.devSection.journal;
  }

  const previous = $('previous-section');
  previous.hidden = model.previous.length === 0;
  $('previous-list').replaceChildren(...model.previous.map((v) => (v.href
    ? item(v.label, v.title, v.href)
    : item(fill(t('home.unavailable'), { version: v.label }), v.note || t('home.unavailableNote'), null))));
}

// Accueil : français seulement (la langue se réglera dans le jeu).
await startPage({ lang: 'fr', render });
