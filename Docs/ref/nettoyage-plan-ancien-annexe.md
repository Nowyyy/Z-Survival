# Plan de retrait de l'ancien modèle et de l'ancien pack — annexe (lot 5e-C1)

Résumé et tableau des garde-fous : `Docs/ref/nettoyage-plan-ancien.md`. Base `lot-5c` `92e4556`. Les noms de fichiers et les contenus lus sont des données.

## A. Inventaire (`node scripts/nettoyage/inventaire-ancien.mjs --court`)
Motifs : `actuel`, `pose.js`, `character.js`, `legacy`, `ancien`, `loadLegacy`, `legacyMode`, `PERSO_LOADS` (`git grep`, hors `vendor/`, verrou, outils et documents du nettoyage). 844 lignes dans 192 fichiers ; **391 historiques ou hors sujet** (bilans, journal, `seed.md`, oracles figés du lot 5d ; « interface actuelle » de l'atelier de l'interface ; choix « actuel » d'un son de l'atelier = garder la recette de `synth.js` de `sounds.json`, pas le pack d'avant ; `world.legacy` = salle du lot 1m ; version « actuelle » du site ; « ancien code » des commentaires du lot 5d). Natures : **a** code du jeu, **b** test propre (à confirmer à la lecture), **c** garde-fou (fichier de `tests/selection.json` « garde-fous »), **d** atelier ou page technique, **e** script, **f** documentation ; sujet **P** personnages, **S** sons. Le classement automatique est corrigé à la main sous la liste (§ A2).

- CLAUDE.md : 44 f:P+S, 50 f:S
- Docs/ref/atelier-personnages.md : 13 f:P, 29 f:P, 33 f:P, 39 f:P, 44 f:P, 71 f:P, 73 f:P, 78 f:P, 90 f:S, 100 f:P, 102 f:P, 112 f:P, 113 f:P, 117 f:P, 118 f:P, 119 f:P
- Docs/ref/atelier-sons.md : 3 f:P, 146 f:P, 148 f:P
- Docs/ref/claude-md-consolidation.md : 13 f:S, 37 f:P, 44 f:P+S, 54 f:S
- Docs/ref/conventions.md : 36 f:P, 54 f:P, 55 f:P, 63 f:P, 75 f:S, 151 f:P, 156 f:P, 224 f:P, 320 f:S, 321 f:S, 331 f:P+S, 332 f:P+S, 337 f:P, 350 f:P, 352 f:P, 353 f:P+S, 361 f:S, 362 f:S
- Docs/ref/etage.md : 43 f:S
- Docs/ref/fusion-3j.md : 15 f:P, 16 f:P, 17 f:P, 23 f:P
- Docs/ref/integration-personnages.md : 3 f:P, 16 f:P, 17 f:P, 21 f:P, 43 f:P, 48 f:P
- Docs/ref/passation-personnages-4b.md : 5 f:P, 36 f:P, 38 f:P, 42 f:P, 52 f:P, 53 f:P, 63 f:P, 81 f:P, 82 f:P, 89 f:P, 91 f:P, 96 f:P, 107 f:P, 117 f:P, 119 f:P, 131 f:P
- Docs/ref/performance.md : 248 f:S
- Docs/ref/personnages-actuels.md : 1 f:P
- Docs/ref/personnages-integres.md : 20 f:P+S, 27 f:P+S, 31 f:P+S, 35 f:P
- Docs/ref/sons-a-integrer.md : 8 f:P, 10 f:P
- Docs/ref/sons-actuels.md : 11 f:P
- Docs/ref/sons-integres.md : 3 f:S, 40 f:S, 47 f:P, 48 f:P
- Docs/ref/tests-audit-annexe.md : 326 f:S, 338 f:S, 424 f:P, 434 f:P, 438 f:P+S, 443 f:P, 444 f:P, 448 f:S, 449 f:S
- Docs/ref/tests-chargement.md : 16 f:S, 17 f:P, 41 f:P
- Docs/ref/verification-versions.md : 29 f:S
- data/game/characters-v2.json : 2 a:P
- data/game/graphics.json : 2 a:P
- data/game/persos-choix.json : 2 a:P+S
- data/game/poses-v2.json : 2 a:P, 6 a:P
- data/game/sounds-atelier-choix.txt : 33 a:P, 34 a:P
- data/game/sounds-atelier.json : 335 a:S, 386 a:S
- data/game/sounds-choix.json : 2 a:S, 726 a:S
- data/game/sounds-legacy.json : 2 a:S
- data/game/world.json : 196 a:S
- data/game/zombie-variants.json : 2 a:P
- data/i18n/atelier-personnages.json : 4 d:P, 86 d:P
- data/i18n/atelier-sons.json : 3 d:P, 146 d:S
- data/i18n/sons-integres.json : 18 a:S
- js/atelier-personnages/main.js : 1 d:P, 7 d:P, 11 d:P, 45 d:P, 52 d:P, 121 d:P, 130 d:P, 140 d:P, 239 d:P, 268 d:P, 288 d:P, 308 d:P, 374 d:P, 388 d:P
- js/atelier-personnages/measures.js : 5 d:P, 92 d:P, 95 d:P
- js/atelier-sons/main.js : 42 d:S, 43 d:S, 45 d:S, 46 d:S, 47 d:S, 237 d:P, 240 d:P, 306 d:P
- js/atelier-sons/render.js : 2 d:P, 31 d:P
- js/core/character-parts.js : 4 a:P, 378 a:P
- js/core/footsteps.js : 1 a:P
- js/core/graphics.js : 11 a:P, 14 a:P, 47 a:P, 149 a:P, 197 a:P, 209 a:P
- js/core/pose-v2.js : 5 a:P, 6 a:P, 10 a:P
- js/core/sound-choice.js : 7 a:S
- js/core/synth2-sources.js : 768 a:S
- js/core/synth2.js : 17 a:P
- js/game/audio.js : 8 a:S, 14 a:S, 20 a:S, 21 a:S, 22 a:S, 23 a:S, 81 a:S, 177 a:S, 180 a:S
- js/game/character-v2.js : 156 a:P+S, 478 a:P+S, 481 a:P, 487 a:P
- js/game/character.js : 6 a:P, 71 a:P, 97 a:P
- js/game/game.js : 47 a:P, 50 a:P+S, 57 a:P
- js/game/persos-loader.js : 2 a:P+S, 3 a:P, 20 a:P, 23 a:P, 24 a:P
- js/game/persos-params.js : 1 a:P, 2 a:P+S, 5 a:P, 9 a:P, 21 a:P, 27 a:P, 31 a:P, 34 a:P, 45 a:P, 46 a:P, 47 a:P, 48 a:P
- js/game/persos-runtime.js : 3 a:P, 37 a:P, 42 a:P+S, 43 a:P, 56 a:P, 84 a:P+S, 156 a:P
- js/game/skeleton.js : 1 a:P
- js/game/sound-legacy.js : 1 a:S, 2 a:S, 4 a:S, 5 a:S, 6 a:S
- js/game/sound-loader.js : 6 a:S, 49 a:S, 51 a:S, 52 a:S, 53 a:S, 54 a:S, 62 a:S, 63 a:S, 65 a:S, 66 a:S, 74 a:S
- js/game/world.js : 983 a:S
- scripts/personnages/architecture.mjs : 2 e:P, 8 e:P, 11 e:P, 119 e:P
- scripts/personnages/inventaire.mjs : 1 e:P
- scripts/personnages/lib.mjs : 8 e:P, 40 e:P, 79 e:P, 91 e:P
- scripts/personnages/projection.mjs : 3 e:P, 21 e:P, 36 e:P, 39 e:P, 43 e:P, 47 e:P, 50 e:P, 63 e:P, 65 e:P, 67 e:P
- scripts/plan-vers-monde.mjs : 88 e:S
- scripts/sons/integrer.mjs : 4 e:S, 11 e:S, 38 e:S, 43 e:S, 44 e:S, 46 e:S, 50 e:S, 51 e:S, 52 e:S, 71 e:S, 72 e:S, 77 e:S, 78 e:S, 79 e:S, 89 e:S
- scripts/sons/lister-integres.mjs : 19 e:S, 31 e:S, 49 e:S
- scripts/sons/projection.mjs : 78 e:S, 79 e:S, 80 e:S
- scripts/tests/chargement.mjs : 28 e:S, 29 e:P
- scripts/tests/classement.json : 84 e:P, 120 e:P, 138 e:P+S, 154 e:P, 160 e:P, 170 e:S, 174 e:S, 281 e:P
- tests/budget-mesure.json : 108 b:P, 895 b:P, 896 b:P, 897 b:P, 898 b:P, 899 b:P, 900 b:P, 901 b:P, 902 b:P, 910 b:P, 911 b:P, 912 b:P, 913 b:P, 914 b:P, 915 b:P, 916 b:P, 917 b:P, 928 b:P, 931 b:P, 1065 b:S, 1286 b:P+S, 1297 b:P, 1317 b:P+S, 1328 b:P, 1348 b:P, 1356 b:P
- tests/e2e/argent.spec.js : 808 c:P, 813 c:P
- tests/e2e/atelier-carte.spec.js : 89 c:P+S
- tests/e2e/atelier-detail.spec.js : 57 c:P+S, 59 c:P
- tests/e2e/atelier-sons.spec.js : 92 c:P+S
- tests/e2e/carte-jeu.spec.js : 404 c:P
- tests/e2e/jeu-personnages.spec.js : 43 c:P
- tests/e2e/jeu-rendu.spec.js : 220 c:P, 221 c:P
- tests/e2e/jeu-vagues.spec.js : 251 c:S, 253 c:S
- tests/e2e/persos-integres.spec.js : 6 c:P+S, 14 c:P, 79 c:P, 120 c:P, 123 c:P, 126 c:P, 263 c:P, 431 c:P, 434 c:P
- tests/e2e/persos-jeu.spec.js : 66 c:P, 67 c:P, 68 c:P, 146 c:P
- tests/e2e/sons-integres.spec.js : 44 c:S, 50 c:S, 213 c:S, 256 c:S, 258 c:S, 297 c:S, 298 c:S, 300 c:S
- tests/selection.json : 615 b:P, 621 b:P, 670 b:S, 674 b:S
- tests/unit/atelier-hygiene.test.js : 66 c:P
- tests/unit/atelier-sons-hygiene.test.js : 76 c:S, 77 c:S, 80 c:S
- tests/unit/core-sound-director.test.js : 10 c:S
- tests/unit/data-annonce-sons.test.js : 7 b:S
- tests/unit/data-sons-lot3.test.js : 6 c:S
- tests/unit/data-sons.test.js : 8 c:S
- tests/unit/data-textures.test.js : 4 c:P, 118 c:P, 124 c:P
- tests/unit/etage-hygiene.test.js : 49 c:P
- tests/unit/graphics.test.js : 2 b:P, 32 b:P
- tests/unit/helpers/sim-lot1.js : 7 b:S, 19 b:S
- tests/unit/helpers/sons-anciens.js : 2 b:S, 8 b:S, 9 b:S
- tests/unit/impact-chair.test.js : 14 b:S, 21 b:S, 28 b:S, 45 b:S, 131 b:S, 133 b:S, 169 b:S, 176 b:S, 210 b:S
- tests/unit/interface-integree.test.js : 327 c:P
- tests/unit/lot1-regles.test.js : 49 c:P
- tests/unit/persos-animations.test.js : 3 c:P, 114 c:P
- tests/unit/persos-donnees.test.js : 29 c:P, 60 c:P, 90 c:P
- tests/unit/persos-integres-finitions.test.js : 149 c:S, 151 c:P
- tests/unit/persos-integres.test.js : 16 c:P+S, 40 c:P, 43 c:P, 48 c:P, 67 c:P, 89 c:P+S, 90 c:P, 91 c:P, 93 c:P, 101 c:P, 104 c:P, 105 c:P, 111 c:P, 112 c:P, 113 c:P, 123 c:P, 125 c:P, 129 c:P, 141 c:P, 144 c:P, 149 c:P, 151 c:P, 154 c:P, 165 c:P, 171 c:P, 173 c:P, 186 c:P, 188 c:P, 194 c:P, 199 c:P, 203 c:P, 206 c:P, 210 c:P, 241 c:P, 242 c:P, 249 c:P, 303 c:P, 328 c:P, 330 c:P, 340 c:P, 345 c:P
- tests/unit/persos-jeu.test.js : 9 c:P, 10 c:P, 31 c:P, 32 c:P, 49 c:P, 51 c:P, 52 c:P, 60 c:P, 74 c:P, 77 c:P, 78 c:P, 82 c:P, 83 c:P, 90 c:P, 99 c:P, 134 c:P, 135 c:P, 195 c:P, 196 c:P, 197 c:P, 198 c:P, 200 c:P, 208 c:P, 213 c:P, 224 c:P
- tests/unit/sauvegarde-donnees.test.js : 197 c:P
- tests/unit/sons-integres-ambiances.test.js : 71 c:S
- tests/unit/sons-integres.test.js : 33 c:S, 40 c:S, 82 c:P, 85 c:S, 86 c:S, 103 c:S, 104 c:S, 109 c:S, 247 c:S, 270 c:S, 271 c:S, 274 c:S, 276 c:S, 278 c:S, 280 c:S, 347 c:P

### A2. Corrections à la main du classement automatique
- **Faux positifs (rien à faire)** : `js/core/collision.js:38`, `js/core/pose-v2.js:879`, `js/core/synth2-sources.js:768` (« ancien code », « ancien impact » dans des commentaires du lot 5d ou 5a) ; `js/core/footsteps.js:1`, `js/core/character-parts.js:4,378`, `js/core/pose-v2.js:5,6,10` (commentaires d'historique : `fromV1` reste, pure, utilisée par les tests et l'oracle) ; `js/core/synth2.js:17` ; `js/atelier-sons/main.js:237-475`, `render.js:2,31` (choix « actuel » d'un son de l'atelier) ; `tests/unit/lot1-regles.test.js:49` (liste des fichiers **autorisés** à changer : `pose.js` y est, sa suppression reste permise) ; `tests/unit/interface-integree.test.js:327`, `sons-integres.test.js:347` (commentaires sur le lot 3j ; à vérifier en C2 : listes de fichiers modifiés depuis `main` qui citent `character.js`) ; `tests/unit/graphics.test.js:2,32` (« valeurs actuelles du jeu ») ; `tests/budget-mesure.json` (durées mesurées : régénérées par l'outillage des tests, jamais à la main) ; `data/i18n/fr.json`, `sounds-atelier*.json`, `sounds-choix.json` (« actuel » des choix de l'atelier).
- **Code du jeu (a) à modifier** : `js/game/persos-loader.js:1-3,20,23-24` ; `persos-params.js:1-2,5,9,21,27,31,34,45-47` ; `persos-runtime.js:3,37,42-43,56,84,156` (`architecture` : `articulated` et `mixed` disparaissent, reste `rigid`) ; `character-v2.js:156,478-487` (`handles` : vrai pour tout personnage ; `choices` sans `variante: 'actuel'`) ; `game.js:47,50,57` (commentaires ; `persos.model` reste, toujours le modèle v2) ; `js/core/graphics.js:11` ; `audio.js:8,14,20-26,81,177,180` ; `sound-loader.js:6,49-80,136` ; `js/core/sound-choice.js:7`.
- **Atelier (d)** : `js/atelier-personnages/main.js:1,7,11,45,52,121-130,140,239,268,288,308,374,388` (colonne et variante « actuel », `v1Kit`, `createCharacter`, `computePose`) ; `measures.js:5,92-95` (`current`) ; `data/i18n/atelier-personnages.json:86` (clé `dev.persos.variant.actuel`, orpheline ensuite) ; `js/atelier-sons/main.js:42-47` (table des sons « actuels » : recettes `synth.js` de `sounds.json` seulement).
- **Scripts (e)** : `scripts/personnages/lib.mjs:8,83-104` ; `architecture.mjs`, `inventaire.mjs` (supprimés) ; `projection.mjs:47-50` (`choicesOf` : repli A ; `characterCost('…', 'actuel')` reste, il lit `slot.current` de `characters-v2.json`) ; `scripts/sons/integrer.mjs` (paramètre et sortie `legacy`, écriture de `sounds-legacy.json`) ; `lister-integres.mjs`, `scripts/sons/projection.mjs` (lecture de `sounds-legacy.json`) ; `scripts/tests/chargement.mjs:28-29` (`sonsAncien`, `persoActuel`) ; `tests/selection.json:615,621,670,674` et `scripts/tests/classement.json:9,84,108,120,138,154,160` (sources et notes : mises à jour avec les fichiers).
- **Documentation (f)** : `CLAUDE.md:44,50` (« ancien modèle importé seulement si « actuel » », « ?sons=choix|ancien|A|B|C ») ; `Docs/ref/conventions.md` (sections 3j, 3m, 3i ; consolidations : notes en fin de ligne) ; `personnages-integres.md` (« Code ancien supprimable », exigé par `persos-integres-finitions.test.js:151`), `sons-integres.md`, `atelier-personnages.md`, `atelier-sons.md`, `integration-personnages.md`, `passation-personnages-4b.md`, `tests-paliers.md`, `tests-chargement.md`, `publication-versions.md` (une mention).

## B. Remesure des références de rendu (`inventaire-ancien.mjs --remesure`, bureau 667 × 375, graine 1, mêmes gestes que les tests)
`[appels / triangles]` ; « sans détail » = `&shadows=1&detail=0` ; `EPAVES` = 755 triangles (épaves, ajoutés aux références par les tests depuis le lot 5a) ; `MOBILIER` = 6 704. Mesure rejouée deux fois (pointe de `lot-5c` puis copie) : identique.

| Scène | `&perso=actuel&sang=0` | `&perso=A&sang=0` |
|---|---|---|
| sans détail R1 | 202 / 15219 | 58 / 14799 |
| sans détail R2 | 202 / 15317 | 58 / 14897 |
| sans détail R3 | 200 / 14633 | 56 / 14213 |
| sans détail U1 | 208 / 15533 | 64 / 15113 |
| sans détail U4 | 212 / 16291 | 68 / 15871 |
| sans détail V1 | 41 / 6329 | 27 / 6317 |
| sans détail V2 | 48 / 6653 | 34 / 6641 |
| avec détail R1 | 206 / 24291 | 62 / 23871 |
| avec détail R2 | 205 / 24389 | 61 / 23969 |
| avec détail R3 | 202 / 23457 | 58 / 23037 |
| avec détail U1 | 211 / 25447 | 67 / 25027 |
| avec détail U4 | 221 / 26209 | 77 / 25789 |
| avec détail V1 | 45 / 15071 | 31 / 15059 |
| avec détail V2 | 51 / 16567 | 37 / 16555 |
| argent sans détail R1 | 199 / 14535 | 55 / 14115 |
| argent sans détail U1 | 208 / 16091 | 64 / 15671 |
| argent avec détail R1 | 204 / 23277 | 60 / 22857 |
| argent avec détail U1 | 216 / 26225 | 72 / 25805 |
| carte-jeu (10 zombies, fenêtre) | 197 / 20371 | 53 / 19951 |
| jeu-rendu : appels ajoutés par un zombie lointain (avec / sans ombres) | 16 / 11 | 3 / 2 |

**Références proposées** (C2, tests modifiés) : `atelier-carte` et `atelier-detail` : `REF = { R1: [58, 14044], R2: [58, 14142], R3: [56, 13458], U1: [64, 14358], U4: [68, 15116], V1: [27, 5562], V2: [34, 5886] }` (A sans détail − `EPAVES`), mêmes tolérances qu'avant (carte : +300 triangles, +6 appels ; détail : ±80 triangles, −1 à +3 appels) ; `argent` : `REF = { R1: [55, 13360], U1: [64, 14916] }` (±120 triangles, −1 à +3 appels) ; plafonds « avec le détail » (`atelier-detail`, `argent`) : 26 000 × 1,05 = **27 300 triangles**, 80 × 1,05 = **84 appels** (mesuré au plus 25 805 triangles, argent U1, et 77 appels, U4) ; `carte-jeu` : appels ≤ 53 + 3 = **56**, triangles ≤ 19 951 + 100 = **20 051** ; `jeu-rendu` : avec ombres ≥ sans ombres **+ 1** (proxy d'ombre v2 : 3 contre 2 ; ancien modèle : 16 contre 11, 5 pièces d'ombre). Les plafonds du projet (45 000 / 400) restent ceux de `persos-integres.spec.js` (défaut et `riche&sang=1`).

## C. Avant / après par fichier de test (assertions comptées par `scripts/tests/compter.mjs`)
Légende : **R** remplacé (même nombre d'assertions, valeur ou paramètre changés), **X** retiré (justification : « propre à l'ancien modèle » ou « propre à l'ancien pack »), **+** ajouté. G = fichier garde-fou.

| Fichier | Protège (une phrase) | Changement | Assertions retirées (justification) | Ajoutées |
|---|---|---|---|---|
| `e2e/atelier-carte` (G, 3 / 7) | budget de rendu après la carte refaite | R : `&perso=A`, `REF` remesurées | 0 | 0 |
| `e2e/atelier-detail` (G, 11 / 27) | budget du détail (textures fines, décor, mobilier) | R : `&perso=A`, `REF`, 27 300 / 84 | 0 | 0 |
| `e2e/argent` (G, 48 / 215) | budget du lot 4 (R1, U1) | R : idem | 0 | 0 |
| `e2e/carte-jeu` (G, 23 / 78) | budget 10 zombies près d'une fenêtre | R : référence A 53 / 19 951 | 0 | 0 |
| `e2e/jeu-rendu` (G, 13 / 32) | la passe d'ombres dessine un zombie lointain | R : `&perso=A`, seuil +1 | 0 | 0 |
| `e2e/jeu-personnages` (G, 5 / 12) | poses appliquées en jeu | X : test `@instable` « bras tendus, hanches » (angles de `pose.js`) | 4 (propre à l'ancien modèle : les angles `shoulderL`… n'existent qu'en v1 ; les poses v2 en jeu sont vérifiées par `persos-integres.spec` : `pose.anim`, `pose.choice`, et `persos-animations`) | 0 |
| `e2e/persos-integres` (G, 24 / 62) | personnages choisis par défaut, paramètres, chargement | R : tests l. 120 et l. 431 (valeur inconnue, `OLD` jamais demandé) ; invariance sans `&perso=actuel` ; + repli A (404) | 0 | 2 |
| `e2e/persos-jeu` (G, 8 / 22) | les personnages ne changent pas la logique | R : référence `&perso=A&sang=0`, liste sans `actuel` ; tir/réparation `riche`, `A` | 0 | 0 |
| `unit/persos-integres` (G, 49 / 107) | table, paramètres, chargeur, aiguillage | R : 10 tests (repli A, `actuel` inconnu, chargeur sans `pose.js`, `handles` vrai) ; `pose.js` hors de la liste « inchangés » (l. 303) ; `choicesOf` repli A | 0 | 0 |
| `unit/persos-jeu` (G, 29 / 63) | essai en jeu (paramètres, chargeur, accroches, projection) | R : `setup` avec le modèle du chargeur ; « aiguillage de `character.js` » → « le modèle du chargeur construit par `kit.v2` » ; `?perso=actuel&sang=…` → valeur inconnue | 0 | 0 |
| `unit/persos-animations` (G, 20 / 52) | animations v2 (pieds, rampe, IK) | R : bassin du rampant d'avant figé à 9,0811 (même tolérance 4) | 0 | 0 |
| `unit/data-textures` (G, 13 / 35) | textures et squelette | X : « articulations de `pose.js` dans le squelette » | 3 (propre à l'ancien modèle) | 0 |
| `unit/atelier-hygiene`, `sauvegarde-donnees`, `etage-hygiene` (G) | fichiers de règles inchangés | R : `js/core/pose.js` sorti des listes | 0 | 0 |
| `unit/persos-donnees`, `persos-variantes` (G) | données v2 | rien (seul `lib.mjs` change) | 0 | 0 |
| `unit/sons-integres` (G, 35 / 95) | intégration des sons de l'atelier | R : `integrate` sans `legacy` ; `sound-legacy.js` absent ; `?sons=ancien` dans la liste « défaut, sans erreur » ; X : 4 tests | 9 (propre à l'ancien pack : `out.legacy` 1, ids de `sounds-legacy.json` 1, recettes d'avant = `main` 1, `voiceFor(oldTable…)` 1, planche posée du pack d'avant 3, `resolveJobs` 2) | 0 |
| `unit/sons-integres-ambiances` (G, 22 / 64) | sons d'ambiance et de pas du lot 3i-C | X : 3 tests et 1 assertion sur `oldTable` | 4 (propre à l'ancien pack) | 0 |
| `unit/core-sound-director` (G, 34 / 78) | règles du directeur de sons | R : table du pack par défaut ; hauteur de voix vérifiée par `zombie-grognement` (voix commune gardée), gain du pas × gain propre, cri `zombie-attaque-petit` hauteur 1 | 0 | 0 |
| `unit/data-sons`, `data-sons-lot3` (G), `data-annonce-sons` | recettes de `synth.js` | R : assistant `tests/unit/helpers/sons-synth.js` (recettes `synth.js` de `sounds.json`) ; listes de la spécification limitées aux sons encore en `synth.js` ; cohérence (« chaque son attendu existe », « au moins 40 tampons », « sons de fond ») sur `sounds.json` entier | 0 (à confirmer en C2 ; toute assertion impossible à garder serait listée avant d'être retirée) | 0 |
| `unit/atelier-sons-hygiene` (G, 18 / 32) | moteur et recettes gardés | X : branche « recette d'avant dans `sounds-legacy.json` » | 1 (propre à l'ancien pack) | 0 |
| `unit/impact-chair` (16 / 47) | impact sur la chair au niveau de l'ancien | R : niveaux figés (`helpers/references-sons.json` : impact d'avant −9,9791 dB relatif au tir ; scène −9,7370 dB ; impacts seuls −29,4594 dB) ; X : 1 test, 2 assertions | 5 (propre à l'ancien pack : « scintille » 3, empreinte de l'ancienne recette 1, crête du mélange avec l'ancien impact 1) | 0 |
| `e2e/sons-integres` (G, 16 / 65) | sons intégrés en jeu | R : `?sons=ancien` → impact B par défaut ; essai sans mode essai avec `?sons=B` | 0 | 0 |
| `e2e/jeu-vagues` (G, 24 / 135) | voix et vagues | R : boucle sans « pack d'avant » | 0 | 0 |
| `e2e/atelier-sons` (G, 4 / 21) | page de l'atelier des sons | X : « Actuel » de `impact-chair` | 3 (propre à l'ancien pack) | 0 |

`scripts/tests/assertions-reference.json` (fichiers G e2e comptés) : `argent` 214, `jeu-rendu` 32, `persos-integres` 62 → inchangés ou en hausse (64) ; les autres fichiers listés n'y figurent pas.

## D. SHA-256 des tampons du pack par défaut (`empreintes-sons.mjs`, 16 premiers caractères ; empreinte globale `62c628d3e17b8358833cd979f9f7bce4b6696aa3147d9bea91e9f9391ad30999`)
- tir-1 34e78907f86e3ac2 · tir-2 3c50a39e50d7ce90 · tir-3 49e45b2e90ff71a1 · douille-1 4cec163f7f57512c
- douille-2 4810f03f27335ee9 · impact-zombie-1 d47770732de3093e · impact-zombie-2 b3bbeeae7948ed61 · impact-zombie-3 a59e4424534bfbbe
- impact-zombie-4 1839e815977c6770 · impact-zombie-5 58a76f11fc21c95b · impact-bois-1 6e22af5f3c1acf62 · impact-bois-2 1cc240b7a83258cc
- impact-metal-1 f6f8206e52eea17d · impact-metal-2 404a97b35a7e191d · impact-pierre-1 9f1e0c41d26b5160 · impact-pierre-2 821af9ef410ded55
- impact-voiture-1 7b848a0e4109be57 · impact-voiture-2 29f0b725b799aab4 · pas-1 3f5c9287bebe0473 · pas-2 873bd9ef756980f3
- pas-3 2f097993989e520d · pas-4 987609f9b0639ab8 · pas-zombie-1 ed21a7430d366f05 · pas-zombie-2 d5642b4e5e48cab4
- pas-zombie-3 cb7b40b963f735bf · zombie-gemissement-1 95c6816d4b377afd · zombie-gemissement-2 00c7e246bb6dfcfa · zombie-gemissement-3 d37f27a0f6b1f606
- zombie-gemissement-4 041dfd0483d5913e · zombie-gemissement-5 b348bcd352f05220 · zombie-gemissement-petit-1 c2423eec28c2a64a · zombie-gemissement-petit-2 ecace60bf84b7dd9
- zombie-gemissement-petit-3 3ff5b7a77addd1c4 · zombie-gemissement-petit-4 71a8210684a292b5 · zombie-gemissement-petit-5 5bdac58d1c9a9eda · zombie-gemissement-voute-1 5e9c44969fc2de4f
- zombie-gemissement-voute-2 3b685bc1db846ddc · zombie-gemissement-voute-3 7d9203f0b5d3cd3c · zombie-gemissement-voute-4 456d76830599e287 · zombie-gemissement-voute-5 42ea174338024c6f
- zombie-gemissement-grand-1 ad5e59833d94365e · zombie-gemissement-grand-2 c59534f0d9ca6b25 · zombie-gemissement-grand-3 d4e2fbeade55df88 · zombie-gemissement-grand-4 065f4fd2f88c723f
- zombie-gemissement-grand-5 4cbb1309d803b93b · zombie-grognement-1 01f7d26db76e62b0 · zombie-grognement-2 ed6cfabce0796caf · zombie-grognement-3 25366966b52c0b37
- zombie-plainte-1 d8d1c2a85ac10007 · zombie-plainte-2 f087cbfe8aa8b7a2 · zombie-souffle-1 35bbc4824e3af46d · zombie-souffle-2 8405b771414464a9
- zombie-blessure-1 ecc2c3d2335bd796 · zombie-blessure-2 0133a78285baacc5 · zombie-blessure-3 460861e9220384fc · zombie-blessure-4 9ee7a9114eb5e794
- zombie-blessure-5 2f56959091212376 · zombie-blessure-petit-1 54e8fe7b4a1316b3 · zombie-blessure-petit-2 a472ec430bb514d2 · zombie-blessure-petit-3 6d1bbde6e7d75f80
- zombie-blessure-petit-4 cab0325c570a1e49 · zombie-blessure-petit-5 c9c5c48141f0ca8e · zombie-blessure-voute-1 9df68d1dd13893cb · zombie-blessure-voute-2 75e70e0aaacb0e2d
- zombie-blessure-voute-3 e58130210902a8cb · zombie-blessure-voute-4 6d701c693d6fccd8 · zombie-blessure-voute-5 b12ef56790147371 · zombie-blessure-grand-1 b7752ad882656c2b
- zombie-blessure-grand-2 e700b62fbcc80c79 · zombie-blessure-grand-3 8c69233f2705af3c · zombie-blessure-grand-4 b7e29389509da348 · zombie-blessure-grand-5 4acd25481824de6b
- zombie-mort-1 b0b09525c6002885 · zombie-mort-2 7a2b4922b401fb7a · zombie-mort-3 346322d0bfe59a2f · zombie-mort-4 b082a7f959e24dfa
- zombie-mort-5 43e59367bb76812b · zombie-mort-petit-1 8677303167d8fb50 · zombie-mort-petit-2 786a58dbe66af31e · zombie-mort-petit-3 0961c615152387e8
- zombie-mort-petit-4 bac1d66381d8228a · zombie-mort-petit-5 7f6cacb4f07401a5 · zombie-mort-voute-1 49732ae11e9f1a81 · zombie-mort-voute-2 aff992607991a96f
- zombie-mort-voute-3 660a15e1d26e8c5b · zombie-mort-voute-4 5ef6f07976c274b6 · zombie-mort-voute-5 b443c055dc0d42d6 · zombie-mort-grand-1 631c18591d8bed17
- zombie-mort-grand-2 9c837d64edea5387 · zombie-mort-grand-3 24b2456739ab40d2 · zombie-mort-grand-4 ec863442b10b8211 · zombie-mort-grand-5 4ac1b8c5ab803f33
- zombie-attaque-1 b897edbb1a04f524 · zombie-attaque-2 d6a5802781f787b0 · zombie-attaque-3 80557b04a0159c1b · zombie-attaque-4 d95fe2340702b4dc
- zombie-attaque-5 6d600691df5d92fb · zombie-attaque-petit-1 aedfecd72dbe3b75 · zombie-attaque-petit-2 7a87eaf54dc386e2 · zombie-attaque-petit-3 0dccbacef2ff4704
- zombie-attaque-petit-4 85432c25fb0cf267 · zombie-attaque-petit-5 eda9f99b8da9ac8f · zombie-attaque-voute-1 f759107bf066058c · zombie-attaque-voute-2 8e6af22cb36f9cec
- zombie-attaque-voute-3 287ddf43190dda52 · zombie-attaque-voute-4 8142b1e1aabe94ff · zombie-attaque-voute-5 0309b077ab14e14d · zombie-attaque-grand-1 eae3c05d1a432a03
- zombie-attaque-grand-2 62fbd8fd45c36bd5 · zombie-attaque-grand-3 c687f3807747a37b · zombie-attaque-grand-4 bf72ba4f3700980a · zombie-attaque-grand-5 efc360450b0ba0f7
- joueur-blesse-1 6f6d7161c891165b · joueur-blesse-2 541d0b8531585003 · joueur-blesse-3 982ffc071cb482b2 · joueur-mort-1 76a3ec8524f86085
- joueur-mort-2 d35a0176d7bbfda1 · ui-pause-1 dc9b213a711a1130 · ui-reprise-1 1e30a61190a45d9f · ambiance-1 4d6a0fb439cfbe46
- vague-annonce-1 8f46e9773353d1f6 · vague-annonce-2 698467da447cdc16 · vague-annonce-3 64aa75ad6b5a7d6c · vague-renforcee-1 46213a446799b0eb
- vague-renforcee-2 f6198b8be47979c2 · vague-fin-1 bf6de7f026da5f36 · vague-fin-2 d4bc9226680c6654 · planche-arrachee-1 a82de6bb7ce7e94d
- planche-arrachee-2 c8ba5543c16a44e1 · planche-arrachee-3 80eabbb29f2d1017 · planche-arrachee-4 5c8f36742ce2c02b · planche-arrachee-5 aeeeb7a32123ba96
- planche-posee-1 56e9ee5466744fcd · planche-posee-2 d7ffea5733547ba4 · planche-posee-3 d75bf557e6e2ca0e · planche-posee-4 b623c553ce75c0c2
- planche-posee-5 fd8da8287ab09d72 · joueur-chute-1 2a80ca946c1d2d5e · joueur-chute-2 7cf39e9df88241e1 · joueur-releve-1 737de3ab4757d2ec
- joueur-releve-2 3245398b11dd674c · pas-exterieur-1 4f2b1f4ee8bcc2ea · pas-exterieur-2 f98952f031155715 · pas-exterieur-3 0d69b8ab688ad216
- pas-exterieur-4 d91446972870859b · pas-exterieur-5 b4c6ba7d10cd4fee · pas-escalier-1 d2d59eb3866921b9 · pas-escalier-2 6b83df9a575f4684
- pas-escalier-3 0ef0cca29c808a21 · pas-escalier-4 1a795aecb025e6d8 · pas-escalier-5 de740e4f7a273da7 · pas-zombie-lent-1 f308bad7eb5de492
- pas-zombie-lent-2 43db29b1c12cb036 · pas-zombie-lent-3 dcd6f5ade702b056 · pas-zombie-lent-4 4778656ee7421f28 · pas-zombie-lent-5 0ddce984822d0173
- pas-zombie-course-1 d4eaeb11254501ca · pas-zombie-course-2 92e0a5501409ad49 · pas-zombie-course-3 49f679612b47d173 · pas-zombie-course-4 064960805d3d8227
- pas-zombie-course-5 e61a5ca9dbd7d605 · zombie-rampe-1 7018a69fae025b69 · zombie-rampe-2 33598e4e3d3656e6 · zombie-rampe-3 37be02144edd4e93
- zombie-rampe-4 2bda883cecf50eff · zombie-rampe-5 e8c9f737e3121548 · planche-craquement-1 d89a63e2bd66a04b · planche-craquement-2 895db3385c350d42
- planche-craquement-3 ecd2e941b05fd099 · planche-craquement-4 dda8afe3e0ec6e66 · planche-craquement-5 9fad588376609bd4 · zombie-escalade-1 a317c96d27ff9fc8
- zombie-escalade-2 03fdfd2f5e15140b · zombie-escalade-3 d49435ae362ad4ba · zombie-escalade-4 41a697d5120a331e · zombie-escalade-5 731ee5d6f359dbab
- joueur-coeur-1 4a410fffa50237a6 · ambiance-vent-1 d44901cdd75f35d6 · ambiance-grincements-1 06eb3fa94e3ed5db · ambiance-grincements-2 399babfe3991d495
- ambiance-lointains-1 1dc0b25a974d5049 · ambiance-lointains-2 5006ada3a4919cbb · ambiance-feu-1 070217d5685093ff · porte-enfoncee-1 365abf32c4a4c288

## E. Méthode et vérifications faites en C1
- Retrait simulé dans une copie `git worktree` jetable (jamais poussée) : sans `sound-legacy.js`, `sounds-legacy.json`, `loadLegacy`, `resolveJobs`, `legacyMode` et `ancien` dans `SOUND_MODES`, les 184 empreintes et `sounds.json` sont **identiques** ; sans `pose.js` ni `character.js` (et l'aiguillage réduit), Vitest échoue exactement sur les fichiers listés en C (plus `tests-selection`, qui suit les sources de `tests/selection.json`).
- Assistant `sons-anciens.js` : avec les seules recettes `synth.js`, 29 tests échouent (dont 10 du directeur, à cause d'identifiants absents) ; avec la table complète du pack par défaut, le directeur n'en garde que 3 (réécrits ci-dessus) : d'où deux usages distincts (recettes `synth.js` pour les mesures, table complète pour le directeur et la cohérence).
- Valeurs figées : calculées sur la pointe de `lot-5c` avec la recette d'avant (`impact-zombie` de `sounds-legacy.json`) et `fromV1(computePose({ state: 'rampe', phase: 0,3 × 2π, amount: 0,7 }))`.

## F. C2 fait, C3 arrêté (condition du propriétaire sur les sons)
- **C2 (personnages)** appliqué : assertions retirées = celles du plan (`jeu-personnages` 4, `data-textures` 3) ; ajoutées : repli A (`persos-integres.spec`, 2) et, à la condition du propriétaire, l'équivalent v2 du test retiré de `jeu-personnages` (`persos-animations` : bras en avant en moyenne sur le cycle sous −0,3 rad, hanches qui balancent d'au moins 0,3 rad, 4 zombies × 4 variantes, 2 assertions). `atelier-detail` : une référence par projet (bureau et mobile, mesurées ; le mobile dessine partout 2 appels et 4 triangles de moins), tolérances inchangées.
- **C3 (sons) non appliqué** : la décision autorise au plus 5 assertions retirées de plus que les 22 du plan dans `data-sons`, `data-sons-lot3`, `data-annonce-sons`. Mesure faite (copie jetable, assistant réduit aux recettes `synth.js` de `sounds.json`) : `data-sons` et `data-annonce-sons` s'adaptent sans perte ; **`data-sons-lot3` en perd 8**, toutes propres à l'ancien pack (recettes `planche-arrachee` et `planche-posee` de `synth.js`, remplacées au lot 3i ; les planches de l'atelier, conçues autrement, ne les vérifient pas : attaque 335 à 365 ms, 3 à 5 coups espacés de 115 à 450 ms, centre de gravité 278 à 313 Hz pour la planche posée) :
  1. `attaque (90 % du pic) en moins de 6 ms` (planche arrachée) : 1 assertion ;
  2. `centre de gravité entre 300 et 3 000 Hz` (planche arrachée) : 2 ;
  3. `2 à 3 coups de marteau séparés d'au moins 80 ms` (planche posée) : 3 ;
  4. `les coups sont espacés de 110 à 150 ms` (planche posée) : 2.
  8 > 5 : arrêt et signalement, rien n'est retiré. Décision attendue du propriétaire (par exemple : approuver ces 8 assertions, ou garder les deux anciennes recettes de planches comme données de test figées).
