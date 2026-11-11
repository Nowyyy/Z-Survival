// Lot 8e : écrans de résultat de la Boutique (E3-4 ×1, E3-5 ×10 ; maquettes Docs/maquettes-v0.8/Resultat1.html, Resultat10.html ;
// Docs/ref/menu-principal.md), chargés au premier achat. Retour du propriétaire : écran plein (barre d'onglets masquée, comme l'ouverture du lot 8f),
// sans « Retour » : « Continuer » (et Échap) ramène à la Boutique, « Rouvrir » rachète la même caisse. Bandeau « Boutique » / « Résultat » ou
// « Résultat ×10 ». Selon l'achat : objet (caisse d'équipement, offre du jour : icône de son type, nom, rareté écrite, type et effet), personnage
// (silhouette, nom, nouveau ou niveau gagné), tenue (nom, rareté, nouvelle ou déjà obtenue). Bordure de la rareté (personnage : nouveau = doré),
// halo pour les deux raretés les plus hautes et pour un nouveau personnage. ×10 : grille 5 × 2 et résumé. Apparition en fondu et léger glissement
// (e3-apparition, décalée pour ×10), directe sous prefers-reduced-motion ; résultat annoncé (aria-live). Prix de « Rouvrir » affiché, jamais prélevé.
import { formatMoney } from '../core/economy.js';
import { TIRAGES_X10, prixAchat, resume } from '../core/caisses.js';
import { bonusObjet, personnageDe } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { poserJeton } from './boutique.js';
import { TYPE_TEXTES, annonce, buste, icone24, texteEffet } from './personnage.js';

// Nombre d'éléments d'une rareté dans le résumé (« 3 communs », « 1 épique ») : clés écrites en entier ; rareté sans clé : nom des données.
const COMPTE = {
  commun: ['game.menu.resultat.n.commun.un', 'game.menu.resultat.n.commun'],
  'peu-commun': ['game.menu.resultat.n.peu-commun.un', 'game.menu.resultat.n.peu-commun'],
  rare: ['game.menu.resultat.n.rare.un', 'game.menu.resultat.n.rare'],
  epique: ['game.menu.resultat.n.epique.un', 'game.menu.resultat.n.epique'],
  legendaire: ['game.menu.resultat.n.legendaire.un', 'game.menu.resultat.n.legendaire'],
};
const RANGE = { equipement: 'game.menu.resultat.range', offre: 'game.menu.resultat.range', personnage: 'game.menu.resultat.range.personnage', cosmetique: 'game.menu.resultat.range.tenue' };
const FIN = { equipement: 'game.menu.resultat.fin', cosmetique: 'game.menu.resultat.fin.tenue' };
// Halo : les deux raretés les plus hautes du catalogue (Épique et Légendaire avec data/menu/raretes.json).
export const avecHalo = (cat, rid) => {
  const i = cat.raretes.findIndex((r) => r.id === rid);
  return i >= 0 && i >= cat.raretes.length - 2;
};
// Jetons des personnages obtenus (pas de rareté) : nouveau = doré, déjà obtenu = gris.
const JETON_NOUVEAU = '--rarete-legendaire';
const JETON_DOUBLON = '--rarete-commun';

export function creerResultat({ t, bandeau, cat, continuer, rouvrir }) {
  const rarete = (rid) => cat.raretes.find((r) => r.id === rid) ?? null;
  const nomDe = (o, type) => (type === 'personnage' ? personnageDe(cat, o.id)?.nom : type === 'cosmetique' ? cat.cosmetiques?.find((c) => c.id === o.id)?.nom : cat.objets.get(o.id)?.nom) ?? o.id;

  const section = el('section', ['e8-ecran', 'e3', 'e3-resultat'], { id: 'menu-ecran-resultat', 'aria-labelledby': 'menu-resultat-titre', 'data-block': 'E3-4', 'data-anim': 'off' });
  const tete = el('div', ['e5-tete', 'e3-tete']);
  const titre = bandeau(t('game.menu.resultat.libelle'), t('game.menu.resultat.titre'), 'menu-resultat-titre');
  const titreTexte = titre.querySelector('h2');
  tete.append(titre);

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

  // Une carte (×1) ou une case (×10) : { jeton, halo, ligne2, statut } selon le type d'achat.
  function decrire(r, i) {
    const o = r.objets[i];
    if (r.type === 'personnage') {
      const is = r.issues[i];
      return { jeton: is.nouveau ? JETON_NOUVEAU : JETON_DOUBLON, halo: is.nouveau, statut: is.nouveau ? 'nouveau' : 'doublon',
        ligne2: t(is.nouveau ? 'game.menu.resultat.perso.nouveau' : 'game.menu.resultat.perso.doublon'),
        ligne3: fmt(t(is.max ? 'game.menu.resultat.perso.niveau.max' : 'game.menu.resultat.perso.niveau'), { n: is.niveau }) };
    }
    const rr = rarete(o.rarete);
    if (r.type === 'cosmetique') {
      const nouveau = r.nouveaux[i];
      return { jeton: rr?.jeton, halo: avecHalo(cat, o.rarete), statut: nouveau ? 'nouveau' : 'doublon', ligne2: rr?.nom ?? '',
        ligne3: t(nouveau ? 'game.menu.resultat.tenue.nouvelle' : 'game.menu.resultat.tenue.doublon') };
    }
    const def = cat.objets.get(o.id);
    const effet = texteEffet(t, bonusObjet(cat, { ...o, uid: r.uids[i] }));
    return { jeton: rr?.jeton, halo: avecHalo(cat, o.rarete), statut: null, ligne2: rr?.nom ?? '',
      ligne3: effet ? fmt(t('game.menu.resultat.ligne'), { type: t(TYPE_TEXTES[def?.type]), effet }) : t(TYPE_TEXTES[def?.type]) };
  }

  function afficher(r) {
    courant = r;
    const plusieurs = r.quantite === TIRAGES_X10;
    section.dataset.block = plusieurs ? 'E3-5' : 'E3-4';
    section.dataset.quantite = String(r.quantite);
    section.dataset.type = r.type;
    titreTexte.textContent = t(plusieurs ? 'game.menu.resultat.titre10' : 'game.menu.resultat.titre');
    un.hidden = plusieurs;
    dix.hidden = !plusieurs;
    btRouvrir.hidden = !r.caisse; // offre du jour : achetée une fois, rien à rouvrir
    if (r.caisse) {
      btRouvrir.textContent = fmt(t(plusieurs ? 'game.menu.resultat.rouvrir10' : 'game.menu.resultat.rouvrir'), { prix: formatMoney(prixAchat(r.caisse, r.quantite)) });
      btRouvrir.setAttribute('aria-label', fmt(t('game.menu.resultat.rouvrir.aria'), { action: btRouvrir.textContent, caisse: r.caisse.nom }));
    }
    if (!plusieurs) {
      const o = r.objets[0];
      const d = decrire(r, 0);
      for (const n of [carte, halo]) poserJeton(n, '--e3-rarete', d.jeton);
      carte.dataset.rarete = o.rarete ?? '';
      carte.dataset.objet = o.id;
      carte.dataset.statut = d.statut ?? '';
      carte.classList.toggle('e3-brille', d.halo);
      halo.hidden = !d.halo;
      carteIcone.replaceChildren(r.type === 'personnage' ? buste(personnageDe(cat, o.id)) : icone24(r.type === 'cosmetique' ? 'tenue' : cat.objets.get(o.id)?.type ?? 'accessoire', 'e9-icone e3-objet-svg'));
      carteNom.textContent = nomDe(o, r.type);
      carteRarete.textContent = d.ligne2;
      carteLigne.textContent = d.ligne3;
      range.textContent = t(RANGE[r.type] ?? RANGE.equipement);
      // Apparition rejouée à chaque résultat (la classe e3-apparait relance l'animation).
      carte.classList.remove('e3-apparait');
      void carte.offsetWidth;
      carte.classList.add('e3-apparait');
      dire(fmt(t('game.menu.resultat.annonce'), { objet: carteNom.textContent, rarete: d.ligne2, suite: range.textContent }));
    } else {
      grille.replaceChildren(...r.objets.map((o, i) => {
        const d = decrire(r, i);
        const li = el('li', ['e3-case', 'e3-apparait'], { 'data-rarete': o.rarete ?? '', 'data-objet': o.id, 'data-statut': d.statut ?? '' });
        poserJeton(li, '--e3-rarete', d.jeton);
        li.style.setProperty('--e3-rang', String(i));
        if (d.halo) li.classList.add('e3-brille');
        const nom = el('span', ['e3-case-nom']);
        nom.textContent = nomDe(o, r.type);
        const sep = el('span', ['sr-only']);
        sep.textContent = ', ';
        const rar = el('span', ['e3-case-rarete']);
        rar.textContent = d.ligne2;
        li.append(nom, sep, rar);
        return li;
      }));
      resumeTexte.replaceChildren();
      if (r.type === 'personnage') {
        // « Obtenu : 2 nouveaux personnages ([Personnage 3], [Personnage 5]), 8 déjà obtenus (un niveau de plus chacun). »
        const nouveaux = r.issues.filter((x) => x.nouveau);
        const parties = [];
        if (nouveaux.length) {
          const fort = el('strong', ['e3-meilleur'], { id: 'menu-resultat-meilleur' });
          poserJeton(fort, '--e3-rarete', JETON_NOUVEAU);
          fort.textContent = fmt(t(nouveaux.length === 1 ? 'game.menu.resultat.perso.n.nouveau.un' : 'game.menu.resultat.perso.n.nouveau'), { n: nouveaux.length, noms: [...new Set(nouveaux.map((x) => personnageDe(cat, x.id)?.nom ?? x.id))].join(', ') });
          parties.push(fort);
        }
        const doublons = r.issues.length - nouveaux.length;
        if (doublons) parties.push(fmt(t(doublons === 1 ? 'game.menu.resultat.perso.n.doublon.un' : 'game.menu.resultat.perso.n.doublon'), { n: doublons }));
        resumeTexte.append(t('game.menu.resultat.obtenu'));
        parties.forEach((p, i) => {
          if (i > 0) resumeTexte.append(t('game.menu.resultat.virgule'));
          resumeTexte.append(p);
        });
        resumeTexte.append(t('game.menu.resultat.fin.personnage'));
      } else {
        // Résumé : « Obtenu : 3 communs, 2 peu communs… » ; le groupe du meilleur élément nommé et mis en avant.
        const { compte, meilleur } = resume(r.objets, cat);
        resumeTexte.append(t('game.menu.resultat.obtenu'));
        compte.forEach((x, i) => {
          if (i > 0) resumeTexte.append(t('game.menu.resultat.virgule'));
          if (meilleur && x.rarete === meilleur.rarete) {
            const fort = el('strong', ['e3-meilleur'], { id: 'menu-resultat-meilleur' });
            poserJeton(fort, '--e3-rarete', rarete(x.rarete)?.jeton);
            fort.textContent = fmt(t('game.menu.resultat.meilleur'), { compte: compteTexte(x), objet: nomDe(meilleur, r.type) });
            resumeTexte.append(fort);
          } else {
            resumeTexte.append(compteTexte(x));
          }
        });
        resumeTexte.append(t(FIN[r.type] ?? FIN.equipement));
      }
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
      type: courant.type,
      quantite: courant.quantite,
      titre: titreTexte.textContent,
      cartes: courant.quantite === TIRAGES_X10
        ? [...grille.children].map((li) => ({ objet: li.dataset.objet, rarete: li.dataset.rarete, statut: li.dataset.statut, texte: li.textContent, halo: li.classList.contains('e3-brille') }))
        : [{ objet: carte.dataset.objet, rarete: carte.dataset.rarete, statut: carte.dataset.statut, texte: `${carteNom.textContent} ${carteRarete.textContent}`, halo: carte.classList.contains('e3-brille') }],
      resume: courant.quantite === TIRAGES_X10 ? resumeTexte.textContent : range.textContent,
      rouvrir: btRouvrir.hidden ? null : btRouvrir.textContent,
    } : null),
  };
}
