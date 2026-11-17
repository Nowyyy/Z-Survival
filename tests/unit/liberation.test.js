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
