// Page de lancement de la visite libre (lot 3g) : lit zones.json (même origine), calcule la manche qui ouvre toutes les portes (js/core/visite.js)
// et affiche les liens vers jeu.html?nospawn=1&wave=N. Aucune écriture, aucun stockage, aucune requête externe.
import { hasUpperFloor, visitLinks, visitWave } from '../core/visite.js';
import { translate } from '../i18n.js';

const FALLBACK_WAVE = 31; // manche de la base du lot 3g, utilisée seulement si zones.json est illisible (comme le <noscript>)
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
document.title = t('dev.visite.page');

let wave = FALLBACK_WAVE;
let upper = true;
try {
  const zones = await loadJson('data/game/maps/rez-de-chaussee/zones.json');
  wave = visitWave(zones);
  upper = hasUpperFloor(zones);
} catch {
  $('etat').textContent = t('dev.visite.error', { wave });
}
$('intro').textContent = t('dev.visite.intro', { wave });
const ul = $('liens');
for (const link of visitLinks(wave, upper, true)) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.id = link.id;
  a.className = 'visite-link';
  a.href = link.href;
  a.textContent = t(link.key);
  li.append(a);
  ul.append(li);
}
document.body.dataset.wave = String(wave);
$('app').hidden = false;
