// Accueil de la Recette (lot 4c ; refait au lot 5g ; retouché au lot 5i) : bandeau « Recette », « Jouer - <étiquette> », dernier build de développement,
// évolutions en cours de développement (colonne de gauche) et « Toutes les versions » (colonne de droite : carte de la version actuelle, sans lien,
// puis versions précédentes). Une seule lecture : site-info.json, dans le dossier courant
// (Recette/ du site assemblé). Contenu inséré par textContent seulement ; aucune requête externe, aucun stockage.
import { startPage } from '../page.js';
import { fill, formatDate, homeModel } from './home.js';
import { poserLogo } from '../logo.js';

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const model = homeModel(await fetchJson('site-info.json'));
const $ = (id) => document.getElementById(id);

function node(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content) el.textContent = content;
  return el;
}

// Version précédente : lien vers son entrée (../v0.N/…), ou texte non cliquable avec sa raison si elle est indisponible.
function previousItem(v, t) {
  const li = document.createElement('li');
  const item = node(v.href ? 'a' : 'p', v.href ? 'item' : 'item is-off');
  if (v.href) item.href = v.href;
  const brush = node('span', 'brush');
  brush.setAttribute('aria-hidden', 'true');
  item.append(brush, node('span', 'item-label', v.href ? v.label : fill(t('home.unavailable'), { version: v.label })));
  const meta = v.href ? v.title : [v.title, v.note || t('home.unavailableNote')].filter(Boolean).join(' — ');
  if (meta) item.append(node('span', 'meta', meta));
  li.append(item);
  return li;
}

function evolutionItem(e) {
  const li = node('li', 'evolution');
  li.append(node('p', 'evolution-title', e.title), node('p', 'evolution-text', e.text));
  return li;
}

function render({ t, lang }) {
  // Lot 8a (demande du propriétaire) : le titre devient le logo du jeu (Z incliné et coulures, sans animation) ; « Z-Survival » reste le nom accessible.
  poserLogo(document.querySelector('.home .title'), t('app.title'));
  // Lot 5i : le bandeau dit « Recette » seulement (data-i18n="home.badge") ; la version est dans le bouton (« Jouer - V0.6 »), sans version connue : « Jouer ».
  $('play').textContent = model.state === 'ok' ? fill(t('home.playVersion'), { version: model.playLabel }) : t('home.play');
  $('play').href = model.play;

  const notice = $('site-notice');
  notice.hidden = model.state === 'ok';
  if (model.state !== 'ok') notice.textContent = t(model.state === 'source' ? 'home.siteSource' : 'home.siteError');

  // Développement : lien vers ../dev/jeu.html (hash court et date si connus) ; sans build de dev, texte non cliquable.
  const devLink = $('dev-link');
  devLink.hidden = !model.dev.present;
  $('dev-none').hidden = model.dev.present;
  devLink.href = model.dev.href;
  const meta = model.dev.sha ? fill(t('home.nextMeta'), { sha: model.dev.sha, date: formatDate(model.dev.date, lang) || '—' }) : '';
  devLink.querySelector('.meta').textContent = meta;
  devLink.querySelector('.meta').hidden = !meta;

  // Listes : seulement pour un site assemblé (sinon, les liens statiques suffisent).
  for (const id of ['evolutions-section', 'versions-section']) $(id).hidden = model.state !== 'ok';
  // Carte de la version actuelle (lot 5i) : étiquette et description complète ; sans description, seulement le badge et le nom ; aucun lien.
  $('current-name').textContent = model.current?.label ?? '';
  $('current-text').textContent = model.current?.title ?? '';
  $('current-text').hidden = !model.current?.title;
  $('evolutions-list').replaceChildren(...model.evolutions.map(evolutionItem));
  $('evolutions-none').hidden = model.evolutions.length > 0;
  $('previous-list').replaceChildren(...model.previous.map((v) => previousItem(v, t)));
  $('previous-none').hidden = model.previous.length > 0;
}

// Accueil : français seulement (la langue se réglera dans le jeu).
await startPage({ lang: 'fr', render });
