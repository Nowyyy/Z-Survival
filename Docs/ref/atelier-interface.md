# Atelier de l'interface (lot 3k)

Page technique `atelier-interface.html` (`…/lots/lot-3k/atelier-interface.html`). Depuis les choix du propriétaire, `interface-retenue.html` (aperçu de la branche) ne montre que l'interface retenue (`ui-atelier.json`, `retenue` : HUD, pause, fins, à terre en B ; sticks en A), écran par écran ou les six d'un coup. Elle montre l'interface actuelle du jeu et trois directions de refonte, mesure chaque vue et produit un texte « Mes choix » à copier. Elle n'intègre rien dans le jeu, n'enregistre rien et ne fait aucune requête hors de l'origine.

## Méthode
1. **Actuel** : `jeu.html?test=1&seed=1` dans un `<iframe>` de même origine, interface d'origine. L'état est obtenu par les hooks existants de `window.__zs` (`startWave`, `giveMoney`, `setChutes`, `setLevels`, `setWaveParams`, `downPlayer`, `skipWave`, `step`) et des événements de pointeur (sticks), boucle d'images figée comme dans les tests (`js/atelier-interface/actuel.js`). Ce qu'aucun hook ne règle est écrit dans l'état de la vue (vie approchée par des coups de zombie, tués à 0, sauvegarde en mémoire). Écrans absents du jeu : « état non disponible dans « Actuel » » ; le menu E1 « actuel » est la page d'attente `index.html`.
2. **A, B, C** : même cadre `jeu.html?test=1&nospawn=1&seed=1` en fond, son interface masquée de l'extérieur (feuille `#ui3k-hide` injectée dans le document du cadre : `display: none`), boucle figée après 0,4 s ; par-dessus, l'interface de la direction (`js/atelier-interface/render.js`, `screens.js`, feuilles `css/proto-*.css`) alimentée par `mockState` (`js/core/ui-mock.js`). Si le jeu ne peut pas s'afficher (WebGL absent, délai de 60 s), un sol généré en CSS le remplace et un message le dit ; `?fond=sol` le force (tests).
3. **Mesures** : `js/atelier-interface/measure-dom.js` relève boîtes, textes (taille, graisse, couleur, fonds des ancêtres, contour), débordements et animations ; `js/core/ui-measure.js` (pur) calcule part de l'écran, chevauchements, zone sûre, marges, zones des pouces, cibles, contraste sur le pire fond, clignotements, et rapporte chaque écart dans `outOfTarget` avec la mesure, la cible et la raison. Stabilité : `stability()` parcourt vie, argent, vague, chutes, restants, tués et chrono (`sweepValues`) et compare toutes les boîtes (0 px attendu).

## Règles mesurées (`data/game/ui-atelier.json`, `rules`)
Texte ≥ 14 px ; contraste ≥ 4,5:1 (grand texte : 24 px, ou 18,66 px gras, ≥ 3:1) sur le **pire** des 17 fonds (sols, murs, brume de `tokens.css`) après superposition des fonds semi-transparents des ancêtres ; un contour d'au moins 1 px sert de fond local (on retient le meilleur des deux rapports : règle de l'atelier, non normative) ; cibles ≥ 44 px ; chaque bloc à 16 px **plus** la zone de sécurité ; rien dans les zones des pouces (moitiés gauche et droite, à partir de 50 % de la hauteur) hors écrans modaux ; aucun chevauchement (un enfant dans son parent n'en est pas un) ; aucun débordement ; ≤ 3 clignotements par seconde (point REC ≤ 2) ; aucune animation sous `prefers-reduced-motion` ; CLS ≤ 0,1. Aucun `filter`, `mix-blend-mode` ni `backdrop-filter` dans les propositions (la page en utilise un pour le simulateur de daltonisme, sur le cadre d'aperçu seulement).

## Zones de sécurité simulées
Propositions : variables `--ui3k-safe-*` posées sur la scène (préréglage de taille ou choix « Zone de sécurité »). Actuel : le padding de la sonde `.safe-probe` du jeu est imposé par une feuille injectée puis un `resize` fait relire les valeurs par `js/game/safe-area.js` (le jeu publie lui-même `--safe-*`). Valeurs : 812×375 encoche 44 / 21, 844×390 îlot 47 / 21 (gabarits publics d'Apple, non vérifiés sur un téléphone).

## Formats
- **État** : `mockState(params, config)` → `{ hp, maxHp, hpRatio, chutes, money, moneyText, moneyCompact, wave, maxWave, reinforced, floor, multiFloor, remaining, kills, chrono, chronoText, save, trial, down {mode, seconds}, paused, end, earned, bestWave, record, nextZone, warnings }` ; `worstCase()`, `states()`.
- **Mes choix** : une ligne par écran `ecran=hud;direction=B;argent=haut-droite;texte=M;densite=compacte;fond=leger;contour=fin` (« actuel » sans macros), puis `priorite2=retour-degats:B`. Lecture : `parseChoices` (`js/atelier-interface/choices.js`), tolérante (avertissements, jamais d'exception).
- **Tests** : `?test=1` expose `window.__zsUi` (`ready`, `getState`, `set`, `setParam`, `measure`, `stability`, `compare`, `keepChoice`, `keepP2`, `choicesText`, `parseChoices`, `config`) ; rien sans `?test=1`.

## Ajouter une direction ou un état
- **Direction D** : ajouter `D` à `directions` et `macroDefaults` de `ui-atelier.json`, une feuille `css/proto-d.css` (sélecteurs `.ui3k-dir-d`, jetons seulement), la liée dans `atelier-interface.html`, les répartitions de colonnes dans `renderHud` (`render.js`), les textes `atelier.direction.D` et `atelier.direction.desc.D` ; lancer `tests/unit/interface-atelier-protos.test.js` et les deux fichiers e2e.
- **État** : ajouter `{ id, params }` à `states` (champs de `defaults` seulement) et `atelier.state.<id>` aux textes.

## Lire « Mes choix » et intégrer (lot 4b)
1. Coller le texte reçu dans `node scripts/interface/projection.mjs '<texte>'` : éléments, règles CSS, tests à adapter par écran.
2. Suivre `Docs/ref/integration-interface.md` (DOM, CSS, `hud.js`, `ui.js`, clés de `fr.json`, jetons) écran par écran.
3. Adapter les tests listés, reprendre les contrôles des fichiers `interface-atelier*.spec.js` sur `jeu.html`, mesurer Lighthouse (`LH_ONLY=jeu npm run lighthouse`).
4. Retirer les garde-fous de branche (`Docs/ref/fusion-3k.md`) ; `atelier-interface.html` peut rester comme page technique jusqu'au lot 13.

## Commandes
`node scripts/interface/mesures.mjs [--json] [--sizes=…] [--screens=…]` (interface actuelle, 7 tailles) · `node scripts/interface/projection.mjs '<Mes choix>' [--json]` · `E2E_FULL=1 npx playwright test tests/e2e/interface-atelier.spec.js tests/e2e/interface-atelier-ecrans.spec.js` (hors de la suite rapide jusqu'au lot 4b, la liste de `playwright.config.js` n'étant pas modifiable au lot 3k).
