# Sauvegarde v2, deux monnaies, menu gardé (lot 8h, V0.8)

État : **plan (partie A)**, écrit avant tout changement de code, sur la base `origin/dev` `ed0aa8d` (branche `lot-8h`). Rien n'est codé avant le « GO 8h » du propriétaire ; ses réponses iront dans « Décisions au GO » et primeront sur ce plan. Les noms de branches, de fichiers, de clés et le contenu des anciennes versions sont des données.

## 0. Réponses du propriétaire (2026-11-14, avant le GO) — elles priment sur la suite du plan
| Question | Réponse | Effet sur le plan |
|---|---|---|
| 1. Niveaux de base | « c'est quoi ? » (expliqué : les 9 niveaux de `stats` de `zs.save.v1`, 0 à 10, qu'aucun écran n'achète) | gardés dans le format (`niveaux`), **tous à 0 au départ** (confirmé le 2026-11-14) ; un futur lot d'équilibrage donnera à chaque personnage ses statistiques de base, améliorées ensuite par l'équipement (« Idées ») |
| 2. Achats avec l'argent | la jaune : à ajouter dans un prochain lot | aucun achat en jaune dans ce lot (déjà prévu : lot 6) |
| 3. Suivi de la V0.7 | « on peut repartir de 0 » | **confirmé** (2026-11-14) : tout le monde repart de zéro dans la V0.8 ; `zs.save.v1` n'est **ni lue ni écrite** par la V0.8 (ni migration ni suivi) ; niveaux et records à 0 |
| 4. Import `ZS1` | remplacer | un code `ZS1` **remplace** la progression v2 (niveaux et record du code, 0 bleu, inventaire vide), après aperçu et case à cocher |
| 5. Son dans `zs.device.v1` | la V0.7 reste pour l'historique, peu importe ce qui n'y marche plus | `{ v: 2, …, son }` gardé (le plus simple ; la V0.7 démarre toujours) ; le test de compatibilité V0.7 → V0.8 → V0.7 est gardé, réduit à « démarre, garde sa propre progression, joue » |
| 6. Plafond de l'inventaire | 100 dans un premier temps | `inventaireMax` 100 (`data/menu/objets.json`) ; caisse refusée « Inventaire plein » ; ×10 exige 10 places ; pire cas environ 8 Ko |
| 7. Second bonus | à partir de la couleur violette | second bonus **dès l'épique** (violet, `--rarete-epique`) et au légendaire seulement |
| 8. Statistiques | « c'est quoi ? » | **« chutes » retirée de l'équipement tout court** (confirmé) : aucun objet ne la donne, elle n'est plus affichée ; elle sera une compétence d'un personnage ou de certains objets légendaires (lot à venir, « Idées ») ; la règle du jeu ne change pas (`player-stats.json` intact) ; affichées partout : vie, vitesse, réparation, régénération |
| 9. Outils de débogage | une petite icône à côté du menu à trois barres et du bouton plein écran | icône « Débogage » dans l'en-tête du menu (44 px, canaux `source` et `dev` seulement), qui ouvre les quatre outils |
| 10. `jeu.html` | modifs permises (ou prochain lot si pas important pour la sauvegarde) | `jeu.html` modifié **dans ce lot**, seulement pour le « +N » bleu du HUD et les lignes de la fin de partie E2-7 (affichage des monnaies) |
| 11. Décor armé | faire varier l'équipement : prochain lot | silhouette et ouverture 3D inchangées ; équipement visible sur le personnage → « Idées » |
| 12. Record infini | meilleure manche par carte | `records.infini.<carte>` |

## Décisions au GO (2026-11-14)
« Go 8h » reçu le 2026-11-14 : le plan de la section 0 et de la suite est validé tel quel, avec les réponses du propriétaire de la section 0 (elles priment). Aucune réponse nouvelle au GO.
- Écart d'ordre (partie B) : le test Playwright de deux onglets réels de la V0.8 vient avec la partie C, car seule la partie (la page de jeu) ouvre le canal entre onglets et elle n'écrit la v2 qu'à partir de la partie C ; la partie B le prouve par le simulateur (vrai dépôt, 10 000 suites).

## 1. Relevé

### 1.1 Stockage actuel (`origin/dev` = code de la V0.7 pour tout `js/save/` et `js/core/save.js`, aucune différence)
| Clé | Contenu | Qui écrit, quand | Qui lit |
|---|---|---|---|
| `zs.save.v1` | `{ v: 1, rev, savedAt, money, earned, stats{9 niveaux}, records{bestWave, bestKills, runs, worldsCompleted} }` (+ `w` quand plusieurs onglets) ; plafond 16 384 octets (`data/game/save.json`) ; environ 230 octets après une partie | la partie seulement (`js/game/bank.js` → `repository.commit(delta)`) : fin de manche (immédiat), regroupé toutes les 2 s de jeu, pause, page cachée ou fermée, fin de partie, Rejouer ; import d'un code (Profil, `sauvegarde.html`) ; « Repartir de zéro » / « Tout effacer » (`removeItem` de cette seule clé) | partie, menu (`preparerMenu` : solde, record, niveaux), Profil, `sauvegarde.html` |
| `zs.device.v1` | `{ v: 2, graphics, custom }` (schéma 1 `{ v: 1, graphics }` lu et migré) | Options (partie et menu), à chaque choix ; aussi en mode essai ; jamais sous `?test=1` sans `store=local` | `graphics-boot.js` |
| `mobile-games.lang` | langue de l'accueil | `js/page.js` | accueil |

- **Lecture** (`js/core/save.js` `sanitize`) : **liste blanche** ; une clé inconnue (racine, `stats`, `records`) donne un avertissement et **n'est pas recopiée** ; valeur hors bornes ramenée dans les bornes ; plus de 16 384 octets, JSON invalide ou racine non objet : `corrupt` ; `v` > 1 : `future` ; les deux sont **verrouillées** (rien n'est écrit, texte brut gardé pour `sauvegarde.html`).
- **Écriture** : `commit` relit la clé juste avant d'écrire puis écrit `commitDelta(valeur nettoyée)` : **tout champ inconnu est perdu à la première écriture**.
- **`save-merge.js` (lot 5o)** : chaque écriture d'un onglet du jeu est annoncée sur le canal `BroadcastChannel('zs.save.v1')` par un relevé `{ by, base, value }` ; chaque onglet numérote ses gains écrits et réécrit ceux qui manquent **certainement** à la valeur stockée (chaîne des relevés) ; `newerBase` bâtit sur une écriture annoncée plus récente. Simulateur `tests/unit/helpers/onglets-simulateur.js` (modèle du cache de Chromium) ; le lot 5o y a montré que le verrou du navigateur (Web Locks) **perd encore des gains** (copie locale périmée).
- **`sauvegarde.html`** : lit et écrit `zs.save.v1` seulement (export et import `ZS1`, verrouillée : texte brut, import, « Repartir de zéro » ; « Tout effacer »).
- **Menu (lots 8a à 8i)** : n'écrit **rien** dans le stockage (sauf `zs.device.v1` par ses Options) ; inventaire, équipement, personnages, tenues, offres achetées, nouveautés lues, avatar, pseudo, son et volumes vivent en mémoire de la page (`equipement-etat.js`, `boutique.js`, `menu-etat.js`, `avatar.js`, `demarrage.js`) et sont perdus au rechargement. Mesuré : stockage après une partie puis une visite du menu, **identique** octet pour octet.

### 1.2 Anciennes versions (V0.5, V0.6 sur `archive` ; V0.7 sur `main`) : lecture du code
- `js/core/save.js` : V0.5 et V0.6 = V0.7 moins 7 lignes (relevés du lot 5o) ; **même `sanitize`, même liste blanche, même plafond 16 384, même clé, même préfixe `ZS1`**. `local-repository.js` : V0.5 et V0.6 sans le suivi entre onglets.
- `zs.device.v1` : V0.5 ne la connaît pas ; V0.6 ne lit que le schéma 1 (`v: 2` → `future`, verrouillée : déjà le cas depuis la V0.7) ; V0.7 lit et réécrit `{ v: 2, graphics, custom }` **sans les champs inconnus**.
- Aucune version n'appelle `localStorage.clear()` ; seules `removeItem('zs.save.v1')` (effacement voulu) et `setItem` de leurs propres clés existent.

### 1.3 Essais réels (Playwright, même origine)
Site assemblé comme en ligne (`scripts/site/local.mjs --main origin/main --dev origin/dev --archive origin/archive`), servi sous `/Z-Survival/` : `v0.5/`, `v0.6/`, `Recette/` (V0.7), `dev/` (V0.8 actuelle). Chaque version joue réellement (`jeu.html?test=1&store=local&seed=1` : vrai `localStorage`, 50 d'argent, une manche terminée, écriture) ; préférence d'appareil écrite par le module de la version elle-même ; « Repartir de zéro » par le dépôt de la version. Scripts hors dépôt (dossier temporaire de la session).

| Essai | V0.5 | V0.6 | V0.7 (Recette) | V0.8 actuelle (dev) |
|---|---|---|---|---|
| E1 : champs inconnus dans `zs.save.v1` (racine, `stats`, `records`), puis jeu | **perdus** à la 1re écriture (argent 123 → 185 juste) | **perdus** | **perdus** | **perdus** |
| E2 : `zs.save.v1` grossi à 20 254 octets par un champ nouveau | **verrouillée** : jeu jouable, rien écrit (« locked ») | idem | idem | idem |
| E3 : nouvelle clé `zs.save.v2` (6 Ko) à côté, jeu + écriture | intacte octet pour octet ; `zs.save.v1` écrite juste | intacte | intacte | intacte |
| E3 : « Repartir de zéro » de la version | efface `zs.save.v1` seule, `zs.save.v2` intacte | idem | idem | idem |
| E3 : `zs.device.v1` `{ v: 2, …, son }`, choix d'un préréglage | (pas de préférence) intacte | `future`, refus d'écrire, intacte | réécrite **sans `son`** | réécrite sans `son` |
| E4 : la version écrit, puis le menu de la V0.8 lit | solde 185 lu, rien réécrit | idem | idem | — |

**Conclusion** : l'option (b) (champs ajoutés dans `zs.save.v1`) est **impossible** : toutes les versions publiées perdent les champs inconnus en réécrivant (E1), et une progression qui dépasse 16 384 octets **verrouille** la V0.7 (E2 : elle ne garderait plus rien). L'option (a) (nouvelle clé) est **sans effet** sur toutes les versions publiées (E3).

### 1.4 Argent : gains et dépenses
- **Gains** (`js/core/economy.js`, `bank.js`, `game.js`) : zombie tué par balle 10 (`kill`, game.js:609) ; planche posée 1 (`repair`, :650) ; fin de manche `round((10 + 2 × manche) × (renforcée ? 1,5 : 1))` (`waveEnd`, :717, une fois par manche) ; fin de monde 500 (`worldEnd`, :807, une fois par partie) ; essai `giveMoney` (tests). Rien d'autre.
- **Dépenses** : **aucune, nulle part**. Ni en partie, ni entre deux parties, ni dans le menu : les prix (caisses, offres, amélioration d'objet, fusion, amélioration de personnage) sont affichés sans comparaison au solde ni prélèvement.
- **Niveaux de base** (`save.stats`, 9 clés) : **aucun écran, aucun prix, aucun achat** ; ils ne changent que par l'import d'un code, `?lvl=` (lecture seule) et `__zs.setLevels` (tests). `player-stats.json` le dit : « le prix des niveaux viendra avec la boutique ». Avec une jaune remise à 0, rien ne change donc pour eux (réponses 1 et 3 : repartent de 0).
- **Affichages** : HUD `#hud-money-text` (solde = `saved.money` + en attente) et `#hud-gain` (« +N » agrégé 1,2 s) ; pause « Solde » ; fin E2-7 (`ui.showEnd`) : tués, manche, « Argent gagné », bonus du monde, « Solde », « Meilleure manche », étoile de record, état ; en-tête du menu : `save.money` lu une fois ; Profil « argent » = `earned`.
- **Défaut relevé** : en infini (option du menu), `runEnd` compare la manche au record de l'histoire : l'écran de fin peut annoncer un record qui n'est pas gardé. Corrigé par les records séparés (partie E).

### 1.5 Équipement (armes, emplacements)
- `objets.json` : 13 objets, types `arme` (pistolet : dégâts ; revolver : dégâts + portée ; couteau : vitesse + dégâts), `tenue` (gilet : vie ; blouson : vie + régén.), `gants` (gants : **cadence** ; mitaines : réparation + **cadence**), `bottes` (bottes : vitesse ; rangers : vitesse + chutes), `accessoire` (casquette : **précision** ; bague : régén. ; amulette : vie ; montre : réparation). Chaque objet a les 5 raretés (bonus 1 à 5, niveau max 5 à 25, amélioration 40 à 640).
- `equipement.js` : `TYPES` et `EMPLACEMENTS = ['arme','tenue','gants','bottes','accessoire1','accessoire2']` (deux accessoires codés en dur) ; uid `c<N>` (caisse) et `f<N>` (fusion), compteur `suivant` commun.
- Armes présentes : inventaire (filtre « arme »), caisses d'équipement (tout le catalogue), offres du jour (tout le catalogue), fusion (`compatibles`, `remplirAuto`), écran Personnage (emplacement `arme`, `STATS_AFFICHEES` = dégâts, vie, cadence, vitesse, portée, précision), `inventaire-depart.json` (pistolet porté, couteau légendaire), « Voir les chances », icônes des offres et des résultats. Décor sans lien avec le catalogue : silhouette armée de l'écran Personnage, fusil tenu pendant l'ouverture 3D (réponse 11 : inchangés ; équipement visible au prochain lot).
- Clés de statistiques (`player-stats.json`, lecture seule) : attaque `degats`, `portee`, `precision`, `cadence` ; survie `vie`, `vitesse`, `regen`, `chutes` (max 5), `reparation` (max 10).
- Tirage : `caisses.js` (mulberry32 de `rng.js`, graine `crypto` par achat) ; offres du jour : graine du numéro de jour local. Retirer les armes **change les offres de chaque jour** (catalogue différent) mais le tirage reste identique à graine et catalogue égaux.

### 1.6 Profil : où compter
- Zombies tués : `sim.kills` (game.js:607), transmis à `bank.runEnd({ kills })`. Parties : première manche de la partie (`bank.waveStart`, `meta.runs`), mode connu par `ctx.modePartie` (`histoire` | `infini`). Temps hors pauses : `bankMs` (game.js:526) n'avance que dans `step()`, jamais en pause, onglet caché, Options, écran tourné, mort ou monde fini. Monde terminé : `bank.worldEnd()`. Monde joué : **le jeu ne lit pas `optionPartie().monde`** (un seul monde jouable, `batiment`) : à transmettre dans `ctx` (2 lignes).
- Profil aujourd'hui (`profil-etat.js`) : `meilleureManche` et `argent` réels ; `tues`, `partiesHistoire`, `partiesInfini`, `temps` affichés « — » (`STATS_EN_ATTENTE`).

### 1.7 Références relevées sur `origin/dev` (avant tout changement)
- **Trace logique** (`trace-logique.mjs`, 6 × 600 pas) : empreintes finales 1 `7e5fed6a1bcf6457` (chaîne `42afea80daaa3bbe`), 2 `3cab05cf38810eb6` (`00b7b38f31552fb3`), 3 `4b78adcd92477b6f` (`e5af31ead2954076`), 4 `dde468cb9e7f2fe7` (`f87dc57dd273be87`), 5 `42056a4014538ada` (`dc4e72e69f078252`), 6 `8a17408c5401a78a` (`c9e42519963901cd`). **Seul champ d'argent dans l'empreinte : `economy`** (`earnedRun`, `killsRun`, `byKind.{kill,wave,world,repair,test}`, `gainText`) ; `save` (solde, en attente, écritures) n'y est pas. Aucune fin de manche dans les 6 scénarios (`byKind.wave` = 0). Les fichiers JSONL seront recalculés depuis `origin/dev` (copie `git worktree` jetable) si la session est perdue.
- **Appels, triangles, pixels** (`mesurer.mjs`, R1, R2, U1, U4 × élevé, moyen, faible) : voir 1.8.
- **Démarrage du menu** (`jeu.html`, 667 × 375, stockage vide) : 56 requêtes (34 `.js`, 9 `.json`), **0 externe** ; avec `?test=1&store=local&menu=1` : 53 (33 `.js`). Fichiers de la sauvegarde déjà chargés : `js/save/index.js`, `local-repository.js`, `memory-repository.js`, `readonly-repository.js`, `repository.js`, `js/core/save.js`, `data/game/save.json`, `economy.json`, `player-stats.json`.
- **Tests** : Vitest environ 3 490 (liste), Playwright essentiel 312 (bureau 266, mobile 46).
- **Coût d'une écriture** (Chromium, `JSON.stringify` + `setItem` + relecture) : 4 Ko : médiane < 0,1 ms ; 20 Ko : médiane 0,1 ms, maximum 1,3 ms (6,5 ms à froid). Bien sous 50 ms.

### 1.8 Mesures de rendu et Lighthouse (références)
`mesurer.mjs --passes 1 --frames 120` (rendu logiciel ; appels, triangles et pixels sont déterministes) — appels / triangles / pixels :
| | élevé | moyen | faible |
|---|---|---|---|
| R1 | 82 / 36 429 / 250 125 | 58 / 23 917 / 250 125 | 40 / 19 303 / 250 125 |
| R2 | 65 / 35 473 / 250 125 | 56 / 23 875 / 250 125 | 39 / 19 261 / 250 125 |
| U1 | 74 / 36 173 / 250 125 | 62 / 24 957 / 250 125 | 43 / 19 553 / 250 125 |
| U4 | 89 / 37 131 / 250 125 | 73 / 25 781 / 250 125 | 52 / 20 373 / 250 125 |

Lighthouse mobile (`npm run lighthouse`, 5 passes, médianes) : `index.html` performance **90** (90, 90, 90, 90, 90), accessibilité 100, bonnes pratiques 100, CLS 0,000 ; `jeu.html` performance **77** (77, 76, 76, 79, 78), accessibilité 100, bonnes pratiques 100, CLS 0,000 (au plus 0,001). Seuil du lot pour `jeu.html` : 72 au moins. **`index.html` est déjà au seuil (90)** : le seul jeton bleu de `tokens.css` devra être compensé en octets et mesuré (section 8, « Risques »).

## 2. Choix : option (a), nouvelle clé `zs.save.v2`
- La V0.8 lit et écrit **`zs.save.v2`** (nouvelle clé, `data/game/save.json` : bloc `v2` : `storageKey`, `maxStoredBytes` 65 536, `exportPrefix` `ZS2`) ; d'après la réponse 3, elle **ne lit ni n'écrit** `zs.save.v1` (seul un code `ZS1` importé est encore compris). La V0.7 et les archives continuent d'écrire `zs.save.v1` comme avant : leur progression est intacte et elles restent jouables (E3).
- **Pilier du seed qui change** : « une seule clé de progression `zs.save.v1` » devient « `zs.save.v1` (V0.7 et avant, ignorée par la V0.8) + `zs.save.v2` (V0.8, départ de zéro pour tous) ». À réécrire par le propriétaire (bilan).
- Leçon pour la suite : la V0.8 **garde les champs inconnus de la racine** de `zs.save.v2` en réécrivant (dans la limite du plafond) : une V0.9 qui ajoute un champ sans changer `v` ne le perdra pas si la V0.8 réécrit après elle.
- Canal entre onglets : `BroadcastChannel('zs.save.v2')` (celui de `zs.save.v1` reste aux anciennes versions).

## 3. Format v2
```jsonc
{
  "v": 2,                                   // version du format ; > 2 : refus (verrouillée, jamais écrasée)
  "rev": 41, "savedAt": 1794615532421,      // nombre d'écritures, date de la dernière (horloge murale, ms)
  "w": "9f2c41aa07e3b1d2c6f00a11.17",       // identifiant d'écriture (seulement quand plusieurs onglets, comme en v1)
  "bleu": { "gagne": 4210, "depense": 3150 }, // compteurs qui ne font que croître ; solde = gagne − depense, 0 à 9 999 999
  "objets": [ { "u": "7a1c09e2.0", "i": "casque-kevlar", "r": "rare", "n": 3 } ], // exemplaires : uid unique, id du catalogue, rareté, niveau
  "porte": { "tete": "7a1c09e2.0", "torse": null, "gants": null, "pantalon": null, "bottes": null, "accessoire": null },
  "persos": { "debloques": ["survivant"], "niveaux": { "survivant": 1 }, "choisi": "survivant" },
  "tenues": ["treillis-desert"],            // tenues obtenues (collection)
  "offres": { "jour": 20406, "achetees": ["20406-2"] }, // offres du jour achetées (jour local) ; un autre jour : liste vide
  "niveaux": { "degats": 0, "portee": 0, "precision": 0, "cadence": 0, "vitesse": 0, "vie": 0, "regen": 0, "chutes": 0, "reparation": 0 },
  "records": { "histoire": { "batiment": 17 }, "infini": { "batiment": 23 } }, // meilleure manche par monde et par mode
  "mondes": ["batiment"],                   // mondes terminés
  "profil": { "avatar": "anonyme", "pseudo": null, "tues": 1203, "partiesHistoire": 31, "partiesInfini": 4, "tempsMs": 7260000 },
  "lues": ["info-8g-1"],                    // nouveautés lues (au plus 200)
  "dates": { "porte": 1794615500000, "choisi": 1794615400000, "avatar": 0, "pseudo": 0 }, // dates des choix (onglets : le plus récent gagne)
  "journal": ["7a1c09e2", "p3f1.5"]         // 64 derniers identifiants d'opérations appliquées (idempotence entre onglets)
}
```
- **Bleu gagné total** = `bleu.gagne`. Jamais de jaune, d'onglet affiché, de carte choisie ni de partie en cours.
- **Taille** : typique (30 objets, 6 personnages) environ 2,5 Ko ; pire cas raisonnable (inventaire plein à 100 exemplaires, réponse 6) environ 8 Ko ; plafond 65 536 octets (au-delà : écriture refusée, message, rien n'est perdu de ce qui est déjà écrit).
- **Exemplaires** : uid = 8 chiffres hexadécimaux tirés par `crypto` à chaque achat ou fusion + rang dans l'achat (`7a1c09e2.0` … `.9`) : uniques entre onglets (un uid déjà présent est retiré au tirage) ; les anciens `c<N>` / `f<N>` disparaissent avec l'état en mémoire.

### Migration, refus, réparation
| Stockage trouvé | Résultat |
|---|---|
| vide | nouveau joueur : Survivant choisi, rien d'équipé, inventaire vide, 0 bleu ; **rien n'est écrit** tant que rien ne change |
| `zs.save.v1` seule (lisible, corrompue ou plus récente) | **nouveau joueur** (réponse 3) ; `zs.save.v1` jamais lue ni écrite, laissée telle quelle pour la V0.7 |
| `zs.save.v2` corrompue (JSON, racine, plus de 65 536 octets) | **verrouillée** : jouable (en mémoire), rien écrit, message ; `sauvegarde.html` montre le texte brut, l'import et « Repartir de zéro » |
| `zs.save.v2` `v` > 2 | **refus sans effacement** : verrouillée, message « sauvegarde d'une version plus récente » |
| stockage indisponible | partie et menu jouables en mémoire, rien écrit, message (comme aujourd'hui) |
| champ invalide (type, bornes, id inconnu du catalogue, uid en double, emplacement incompatible) | **réparé champ par champ** : valeur par défaut de ce seul champ (objet inconnu retiré de l'inventaire et de l'équipement), avertissement listé dans `sauvegarde.html`, corrigé à la prochaine écriture ; jamais d'effacement silencieux du reste |
| code `ZS2` importé | remplace la progression v2 (aperçu, case à cocher, comme `ZS1` aujourd'hui) |
| code `ZS1` importé | migré comme une v1 (niveaux, `bestWave` → record histoire du `batiment`, `runs` → parties histoire, monde terminé) ; **remplace** la progression v2 (réponse 4), après aperçu et case à cocher ; argent non converti |

### Moments d'écriture (et seulement eux)
- **Partie** (hors lecture seule, `?test=1` en mémoire) : manche terminée (bleu de la manche, tués, temps, record, partie comptée) **aussitôt** ; fin de monde ; fin de partie (mort, « Quitter », « Recommencer », « Rejouer ») ; pause, page cachée ou fermée (tués et temps seulement, s'ils ont changé). Plus d'écriture regroupée toutes les 2 s (la jaune n'est jamais écrite).
- **Menu** : chaque achat (caisse ×1 ou ×10, offre), amélioration, fusion, équiper ou retirer, choix du personnage, amélioration du personnage, avatar, pseudo, nouveautés lues (ouverture d'Information), import.
- **Options** (menu et pause) : `zs.device.v1` à chaque choix (graphismes comme avant ; son, volume du jeu et de la musique **à chaque changement** de valeur : réalisé ainsi en partie E, environ 70 octets par écriture, au lieu du « relâchement du curseur » prévu).
- Coût mesuré : voir 1.7 (≤ 1,3 ms à 20 Ko) ; garantie 9 vérifiée en partie C.

### Préférence d'appareil (`zs.device.v1`)
`{ v: 2, graphics, custom, son: { coupe: false, jeu: 100, musique: 100 } }` : **même `v: 2`** (réponse 5 : le plus simple). Limite prouvée (E3) et acceptée : un choix de graphismes **dans la V0.7** réécrit la clé sans `son` (son et volumes reviennent aux défauts dans la V0.8).

## 4. Plusieurs onglets : modèle
On garde le mécanisme prouvé du lot 5o (relevés `{ by, base, value }` sur le canal, réécriture des opérations **certainement** absentes, `newerBase`) et on remplace la « différence d'argent » par des **opérations** à identifiant unique :
| Opération | Effet | Rejouée sur une valeur plus récente |
|---|---|---|
| gain de manche `{ id: <partie>.<manche>, bleu, tues, tempsMs, record }` | `bleu.gagne` += (plafond du solde), compteurs du Profil +=, record au maximum | une fois : identifiant déjà au `journal` → ignorée |
| achat `{ id, prix, objets[], persos[], tenues[], offre? }` | `bleu.depense` += prix, ajouts | **revérifiée** : solde suffisant et offre pas déjà achetée, sinon **refusée** (rien ajouté, rien prélevé, l'onglet affiche « Achat annulé : la monnaie a été dépensée dans un autre onglet ») |
| amélioration `{ id, uid, de: n, prix }` / personnage | niveau n → n + 1, prix prélevé | refusée si l'exemplaire n'existe plus, n'est plus au niveau n ou si le solde manque |
| fusion `{ id, uids[3], nouveau, prix }` | trois retirés, un créé, prix prélevé | refusée si un des trois manque ou si le solde manque |
| choix (équipement, personnage choisi, avatar, pseudo) | registre daté | le plus récent gagne (égalité : plus petit identifiant d'onglet) |
| nouveautés lues | union | idempotente |
- **Relecture avant dépense** : chaque achat relit la clé (et la plus récente annoncée par le canal) juste avant d'écrire ; le bouton est grisé « Il manque N » si le solde relu ne suffit pas.
- **Invariants** (simulateur, 10 000 suites, 2 à 4 onglets, retards du stockage et du canal tirés à graine fixe) : solde final = Σ gains − Σ achats acceptés ; solde jamais négatif ; chaque gain présent exactement une fois (**0 perte, 0 double compte**) ; chaque achat accepté payé exactement une fois et son contenu présent une fois (**aucune double dépense**) ; registres convergents.
- **Limites** : (1) deux achats lancés dans deux onglets à quelques millisecondes d'intervalle avec un solde pour un seul : le second peut être **annulé après coup** (son ouverture a déjà été montrée) ; (2) navigateur sans `BroadcastChannel` (Safari avant 15.4) : comportement d'avant le lot 5o (la dernière écriture d'un onglet peut en effacer une autre ; les achats restent revérifiés à la relecture) ; (3) le `journal` retient 64 identifiants : au-delà, l'idempotence repose sur la chaîne des relevés (comme au lot 5o, 1 024 opérations par onglet).

## 5. Deux monnaies
- **Jaune** : journal de la banque (`kill` 10, `repair` 1, `test`) ; **remise à 0 à chaque partie** (début, Rejouer, Recommencer) ; jamais écrite ; HUD comme aujourd'hui ; aucun achat dans ce lot.
- **Bleue** : `waveBonus` et `worldBonus` (valeurs actuelles, `economy.json` : `bleu.manche`, `bleu.parManche`, `bleu.renforcee`, `bleu.monde`, `bleu.max`) vont dans la bleue, en histoire **et** en infini ; écrite à chaque manche terminée ; plafond 9 999 999 ; solde de départ 0 pour tous.
- **HUD** : jaune inchangée ; « +N » **bleu** discret (élément ajouté dans `jeu.html`, rempli par `hud.js`, icône bleue en code, jeton `--…-bleu`, `aria-live` poli) à chaque manche terminée qui rapporte ; mouvement réduit : sans animation.
- **E2-7** : « Monnaie jaune perdue : N », « Monnaie bleue gagnée : N », « Solde bleu : N » (lignes ajoutées dans `jeu.html` et remplies par `ui.js`, réponse 10) ; record du mode joué.
- **En-tête du menu** : solde bleu seul, icône bleue dessinée en code, nom accessible « Monnaie bleue : N » ; mis à jour après chaque achat et sur l'événement du stockage.
- **Mode essai, `?test=1`, `?endless=1`** : n'écrivent toujours rien (dépôt en lecture seule ou en mémoire, comme aujourd'hui).
- **Trace logique** : on garde la forme de `getState().economy` pour la jaune ; la bleue va sous `getState().save` (hors empreinte). Champs d'argent : `economy.earnedRun`, `economy.killsRun`, `economy.byKind.*`, `economy.gainText` ; `byKind.wave` et `byKind.world` passent à 0 (aucune fin de manche dans les 6 scénarios). Seconde empreinte calculée sans `economy` : identique exigée ; la première devrait l'être aussi.
- **`main.js` + `game.js`** : environ 30 lignes (dépôt v2, monde de la partie, appels de la banque pour la bleue et les statistiques, retrait de l'enveloppe infini du lot 8b) ; le reste dans `bank.js`, `economy.js`, `js/save/`.

## 6. Menu gardé
### Catalogue militaire proposé (`objets.json`, valeurs provisoires, même barème qu'au lot 8d, les 5 raretés chacun)
| id | nom | emplacement | statistique | 2e bonus (épique et légendaire) |
|---|---|---|---|---|
| `casque-kevlar` | Casque kevlar | tete | vie | — |
| `casque-commando` | Casque de commando | tete | vie | regen |
| `gilet-pare-balles` | Gilet pare-balles | torse | vie | — |
| `veste-combat` | Veste de combat | torse | vie | regen |
| `gants-tactiques` | Gants tactiques | gants | reparation | — |
| `gants-sapeur` | Gants de sapeur | gants | reparation | vie |
| `treillis` | Treillis | pantalon | regen | — |
| `pantalon-cargo` | Pantalon cargo renforcé | pantalon | regen | vitesse |
| `rangers` | Rangers | bottes | vitesse | — |
| `bottes-jungle` | Bottes de jungle | bottes | vitesse | vie |
| `ceinture-munitions` | Ceinture de munitions | accessoire | vie | — |
| `plaques-identite` | Plaques d'identité | accessoire | vie | — |
| `montre-campagne` | Montre de campagne | accessoire | regen | — |
| `trousse-secours` | Trousse de secours | accessoire | regen | vie |
| `boussole` | Boussole | accessoire | regen | — |
| `masque-gaz` | Masque à gaz | accessoire | vie | regen |
Bonus : principal 1 à 5 (+0,2 à +0,4 par niveau) ; secondaire **à l'épique et au légendaire seulement** (2, puis 2 ; +0,2 par niveau ; réponse 7) ; aucun `degats`, `cadence`, `portee`, `precision` ni `chutes` (test Vitest) ; accessoires : vie ou régénération. Caisses d'objets : mêmes chances, toutes les raretés tirables (16 objets × 5 raretés). Offres du jour sur ce catalogue.

### Écran Personnage
- `EMPLACEMENTS = ['tete','gants','bottes','torse','accessoire','pantalon']` : colonne gauche Tête, Gants, Bottes ; droite Torse, Accessoire, Pantalon ; icônes en code (casque, gants, rangers, gilet, plaques, pantalon). Filtres de l'inventaire : Tout + un par emplacement (7 boutons, défilement horizontal à 667 px).
- Statistiques affichées (toutes tailles) : vie, vitesse, réparation, régénération (chutes retirée de l'équipement) ; vérifié à 667 × 375, 932 × 430, ordinateur large, encoche (`safe-area`).
- Prix prélevés dans la même écriture que l'objet ; « Il manque N » (grisé, raison lue par les lecteurs d'écran) ; offre achetée : « Achetée ». Départ : nouveau joueur et joueur existant (section 3).

### Outils de débogage (écritures réelles, chacun avec confirmation)
« Ajouter 10 000 bleus », « Donner l'inventaire de démonstration » (`inventaire-depart.json` réécrit sans armes, seul usage restant), « Débloquer tous les personnages », « Remettre la progression V0.8 à zéro » (efface `zs.save.v2` et le champ `son` de `zs.device.v1`, jamais `zs.save.v1` : on repart en nouveau joueur). Place (réponse 9) : petite icône « Débogage » dans l'en-tête du menu, à côté du menu à trois barres et du bouton plein écran (44 px, nom accessible, focus visible), qui ouvre un panneau des quatre outils. **Visibles seulement sur les canaux `source` et `dev`** : le canal `release` (Recette) fait partie de `CANAUX_DEBUG` pour le menu de la pause ; il est exclu ici, comme l'archive.

## 7. Tests prévus
- **Vitest** : format et réparation champ par champ ; départ (vide, v1 seule : nouveau joueur et v1 intacte, v1 corrompue, v2 corrompue, v2 plus récente, indisponible) ; `ZS2` aller-retour, `ZS1` importé (remplacement), codes hostiles ; achats atomiques (solde suffisant, insuffisant, exact, deux achats concurrents) ; plafond 9 999 999 ; gains bleus (manche normale, renforcée, fin de monde) ; jaune jamais écrite ; mode essai sans écriture ; catalogue sans arme, caisses et offres sans arme, toutes les raretés tirables, inventaire plein à 100, **tirage identique à graine et catalogue égaux** ; statistiques effectives sans bonus d'attaque ni de chutes ; simulateur 10 000 suites (extension de `onglets-simulateur.js`).
- **Playwright** (bureau, et menu en projet mobile en local) : compatibilité réelle V0.7 → V0.8 → V0.7 (réponse 5 : réduit à « la V0.7 démarre, garde sa propre progression et joue » ; V0.5 et V0.6 couvertes par les essais de la partie A) ; deux onglets réels ; partie jusqu'à une manche terminée, onglet fermé et rouvert : bleue gardée ; mort et « Quitter » : jaune perdue ; acheter, ouvrir, équiper, améliorer, fusionner, choisir, recharger ; outils de débogage présents en `dev`, absents en Recette ; aucune requête externe ; axe ; 44 px.
- **Remplacés (jamais retirés)** : les assertions « aucune écriture » du menu (`menu.spec.js`, `menu-onglets.spec.js`, `boutique.spec.js`, `personnage.spec.js`, `ouverture.spec.js`, `studio.spec.js`, `sons-volumes.spec.js`, `sons-menu.spec.js`, `options-menu.spec.js`) deviennent « seules les écritures attendues » (clé, moment, contenu) ; les listes de clés (`argent.spec.js`, `sauvegarde.spec.js`, `graphics*.test.js`, `sauvegarde-*.test.js`) admettent `zs.save.v2` ; listes « avant / après » avec `scripts/tests/compter.mjs`. Budget : 120 s ajoutées au plus.

## 8. Risques
- Changement large des tests du menu (beaucoup d'assertions « aucune écriture ») : risque de dépasser le budget de durée ; les tests de compatibilité assemblent le site (11 s) une seule fois.
- Offres du jour différentes (catalogue changé) : tests datés à recalculer par la fonction pure.
- Achat annulé après coup (limite 1 du modèle) : rare, mais visible ; message et test dédiés.
- `zs.device.v1` réécrite par la V0.7 : son et volumes remis aux défauts (limite connue, acceptée : réponse 5).
- `index.html` à 90 exactement (seuil) : tout octet de plus dans `css/tokens.css` (jeton bleu) est compensé et mesuré ; sinon l'icône bleue garde ses couleurs dans `css/menu.css` (non chargé par l'accueil).
- Lighthouse de `jeu.html` : quelques modules de plus au démarrage du menu (fusion v2, catalogue lu plus tôt pour l'en-tête) ; mesuré en partie E.

## 9. Questions au propriétaire
Toutes les questions ont reçu leur réponse (section 0, 2026-11-14) ; aucune n'est ouverte. GO reçu le 2026-11-14 ; réalisé : section 11.

## 10. Idées (hors périmètre, notées pour d'autres lots)
- Lot d'équilibrage : statistiques de base propres à chaque personnage, améliorées ensuite par l'équipement (les niveaux de base restent à 0 dans ce lot).
- « Chutes » : compétence d'un personnage ou de certains objets légendaires.
- Achats en monnaie jaune pendant la partie (lot 6, V0.9).
- Équipement visible sur le personnage (silhouette de l'écran Personnage, ouverture 3D).

## 11. Réalisé (parties B à E) : référence
- **Fichiers** : format pur `js/core/progression.js` (`sanitize`, `appliquerOps`, `depuisV1`, `encoder` / `decoder`, `decrire`) ; dépôts `js/save/` avec `codecs.js` (`codecV1`, `codecV2`) ; menu `js/menu/progression-etat.js` (un seul dépôt pour tout le menu, `commit(ops)`), `equipement-etat.js` (état dérivé de la v2, actions → opérations), `avatar.js` (`brancherProfil`) ; partie `js/game/bank.js` ; appareil `js/save/device-settings.js` (`writeSon`) et `js/menu/demarrage.js` (`poserSon`).
- **Opérations** : `gain`, `achat` (prix + objets, personnages, tenues, offre), `ameliorer`, `perso`, `fusion`, `choix` (porte, choisi, avatar, pseudo ; daté), `lues`, `debloquer`. Refus : `solde`, `plein`, `absent`, `niveau`, `offre`, `invalide` (rien prélevé, rien ajouté). Le `journal` (64 identifiants) rend chaque opération idempotente.
- **Compatibilité (mesurée, même origine)** : V0.7 → V0.8 → V0.7 : chaque côté garde sa progression, `zs.save.v1` jamais lue ni écrite par la V0.8, `zs.save.v2` jamais touchée par la V0.7, la Recette démarre et joue (`sauvegarde.spec.js`) ; V0.5 et V0.6 : tableau 1.3 (E3). Limite connue : la V0.7 réécrit `zs.device.v1` sans `son` (son et volumes reviennent aux défauts).
- **Onglets** : simulateur 10 000 suites (2 à 4 onglets) : 0 échec (0 perte, 0 double compte, aucune double dépense, solde jamais négatif) ; 825 achats annulés après coup (limite 1, message « Achat annulé ») ; témoin sans fusion : 431 suites sur 500 en échec. Onglets réels : deux et trois onglets de la V0.8 (`argent.spec.js`).
- **Export / import** : « Exporter mon code » (Profil, `sauvegarde.html`) = `ZS2.…` (base64url + CRC32, 32 768 caractères au plus) ; import `ZS2` ou `ZS1` : aperçu, confirmation, remplace la progression v2 (seule écriture) ; code abîmé : refusé, rien écrit.
- **Outils de débogage** : icône de l'en-tête du menu seulement sur les canaux `source` et `dev` (prouvé en e2e : présente en `dev`, absente en Recette, archive et production) ; quatre outils, chacun confirmé ; « Remettre à zéro » efface `zs.save.v2` et le `son` de `zs.device.v1`, jamais `zs.save.v1`.
- **Ce que le propriétaire peut régler sans lot** (valeurs provisoires) : `data/game/economy.json` (`waveBonusBase`, `waveBonusPerWave`, `reinforcedBonusMul`, `worldBonus` = monnaie bleue ; `killWaveGrowth`, `killGrowthCap`, `repairMoney` = monnaie jaune ; `maxBleu`) ; `data/menu/objets.json` (noms, bonus, `bonusParNiveau`, `niveauMax`, `prixAmelioration`, `inventaireMax`) ; `data/menu/caisses.json` (`prix`, `prix10`, chances, offres du jour) ; `data/menu/raretes.json` (`prixFusion`) ; `data/menu/personnages.json` (`prixAmelioration`). Un objet retiré du catalogue disparaît de l'inventaire à la prochaine écriture (réparation champ par champ).

