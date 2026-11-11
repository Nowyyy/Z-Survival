// Lot 8e : écrans de résultat de la Boutique (E3-4 ×1, E3-5 ×10 ; maquettes Docs/maquettes-v0.8/Resultat1.html, Resultat10.html ;
// Docs/ref/menu-principal.md), chargés au premier achat. Écran du menu à la place de la Boutique (barre d'onglets gardée, comme les sous-menus du
// lot 8d) : bandeau « Boutique » / « Résultat » ou « Résultat ×10 », « Retour » (et Échap) vers la Boutique. ×1 : carte de l'objet (icône de son
// type, nom, rareté écrite, type et effet), bordée de la couleur de sa rareté, halo pour les deux raretés les plus hautes (Épique, Légendaire),
// « Rangé dans l'inventaire. », « Continuer » et « Rouvrir · [prix] ». ×10 : grille de 10 cartes (5 × 2) et résumé (nombre par rareté, meilleur
// objet nommé). Apparition en fondu et léger glissement (e3-apparition, décalée pour ×10), directe sous prefers-reduced-motion ; objets annoncés
// (aria-live). Le prix de « Rouvrir » est affiché, jamais prélevé.
import { formatMoney } from '../core/economy.js';
import { TIRAGES_X10, prixAchat, resume } from '../core/caisses.js';
import { bonusObjet } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { poserJeton } from './boutique.js';
import { TYPE_TEXTES, annonce, icone24, texteEffet } from './personnage.js';

// Nombre d'objets d'une rareté dans le résumé (« 3 communs », « 1 épique ») : clés écrites en entier ; rareté sans clé : nom des données.
const COMPTE = {
  commun: ['game.menu.resultat.n.commun.un', 'game.menu.resultat.n.commun'],
  'peu-commun': ['game.menu.resultat.n.peu-commun.un', 'game.menu.resultat.n.peu-commun'],
  rare: ['game.menu.resultat.n.rare.un', 'game.menu.resultat.n.rare'],
  epique: ['game.menu.resultat.n.epique.un', 'game.menu.resultat.n.epique'],
  legendaire: ['game.menu.resultat.n.legendaire.un', 'game.menu.resultat.n.legendaire'],
};
// Halo : les deux raretés les plus hautes du catalogue (Épique et Légendaire avec data/menu/raretes.json).
export const avecHalo = (cat, rid) => {
  const i = cat.raretes.findIndex((r) => r.id === rid);
  return i >= 0 && i >= cat.raretes.length - 2;
};

export function creerResultat({ t, bandeau, cat, continuer, rouvrir }) {
  const rarete = (rid) => cat.raretes.find((r) => r.id === rid) ?? null;
  const objetCat = (o) => cat.objets.get(o.id) ?? null;

  const section = el('section', ['e8-ecran', 'e3', 'e3-resultat'], { id: 'menu-ecran-resultat', 'aria-labelledby': 'menu-resultat-titre', 'data-block': 'E3-4', 'data-anim': 'off' });
  const tete = el('div', ['e5-tete', 'e3-tete']);
  const titre = bandeau(t('game.menu.resultat.libelle'), t('game.menu.resultat.titre'), 'menu-resultat-titre');
  const titreTexte = titre.querySelector('h2');
  const btRetour = el('button', ['menu-planche', 'e5-retour'], { type: 'button', id: 'menu-resultat-retour', 'aria-label': t('game.menu.resultat.retour.aria') });
  btRetour.append(icone24('chevron', 'e5-chevron'), Object.assign(el('span'), { textContent: t('game.menu.resultat.retour') }));
  btRetour.addEventListener('click', () => continuer());
  tete.append(titre, btRetour);

  // ×1 : halo, carte, mention ; ×10 : grille et résumé. Un seul des deux blocs est affiché.
  const un = el('div', ['e3-un'], { id: 'menu-resultat-un' });
  const halo = el('span', ['e3-halo'], { 'aria-hidden': 'true' });
  const carte = el('div', ['e3-objet'], { id: 'menu-resultat-carte' });
  const carteIcone = el('span', ['e3-objet-icone']);
  const carteNom = el('h3', ['e3-objet-nom'], { id: 'menu-resultat-nom' });
  const carteRarete = el('p', ['e3-objet-rarete'], { id: 'menu-resultat-rarete' });
  const carteLigne = el('p', ['e3-objet-ligne'], { id: 'menu-resultat-ligne' });
  carte.append(carteIcone, carteNom, carteRarete, carteLigne);
  const range = el('p', ['e3-range'], { id: 'menu-resultat-range' });
  range.textContent = t('game.menu.resultat.range');
  un.append(halo, carte, range);

  const dix = el('div', ['e3-dix'], { id: 'menu-resultat-dix' });
  const grille = el('ul', ['e3-grille'], { id: 'menu-resultat-grille', 'aria-label': t('game.menu.resultat.objets') });
  const resumeTexte = el('p', ['e3-resume'], { id: 'menu-resultat-resume' });
  dix.append(grille, resumeTexte);

  const actions = el('div', ['e3-actions']);
  const btContinuer = el('button', ['e3-action', 'e3-planche'], { type: 'button', id: 'menu-resultat-continuer' });
  btContinuer.textContent = t('game.menu.resultat.continuer');
  btContinuer.addEventListener('click', () => continuer());
  const btRouvrir = el('button', ['e3-action', 'e3-rouge'], { type: 'button', id: 'menu-resultat-rouvrir' });
  btRouvrir.addEventListener('click', () => rouvrir());
  actions.append(btContinuer, btRouvrir);
  const { element: live, dire } = annonce('menu-resultat-annonce');
  section.append(tete, un, dix, actions, live);

  let courant = null;

  function compteTexte({ rarete: rid, n }) {
    const cles = COMPTE[rid];
    const nom = rarete(rid)?.nom?.toLocaleLowerCase('fr') ?? rid;
    return cles ? fmt(t(cles[n === 1 ? 0 : 1]), { n }) : `${n} ${nom}`;
  }

  function afficher(r) {
    courant = r;
    const plusieurs = r.quantite === TIRAGES_X10;
    section.dataset.block = plusieurs ? 'E3-5' : 'E3-4';
    section.dataset.quantite = String(r.quantite);
    titreTexte.textContent = t(plusieurs ? 'game.menu.resultat.titre10' : 'game.menu.resultat.titre');
    un.hidden = plusieurs;
    dix.hidden = !plusieurs;
    btRouvrir.textContent = fmt(t(plusieurs ? 'game.menu.resultat.rouvrir10' : 'game.menu.resultat.rouvrir'), { prix: formatMoney(prixAchat(r.caisse, r.quantite)) });
    btRouvrir.setAttribute('aria-label', fmt(t('game.menu.resultat.rouvrir.aria'), { action: btRouvrir.textContent, caisse: r.caisse.nom }));
    if (!plusieurs) {
      const o = r.objets[0];
      const def = objetCat(o);
      const rr = rarete(o.rarete);
      for (const n of [carte, halo]) poserJeton(n, '--e3-rarete', rr?.jeton);
      carte.dataset.rarete = o.rarete;
      carte.dataset.objet = o.id;
      carte.classList.toggle('e3-brille', avecHalo(cat, o.rarete));
      halo.hidden = !avecHalo(cat, o.rarete);
      carteIcone.replaceChildren(icone24(def?.type ?? 'accessoire', 'e9-icone e3-objet-svg'));
      carteNom.textContent = def?.nom ?? o.id;
      carteRarete.textContent = rr?.nom ?? '';
      const effet = texteEffet(t, bonusObjet(cat, { ...o, uid: r.uids[0] }));
      carteLigne.textContent = effet ? fmt(t('game.menu.resultat.ligne'), { type: t(TYPE_TEXTES[def?.type]), effet }) : t(TYPE_TEXTES[def?.type]);
      // Apparition rejouée à chaque résultat (la classe e3-apparait relance l'animation).
      carte.classList.remove('e3-apparait');
      void carte.offsetWidth;
      carte.classList.add('e3-apparait');
      dire(fmt(t('game.menu.resultat.annonce'), { objet: carteNom.textContent, rarete: carteRarete.textContent }));
    } else {
      grille.replaceChildren(...r.objets.map((o, i) => {
        const li = el('li', ['e3-case', 'e3-apparait'], { 'data-rarete': o.rarete, 'data-objet': o.id });
        poserJeton(li, '--e3-rarete', rarete(o.rarete)?.jeton);
        li.style.setProperty('--e3-rang', String(i));
        if (avecHalo(cat, o.rarete)) li.classList.add('e3-brille');
        const nom = el('span', ['e3-case-nom']);
        nom.textContent = objetCat(o)?.nom ?? o.id;
        const sep = el('span', ['sr-only']);
        sep.textContent = ', ';
        const rar = el('span', ['e3-case-rarete']);
        rar.textContent = rarete(o.rarete)?.nom ?? '';
        li.append(nom, sep, rar);
        return li;
      }));
      // Résumé : « Obtenu : 3 communs, 2 peu communs… » ; le groupe du meilleur objet nommé et mis en avant ; « Tout est rangé dans l'inventaire. »
      const { compte, meilleur } = resume(r.objets, cat);
      resumeTexte.replaceChildren();
      resumeTexte.append(t('game.menu.resultat.obtenu'));
      compte.forEach((x, i) => {
        if (i > 0) resumeTexte.append(t('game.menu.resultat.virgule'));
        if (meilleur && x.rarete === meilleur.rarete) {
          const fort = el('strong', ['e3-meilleur'], { id: 'menu-resultat-meilleur' });
          poserJeton(fort, '--e3-rarete', rarete(x.rarete)?.jeton);
          fort.textContent = fmt(t('game.menu.resultat.meilleur'), { compte: compteTexte(x), objet: objetCat(meilleur)?.nom ?? meilleur.id });
          resumeTexte.append(fort);
        } else {
          resumeTexte.append(compteTexte(x));
        }
      });
      resumeTexte.append(t('game.menu.resultat.fin'));
      dire(resumeTexte.textContent);
    }
  }

  return {
    section,
    afficher,
    focus: () => btContinuer.focus(),
    animer(actif) {
      section.dataset.anim = actif ? 'on' : 'off';
    },
    etat: () => (courant ? {
      quantite: courant.quantite,
      titre: titreTexte.textContent,
      cartes: courant.quantite === TIRAGES_X10
        ? [...grille.children].map((li) => ({ objet: li.dataset.objet, rarete: li.dataset.rarete, texte: li.textContent, halo: li.classList.contains('e3-brille') }))
        : [{ objet: carte.dataset.objet, rarete: carte.dataset.rarete, texte: `${carteNom.textContent} ${carteRarete.textContent}`, halo: carte.classList.contains('e3-brille') }],
      resume: courant.quantite === TIRAGES_X10 ? resumeTexte.textContent : range.textContent,
      rouvrir: btRouvrir.textContent,
    } : null),
  };
}
