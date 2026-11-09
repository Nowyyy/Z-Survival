STATUT: VALIDE
## Catégories (APPROUVE ou REFUSE ; vide = REFUSE)
W1: APPROUVE   (W1-a seulement : sauter `unitaires` sur un push de `dev` ; la variante W1-b est refusée ; pages.yml n'est pas modifié)
W2: APPROUVE   (W2-a : pull_request limité aux Pull Requests vers main ; W2-c : base du premier push d'une branche lot-* = origin/dev ; la variante W2-b est refusée ; paths-ignore de pages.yml : Idées seulement)
T1: REFUSE     (aucun gain de temps ; à retirer au prochain nettoyage de fin de version)
T2: REFUSE
T3: APPROUVE   (délais de 5 s à 30 s, carte-jeu:66, diagnostic d'argent:340 ; atelier-detail U4 mobile : diagnostic seulement, voir exceptions)
T4: APPROUVE   (durées mesurées des tests sans mesure ; canal.spec : pas de regroupement)
T5: APPROUVE   (table de sélection : changement limité aux zones ; aides Vitest)
T6: APPROUVE   (remise à la mesure de la référence de durée ; PAS la variante par retraits)
## Exceptions (fichier ou tâche | garder / retirer | raison)
.github/workflows/pages.yml | ne pas modifier | seuil de quick tenu (1 min 37 s) ; aucun risque de déploiement à prendre
W1-a : tâche unitaires de tests.yml | sauter sur un push de dev seulement | quick fait déjà lint et tout Vitest et bloque le déploiement ; unitaires continue de tourner sur push lot-*, pull_request vers main, essai/** et déclenchement manuel ; rapport et bilan-duree ne doivent plus dépendre d'unitaires sur dev (test du workflow mis à jour avec les valeurs exactes attendues, sans assouplissement) ; dire dans le bilan que bilan-duree n'a plus de durée Vitest sur dev
W2-a : règle à documenter | ajouter à Docs/ref/tests-paliers.md | une branche de travail se nomme lot-* pour être testée avant sa fusion ; une Pull Request d'une autre branche vers dev n'a plus de test avant fusion ; la Pull Request main vers dev n'est pas testée (contenu déjà testé)
W2-c : repli | origin/main | si origin/dev est absent
T3 : délais de 5 s | passer à 30 s sans changer d'assertion | jeu.spec.js:181, 183, 194, 204, 205 ; jeu-ambiance.spec.js:171, 172 ; publication.spec.js:287 ; ajouter tout autre délai de 5 s attendant un chargement de la page du jeu repéré dans le même esprit (délai seulement, listé dans le bilan)
carte-jeu.spec.js:66 (mobile, axe) | délai du test 60 s à 120 s | assertion inchangée (test.setTimeout)
argent.spec.js:340 | diagnostic | au moins 20 répétitions (--repeat-each) en bureau et une série sous charge ; corriger seulement si la cause est dans le test ; JAMAIS @instable ; si la cause est dans le jeu : défaut signalé dans le bilan, test inchangé, jeu non modifié
atelier-detail.spec.js:56 (mobile U4, 210 pour au moins 211) | garder tel quel | aucune tolérance modifiée ; diagnostic autorisé : hypothèse du propriétaire à vérifier : en mobile le préréglage vient de la détection automatique (Moyen) et les nappes de brume basses n'existent pas à Moyen, soit 2 appels et 4 triangles de moins ; essayer un préréglage explicite identique dans les deux projets ; PROPOSER le correctif dans le bilan sans l'appliquer
lampes.spec.js:289 | garder | douteux (404 en console à la fusion du lot 5k) ; si un échec se reproduit, le signaler dans le bilan
T4 : mesure locale | autorisée pour les seuls fichiers sans durée | 208 exécutions dont 106 au standard ; PAS de palier complet en local ; durées intégrées à tests/budget-mesure.json par l'outillage ; recalculer N ; équilibre vérifié sur la CI de la branche
T4 : tranche supplémentaire | conditionnelle | si le palier standard en rejeu total sur la CI de la branche dépasse 7 min 30 s, passer standardCibleSecondes à 400 s (une tranche de plus) et le dire ; sinon ne pas y toucher ; mesure du rejeu total : moyen au choix de l'agent, documenté, sans commit artificiel dans un autre lot et sans toucher aux workflows de déploiement
T5 : table de sélection | appliquer | un changement limité aux entrées zones[*] de tests/selection.json touche ces zones (fermeture inverse comprise) ; toute autre clé (garde-fous, rejeu-total, toujours, fumee, documentation, defaut, schema) garde « tout » ; test de la règle (cas par cas) ; contrôle de la table (tests-selection.test) toujours dans toujours ; sabotage de 16 cassures sur 16 refait
T5 : aides Vitest | appliquer | tests/unit/helpers/** rejoue tout Vitest (déjà fait en CI) mais plus de rejeu total de Playwright ; preuve par grep qu'aucun fichier e2e ne les importe
T5 : css/tokens.css, tests/e2e/helpers.js, workflows, configurations | garder « tout » | lus par toutes les pages ou tous les tests
T6 : référence de durée | remise à zéro explicite | tests/budget-mesure.json et la référence du complet remplacés par le cumul mesuré après T4 ; ajoutMaxParLotSecondes reste 90 ; le bilan écrit « ce n'est pas un allègement » avec le cumul avant et après et la durée réelle du complet en CI ; ne pas présenter le budget comme respecté par rapport à la référence du lot 4e
W1-b, W2-b, T6 par retraits | refuser | pertes de vérification (Vitest sur main, palier standard sur dev, règles de jeu vérifiées en navigateur) pour un gain faible
Aucun test supprimé | contrainte | aucune assertion retirée ; garde-fous intacts ; chaque changement listé « avant / après » avec ses assertions (compter.mjs)
