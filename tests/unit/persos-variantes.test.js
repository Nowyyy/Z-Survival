import { describe, it, expect } from 'vitest';
import { characterStats, distinctness } from '../../js/core/character-parts.js';
import { contrast, luminance } from '../../js/core/color.js';
import { createRng } from '../../js/core/rng.js';
import { MACRO_IDS, formatChoices, macroValue, parseChoices, partRgb, pickOutfit, resolveVariant, wearTier } from '../../js/core/persos-variants.js';
import { PALETTE_REGION, REGION_KINDS, createPersoTexture, persoRegionRect, persoSpec, regionFactor } from '../../js/core/texgen-persos.js';
import { ZOMBIES, characters, floorsWithStains, gameView, lookup, resolve, skeletons, slotOf, tokens, variantChecks, variantMetrics } from '../../scripts/personnages/lib.mjs';

// Lot 3j-B : variantes A, B, C et « riche » des cinq personnages.
const camera = gameView();
const floors = floorsWithStains();
const all = characters.slots.flatMap((s) => s.variants.filter((v) => !v.flags?.test).map((v) => [s.id, v.id, s, v]));
const metric = new Map(all.map(([sid, vid, s, v]) => [`${sid}:${vid}`, variantMetrics(s, v, { camera, floors })]));

describe('variantes : présence, budget, contrôles', () => {
  it.each(characters.slots.map((s) => [s.id, s]))('%s : variantes A, B, C et au plus une « riche » marquée hors budget', (_id, s) => {
    const ids = s.variants.filter((v) => !v.flags?.test).map((v) => v.id);
    expect(ids.slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(ids.filter((id) => id === 'riche').length).toBeLessThanOrEqual(1);
    for (const v of s.variants.filter((x) => x.id === 'riche')) expect(v.flags.outOfBudget).toBe(true);
    for (const v of s.variants) expect(v.intent.length).toBeGreaterThan(20);
  });
  it.each(all)('%s %s : checkVariant sans violation (budget, articulations, pièces flottantes, emprise debout, hauteur, proportions)', (_s, _v, slot, v) => {
    expect(variantChecks(slot, v)).toEqual([]);
  });
  it.each(all)('%s %s : triangles, appels (≤ 4), ombre (≤ 2 appels, ≤ 64 triangles)', (_s, vid, _slot, v) => {
    const st = characterStats(resolve(v), { skeletons });
    expect(st.triangles).toBeLessThanOrEqual(vid === 'riche' ? characters.budget.richTriangles : characters.budget.triangles);
    expect(st.calls + st.shadowCalls).toBeLessThanOrEqual(4);
    expect(st.shadowCalls).toBeLessThanOrEqual(2);
    expect(st.shadowTriangles).toBeLessThanOrEqual(64);
  });
  it('architecture déclarée : os rigides', () => expect(characters.architecture).toBe('rigid'));
});

describe('lisibilité : contraste ≥ 3:1 sur chaque sol et sol taché', () => {
  it.each(all)('%s %s : toutes les tenues, usure 0 (et 3 pour les zombies)', (sid, _v, slot, v) => {
    for (let outfit = 0; outfit < v.outfits.length; outfit += 1) {
      for (const wear of sid === 'joueur' ? [0] : [0, 3]) {
        const m = variantMetrics(slot, v, { camera, floors, outfit, wear });
        for (const [k, c] of Object.entries(m.contrasts)) expect(c, `tenue ${outfit} usure ${wear} sur ${k}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('sols tachés : couleur du sol mêlée à 60 % au sang frais (--sang-frais), restée sombre (luminance < 0,1)', () => {
    for (const k of ['carrelage', 'herbe', 'route', 'escalier']) {
      floors[`${k}-tache`].forEach((c, i) => expect(Math.abs(c - (floors[k][i] + (lookup('--sang-frais')[i] - floors[k][i]) * 0.6))).toBeLessThanOrEqual(1));
      expect(luminance(floors[`${k}-tache`])).toBeLessThan(0.1);
    }
  });
  it('le joueur C a une couleur dominante contrastée avec tous les sols (jeton --perso-joueur-vif)', () => {
    for (const f of Object.values(floors)) expect(contrast(lookup('--perso-joueur-vif'), f)).toBeGreaterThanOrEqual(3);
  });
});

describe('silhouettes distinctes à l\'échelle du jeu', () => {
  const pairs = ['A', 'B', 'C'].flatMap((l) => ZOMBIES.flatMap((a, i) => ZOMBIES.slice(i + 1).map((b) => [l, a, b])));
  it.each(pairs)('variante %s : %s et %s diffèrent d\'au moins 12 % (C : 20 %) en aire ou en aspect', (l, a, b) => {
    const d = distinctness(metric.get(`${a}:${l}`), metric.get(`${b}:${l}`));
    expect(d.max).toBeGreaterThanOrEqual(l === 'C' ? 0.2 : 0.12);
  });
  it('ordre des aires : petit < marcheur < voûté < grand pour chaque intention', () => {
    for (const l of ['A', 'B', 'C']) {
      const areas = ZOMBIES.map((z) => metric.get(`${z}:${l}`).area);
      expect(areas[1]).toBeLessThan(areas[0]);
      expect(areas[0]).toBeLessThan(areas[2]);
      expect(areas[2]).toBeLessThan(areas[3]);
    }
  });
  it('les silhouettes mesurées sont finies et positives', () => {
    for (const m of metric.values()) {
      expect(m.area).toBeGreaterThan(50);
      expect(Number.isFinite(m.aspect) && m.aspect > 0).toBe(true);
    }
  });
});

describe('types : identité conservée, petit adulte', () => {
  it('échelles par type : petit < voûté < marcheur < grand (proportions du jeu)', () => {
    for (const l of ['A', 'B', 'C']) {
      const sc = Object.fromEntries(ZOMBIES.map((z) => [z, slotOf(z).variants.find((v) => v.id === l).scale]));
      expect(sc.petit).toBeLessThan(sc.voute);
      expect(sc.voute).toBeLessThan(sc.marcheur);
      expect(sc.marcheur).toBeLessThan(sc.grand);
    }
  });
  it.each(slotOf('petit').variants.map((v) => [v.id, v]))('petit %s : tête entre 1/8,5 et 1/6,5 de la hauteur (proportions adultes)', (_id, v) => {
    expect(variantChecks(slotOf('petit'), v).filter((x) => x.code === 'proportions-petit')).toEqual([]);
  });
  it('voûté : posture penchée (colonne et poitrine) ; les autres types droits', () => {
    for (const v of slotOf('voute').variants) expect(v.posture.spine[0] + v.posture.chest[0]).toBeGreaterThan(0.8);
    for (const v of slotOf('marcheur').variants.filter((x) => x.id === 'A')) expect(v.posture.spine ?? [0]).toEqual([0]);
  });
  it('B : bras longs (bras et avant-bras plus longs que A)', () => {
    for (const z of ZOMBIES) {
      const b = slotOf(z).variants.find((v) => v.id === 'B').joints;
      expect(Math.abs(b.elbowL[1])).toBeGreaterThan(10);
      expect(Math.abs(b.wristL[1])).toBeGreaterThan(9);
    }
  });
  it('C : un accessoire identifiant par type (sac, capuche, chaînes, casque)', () => {
    const has = (z, re) => slotOf(z).variants.find((v) => v.id === 'C').parts.some((p) => re.test(p.id));
    expect(has('marcheur', /^pack/)).toBe(true);
    expect(has('petit', /^hood/)).toBe(true);
    expect(has('voute', /^chain/)).toBe(true);
    expect(has('grand', /^helmet/)).toBe(true);
  });
  it('joueur B : lampe frontale à matière émissive (un appel de plus), joueur A : sac à dos et genouillères', () => {
    const b = slotOf('joueur').variants.find((v) => v.id === 'B');
    expect(b.parts.find((p) => p.id === 'lamp').material).toBe('glow');
    const a = slotOf('joueur').variants.find((v) => v.id === 'A');
    expect(a.parts.some((p) => p.id === 'pack') && a.parts.some((p) => p.id === 'kneeL')).toBe(true);
  });
  it('points d\'attache du sang : tête, torse avant et dos, épaules, mains sur des articulations existantes', () => {
    const ids = new Set(skeletons.v2.joints.map((j) => j.id));
    for (const [, , , v] of all) {
      expect(Object.keys(v.anchors)).toEqual(['tete', 'torseAvant', 'torseDos', 'epauleL', 'epauleR', 'mainL', 'mainR']);
      for (const a of Object.values(v.anchors)) expect(ids.has(a.joint)).toBe(true);
    }
  });
});

describe('tenues, usure, macros', () => {
  it.each(all.filter(([sid]) => sid !== 'joueur'))('%s %s : 6 tenues aux palettes toutes différentes', (_s, _v, _slot, v) => {
    expect(v.outfits).toHaveLength(6);
    expect(new Set(v.outfits.map((o) => JSON.stringify(o.palette))).size).toBe(6);
    for (const o of v.outfits) for (const t of Object.values(o.palette)) expect(tokens[t], t).toBeDefined();
  });
  it.each(['A', 'B', 'C'])('joueur %s : 3 palettes (préparation des skins du lot 11)', (l) => expect(slotOf('joueur').variants.find((v) => v.id === l).outfits).toHaveLength(3));
  it('pickOutfit : jamais deux tenues identiques à la suite, toutes utilisées, déterministe', () => {
    let rng = createRng(42);
    let last = null;
    const seen = new Set();
    const seq = [];
    for (let i = 0; i < 300; i += 1) {
      const r = pickOutfit(rng, 6, last);
      expect(r.index).not.toBe(last);
      seen.add(r.index);
      seq.push(r.index);
      rng = r.rng;
      last = r.index;
    }
    expect(seen.size).toBe(6);
    let rng2 = createRng(42);
    let last2 = null;
    const again = seq.map(() => {
      const r = pickOutfit(rng2, 6, last2);
      rng2 = r.rng;
      last2 = r.index;
      return r.index;
    });
    expect(again).toEqual(seq);
    expect(pickOutfit(createRng(1), 1, 0).index).toBe(0);
  });
  it.each([[1, 0], [10, 0], [11, 1], [20, 1], [21, 2], [30, 2], [31, 3], [40, 3], [99, 3], [0, 0], [NaN, 0]])('manche %f : palier d\'usure %i', (w, t) => expect(wearTier(w, characters.wearByWave)).toBe(t));
  it('4 paliers d\'usure distincts : salissure et déchirures croissantes, couleurs différentes', () => {
    expect(characters.wearTiers).toHaveLength(4);
    const v = slotOf('marcheur').variants[0];
    const cols = [0, 1, 2, 3].map((w) => partRgb({ palette: 'tenue', cloth: true }, resolve(v, { wear: w }), lookup, { averageTears: true }).join(','));
    expect(new Set(cols).size).toBe(4);
    for (let i = 1; i < 4; i += 1) expect(characters.wearTiers[i].dirt).toBeGreaterThan(characters.wearTiers[i - 1].dirt);
  });
  it('macros : 5 curseurs (taille ±8 %, carrure, usure, teinte, posture), min < défaut < max', () => {
    for (const [, , , v] of all) {
      expect(Object.keys(v.macros)).toEqual(MACRO_IDS);
      for (const m of Object.values(v.macros)) expect(m.min < m.default && m.default < m.max).toBe(true);
      expect(Math.abs(v.macros.taille.max * v.macros.taille.step)).toBeCloseTo(0.08, 9);
    }
  });
  it.each(all)('%s %s : macros aux limites et au centre sans NaN', (_s, _v, _slot, v) => {
    for (const k of [-2, 0, 2]) {
      const res = resolveVariant(v, { macros: Object.fromEntries(MACRO_IDS.map((id) => [id, k])), wearTiers: characters.wearTiers, wear: 1 });
      const st = characterStats(res, { skeletons });
      expect(Number.isFinite(st.rest.height) && st.rest.height > 40).toBe(true);
      expect(Number.isFinite(res.scale)).toBe(true);
    }
  });
  it('macroValue borne et arrondit ; valeur absente : le défaut', () => {
    const d = { min: -2, max: 2, default: 0 };
    expect([macroValue(d, 5), macroValue(d, -9), macroValue(d, 1.4), macroValue(d, undefined), macroValue(null, 'x')]).toEqual([2, -2, 1, 0, 0]);
  });
  it('carrure élargit les épaules ; taille change l\'échelle de 4 % par pas', () => {
    const v = slotOf('marcheur').variants[0];
    const wide = resolveVariant(v, { macros: { carrure: 2 } });
    expect(wide.joints.shoulderL[0]).toBeGreaterThan(v.joints.shoulderL[0]);
    expect(resolveVariant(v, { macros: { taille: 2 } }).scale).toBeCloseTo(v.scale * 1.08, 9);
  });
  it('les pièces facultatives d\'une tenue n\'apparaissent qu\'avec elle', () => {
    const v = slotOf('petit').variants.find((x) => x.id === 'A');
    expect(resolveVariant(v, { outfit: 0 }).parts.some((p) => p.id === 'cap')).toBe(false);
    expect(resolveVariant(v, { outfit: 1 }).parts.some((p) => p.id === 'cap')).toBe(true);
  });
  it('resolveVariant ne modifie pas la variante (gelée acceptée)', () => {
    const v = structuredClone(slotOf('grand').variants[1]);
    const snap = JSON.stringify(v);
    resolveVariant(Object.freeze(v), { macros: { carrure: 2, posture: 2 }, outfit: 3, wear: 2 });
    expect(JSON.stringify(v)).toBe(snap);
  });
});

describe('« Mes choix » : format texte', () => {
  it('une ligne par personnage puis sang=…', () => {
    const text = formatChoices([{ perso: 'marcheur', variante: 'B', taille: 1, carrure: 0, usure: 2, teinte: -1, tenue: 3, style: 'B', amplitude: 1 }, { perso: 'joueur', variante: 'C' }], { sang: 'reduit' });
    expect(text).toBe('perso=marcheur;variante=B;taille=+1;carrure=0;usure=+2;teinte=-1;tenue=+3;style=B;amplitude=+1\nperso=joueur;variante=C\nsang=reduit');
  });
  it('lecture : retrouve les valeurs (nombres signés compris)', () => {
    const r = parseChoices('perso=grand;variante=B;carrure=-2\nsang=1');
    expect(r.persos).toEqual([{ perso: 'grand', variante: 'B', carrure: -2 }]);
    expect(r.extra).toEqual({ sang: 1 });
  });
  it('entrées hostiles : balises, guillemets, clés inconnues longues, texte géant, non-chaînes : ignorées sans exception', () => {
    expect(formatChoices([{ perso: '<script>', 'x y': 1, variante: 'A' }], { sang: '"1"' })).toBe('variante=A');
    expect(parseChoices('perso=<b>;variante=A\n;;==;\nperso=a=b').persos).toEqual([]);
    expect(parseChoices(42)).toEqual({ persos: [], extra: {} });
    expect(() => parseChoices('perso=a;'.repeat(100000))).not.toThrow();
    expect(formatChoices(null)).toBe('');
  });
});

describe('textures des personnages', () => {
  const zombieSpec = persoSpec({ size: 256, tiles: 2, seed: 3, blood: [lookup('--sang-frais'), lookup('--sang-sec')] });
  const tex = createPersoTexture(zombieSpec);
  it('zombies ≤ 512 × 512, joueur ≤ 256 × 256 ; mémoire totale estimée ≤ 4 Mo (4 types + joueur + sang 256)', () => {
    expect(zombieSpec.size).toBeLessThanOrEqual(characters.budget.zombieTexture);
    const player = createPersoTexture(persoSpec({ size: 128, tiles: 1 }));
    expect(player.width).toBeLessThanOrEqual(characters.budget.playerTexture);
    const total = 4 * tex.bytes + player.bytes + Math.round((256 * 256 * 4 * 4) / 3);
    expect(total).toBeLessThanOrEqual(characters.budget.textureBytes);
  });
  it('déterministe, sans NaN, opaque', () => {
    expect(createPersoTexture(zombieSpec).data).toEqual(tex.data);
    for (let i = 3; i < tex.data.length; i += 4 * 97) expect(tex.data[i]).toBe(255);
  });
  it('chaque clé de palette a sa région ; facteurs de détail entre 0,7 et 1', () => {
    for (const k of Object.values(PALETTE_REGION)) expect(REGION_KINDS).toContain(k);
    for (const k of REGION_KINDS) {
      const f = regionFactor(tex, zombieSpec, k);
      expect(f).toBeGreaterThan(0.7);
      expect(f).toBeLessThanOrEqual(1);
      const r = persoRegionRect(zombieSpec, k);
      expect(r.u1).toBeLessThanOrEqual(0.5);
      expect(r.v1).toBeLessThanOrEqual(0.5);
    }
  });
  it('les tuiles de blessure 1 à 3 contiennent de plus en plus de pixels rouges (sang), la tuile 0 aucun', () => {
    const red = (tx, ty) => {
      let n = 0;
      for (let y = ty * 128; y < ty * 128 + 128; y += 1) for (let x = tx * 128; x < tx * 128 + 128; x += 1) {
        const i = (y * 256 + x) * 4;
        if (tex.data[i] > tex.data[i + 1] + 30) n += 1;
      }
      return n;
    };
    const counts = [red(0, 0), red(1, 0), red(0, 1), red(1, 1)];
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
  });
});
