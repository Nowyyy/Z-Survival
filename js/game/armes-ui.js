// Lot 9e — Interface des armes en partie : munitions « chargeur / réserve » (#hud-ammo, bloc du HUD en bas à droite, au-dessus des boutons sur
// téléphone ; à l'échelle de l'interface --ui-k), états « Recharge » et « À sec » ; sur téléphone, deux boutons près du stick droit (#btn-recharger ; #btn-changer, qui
// montre le visuel 2D de l'autre arme, js/core/armes/visuel.js) ; annonces sobres aux lecteurs d'écran (arme sortie, début et fin d'un
// rechargement, arme à sec ; jamais chaque tir). Éléments créés ici (aucun bloc ajouté à jeu.html) et retirés par dispose() (lot 9d).
import { armeParId, varianteDe } from '../core/armes/armes.js';
import { visuelArme } from '../core/armes/visuel.js';
import { fmt } from './texts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// dict : textes (fr.json) ; root : conteneur du jeu (#game) ; col : colonne du HUD où placer les munitions ; donnees : lireArmes() ; choix :
// armes-choix.json ; annonce(texte) : région polie ; onRecharger(), onChanger() : actions des boutons.
export function createArmesUi({ dict, root, col, donnees, choix, annonce = () => {}, onRecharger = () => {}, onChanger = () => {} }) {
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
  const rp = document.createElementNS(SVG_NS, 'path');
  rp.setAttribute('d', 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3');
  ri.append(rp);
  recharger.append(ri);
  const changer = document.createElement('button');
  changer.type = 'button';
  changer.id = 'btn-changer';
  changer.classList.add('button', 'button-quiet', 'armes-bouton', 'armes-bouton-visuel');
  changer.hidden = true;
  boutons.append(changer, recharger);
  root?.append(boutons);
  const stop = (fn) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    fn();
  };
  const onR = stop(onRecharger);
  const onC = stop(onChanger);
  recharger.addEventListener('click', onR);
  changer.addEventListener('click', onC);

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
    // e : { active (id), texte (« 5 / 42 »), recharge (vrai pendant un rechargement), aSec, autre (id de l'autre arme ou null), visible }.
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
      if (fois('autre', e.autre ?? null)) {
        changer.hidden = !e.autre;
        changer.replaceChildren();
        if (e.autre) {
          const v = visuel(e.autre);
          if (v) changer.append(v);
          changer.setAttribute('aria-label', fmt(t('game.armes.changer'), { arme: t(`game.armes.${e.autre}`) }));
        }
      }
    },
    // Annonces : 'sortie' (arme), 'rechargeDebut', 'rechargeFin', 'aSec'.
    annoncer(type, id) {
      const k = { sortie: 'game.armes.annonce.sortie', rechargeDebut: 'game.armes.annonce.recharge', rechargeFin: 'game.armes.annonce.pret', aSec: 'game.armes.annonce.sec' }[type];
      if (k) annonce(fmt(t(k), { arme: t(`game.armes.${id}`) }));
    },
    dispose() {
      recharger.removeEventListener('click', onR);
      changer.removeEventListener('click', onC);
      ammo.remove();
      boutons.remove();
      visuels.clear();
    },
  };
}
