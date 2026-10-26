# Bilan du lot 0b — Aperçus par branche et page /dev

Branche `lot-0b`.

## Ce qui est fait
- **Page `/dev/`** dans la charte « sang noir » : lien vers la branche `main`, lien vers le dernier lot, menu déroulant des anciens lots (sélection puis bouton « Ouvrir », accessible au clavier), français et anglais, `noindex`.
- **Aperçu de chaque branche de lot** publié sous `/lots/<lot>/`, construit avec le propre `build` de la branche.
- **`npm run assemble`** (`scripts/assemble.mjs`) : assemble la racine (main), les lots et `_site/lots.json`.
- **Workflow** : `push` sur `lot-*` et `workflow_dispatch` ajoutés ; un push sur un lot relance le déploiement depuis `main` (job `refresh`, `GITHUB_TOKEN`, droit `actions: write` limité à ce job). Le déploiement ne se fait que depuis `main`.
- Logique pure `js/lots.js` (tri, dernier lot, anciens lots), socle commun `js/page.js` (langue, textes, taches) utilisé par l'accueil et `/dev/`.
- Titre du jeu : « Z-Survival » ; taille du titre réduite pour tenir sur une ligne.

## URL
- Le jeu : `https://nowyyy.github.io/<nom du dépôt>/`. Pour obtenir `https://nowyyy.github.io/Z-Survival/`, le dépôt doit s'appeler `Z-Survival` (GitHub Settings > General > Repository name). Je ne peux pas le renommer.
- `/dev/` : `https://nowyyy.github.io/Z-Survival/dev/` (sans le `/` final, GitHub redirige).

## Preuves
- Voir le message de livraison (lint, tests unitaires, Playwright, assemble, captures).

## Points à savoir
- Le workflow ne peut être exécuté qu'après fusion dans `main` (le déploiement ne part que de `main`). Avant, le menu `/dev/` n'existe pas en ligne.
- Tant que `main` ne contient pas `workflow_dispatch`, la relance depuis un lot est refusée sans conséquence (`continue-on-error`).
- La liste des lots vient des branches `origin/lot-*` : une branche supprimée disparaît du menu (les branches de lot ne sont jamais supprimées).
- En local, `/dev/` affiche « liste indisponible » (pas de `lots.json`) ; `npm run assemble` le génère.

## Reste à faire
Aucun critère non atteint, hormis le renommage du dépôt (propriétaire) et la première exécution réelle du workflow après fusion.
