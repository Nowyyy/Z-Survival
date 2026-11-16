# Audit de fin de V0.8 (lot 8l-A, lecture seule)

> Relevé le 2026-11-15 sur `origin/dev` `7a49475` (seed 0.34, bilan 8k présent, `main` `4be0796` ancêtre de `dev`, CI de `dev` verte). Rien n'a été modifié hors de ce fichier. Les décisions sont en fin de fichier (§ 5) : le propriétaire répond « GO 8l », « GO 8l sauf … » ou modifie des numéros.

## 1. Tests
**Totaux** : Vitest 160 fichiers, 3 488 tests écrits, 10 103 assertions, **7 259 tests exécutés** (tous verts, 1 min 43 s en local) ; Playwright 67 fichiers, 761 tests écrits, 4 715 assertions ; **complet 1 620 exécutions** (bureau et mobile), **standard 565 exécutions** (bureau). Décompte : `scripts/tests/compter.mjs` (texte), exécutions : `budget.mjs`.

**CI standard de `dev`** (`tests.yml`, rejeu total à chaque fusion d'un lot : `tokens.css`, `helpers.js` ou `selection.json` touchés) : 5 dernières **450, 447, 436, 477, 449 s** ; médiane des 48 dernières réussies **439 s (7 min 19 s)**, 2 échecs sur 50. **Seuil du propriétaire (standard sur `dev` ≤ 7 min) dépassé.** Référence du lot 5n : rejeu total 6 min 31 s en 5 tranches. Dernière exécution (`43660442667`) : 7 tranches de 275 à **399 s** pour 258 s projetées : **déséquilibre**, car **237 exécutions du bureau sur 565 n'ont pas de durée mesurée** (toutes celles du menu, lots 8a à 8k : `studio` 32, `personnage` 31, `boutique` 24, `argent` 20, `menu-onglets` 19, `menu` 16, `options-menu` 11…) ; 161 en mobile. `pages.yml` : `quick` puis `deploy`, 141 à 196 s.

**Budget** (`tests/budget.json`, `budget-mesure.json`) : complet projeté 123,2 min cumulées, 11 tranches minimales (16 utilisées), 4,6 min ; **écart de +1 073 s avec la référence du lot 5n (6 320 s)**, au-delà de l'ajout maximal de 90 s par lot (cumul des lots 5q à 8k, en partie estimé).

| Zone | Vitest (tests / assertions) | e2e standard | e2e complet | Durée mesurée bureau standard / complet (s) |
|---|---|---|---|---|
| noyau, textes, outillage-tests | 751/1 821 ; 166/490 ; 218/827 | — | — | — |
| carte, siège, vagues, étages | 1 430/3 665 ; 740/1 899 ; 791/1 885 ; 425/1 078 | — | 67/226 ; 35/100 ; 24/135 ; 59/242 | 0 / 1 301 |
| combat, économie | 327/829 ; 328/892 | 4/17 ; 83/428 | 22/69 ; — | 328 / 469 |
| personnages, sons, rendu | 226/555 ; 338/831 ; 441/1 275 | 25/64 ; 20/112 ; 25/142 | 20/49 ; 27/118 ; 63/238 | 726 / 1 895 |
| interface, graphismes | 81/265 ; 80/465 | 153/941 ; 19/260 | 49/213 ; — | 1 516 / 1 814 |
| **menu** | 211/1 099 | **124/1 697** | — | **non mesurée** |
| jeu, accueil, publication, pages techniques | 198/450 ; 194/497 ; 204/646 ; 169/445 | 33/97 ; 29/225 ; 33/260 ; 4/39 | 48/187 (pages) | 511 / 779 |

(Vitest compté par zone : un fichier de plusieurs zones compte dans chacune ; aucun seuil par zone n'existe, seuls les seuils globaux ci-dessus.)

**Doublons certains** (même état de page chargé deux fois ; [n] = assertions) :
- **A** `menu.spec.js:86` (en-tête, onglets, Jouer, 44 px, axe) [13] et `menu-onglets.spec.js:51` (garde-fou : scène, bandeau, record, portes, 44 px, axe) [19] : mêmes 3 tailles, même adresse, même état ; deux axe identiques. Fusion dans `menu-onglets:51` (boîtes et 44 px de A gardés, un seul axe) : 32 → 31 ; −3 tests, −3 chargements.
- **B** `menu.spec.js:72` et `menu-onglets.spec.js:227` (garde-fou) : même chargement en mouvement réduit à 932 × 430 ; fusion dans `menu-onglets:227` : 8 → 7 ; −1 test, −1 chargement.
- **C** `sons-volumes.spec.js:183` [2] ⊂ `options-menu.spec.js:169` (garde-fou) [14] : même suite (couper, retour, JOUER, `getState().audio`) ; l'assertion des gains `{effets:0, musique:0}` passe dans `options-menu:169` : 16 → 15 ; −1 test, −1 lancement de partie.
- **D** fichiers chargés au démarrage de la partie : `graphismes.spec.js:495` [12], `lampes.spec.js:147` (premier segment) [7] et `perf.spec.js:32` [4] chargent la même partie (`&nospawn=1&lum=off`, 667 × 375) et vérifient la même liste (123 fichiers, ni lampes ni `?perf`). Tout dans `graphismes:495` (+ `lumieres.json`, panneau `#perf-panel` absent, `getState().perf` nul) : 23 → 19 sans perte ; −1 test, −2 chargements de partie.
- **F** (recouvrement fort) `sons-volumes.spec.js:48` (garde-fou par motif « tailles ») [16] et `options-menu.spec.js:51` (garde-fou, fichier entier) [37] : même écran Options du menu, même axe, à 932 et 667. Fusion dans `options-menu:51` (taille à encoche ajoutée à sa boucle) : 53 → 52 ; −2 chargements, −2 axe.
- **E** (non proposé) le compte des 36 fichiers du démarrage du menu est écrit trois fois (`boutique:276`, `personnage:197`, `studio:231`) mais chaque test a besoin de son chargement : aucun gain de temps, fichiers garde-fous : **garder**.
- **Recouvrements partiels gardés** : `menu:182`/`:340`, `menu-onglets:173/444/463`, `studio:502`, `boutique:566`, `options-menu:199`/`sons-volumes:196`, `sons-menu:98`/`sons-menu-musique:23`, `caisses-pitie:188`/`ouverture:141`, `argent`/`medailles`/`sauvegarde` (pages ou modes différents).

**Tests devenus inutiles** : **aucun certain**. Les « aucune écriture » restants sont des visites sans action (toujours vrais et utiles) ; les achats et gestes vérifient `zs.save.v2` depuis le lot 8h. `menu-garde.test.js` (aucune arme dans le menu) et les tests de `chutes` (statistique, plus objet) sont des garde-fous valides. `helpers/caisses-lot-8e.json` **reste nécessaire** (`caisses.test.js:14`, `ouverture.test.js:305` : moteur testé sur neuf caisses). `medailles:190` (sauvegarde v2 sans médailles, d'entre les lots 8h et 8k) : garder jusqu'après la publication (même domaine que `/dev/`). `persos-integres` (anciens fichiers du lot 5e jamais demandés) : garde-fou, garder. **Titres et raisons périmés** (texte seulement) : `studio:226` (« 33 … 34 » pour 36/37), `lampes:147` (« 115 » pour 123), `ouverture:141` (« aucune écriture »), raisons de `selection.json` pour `boutique`, `personnage`, `ouverture`, `sons-volumes`, `studio` (« prix jamais prélevés », « aucune écriture », « 31 fichiers »).

**`@instable`** : `interface-atelier-ecrans.spec.js:49`, `atelier-detail.spec.js:93` (palier complet seulement, pages techniques du lot 13). Aucun `fixme`, `only`, ni saut dû à un échec mobile ; sauts voulus (`menu-onglets:334` « défile au doigt » en mobile seulement, jamais vu par la CI standard).

**Gain estimé** : A à D et F : −6 tests, ≈ 9 chargements (dont 2 parties et 1 lancement), −7 axe, ≈ 25 à 40 s cumulées (≈ 5 s par tranche). **Le vrai gain est l'équilibre** : tranches mesurées (moyenne 351 s, la plus longue 399 s) → avec les durées réelles, ≈ 400 s au total (−50 s) en 7 tranches, ≈ 355 s (−95 s, sous 7 min) en 8 tranches.

## 2. Code et données morts
- **Six anciens dessins de caisses** (`bois`, `elite`, `recrues`, `legendes`, `mode`, `couture` ; les données n'utilisent que `militaire`, `veterans`, `tenues`) : `js/core/caisses.js:19` (`MODELES`, défaut `'bois'` l.90), `js/menu/boutique.js:53-108` (`DESSINS.bois/elite`, `POINTS`, `FORMES`), `js/menu/ouverture/modeles.js:68-130`, `js/menu/ouverture/scene.js:192-198` (`T.bois` reste : piles du hangar), `css/menu.css:3669-3694, 3925-3949, 4000-4013` (`.e3-bois`, `.e3-coffre*`, `.e3-caisse-recrues…`), `css/ouvertures.css:41-51`. Tests touchés : `caisses.test.js:35-53, 105` et `ouverture.test.js:305` (référence `caisses-lot-8e.json` gardée, ses dessins ramenés aux trois actuels). **Défaut trouvé** : `--ouv-couture` déclaré deux fois dans `.e3-ouverture` (l.51 couleur de caisse, inutilisée ; l.66 couture, qui l'emporte) : retirer l.51 ne change rien.
- **Moteur d'avant la pitié** (`tirerN`, `tirer`, `tirer10`, `bornes`, `resume`, `chances` de `caisses.js`) : lu seulement par `caisses.test.js` ; **garder** (référence du moteur, sauf avis contraire).
- **Exports jamais lus** (zéro référence, tests compris) : `js/game/skeleton.js` (`THIGH`, `SHIN`, `FOOT`, `UPPER`, `FORE`, `HAND`, `HIP_X`, `SHOULDER_X` ; seul `STRIDE` est lu ; en-tête qui cite `character.js` disparu), `character-v2.js:121-134` `rigidShared`, `caisses.js:293` `PITIE_DEFAUT`, `graphics.js:68` `ORIGINS`, `progression.js:18` `REFUS`, `synth.js:17` `LAYER_TYPES`.
- **Module mort** `js/lots.js` (journal de `/dev`, retiré au lot 5g) : aucune page ni script ne l'importe ; lu par `lots.test.js`, `atelier-hygiene.test.js`, listé par `structure.test.js:5`.
- **Armes** : aucune dans les données du menu ; restent des commentaires (`menu.css:2363`, `equipement-etat.js:41`) ; `e9-sil-arme` (fusil décoratif de la silhouette) est vivant. **Ancien nom « Monnaie bleue »** : plus dans aucun texte ; clés `game.end.bleu`, `game.hud.bleuManche`, `game.menu.debogage.bleus` (nom interne) : garder (lot 9b : renommées `game.end.medailles`, `game.hud.gainsManche`, `game.menu.debogage.medailles`). **Anciennes caisses dans les données** : aucune (seul le commentaire `_provisoire` de `caisses.json`).
- **Clés de textes orphelines** : 0 (`fr`, `en`, `accueil.*`) ; `en.json` (12 clés, jamais chargé) garde la règle des deux langues. Fichiers de données : tous lus. Liens morts vers les pages techniques : aucun.
- **`css/tokens.css`** (24 237 o) : non référencés **certains** `--game-repair-panel`, `-ring`, `-track`, `-text` (hors `NAMES` de `palette.js`), `--menu-lune`, `--menu-lune-halo` (`.menu-lune` lit `--e8-lune`), `--menu-ligne` : **514 o** → 23 723 o. Lus par `tokens.test.js` seulement : `--color-success-surface`, `--duration-fast` (62 o) : garder. Probables `--game-trousers`, `-zombie-clothes`, `-zombie-trousers`, `-tree` (exigés par `readPalette`) : garder.
- **`css/base.css`** (10 747 o, bloquant sur l'accueil) : bloc `.changelog*` l.408-506 mort depuis le lot 5g-B : **2 422 o**. **`css/ouvertures.css`** : `--ouv-mur`, `--ouv-pile-clair`, `--ouv-pile-sombre`, `--ouv-flamme-coeur` morts.

## 3. Documentation
- **Fiches à mettre à jour** : `menu-principal.md` (en-tête « lot 8a », 27/120 fichiers → 36/37 et 123 à 126, « aucun son », Lighthouse 79/89, mode d'emploi des données : six emplacements, `rarete`, trois caisses, `type`/`modele`/`pitie`, chances par rareté) ; `sauvegarde-v2.md` (« plan », clés `bleu.*` jamais créées, E2-7 et en-tête d'avant le lot 8k, six outils, prix en médailles) ; `options-graphiques.md` (E5 du menu, Son et deux volumes au pas de 1 % gardés dans `zs.device.v1` avec `son`, 14 options) ; `debug.md` (`tirtraverse`, `coups`, `ouverture`, outil de débogage du menu, « argent (vide : solde) ») ; `sons-menu.md` (« rien n'est fait », `js/core/synth.js`, 36/37) ; `lampes.md:50` (seuil des tirs : dessiné < 43) ; `tests-paliers.md` (19 zones, stockage `zs.save.v2` et `zs.device.v1`, job `e2e` de `pages.yml` retiré, « Publier une version » contraire à `dernier-complet.json` nul) ; `publication-versions.md` (job `e2e`, `/next/`, fin de version en deux lots, seed collé avant la Pull Request) ; `site-adresses.md` (`zs.save.v2`, textes `accueil.*.json`, `atelier-sons-menu.html`) ; `controle-publication.md:35` (contrôle 1 : `lot-5o.md` en dur, sinon le dernier bilan) ; `correctifs-8j.md:13-16` (tableau de la partie A marqué périmé, liste finale de `tirs-traversables.json`). `economie.md` : à jour.
- **Audits et plans terminés** (aucune lecture par le code) : `tests-audit*.md`, `tests-decisions*.md`, `tests-chargement.md`, `tests-allegement-*.md`, `nettoyage-*.md`, `docs-audit*.md`, `branches-audit.md`, `claude-md-*.md`, `fusion-3k.md`, `interface-actuelle.md`, `personnages-actuels.md`, `sons-actuels.md`, `integration-interface.md`, `integration-sons.md`, `passation-interface-4b.md`, `atelier-*.md`, `verification-versions.md`, `versions-correspondance.md`. **Lus par des tests ou écrits par des scripts** (restent) : `fusion-3j.md`, `integration-personnages.md`, `interface-a-integrer.md`, `interface-integree.md`, `personnages-integres.md`, `etage.md`, `environnement.md`, `ecarts-modele.md`, `sons-integres.md`, `passation-personnages-4b.md`, `sons-a-integrer.md`. `regrouper.mjs` ne traite que `Docs/lots` ; `conventions.md` (interdit ici), `publication-versions.md`, `tests-paliers.md` et le seed citent plusieurs de ces chemins (`claude-md-*`, `tests-decisions`, `affinage.md`).
- **Liens morts** (`auditer.mjs`) : 0 lien Markdown cassé ; 13 chemins introuvables : `fusion-3g.md` (bilans et audits historiques, non corrigé au lot 5m), `nettoyage-plan-ancien-annexe.md`, six gabarits `v0.N.md` (faux positifs) ; chemins de fichiers disparus dans `site-adresses.md`, `publication-versions.md`, `sons-menu.md`, `tests-paliers.md`.
- **Bilans** : `lot-5p.md` (publication de la V0.7) **encore séparé** ; essai à blanc `regrouper.mjs --version v0.7 --garder lot-5a --dry-run` : 7 bilans, supprimerait `lot-5p.md` (11 804 o) après vérification octet pour octet et SHA-256 ; aucun test ne lit son chemin. `lot-5a.md` reste séparé. Bilans de la V0.8 : séparés (après la publication).
- **Lignes fausses à reprendre au lot 8m** — `CLAUDE.md` (8 230 o, marge 170 o) : l.58 `zs.save.v1` partagée → `zs.save.v2` (`progression.js`, ZS2) ; l.60 « tout est conservé à la mort » → jaune remise à 0, diamants et médailles écrits au gain ; l.51 « aucun fichier audio » (MP3 du logo) et `atelier-sons-menu.html` ; l.30 exception `--ouv-*` (`ouvertures.css`) ; l.61 Options E5 du menu, son et volumes dans `zs.device.v1` ; l.44/46 « meubles … bloquent tout » (tirs au-dessus des meubles dessinés sous 43 et à travers les grilles) ; l.34 bleu des diamants et bronze des médailles ; aucune ligne « Menu principal » (le seed la croit présente). `conventions.md` : aucune ligne des bilans 5q et 8a à 8k reportée ; l.10 (`--ouv-*`), l.11 (`accueil.*.json`), l.50 et l.431 (`zs.save.v2`, `zs.device.v1` écrite aussi par le menu), l.466-467 (champ `son`, verrouillage en partie), l.478 (débogage du menu), l.481 (fin de version en deux lots), notes de péremption pour l.287, 293, 358, 380, 382, 383, 410, 461.

## 4. Branches (`git ls-remote --heads origin`, 15 têtes)
| Branche | Fusionnée dans `dev` | Version | Dernier commit | Proposition |
|---|---|---|---|---|
| `main`, `dev` | — | — | `4be0796` 09/11, `7a49475` 15/11 | protégées |
| `archive` | non (orpheline, normal) | V0.1 à V0.6 | `eab1a3f` 09/11 « Archive V0.6 » | protégée |
| `lot-5q` | oui (0 absent) | V0.8 | `a27be6d` 09/11 | garder (version en cours) |
| `lot-8a` à `lot-8k` (11) | oui (0 absent chacune) | V0.8 | `941acd2` 10/11 … `bb22fe8` 15/11 | garder (version en cours) |
| `lot-8l` | (ce lot) | V0.8 | — | garder |

**Aucune branche à supprimer** : celles de la V0.7 et d'avant, `essai/*` et `claude/*` sont déjà absentes du dépôt distant. Étiquettes `v0.2` à `v0.6` présentes (ni ajoutées ni retirées). La liste des commandes de suppression sera donc vide en partie D.

## 5. Décisions (réponse en une fois : « GO 8l », « GO 8l sauf n, m » ou numéros modifiés)
1. Fusion **A** : `menu.spec:86` dans `menu-onglets:51` (un seul axe) : −3 tests, −3 chargements, 32 → 31 assertions.
2. Fusion **B** : `menu.spec:72` dans `menu-onglets:227` : −1 test, −1 chargement, 8 → 7.
3. Fusion **C** : `sons-volumes:183` dans `options-menu:169` (assertion des gains reprise) : −1 test, −1 lancement de partie, 16 → 15.
4. Fusion **D** : `perf:32` et le premier segment de `lampes:147` dans `graphismes:495` : −1 test, −2 chargements de partie, 23 → 19.
5. Fusion **F** : `sons-volumes:48` dans `options-menu:51` (encoche ajoutée) : −2 chargements, −2 axe, 53 → 52.
6. Titres et raisons périmés corrigés (`studio:226`, `lampes:147`, `ouverture:141`, raisons de `selection.json`) : texte seulement, assertions inchangées.
7. **Mesurer les 398 exécutions sans durée** (237 bureau d'après le rapport JSON de la CI de `dev`, artefact `rapport-standard` ; 161 mobiles mesurées seules en local, méthode T4 du lot 5n) et les ajouter à `tests/budget-mesure.json` par `budget.mjs --completer-mesure` (fichier hors de la liste autorisée du prompt : à accepter explicitement) : tranches équilibrées, ≈ −50 s sur le standard.
8. Si, après 7, le rejeu total de la CI de `lot-8l` dépasse encore 7 min : `standardCibleSecondes` 400 → 340 (8 tranches, `tranchesMaxStandard` inchangé) : ≈ −45 s de plus, une tâche de plus par push.
9. Référence de durée du complet remise à la mesure après 7 (`--remettre-reference`, comme T6 du lot 5n ; « ce n'est pas un allègement ») : l'erreur « +1 073 s » disparaît, `ajoutMaxParLotSecondes` reste 90.
10. Retirer les six anciens dessins de caisses (code, `menu.css`, `ouvertures.css` dont la double déclaration de `--ouv-couture`) ; `caisses-lot-8e.json` gardé, ses dessins ramenés aux trois actuels (`caisses.test`, `ouverture.test` : mêmes assertions).
11. Retirer les exports morts (`skeleton.js` × 8 et son en-tête, `rigidShared`, `PITIE_DEFAUT`, `ORIGINS`, `REFUS`, `LAYER_TYPES`).
12. Retirer `js/lots.js` avec `lots.test.js` et ses lignes dans `atelier-hygiene.test.js` et `structure.test.js` (assertions comptées avant / après).
13. Retirer les 7 jetons morts de `tokens.css` (−514 o, rejeu total de la CI) et les 4 de `ouvertures.css`.
14. Retirer le bloc `.changelog*` de `base.css` (−2 422 o, fichier bloquant de l'accueil).
15. Commentaires périmés corrigés (`menu.css:2363`, `equipement-etat.js:41`, `_provisoire` de `caisses.json`) : aucun effet.
16. Mettre à jour les 11 fiches listées au § 3 (sans toucher `CLAUDE.md` ni `conventions.md`).
17. Regrouper les audits et plans terminés **non cités** par `CLAUDE.md`, `conventions.md` ou le seed et lus par aucun code dans `Docs/ref/archives/audits-v0.4-v0.7.md` (extension de `regrouper.mjs` avec la même vérification octet pour octet ; citations des fiches corrigées) ; les fichiers cités ou lus restent.
18. Regrouper `lot-5p.md` dans `Docs/lots/versions/v0.7.md` (`regrouper.mjs`, garantie 6) et corriger la citation de `controle-publication.md`.
19. Liens morts : corriger ceux des fiches mises à jour (16) ; `fusion-3g.md` et les gabarits `v0.N.md` laissés tels quels (bilans et documents historiques).
20. Branches : aucune suppression (aucune branche hors V0.8 sur le dépôt distant) ; liste vide notée en partie D.

## Décisions au GO
Réponse du propriétaire (2026-11-15) : « go 8l » : **décisions 1 à 20 acceptées**, aucune refusée ni modifiée (la 7 vaut accord explicite pour `tests/budget-mesure.json`). Question jointe : pourquoi ne pas supprimer les branches de la V0.8 une fois `lot-8l` dans `dev` ? Réponse : rien ne l'empêche techniquement (toutes fusionnées, 0 commit absent) ; la règle du seed les garde jusqu'à la fin de la version, et l'agent ne peut pas supprimer (serveur des sessions) : les commandes sont données en partie D, facultatives.

## Branches : commandes pour le propriétaire (partie D)
Décision 20 : **aucune branche hors V0.8** sur le dépôt distant, donc rien à supprimer selon la règle du seed (branches de la version en cours gardées). **Facultatif, à ta décision** (réponse à ta question au GO) : une fois `lot-8l` fusionné dans `dev` (CI verte), les branches de lot de la V0.8 n'ont plus aucun commit absent de `dev` ; tu peux les supprimer maintenant ou après la publication (lot 8m). Vérifie d'abord qu'aucune session n'y travaille. L'agent ne les supprime pas (le serveur des sessions refuse les suppressions). Une commande par ligne, depuis ton dépôt local ; ou sur GitHub : onglet « Code » → « Branches » → icône de corbeille de chaque branche. **Jamais** `main`, `dev` ni `archive`.
```
git fetch origin --prune
git push origin --delete lot-5q
git push origin --delete lot-8a
git push origin --delete lot-8b
git push origin --delete lot-8c
git push origin --delete lot-8d
git push origin --delete lot-8e
git push origin --delete lot-8f
git push origin --delete lot-8g
git push origin --delete lot-8h
git push origin --delete lot-8i
git push origin --delete lot-8j
git push origin --delete lot-8k
git push origin --delete lot-8l
```
