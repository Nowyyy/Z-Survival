// Lot 9i : intérieur d'époque, lampe coudée, Garand et caisses des ouvertures (atelier, avant le « GO 9i ») : modèles purs et déterministes, budgets,
// hauteurs, règle des tirs (dessiné sous l'arme : traversable), collisions (rectangle dessiné), choix (invalide = défaut), couleurs dérivées de jetons,
// caisse médicale sans croix rouge, placement et chemins des zombies des deux étages pour toutes les variantes ; le jeu et le menu ne chargent rien de
// tout cela avant le GO.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ATLAS_TAILLE, CATALOGUE, HAUTEUR_ARME, HAUTEUR_MAX, MATIERES, REGIONS, TEXTES, TYPES, atlasInterieur, budgetPlan, controlePlan, couleursEpoque, facesMurs,
  lireChoix, objet, objetsPlaces,
} from '../../js/core/interieur-epoque.js';
import { LENTILLE, PIECES_TL122, avecLampeCoudee } from '../../js/core/lampe-coudee.js';
import { garandOuverture } from '../../js/menu/ouverture/garand.js';
import { CAISSE, caisseGeo } from '../../js/menu/ouverture/modeles.js';
import { FORMES_EPOQUE, JETONS_EPOQUE, TEXTES_EPOQUE, caisseGeoEpoque } from '../../js/menu/ouverture/caisses-epoque.js';
import { lireArmes, lireChoix as lireChoixArmes } from '../../js/core/armes/armes.js';

const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const donnees = lire('data/game/interieur-epoque.json');
const choixJson = lire('data/game/interieur-epoque-choix.json');
const placement = lire(`${D}interieur-epoque.json`);
const mondes = { rdc: lire(`${D}world.json`), etage: lire(`${D}etage.world.json`) };
const lampes = lire(`${D}lampes.world.json`).lampes;
const navCfg = lire('data/game/nav.json');
const tokens = Object.fromEntries([...readFileSync('css/tokens.css', 'utf8').matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('objets de l\'intérieur', () => {
  it('toutes les variantes se construisent, déterministes, sous budget, sous 70, triangles valides', () => {
    expect(TYPES).toEqual(['radio', 'telephone', 'machine', 'carte', 'brancard', 'caisseMedicale', 'casques', 'ampoules']);
    for (const type of TYPES) {
      expect(CATALOGUE[type].variantes).toHaveLength(3);
      expect(CATALOGUE[type].variantes).toContain(CATALOGUE[type].defaut);
      for (const v of CATALOGUE[type].variantes) {
        const a = objet(type, v, { x: 10, y: 20, base: 40 });
        const b = objet(type, v, { x: 10, y: 20, base: 40 });
        expect(JSON.stringify(a.triangles)).toBe(JSON.stringify(b.triangles));
        expect(a.compte, `${type}/${v}`).toBeGreaterThan(0);
        expect(a.compte, `${type}/${v}`).toBeLessThanOrEqual(CATALOGUE[type].budget);
        expect(a.hauteur, `${type}/${v}`).toBeLessThanOrEqual(HAUTEUR_MAX);
        for (const t of a.triangles) {
          expect(MATIERES[t.mat], t.mat).toBeDefined();
          for (const p of t.p) expect(p.every(Number.isFinite)).toBe(true);
          for (const q of t.uv) expect(q.every((x) => x >= 0 && x <= 1)).toBe(true);
          expect(Math.hypot(...t.n)).toBeCloseTo(1, 2);
        }
      }
    }
  });
  it('posés sur un meuble : la hauteur du meuble devient la base ; antenne de la radio raccourcie sous 70', () => {
    const sol = objet('telephone', 'etui', { base: 0 });
    const haut = objet('telephone', 'etui', { base: 55 });
    expect(haut.hauteur - sol.hauteur).toBe(55);
    for (const v of CATALOGUE.radio.variantes) expect(objet('radio', v, { base: 55 }).hauteur).toBeLessThanOrEqual(70);
    // Les objets au sol, au mur et au plafond ignorent une base donnée.
    expect(objet('brancard', 'toile', { base: 40 }).hauteur).toBe(objet('brancard', 'toile', {}).hauteur);
  });
  it('tirs et collisions : seuls brancard et caisse médicale sont solides (rectangle dessiné), dessinés sous 43 : les tirs passent', () => {
    for (const type of TYPES) for (const v of CATALOGUE[type].variantes) {
      const o = objet(type, v, {});
      expect(o.collision, `${type}/${v}`).toBe(['brancard', 'caisseMedicale'].includes(type));
      for (const r of o.rects) {
        expect(r.hauteur).toBeLessThan(HAUTEUR_ARME);
        expect(r.tirs).toBe('passent');
        // Le rectangle couvre tout le dessin de son groupe.
        const sel = o.triangles.filter((t) => t.group === CATALOGUE[type].collision[0]);
        for (const t of sel) for (const p of t.p) {
          expect(p[0]).toBeGreaterThanOrEqual(r.x - 1e-6);
          expect(p[0]).toBeLessThanOrEqual(r.x + r.w + 1e-6);
          expect(p[2]).toBeGreaterThanOrEqual(r.y - 1e-6);
          expect(p[2]).toBeLessThanOrEqual(r.y + r.h + 1e-6);
        }
      }
    }
  });
  it('lueur : seul le verre des ampoules est lumineux (aucune lumière nouvelle)', () => {
    for (const type of TYPES) for (const v of CATALOGUE[type].variantes) expect(objet(type, v, {}).lueur > 0).toBe(type === 'ampoules');
    expect(Object.entries(MATIERES).filter(([, m]) => m.lueur).map(([k]) => k)).toEqual(['verre']);
  });
  it('cartes : face visible tournée selon le mur', () => {
    const n = (face) => objet('carte', 'grande', { face }).triangles[0].n;
    expect(n('s')[2]).toBeCloseTo(1);
    expect(n('e')[0]).toBeCloseTo(1);
    expect(n('o')[0]).toBeCloseTo(-1);
    expect(n('n')[2]).toBeCloseTo(-1);
  });
});

describe('atlas, couleurs, contenu', () => {
  const lookup = (j) => tokens[j] ?? null;
  const couleurs = couleursEpoque(donnees.couleurs, lookup);
  it('couleurs : mélanges de jetons existants de tokens.css, aucune couleur en dur', () => {
    expect(JSON.stringify(donnees.couleurs)).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
    for (const [cle, d] of Object.entries(donnees.couleurs)) {
      expect(tokens[d.jeton], `${cle} → ${d.jeton}`).toBeDefined();
      if (d.vers) expect(tokens[d.vers], `${cle} → ${d.vers}`).toBeDefined();
      expect(couleurs[cle]).toHaveLength(3);
    }
  });
  it('atlas déterministe de 256 px ; caisse médicale : croix blanche sur vert, jamais de rouge', () => {
    const a = atlasInterieur({ couleurs });
    const b = atlasInterieur({ couleurs });
    expect(a.width).toBe(ATLAS_TAILLE);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    const px = (x, y) => [...a.data.slice((y * a.width + x) * 4, (y * a.width + x) * 4 + 3)];
    const r = REGIONS.medical;
    const centre = px(r.x + Math.round(r.w * 0.5), r.y + Math.round(r.h * 0.62));
    expect(centre).toEqual(couleurs['medical-blanc']);
    const fond = px(r.x + Math.round(r.w * 0.2), r.y + Math.round(r.h * 0.9));
    expect(fond[1]).toBeGreaterThan(fond[0]); // vert : plus de vert que de rouge
    for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) {
      const [R, G, B] = px(x, y);
      expect(R > 120 && R > G * 1.6 && R > B * 1.6, `pixel rouge en ${x}, ${y}`).toBe(false);
    }
    expect(TEXTES.medical).toBe('MEDICAL');
  });
  it('textes peints génériques, aucun emblème ni symbole interdit dans les sources', () => {
    for (const f of ['js/core/interieur-epoque.js', 'js/core/lampe-coudee.js', 'js/menu/ouverture/caisses-epoque.js', 'js/menu/ouverture/garand.js', 'js/atelier-interieur/menu-epoque.js']) {
      expect(code(f)).not.toMatch(/croix-rouge|red cross|svastika|swastika|hakenkreuz|\bSS\b|Wehrmacht|Coca|Zippo|Motorola|Remington|Underwood/i);
    }
    expect(Object.values(TEXTES_EPOQUE).flat().join(' ')).toMatch(/^[A-Z0-9 .-]+$/);
  });
});

describe('placement et chemins des zombies (deux étages)', () => {
  const ctl = controlePlan({ mondes, lampes, doc: placement, choixJson, navCfg, toutesVariantes: true });
  it('aucun problème pour toutes les variantes de tous les objets', () => {
    expect(ctl.problemes).toEqual([]);
    expect(ctl.objets.length).toBe(placement.objets.length);
    expect(new Set(ctl.objets.map((o) => o.floor))).toEqual(new Set(['rdc', 'etage']));
  });
  it('chemins depuis chaque fenêtre : aucune cellule coupée, allongement au plus de 40 unités', () => {
    expect(ctl.chemins.rdc).toHaveLength(7);
    expect(ctl.chemins.etage).toHaveLength(7);
    for (const l of Object.values(ctl.chemins)) for (const c of l) {
      expect(c.coupees, c.fenetre).toBe(0);
      expect(c.allongementMax, c.fenetre).toBeLessThanOrEqual(40);
    }
  });
  it('objets « sur meuble » dans le dessus de leur meuble ; cartes contre un mur ; poste de commandement et infirmerie aux deux étages', () => {
    for (const o of ctl.objets.filter((q) => CATALOGUE[q.type].pose === 'meuble')) {
      expect(o.porteur, o.id).not.toBeNull();
      expect(o.base).toBe(o.porteur.hauteur);
    }
    const types = (f) => new Set(ctl.objets.filter((o) => o.floor === f).map((o) => o.type));
    for (const f of ['rdc', 'etage']) for (const t of ['radio', 'telephone', 'machine', 'carte', 'brancard', 'caisseMedicale']) expect(types(f).has(t), `${f} ${t}`).toBe(true);
  });
  it('budget du plan : au plus +2 000 triangles, un maillage par étage', () => {
    const b = budgetPlan(ctl.objets);
    expect(b.total).toBeLessThanOrEqual(2000);
    expect(b.parEtage.rdc + b.parEtage.etage).toBe(b.total);
  });
  it('un problème est bien signalé (fenêtre, interstice, meuble absent)', () => {
    const doc = { objets: [{ id: 'f', type: 'brancard', floor: 'rdc', x: 1175, y: 960 }, { id: 'm', type: 'radio', floor: 'rdc', sur: 'inconnu', x: 2000, y: 2300 }] };
    const pb = controlePlan({ mondes, lampes, doc, navCfg, toutesVariantes: false }).problemes.join(' | ');
    expect(pb).toMatch(/f trop près de la fenêtre F1/);
    expect(pb).toMatch(/m : meuble porteur absent/);
  });
  it('faces des murs : à l\'intérieur du contour', () => {
    const f = facesMurs(mondes.rdc.contour);
    expect(f[0].y).toBeGreaterThanOrEqual(900);
    expect(f[1].x).toBeLessThanOrEqual(1490);
  });
});

describe('choix', () => {
  it('fichier de choix lu ; entrée invalide ou absente = défaut', () => {
    const c = lireChoix(choixJson);
    for (const type of TYPES) expect(CATALOGUE[type].variantes).toContain(c.variantes[type]);
    const d = lireChoix({ variantes: { radio: 'tv', carte: 42 }, gardes: { radio: 'oui' } });
    expect(d.variantes.radio).toBe(CATALOGUE.radio.defaut);
    expect(d.variantes.carte).toBe(CATALOGUE.carte.defaut);
    expect(d.gardes.radio).toBe(true);
    expect(lireChoix(null).variantes).toEqual(Object.fromEntries(TYPES.map((t) => [t, CATALOGUE[t].defaut])));
    const sansRadio = objetsPlaces(placement, { choix: { ...lireChoix(null), gardes: { ...lireChoix(null).gardes, radio: false } }, obstacles: {} });
    expect(sansRadio.some((o) => o.type === 'radio')).toBe(false);
  });
  it('choix du menu : valeurs connues', () => {
    const m = lire('data/menu/caisses-epoque-choix.json');
    expect(['epoque', 'actuelles']).toContain(m.caisses);
    expect(['garand', 'fusil']).toContain(m.arme);
    expect(['A', 'B']).toContain(m.histoire);
    expect(['A', 'B', 'C']).toContain(m.chargement);
  });
});

describe('lampe coudée', () => {
  const chars = lire('data/game/characters-v2.json');
  const b = chars.slots[0].variants.find((v) => v.id === 'B');
  it('frontale retirée, quatre pièces sur l\'os de la poitrine, à gauche (x > 0) et devant (z > 0), lentille lumineuse seule', () => {
    const v = avecLampeCoudee(b);
    expect(v.parts.some((p) => p.id === 'lamp' || p.id === 'lampBand')).toBe(false);
    const tl = v.parts.filter((p) => p.id.startsWith('tl'));
    expect(tl).toHaveLength(PIECES_TL122.length);
    for (const p of tl) {
      expect(p.joint).toBe('chest');
      expect(p.offset[0]).toBeGreaterThan(0);
      expect(p.offset[2]).toBeGreaterThan(0);
    }
    expect(tl.filter((p) => p.material === 'glow').map((p) => p.id)).toEqual(['tlLentille']);
    expect(v.palette.lampe).toBe('--perso-lampe');
    expect(LENTILLE.direction).toEqual([0, 0, 1]);
    // Copie : la variante d'origine ne change pas.
    expect(b.parts.some((p) => p.id === 'lamp')).toBe(true);
  });
});

describe('ouvertures : Garand et caisses d\'époque', () => {
  it('Garand au repère du fusil : détente sous la main droite (z +8), canon vers −z au niveau du fusil actuel, déterministe', () => {
    const donneesArmes = lireArmes(lire('data/armes/armes.json'));
    const v = lireChoixArmes(donneesArmes, lire('data/armes/armes-choix.json')).variantes.garand;
    const g = garandOuverture(donneesArmes, v);
    const g2 = garandOuverture(donneesArmes, v);
    expect(Buffer.from(g.positions.buffer).equals(Buffer.from(g2.positions.buffer))).toBe(true);
    expect(g.mainDroite[2]).toBeCloseTo(8, 5);
    expect(g.mainGauche[2]).toBeLessThan(-10);
    expect(g.bout[1]).toBeCloseTo(0.6, 5);
    expect(g.bout[2]).toBeLessThan(-60);
    expect(g.crosse[2]).toBeGreaterThan(30);
    expect(g.triangles).toBeLessThanOrEqual(400);
  });
  it('trois caisses d\'époque : mêmes dimensions et mêmes places des « ? » que les caisses actuelles', () => {
    expect(FORMES_EPOQUE).toEqual({ militaire: 'munitions', veterans: 'cantine', tenues: 'valise' });
    for (const modele of Object.keys(FORMES_EPOQUE)) {
      const a = caisseGeo(modele);
      const e = caisseGeoEpoque(modele);
      expect(e.haut).toBe(a.haut);
      expect(e.haut).toBe(CAISSE.h);
      const qa = a.q.attributes.position.array;
      const qe = e.q.attributes.position.array;
      expect(qe.length).toBe(qa.length);
      // Grand « ? » et deux petits : identiques (le « ? » du côté droit suit la poignée de corde de la caisse de munitions).
      for (let i = 0; i < 18 * 3; i += 1) expect(qe[i]).toBeCloseTo(qa[i], 5);
      for (const g of [e.corps.principal, e.corps.garniture, e.couvercle.principal, e.couvercle.garniture]) expect(g.attributes.position.count).toBeGreaterThan(0);
      expect(JETONS_EPOQUE[FORMES_EPOQUE[modele]].corps).toMatch(/^--ouv-/);
    }
  });
  it('jetons --ouv-* d\'époque déclarés dans ouvertures.css', () => {
    const css = readFileSync('css/ouvertures.css', 'utf8');
    for (const j of ['--ouv-munitions', '--ouv-pochoir', '--ouv-corde', '--ouv-cantine', '--ouv-ferrure', '--ouv-nom', '--ouv-cuir', '--ouv-sangle-cuir', '--ouv-boucle', '--ouv-arm-noyer', '--ouv-arm-phosphate', '--ouv-arm-cuir']) expect(css).toContain(`${j}:`);
  });
});

describe('jeu et menu inchangés avant le GO', () => {
  const fichiers = (dir) => readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
  it('ni la partie ni le menu n\'importent les modules du lot 9i (scène des ouvertures : import dynamique sous l\'option epoque seulement)', () => {
    const interdits = /interieur-epoque|lampe-coudee|caisses-epoque|garand\.js|atelier-interieur/;
    for (const f of [...fichiers('js/game'), ...fichiers('js/menu'), 'js/main.js', ...fichiers('js/core')]) {
      if (f === 'js/core/interieur-epoque.js' || f === 'js/core/lampe-coudee.js' || f.endsWith('caisses-epoque.js') || f.endsWith('ouverture/garand.js')) continue;
      const src = code(f);
      if (f.endsWith('ouverture/scene.js')) {
        expect(src).toMatch(/epoque\?\.caisses === true \? await import\('\.\/caisses-epoque\.js'\)/);
        expect(src).toMatch(/epoque\?\.arme === 'garand' \? await import\('\.\/garand\.js'\)/);
        expect(src).not.toMatch(/^import .*(caisses-epoque|garand)/m);
        continue;
      }
      const imports = [...src.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((m) => m[1]).join(' ');
      expect(interdits.test(imports), f).toBe(false);
    }
    // Le menu ne passe jamais l'option epoque à la scène (ouverture.js).
    expect(code('js/menu/ouverture/ouverture.js')).not.toMatch(/epoque/);
  });
});
