// Lot 8d : sous-menu Personnages (E9-4, maquette Docs/maquettes-v0.8/Personnages.html), écran plein chargé à sa première ouverture
// (js/menu/personnage.js). Grille des personnages (silhouette de leur teinte, nom, « Choisi · niv. N », « niv. N » ou « Verrouillé » avec cadenas) ;
// à droite, le personnage sélectionné : petite silhouette animée, nom, niveau, barre de progression, capacité, ses statistiques effectives (s'il
// était choisi), « Choisir » (ou « Choisi », désactivé) et « Améliorer · [prix] » (prix affiché, jamais prélevé avant le lot 8h). Un personnage
// verrouillé n'est ni choisissable ni améliorable. État en mémoire (equipement-etat.js).
import { formatMoney } from '../core/economy.js';
import { ameliorerPersonnage, choisirPersonnage, infoPersonnage } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { filigrane, annonce, buste, estActif, icone24, listeStats, poserActif, silhouette, teteSous } from './personnage.js';

export function creer({ t, bandeau, eq, cat, stats, retour }) {
  let selection = eq.etat().choisi;

  const section = el('section', ['e8-ecran', 'e9', 'e9-sous', 'e9-personnages'], { id: 'menu-ecran-personnages', 'aria-labelledby': 'menu-personnages-titre', 'data-block': 'E9-4' });
  const { tete, bouton: btRetour } = teteSous(t, bandeau, t('game.menu.personnages.titre'), 'menu-personnages', retour);
  const grille = el('ul', ['e9-grille', 'e9-grille-persos'], { id: 'menu-personnages-grille', 'aria-label': t('game.menu.personnages.liste') });
  const gauche = el('div', ['e9-sous-gauche']);
  gauche.append(tete, grille);

  const panneau = el('section', ['e9-panneau', 'e9-fiche'], { id: 'menu-personnages-fiche', 'aria-labelledby': 'menu-personnages-nom' });
  const haut = el('div', ['e9-fiche-haut']);
  const mini = el('span', ['e9-fiche-silhouette']);
  const textes = el('div', ['e9-fiche-textes']);
  const nom = el('h3', ['e9-fiche-nom'], { id: 'menu-personnages-nom' });
  const niveau = el('p', ['e9-fiche-niveau'], { id: 'menu-personnages-niveau' });
  const barre = el('div', ['e9-barre'], { role: 'progressbar', id: 'menu-personnages-barre', 'aria-labelledby': 'menu-personnages-niveau', 'aria-valuemin': '1' });
  const rempli = el('span', ['e9-barre-rempli']);
  barre.append(rempli);
  textes.append(nom, niveau, barre);
  haut.append(mini, textes);
  const capacite = el('div', ['e9-fiche-capacite'], { id: 'menu-personnages-capacite' });
  const capTitre = el('p', ['e9-fiche-capacite-titre']);
  const capTexte = el('p', ['e9-fiche-capacite-texte']);
  capacite.append(capTitre, capTexte);
  const statsTitre = el('p', ['e9-fiche-stats-titre'], { id: 'menu-personnages-stats-titre' });
  const statsBoite = el('div', ['e9-fiche-stats']);
  const boutons = el('div', ['e9-detail-boutons', 'e9-fiche-boutons']);
  const btChoisir = el('button', ['e9-bouton', 'e9-rouge', 'e9-choisir'], { type: 'button', id: 'menu-personnages-choisir' });
  const btAmeliorer = el('button', ['e9-bouton', 'menu-planche'], { type: 'button', id: 'menu-personnages-ameliorer' });
  boutons.append(btChoisir, btAmeliorer);
  const raison = el('p', ['e9-raison'], { id: 'menu-personnages-raison' });
  const { element: live, dire } = annonce('menu-personnages-annonce');
  panneau.append(haut, capacite, statsTitre, statsBoite, raison, boutons);
  section.append(filigrane('personne'), gauche, panneau, live);

  function rendre() {
    const etat = eq.etat();
    grille.replaceChildren(...cat.personnages.map((p) => {
      const info = infoPersonnage(etat, cat, p.id);
      const li = el('li');
      const b = el('button', ['e9-case', 'e9-case-perso'], { type: 'button', id: `menu-perso-carte-${p.id}`, 'aria-pressed': String(p.id === selection) });
      b.classList.toggle('is-choisi', info.choisi);
      b.classList.toggle('is-verrou', info.verrouille);
      const n = el('span', ['e9-case-nom']);
      n.textContent = p.nom;
      const s = el('span', ['e9-case-niveau']);
      s.textContent = info.verrouille ? t('game.menu.personnages.verrouille') : fmt(t(info.choisi ? 'game.menu.personnages.choisi.niveau' : 'game.menu.perso.niv'), { n: info.niveau });
      b.append(buste(p), n, s);
      if (info.verrouille) b.append(icone24('cadenas', 'e9-icone e9-cadenas'));
      b.addEventListener('click', () => {
        selection = p.id;
        rendre();
      });
      li.append(b);
      return li;
    }));

    const p = cat.personnages.find((x) => x.id === selection) ?? cat.personnages[0];
    if (!p) return;
    const info = infoPersonnage(etat, cat, p.id);
    mini.replaceChildren(silhouette(p, { classe: 'e9-petite', complete: false }));
    nom.textContent = p.nom;
    niveau.textContent = info.verrouille ? t('game.menu.personnages.verrouille') : fmt(t(info.niveau >= info.niveauMax ? 'game.menu.personnages.niveau.max' : 'game.menu.personnages.niveau'), { n: info.niveau, suivant: info.niveau + 1 });
    barre.setAttribute('aria-valuemax', String(info.niveauMax));
    barre.setAttribute('aria-valuenow', String(info.niveau));
    rempli.style.width = `${Math.round((100 * info.niveau) / info.niveauMax)}%`;
    capTitre.textContent = fmt(t('game.menu.perso.capacite'), { nom: p.capacite.nom });
    capTexte.textContent = p.capacite.description;
    statsTitre.textContent = t(info.choisi ? 'game.menu.perso.stats' : 'game.menu.personnages.stats.si');
    statsBoite.replaceChildren(listeStats(t, stats(p.id).niveaux, { id: 'menu-personnages-stats', classe: 'e9-stats' }));
    statsBoite.firstChild.setAttribute('aria-labelledby', 'menu-personnages-stats-titre');
    statsBoite.firstChild.removeAttribute('aria-label');
    btChoisir.textContent = t(info.choisi ? 'game.menu.personnages.choisi' : 'game.menu.personnages.choisir');
    btChoisir.classList.toggle('is-choisi', info.choisi);
    poserActif(btChoisir, !info.choisi && !info.verrouille, 'menu-personnages-raison');
    btAmeliorer.textContent = info.peutAmeliorer ? fmt(t('game.menu.personnages.ameliorer'), { prix: formatMoney(info.prix) }) : t('game.menu.inventaire.ameliorer.max');
    if (info.verrouille) btAmeliorer.textContent = t('game.menu.personnages.ameliorer.verrou');
    poserActif(btAmeliorer, info.peutAmeliorer, 'menu-personnages-raison');
    const r = info.verrouille ? 'game.menu.personnages.raison.verrou' : info.choisi && !info.peutAmeliorer ? 'game.menu.personnages.raison.max.choisi' : info.choisi ? 'game.menu.personnages.raison.choisi' : !info.peutAmeliorer ? 'game.menu.personnages.raison.max' : null;
    raison.hidden = !r;
    raison.textContent = r ? fmt(t(r), { n: info.niveauMax }) : '';
  }

  btChoisir.addEventListener('click', () => {
    if (!estActif(btChoisir)) return;
    const etat = eq.etat();
    if (eq.poser(choisirPersonnage(etat, cat, selection)) !== etat) dire(fmt(t('game.menu.personnages.annonce.choisi'), { nom: cat.personnages.find((p) => p.id === selection).nom }));
  });
  btAmeliorer.addEventListener('click', () => {
    if (!estActif(btAmeliorer)) return;
    const etat = eq.etat();
    const n = eq.poser(ameliorerPersonnage(etat, cat, selection));
    if (n !== etat) dire(fmt(t('game.menu.personnages.annonce.ameliore'), { nom: cat.personnages.find((p) => p.id === selection).nom, n: n.persos[selection] }));
  });

  eq.abonner(() => {
    if (!section.hidden) rendre();
  });

  return {
    section,
    ouvrir() {
      selection = eq.etat().choisi ?? cat.personnages[0]?.id ?? null;
      rendre();
    },
    focus: () => (grille.querySelector('[aria-pressed="true"]') ?? btRetour).focus(),
    animer(actif) {
      section.classList.toggle('e9-anime', actif);
    },
    etat: () => ({ selection, ...infoPersonnage(eq.etat(), cat, selection) }),
  };
}
