// Lot 8d : sous-menu Inventaire (E9-2, maquette Docs/maquettes-v0.8/Inventaire.html), écran plein chargé à sa première ouverture (js/menu/personnage.js).
// Filtres (Tout, Armes, Tenues, Accessoires, et le type venu d'un emplacement), grille paginée de 12 objets (6 × 2 comme la maquette, triés par
// rareté décroissante), panneau de détail : Équiper ou Retirer, Améliorer (prix affiché, jamais prélevé avant le lot 8h ; désactivé au niveau
// maximum, raison lue), exemplaires identiques, « Fusionner cet objet » (ouvre Fusion avec l'objet placé). État en mémoire (equipement-etat.js).
import { formatMoney } from '../core/economy.js';
import { ameliorer, bonusObjet, emplacementDe, emplacementsDuType, equiper, fusionnable, identiques, indexRarete, infoAmelioration, objetDe, retirer } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { TYPE_TEXTES, annonce, estActif, icone24, nomObjet, nomRarete, poserActif, teteSous, texteEffet, typeObjet } from './personnage.js';

// Objets par page : 6 colonnes × autant de rangées que la hauteur libre en contient (2 au moins, comme la maquette ; retour du propriétaire : « tout
// pourrait être affiché en une page » sur PC) ; mesuré à l'affichage et à chaque changement de taille.
export const PAR_PAGE = 12;
const COLONNES = 6;
const FILTRES = { tout: 'game.menu.inventaire.filtre.tout', arme: 'game.menu.inventaire.filtre.arme', tenue: 'game.menu.inventaire.filtre.tenue', gants: 'game.menu.inventaire.filtre.gants', bottes: 'game.menu.inventaire.filtre.bottes', accessoire: 'game.menu.inventaire.filtre.accessoire' };
const FILTRES_BASE = ['tout', 'arme', 'tenue', 'accessoire'];

export function creer({ t, bandeau, eq, cat, retour, ouvrir }) {
  let filtre = 'tout';
  let extra = null; // filtre du type venu d'un emplacement (gants, bottes), ajouté aux filtres de base
  let page = 0;
  let choisi = null;
  let emplacementCible = null; // emplacement d'où l'on vient (accessoire1 ou accessoire2 : « Équiper » y place l'objet)
  let parPage = PAR_PAGE;

  const section = el('section', ['e8-ecran', 'e9', 'e9-sous', 'e9-inventaire'], { id: 'menu-ecran-inventaire', 'aria-labelledby': 'menu-inventaire-titre', 'data-block': 'E9-2' });
  const { tete, bouton: btRetour } = teteSous(t, bandeau, t('game.menu.inventaire.titre'), 'menu-inventaire', retour);
  const filtres = el('div', ['e9-filtres'], { role: 'group', 'aria-label': t('game.menu.inventaire.filtrer'), id: 'menu-inventaire-filtres' });
  const grille = el('ul', ['e9-grille', 'e9-grille-objets'], { id: 'menu-inventaire-grille', 'aria-label': t('game.menu.inventaire.objets') });
  const pied = el('div', ['e9-pagination']);
  const pageTexte = el('p', ['e9-page'], { id: 'menu-inventaire-page' });
  const btAvant = el('button', ['e5-bouton', 'e9-page-bouton'], { type: 'button', id: 'menu-inventaire-avant', 'aria-label': t('game.menu.inventaire.avant') });
  btAvant.append(icone24('chevron'));
  const btApres = el('button', ['e5-bouton', 'e9-page-bouton'], { type: 'button', id: 'menu-inventaire-apres', 'aria-label': t('game.menu.inventaire.apres') });
  btApres.append(icone24('suivant'));
  pied.append(pageTexte, btAvant, btApres);
  const gauche = el('div', ['e9-sous-gauche']);
  gauche.append(tete, filtres, grille, pied);

  // Panneau de détail.
  const panneau = el('section', ['e9-panneau', 'e9-detail'], { id: 'menu-inventaire-detail', 'aria-labelledby': 'menu-inventaire-nom' });
  const haut = el('div', ['e9-detail-haut']);
  const iconeBoite = el('span', ['e9-detail-icone']);
  const textes = el('div', ['e9-detail-textes']);
  const nom = el('h3', ['e9-detail-nom'], { id: 'menu-inventaire-nom' });
  const ligne = el('p', ['e9-detail-ligne'], { id: 'menu-inventaire-ligne' });
  const effet = el('p', ['e9-effet'], { id: 'menu-inventaire-effet' });
  textes.append(nom, ligne, effet);
  haut.append(iconeBoite, textes);
  const boutons = el('div', ['e9-detail-boutons']);
  const btEquiper = el('button', ['e9-bouton', 'e9-rouge', 'e9-sans-casse'], { type: 'button', id: 'menu-inventaire-equiper' });
  const btAmeliorer = el('button', ['e9-bouton', 'menu-planche', 'e9-sans-casse'], { type: 'button', id: 'menu-inventaire-ameliorer' });
  boutons.append(btEquiper, btAmeliorer);
  const raison = el('p', ['e9-raison'], { id: 'menu-inventaire-raison' });
  const exemplaires = el('p', ['e9-detail-info'], { id: 'menu-inventaire-exemplaires' });
  const btFusion = el('button', ['e9-bouton', 'menu-planche', 'e9-violet', 'e9-detail-fusion'], { type: 'button', id: 'menu-inventaire-fusionner' });
  btFusion.append(icone24('fusion'), Object.assign(el('span'), { textContent: t('game.menu.inventaire.fusionner') }));
  const vide = el('p', ['e9-detail-info'], { id: 'menu-inventaire-vide' });
  vide.textContent = t('game.menu.inventaire.vide');
  const { element: live, dire } = annonce('menu-inventaire-annonce');
  panneau.append(haut, boutons, raison, exemplaires, btFusion, vide);
  section.append(gauche, panneau, live);

  // Objets du filtre, triés par rareté décroissante (légendaire d'abord), puis dans l'ordre du catalogue, puis par niveau décroissant.
  const ordreCatalogue = [...cat.objets.keys()];
  function visibles() {
    const etat = eq.etat();
    return etat.objets
      .filter((o) => filtre === 'tout' || typeObjet(cat, o) === filtre)
      .sort((a, b) => indexRarete(cat, b.rarete) - indexRarete(cat, a.rarete) || ordreCatalogue.indexOf(a.id) - ordreCatalogue.indexOf(b.id) || b.niveau - a.niveau || a.uid.localeCompare(b.uid, 'fr', { numeric: true }));
  }

  function rendreFiltres() {
    const liste = [...FILTRES_BASE, ...(extra ? [extra] : [])];
    filtres.replaceChildren(...liste.map((f) => {
      const b = el('button', ['e5-bouton', 'e9-filtre'], { type: 'button', id: `menu-inventaire-filtre-${f}`, 'aria-pressed': String(f === filtre) });
      b.textContent = t(FILTRES[f]);
      b.addEventListener('click', () => {
        filtre = f;
        page = 0;
        const v = visibles();
        if (!v.some((o) => o.uid === choisi)) choisi = v[0]?.uid ?? null;
        rendre();
      });
      return b;
    }));
  }

  function rendreGrille() {
    const etat = eq.etat();
    const v = visibles();
    const pages = Math.max(1, Math.ceil(v.length / parPage));
    page = Math.min(page, pages - 1);
    grille.replaceChildren(...v.slice(page * parPage, (page + 1) * parPage).map((o) => {
      const li = el('li');
      const b = el('button', ['e9-case'], { type: 'button', id: `menu-objet-${o.uid}`, 'data-uid': o.uid, 'data-rarete': o.rarete, 'aria-pressed': String(o.uid === choisi) });
      const n = el('span', ['e9-case-nom']);
      n.textContent = nomObjet(cat, o);
      const r = el('span', ['e9-case-rarete']);
      r.textContent = nomRarete(cat, o.rarete);
      const niv = el('span', ['e9-case-niveau']);
      niv.textContent = fmt(t(emplacementDe(etat, o.uid) ? 'game.menu.inventaire.case.porte' : 'game.menu.perso.niv'), { n: o.niveau });
      b.append(n, r, niv);
      b.addEventListener('click', () => {
        choisi = o.uid;
        rendre();
      });
      li.append(b);
      return li;
    }));
    pageTexte.textContent = fmt(t('game.menu.inventaire.page'), { p: page + 1, n: pages });
    poserActif(btAvant, page > 0);
    poserActif(btApres, page < pages - 1);
  }

  function rendreDetail() {
    const etat = eq.etat();
    const o = objetDe(etat, choisi);
    for (const n of [haut, boutons, exemplaires, btFusion]) n.hidden = !o;
    vide.hidden = Boolean(o);
    raison.hidden = true;
    if (!o) return;
    const type = typeObjet(cat, o);
    iconeBoite.dataset.rarete = o.rarete;
    iconeBoite.replaceChildren(icone24(type, 'e9-icone e9-icone-grande'));
    nom.textContent = nomObjet(cat, o);
    const porte = emplacementDe(etat, o.uid);
    ligne.textContent = fmt(t(porte ? 'game.menu.inventaire.ligne.porte' : 'game.menu.inventaire.ligne'), { type: t(TYPE_TEXTES[type]), rarete: nomRarete(cat, o.rarete), n: o.niveau });
    effet.textContent = texteEffet(t, bonusObjet(cat, o));
    btEquiper.textContent = t(porte ? 'game.menu.inventaire.retirer' : 'game.menu.inventaire.equiper');
    const info = infoAmelioration(etat, cat, o.uid);
    btAmeliorer.textContent = info.possible ? fmt(t('game.menu.inventaire.ameliorer'), { prix: formatMoney(info.prix) }) : t('game.menu.inventaire.ameliorer.max');
    poserActif(btAmeliorer, info.possible, 'menu-inventaire-raison');
    if (!info.possible) {
      raison.hidden = false;
      raison.textContent = fmt(t('game.menu.inventaire.raison.max'), { n: info.niveauMax ?? o.niveau });
    }
    const n = identiques(etat, o.uid).length;
    const peut = fusionnable(cat, o);
    exemplaires.textContent = peut ? fmt(t(n >= 3 ? 'game.menu.inventaire.exemplaires.assez' : 'game.menu.inventaire.exemplaires'), { n }) : t('game.menu.inventaire.exemplaires.max');
    poserActif(btFusion, peut, 'menu-inventaire-exemplaires');
  }

  function rendre() {
    rendreFiltres();
    rendreGrille();
    rendreDetail();
  }

  btAvant.addEventListener('click', () => {
    if (!estActif(btAvant)) return;
    page -= 1;
    rendreGrille();
  });
  btApres.addEventListener('click', () => {
    if (!estActif(btApres)) return;
    page += 1;
    rendreGrille();
  });
  btEquiper.addEventListener('click', () => {
    const etat = eq.etat();
    const o = objetDe(etat, choisi);
    if (!o) return;
    const porte = emplacementDe(etat, o.uid);
    const cible = emplacementCible && emplacementsDuType(typeObjet(cat, o)).includes(emplacementCible) ? emplacementCible : null;
    const n = eq.poser(porte ? retirer(etat, o.uid) : equiper(etat, cat, o.uid, cible));
    if (n !== etat) dire(fmt(t(porte ? 'game.menu.inventaire.annonce.retire' : 'game.menu.inventaire.annonce.equipe'), { nom: nomObjet(cat, o) }));
  });
  btAmeliorer.addEventListener('click', () => {
    if (!estActif(btAmeliorer)) return;
    const etat = eq.etat();
    const n = eq.poser(ameliorer(etat, cat, choisi));
    if (n !== etat) {
      const o = objetDe(n, choisi);
      dire(fmt(t('game.menu.inventaire.annonce.ameliore'), { nom: nomObjet(cat, o), n: o.niveau }));
    }
  });
  btFusion.addEventListener('click', () => {
    if (!estActif(btFusion)) return;
    ouvrir('fusion', { place: choisi, depuis: btRetour });
  });

  // Rangées qui tiennent dans la hauteur de la grille (hauteur minimale d'une case + écart) ; la page en cours garde son premier objet visible.
  function mesurer() {
    const cellule = grille.querySelector('.e9-case');
    const h = grille.clientHeight;
    if (!cellule || !h) return;
    const ecart = parseFloat(getComputedStyle(grille).rowGap) || 0;
    const min = parseFloat(getComputedStyle(cellule).minHeight) || 0;
    if (!min) return;
    const n = COLONNES * Math.max(2, Math.floor((h + ecart) / (min + ecart)));
    if (n === parPage) return;
    const premier = page * parPage;
    parPage = n;
    page = Math.floor(premier / parPage);
    rendreGrille();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => mesurer()).observe(grille);

  eq.abonner(() => {
    if (!objetDe(eq.etat(), choisi)) choisi = visibles()[0]?.uid ?? null; // objet fusionné : le premier visible
    if (!section.hidden) rendre();
  });

  return {
    section,
    // opts : { filtre (type ou « tout »), emplacement (d'où l'on vient) }.
    ouvrir(opts = {}) {
      const f = Object.hasOwn(FILTRES, opts.filtre) ? opts.filtre : 'tout';
      extra = FILTRES_BASE.includes(f) ? null : f;
      filtre = f;
      page = 0;
      emplacementCible = opts.emplacement ?? null;
      const etat = eq.etat();
      const porte = emplacementCible ? etat.porte[emplacementCible] : null;
      const v = visibles();
      choisi = porte && v.some((o) => o.uid === porte) ? porte : v[0]?.uid ?? null;
      if (choisi) page = Math.floor(v.findIndex((o) => o.uid === choisi) / parPage);
      rendre();
    },
    focus: () => (filtres.querySelector('[aria-pressed="true"]') ?? btRetour).focus(),
    // Animations (coulures du bandeau) : en cours seulement quand l'Inventaire est affiché (avant : jamais, les coulures restaient cachées).
    animer(actif) {
      section.classList.toggle('e9-anime', actif);
      if (actif) mesurer();
    },
    etat: () => ({ filtre, filtres: [...filtres.querySelectorAll('button')].map((b) => b.id.replace('menu-inventaire-filtre-', '')), page: page + 1, pages: Math.max(1, Math.ceil(visibles().length / parPage)), parPage, choisi, visibles: visibles().map((o) => o.uid) }),
  };
}
