# Publication par versions (lot 4c)

**Noms affichés (demande du propriétaire)** : `main` = **Recette** (racine du site, canal technique `release`), `dev` = **Développement** (`/next/`, canal `dev`). Les branches gardent leurs noms ; la **Production** viendra plus tard, avec un serveur.

Écrit en partie A (inventaire, plan), complété en partie C (réalisation, workflow avant/après, procédures). Correspondance des versions : `Docs/ref/versions-correspondance.md` ; contrôle des archives : `Docs/ref/verification-versions.md`.

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

## Fichiers modifiés (parties B et C)
`scripts/versions/` (schéma, archiveur, vérificateur), `scripts/site/` (serveur local, site de test), `scripts/assemble.mjs`, `js/lots.js` (réduit), `index.html` + `css/accueil.css` + `js/accueil/`, `dev/index.html` + `dev/dev.js`, `data/i18n/fr.json` et `en.json` (clés de l'accueil et de `/dev/`, voir le bilan), `data/changelog.json` (entrée `lot-4c` dans `lots`), `versions.json`, `package.json` (scripts), `playwright.config.js` (`ESSENTIAL` et serveur du site de test), `.github/workflows/pages.yml`, tests (`versions-*`, `assemble`, `accueil`, `publication.spec`, adaptations listées dans le bilan).

## Risques
- **Déclencheurs** : sans `pull_request`, une Pull Request n'a plus de vérification automatique (ni `quick` ni `e2e`) ; la vérification se fait au push sur `dev`. À confirmer par le propriétaire (point ouvert).
- **Vieux workflows** des branches de version (tableau de `versions-correspondance.md`) : leur `deploy` exige `main`, leur `refresh` relance le workflow de `main` ; risque faible, neutralisé par la règle d'environnement (`main` et `dev` seulement).
- **Environnement `github-pages`** : par défaut, il n'autorise souvent que la branche par défaut ; un push sur `dev` serait refusé au déploiement tant que `dev` n'est pas autorisé (réglage du propriétaire).
- **Concurrence** : un seul groupe sans annulation ; GitHub ne garde qu'un run en attente par groupe (le plus récent remplace l'ancien en attente) : sans perte, car chaque run construit les têtes actuelles de `main` et `dev`.
- **Taille** : racine + `next/` + 4 archives (mesures en B) ; plafond de l'assembleur 900 Mo (limite publiée 1 Go) ; aucun fichier de plus de 50 Mo.
- **Durée** : deux `npm ci` + deux builds au lieu de 27 builds de lots ; les archives ne sont jamais reconstruites par le workflow.
- **Archives** : une version ancienne peut ne pas se construire (paquet disparu, ancien format) : elle est alors `indisponible`, jamais corrigée.

## Réalisation (partie C)

### `versions.json` (racine du dépôt)
`{ schema: 1, latest, versions: [{ id, label, title, date, branch, ref, entry, status, note }], dev: { branch, path } }` ; schéma pur `scripts/versions/schema.mjs` (`validateVersions`, `checkChangelogConsistency`, `versionPath`). Statuts : `actuelle` (une seule, = `latest`, servie à la racine), `archive` (dossier `v0.N/` de la branche `archive`), `indisponible` (raison dans `note`). Chaque version correspond à une entrée de `data/changelog.json` → `versions` (même libellé, même branche) et réciproquement (tests `versions-schema`, `data-changelog`).

### Archiveur et vérificateur (partie B)
`npm run archive -- --id v0.N --ref <hash>` ou `--all` (`--dry-run`, `--replace`, `--no-push`) ; `node scripts/versions/verifier.mjs` (sans argument : contenu de `origin/archive`). Détails et résultats : `verification-versions.md`.

### Assembleur (`scripts/assemble.mjs`)
`node scripts/assemble.mjs --main <build de main> [--dev <build de dev>] [--archive <branche archive extraite>] [--versions versions.json] [--out _site] [--max-mb 900]` (ou `SITE_MAIN`, `SITE_DEV`, `SITE_ARCHIVE`, `SITE_VERSIONS`, `SITE_OUT`, `SITE_MAX_MB`) ; sans `--main`, il construit l'arbre courant. Produit : racine = build de main + `build-info.json` (`release`) ; `next/` = build de dev + `build-info.json` (`dev`, hash court, date UTC) ou, sans dev, une page « Aucun build de développement pour l'instant » (et un `build-info.json` au hash vide) ; `v0.N/` copiés seulement s'ils existent (sinon la version est publiée `indisponible`, « Archive non construite ») ; `versions.json` à la racine et dans `next/` ; `lots/index.html` (« Les aperçus par lot ont été retirés. », lien vers `../`) ; jamais de `lots/lot-*` ni de `lots.json`. Échecs clairs : racine sans `index.html`, version actuelle introuvable, `versions.json` invalide, site au-delà du plafond (900 Mo par défaut). Déterministe : aucune horloge (les dates viennent de git ou des arguments).
- `build-info.json` du dépôt : canal `source` (arbre non publié) ; il évite une requête en échec quand le dépôt est servi en local (tests, Lighthouse) et il est remplacé dans le site publié.

### Accueil (`index.html`, `css/accueil.css`, `js/accueil/`)
`home.js` (pur) construit la page d'après `build-info.json` et `versions.json` du dossier courant (lus en parallèle, préchargés) : « Version V0.5 », « Jouer » (entrée de la version actuelle), section « Développement » (« Dernier build de développement » avec hash et date lus dans `next/build-info.json`, sinon « Aucun build de développement pour l'instant » ; « Journal des versions »), « Versions précédentes » (V0.4 → V0.1 vers leur entrée ; `indisponible` : texte non cliquable avec sa raison). Dans `next/` (canal `dev`) : bandeau « Build de développement — <hash> — <date> », section « Développement » masquée, liens des versions vers `../v0.N/`. `<noscript>` : message bilingue et liens statiques vers `jeu.html`, `next/`, `dev/`. Textes : clés `home.*` et `site.*` de `data/i18n/fr.json` et `en.json`.

### Journal `/dev/`
Structure par versions inchangée (liste `versions`, historique `lots`, repli, ordre V0.5 → V0.1). Les liens « Ouvrir cette version » viennent de `versions.json` : `../` pour l'actuelle, `../v0.N/<entrée>` pour une archive (l'`index.html` des anciennes versions est leur page d'attente « En construction »), aucun pour une version indisponible ; dates de `versions.json`. Plus de lien « Dernier lot », plus de `lots.json` ; aucun identifiant de lot affiché. Depuis `next/dev/`, les liens remontent à la racine (`build-info.json` du dossier parent : canal `dev`).

### Exécution locale
- `npm run site` (`scripts/site/local.mjs`) : la séquence du job `deploy` avec des worktrees (main = `HEAD`, dev = `origin/dev` ou `--dev <ref>`, archive = `origin/archive`), `npm ci`, `npm run build`, assembleur de main → `_site/` ; puis `npm run serve:site` (`http://localhost:4180/Z-Survival/`, préfixe simulé : un lien absolu y échoue).
- Exécution à blanc du lot (main = dev = `HEAD`, archive = `origin/archive` `6d8c1bc`) : 13,5 s, `_site/` de 20,2 Mo et 906 fichiers ; racine, `next/`, `dev/`, `lots/`, `v0.1/` à `v0.4/`, `jeu.html` et `next/jeu.html` chargés dans Chromium sous `/Z-Survival/` sans erreur de console ni ressource manquante ; `lots/lot-4b/` : 404.
- Tests de bout en bout : `scripts/site/e2e-site.mjs` assemble un site de test (archives fictives, V0.1 indisponible) servi sur le port 4174 (`playwright.config.js`).

## Workflow avant / après

| | Avant (`e6cf00e`) | Après (lot 4c) |
|---|---|---|
| Déclencheurs | `pull_request` ; `push` sur `main`, `lot-*` ; `workflow_dispatch` | `push` sur `main`, `dev` ; `workflow_dispatch` |
| Concurrence | `pages-${{ github.ref }}`, annulation sur Pull Request | `pages`, `cancel-in-progress: false` |
| `quick` | lint + Vitest, 10 min, à chaque événement | inchangé |
| `e2e` | Pull Request, 4 tranches, 15 min, rapport en cas d'échec | `github.ref == refs/heads/dev` (push ou lancement manuel), mêmes commandes |
| `refresh` | push `lot-*` → `gh workflow run pages.yml --ref main` (`actions: write`) | retiré |
| `deploy` | `main` ; checkout complet (`fetch-depth: 0`), `npm run assemble` (28 branches `lot-*`) | `main` ou `dev`, après `quick` ; checkout de `main` (`path: main`), sonde `git ls-remote --heads origin dev archive`, checkouts facultatifs de `dev` et `archive` ; `npm ci && npm run build` dans `main` et `dev` ; `node main/scripts/assemble.mjs …` ; mêmes actions Pages |
| Permissions | `contents: read` ; `actions: write` (refresh) ; `pages: write`, `id-token: write` (deploy) | `contents: read` ; `pages: write`, `id-token: write` (deploy) |
| Actions | checkout v4.2.2, setup-node v4.4.0, upload-artifact v4.6.2, configure-pages v5.0.0, upload-pages-artifact v3.0.1, deploy-pages v4.0.5 | les mêmes, mêmes SHA |

Validation : relecture ; `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pages.yml'))"` (déclencheurs `push: [main, dev]`, `workflow_dispatch` ; jobs `quick`, `e2e`, `deploy`) ; tests `workflow` et `publication` ; exécution à blanc locale ci-dessus. **Non vérifié par l'agent** : exécution réelle sur GitHub, environnement `github-pages`, réglages du dépôt.

## Procédure de publication d'une version (exemple : V0.6)
1. Vérifier `dev` : tests (`npm run lint`, `npm test`, `npm run test:e2e`, le job `e2e` du push sur `dev`), puis l'aperçu `https://nowyyy.github.io/Z-Survival/next/`.
2. Archiver la version qui va être remplacée : `git fetch origin`, puis `node scripts/versions/archiver.mjs --id v0.5 --ref <hash du main actuel>` (`git rev-parse origin/main`) ; contrôle : `node scripts/versions/verifier.mjs`.
3. Pull Request `dev` → `main` avec « Create a merge commit », nommée « V0.6 ».
4. Mettre à jour `versions.json` (`latest: "v0.6"`, nouvelle entrée `actuelle` avec le hash de la fusion, V0.5 en `archive` avec le hash archivé) et la liste `versions` de `data/changelog.json` (V0.6, sans `enCours` sur V0.5) ; adapter `data-changelog`, `dev.spec`, `versions-schema`.
5. Déclencher le workflow (onglet Actions → Pages → Run workflow sur `main`) et vérifier le site publié (racine, `/v0.5/`, `/dev/`).

## Build de développement
Une branche de correctif est fusionnée dans `dev` (Pull Request vers `dev`) ; le push sur `dev` lance `quick`, `e2e` et `deploy` : `https://nowyyy.github.io/Z-Survival/next/` montre le bandeau « Build de développement — <hash> — <date> ». La racine n'est pas touchée (elle est reconstruite depuis la tête de `main`).

## Retour arrière
- Avant fusion : rien à faire (le site en ligne ne change pas tant que `lot-4c` n'est pas dans `main`).
- Après fusion : `git revert -m 1 <hash de la fusion de lot-4c>` dans une branche, Pull Request vers `main`, puis `workflow_dispatch` ; ou restaurer seulement l'ancien workflow et l'ancien assembleur (`git checkout e6cf00e -- .github/workflows/pages.yml scripts/assemble.mjs dev js/lots.js index.html`). Les branches `lot-*` n'ayant jamais été supprimées, l'ancien site se reconstruit à l'identique. La branche `archive` peut rester (sans workflow, elle ne déclenche rien).

## Suppression des anciennes branches (« Phase 2 »)
Faite **par le propriétaire, jamais par un agent**, après la vérification de V0.1 à V0.5 et une sauvegarde complète du dépôt (`git clone --mirror`, puis `git bundle create … --all`). Elle **garde** `main`, `dev`, `archive` et les branches de `versions.json` (`lot-1`, `lot-1d`, `lot-2c`, `lot-3e`, `lot-4b`).

## Réglages GitHub à vérifier (par le propriétaire)
- Settings → Pages : source « GitHub Actions ».
- Settings → Environments → `github-pages` → Deployment branches : `main` et `dev` seulement (sans `dev`, le déploiement depuis `dev` est refusé ; sans restriction, le vieux workflow d'une branche de version pourrait publier).
- Après la fusion de `lot-4c` : créer `dev` depuis `main`, puis lancer le workflow à la main.
