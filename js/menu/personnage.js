// Lot 8d : écran Personnage (E9-1, maquette Docs/maquettes-v0.8/Personnage.html ; Docs/ref/menu-principal.md), chargé à la demande au premier
// affichage de l'onglet Personnage. Personnage animé au centre (silhouette SVG de sa teinte, sous un projecteur qui grésille ; animations e9-*, en pause
// hors de l'écran ou page cachée, coupées sous prefers-reduced-motion) : le toucher ouvre Personnages ; six emplacements (arme, tenue, gants à gauche ;
// bottes et deux accessoires à droite) : en toucher un ouvre l'Inventaire filtré sur son type ; encart de capacité (ouvre Personnages) ; statistiques
// effectives (js/core/equipement.js : sauvegarde + objets portés + capacité) ; boutons Inventaire et Fusion. Sous-menus (écrans pleins, en-tête gardé,
// onglets masqués) : js/menu/inventaire.js, fusion.js, personnages.js, chargés à leur première ouverture. État en mémoire (equipement-etat.js) :
// rien n'est écrit dans le stockage jusqu'au lot 8h.
import { EMPLACEMENTS, definition, emplacementDe, objetDe, personnageDe, typeEmplacement } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { chargerEquipement } from './equipement-etat.js';

const SVG = 'http://www.w3.org/2000/svg';

// Icônes 24 × 24 au trait (maquettes), décoratives.
const ICONES = {
  arme: 'M3 9h14l2 2v2h-8l-1 4H7l1-4H3z',
  tenue: 'M8 3l4 3 4-3 3 3v15H5V6z',
  gants: 'M7 21v-9l1-7h2v6l1-7h2v7l1-6h2v7l1-3h2v8c0 3-2 4-5 4z',
  bottes: 'M7 3h5v10l7 3v5H5V3z',
  accessoire: 'M12 3l3 4-3 3-3-3zM12 10a5 5 0 1 0 0.01 0z',
  inventaire: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  fusion: 'M3 4h5v5H3zM3 15h5v5H3zM15 9h6v6h-6zM8 6.5l7 4.5M8 17.5l7-4.5',
  chevron: 'M15 6l-6 6 6 6',
  suivant: 'M9 6l6 6-6 6',
  fleche: 'M4 12h13M12 6l6 6-6 6',
  cadenas: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
  personne: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
};
export function icone24(nom, classe = 'e9-icone') {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', class: classe, 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', ICONES[nom]);
  svg.append(p);
  return svg;
}

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

// Silhouette du personnage (maquette, 180 × 236) : jambes, bottes, buste de sa teinte (--e9-teinte, jeton --menu-perso-*), bras, arme, tête, bandana ;
// animée seulement dans un conteneur qui porte la classe e9-anime (respiration, tête, bras armé qui vise, bandana, ombre).
export function silhouette(perso, { classe = '', complete = true } = {}) {
  const svg = forme('svg', { viewBox: '0 0 180 236', 'aria-hidden': 'true', focusable: 'false' }, `e9-silhouette ${classe}`.trim());
  poserTeinte(svg, perso);
  const corps = groupe('e9-sil-respire',
    forme('path', { d: 'M56 78 Q90 64 124 78 L130 154 L50 154Z' }, 'e9-sil-buste'),
    forme('path', { d: 'M68 80 L80 152 M112 80 L100 152' }, 'e9-sil-sangle'),
    forme('rect', { x: 78, y: 112, width: 24, height: 16 }, 'e9-sil-poche'),
    forme('path', { d: 'M56 82 L40 132 L52 136 L66 98Z' }, 'e9-sil-bras'),
    forme('circle', { cx: 64, cy: 140, r: 3 }, 'e9-sil-sang'),
    groupe('e9-sil-viser',
      forme('path', { d: 'M124 82 L152 112 L144 120 L118 100Z' }, 'e9-sil-bras'),
      forme('rect', { x: 146, y: 104, width: 28, height: 8, rx: 2 }, 'e9-sil-arme'),
      forme('rect', { x: 146, y: 110, width: 7, height: 12, rx: 1 }, 'e9-sil-arme')),
    groupe('e9-sil-tete',
      forme('circle', { cx: 90, cy: 54, r: 18 }, 'e9-sil-peau'),
      forme('path', { d: 'M70 50 Q90 26 110 50 L110 43 Q90 22 70 43Z' }, 'e9-sil-cheveux'),
      forme('rect', { x: 72, y: 62, width: 36, height: 8 }, 'e9-sil-bandana'),
      forme('path', { d: 'M106 63 L126 66 L110 72Z' }, 'e9-sil-bandana e9-sil-pan')));
  if (complete) svg.append(forme('ellipse', { cx: 90, cy: 228, rx: 64, ry: 8 }, 'e9-sil-ombre'));
  svg.append(
    forme('path', { d: 'M70 150 L64 224 L80 224 L88 162 L96 224 L112 224 L106 150Z' }, 'e9-sil-jambes'),
    forme('rect', { x: 60, y: 220, width: 22, height: 8, rx: 2 }, 'e9-sil-bottes'),
    forme('rect', { x: 94, y: 220, width: 22, height: 8, rx: 2 }, 'e9-sil-bottes'),
    corps);
  return svg;
}
// Petite silhouette de la grille des personnages (maquette Personnages.html, 40 × 54) : tête et buste de la teinte.
export function buste(perso) {
  const svg = forme('svg', { viewBox: '0 0 40 54', 'aria-hidden': 'true', focusable: 'false' }, 'e9-buste');
  poserTeinte(svg, perso);
  svg.append(forme('circle', { cx: 20, cy: 10, r: 8 }), forme('path', { d: 'M6 54 C6 30 12 20 20 20 C28 20 34 30 34 54Z' }));
  return svg;
}
// Teinte : jeton de tokens.css validé par js/core/equipement.js (--menu-perso-*) ; verrouillé : silhouette sombre (--menu-perso-inconnu).
export function poserTeinte(n, perso) {
  const jeton = perso?.debloque && /^--menu-perso-[a-z0-9-]+$/.test(perso.teinte) ? perso.teinte : '--menu-perso-inconnu';
  n.style.setProperty('--e9-teinte', `var(${jeton})`);
}

// Textes partagés par les sous-menus.
export const TYPE_TEXTES = { arme: 'game.menu.perso.type.arme', tenue: 'game.menu.perso.type.tenue', gants: 'game.menu.perso.type.gants', bottes: 'game.menu.perso.type.bottes', accessoire: 'game.menu.perso.type.accessoire' };
export const STAT_TEXTES = {
  degats: 'game.menu.perso.stat.degats', portee: 'game.menu.perso.stat.portee', precision: 'game.menu.perso.stat.precision', cadence: 'game.menu.perso.stat.cadence',
  vitesse: 'game.menu.perso.stat.vitesse', vie: 'game.menu.perso.stat.vie', regen: 'game.menu.perso.stat.regen', chutes: 'game.menu.perso.stat.chutes', reparation: 'game.menu.perso.stat.reparation',
};
// Statistiques affichées sous la colonne de gauche (et dans Personnages) : les quatre de la maquette, puis portée et précision (trois rangées).
export const STATS_AFFICHEES = ['degats', 'vie', 'cadence', 'vitesse', 'portee', 'precision'];
export const nombre = (n) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '');
export const nomRarete = (cat, rid) => cat.raretes.find((r) => r.id === rid)?.nom ?? '';
export const nomObjet = (cat, o) => cat.objets.get(o?.id)?.nom ?? '';
export const typeObjet = (cat, o) => cat.objets.get(o?.id)?.type ?? null;
// Effet d'un objet ou d'une capacité en texte : « Vie +1,4 · Régénération +1 » (valeurs non arrondies : la règle d'arrondi s'applique au total).
export function texteEffet(t, bonus) {
  return Object.entries(bonus).map(([k, v]) => `${t(STAT_TEXTES[k])} +${nombre(v)}`).join(' · ');
}

export function listeStats(t, niveaux, { id, classe = 'e9-stats' } = {}) {
  const ul = el('ul', [classe], { 'aria-label': t('game.menu.perso.stats'), ...(id ? { id } : {}) });
  for (const k of STATS_AFFICHEES) {
    const li = el('li', ['e9-stat'], { 'data-stat': k });
    li.textContent = fmt(t('game.menu.perso.stat.valeur'), { nom: t(STAT_TEXTES[k]), n: niveaux[k] ?? 0 });
    ul.append(li);
  }
  return ul;
}

// En-tête d'un sous-menu (écran plein) : bandeau « Équipement » / titre, puis « ‹ Équipement » (planche, comme « ‹ Menu » des Options du lot 8c).
export function teteSous(t, bandeau, titre, id, retour) {
  const tete = el('div', ['e5-tete', 'e9-tete']);
  const b = el('button', ['menu-planche', 'e5-retour'], { type: 'button', id: `${id}-retour`, 'aria-label': t('game.menu.perso.retour.aria') });
  b.append(icone24('chevron', 'e5-chevron'), Object.assign(el('span'), { textContent: t('game.menu.perso.retour') }));
  b.addEventListener('click', () => retour());
  tete.append(bandeau(t('game.menu.perso.titre'), titre, `${id}-titre`), b);
  return { tete, bouton: b };
}

// Filigrane d'un sous-menu (retour du propriétaire : les filets du fond ne disaient pas où l'on est) : grand pictogramme de l'écran (sac, fusion,
// personnage), très atténué, qui respire lentement (e9-filigrane) derrière le contenu ; décoratif.
export function filigrane(nom) {
  const n = el('span', ['e9-filigrane'], { 'aria-hidden': 'true' });
  n.append(icone24(nom, 'e9-filigrane-icone'));
  return n;
}

// Zone d'annonce (aria-live) d'un sous-menu : résultat d'une action (équipé, amélioré, fusionné, choisi).
export function annonce(id) {
  const n = el('p', ['sr-only'], { id, 'aria-live': 'polite', role: 'status' });
  return { element: n, dire: (texte) => { n.textContent = ''; n.textContent = texte; } };
}

// Bouton désactivé lisible (aria-disabled, raison décrite par un élément) : il reste atteignable au clavier, son action est ignorée.
export function poserActif(bouton, actif, raisonId = null) {
  bouton.setAttribute('aria-disabled', String(!actif));
  if (!actif && raisonId) bouton.setAttribute('aria-describedby', raisonId);
  else bouton.removeAttribute('aria-describedby');
}
export const estActif = (bouton) => bouton.getAttribute('aria-disabled') !== 'true';

const SOUS = { inventaire: () => import('./inventaire.js'), fusion: () => import('./fusion.js'), personnages: () => import('./personnages.js') };
export const SOUS_ECRANS = Object.freeze(Object.keys(SOUS));

// poserEcran(nom | null) : menu.js place l'écran plein (etatMenu.ecran) et resynchronise ; il appelle ensuite synchroniser(ecran) et animer(actif).
export async function ecranPersonnage({ t, bandeau, niveaux = null, statsCfg = null, root, poserEcran }) {
  const eq = await chargerEquipement();
  const { cat } = eq;
  const stats = (persoId) => eq.statistiques(niveaux, statsCfg, persoId);

  const section = el('section', ['e8-ecran', 'e9', 'e9-perso'], { id: 'menu-ecran-personnage', 'aria-labelledby': 'menu-titre-personnage', 'data-block': 'E9-1' });
  // Décor : sol, cône du projecteur (grésillement), halo au sol, lampe (maquette : 932 × 368, centré sur le personnage).
  const scene = forme('svg', { viewBox: '0 44 932 324', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMin meet' }, 'e9-decor');
  const defs = forme('defs', {});
  const halo = forme('radialGradient', { id: 'e9-halo', cx: 0.5, cy: 0.5, r: 0.5 });
  halo.append(forme('stop', { offset: 0 }, 'e9-halo-centre'), forme('stop', { offset: 1 }, 'e9-halo-bord'));
  defs.append(halo);
  scene.append(defs,
    forme('path', { d: 'M436 50 L496 50 L600 300 L332 300Z' }, 'e9-cone'),
    forme('ellipse', { cx: 466, cy: 296, rx: 150, ry: 26, fill: 'url(#e9-halo)' }),
    forme('rect', { x: 452, y: 44, width: 28, height: 10 }, 'e9-lampe'));
  const sol = el('div', ['e9-sol'], { 'aria-hidden': 'true' }); // sol sombre, centré verticalement avec le personnage (retour du propriétaire)
  const decor = el('div', ['e9-scene'], { 'data-anim': 'off' });
  decor.append(scene);

  const essai = el('p', ['e9-essai'], { id: 'menu-perso-essai' });
  essai.textContent = t('game.menu.perso.essai');

  // Personnage : un bouton (ouvre Personnages) ; étiquette « Touche-le pour changer » au-dessus.
  const btPerso = el('button', ['e9-perso-bouton'], { type: 'button', id: 'menu-perso-silhouette' });
  const etiquette = el('span', ['e9-etiquette']);
  etiquette.textContent = t('game.menu.perso.toucher');
  const etiquetteSuite = el('span', ['sr-only']);
  etiquetteSuite.textContent = t('game.menu.perso.toucher.suite');
  const cadre = el('span', ['e9-perso-cadre']);
  btPerso.append(cadre, etiquette, etiquetteSuite);

  // Emplacements : deux colonnes de trois (gauche : arme, tenue, gants ; droite : bottes, accessoires).
  const boutons = new Map();
  const colonne = (ids, cle, id) => {
    const col = el('div', ['e9-colonne'], { id });
    const ul = el('ul', ['e9-emplacements'], { 'aria-label': t(cle) });
    for (const e of ids) {
      const li = el('li');
      const b = el('button', ['e9-emplacement'], { type: 'button', id: `menu-perso-${e}`, 'data-emplacement': e });
      const fond = el('span', ['e9-emplacement-icone']);
      fond.append(icone24(typeEmplacement(e)));
      const textes = el('span', ['e9-emplacement-textes']);
      const ligne = el('span', ['e9-emplacement-ligne']);
      const nom = el('span', ['e9-emplacement-nom']);
      const suite = el('span', ['sr-only']);
      suite.textContent = t('game.menu.perso.emplacement.suite');
      textes.append(ligne, nom, suite);
      b.append(fond, textes);
      b.addEventListener('click', () => ouvrir('inventaire', { filtre: typeEmplacement(e), emplacement: e, depuis: b }));
      li.append(b);
      ul.append(li);
      boutons.set(e, { b, ligne, nom });
    }
    col.append(ul);
    return col;
  };
  const gauche = colonne(EMPLACEMENTS.slice(0, 3), 'game.menu.perso.gauche', 'menu-perso-gauche');
  const droite = colonne(EMPLACEMENTS.slice(3), 'game.menu.perso.droite', 'menu-perso-droite');
  const statsBoite = el('div', ['e9-stats-boite'], { id: 'menu-perso-stats' });
  gauche.append(statsBoite);
  const actions = el('div', ['e9-actions']);
  const btInventaire = el('button', ['menu-planche', 'e9-action'], { type: 'button', id: 'menu-perso-inventaire' });
  btInventaire.append(icone24('inventaire'), Object.assign(el('span'), { textContent: t('game.menu.perso.inventaire') }));
  const btFusion = el('button', ['menu-planche', 'e9-action', 'e9-violet'], { type: 'button', id: 'menu-perso-fusion' });
  btFusion.append(icone24('fusion'), Object.assign(el('span'), { textContent: t('game.menu.perso.fusion') }));
  actions.append(btInventaire, btFusion);
  droite.append(actions);

  // Encart de capacité (bordure dorée) : nom et niveau du personnage, « Capacité : <nom> », une ligne d'effet ; ouvre Personnages.
  const capacite = el('button', ['e9-capacite'], { type: 'button', id: 'menu-perso-capacite' });
  const capTete = el('span', ['e9-capacite-tete']);
  const capNom = el('span', ['e9-capacite-nom']);
  const capNiveau = el('span', ['e9-capacite-niveau']);
  capTete.append(capNom, capNiveau);
  const capTitre = el('span', ['e9-capacite-titre']);
  const capEffet = el('span', ['e9-capacite-effet']);
  const capSuite = el('span', ['sr-only']);
  capSuite.textContent = t('game.menu.perso.capacite.suite');
  capacite.append(capTete, capTitre, capEffet, capSuite);

  section.append(sol, decor, bandeau(t('game.menu.perso.libelle'), t('game.menu.perso.titre'), 'menu-titre-personnage'), essai, btPerso, gauche, droite, capacite);

  function rendre() {
    const etat = eq.etat();
    for (const [e, { b, ligne, nom }] of boutons) {
      const o = objetDe(etat, etat.porte[e]);
      const type = t(TYPE_TEXTES[typeEmplacement(e)]);
      if (o) {
        b.dataset.rarete = o.rarete;
        ligne.textContent = fmt(t('game.menu.perso.ligne'), { type, rarete: nomRarete(cat, o.rarete) });
        nom.textContent = fmt(t('game.menu.perso.objet.niveau'), { nom: nomObjet(cat, o), n: o.niveau });
      } else {
        delete b.dataset.rarete;
        ligne.textContent = fmt(t('game.menu.perso.ligne'), { type, rarete: t('game.menu.perso.vide') });
        nom.textContent = t('game.menu.perso.aucun');
      }
      b.classList.toggle('is-vide', !o);
    }
    const p = personnageDe(cat, etat.choisi);
    cadre.replaceChildren(silhouette(p, { classe: 'e9-grande' }));
    capNom.textContent = p?.nom ?? '';
    capNiveau.textContent = fmt(t('game.menu.perso.niv'), { n: etat.persos[p?.id] ?? 1 });
    capTitre.textContent = fmt(t('game.menu.perso.capacite'), { nom: p?.capacite.nom ?? '' });
    capEffet.textContent = p?.capacite.description ?? '';
    statsBoite.replaceChildren(listeStats(t, stats().niveaux, { id: 'menu-perso-stats-liste' }));
  }
  rendre();
  eq.abonner(rendre);

  // --- Sous-menus (écrans pleins) ----------------------------------------------------------------------------------------------------------
  const sous = new Map(); // nom → { section, ouvrir(opts), scene? }
  let ouvert = null;
  let retourFocus = null;
  const contexte = { t, bandeau, eq, cat, stats, niveaux, statsCfg, retour: () => fermer(), ouvrir: (nom, opts) => ouvrir(nom, opts) };

  async function ouvrir(nom, opts = {}) {
    if (!SOUS[nom]) return;
    if (!ouvert) retourFocus = opts.depuis ?? document.activeElement;
    let s = sous.get(nom);
    if (!s) {
      const m = await SOUS[nom]();
      s = m.creer(contexte);
      sous.set(nom, s);
      s.section.hidden = true;
      root.append(s.section);
    }
    ouvert = nom;
    s.ouvrir(opts);
    poserEcran(nom);
    s.focus?.();
  }
  function fermer() {
    if (!ouvert) return;
    ouvert = null;
    poserEcran(null);
    (retourFocus?.isConnected ? retourFocus : btPerso).focus();
    retourFocus = null;
  }

  btPerso.addEventListener('click', () => ouvrir('personnages', { depuis: btPerso }));
  capacite.addEventListener('click', () => ouvrir('personnages', { depuis: capacite }));
  btInventaire.addEventListener('click', () => ouvrir('inventaire', { filtre: 'tout', depuis: btInventaire }));
  btFusion.addEventListener('click', () => ouvrir('fusion', { depuis: btFusion }));

  return {
    section,
    // Écran plein affiché par menu.js (etatMenu.ecran) : seul le sous-menu de ce nom est visible ; un autre écran (Options…) les cache tous.
    synchroniser(ecran) {
      if (!SOUS_ECRANS.includes(ecran)) ouvert = null;
      for (const [nom, s] of sous) s.section.hidden = nom !== ecran;
    },
    // Animations : « personnage » (E9-1) ou le nom du sous-menu affiché ; null : toutes en pause (autre onglet, autre écran, page cachée).
    animer(actif) {
      decor.dataset.anim = actif === 'personnage' ? 'on' : 'off';
      section.classList.toggle('e9-anime', actif === 'personnage');
      for (const [nom, s] of sous) s.animer?.(actif === nom);
    },
    // Échap : un sous-menu ouvert revient à l'écran Personnage (true : traité).
    echap() {
      if (!ouvert) return false;
      if (sous.get(ouvert)?.echap?.()) return true;
      fermer();
      return true;
    },
    etat() {
      const etat = eq.etat();
      const objet = (uid) => {
        const o = objetDe(etat, uid);
        return o ? { uid: o.uid, id: o.id, rarete: o.rarete, niveau: o.niveau, niveauMax: definition(cat, o)?.niveauMax ?? null } : null;
      };
      return {
        ouvert,
        emplacements: Object.fromEntries(EMPLACEMENTS.map((e) => [e, objet(etat.porte[e])])),
        objets: etat.objets.map((o) => ({ ...objet(o.uid), porte: emplacementDe(etat, o.uid) })),
        choisi: etat.choisi,
        persos: { ...etat.persos },
        stats: stats().niveaux,
        sous: Object.fromEntries([...sous].map(([nom, s]) => [nom, s.etat?.() ?? null])),
      };
    },
  };
}
