import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { FORMAT, VERSIONS, macroSpec, nextVersion, renderVariant, resolveAtelier } from '../../js/core/synth2.js';
import { checkTargets, measureSound } from '../../js/core/atelier-check.js';
import { edgeClicks, peak, spectralDistance } from '../../js/core/audio-analysis.js';
import { CACHE_LIMIT, cacheBytes, cacheGet, cacheKeys, cachePut, createCache } from '../../js/core/sound-cache.js';
import { MAX_POINTS, waveToSvg } from '../../js/core/wave-svg.js';
import { parseChoices, serializeChoices } from '../../js/core/atelier-choices.js';
import { parseEntry } from '../../js/lots.js';

// Lot 3h-B : variantes de la priorité 1 (data/game/sounds-atelier.json) et page d'écoute atelier-sons.html.
const raw = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
const data = resolveAtelier(raw);
const p1 = data.slots.filter((s) => s.priority === 1);
const pairs = p1.flatMap((s) => s.variants.map((v) => [s.id, v.id]));
const slotOf = (id) => data.slots.find((s) => s.id === id);
const rendered = new Map();
const renderOnce = (slotId, variant, seed = 1, macros = {}) => {
  const key = `${slotId}|${variant}|${seed}|${JSON.stringify(macros)}`;
  if (!rendered.has(key)) rendered.set(key, renderVariant(slotOf(slotId), variant, macros, seed));
  return rendered.get(key);
};
const dict = JSON.parse(readFileSync('data/i18n/atelier-sons.json', 'utf8'));
const pageSources = [readFileSync('atelier-sons.html', 'utf8'), ...readdirSync('js/atelier-sons').map((f) => readFileSync(`js/atelier-sons/${f}`, 'utf8')), readFileSync('data/game/sounds-atelier.json', 'utf8')].join('\n');

describe('priorité 1 : variantes par défaut dans leurs cibles', () => {
  it('chaque emplacement de priorité 1 a au moins trois variantes A, B, C', () => {
    expect(p1.length).toBeGreaterThanOrEqual(31);
    for (const s of p1) expect(s.variants.map((v) => v.id).slice(0, 3), s.id).toEqual(['A', 'B', 'C']);
  });

  it.each(pairs)('%s %s : dans ses cibles (macros par défaut, version 1), ou marquée outOfTarget avec mesure et raison', (slotId, variant) => {
    const slot = slotOf(slotId);
    const v = slot.variants.find((x) => x.id === variant);
    const r = renderOnce(slotId, variant);
    const m = measureSound(r.samples, r.sampleRate, slot, raw.levelRef);
    const c = checkTargets(m, slot.target, raw.levelRef.tolerance);
    if (v.outOfTarget) {
      expect(typeof v.outOfTarget.reason).toBe('string');
      expect(c.ok).toBe(false);
    } else expect(c.items.filter((i) => !i.ok)).toEqual([]);
  });
});

describe('variantes distinctes', () => {
  it('le seuil de distinction est dans les données et justifié', () => {
    expect(raw.distinctness.threshold).toBeGreaterThan(0);
    expect(raw.distinctness.note).toMatch(/médiane/);
  });

  it.each(p1.map((s) => s.id))('%s : A, B et C diffèrent deux à deux (distance spectrale au-dessus du seuil)', (slotId) => {
    const ids = slotOf(slotId).variants.map((v) => v.id);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const d = spectralDistance(renderOnce(slotId, ids[i]).samples, renderOnce(slotId, ids[j]).samples, FORMAT.sampleRate);
        expect(d, `${ids[i]}-${ids[j]}`).toBeGreaterThan(raw.distinctness.threshold);
      }
    }
  });
});

describe('cinq versions par son', () => {
  it.each(p1.map((s) => s.id))('%s : les cinq versions de la variante A sont toutes différentes, durées dans les bornes, sans clic ni NaN', (slotId) => {
    const slot = slotOf(slotId);
    const bufs = [1, 2, 3, 4, 5].map((seed) => renderOnce(slotId, 'A', seed).samples);
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) expect(Buffer.from(bufs[i].buffer).equals(Buffer.from(bufs[j].buffer))).toBe(false);
      const d = bufs[i].length / FORMAT.sampleRate;
      expect(d).toBeGreaterThanOrEqual(slot.target.duration[0]);
      expect(d).toBeLessThanOrEqual(slot.target.duration[1]);
      expect(bufs[i].every(Number.isFinite)).toBe(true);
      expect(edgeClicks(bufs[i]).click).toBe(false);
    }
  });

  it('tirage des versions : cinq versions, jamais la même deux fois de suite, mémoire par emplacement', () => {
    expect(raw.page.versions).toBe(VERSIONS);
    let state = { rng: 7, last: {} };
    const last = {};
    for (let k = 0; k < 300; k += 1) {
      const key = ['pas-joueur-dur:A', 'voix-grand-mort:B'][k % 2];
      const r = nextVersion(state, key, VERSIONS);
      expect(r.version).not.toBe(last[key]);
      last[key] = r.version;
      state = r.state;
    }
  });
});

describe('macros aux limites', () => {
  it('chaque variante expose cinq macros (min ≤ défaut ≤ max)', () => {
    for (const s of p1) for (const v of s.variants) for (const id of ['hauteur', 'matiere', 'grain', 'duree', 'ampleur']) {
      const m = v.macros[id];
      expect(m.min <= m.default && m.default <= m.max, `${s.id} ${v.id} ${id}`).toBe(true);
    }
  });

  it.each(p1.map((s) => s.id))('%s : macros au minimum, au centre et au maximum : ni NaN, ni dépassement de ±0,98, bouts nuls', (slotId) => {
    const v = slotOf(slotId).variants[1];
    const at = (k) => Object.fromEntries(['hauteur', 'matiere', 'grain', 'duree', 'ampleur'].map((id) => {
      const s = macroSpec(v, id);
      return [id, s.min + (s.max - s.min) * k];
    }));
    for (const k of [0, 0.5, 1]) {
      const r = renderVariant(slotOf(slotId), v.id, at(k), 2);
      expect(r.samples.length).toBeGreaterThan(0);
      expect(r.samples.every(Number.isFinite)).toBe(true);
      expect(peak(r.samples)).toBeLessThanOrEqual(0.98);
      expect(edgeClicks(r.samples).click).toBe(false);
    }
  });

  it('hauteur plus basse -> fondamentale plus basse (voix du marcheur)', () => {
    const slot = slotOf('voix-marcheur-errance');
    const f = (h) => measureSound(renderVariant(slot, 'A', { hauteur: h }, 1).samples, FORMAT.sampleRate, slot, raw.levelRef).f0;
    expect(f(-4)).toBeLessThan(f(0) * 0.85);
  });
});

describe('réparation adaptable', () => {
  it.each([[0.4, 2], [0.8, 3], [1.2, 4], [1.8, 5]])('réparation de %s s : durée exacte et %i coups mesurés', (d, hits) => {
    const slot = slotOf('reparation');
    const r = renderVariant(slot, 'A', { duree: d }, 1);
    expect(Math.abs(r.samples.length - d * FORMAT.sampleRate)).toBeLessThanOrEqual(1);
    expect(measureSound(r.samples, r.sampleRate, slot, raw.levelRef).hits).toBe(hits);
  });

  it('la durée de la réparation est en secondes, de 0,4 à 1,8 s, 1,8 s par défaut (niveau 0 de la statistique reparation)', () => {
    for (const v of slotOf('reparation').variants) expect(v.macros.duree).toEqual({ min: 0.4, max: 1.8, default: 1.8, unit: 's' });
  });
});

describe('format et poids', () => {
  it('chaque tampon est au format du jeu : Float32 mono à 22 050 Hz, 4 octets par échantillon', () => {
    for (const [slotId, variant] of pairs) {
      const r = renderOnce(slotId, variant);
      expect(r.samples).toBeInstanceOf(Float32Array);
      expect(r.sampleRate).toBe(22050);
      expect(r.bytes).toBe(r.samples.length * 4);
    }
  });
});

describe('cache des tampons (24 Mo)', () => {
  it('limite par défaut : 24 Mo', () => {
    expect(CACHE_LIMIT).toBe(24 * 1024 * 1024);
    expect(createCache().limit).toBe(CACHE_LIMIT);
    expect(raw.page.cacheMb).toBe(24);
  });

  it('éviction des entrées les moins récemment utilisées', () => {
    let c = createCache(100);
    c = cachePut(c, 'a', 1, 40).cache;
    c = cachePut(c, 'b', 2, 40).cache;
    c = cacheGet(c, 'a').cache;
    const r = cachePut(c, 'c', 3, 40);
    expect(r.evicted).toEqual(['b']);
    expect(cacheKeys(r.cache)).toEqual(['a', 'c']);
    expect(cacheBytes(r.cache)).toBe(80);
  });

  it('jamais au-delà de la limite ; une entrée trop grosse n\'est pas gardée ; l\'état d\'origine est intact', () => {
    let c = createCache(1000);
    for (let i = 0; i < 50; i += 1) {
      c = cachePut(c, `k${i}`, i, 97).cache;
      expect(cacheBytes(c)).toBeLessThanOrEqual(1000);
    }
    const before = cacheKeys(c);
    const r = cachePut(c, 'big', 0, 5000);
    expect(r.evicted).toEqual(['big']);
    expect(cacheKeys(c)).toEqual(before);
  });

  it('lecture absente et entrées hostiles sans exception', () => {
    expect(cacheGet(createCache(), 'x').value).toBe(null);
    expect(() => cachePut(null, 'x', 1, Number.NaN)).not.toThrow();
    expect(cacheGet(undefined, 'x').value).toBe(null);
  });
});

describe('oscillogramme SVG', () => {
  it('200 points au plus, chemin fermé, cadre demandé', () => {
    const w = waveToSvg(renderOnce('voix-grand-mort', 'A').samples, { width: 200, height: 48 });
    expect(w.points).toBeLessThanOrEqual(MAX_POINTS);
    expect(w.d.startsWith('M')).toBe(true);
    expect(w.d.endsWith('Z')).toBe(true);
    expect(w.d).not.toMatch(/NaN|Infinity/);
  });

  it('tampon vide ou hostile : une ligne médiane, sans exception', () => {
    expect(waveToSvg(new Float32Array(0)).d).toBe('M0 24H200');
    expect(() => waveToSvg(null, { width: Number.NaN, points: -3 })).not.toThrow();
    expect(waveToSvg([Number.NaN, 2, -2]).d).not.toMatch(/NaN/);
  });

  it('déterministe et sans couleur', () => {
    const x = renderOnce('pas-joueur-dur', 'B').samples;
    expect(waveToSvg(x)).toEqual(waveToSvg(x));
    expect(readFileSync('js/core/wave-svg.js', 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });
});

describe('« Mes choix »', () => {
  it('une ligne par emplacement au format emplacement=variante(hauteur=…,matiere=…,grain=…,duree=…,ampleur=…)', () => {
    const text = serializeChoices({ 'pas-joueur-dur': { variant: 'B', macros: { hauteur: -2, ampleur: 0.3 } }, 'voix-grand-mort': { variant: 'C', macros: {} } }, data.slots);
    expect(text.split('\n')).toEqual(['pas-joueur-dur=B(hauteur=-2,matiere=0,grain=1,duree=1,ampleur=0.3)', 'voix-grand-mort=C(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0)']);
  });

  it('se relit à l\'identique (aller-retour)', () => {
    const choices = { reparation: { variant: 'A', macros: { hauteur: 1, matiere: -0.5, grain: 1.2, duree: 0.8, ampleur: 0.15 } } };
    const text = serializeChoices(choices, data.slots);
    expect(parseChoices(text, data.slots)).toEqual({ choices, errors: [] });
  });
});

describe('données et textes de la page', () => {
  it('aucun identifiant de variante en double dans un emplacement ; groupes connus', () => {
    const groups = raw.groups.map((g) => g.id);
    for (const s of raw.slots) {
      expect(new Set(s.variants.map((v) => v.id)).size, s.id).toBe(s.variants.length);
      expect(groups, s.id).toContain(s.group);
    }
  });

  it('toutes les clés de texte des données existent (emplacements, notes, variantes, groupes, références)', () => {
    const keys = [...raw.slots.flatMap((s) => [s.label, s.currentNote, ...s.variants.map((v) => v.label)]), ...raw.groups.map((g) => g.label), ...raw.references.map((r) => r.label)].filter(Boolean);
    for (const k of keys) expect(dict[k], k).toBeDefined();
  });

  it('textes en français dans un fichier séparé, aucune clé vide ni orpheline', () => {
    for (const [k, v] of Object.entries(dict)) {
      expect(k.startsWith('dev.atelier.'), k).toBe(true);
      expect(v.trim(), k).not.toBe('');
      const prefix = k.slice(0, k.lastIndexOf('.') + 1);
      expect(pageSources.includes(`'${k}'`) || pageSources.includes(`"${k}"`) || pageSources.includes(`${prefix}\${`), k).toBe(true);
    }
  });

  it('chaque clé demandée par la page existe', () => {
    for (const m of pageSources.matchAll(/t\('(dev\.atelier\.[\w.-]+)'/g)) expect(dict[m[1]], m[1]).toBeDefined();
    for (const m of readFileSync('atelier-sons.html', 'utf8').matchAll(/data-i18n="([^"]+)"/g)) expect(dict[m[1]], m[1]).toBeDefined();
  });

  it('page technique : lang="fr", noindex, noscript, aucune ressource externe, aucun style en ligne, aucun identifiant en double', () => {
    const html = readFileSync('atelier-sons.html', 'utf8');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toMatch(/<noscript>[\s\S]*Cette page a besoin de JavaScript[\s\S]*<\/noscript>/);
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
    expect(html).not.toMatch(/\sstyle="/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('href="sons.html"');
  });

  it('la page n\'enregistre rien : ni localStorage, ni sessionStorage, ni cookie, ni indexedDB', () => {
    for (const f of readdirSync('js/atelier-sons')) expect(readFileSync(`js/atelier-sons/${f}`, 'utf8'), f).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it('aucune couleur en dur dans css/atelier-sons.css ni dans js/atelier-sons/', () => {
    const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;
    expect(readFileSync('css/atelier-sons.css', 'utf8')).not.toMatch(COLOR);
    for (const f of readdirSync('js/atelier-sons')) expect(readFileSync(`js/atelier-sons/${f}`, 'utf8'), f).not.toMatch(COLOR);
  });

  it('cibles tactiles de 44 px dans la feuille de style (boutons, curseurs, favoris, liens)', () => {
    const css = readFileSync('css/atelier-sons.css', 'utf8');
    expect((css.match(/min-height: var\(--touch-target\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(css).toMatch(/\.atelier-range \{[^}]*height: var\(--touch-target\)/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it('?test=1 seul expose window.__zsSons', () => {
    const main = readFileSync('js/atelier-sons/main.js', 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(main).toMatch(/if \(testMode\) \{\s*window\.__zsSons/);
    expect((main.match(/__zsSons/g) ?? []).length).toBe(1);
    expect(main).toMatch(/const testMode = query\.get\('test'\) === '1';/);
  });

  it('apercu.txt désigne atelier-sons.html (première ligne acceptée par le mécanisme d\'aperçu)', () => {
    const text = readFileSync('apercu.txt', 'utf8');
    expect(parseEntry(text)).toBe('atelier-sons.html');
    expect(text).toMatch(/type: hifi/);
    expect(text).toMatch(/titre: Atelier des sons/);
  });

  it('npm run build copie la page, sa feuille et son code', () => {
    const build = readFileSync('scripts/build.mjs', 'utf8');
    expect(build).toContain("'atelier-sons.html'");
    expect(existsSync('css/atelier-sons.css') && existsSync('js/atelier-sons/main.js')).toBe(true);
  });
});
