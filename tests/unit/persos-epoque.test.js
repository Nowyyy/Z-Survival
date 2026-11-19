import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { characterStats, silhouetteMetrics } from '../../js/core/character-parts.js';
import { contrast } from '../../js/core/color.js';
import { NIVEAUX_EPOQUE, SUFFIXE_SIMPLE, buildEpochVariant, lireChoixEpoque, paletteColor, partRgb, resolveVariant, slotsWithEpoch } from '../../js/core/persos-variants.js';
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
  it('fichier livré : une variante valide pour chaque personnage et chaque type', () => {
    const c = lireChoixEpoque(choixJson, epoque, PERSOS, SLOT);
    expect(Object.keys(c)).toEqual(PERSOS);
    for (const [k, v] of Object.entries(c)) expect(epoque.variantes.some((r) => r.id === v && r.slot === SLOT(k)), k).toBe(true);
    expect(choixJson.choix).toEqual(c);
  });
  it('absent, invalide ou inconnu : la première variante (A) ; le personnage 2 ne prend que ses variantes', () => {
    const def = { survivant: 'epoque-A', 'personnage-2': 'para-A', marcheur: 'epoque-A', petit: 'epoque-A', voute: 'epoque-A', grand: 'epoque-A' };
    for (const bad of [null, 'x', [], { choix: null }, { choix: { survivant: 'para-B', 'personnage-2': 'epoque-B', marcheur: 'riche', petit: 7, voute: '<b>', grand: 'epoque-Z' } }]) {
      expect(lireChoixEpoque(bad, epoque, PERSOS, SLOT)).toEqual(def);
    }
    expect(lireChoixEpoque({ choix: { grand: 'epoque-C', 'personnage-2': 'para-C' } }, epoque, PERSOS, SLOT)).toMatchObject({ grand: 'epoque-C', 'personnage-2': 'para-C', marcheur: 'epoque-A' });
    expect(lireChoixEpoque({}, null, ['marcheur'])).toEqual({ marcheur: null });
  });
  it('le jeu ne lit encore aucune variante d\'époque (partie B : table du jeu inchangée)', () => {
    const table = JSON.parse(readFileSync('data/game/persos-choix.json', 'utf8'));
    for (const p of Object.values(table.persos)) expect(['A', 'B', 'C', 'riche']).toContain(p.variante);
  });
});
