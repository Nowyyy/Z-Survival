// Lot 8h : outils de débogage du menu (Docs/ref/sauvegarde-v2.md), chargés au premier toucher de la petite icône de l'en-tête, à côté du plein écran
// et du menu à trois barres. L'icône n'existe que sur les canaux de débogage « source » (sources locales) et « dev » (/dev/) : jamais dans la Recette
// (canal « release »), les archives ni la production. Chaque outil écrit VRAIMENT dans la progression v2 (zs.save.v2), après une confirmation :
// ajouter 10 000 médailles, donner l'inventaire de démonstration (data/menu/inventaire-depart.json), débloquer tous les personnages, remettre la
// progression à zéro (efface zs.save.v2 et le son de zs.device.v1 ; jamais zs.save.v1). Lot 8k : ajouter 1 000 diamants, remettre la pitié
// des trois caisses à zéro. Lot 9a : « Marquer le monde 1 terminé » (mondes terminés seulement : aucune médaille, aucun diamant, aucun record ;
// débloque la carte du monde 1 dans l'onglet Infini).
// Lot 9a-H (retour du propriétaire : « pas beau, on ne comprend pas, il faut défiler, beaucoup de vide ») : le panneau occupe toute la place sans
// défiler (paysage 667 × 375 et plus) : à gauche l'état de la sauvegarde (relu après chaque outil, valeurs changées surlignées) et, dessous, la
// remise à zéro en rouge ; à droite une grille de cartes (nom et effet de chaque outil) ; le résultat (« C'est fait. ») dans l'en-tête ; la
// confirmation s'ouvre au centre, par-dessus, avec l'effet rappelé.
import { el } from './menu.js';
import { chargerEquipement } from './equipement-etat.js';
import { createDeviceSettings, browserStorage } from '../save/device-settings.js';
import { pageSearch } from '../game/graphics-boot.js';
import { fmt } from '../game/texts.js';
import { formatMoney } from '../core/economy.js';
import { estDebloque } from '../core/equipement.js';

export const CANAUX_OUTILS = Object.freeze(['source', 'dev']);
export const OUTILS = Object.freeze(['medailles', 'diamants', 'pitie', 'monde', 'demo', 'persos', 'zero']); // lot 9a : « monde »
const TEXTES = {
  medailles: 'game.menu.debogage.medailles', diamants: 'game.menu.debogage.diamants', pitie: 'game.menu.debogage.pitie', monde: 'game.menu.debogage.monde', demo: 'game.menu.debogage.demo', persos: 'game.menu.debogage.persos', zero: 'game.menu.debogage.zero',
};
const DETAILS = {
  medailles: 'game.menu.debogage.detail.medailles', diamants: 'game.menu.debogage.detail.diamants', pitie: 'game.menu.debogage.detail.pitie', monde: 'game.menu.debogage.detail.monde', demo: 'game.menu.debogage.detail.demo', persos: 'game.menu.debogage.detail.persos', zero: 'game.menu.debogage.detail.zero',
};
// Lignes du résumé, dans l'ordre affiché : clé → libellé.
const ETAT = {
  medailles: 'game.menu.debogage.etat.medailles', diamants: 'game.menu.debogage.etat.diamants', monde: 'game.menu.debogage.etat.monde', objets: 'game.menu.debogage.etat.objets', persos: 'game.menu.debogage.etat.persos', pitie: 'game.menu.debogage.etat.pitie', sauvegarde: 'game.menu.debogage.etat.sauvegarde',
};
const STOCKAGE = {
  appareil: 'game.menu.debogage.etat.appareil', memoire: 'game.menu.debogage.etat.memoire', lecture: 'game.menu.debogage.etat.lecture', verrouillee: 'game.menu.debogage.etat.verrouillee',
};
const RUBRIQUES_PITIE = ['equipement', 'personnage', 'cosmetique'];

// Valeurs affichées du résumé (textes déjà traduits), d'après la progression chargée ; null : pas encore chargée.
function valeurs(eq, t) {
  if (!eq) return null;
  const lu = eq.prog.lire();
  const save = lu.save ?? {};
  const etat = eq.etat();
  const persos = eq.cat.personnages;
  const pitie = RUBRIQUES_PITIE.some((r) => (save.pitie?.[r]?.e ?? 0) > 0 || (save.pitie?.[r]?.l ?? 0) > 0);
  const mode = eq.prog.mode?.kind;
  const sauvegarde = mode === 'readonly' ? 'lecture' : lu.locked ? 'verrouillee' : mode === 'memory' ? 'memoire' : 'appareil';
  return {
    medailles: formatMoney(eq.solde()),
    diamants: formatMoney(eq.diamants()),
    monde: t((save.mondes ?? []).includes('batiment') ? 'game.menu.debogage.etat.termine' : 'game.menu.debogage.etat.pasTermine'),
    objets: `${etat.objets.length} / ${eq.cat.inventaireMax}`,
    persos: `${persos.filter((p) => estDebloque(etat, p)).length} / ${persos.length}`,
    pitie: t(pitie ? 'game.menu.debogage.etat.pitieEnCours' : 'game.menu.debogage.etat.pitieZero'),
    sauvegarde: t(STOCKAGE[sauvegarde]),
  };
}

// root : racine du menu (#e8) ; retour : bouton à qui rendre le focus. → { element, fermer(), echap() }.
export function ouvrirDebogage({ t, root, retour }) {
  const voile = el('div', ['e8-voile', 'e10-voile'], { id: 'menu-debogage', 'data-block': 'E8-debug' });
  const panneau = el('div', ['e8-panneau', 'e10-panneau', 'e8-debogage-panneau'], { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-debogage-titre', 'aria-describedby': 'menu-debogage-note' });
  const haut = el('div', ['e8-panneau-tete', 'e10-panneau-tete']);
  const titres = el('div', ['e8-debogage-titres']);
  const h = el('h3', ['e10-panneau-titre'], { id: 'menu-debogage-titre' });
  h.textContent = t('game.menu.debogage.titre');
  const note = el('p', ['e8-debogage-note'], { id: 'menu-debogage-note' });
  note.textContent = t('game.menu.debogage.note');
  titres.append(h, note);
  const croix = el('button', ['e8-croix'], { type: 'button', id: 'menu-debogage-fermer', 'aria-label': t('game.menu.fermer') });
  croix.textContent = '×';
  haut.append(titres, croix); // le message du dernier outil s'y ajoute, avant la croix (voir plus bas)

  const corps = el('div', ['e8-panneau-corps', 'e10-panneau-corps', 'e8-debogage-corps']);
  // État de la sauvegarde (lecture seule, relu après chaque écriture et à chaque changement venu d'un autre onglet).
  const resume = el('section', ['e8-debogage-etat'], { 'aria-labelledby': 'menu-debogage-etat-titre' });
  const resumeTitre = el('h4', ['e8-debogage-sous-titre'], { id: 'menu-debogage-etat-titre' });
  resumeTitre.textContent = t('game.menu.debogage.etat.titre');
  const dl = el('dl', ['e8-debogage-valeurs']);
  const cases = {};
  for (const [k, libelle] of Object.entries(ETAT)) {
    const ligne = el('div', ['e8-debogage-ligne'], { 'data-etat': k });
    const dt = el('dt');
    dt.textContent = t(libelle);
    const dd = el('dd', [], { id: `menu-debogage-etat-${k}` });
    dd.textContent = '…';
    ligne.append(dt, dd);
    dl.append(ligne);
    cases[k] = dd;
  }
  const message = el('p', ['e10-message', 'e8-debogage-message'], { id: 'menu-debogage-message', role: 'status' });
  croix.before(message);
  resume.append(resumeTitre, dl);

  // Outils : une carte (bouton) par outil : nom et effet.
  const liste = el('div', ['e10-sauvegarde-boutons', 'e8-debogage-liste'], { role: 'group', 'aria-labelledby': 'menu-debogage-outils-titre' });
  const outilsTitre = el('h4', ['sr-only'], { id: 'menu-debogage-outils-titre' });
  outilsTitre.textContent = t('game.menu.debogage.outils');
  liste.append(outilsTitre);

  // Confirmation : au centre, par-dessus l'état et les outils (rendus inertes tant qu'elle est ouverte).
  const confirmation = el('div', ['e8-debogage-confirmation'], { id: 'menu-debogage-confirmation', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-debogage-question', 'aria-describedby': 'menu-debogage-effet' });
  confirmation.hidden = true;
  const boite = el('div', ['e8-debogage-boite']);
  const question = el('p', ['e8-debogage-question'], { id: 'menu-debogage-question' });
  const effet = el('p', ['e8-debogage-effet'], { id: 'menu-debogage-effet' });
  const choix = el('div', ['e8-debogage-choix']);
  const oui = el('button', ['menu-peint', 'e10-remplacer'], { type: 'button', id: 'menu-debogage-oui' });
  oui.textContent = t('game.menu.debogage.oui');
  const non = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: 'menu-debogage-non' });
  non.textContent = t('game.save.page.cancel');
  choix.append(non, oui);
  boite.append(question, effet, choix);
  confirmation.append(boite);

  let enAttente = null;
  let declencheur = null;
  const fermerConfirmation = () => {
    enAttente = null;
    confirmation.hidden = true;
    resume.inert = false;
    liste.inert = false;
    if (declencheur?.isConnected) declencheur.focus();
    declencheur = null;
  };
  for (const id of OUTILS) {
    // La carte entière est le bouton (cible de toute sa surface) ; son nom accessible est tout son texte visible : nom de l'outil, puis effet.
    const b = el('button', ['e8-debogage-carte'], { type: 'button', id: `menu-debogage-${id}`, 'data-outil': id });
    if (id === 'zero') b.classList.add('e8-debogage-danger');
    const nom = el('span', ['e8-debogage-nom'], { id: `menu-debogage-nom-${id}` });
    nom.textContent = t(TEXTES[id]);
    const detail = el('span', ['e8-debogage-detail'], { id: `menu-debogage-detail-${id}` });
    detail.textContent = t(DETAILS[id]);
    b.addEventListener('click', () => {
      enAttente = id;
      declencheur = b;
      question.textContent = fmt(t('game.menu.debogage.confirmer'), { action: t(TEXTES[id]) });
      effet.textContent = t(DETAILS[id]);
      oui.classList.toggle('e8-debogage-oui-danger', id === 'zero');
      confirmation.hidden = false;
      resume.inert = true;
      liste.inert = true;
      message.textContent = '';
      message.classList.remove('e8-debogage-echec');
      non.focus();
    });
    b.append(nom, detail);
    // La remise à zéro (rouge) vit sous l'état de la sauvegarde, qu'elle efface ; les six autres outils remplissent la grille.
    if (id === 'zero') resume.append(b);
    else liste.append(b);
  }
  corps.append(resume, liste, confirmation);
  panneau.append(haut, corps);
  voile.append(panneau);
  root.append(voile);

  // Résumé : valeurs relues ; avant une écriture, on retient l'état pour surligner ce qui a changé.
  let eqCharge = null;
  let desabonner = null;
  let avant = null;
  const peindre = () => {
    const v = valeurs(eqCharge, t);
    if (!v) return;
    for (const k of Object.keys(ETAT)) {
      cases[k].textContent = v[k];
      cases[k].parentElement.classList.toggle('e8-debogage-change', Boolean(avant && avant[k] !== v[k]));
    }
  };
  chargerEquipement().then((eq) => {
    if (!voile.isConnected) return;
    eqCharge = eq;
    desabonner = eq.abonner(() => peindre());
    peindre();
  }).catch(() => {
    for (const k of Object.keys(ETAT)) cases[k].textContent = '—';
  });

  async function agir(id) {
    const eq = await chargerEquipement();
    avant = valeurs(eq, t);
    let r = { ok: false };
    if (id === 'medailles') r = eq.ajouterMedailles(10_000);
    else if (id === 'diamants') r = eq.ajouterDiamants(1000);
    else if (id === 'pitie') r = eq.remettrePitie();
    else if (id === 'monde') r = eq.marquerMondeTermine('batiment'); // lot 9a : débloque l'Infini du monde 1, sans aucun gain
    else if (id === 'demo') r = await eq.donnerDemo();
    else if (id === 'persos') r = eq.debloquerTous();
    else if (id === 'zero') {
      r = eq.remettreAZero();
      // Le son et les volumes de l'appareil (ajoutés par ce lot dans zs.device.v1) reviennent aux défauts ; les graphismes sont gardés.
      createDeviceSettings({ search: pageSearch(), storage: browserStorage() }).writeSon(null);
    }
    peindre(); // la progression prévient aussi ses abonnés : repeint ici au cas où rien n'aurait changé (échec)
    message.classList.toggle('e8-debogage-echec', !r.ok);
    message.textContent = t(r.ok ? 'game.menu.debogage.fait' : 'game.menu.debogage.echec');
  }
  oui.addEventListener('click', () => {
    const id = enAttente;
    fermerConfirmation();
    if (id) agir(id).catch(() => {
      message.classList.add('e8-debogage-echec');
      message.textContent = t('game.menu.debogage.echec');
    });
  });
  non.addEventListener('click', () => {
    fermerConfirmation();
    message.textContent = '';
  });
  const fermer = () => {
    desabonner?.();
    voile.remove();
    if (retour?.isConnected) retour.focus();
  };
  croix.addEventListener('click', fermer);
  voile.addEventListener('pointerdown', (e) => {
    if (e.target === voile) fermer();
  });
  // Échap (écouté par le menu, js/menu/menu.js) : annule d'abord la confirmation ouverte, puis ferme le panneau.
  const echap = () => {
    if (!confirmation.hidden) fermerConfirmation();
    else fermer();
  };
  panneau.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    e.stopPropagation();
    echap();
  });
  croix.focus();
  return { element: voile, fermer, echap };
}
