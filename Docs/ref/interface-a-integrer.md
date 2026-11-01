# Interface à intégrer (source des choix du lot 3l)

Copie, au format « Mes choix » de l'atelier, des choix du propriétaire décrits dans `Docs/ref/passation-interface-4b.md` (branche `lot-3k`, § 2, 3 et 9), qui reste la référence détaillée. Le bloc « Mes choix » du prompt du lot 3l était vide (`<à compléter>`) ; le propriétaire a indiqué ce fichier de passation comme source.

```
ecran=hud;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=pause;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=fin-mort;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=fin-monde;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=a-terre;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=sticks;direction=A;argent=haut-droite;texte=M;densite=compacte;fond=transparent;contour=fin
priorite2=aucune
retours: (1) vie sans barre (« VIE » et « 100/100 ») ; « VAGUE » et « RESTANTS » en entier ; étage de largeur fixe ; tués prévus pour 4 chiffres.
retours: (2) restants en haut à droite au-dessus des tués, argent sous la vague ; REC, VIE et chutes + étage alignés au bord droit de REC ; les deux lignes de droite dans la hauteur de Pause.
retours: (3) tués sans zéros devant ; fins : « Voir ma sauvegarde » retiré, « Revenir au menu principal » (sans action pour l'instant) ; à terre : texte sous l'argent.
retours: (4) « Mode essai » dans la colonne de gauche sous chutes + étage (décision de l'agent du lot 3k, à confirmer).
```

Écrans sans choix (conservés, non intégrés) : menu (« plus tard »), boutique, réglages, classement. Priorité 2 : aucune proposition retenue (« non choisis, rester dans l'atelier »).
Points ouverts de la passation (§ 6) et ce que le lot 3l en a fait : voir `Docs/ref/interface-integree.md` et `Docs/lots/lot-3l.md`.

Décisions du propriétaire pendant le lot 3l (points ouverts du § 6 de la passation) : **marges de la maquette du lot 3k** (16 px plus la zone de sécurité de chaque côté, au lieu de max(16 px, zone − 28 px) du lot 4) ; le reste des propositions de l'agent est accepté : « DÉBUT 3 s » dans la boîte des restants, « +N » à gauche de l'argent, « Mode essai » à gauche, lien vers `sauvegarde.html` retiré de l'écran de fin sans autre accès pour l'instant.
