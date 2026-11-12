// Lot 8g : écran Crédits E11 (Docs/ref/menu-principal.md, « Lot 8g »), ouvert par l'entrée « Crédits » du menu à trois barres, chargé à la demande
// (roue de chargement de menu.js). Écran du menu qui garde la barre d'onglets (comme les sous-menus du lot 8d) : bandeau « No Way Studio » /
// « Crédits », « ‹ Retour ». À gauche : logo du studio (animation rejouée à chaque ouverture ; copie fixe sous prefers-reduced-motion), « Un jeu de
// No Way Studio », sections de data/menu/credits.json ; à droite : « Outils et licences » (data/menu/licences.json, copié des fichiers du dépôt par
// scripts/studio/licences.mjs) : une zone dépliable par licence (aria-expanded), dont le texte défile. Les deux colonnes défilent et glissent à la
// souris (js/glisser.js, posé sur tout le menu). Textes des données en texte brut seulement.
import { bandeau, el } from './menu.js';
import { adresseStudio, LOGO_STUDIO_FIXE } from './chargement.js';
import { licencesManquantes, lireCredits, lireLicences } from './credits-donnees.js';

export const LOGO_STUDIO_ANIME = 'assets/studio/no-way-studio-logo-anime.svg';
const SVG = 'http://www.w3.org/2000/svg';
const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

let donnees = null;
// Données demandées une seule fois (aussi au toucher de l'entrée, avant le clic : menu.js).
export const precharger = () => {
  donnees ??= Promise.all([json('data/menu/credits.json'), json('data/menu/licences.json')]);
  return donnees;
};

function chevron(classe, d = 'M15 6l-6 6 6 6') {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', class: classe, 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

// t : textes ; onClose : « ‹ Retour » (menu.js referme l'écran et rend le focus).
export async function ecranCredits({ t, onClose = () => {} }) {
  const [brutCredits, brutLicences] = await precharger();
  const sections = lireCredits(brutCredits);
  const licences = lireLicences(brutLicences);
  const reduit = matchMedia('(prefers-reduced-motion: reduce)');

  const section = el('section', ['e8-ecran', 'e11'], { id: 'menu-ecran-credits', 'aria-labelledby': 'menu-titre-credits', 'data-block': 'E11' });
  section.hidden = true;
  const tete = el('div', ['e5-tete', 'e11-tete']);
  const retour = el('button', ['menu-planche', 'e5-retour'], { type: 'button', id: 'menu-credits-retour', 'aria-label': t('game.menu.credits.retour.aria') });
  retour.append(chevron('e5-chevron'), Object.assign(el('span'), { textContent: t('game.menu.credits.retour') }));
  retour.addEventListener('click', () => onClose());
  tete.append(bandeau(t('game.menu.credits.libelle'), t('game.menu.credits.titre'), 'menu-titre-credits'), retour);

  const grille = el('div', ['e11-grille']);
  // Colonne de gauche : studio et équipe.
  const gauche = el('div', ['e11-colonne', 'e11-gauche'], { id: 'menu-credits-equipe', role: 'region', tabindex: '0', 'aria-label': t('game.menu.credits.equipe') });
  const logo = el('img', ['e11-logo'], { id: 'menu-credits-logo', alt: t('game.menu.studio.nom'), width: '792', height: '556', decoding: 'async' });
  const signature = el('p', ['e11-signature'], { id: 'menu-credits-signature' });
  signature.textContent = t('game.menu.credits.signature');
  gauche.append(logo, signature);
  sections.forEach((s, i) => {
    const bloc = el('div', ['e11-section'], { 'data-section': String(i) });
    const h = el('h3', ['e11-section-titre'], { id: `menu-credits-section-${i}` });
    h.textContent = s.titre;
    bloc.append(h);
    if (s.noms.length) {
      const ul = el('ul', ['e11-noms'], { 'aria-labelledby': `menu-credits-section-${i}` });
      for (const n of s.noms) ul.append(Object.assign(el('li', ['e11-nom']), { textContent: n }));
      bloc.append(ul);
    }
    if (s.provisoire) bloc.append(Object.assign(el('p', ['e11-provisoire']), { textContent: t('game.menu.credits.provisoire') }));
    gauche.append(bloc);
  });

  // Colonne de droite : outils et licences, une zone dépliable par licence.
  const droite = el('div', ['e11-colonne', 'e11-droite'], { id: 'menu-credits-licences', role: 'region', tabindex: '0', 'aria-labelledby': 'menu-credits-outils' });
  const outils = el('h3', ['e11-section-titre'], { id: 'menu-credits-outils' });
  outils.textContent = t('game.menu.credits.outils');
  droite.append(outils);
  const ouvertes = new Set();
  for (const l of licences) {
    const bloc = el('div', ['e11-licence'], { 'data-licence': l.id });
    const bouton = el('button', ['e11-deplier'], { type: 'button', id: `menu-licence-${l.id}`, 'aria-expanded': 'false', 'aria-controls': `menu-licence-${l.id}-texte` });
    const noms = el('span', ['e11-deplier-noms']);
    noms.append(Object.assign(el('span', ['e11-deplier-nom']), { textContent: l.nom }), Object.assign(el('span', ['e11-deplier-licence']), { textContent: l.role ? `${l.role} · ${l.licence}` : l.licence }));
    bouton.append(noms, chevron('e11-chevron', 'M6 9l6 6 6-6'));
    const zone = el('div', ['e11-licence-texte'], { id: `menu-licence-${l.id}-texte`, role: 'region', tabindex: '0', 'aria-labelledby': `menu-licence-${l.id}` });
    zone.hidden = true;
    const avis = el('p', ['e11-avis']);
    avis.textContent = l.avis;
    const texte = el('pre', ['e11-texte']);
    texte.textContent = l.texte;
    zone.append(avis, texte);
    bouton.addEventListener('click', () => {
      const ouvrir = bouton.getAttribute('aria-expanded') !== 'true';
      bouton.setAttribute('aria-expanded', String(ouvrir));
      zone.hidden = !ouvrir;
      if (ouvrir) ouvertes.add(l.id);
      else ouvertes.delete(l.id);
    });
    bloc.append(bouton, zone);
    droite.append(bloc);
  }
  grille.append(gauche, droite);
  section.append(tete, grille);

  // Logo : à chaque ouverture, une adresse neuve (l'animation repart de zéro) ; la précédente est libérée. Mouvement réduit : copie fixe.
  let fichier = null;
  let neuve = null;
  function poserLogo() {
    const fixe = reduit.matches;
    fichier = fixe ? LOGO_STUDIO_FIXE : LOGO_STUDIO_ANIME;
    adresseStudio(fichier, { neuve: !fixe }).then((a) => {
      if (neuve) URL.revokeObjectURL(neuve);
      neuve = fixe ? null : a;
      logo.src = a;
    }, () => {});
  }

  return {
    section,
    // Affichage (à chaque ouverture) : logo rejoué, zones remises en haut.
    afficher() {
      poserLogo();
      gauche.scrollTop = 0;
      droite.scrollTop = 0;
    },
    focus: () => retour.focus(),
    etat: () => ({ sections: sections.map((s) => s.titre), licences: licences.map((l) => l.id), manquantes: licencesManquantes(licences), ouvertes: [...ouvertes], logo: fichier }),
  };
}
