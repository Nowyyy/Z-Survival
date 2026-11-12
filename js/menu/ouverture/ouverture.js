// Lot 8f : ouverture animée en 3D d'une ou de dix caisses (E3-2, E3-3 ; Docs/ref/menu-principal.md ; maquettes Docs/maquettes-v0.8/Ouverture.html,
// Ouverture10.html). Appelée par js/menu/boutique.js (afficherOuverture) après le tirage : elle montre un résultat déjà tiré, dans l'ordre du tirage,
// avec les textes de l'écran de résultat du lot 8e (cartes lues dans resultat.js). Écran plein au-dessus du menu : canevas (décoratif, aria-hidden),
// « Passer » (et Échap : boutique.js) qui mène au résultat à tout moment, rangée de dix cases (×10), « Continuer » et « Rouvrir » à la fin (×1).
// Three.js, la scène, les données et css/ouvertures.css ne se chargent qu'ici (premier achat d'une caisse ; préchargés au toucher de « Ouvrir »).
// Fin (résultat, « Passer », Échap, « Continuer », « Rouvrir ») : tout est libéré (scene.liberer : géométries, matériaux, textures, rendu, contexte
// perdu de force) et la section retirée ; un seul rendu WebGL à la fois. WebGL indisponible ou chargement en échec : null (résultat direct).
// Tests (?test=1 pris en compte, acces()) : ?ouverture=0 (aucune ouverture), rapide (temps ×6), pas (le temps n'avance que par
// window.__zsOuverture.avancer(s)) ; window.__zsOuverture.etat() : chronologie, cartes, cases, budget mesuré (renderer.info), libération.
import { chronologieAchat, lireOuvertures, prochainSaut } from '../../core/ouverture.js';
import { acces } from '../../core/graphics.js';
import { parseColor, toHex } from '../../core/color.js';
import { formatMoney } from '../../core/economy.js';
import { prixAchat } from '../../core/caisses.js';
import { fmt } from '../../game/texts.js';
import { pageCanal, pageSearch } from '../../game/graphics-boot.js';
import { el } from '../menu.js';

const SVG = 'http://www.w3.org/2000/svg';
const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path))));
const VITESSES = { rapide: 6 };

// Paramètre de test ?ouverture= (seulement sous ?test=1 pris en compte) : '0', 'rapide', 'pas' ou null.
export function paramOuverture() {
  const q = new URLSearchParams(pageSearch());
  if (!acces(pageCanal(), q).test) return null;
  const v = q.get('ouverture');
  return ['0', 'rapide', 'pas'].includes(v) ? v : null;
}
const reduit = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
// Ouverture animée voulue : pas sous mouvement réduit (résultat direct, choix du lot 8f), pas avec ?ouverture=0 en test.
export const ouvertureVoulue = () => !reduit() && paramOuverture() !== '0' && typeof globalThis.WebGL2RenderingContext !== 'undefined';

function feuille() {
  return new Promise((resolve) => {
    if (document.querySelector('link[data-ouvertures]')) {
      resolve();
      return;
    }
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/ouvertures.css';
    l.dataset.ouvertures = '';
    l.addEventListener('load', () => resolve(), { once: true });
    l.addEventListener('error', () => resolve(), { once: true });
    document.head.append(l);
  });
}

// Préchargement (toucher de « Ouvrir ») : feuille, données, Three.js et la scène, données des zombies. Une seule promesse.
let charge = null;
export function precharger() {
  charge ??= Promise.all([
    feuille(),
    json('data/menu/ouvertures.json'),
    import('./scene.js'),
    import('./zombies.js').then((m) => m.prechargerZombies()),
  ]).catch((e) => {
    charge = null;
    throw e;
  });
  return charge;
}

// Dernier état (tests) : survit à la libération.
let dernierEtat = null;
let enCours = null;
if (acces(pageCanal(), new URLSearchParams(pageSearch())).test) {
  globalThis.__zsOuverture = {
    etat: () => enCours?.etat() ?? dernierEtat,
    avancer: (s) => enCours?.avancer(s) ?? null,
  };
}

// r : résultat d'achat du lot 8e ; cat : catalogue (raretés) ; cartes : [{ objet, nom, ligne2, ligne3, jeton, halo }] (écran de résultat) ;
// annonce : texte annoncé à la fin (×1) ; parent : élément du menu (#e8) ; rappels : { fin() (résultat), continuer(), rouvrir() }.
export async function lancerOuverture({ r, cat, cartes, annonce, t, parent, rappels }) {
  if (enCours || !ouvertureVoulue() || !r?.caisse || !Array.isArray(cartes) || cartes.length !== r.objets.length) return null;
  let donnees;
  let sceneMod;
  try {
    [, donnees, sceneMod] = await precharger();
  } catch {
    return null;
  }
  const { reglages } = lireOuvertures(donnees, cat.raretes.map((x) => x.id));
  const chrono = reglages ? chronologieAchat(reglages, r, cat.raretes) : null;
  if (!chrono) return null;
  const dix = chrono.quantite === 10;
  const mode = paramOuverture();

  // --- Section plein écran --------------------------------------------------------------------------------------------------------------------
  const section = el('section', ['e3-ouverture'], { id: 'menu-ecran-ouverture', 'aria-labelledby': 'menu-ouverture-titre', 'data-block': dix ? 'E3-3' : 'E3-2', 'data-quantite': String(chrono.quantite) });
  const titre = el('h2', ['sr-only'], { id: 'menu-ouverture-titre' });
  titre.textContent = fmt(t(dix ? 'game.menu.ouverture.titre10' : 'game.menu.ouverture.titre'), { caisse: r.caisse.nom });
  const canvas = el('canvas', ['e3-ouv-canevas'], { 'aria-hidden': 'true' });
  const eclair = el('div', ['e3-ouv-eclair'], { 'aria-hidden': 'true' });
  const fondu = el('div', ['e3-ouv-fondu'], { 'aria-hidden': 'true' });
  const temoin = el('span', ['e3-ouv-temoin'], { 'aria-hidden': 'true' });
  const passer = el('button', ['e3-ouv-passer'], { type: 'button', id: 'menu-ouverture-passer', 'aria-label': t('game.menu.ouverture.passer.aria') });
  const passerTexte = el('span');
  passerTexte.textContent = t('game.menu.ouverture.passer');
  const fleche = document.createElementNS(SVG, 'svg');
  fleche.setAttribute('viewBox', '0 0 24 24');
  fleche.setAttribute('aria-hidden', 'true');
  fleche.setAttribute('focusable', 'false');
  const fp = document.createElementNS(SVG, 'path');
  fp.setAttribute('d', 'M6 6l6 6-6 6M13 6l6 6-6 6');
  fleche.append(fp);
  passer.append(passerTexte, fleche);
  const cases = el('ol', ['e3-ouv-cases'], { id: 'menu-ouverture-cases', 'aria-hidden': 'true' });
  cases.hidden = !dix;
  const lis = dix ? cartes.map((c, i) => {
    const li = el('li', ['e3-ouv-case'], { 'data-rang': String(i), 'data-rempli': 'false' });
    cases.append(li);
    return li;
  }) : [];
  const actions = el('div', ['e3-ouv-actions'], { id: 'menu-ouverture-actions' });
  actions.hidden = true;
  const btContinuer = el('button', ['e3-action', 'e3-planche'], { type: 'button', id: 'menu-ouverture-continuer' });
  btContinuer.textContent = t('game.menu.resultat.continuer');
  const btRouvrir = el('button', ['e3-action', 'e3-rouge'], { type: 'button', id: 'menu-ouverture-rouvrir' });
  btRouvrir.textContent = fmt(t('game.menu.resultat.rouvrir'), { prix: formatMoney(prixAchat(r.caisse, 1)) });
  btRouvrir.setAttribute('aria-label', fmt(t('game.menu.resultat.rouvrir.aria'), { action: btRouvrir.textContent, caisse: r.caisse.nom }));
  actions.append(btContinuer, btRouvrir);
  const live = el('p', ['sr-only'], { id: 'menu-ouverture-annonce', 'aria-live': 'polite' });
  section.append(titre, canvas, eclair, fondu, cases, actions, passer, live, temoin);
  parent.append(section);

  // Jetons --ouv-* et --rarete-* lus par un témoin (couleur calculée), mis en cache.
  const cache = new Map();
  const couleur = (jeton) => {
    if (!cache.has(jeton)) {
      temoin.style.color = `var(${jeton})`;
      const c = parseColor(getComputedStyle(temoin).color);
      cache.set(jeton, c ? toHex(c) : toHex([255, 255, 255]));
    }
    return cache.get(jeton);
  };
  const jetonDe = (c) => (/^--(rarete|menu)-[a-z0-9-]+$/.test(c.jeton ?? '') ? c.jeton : '--rarete-commun');
  const cartesScene = cartes.map((c) => ({ ...c, jeton: jetonDe(c) }));
  // Cible d'une case (repère normalisé de l'écran : x, y dans [−1, 1], l = fraction de la largeur).
  const caseCible = (i) => {
    const li = lis[i];
    const b = li?.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    if (!b || !s.width) return { x: 0, y: 0.9, l: 0.04 };
    return { x: ((b.left + b.width / 2 - s.left) / s.width) * 2 - 1, y: 1 - ((b.top + b.height / 2 - s.top) / s.height) * 2, l: b.width / s.width };
  };

  // « Passer » touché pendant la création de la scène (écran noir) : l'ouverture s'arrête aussitôt prête, le résultat s'affiche.
  let annulee = false;
  const annulerTot = () => {
    annulee = true;
  };
  passer.addEventListener('click', annulerTot);
  let scene;
  try {
    const police = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
    await Promise.race([document.fonts?.load?.(`48px ${police}`), new Promise((res) => setTimeout(res, 800))]).catch(() => {});
    scene = await sceneMod.creerScene({ canvas, couleur, chrono, reglages, cartes: cartesScene, modele: r.caisse.modele, teinte: r.caisse.teinte, police, caseCible });
  } catch {
    // WebGL indisponible (ou création impossible) : rien de plus n'est montré, le résultat s'affiche directement.
    section.remove();
    return null;
  }
  passer.removeEventListener('click', annulerTot);
  if (annulee) {
    scene.liberer();
    section.remove();
    return null;
  }

  // --- Boucle d'images ------------------------------------------------------------------------------------------------------------------------
  let temps = 0;
  let precedent = null;
  let raf = 0;
  let fini = false;
  let libere = false;
  let annonceFaite = false;
  let focusFait = false;
  let derniersRemplis = 0;
  let sauts = 0;
  let etatScene = null;
  const vitesse = VITESSES[mode] ?? 1;
  // Retour du propriétaire (fluidité) : résolution adaptative. Durée réelle des images lissée ; au-dessus de 21 ms (moins de 48 images par
  // seconde), le rapport de pixels baisse d'un cran (0,25, jusqu'à 0,75) ; sous 14 ms pendant 3 s, il remonte (jusqu'au plafond). Jamais en test
  // pas à pas (ni accéléré) : les mesures y restent comparables.
  const adaptative = mode === null;
  let lisse = 16;
  let bonnes = 0;
  let ratio = scene.plafond;
  let attente = 0.5;
  function adapter(ms) {
    lisse += (ms - lisse) * 0.1;
    attente -= ms / 1000;
    if (attente > 0) return;
    if (lisse > 21 && ratio > 0.75) {
      ratio = scene.pixels(ratio - 0.25);
      attente = 0.6;
      bonnes = 0;
    } else if (lisse < 14) {
      bonnes += ms / 1000;
      if (bonnes > 3 && ratio < scene.plafond) {
        ratio = scene.pixels(ratio + 0.25);
        attente = 1;
        bonnes = 0;
      }
    } else bonnes = 0;
  }
  function image(maintenant) {
    raf = 0;
    if (libere) return;
    if (mode !== 'pas') {
      const brut = precedent === null ? 0 : maintenant - precedent;
      const dt = Math.min(0.1, brut / 1000);
      temps += dt * vitesse;
      if (adaptative && brut > 0 && brut < 250) adapter(brut);
    }
    precedent = maintenant;
    dessiner();
    if (!libere && mode !== 'pas') raf = requestAnimationFrame(image);
  }
  function dessiner() {
    const s = scene.rendre(temps);
    etatScene = s;
    fondu.style.opacity = String(s.fondu);
    eclair.style.opacity = String(s.eclair.force);
    if (s.eclair.rarete) eclair.style.setProperty('--e3-rarete', `var(--rarete-${s.eclair.rarete})`);
    if (dix && s.cases !== derniersRemplis) {
      lis.forEach((li, i) => {
        const plein = i < s.cases;
        li.dataset.rempli = String(plein);
        if (plein) li.style.setProperty('--e3-rarete', `var(${cartesScene[i].jeton})`);
      });
      derniersRemplis = s.cases;
    }
    if (!dix) {
      actions.hidden = s.boutons <= 0;
      actions.style.opacity = String(s.boutons);
      const kc = s.caisses[0];
      if (kc?.objet && kc.objet.sortie >= 1 && !annonceFaite) {
        annonceFaite = true;
        live.textContent = annonce ?? '';
      }
      if (s.boutons >= 1 && !focusFait) {
        focusFait = true;
        if (section.contains(document.activeElement) || document.activeElement === document.body) btContinuer.focus();
      }
    }
    if (s.fini && !fini) {
      fini = true;
      // ×10 : la dernière case remplie, place au résultat ×10 ; ×1 : la scène reste (« Continuer », « Rouvrir »).
      if (dix) queueMicrotask(() => rappels.fin());
    }
  }
  function redimensionner() {
    scene.redimensionner(section.clientWidth, section.clientHeight);
    if (mode === 'pas' || !raf) dessiner();
  }
  const observateur = typeof ResizeObserver === 'function' ? new ResizeObserver(() => redimensionner()) : null;
  observateur?.observe(section);
  window.addEventListener('resize', redimensionner);
  passer.addEventListener('click', () => rappels.fin());
  // Retour du propriétaire : toucher l'écran (doigt ou souris, hors boutons) passe la caisse en cours (prochainSaut : arrivée → première caisse ;
  // ×10 : caisse suivante, la dernière mène au résultat ; ×1 : carte et boutons). « Passer » mène toujours au résultat.
  canvas.addEventListener('click', () => {
    if (libere) return;
    const cible = prochainSaut(chrono, temps);
    if (cible === null) return;
    temps = cible;
    sauts += 1;
    if (mode === 'pas' || !raf) dessiner();
  });
  btContinuer.addEventListener('click', () => rappels.continuer());
  btRouvrir.addEventListener('click', () => rappels.rouvrir());

  const etat = () => ({
    actif: !libere,
    quantite: chrono.quantite,
    mode: mode ?? 'normal',
    temps,
    fin: chrono.fin,
    raretes: chrono.caisses.map((c) => c.rarete),
    cartes: cartesScene.map((c) => ({ objet: c.objet, nom: c.nom, ligne2: c.ligne2, jeton: c.jeton })),
    cases: lis.filter((li) => li.dataset.rempli === 'true').map((li) => Number(li.dataset.rang)),
    chronologie: chrono.caisses.map((c) => ({ rarete: c.rarete, debut: c.debut, tir: c.tir, couvercle: c.couvercle, objet: c.objet, case: c.case, fin: c.fin, projection: c.projection })),
    instant: etatScene ? { active: etatScene.active, cases: etatScene.cases, boutons: etatScene.boutons, fini: etatScene.fini, eclair: etatScene.eclair.force, sombre: etatScene.sombre } : null,
    rendu: libere ? dernierEtat?.rendu ?? null : scene.info(),
    sauts,
    liberation: null,
  });

  const ctrl = {
    section,
    etat,
    avancer(s) {
      if (libere) return null;
      temps = Math.max(0, temps + (Number(s) || 0));
      dessiner();
      return etat();
    },
    focus: () => passer.focus(),
    // Libère tout (géométries, matériaux, textures, rendu, contexte) et retire la section ; renvoie la mémoire Three.js avant la perte du contexte.
    liberer() {
      if (libere) return dernierEtat?.liberation ?? null;
      const avant = etat();
      libere = true;
      if (raf) cancelAnimationFrame(raf);
      observateur?.disconnect();
      window.removeEventListener('resize', redimensionner);
      const gl = scene.contexte();
      const memoire = scene.liberer();
      section.remove();
      dernierEtat = { ...avant, actif: false, liberation: { ...memoire, contextePerdu: Boolean(gl?.isContextLost?.()) } };
      enCours = null;
      return dernierEtat.liberation;
    },
  };
  enCours = ctrl;
  redimensionner();
  if (mode !== 'pas') raf = requestAnimationFrame(image);
  return ctrl;
}
