import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { escapeXml, mapToSvg } from '../../js/core/map-svg.js';
import { decorCfg, deepFreeze, world, WEIRD } from './helpers/carte.js';

const oldWorld = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
const oldDecor = JSON.parse(readFileSync('data/game/decor.json', 'utf8'));
const LABELS = { title: 'Plan', desc: 'Description', scale: '500 unités', frame: '100 px du plan', start: 'Départ' };
const svg = mapToSvg(world, decorCfg, { labels: LABELS });
const count = (text, re) => (text.match(re) ?? []).length;

// Vérifie que le texte est du XML bien formé (balises appariées, entités connues seulement).
function wellFormed(text) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let rest = text;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    rest = rest.replace(m[0], '');
    last = re.lastIndex;
    if (m[4] === '/') continue;
    if (m[1] === '/') {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]);
  }
  const loose = rest.replace(/&(amp|lt|gt|quot|apos);/g, '');
  return stack.length === 0 && last === text.length && !/[<>&]/.test(loose);
}

describe('map-svg.js : carte du rez-de-chaussée', () => {
  it('sortie SVG bien formée', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(wellFormed(svg)).toBe(true);
  });

  it('huit étiquettes de fenêtre F1 à F8, en texte', () => {
    const ids = [...svg.matchAll(/<text class="fenetre-etiquette"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(ids).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
    expect(count(svg, /class="fenetre"/g)).toBe(8);
  });

  it('dix piliers, deux escaliers, aucune rampe, des meubles et 16 points d\'apparition', () => {
    expect(count(svg, /class="pilier"/g)).toBe(10);
    expect(count(svg, /class="escalier"/g)).toBe(2);
    expect(count(svg, /<rect class="rampe"/g)).toBe(0);
    expect(count(svg, /class="meuble /g)).toBe(world.obstacles.filter((o) => !['pilier', 'escalier'].includes(o.kind)).length);
    expect(count(svg, /class="apparition"/g)).toBe(16);
  });

  it('zone de départ, échelle de 500 unités et cadre de 100 px de plan (500 unités) en filigrane', () => {
    expect(svg).toContain('class="depart-zone"');
    expect(svg).toContain('r="120"');
    expect(svg).toMatch(/class="echelle-trait" x1="(\d+)" y1="(\d+)" x2="(\d+)"/);
    const [, x1, , x2] = svg.match(/class="echelle-trait" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"/);
    expect(Number(x2) - Number(x1)).toBe(500);
    expect(svg).toMatch(/class="cadre-trait" x="[\d.]+" y="[\d.]+" width="500" height="500"/);
    expect(svg).toContain('100 px du plan');
    expect(svg).toContain('500 unités');
  });

  it('les murs sont percés : une ouverture par fenêtre et des murs disjoints', () => {
    expect(count(svg, /class="mur"/g)).toBeGreaterThan(14);
  });

  it('les blocs fusionnés du monde sont signalés', () => {
    expect(count(svg, /class="bloc"/g)).toBe(world.obstacles.filter((o) => (o.parts ?? []).length > 1).length);
  });

  it('aucune couleur dans la sortie : tout passe par des classes', () => {
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|fill=|stroke=|style=/);
  });

  it('déterministe : même entrée, même chaîne', () => {
    expect(mapToSvg(world, decorCfg, { labels: LABELS })).toBe(svg);
  });
});

describe('map-svg.js : texte, options, entrées hostiles', () => {
  it('le texte est échappé (titre, étiquettes, identifiants)', () => {
    const bad = mapToSvg(world, decorCfg, { labels: { title: '<b>"&\'', desc: '</desc><x>', scale: '<', frame: '&', start: '>' } });
    expect(bad).toContain('&lt;b&gt;&quot;&amp;&apos;');
    expect(bad).not.toContain('<b>');
    expect(bad).not.toContain('<x>');
    expect(wellFormed(bad)).toBe(true);
    const inj = structuredClone(world);
    inj.windows[0].id = '<script>alert(1)</script>';
    const out = mapToSvg(inj, decorCfg, {});
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(escapeXml('a&b<c>"d\'')).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
    expect(escapeXml(null)).toBe('');
  });

  it('crop « batiment » resserre la vue ; showSpawns faux retire les points d\'apparition', () => {
    const near = mapToSvg(world, decorCfg, { crop: 'batiment', labels: LABELS });
    expect(near).toMatch(/viewBox="\d+ \d+ \d+ \d+"/);
    expect(near).not.toContain(`viewBox="0 0 ${world.size.width} ${world.size.height}"`);
    expect(svg).toContain(`viewBox="0 0 ${world.size.width} ${world.size.height}"`);
    const bare = mapToSvg(world, decorCfg, { showSpawns: false, labels: LABELS });
    expect(count(bare, /class="apparition"/g)).toBe(0);
  });

  it('sans textes : jamais « undefined » ni « null »', () => {
    const plain = mapToSvg(world, decorCfg);
    expect(plain).not.toMatch(/undefined|null|NaN/);
    expect(wellFormed(plain)).toBe(true);
  });

  it('?map=salle : l\'ancienne salle (3 fenêtres, 14 meubles), sans piliers ni escaliers', () => {
    const salle = mapToSvg(oldWorld, oldDecor, { labels: LABELS });
    expect(wellFormed(salle)).toBe(true);
    expect(count(salle, /class="fenetre-etiquette"/g)).toBe(3);
    expect(count(salle, /class="meuble /g)).toBe(14);
    expect(count(salle, /class="pilier"/g)).toBe(0);
    expect(count(salle, /class="apparition"/g)).toBe(12);
  });

  it.each(WEIRD.map((w) => [JSON.stringify(w) ?? String(w), w]))('monde hostile %s : chaîne vide, aucune exception', (_n, bad) => {
    expect(mapToSvg(bad, bad, bad)).toBe('');
  });

  it('décor ou options hostiles : le monde se dessine quand même', () => {
    for (const bad of WEIRD) expect(() => mapToSvg(world, bad, bad)).not.toThrow();
    expect(mapToSvg(world, null, null)).toContain('<svg');
  });

  it('arguments gelés : aucune modification, aucune exception', () => {
    const w = deepFreeze(structuredClone(world));
    const d = deepFreeze(structuredClone(decorCfg));
    const o = deepFreeze({ labels: { ...LABELS }, crop: 'batiment' });
    expect(() => mapToSvg(w, d, o)).not.toThrow();
    expect(w).toEqual(world);
  });
});
