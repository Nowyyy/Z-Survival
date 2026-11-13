# Sons du menu principal : décisions du propriétaire (lot 8g, à faire dans un lot dédié)

Décisions données pendant le lot 8g, après l'estimation des sons nécessaires au menu. **Rien n'est fait** : cette fiche sert de base au prompt du
lot qui les intégrera. Règles qui s'appliquent : sons synthétisés en code (`js/game/synth.js`, `synth2*.js`, `data/game/sounds.json`), aucun
fichier audio (le son du logo du studio est l'exception nominative du lot 8g) ; jamais de son dans `js/core/` ; **aucun son avant le premier geste**.

| Famille | Décision | Sons | État |
| --- | --- | --- | --- |
| Interface | Un même bruit pour tous les clics | 1 (`interface-clic`) | à créer |
| Musique | Musique des menus « un peu stressante, mais pas trop » | 1 boucle | à créer (le moteur ne fait que des effets : musique nouvelle) |
| Volume | Une barre de volume du jeu et une barre de volume de la musique (proposition du propriétaire, à confirmer) | — | Options E5-3 : « Son activé / coupé » et **un seul** curseur aujourd'hui (en mémoire jusqu'au lot 8h) |
| Ambiance du menu | Gardée en idée, pas prévue en l'état | — | idée |
| Boutique et argent | Bruit d'argent dépensé | 1 (`interface-achat`) | **recette déjà dans l'atelier** (`data/game/sounds-atelier.json`, lot 3h), jamais intégrée (`sounds-choix.json` : « la boutique n'existait pas ») ; `interface-piece` existe aussi (choix « aucun ») |
| Ouvertures 3D (caisses) | Oui, à faire | à détailler d'après les phases de l'animation (départ, ouverture, révélation selon la rareté) | à créer |
| Personnage | Équiper, améliorer, fusionner, changer d'avatar | 4 | à créer |
| Chargement (E7) | Chute du Z et rebond | 2 | à créer |

Total hors ouvertures : 9 sons à créer ou intégrer (clic, musique, achat, quatre du Personnage, chute et rebond).

## Points à trancher au lot des sons
- **Premier geste** : au vrai lancement, le geste de l'introduction (« Toucher pour commencer ») ouvre l'audio ; au retour au menu (`#retour`, page rechargée), aucun geste : la musique attend le premier toucher.
- **Deux volumes** : « Volume du jeu » (effets) et « Volume de la musique » dans E5-3 et dans la pause (un seul composant, `creerOptions`) ; en mémoire jusqu'au lot 8h, gardés ensuite.
- **Poids au démarrage** : le menu compte 32 fichiers JavaScript et l'accueil Lighthouse est au seuil ; les sons du menu se génèrent après l'affichage (comme Rubik Dirt), la musique au premier geste.
- Le chargement E7 joue avant le menu : chute et rebond seulement après un geste (vrai lancement : l'introduction l'a donné).
- Jugement à l'oreille : par le propriétaire seulement (aucun son n'est écouté par un agent).

## Lot 8i : plan (écrit par l'agent du lot 8i ; les décisions ci-dessus priment)
> Avant les retours du propriétaire : l'état final est en fin de fiche (« État final du lot 8i »).

### Relevé
- Moteur de l'atelier (`js/core/synth2.js`, `synth2-dsp.js`, `synth2-sources.js`) : pur, déterministe par graine, mono 22 050 Hz en Float32 (4 octets par échantillon, soit 88 Ko par seconde) ; briques : bruits blanc, rose et brun, enveloppes, biquads fixes et glissants, modes amortis, réverbération courte, saturation douce, fondus ; familles utiles au menu : `register` (caisse enregistreuse de `interface-achat`), `chime` (métal), `voice` (voix de zombie), `flesh` (chair). Coût mesuré sous Node : 17 à 56 ms pour un son d'une seconde (un rendu ne se découpe pas).
- Volume du jeu aujourd'hui (`js/game/audio.js`) : un seul gain général après le compresseur (`masterGain × volume / 100`, 0 quand le son est coupé) ; la mélodie d'annonce de vague (catégorie `annonce`) passe par le même gain. Contexte audio créé au premier geste (`unlock`), suspendu en pause et onglet caché.
- Introduction (lot 8g) : `js/menu/intro.js` crée un contexte audio dans le geste « Toucher pour commencer », y joue le son du logo, puis le **ferme** : le lot 8i le garde ouvert et le donne aux sons du menu. Au retour d'une partie (`#retour`), aucun contexte : il est créé au premier toucher.
- Chronologie des ouvertures (`js/core/ouverture.js`, lecture seule) : instants par caisse `tapis`, `tir`, `etincelles`, `couvercle`, `lumiere`, `rayons`, `explosion`, `reactions` (geste, début, fin), `projection` (souffle, impact, décolle, bas), `vol`, `case`, et la marche de l'arrivée (nombre de pas). Le temps de l'ouverture avance dans la boucle d'images de `js/menu/ouverture/ouverture.js` (sauts par « toucher l'écran », ×6 en test).

### Choix de l'agent (là où la fiche ne décide pas)
- **Deux volumes** (proposition du propriétaire) : faits. « Volume du jeu » : sons de la partie et effets du menu ; « Volume de la musique » : musique des menus **et mélodie d'annonce de vague** (sinon le curseur ne réglerait rien en partie ; la vague reste annoncée à l'écran).
- **Musique baissée pendant les ouvertures** (à 35 %, réglable : `musique.baisseOuverture` de `data/menu/sons.json`, 1 = pas de baisse), pour laisser entendre le tir et la signature de rareté.
- **Voix des zombies des ouvertures** : même famille que celles du jeu (source glottale et formants du moteur), recettes propres au menu ; aucun tampon de la partie n'est recalculé.
- **Achat** : la recette de l'atelier (`interface-achat`, variantes A et B copiées dans `data/menu/sons.json`), plus une variante C (pièces).
- **Ambiance du menu** : non faite (gardée en idée par le propriétaire).

### Sons (22 050 Hz mono ; variante par défaut en gras ; durées visées)
| Nom | Moment | Durée | Variantes |
| --- | --- | --- | --- |
| `clic` | toute commande du menu (boutons, onglets, entrées, choix) | 0,07 s | **A** tic de bois sec · B déclic de métal grave · C goutte sourde |
| `achat` | achat d'une offre du jour, d'une caisse | 0,5 à 1,25 s | **A** levier et sonnette · B tiroir et pièces · C poignée de pièces |
| `equiper` | objet équipé | 0,25 s | **A** sangle et boucle · B métal qui s'enclenche · C cuir frotté |
| `retirer` | objet retiré | 0,2 s | **A** sangle relâchée · B métal qui se libère |
| `ameliorer` | amélioration | 0,6 s | **A** marteau puis tintement montant · B frottement de meule et éclat |
| `fusion` | fusion (montée ; la signature de la rareté obtenue suit) | 0,9 s | **A** souffle qui monte · B grondement qui se serre |
| `choisir` | personnage choisi, avatar validé | 0,3 s | **A** deux notes graves · B souffle court et coup |
| `chute-impact` | écran de chargement : le Z touche le sol (0,60 s) | 0,5 s | **A** masse sourde et gravats · B tôle et sol |
| `chute-tiret` | le tiret s'écrase (0,62 s) | 0,25 s | **A** craquement sec · B écrasement mou |
| `chute-rebond` | second contact du Z (0,96 s) | 0,3 s | **A** coup sourd plus faible · B raclement et coup |
| `rarete-commun` … `rarete-legendaire` | signature de la rareté (ouverture : début des rayons ; fusion : après la montée) | 0,35 · 0,6 · 1,0 · 1,6 · 2,6 s | **A** cloches (du toc discret à la cascade dorée) · B cuivres sombres · C verre et chœur |
| `ouv-pas` | chaque pas de l'arrivée | 0,18 s | **A** semelle sur béton · B botte lourde |
| `ouv-tapis` | tapis roulant (arrêté à la fin du tapis) | 1,4 s | **A** moteur et rouleaux · B chaîne qui cliquette |
| `ouv-tir` | tir du fusil d'assaut | 0,4 s | **A** coup sec et queue · B coup grave étouffé · C rafale de deux |
| `ouv-impact` | balle sur la caisse, étincelles | 0,3 s | **A** tôle et grésillement · B ricochet |
| `ouv-couvercle` | couvercle qui saute | 0,5 s | **A** verrou et souffle · B tôle qui claque |
| `ouv-lumiere` | montée de la lumière et des rayons | 0,7 s | **A** souffle clair montant · B bourdon qui s'ouvre |
| `ouv-explosion` | explosion du légendaire | 1,8 s | **A** coup grave et débris · B double détonation · C souffle long |
| `ouv-souffle` | seconde explosion, sous le zombie | 1,2 s | **A** souffle sourd · B coup et sifflement |
| `ouv-ecrasement` | le zombie s'écrase contre l'écran | 0,6 s | **A** choc mou sur vitre · B claque humide |
| `ouv-sang` | le sang coule et découvre l'objet | 1,5 s | **A** glissement humide · B gouttes et frottement |
| `ouv-zombie-sursaut` | sursaut et sursaut léger | 0,3 s | **A** grognement bref · B hoquet |
| `ouv-zombie-saut` | saut | 0,5 s | **A** cri court · B râle surpris |
| `ouv-zombie-cri` | chute, chute forte : le cri | 0,7 s | **A** cri qui retombe · B râle long |
| `ouv-zombie-tombe` | chute : le corps touche le sol | 0,4 s | **A** corps sur béton · B corps et os |
| `ouv-carte` | la carte file vers sa case (×10) | 0,35 s | **A** souffle bref · B papier qui claque |
| `ouv-case` | la carte arrive dans sa case | 0,12 s | **A** toc de bois · B tic clair |
| `ouv-passer` | « Passer », caisse passée au toucher | 0,2 s | **A** bande qui file · B souffle coupé |

### Musique des menus
- **Séquenceur en temps réel**, pas de tampon de musique : une partition pure (`js/core/musique-menu.js` : mesures, notes, niveaux des couches, d'après une graine) jouée par des nœuds Web Audio (`js/menu/sons/musique.js` : bourdon continu de deux oscillateurs filtrés, pouls grave, ostinato pincé, nappe dissonante, cloche rare, souffle, écho par ligne à retard). Mémoire : un seul tampon de bruit de 2 s (moins de 0,4 Mo).
- **Boucle sans coupure** : rien ne s'arrête au bouclage (le bourdon tient, les niveaux de la dernière section rejoignent ceux de la première) ; **variations** : les sections font entrer et sortir les couches, les motifs de l'ostinato et les accords changent d'un tour à l'autre (graine).
- Variantes : **A** ré mineur, 80 à la noire, pouls et ostinato · B plus lente (60), nappes et cloches, presque sans rythme · C plus tendue (96), ostinato en croches et tic métallique.
- États (purs, `js/core/sons-menu.js`) : silence → attente du geste → musique ; baisse pendant une ouverture ; fondu de 1,2 s à « JOUER » ; arrêt page cachée ou son coupé, reprise au retour.

### Volumes, chargement, page d'écoute, fichier de choix
- **Volumes** : `Son` (activé, coupé), `Volume du jeu`, `Volume de la musique` (0 à 100 %, pas de 10, gain linéaire comme aujourd'hui) dans le composant d'Options ; en mémoire (`js/menu/demarrage.js`) jusqu'au lot 8h.
- **Chargement** : un module léger au démarrage (`js/menu/sons/sons.js` : geste, volumes, demandes de sons) ; le moteur, `data/menu/sons.json`, `sons-choix.json` et les tampons du menu (une variante par son, un tampon par image) après l'écran de chargement ; les trois sons de la chute dès l'écran de chargement (joués seulement s'ils sont prêts à leur instant, jamais en retard) ; ceux des ouvertures au toucher de « Ouvrir », libérés avec l'ouverture. Bornes : menu ≤ 3 Mo, ouverture ≤ 4 Mo.
- **Page d'écoute** `atelier-sons-menu.html` (canaux de débogage) : chaque son et ses variantes (écoute, durée, crête, niveau), variante choisie marquée, démonstration d'une ouverture ×1 par rareté (son seul, chronologie réelle), musique (lecture, arrêt, couches), et le contenu de `sons-choix.json` à copier.
- **`data/menu/sons-choix.json`** : `{ "choix": { "<nom>": "A" | "B" | "C", …, "musique": "A" } }` ; nom ou variante inconnus : variante par défaut de `sons.json`.

## Lot 8i : fait (mode d'emploi)
> Avant les retours du propriétaire : l'état final est en fin de fiche (« État final du lot 8i »).
**Aucun son n'a été écouté par l'agent** : tout est décrit et mesuré (durées, crêtes, niveaux moyens, mémoire), rien n'est jugé à l'oreille. Bilan et preuves : `Docs/lots/lot-8i.md`.

### Ce qui joue, et quand
- **Clic** : un seul son (`clic`) pour toute commande du menu (boutons, onglets, entrées, liens, cases), par écoute déléguée sur `#e8` (`ecouterClics`, `js/menu/sons/sons.js`) ; jamais au défilement, ni sur une commande désactivée, ni en plus d'un son précis (achat, équiper…) ; un seul à la fois (écart minimal de 50 ms), moins fort quand on touche vite (× 0,6 dans les 250 ms, plancher 0,25 : `clic` de `data/menu/sons.json`). Une commande peut s'en passer : attribut `data-son="aucun"` (« Passer »).
- **Achat** (`achat`) : offre du jour et caisse. **Personnage** : `equiper`, `retirer`, `ameliorer` (objet ou personnage), `fusion` puis, 0,8 s après, la signature `rarete-<rareté obtenue>`, `choisir` (personnage choisi, avatar validé).
- **Chute du Z** (écran de chargement) : `chute-impact` à 0,60 s, `chute-tiret` à 0,62 s, `chute-rebond` à 0,96 s (`SONS_CHUTE`, `js/menu/chargement.js`), programmés sur l'horloge audio au départ de l'animation ; seulement après un geste (vrai lancement : celui de l'introduction ; au retour d'une partie : aucun son, puis à « JOUER » la chute est sonorisée) ; un son pas encore prêt à son instant n'est pas joué.
- **Ouvertures de caisses** : `sonsOuverture(chronologie, réglages)` (`js/core/sons-menu.js`, pur) donne la liste des sons aux instants de la chronologie (`js/core/ouverture.js`) : pas de l'arrivée, tapis (arrêté à la fin du tapis), tir, impact (étincelles), couvercle, lumière, signature de la rareté (début des rayons), explosion et souffle du légendaire, écrasement, sang (tenu jusqu'en bas), réactions des zombies (sursaut, saut, cri puis corps au sol), carte et case (×10). La boucle d'images de l'ouverture appelle `suivre(temps)` : aucun minuteur. Toucher l'écran (caisse passée) coupe les sons en cours et joue `ouv-passer` ; « Passer », Échap, « Continuer », « Rouvrir » et la fin d'un ×10 arrêtent tout et libèrent les tampons de l'ouverture.
- **Musique** : démarre quand le menu est affiché **et** qu'un geste a eu lieu (après l'introduction et l'écran de chargement, sans autre geste ; au retour d'une partie : au premier toucher) ; baissée à 35 % pendant une ouverture ; fondu de 1,2 s à « JOUER » ; arrêtée page cachée ou son coupé (le contexte audio est alors suspendu), reprise au retour.

### Choisir une variante (sans lot)
1. Ouvrir `…/dev/atelier-sons-menu.html` sur le téléphone (lien « Page d'écoute » dans le menu de débogage de la pause), son du téléphone activé, **commutateur silencieux de l'iPhone désactivé** (il coupe Web Audio ; le jeu ne le contourne pas).
2. Écouter « Écouter A / B / C » de chaque son ; cocher la variante gardée ; écouter la démonstration d'une ouverture par rareté et la musique (variante, couches).
3. En bas de la page, « Copier » : c'est le contenu complet de `data/menu/sons-choix.json` ; le coller dans ce fichier sur `dev`. Un nom ou une variante inconnus retombent sur la variante par défaut (`defaut` de `data/menu/sons.json`) ; le jeu ne casse jamais sur ce fichier.

### Régler les sons et la musique (sans lot, `data/menu/sons.json`)
- Par son : `gain` (niveau de lecture, 0 à 1), `defaut`, et les recettes des variantes (couches `ton`, `bruit`, `modes`, `grains`, `notes`, `moteur` ; `post`). Après un changement voulu d'une recette : `node scripts/menu/sons.mjs` (durées, crêtes, niveaux, empreintes) puis `node scripts/menu/sons.mjs --empreintes > tests/unit/helpers/sons-menu-empreintes.json` (référence des tests).
- Musique (`musique`) : `gain`, `baisseOuverture` (1 : pas de baisse), `fonduJouer`, `fonduEntree` ; par variante : `bpm`, `tonique` (note MIDI), `graine`, `bourdon`, `couches` (motifs du pouls et de l'ostinato en demi-tons, accords de la nappe, notes et probabilité de la cloche, souffle, tic) et `sections` (durée en mesures, niveau de chaque couche de 0 à 1). Un tour : A 132 s, B 104 s, C 90 s ; les motifs changent d'un tour à l'autre.

### Volumes
- Options (menu E5 et pause E2-12, même composant) : **Son** (activé, coupé), **Volume du jeu**, **Volume de la musique** (curseurs de 0 à 100 % par pas de 10, au clavier : flèches, Début, Fin). « Son coupé » coupe tout. Le volume du jeu règle les sons de la partie et les effets du menu ; le volume de la musique règle la musique des menus et la mélodie d'annonce de vague de la partie (catégorie `annonce`, sortie par son propre compresseur et son propre gain : `js/game/audio.js`). Gains linéaires (`gainsVolumes`, `js/core/sons-menu.js`). En mémoire (`js/menu/demarrage.js`), appliqués à la partie à « JOUER » ; perdus au rechargement jusqu'au lot 8h.

### Chargement et mémoire
- Démarrage du menu : un seul fichier de plus, `js/menu/sons/sons.js` (33 fichiers JavaScript sous `?test=1&menu=1`, 34 avec l'introduction). Rien d'autre sans geste. Après un geste : `moteur.js`, `js/core/sons-menu.js`, `data/menu/sons.json`, `sons-choix.json`, le calculateur d'arrière-plan (`calcul.js`, `synthese.js` et le moteur de l'atelier), puis `musique.js` et `js/core/musique-menu.js` au premier départ de la musique. Au vrai lancement, le geste de l'introduction a déjà eu lieu : le moteur se charge pendant l'écran de chargement (pour la chute du Z).
- Tampons (variantes par défaut, 22 050 Hz mono) : menu 0,89 Mo (chute 90 Ko, menu 296 Ko, raretés 530 Ko ; borne 3 Mo), ouverture 1,08 Mo (borne 4 Mo), libérés après chaque ouverture ; musique : un tampon de bruit de 2 s (0,34 Mo à 44,1 kHz). Calcul hors du fil principal (0,4 s au total pour le menu en émulation).
- État pour les tests : `window.__zsMenu.sons()` (faits, volumes, gains, tampons prêts, octets par groupe, nœuds actifs, mode de la musique, journal des lectures).

### Empreintes des variantes par défaut (graine 1 ; crête −3,0 dBFS pour toutes)
| Son | Durée | Niveau moyen (dBFS) | SHA-256 (début) | | Son | Durée | Niveau moyen (dBFS) | SHA-256 (début) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `clic` | 0,07 s | −19,0 | `0ae18b23c45c` | | `ouv-tapis` | 1,4 s | −12,8 | `cbc3a5100d09` |
| `achat` | 1,1 s | −17,1 | `2904cf7e1023` | | `ouv-tir` | 0,4 s | −17,9 | `6f77cc08fd35` |
| `equiper` | 0,25 s | −22,1 | `65d692dd0583` | | `ouv-impact` | 0,3 s | −21,9 | `407f841ad62f` |
| `retirer` | 0,2 s | −21,7 | `b1d4a855f22c` | | `ouv-couvercle` | 0,5 s | −25,0 | `a8c8538c8f95` |
| `ameliorer` | 0,6 s | −17,4 | `f61bb1146a36` | | `ouv-lumiere` | 0,7 s | −14,5 | `610f40287eb8` |
| `fusion` | 0,9 s | −18,3 | `dcdde3fe7cca` | | `ouv-explosion` | 1,8 s | −16,8 | `12b5673b3d59` |
| `choisir` | 0,32 s | −14,7 | `bf6753dd1013` | | `ouv-souffle` | 1,2 s | −13,9 | `950eba895daa` |
| `chute-impact` | 0,5 s | −15,0 | `f0d82fa7c61e` | | `ouv-ecrasement` | 0,6 s | −19,7 | `7d8d3b9f5fb8` |
| `chute-tiret` | 0,25 s | −22,4 | `cd6b7f6fd1e1` | | `ouv-sang` | 1,5 s | −22,2 | `ccadb7b6b5c7` |
| `chute-rebond` | 0,3 s | −14,9 | `e5079e5076db` | | `ouv-zombie-sursaut` | 0,3 s | −11,3 | `55594b159577` |
| `rarete-commun` | 0,35 s | −19,0 | `1ce40c38846e` | | `ouv-zombie-saut` | 0,5 s | −9,9 | `1bce70b69367` |
| `rarete-peu-commun` | 0,6 s | −17,6 | `f5f837e328ff` | | `ouv-zombie-cri` | 0,72 s | −9,2 | `f670313914bb` |
| `rarete-rare` | 1,0 s | −19,2 | `ff32084b6319` | | `ouv-zombie-tombe` | 0,4 s | −16,9 | `40e7adef87fe` |
| `rarete-epique` | 1,6 s | −18,7 | `10ba4202732f` | | `ouv-carte` | 0,35 s | −17,1 | `0737d451d17c` |
| `rarete-legendaire` | 2,6 s | −19,3 | `d1cde044a317` | | `ouv-case` | 0,12 s | −19,3 | `f1feb6430e96` |
| `ouv-pas` | 0,18 s | −16,0 | `52bdc9a0e712` | | `ouv-passer` | 0,2 s | −17,2 | `86087252e568` |

Toutes les variantes et versions (83 tampons) : `tests/unit/helpers/sons-menu-empreintes.json`, ou `node scripts/menu/sons.mjs`.

## Retours du propriétaire après le lot 8i (13/11/2026)
- **Variantes choisies** par le propriétaire sur la page d'écoute : dans `data/menu/sons-choix.json` (musique : C ; signatures de rareté : B en attendant les nouvelles mélodies).
- **Ouvertures, sons retirés** (« je n'aime pas tout dans l'animation d'ouverture ») : plus aucune voix de zombie (`ouv-zombie-sursaut`, `ouv-zombie-saut`, `ouv-zombie-cri` retirés du catalogue), plus de sang qui coule sur la vitre (`ouv-sang` retiré). **Gardé** : le corps qui tombe (`ouv-zombie-tombe`).
- **Tapis** : `ouv-tapis` ne s'entend plus qu'à l'arrivée de la première caisse ; plus entre les caisses d'un ×10. Choix de l'agent sur « entre chaque » : pour le retirer tout à fait, ôter la ligne `ouv-tapis` de `sonsOuverture` (`js/core/sons-menu.js`).
- **Point d'exclamation** : nouveau son `ouv-exclamation` (3 variantes), joué quand la marque apparaît au-dessus des zombies (instant `vue` de la réaction, `data/menu/ouvertures.json`), une fois par caisse, plus fort avec « !! » et « !!! » (0,7 · 0,85 · 1). Le sursaut (commun, peu commun) n'a pas de marque : aucun son.
- **Mélodies d'ouverture** (signatures de rareté) : quatre familles de plus, soit sept par rareté : A cloches, B cuivres sombres, C verre et chœur, **D fanfare rythmée** (« ta-ta-taa » qui monte), **E boîte à musique** (notes qui descendent puis s'élèvent), **F orgue sombre** (accords tenus, mineur qui bascule en majeur au légendaire), **G arpège électrique** (notes rapides qui filent, accord tenu). Deux timbres de plus pour les couches `notes` : `orgue`, `bip`. Les variantes A à G d'une famille vont ensemble, mais chaque rareté se choisit à part.
- **Page d'écoute** : par défaut, elle ne montre plus que les sons encore à choisir (`"aChoisir": true` dans `data/menu/sons.json` : les cinq signatures et le point d'exclamation) ; la musique et les sons déjà choisis sont sous « Voir aussi les sons déjà choisis » (`?tout=1`). Le texte à copier reste le fichier complet, vos autres choix compris. Une fois un son choisi, retirer son `aChoisir` le sort de la vue par défaut.
- Catalogue : 29 sons ; tampons d'une ouverture : 0,71 Mo (borne 4 Mo). Les empreintes des variantes A, B et C existantes n'ont pas changé. **Aucun de ces sons n'a été écouté par l'agent.**
- **Puis (même jour)** : point d'exclamation : variante **B** gardée (« bip aigu de dessin animé ») ; **mélodie de signature de rareté retirée** : les cinq sons `rarete-*` (sept familles) sortent du catalogue, des ouvertures et de la fusion (la montée `fusion` reste seule) ; la rareté reste montrée par la lumière, les rayons et la carte. Catalogue : 24 sons ; menu 0,39 Mo, ouverture 0,71 Mo. Plus aucun son à choisir : la page d'écoute montre de nouveau tout. Les timbres `orgue` et `bip` et les variantes jusqu'à G restent possibles pour de futures propositions.

## État final du lot 8i (fin du lot, 13/11/2026)
Cette section fait foi : les sections « plan » et « fait » plus haut décrivent le lot avant les retours du propriétaire (elles citent encore les voix des zombies, le sang et les signatures de rareté, retirés depuis).
- **Catalogue** : 24 sons (`data/menu/sons.json`), 56 tampons toutes variantes comprises ; **variantes choisies à l'oreille par le propriétaire** (`data/menu/sons-choix.json`) ; musique : variante **C**. Plus aucun son à choisir : la page d'écoute montre tout (un son remis à juger se marque `"aChoisir": true` dans `sons.json`, la page ne montre alors que ceux-là, `?tout=1` pour tout voir).
- **Menu** : clic unique, achat, équiper, retirer, améliorer, fusion (montée seule), choisir (personnage, avatar), chute du Z (impact, tiret, rebond), musique, volumes : inchangés depuis la section « fait ».
- **Ouverture d'une caisse, dans l'ordre** : pas de l'arrivée ; tapis (**première caisse seulement**) ; tir ; impact et étincelles ; couvercle ; montée de la lumière ; **point d'exclamation** des zombies quand la marque apparaît (rare « ! », épique « !! », légendaire « !!! », une fois par caisse, de plus en plus fort) ; corps du zombie qui tombe (épique, légendaire) ; légendaire : explosion, seconde explosion, zombie contre l'écran ; ×10 : carte vers sa case, case remplie ; « Passer » et caisse passée au toucher. **Retirés** : voix des zombies, sang qui coule, tapis entre les caisses, mélodie de signature de rareté (ouvertures et fusion).
- **Mémoire** (variantes retenues) : menu 0,39 Mo (chute 92 Ko, menu 310 Ko ; borne 3 Mo), ouverture 0,71 Mo (borne 4 Mo), musique 0,34 Mo.

| Son | Variante | Durée | Niveau moyen (dBFS) | SHA-256 (début) | | Son | Variante | Durée | Niveau moyen (dBFS) | SHA-256 (début) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `clic` | A | 0,07 s | −19,0 | `0ae18b23c45c` | | `ouv-tapis` | A | 1,4 s | −12,8 | `cbc3a5100d09` |
| `achat` | B | 1,25 s | −18,6 | `c27287e913d2` | | `ouv-tir` | A | 0,4 s | −17,9 | `6f77cc08fd35` |
| `equiper` | C | 0,28 s | −17,7 | `c42bf7cccf3e` | | `ouv-impact` | A | 0,3 s | −21,9 | `407f841ad62f` |
| `retirer` | B | 0,2 s | −19,9 | `20646d5bfacf` | | `ouv-couvercle` | B | 0,5 s | −20,3 | `8640e7273422` |
| `ameliorer` | A | 0,6 s | −17,4 | `f61bb1146a36` | | `ouv-lumiere` | A | 0,7 s | −14,5 | `610f40287eb8` |
| `fusion` | B | 0,9 s | −11,9 | `576e627621e7` | | `ouv-explosion` | A | 1,8 s | −16,8 | `12b5673b3d59` |
| `choisir` | B | 0,3 s | −16,7 | `42c757ae2efd` | | `ouv-souffle` | B | 1,2 s | −16,5 | `7dafd2c4e6bc` |
| `chute-impact` | A | 0,5 s | −15,0 | `f0d82fa7c61e` | | `ouv-ecrasement` | A | 0,6 s | −19,7 | `7d8d3b9f5fb8` |
| `chute-tiret` | B | 0,25 s | −16,9 | `738efac85c07` | | `ouv-zombie-tombe` | B | 0,4 s | −16,7 | `0231a19b3f4e` |
| `chute-rebond` | B | 0,32 s | −16,2 | `37956f154b1f` | | `ouv-exclamation` | B | 0,16 s | −16,2 | `290116d6adf6` |
| `ouv-pas` | B | 0,2 s | −15,7 | `219519d0496a` | | `ouv-carte` | B | 0,3 s | −27,3 | `3788be46a480` |
| `ouv-case` | A | 0,12 s | −19,3 | `f1feb6430e96` | | `ouv-passer` | B | 0,18 s | −17,8 | `c4867c28e8aa` |

Crête de −3,0 dBFS pour tous. `ouv-carte` B est nettement plus faible en moyenne que les autres (−27 dBFS) : à monter par son `gain` s'il s'entend trop peu. Bilan : `Docs/lots/lot-8i.md`.
