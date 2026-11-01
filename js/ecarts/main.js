// Page des écarts carte / modèle (lot 3g) : lit releve.json, plan.json (et etage.json), world.json (et etage.world.json) de la même origine,
// compare (js/core/ecarts.js) et dessine (js/core/ecarts-svg.js). Sélecteur d'étage (boutons). Aucune écriture, aucune requête externe.
import { compareFloor, openMid } from '../core/ecarts.js';
import { ecartsToSvg } from '../core/ecarts-svg.js';
import { translate } from '../i18n.js';

const DIR = 'data/game/maps/rez-de-chaussee';
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
document.title = t('dev.ecarts.page');
$('app').hidden = false;

const optional = (path) => loadJson(path).catch(() => null);
try {
  const [releve, plan, world, etage, etageWorld, decisionsFile] = await Promise.all([loadJson(`${DIR}/releve.json`), loadJson(`${DIR}/plan.json`), loadJson(`${DIR}/world.json`), optional(`${DIR}/etage.json`), optional(`${DIR}/etage.world.json`), optional(`${DIR}/ecarts-decisions.json`)]);
  const decisions = decisionsFile?.decisions ?? [];
  const floors = { rdc: { plan, world, name: t('dev.carte.map.rez') } };
  if (etage && etageWorld && releve.floors?.etage) floors.etage = { plan: etage, world: etageWorld, name: t('dev.carte.name.etage') };
  if (!floors.etage) $('bouton-etage').parentElement.hidden = true;
  const show = (floor) => {
    const f = floors[floor] ?? floors.rdc;
    const id = floors[floor] ? floor : 'rdc';
    const { rows } = compareFloor(f.plan, releve, id, { decisions });
    $('figure').innerHTML = ecartsToSvg(releve, f.world, { floor: id, rows, labels: { title: t('dev.ecarts.svg.title', { name: f.name }), desc: t('dev.ecarts.intro'), scale: t('dev.carte.scale'), big: t('dev.ecarts.big') } });
    $('stats').textContent = t('dev.ecarts.stats', { name: f.name, rows: rows.length, big: rows.filter((r) => r.level === 'plus-60').length, mid: openMid(rows).length, objets: rows.filter((r) => r.nature === 'objet').length });
    for (const b of document.querySelectorAll('[data-floor]')) b.setAttribute('aria-pressed', String(b.dataset.floor === id));
    document.body.dataset.floor = id;
  };
  for (const b of document.querySelectorAll('[data-floor]')) b.addEventListener('click', () => show(b.dataset.floor));
  show(new URLSearchParams(location.search).get('floor') === '1' ? 'etage' : 'rdc');
} catch {
  $('stats').textContent = t('dev.ecarts.error');
}
