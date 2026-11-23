// Lot 9k — Interface de l'achat d'armes : message à deux cases d'une caisse active (« Acheter Winchester M1897 — 750 Z », « Munitions — 260 Z »,
// grisé avec le manque ou le refus), un peu sous le message des portes, et bouton tactile contextuel au-dessus des emplacements d'armes (écran
// tactile seulement, 44 px au moins). Lecture seule : l'état vient de js/core/armes/achat.js (etatAchat) ; le DOM n'est touché que quand le texte
// change ; annoncé une fois par approche aux lecteurs d'écran (aria-live poli). Aucune écriture dans le stockage.
import { formatMoney } from '../core/economy.js';
import { fmt } from './texts.js';

// Raisons d'un refus (etatAchat → refus) et leur texte.
const REFUS = Object.freeze({ recharge: 'game.achat.refus.recharge', changement: 'game.achat.refus.changement', terre: 'game.achat.refus.terre', plein: 'game.achat.refus.plein', zollars: 'game.achat.refus.zollars' });

export function createAchatUi({ dict, root = document.getElementById('game-root') ?? document.body, nomArme = (id) => id, onAcheter = () => {} }) {
  const t = (k, p) => fmt(dict[k] ?? k, p);
  const msg = document.createElement('p');
  msg.id = 'achat-message';
  msg.className = 'achat-message';
  msg.setAttribute('aria-live', 'polite');
  msg.dataset.visible = 'false';
  const texte = document.createElement('span');
  const touche = document.createElement('span');
  touche.className = 'achat-touche';
  touche.textContent = t('game.achat.touche');
  msg.append(texte, touche);
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'achat-bouton';
  bouton.className = 'achat-bouton';
  bouton.hidden = true;
  const libelle = document.createElement('span');
  libelle.className = 'achat-bouton-libelle';
  const prix = document.createElement('span');
  prix.className = 'achat-bouton-prix';
  bouton.append(libelle, prix);
  bouton.addEventListener('click', (e) => {
    e.preventDefault();
    onAcheter();
  });
  bouton.addEventListener('pointerdown', (e) => e.stopPropagation()); // le bouton ne pose pas de stick
  root.append(msg, bouton);
  let cle = null;
  let refusAffiche = null; // { texte, jusqua } : refus expliqué après un achat refusé (secondes de jeu)

  // Texte d'un état (etatAchat) : action et prix, puis le manque ou la raison du refus.
  function texteDe(etat) {
    const base = etat.action === 'munitions' ? t('game.achat.munitions', { prix: formatMoney(etat.prix) }) : t('game.achat.acheter', { arme: nomArme(etat.arme), prix: formatMoney(etat.prix) });
    if (etat.refus === 'zollars') return `${base} · ${t('game.achat.manque', { n: formatMoney(etat.manque) })}`;
    if (etat.refus) return `${base} · ${t(REFUS[etat.refus] ?? 'game.achat.refus.zollars')}`;
    return base;
  }

  return {
    // etat : etatAchat() ou null (aucune caisse active proche) ; temps : secondes de jeu.
    update(etat, temps = 0) {
      const visible = Boolean(etat);
      const refus = refusAffiche && temps < refusAffiche.jusqua ? refusAffiche.texte : null;
      const contenu = visible ? refus ?? texteDe(etat) : '';
      const k = `${visible}|${contenu}|${etat?.possible}`;
      if (k === cle) return;
      cle = k;
      texte.textContent = contenu;
      msg.dataset.visible = visible ? 'true' : 'false';
      msg.dataset.possible = etat?.possible ? 'true' : 'false';
      bouton.hidden = !visible;
      if (visible) {
        libelle.textContent = etat.action === 'munitions' ? t('game.achat.boutonMunitions') : t('game.achat.bouton');
        prix.textContent = t('game.achat.prixCourt', { prix: formatMoney(etat.prix) });
        bouton.setAttribute('aria-disabled', etat.possible ? 'false' : 'true');
        bouton.dataset.possible = etat.possible ? 'true' : 'false';
      }
    },
    // Refus d'un achat demandé (touche ou bouton) : la raison reste affichée 1,5 s de jeu.
    refuser(etat, temps = 0) {
      if (etat) refusAffiche = { texte: texteDe(etat), jusqua: temps + 1.5 };
      cle = null;
    },
    texte: () => texte.textContent,
    get element() {
      return msg;
    },
    get bouton() {
      return bouton;
    },
    dispose() {
      msg.remove();
      bouton.remove();
    },
  };
}
