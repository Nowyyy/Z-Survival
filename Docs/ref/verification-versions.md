# Vérification des versions archivées (lot 4c-B)

Archives construites le 2026-11-02 par `node scripts/versions/archiver.mjs --all` (une version à la fois, depuis son hash gelé de `versions.json`), sur la branche orpheline **`archive`** : `6d8c1bc` (4 commits : `b617c21` V0.1, `955ebbd` V0.2, `34b3b48` V0.3, `6d8c1bc` V0.4 ; `LISEZMOI.md` + `v0.1/` à `v0.4/`, 398 fichiers, **aucun fichier de workflow**). Relance de `--id v0.2` : « inchangée », aucun commit (idempotent). V0.5 : archivée au lot 5f (publication de V0.6) par `node scripts/versions/archiver.mjs --id v0.5 --ref e23d92b7cfa46e92693b6695d2e8ad15ecc28344` (tête de `main` au moment de l'archivage, ce que le public voyait ; son contenu ne diffère de la fusion `e6cf00e` que par la documentation et le seed) : essai à blanc, puis commit `92631da` sur `archive` (5 commits ; `LISEZMOI.md` + `v0.1/` à `v0.5/`, 651 fichiers, aucun fichier de workflow). V0.6 : archivée au lot 5p (publication de V0.7) par `node scripts/versions/archiver.mjs --id v0.6 --ref 6e3ae1ad602ff7612e6ad0901e823902fd20d9e0` (tête de `main`, ce que le public voyait : même jeu que `cef11b3`, plus l'accueil retouché du lot 5i, le fichier des noms et le seed ; le `ref` de V0.6 dans `versions.json` passe de `cef11b3` à ce hash) : essai à blanc (`--dry-run --keep`, puis le vérificateur sur le dossier construit), puis commit `eab1a3f` sur `archive` (6 commits ; `LISEZMOI.md` + `v0.1/` à `v0.6/`, 910 fichiers, 20,4 Mo, aucun fichier de workflow).

Contrôle : `node scripts/versions/verifier.mjs` (contenu de `origin/archive` extrait en dossier temporaire, servi par `scripts/site/serve.mjs` sous **`/Z-Survival/v0.N/`**, comme sur GitHub Pages ; Chromium de Playwright, 667×375, WebGL logiciel SwiftShader : présent pour les quatre versions ; aucune conclusion sur la fluidité). Pour chaque version : la page d'entrée et la page `v0.N/` sont chargées, puis 4 s d'attente.

| Version | Branche (hash) | Entrée | Taille | Fichiers | `npm ci` / build | Ressources manquantes | Erreurs de console | Liens non relatifs | Statut |
|---|---|---|---|---|---|---|---|---|---|
| V0.1 | `lot-1` (`1ffbf76`) | `v0.1/jeu.html` | 1,7 Mo | 54 | 8,5 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.2 | `lot-1d` (`8a098f0`) | `v0.2/jeu.html` | 2,7 Mo | 93 | 7,0 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.3 | `lot-2c` (`0eee619`) | `v0.3/jeu.html` | 2,8 Mo | 108 | 6,7 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.4 | `lot-3e` (`b4a0e31`) | `v0.4/jeu.html` | 3,2 Mo | 142 | 6,8 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.5 | `lot-4b` (archivée depuis `main` `e23d92b`, lot 5f) | `v0.5/jeu.html` | 4,9 Mo | 253 | 5,1 s / 0,2 s | 0 sur `jeu.html` ; 1 sur `v0.5/` (`versions.json`, 404) | 0 sur `jeu.html` ; 1 sur `v0.5/` (la même 404) | 0 | archive |
| V0.6 | `dev` (archivée depuis `main` `6e3ae1a`, lot 5p) | `v0.6/jeu.html` | 5,0 Mo | 259 | 5,7 s / 0,1 s | 0 sur `jeu.html` ; 1 sur `v0.6/` (`site-info.json`, 404) | 0 sur `jeu.html` ; 1 sur `v0.6/` (la même 404) | 0 | archive |

Aucune version indisponible. Aucun fichier de plus de 50 Mo (le plus gros : `vendor/` de chaque version). Total des archives : 10,4 Mo (V0.1 à V0.4), 15,3 Mo avec V0.5, 20,4 Mo avec V0.6. Vérification complète : 43 s (lot 4c), 54 s avec V0.5 (lot 5f), 67 s avec V0.6 (lot 5p).

**V0.5, écart connu (lot 5f, accepté par le propriétaire)** : sa page `v0.5/` (`index.html`) est l'ancien accueil du lot 4c, qui lit `versions.json` dans son dossier ; l'archiveur n'en écrit pas, d'où une 404 et un message de console sur cette page seulement (la requête échoue sans erreur de script : la liste des versions y est vide). L'entrée `v0.5/jeu.html`, celle que l'accueil de la Recette ouvre, se charge sans ressource manquante ni erreur. Rien n'a été corrigé (archiveur inchangé).

**V0.6, même écart (lot 5p)** : sa page `v0.6/` (`index.html`) est l'accueil des lots 5g à 5i, qui lit `site-info.json` dans son dossier ; l'archiveur n'en écrit pas, d'où une 404 et un message de console sur cette page seulement. L'entrée `v0.6/jeu.html` se charge sans ressource manquante ni erreur (WebGL logiciel présent). Rien n'a été corrigé (archiveur inchangé).

## À regarder à la main (le propriétaire)

| Version | Adresse après fusion | Ce qu'il faut regarder |
|---|---|---|
| V0.1 | `…/v0.1/jeu.html` | Premier moteur 2D (avant Three.js) : salle simple, sticks, laser, tir automatique à balle visible, zombies, pause ; sons Web Audio simples. Pas de textures, pas de vagues. |
| V0.2 | `…/v0.2/jeu.html` | Three.js : monde plus grand, meubles, textures générées, personnages finaux ; sons synthétisés (voix de zombies) et invitation « Touche ici pour activer le son » sur téléphone. |
| V0.3 | `…/v0.3/jeu.html` | Vagues et allures, types de zombies, cône de tir, statistiques ; animation de changement de vague, mélodie, effet VHS. |
| V0.4 | `…/v0.4/jeu.html` | Fenêtres à planches (arrachage, réparation), chutes, carte du rez-de-chaussée et étage, escaliers, portes qui s'ouvrent aux manches 10, 20, 30 (`?wave=21&floor=1`). |
| V0.5 | `…/v0.5/jeu.html` (lot 5f ; avant : `…/Recette/` puis « Jouer ») | Argent, sauvegarde, refontes (carte, sons, interface, personnages, sang) ; **elle lit et écrit la même sauvegarde `zs.save.v1` que la Recette** (même domaine) ; `…/v0.5/` (ancien accueil) : liste des versions vide et une 404 en console, attendu. |
| V0.6 | `…/v0.6/jeu.html` (lot 5p ; avant : `…/Recette/` puis « Jouer ») | Épaves (voiture en flammes, hélicoptère écrasé), nouvel impact sur les zombies, préréglages graphiques (`?gfx=`) ; **même sauvegarde `zs.save.v1` que la Recette**, sans les relevés entre onglets de V0.7 (ne pas la laisser ouverte en même temps qu'un onglet V0.7) ; `…/v0.6/` (accueil des lots 5g à 5i) : une 404 (`site-info.json`) en console, accueil dans son état « données absentes » (`homeModel` : `state: 'error'`), attendu. |

Pour toutes les versions archivées :
- leur `index.html` est l'ancienne page d'attente « En construction » : on les ouvre par leur entrée (`jeu.html`), comme le fait l'accueil de la Recette (lot 5g : le journal `/dev/` est supprimé, `/dev/` est le build de développement) ;
- leur `/v0.N/dev/` est l'ancien menu : il affiche « La liste des lots est indisponible » (les aperçus par lot sont retirés) ; c'est attendu ;
- elles partagent l'origine du site : la langue mémorisée (`mobile-games.lang`) est commune (lot 5g : `/Recette/` et `/dev/` partagent aussi la même sauvegarde `zs.save.v1`) ; V0.1 à V0.4 n'ont pas de sauvegarde (introduite au lot 4, V0.5) et ne peuvent pas toucher `zs.save.v1` ; V0.5 (archivée au lot 5f) l'utilise : elle peut lire une sauvegarde écrite par une version plus récente (verrouillée si son schéma est plus récent, jamais écrasée) ;
- le jeu, les sons et l'esthétique n'ont pas été jugés par l'agent (rendu logiciel seulement, aucun son écouté).
