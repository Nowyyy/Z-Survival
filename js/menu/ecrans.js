// Lot 8a : écrans du menu principal chargés à la demande (Docs/ref/menu-principal.md) : Information (E8-7, nouveautés de data/menu/infos.json),
// Connexion provisoire (« Connexion : bientôt », lot 8g), onglets « Bientôt » (Boutique, Personnage, Infini : écrans aux lots 8b à 8e).
// Pour ajouter l'écran d'un onglet : une fonction qui rend une <section class="e8-ecran"> avec bandeau(), appelée par changerOnglet() de menu.js.
import { bandeau, el } from './menu.js';

// Écran superposé (dialogue modal) : voile, panneau, bandeau de titre, croix de fermeture (44 × 44) ; focus piégé ; Échap géré par menu.js.
function dialogue({ id, bloc, libelle, titre, corps, onClose, root, fermer }) {
  const voile = el('div', ['e8-voile'], { id, 'data-block': bloc });
  const panneau = el('div', ['e8-panneau'], { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-titre` });
  const tete = el('div', ['e8-panneau-tete']);
  const croix = el('button', ['e8-croix'], { type: 'button', id: `${id}-fermer`, 'aria-label': fermer });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M3.5 3.5l9 9M12.5 3.5l-9 9');
  svg.append(p);
  croix.append(svg);
  croix.addEventListener('click', () => onClose());
  tete.append(bandeau(libelle, titre, `${id}-titre`), croix);
  const zone = el('div', ['e8-panneau-corps'], { tabindex: '0', role: 'region', 'aria-labelledby': `${id}-titre` });
  zone.append(...corps);
  panneau.append(tete, zone);
  voile.append(panneau);
  voile.addEventListener('pointerdown', (e) => {
    if (e.target === voile) onClose();
  });
  // Focus piégé dans le panneau (Tab et Maj+Tab bouclent).
  panneau.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') return;
    const list = [croix, zone];
    const i = list.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      list[list.length - 1].focus();
    } else if (!e.shiftKey && i === list.length - 1) {
      e.preventDefault();
      list[0].focus();
    }
  });
  root.append(voile);
  croix.focus();
  return { element: voile, close: onClose };
}

export function ecranInformation({ dict, infos = [], onClose, root }) {
  const t = (k) => dict[k] ?? '';
  const liste = el('ul', ['e8-infos'], { id: 'menu-infos' });
  for (const i of infos) {
    const item = el('li', ['e8-info']);
    const titre = el('h3', ['e8-info-titre']);
    titre.textContent = typeof i?.titre === 'string' ? i.titre : '';
    const date = el('p', ['e8-info-date']);
    date.textContent = typeof i?.date === 'string' ? i.date : '';
    const texte = el('p', ['e8-info-texte']);
    texte.textContent = typeof i?.texte === 'string' ? i.texte : '';
    item.append(titre, date, texte);
    liste.append(item);
  }
  return dialogue({ id: 'menu-ecran-information', bloc: 'E8-7', libelle: t('game.menu.information.libelle'), titre: t('game.menu.information.titre'), corps: [liste], onClose, root, fermer: t('game.menu.fermer') });
}

export function ecranConnexion({ dict, onClose, root }) {
  const t = (k) => dict[k] ?? '';
  const texte = el('p', ['e8-texte']);
  texte.textContent = t('game.menu.connexion.texte');
  return dialogue({ id: 'menu-ecran-connexion', bloc: 'E8-8', libelle: t('game.menu.connexion.libelle'), titre: t('game.menu.connexion.titre'), corps: [texte], onClose, root, fermer: t('game.menu.fermer') });
}

// Onglet sans écran pour l'instant : bandeau (libellé « Bientôt », titre = nom de l'onglet) et une phrase.
export function ecranBientot({ dict, id, titre }) {
  const section = el('section', ['e8-ecran', 'e8-bientot'], { id: `menu-ecran-${id}`, 'aria-labelledby': `menu-titre-${id}` });
  const texte = el('p', ['e8-texte', 'e8-bientot-texte']);
  texte.textContent = dict['game.menu.bientot.texte'] ?? '';
  section.append(bandeau(dict['game.menu.bientot.libelle'] ?? '', titre, `menu-titre-${id}`), texte);
  return section;
}
