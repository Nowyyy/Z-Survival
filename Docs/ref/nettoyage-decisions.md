STATUT: VALIDE
## Catégories
N1: APPROUVE   (exports morts, jetons --space-8 et --duration-normal, tests/e2e/.gitkeep ; plus `affine` de character-parts.js s'il reste mort après le lot 5d et que la preuve tient ; ESLint signale les fonctions d'aide devenues orphelines : les retirer seulement si la preuve tient)
N2: APPROUVE   (seulement ?murs=bas : la condition de js/game/main.js, les commentaires, la combinaison « mursBas » de scripts/tests/chargement.mjs)
N3: REFUSE     (pages techniques gardées jusqu'au lot 13)
N4: APPROUVE   (retirer scripts/modele/captures.mjs, scripts/plan-monde.mjs, scripts/sons/scene.mjs et leurs lignes de source dans tests/selection.json)
N5: APPROUVE   (retirer Docs/ref/fusion-3g.md ; corriger les phrases périmées listées en N5 de l'audit)
N6: REFUSE
N7: REFUSE
## Exceptions
?percee=0 | garder | garde-fou atelier-retours.spec.js
?detail=, ?vhs=, ?shadows=, ?dpr= | garder | lus par les préréglages graphiques
?sons=A|B|C, js/game/sound-atelier.js, data/game/sounds-atelier.json | garder | jusqu'au lot 13
scripts/planche-textures.mjs, scripts/stats-joueur.mjs | garder | outils utiles aux lots suivants
Docs/ref/conventions.md et CLAUDE.md | corriger | seulement les phrases périmées de N5 (anciens déclencheurs de CI et job e2e, npm run assemble et _site/lots/, dossier modele-rdc, ligne « Sons » de CLAUDE.md : la plupart des sons passent par synth2.js) et les mentions de fichiers ou d'exports supprimés ; CLAUDE.md ne doit pas dépasser 8 400 caractères (il en compte 8 371 : une correction ne doit jamais l'allonger) ; rien d'autre
?perso=actuel, js/core/pose.js, js/game/character.js, ?sons=ancien, js/game/sound-legacy.js, data/game/sounds-legacy.json | traités en partie C | plan puis accord du propriétaire
