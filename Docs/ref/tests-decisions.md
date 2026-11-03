STATUT: VALIDE
## Catégories
D: APPROUVE   (les tests de règles ne tournent plus que sur le projet bureau ; les tests G et P restent en mobile)
R: APPROUVE   (retirer les doublons e2e dont le test unitaire équivalent est identifié dans l'annexe de tests-audit.md ; exception : conserver au plus un fichier e2e d'intégration par zone)
F: APPROUVE   (retrait des détails non critiques)
T: APPROUVE   (retrait des tests propres aux pages techniques, sauf le chargement et l'axe tant que la page est publiée)
L: APPROUVE   (retrait des tests propres à l'ancien code ; le code reste ; liste du code sans test dans le bilan)
V: APPROUVE   (corriger les tolérances, aucun retrait)
I: APPROUVE   (étiqueter @instable)
E: APPROUVE   (corriger si la cause est dans le test ; si la cause est dans le jeu : quarantaine avec la raison, défaut listé dans le bilan, jeu non modifié)
Regroupements: G et P : regrouper les tests Playwright d'un même fichier qui chargent la même page avec la même configuration en un seul scénario (test.step), sans perdre aucune assertion (comptées avant et après) ; objectif : diviser par deux le nombre de chargements du jeu, en commençant par les fichiers les plus longs.
## Exceptions par fichier
(aucune)
## Objectifs de durée (minutes)
avant commit : 2
à chaque push : 8
complet en CI : 10 (16 tranches au plus)
