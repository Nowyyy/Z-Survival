// Lot 9k — Achat d'armes sur la carte : caisses (data/game/maps/<carte>/caisses-armes.json), caisse proche, message, achat, rachat, refus. Pur :
// aucune horloge, aucun hasard, aucun DOM ni stockage ; les données et l'état arrivent en argument et ne sont jamais modifiés. Les Zollars sont
// ceux de la partie (jamais écrits) : la partie retire le prix (js/game/bank.js, depenser) quand acheter() réussit.
import { isNum, num } from '../vec.js';
import { armeActive, donnerArme, enRecharge, remplirMunitions } from './inventaire.js';

const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Caisses lues : [{ id, piece, floor, arme, x, y, w, h, face }] ; entrées invalides ignorées.
export function lireCaisses(json) {
  const liste = Array.isArray(obj(json).caisses) ? json.caisses : [];
  return liste.map(obj).filter((c) => typeof c.id === 'string' && typeof c.arme === 'string' && [c.x, c.y, c.w, c.h].every(isNum) && c.w > 0 && c.h > 0)
    .map((c) => ({ id: c.id, piece: typeof c.piece === 'string' ? c.piece : null, floor: c.floor === 'etage' ? 'etage' : 'rdc', arme: c.arme, x: c.x, y: c.y, w: c.w, h: c.h, face: ['n', 's', 'e', 'w'].includes(c.face) ? c.face : 's' }));
}

// Prix d'une arme et de ses munitions (armes-partie.json → prix, rachat) ; rachat absent : 35 % du prix, arrondi à 10.
export function prixArme(table, id) {
  const e = table?.armes?.[id];
  const prix = Math.max(0, Math.round(num(e?.prix)));
  const rachat = isNum(e?.rachat) ? Math.max(0, Math.round(e.rachat)) : Math.round((prix * 0.35) / 10) * 10;
  return { prix, rachat };
}

// Caisse active : sa pièce est ouverte (identifiants des zones ouvertes), ou toutes (débogage « armes ouvertes »).
export const caisseActive = (c, ouvertes, toutes = false) => toutes || (c.piece !== null && Array.isArray(ouvertes) && ouvertes.includes(c.piece));

// Distance du joueur au rectangle de la caisse (0 dedans).
export const distanceCaisse = (c, x, y) => Math.hypot(Math.max(c.x - x, 0, x - (c.x + c.w)), Math.max(c.y - y, 0, y - (c.y + c.h)));

// Caisse la plus proche du joueur, à son étage, active, à `distance` au plus de son rectangle (deux cases : 120) ; null sinon.
export function caisseProche(caisses, joueur, etage, ouvertes, distance = 120, toutes = false) {
  let best = null;
  let bd = Infinity;
  for (const c of Array.isArray(caisses) ? caisses : []) {
    if (c.floor !== (etage === 'etage' ? 'etage' : 'rdc') || !caisseActive(c, ouvertes, toutes)) continue;
    const d = distanceCaisse(c, num(joueur?.x), num(joueur?.y));
    if (d <= distance && d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

// Munitions pleines (chargeur et réserve) d'une arme portée.
const pleine = (e, entree) => Boolean(e && entree) && e.chargeur >= entree.chargeur && (entree.reserve === Infinity || e.reserve >= entree.reserve);

// État de l'achat à une caisse : { caisse, arme, action ('acheter' | 'munitions'), prix, possible, manque, refus } ; refus : 'recharge' (rechargement
// en cours), 'changement' (arme en train d'être sortie), 'terre' (à terre, relevage ou chute), 'plein' (munitions déjà pleines), 'zollars'
// (pas assez : manque > 0), null. inv : inventaire (js/core/armes/inventaire.js) ; joueur : { debout } ; zollars : Zollars de la partie.
export function etatAchat({ caisse, inv, table, zollars, debout = true }) {
  if (!caisse || !inv || !table?.armes?.[caisse.arme]) return null;
  const entree = table.armes[caisse.arme];
  const { prix, rachat } = prixArme(table, caisse.arme);
  const portee = inv.emplacements.find((e) => e.id === caisse.arme) ?? null;
  const action = portee ? 'munitions' : 'acheter';
  const cout = action === 'munitions' ? rachat : prix;
  const z = Math.max(0, Math.floor(num(zollars)));
  const manque = Math.max(0, cout - z);
  let refus = null;
  if (!debout) refus = 'terre';
  else if (enRecharge(inv)) refus = 'recharge';
  else if (inv.sortie) refus = 'changement';
  else if (action === 'munitions' && pleine(portee, entree)) refus = 'plein';
  else if (manque > 0) refus = 'zollars';
  return { caisse: caisse.id, arme: caisse.arme, action, prix: cout, possible: refus === null, manque, refus };
}

// Achat ou rachat : { inv, cout, ok, etat }. Achat : l'arme va dans l'emplacement acheté (elle remplace l'arme achetée d'avant, jamais l'arme de
// départ), passe en main, chargeur et réserve pleins. Rachat : munitions de l'arme pleines (arme de départ comprise : réserve illimitée). Refus :
// inventaire inchangé, cout 0.
export function acheter({ caisse, inv, table, zollars, debout = true }) {
  const etat = etatAchat({ caisse, inv, table, zollars, debout });
  if (!etat?.possible) return { inv, cout: 0, ok: false, etat };
  if (etat.action === 'munitions') {
    // Munitions pleines ; l'arme rachetée passe en main si elle ne l'était pas (donnerArme d'une arme portée : changement d'arme).
    const plein = remplirMunitions(inv, table);
    return { inv: armeActive(plein)?.id === caisse.arme ? plein : donnerArme(plein, table, caisse.arme).state, cout: etat.prix, ok: true, etat };
  }
  return { inv: donnerArme(inv, table, caisse.arme).state, cout: etat.prix, ok: true, etat };
}
