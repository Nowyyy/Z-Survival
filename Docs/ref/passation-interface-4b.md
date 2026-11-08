# Passation : intégrer l'interface retenue dans le jeu (lot 4b, rework de l'interface)

Ce fichier suffit pour reprendre le travail sans relire la conversation du lot 3k. Il décrit **l'interface que le propriétaire a retenue**, écran par écran, avec les valeurs exactes, les fichiers sources à porter, les textes à ajouter, les tests à adapter et la façon de fusionner la branche. Le lot 3k n'a **rien** intégré au jeu : tout vit dans des pages techniques.

## 1. Où regarder
- Branche `lot-3k` (dernier commit utile : `a5e4adb`, poussé ; `origin/main` de départ : `c166e53`, lot 4 fusionné).
- **Maquette de référence** : `interface-retenue.html` (aperçu de la branche : `https://nowyyy.github.io/Z-Survival/lots/lot-3k/interface-retenue.html`). Elle ne montre que les choix, sur le vrai jeu en fond, écran par écran ou « Tous les écrans d'un coup », aux 7 tailles. Ajouter `?test=1` expose `window.__zsUi` (`set`, `measure`, `rows`, `stability`).
- Atelier complet (toutes les directions, mesures, côte à côte) : `atelier-interface.html`. Mesures de l'interface d'avant : `Docs/ref/interface-actuelle.md`. Plan d'intégration détaillé : `Docs/ref/integration-interface.md`. Manifeste de fusion : `Docs/ref/fusion-3k.md`. Méthode de l'atelier : `Docs/ref/atelier-interface.md`. Bilan : `Docs/lots/versions/v0.5.md#lot-3k`.
- Attention (publication) : un déploiement de `main` a une fois « réussi » sans être servi par GitHub Pages ; si la page publiée paraît ancienne, relancer le workflow `pages.yml` sur `main` et recharger sans cache (les fichiers sont gardés 10 min).

## 2. Décisions du propriétaire (état final, dans l'ordre)
1. **Choix des directions** : HUD **B** « caméscope » ; pause **B** ; fin « mort » **B** ; fin « monde terminé » **B** ; à terre **B** sans cadre blanc ; sticks **A** « sobre » (sous le HUD B) ; menu : plus tard. Boutique, réglages, classement, propositions de priorité 2 : non choisis (rester dans l'atelier). Macros non précisées : celles par défaut de B (texte M, densité compacte, fond léger, contour aucun, argent **sous la vague**).
2. **HUD B, 1re retouche** : vie **sans barre** (garder « VIE » et « 100/100 ») ; « VAGUE » et « RESTANTS » **en entier** (plus « VAG », « RST ») ; zone d'étage (« RDC », « Étage ») de **largeur fixe** ; colonne des tués prévue pour **4 chiffres** (au-delà de 999).
3. **HUD B, 2e retouche** : **« RESTANTS » et l'argent échangés** (restants en haut à droite au-dessus des tués, argent sous la vague) ; **REC, VIE et la ligne chutes + étage s'arrêtent au même bord droit**, celui de REC (le plus long) ; les deux lignes de droite tiennent dans la **hauteur du bouton Pause**.
4. **3e retouche** : tués **sans zéros devant** (57 et non 0057) ; écrans de fin : **« Voir ma sauvegarde » retiré**, remplacé par **« Revenir au menu principal »**, bouton **sans action pour l'instant** ; à terre : texte **sous l'argent**, plus au milieu de l'écran.
5. Conséquence de 4 (décision de l'agent, à confirmer) : « Mode essai » passe dans la colonne de gauche sous chutes + étage (sinon, à terre, il descendait dans la zone des pouces à 812 et 844 px).

## 3. Spécification finale, écran par écran
Base commune : police de base du HUD **15,75 px** (14 px × 1,125, macro M), gras, chiffres tabulaires ; chaque bloc a une **taille fixe en em** (rien ne bouge quand une valeur change) ; fond des blocs `color-mix(in srgb, var(--hud-bg) 78 %, transparent)` (`--hud-bg-alpha`) ; pas de contour de texte ; marges : **16 px + zone de sécurité** (voir § 6, point ouvert) ; ni `filter`, ni `mix-blend-mode`, ni `backdrop-filter`. Libellés en **Rubik Dirt** majuscules (`--font-label`, `--color-action-text`), valeurs en Barlow (`--color-text`), argent en `--color-money`.

### HUD (E2-2) et Pause (E2-5), direction B
| Colonne | Contenu, de haut en bas | Largeur | Notes |
|---|---|---|---|
| Gauche (`left` = marge, retrait intérieur 0,35 em ; largeur 8,8 em + 0,35 em) | 1. **REC** : point rouge 0,7 em qui clignote 1 fois/s (`steps(1)`, opacité 1 → 0,25 ; **fixe** sous `prefers-reduced-motion`) + « REC » + chrono `mm:ss` ou `h:mm:ss` (temps de jeu) | 8,8 em | le plus long : sert de référence |
| | 2. **VIE** : « VIE » + « 64/100 » (valeur alignée à droite sur 3,9 em), **aucune barre** | 8,8 em | `role="progressbar"`, `aria-valuenow`, `aria-valuemax` gardés |
| | 3. **Chutes** (silhouette + nombre, 3 em) et **étage** (icône d'escalier + « RDC » ou « Étage », largeur `8,8 em − 3 em − espace`) sur une ligne | total 8,8 em | même bord droit que REC et VIE |
| | 4. **« MODE ESSAI »** (Rubik Dirt, `--color-warning`), seulement en mode essai | 8,8 em | |
| Centre (centré) | 1. **« VAGUE 07 / 40 »** (numéro sur 2 chiffres, `ui3k.hud.waveOf`) et, en dessous, « RENFORCÉE » aux vagues renforcées (place réservée sinon) | 8,6 em × 2,6 em | |
| | 2. **Argent** (pièce + montant court `formatMoneyCompact` : « 1 234 », « 12,3 k », « 9,9 M »), centré | 8,6 em × 1,6 em | |
| | 3. **À terre** (seulement à terre, voir plus bas) | 19 em | |
| Droite (à gauche de Pause, alignée sur le haut de Pause) | 1. **« RESTANTS 05 »** (valeur sur 2 chiffres) | 8,6 em | hauteur de ligne = (Pause − espace) / 2 |
| | 2. **« TUÉS 57 »** (sans zéros, place pour 4 chiffres) | 8,6 em | idem |
| Pause | icône pause, carrée, angles droits ; taille `max(44 px, 2 × 1,3 em + espace)` ≈ 45 px à 15,75 px | | haut et droite décalés de 0,35 em comme les colonnes |
| Décor | deux équerres blanches de 1,8 em (2 px) aux coins haut gauche et haut droit (pas en bas : zone des pouces) | | décoratives, `aria-hidden` |

Mesures à 844×390 (îlot 47/21) : REC, VIE et étage finissent tous à x = 207 ; restants 591–727 × 22–42, tués 591–727 × 46–66, Pause 731–776 × 21–66 ; argent 354–490 × 61–86. Part de l'écran (HUD + Pause) : 10,1 % à 667×375, 1,9 % à 1440×900.

### Pause (E2-6), direction B
Voile `--color-overlay` sur tout l'écran ; panneau `--color-surface`, **cadre 2 px `--color-text`, angles droits** ; titre « PAUSE » en Rubik Dirt majuscules (`--color-action-text`) ; lignes : solde (pièce + « Solde : … »), état de la sauvegarde (`game.save.status.*`, atténué), « Prochaine zone : manche N » ; boutons (44 px, angles droits) : Reprendre (rouge plein), Plein écran, Son, Effet VHS, Recommencer, puis curseur de volume sur toute la largeur. Écran bas (≤ 520 px de haut) : boutons sur **3 colonnes**, faits sur 2 colonnes ; volume en dernier. Ids du jeu à garder : `#btn-resume`, `#btn-fullscreen`, `#btn-sound`, `#btn-vhs`, `#btn-restart`, `#volume-row` (à placer **après** `#btn-restart`).

### Fins (E2-7), direction B
Même panneau que la pause ; titre avec icône : crâne + « TU ES MORT » ou coche + « MONDE TERMINÉ » ; lignes : vague atteinte, zombies tués, argent gagné (pièce), bonus de fin de monde (monde terminé seulement), solde, meilleure manche, « Nouveau record » (étoile, `--color-money`), mention du mode essai. Boutons : **« Rejouer »** (rouge plein, `#btn-replay`) et **« Revenir au menu principal »** (bouton calme, **sans action** pour l'instant : le menu viendra plus tard) ; le lien `#end-save-link` « Voir ma sauvegarde » est **retiré** de l'écran de fin (la page `sauvegarde.html` reste accessible autrement, à décider). Écran bas : faits sur 2 colonnes, 2 boutons côte à côte.

### À terre (E2-10), direction B
Voile radial `--game-down-veil` sur les bords (inchangé, plein écran, sans filtre) ; **le texte n'est plus au milieu** : il est **dans la colonne centrale du HUD, juste sous l'argent**, sur un fond `--game-down-panel`, **sans cadre blanc**, angles droits : « À TERRE » (Rubik Dirt) + « Tu te relèves dans N s » sur une ligne, puis une barre de compte à rebours (remplissage rouge = secondes restantes / 5) ; en protection : bouclier + « Protégé N s » (barre sur 2 s). Largeur 19 em (bornée à l'écran). Il reste au-dessus de la moitié de l'écran (zone des pouces libre) à toutes les tailles.

### Sticks (E2-3, E2-4), direction A
Place du jeu (16 % et 84 % de la largeur, 68 % de la hauteur), base 112 px : **anneau fin 2 px** `--color-border` sur fond `color-mix(--color-bg 35 %)` ; pastille **ronde 44 px**, cerclée `--color-text`, `--color-action` à gauche, `--color-surface-raised` à droite ; stick au repos à 50 % d'opacité. Les règles de sticks de B ne doivent pas s'appliquer (dans l'atelier : sélecteur `.ui3k-dir-b > .p-stick`).

### Inchangé
Annonce de vague E2-8 (animation et mélodie jugées bonnes) ; effet VHS ; E2-9 et E2-11 ne reviennent pas (ni flèches vers les fenêtres, ni ligne « Fenêtres », ni indicateur de réparation).

## 4. Fichiers sources à porter (atelier → jeu)
- **Rendu** : `js/atelier-interface/render.js` (`renderHud` avec `dir === 'B'`, `renderPause`, `renderEnd`, `renderDownBody` en mode `inline`, `renderSticks('A')`) donne la structure HTML exacte ; dans le jeu, l'écrire **une fois** dans `jeu.html` et ne mettre à jour que les textes dans `js/game/hud.js` (comme aujourd'hui : écriture seulement quand la valeur change).
- **CSS** : base commune = section « Base commune des propositions » de `css/atelier-interface.css` (classes `p-*`), plus `css/proto-b.css` (HUD, panneaux, à terre) et les règles de sticks de `css/proto-a.css`. À porter dans `css/game.css` en renommant `p-*` en `hud-*` et en retirant les préfixes `.ui3k-dir-b` / `.ui3k-dir-a`. Remplacer les variables de l'atelier : `--ui3k-safe-*` → `--safe-*` ; `--ui3k-edge-*` → marges du jeu ; `--ui3k-fs` → `calc(14px * 1.125)` (ou un jeton `--hud-text-scale`) ; `--ui3k-gap` → 4 px ; `--ui3k-alpha` → `--hud-bg-alpha` ; `--ui3k-o` → 0 ; unités `cq*` et `@container ui3k (max-height: 520px)` → `@media (max-height: 520px)`.
- **Jetons** : aucune couleur nouvelle. Jetons de réglage conseillés dans `tokens.css` : `--hud-text-scale: 1.125`, `--hud-gap: 4px` (existe), `--hud-pause-size`.
- **Textes à ajouter à `fr.json`** (renommer `ui3k.` en `game.` ; valeurs exactes) : `hud.lifeShort` « Vie », `hud.waveShort` « Vague », `hud.remainingShort` « Restants », `hud.killsShort` « Tués », `hud.rec` « Rec », `hud.waveOf` « {n} / {max} », `hud.reinforced` « Renforcée », `hud.trial` « Mode essai », `end.menu` « Revenir au menu principal ». Les clés `game.*` existantes servent telles quelles (`game.hud.life`, `game.down.*`, `game.end.*`, `game.pause.*`, `game.save.status.*`, `game.wave.reached`…). `game.end.saveLink` devient inutile sur l'écran de fin.

## 5. Données du jeu → éléments
`player.health` / `maxHealth` → « 64/100 » ; `down.chutes` → chutes ; étage du joueur → « RDC »/« Étage » ; `waves.wave` + `wavesPerWorld` → « VAGUE 07 / 40 » ; `waves.reinforced` → « RENFORCÉE » ; `bank.balance()` → argent (`formatMoneyCompact`, `aria-label` avec `formatMoney`) ; `waves.remaining` → « RESTANTS 05 » (pendant l'attente : décider quoi afficher, aujourd'hui « Début dans N s ») ; `kills` → « TUÉS 57 » ; **temps de jeu** (`sim.time`, jamais l'horloge réelle, figé en pause) → chrono REC ; `save.readOnly` → « MODE ESSAI ». « +N » de gain d'argent (lot 4) : à replacer (sous l'argent, dans la colonne centrale, sans décaler les blocs ; non maquetté).

## 6. Points ouverts à trancher avec le propriétaire
1. **Marges** : la maquette applique « 16 px **plus** la zone de sécurité » (règle du lot 3k) ; le lot 4 avait choisi `max(16 px, zone − 28 px)` à la demande du propriétaire (« plus près des bords »). Lui demander laquelle garder.
2. **« Revenir au menu principal »** : sans action ; le menu (E1) viendra plus tard. Où mettre l'accès à `sauvegarde.html` maintenant que le lien quitte l'écran de fin ?
3. **Compte à rebours de début de vague** (aujourd'hui dans `#hud-next`) : non maquetté en B ; proposer « RESTANTS » remplacé par « DÉBUT 3 s » dans la même boîte (taille fixe).
4. Place de « MODE ESSAI » (gauche) : choisie par l'agent, à confirmer.
5. **Lighthouse** `jeu.html` : marge nulle sur `main` (45) ; B ajoute une animation (point REC, `opacity`) et environ 20 éléments de DOM : mesurer avant de livrer.

## 7. Tests
- **À adapter** (sélecteurs, tailles, textes) : `jeu-interface.spec.js` (HUD ≤ 300 × 96, ordre des blocs, police de la vague, marges `.hud-left`), `argent.spec.js` (largeurs fixes `#hud` 12,5 rem, `#hud-money` 5,5 rem, `#hud-wave` 9 rem, E2-7 et `#end-save-link`), `etage.spec.js`, `etage-salle.spec.js`, `jeu-zones.spec.js` (HUD 96 × 300, « Étage »), `jeu-vagues.spec.js`, `data-vagues.test.js` (`#hud-wave`, « Vague N »), `jeu-chutes.spec.js` (`#down`, position du texte), `jeu-pause.spec.js`, `data-hud.test.js` (section CSS du HUD, tailles de police, fond sur `.hud`), `jeu-combat.spec.js`, `jeu-rendu.spec.js` (sticks). Liste complète par écran : `node scripts/interface/projection.mjs '<choix>'` (§ 9).
- **À reprendre sur `jeu.html`** : les contrôles de `tests/e2e/interface-retenue.spec.js` et `interface-atelier.spec.js` (aucun chevauchement, rien dans la zone sûre ni dans la zone des pouces hors écrans modaux, texte ≥ 14 px, cibles ≥ 44 px, contraste ≥ 4,5:1 sur le pire fond, **0 px de déplacement** quand vie, argent, vague, chutes, restants, tués, chrono, étage, « renforcée » changent, REC ≤ 2 clignotements/s et fixe en mouvement réduit). Calculs réutilisables : `js/core/ui-measure.js` et `js/atelier-interface/measure-dom.js`.
- Les tests e2e de l'atelier ne tournent qu'avec `E2E_FULL=1` (liste rapide de `playwright.config.js` non modifiée au lot 3k).

## 8. Fusion de la branche (rappel de `Docs/ref/fusion-3k.md`)
Fusionner `lot-3k` dans la branche d'intégration du lot 4b (jamais directement dans `main`). Fichiers partagés modifiés par le lot 3k (conflits attendus, garder les deux versions) : `apercu.txt` (**reprendre la première ligne de `main`**), `scripts/build.mjs` (ligne `ENTRIES.push('atelier-interface.html', 'interface-retenue.html')`), `tests/unit/lot1-regles.test.js` (deux lignes `push`), `data/changelog.json` (entrée `lot-3k`), `tests/unit/data-changelog.test.js` et `tests/e2e/dev.spec.js` (dernier lot). `lot-3g` et `lot-3h` créent tous deux `tests/unit/atelier-hygiene.test.js` : à renommer. Après l'intégration, retirer les garde-fous de branche : groupe « le jeu n'est pas modifié » de `tests/unit/interface-atelier-hygiene.test.js` et test `apercu.txt` de `tests/unit/interface-atelier-protos.test.js`.

## 9. Choix au format « Mes choix » (pour `projection.mjs`)
```
ecran=hud;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=pause;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=fin-mort;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=fin-monde;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=a-terre;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun
ecran=sticks;direction=A;argent=haut-droite;texte=M;densite=compacte;fond=transparent;contour=fin
```
Les retouches des § 2 et 3 sont déjà dans `css/proto-b.css` et `js/atelier-interface/render.js` : `projection.mjs` en tient compte. Choix par écran en données : `data/game/ui-atelier.json`, clé `retenue`.

## 10. Liste de contrôle de fin du lot 4b
- [ ] Les six écrans du jeu correspondent à `interface-retenue.html` (comparer côte à côte aux 7 tailles, états combat, pire cas, à terre).
- [ ] Mesures sur `jeu.html` : 0 hors cible, 0 px de déplacement, CLS ≤ 0,1, Lighthouse ≥ 45 / 95 / 95.
- [ ] Textes dans `fr.json`, aucune couleur en dur, E2-8 intacte, E2-9 et E2-11 absents.
- [ ] Points ouverts du § 6 tranchés avec le propriétaire et notés dans le bilan du lot 4b.
- [ ] Esthétique, confort au pouce et rendu sur iPhone : à faire valider par le propriétaire (non jugés par l'agent).
