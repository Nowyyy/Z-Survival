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
