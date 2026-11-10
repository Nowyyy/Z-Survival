// Lot 8d : sous-menu Fusion (E9-3, maquette Docs/maquettes-v0.8/Fusion.html), écran plein chargé à sa première ouverture (js/menu/personnage.js).
// Règle en une phrase ; trois emplacements (remplis ou « + »), flèche, résultat (rareté supérieure, effet) qui brille quand la fusion est possible ;
// « Il manque N … » sinon ; « Fusionner » (désactivé tant qu'il manque un objet, raison lue ; coût affiché, jamais prélevé avant le lot 8h) ; objets
// compatibles (même id et même rareté que le premier placé, sinon tous les fusionnables) ; « Remplir automatiquement » ; résultat annoncé (aria-live).
import { formatMoney } from '../core/economy.js';
import { bonusObjet, compatibles, definition, emplacementDe, etatFusion, fusionner, indexRarete, objetDe, remplirAuto } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { annonce, estActif, icone24, nomObjet, nomRarete, poserActif, teteSous, texteEffet } from './personnage.js';

export function creer({ t, bandeau, eq, cat, retour }) {
  let places = [null, null, null];
  let dernier = null; // dernier objet obtenu (affiché dans le résultat jusqu'au prochain placement)

  const section = el('section', ['e8-ecran', 'e9', 'e9-sous', 'e9-fusion'], { id: 'menu-ecran-fusion', 'aria-labelledby': 'menu-fusion-titre', 'data-block': 'E9-3' });
  const { tete, bouton: btRetour } = teteSous(t, bandeau, t('game.menu.fusion.titre'), 'menu-fusion', retour);
  const regle = el('p', ['e9-regle'], { id: 'menu-fusion-regle' });
  regle.textContent = t('game.menu.fusion.regle');

  const atelier = el('section', ['e9-panneau', 'e9-atelier'], { id: 'menu-fusion-atelier', 'aria-label': t('game.menu.fusion.atelier') });
  const rangee = el('div', ['e9-fusion-rangee']);
  const cases = el('ul', ['e9-fusion-places'], { 'aria-label': t('game.menu.fusion.places') });
  const fleche = el('span', ['e9-fusion-fleche']);
  fleche.append(icone24('fleche', 'e9-icone e9-fleche'));
  const resultat = el('div', ['e9-resultat'], { id: 'menu-fusion-resultat', role: 'group', 'aria-label': t('game.menu.fusion.resultat') });
  rangee.append(cases, fleche, resultat);
  const message = el('p', ['e9-detail-info'], { id: 'menu-fusion-message' });
  const btFusionner = el('button', ['e9-bouton', 'menu-planche', 'e9-violet', 'e9-fusionner'], { type: 'button', id: 'menu-fusion-fusionner' });
  btFusionner.textContent = t('game.menu.fusion.fusionner');
  atelier.append(rangee, message, btFusionner);
  const gauche = el('div', ['e9-sous-gauche']);
  gauche.append(tete, regle, atelier);

  const droite = el('section', ['e9-panneau', 'e9-compatibles'], { id: 'menu-fusion-compatibles', 'aria-labelledby': 'menu-fusion-compatibles-titre' });
  const droiteTete = el('div', ['e9-compatibles-tete']);
  const droiteTitre = el('h3', ['e9-compatibles-titre'], { id: 'menu-fusion-compatibles-titre' });
  droiteTitre.textContent = t('game.menu.fusion.compatibles');
  const droiteRarete = el('p', ['e9-compatibles-rarete'], { id: 'menu-fusion-rarete' });
  droiteTete.append(droiteTitre, droiteRarete);
  const grille = el('ul', ['e9-grille', 'e9-grille-compatibles'], { id: 'menu-fusion-grille', 'aria-labelledby': 'menu-fusion-compatibles-titre' });
  const btAuto = el('button', ['e9-bouton', 'menu-planche', 'e9-auto'], { type: 'button', id: 'menu-fusion-auto' });
  btAuto.textContent = t('game.menu.fusion.auto');
  droite.append(droiteTete, grille, btAuto);
  const { element: live, dire } = annonce('menu-fusion-annonce');
  section.append(gauche, droite, live);

  const nettoyer = () => {
    const etat = eq.etat();
    places = places.map((u) => (objetDe(etat, u) ? u : null));
  };

  function placer(uid) {
    const i = places.indexOf(uid);
    if (i >= 0) places[i] = null; // déjà placé : retiré
    else {
      const libre = places.indexOf(null);
      if (libre < 0) return;
      const avec = [...places];
      avec[libre] = uid;
      if (etatFusion(eq.etat(), cat, avec).raison === 'different') return; // incompatible avec le premier placé
      places = avec;
    }
    dernier = null;
    rendre();
  }

  function caseObjet(o, { classe, id, sousTexte }) {
    const b = el('button', [classe], { type: 'button', id, 'data-uid': o.uid, 'data-rarete': o.rarete });
    const n = el('span', ['e9-case-nom']);
    n.textContent = nomObjet(cat, o);
    const r = el('span', ['e9-case-rarete']);
    r.textContent = nomRarete(cat, o.rarete);
    const s = el('span', ['e9-case-niveau']);
    s.textContent = sousTexte;
    b.append(n, r, s);
    return b;
  }

  function rendre() {
    nettoyer();
    const etat = eq.etat();
    const f = etatFusion(etat, cat, places);
    // Trois emplacements : objet placé (le toucher le retire) ou « + ».
    cases.replaceChildren(...places.map((u, i) => {
      const li = el('li');
      const o = objetDe(etat, u);
      if (o) {
        const b = caseObjet(o, { classe: 'e9-place', id: `menu-fusion-place-${i + 1}`, sousTexte: fmt(t('game.menu.perso.niv'), { n: o.niveau }) });
        b.setAttribute('aria-label', fmt(t('game.menu.fusion.place.retirer'), { nom: nomObjet(cat, o), rarete: nomRarete(cat, o.rarete), n: o.niveau }));
        b.addEventListener('click', () => placer(u));
        li.append(b);
      } else {
        const v = el('span', ['e9-place', 'is-vide'], { id: `menu-fusion-place-${i + 1}`, role: 'img', 'aria-label': t('game.menu.fusion.place.vide') });
        v.textContent = '+';
        li.append(v);
      }
      return li;
    }));
    // Résultat : objet de la rareté supérieure (niveau = le plus haut des placés, borné), ou le dernier obtenu.
    const nouveau = objetDe(etat, dernier);
    let apercu = null;
    if (nouveau) apercu = nouveau;
    else if (f.resultat) {
      const placesObjets = places.map((u) => objetDe(etat, u)).filter(Boolean);
      const max = cat.objets.get(f.objet).raretes[f.resultat].niveauMax;
      apercu = { uid: null, id: f.objet, rarete: f.resultat, niveau: Math.min(max, Math.max(...placesObjets.map((o) => o.niveau))) };
    }
    resultat.replaceChildren();
    resultat.classList.toggle('is-pret', f.possible);
    resultat.classList.toggle('is-obtenu', Boolean(nouveau));
    if (apercu && definition(cat, apercu)) {
      resultat.dataset.rarete = apercu.rarete;
      const n = el('span', ['e9-case-nom']);
      n.textContent = nomObjet(cat, apercu);
      const r = el('span', ['e9-case-rarete']);
      r.textContent = nomRarete(cat, apercu.rarete);
      const e = el('span', ['e9-resultat-effet']);
      e.textContent = texteEffet(t, bonusObjet(cat, apercu));
      resultat.append(n, r, e);
      if (nouveau) resultat.prepend(Object.assign(el('span', ['e9-resultat-obtenu']), { textContent: t('game.menu.fusion.obtenu') }));
    } else {
      delete resultat.dataset.rarete;
      resultat.append(Object.assign(el('span', ['e9-resultat-vide']), { textContent: '?' }));
    }
    // Message : manque, possible, rareté maximale, ou consigne.
    const objetNom = f.objet ? cat.objets.get(f.objet).nom : '';
    const rarete = f.rarete ? nomRarete(cat, f.rarete).toLocaleLowerCase('fr') : '';
    const prix = f.prix === null ? '' : formatMoney(f.prix);
    if (nouveau && f.raison === 'vide') message.textContent = fmt(t('game.menu.fusion.message.obtenu'), { nom: nomObjet(cat, nouveau), rarete: nomRarete(cat, nouveau.rarete).toLocaleLowerCase('fr'), n: nouveau.niveau });
    else if (f.raison === 'vide') message.textContent = t('game.menu.fusion.message.vide');
    else if (f.raison === 'max') message.textContent = t('game.menu.fusion.message.max');
    else if (f.possible) message.textContent = fmt(t('game.menu.fusion.message.pret'), { prix });
    else message.textContent = fmt(t(f.manque === 1 ? 'game.menu.fusion.message.manque.un' : 'game.menu.fusion.message.manque'), { n: f.manque, objet: objetNom, rarete, prix });
    poserActif(btFusionner, f.possible, 'menu-fusion-message');

    // Objets compatibles : placés bordés de jaune (« Placé ») ; sans objet placé, tous les fusionnables (rareté écrite).
    const liste = compatibles(etat, cat, places).sort((a, b) => indexRarete(cat, b.rarete) - indexRarete(cat, a.rarete) || a.id.localeCompare(b.id) || b.niveau - a.niveau);
    droiteRarete.textContent = f.rarete && f.raison !== 'max' ? fmt(t('game.menu.fusion.rarete'), { rarete: nomRarete(cat, f.rarete) }) : t('game.menu.fusion.rarete.toutes');
    grille.replaceChildren(...liste.map((o) => {
      const li = el('li');
      const place = places.includes(o.uid);
      const porte = emplacementDe(etat, o.uid);
      const sous = place ? t('game.menu.fusion.place') : fmt(t(porte ? 'game.menu.inventaire.case.porte' : 'game.menu.perso.niv'), { n: o.niveau });
      const b = caseObjet(o, { classe: 'e9-case', id: `menu-fusion-objet-${o.uid}`, sousTexte: sous });
      b.setAttribute('aria-pressed', String(place));
      b.addEventListener('click', () => placer(o.uid));
      li.append(b);
      return li;
    }));
    const auto = remplirAuto(etat, cat, places);
    poserActif(btAuto, auto.some((u, i) => u !== places[i]), 'menu-fusion-message');
  }

  btAuto.addEventListener('click', () => {
    if (!estActif(btAuto)) return;
    places = remplirAuto(eq.etat(), cat, places);
    dernier = null;
    rendre();
  });
  btFusionner.addEventListener('click', () => {
    if (!estActif(btFusionner)) return;
    const { etat, uid } = fusionner(eq.etat(), cat, places);
    if (!uid) return;
    places = [null, null, null];
    dernier = uid;
    eq.poser(etat);
    const o = objetDe(etat, uid);
    dire(fmt(t('game.menu.fusion.annonce'), { nom: nomObjet(cat, o), rarete: nomRarete(cat, o.rarete), n: o.niveau, porte: emplacementDe(etat, uid) ? t('game.menu.fusion.annonce.porte') : '' }));
    rendre();
  });

  eq.abonner(() => {
    if (!section.hidden) rendre();
  });

  return {
    section,
    // opts : { place (uid placé d'abord, depuis l'Inventaire) }.
    ouvrir(opts = {}) {
      dernier = null;
      places = [null, null, null];
      if (opts.place && objetDe(eq.etat(), opts.place)) places[0] = opts.place;
      rendre();
    },
    focus: () => btRetour.focus(),
    animer(actif) {
      section.classList.toggle('e9-anime', actif);
    },
    etat: () => ({ places: [...places], dernier, ...(({ possible, manque, raison, objet, rarete, resultat: r, prix }) => ({ possible, manque, raison, objet, rarete, resultat: r, prix }))(etatFusion(eq.etat(), cat, places)) }),
  };
}
