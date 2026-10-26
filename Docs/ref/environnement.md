# Environnement de développement (sonde du lot 0-A)

Sonde faite dans un conteneur cloud Claude Code (Linux), le 2026-10-25.

| Élément | Résultat |
|---|---|
| Git | 2.43.0 |
| Node / npm | v22.22.0 / 10.9.4 |
| Registre npm | accessible (`npm ping`, `npm view`, `npm install` OK) |
| Navigateur pour Playwright | Chromium 153 préinstallé dans `/opt/pw-browsers` (build 1243, celui de Playwright 1.63) ; `@playwright/test` est donc épinglé à **1.63.0**. Ne pas lancer `playwright install`. |
| Lighthouse | lançable (13.5.0, devDependency) avec `CHROME_PATH` = Chromium de Playwright et `--no-sandbox` ; essai sur une page vide : perf 1, accessibilité 1, bonnes pratiques 0,96 |
| Push d'une branche | OK (`main` poussée à l'init) ; `lot-0` poussée en fin de partie A |
| Push d'un workflow | OK (`.github/workflows/pages.yml` poussé sur `lot-0` en partie C) |
| Réseau sortant | via un proxy d'agent : registre npm et GitHub accessibles ; `www.google.com` et `android.clients.google.com` refusés (bruit de Chromium sans conséquence) |

Notes : le dépôt était vide au départ (cas 1a). Le push affiche « push negotiation failed; proceeding anyway » sur dépôt vide : sans conséquence, le hash distant a été comparé au hash local.
