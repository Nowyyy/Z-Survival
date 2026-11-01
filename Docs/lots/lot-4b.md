# Lot 4b — Intégration des refontes (V0.5, en cours)

**Rôle** : branche d'intégration `lot-4b`, partie de `main` (`c166e53`, lot 4) ; les refontes y sont fusionnées avant d'entrer dans `main` (jamais de fusion directe dans `main` depuis un lot). Aperçu : `…/lots/lot-4b/jeu.html` (nom affiché : V0.5).

**Contenu à ce jour**
- `lot-3g` (atelier de la carte) fusionné (`7e5e6ed`), un seul conflit (`apercu.txt`, première ligne de `lot-4b` gardée) ; correctif d'intégration `af5bba4` (test d'aperçu). Manifeste : `Docs/ref/fusion-3g.md`.
- Nom affiché d'un lot : ligne `nom:` de `apercu.txt` (`js/lots.js` : `parseName`, `lotLabel(name, nom)`), recopiée par `scripts/assemble.mjs` dans `lots.json` (champ `nom`) et affichée par `/dev/`. La branche et l'adresse restent `lot-4b`.
- Journal de `/dev/` : seulement les versions majeures, de la plus récente (en haut) à la plus ancienne : V0.5 `lot-4b` (en cours), V0.4 `lot-3e`, V0.3 `lot-2c`, V0.2 `lot-1d`, V0.1 `lot-1`. Liste `versions` de `data/changelog.json` ; les autres lots restent dans `lots` (historique), masqués.

## Règle pour les prochains lots (demande du propriétaire)
**Un nouveau lot n'apparaît plus dans l'interface de `/dev/`.** Il continue d'ajouter son entrée dans `data/changelog.json` → `lots` (historique, exigé par `data-changelog` : une entrée par bilan), mais **n'ajoute rien à la liste `versions`** et ne met pas de ligne `nom:` dans son `apercu.txt`. **C'est le propriétaire qui indique quand une version est ajoutée** (numéro `V0.x`, lot concerné) ; alors seulement, une entrée est ajoutée à `versions`, et les tests `data-changelog` et `dev.spec` sont adaptés.

**Lignes à ajouter à `CLAUDE.md` et `conventions.md` à l'entrée dans `main`** (une seule fois pour tous les lots) : celles de `Docs/lots/lot-3g.md`, et pour cette règle :
- `- Journal de /dev : seulement les versions de data/changelog.json → versions (V0.x) ; un nouveau lot ajoute son entrée à lots, jamais à versions : le propriétaire dit quand.`

**Tests** : `lots.test.js` (nom affiché), `data-changelog` (lot courant `lot-4b`, liste `versions`), `dev.spec` (ordre V0.5 → V0.1, « (en cours) », anciens lots absents, lien « Ouvrir ce lot »).

**À savoir** : la page `/dev/` publiée et l'assemblage du site sont ceux de `main` ; le nom affiché et le journal par versions ne seront visibles sur le site qu'après l'entrée de `lot-4b` dans `main`.
