// Lot 8e : onglet Boutique (E3-1, maquette Docs/maquettes-v0.8/Caisses.html ; Docs/ref/menu-principal.md), chargé à la demande au premier affichage
// de l'onglet, avec data/menu/caisses.json, js/core/caisses.js et l'équipement du lot 8d (equipement-etat.js : catalogue et inventaire en mémoire).
// Trois cartes : caisse mystère dessinée en SVG (bois, planches, coins rivetés, couvercle, grand « ? » lumineux et deux petits de la teinte de la
// caisse, rayons ; animations e3-* : flotte, « ? » qui pulse, tremblement bref toutes les 4 s, en décalé d'une carte à l'autre ; en pause hors de
// l'écran et page cachée, coupées sous prefers-reduced-motion), nom, contenu, « Ouvrir ×1 » et « Ouvrir ×10 » avec leur prix, « Voir les chances »
// (dialogue E3-6, js/menu/chances.js). Achat : tirage à graine (crypto.getRandomValues), objets ajoutés à l'inventaire en mémoire, puis
// afficherOuverture(resultat) → écran de résultat (E3-4, E3-5 : js/menu/resultat.js). Le prix est affiché, jamais prélevé ; rien n'est écrit.
import { formatMoney } from '../core/economy.js';
import { TIRAGES_X10, bornes, lireCaisses, prixAchat, tirer, tirer10 } from '../core/caisses.js';
import { ajouterObjets } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { chargerEquipement } from './equipement-etat.js';

const SVG = 'http://www.w3.org/2000/svg';
const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const forme = (tag, attrs, classe) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (classe) n.setAttribute('class', classe);
  return n;
};
const groupe = (classe, ...enfants) => {
  const g = forme('g', {}, classe);
  g.append(...enfants);
  return g;
};
const point = (x, y, classe, texte) => {
  const n = forme('text', { x, y, 'text-anchor': 'middle' }, classe);
  n.textContent = texte;
  return n;
};

// Décalage des animations d'une carte à l'autre (maquette : 0, −1,3 s, −2,6 s).
export const DECALAGES = Object.freeze([0, -1.3, -2.6]);

// Caisse mystère (maquette : 150 × 96, rayons au-dessus jusqu'à −10) ; décorative. Couleurs en jetons (css/menu.css), teinte : --e3-teinte. Vue
// resserrée sur la caisse (y de 4 à 96) : la carte garde la place d'une cible de 44 px pour « Voir les chances » ; les rayons sortent du couvercle
// et s'arrêtent au haut de la vue.
export function caisseSvg() {
  const svg = forme('svg', { viewBox: '0 4 150 92', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMax meet' }, 'e3-caisse');
  svg.append(
    groupe('e3-rayons', forme('path', { d: 'M40 30 L20 -6 L55 -6 Z M75 30 L66 -10 L84 -10 Z M110 30 L95 -6 L130 -6 Z' })),
    groupe('e3-tremble', groupe('e3-flotte',
      forme('rect', { x: 10, y: 34, width: 130, height: 58 }, 'e3-bois'),
      forme('path', { d: 'M10 52 H140 M10 72 H140' }, 'e3-joint'),
      forme('rect', { x: 6, y: 24, width: 138, height: 14 }, 'e3-couvercle'),
      forme('rect', { x: 8, y: 36, width: 134, height: 3 }, 'e3-bande'),
      ...[[18, 44], [132, 44], [18, 84], [132, 84]].map(([cx, cy]) => forme('circle', { cx, cy, r: 2 }, 'e3-rivet')),
      // Grand « ? » lumineux : un halo de la teinte (trait large et transparent, sans filtre) sous le « ? » clair ; il pulse (e3-lueur).
      groupe('e3-lueur', point(75, 82, 'e3-q e3-q-halo', '?'), point(75, 82, 'e3-q', '?')),
      point(34, 66, 'e3-q e3-q-petit', '?'),
      point(116, 66, 'e3-q e3-q-petit', '?'))));
  return svg;
}

// Fond de l'écran (maquette : filets, une fissure, taches de sang sombres), décoratif.
function fond() {
  const svg = forme('svg', { viewBox: '0 0 932 368', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMaxYMin slice' }, 'e3-fond');
  svg.append(
    forme('path', { d: 'M0 120 H932 M0 240 H932 M310 0 V120 M620 120 V240 M150 240 V368 M780 0 V120' }, 'e3-filet'),
    forme('path', { d: 'M700 40 L720 70 L712 96 L730 120' }, 'e3-fissure'),
    ...[[860, 70, 16], [884, 96, 6], [838, 98, 4], [872, 44, 3]].map(([cx, cy, r]) => forme('circle', { cx, cy, r }, 'e3-tache')));
  return svg;
}

// Teinte d'une caisse ou rareté d'un objet : jeton de tokens.css validé par js/core/caisses.js ou equipement.js (jamais une couleur écrite ici).
export function poserJeton(n, variable, jeton) {
  if (typeof jeton === 'string' && /^--(menu|rarete)-[a-z0-9-]+$/.test(jeton)) n.style.setProperty(variable, `var(${jeton})`);
}

const graineAchat = () => crypto.getRandomValues(new Uint32Array(1))[0];

// contexte : { t, bandeau, root (#menu-contenu : section du résultat), rootDialogue (#e8 : dialogue des chances), surVue() (menu.js resynchronise) }.
export async function ecranBoutique({ t, bandeau, root, rootDialogue, surVue = () => {} }) {
  const [eq, donnees] = await Promise.all([chargerEquipement(), json('data/menu/caisses.json')]);
  const { cat } = eq;
  const { caisses } = lireCaisses(donnees, cat);
  const nomRarete = (rid) => cat.raretes.find((r) => r.id === rid)?.nom ?? '';
  const minuscule = (s) => s.toLocaleLowerCase('fr');

  const section = el('section', ['e8-ecran', 'e3', 'e3-boutique'], { id: 'menu-ecran-boutique', 'aria-labelledby': 'menu-titre-boutique', 'data-block': 'E3-1', 'data-anim': 'off' });
  const note = el('p', ['e3-note'], { id: 'menu-boutique-note' });
  note.textContent = t('game.menu.boutique.note');
  const liste = el('ul', ['e3-cartes'], { id: 'menu-boutique-caisses', 'aria-label': t('game.menu.boutique.caisses') });
  const boutons = new Map(); // id de caisse → { un, dix, chances }

  caisses.forEach((c, i) => {
    const li = el('li', ['e3-carte'], { 'data-caisse': c.id, 'aria-labelledby': `menu-caisse-${c.id}-nom` });
    poserJeton(li, '--e3-teinte', c.teinte);
    li.style.setProperty('--e3-decalage', `${DECALAGES[i % DECALAGES.length]}s`);
    const nom = el('h3', ['e3-carte-nom'], { id: `menu-caisse-${c.id}-nom` });
    nom.textContent = c.nom;
    const b = bornes(c, cat);
    const contenu = el('p', ['e3-carte-contenu'], { id: `menu-caisse-${c.id}-contenu` });
    const resume = el('span', ['e3-carte-resume']);
    resume.textContent = b.n === 1
      ? fmt(t('game.menu.boutique.contenu.un'), { rarete: minuscule(nomRarete(b.min)) })
      : fmt(t(b.n === 2 ? 'game.menu.boutique.contenu.ou' : 'game.menu.boutique.contenu.a'), { min: minuscule(nomRarete(b.min)), max: minuscule(nomRarete(b.max)) });
    const raretes = el('span', ['e3-carte-raretes']);
    raretes.textContent = c.chances.map((x) => nomRarete(x.rarete)).join(' · ');
    contenu.append(resume, raretes);
    const actions = el('div', ['e3-carte-actions']);
    const bouton = (quantite, classes, cle) => {
      const prix = formatMoney(prixAchat(c, quantite));
      // Nom accessible = texte visible (« Ouvrir ×1, 150 ») ; la caisse en description (son nom, titre de la carte).
      const n = el('button', ['e3-ouvrir', ...classes], { type: 'button', id: `menu-caisse-${c.id}-${quantite === 1 ? 'un' : 'dix'}`, 'aria-describedby': `menu-caisse-${c.id}-nom` });
      const action = el('span', ['e3-ouvrir-action']);
      action.textContent = t(cle);
      const sep = el('span', ['sr-only']);
      sep.textContent = t('game.menu.boutique.prix.sep');
      const p = el('span', ['e3-ouvrir-prix']);
      p.textContent = prix;
      n.append(action, sep, p);
      n.addEventListener('click', () => acheter(c, quantite, n));
      return n;
    };
    const un = bouton(1, ['e3-rouge'], 'game.menu.boutique.ouvrir1');
    const dix = bouton(TIRAGES_X10, ['e3-planche'], 'game.menu.boutique.ouvrir10');
    actions.append(un, dix);
    const lien = el('button', ['e3-lien'], { type: 'button', id: `menu-caisse-${c.id}-chances`, 'aria-haspopup': 'dialog', 'aria-describedby': `menu-caisse-${c.id}-nom` });
    lien.textContent = t('game.menu.boutique.chances');
    lien.addEventListener('click', () => ouvrirChances(c, lien));
    li.append(el('span', ['e3-carte-bande'], { 'aria-hidden': 'true' }), caisseSvg(), nom, contenu, actions, lien);
    liste.append(li);
    boutons.set(c.id, { un, dix, chances: lien });
  });
  section.append(fond(), bandeau(t('game.menu.boutique.libelle'), t('game.menu.boutique.titre'), 'menu-titre-boutique'), note, liste);

  // --- Achat, ouverture, résultat --------------------------------------------------------------------------------------------------------------
  let vue = 'caisses'; // 'caisses' ou 'resultat'
  let resultat = null; // écran de résultat (js/menu/resultat.js, créé au premier achat)
  let dernier = null; // dernier résultat affiché
  let retourFocus = null;
  let visible = false;
  let actif = false;
  let chancesOuvertes = null; // dialogue des chances : { fermer() }
  let achats = 0;

  // Tirage (graine du navigateur), objets ajoutés à l'inventaire en mémoire (même modèle que le lot 8d), puis l'ouverture. Prix jamais prélevé.
  function acheter(caisse, quantite, depuis) {
    const graine = graineAchat();
    const objets = quantite === TIRAGES_X10 ? tirer10(caisse, cat, graine) : [tirer(caisse, cat, graine)].filter(Boolean);
    if (!objets || objets.length !== quantite) return;
    const { etat, uids } = ajouterObjets(eq.etat(), cat, objets);
    if (uids.length !== quantite) return;
    eq.poser(etat);
    achats += 1;
    if (vue === 'caisses') retourFocus = depuis;
    afficherOuverture({ caisse, quantite, objets, uids, graine });
  }

  // Point d'insertion du lot 8f : seule fonction appelée après un achat. Au lot 8e, elle mène directement à l'écran de résultat ; au lot 8f,
  // l'ouverture animée en 3D (E3-2, E3-3) s'intercalera ici, avant ce même écran.
  async function afficherOuverture(r) {
    if (!resultat) {
      const m = await import('./resultat.js');
      resultat ??= m.creerResultat({
        t, bandeau, cat,
        continuer: () => fermerResultat(true),
        rouvrir: () => dernier && acheter(dernier.caisse, dernier.quantite, null),
      });
      resultat.section.hidden = true;
      root.append(resultat.section);
    }
    dernier = r;
    vue = 'resultat';
    resultat.afficher(r);
    surVue();
    resultat.focus();
  }

  function fermerResultat(focus = false) {
    if (vue !== 'resultat') return false;
    vue = 'caisses';
    surVue();
    if (focus) (retourFocus?.isConnected ? retourFocus : boutons.values().next().value?.un)?.focus();
    retourFocus = null;
    return true;
  }

  async function ouvrirChances(caisse, depuis) {
    if (chancesOuvertes) return;
    const m = await import('./chances.js');
    chancesOuvertes = m.ouvrirChances({
      t, bandeau, cat, caisse, root: rootDialogue,
      fermer: () => {
        chancesOuvertes?.element.remove();
        chancesOuvertes = null;
        if (depuis.isConnected) depuis.focus();
      },
    });
  }

  function appliquer() {
    section.hidden = !visible || vue !== 'caisses';
    if (resultat) resultat.section.hidden = !visible || vue !== 'resultat';
    section.dataset.anim = actif && vue === 'caisses' ? 'on' : 'off';
    resultat?.animer(actif && vue === 'resultat');
  }

  return {
    section,
    // menu.js : onglet Boutique affiché (sans écran plein ni sous-menu) ; la vue (caisses ou résultat) est tenue ici.
    synchroniser(v) {
      visible = v;
      if (!v) chancesOuvertes?.fermer();
      appliquer();
    },
    // Animations : en cours seulement quand l'onglet est affiché et la page visible.
    animer(a) {
      actif = a;
      appliquer();
    },
    // Un onglet touché : retour aux caisses (comme les sous-menus du Personnage).
    fermerResultat: () => fermerResultat(false),
    // Échap : dialogue des chances, puis écran de résultat (true : traité).
    echap() {
      if (chancesOuvertes) {
        chancesOuvertes.fermer();
        return true;
      }
      return fermerResultat(true);
    },
    etat: () => ({
      vue,
      caisses: caisses.map((c) => ({ id: c.id, nom: c.nom, prix: c.prix, prix10: c.prix10, chances: c.chances.map((x) => ({ ...x })) })),
      chances: chancesOuvertes ? chancesOuvertes.caisse : null,
      achats,
      dernier: dernier ? { caisse: dernier.caisse.id, quantite: dernier.quantite, graine: dernier.graine, objets: dernier.objets.map((o) => ({ ...o })), uids: [...dernier.uids] } : null,
      resultat: resultat?.etat() ?? null,
    }),
  };
}
