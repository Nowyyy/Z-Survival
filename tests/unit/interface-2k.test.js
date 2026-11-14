// Lot 8j-B : facteur de l'interface de la partie (js/game/ui-echelle.js) et curseurs de volume au pour cent (js/game/options-menu.js : fonctions pures).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { facteurInterface, installerEchelle, UI_FACTEUR_MAX, UI_HAUTEUR_BASE } from '../../js/game/ui-echelle.js';
import { creerLimiteur, ESSAI_MS, volumeClavier } from '../../js/game/options-menu.js';

describe('facteur de l\'interface (--ui-k)', () => {
  it('1 jusqu\'à 1080 px de haut, hauteur / 1080 au-delà, plafond 2 ; valeur invalide : 1', () => {
    expect(UI_HAUTEUR_BASE).toBe(1080);
    expect(UI_FACTEUR_MAX).toBe(2);
    for (const h of [0, 375, 430, 768, 1079, 1080]) expect(facteurInterface(h), String(h)).toBe(1);
    expect(facteurInterface(1440)).toBeCloseTo(4 / 3, 10);
    expect(facteurInterface(1620)).toBeCloseTo(1.5, 10);
    expect(facteurInterface(2160)).toBe(2);
    expect(facteurInterface(4320)).toBe(2);
    for (const v of [NaN, undefined, null, 'x', -5]) expect(facteurInterface(v)).toBe(1);
  });
  it('installerEchelle pose --ui-k sur la racine et le suit au redimensionnement', () => {
    const props = {};
    const ecouteurs = {};
    const win = {
      innerHeight: 900,
      document: { documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } } },
      addEventListener: (t, f) => { ecouteurs[t] = f; },
    };
    installerEchelle(win);
    expect(props['--ui-k']).toBe('1');
    win.innerHeight = 1440;
    ecouteurs.resize();
    expect(Number(props['--ui-k'])).toBeCloseTo(4 / 3, 10);
    expect(installerEchelle(null)()).toBe(1);
  });
  it('les feuilles : une seule variable de facteur, ni zoom ni transform: scale ajoutés ; tokens.css et menu.css ne la lisent pas', () => {
    const gui = readFileSync('css/game-ui.css', 'utf8');
    for (const v of ['--hud-fs', '--hud-gap', '--hud-target', '--hud-pause-size', '--game-margin']) expect(gui).toMatch(new RegExp(`${v}: [^;]*var\\(--ui-k, 1\\)`));
    expect(gui).not.toMatch(/(^|[^-])zoom\s*:/m);
    expect(gui).not.toMatch(/scale\([^)]*--ui-k/);
    expect(readFileSync('css/tokens.css', 'utf8')).not.toContain('--ui-k');
    expect(readFileSync('css/menu.css', 'utf8')).not.toContain('--ui-k');
  });
});

describe('curseurs de volume au pour cent', () => {
  it('clavier (event.code) : flèches ±1, Page ±10, Début 0, Fin 100, bornes 0 et 100 ; autre touche : null', () => {
    expect(volumeClavier('ArrowRight', 37)).toBe(38);
    expect(volumeClavier('ArrowUp', 37)).toBe(38);
    expect(volumeClavier('ArrowLeft', 37)).toBe(36);
    expect(volumeClavier('ArrowDown', 37)).toBe(36);
    expect(volumeClavier('PageUp', 37)).toBe(47);
    expect(volumeClavier('PageDown', 37)).toBe(27);
    expect(volumeClavier('Home', 37)).toBe(0);
    expect(volumeClavier('End', 37)).toBe(100);
    expect(volumeClavier('PageUp', 95)).toBe(100);
    expect(volumeClavier('PageDown', 4)).toBe(0);
    expect(volumeClavier('ArrowRight', 100)).toBe(100);
    expect(volumeClavier('ArrowLeft', 0)).toBe(0);
    expect(volumeClavier('ArrowRight', '40')).toBe(41); // valeur lue sur l'élément (texte)
    expect(volumeClavier('KeyA', 37)).toBeNull();
    expect(volumeClavier('Space', 37)).toBeNull();
  });
  it('limiteur : au plus une application toutes les 150 ms (délai restant sinon)', () => {
    expect(ESSAI_MS).toBe(150);
    const l = creerLimiteur();
    expect(l.demander(1000)).toBe('maintenant');
    l.applique(1000);
    expect(l.demander(1010)).toBe(140);
    expect(l.demander(1149)).toBe(1);
    expect(l.demander(1150)).toBe('maintenant');
    // 60 demandes en 300 ms (une toutes les 5 ms), appliquées quand c'est permis : 2 applications au plus.
    const m = creerLimiteur();
    let n = 0;
    for (let t = 0; t < 300; t += 5) {
      if (m.demander(t) === 'maintenant') {
        m.applique(t);
        n += 1;
      }
    }
    expect(n).toBe(2);
  });
});
