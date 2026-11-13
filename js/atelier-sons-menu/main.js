// Lot 8i : page d'écoute des sons du menu (atelier-sons-menu.html, page technique ; Docs/ref/sons-menu.md). Pour chaque son de
// data/menu/sons.json : ses variantes (écoute, mesures), la variante gardée (cases à cocher, préremplies d'après data/menu/sons-choix.json) ;
// une démonstration d'ouverture ×1 par rareté, en son seul, aux instants de la chronologie réelle (js/core/ouverture.js) ; la musique des menus
// (lecture, arrêt, couches) ; et le contenu de sons-choix.json correspondant aux variantes cochées, à copier. Rien n'est stocké. Aucun son
// avant un geste. ?test=1 expose window.__zsSonsMenu (état, journal des lectures, empreintes).
import { lireChoix, lireSons, sonsOuverture, texteChoix } from '../core/sons-menu.js';
import { COUCHES_MUSIQUE, lireMusique } from '../core/musique-menu.js';
import { chronologie, lireOuvertures } from '../core/ouverture.js';
import { translate } from '../i18n.js';
import { creerMusique } from '../menu/sons/musique.js';
import { mesurerSon, rendreSon } from '../menu/sons/synthese.js';

const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const charger = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
};
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, enfants = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'for' || k === 'role') n.setAttribute(k, v);
    else n[k] = v;
  }
  for (const c of enfants) n.append(c);
  return n;
};
const nombre = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');

const adresse = new URLSearchParams(location.search);
const test = adresse.get('test') === '1';
const [dict, brut, choixBrut, ouverturesBrut, raretesBrut] = await Promise.all([
  charger('data/i18n/atelier-sons-menu.json'), charger('data/menu/sons.json'), charger('data/menu/sons-choix.json').catch(() => null),
  charger('data/menu/ouvertures.json'), charger('data/menu/raretes.json'),
]);
const t = (cle, params) => fmt(translate(dict, cle), params);
for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
const statut = $('status');
const { catalogue, erreurs } = lireSons(brut);
if (!catalogue) {
  statut.textContent = t('dev.sonsmenu.status.erreur', { detail: erreurs.join(' ; ') });
  $('app').hidden = false;
  throw new Error(erreurs.join(' ; '));
}
const lu = lireChoix(choixBrut, catalogue);
const fichier = choixBrut?.choix && typeof choixBrut.choix === 'object' ? choixBrut.choix : {};
const choix = { ...lu.choix }; // variantes cochées sur la page
const sons = new Map(catalogue.sons.map((s) => [s.id, s]));
// Retour du propriétaire : par défaut, seuls les sons encore à choisir (aChoisir de data/menu/sons.json) sont montrés ; ?tout=1 : tous les sons
// et la musique (déjà choisis). Le texte de sons-choix.json reste complet dans les deux vues. Aucun son à choisir : tout est montré.
const restants = catalogue.sons.filter((s) => s.aChoisir);
const tout = adresse.get('tout') === '1' || restants.length === 0;
const montres = tout ? catalogue.sons : restants;
const journal = [];

// ---------- lecture ----------
const Contexte = window.AudioContext ?? window.webkitAudioContext;
let ctx = null;
let general = null;
const actives = new Set();
const tampons = new Map(); // « son:variante:version » -> { buffer, mesures, ms, samples }
let musique = null;
let volume = Number($('volume').value);

function debloquer() {
  if (!Contexte) {
    statut.textContent = t('dev.sonsmenu.status.absent');
    return false;
  }
  if (!ctx) {
    ctx = new Contexte();
    general = ctx.createGain();
    general.gain.value = volume / 100;
    general.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume?.().catch(() => {});
  statut.textContent = t('dev.sonsmenu.status.pret');
  return true;
}
function rendu(id, variante, version = 1) {
  const cle = `${id}:${variante}:${version}`;
  if (!tampons.has(cle)) {
    const t0 = performance.now();
    const r = rendreSon(sons.get(id), variante, version);
    tampons.set(cle, { samples: r.samples, sampleRate: r.sampleRate, mesures: mesurerSon(r.samples, r.sampleRate), ms: performance.now() - t0, buffer: null });
  }
  return tampons.get(cle);
}
// Joue un son à l'instant audio `quand` (défaut : tout de suite), au gain de lecture du catalogue × gain. Renvoie la source ou null.
function jouer(id, variante, { quand = 0, gain = 1, version = 1, fin = null, origine = 'bouton' } = {}) {
  const s = sons.get(id);
  if (!s || !debloquer()) return null;
  const r = rendu(id, variante, Math.min(version, s.versions));
  if (r.samples.length === 0) return null;
  if (!r.buffer) {
    r.buffer = ctx.createBuffer(1, r.samples.length, r.sampleRate);
    r.buffer.copyToChannel(r.samples, 0);
  }
  const source = ctx.createBufferSource();
  source.buffer = r.buffer;
  const g = ctx.createGain();
  g.gain.value = s.gain * gain;
  source.connect(g).connect(general);
  const depart = Math.max(ctx.currentTime, quand);
  source.start(depart);
  if (fin !== null && fin > depart) {
    g.gain.setValueAtTime(s.gain * gain, fin);
    g.gain.linearRampToValueAtTime(0, fin + 0.08);
    source.stop(fin + 0.1);
  }
  actives.add(source);
  source.onended = () => {
    actives.delete(source);
    g.disconnect();
  };
  journal.push({ son: id, variante, version, origine, gain: s.gain * gain, quand: depart });
  if (journal.length > 400) journal.shift();
  return source;
}
function toutArreter() {
  for (const s of [...actives]) {
    try {
      s.stop();
    } catch { /* déjà arrêtée */ }
  }
  actives.clear();
  arreterMusique();
  $('demo-status').textContent = t('dev.sonsmenu.demo.aucune');
}

// ---------- sons et variantes ----------
const groupes = $('groups');
const texteMesures = (v, r) => t('dev.sonsmenu.mesures', { variante: v, duree: nombre(r.mesures.duree, 2), crete: nombre(r.mesures.creteDb), moyen: nombre(r.mesures.moyenDb), hz: r.mesures.aiguHz, octets: nombre(r.mesures.octets / 1024, 0), ms: nombre(r.ms, 0) });
function majChoix() {
  $('choices-text').value = texteChoix(choix, catalogue, t('dev.sonsmenu.choix.note'));
}
for (const groupe of ['menu', 'chute', 'raretes', 'ouverture']) {
  const duGroupe = montres.filter((x) => x.groupe === groupe);
  if (duGroupe.length === 0) continue;
  const liste = el('ul', { class: 'slot-list' });
  const titreId = `groupe-${groupe}`;
  groupes.append(el('section', { class: 'atelier-section', 'aria-labelledby': titreId, 'data-groupe': groupe }, [el('h2', { class: 'atelier-heading', id: titreId, text: t(`dev.sonsmenu.groupe.${groupe}`) }), liste]));
  for (const s of duGroupe) {
    const nom = t(`dev.sonsmenu.son.${s.id}`);
    const carte = el('li', { class: 'slot', 'data-son': s.id, id: `son-${s.id}` });
    carte.append(el('h3', { class: 'slot-title', id: `t-${s.id}` }, [nom, ' ', el('code', { class: 'slot-id', text: s.id })]));
    const dansFichier = typeof fichier[s.id] === 'string' && s.variantes.some((v) => v.id === fichier[s.id]);
    carte.append(el('p', { class: 'slot-choice', 'data-choice': dansFichier ? fichier[s.id] : 'afaire', text: t(dansFichier ? 'dev.sonsmenu.choisi.fichier' : 'dev.sonsmenu.choisi.defaut', { variante: lu.choix[s.id] }) }));
    const mesures = el('p', { class: 'slot-measures', text: t('dev.sonsmenu.mesures.aucune') });
    const rangee = el('div', { class: 'slot-play' });
    let version = 0;
    for (const v of s.variantes) {
      const b = el('button', { type: 'button', class: 'atelier-play', 'data-variante': v.id, 'aria-label': t('dev.sonsmenu.ecouter.aria', { variante: v.id, son: nom, nom: v.nom }), text: t('dev.sonsmenu.ecouter', { variante: v.id }) });
      b.addEventListener('click', () => {
        version = (version % s.versions) + 1; // versions (graines) alternées à chaque écoute
        jouer(s.id, v.id, { version });
        mesures.textContent = texteMesures(v.id, rendu(s.id, v.id, version));
      });
      rangee.append(b);
    }
    const garder = el('fieldset', { class: 'slot-fav' }, [el('legend', { text: t('dev.sonsmenu.garder') })]);
    for (const v of s.variantes) {
      const input = el('input', { type: 'radio', name: `garder-${s.id}`, value: v.id, checked: choix[s.id] === v.id, id: `garder-${s.id}-${v.id}` });
      input.addEventListener('change', () => {
        choix[s.id] = v.id;
        majChoix();
      });
      garder.append(el('label', { for: input.id }, [input, t('dev.sonsmenu.garder.option', { variante: v.id, nom: v.nom })]));
    }
    carte.append(rangee, garder, mesures);
    liste.append(carte);
  }
}

// ---------- démonstration : ouverture ×1 par rareté ----------
const raretes = (Array.isArray(raretesBrut?.raretes) ? raretesBrut.raretes : []).filter((r) => typeof r?.id === 'string');
const { reglages } = lireOuvertures(ouverturesBrut, raretes.map((r) => r.id));
let demo = null;
for (const r of reglages ? raretes : []) {
  const b = el('button', { type: 'button', class: 'atelier-play', 'data-rarete': r.id, text: t('dev.sonsmenu.demo.bouton', { rarete: r.nom ?? r.id }) });
  b.addEventListener('click', () => {
    if (!debloquer()) return;
    for (const s of [...actives]) {
      try {
        s.stop();
      } catch { /* déjà arrêtée */ }
    }
    const chrono = chronologie(reglages, [r.id], { graine: 7 });
    const liste = sonsOuverture(chrono, reglages);
    const t0 = ctx.currentTime + 0.15;
    for (const e of liste) jouer(e.son, choix[e.son], { quand: t0 + e.t, gain: e.gain, version: (e.zombie ?? 0) + 1, fin: e.fin === null ? null : t0 + e.fin, origine: 'demo' });
    demo = { rarete: r.id, sons: liste.map((e) => ({ t: e.t, son: e.son })), duree: chrono.fin };
    $('demo-status').textContent = t('dev.sonsmenu.demo.etat', { rarete: r.nom ?? r.id, n: liste.length, duree: nombre(chrono.fin) });
  });
  $('demo-list').append(b);
}
$('demo-status').textContent = t('dev.sonsmenu.demo.aucune');

// ---------- musique ----------
const variantesMusique = catalogue.musique.variantes;
const coupees = new Set();
function arreterMusique() {
  if (!musique) return;
  const m = musique;
  musique = null;
  m.arreter(0.3);
  setTimeout(() => m.liberer(), 500);
  $('music-status').textContent = t('dev.sonsmenu.musique.etat.arret');
}
function lireLaMusique() {
  if (!debloquer()) return;
  arreterMusique();
  const v = lireMusique(variantesMusique.find((x) => x.id === choix.musique));
  if (!v) return;
  musique = creerMusique({ ctx, sortie: general, variante: v, reglages: catalogue.musique });
  for (const c of coupees) musique.couche(c, false);
  musique.demarrer(1, 1);
  $('music-status').textContent = t('dev.sonsmenu.musique.etat.joue', { variante: v.id });
}
const vm = $('music-variants');
vm.append(el('legend', { text: t('dev.sonsmenu.musique.variante') }));
for (const v of variantesMusique) {
  const input = el('input', { type: 'radio', name: 'garder-musique', value: v.id, checked: choix.musique === v.id, id: `garder-musique-${v.id}` });
  input.addEventListener('change', () => {
    choix.musique = v.id;
    majChoix();
    if (musique) lireLaMusique();
  });
  vm.append(el('label', { for: input.id }, [input, t('dev.sonsmenu.garder.option', { variante: v.id, nom: v.nom })]));
}
const couches = $('music-layers');
couches.append(el('legend', { text: t('dev.sonsmenu.musique.couches') }));
for (const c of ['bourdon', ...COUCHES_MUSIQUE]) {
  const input = el('input', { type: 'checkbox', checked: true, id: `couche-${c}`, value: c });
  input.addEventListener('change', () => {
    if (input.checked) coupees.delete(c);
    else coupees.add(c);
    musique?.couche(c, input.checked);
  });
  couches.append(el('label', { for: input.id }, [input, t(`dev.sonsmenu.couche.${c}`)]));
}
$('music').hidden = !tout; // musique déjà choisie : montrée seulement avec tous les sons
$('music-play').addEventListener('click', lireLaMusique);
$('music-stop').addEventListener('click', arreterMusique);
$('music-status').textContent = t('dev.sonsmenu.musique.etat.arret');

// ---------- commandes générales, choix ----------
const sortieVolume = $('volume-value');
const majVolume = () => {
  volume = Number($('volume').value);
  sortieVolume.textContent = t('dev.sonsmenu.volume.valeur', { n: volume });
  if (general) general.gain.value = volume / 100;
};
$('volume').addEventListener('input', majVolume);
majVolume();
$('btn-unlock').addEventListener('click', debloquer);
$('btn-stop').addEventListener('click', toutArreter);
$('btn-copy').addEventListener('click', async () => {
  const zone = $('choices-text');
  try {
    await navigator.clipboard.writeText(zone.value);
    $('copy-status').textContent = t('dev.sonsmenu.copie');
  } catch {
    zone.focus();
    zone.select();
    $('copy-status').textContent = t('dev.sonsmenu.copie.echec');
  }
});
if (lu.ecarts.length && choixBrut && Object.keys(fichier).length) {
  $('choices-gaps').textContent = t('dev.sonsmenu.ecarts', { liste: lu.ecarts.join(' ; ') });
  $('choices-gaps').hidden = false;
}
const lienVue = $('lien-vue');
lienVue.textContent = t(tout ? 'dev.sonsmenu.lien.achoisir' : 'dev.sonsmenu.lien.tout');
lienVue.href = `atelier-sons-menu.html${tout ? '' : '?tout=1'}`;
lienVue.hidden = restants.length === 0;
$('vue-note').textContent = t(tout ? 'dev.sonsmenu.vue.tout' : 'dev.sonsmenu.vue.achoisir', { n: restants.length });
majChoix();
statut.textContent = t(Contexte ? 'dev.sonsmenu.status.verrou' : 'dev.sonsmenu.status.absent');
document.addEventListener('visibilitychange', () => {
  if (document.hidden) toutArreter();
});
$('app').hidden = false;

if (test) {
  window.__zsSonsMenu = {
    etat: () => ({ vue: tout ? 'tout' : 'a-choisir', montres: montres.map((s) => s.id), debloque: ctx !== null, contexte: ctx?.state ?? 'aucun', volume, actives: actives.size, tampons: tampons.size, choix: { ...choix }, texte: $('choices-text').value, demo, musique: musique?.etat() ?? null, ecarts: [...lu.ecarts] }),
    journal: () => journal.map((e) => ({ ...e })),
    mesures: (id, variante, version = 1) => ({ ...rendu(id, variante, version).mesures }),
  };
}
