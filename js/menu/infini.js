// Lot 8b : onglet Infini (E8-4) du menu principal, d'après la maquette Docs/maquettes-v0.8/Infini.html (Docs/ref/menu-principal.md).
// Chargé à la demande (premier affichage de l'onglet), avec le classement d'exemple (data/menu/classement.json).
// Décor décoratif (SVG, aria-hidden) : ciel rouge sombre, grande lune rouge (halo qui pulse lentement), horde qui avance sur l'horizon. Par-dessus,
// en texte : bandeau « Vagues sans fin / Mode infini », « Choisis ta carte », rangée de cartes qui défile (doigt, molette, flèche ; accroche sur
// chaque carte), carte choisie (bordure rouge, « Choisie », en mémoire), cartes verrouillées non sélectionnables (aria-disabled, raison lue),
// panneau « Classement » (exemple, arrive avec le compte ; ligne « Toi »), bouton « Jouer » : mode infini sur la carte choisie.
// Lot 8h : record du mode infini par carte (progression v2 : meilleure manche démarrée), sur sa carte et sur la ligne « Toi » ; « Record : — » sinon. Couleurs : classes de css/menu.css ; animations « e8-infini-* ».
// Lot 9a (décision du propriétaire) : une carte n'est jouable en Infini que si son monde a été TERMINÉ en entier en histoire (progression v2, champ
// « mondes » ; js/core/menu-etat.js, infiniJouable) ; sinon cadenas et ruban, « Termine le monde N pour débloquer l'Infini », et « Jouer » désactivé
// (aria-disabled) avec sa raison dans son nom accessible. L'onglet s'ouvre toujours ; rien n'est écrit. Un monde marqué terminé ailleurs (outil de
// débogage, autre onglet) débloque la carte aussitôt (abonnement à la progression).
import { choisirCarte, creerCarrousel, infiniJouable, lireClassement } from '../core/menu-etat.js';
import { chargerProgression } from './progression-etat.js';
import { fmt } from '../game/texts.js';
import { ajusterBloc, ajusterTextes } from './menu.js';

const SVG = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, classe = '') {
  const n = document.createElementNS(SVG, tag);
  if (classe) n.setAttribute('class', classe);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

const texte = (tag, classes, contenu, attrs = {}) => Object.assign(el(tag, classes, attrs), { textContent: contenu });

function degrade(type, id, attrs, stops) {
  const g = svgEl(type, { id, ...attrs });
  for (const [offset, classe] of stops) g.append(svgEl('stop', { offset }, classe));
  return g;
}

function silhouette(x, y, s) {
  const g = svgEl('g', { transform: `translate(${x} ${y}) scale(${s})` });
  g.append(
    svgEl('circle', { cx: 0, cy: -30, r: 6 }, 'e8-infini-z'),
    svgEl('path', { d: 'M-7 -24 H7 L8 -3 H3 L2 -11 L-2 -3 H-8Z' }, 'e8-infini-z'),
    svgEl('path', { d: 'M5 -21 L20 -23 L20 -19 L5 -17Z' }, 'e8-infini-z'),
  );
  return g;
}

// Décor (vue 932 × 318 : partie visible de la maquette), ancré en bas, jamais coupé.
export function sceneInfini() {
  const svg = svgEl('svg', { viewBox: '0 50 932 318', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true', focusable: 'false' }, 'e8-infini-svg');
  const defs = svgEl('defs');
  defs.append(
    degrade('linearGradient', 'e8-infini-ciel', { x1: 0, y1: 0, x2: 0, y2: 1 }, [['0', 'e8-infini-ciel-haut'], ['1', 'e8-infini-ciel-bas']]),
    degrade('radialGradient', 'e8-infini-halo', { cx: 0.5, cy: 0.5, r: 0.5 }, [['0', 'e8-infini-halo-centre'], ['1', 'e8-infini-halo-bord']]),
  );
  const horde = svgEl('g', {}, 'e8-infini-horde');
  for (const [x, y, s] of [[640, 334, 1], [662, 336, 0.9], [690, 334, 1.1], [716, 337, 0.8], [744, 334, 1], [770, 336, 0.9], [800, 334, 1.05], [828, 337, 0.85], [856, 334, 1], [884, 336, 0.9], [910, 334, 1]]) horde.append(silhouette(x, y, s));
  svg.append(
    defs,
    svgEl('rect', { width: 932, height: 368, fill: 'url(#e8-infini-ciel)' }),
    svgEl('circle', { cx: 810, cy: 300, r: 120, fill: 'url(#e8-infini-halo)' }, 'e8-infini-halo'),
    svgEl('circle', { cx: 810, cy: 300, r: 36 }, 'e8-infini-lune'),
    svgEl('rect', { x: 0, y: 330, width: 932, height: 38 }, 'e8-infini-sol'),
    horde,
  );
  return svg;
}

// Miniature d'une carte : le bâtiment de nuit (monde jouable) ; fond sombre, ruban jaune et noir en travers et cadenas (monde verrouillé).
function miniature(jouable) {
  if (!jouable) {
    const box = el('span', ['e8-infini-mini', 'e8-infini-mini-verrou'], { 'aria-hidden': 'true' });
    const cadenas = svgEl('svg', { viewBox: '0 0 24 24', focusable: 'false' }, 'e8-infini-cadenas');
    cadenas.append(svgEl('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }), svgEl('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }));
    box.append(el('span', ['e8-infini-mini-ruban']), cadenas);
    return box;
  }
  const svg = svgEl('svg', { viewBox: '0 0 190 84', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' }, 'e8-infini-mini');
  svg.append(
    svgEl('rect', { width: 190, height: 84 }, 'e8-infini-mini-ciel'),
    svgEl('circle', { cx: 160, cy: 20, r: 9 }, 'e8-jouer-lune'),
    svgEl('rect', { x: 34, y: 26, width: 64, height: 50 }, 'e8-jouer-aile'),
    svgEl('rect', { x: 98, y: 44, width: 62, height: 32 }, 'e8-jouer-salle'),
    svgEl('rect', { x: 44, y: 34, width: 10, height: 10 }, 'e8-infini-mini-lampe e8-infini-mini-vive'),
    svgEl('rect', { x: 62, y: 34, width: 10, height: 10 }, 'e8-jouer-fenetre-noire'),
    svgEl('rect', { x: 62, y: 56, width: 10, height: 10 }, 'e8-infini-mini-lampe'),
    svgEl('rect', { x: 112, y: 52, width: 10, height: 10 }, 'e8-jouer-fenetre-noire'),
    svgEl('rect', { x: 134, y: 52, width: 10, height: 10 }, 'e8-infini-mini-lampe'),
    svgEl('rect', { x: 0, y: 76, width: 190, height: 8 }, 'e8-jouer-sol'),
  );
  return svg;
}

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// Section de l'onglet : { section, scene, bouton, etat() }. jouer(option) : lance la partie (menu.js : lancer).
// Retour du propriétaire (latence au premier toucher sur iPhone) : données demandées dès que le doigt se pose sur l'onglet (menu.js, precharger).
let donnees = null;
export const precharger = () => (donnees ??= json('data/menu/classement.json'));

// records : { [monde]: manche } (lot 8h, progression v2) ; termines : mondes terminés en histoire (lot 9a, progression v2).
export async function ecranInfini({ t, mondes, bandeau, jouer, records = {}, termines = [] }) {
  const recordDe = (id) => (Number.isInteger(records?.[id]) && records[id] > 0 ? records[id] : null);
  const classement = lireClassement(await precharger());
  let finis = Array.isArray(termines) ? [...termines] : [];
  // Mondes vus par l'Infini : jouable seulement si terminé (lot 9a) ; le carrousel ne choisit que ceux-là.
  const etatDe = (m) => infiniJouable(m, finis);
  const vus = () => mondes.map((m) => ({ ...m, jouable: etatDe(m).jouable }));
  let carrousel = creerCarrousel(mondes);
  const section = el('section', ['e8-ecran', 'e8-infini'], { id: 'menu-ecran-infini', 'aria-labelledby': 'menu-titre-infini' });
  const scene = el('div', ['e8-infini-scene'], { 'aria-hidden': 'true', 'data-anim': 'off', id: 'menu-infini-scene' });
  scene.append(sceneInfini());

  const choix = el('p', ['e8-infini-choix'], { id: 'menu-infini-choix' });
  const compte = texte('span', ['e8-infini-choix-compte'], '');
  choix.append(texte('span', ['e8-infini-choix-titre'], t('game.menu.infini.choisis')), compte);

  // Rangée de cartes : liste qui défile sur le côté (accroche CSS sur chaque carte), la carte suivante dépasse du bord.
  const zone = el('div', ['e8-infini-zone']);
  const rangee = el('ul', ['e8-infini-rangee'], { id: 'menu-infini-cartes', 'aria-label': t('game.menu.infini.cartes') });
  const cartes = new Map();
  for (const m of mondes) {
    const item = el('li', ['e8-infini-item']);
    const carte = el('button', ['e8-infini-carte'], { type: 'button', id: `menu-carte-${m.id}`, 'data-monde': m.id });
    const libelle = el('span', ['e8-infini-carte-libelle']);
    const nom = texte('span', ['e8-infini-carte-nom'], m.nom || fmt(t('game.menu.monde'), { n: m.numero }));
    const detail = texte('span', ['e8-infini-carte-detail'], '');
    const e0 = etatDe(m);
    const mini = miniature(e0.jouable); // lot 9a : remplacée par synchroniser() si l'état de l'Infini change
    carte.append(mini, libelle, nom, detail);
    carte.addEventListener('click', () => {
      if (!etatDe(m).jouable) return; // verrouillée : rien (la raison est dans son texte)
      carrousel = choisirCarte(carrousel, vus(), m.id);
      synchroniser();
    });
    ajusterTextes(carte, [libelle, nom, detail]); // retour du propriétaire : cartes de taille fixe, textes réduits s'ils sont trop longs
    cartes.set(m.id, { carte, libelle, detail, mini, monde: m, jouable: e0.jouable });
    item.append(carte);
    rangee.append(item);
  }
  // Molette verticale : défile la rangée sur le côté (le doigt et le pavé tactile le font déjà).
  rangee.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = rangee.scrollWidth - rangee.clientWidth;
    if ((e.deltaY < 0 && rangee.scrollLeft <= 0) || (e.deltaY > 0 && rangee.scrollLeft >= max - 1)) return;
    e.preventDefault();
    rangee.scrollBy({ left: e.deltaY });
  }, { passive: false });
  const suivantes = el('button', ['e8-infini-suivantes'], { type: 'button', id: 'menu-cartes-suivantes', 'aria-label': t('game.menu.infini.suivantes'), 'aria-controls': 'menu-infini-cartes' });
  const fleche = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, 'e8-infini-fleche');
  fleche.append(svgEl('path', { d: 'M9 6l6 6-6 6' }));
  suivantes.append(fleche);
  suivantes.addEventListener('click', () => {
    const pas = rangee.querySelector('.e8-infini-item')?.getBoundingClientRect().width ?? 0;
    const fin = rangee.scrollLeft >= rangee.scrollWidth - rangee.clientWidth - 1;
    const doux = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (fin) rangee.scrollTo({ left: 0, behavior: doux }); // au bout : retour à la première carte
    else rangee.scrollBy({ left: pas, behavior: doux });
  });
  zone.append(rangee, suivantes);

  const bouton = el('button', ['menu-peint', 'e8-infini-bouton'], { type: 'button', id: 'menu-infini-jouer' });
  const icone = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, 'e8-jouer-icone-bouton');
  icone.append(svgEl('path', { d: 'M7 4v16l13-8z' }));
  // Lot 9a : raison du verrou dans le nom accessible (« Jouer · verrouillé : Termine le monde 1 pour débloquer l'Infini ») ; désactivé : rien.
  const raisonJouer = el('span', ['sr-only'], { id: 'menu-infini-jouer-raison' });
  bouton.append(icone, texte('span', [], t('game.menu.infini.jouer')), raisonJouer);
  bouton.addEventListener('click', () => {
    if (bouton.getAttribute('aria-disabled') === 'true') return;
    jouer({ mode: 'infini', monde: carrousel.choisi });
  });

  // Classement d'exemple (aucun joueur réel) : 5 lignes, puis « Toi » (rang : pas encore de compte ; record de la carte choisie, lot 8h).
  const panneau = el('section', ['e8-infini-classement'], { id: 'menu-classement', 'aria-labelledby': 'menu-classement-titre' });
  const sousTitre = el('p', ['e8-infini-classement-carte'], { id: 'menu-classement-carte' });
  const exemple = texte('span', ['e8-infini-exemple'], t('game.menu.infini.exemple'));
  sousTitre.append(document.createTextNode(''), exemple);
  const lignes = el('ol', ['e8-infini-lignes'], { id: 'menu-classement-lignes' });
  for (const l of classement) {
    const li = el('li', ['e8-infini-ligne']);
    li.append(texte('span', ['e8-infini-rang'], String(l.rang)), texte('span', ['e8-infini-pseudo'], l.pseudo), texte('span', ['e8-infini-manche'], fmt(t('game.menu.infini.manche'), { n: l.manche })));
    lignes.append(li);
  }
  const toi = el('p', ['e8-infini-toi'], { id: 'menu-classement-toi' });
  toi.append(
    texte('span', ['e8-infini-toi-nom'], t('game.menu.infini.toi')),
    texte('span', ['e8-infini-toi-rang'], fmt(t('game.menu.infini.rang'), { n: t('game.menu.infini.aucun') })),
    texte('span', ['e8-infini-toi-manche'], '', { id: 'menu-classement-toi-manche' }),
  );
  panneau.append(texte('h3', ['e8-infini-classement-titre'], t('game.menu.infini.classement'), { id: 'menu-classement-titre' }), sousTitre, lignes, toi);

  // Lot 9a : texte du verrou d'une carte (« Termine le monde N pour débloquer l'Infini » ; monde à venir : « Termine le monde N−1 », comme avant).
  const raisonDe = (m, e) => (e.raison === 'termine' ? fmt(t('game.menu.infini.debloquer'), { n: m.numero }) : fmt(t('game.menu.infini.condition'), { n: m.numero - 1 }));
  function synchroniser() {
    for (const [id, c] of cartes) {
      const { carte, libelle, detail, monde } = c;
      const e = etatDe(monde);
      if (e.jouable !== c.jouable) {
        const nouvelle = miniature(e.jouable);
        c.mini.replaceWith(nouvelle);
        c.mini = nouvelle;
        c.jouable = e.jouable;
      }
      if (e.jouable) carte.removeAttribute('aria-disabled');
      else carte.setAttribute('aria-disabled', 'true');
      carte.classList.toggle('e8-infini-carte-verrouillee', !e.jouable);
      const choisie = e.jouable && id === carrousel.choisi;
      carte.classList.toggle('e8-infini-carte-choisie', choisie);
      if (e.jouable) carte.setAttribute('aria-pressed', String(choisie));
      else carte.removeAttribute('aria-pressed');
      libelle.textContent = fmt(t(choisie ? 'game.menu.infini.choisie' : e.jouable ? 'game.menu.monde' : 'game.menu.infini.verrouillee'), { n: monde.numero });
      detail.textContent = e.jouable ? (recordDe(monde.id) ? fmt(t('game.menu.infini.record'), { n: recordDe(monde.id) }) : t('game.menu.infini.recordAucun')) : raisonDe(monde, e);
      ajusterBloc(carte);
    }
    compte.textContent = ` ${fmt(t('game.menu.infini.compte'), { n: mondes.filter((x) => etatDe(x).jouable).length, total: mondes.length })}`;
    const choisi = mondes.find((x) => x.id === carrousel.choisi);
    const ec = choisi ? etatDe(choisi) : { jouable: false, raison: 'avenir' };
    if (ec.jouable) bouton.removeAttribute('aria-disabled');
    else bouton.setAttribute('aria-disabled', 'true');
    raisonJouer.textContent = ec.jouable || !choisi ? '' : fmt(t('game.menu.infini.jouer.raison'), { raison: raisonDe(choisi, ec) });
    const m = cartes.get(carrousel.choisi)?.monde;
    sousTitre.firstChild.textContent = `${m?.nom || fmt(t('game.menu.monde'), { n: m?.numero ?? 1 })} · `;
    toi.lastChild.textContent = fmt(t('game.menu.infini.manche'), { n: recordDe(carrousel.choisi) ?? t('game.menu.infini.aucun') });
  }
  synchroniser();
  // Lot 9a : un monde terminé ailleurs (outil de débogage, autre onglet) débloque sa carte aussitôt ; lecture seule.
  chargerProgression().then((prog) => prog.abonner(() => {
    const lu = prog.lire();
    finis = Array.isArray(lu?.save?.mondes) ? [...lu.save.mondes] : [];
    synchroniser();
  })).catch(() => {});

  section.append(scene, bandeau(t('game.menu.infini.libelle'), t('game.menu.infini.titre'), 'menu-titre-infini'), choix, zone, bouton, panneau);
  return { section, scene, bouton, etat: () => ({ choisi: carrousel.choisi, record: recordDe(carrousel.choisi), jouable: etatDe(mondes.find((x) => x.id === carrousel.choisi) ?? null).jouable, termines: [...finis] }) };
}
