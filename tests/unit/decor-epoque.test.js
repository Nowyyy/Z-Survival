// Lot 9h : décor extérieur d'époque (atelier et plan, avant le « GO 9h ») : modèles purs et déterministes, budgets, hauteurs, règle des tirs (dessiné sous
// l'arme : traversable), collisions (rectangle dessiné), fichier de choix (invalide = défaut), couleurs dérivées de jetons existants, contenu (aucun
// marquage sur les véhicules allemands, textes au pochoir génériques), placement (couloirs, apparitions, bâtiment, fenêtres) et chemins des zombies intacts
// pour toutes les variantes ; la partie ne charge pas encore ce décor.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ATLAS_TAILLE, CATALOGUE, HAUTEUR_ARME, MATIERES, PLAFONDS, REGIONS, TEXTES, TYPES, atlasEpoque, budgetPlan, controlePlan, couleursEpoque, filsTelegraphe,
  lireChoix, modeleVehicule, objet, objetsDeSection, objetsPlaces, sectionEpoque, trianglesFils,
} from '../../js/core/decor-epoque.js';
import { groundScarBoxes } from '../../js/core/epaves.js';
import { buildLayout } from '../../js/core/layout.js';
import { generateDecor } from '../../js/core/decor.js';
import { generateLivelyDecor } from '../../js/core/decor-vivant.js';
import { polygonRects } from '../../js/core/shape.js';
import { windowsWithGaps } from '../../js/core/layout.js';
import { windowGeometries } from '../../js/core/windows.js';

const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const donnees = lire('data/game/decor-epoque.json');
const choixJson = lire('data/game/decor-epoque-choix.json');
const placement = lire(`${D}decor-epoque.json`);
const world = lire(`${D}world.json`);
const decorJeu = lire(`${D}decor.json`);
// Décor d'avant (decor.json sans sa clé epoque, ?test=1&decor=avant) : le plan se place et se compare sur lui.
const decorCfg = { ...decorJeu };
delete decorCfg.epoque;
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s\/\/.*$/gm, '');
const tokens = Object.fromEntries([...readFileSync('css/tokens.css', 'utf8').matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const couleurs = couleursEpoque(donnees.couleurs, (j) => tokens[j] ?? null);
const variantes = TYPES.flatMap((type) => CATALOGUE[type].variantes.map((v) => [type, v]));

describe('décor d\'époque : module pur', () => {
  it('ni hasard, ni horloge, ni DOM, ni réseau, ni stockage, ni Three.js ; aucun état de module ; aucune couleur en dur', () => {
    const src = code('js/core/decor-epoque.js');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|(?<![\w.'-])window\s*[.[(]|\bfetch\(|localStorage|sessionStorage|indexedDB|THREE|setTimeout|setInterval|requestAnimationFrame/);
    expect(src).not.toMatch(/^let /m);
    for (const f of ['js/core/decor-epoque.js', 'js/atelier-decor/main.js', 'data/game/decor-epoque.json', 'data/game/decor-epoque-choix.json', `${D}decor-epoque.json`, 'atelier-decor.html', 'css/atelier-decor.css']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });

  it('mêmes entrées, même sortie (modèles, atlas, plan)', () => {
    for (const [type, v] of variantes) expect(objet(type, v, { x: 12, y: -7, cap: 33 })).toEqual(objet(type, v, { x: 12, y: -7, cap: 33 }));
    expect(atlasEpoque({ couleurs }).data).toEqual(atlasEpoque({ couleurs }).data);
  });
});

describe('décor d\'époque : modèles et budgets', () => {
  it.each(variantes)('%s / %s : sous son budget, au-dessus du sol, coordonnées de texture dans l\'atlas', (type, v) => {
    const o = objet(type, v, { x: 0, y: 0 });
    expect(o.compte).toBeGreaterThan(0);
    expect(o.compte).toBeLessThanOrEqual(CATALOGUE[type].budget);
    for (const tri of o.triangles) {
      for (const p of tri.p) expect(p[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.hypot(...tri.n)).toBeCloseTo(1, 3);
      if (!MATIERES[tri.mat]?.sol) for (const uv of tri.uv) for (const c of uv) expect(c >= 0 && c <= 1).toBe(true);
      expect(MATIERES[tri.mat], tri.mat).toBeDefined();
    }
  });

  it('hauteurs dessinées : véhicules ≤ 55, avion ≤ 63, objets solides ≤ 70 (poteaux : 150 comme les poteaux électriques du décor vivant)', () => {
    for (const [type, v] of variantes) {
      const o = objet(type, v, {});
      if (['vehicule', 'camion', 'vehiculeFeu'].includes(type)) expect(o.hauteur, `${type}/${v}`).toBeLessThanOrEqual(PLAFONDS.vehicule);
      else if (type === 'avion') expect(o.hauteur).toBeLessThanOrEqual(PLAFONDS.avion);
      else if (type === 'poteau') expect(o.hauteur).toBeLessThanOrEqual(150);
      for (const r of o.rects) if (type !== 'poteau') expect(r.hauteur, r.id).toBeLessThanOrEqual(PLAFONDS.meuble);
    }
  });

  it('règle des tirs (lot 8j) : un rectangle solide laisse passer les tirs si et seulement s\'il est dessiné plus bas que l\'arme (43)', () => {
    expect(HAUTEUR_ARME).toBe(lire('data/game/render.json').gunHeight);
    for (const [type, v] of variantes) for (const r of objet(type, v, {}).rects) expect(r.tirs, r.id).toBe(r.hauteur < HAUTEUR_ARME ? 'passent' : 'arretes');
    // Exemples relevés : barbelés, hérissons, jerrycans, caisses : passent ; camion, poteau, panneau debout : arrêtés ; trous d'obus et parachute : sans collision.
    for (const type of ['barbeles', 'herissons', 'jerrycans', 'caisses']) for (const v of CATALOGUE[type].variantes) expect(objet(type, v, {}).rects.every((r) => r.tirs === 'passent')).toBe(true);
    for (const [type, v] of [['camion', 'dodge'], ['camion', 'blitz'], ['poteau', 'simple'], ['panneau', 'deux'], ['artillerie', 'projecteur']]) expect(objet(type, v, {}).rects.every((r) => r.tirs === 'arretes')).toBe(true);
    for (const type of ['trouObus', 'parachute']) for (const v of CATALOGUE[type].variantes) expect(objet(type, v, {}).collision).toBe(false);
    expect(objet('panneau', 'tombe', {}).collision).toBe(false);
  });

  it('collision : chaque groupe solide bloque tout son rectangle dessiné ; véhicules abandonnés dans le rectangle de la voiture remplacée (92 × 46)', () => {
    for (const [type, v] of variantes) {
      const o = objet(type, v, { x: 100, y: 200 });
      for (const r of o.rects) {
        const tris = o.triangles.filter((q) => r.id.endsWith(`-${q.group}`));
        const xs = tris.flatMap((q) => q.p.map((p) => p[0]));
        const zs = tris.flatMap((q) => q.p.map((p) => p[2]));
        expect(r.x).toBeLessThanOrEqual(Math.min(...xs));
        expect(r.x + r.w).toBeGreaterThanOrEqual(Math.max(...xs));
        expect(r.y).toBeLessThanOrEqual(Math.min(...zs));
        expect(r.y + r.h).toBeGreaterThanOrEqual(Math.max(...zs));
      }
    }
    for (const v of CATALOGUE.vehicule.variantes) {
      const o = objet('vehicule', v, { x: 46, y: 23, L: 92, l: 46 });
      expect(o.emprise).toEqual({ x: 0, y: 0, w: 92, h: 46 });
    }
  });

  it('véhicule en flammes : deux foyers (capot, habitacle) dans son emprise, comme la voiture en flammes', () => {
    for (const v of CATALOGUE.vehiculeFeu.variantes) {
      const o = objet('vehiculeFeu', v, { x: 0, y: 0 });
      expect(o.feux.map((f) => f.id)).toEqual(['capot', 'habitacle']);
      for (const f of o.feux) {
        expect(f.x).toBeGreaterThanOrEqual(o.emprise.x);
        expect(f.x).toBeLessThanOrEqual(o.emprise.x + o.emprise.w);
      }
    }
  });
});

describe('décor d\'époque : données, choix et couleurs', () => {
  it('fichier de choix : toutes les variantes connues, tout gardé ; entrée invalide = défaut', () => {
    const c = lireChoix(choixJson);
    for (const type of TYPES) {
      expect(CATALOGUE[type].variantes).toContain(choixJson.variantes[type]);
      expect(c.variantes[type]).toBe(choixJson.variantes[type]);
      expect(typeof choixJson.gardes[type]).toBe('boolean');
    }
    for (const bad of [null, 42, 'x', { variantes: { avion: 'f16', vehicule: 7 }, gardes: { avion: 'oui' } }]) {
      const d = lireChoix(bad);
      for (const type of TYPES) {
        expect(d.variantes[type]).toBe(CATALOGUE[type].defaut);
        expect(d.gardes[type]).toBe(true);
      }
    }
  });

  it('couleurs : mélanges de jetons existants de tokens.css ; chaque teinte de matière et chaque couleur de l\'atlas est définie', () => {
    for (const [cle, d] of Object.entries(donnees.couleurs)) {
      expect(tokens[d.jeton], `${cle} : ${d.jeton}`).toBeDefined();
      if (d.vers) expect(tokens[d.vers], `${cle} : ${d.vers}`).toBeDefined();
      expect(d.part >= 0 && d.part <= 1).toBe(true);
    }
    for (const m of Object.values(MATIERES)) if (m.teinte !== 'neutre') expect(couleurs[m.teinte], m.teinte).toHaveLength(3);
    for (const cle of ['bois-caisse', 'pochoir', 'panneau-bois', 'panneau-texte', 'etoile-fond', 'etoile', 'olive']) expect(couleurs[cle], cle).toHaveLength(3);
  });

  it('atlas : 256 px (taille de la tôle de l\'hélicoptère), régions dans la texture, ≤ 300 ms', () => {
    const t0 = performance.now();
    const a = atlasEpoque({ couleurs });
    expect(performance.now() - t0).toBeLessThan(300);
    expect([a.width, a.height]).toEqual([ATLAS_TAILLE, ATLAS_TAILLE]);
    for (const r of Object.values(REGIONS)) expect(r.x + r.w <= ATLAS_TAILLE && r.y + r.h <= ATLAS_TAILLE).toBe(true);
  });

  it('contenu : Kübelwagen et Opel Blitz sans aucun marquage ; étoile seulement (Jeep, Dodge, avion) ; textes au pochoir génériques (lettres, chiffres)', () => {
    for (const v of ['kubel', 'blitz']) for (const brule of [false, true]) {
      const tris = objet(v === 'kubel' ? 'vehicule' : 'camion', v, {}).triangles;
      expect(tris.some((q) => q.mat === 'etoile' || q.mat === 'numero'), v).toBe(false);
      expect(modeleVehicule(v, { brule }).modele.pieces.some((p) => ['etoile', 'numero'].includes(p.mat))).toBe(false);
    }
    for (const t of Object.values(TEXTES).flat()) expect(t).toMatch(/^[A-Z0-9 .-]+$/);
    expect(Object.keys(REGIONS).sort()).toEqual(['acier', 'bois', 'caisse', 'etoile', 'numero', 'panneau', 'pneu', 'soie', 'suie', 'tole', 'toile', 'verre'].sort());
  });

  it('aucune image ni modèle importé : seulement des fichiers de code et de données ajoutés pour ce décor', () => {
    expect(readdirSync('js/atelier-decor')).toEqual(['main.js']);
    expect(readFileSync('atelier-decor.html', 'utf8')).not.toMatch(/\.(png|jpe?g|gif|webp|glb|gltf|obj|fbx)\b/i);
  });
});

describe('décor d\'époque : placement sur la carte', () => {
  const navCfg = lire('data/game/nav.json');
  const windowsCfg = lire('data/game/windows.json');
  const ctl = controlePlan({ world, decorCfg, doc: placement, choixJson, geometries: (l) => windowGeometries(windowsWithGaps(l), windowsCfg), navCfg });

  it('aucun problème pour le choix actuel ni pour aucune variante de chaque objet (couloirs, apparitions, bâtiment, fenêtres, décor gardé, chemins)', () => {
    expect(ctl.problemes).toEqual([]);
    expect(ctl.objets.length).toBeGreaterThanOrEqual(20);
  });

  it('chemins des zombies : chaque point d\'apparition atteint sa fenêtre, jamais plus long qu\'avant de 5 %', () => {
    expect(ctl.chemins).toHaveLength(decorCfg.spawnPoints.length);
    for (const c of ctl.chemins) {
      expect(c.coupe, c.id).toBe(false);
      expect(c.apres.longueur).toBeLessThanOrEqual(c.avant.longueur * 1.05);
    }
  });

  it('remplacements : voitures (mêmes rectangles), voiture en flammes (même centre), hélicoptère (l\'avion dans l\'angle du L), poteaux électriques (mêmes pieds)', () => {
    const decor = generateDecor(decorCfg, world);
    const lively = generateLivelyDecor({ size: world.size, footprint: polygonRects(world.contour), decor });
    const objets = objetsPlaces(placement, { decor, lively, choix: lireChoix(choixJson) });
    const voitures = decor.cars.filter((c) => !c.burning);
    const vehicules = objets.filter((o) => o.type === 'vehicule');
    expect(vehicules.map((o) => o.emprise)).toEqual(voitures.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })));
    const feu = objets.find((o) => o.type === 'vehiculeFeu');
    const car = decor.cars.find((c) => c.burning);
    expect(Math.abs(feu.emprise.x + feu.emprise.w / 2 - (car.x + car.w / 2))).toBeLessThanOrEqual(1);
    const avion = objets.find((o) => o.type === 'avion');
    expect(avion.remplace).toBe('helicoptere');
    expect(Math.hypot(avion.emprise.x + avion.emprise.w / 2 - decor.helicopter.x, avion.emprise.y + avion.emprise.h / 2 - decor.helicopter.y)).toBeLessThan(120);
    const poteaux = objets.filter((o) => o.type === 'poteau');
    expect(poteaux).toHaveLength(lively.poles.length);
    expect(filsTelegraphe(objets).length).toBe((lively.poles.length - 1) * 4);
  });

  it('budget du plan : au plus +3 000 triangles nets au pire cas (retraits mesurés sur origin/dev)', () => {
    const retires = Object.values(donnees.retires).reduce((s, v) => s + v, 0);
    const b = budgetPlan(ctl.objets, ctl.fils, retires);
    expect(b.solde).toBeLessThanOrEqual(3000);
    expect(trianglesFils(ctl.fils).length).toBeGreaterThan(0);
  });

  // Lot 9h-C (après le « GO 9h ») : ce test remplace « la partie ne charge pas ce décor » de la partie B : la partie le charge maintenant, depuis decor.json.
  it('decor.json → epoque est la sortie du contrôle ; la partie reconstruit les mêmes objets et les mêmes rectangles', () => {
    const attendu = sectionEpoque(ctl, { couleurs: donnees.couleurs, footprint: polygonRects(world.contour), scars: groundScarBoxes });
    expect(decorJeu.epoque).toEqual(JSON.parse(JSON.stringify(attendu)));
    const reconstruits = objetsDeSection(decorJeu.epoque);
    expect(reconstruits.map((o) => o.rects)).toEqual(decorJeu.epoque.objets.map((o) => o.rects));
  });

  it('décor du jeu : l\'avion remplace l\'hélicoptère, véhicules aux rectangles des voitures, objets solides ajoutés ; sans epoque : décor d\'avant', () => {
    const jeu = buildLayout(world, decorJeu).decor;
    const avant = buildLayout(world, decorCfg).decor;
    expect(jeu.helicopter).toBeNull();
    expect(avant.helicopter?.id).toBe('helicoptere');
    expect(jeu.solids.some((q) => q.kind === 'helicoptere')).toBe(false);
    expect(jeu.cars.map((c) => c.id)).toEqual(avant.cars.map((c) => c.id));
    for (const c of jeu.cars.filter((q) => !q.burning)) expect(c.epoque).toMatch(/^vehicule-/);
    const ajoutes = jeu.solids.filter((q) => q.kind === 'epoque');
    const attendus = decorJeu.epoque.objets.filter((o) => !['voitures', 'voiture-en-flammes'].includes(o.remplace) && !/^voiture/.test(o.remplace ?? '')).flatMap((o) => o.rects.map((r) => r.id));
    expect(ajoutes.map((q) => q.id).sort()).toEqual(attendus.sort());
    expect(avant.solids.some((q) => q.kind === 'epoque')).toBe(false);
  });
});
