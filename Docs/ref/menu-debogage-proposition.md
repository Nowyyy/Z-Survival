# Paramètres d'adresse et menu de débogage — proposition (note pour la conversation de cadrage)

État : **proposition**, rien n'est codé. Écrite à la demande du propriétaire (8 novembre 2026, fin du lot 5k) pour formuler un lot propre (provisoirement « 5l »). Les chiffres d'emploi viennent d'une recherche dans le dépôt (`dev` `26c2d44`).

## Demande du propriétaire
1. Retirer de l'adresse tout ce qui est déjà réglable dans le menu **Options** (plus besoin : c'est dans les options).
2. Regrouper les options de débogage (manche, argent, mesure…) dans un **menu de débogage** : une petite icône à côté de l'icône du son, dans la pause, qui ouvre un panneau.
3. Ce menu est disponible sur **`dev`** et sur **Recette**, mais **pas en production**, quand le jeu aura son propre serveur.
4. Décisions prises : **pas** de section « graphismes absents d'Options », **pas** de section « sons », **pas** de section « caméra ». Seules restent **Partie** et **Mesure**.

## Inventaire des paramètres d'aujourd'hui (lus par `jeu.html`, jamais mémorisés)
| Paramètre | Effet | Dans Options ? | Emplois dans les tests (fichiers / emplois) | Scripts | Pages techniques | Proposition |
|---|---|---|---|---|---|---|
| `gfx` | préréglage, verrouille Options | oui | 5 / 29 | 5 | — | test seulement |
| `lum` | lumière des lampes (`off` : déjà test seulement) | oui | 4 / 26 | — | — | test seulement |
| `shadows` | ombres | oui | 20 / 31 | 5 | — | test seulement |
| `vhs` | effet VHS | oui | 22 / 45 | 7 | — | test seulement |
| `dpr` | finesse de l'image (valeurs libres) | oui (3 valeurs) | 8 / 14 | 1 | — | test seulement |
| `detail` | textures simples, sans décor léger | oui (Carte, Textures) | 10 / 31 | 5 | — | test seulement |
| `perso` | variante des personnages (`B`, `C` hors Options) | en partie | 17 / 180 | 4 | — | test seulement |
| `sang` | niveau de sang (`0` hors Options) | en partie | 15 / 143 | 4 | 1 | test seulement |
| `usure` | usure des tenues | non | 6 / 26 | — | — | test seulement (pas dans le menu, décision) |
| `percee` | `0` : sans mur percé | non | 1 / 1 | — | — | test seulement (idem) |
| `zoom`, `tilt`, `labels` | caméra, étiquettes | non | 9 / 26 · 4 / 7 · 7 / 22 | 2 · 1 · — | 1 · — · 2 | à trancher (voir « Questions ») |
| `sons` | variante des sons de l'atelier | non | 8 / 44 | 5 | — | à trancher (pas dans le menu, décision) |
| `perf` | panneau de mesure | non | 6 / 18 | 3 | — | **menu (Mesure)** |
| `cap` | plafond de cadence (30, 45, 60) | non | 4 / 11 | 1 | — | **menu (Mesure)** |
| `fps` | compteur et temps de chargement | non | 9 / 29 | 1 | — | voir « fps et perf » |
| `wave` | manche de départ (1 à 200) | non | 29 / 237 | 9 | 2 | **menu (Partie)** |
| `lvl` | niveaux des statistiques (`degats:3,…`, `all:5`) | non | 11 / 63 | — | — | **menu (Partie)** |
| `money` | argent de départ | non | 5 / 35 | — | — | **menu (Partie)** |
| `planks` | planches posées au départ | non | 5 / 7 | 2 | — | **menu (Partie)** |
| `floor` | étage de départ | non | 15 / 56 | 7 | 2 | **menu (Partie)** |
| `map` | `salle` : ancienne salle | non | 17 / 48 | 3 | 2 | **menu (Partie)** |
| `nospawn` | aucun zombie | non | 39 / 217 | 9 | 3 | **menu (Partie)** |
| `endless` | manches sans fin | non | 2 / 2 | — | — | **menu (Partie)** |
| `fin` | `monde` : fin du monde d'office | non | 4 / 7 | — | — | **menu (Partie)** |
| `empty` | zombies libres (déjà sous `?test=1`) | non | 19 / 51 | 2 | — | test seulement (inchangé) |
| `test`, `store`, `seed`, `lampgain` | tests automatiques | non | — | — | — | inchangés (test seulement) |

`?v=` suivi d'un nombre n'est lu par aucun code : il ne sert qu'à contourner le cache du navigateur, il reste possible.

## Pourquoi ne pas supprimer purement
- Des centaines d'emplois dans les tests (exemples : `nospawn` 217, `wave` 237, `perso` 180, `sang` 143) et les scripts de mesure (`scripts/perf/` : budgets, vues, fluidité, trace logique) qui ont servi aux preuves des lots 5b à 5k.
- Les pages techniques (`carte.html`, page de visite) ouvrent le jeu avec `?zoom=1&labels=1&wave=…&floor=1`.
- **Proposition** : les paramètres « graphismes » (doublons d'Options) ne fonctionnent plus que sous `?test=1`. Les tests et les scripts restent valables ; un joueur ne peut plus rien imposer par l'adresse ; le menu Options n'affiche plus « imposé par l'adresse » hors des tests.

## fps et perf
- `?perf=1` fait tout ce que fait `?fps=1` pour la fluidité, en plus détaillé : cadence, médiane, p95, p99, images longues, temps par étape, accrocs au premier usage, tâches longues, rapport copiable.
- `?fps=1` n'apporte en plus que des **temps de chargement** : textures, calcul du champ de flux (moyenne, max), maillages des fenêtres, construction de l'étage, sons essentiels et de fond, voix des zombies, ligne de statistiques.
- **Proposition** : ajouter ces lignes de chargement au rapport de `perf`, puis retirer `fps` (`js/fps.js`, son import dans `js/game/main.js`, ses textes). Les 9 fichiers de tests qui l'utilisent passent à `perf` (`tests/budget-mesure.json` et `tests/e2e/jeu-rendu.spec.js`, `etage.spec.js`, `jeu-fenetres.spec.js`, `jeu-sons.spec.js`, `argent.spec.js`, `atelier-detail.spec.js`, `tests/unit/sauvegarde-schema.test.js`, `sauvegarde-depots.test.js`). Le menu ne garde alors que **perf** et **cap** dans « Mesure ».

## Menu de débogage (proposition)
- **Accès** : icône dans la pause, à côté de l'icône du son (même forme, 44 × 44 px, nom accessible « Débogage »), qui ouvre un panneau à la manière de l'écran Options (bloc `E2-12`). Chargé par import dynamique au premier clic, comme `options-menu.js` : aucun fichier de plus au démarrage.
- **Partie** : manche de départ, argent, niveaux des statistiques (champ libre ou sept curseurs, à trancher), planches, étage, carte (bâtiment / ancienne salle), sans zombies, manches sans fin, fin du monde.
- **Mesure** : panneau de mesure (perf) ; plafond de cadence (aucun, 30, 45, 60).
- **Application** : ces réglages agissent au chargement. Le panneau construit l'adresse (`jeu.html?wave=…&perf=1…`) et propose « Appliquer et recharger », avec confirmation (« Cette partie sera perdue »), comme la barre « Recharger maintenant » d'Options. Un bouton « Revenir au jeu normal » recharge sans paramètre.
- **Sauvegarde** : inchangée. Tous les paramètres de « Partie » sont déjà dans `readOnlyParams` (`data/game/save.json`), donc la sauvegarde passe en lecture seule (mode essai : aucune écriture), et le badge « MODE ESSAI » s'affiche. `perf` et `cap` n'y sont pas : ils ne touchent pas la sauvegarde.
- **Textes** : clés `game.debug.*` en français seulement (comme `game.options.*`, `data-i18n.test`).
- **Accessibilité** : cibles de 44 px, contraste 4,5:1, focus visible, Échap ferme, axe sans violation ; à 667 × 375, tout reste atteignable (défilement interne), comme l'écran Options.

## Disponible sur dev et Recette, pas en production
- Le site assemblé écrit déjà un `build-info.json` par version, avec un **canal** : `dev` (`/dev/`), `release` (`/Recette/`), `archive` (`/v0.N/`), `source` (dépôt local). Il n'existe pas encore de canal de production.
- **Proposition** : une liste de canaux dans les données (par exemple `data/game/debug.json` → `"canaux": ["dev", "release", "source"]`). L'icône et les paramètres de « Partie » et « Mesure » ne fonctionnent que si le canal du `build-info.json` de la page est dans la liste. Le futur canal de production (`prod`, ou le nom retenu) n'y sera pas : pas d'icône, et les paramètres tapés à la main n'ont aucun effet.
- **À noter** : le jeu ne lit pas `build-info.json` aujourd'hui. Le lire ajoute une requête au démarrage (les tests qui comptent les fichiers chargés devront être mis à jour). Une autre solution sans requête : un indicateur écrit par l'assembleur dans la page (`jeu.html`) au moment du build.
- **Archives** (`/v0.N/`) : le menu n'existera pas dans les versions déjà archivées ; pour les futures archives, à trancher (canal `archive` permis ou non).
- **Sous `?test=1`** : les paramètres restent toujours actifs (tests et scripts), quel que soit le canal.

## Questions à trancher
1. **Caméra** (`zoom`, `tilt`, `labels`) : hors du menu (décision). Les garder sous `?test=1` seulement ? Attention : `carte.html` et la page de visite ouvrent le jeu avec `?zoom=1&labels=1` pour la vue d'ensemble. Ces liens cesseraient de marcher hors tests, sauf exception pour ces pages ou retrait de ces liens (pages techniques à retirer au lot 13).
2. **Sons** (`sons=A|B|C`) : hors du menu (décision). Le garder sous `?test=1` seulement, ou le supprimer avec l'atelier des sons (lot 13) ?
3. **`fps`** : fusion dans `perf` puis retrait (recommandé), ou maintien sous `?test=1` ?
4. **Niveaux** (`lvl`) dans le menu : un champ libre (`degats:3,precision:5`) ou un curseur par statistique ?
5. **Canal de production** : son nom, et le choix entre la lecture de `build-info.json` (une requête de plus) et un indicateur écrit au build.
6. **Archives** : menu de débogage dans les futures archives (canal `archive`) ou non ?

## Fichiers probablement touchés (pour le prompt)
`js/game/main.js` (lecture des paramètres, `fps`), `js/core/graphics.js` (`explicitParams` : sous `?test=1` seulement), `js/game/persos-params.js` (`perso`, `sang`, `usure`), `js/game/ui.js` ou la pause (icône), nouveau `js/game/debug-menu.js` (import dynamique), `data/game/debug.json` (nouveau, canaux), `data/i18n/fr.json` (`game.debug.*`), `css/` (icône, panneau : jetons seulement), `js/game/perf-panel.js` et `js/core/perf-stats.js` (lignes de chargement si `fps` est retiré), `scripts/assemble.mjs` si l'indicateur est écrit au build, tests (`graphismes.spec.js` : « imposé par l'adresse » ; tests de la pause et de l'interface : nouvelle icône ; nouveaux tests du menu et du canal), `Docs/ref/options-graphiques.md`.

## Lien avec le lot 5k
Le propriétaire revient au lot 5k (réglage de la lumière, des ombres et de l'obscurité) une fois ce menu disponible, pour mesurer la lumière sur ses téléphones avec le panneau de mesure. En attendant, `…/dev/jeu.html?gfx=eleve&perf=1` donne le même panneau.
