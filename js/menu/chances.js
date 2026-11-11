// Lot 8e : panneau des chances d'une caisse (E3-6, Docs/ref/menu-principal.md), chargé à la demande à « Voir les chances ». Dialogue modal (voile et
// panneau du menu : .e8-voile, .e8-panneau), bandeau (nom de la caisse / « Chances »), croix de 44 × 44 ; chaque rareté (ou personnage, pour une
// caisse de personnages) : nom écrit, barre (largeur = pour cent) et pour cent en texte ; puis les éléments possibles par rareté ; règle du tirage. Focus piégé (Tab, Maj+Tab), Échap
// (géré par menu.js → boutique.echap()) et appui sur le voile ferment ; le focus revient à « Voir les chances ». Valeurs : js/core/caisses.js.
import { chances } from '../core/caisses.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { poserJeton } from './boutique.js';

export const pourcentTexte = (n) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '');

export function ouvrirChances({ t, bandeau, cat, caisse, root, fermer }) {
  const id = 'menu-ecran-chances';
  const liste = chances(caisse, cat);
  const voile = el('div', ['e8-voile', 'e3-voile'], { id, 'data-block': 'E3-6' });
  const panneau = el('div', ['e8-panneau', 'e3-chances'], { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-caisse ${id}-titre`, 'aria-describedby': `${id}-regle`, 'data-caisse': caisse.id });
  poserJeton(panneau, '--e3-teinte', caisse.teinte);
  const tete = el('div', ['e8-panneau-tete']);
  const croix = el('button', ['e8-croix'], { type: 'button', id: `${id}-fermer`, 'aria-label': t('game.menu.fermer') });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M3.5 3.5l9 9M12.5 3.5l-9 9');
  svg.append(p);
  croix.append(svg);
  croix.addEventListener('click', () => fermer());
  const titre = bandeau(caisse.nom, t('game.menu.chances.titre'), `${id}-titre`);
  titre.querySelector('.menu-bandeau-libelle')?.setAttribute('id', `${id}-caisse`); // nom du dialogue : « <caisse> Chances »
  tete.append(titre, croix);

  const corps = el('div', ['e8-panneau-corps', 'e3-chances-corps'], { tabindex: '0', role: 'region', 'aria-labelledby': `${id}-titre` });
  // Chances : une ligne par rareté (nom, barre, pour cent) ; la barre est décorative, le pour cent est écrit.
  const lignes = el('ul', ['e3-chances-liste'], { id: `${id}-liste`, 'aria-label': t('game.menu.chances.liste') });
  const parPersonnage = caisse.type === 'personnage';
  for (const x of liste) {
    const r = cat.raretes.find((y) => y.id === x.rarete);
    const li = el('li', ['e3-chance'], { 'data-cle': x.rarete ?? x.personnage });
    poserJeton(li, '--e3-rarete', parPersonnage ? caisse.teinte : r?.jeton);
    const nom = el('span', ['e3-chance-nom']);
    nom.textContent = x.nom;
    const barre = el('span', ['e3-chance-barre'], { 'aria-hidden': 'true' });
    const plein = el('span', ['e3-chance-plein']);
    plein.style.width = `${Math.max(0, Math.min(100, x.pourcent))}%`;
    barre.append(plein);
    const pc = el('span', ['e3-chance-pc']);
    pc.textContent = fmt(t('game.menu.chances.pourcent'), { n: pourcentTexte(x.pourcent) });
    li.append(nom, barre, pc);
    lignes.append(li);
  }
  // Objets possibles, par rareté.
  const titreObjets = el('h3', ['e3-chances-sous-titre'], { id: `${id}-objets-titre` });
  titreObjets.textContent = t('game.menu.chances.objets');
  const objets = el('ul', ['e3-chances-objets'], { id: `${id}-objets`, 'aria-labelledby': `${id}-objets-titre` });
  for (const x of parPersonnage ? [] : liste) {
    const li = el('li', ['e3-chances-groupe'], { 'data-rarete': x.rarete });
    const r = cat.raretes.find((y) => y.id === x.rarete);
    poserJeton(li, '--e3-rarete', r?.jeton);
    const nom = el('span', ['e3-chances-groupe-nom']);
    nom.textContent = fmt(t('game.menu.chances.groupe'), { rarete: x.nom });
    const noms = el('span', ['e3-chances-groupe-objets']);
    noms.textContent = x.objets.map((o) => o.nom).join(', ');
    li.append(nom, noms);
    objets.append(li);
  }
  const regle = el('p', ['e3-chances-regle'], { id: `${id}-regle` });
  regle.textContent = t(parPersonnage ? 'game.menu.chances.regle.personnage' : caisse.type === 'cosmetique' ? 'game.menu.chances.regle.tenue' : 'game.menu.chances.regle');
  corps.append(lignes, ...(parPersonnage ? [] : [titreObjets, objets]), regle);
  panneau.append(tete, corps);
  voile.append(panneau);
  voile.addEventListener('pointerdown', (e) => {
    if (e.target !== voile) return;
    e.preventDefault(); // le focus rendu à « Voir les chances » n'est pas repris par l'appui
    fermer();
  });
  // Focus piégé dans le panneau (Tab et Maj+Tab bouclent entre la croix et la zone qui défile).
  panneau.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') return;
    const ordre = [croix, corps];
    const i = ordre.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      ordre[ordre.length - 1].focus();
    } else if (!e.shiftKey && i === ordre.length - 1) {
      e.preventDefault();
      ordre[0].focus();
    }
  });
  root.append(voile);
  croix.focus();
  return { element: voile, fermer, caisse: caisse.id, chances: liste.map((x) => ({ cle: x.rarete ?? x.personnage, pourcent: x.pourcent, objets: x.objets.map((o) => o.id) })) };
}
