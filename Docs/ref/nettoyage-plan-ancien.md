# Plan de retrait de l'ancien modèle de personnages et de l'ancien pack de sons (lot 5e-C1)

Base : pointe de `lot-5c` `92e4556` (nettoyage du lot 5c, `dev` du lot 5d compris), branche `lot-5e`, 6 novembre 2026. **C1 ne modifie aucun fichier de `js/`, `data/`, `tests/` ni de `scripts/` hors `scripts/nettoyage/`** : il ajoute ce plan, son annexe (`nettoyage-plan-ancien-annexe.md` : inventaire complet, mesures, avant/après par test), le modèle de décisions et deux scripts en lecture seule : `scripts/nettoyage/inventaire-ancien.mjs` (inventaire ; `--remesure` : références de rendu) et `scripts/nettoyage/empreintes-sons.mjs` (SHA-256 de chaque tampon du pack par défaut, sans navigateur). C2 n'applique que ce que `Docs/ref/nettoyage-plan-ancien-decisions.md` (`STATUT: VALIDE`) approuve. **Aucun comportement du jeu ne change avec une table valide et sans paramètre.** *(Lot 5m : annexe retirée, décision R2 ; texte intégral dans l'historique : `git show 919d64f:Docs/ref/nettoyage-plan-ancien-annexe.md`.)*

## Ce qui serait retiré
| Retrait | Fichiers supprimés | Lignes modifiées (résumé) |
|---|---|---|
| Personnages | `js/core/pose.js` (213 l., 9 381 o), `js/game/character.js` (221 l., 10 910 o), `scripts/personnages/architecture.mjs` (6 708 o, comparaison des architectures du lot 3j), `scripts/personnages/inventaire.mjs` (3 171 o, état des lieux de l'ancien modèle) | `persos-loader.js` (import dynamique et modèle ancien), `persos-params.js` (`actuel` hors de `PERSO_VALUES` et `VARIANTES`, repli **A**, plus de mode inactif), `persos-runtime.js`, `character-v2.js` (`handles`, `choices`), `game.js` (commentaires), `graphics.js` (`PERSO_LOADS` sans `actuel`), atelier des personnages (colonne et variante « actuel », `measures.current`, clé `dev.persos.variant.actuel`), `scripts/personnages/lib.mjs` (`currentPose`, `currentMetrics` et l'import de `pose.js`), `projection.mjs` (`choicesOf` : repli A, comme le jeu), `scripts/tests/chargement.mjs` (`persoActuel`) |
| Sons | `js/game/sound-legacy.js` (10 l., 553 o), `data/game/sounds-legacy.json` (690 l., 14 395 o, publié) | `sound-loader.js` (`loadLegacy`, `resolveJobs`), `audio.js` (`legacyMode`), `js/core/sound-choice.js` (`SOUND_MODES` sans `ancien`), `scripts/sons/integrer.mjs` (n'écrit plus `sounds-legacy.json` ; `integrate` sans `legacy`), `lister-integres.mjs`, `scripts/sons/projection.mjs`, atelier des sons (`js/atelier-sons/main.js` : « Actuel » d'un son remplacé), `scripts/tests/chargement.mjs` (`sonsAncien`) |

Gain estimé : 6 fichiers supprimés (≈ 45 ko, ≈ 1 290 lignes), dont 2 publiés (`sounds-legacy.json`, `sound-legacy.js`) et 2 seulement chargés à la demande (`pose.js`, `character.js`) ; **JavaScript chargé par défaut : 113 → 113** (aucun de ces fichiers n'est chargé par défaut) ; tests : 10 retirés, 1 ajouté, ≈ 30 réécrits (détail en annexe C).

## Comportement après retrait
- `?perso=actuel` et `?sons=ancien` : valeur inconnue = défaut (`choix`), sans erreur, jamais mémorisée ; `?perso=actuel&sang=0` = `?sang=0`.
- **Repli du chargeur** (table `persos-choix.json` absente, illisible, ou variante inconnue d'un personnage, `actuel` compris) : **variante A** pour ce personnage (avant : ancien modèle, et rien de chargé sans table). Test prévu : `readPersosParams('', null)` → 5 personnages `A`, `v2: true`, actif ; `slotVariants('choix', { persos: { petit: { variante: 'Z' } } })` → `A` ; e2e : `persos-choix.json` en 404 → le jeu démarre, `persos.slots` tous `A`, aucune erreur de console.
- Avec la table valide et sans paramètre : mêmes personnages, mêmes sons, même rendu (preuves ci-dessous).

## Garde-fous touchés (résumé ; détail par test : annexe C)
| Fichier (G = garde-fou) | Tests avant → après | Assertions avant → après | Ce qui change |
|---|---|---|---|
| `e2e/atelier-carte` (G) | 3 → 3 | 7 → 7 | `&perso=actuel` → `&perso=A` ; `REF` remesurées avec A (mêmes marges : +300 triangles, +6 appels) |
| `e2e/atelier-detail` (G) | 11 → 11 | 27 → 27 | idem ; plafonds 30 000 / 240 → **27 300 / 84** |
| `e2e/argent` (G) | 48 → 48 | 215 → 215 | idem (R1, U1) ; plafonds 30 000 / 240 → **27 300 / 84** |
| `e2e/carte-jeu` (G) | 23 → 23 | 78 → 78 | budget 10 zombies : référence A 53 / 19 951 (+3 appels, +100 triangles) |
| `e2e/jeu-rendu` (G) | 13 → 13 | 32 → 32 | ombres lointaines : `&perso=A` ; au moins **+1** appel d'ombre (proxy v2) au lieu de +5 (5 pièces de l'ancien modèle) |
| `e2e/jeu-personnages` (G) | 5 → 4 | 12 → 8 | retiré : angles de `pose.js` (`shoulderL`, `hipL`) d'un zombie « actuel » (**propre à l'ancien modèle**) |
| `e2e/persos-integres` (G) | 24 → 25 | 62 → 64 | « ?perso=actuel » et « ?perso=actuel&sang=0 » : valeur inconnue, aucun module ancien demandé ; invariance sans `actuel` ; **ajouté** : repli A quand la table répond 404 (2 assertions) |
| `e2e/persos-jeu` (G) | 8 → 8 | 22 → 22 | invariance comparée à `&perso=A&sang=0` (variantes : défaut, A, B, C, riche&sang=0, riche&sang=reduit, riche&sang=1, B&sang=reduit) ; tir/réparation : `riche`, `A` |
| `unit/persos-integres` (G) | 49 → 49 | 107 → 107 | repli A, `actuel` inconnu, chargeur sans `pose.js` ; `pose.js` hors des listes « inchangés » |
| `unit/persos-jeu` (G) | 29 → 29 | 63 → 63 | modèle du chargeur au lieu de `character.js` ; « ?perso=actuel&sang=… » → valeur inconnue |
| `unit/persos-animations` (G) | 20 → 20 | 52 → 52 | rampe : bassin de l'ancien rampant **figé** (9,0811, ±4) au lieu de `computePose` |
| `unit/data-textures` (G) | 13 → 12 | 35 → 32 | retiré : « articulations de `pose.js` dans le squelette » (**propre à l'ancien modèle**) |
| `unit/atelier-hygiene`, `sauvegarde-donnees`, `etage-hygiene` (G) | = | = | `js/core/pose.js` sorti des listes « fichiers inchangés » (fichier supprimé) |
| `unit/sons-integres` (G) | 35 → 31 | 95 → 86 | retirés : `sounds-legacy.json` à jour, recettes d'avant conservées (2), voix commune du pack d'avant, planche posée du pack d'avant (3), `resolveJobs` (2) : **propres à l'ancien pack** |
| `unit/sons-integres-ambiances` (G) | 22 → 19 | 64 → 60 | retirés : 4 assertions sur la table du pack d'avant (**propres à l'ancien pack**) |
| `unit/core-sound-director` (G) | 34 → 34 | 78 → 78 | table du pack par défaut (au lieu du pack d'avant) ; 3 tests réécrits (hauteur par `zombie-grognement`, gain propre du pas, cri par type) |
| `unit/data-sons`, `data-sons-lot3` (G), `data-annonce-sons` | = | = | recettes `synth.js` du pack par défaut (assistant `sons-synth.js`) ; listes de la spécification réduites aux sons encore en `synth.js`, cohérence sur `sounds.json` entier |
| `unit/atelier-sons-hygiene` (G) | 18 → 18 | 32 → 31 | retirée : recette d'avant de `impact-zombie` gardée dans `sounds-legacy.json` (**propre à l'ancien pack**) |
| `unit/impact-chair` | 16 → 15 | 47 → 42 | niveaux de l'ancien impact **figés** (`tests/unit/helpers/references-sons.json`) ; retirés : « l'ancien son scintille » (3), empreinte de l'ancienne recette, crête du mélange avec l'ancien impact |
| `e2e/sons-integres` (G) | 16 → 16 | 65 → 65 | `?sons=ancien` → valeur inconnue (impact B par défaut) ; essai sans mode essai : `?sons=B` |
| `e2e/jeu-vagues` (G) | 24 → 24 | 135 → 135 | hauteur des voix : cas « pack d'avant » retiré de la boucle |
| `e2e/atelier-sons` (G) | 4 → 4 | 21 → 18 | retirées : « Actuel » de `impact-chair` (ancien « cling ») (**propre à l'ancien pack**) |

**Assertions retirées : 29** (personnages 7, sons 22), toutes « propres à l'ancien modèle » ou « propres à l'ancien pack » ; **ajoutées : 2** (repli A en e2e ; le repli unitaire remplace les tests de l'ancien repli). Aucune propriété protégée ne disparaît sans remplacement : **aucun BLOQUANT**. Plafonds proposés (règle : valeur mesurée arrondie au millier ou à la dizaine supérieurs, + 5 %, jamais au-dessus de 45 000 / 400) : avec le détail, A mesure au plus 25 805 à 25 789 triangles et 77 appels (U4) → **27 300 triangles et 84 appels**.

## Preuves prévues pour C2 (à chaque pas)
(a) six empreintes de `scripts/perf/trace-logique.mjs` identiques à la pointe de `lot-5c` (finales `7e5fed6a`, `3cab05cf`, `4b78adcd`, `dde468cb`, `42056a40`, `8a17408c`) ; (b) `--os` : matrices des os identiques (référence relancée sur `lot-5c` dans une copie `git worktree`) ; (c) appels, triangles, pixels de R1, R2, U1, U4 × Élevé, Moyen, Faible identiques (`budget-instant.mjs`) ; (d) six vues identiques (`vues.mjs`) ; (e) **SHA-256 de chaque tampon du pack par défaut** : `node scripts/nettoyage/empreintes-sons.mjs --out <hors dépôt>` puis `--compare` : 184 tampons, empreinte globale `62c628d3e17b8358833cd979f9f7bce4b6696aa3147d9bea91e9f9391ad30999` (liste en annexe D ; vérifiée identique sur un retrait simulé) ; (f) `sounds.json` : SHA-256 `4eb3ba26cd1108679d6f35e35f907a0ffbefa7f4b65e19b0661797706a7eec5e` ; (g) site assemblé servi sans ressource manquante.

## Points d'attention
- Les fichiers « voulus inchangés » par des garde-fous d'hygiène listent `js/core/pose.js` : il en sort (fichier supprimé) ; les autres entrées restent.
- `?perso=actuel&sang=0` chargeait le jeu d'avant le lot 3j sans module v2 : ce chemin « rien de chargé » disparaît (aucun préréglage ne l'utilise ; `graphics.json` : `A` ou `choix`).
- L'échec mobile d'`atelier-detail` U4 (210 appels contre 212 en bureau, constaté au lot 5c) reste à traiter à part ; les nouvelles références sont mesurées en bureau comme les anciennes.
- `characters-v2.json` (`slot.current`) et `projection.mjs` décrivent encore l'ancien modèle **en données** (estimation du décor des projections) : gardés, ils n'exigent aucun code retiré.
- `Docs/ref/personnages-actuels.md` et `sons-actuels.md` : gardés comme états des lieux historiques (une note « lot 5e : retiré du jeu »), sauf décision contraire.
