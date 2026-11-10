// Lot 8d : mémoire de la page pour l'équipement du Personnage (Docs/ref/menu-principal.md) : catalogue (data/menu/raretes.json, objets.json,
// personnages.json) et état (inventaire, équipement porté, personnages et leurs niveaux, personnage choisi) partant de data/menu/inventaire-depart.json.
// Chargé à la demande : à la première ouverture de l'onglet Personnage, ou à « JOUER » (l'équipement de départ est porté même si l'onglet n'a jamais
// été ouvert) ; jamais au démarrage du menu. Rien n'est écrit dans le stockage jusqu'au lot 8h : le retour au menu (rechargement) remet l'état de départ.
import { creerEtatEquipement, lireCatalogue, statistiquesEffectives } from '../core/equipement.js';

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

let chargement = null;

// → Promise<{ cat, erreurs, etat(), poser(nouvel état), abonner(f) → désabonner, statistiques(base, params, persoId?) }>.
export function chargerEquipement() {
  chargement ??= Promise.all(['raretes', 'objets', 'personnages', 'inventaire-depart'].map((n) => json(`data/menu/${n}.json`))).then(([raretes, objets, personnages, inventaire]) => {
    const { cat, depart, erreurs } = lireCatalogue({ raretes, objets, personnages, inventaire });
    let etat = creerEtatEquipement(cat, depart);
    const abonnes = new Set();
    return {
      cat,
      erreurs,
      etat: () => etat,
      // Nouvel état rendu par une fonction de js/core/equipement.js ; le même objet (entrée refusée) ne prévient personne.
      poser(nouveau) {
        if (nouveau && nouveau !== etat) {
          etat = nouveau;
          for (const f of abonnes) f(etat);
        }
        return etat;
      },
      abonner(f) {
        abonnes.add(f);
        return () => abonnes.delete(f);
      },
      statistiques: (base, params, persoId) => statistiquesEffectives(base, etat, cat, params, persoId),
    };
  });
  return chargement;
}
