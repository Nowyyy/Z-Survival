# Menu de débogage et paramètres d'adresse par canal (lot 5l)

État : **plan** (partie A, base `origin/dev` `45f5e14`). Ce document est complété aux parties B à D. Les noms de branches, de fichiers et de commits sont des données.

## Relevé (code de `origin/dev`, avant tout changement)
1. `js/game/main.js` lit l'adresse une fois (`query`, l. 55) : `test` (56), `fps` (57), `perf` (59), `seed` (60, sans condition), `empty` (64, avec `test`), `detail` (74), `percee` (128), `vhs` (137, `parseVhsParam`), `nospawn`, `wave`, `endless`, `planks`, `tilt`, `zoom`, `labels`, `floor`, `dpr` (177 à 187), `cap` (209), `fin` (297).
2. Autres lecteurs : `map` (`js/core/maps.js:21`), `lvl` (`js/game/levels-source.js:7`), `money` et `readOnlyParams` (`js/core/save.js:283` et `:298`), `store` (`js/save/index.js:14`, `js/save/device-settings.js:67`), `gfx` (`js/game/graphics-boot.js:17`), `perso`, `sang`, `usure`, `detail`, `vhs`, `shadows`, `dpr`, `lum` (`explicitParams`, `js/core/graphics.js:275`), `perso`, `sang`, `usure` (`js/game/persos-params.js:25-28`), `sons` (`js/game/sound-loader.js:15` → `js/core/sound-choice.js`), `lampgain` (`js/game/lights.js:14`, sous `test=1`).
3. `test=1` : `window.__zs` (`installTestHook`, `main.js:290`), dépôt de sauvegarde en mémoire (`memoryByDefaultWith`, sauf `store=local`), préférence graphique en mémoire (`device-settings.js`), audio de test, `empty=1` accepté, rechargement des Options simulé, `lum=off` et `lampgain` acceptés.
4. `seed` est lu même sans `test=1` (graine des parties) ; `empty` exige `test=1`.
5. Mode essai : `readOnlyMode(search, save.json)` met la sauvegarde en lecture seule dès qu'un paramètre de `readOnlyParams` (`wave`, `lvl`, `planks`, `map`, `empty`, `nospawn`, `endless`, `floor`, `money`) a une valeur non vide ; `money` fixe le solde de session ; badge « MODE ESSAI » (`#hud-trial`).
6. Options : `graphicsBoot` calcule `explicitParams(search)` ; `effectiveOptions` marque l'origine `adresse` ; l'écran (`options-menu.js`) grise ces options avec « imposé par l'adresse » ; `?gfx=` verrouille tout l'écran.
7. Ordre d'évaluation : `game.js` appelle `graphicsBoot()` à son chargement (avant le corps de `main.js`), avec `location.search` par défaut ; la promesse est partagée (le premier appel décide).
8. `audio.js` et `sound-loader.js` lisent `location.search` par défaut (`soundMode()`) ; `lights.js` aussi (`testGain`) ; `game.js:49` retombe sur `location.search` si `graphicsBoot` échoue.
9. Assembleur (`scripts/assemble.mjs`) : copie le build de `main` dans `Recette/` (`build-info.json` canal `release`), celui de `dev` dans `dev/` (canal `dev`), les dossiers `v0.N/` de la branche `archive` tels quels ; le dépôt garde `build-info.json` canal `source`. Le jeu ne lit pas `build-info.json`.
10. Pause : `#pause-panel` (E2-6, `jeu.html`) ; tête : titre, solde, `#btn-fullscreen` puis `#btn-sound` (icônes de 44 px, `ui.js`) ; « Options » ouvre E2-12 (`options-menu.js`, import dynamique au premier clic).
11. Blocs pris : E2-1 à E2-12 (E2-9 et E2-11 jamais réutilisés) ; **E2-13 est libre**.
12. Tests qui chargent `jeu.html` sans `?test=1` (ils dépendent du canal `source` du dépôt) : `fumee.spec:106`, `sauvegarde.spec:317`, `persos-jeu.spec:60` (`?perso=B&sang=1`), `jeu-rendu.spec:71` (`?nospawn=1`), `jeu-planches.spec:160` (`?seed=1&nospawn=1`), `jeu-monde.spec:106` et `:113`, `jeu.spec:169`, `jeu-textures.spec:89`, `jeu-stats.spec:120`, et `publication.spec` (site assemblé : `Recette/`, `dev/`).
13. Scripts de mesure (`scripts/perf/*.mjs`) : tous en `?test=1` sur le dépôt servi (canal `source`).
14. Pages techniques : `carte.html` et `js/carte/main.js:36` (`?labels=1&zoom=1`, `?wave=31&floor=1`, `?map=salle`), `visite.html` (`?nospawn=1&wave=31`, `&zoom=1`, `&floor=1`).

## Canaux
| Canal | Où | Écrit par | Débogage |
|---|---|---|---|
| `source` | dépôt (tests, mesures, build local) | `jeu.html` | oui (tout comme avant) |
| `dev` | `/dev/jeu.html` | assembleur | oui |
| `release` | `/Recette/jeu.html` | assembleur | oui |
| `archive` | `/v0.N/jeu.html` (si la balise existe) | assembleur | non |
| `prod` | futur serveur du jeu | futur assembleur de production (hors lot) | non |
| absent ou inconnu | anciennes versions, page modifiée | — | non |

Balise : `<meta name="zs-canal" content="source">` dans `jeu.html`, forme exacte (l'assembleur ne reconnaît qu'elle : `CANAL_META_RE`). Lecture par le jeu : `document.querySelector('meta[name="zs-canal"]')`, sans requête réseau. `CANAUX_DEBUG = ['source', 'dev', 'release']`.

## Groupes (vérifiés sur le code)
| Groupe | Paramètres | Pris en compte si |
|---|---|---|
| G (doublons d'Options, réglages graphiques sans menu) | `gfx`, `lum`, `lampgain`, `shadows`, `vhs`, `dpr`, `detail`, `perso`, `sang`, `usure`, `percee` | `test=1` pris en compte, ou canal `source` |
| T (outils techniques) | `wave`, `lvl`, `money`, `planks`, `floor`, `map`, `nospawn`, `endless`, `fin`, `perf`, `cap`, `fps`, `zoom`, `tilt`, `labels`, `sons` | canal dans `CANAUX_DEBUG` (avec ou sans `test=1`) |
| Test | `test`, `store`, `seed`, `empty` | canal dans `CANAUX_DEBUG` |
| Autres (`v`, tout nom inconnu) | lus par aucun code | inchangés |

`readOnlyParams` (`data/game/save.json`) : inchangé ; `gfx`, `perf`, `cap` n'y sont jamais. Un paramètre refusé est retiré de l'adresse **lue par le jeu** (l'adresse affichée ne change pas) : il n'a aucun effet et ne déclenche pas le mode essai.

## Règle de lecture (partie B)
- Module pur dans `js/core/graphics.js` (déjà chargé, aucun fichier de plus) : `CANAUX_DEBUG`, `lireCanal`, `acces(canal, params)` (pour chaque paramètre : pris en compte ou non), `filtrerAdresse(search, canal)` (adresse sans les paramètres refusés ; chaîne identique quand rien n'est retiré, donc sur `source`).
- `js/game/graphics-boot.js` lit la balise et donne `pageSearch()` (adresse filtrée, calculée une fois) ; `graphicsBoot()`, `main.js` (tous ses lecteurs, sauvegarde, niveaux, carte, sons, profileur) et `lights.js` (`lampgain`) lisent cette adresse.

## Risques
- **Canal absent** : la Recette publiée avant la fusion de ce lot dans `main` n'a pas de balise ; son code ne la lit pas (aucun effet). Après publication, une page sans balise est traitée comme la production (tout refusé).
- **Archives** : les `v0.N/` déjà publiées n'ont pas de balise ; l'assembleur les laisse identiques octet pour octet. Les archives futures (copies d'un build qui porte `source`) reçoivent `archive` : ni menu ni paramètres.
- **`?test=1` en production** : ignoré (ni `window.__zs`, ni stockage en mémoire, ni paramètre G ou T) ; un lien partagé avec `?test=1` vers la production ouvre une partie normale.
- **Scripts de mesure sur le site assemblé** : en `?test=1` sur `/dev/` ou `/Recette/`, ils fonctionnent ; sur une archive ou en production, non (aucun `window.__zs`).
- **Pages techniques** : leurs liens (`?zoom=1&labels=1&wave=…&floor=1&nospawn=1`, groupe T) marchent sur `source`, `dev` et `Recette` ; ils cesseront en production (pages à retirer au lot 13).
- **Forme de la balise** : une balise réécrite à la main sous une autre forme n'est pas reconnue par l'assembleur (le canal resterait `source`) : un test vérifie la forme exacte dans `jeu.html`.

## Chevauchement avec `lot-5k`
`lot-5k` est entièrement fusionné dans `dev` (`git merge-base --is-ancestor origin/lot-5k origin/dev` : oui ; `git diff origin/lot-5k origin/dev` : aucun fichier). Fichiers de `lot-5k` (depuis `8b3ba10`) que ce lot touche aussi : `js/core/graphics.js`, `js/game/graphics-boot.js`, `js/game/lights.js` (une ligne : `lampgain` lit l'adresse filtrée), `data/i18n/fr.json`, `css/game-ui.css`, `css/tokens.css` (si besoin), `data/changelog.json`, `noms-versions-et-lots.txt`, `tests/selection.json`, `scripts/tests/classement.json`, `tests/unit/publication.test.js`, `tests/e2e/graphismes.spec.js` ou `lampes.spec.js` (si un test est ajouté). À la reprise du lot 5k : fusionner `dev` dans `lot-5k` avant de modifier ces fichiers.

## Règle pour le lot 5k
`lum` et `lampgain` appartiennent au **groupe G** (ils existent sur la base : ils y sont dès ce lot). Toute nouvelle option graphique lue dans l'adresse rejoint le groupe G.

## Comment ajouter un paramètre
1. L'ajouter à `PARAMS_G`, `PARAMS_T` ou `PARAMS_TEST` (`js/core/graphics.js`) ; un paramètre absent des trois listes passe sans filtre (réservé aux noms lus par aucun code).
2. Le lire dans l'adresse filtrée (`pageSearch()` ou le `search` de `main.js`), jamais dans `location.search`.
3. Tests : la table canal × paramètre de `tests/unit/debug-canal.test.js` couvre automatiquement les listes ; ajouter le cas au test Playwright si l'effet est visible.
4. Ligne du panneau : voir la partie C (`js/game/debug-menu.js`).
