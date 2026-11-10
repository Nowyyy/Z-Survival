# Menu principal (lot 8a, V0.8)

État : **livré** (lot 8a, parties A à D, base `origin/dev` `80372e2`). Relevé et décisions écrits en partie A, avant tout changement du jeu ; le reste décrit le code livré. Les noms de branches, de fichiers et de commits sont des données.

## Relevé (code de `origin/dev`)
1. `jeu.html` : `boot.js` (textes, « Chargement 0 % », message de rotation, avant l'évaluation de Three.js) puis `main.js` (graphe complet : Three.js, `game.js`, 113 fichiers JavaScript avec `?test=1&lum=off`, 116 par défaut en bureau où Auto = Élevé charge les lampes).
2. `main.js` : `graphicsBoot()`, données JSON (`Promise.all`, 25 fichiers), textures par tranches de 8 ms (80 % de l'écran de préparation `#loading`), sons « essentiel » par tranches (20 %), couche VHS, police du titre, couches de collisions, dépôt de sauvegarde, `createUi`, `createInput`, `createGame`.
3. `createGame` (`game.js`) : monde, `renderer.compile`, premier rendu, `finish()`, puis `start()` (boucle `requestAnimationFrame`) ; ensuite `loading.done()` et `#game-root` visible. La partie commence à la première image : attente de manche (« DÉBUT 3 s ») puis manche 1. Les sons « fond » sont calculés pendant la partie (4 ms par image).
4. Progression mesurable : modules (entrées `performance` des fichiers `.js` reçus), données (une étape), textures et sons (`onProgress` réels, déjà utilisés par `#loading`), compilation (`createGame` rendu). Aucune autre attente.
5. Arrêt sans rechargement : **impossible proprement aujourd'hui**. `game.js` et `ui.js` posent des écouteurs sur `document` et `window` (visibilité, redimensionnement, `pagehide`, plein écran) sans les retirer, `input.js` aussi (clavier, flou), `main.js` des `setInterval` et des écouteurs de geste ; aucun `dispose()` du rendu WebGL, du contexte audio, des textures ni des personnages.
6. Argent à la mort : `game.js` → `bank.runEnd({ kills, reason: 'death' })` (`js/game/bank.js`) → `flush` → `repository.commit` (écriture immédiate) ; fin du monde : `bank.worldEnd()` puis `runEnd({ reason: 'world' })` ; « Recommencer » : `runEnd({ reason: 'restart' })` si la partie n'est ni morte ni finie ; `pagehide` et la page cachée : `bank.flush`.
7. « Quitter » : `<button id="btn-quit" … disabled>` (pause E2-6), sans écouteur. « Revenir au menu principal » (`#btn-menu`, fin E2-7) : sans écouteur (tests : `interface-integree.spec`, `interface-integree.test`, `-retours.test`).
8. Options (E2-12) : `ui.openOptions()` importe `options-menu.js` au premier clic, seulement depuis la pause ouverte ; `createOptionsMenu({ dict, graphics, vhs, onClose })` n'a besoin que du contrôleur graphique et de la couche VHS (créés dans `main.js` avant `createGame`) : il peut s'ouvrir hors partie.
9. Échap et P : `input.js` → `onCommand('pause')` → `ui.togglePause()`, quel que soit l'écran ; onglet caché : `ui.openPause()`.
10. Solde : `createRepository(...).repository.load()` (lecture seule, `save.money`), déjà fait dans `main.js` avant `createGame`.
11. Tests qui chargent `jeu.html` sans `?test=1` ni paramètre de « Partie » et attendent la partie (ils verront le menu) : `argent.spec:555` (`?seed=1`), `canal.spec` archive et prod (paramètres refusés : adresse vide), `debug-menu.spec:194` (`?v=4`, site assemblé, canal dev) ; sans attente de la partie : `persos-jeu.spec:60` (`?perso=B&sang=1`, seulement l'absence de crochets), `publication.spec` (liens), Lighthouse (`jeu.html` seul).
12. Tous les autres tests et scripts de mesure (`scripts/perf/*.mjs`) ouvrent `?test=1` ou un paramètre de « Partie » (`nospawn`, `map=salle`, `wave`…) : partie directe, inchangés.
13. Version affichable : `build-info.json` (déjà servi ; `channel`, `version`, `sha` écrits par l'assembleur ; dans le dépôt : `channel: "source"` seul).
14. Portrait : `#rotate` (z-index 20) couvre la page, `.game-root` et `.panel-wrap` deviennent invisibles ; `#loading` est au-dessus (50).
15. Couches : `.panel-wrap` (pause, fin, Options) z-index 10 ; `#boot` 15 ; `#rotate` 20 ; `#loading` 50.
16. Polices : `fonts/` (Barlow 400 et 700, Rubik Wet Paint, Rubik Dirt), `@font-face` dans `base.css` ; aucune nouvelle.

## Décisions de structure
- **(a) Le menu vit dans `jeu.html`**, avant la partie : même adresse d'entrée (raccourcis d'écran d'accueil inchangés), un seul chargement du jeu.
- **(b) Au démarrage, seul le menu se charge ; le jeu se charge à « JOUER », sans recharger la page** (retour du propriétaire après la première livraison). `jeu.html` n'a plus de balise `main.js` ni de préchargement de Three.js : `js/menu/demarrage.js` importe `js/game/main.js` tout de suite en partie directe (même chemin qu'avant), ou au clic sur « JOUER » en mode menu ; l'écran de chargement revient alors (phase « jeu », Z déjà posé, « Chargement de la partie… ») avec la progression réelle du jeu (modules dont Three.js, données, textures, sons, création du jeu avec compilation et premier rendu), puis la partie apparaît (« DÉBUT 3 s », manche 1). Historique : plan A (tout le jeu chargé sous E7, boucle retenue) → Lighthouse 34 ; création à « JOUER » seulement → 55 ; menu seul au démarrage → **78**. Pendant le menu, aucune partie n'existe (ni `window.__zs`, ni pause).
- **(c) Retour au menu par un rechargement de `jeu.html`.** La partie ne peut pas être libérée proprement (relevé 5) ; un arrêt partiel laisserait des écouteurs, un contexte WebGL et un contexte audio vivants (fuites, doubles sons). Avant de recharger, l'argent suit le chemin de la mort : `game.quit()` appelle `bank.runEnd({ kills, reason: 'quit' })` (même fonction, même écriture immédiate) ; à la fin de partie, `runEnd` a déjà été appelé. L'adresse du retour retire les paramètres de « Partie » (le menu s'ouvrirait sinon sur une partie directe) et garde les autres ; sous `?test=1`, elle ajoute `menu=1`. Coût : le chargement (E7) est rejoué au retour ; dit dans le bilan.

## Écrans et navigation
```
jeu.html ──(menu)──► E7 chargement ──100 % et chute finie──► E8 menu
          └(partie directe : ?test=1 sans menu=1, ou un paramètre de Partie)──► #loading puis partie (comme avant)
E8 : en-tête (Connexion → E8-8 « Connexion : bientôt » ; solde ; ≡ → Options E2-12 · Information E8-7 · Discord · Déconnexion grisée)
     onglets Boutique · Personnage · JOUER · Infini · Event (verrouillé) ; Jouer : « JOUER » → partie (sans rechargement)
partie : pause « Quitter » → confirmation → rechargement → E7 → E8 ; fin « Revenir au menu principal » → rechargement → E7 → E8
```

## Règle de démarrage (`choixDemarrage`, `js/core/graphics.js`, pur)
- Entrée : canal et adresse (`acces()` : seuls les paramètres pris en compte comptent). `?test=1` pris en compte : partie directe, sauf `menu=1` (menu). Sinon, un paramètre de « Partie » (`PARAMS_PARTIE` : `wave`, `lvl`, `money`, `planks`, `floor`, `map`, `nospawn`, `endless`, `fin`, `empty`) pris en compte et non vide : partie directe. Sinon : menu (donc `?seed=1`, `?perso=B`, `?gfx=faible`, `?v=4` ouvrent le menu).
- Placée dans `graphics.js` (déjà chargé, à côté d'`acces`) plutôt que dans `menu-etat.js` : la partie directe ne charge qu'un fichier de plus (`demarrage.js`).
- `menu` rejoint `PARAMS_TEST` : pris en compte sur les canaux de débogage, sans effet ailleurs (et sans `test=1`). `readOnlyParams` inchangé. Archive, prod, canal absent : tous les paramètres de Partie sont refusés, le menu s'ouvre.
- Partie directe : exactement le chemin d'avant (écran de préparation `#loading`, boucle démarrée par `createGame`) ; `main.js` et Three.js sont importés par `demarrage.js` au lieu de balises (114 fichiers JavaScript avec `?test=1&lum=off`, avant 113).

## Modules et chargement à la demande
| Fichier | Chargé | Rôle |
|---|---|---|
| `js/menu/demarrage.js` (zone « jeu » des tests) | toujours (balise de `jeu.html`, avant `boot.js`) | `modeMenu` ; partie directe : précharge Three.js et importe `main.js` ; menu : `css/menu.css`, écran de chargement phase « menu », puis à « JOUER » phase « jeu », `graphicsReboot()` et `main.js` ; `menuProgres(etape, f)` (appelé par `main.js`), `menuRetour()` ; sous `?test=1` : `window.__zsMenu.etat()` |
| `js/core/menu-etat.js` | mode menu | pur : phases et poids (`PHASES`), `avancer`, `pourcentage`, `choisirAstuce`, `texteVersion`, `ONGLETS`, `creerEtatMenu` et ses transitions, `nouveauteNonLue`, `lienExterne`, `adresseRetour` |
| `js/menu/chargement.js` | mode menu, au démarrage | E7 en deux phases (menu : chute du Z, modules du menu, données, polices ; jeu : Z posé, progression de `main.js`) ; `decorNuit` partagé avec l'onglet Jouer |
| `js/menu/menu.js` | mode menu, au démarrage | `preparerMenu()` (textes, nouveautés, liens, solde par `createRepository().load()`, sans écriture) ; E8 : en-tête, trois barres, onglets, onglet Jouer ; `bandeau()`, `el()`, `icone()` |
| `js/menu/ecrans.js` | à la demande | Information, Connexion, onglets « Bientôt » |
| `js/game/options-menu.js`, `graphics-apply.js` | à la demande (Options du menu) | écran Options existant avec un contrôleur créé sur `graphicsBoot()` (sur un ordinateur, Auto = Élevé précharge alors les lampes, donc Three.js) ; `graphicsReboot()` fait relire `zs.device.v1` au jeu |

- Au démarrage en mode menu : 27 fichiers JavaScript (dont ceux de `graphics-boot.js` et de `js/save/`), aucun de `js/game/` hors `texts.js`, `boot.js`, `graphics-boot.js`, ni Three.js ni données du jeu ; après « JOUER » : 120 au total. Partie directe : 114 (113 avant le lot, + `demarrage.js`).
- Progression réelle, phase « menu » : modules (écran de chargement présent, puis module du menu), données (6 fichiers reçus, solde lu), polices (au plus 3 s). Phase « jeu » : modules (fichiers `.js` reçus depuis « JOUER », sur `MODULES_ATTENDUS` = 114, terminée au début de `main.js`), données, textures et sons (`onProgress` de `main.js`), création (après `createGame`). 100 % seulement quand la phase est finie ; le menu s'ouvre à 100 % et quand la chute du Z est finie (au plus 4 s, filet si l'onglet est caché).
- Version : `build-info.json` lu seulement sur source, dev et release (là où il est écrit) ; « Arbre source », « Développement · <hash> », « Version V0.N ».
- `main.js` : `menuProgres` aux cinq étapes, `onQuit` et `onMenu` ; `game.js` : `quit()` seulement (`bank.runEnd({ reason: 'quit' })`) ; `ui.js` : confirmation de « Quitter » construite au premier appui, écouteur de « Revenir au menu principal » ; `graphics-boot.js` : `graphicsReboot()`.

## Jetons et composants communs (`css/tokens.css`, bloc « Menu principal » ; `css/menu.css`)
- Jetons `--menu-*` (fond de nuit, ciel, lune, brume, bois, clou, ruban jaune et noir, bandeau rouge, coulures) et `--rarete-*` (commun gris, peu commun vert, rare bleu, épique violet, légendaire doré) ; le JavaScript n'écrit aucune couleur.
- **Bandeau de titre** (`.menu-bandeau` : petit libellé Rubik Dirt, titre Rubik Wet Paint ~20 px, zone rouge pleine, coulures sous la zone, jamais sous le texte) ; **bouton peint** (`.menu-peint`) ; **bouton planche** (`.menu-planche`) ; **ruban** (`.menu-ruban`, verrouillé) ; **grain et lignes** (`.menu-grain`, une seule couche fixe, sans `filter` ni `mix-blend-mode`).
- Animations : noms préfixés par l'écran (`e7-…`, `e8-…`) ; coupées sous `prefers-reduced-motion`.

## Ajouter l'écran d'un onglet (lots 8b à 8g)
1. Écrire une fonction qui rend `<section class="e8-ecran" id="menu-ecran-<onglet>" aria-labelledby="menu-titre-<onglet>">` commençant par `bandeau(libellé, titre, 'menu-titre-<onglet>')` (`js/menu/menu.js`) : le bandeau est alors au même endroit que sur les autres écrans. Mettre la fonction dans `js/menu/ecrans.js` ou dans un module `js/menu/<onglet>.js` importé à la demande.
2. Dans `changerOnglet()` (`js/menu/menu.js`), appeler cette fonction à la place de `ecranBientot` pour cet onglet (créée au premier affichage, gardée ensuite).
3. Composants : `.menu-peint` (action principale), `.menu-planche` (secondaire), `.menu-ruban` (verrouillé), `.menu-bandeau` ; couleurs `--menu-*` et `--rarete-*` de `tokens.css` ; tailles en `calc(N * var(--u))` (N = pixels de la référence 932 × 430), `max(44px, …)` pour les cibles ; animations nommées `e8-<écran>-…` et coupées sous `prefers-reduced-motion`.
4. Textes `game.menu.<onglet>.*` dans `fr.json`, chacun écrit en entier dans le code ; données dans `data/menu/`.
5. **Jusqu'au lot 8h : aucun état écrit dans le stockage** : tout état nouveau (onglet, choix, objets) reste dans `etatMenu` (`js/core/menu-etat.js`) ou dans le module de l'écran.
6. Tests : `tests/e2e/menu.spec.js` (`?test=1&menu=1`, 932 × 430, 667 × 375, 1440 × 900 : emplacements, aucune superposition, 44 px, axe) et Vitest pour la logique pure.

## État en mémoire jusqu'au lot 8h
Onglet actif, menu à trois barres ouvert, écran ouvert, nouveautés lues : `etatMenu` (mémoire). Le solde est lu une fois par `repository.load()` (lecture seule). Aucune clé ni aucun champ nouveau dans `zs.save.v1` ni `zs.device.v1` (vérifié par `menu.spec.js` : clés et contenu identiques avant et après une visite du menu, aucun `setItem`). Le retour au menu recharge la page : l'état « lu » des nouveautés est alors perdu (point jaune de nouveau visible) jusqu'au lot 8h.

## Risques
- Lighthouse mesure désormais le seul menu (78) : rien du jeu ne doit revenir au démarrage du mode menu (`menu.spec.js` le vérifie).
- Options du menu : sur un ordinateur, la première ouverture charge le module des lampes (Three.js) par `graphicsBoot()` ; rien de plus n'est écrit que la préférence existante `zs.device.v1`.
- Retour au menu : chargement rejoué (quelques secondes sur téléphone).
- Mode menu : un geste sur le menu débloque l'audio (prévu : aucun son avant le premier geste) ; aucun son n'est joué dans le menu.
- Tests sans `?test=1` qui attendaient la partie (relevé 11) : une étape « JOUER » ajoutée, paramètres inchangés.
