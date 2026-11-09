STATUT: VALIDE
## Documentation (APPROUVE ou REFUSE ; vide = REFUSE)
L1: APPROUVE   (regroupement par version, texte intégral ; V0.7 reste séparée ; exceptions ci-dessous)
R1: REFUSE
R2: APPROUVE   (seulement les 3 candidats de l'audit : nettoyage-plan-ancien-annexe.md, nettoyage-decisions.modele.md, nettoyage-plan-ancien-decisions.modele.md)
R3: REFUSE
R4: REFUSE
R5: REFUSE     (garder jusqu'au lot 13)
R6: REFUSE     (aucun candidat)
## Branches
Sources de V0.1 à V0.5 (lot-1, lot-1d, lot-2c, lot-3e, lot-4b) : GARDER
Branches « SÛRES » du rapport : APPROUVE   (sauf exceptions ci-dessous ; N attendu : 23, à recalculer par l'agent en partie C)
## Exceptions (chemin ou branche | garder / retirer | raison)
lot-5j | garder | lot de la V0.7 non publiée ; à supprimer au prochain nettoyage
lot-5k | garder | lot de la V0.7 non publiée ; une session peut encore y pousser
lot-5l | garder | lot de la V0.7 non publiée
Docs/lots/lot-5a.md | garder (séparé) | chemin cité par data/game/sounds-choix.json (dossier interdit)
Docs/lots/lot-3h.md | rattacher à V0.5 | preuve git : présent dans le commit gelé de V0.5 (le journal dit V0.4)
Docs/lots/lot-4c.md | rattacher à V0.5 | preuve git : présent dans le commit gelé de V0.5
Docs/lots/lot-1.md, lot-2.md, lot-2b.md, lot-2c.md, lot-3.md, lot-3a.md, lot-3b.md | retirer (regrouper) | douteux adaptables : tests/unit/zones-hygiene.test.js
Docs/lots/lot-3j.md | retirer (regrouper) | douteux adaptable : tests/unit/interface-integree-retours.test.js
Docs/lots/lot-3m.md | retirer (regrouper) | douteux adaptable : tests/unit/persos-integres-finitions.test.js
Docs/lots/lot-5g.md | retirer (regrouper) | douteux adaptable : tests/unit/publication.test.js (garde-fous inactifs)
tests de l'audit à adapter (data-changelog, persos-donnees, zones-hygiene, interface-integree-retours, persos-integres-finitions, publication) | adapter | même nombre d'assertions ; lecture par une aide commune qui trouve un bilan séparé ou groupé ; le texte du bilan est comparé à celui de main ; chaque test doit rester vert dans les DEUX états : avant la publication de la V0.7 (main contient encore les bilans séparés) et après (main contient les bilans regroupés) ; l'agent le démontre sur une copie jetable
Docs/ref/menu-debogage-proposition.md | retirer | proposition réalisée par le lot 5l (Docs/ref/debug.md la remplace) ; aucune référence entrante
Docs/ref/tests-audit-annexe.md, nettoyage-audit-annexe.md, nettoyage-audit.md, nettoyage-decisions.md, nettoyage-plan-ancien.md, nettoyage-plan-ancien-decisions.md | garder | lus par un script ou cités par un document qui reste
Docs/ref/fusion-3g.md (chemin cité mais absent) | ne pas corriger | renvois dans des bilans (intouchables) et des documents historiques
CLAUDE.md | corriger | réécrire la seule ligne « Une branche par lot : lot-N, jamais supprimée » pour dire que la branche d'un lot est supprimée au nettoyage de fin de version (sources de V0.1 à V0.4 et lots de la version en cours gardés) ; la longueur totale de CLAUDE.md ne doit pas augmenter (8 326 caractères mesurés, limite 8 400) : si la nouvelle ligne est plus longue, déplacer une ligne de détail vers Docs/ref/conventions.md (listée) pour compenser
Docs/seed.md | ne pas toucher | le propriétaire le réécrira à la publication de la V0.7
