import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { characterStats, silhouetteMetrics } from '../../js/core/character-parts.js';
import { contrast } from '../../js/core/color.js';
import { NIVEAUX_EPOQUE, SUFFIXE_SIMPLE, buildEpochVariant, lireChoixEpoque, melangeEpoque, paletteColor, partRgb, resolveVariant, resoudreEpoque, slotsWithEpoch } from '../../js/core/persos-variants.js';
import { LIMITS, characterCost, crowdCost, project } from '../../scripts/personnages/projection.mjs';
import { EPOQUE_KINDS, PALETTE_REGION, PALETTE_REGION_EPOQUE, REGION_KINDS, createPersoTexture, persoRegionRect, persoSpec, regionFactor, regionOfPalette } from '../../js/core/texgen-persos.js';
import { characters, floorsWithStains, gameView, lookup, skeletons, tokens, v2Pose, variantChecks } from '../../scripts/personnages/lib.mjs';

// Lot 9g (partie B, atelier) : variantes d'époque des personnages (apparence seulement), construites d'après data/game/persos-epoque.json.
const epoque = JSON.parse(readFileSync('data/game/persos-epoque.json', 'utf8'));
const choixJson = JSON.parse(readFileSync('data/game/persos-epoque-choix.json', 'utf8'));
const slots = slotsWithEpoch(characters.slots, epoque);
const slotOf = (id) => slots.find((s) => s.id === id);
const epochs = slots.flatMap((s) => s.variants.filter((v) => v.epoque).map((v) => [s.id, v.id, s, v]));
const PERSOS = ['survivant', 'personnage-2', 'marcheur', 'petit', 'voute', 'grand'];
const SLOT = (p) => (p === 'survivant' || p === 'personnage-2' ? 'joueur' : p);
const resolve = (v, o = {}) => resolveVariant(v, { wearTiers: characters.wearTiers, ...o });
const maxOver = (v, fn) => Math.max(...v.outfits.map((_, o) => fn(resolve(v, { outfit: o }))));
const tri = (res) => characterStats(res, { skeletons }).triangles;
// Référence du lot : apparence actuelle du même niveau (riche : complet ; A : simple), maximum sur ses tenues.
const refOf = (slotId, niveau) => maxOver(characters.slots.find((s) => s.id === slotId).variants.find((v) => v.id === (niveau === 'simple' ? 'A' : 'riche')), tri);
const GARDES = ['kind', 'skeleton', 'style', 'scale', 'sole', 'joints', 'posture', 'contacts', 'shadow', 'anchors', 'macros'];
const LIMBS = ['head', 'upperL', 'foreL', 'handL', 'thighL', 'shinL', 'bootL', 'chest', 'belly', 'pelvis'];

describe('construction des variantes d\'époque', () => {
  it('trois variantes par zombie, trois par personnage jouable (Survivant, personnage 2), chacune aux deux niveaux', () => {
    for (const z of ['marcheur', 'petit', 'voute', 'grand']) expect(slotOf(z).variants.filter((v) => v.epoque).map((v) => v.id)).toEqual(['epoque-A', 'epoque-A-simple', 'epoque-B', 'epoque-B-simple', 'epoque-C', 'epoque-C-simple']);
    expect(slotOf('joueur').variants.filter((v) => v.epoque).map((v) => v.id)).toEqual(['epoque-A', 'epoque-A-simple', 'epoque-B', 'epoque-B-simple', 'epoque-C', 'epoque-C-simple', 'para-A', 'para-A-simple', 'para-B', 'para-B-simple', 'para-C', 'para-C-simple']);
    expect(NIVEAUX_EPOQUE).toEqual(['complet', 'simple']);
  });
  it('variantes actuelles intactes et en tête (A, B, C, riche), arguments jamais modifiés, construction déterministe', () => {
    const frozen = structuredClone(characters.slots);
    const again = slotsWithEpoch(characters.slots, epoque);
    expect(characters.slots).toEqual(frozen);
    expect(again).toEqual(slots);
    for (const s of slots) expect(s.variants.slice(0, 4).map((v) => v.id)).toEqual(['A', 'B', 'C', 'riche']);
    expect(slotsWithEpoch(characters.slots, null).map((s) => s.variants.length)).toEqual(characters.slots.map((s) => s.variants.length));
    expect(buildEpochVariant({}, {}, {})).toBe(null);
  });
  it.each(epochs)('%s %s : gabarit et animation identiques à la variante d\'origine (squelette, articulations, échelle, posture, contacts, ombre, ancres du sang)', (sid, vid, s, v) => {
    const base = s.variants.find((x) => x.id === (vid.endsWith(SUFFIXE_SIMPLE) ? 'A' : 'riche'));
    for (const k of GARDES) expect(v[k], k).toEqual(base[k]);
    expect(v.flags.epoque).toBe(true);
  });
  it.each(epochs)('%s %s : aucune pièce du corps retirée (aucun démembrement) dans chaque tenue', (_s, _v, _slot, v) => {
    for (let o = 0; o < v.outfits.length; o += 1) {
      const ids = new Set(resolve(v, { outfit: o }).parts.map((p) => p.id));
      for (const id of LIMBS) expect(ids.has(id), `tenue ${o} : ${id}`).toBe(true);
    }
  });
});

describe('budgets (garantie 2)', () => {
  it.each(epochs)('%s %s : appels ≤ 4 (corps, proxy, ombre : 3), ombre ≤ 64 triangles, triangles ≤ +10 % de l\'actuel du même niveau et ≤ plafond', (sid, vid, _slot, v) => {
    const niveau = vid.endsWith(SUFFIXE_SIMPLE) ? 'simple' : 'complet';
    for (let o = 0; o < v.outfits.length; o += 1) {
      const st = characterStats(resolve(v, { outfit: o }), { skeletons });
      expect(st.calls + st.shadowCalls).toBe(3);
      expect(st.shadowTriangles).toBeLessThanOrEqual(64);
      expect(st.triangles, `tenue ${o}`).toBeLessThanOrEqual(Math.floor(refOf(sid, niveau) * 1.1));
      expect(st.triangles).toBeLessThanOrEqual(niveau === 'simple' ? characters.budget.triangles : characters.budget.richTriangles);
    }
  });
});

describe('contrôles du kit et lisibilité', () => {
  const floors = floorsWithStains();
  const camera = gameView();
  const spec = persoSpec({ size: 256, tiles: 2, seed: 3, epoque: true });
  const tex = createPersoTexture(spec);
  const factors = Object.fromEntries([...REGION_KINDS, ...EPOQUE_KINDS].map((k) => [k, regionFactor(tex, spec, k)]));
  it.each(epochs)('%s %s : checkVariant sans violation pour chaque tenue (pièces flottantes, emprise, hauteur, petit adulte)', (sid, _v, s, v) => {
    for (let o = 0; o < v.outfits.length; o += 1) expect(variantChecks(s, v, { outfit: o }), `tenue ${o}`).toEqual([]);
  });
  it.each(epochs)('%s %s : contraste ≥ 3:1 sur chaque sol et sol taché, toutes les tenues (usure 0, et 3 pour les zombies)', (sid, _v, _slot, v) => {
    for (let o = 0; o < v.outfits.length; o += 1) {
      for (const wear of sid === 'joueur' ? [0] : [0, 3]) {
        const res = resolve(v, { outfit: o, wear });
        const sil = silhouetteMetrics(res, v2Pose(res, 'marche', 0.25), camera, { skeletons, color: (part) => partRgb(part, res, lookup, { averageTears: true }).map((c) => (c * (factors[regionOfPalette(part.palette)] ?? 0.9)) / 255) });
        const rgb = sil.color.map((c) => c * 255);
        for (const [k, f] of Object.entries(floors)) expect(contrast(rgb, f), `tenue ${o} usure ${wear} sur ${k}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('zombies : six tenues (sous-variantes) toutes différentes (pièces ou palette) ; personnages jouables : trois', () => {
    for (const [sid, , , v] of epochs) {
      expect(v.outfits).toHaveLength(sid === 'joueur' ? 3 : 6);
      const sig = v.outfits.map((_, o) => JSON.stringify([resolve(v, { outfit: o }).parts.map((p) => p.id).sort(), resolve(v, { outfit: o }).palette]));
      expect(new Set(sig).size).toBe(v.outfits.length);
    }
  });
  it('zombies : soldats seulement (casque, calot, casquette ou tête nue ; capote ou veste), un officier à casquette et un sous-officier par type', () => {
    for (const z of ['marcheur', 'petit', 'voute', 'grand']) {
      for (const r of epoque.variantes.filter((x) => x.slot === z)) {
        const ids = r.tenues.map((t) => t.id);
        expect(ids.some((id) => id.startsWith('officier'))).toBe(true);
        expect(ids).toContain('sous-officier');
        for (const t of r.tenues) expect(t.pieces.some((p) => /^(casque|calot|casquette|cheveux)/.test(p)), `${z} ${t.id}`).toBe(true);
        expect(r.tenues.some((t) => t.pieces.some((p) => p.startsWith('capote')))).toBe(true);
      }
    }
  });
});

describe('règles de contenu et couleurs (garantie 3)', () => {
  const text = readFileSync('data/game/persos-epoque.json', 'utf8');
  it('aucun insigne ni symbole politique nommé (pièces, tenues, libellés)', () => {
    expect(text).not.toMatch(/gamm|swastika|hakenkreuz|\brune|aigle|eagle|totenkopf|cocarde|écusson|ecusson|brassard|drapeau|\bss\b|nazi|galon/i);
    // « insigne » et « symbole » n'apparaissent que dans les phrases qui les excluent (« aucun insigne », « aucun symbole »).
    for (const m of text.matchAll(/(.{0,12})(insigne|symbole)/gi)) expect(m[1]).toMatch(/aucun|ni\s*$/i);
  });
  it('aucune couleur en dur ; chaque couleur nommée dérive de jetons existants de css/tokens.css (aucun jeton nouveau)', () => {
    expect(text).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    for (const [name, c] of Object.entries(epoque.couleurs)) {
      expect(tokens[c.jeton], name).toBeDefined();
      if (c.vers) expect(tokens[c.vers], name).toBeDefined();
      expect(paletteColor(c, lookup)).toHaveLength(3);
    }
    for (const [, , , v] of epochs) {
      for (const pal of [v.palette, ...v.outfits.map((o) => o.palette)]) for (const [k, e] of Object.entries(pal)) expect(paletteColor(e, lookup), `${v.id} ${k}`).not.toBe(null);
    }
  });
  it('paletteColor : jeton, couleur dérivée, entrées invalides → null sans exception', () => {
    expect(paletteColor('--perso-cuir', lookup)).toEqual(lookup('--perso-cuir'));
    expect(paletteColor({ jeton: '--perso-cuir', vers: '--perso-sombre', part: 0 }, lookup)).toEqual(lookup('--perso-cuir'));
    expect(paletteColor({ jeton: '--perso-cuir', ombre: -1 }, lookup)).toEqual([0, 0, 0]);
    for (const bad of [null, 3, {}, { jeton: 'rouge' }, { jeton: '--inconnu' }, '<b>']) expect(paletteColor(bad, lookup)).toBe(null);
    expect(paletteColor('--perso-cuir', null)).toBe(null);
  });
  it('petit : adulte de petite taille (proportions de la tête vérifiées par tenue, plus haut) ; libellé sans enfant', () => {
    for (const r of epoque.variantes.filter((x) => x.slot === 'petit')) expect(r.intent).toMatch(/adulte/);
    expect(text).not.toMatch(/enfant(?! :)/);
  });
});

describe('textures d\'époque', () => {
  const blood = [lookup('--sang-frais'), lookup('--sang-sec')];
  it('sans le drapeau d\'époque, textures et régions identiques au bit près (jeu inchangé)', () => {
    const a = createPersoTexture(persoSpec({ size: 256, tiles: 2, seed: 11, blood }));
    const b = createPersoTexture(persoSpec({ size: 256, tiles: 2, seed: 11, blood, epoque: false }));
    expect(a.data).toEqual(b.data);
    expect(persoSpec({ size: 128 })).not.toHaveProperty('epoque');
    for (const k of REGION_KINDS) expect(persoRegionRect(persoSpec({ size: 256, epoque: true }), k)).toEqual(persoRegionRect(persoSpec({ size: 256 }), k));
    for (const [k, r] of Object.entries(PALETTE_REGION)) expect(regionOfPalette(k)).toBe(r);
  });
  it('avec le drapeau : seules les cases libres changent ; facteurs entre 0,7 et 1 ; même taille ; tuile 0 sans sang', () => {
    const spec = persoSpec({ size: 256, tiles: 2, seed: 11, blood, epoque: true });
    const a = createPersoTexture(persoSpec({ size: 256, tiles: 2, seed: 11, blood }));
    const b = createPersoTexture(spec);
    expect(b.width).toBe(a.width);
    expect(b.bytes).toBe(a.bytes);
    let changedUsed = 0;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const ri = Math.floor((x % 128) / 32) + Math.floor((y % 128) / 32) * 4;
        const i = (y * 256 + x) * 4;
        if (ri < REGION_KINDS.length && a.data[i] !== b.data[i]) changedUsed += 1;
      }
    }
    expect(changedUsed).toBe(0);
    for (const k of EPOQUE_KINDS) {
      const f = regionFactor(b, spec, k);
      expect(f).toBeGreaterThan(0.7);
      expect(f).toBeLessThanOrEqual(1);
      expect(persoRegionRect(spec, k).v1).toBeLessThanOrEqual(0.5);
    }
    for (const k of Object.values(PALETTE_REGION_EPOQUE)) expect([...REGION_KINDS, ...EPOQUE_KINDS]).toContain(k);
  });
});

describe('fichier de choix (data/game/persos-epoque-choix.json)', () => {
  it('fichier livré : variantes valides ; retour du propriétaire : Survivant A, zombies A et B mélangés (C gardé pour la carte 3)', () => {
    const c = lireChoixEpoque(choixJson, epoque, PERSOS, SLOT);
    expect(Object.keys(c)).toEqual(PERSOS);
    for (const [k, v] of Object.entries(c)) for (const id of [v].flat()) expect(epoque.variantes.some((r) => r.id === id && r.slot === SLOT(k)), k).toBe(true);
    expect(choixJson.choix).toEqual(c);
    expect(c.survivant).toBe('epoque-A');
    // Retour du propriétaire (20/11/2026) : personnage 2 = parachutiste radio (B), tenue 1 ; tenues des personnages jouables valides.
    expect(c['personnage-2']).toBe('para-B');
    expect(choixJson.tenues).toEqual({ survivant: 'standard', 'personnage-2': 'standard' });
    for (const [k, tenue] of Object.entries(choixJson.tenues)) expect(slotOf('joueur').variants.find((v) => v.id === c[k]).outfits[0].id, k).toBe(tenue);
    for (const z of ['marcheur', 'petit', 'voute', 'grand']) expect(c[z]).toEqual(['epoque-A', 'epoque-B']);
    expect(epoque.variantes.filter((r) => r.id === 'epoque-C' && r.slot !== 'joueur')).toHaveLength(4);
  });
  it('listes : ids valides gardés dans l\'ordre, sans doublon ; un seul id valide : cet id ; liste vide ou invalide : défaut', () => {
    const r = (v) => lireChoixEpoque({ choix: { grand: v } }, epoque, ['grand']).grand;
    expect(r(['epoque-B', 'epoque-A', 'epoque-B'])).toEqual(['epoque-B', 'epoque-A']);
    expect(r(['epoque-C', 'riche', 3])).toBe('epoque-C');
    expect(r([])).toBe('epoque-A');
    expect(r(['x', null])).toBe('epoque-A');
    expect(lireChoixEpoque({ choix: { 'personnage-2': ['para-B', 'epoque-A'] } }, epoque, ['personnage-2'], SLOT)['personnage-2']).toBe('para-B');
  });
  it('personnage 2 distinct du Survivant : couleurs inversées (veste verte, pantalon clair), accessoires propres (branchages, radio, camouflage)', () => {
    const p1 = slotOf('joueur').variants.find((v) => v.id === 'epoque-A');
    const ids = (v) => new Set(resolve(v).parts.map((p) => p.id));
    for (const id of ['para-A', 'para-B', 'para-C']) {
      const v = slotOf('joueur').variants.find((x) => x.id === id);
      const diff = [...ids(v)].filter((x) => !ids(p1).has(x));
      expect(diff.length, id).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(v.palette.tenue)).not.toBe(JSON.stringify(p1.palette.tenue));
    }
    expect([...ids(slotOf('joueur').variants.find((x) => x.id === 'para-A'))].some((x) => x.startsWith('feuille'))).toBe(true);
    expect([...ids(slotOf('joueur').variants.find((x) => x.id === 'para-B'))]).toContain('radioBoite');
    expect(resolve(slotOf('joueur').variants.find((x) => x.id === 'para-C')).parts.find((p) => p.id === 'chest').palette).toBe('camo');
    expect(p1.palette.casque.jeton).toBe('--perso-tissu-gris');
  });
  it('absent, invalide ou inconnu : la première variante (A) ; le personnage 2 ne prend que ses variantes', () => {
    const def = { survivant: 'epoque-A', 'personnage-2': 'para-A', marcheur: 'epoque-A', petit: 'epoque-A', voute: 'epoque-A', grand: 'epoque-A' };
    for (const bad of [null, 'x', [], { choix: null }, { choix: { survivant: 'para-B', 'personnage-2': 'epoque-B', marcheur: 'riche', petit: 7, voute: '<b>', grand: 'epoque-Z' } }]) {
      expect(lireChoixEpoque(bad, epoque, PERSOS, SLOT)).toEqual(def);
    }
    expect(lireChoixEpoque({ choix: { grand: 'epoque-C', 'personnage-2': 'para-C' } }, epoque, PERSOS, SLOT)).toMatchObject({ grand: 'epoque-C', 'personnage-2': 'para-C', marcheur: 'epoque-A' });
    expect(lireChoixEpoque({}, null, ['marcheur'])).toEqual({ marcheur: null });
  });
  // Lot 9g (partie C, après « GO 9g ») : la table du jeu nomme « epoque » ; résolution comme en jeu (resoudreEpoque).
  it('jeu : niveau complet (?perso=choix), simple (?perso=A, Moyen et Faible), actuel pour comparer (?perso=B, C, riche), personnage joué', () => {
    const table = JSON.parse(readFileSync('data/game/persos-choix.json', 'utf8'));
    for (const p of Object.values(table.persos)) expect(p.variante).toBe('epoque');
    const all = (v) => Object.fromEntries(['joueur', 'marcheur', 'petit', 'voute', 'grand'].map((k) => [k, v]));
    const r = (perso, personnage) => resoudreEpoque({ characters, epoque, choixJson, table, perso, slots: all(perso === 'choix' ? 'epoque' : perso), personnage });
    expect(r('choix').slots).toEqual({ joueur: 'epoque-A', marcheur: 'epoque-A+epoque-B', petit: 'epoque-A+epoque-B', voute: 'epoque-A+epoque-B', grand: 'epoque-A+epoque-B' });
    expect(r('choix', 'personnage-2').slots.joueur).toBe('para-B');
    expect(r('choix', 'personnage-5').slots.joueur).toBe('epoque-A');
    expect(r('A').slots).toEqual({ joueur: 'epoque-A-simple', marcheur: 'epoque-A-simple+epoque-B-simple', petit: 'epoque-A-simple+epoque-B-simple', voute: 'epoque-A-simple+epoque-B-simple', grand: 'epoque-A-simple+epoque-B-simple' });
    for (const v of ['B', 'C', 'riche']) expect(r(v).slots).toEqual(all(v));
    expect(r('choix').tenuesJoueur).toEqual(['standard']);
    expect(resoudreEpoque({ characters, epoque: null, choixJson, table, perso: 'choix', slots: all('epoque') }).slots).toEqual(all('A'));
  });
  it('mélange A + B : douze tenues (six de chaque, palette de leur variante), pièces de chaque tenue identiques à celles de sa variante', () => {
    const r = resoudreEpoque({ characters, epoque, choixJson, table: JSON.parse(readFileSync('data/game/persos-choix.json', 'utf8')), perso: 'choix', slots: { joueur: 'epoque', marcheur: 'epoque', petit: 'epoque', voute: 'epoque', grand: 'epoque' } });
    for (const z of ['marcheur', 'petit', 'voute', 'grand']) {
      const sl = r.characters.slots.find((x) => x.id === z);
      const mix = sl.variants.find((v) => v.id === 'epoque-A+epoque-B');
      expect(mix.outfits).toHaveLength(12);
      ['epoque-A', 'epoque-B'].forEach((id, k) => {
        const v = sl.variants.find((x) => x.id === id);
        for (let o = 0; o < 6; o += 1) {
          const a = resolve(mix, { outfit: k * 6 + o });
          const b = resolve(v, { outfit: o });
          expect(a.parts.map((p) => p.id).sort()).toEqual(b.parts.map((p) => p.id).sort());
          expect(a.palette).toEqual(b.palette);
          expect(characterStats(a, { skeletons }).triangles).toBe(characterStats(b, { skeletons }).triangles);
        }
      });
      for (const k of GARDES) expect(mix[k]).toEqual(sl.variants.find((x) => x.id === 'riche')[k]);
    }
    expect(melangeEpoque([])).toBe(null);
  });
  it('projection de la scène (R1, R2, U1, U4) : personnages actuels « riche » + 10 % au plus, sous 45 000 triangles et 400 appels', () => {
    for (const [id, p] of Object.entries(project(() => 'riche', '1'))) {
      const extra = 0.1 * crowdCost(() => 'riche').triangles + 2 * 0.1 * characterCost('marcheur', 'riche').triangles;
      expect(p.triangles + extra, id).toBeLessThanOrEqual(LIMITS.refonte.triangles);
      expect(p.calls, id).toBeLessThanOrEqual(LIMITS.refonte.calls);
    }
  });
});
