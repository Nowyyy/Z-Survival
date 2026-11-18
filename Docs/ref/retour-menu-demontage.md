# Démonter le retour au menu sans rechargement (lot 9d)

Option à l'essai, demande du propriétaire. Fonctionnement : `Docs/ref/retour-menu.md`.

**Ce qu'elle fait** : « Quitter » et « Revenir au menu principal » ne rechargent pas `jeu.html`. La partie est détruite, puis un menu neuf est chargé (écran de chargement, sauvegarde relue, onglet Jouer). Le plein écran reste.

**Sans elle (comme avant le lot 9d)** : la page est rechargée. Le navigateur sort alors du plein écran ; le menu affiche « Touchez l'écran pour revenir en plein écran » et reprend le plein écran au premier geste (repère `#plein-ecran`, ou `#retour` hors plein écran).

## 1. Désactiver (une ligne, réversible)
1. Dans `js/core/menu-etat.js`, remplacer `export const RETOUR_SANS_RECHARGEMENT = true;` par `export const RETOUR_SANS_RECHARGEMENT = false;`.
2. Rien d'autre à changer. Les tests suivent la constante : ceux du retour sans rechargement sont sautés (`tests/e2e/retour-menu.spec.js`), les autres attendent le rechargement (`menu.spec`, `studio.spec`, `options-menu.spec`). Les données de la partie (soldes, record, Profil, Infini) restent vérifiées dans les deux cas.
3. Pour revenir en arrière : remettre `true`.

Essai sans toucher au code, sous `?test=1` : dans la console, `__zsCycle.rechargement()`, puis « Quitter » (vaut pour la page ouverte seulement).

## 2. Retirer le code (option abandonnée pour de bon)
À retirer :
- La constante `RETOUR_SANS_RECHARGEMENT` (`js/core/menu-etat.js`) et `sansRechargement` (`js/menu/chargement.js`).
- Dans `js/menu/demarrage.js` :
  - `menuQuitter` : garder seulement `return menuRetour();` ;
  - supprimer `chargerMenu`, `chargementMenu`, `rechargementForce` et l'entrée `rechargement` de `__zsCycle`.
- `revenir()` (`js/menu/sons/sons.js`) et `revenirSons` (`js/menu/chargement.js`).
- Les tests qui lisent la constante : les tests sautés de `retour-menu.spec.js` ; les branches `RETOUR_SANS_RECHARGEMENT` de `menu.spec`, `studio.spec`, `options-menu.spec`, en ne gardant que le chemin par rechargement.
- Le paragraphe « Lot 9d » de `Docs/ref/menu-principal.md`, la section « Retour au menu » de `Docs/ref/retour-menu.md` et ce fichier.

À garder, utile même avec le rechargement :
- La libération de la partie (`js/game/liberation.js`, `liberer()` des modules ; « Lot 9d-B »). Elle n'est simplement plus appelée.
- La destruction du menu à « JOUER » (`detruire()` de `js/menu/menu.js`, `detruireProgression`, `surDestruction`, `oublierProfil`) : elle rend la mémoire du menu pendant la partie.
- Le `PerformanceObserver` déconnecté (`js/menu/chargement.js`).
- Les comptes de modules (`tests/e2e/graphismes.spec.js`) et le démarrage allégé (`js/menu/adresse.js` ; « Lot 9d-D »).

**Ne pas annuler les commits « Lot 9d-C », « 9d-F » ou « 9d-G » en bloc** : ils contiennent aussi ces corrections.
