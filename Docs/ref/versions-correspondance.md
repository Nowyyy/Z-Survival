# Correspondance des versions (lot 4c-A)

Relevé le 2026-11-02 sur `origin` (après `git fetch origin --prune`). Les hash sont **gelés** dans `versions.json` (champ `ref`) : l'archive d'une version est construite depuis ce commit, jamais depuis la tête de la branche (qui pourrait bouger). Les branches restent la source des versions et ne sont jamais supprimées.

## Versions

| Version | Branche | Hash gelé (`ref`) | Date du commit | Résumé (déduit du plan des lots, à confirmer par le propriétaire) | Contrôle par l'historique | Doute |
|---|---|---|---|---|---|---|
| V0.1 | `lot-1` | `1ffbf76e8521a8cfc384b603e90d422842d5d8e3` | 2026-10-26 | Cœur du jeu sur le premier moteur 2D, retiré au lot 1m au profit de Three.js (nom exact dans `versions.json` : ce dossier ne cite pas l'ancienne bibliothèque, règle du lot 1m) | tête « Lot 1 — Bilan mis à jour », après la fusion #1 ; `devDependencies` : l'ancienne bibliothèque 2D (pas `three`) ; `apercu.txt` : `jeu.html`, « Cœur du jeu » | aucun |
| V0.2 | `lot-1d` | `8a098f02510d03ea97dffb8a9bdce3ab6bc5bdba` | 2026-10-27 | Jeu en Three.js : monde, textures, personnages, sons | contient `lot-1`, `lot-1m` (Three.js), `lot-1b` (monde), `lot-1c` (textures, personnages) ; ajoute les sons (`synth.js`, `sons.html`) ; `devDependencies` : `three` | aucun |
| V0.3 | `lot-2c` | `0eee61905f1a3d1dd102949b7752392d8d7439cc` | 2026-10-27 | Vagues, allures et types de zombies, cône de tir, statistiques, animation de manche, effet VHS | contient `lot-1d`, `lot-2` (vagues, allures), `lot-2b` (cône, statistiques) ; 2c-A/2c-B : animation de vague, VHS, ambiance | mineur : la tête de `lot-2c` est un commit de workflow (« Workflow allégé ») postérieur au bilan ; le jeu est celui de 2c-B |
| V0.4 | `lot-3e` | `b4a0e315d644ce934894549dee8c8bd044bfaa68` | 2026-10-30 | Fenêtres à planches, carte à deux étages, escaliers, portes qui s'ouvrent par manche | contient `lot-2c`, `lot-3` (fenêtres, siège), `lot-3a`, `lot-3c` (zones, portes) ; 3e : étage, escaliers, portes 2 et 3 | mineur : le dernier commit de `lot-3b` (`c8ffcd3`, tests e2e seulement) n'est pas dans `lot-3e` ; le contenu du jeu de 3b y est (carte du rez-de-chaussée) |
| V0.5 | `lot-4b` | `e6cf00e0392250d1125e4c14c11a91837fca29db` | 2026-11-02 | Version actuelle : argent et sauvegarde, refontes (carte, sons, interface, personnages, sang) | **commit de fusion** « Merge pull request #20 from Nowyyy/lot-4b » dans `main` (parents : `a8e5a9d` de `main`, `3d60823` = tête de `lot-4b`) ; `lot-4b` ⊂ `main` (`git merge-base --is-ancestor`) | aucun ; à noter : trois fusions de `lot-4b` (#18, #19, #20), la dernière est retenue (elle est égale à `origin/main` au relevé) |

Aucune branche ne contredit sa description : **pas d'arrêt après la partie A**. Les deux doutes mineurs ne changent pas le contenu du jeu ; ils sont à confirmer par le propriétaire en même temps que les descriptions.

## Contrôle des refs et des déclencheurs

Chaque commit existe (`git cat-file -e <hash>^{commit}`), porte un `package.json` avec `"build": "node scripts/build.mjs"` et un seul workflow, `.github/workflows/pages.yml`.

| Version | Branche | Hash | Jobs du workflow à ce commit | Déclencheurs `push` | Risque qu'un push sur la branche redéploie un ancien site |
|---|---|---|---|---|---|
| V0.1 | `lot-1` | `1ffbf76` | `verify` (30 min), `refresh`, `deploy` | `main`, `lot-*` (+ `pull_request`, `workflow_dispatch`) | **faible** : `deploy` exige `github.ref == 'refs/heads/main'` ; `refresh` relance le workflow **de `main`** (`gh workflow run pages.yml --ref main`), qui republie le site courant, pas l'ancien |
| V0.2 | `lot-1d` | `8a098f0` | `verify` (30 min, rejeu), `refresh`, `deploy` | idem | faible (mêmes conditions) |
| V0.3 | `lot-2c` | `0eee619` | `quick`, `e2e` (Pull Request), `refresh`, `deploy` | idem | faible (mêmes conditions) |
| V0.4 | `lot-3e` | `b4a0e31` | `quick`, `e2e`, `refresh`, `deploy` | idem | faible (mêmes conditions) |
| V0.5 | `lot-4b` | `e6cf00e` (fusion dans `main`) | `quick`, `e2e`, `refresh`, `deploy` | idem | faible (mêmes conditions) |

Risques résiduels, d'où le réglage demandé au propriétaire (**Settings → Environments → `github-pages` → Deployment branches : `main` et `dev` seulement**) :
- un vieux workflow modifié sur une de ces branches (par erreur) pourrait retirer la condition `refs/heads/main` : l'environnement le refuserait alors ;
- un push sur une branche de version déclenche toujours `refresh`, qui relance le **nouveau** workflow de `main` : sans danger (republication du site courant), mais inutile ; c'est pourquoi aucun agent ne pousse sur ces branches ;
- la branche `archive` ne contient **aucun** fichier de workflow : un push sur `archive` ne déclenche rien.
