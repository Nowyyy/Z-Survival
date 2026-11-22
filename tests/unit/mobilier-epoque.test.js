// Lot 9j : mobilier de 1942 (js/core/mobilier-epoque.js, js/core/mobilier-epoque-atlas.js) — dessin seulement.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ASPECTS, CORPS, DEFAUTS, ECART_MAX, HAUTEUR_ARME, HAUTEUR_MAX, MATIERES, VARIANTES, aspectDuLook, cadre, ciblesMobilier, ecarts, entreesMobilier, lireChoix,
  modeleMeuble, ouvertureDe, piecesEpoque, specsMobilier, VARIANTES_ESCALIER, DEFAUT_ESCALIER, modeleEscalier,
} from '../../js/core/mobilier-epoque.js';
import { rubbleBoxes } from '../../js/core/portes-aspect.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { ATLAS_TAILLE, GLYPHES, REGIONS, TEXTES, atlasMobilier, regionUv, surTexte } from '../../js/core/mobilier-epoque-atlas.js';
import { segmentRects } from '../../js/core/shape.js';

const D = 'data/game/maps/rez-de-chaussee/';
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const mobilier = lire(`${D}mobilier.world.json`);
const world = lire(`${D}world.json`);
const etage = lire(`${D}etage.world.json`);
const tirs = lire(`${D}tirs.world.json`);
const feux = lire(`${D}feux.json`).feux;
const decor = lire(`${D}decor.json`);
const params = lire('data/game/maps/params.json');
const remplaces = new Set((decor.interieur?.objets ?? []).filter((o) => o.remplace).map((o) => `${o.floor}:${o.remplace}`));
const base = { pieces: mobilier.pieces, obstacles: { rdc: world.obstacles, etage: etage.obstacles }, murs: { rdc: segmentRects(world.walls, params.wallThickness), etage: segmentRects(etage.walls, params.wallThickness) }, tirs: { rdc: tirs.rdc.ids, etage: tirs.etage.ids }, feux, remplaces };
const specs = specsMobilier(base);
const effectif = (m) => m.compte.corps + m.compte.details; // triangles comptés par renderer.info (mesure du lot : l'ombre ne les double pas)
const ancien = (id) => mobilier.pieces[id].boxes.reduce((s, b) => s + (b.faces === 'cotes' ? 8 : 10), 0);
const dansRect = (m, r) => [...m.corps, ...m.details].every((t) => t.p.every((p) => p[0] >= r.x - 1e-6 && p[0] <= r.x + r.w + 1e-6 && p[2] >= r.y - 1e-6 && p[2] <= r.y + r.h + 1e-6 && p[1] >= -1e-6));

describe('pièces concernées et rectangles cibles', () => {
  it('39 pièces du lot 3g (les tables P12 et Q4 du lot 9i exclues), aspects proposés du relevé', () => {
    const ids = specs.map((s) => s.id).sort();
    expect(ids).toHaveLength(39);
    expect(ids).not.toContain('P12');
    expect(ids).not.toContain('Q4');
    const de = (a) => specs.filter((s) => s.aspectPropose === a).map((s) => s.id).sort();
    expect(de('caisses')).toEqual(['E2', 'M1', 'M10', 'M26', 'M29', 'M32', 'M7', 'P10', 'P13', 'P5', 'P9', 'Q2', 'Q5', 'Q6']);
    expect(de('gravats')).toEqual(['P3', 'P6', 'P7', 'P8']);
    expect(de('etagere')).toEqual(['P1', 'P11', 'P2', 'P4', 'Q1', 'R-G37', 'R-G39']);
    expect(de('renversee')).toEqual(['M22', 'Q3']);
    expect(de('classeur')).toEqual(['M12', 'M15', 'M17', 'M18', 'M19', 'M21']);
    expect(de('bureau')).toEqual(['M3', 'M4']);
    expect(de('tabouret')).toEqual(['M34']);
    expect(de('comptoir')).toEqual(['M33', 'M35']);
    expect(de('muret')).toEqual(['E1']);
  });

  it('chaque rectangle cible est dans la collision de sa pièce, contient le dessin du lot 3g, et ne recouvre aucune autre pièce du même étage', () => {
    for (const s of specs) {
      const o = base.obstacles[s.floor].find((q) => q.id === s.obstacle);
      expect(s.collision, s.id).toEqual({ x: o.x, y: o.y, w: o.w, h: o.h });
      expect(s.rect.x, s.id).toBeGreaterThanOrEqual(o.x - 0.05);
      expect(s.rect.y, s.id).toBeGreaterThanOrEqual(o.y - 0.05);
      expect(s.rect.x + s.rect.w, s.id).toBeLessThanOrEqual(o.x + o.w + 0.05);
      expect(s.rect.y + s.rect.h, s.id).toBeLessThanOrEqual(o.y + o.h + 0.05);
      expect(s.rect.x, s.id).toBeLessThanOrEqual(s.depart.x + 0.05);
      expect(s.rect.x + s.rect.w, s.id).toBeGreaterThanOrEqual(s.depart.x + s.depart.w - 0.05);
      for (const q of specs) {
        if (q === s || q.floor !== s.floor) continue;
        const ox = Math.min(s.rect.x + s.rect.w, q.rect.x + q.rect.w) - Math.max(s.rect.x, q.rect.x);
        const oy = Math.min(s.rect.y + s.rect.h, q.rect.y + q.rect.h) - Math.max(s.rect.y, q.rect.y);
        expect(ox > 0.11 && oy > 0.11, `${s.id} / ${q.id}`).toBe(false);
      }
    }
  });

  it('les collisions des pièces sont dessinées : chaque bord d\'une collision touche le rectangle d\'une de ses pièces (plus de bord vide de 6 et plus)', () => {
    const parObstacle = new Map();
    for (const s of specs) parObstacle.set(`${s.floor}:${s.obstacle}`, [...(parObstacle.get(`${s.floor}:${s.obstacle}`) ?? []), s.rect]);
    for (const [k, rects] of parObstacle) {
      const [f, id] = k.split(':');
      const o = base.obstacles[f].find((q) => q.id === id);
      const x0 = Math.min(...rects.map((r) => r.x));
      const x1 = Math.max(...rects.map((r) => r.x + r.w));
      const y0 = Math.min(...rects.map((r) => r.y));
      const y1 = Math.max(...rects.map((r) => r.y + r.h));
      // Bords laissés par une pièce voisine plus grande (M1 contre M3) : tolérés s'ils sont couverts par une autre pièce du même étage.
      const couvert = (x, y) => specs.some((s) => s.floor === f && x >= s.rect.x - 0.1 && x <= s.rect.x + s.rect.w + 0.1 && y >= s.rect.y - 0.1 && y <= s.rect.y + s.rect.h + 0.1);
      const milieuX = o.x + o.w / 2;
      const milieuY = o.y + o.h / 2;
      if (x0 - o.x >= 6) expect(couvert(o.x + 1, milieuY), `${k} ouest`).toBe(true);
      if (o.x + o.w - x1 >= 6) expect(couvert(o.x + o.w - 1, milieuY), `${k} est`).toBe(true);
      if (y0 - o.y >= 6) expect(couvert(milieuX, o.y + 1), `${k} nord`).toBe(true);
      if (o.y + o.h - y1 >= 6) expect(couvert(milieuX, o.y + o.h - 1), `${k} sud`).toBe(true);
    }
  });

  it('ciblesMobilier et entreesMobilier sont sûrs sur des entrées inattendues', () => {
    expect(ciblesMobilier(null)).toEqual({});
    expect(ciblesMobilier([{ id: 'x' }, null, { id: 'a', floor: 'rdc', obstacle: { x: 0, y: 0, w: 10, h: 10 } }])).toEqual({ a: { x: 0, y: 0, w: 10, h: 10 } });
    expect(entreesMobilier(null)).toEqual([]);
    expect(ouvertureDe(null)).toBe('s');
    expect(ouvertureDe({ x: 0, y: 0, w: 100, h: 20 }, [{ x: 0, y: 20, w: 100, h: 10 }])).toBe('n');
    expect(ouvertureDe({ x: 0, y: 0, w: 20, h: 100 }, [{ x: -10, y: 0, w: 10, h: 100 }])).toBe('e');
  });
});

describe('dessins de 1942 : rectangle, remplissage, tirs, hauteur, feux', () => {
  it('pour chaque pièce et chaque variante de son aspect : dans le rectangle, écart au sol ≤ 10 % par côté, classe de tirs gardée, au plus 70', () => {
    for (const s of specs) {
      for (const v of VARIANTES[s.aspect]) {
        const m = modeleMeuble({ ...s, variante: v });
        const tag = `${s.id} ${s.aspect} ${v}`;
        expect(m.corps.length + m.details.length, tag).toBeGreaterThan(0);
        expect(dansRect(m, s.rect), tag).toBe(true);
        expect(ecarts(m.emprise, s.rect).max, tag).toBeLessThanOrEqual(ECART_MAX);
        if (s.passe) expect(m.hauteur, tag).toBeLessThan(HAUTEUR_ARME);
        else expect(m.hauteur, tag).toBeGreaterThanOrEqual(HAUTEUR_ARME);
        expect(m.hauteur, tag).toBeLessThanOrEqual(HAUTEUR_MAX);
      }
    }
  });

  it('aspect forcé (fichier de choix, pièce → aspect) : chaque aspect sur chaque pièce reste dans le rectangle et garde la classe de tirs', () => {
    for (const s of specs) for (const a of ASPECTS) {
      const m = modeleMeuble({ ...s, aspect: a, variante: DEFAUTS[a] });
      const tag = `${s.id} → ${a}`;
      expect(dansRect(m, s.rect), tag).toBe(true);
      if (s.passe) expect(m.hauteur, tag).toBeLessThan(HAUTEUR_ARME);
      else expect(m.hauteur, tag).toBeGreaterThanOrEqual(HAUTEUR_ARME);
    }
  });

  it('feux posés (P9, Q2) : une caisse sous le centre du feu, dessus à la hauteur du lot 3g (à 0,2 près), pour toutes les variantes', () => {
    const avecFeu = specs.filter((s) => s.feu);
    expect(avecFeu.map((s) => s.id).sort()).toEqual(['P9', 'Q2']);
    for (const s of avecFeu) for (const v of VARIANTES.caisses) {
      const m = modeleMeuble({ ...s, variante: v });
      const dessus = [...m.corps, ...m.details].filter((t) => t.n[1] > 0.9 && t.p.every((p) => Math.abs(p[1] - s.hauteur) < 0.2));
      const sous = dessus.some((t) => {
        const xs = t.p.map((p) => p[0]);
        const zs = t.p.map((p) => p[2]);
        return s.feu.x >= Math.min(...xs) - 4 && s.feu.x <= Math.max(...xs) + 4 && s.feu.y >= Math.min(...zs) - 4 && s.feu.y <= Math.max(...zs) + 4;
      });
      expect(sous, `${s.id} ${v}`).toBe(true);
    }
  });

  it('déterministe : mêmes entrées, même sortie ; entrées invalides : rien, sans exception', () => {
    const s = specs.find((q) => q.id === 'P13');
    expect(JSON.stringify(modeleMeuble({ ...s, variante: 'B' }))).toBe(JSON.stringify(modeleMeuble({ ...s, variante: 'B' })));
    expect(modeleMeuble(null).corps).toEqual([]);
    expect(modeleMeuble({ rect: { x: 0, y: 0, w: -1, h: 2 } }).details).toEqual([]);
    expect(modeleMeuble({ aspect: 'inconnu', variante: 'Z', rect: { x: 0, y: 0, w: 60, h: 40 }, hauteur: 30, passe: true }).variante).toBe('A');
    expect(piecesEpoque(null)).toEqual([]);
    expect(piecesEpoque({ a: { floor: 'rdc', epoque: { variante: 'actuel' } } })).toEqual([]);
  });

  it('cadre local : quatre orientations, le rectangle entier', () => {
    for (const o of ['n', 's', 'e', 'w']) {
      const r = { x: 10, y: 20, w: o === 'e' || o === 'w' ? 30 : 80, h: o === 'e' || o === 'w' ? 80 : 30 };
      const c = cadre(r, o);
      expect(c.L).toBe(80);
      expect(c.D).toBe(30);
      const coins = [c.map(0, 0, 0), c.map(c.L, c.D, 0)];
      expect(Math.min(coins[0][0], coins[1][0])).toBe(r.x);
      expect(Math.max(coins[0][0], coins[1][0])).toBe(r.x + r.w);
      expect(Math.min(coins[0][2], coins[1][2])).toBe(r.y);
    }
  });

  it('corps : régions de l\'atlas des meubles existantes, mêmes échelles que data/game/textures.json ; détails : matières connues, fenêtres d\'atlas dans leur région', () => {
    const atlas = lire('data/game/textures.json').textures.find((e) => e.id === 'atlas-props');
    for (const c of Object.values(CORPS)) {
      const r = atlas.params.regions.find((q) => q.id === c.region);
      expect(r, c.region).toBeTruthy();
      expect(c.echelle, c.region).toBe(r.scale ?? 100);
    }
    for (const s of specs) for (const v of VARIANTES[s.aspect]) {
      const m = modeleMeuble({ ...s, variante: v });
      for (const t of m.corps) expect(Object.values(CORPS).some((c) => c.region === t.region)).toBe(true);
      for (const t of m.details) {
        const M = MATIERES[t.mat];
        expect(M, t.mat).toBeTruthy();
        const r = regionUv(M.region);
        for (const [u, q] of t.uv) {
          expect(u).toBeGreaterThanOrEqual(r.u0 - 1e-4);
          expect(u).toBeLessThanOrEqual(r.u1 + 1e-4);
          expect(q).toBeGreaterThanOrEqual(r.v0 - 1e-4);
          expect(q).toBeLessThanOrEqual(r.v1 + 1e-4);
        }
      }
    }
  });
});

describe('budget de rendu', () => {
  it('pire choix par aspect : au plus +450 triangles sur les deux étages réunis (le rez-de-chaussée reste dessiné à l\'étage) ; variantes A : au plus +300', () => {
    let avant = 0;
    let pire = 0;
    for (const a of ASPECTS) {
      const liste = specs.filter((s) => s.aspect === a);
      avant += liste.reduce((n, s) => n + ancien(s.id), 0);
      pire += Math.max(...VARIANTES[a].map((v) => liste.reduce((n, s) => n + effectif(modeleMeuble({ ...s, variante: v })), 0)));
    }
    expect(avant).toBe(3052);
    // Plafond absolu de 45 000 triangles : le pire cas de la partie (persos-integres.spec, U4, sang à pleine charge et 10 zombies) en compte 44 451
    // sur origin/dev ; le premier envoi du lot (+1 108) le portait à 45 559 (CI de dev). Le plafond de +1 500 du prompt ne tenait pas compte de ce cas.
    expect(pire - avant).toBeLessThanOrEqual(450);
    let a = 0;
    for (const s of specs) a += effectif(modeleMeuble({ ...s, variante: 'A' }));
    expect(a - avant).toBeLessThanOrEqual(300);
  });

  it('chaque pièce : 450 triangles au plus', () => {
    for (const s of specs) for (const v of VARIANTES[s.aspect]) expect(effectif(modeleMeuble({ ...s, variante: v })), `${s.id} ${v}`).toBeLessThanOrEqual(450);
  });
});

describe('fichier de choix', () => {
  it('invalide ou absent : variantes par défaut, aucun aspect forcé ; « actuel » accepté ; aspect inconnu ignoré', () => {
    // Retours du propriétaire : escaliers (éboulis des escaliers fermés), C par défaut.
    expect(lireChoix(null)).toEqual({ variantes: { ...DEFAUTS }, pieces: {}, escaliers: DEFAUT_ESCALIER });
    expect(lireChoix('texte')).toEqual({ variantes: { ...DEFAUTS }, pieces: {}, escaliers: 'C' });
    expect(lireChoix({ escaliers: 'B' }).escaliers).toBe('B');
    expect(lireChoix({ escaliers: 'actuel' }).escaliers).toBe('actuel');
    expect(lireChoix({ escaliers: 'Z' }).escaliers).toBe('C');
    const c = lireChoix({ variantes: { caisses: 'C', gravats: 'actuel', etagere: 'Z', muret: 3 }, pieces: { M22: 'caisses', P3: 'licorne', _note: 'gravats' } });
    expect(c.variantes.caisses).toBe('C');
    expect(c.variantes.gravats).toBe('actuel');
    expect(c.variantes.etagere).toBe('A');
    expect(c.variantes.muret).toBe('A');
    expect(c.pieces).toEqual({ M22: 'caisses' });
  });

  it('data/game/mobilier-epoque-choix.json est lisible et valide (chaque entrée connue)', () => {
    const j = lire('data/game/mobilier-epoque-choix.json');
    const c = lireChoix(j);
    for (const a of ASPECTS) expect(j.variantes[a], a).toBe(c.variantes[a]);
    expect(Object.keys(j.pieces ?? {}).filter((k) => !k.startsWith('_'))).toEqual(Object.keys(c.pieces));
    expect(j.escaliers).toBe(c.escaliers);
  });

  it('un aspect forcé change l\'aspect de la pièce, pas son rectangle ni sa classe de tirs', () => {
    const f = specsMobilier({ ...base, choix: lireChoix({ pieces: { M22: 'caisses' } }) }).find((s) => s.id === 'M22');
    const p = specs.find((s) => s.id === 'M22');
    expect(f.aspect).toBe('caisses');
    expect(f.aspectPropose).toBe('renversee');
    expect(f.rect).toEqual(p.rect);
    expect(f.passe).toBe(p.passe);
  });

  it('aspectDuLook : étagère presque carrée → renversée ; coffre → caisses', () => {
    expect(aspectDuLook('etagere', { w: 140, h: 150 })).toBe('renversee');
    expect(aspectDuLook('etagere', { w: 40, h: 165 })).toBe('etagere');
    expect(aspectDuLook('coffre', { w: 10, h: 10 })).toBe('caisses');
    expect(aspectDuLook('???', null)).toBe('caisses');
  });
});

describe('atlas et contenu', () => {
  it('atlas de 256 px, 16 régions de 64 px sans chevauchement, déterministe', () => {
    const couleurs = { olive: [60, 70, 50] };
    const a = atlasMobilier({ couleurs });
    expect(a.width).toBe(ATLAS_TAILLE);
    expect(a.height).toBe(256);
    expect(a.data.length).toBe(256 * 256 * 4);
    expect(Buffer.from(a.data).equals(Buffer.from(atlasMobilier({ couleurs }).data))).toBe(true);
    const r = Object.values(REGIONS);
    expect(r).toHaveLength(16);
    for (const q of r) expect(q.x + q.w <= 256 && q.y + q.h <= 256).toBe(true);
    for (let i = 0; i < r.length; i += 1) for (let j = i + 1; j < r.length; j += 1) expect(r[i].x === r[j].x && r[i].y === r[j].y).toBe(false);
  });

  it('couleurs : chaque teinte et chaque couleur de l\'atlas est définie dans data/game/mobilier-epoque.json, depuis des jetons --game-* existants', () => {
    const defs = lire('data/game/mobilier-epoque.json').couleurs;
    const tokens = readFileSync('css/tokens.css', 'utf8');
    for (const d of Object.values(defs)) {
      expect(tokens, d.jeton).toContain(`${d.jeton}:`);
      if (d.vers) expect(tokens, d.vers).toContain(`${d.vers}:`);
    }
    for (const M of Object.values(MATIERES)) if (M.teinte !== 'neutre') expect(defs[M.teinte], M.teinte).toBeTruthy();
    const code = readFileSync('js/core/mobilier-epoque-atlas.js', 'utf8');
    for (const [, cle] of code.matchAll(/c\('([a-z-]+)'/g)) expect(defs[cle], cle).toBeTruthy();
  });

  it('textes au pochoir : inventés et génériques, police complète ; ni « MEDICAL » (caisse du lot 9i), ni sigle national, ni symbole', () => {
    const tous = Object.values(TEXTES).flat();
    expect(tous).toEqual(['CAL .30', 'LOT 4417', 'RATIONS', 'NO 12']);
    for (const s of tous) for (const ch of s) expect(GLYPHES[ch], ch).toBeTruthy();
    for (const s of tous) expect(s).not.toMatch(/MEDICAL|U\.?S\.?|SS|REICH|ARMY|NAZI|CROIX/i);
    expect(surTexte(0.5, 0.65, 'CAL .30', [0.15, 0.5, 0.85, 0.8]) || surTexte(0.2, 0.75, 'CAL .30', [0.15, 0.5, 0.85, 0.8])).toBe(true);
  });

  it('tout en code : aucune image ni modèle importé, aucune couleur en dur dans les fichiers du lot', () => {
    for (const f of ['js/core/mobilier-epoque.js', 'js/core/mobilier-epoque-atlas.js', 'js/game/mobilier-epoque-mesh.js', 'js/atelier-mobilier/main.js', 'atelier-mobilier.html', 'css/atelier-mobilier.css', 'data/game/mobilier-epoque.json']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/\.(png|jpe?g|gif|webp|glb|gltf|obj|fbx|svg)['")]/i);
      expect(s, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/);
      expect(s, f).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    }
  });
});

describe('dans la partie (après « GO 9j »)', () => {
  it('mobilier.world.json : chaque pièce concernée porte son dessin de 1942 (spécification de specsMobilier avec le fichier de choix), boîtes du lot 3g gardées', () => {
    const choix = lireChoix(lire('data/game/mobilier-epoque-choix.json'));
    const attendu = specsMobilier({ ...base, choix });
    expect(mobilier.triangles).toBe(3352); // boîtes du lot 3g : référence des collisions, des tirs et des feux (inchangées)
    for (const s of attendu) {
      const e = mobilier.pieces[s.id].epoque;
      expect(e, s.id).toEqual({ aspect: s.aspect, variante: s.variante, rect: s.rect, hauteur: s.hauteur, passe: s.passe, ouverture: s.ouverture, ...(s.feu ? { feu: s.feu } : {}) });
    }
    expect(mobilier.pieces.P12.epoque).toBeUndefined();
    expect(mobilier.pieces.Q4.epoque).toBeUndefined();
    expect(mobilier.epoque.couleurs).toEqual(lire('data/game/mobilier-epoque.json').couleurs);
    const pe = piecesEpoque(mobilier.pieces);
    const somme = (f, k) => pe.filter((p) => p.floor === f).reduce((n, p) => n + p.compte[k], 0);
    expect(mobilier.epoque.triangles).toEqual({ rdc: { corps: somme('rdc', 'corps'), details: somme('rdc', 'details') }, etage: { corps: somme('etage', 'corps'), details: somme('etage', 'details') } });
  });

  it('la partie dessine la clé epoque (corps dans le maillage des meubles, détails par étage, sans ombre) ; ?test=1&decor=avant : boîtes du lot 3g', () => {
    const w = readFileSync('js/game/world.js', 'utf8');
    expect(w).toMatch(/render\.mobilierEpoque !== false && m\.epoque && m\.epoque\.variante !== 'actuel'/);
    expect(w).toMatch(/mesh\.name = 'mobilier-epoque';\n\s+mesh\.castShadow = false;/);
    const m = readFileSync('js/game/main.js', 'utf8');
    expect(m).toMatch(/render\.mobilierEpoque = !decorAvant;/);
    expect(m).toMatch(/const decorAvant = testMode && query\.get\('decor'\) === 'avant';/);
  });
});

describe('éboulis des escaliers fermés (retours du propriétaire : « quelque chose de plus fin »)', () => {
  const z = zonesToWorld(parseZones(lire(`${D}zones.json`)), world.transform);
  const blocs = z.doors.flatMap((d) => (Array.isArray(d.blocks) ? d.blocks : Object.values(d.blocks ?? {}).flat()).filter((b) => b && !b.wall && b.rect).map((b) => ({ porte: d.id, rect: { x: b.rect.x + 1, y: b.rect.y + 1, w: b.rect.w - 2, h: b.rect.h - 2 }, h: Math.min((b.rect.hauteur ?? 60) - 1, 66) })));

  it('deux escaliers fermés (porte-2, porte-3) ; chaque variante reste dans le dessin du bloc, au plus 66 de haut, et coûte moins que l\'éboulis du lot 3g', () => {
    expect(blocs.map((b) => b.porte)).toEqual(['porte-2', 'porte-3']);
    for (const b of blocs) {
      const avant = rubbleBoxes(b.rect, b.h, b.porte).reduce((n, q) => n + (q.faces === 'cotes' ? 8 : 10), 0);
      for (const v of VARIANTES_ESCALIER) {
        const m = modeleEscalier({ rect: b.rect, variante: v, id: b.porte, hauteur: b.h });
        const tag = `${b.porte} ${v}`;
        expect(m.corps.length, tag).toBeGreaterThan(0);
        expect(m.corps.length, tag).toBeLessThan(avant);
        expect(m.hauteur, tag).toBeLessThanOrEqual(66);
        expect(dansRect({ corps: m.corps, details: [] }, b.rect), tag).toBe(true);
        // Le bloc reste barré d'un bout à l'autre de sa largeur (grand côté).
        const large = b.rect.w >= b.rect.h;
        expect(large ? m.emprise.w : m.emprise.h, tag).toBeGreaterThanOrEqual((large ? b.rect.w : b.rect.h) * 0.95);
        for (const t of m.corps) expect(Object.values(CORPS).some((c) => c.region === t.region)).toBe(true);
      }
    }
  });

  it('déterministe ; entrée invalide : rien ; variante inconnue : la variante par défaut', () => {
    const b = blocs[0];
    expect(JSON.stringify(modeleEscalier({ rect: b.rect, variante: 'C', id: 'x', hauteur: 59 }))).toBe(JSON.stringify(modeleEscalier({ rect: b.rect, variante: 'C', id: 'x', hauteur: 59 })));
    expect(modeleEscalier(null).corps).toEqual([]);
    expect(modeleEscalier({ rect: b.rect, variante: '?', id: 'x' }).variante).toBe(DEFAUT_ESCALIER);
  });

  it('mobilier.world.json porte la variante retenue (fichier de choix) ; la partie la dessine dans le maillage du bloc, decor=avant rend l\'éboulis du lot 3g', () => {
    expect(mobilier.epoque.escaliers).toBe(lireChoix(lire('data/game/mobilier-epoque-choix.json')).escaliers);
    const w = readFileSync('js/game/world.js', 'utf8');
    expect(w).toMatch(/!plain && !bl\.wall && render\.mobilierEpoque !== false && render\.escaliersVariante && render\.escaliersVariante !== 'actuel' \? modeleEscalier\(/);
    expect(readFileSync('js/game/main.js', 'utf8')).toMatch(/render\.escaliersVariante = mobilier\?\.epoque\?\.escaliers \?\? null;/);
  });
});
