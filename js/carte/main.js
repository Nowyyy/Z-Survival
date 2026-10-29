// Page de contrôle de la carte (lot 3b) : dessine en SVG (js/core/map-svg.js) world.json et decor.json de la carte choisie par ?map=
// (rez-de-chaussee par défaut, salle = l'ancienne salle) pour la comparer au plan du propriétaire. Aucune écriture, aucune requête externe.
import { mapToSvg } from '../core/map-svg.js';
import { resolveMapId } from '../core/maps.js';
import { parseZones, zonesToWorld } from '../core/zones.js';
import { translate } from '../i18n.js';

const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const $ = (id) => document.getElementById(id);
// Bloc de porte donné par une ouverture (segment de etage.json) : un rectangle de l'épaisseur d'un mur (40) autour du segment.
const segmentRect = (o) => (o ? { x: Math.min(o.x1, o.x2) - 20, y: Math.min(o.y1, o.y2) - 20, w: Math.abs(o.x2 - o.x1) + 40, h: Math.abs(o.y2 - o.y1) + 40 } : {});

const dict = await loadJson('data/i18n/fr.json');
const t = (key, params) => fmt(translate(dict, key), params);
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', translate(dict, el.dataset.i18nLabel));
document.title = t('dev.carte.page');
$('app').hidden = false;

const id = resolveMapId(location.search);
// Lot 3e : ?floor=1 dessine l'étage du rez-de-chaussée (etage.world.json) ; la salle n'a qu'un étage.
const upper = id === 'rez-de-chaussee' && new URLSearchParams(location.search).get('floor') === '1';
if (id === 'rez-de-chaussee' && !upper) $('lien-rez').setAttribute('aria-current', 'page');
if (id === 'salle') $('lien-salle').setAttribute('aria-current', 'page');
$('lien-rez').setAttribute('href', 'carte.html');
$('lien-salle').setAttribute('href', 'carte.html?map=salle');
$('lien-etage-rdc').setAttribute('href', 'carte.html?floor=0');
$('lien-etage').setAttribute('href', 'carte.html?floor=1');
if (id === 'rez-de-chaussee') $(upper ? 'lien-etage' : 'lien-etage-rdc').setAttribute('aria-current', 'page');
else for (const key of ['lien-etage-rdc', 'lien-etage']) $(key).parentElement.hidden = true;
$('lien-jeu').setAttribute('href', id === 'salle' ? 'jeu.html?map=salle&labels=1&zoom=1' : upper ? 'jeu.html?wave=31&labels=1&zoom=1&floor=1' : 'jeu.html?labels=1&zoom=1');

try {
  const [rdcWorld, decor] = id === 'salle'
    ? await Promise.all([loadJson('data/game/world.json'), loadJson('data/game/decor.json')])
    : await Promise.all([loadJson(`data/game/maps/${id}/world.json`), loadJson(`data/game/maps/${id}/decor.json`)]);
  let world = rdcWorld;
  let drawn = decor;
  let overlays = {};
  if (id !== 'salle') {
    const zones = zonesToWorld(parseZones(await loadJson(`data/game/maps/${id}/zones.json`)), rdcWorld.transform);
    const floor = upper ? 'etage' : 'rdc';
    if (upper) {
      world = await loadJson(`data/game/maps/${id}/etage.world.json`);
      drawn = { ...decor, spawnPoints: world.spawnPoints };
    }
    overlays = {
      blocks: zones.doors.flatMap((d) => (d.blocks ?? []).filter((b) => b.floor === floor).map((b) => ({ id: d.id, ...(b.rect ?? segmentRect(b.opening)) }))).filter((o) => Number.isFinite(o.x)),
      triggers: zones.stairs.filter((st) => st.floors[floor]?.trigger).map((st) => ({ id: st.id, label: st.label, ...st.floors[floor].trigger })),
      arrivals: zones.stairs.filter((st) => st.floors[floor]?.arrival).map((st) => ({ id: st.id, ...st.floors[floor].arrival })),
    };
  }
  const name = t(id === 'salle' ? 'dev.carte.map.salle' : upper ? 'dev.carte.name.etage' : 'dev.carte.map.rez');
  const svg = mapToSvg(world, drawn, { overlays, labels: { title: t('dev.carte.svg.title', { name }), desc: t('dev.carte.svg.desc'), scale: t('dev.carte.scale'), frame: t('dev.carte.frame'), start: t('dev.carte.start') } });
  $('figure').innerHTML = svg;
  const pillars = Array.isArray(world.pillars) ? world.pillars.length : 0;
  $('stats').textContent = t('dev.carte.stats', { name, w: world.size.width, h: world.size.height, windows: world.windows.length, pillars, obstacles: world.obstacles.length });
} catch {
  $('stats').textContent = t('dev.carte.error');
}
