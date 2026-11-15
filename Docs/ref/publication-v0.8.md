# Publication de la V0.8 (lot 8m) : plan et relevé

> Relevé le 2026-11-15 sur `origin/dev` `df723e8` (seed **0.35 déjà collé par le propriétaire**, commit « Update print statement… » qui ne touche que `Docs/seed.md` ; bilan 8l présent ; bloc `[v0.8]` présent), `main` `4be0796` ancêtre de `dev`, `archive` `eab1a3f` (V0.1 à V0.6). Procédé : `publication-versions.md` (étapes 0 à 8, leçons des lots 5f et 5p) et `controle-publication.md`. Rien ne change pour le joueur.

## Contrôle `--avant` de départ (partie A) : 5 KO, tous attendus
| Contrôle | Résultat | Classement |
|---|---|---|
| CI de dev | KO : Pages en cours sur `df723e8` ; Tests : dernier commit testé `2b31c7d`, depuis : `Docs/seed.md` (ignoré) | **attendu** (exécution Pages lancée par le seed, terminée verte `43724989699` juste après) |
| versions.json | KO : `latest` v0.7 comme sur `main` | **attendu** (partie B) |
| évolutions après publication | KO : 11 lots v0.8 | **attendu** (vides une fois `latest` = v0.8) |
| seed | KO : cite V0.8, `latest` v0.7 | **attendu** (le seed 0.35 est en avance ; OK après la partie B) |
| palier complet | KO : aucun palier ; `dernier-complet.json` nul | **attendu** (partie C) |
| fraîcheur, dev (bilan `lot-8l.md`), main ancêtre, Pull Requests, noms (`[v0.7]`), CLAUDE.md (8 049 c. / 8 230 o.), construction et site, workflows, branches, dépendances | OK | — |
> **Aucun ATTENTION ni NON VÉRIFIABLE.** Sortie complète : message du commit « Lot 8m-A ». Écart au prompt : le seed n'est plus un KO attendu en partie C (déjà collé) ; l'arrêt de l'étape 2 demandera seulement de confirmer qu'il est définitif.

## Ordre des gestes
1. **Agent, A** : ce relevé, commit, push de `lot-8m`.
2. **Agent, B** : archive de la V0.7 (`archive`) ; `versions.json` ; `CLAUDE.md` et `conventions.md` consolidés ; contrôle 1 généralisé ; entrée `lot-8m` du journal et bloc `[lot-8m]` (`afficher: non`) ; tests liés à `versions.json` ; garanties 1 et 4 ; CI standard de `lot-8m` ; push. **Arrêt 1.**
3. **Propriétaire** : fusion de `lot-8m` dans `dev` (« Create a merge commit »), « GO complet ».
4. **Agent, C** : branche `essai/complet-<n>` = `origin/dev` ; rien poussé sur `dev` pendant l'exécution ; contrôle `--avant`. **Arrêt 2.**
5. **Propriétaire** : seed définitif (déjà fait : 0.35), « GO contrôle ». **Agent, D** : contrôle `--avant` sans KO. **Arrêt 3.**
6. **Propriétaire** : Pull Request `dev` → `main` « V0.8 », « Create a merge commit » (vérifier la branche), `pages.yml` lancé par le push (aucun déclenchement manuel), « PUBLIÉ ». **Agent, E** : `--apres`, site, Lighthouse, bilan ; **propriétaire** : Pull Request `main` → `dev`.

## Archivage (V0.7 = tête de `main`, `4be0796`, même jeu que `3740ffd` : seul `data/changelog.json` diffère)
```
git fetch origin && node scripts/versions/archiver.mjs --id v0.7 --ref 4be0796d5e5058f1a5de1686878f29df8716dbe3 --dry-run --keep
node scripts/versions/verifier.mjs --dir <dossier stage de l'essai> --ids v0.7
node scripts/versions/archiver.mjs --id v0.7 --ref 4be0796d5e5058f1a5de1686878f29df8716dbe3
node scripts/versions/verifier.mjs && git ls-remote --heads origin archive
```
Essai à blanc fait en A : 268 fichiers, 5,2 Mo, 0 lien non relatif, `build-info.json` canal `archive`, `ref` `4be0796`. Le canal `archive` de `v0.7/jeu.html` est écrit par l'assembleur. L'outil pousse `archive` lui-même (seule exception à « `lot-8m` seule »).

## `versions.json`
`latest: "v0.8"` ; V0.7 `actuelle` → `archive`, `ref` `3740ffd` → `4be0796` (tête de `main` archivée, note réécrite) ; **V0.8** : `branch: "dev"`, `ref` `df723e89…` (« dernier commit de `dev` sans ce lot », comme aux lots 5f et 5p ; un seul parent : le commit du seed), `date: "2026-11-15"`, `entry: "jeu.html"`, `status: "actuelle"`, `title` = description de `[v0.8]` bornée à 120 (`cleanText`), `note` des thèmes. Tests adaptés : `versions-schema`, `versions-archiver`, `publication.test` (site-info réel : Recette V0.8, évolutions vides), `publication.spec` (évolutions fictives `v0.8` → `v0.9`) si nécessaire.

## `CLAUDE.md` (8 230 o / 8 049 c. → 8 240 o / 8 064 c. ; marges 160 et 336)
| Ligne | Avant | Après |
|---|---|---|
| 10, 22 | assemble « aperçu local, `site-info.json` : conventions (lot 5f) » ; Fin de version : allègement, nettoyage (`regrouper.mjs`), publication | « aperçu local : `conventions.md` » ; en deux lots, `publication-versions.md` |
| 30, 34 | aucune couleur hors `tokens.css` ; jaune (argent) | sauf `--ouv-*` de `css/ouvertures.css` ; + bleu (diamants), bronze (médailles) |
| 44, 46 | tirs « à travers les fenêtres » ; meubles « bloquent tout » | + grilles, meubles dessinés sous 43 (`correctifs-8j.md`) ; « (tirs : voir Tir) » |
| 51 | « aucun fichier audio » ; `sons.html` | seul fichier audio : MP3 du logo ; + `atelier-sons-menu.html` |
| 58, 60, 61 | `save.js`, `zs.save.v1` partagée ; « tout est conservé à la mort » ; Options (E2-12), `zs.device.v1 (v2)` | `progression.js`, `zs.save.v2`, ZS2, v1 ignorée, `sauvegarde-v2.md` ; jaune à 0 à chaque partie, diamants et médailles écrits au gain, `economie.md` ; + menu E5, son et volumes |
| 64 | index « Détails … lots 3e, 4g, 5f, 5p » | retiré (mot pour mot dans `conventions.md`) ; **ajout** « Menu principal (lots 8a et suivants) » |

## `conventions.md`
Anciennes lignes de `CLAUDE.md` mot pour mot dans une nouvelle section « consolidation du lot 8m » (lignes déplacées) ; nouvelle section « Lignes des bilans des lots 5q et 8a à 8l (V0.8) » ; notes *(Lot 8m : …)* de péremption aux lignes 10, 11, 50, 287, 293, 358, 380, 382, 383, 410, 431, 461, 466-467, 478, 481 (audit 8l § 3).

## Contrôle 1, bilans
Contrôle 1 : le bilan cité est **le dernier bilan séparé dans l'ordre des lots** (numéro, puis lettres : `lot-9z` < `lot-10a`, `lot-8z` < `lot-8aa`) ; plus aucun nom écrit en dur ; tests mis à jour. Bilans : **pas de regroupement de la V0.8** dans ce lot : `publication-versions.md` (note du lot 8l, étape 7) le place au nettoyage de la fin de version suivante (« bilans de la version précédemment publiée ») ; `lot-8m.md` et `lot-5a.md` restent séparés.

## Étape 2 (partie C, 2026-11-15)
- **Fusion** : `lot-8m` → `dev` par l'agent, **à la demande explicite du propriétaire** (« Fait la fusion et le merge commit puis Go complet ») : Pull Request [#142](https://github.com/Nowyyy/Z-Survival/pull/142), « Create a merge commit » → `dev` `87a957b` ; CI de `lot-8m` verte avant (`43729977258`), CI de `dev` verte après (Tests `43731295598` 5 min 38 s, Pages `43731295571`).
- **Palier complet** : `essai/complet-13` = `origin/dev` = `87a957b` (le dernier numéro employé était 12, lot 5p) ; exécution `43731906999` (création de la branche), **verte**, 7 min 09 s, 16 tranches (la plus longue : n° 1, 6 min 24 s), aucune relance ; rien poussé sur `dev` pendant l'exécution.
- **Contrôle `--avant`** sur `87a957b` : **PRÊT À PUBLIER**, aucun KO. Tous OK (bilan cité `lot-8l.md` ; CI de dev : tête testée ; `versions.json` : latest v0.8 (`df723e8`), v0.7 archivée (`4be0796`) ; `[v0.8]` « V0.8 » ; évolutions vides ; seed 0.35 « Recette citée V0.8 », dernier commit `df723e8` par le propriétaire ; `CLAUDE.md` 8 064 c. / 8 240 o. ; construction et site, canaux `release` et `dev`, dossiers `v0.1` à `v0.7` ; workflows identiques ; branches ; dépendances), sauf **une ATTENTION attendue** : palier complet, `tests/dernier-complet.json` vaut `null` (choix du propriétaire), `essai/complet-13` « même code que dev ».
- **Seed** : déjà collé (0.35, `df723e8`) avant ce lot : ce n'est plus un KO. Une fois le seed confirmé définitif, l'étape 3 refera le contrôle sur `dev`.

## Étape 3 (partie D, 2026-11-15)
- « GO contrôle » reçu ; `dev` inchangé depuis le palier complet (`87a957b`, fusion #142). Le dernier commit de `dev` n'est pas celui du seed (collé avant ce lot) : le dernier commit de `Docs/seed.md` reste `df723e8`, par le propriétaire (éditeur web), seed 0.35 « version publiée (Recette) : V0.8 ».
- **Contrôle `--avant` final** sur `87a957b` : **PRÊT À PUBLIER**, aucun KO. Deux ATTENTION, expliquées : (1) palier complet : `tests/dernier-complet.json` nul (choix du propriétaire), `essai/complet-13` même code que `dev` ; (2) branches : `lot-8m` (`e982c08`, commits de documentation C et D) pas encore dans `dev` : attendu, fusionné avec le bilan après la publication ; une branche `essai/*` (`essai/complet-13`, à supprimer par le propriétaire).
- **Gestes du propriétaire** : Pull Request `dev` → `main` « V0.8 », « Create a merge commit » (vérifier les branches : base `main`, comparée `dev`) ; aucun déclenchement manuel de `pages.yml` : la fusion le lance ; attendre `Pages` sur `main`, puis « PUBLIÉ ». Ensuite (partie E) : Pull Request `main` → `dev`, « Create a merge commit », sans « Resolve conflicts ».
