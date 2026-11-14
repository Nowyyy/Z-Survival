// Lot 8h : outils de débogage du menu (Docs/ref/sauvegarde-v2.md), chargés au premier toucher de la petite icône de l'en-tête, à côté du plein écran
// et du menu à trois barres. L'icône n'existe que sur les canaux de débogage « source » (sources locales) et « dev » (/dev/) : jamais dans la Recette
// (canal « release »), les archives ni la production. Chaque outil écrit VRAIMENT dans la progression v2 (zs.save.v2), après une confirmation :
// ajouter 10 000 bleus, donner l'inventaire de démonstration (data/menu/inventaire-depart.json), débloquer tous les personnages, remettre la
// progression V0.8 à zéro (efface zs.save.v2 et le son de zs.device.v1 ; jamais zs.save.v1).
import { el } from './menu.js';
import { chargerEquipement } from './equipement-etat.js';
import { createDeviceSettings, browserStorage } from '../save/device-settings.js';
import { pageSearch } from '../game/graphics-boot.js';
import { fmt } from '../game/texts.js';

export const CANAUX_OUTILS = Object.freeze(['source', 'dev']);
export const OUTILS = Object.freeze(['bleus', 'demo', 'persos', 'zero']);
const TEXTES = {
  bleus: 'game.menu.debogage.bleus', demo: 'game.menu.debogage.demo', persos: 'game.menu.debogage.persos', zero: 'game.menu.debogage.zero',
};

// root : racine du menu (#e8) ; retour : bouton à qui rendre le focus. → { element, fermer() }.
export function ouvrirDebogage({ t, root, retour }) {
  const voile = el('div', ['e8-voile', 'e10-voile'], { id: 'menu-debogage', 'data-block': 'E8-debug' });
  const panneau = el('div', ['e8-panneau', 'e10-panneau'], { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-debogage-titre' });
  const haut = el('div', ['e8-panneau-tete', 'e10-panneau-tete']);
  const h = el('h3', ['e10-panneau-titre'], { id: 'menu-debogage-titre' });
  h.textContent = t('game.menu.debogage.titre');
  const croix = el('button', ['e8-croix'], { type: 'button', id: 'menu-debogage-fermer', 'aria-label': t('game.menu.fermer') });
  croix.textContent = '×';
  haut.append(h, croix);
  const corps = el('div', ['e8-panneau-corps', 'e10-panneau-corps']);
  const note = el('p', ['e10-consigne']);
  note.textContent = t('game.menu.debogage.note');
  const message = el('p', ['e10-message'], { id: 'menu-debogage-message', role: 'status' });
  const liste = el('div', ['e10-sauvegarde-boutons', 'e8-debogage-liste']);
  const confirmation = el('div', ['e8-debogage-confirmation'], { id: 'menu-debogage-confirmation' });
  confirmation.hidden = true;
  const question = el('p', ['e10-consigne'], { id: 'menu-debogage-question' });
  const oui = el('button', ['menu-peint', 'e10-remplacer'], { type: 'button', id: 'menu-debogage-oui' });
  oui.textContent = t('game.menu.debogage.oui');
  const non = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: 'menu-debogage-non' });
  non.textContent = t('game.save.page.cancel');
  confirmation.append(question, oui, non);
  let enAttente = null;
  for (const id of OUTILS) {
    const b = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: `menu-debogage-${id}` });
    b.textContent = t(TEXTES[id]);
    b.addEventListener('click', () => {
      enAttente = id;
      question.textContent = fmt(t('game.menu.debogage.confirmer'), { action: t(TEXTES[id]) });
      confirmation.hidden = false;
      message.textContent = '';
      non.focus();
    });
    liste.append(b);
  }
  corps.append(note, liste, confirmation, message);
  panneau.append(haut, corps);
  voile.append(panneau);
  root.append(voile);

  async function agir(id) {
    const eq = await chargerEquipement();
    let r = { ok: false };
    if (id === 'bleus') r = eq.ajouterBleu(10_000);
    else if (id === 'demo') r = await eq.donnerDemo();
    else if (id === 'persos') r = eq.debloquerTous();
    else if (id === 'zero') {
      r = eq.remettreAZero();
      // Le son et les volumes de l'appareil (ajoutés par ce lot dans zs.device.v1) reviennent aux défauts ; les graphismes sont gardés.
      createDeviceSettings({ search: pageSearch(), storage: browserStorage() }).writeSon(null);
    }
    message.textContent = t(r.ok ? 'game.menu.debogage.fait' : 'game.menu.debogage.echec');
  }
  oui.addEventListener('click', () => {
    const id = enAttente;
    enAttente = null;
    confirmation.hidden = true;
    if (id) agir(id).catch(() => {
      message.textContent = t('game.menu.debogage.echec');
    });
  });
  non.addEventListener('click', () => {
    enAttente = null;
    confirmation.hidden = true;
    message.textContent = '';
  });
  const fermer = () => {
    voile.remove();
    if (retour?.isConnected) retour.focus();
  };
  croix.addEventListener('click', fermer);
  voile.addEventListener('pointerdown', (e) => {
    if (e.target === voile) fermer();
  });
  panneau.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      fermer();
    }
  });
  croix.focus();
  return { element: voile, fermer };
}
