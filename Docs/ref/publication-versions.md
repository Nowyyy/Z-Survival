# Publication par versions (lot 4c) — plan provisoire (partie A)

> Document provisoire écrit en partie A ; il est complété en partie C (workflow avant/après, procédures).

## Ce que fait la publication aujourd'hui (lecture du dépôt au commit `e6cf00e`)

1. **Déclencheurs** de `.github/workflows/pages.yml` : `pull_request` (toutes branches), `push` sur `main` et `lot-*`, `workflow_dispatch`.
2. **« Un push sur une branche de lot relance le workflow sur `main` »** : le push sur `lot-N` lance le workflow **de la branche `lot-N`** ; son job `refresh` (après `quick`, droit `actions: write`) exécute `gh workflow run pages.yml --ref main` avec le `GITHUB_TOKEN` ; GitHub lance alors le workflow **de `main`** par `workflow_dispatch`, dont le job `deploy` (condition `refs/heads/main`) republie tout le site, y compris le nouvel aperçu du lot.
3. **Jobs** : `quick` (lint + Vitest, 10 min, chaque événement) ; `e2e` (Playwright en 4 tranches, 15 min, Pull Request seulement, rapport conservé en cas d'échec) ; `refresh` (voir 2) ; `deploy` (`main`, push ou `workflow_dispatch`, après `quick`).
4. **Le job `verify` (30 min) n'existe plus** : créé au lot 0-C, rallongé à 30 min et rejoué une fois au lot 1d, il a été **remplacé au lot 2c** (`0eee619`) par `quick` (lint + Vitest) et `e2e` (tranches, Pull Request). Le rejeu unique vit dans `playwright.config.js` (`retries: process.env.CI ? 1 : 0`).
5. **Concurrence** : `pages-${{ github.ref }}`, annulation seulement pour une Pull Request.
6. **Permissions** : `contents: read` par défaut ; `refresh` : `actions: write` ; `deploy` : `contents: read`, `pages: write`, `id-token: write`.
7. **Environnement** : `deploy` cible `github-pages` (URL de sortie de `deploy-pages`) ; ses règles de branches ne sont pas visibles dans le YAML (réglage du dépôt, non vérifiable par l'agent). Le dernier déploiement réussi vient de `main` (`gh run list` : 3 min 35 s).
8. **Actions** (épinglées par SHA) : `checkout` v4.2.2, `setup-node` v4.4.0, `upload-artifact` v4.6.2, `configure-pages` v5.0.0, `upload-pages-artifact` v3.0.1, `deploy-pages` v4.0.5.
9. **`npm run build`** (`scripts/build.mjs`) : copie dans `_site/` les pages (`index.html`, `jeu.html`, pages techniques), `apercu.txt`, `dev/`, `css/`, `js/`, `data/`, `fonts/`, `vendor/` ; jamais `Docs/`, `tests/`, `scripts/`.
10. **`npm run assemble`** (`scripts/assemble.mjs`, `fetch-depth: 0`) : build de `main` à la racine ; pour chaque `origin/lot-*`, un `git worktree` dans `.lots/`, son propre `scripts/build.mjs` (sinon copie de secours), copie dans `_site/lots/<lot>/` ; `_site/lots.json` (nom, hash court, date, `entry`, `nom`).
11. **`lots.json`** n'est pas versionné : il est produit par l'assembleur et lu par `/dev/` (dernier lot, dates, liens « Ouvrir ce lot »).
12. **`js/lots.js`** (pur) : `parseLot`, `compareLots`, `sortLots`, `splitLots`, `lotLabel`, `parseName`, `parseEntry`, `lotUrl` ; utilisé par `dev/dev.js`, l'assembleur et des tests (`lots`, `data-changelog`, hygiène des ateliers : `parseEntry`).
13. **`apercu.txt`** : première ligne = page d'aperçu du lot (`jeu.html`) ; ligne `nom:` (lot 4b) = nom affiché dans `/dev/` (`V0.5`).
14. **`/dev/`** (`dev/index.html`, `dev/dev.js`) : lien « Branche main », lien « Dernier lot », journal replié lu dans `data/changelog.json` (et dans le journal du dernier lot publié).
15. **`data/changelog.json`** : `versions` (V0.1 `lot-1` … V0.5 `lot-4b`, `enCours`) et `lots` (historique chronologique, une entrée par bilan). `data-changelog` exige : noms de lots valides, titre, points, un bloc par lot, une entrée par bilan, ordre chronologique, liste `versions` exacte. `dev.spec` exige l'ordre V0.5 → V0.1, « (en cours) », le repli, le lien « Ouvrir ce lot », axe, 44 px.
16. **Racine** : `index.html` est encore la page d'attente « En construction » (sans lien vers le jeu) ; le jeu est `jeu.html`.
17. **Mesures** : 28 dossiers sous `/lots/` (toutes les branches `lot-*`, `lot-0e` compris) ; voir « Références mesurées ».
18. **Ce que je ne fais pas** : aucun réglage GitHub, aucune ouverture du site publié, aucune vérification de l'environnement `github-pages`, aucune suppression ni push sur une branche de version, aucune modification du jeu ni de `jeu.html`.

## Références mesurées (base `e6cf00e`, avant tout changement)

| Mesure | Valeur |
|---|---|
| Vitest | 136 fichiers, 7 429 réussis, 7 ignorés (78 s) |
| Suite rapide Playwright | 339 réussis sur 339 (11,3 min), aucun échec ni rejeu |
| Lint | aucune erreur ni avertissement |
| Lighthouse mobile `index.html` (3 passes) | 91 / 100 / 100, CLS 0,000 aux trois passes (seuils 90 / 95 / 95, CLS ≤ 0,1) — marge de performance faible |
| Site assemblé en local (`npm run assemble`, ancien assembleur) | 82,0 Mo, 3 512 fichiers, 28 dossiers `lots/lot-*` (le plus gros : 5,1 Mo), racine 5,1 Mo ; 4 s |
| Workflow (dernier push sur `main`, run 41500417725) | 3 min 35 s : `quick` 1 min 57 s, puis `deploy` 1 min 29 s |
| Workflow (dernière Pull Request, run 41494241440) | `quick` 2 min 2 s, `e2e` 4 tranches de 2 min 1 s à 4 min 33 s |

## Architecture (confirmée, avec corrections)

| Adresse | Contenu | Source |
|---|---|---|
| `/` | version actuelle (build de `main`), accueil « Version V0.5 » + « Jouer » | `main` |
| `/next/` | dernier build de développement (bandeau « Build de développement ») | branche `dev` ; absente : page « Aucun build de développement pour l'instant » |
| `/v0.1/` … `/v0.4/` | versions figées, construites une fois par l'archiveur | branche orpheline `archive` (dossiers `v0.N/`, sans workflow) |
| `/dev/` | journal des versions V0.5 → V0.1, « Ouvrir cette version » | `data/changelog.json` + `versions.json` |
| `/lots/` | page de renvoi vers `../` ; **aucun** `/lots/lot-*` | assembleur |
| `/versions.json` | liste des versions (même origine) | `versions.json` du dépôt |
| `build-info.json` (racine, `next/`, `v0.N/`) | `{ channel, version, branch, sha, date }` | assembleur / archiveur |

Corrections par rapport au prompt :
- **`verify`** : il n'existe plus (voir 4). Je conserve son rôle tel qu'il existe aujourd'hui : `quick` (lint + Vitest, 10 min) reste le préalable de `deploy`, sans changement de contenu ; `e2e` (4 tranches, 15 min, rejeu unique par `playwright.config.js`) garde ses commandes, mais **sa condition passe de `pull_request` à « push ou `workflow_dispatch` sur `dev` »**, puisque le prompt retire le déclencheur `pull_request`. Aucun job ne teste d'URL publiée : rien à adapter aux nouvelles adresses.
- **`refresh`** disparaît (plus de déclencheur `lot-*`) : le droit `actions: write` disparaît avec lui (permissions réduites, jamais élargies).
- **`/dev/`** ne lit plus `lots.json` ; les liens viennent de `versions.json`.
- **`lots.json`** n'est plus produit ; `js/lots.js` garde ce que les tests de données utilisent (`parseLot`, `compareLots`, `parseEntry`).

## Ce que devient chaque étape du workflow

| Étape | Avant | Après |
|---|---|---|
| Déclencheurs | `pull_request`, `push` `main` + `lot-*`, `workflow_dispatch` | `push` `main` + `dev`, `workflow_dispatch` |
| `quick` | chaque événement | inchangé (chaque événement) |
| `e2e` | Pull Request | push / `workflow_dispatch` sur `dev` |
| `refresh` | push `lot-*` → relance de `main` | retiré |
| `deploy` | `main` ; `npm run assemble` (toutes les branches `lot-*`) | `main` ou `dev` ; checkout de la branche courante, de l'autre (si elle existe) et d'`archive` (si elle existe) ; `npm ci` + `npm run build` pour `main` et `dev` ; assembleur ; mêmes actions Pages |
| Concurrence | `pages-<ref>`, annulation sur PR | groupe unique `pages`, **sans annulation** |

## Fichiers à modifier (parties B et C)
`scripts/versions/` (schéma, archiveur, vérificateur), `scripts/site/` (serveur local, site de test), `scripts/assemble.mjs`, `js/lots.js` (réduit), `index.html` + `css/accueil.css` + `js/accueil/`, `dev/index.html` + `dev/dev.js`, `data/i18n/fr.json` et `en.json` (clés de l'accueil et de `/dev/`, voir le bilan), `data/changelog.json` (entrée `lot-4c` dans `lots`), `versions.json`, `package.json` (scripts), `playwright.config.js` (`ESSENTIAL` et serveur du site de test), `.github/workflows/pages.yml`, tests (`versions-*`, `assemble`, `accueil`, `publication.spec`, adaptations listées dans le bilan).

## Risques
- **Déclencheurs** : sans `pull_request`, une Pull Request n'a plus de vérification automatique (ni `quick` ni `e2e`) ; la vérification se fait au push sur `dev`. À confirmer par le propriétaire (point ouvert).
- **Vieux workflows** des branches de version (tableau de `versions-correspondance.md`) : leur `deploy` exige `main`, leur `refresh` relance le workflow de `main` ; risque faible, neutralisé par la règle d'environnement (`main` et `dev` seulement).
- **Environnement `github-pages`** : par défaut, il n'autorise souvent que la branche par défaut ; un push sur `dev` serait refusé au déploiement tant que `dev` n'est pas autorisé (réglage du propriétaire).
- **Concurrence** : un seul groupe sans annulation ; GitHub ne garde qu'un run en attente par groupe (le plus récent remplace l'ancien en attente) : sans perte, car chaque run construit les têtes actuelles de `main` et `dev`.
- **Taille** : racine + `next/` + 4 archives (mesures en B) ; plafond de l'assembleur 900 Mo (limite publiée 1 Go) ; aucun fichier de plus de 50 Mo.
- **Durée** : deux `npm ci` + deux builds au lieu de 27 builds de lots ; les archives ne sont jamais reconstruites par le workflow.
- **Archives** : une version ancienne peut ne pas se construire (paquet disparu, ancien format) : elle est alors `indisponible`, jamais corrigée.

## Retour arrière
- Avant fusion : rien à faire (le site en ligne ne change pas tant que `lot-4c` n'est pas dans `main`).
- Après fusion : `git revert -m 1 <hash de la fusion de lot-4c>` dans une branche, Pull Request vers `main`, puis `workflow_dispatch` ; ou restaurer seulement l'ancien workflow et l'ancien assembleur (`git checkout e6cf00e -- .github/workflows/pages.yml scripts/assemble.mjs dev js/lots.js index.html`). Les branches `lot-*` n'ayant jamais été supprimées, l'ancien site se reconstruit à l'identique.
