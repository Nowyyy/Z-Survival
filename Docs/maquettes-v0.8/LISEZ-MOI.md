# Maquettes du menu principal de la V0.8 (référence)

Copies autonomes des ébauches validées par le propriétaire sur le canvas de cadrage. Chaque fichier s'ouvre seul dans un navigateur ; format de référence **932 × 430** (paysage).

| Fichier | Écran | Lot |
|---|---|---|
| `Chargement.html` | E7 Écran de chargement (chute du Z) | 8a (fait) |
| `Main.html` | E8-3 Onglet Jouer, avec en-tête et barre d'onglets | 8a (socle), 8b (scène) |
| `MenuOuvert.html` | E8-6 Menu à trois barres ouvert | 8a (fait) |
| `Infini.html` | E8-4 Onglet Infini | 8b |
| `Options.html` | E5 Options du menu principal | 8c |
| `OptionsJeu.html` | E2-12 Options en partie (réglages verrouillés) | 8c |
| `Personnage.html` | E9-1 Équipement porté | 8d |
| `Inventaire.html` | E9-2 Inventaire | 8d |
| `Fusion.html` | E9-3 Fusion | 8d |
| `Personnages.html` | E9-4 Personnages | 8d |
| `Caisses.html` | E3-1 Boutique | 8e |
| `Ouverture.html`, `Ouverture10.html` | E3-2 et E3-3 Ouvertures (vue à la première personne) | 8f |
| `Resultat1.html`, `Resultat10.html` | E3-4 et E3-5 Résultats | 8f |
| `Profil.html` | E10 Profil | 8g |

## Comment s'en servir (agents)
- **Reproduire au plus près** : composition, emplacements, proportions, couleurs, typographie, animations (mouvements, durées, enchaînements). Mesurer dans le fichier plutôt que d'estimer.
- **Le prompt du lot et le seed priment** sur la maquette en cas de différence (textes, décisions prises après les ébauches).
- **Ne pas copier le code tel quel** quand il contredit les règles du dépôt : couleurs en dur → jetons de `css/tokens.css` ; tailles en pixels → `calc(N * var(--u))` ; animations → noms propres à chaque écran et `prefers-reduced-motion` ; accessibilité à compléter (rôles, focus, noms accessibles) ; polices hébergées du jeu.
- **Les valeurs entre crochets** (`[N]`, `[prix]`, `[pseudo]`) et les objets, raretés et chances affichés sont des exemples, jamais des données réelles.
- Ces fichiers ne sont ni publiés ni testés ; ils ne se modifient qu'à la demande du propriétaire.
