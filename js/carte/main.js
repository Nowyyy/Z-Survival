// Page de contrôle de la carte (lot 3b) : dessine en SVG (js/core/map-svg.js) world.json et decor.json de la carte choisie par ?map=
// (rez-de-chaussee par défaut, salle = l'ancienne salle) pour la comparer au plan du propriétaire. Aucune écriture, aucune requête externe.
import { mapToSvg } from '../core/map-svg.js';
import { resolveMapId } from '../core/maps.js';
import { translate } from '../i18n.js';

const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const $ = (id) => document.getElementById(id);

const dict = await loadJson('data/i18n/fr.json');
const t = (key, params) => fmt(translate(dict, key), params);
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', translate(dict, el.dataset.i18nLabel));
document.title = t('dev.carte.page');
$('app').hidden = false;

const id = resolveMapId(location.search);
if (id === 'rez-de-chaussee') $('lien-rez').setAttribute('aria-current', 'page');
if (id === 'salle') $('lien-salle').setAttribute('aria-current', 'page');
$('lien-rez').setAttribute('href', 'carte.html');
$('lien-salle').setAttribute('href', 'carte.html?map=salle');
$('lien-jeu').setAttribute('href', id === 'salle' ? 'jeu.html?map=salle&labels=1&zoom=1' : 'jeu.html?labels=1&zoom=1');

try {
  const [world, decor] = id === 'salle'
    ? await Promise.all([loadJson('data/game/world.json'), loadJson('data/game/decor.json')])
    : await Promise.all([loadJson(`data/game/maps/${id}/world.json`), loadJson(`data/game/maps/${id}/decor.json`)]);
  const name = t(id === 'salle' ? 'dev.carte.map.salle' : 'dev.carte.map.rez');
  const svg = mapToSvg(world, decor, { labels: { title: t('dev.carte.svg.title', { name }), desc: t('dev.carte.svg.desc'), scale: t('dev.carte.scale'), frame: t('dev.carte.frame'), start: t('dev.carte.start') } });
  $('figure').innerHTML = svg;
  const pillars = Array.isArray(world.pillars) ? world.pillars.length : 0;
  $('stats').textContent = t('dev.carte.stats', { name, w: world.size.width, h: world.size.height, windows: world.windows.length, pillars, obstacles: world.obstacles.length });
} catch {
  $('stats').textContent = t('dev.carte.error');
}
