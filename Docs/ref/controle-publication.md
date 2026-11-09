# Contrôle de publication (lot 5o ; CI de dev : lot 5q)

`scripts/publication/controler.mjs` vérifie, **en lecture seule**, qu'un état est prêt à être publié (avant la fusion `dev` → `main`) et qu'il a bien été publié (après). Il ne pousse rien, ne récupère rien (`git fetch` reste à faire soi-même), n'écrit rien dans le dépôt et n'appelle l'API de GitHub qu'en `GET`.

## Lancer

```
git fetch origin --prune
npm run publication:controle                 # --avant (par défaut) : avant la Pull Request dev → main
npm run publication:controle -- --apres      # après la fusion et le déploiement de main
npm run publication:controle -- --sans-build # saute la construction et l'assemblage (contrôle 11 « non vérifiable »)
npm run publication:controle -- --json /tmp/controle.json   # copie JSON du résultat, chemin HORS du dépôt seulement
```

Il faut `git` (les références `origin/*` du dernier `git fetch`), `gh` connecté (lecture de l'API REST) et, pour `--apres`, `curl` et l'accès au réseau. Le contrôle 11 fait un assemblage local complet (`scripts/site/local.mjs`, `npm ci` et `npm run build` dans des copies `git worktree` temporaires, sortie dans un dossier temporaire supprimé à la fin) : quelques minutes.

## Lire le résultat

Un tableau `contrôle | résultat | détail`, puis le résumé. Résultats :

| Résultat | Sens |
|---|---|
| **OK** | vérifié et conforme |
| **KO** | vérifié et non conforme : la publication doit attendre |
| **ATTENTION** | conforme mais à regarder (le détail dit quoi) ; ne bloque pas |
| **NON VÉRIFIABLE** | le contrôle n'a pas pu aboutir (réseau refusé, `gh` absent ou refusé, hash absent en local, construction sautée) ; **jamais compté comme OK** ; ne bloque pas, mais doit être vérifié autrement |

Le résumé met d'abord les ATTENTION et les NON VÉRIFIABLE, puis « **PRÊT À PUBLIER** » (aucun KO) ou « **PAS PRÊT : n KO** » (`--apres` : « PUBLICATION VÉRIFIÉE » ou « PUBLICATION INCOMPLÈTE »). Code de sortie : 0 sans KO, 1 avec au moins un KO, 2 pour une option invalide.

## Contrôles `--avant`

| # | Contrôle | OK si | Sinon |
|---|---|---|---|
| 0 | références `origin/*` à jour | `git ls-remote --heads origin` = références locales | ATTENTION : `git fetch origin --prune` puis relancer |
| 1 | dev | `origin/dev` existe ; bilan `Docs/lots/lot-5o.md` ou le dernier présent (lot 5p : `lot-5o.md` est regroupé dans `Docs/lots/versions/v0.7.md` ; le contrôle cite alors le dernier bilan séparé, `lot-5p.md`) | KO sans `origin/dev` |
| 2 | CI de dev | **Pages** : exécution réussie sur le hash de `origin/dev`, aucune en cours ; **Tests** (lot 5q) : le dernier commit testé avec succès de la lignée de `dev` est la tête, ou seuls des fichiers ignorés par `tests.yml` ont changé depuis (voir « CI de dev : dernier commit testé ») | KO (Pages absente, en cours ou échouée ; Tests : fichier non ignoré changé, dernière exécution en échec, aucun commit testé dans les 50 derniers) ; NON VÉRIFIABLE (Tests en cours, `tests.yml` illisible) |
| 3 | main ancêtre de dev | `git merge-base --is-ancestor origin/main origin/dev` | KO avec le geste : Pull Request `main` → `dev`, « Create a merge commit », sans « Resolve conflicts » |
| 4 | Pull Requests ouvertes | aucune vers `main` ou `dev` | ATTENTION avec la liste |
| 5 | `versions.json` (de `dev`) | schéma valide ; `latest` « actuelle », son `ref` ancêtre de `origin/dev` ; la version remplacée (`latest` de `main`) est « archive » et son `ref` = `v0.N/build-info.json` de `origin/archive` | KO (version non préparée, non archivée, ref différent) |
| 6 | fichier des noms | analysé sans erreur (`scripts/site/noms.mjs`) ; bloc `[v0.N]` de `latest` ; nom ≤ 60, description ≤ 200 | KO ; ATTENTION si nom ou description manque, ou texte identique à un brouillon connu (liste vide par défaut) |
| 7 | évolutions après publication | `evolutions` de `site-info.json` vide avec le `versions.json` de `dev` (noms appliqués, comme l'assembleur) | KO avec les lots d'une version non publiée |
| 8 | seed | `Docs/seed.md` cite « version publiée (Recette) : V0.N » = `latest` ; dernier commit du seed par le propriétaire (login REST, ou `scripts/publication/proprietaires.json` s'il existe) | KO (version citée) ; ATTENTION (auteur) |
| 9 | `CLAUDE.md` | ≤ 8 400 caractères, marge ≥ 150 (comptés en caractères ; ATTENTION aussi si la marge comptée en octets passe sous 150) | ATTENTION (marge 100 à 149) ; KO (marge < 100) |
| 10 | palier complet | dernière exécution réussie de `Tests` sur `essai/complet-*` ; code identique à `dev` hors `Docs/`, noms, `versions.json`, journal | KO « palier complet à refaire sur le contenu final » ; ATTENTION si `tests/dernier-complet.json` vaut `null` |
| 11 | construction et site | assemblage local réussi ; racine : `index.html`, `Recette/`, `dev/`, `v0.*`, `404.html` ; `zs-canal` `release` et `dev` | KO ; NON VÉRIFIABLE avec `--sans-build` |
| 12 | workflows | `.github` identique entre `main` et `dev` | ATTENTION : `pages.yml` utilise l'assembleur de la branche qui déclenche, le déploiement de `main` changera |
| 13 | branches | toutes les `lot-*` dans `dev` | ATTENTION avec leurs hash ; nombre de branches `essai/*` (information) |
| 14 | dépendances | `dependencies` vide | KO |

## CI de dev : dernier commit testé (lot 5q)

`tests.yml` ne tourne pas sur un push qui ne touche que des chemins de son `paths-ignore` (`Docs/**`, `**/*.md`), ni sur un push dont le diff est vide (retour de `main` dans `dev` : fusion `35f3d09`, Pages seul). Exiger une exécution Tests sur le hash exact de la tête rendait donc « KO » à tort après le commit du seed (`36db387`) ou après ce retour. Règle :

1. **Lignée** : `git log --first-parent --format=%H -n 50 origin/dev` (tête d'abord) ; exécutions : celles du hash de la tête (`actions/runs?head_sha=…`) et celles de Tests sur `dev` (`actions/workflows/tests.yml/runs?branch=dev`).
2. **Référence** : le commit le plus récent de la lignée qui a une exécution Tests **conclue** sur ce hash même (événement `push` ou lancement manuel ; une Pull Request teste un commit de fusion, pas ce hash). Annulée, sautée ou périmée : ne conclut rien, on remonte. Plusieurs exécutions : la plus récente compte.
3. **Chemins ignorés** : lus dans `.github/workflows/tests.yml` de `origin/dev` (`on:` → `push:` → `paths-ignore:`, liste entre crochets ou à tirets), jamais recopiés ; correspondance comme GitHub (`*` sans `/`, `**` tout, `**/` zéro ou plusieurs dossiers). Fonctions pures : `scripts/publication/chemins-ignores.mjs`.
4. **Fichiers** : `git diff --name-only --no-renames -z <référence> origin/dev` (noms bruts : espaces, accents, caractères de contrôle).

| Situation | Résultat | Message |
|---|---|---|
| tête testée avec succès | OK | « dernier commit testé : <hash> (tête de dev, <exécution>) » |
| depuis la référence, rien ou seulement des chemins ignorés | OK | « dernier commit testé : <hash> (<exécution>) ; depuis : <fichiers>, ignorés par les tests » ou « depuis : aucun fichier » |
| au moins un fichier non ignoré | KO | « fichiers non ignorés par tests.yml : <liste> » |
| dernière exécution conclue en échec | KO | « <conclusion> sur <hash> » (jamais de saut vers un succès plus ancien) |
| aucun commit testé avec succès dans les 50 derniers | KO | « aucun commit testé avec succès dans les 50 derniers » |
| Tests en cours sur la tête (ou sur la référence) | NON VÉRIFIABLE | « en cours … : relancer le contrôle à la fin » |
| `tests.yml` absent, de forme non gérée, sans `paths-ignore`, motif non géré (`?`, `+`, `[`, `{`, `!`) | NON VÉRIFIABLE | « chemins ignorés illisibles (<raison>) » ; jamais OK |

Tests : `tests/unit/publication-ci-tests.test.js` (données fictives, aucun réseau).

## Contrôles `--apres`

| # | Contrôle | OK si | Sinon |
|---|---|---|---|
| 0 | références `origin/*` à jour | comme ci-dessus | ATTENTION |
| 1 | contenu de main = dev | `git diff origin/dev origin/main` vide (les commits de fusion diffèrent, pas les arbres) | KO avec le résumé |
| 2 | Pages sur main | exécution de `Pages` réussie sur le hash de `origin/main`, lancée par le push (jamais à la main) | KO |
| 3 | adresses du site | racine (« en construction »), `/Recette/`, `/Recette/jeu.html` (`release`), `/Recette/site-info.json` (`recette.id` = `latest`, `evolutions` vide), `/Recette/build-info.json` (`release`), `/dev/jeu.html` (`dev`), `/v0.N/` de la version remplacée, `/recette/` (404 qui renvoie vers `Recette`) | KO ; NON VÉRIFIABLE si le réseau est refusé |
| 4 | main ancêtre de dev | comme ci-dessus | ATTENTION : ramener `main` dans `dev` par une Pull Request `main` → `dev` |
| 5 | `tests/dernier-complet.json` | enregistré | ATTENTION s'il vaut encore `null` |
| 6 | branches à supprimer | information : `essai/*` et `lot-*` fusionnées dans `dev` (le propriétaire les supprime ; les sessions d'agent ne suppriment pas de branches) | — |

## Ce qui est « non vérifiable » et pourquoi

- **Réseau** : dans une session d'agent, le site publié (`nowyyy.github.io`) est en général refusé par le mandataire : les adresses (`--apres`, 3) sont alors NON VÉRIFIABLE ; les vérifier depuis un navigateur.
- **`gh`** : sans `gh` connecté (ou si l'API refuse), la CI (2), les Pull Requests (4), l'auteur du seed (8), le palier complet (10) et Pages sur main (`--apres`, 2) sont NON VÉRIFIABLE.
- **Hash absent en local** : le palier complet (10) compare des arbres git ; sans `git fetch` de la branche `essai/complet-*`, il est NON VÉRIFIABLE.
- **`--sans-build`** : le contrôle 11 n'est pas fait.

## Sécurité du script

Toutes les commandes passent par une seule fonction (`executer`), filtrée par la liste blanche de `scripts/publication/acces.mjs` : `git` en lecture (`rev-parse`, `merge-base --is-ancestor`, `show`, `cat-file`, `log` (lot 5q : `--first-parent`), `diff` sans `--output`, `ls-remote --heads`, `for-each-ref`, `ls-tree`, `remote get-url`), `gh api --method GET repos/…` sans champ ni en-tête, `curl` en GET vers `https://nowyyy.github.io/Z-Survival/` sans fichier de sortie, `node scripts/site/local.mjs --out <hors du dépôt>`. La seule écriture est le fichier `--json`, dont le chemin doit être hors du dépôt. Les décisions sont des fonctions pures (`scripts/publication/controles.mjs`, `scripts/publication/chemins-ignores.mjs`), testées sans réseau par `tests/unit/publication-controle.test.js` (avec la liste blanche) et `tests/unit/publication-ci-tests.test.js`.
