STATUT: VALIDE
## Retraits (APPROUVE ou REFUSE ; vide = REFUSE)
PERSONNAGES (?perso=actuel, pose.js, character.js, aiguillage, colonne « actuel » de l'atelier, repli sur la variante A): APPROUVE
SONS (?sons=ancien, sound-legacy.js, sounds-legacy.json, loadLegacy, legacyMode, comparaison de l'atelier des sons): APPROUVE
## Garde-fous modifiés (la liste du plan est APPROUVEE, aux conditions suivantes)
- Plafonds de rendu : 27 300 triangles et 84 appels (atelier-detail, argent) et références remesurées avec la variante A, comme dans le plan ; les plafonds de persos-integres (45 000 / 400) ne changent pas.
- e2e/jeu-personnages : retrait des 4 assertions de l'ancien modèle APPROUVE, à condition que l'agent confirme qu'une assertion v2 équivalente existe (bras en avant et hanches du zombie qui marche) dans persos-animations ou persos-integres ; sinon il en ajoute une.
- Sons : les 22 assertions listées sont approuvées ; au plus 5 assertions de plus (data-sons, data-sons-lot3, data-annonce-sons), chacune listée avec sa justification « propre à l'ancien pack » avant d'être retirée ; au-delà de 5, l'agent s'arrête et le signale.
- unit/impact-chair : niveaux figés APPROUVES ; tests/unit/helpers/references-sons.json doit indiquer le hash de départ (pointe de lot-5c, 92e4556), la méthode de mesure et la date, car l'ancienne recette ne pourra plus servir à les régénérer.
- e2e/atelier-detail, cas U4 en mobile (210 appels contre 212 en bureau) : ne jamais élargir la tolérance ; ne traiter que si la CI complète confirme l'échec (alors une référence par projet, bureau et mobile, mesurée) ; sinon le signaler dans le bilan sans modifier.
- Un retrait ou un assouplissement non listé dans le plan est interdit : l'agent le liste et s'arrête.
## Exceptions (fichier | garder / retirer | raison)
js/core/character-parts.js (fromV1) et data/game/characters-v2.json (slot.current) | garder | utilisés par les tests, les oracles du lot 5d et les projections
tests/unit/helpers/oracle/ | garder | références figées du lot 5d, jamais modifiées
Docs/ref/personnages-actuels.md, Docs/ref/sons-actuels.md | garder | états des lieux historiques ; y ajouter une note « retiré du jeu au lot 5e »
Docs/ref/personnages-integres.md | garder | la section « Code ancien supprimable » (exigée par persos-integres-finitions.test.js) reste, avec une note de retrait
data/i18n/sons-integres.json et Docs/ref/sons-integres.md | corriger | textes qui parlent du pack d'avant ; aucune clé orpheline
CLAUDE.md et Docs/ref/conventions.md | corriger | seulement les mentions de ?perso=actuel, ?sons=ancien, de l'ancien modèle et de l'ancien pack ; CLAUDE.md ne doit pas dépasser sa longueur actuelle (8 371 caractères au plus, limite 8 400)
Docs/seed.md | ne pas toucher | le propriétaire le réécrira à la publication de V0.6
?sons=A|B|C, js/game/sound-atelier.js, data/game/sounds-atelier.json | garder | jusqu'au lot 13
Ordre de fusion | information | lot-5c est déjà dans dev ; lot-5e ne doit contenir que ses propres commits de plus (ne pas fusionner dev dans lot-5e sauf conflit signalé à l'agent)
