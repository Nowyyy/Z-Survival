// Lot 9d : libération d'une partie sans rechargement (js/game/liberation.js, js/game/main.js ; Docs/ref/retour-menu.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { creerRegistre, libererThree } from '../../js/game/liberation.js';

const lire = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

function cible() {
  const liste = new Set();
  return {
    liste,
    addEventListener: (type, fn, o) => liste.add(`${type}|${o?.capture === true}|${fn.name}`),
    removeEventListener: (type, fn, o) => liste.delete(`${type}|${o?.capture === true}|${fn.name}`),
  };
}

describe('registre de libération', () => {
  it('retire les écouteurs avec leurs options, annule les minuteries, dans l\'ordre inverse, une seule fois', () => {
    vi.useFakeTimers();
    const ordre = [];
    const reg = creerRegistre();
    const w = cible();
    function geste() {}
    reg.ecouter(w, 'click', geste, { capture: true });
    reg.ecouter(w, 'resize', geste);
    let ticks = 0;
    reg.intervalle(() => { ticks += 1; }, 100);
    reg.delai(() => { ticks += 100; }, 1000);
    reg.ajouter(() => ordre.push('a'));
    reg.ajouter(() => ordre.push('b'));
    expect(w.liste.size).toBe(2);
    vi.advanceTimersByTime(250);
    expect(ticks).toBe(2);
    expect(reg.liberer()).toEqual([]);
    expect(reg.libere).toBe(true);
    expect(ordre).toEqual(['b', 'a']);
    expect(w.liste.size).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(ticks).toBe(2);
    expect(reg.liberer()).toEqual([]);
    expect(ordre).toEqual(['b', 'a']);
    vi.useRealTimers();
  });

  it('une étape qui lève n\'empêche pas les suivantes ; les erreurs sont rendues', () => {
    const reg = creerRegistre();
    const fait = [];
    reg.ajouter(() => fait.push(1));
    reg.ajouter(() => { throw new Error('contexte perdu'); });
    reg.ajouter(() => fait.push(3));
    const erreurs = reg.liberer();
    expect(erreurs.map((e) => e.message)).toEqual(['contexte perdu']);
    expect(fait).toEqual([3, 1]);
  });

  it('libererThree : géométries, matières, textures (propriétés et uniformes), cartes d\'ombre et squelettes, jamais deux fois', () => {
    const n = { dispose: 0 };
    const obj = (extra = {}) => ({ dispose: () => { n.dispose += 1; }, ...extra });
    const tex = obj({ isTexture: true });
    const depth = obj({ isTexture: true });
    const geo = obj();
    const mat = obj({ map: tex, uniforms: { u: { value: tex } } });
    const shadow = { map: { depthTexture: depth, texture: obj({ isTexture: true }) }, dispose: () => { n.dispose += 1; } };
    const enfants = [{ geometry: geo, material: [mat, mat] }, { shadow }, { geometry: geo, skeleton: obj() }];
    const racine = { traverse: (f) => enfants.forEach(f) };
    const vus = new Set();
    expect(libererThree([racine, racine], vus)).toBe(6);
    expect(n.dispose).toBe(7); // géométrie, texture, matière, profondeur, texture de l'ombre, squelette, ombre
  });
});

describe('main.js et game.js : partie rappelable et libérable', () => {
  const main = lire('js/game/main.js');
  const game = lire('js/game/game.js');
  it('rien ne démarre à l\'import : seul demarrerPartie() crée la partie (aucun « await » au niveau du module)', () => {
    expect(main).toMatch(/^export async function demarrerPartie\(\) \{/m);
    expect(main).not.toMatch(/^(const|let) [^=]+= await /m);
    expect(main).not.toMatch(/^await /m);
    expect(game).not.toMatch(/^(const|let) [^=]+= await /m);
  });
  it('écouteurs de window et document, minuteries et canal tenus par le registre ; crochet de test retiré ; DOM rétabli', () => {
    expect(main).not.toMatch(/(window|document)\.addEventListener\(/);
    expect(main).not.toMatch(/\bset(Interval|Timeout)\((syncHint)/);
    expect(main).toContain('reg.ajouter(() => c.close());');
    expect(main).toContain('delete window.__zs;');
    expect(main).toContain('reg.ajouter(photographierPage());');
    expect(game).toMatch(/liberer\(\) \{\n\s+if \(libere\) return null;\n\s+libere = true;\n\s+bank\.flush\('pagehide'\);/);
    expect(game).toContain('renderer.forceContextLoss();');
    expect(game).not.toMatch(/(window|document)\.addEventListener\(/);
  });
});

// Lot 9d : démarrage du menu allégé : l'adresse de la page est lue par js/menu/adresse.js, sans js/game/graphics-boot.js (préréglage, carte).
describe('adresse de la page pour le menu (js/menu/adresse.js)', () => {
  const CAS = [[null, '?test=1&menu=1&seed=1'], ['source', '?test=1&wave=3&gfx=faible'], ['dev', '?wave=3&gfx=faible&perso=A&test=1'], ['release', '?test=1&lvl=3&menu=1'], ['prod', '?test=1&menu=1&wave=2'], ['archive', '?sang=0&vhs=0'], ['inconnu', ''], ['dev', '?intro=1&debug=1']];
  it('même canal et même adresse filtrée que graphics-boot.js, pour chaque canal', async () => {
    const avant = { location: globalThis.location, document: globalThis.document };
    try {
      for (const [canal, search] of CAS) {
        vi.resetModules();
        globalThis.location = { search };
        globalThis.document = { querySelector: () => (canal === null ? null : { getAttribute: () => canal }) };
        const a = await import('../../js/menu/adresse.js');
        const b = await import('../../js/game/graphics-boot.js');
        expect([a.pageCanal(), a.pageSearch()], `${canal} ${search}`).toEqual([b.pageCanal(), b.pageSearch()]);
      }
    } finally {
      globalThis.location = avant.location;
      globalThis.document = avant.document;
    }
  });
  it('aucun module du démarrage du menu n\'importe graphics-boot.js de façon statique (seulement à « JOUER » et à l\'ouverture des Options)', () => {
    for (const f of ['js/menu/demarrage.js', 'js/menu/chargement.js', 'js/menu/menu.js', 'js/menu/progression-etat.js', 'js/menu/intro.js', 'js/menu/jouer.js', 'js/menu/sons/sons.js']) {
      expect(lire(f), f).not.toMatch(/^import [^;]*graphics-boot\.js';/m);
    }
    expect(lire('js/menu/demarrage.js')).toContain("(await import('../game/graphics-boot.js')).graphicsReboot();");
  });
});

// Option à l'essai (demande du propriétaire : « démontable facilement ») : une constante choisit le retour sans rechargement ou le rechargement d'avant.
describe('retour sans rechargement : option démontable', () => {
  it('une seule constante (js/core/menu-etat.js), donnée à demarrage.js par l\'écran de chargement ; false : menuRetour, comme avant le lot 9d', async () => {
    const { RETOUR_SANS_RECHARGEMENT } = await import('../../js/core/menu-etat.js');
    expect(typeof RETOUR_SANS_RECHARGEMENT).toBe('boolean');
    expect(lire('js/core/menu-etat.js').match(/^export const RETOUR_SANS_RECHARGEMENT = (true|false);$/m)).not.toBeNull();
    expect(lire('js/menu/chargement.js')).toContain('sansRechargement: RETOUR_SANS_RECHARGEMENT,');
    const d = lire('js/menu/demarrage.js');
    expect(d).toContain("const sansRechargement = rechargementForce === null ? chargementMenu?.sansRechargement === true : !rechargementForce;");
    expect(d).toContain('if (!modeMenu || !quittee || !chargementMenu || !sansRechargement) return menuRetour();');
  });
});

// Retour du propriétaire : le menu est détruit à « JOUER » et un menu neuf est chargé au retour (avant : le même menu revenait à l'écran exact).
describe('menu détruit à « JOUER », menu neuf au retour', () => {
  it('chargement.js détruit le menu à « JOUER » ; detruire() retire écouteurs, glissement, profil et oublie les modules partagés ; demarrage.js recharge un menu neuf', () => {
    expect(lire('js/menu/chargement.js')).toContain('menu.detruire();');
    expect(lire('js/menu/chargement.js')).not.toContain('menu.element.remove();');
    const m = lire('js/menu/menu.js');
    const corps = m.slice(m.indexOf('function detruire() {'), m.indexOf('// Échap : Options'));
    for (const appel of ["document.removeEventListener('keydown', clavier, true);", 'retirerGlisser?.();', 'quitterProfil?.();', 'box.remove();', 'oublierAjustes();', 'oublierProfil();', 'detruireProgression();']) expect(corps, appel).toContain(appel);
    expect(m).not.toMatch(/function reprendre\(/);
    expect(m).not.toMatch(/^import [^;]*equipement-etat\.js';/m); // démarrage du menu inchangé : l'équipement s'inscrit lui-même (surDestruction)
    expect(lire('js/menu/equipement-etat.js')).toContain('surDestruction(detruireEquipement);');
    expect(lire('js/menu/progression-etat.js')).toMatch(/fermer\(\) \{\n\s+abonnes\.clear\(\);\n\s+for \(const f of ouverts\.splice\(0\)\) f\(\);/);
    const d = lire('js/menu/demarrage.js');
    expect(d).toContain('chargerMenu(null);');
    expect(d).toContain("ecran = m.creerChargement({ phase: 'menu', jouer, son: { lire: reglagesSon, poser: poserSon }, contexteAudio });");
  });
});
