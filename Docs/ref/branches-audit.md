# Audit des branches (lot 5m-A)

> Relevé en lecture seule le 2026-11-08 vers 19 h 35 UTC, après `git fetch origin --prune`, sur `origin/dev` `2941829bc85cb880f20eb423228a24412d1519ee` et `origin/main` `6e3ae1ad602ff7612e6ad0901e823902fd20d9e0` (`main` est un ancêtre de `dev`). Rien n'a été supprimé. Les suppressions éventuelles se font en partie C, après la phrase de confirmation du propriétaire, avec un nouveau relevé : une branche dont le hash a changé ou qui a une CI en cours sort de la liste.

## Méthode
- **Fusion** : `git merge-base --is-ancestor origin/<b> origin/dev` (et `origin/main`) ; commits absents : `git rev-list --count origin/dev..origin/<b>` ; `git cherry -v origin/dev origin/<b>` n'a rien à montrer (aucune branche n'a de commit absent de `dev`).
- **Pull Requests** : `gh pr list` passe par GraphQL, refusé dans cette session ; même information par l'API REST en lecture seule (`gh api repos/Nowyyy/Z-Survival/pulls?state=all`, 62 Pull Requests) : **aucune Pull Request ouverte**, quelle que soit la branche.
- **CI** : `gh run list --status in_progress|queued|waiting|pending` : **aucune exécution en cours ni en file** ; dernière exécution de `dev` (Tests, Pages, push de la fusion #62) : **verte**.
- **Âge** : dernier commit de moins de 60 minutes = « possible session active ».
- **Références** : `git grep -nIw <nom>` sur `origin/dev` hors `Docs/lots`, `Docs/ref`, `data/changelog.json` (« occurrences du nom », la plupart sont des noms de lots dans les tests du journal, pas des branches) ; puis références **de type branche** (`origin/<b>`, `refs/heads/<b>`, `--ref <b>`, `"branch": "<b>"`).
- **Jetables** (`essai/*`) : `git diff --stat origin/dev...origin/<b>` est **vide** pour toutes (aucun contenu absent de `dev`, donc ni capture ni artefact à perdre).

## Branches protégées (jamais proposées)
- `main` (branche par défaut du dépôt, `gh api repos/Nowyyy/Z-Survival` → `default_branch`), `dev`, `archive` (versions figées V0.1 à V0.5, 5 commits hors de `dev`, normal : branche orpheline), `lot-5m` (ce lot).
- Branches de `versions.json` (champ `branch`) : `lot-1`, `lot-1d`, `lot-2c`, `lot-3e`, `lot-4b` (**absente du dépôt distant** : déjà supprimée avant ce lot ; V0.5 désigne le commit `e23d92b`, toujours présent), `dev`.
- Branches nommées par un workflow : `main`, `dev` (`pages.yml`, `tests.yml`), `archive` (`pages.yml`). Les filtres `lot-*` et `essai/**` de `tests.yml` sont des motifs de déclenchement, pas des noms : ils ne protègent pas une branche précise (une branche supprimée ne déclenche rien ; une branche recréée relancerait le palier de son motif).
- `gh-pages` : n'existe pas.

## Sources de V0.1 à V0.5 (GARDER par défaut)

| Version | Branche | Tête de la branche | `ref` de `versions.json` | `ref` ancêtre de `main` | Commits absents de `main` | Supprimable sans perte |
|---|---|---|---|---|---|---|
| V0.1 | `lot-1` | `1ffbf76e8521a8cfc384b603e90d422842d5d8e3` | identique | oui | 0 | oui |
| V0.2 | `lot-1d` | `8a098f02510d03ea97dffb8a9bdce3ab6bc5bdba` | identique | oui | 0 | oui |
| V0.3 | `lot-2c` | `0eee61905f1a3d1dd102949b7752392d8d7439cc` | identique | oui | 0 | oui |
| V0.4 | `lot-3e` | `b4a0e315d644ce934894549dee8c8bd044bfaa68` | identique | oui | 0 | oui |
| V0.5 | `lot-4b` | absente | `e23d92b7cfa46e92693b6695d2e8ad15ecc28344` (tête de `main` archivée) | oui | — | déjà supprimée |

- Chaque `ref` est dans `main` et dans `dev`, et chaque version est déjà construite dans `archive` (`v0.1/` à `v0.5/`) : la suppression de `lot-1`, `lot-1d`, `lot-2c`, `lot-3e` ne perd **aucun commit** ni aucune archive. Ce qui changerait : le champ `branch` de `versions.json` nommerait une branche absente (déjà le cas de `lot-4b` ; `versions.json` n'est lu que comme étiquette : `scripts/versions/archiver.mjs` et `schema.mjs` travaillent sur `ref`, et `versions-schema` ne vérifie que le nom), et la liste des branches GitHub ne montrerait plus les sources. **Recommandation : GARDER** (coût nul, repères lisibles).

## Branches non protégées (26)

| Branche | Hash complet | Dernier commit | Âge | Dans dev | Absents de dev | Dans main | Pull Requests (toutes fermées) | Occurrences du nom | Références de type branche | Verdict | Raison ou remarque |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `essai/complet-1` | `e6f3578b872769ee1f4701b7d1981a03c697867b` | 2026-11-03 14:50 | 5 j 4 h | oui | 0 | oui | aucune | 3 | 2 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-2` | `704dff1550b1b500ab1f484db32370a7b61afffe` | 2026-11-03 15:05 | 5 j 4 h | oui | 0 | oui | aucune | 1 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-3` | `31b95e2692009813cd89a1adfa1757f1ca6f61ce` | 2026-11-03 17:36 | 5 j 1 h | oui | 0 | oui | aucune | 3 | 3 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-4` | `adff74e60f33f403ad98b54be3a6560d625d700a` | 2026-11-03 17:47 | 5 j 1 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-5` | `7f7694f5afd821b7a18520dec054751648df6876` | 2026-11-06 13:15 | 2 j 6 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-6` | `0a2a39101a2c99b7395a43ec62709c4ecb26eeaf` | 2026-11-06 17:44 | 2 j 1 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-7` | `89fce38f71b1c71df35ebb4b9ac82210c7c6648e` | 2026-11-06 22:34 | 1 j 20 h | oui | 0 | oui | aucune | 1 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-8` | `e3a6c329159cd76d66dc22e3999f50e402fe882b` | 2026-11-06 22:59 | 1 j 20 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-9` | `1969d1f0cfdaec0bb3b792dc9ea87b2e762d5c58` | 2026-11-06 23:08 | 1 j 20 h | oui | 0 | oui | aucune | 1 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/standard-1` | `4414302fdc11412388aca7c974f492c13141ce74` | 2026-11-03 15:14 | 5 j 4 h | oui | 0 | oui | aucune | 3 | 2 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `lot-4` | `a91d707709e39dbf2e71a72131c434426a46167c` | 2026-11-01 14:20 | 7 j 5 h | oui | 0 | oui | #17 fusionnée → main | 3 | 0 | SÛRE |  |
| `lot-4e` | `3d8d1ba40061c320983655c00bd787d23ac83f07` | 2026-11-03 11:18 | 5 j 8 h | oui | 0 | oui | aucune | 2 | 0 | SÛRE |  |
| `lot-4f` | `adff74e60f33f403ad98b54be3a6560d625d700a` | 2026-11-03 17:47 | 5 j 1 h | oui | 0 | oui | #22 fusionnée → dev; #23 fusionnée → dev; #24 fusionnée → dev | 8 | 3 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE |  |
| `lot-4g` | `f6be72ba46f95e005b4376e9ad9a585b3d6e664d` | 2026-11-03 20:36 | 4 j 22 h | oui | 0 | oui | aucune | 2 | 0 | SÛRE |  |
| `lot-5a` | `0bdea2fd5f7ccfb961ed27e0a8f86444c2ffc9c2` | 2026-11-04 16:43 | 4 j 2 h | oui | 0 | oui | #25 fusionnée → dev; #26 fusionnée → dev; #27 fusionnée → dev; #28 fusionnée → dev | 53 | 0 | SÛRE |  |
| `lot-5b` | `1fecb361b91fc82357cd54babc768edf4543f78b` | 2026-11-05 10:41 | 3 j 8 h | oui | 0 | oui | #29 fusionnée → dev; #30 fusionnée → dev; #31 fusionnée → dev; #32 fusionnée → dev; #33 fusionnée → dev | 22 | 0 | SÛRE |  |
| `lot-5c` | `92e45566feb99cc76667e123d1b68171f6ed51f7` | 2026-11-06 13:36 | 2 j 5 h | oui | 0 | oui | #36 fusionnée → dev | 14 | 0 | SÛRE |  |
| `lot-5d` | `b7d20a4c379af90da4d7f47b80343300dc56b4bd` | 2026-11-06 10:14 | 2 j 9 h | oui | 0 | oui | #34 fusionnée → dev; #35 fusionnée → dev | 7 | 0 | SÛRE |  |
| `lot-5e` | `e594eddb62a91ac8748d2a541f5a02ced2d07d7c` | 2026-11-06 18:18 | 2 j 1 h | oui | 0 | oui | #37 fusionnée → dev | 7 | 0 | SÛRE |  |
| `lot-5f` | `c8e83b5e68402ddbdcbc841514caa004814b1609` | 2026-11-06 23:21 | 1 j 20 h | oui | 0 | oui | #42 fusionnée → dev | 8 | 0 | SÛRE |  |
| `lot-5g` | `aa4e220352ff2215c0f5e0def6bdd0012492d640` | 2026-11-06 20:17 | 1 j 23 h | oui | 0 | oui | #38 fusionnée → dev; #39 fusionnée → dev | 11 | 0 | SÛRE |  |
| `lot-5h` | `eeb76b0941d05a7e64de998bbcd87856e771d198` | 2026-11-06 21:08 | 1 j 22 h | oui | 0 | oui | #40 fusionnée → dev | 9 | 0 | SÛRE |  |
| `lot-5i` | `c1d3e9f6dabe642854de790527da32b7ce02e389` | 2026-11-07 10:20 | 1 j 9 h | oui | 0 | oui | #45 fusionnée → dev | 8 | 0 | SÛRE |  |
| `lot-5j` | `076f534434dfac90cf138561b67469f4cf7c0076` | 2026-11-07 19:54 | 23 h 40 min | oui | 0 | non | #48 fusionnée → dev; #49 fusionnée → dev; #50 fusionnée → dev; #51 fusionnée → dev | 21 | 0 | SÛRE | 13 commits absents de main (V0.7 non publiée ; tous dans dev) |
| `lot-5k` | `ff037baff73e8b0e07c18678c11c75d56e32f5e2` | 2026-11-08 18:52 | 0 h 42 min | oui | 0 | non | #52 fusionnée → dev; #53 fusionnée → dev; #54 fusionnée → dev; #55 fusionnée → dev; #56 fusionnée → dev; #59 fusionnée → dev; #60 fusionnée → dev; #61 fusionnée → dev; #62 fusionnée → dev | 19 | 0 | À GARDER | dernier commit il y a 42 min : possible session active |
| `lot-5l` | `e7501cd24ba77cf81151dc17d54013c8db7a3c71` | 2026-11-08 13:45 | 5 h 49 min | oui | 0 | non | #57 fusionnée → dev; #58 fusionnée → dev | 19 | 0 | SÛRE | 38 commits absents de main (V0.7 non publiée ; tous dans dev) |

- `lot-4f` et `essai/complet-4` pointent sur le même commit (`adff74e`).
- **Références de type branche** (toutes sans lecture de la branche) : `essai/complet-1`, `essai/complet-3`, `essai/standard-1`, `lot-4f` apparaissent comme chaînes d'exemple dans `tests/unit/tests-budget.test.js` (lignes 111 à 146 : fonctions pures `palierDeLExecution`, `basesCandidates` de `scripts/tests/lib/ci.mjs`) et dans le commentaire d'usage de `scripts/tests/ci-palier.mjs:7` ; aucun script ni workflow ne lit ces branches. Les seules lectures de branches de lot par un test (`origin/lot-3h` dans `atelier-sons-hygiene`, `origin/lot-4b` cité par `persos-jeu`) visent des branches **déjà absentes**, avec repli prévu (comparaisons sautées).
- **`lot-5k`** : À GARDER à cette heure (dernier commit 42 minutes avant le relevé). La partie C ne la reprend que si le propriétaire la nomme dans les exceptions **et** si le nouveau relevé la trouve fusionnée, sans CI en cours ni commit de moins de 60 minutes.
- **`lot-5j`, `lot-5l`** (et `lot-5k`) : lots de V0.7, dans `dev` mais pas encore dans `main` ; leur suppression ne perd rien (tout est dans `dev`).
- **Règle de `CLAUDE.md`** : « Une branche par lot : `lot-N`, jamais supprimée. » Supprimer des branches `lot-*` contredit cette règle durable ; c'est au propriétaire de décider (et, s'il approuve, de réécrire la règle : ce lot n'a le droit de toucher `CLAUDE.md` que pour des chemins de documents). Les branches `essai/*` ne sont pas concernées par cette règle.

## Restauration (une commande par branche)

Tous ces commits sont dans `dev` (fusionnés) : ils restent accessibles après la suppression de la branche, et chaque branche se recrée telle quelle par :

```
git push origin e6f3578b872769ee1f4701b7d1981a03c697867b:refs/heads/essai/complet-1
git push origin 704dff1550b1b500ab1f484db32370a7b61afffe:refs/heads/essai/complet-2
git push origin 31b95e2692009813cd89a1adfa1757f1ca6f61ce:refs/heads/essai/complet-3
git push origin adff74e60f33f403ad98b54be3a6560d625d700a:refs/heads/essai/complet-4
git push origin 7f7694f5afd821b7a18520dec054751648df6876:refs/heads/essai/complet-5
git push origin 0a2a39101a2c99b7395a43ec62709c4ecb26eeaf:refs/heads/essai/complet-6
git push origin 89fce38f71b1c71df35ebb4b9ac82210c7c6648e:refs/heads/essai/complet-7
git push origin e3a6c329159cd76d66dc22e3999f50e402fe882b:refs/heads/essai/complet-8
git push origin 1969d1f0cfdaec0bb3b792dc9ea87b2e762d5c58:refs/heads/essai/complet-9
git push origin 4414302fdc11412388aca7c974f492c13141ce74:refs/heads/essai/standard-1
git push origin a91d707709e39dbf2e71a72131c434426a46167c:refs/heads/lot-4
git push origin 3d8d1ba40061c320983655c00bd787d23ac83f07:refs/heads/lot-4e
git push origin adff74e60f33f403ad98b54be3a6560d625d700a:refs/heads/lot-4f
git push origin f6be72ba46f95e005b4376e9ad9a585b3d6e664d:refs/heads/lot-4g
git push origin 0bdea2fd5f7ccfb961ed27e0a8f86444c2ffc9c2:refs/heads/lot-5a
git push origin 1fecb361b91fc82357cd54babc768edf4543f78b:refs/heads/lot-5b
git push origin 92e45566feb99cc76667e123d1b68171f6ed51f7:refs/heads/lot-5c
git push origin b7d20a4c379af90da4d7f47b80343300dc56b4bd:refs/heads/lot-5d
git push origin e594eddb62a91ac8748d2a541f5a02ced2d07d7c:refs/heads/lot-5e
git push origin c8e83b5e68402ddbdcbc841514caa004814b1609:refs/heads/lot-5f
git push origin aa4e220352ff2215c0f5e0def6bdd0012492d640:refs/heads/lot-5g
git push origin eeb76b0941d05a7e64de998bbcd87856e771d198:refs/heads/lot-5h
git push origin c1d3e9f6dabe642854de790527da32b7ce02e389:refs/heads/lot-5i
git push origin 076f534434dfac90cf138561b67469f4cf7c0076:refs/heads/lot-5j
git push origin ff037baff73e8b0e07c18678c11c75d56e32f5e2:refs/heads/lot-5k
git push origin e7501cd24ba77cf81151dc17d54013c8db7a3c71:refs/heads/lot-5l
```

## Recommandation
- **Supprimer** les 10 branches `essai/*` (jetables, rien hors de `dev`).
- **Branches `lot-*` SÛRES** (15 : `lot-4`, `lot-4e`, `lot-4f`, `lot-4g`, `lot-5a` à `lot-5j`, `lot-5l`) : supprimables sans perte, mais contraires à la règle de `CLAUDE.md` ; si le propriétaire les approuve, garder au moins `lot-5j` et `lot-5l` jusqu'à la publication de V0.7 (exceptions « garder »).
- **Garder** les sources de V0.1 à V0.4.

## Ce que je n'ai pas pu vérifier
- Règles de protection des branches et réglages du dépôt sur GitHub ; sessions ouvertes ailleurs (seul l'âge du dernier commit en donne un indice) ; une restauration réelle (aucune branche n'a été supprimée ni recréée).
