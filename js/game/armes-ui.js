// Lot 9e — Interface des armes en partie : munitions « chargeur / réserve » (#hud-ammo, en bas à droite ; sur téléphone, collées au bouton de
// rechargement #btn-recharger près du stick droit ; à l'échelle de l'interface --ui-k), états « Recharge » et « À sec » ; deux emplacements
// d'armes centrés en bas (#armes-slots : le pistolet et l'arme achetée, visuels 2D de js/core/armes/visuel.js ; toucher ou cliquer l'autre
// emplacement change d'arme ; touches 1 et 2 rappelées sur ordinateur) ; annonces sobres aux lecteurs d'écran (arme sortie, début et fin d'un
// rechargement, arme à sec ; jamais chaque tir). Éléments créés ici (aucun bloc ajouté à jeu.html) et retirés par dispose() (lot 9d).
// Retour du propriétaire (partie Q) : icône de rechargement « balle et flèche », nombre de balles collé au bouton, emplacements au centre.
import { armeParId, varianteDe } from '../core/armes/armes.js';
import { visuelArme } from '../core/armes/visuel.js';
import { fmt } from './texts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// dict : textes (fr.json) ; root : conteneur du jeu (#game) ; col : colonne du HUD où placer les munitions ; donnees : lireArmes() ; choix :
// armes-choix.json ; annonce(texte) : région polie ; onRecharger() : bouton de rechargement ; onChoisir(i) : emplacement i choisi.
export function createArmesUi({ dict, root, col, donnees, choix, annonce = () => {}, onRecharger = () => {}, onChoisir = () => {} }) {
  const t = (k) => dict[k] ?? k;
  const ammo = document.createElement('p');
  ammo.id = 'hud-ammo';
  ammo.classList.add('hud-block', 'hud-ammo');
  const icone = document.createElementNS(SVG_NS, 'svg');
  icone.setAttribute('class', 'hud-icon');
  icone.setAttribute('viewBox', '0 0 16 16');
  icone.setAttribute('aria-hidden', 'true');
  icone.setAttribute('focusable', 'false');
  const balle = document.createElementNS(SVG_NS, 'path');
  balle.setAttribute('d', 'M6 14.5V6.5L8 1.5l2 5v8zM6 11h4');
  icone.append(balle);
  const nom = document.createElement('span');
  nom.classList.add('sr-only'); // nom de l'arme pour les lecteurs d'écran (le visuel du bouton le montre sur téléphone)
  const texte = document.createElement('span');
  texte.id = 'hud-ammo-text';
  texte.classList.add('hud-value');
  const etat = document.createElement('span');
  etat.id = 'hud-ammo-state';
  etat.classList.add('hud-ammo-state');
  ammo.append(icone, nom, document.createTextNode(' '), texte, etat);
  (root ?? col)?.append(ammo); // en bas à droite (au-dessus des boutons sur téléphone), hors de la bande du HUD

  const boutons = document.createElement('div');
  boutons.classList.add('armes-boutons');
  boutons.id = 'armes-boutons';
  const recharger = document.createElement('button');
  recharger.type = 'button';
  recharger.id = 'btn-recharger';
  recharger.classList.add('button', 'button-quiet', 'armes-bouton', 'armes-bouton-recharger');
  recharger.setAttribute('aria-label', t('game.armes.recharger'));
  const ri = document.createElementNS(SVG_NS, 'svg');
  ri.setAttribute('viewBox', '0 0 16 16');
  ri.setAttribute('aria-hidden', 'true');
  ri.setAttribute('focusable', 'false');
  // Icône (partie Q) : une balle au centre d'une flèche de rechargement.
  ri.setAttribute('viewBox', '0 0 24 24');
  const fleche = document.createElementNS(SVG_NS, 'path');
  fleche.setAttribute('d', 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v4h-4');
  const balleR = document.createElementNS(SVG_NS, 'path');
  balleR.setAttribute('d', 'M10.5 16.5v-5.5l1.5-3.5 1.5 3.5v5.5zM10.5 14h3');
  ri.append(fleche, balleR);
  recharger.append(ri);
  boutons.append(recharger);
  root?.append(boutons);

  // Emplacements d'armes (partie Q) : deux cases centrées en bas, le pistolet (1) et l'arme achetée (2).
  const slots = document.createElement('div');
  slots.id = 'armes-slots';
  slots.classList.add('armes-slots');
  slots.setAttribute('role', 'group');
  slots.setAttribute('aria-label', t('game.armes.slots'));
  const cases = [0, 1].map((i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `arme-slot-${i + 1}`;
    b.classList.add('button', 'button-quiet', 'arme-slot');
    const touche = document.createElement('span');
    touche.classList.add('arme-slot-touche');
    touche.setAttribute('aria-hidden', 'true');
    touche.textContent = String(i + 1);
    const vis = document.createElement('span');
    vis.classList.add('arme-slot-visuel');
    b.append(vis, touche);
    slots.append(b);
    return { b, vis };
  });
  root?.append(slots);
  const stop = (fn) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    fn();
  };
  const onR = stop(onRecharger);
  recharger.addEventListener('click', onR);
  const onS = cases.map((c, i) => stop(() => {
    if (c.b.getAttribute('aria-pressed') !== 'true' && !c.b.disabled) onChoisir(i);
  }));
  cases.forEach((c, i) => c.b.addEventListener('click', onS[i]));

  // Visuels 2D : un SVG par arme, analysé une fois (généré par le jeu, sans entrée extérieure).
  const visuels = new Map();
  const visuel = (id) => {
    if (visuels.has(id)) return visuels.get(id).cloneNode(true);
    const arme = armeParId(donnees, id);
    if (!arme) return null;
    const { svg } = visuelArme(donnees, arme, varianteDe(arme, choix?.variantes?.[id]), { id: `btn-visuel-${id}`, titre: '' });
    const node = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    node.setAttribute('aria-hidden', 'true');
    node.removeAttribute('role');
    node.removeAttribute('aria-labelledby');
    visuels.set(id, node);
    return node.cloneNode(true);
  };

  const vu = {};
  const fois = (k, v) => {
    if (vu[k] === v) return false;
    vu[k] = v;
    return true;
  };
  return {
    // e : { active (id), texte (« 5 / 42 »), recharge (vrai pendant un rechargement), aSec, slots ([id | null] : emplacements), actif (indice
    // de l'emplacement tenu), visible }.
    update(e) {
      if (!e) return;
      if (fois('visible', e.visible !== false)) ammo.hidden = e.visible === false;
      if (fois('nom', e.active)) nom.textContent = t(`game.armes.${e.active}`);
      if (fois('texte', e.texte)) texte.textContent = e.texte ?? '';
      const st = e.aSec ? 'sec' : e.recharge ? 'recharge' : '';
      if (fois('etat', st)) {
        etat.textContent = st === 'sec' ? t('game.armes.aSec') : st === 'recharge' ? t('game.armes.recharge') : '';
        etat.hidden = st === '';
        ammo.dataset.etat = st;
      }
      if (fois('slotsVus', e.visible !== false)) slots.hidden = e.visible === false;
      const ids = Array.isArray(e.slots) ? e.slots : [];
      if (fois('slots', `${ids.join('|')}#${e.actif}`)) {
        cases.forEach((c, i) => {
          const id = ids[i] ?? null;
          c.vis.replaceChildren();
          const v = id ? visuel(id) : null;
          if (v) c.vis.append(v);
          const tenu = id !== null && i === e.actif;
          c.b.disabled = id === null;
          c.b.setAttribute('aria-pressed', tenu ? 'true' : 'false');
          c.b.dataset.vide = id === null ? 'oui' : 'non';
          c.b.setAttribute('aria-label', id === null ? t('game.armes.slot.vide') : fmt(t(tenu ? 'game.armes.slot.tenue' : 'game.armes.slot.prendre'), { arme: t(`game.armes.${id}`) }));
        });
      }
    },
    // Annonces : 'sortie' (arme), 'rechargeDebut', 'rechargeFin', 'aSec'.
    annoncer(type, id) {
      const k = { sortie: 'game.armes.annonce.sortie', rechargeDebut: 'game.armes.annonce.recharge', rechargeFin: 'game.armes.annonce.pret', aSec: 'game.armes.annonce.sec' }[type];
      if (k) annonce(fmt(t(k), { arme: t(`game.armes.${id}`) }));
    },
    dispose() {
      recharger.removeEventListener('click', onR);
      cases.forEach((c, i) => c.b.removeEventListener('click', onS[i]));
      ammo.remove();
      boutons.remove();
      slots.remove();
      visuels.clear();
    },
  };
}
