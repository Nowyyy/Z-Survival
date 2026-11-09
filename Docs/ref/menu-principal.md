# Menu principal (lot 8a, V0.8)

État : **plan** (partie A, base `origin/dev` `80372e2`), écrit avant tout changement du jeu ; complété en partie D. Les noms de branches, de fichiers et de commits sont des données.

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
- **(b) « JOUER » lance la partie sans recharger la page.** En mode menu, `main.js` fait exactement le même chargement (données, textures, sons, couches, dépôt, interface, `createGame` avec compilation et premier rendu) derrière l'écran E7 ; seule différence : `createGame` reçoit `ctx.hold`, la boucle d'images n'est pas démarrée (ni à la création, ni au retour de l'onglet) tant que « JOUER » n'a pas appelé `game.begin()`. La simulation n'avance qu'avec la boucle (`step`), donc la partie démarre au premier geste exactement comme aujourd'hui à la première image (« DÉBUT 3 s », manche 1). Pendant le menu, Échap, P, F, M et l'ouverture de la pause (onglet caché) sont sans effet sur la partie (`ui.setMenu`).
- **(c) Retour au menu par un rechargement de `jeu.html`.** La partie ne peut pas être libérée proprement (relevé 5) ; un arrêt partiel laisserait des écouteurs, un contexte WebGL et un contexte audio vivants (fuites, doubles sons). Avant de recharger, l'argent suit le chemin de la mort : `game.quit()` appelle `bank.runEnd({ kills, reason: 'quit' })` (même fonction, même écriture immédiate) ; à la fin de partie, `runEnd` a déjà été appelé. L'adresse du retour retire les paramètres de « Partie » (le menu s'ouvrirait sinon sur une partie directe) et garde les autres ; sous `?test=1`, elle ajoute `menu=1`. Coût : le chargement (E7) est rejoué au retour ; dit dans le bilan.

## Écrans et navigation
```
jeu.html ──(menu)──► E7 chargement ──100 % et chute finie──► E8 menu
          └(partie directe : ?test=1 sans menu=1, ou un paramètre de Partie)──► #loading puis partie (comme avant)
E8 : en-tête (Connexion → E8-8 « Connexion : bientôt » ; solde ; ≡ → Options E2-12 · Information E8-7 · Discord · Déconnexion grisée)
     onglets Boutique · Personnage · JOUER · Infini · Event (verrouillé) ; Jouer : « JOUER » → partie (sans rechargement)
partie : pause « Quitter » → confirmation → rechargement → E7 → E8 ; fin « Revenir au menu principal » → rechargement → E7 → E8
```

## Règle de démarrage (`js/core/menu-etat.js`, pur)
- Entrée : canal et adresse filtrée (`pageSearch()`, donc `acces()`). `?test=1` pris en compte : partie directe, sauf `menu=1` (menu). Sinon, un paramètre de « Partie » (`wave`, `lvl`, `money`, `planks`, `floor`, `map`, `nospawn`, `endless`, `fin`, `empty`) avec une valeur non vide : partie directe. Sinon : menu.
- `menu` rejoint `PARAMS_TEST` (`js/core/graphics.js`) : pris en compte sur les canaux de débogage, sans effet ailleurs (et sans `test=1`). `readOnlyParams` inchangé.

## Modules et chargement à la demande
- `js/menu/demarrage.js` (balise de `jeu.html`, avant `boot.js` ; le seul fichier ajouté en partie directe) : choix du démarrage ; en mode menu, feuille `css/menu.css`, import de l'écran de chargement, relais de la progression (`main.js` appelle `progres(etape, fraction)`, sans effet en partie directe).
- `js/menu/chargement.js` (E7, mode menu), `js/menu/menu.js` (E8 : en-tête, onglets, onglet Jouer ; importé pendant le chargement), `js/core/menu-etat.js` (pur : démarrage, progression, astuce, onglets, nouveautés, adresse du retour).
- À la demande : `js/menu/ecrans.js` (Information, Connexion, onglets « Bientôt »), `js/game/options-menu.js` (Options, déjà existant).
- Données : `data/menu/astuces.json`, `data/menu/infos.json`, `data/menu/liens.json` ; textes `game.menu.*` (français seul, comme `game.options.*`).

## Jetons et composants communs (`css/tokens.css`, bloc « Menu principal » ; `css/menu.css`)
- Jetons `--menu-*` (fond de nuit, ciel, lune, brume, bois, clou, ruban jaune et noir, bandeau rouge, coulures) et `--rarete-*` (commun gris, peu commun vert, rare bleu, épique violet, légendaire doré) ; le JavaScript n'écrit aucune couleur.
- **Bandeau de titre** (`.menu-bandeau` : petit libellé Rubik Dirt, titre Rubik Wet Paint ~20 px, zone rouge pleine, coulures sous la zone, jamais sous le texte) ; **bouton peint** (`.menu-peint`) ; **bouton planche** (`.menu-planche`) ; **ruban** (`.menu-ruban`, verrouillé) ; **grain et lignes** (`.menu-grain`, une seule couche fixe, sans `filter` ni `mix-blend-mode`).
- Animations : noms préfixés par l'écran (`e7-…`, `e8-…`) ; coupées sous `prefers-reduced-motion`.

## Ajouter l'écran d'un onglet (lots 8b à 8g)
1. Dans `js/menu/ecrans.js` (ou un module `js/menu/<onglet>.js` importé à la demande), une fonction `creer<Onglet>({ dict, donnees })` qui rend un élément ; l'appeler depuis `afficherOnglet()` de `js/menu/menu.js` au premier affichage.
2. Bandeau de titre : `bandeau(libelle, titre)` (même emplacement sur tous les écrans) ; boutons : `.menu-peint`, `.menu-planche`.
3. Textes `game.menu.<onglet>.*` dans `fr.json`, chacun écrit en entier dans le code (aucune clé orpheline) ; données dans `data/menu/`.
4. **Jusqu'au lot 8h : aucun état écrit dans le stockage** (mémoire seulement : `etatMenu` de `js/core/menu-etat.js`).
5. Tests : Playwright `?test=1&menu=1` (932 × 430, 667 × 375), axe, cibles de 44 px, aucune superposition.

## Risques
- Lighthouse mesure désormais le menu (même chargement, puis menu sans boucle d'images) : à mesurer (5 passes).
- Retour au menu : chargement rejoué (quelques secondes sur téléphone).
- Mode menu : un geste sur le menu débloque l'audio (prévu : aucun son avant le premier geste) ; aucun son n'est joué dans le menu.
- Tests sans `?test=1` qui attendaient la partie (relevé 11) : une étape « JOUER » ajoutée, paramètres inchangés.
