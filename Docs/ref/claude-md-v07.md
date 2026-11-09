# `CLAUDE.md` pour V0.7 (lot 5p)

Consolidation de `CLAUDE.md` à la publication de V0.7 : lignes des bilans 5j à 5o ajoutées (courtes) ou rangées dans `Docs/ref/conventions.md`, lignes déplacées vers `conventions.md`, rien de perdu.

## Mesure
- Avant : **8 312 octets** (`wc -c`) et **8 125 caractères** (`LC_ALL=C.UTF-8 wc -m`, ou `[...texte].length`) : marge de 88 octets sous 8 400 (le contrôle de publication la signalait).
- Cible du lot : au plus **8 250 octets et 8 250 caractères** (marge d'au moins 150 dans les deux mesures).
- Après : **8 230 octets** (marge 170) et **8 049 caractères** (marge 351). 63 → 64 lignes ; 3 lignes retirées, 4 ajoutées (« Fin de version », « Options », « Lampes », « Canal »), 8 réécrites ; les 11 lignes d'avant retirées ou réécrites sont recopiées mot pour mot dans `conventions.md` (vérifié par script : 11 sur 11).
- Vérification : chaque ligne retirée ou réécrite est recopiée mot pour mot dans `conventions.md`, section « Règles détaillées déplacées de `CLAUDE.md` (consolidation du lot 5p, V0.7, aucune règle supprimée) ».

## Lignes des bilans (ligne par ligne)

| Source | Texte (résumé fidèle ; texte intégral dans `Docs/lots/versions/v0.7.md`) | Décision |
|---|---|---|
| 5j-1 | Options : écran E2-12 (`options-menu.js`, import dynamique) ; options et vecteurs dans `graphics.json` ; manuel → Perso ; live / load ; `Docs/ref/options-graphiques.md` | **`CLAUDE.md`**, ligne « Options (E2-12) » (courte) ; texte intégral dans `conventions.md` (« Lignes des bilans des lots 5j à 5o ») |
| 5j-2 | `zs.device.v1` schéma 2 `{ v: 2, graphics, custom }` ; `?gfx=` verrouille et n'écrit rien | **fusionnée** dans la ligne « Options » (`zs.device.v1 (v2)`, priorité `?gfx=` > `zs.device.v1` > auto reprise de l'ancienne ligne V0.6) ; intégral dans `conventions.md` |
| 5j-3 | Ajouter une option graphique : `Docs/ref/options-graphiques.md` | `conventions.md` seulement |
| 5j-4 | Honnêteté : l'accueil n'a plus la mention « contenu provisoire » | `conventions.md` seulement (précision d'une décision du propriétaire ; la règle « Honnêteté » de `CLAUDE.md` reste entière ; marge) |
| 5j-5 | Pause : son et plein écran en icônes en haut à droite, 2 × 2 boutons | `conventions.md` seulement (détail d'interface) |
| 5k-1 | Lampes : `lampes.json` → `npm run carte`, toujours sur la carte ; options `lampes`, `lumieres` ; `?lum=` (off : `?test=1`) ; `Docs/ref/lampes.md` | **`CLAUDE.md`**, ligne « Lampes » (courte) ; intégral dans `conventions.md` |
| 5k-2 | Éclairage : PointLight fixes sans ombre ; `?test=1&lum=off` = rendu d'avant ; marge de 53 triangles | `?test=1&lum=off` **fusionné** dans la ligne « Lampes » ; le reste dans `conventions.md` avec une note : « sans ombre » et « 53 triangles » **périmés** (lot 5k-G : « Ombres des lumières », budget refait dans `lampes.md`) |
| 5k-3 | `lumieres.json` et jetons `--game-lamp-*` | `lumieres.json` cité dans la ligne « Lampes » ; intégral dans `conventions.md` (la règle des jetons de `CLAUDE.md` couvre le principe) |
| 5k-4 | Une lampe n'est jamais un obstacle | `conventions.md` seulement |
| 5k-5 | Références de rendu : `?lum=off` | **fusionnée** dans la ligne « Lampes » (« références de rendu : ?test=1&lum=off ») ; intégral dans `conventions.md` |
| 5k-6 | Lune selon les planches (`lune.planches`), lecture seule, aucun programme de plus | `conventions.md` seulement |
| 5l-1 | Canal : `<meta name="zs-canal">` ; `pageSearch()`, jamais `location.search` ; groupes G, T et test ; `Docs/ref/debug.md` | **`CLAUDE.md`**, ligne « Canal » (courte, avec `acces()`) ; intégral dans `conventions.md` |
| 5l-2 | Débogage : icône et menu E2-13 sur source, dev, release ; `?test=1` ignoré ailleurs | **fusionnée** dans la ligne « Canal » (« débogage : source, dev, release ») ; intégral (avec « `?test=1` ignoré ailleurs ») dans `conventions.md` |
| 5l-3 | Nouveau paramètre d'adresse : `PARAMS_G`, `PARAMS_T` ou `PARAMS_TEST` | `conventions.md` seulement |
| 5m-1 | Bilans : `scripts/docs/regrouper.mjs` → `Docs/lots/versions/v0.N.md` ; tests par `bilans.mjs` | **fusionnée** dans la nouvelle ligne « Fin de version » (`regrouper.mjs`) ; intégral dans `conventions.md` |
| 5m-2 | « aucune » | rien |
| 5n-1 | CI : standard sur `dev` sans `unitaires`, `lot-*`, PR vers `main` | **`CLAUDE.md`**, ligne « CI » réécrite (texte d'avant déplacé) |
| 5n-2 | Fin de version : allègement, nettoyage, publication | **`CLAUDE.md`**, nouvelle ligne « Fin de version » ; intégral dans `conventions.md` |
| 5o-1 | Sauvegarde entre onglets : relevés `BroadcastChannel`, gains absents réécrits (`save-merge.js`) ; `w` facultatif | **`CLAUDE.md`**, ligne « Sauvegarde » complétée (sans `w`) ; intégral dans `conventions.md` |
| 5o-2 | Contrôle de publication avant et après | **`CLAUDE.md`**, ligne « Fin de version » |
| 5o-3 | Preuves des deux onglets hors CI (`preuve-onglets.mjs`, `octets-sauvegarde.mjs`, `compat-onglets.mjs`) | `conventions.md` seulement |
| prompt 5p | Les agents ne suppriment pas de branches | **`CLAUDE.md`**, ligne « Une branche par lot » (« supprimée par le propriétaire en fin de version, jamais par un agent ») ; détail dans `conventions.md` |

## Lignes de `CLAUDE.md` déplacées ou réécrites (texte d'avant mot pour mot dans `conventions.md`, section « consolidation du lot 5p »)

| Ligne d'avant | Devenue | Où retrouver le détail |
|---|---|---|
| `npm run assemble` (avec la commande d'aperçu local) | courte, renvoie à `conventions.md` | `conventions.md` : consolidation 5p (texte d'avant) et section « Site et publication (V0.6) » (« Aperçu local avant publication ») |
| URL (toutes les adresses et la casse) | courte, renvoie à `site-adresses.md` | `conventions.md` : consolidation 5p ; `Docs/ref/site-adresses.md` |
| CI (`paliers en tranches`, `assembleur de la branche qui déclenche`) | réécrite (déclencheurs du lot 5n) | `conventions.md` : consolidation 5p ; section « Site et publication (V0.6) » (`pages.yml`, assembleur de la branche qui déclenche) |
| Accueil (étiquette = `label` valide de 1 à 60, sinon `V<id>`) | courte | `conventions.md` : consolidation 5p |
| Noms affichés (« une faute fait échouer `noms.test` ») | courte | `conventions.md` : consolidation 5p ; section « Site et publication (V0.6) » (fichier des noms) |
| Morts (`deathFor`, `muzzle()`) | retirée (pointeur « morts » dans la ligne « Détails ») | `conventions.md` : consolidation 5p |
| Couleurs `--perso-*` et `--sang-*` (contraste ≥ 3:1 sur la couleur vue) | retirée (pointeur dans la ligne « Détails » ; la ligne « Textures » garde le contraste ≥ 3:1 personnages / sol) | `conventions.md` : consolidation 5p |
| V0.6 (lots 5a à 5e) | remplacée par les lignes « Options », « Lampes », « Canal » ; la priorité des préréglages et « sans effet sur la logique » passent dans « Options » ; épaves, `?perf=1`, allocations, variante A : pointeur « V0.6 : lot 5f » de la ligne « Détails » | `conventions.md` : consolidation 5p et « Lignes des bilans des lots 5a à 5e (V0.6) » |

Lignes complétées sans perte : **CI** (voir ci-dessus), **Une branche par lot** (« supprimée au nettoyage de fin de version » → « supprimée par le propriétaire en fin de version, jamais par un agent »), **Sauvegarde** (ajout des onglets), **Détails** (ajout de « V0.6 : lot 5f ; morts, couleurs --perso-*, V0.7 : lot 5p »).

Éléments périmés : « sans ombre » et « 53 triangles de marge » (5k-2), notés en fin de ligne dans `conventions.md` ; aucune mention de ces deux éléments ne reste hors de l'historique et des bilans (`Docs/ref/lampes.md` décrit les ombres du lot 5k-G et le budget à jour).

## Passages du seed à réécrire par le propriétaire (`Docs/seed.md` 0.26, non modifié)
- **Version publiée** (ligne 3 et « Structure d'une partie et des versions », ligne 54) : « version publiée (Recette) : V0.6 » → V0.7 ; V0.6 archivée sous `/v0.6/`, V0.1 à V0.6 archivées.
- **V0.7** : contenu (menu Options et réglages séparés, lampes à huile et lumières dynamiques, ombres des lumières et lune selon les planches, menu de débogage et canaux, nettoyage, allègement des tests, sauvegarde sûre avec plusieurs onglets, contrôle de publication) ; nom et description du bloc `[v0.7]` de `noms-versions-et-lots.txt` (brouillon de ce lot, à relire).
- **Plan en lots** (lignes 159 à 174) : 5n « à lancer » → fait, V0.7 ; ajouter 5o (sauvegarde entre onglets, contrôle de publication) et 5p (publication de V0.7) ; ligne « Publication de V0.7 » → faite.
- **Déclencheurs et durées des tests** (ligne 132, « Workflows » ligne 131) : standard à chaque push de `dev` sans `unitaires`, de `lot-*` et pour les Pull Requests vers `main` seulement ; durées du lot 5n (rejeu total en 5 tranches) ; palier complet par `essai/complet-*`.
- **Ordre de fin de version** (ligne 128) : allègement des tests, nettoyage (bilans regroupés), **contrôle de publication** (`npm run publication:controle`), publication ; après : `-- --apres`.
- **Sauvegarde entre onglets** (« Stockage », ligne 134) : défaut des deux onglets corrigé au lot 5o (relevés `BroadcastChannel`, `save-merge.js`) ; preuve faite dans Chrome seulement (Firefox et Safari non vérifiés) ; perte encore possible si un onglet V0.5 ou V0.6 écrit en même temps qu'un onglet V0.7.
- **Budget de dessin** (ligne 99) : lampes et « Ombres des lumières » (Élevé, Dynamique, 1 ombre : U4 71 appels, 35 883 triangles ; pire cas du sang 41 183 : `Docs/ref/lampes.md`).
- **Cibles de lisibilité de l'éclairage** (« Lisibilité » ligne 117, « Décisions en attente » ligne 143) : contraste des personnages dans les zones sombres et sous la lumière des lampes, encore à décider d'après les essais sur téléphone.
- **Contrôle de publication** (« Stack, hébergement et publication ») : `scripts/publication/controler.mjs`, `Docs/ref/controle-publication.md`, avant et après la fusion `dev` → `main`.
- **`CLAUDE.md` consolidé** (ligne 137) : « environ 8 300 après le lot 5m, à consolider à la publication de la V0.7 » → consolidé au lot 5p : 8 230 octets, 8 049 caractères (limite 8 400 ; marge mesurée dans les deux unités).
