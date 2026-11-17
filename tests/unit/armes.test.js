import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CLASSES, TENUES, armeParId, avecEchelle, epaissir, budgetDe, controleBudget, coucher, echelleJeu, lireArmes, lireChoix, maillageArme, piecesArme, varianteDe } from '../../js/core/armes/armes.js';
import { empreinte, maillage, trianguler } from '../../js/core/armes/geometrie.js';
import { JETONS, TAILLE, TUILES, genererAtlas, moyenneTuile, rectTuile } from '../../js/core/armes/atlas.js';
import { HAUTEUR_ARME_JOUEUR, POCHOIRS, TYPES, ancreTexte, dimensionsCaisse, genererTextureCaisse, maillageCaisse } from '../../js/core/armes/caisse.js';
import { MODELES } from '../../js/core/armes/modeles.js';
import { HAUTEUR, LARGEUR, visuelArme } from '../../js/core/armes/visuel.js';

// Lot 9c : armes de l'atelier (js/core/armes/, pur), données data/armes/ ; rien n'est branché sur la partie.
const json = JSON.parse(readFileSync('data/armes/armes.json', 'utf8'));
const choixJson = JSON.parse(readFileSync('data/armes/armes-choix.json', 'utf8'));
const donnees = lireArmes(json);
const tokens = readFileSync('css/armes.css', 'utf8');
const palette = Object.fromEntries([...tokens.matchAll(/--arm-([a-z0-9-]+):\s*#([0-9a-f]{6});/g)].map((m) => [m[1], [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16))]));
const toutes = donnees.armes.flatMap((a) => a.variantes.map((v) => [a.id, v.id]));

describe('données des armes', () => {
  it('chaque arme des données a un modèle, deux ou trois variantes, un nom et une longueur réelle ; aucun écart de lecture', () => {
    expect(donnees.ecarts).toEqual([]);
    expect(donnees.armes.length).toBe(json.armes.length);
    for (const a of donnees.armes) {
      expect(MODELES[a.id], a.id).toBeTypeOf('function');
      expect(a.variantes.length, a.id).toBeGreaterThanOrEqual(2);
      expect(a.variantes.length, a.id).toBeLessThanOrEqual(3);
      expect(a.nom.length).toBeGreaterThan(2);
      expect(a.longueurReelle, a.id).toBeGreaterThan(150);
      expect(Object.keys(CLASSES)).toContain(a.classe);
    }
  });

  it('aucune statistique de jeu dans les données (dégâts, cadence, prix : lot d\'intégration)', () => {
    const texte = JSON.stringify(json.armes);
    for (const cle of ['degats', 'cadence', 'prix', 'portee', 'dispersion', 'vitesse']) expect(texte, cle).not.toMatch(new RegExp(`"${cle}"`));
  });

  // Lot 9c-G (retours du propriétaire) : épaisseur des pièces fines ×1,8 ; décision du propriétaire (poses de tenue) : un seul facteur commun de
  // taille pour toutes les armes, ×0,8 (avant : ×1,3, puis ×1,1 et ×0,9 ; le plus grand qui laisse les dix armes tenues à deux mains, paumes contre l'arme).
  it('échelle : 35 unités par mètre (personnage de 61 unités ≈ 1,75 m), facteur commun ×0,8, épaisseur ×1,8 sous 60 mm', () => {
    expect(donnees.echelle.unitesParMetre).toBe(35);
    expect(donnees.echelle.lisibilite).toBe(0.8);
    expect(donnees.echelle.epaisseur).toBe(1.8);
    expect(donnees.echelle.largeur).toBe(1.5); // retours : la largeur vue de dessus, à part de la longueur, choisie à ×1,5 (en jeu seulement)
    expect(donnees.echelle.seuilEpaisseur).toBe(60);
    expect(json.echelle.personnage.hauteur / json.echelle.personnage.hauteurReelleM).toBeCloseTo(35, 0);
  });

  it('entrées inattendues : aucune exception, défauts', () => {
    expect(lireArmes(null).armes).toEqual([]);
    const d = lireArmes({ armes: [{ id: 'inconnue', variantes: [{ id: 'a' }] }, { id: 'm1911', variantes: [] }] });
    expect(d.armes).toEqual([]);
    expect(d.ecarts.length).toBe(2);
    expect(piecesArme(null, null)).toEqual([]);
  });
});

describe('budgets (compte réel de chaque variante, en main et posée)', () => {
  it.each(donnees.armes.map((a) => [a.id]))('%s : sous son budget', (id) => {
    const a = armeParId(donnees, id);
    const c = controleBudget(donnees, a);
    expect(c.budget).toBe(a.classe === 'lourde' ? 700 : 400);
    for (const v of c.variantes) expect(v.triangles, `${id} ${v.id}`).toBeLessThanOrEqual(c.budget);
    expect(c.ok).toBe(true);
  });

  it('budget : 400 pour le poing et l\'épaule, 700 pour les armes lourdes', () => {
    expect(budgetDe(donnees, { classe: 'poing' })).toBe(400);
    expect(budgetDe(donnees, { classe: 'lourde' })).toBe(700);
  });
});

describe('dimensions relatives', () => {
  it.each(toutes)('%s %s : longueur = longueur réelle × 35 u/m, à 2 % près', (id, vid) => {
    const a = armeParId(donnees, id);
    const m = maillageArme(donnees, a, varianteDe(a, vid), { pose: 'seule' }); // lance-flammes : la lance seule
    const attendu = a.longueurReelle * echelleJeu(donnees, a);
    const extra = Number(a.dimensions.longueurAvecAccessoire) || 0; // accessoire monté (baïonnette) : longueur réelle avec lui
    const reference = varianteDe(a, vid).options?.baionnette && extra ? extra * echelleJeu(donnees, a) : attendu;
    expect(Math.abs(m.longueur - reference) / reference, `${id} ${vid} : ${m.longueur} pour ${reference}`).toBeLessThan(0.02);
  });

  it('l\'ordre des longueurs suit celui des armes réelles ; le M1911 est bien plus court que le pistolet actuel du personnage (14)', () => {
    const L = donnees.armes.map((a) => ({ id: a.id, reel: a.longueurReelle, jeu: maillageArme(donnees, a, a.variantes[0], { pose: 'seule' }).longueur }));
    const parReel = [...L].sort((x, y) => x.reel - y.reel).map((x) => x.id);
    const parJeu = [...L].sort((x, y) => x.jeu - y.jeu).map((x) => x.id);
    expect(parJeu).toEqual(parReel);
    const m1911 = L.find((x) => x.id === 'm1911');
    expect(m1911.jeu).toBeLessThan(14);
    expect(m1911.jeu).toBeGreaterThan(8); // ×1,2 (taille propre du Colt, décision du propriétaire) : 9,1
  });

  it('la lisibilité agrandit toutes les armes du même facteur, sauf le Colt (taille propre ×1,2)', () => {
    const d2 = lireArmes({ ...json, echelle: { ...json.echelle, lisibilite: 1.5 } });
    for (const a of donnees.armes) {
      const l1 = maillageArme(donnees, a, a.variantes[0]).longueur;
      const l2 = maillageArme(d2, armeParId(d2, a.id), armeParId(d2, a.id).variantes[0]).longueur;
      expect(l2 / l1, a.id).toBeCloseTo(a.taille ? 1 : 1.5 / 0.8, 4);
    }
  });
});

describe('déterminisme', () => {
  it.each(toutes)('%s %s : même entrée, mêmes sommets', (id, vid) => {
    const a = armeParId(donnees, id);
    const m1 = maillageArme(donnees, a, varianteDe(a, vid));
    const m2 = maillageArme(lireArmes(JSON.parse(JSON.stringify(json))), a, varianteDe(a, vid));
    expect(empreinte(m1)).toBe(empreinte(m2));
    expect(Array.from(m1.positions)).toEqual(Array.from(m2.positions));
    expect(m1.positions.every(Number.isFinite)).toBe(true);
    expect(m1.normals.every(Number.isFinite)).toBe(true);
  });

  it('les variantes d\'une arme diffèrent (matières ou détails) sans changer d\'identité', () => {
    for (const a of donnees.armes) {
      const e = a.variantes.map((v) => empreinte(maillageArme(donnees, a, v)));
      expect(new Set(e).size, a.id).toBe(e.length);
    }
  });

  it('atlas : 256 px, 16 tuiles, déterministe, couleurs venues des jetons --arm-*', () => {
    for (const j of JETONS) expect(palette[j], j).toBeDefined();
    const a = genererAtlas(palette);
    expect(a.width).toBe(TAILLE);
    expect(a.width).toBeLessThanOrEqual(donnees.budgets.texture);
    expect(TUILES.length).toBe(16);
    expect(Buffer.from(genererAtlas(palette).data).equals(Buffer.from(a.data))).toBe(true);
    // Le noyer est plus sombre que le hêtre ; l'acier bruni plus sombre que le laiton.
    const lum = (c) => c[0] + c[1] + c[2];
    expect(lum(moyenneTuile(a, 'noyer'))).toBeLessThan(lum(moyenneTuile(a, 'hetre')));
    expect(lum(moyenneTuile(a, 'bruni'))).toBeLessThan(lum(moyenneTuile(a, 'laiton')));
    const [u0, v0, u1, v1] = rectTuile('perfore');
    expect(u1 - u0).toBeCloseTo(60 / 256, 6);
    expect(v1 - v0).toBeCloseTo(60 / 256, 6);
  });
});

describe('géométrie', () => {
  it('triangulation d\'un polygone concave (pontet en U) : n − 2 triangles', () => {
    const u = [[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10]];
    expect(trianguler(u).length).toBe(6);
    expect(trianguler([...u].reverse()).length).toBe(6);
  });

  it('une boîte : 12 triangles, normales sortantes', () => {
    const m = maillage([{ forme: 'boite', w: 2, h: 2, l: 2, pos: [0, 0, 0] }]);
    expect(m.triangles).toBe(12);
    for (let i = 0; i < 12; i += 1) {
      const c = [0, 1, 2].map((k) => (m.positions[i * 9 + k] + m.positions[i * 9 + 3 + k] + m.positions[i * 9 + 6 + k]) / 3);
      const n = [0, 1, 2].map((k) => m.normals[i * 9 + k]);
      expect(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]).toBeGreaterThan(0);
    }
  });

  it('un profil extrudé : faces latérales sortantes', () => {
    const m = maillage([{ forme: 'profil', pts: [[0, 0], [10, 0], [10, 4], [0, 4]], e: 2, pos: [0, 0, 0] }]);
    for (let i = 0; i < m.triangles; i += 1) {
      const c = [0, 1, 2].map((k) => (m.positions[i * 9 + k] + m.positions[i * 9 + 3 + k] + m.positions[i * 9 + 6 + k]) / 3);
      const n = [0, 1, 2].map((k) => m.normals[i * 9 + k]);
      expect(c[0] * n[0] + (c[1] - 2) * n[1] + (c[2] - 5) * n[2]).toBeGreaterThan(0);
    }
  });

  it('posée sur le côté : bas à y = 0, centrée ; le levier du Kar98k (côté droit) vers le haut', () => {
    const a = armeParId(donnees, 'kar98k');
    const m = coucher(maillageArme(donnees, a, a.variantes[0], { pose: 'caisse' }));
    expect(m.bornes.min[1]).toBeCloseTo(0, 5);
    expect(m.bornes.min[2] + m.bornes.max[2]).toBeCloseTo(0, 4);
    const tenue = maillageArme(donnees, a, a.variantes[0]);
    expect(Math.abs(tenue.bornes.min[0])).toBeGreaterThan(Math.abs(tenue.bornes.max[0])); // levier à droite (−x)
  });
});

describe('caisse d\'armes', () => {
  it.each(TYPES)('%s : ≤ 300 triangles, empreinte compatible avec les meubles, dessinée sous 43', (type) => {
    const d = dimensionsCaisse(donnees.caisses, type);
    const m = maillageCaisse(type, d);
    expect(m.triangles).toBeLessThanOrEqual(donnees.budgets.caisse);
    expect(m.bornes.max[1]).toBeLessThan(HAUTEUR_ARME_JOUEUR);
    expect(d.p).toBeLessThanOrEqual(60); // profondeur d'une étagère de la carte
    expect(d.l).toBeLessThanOrEqual(80);
    expect(ancreTexte(d)[1]).toBeGreaterThan(d.h);
  });

  it.each(toutes)('%s %s posée sur chaque caisse : plus courte que la caisse, tout sous 43 (tirs par-dessus)', (id, vid) => {
    const a = armeParId(donnees, id);
    const m = coucher(maillageArme(donnees, a, varianteDe(a, vid), { pose: 'caisse' }));
    for (const type of TYPES) {
      const d = dimensionsCaisse(donnees.caisses, type, m.bornes.max[2] - m.bornes.min[2]); // lot 9c-G : la caisse s'allonge pour l'arme
      expect(d.appui + m.bornes.max[1], `${id} ${vid} ${type}`).toBeLessThan(HAUTEUR_ARME_JOUEUR);
      expect(m.bornes.max[2] - m.bornes.min[2]).toBeLessThan(d.l);
    }
  });

  it('craie : quatre bandes au sol, transparentes ; texture 256 px déterministe ; pochoirs inventés', () => {
    const d = dimensionsCaisse(donnees.caisses, 'caisse');
    const c = maillageCaisse('caisse', d, { craie: true });
    expect(c.triangles).toBe(48);
    expect(c.bornes.max[1]).toBeLessThan(1);
    const t1 = genererTextureCaisse(palette);
    expect(t1.width).toBe(256);
    expect(Buffer.from(genererTextureCaisse(palette).data).equals(Buffer.from(t1.data))).toBe(true);
    let transparents = 0;
    for (let i = 3; i < t1.data.length; i += 4) if (t1.data[i] < 255) transparents += 1;
    expect(transparents).toBeGreaterThan(0);
    for (const p of Object.values(POCHOIRS)) expect(p).toMatch(/^[A-Z0-9 /-]+$/);
  });
});

describe('choix du propriétaire (data/armes/armes-choix.json)', () => {
  it('le fichier du dépôt est lu sans écart', () => {
    const c = lireChoix(donnees, choixJson);
    expect(c.ecarts).toEqual([]);
    for (const a of donnees.armes) expect(a.variantes.map((v) => v.id)).toContain(c.variantes[a.id]);
  });

  it('choix du propriétaire : variante A pour toutes les armes ; bretelle sur le Kar98k et le Garand (les armes qui en ont une)', () => {
    const c = lireChoix(donnees, choixJson);
    for (const a of donnees.armes) expect(c.variantes[a.id], a.id).toBe('a');
    for (const id of ['kar98k', 'garand']) {
      const a = armeParId(donnees, id);
      expect(varianteDe(a, 'a').options.bretelle, id).toBe(true);
      expect(piecesArme(a, varianteDe(a, 'a'), 'main').some((p) => p.mat === 'cuir'), id).toBe(true);
    }
  });

  it('choix invalide : variante par défaut (la première), arme spéciale par défaut, écarts signalés', () => {
    const c = lireChoix(donnees, { variantes: { kar98k: 'z', m1911: 42, inconnue: 'a', thompson: 'b' }, armeSpeciale: 'canon' });
    expect(c.variantes.kar98k).toBe('a');
    expect(c.variantes.m1911).toBe('a');
    expect(c.variantes.thompson).toBe('b');
    expect(c.ecarts.length).toBe(4);
    const speciales = ['panzerschreck', 'm2lanceflammes'].filter((s) => armeParId(donnees, s));
    expect(c.armeSpeciale).toBe(speciales[0] ?? null);
    for (const x of [null, 'texte', [], { variantes: 'a' }]) expect(lireChoix(donnees, x).variantes.m1911).toBe('a');
  });
});

describe('visuels 2D du menu (SVG de profil)', () => {
  it.each(donnees.armes.map((a) => [a.id]))('%s : SVG de profil, quelques Ko, déterministe, sans couleur en dur ni Three.js', (id) => {
    const a = armeParId(donnees, id);
    const r = visuelArme(donnees, a, a.variantes[0], { id: `v-${id}`, titre: a.nom });
    expect(r.svg.startsWith('<svg')).toBe(true);
    expect(r.svg).toContain(`viewBox="0 0 ${LARGEUR} ${HAUTEUR}"`);
    expect(r.svg).toContain(`<title id="v-${id}-t">${a.nom}</title>`);
    expect(r.octets).toBeGreaterThan(500);
    expect(r.octets).toBeLessThanOrEqual(8000);
    expect(r.svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/);
    expect(r.svg).not.toMatch(/<image|href="http/);
    expect(visuelArme(donnees, a, a.variantes[0], { id: `v-${id}`, titre: a.nom }).svg).toBe(r.svg);
    // Toutes les classes de remplissage ont une règle dans css/armes.css.
    for (const c of new Set([...r.svg.matchAll(/class="(arm-t-[a-z-]+)"/g)].map((m) => m[1]))) expect(tokens, c).toMatch(new RegExp(`\\.${c}[ ,{]`));
  });
});

describe('retours du propriétaire (lot 9c-G) : taille, épaisseur, prises', () => {
  it('épaissir : seules les dimensions sous le seuil grossissent (canon, crosse, plaque), jamais la longueur d\'une pièce longue', () => {
    expect(epaissir({ forme: 'boite', w: 22, h: 150, l: 40 }, 2, 60)).toMatchObject({ w: 44, h: 150, l: 40 });
    expect(epaissir({ forme: 'tube', r: 9, r2: 8, l: 500 }, 2, 60)).toMatchObject({ r: 18, r2: 16, l: 500 });
    expect(epaissir({ forme: 'tube', r: 47, l: 1640 }, 2, 60)).toMatchObject({ r: 47 }); // tube du Panzerschreck : déjà épais
    expect(epaissir({ forme: 'profil', pts: [], e: 30 }, 2, 60).e).toBe(60);
    expect(epaissir({ forme: 'loft', sections: [{ z: 0, w: 42, h: 125 }] }, 2, 60).sections[0]).toMatchObject({ w: 84, h: 125 });
  });

  it('l\'épaisseur ne change ni la longueur ni le nombre de triangles ; elle élargit l\'arme vue de dessus', () => {
    const fin = avecEchelle(donnees, { epaisseur: 1 });
    for (const a of donnees.armes) {
      const [m1, m2] = [fin, donnees].map((d) => maillageArme(d, a, a.variantes[0], { pose: 'seule' }));
      expect(m2.triangles).toBe(m1.triangles);
      expect(m2.longueur).toBeCloseTo(m1.longueur, 0);
      if (a.id === 'panzerschreck') expect(m2.largeur).toBeGreaterThanOrEqual(m1.largeur); // largeur donnée par le bouclier (360 mm, non épaissi)
      else expect(m2.largeur, a.id).toBeGreaterThan(m1.largeur);
    }
  });

  it('avecEchelle : bornes (longueur 0,5 à 3, épaisseur 1 à 3) ; les données d\'origine ne changent pas', () => {
    const d = avecEchelle(donnees, { longueur: 9, epaisseur: 0.2 });
    expect(d.echelle.lisibilite).toBe(3);
    expect(d.echelle.epaisseur).toBe(1);
    expect(donnees.echelle.lisibilite).toBe(0.8);
    expect(avecEchelle(donnees, null).echelle).toEqual(donnees.echelle);
  });

  it('fichier de choix : échelle lue si valide, écart signalé sinon', () => {
    expect(lireChoix(donnees, { echelle: { longueur: 1.5, epaisseur: 2, largeur: 2.5 } }).echelle).toEqual({ longueur: 1.5, epaisseur: 2, largeur: 2.5 });
    expect(lireChoix(donnees, { echelle: { largeur: 5 } }).ecarts).toEqual(['échelle de largeur invalide : 5']);
    const c = lireChoix(donnees, { echelle: { longueur: 'grand', epaisseur: 9 } });
    expect(c.echelle).toEqual({});
    expect(c.ecarts.length).toBe(2);
    expect(lireChoix(donnees, {}).echelle).toBeNull();
  });

  it('prises : pose du propriétaire pour chaque arme ; paume droite, paume gauche (sauf main libre), crosse pour l\'épaule et le tube', () => {
    const attendu = { m1911: 'pistolet', kar98k: 'epaule', garand: 'epaule', thompson: 'epaule', stg44: 'epaule', winchester1897: 'epaule', bar: 'hanche', mg42: 'hanche', m2lanceflammes: 'hanche', panzerschreck: 'sur-epaule' };
    for (const a of donnees.armes) {
      expect(TENUES, a.id).toContain(a.prises.tenue);
      expect(a.prises.tenue, a.id).toBe(attendu[a.id]);
      expect(a.prises.droite, a.id).toHaveLength(3);
      expect(a.prises.gauche, a.id).not.toBeNull();
      if (['epaule', 'sur-epaule'].includes(a.prises.tenue)) expect(a.prises.crosse, a.id).not.toBeNull();
    }
  });

  it('lacet : seuls les réservoirs (groupe « dos ») tournent, la lance ne bouge pas', () => {
    const a = armeParId(donnees, 'm2lanceflammes');
    const [p0, p1] = [0, -34].map((lacet) => piecesArme(a, a.variantes[0], 'main', { lacet }));
    p0.forEach((p, i) => {
      if (p.groupe === 'dos') expect(p1[i].rot?.[1] ?? 0).toBeCloseTo((p.rot?.[1] ?? 0) - 34, 6);
      else expect(p1[i]).toEqual(p);
    });
  });

  it('largeur vue de dessus, en jeu seulement : l\'arme tenue s\'élargit du facteur en x (longueur, hauteur et triangles inchangés) ; hors jeu, posée et réservoirs : jamais', () => {
    const etroit = avecEchelle(donnees, { largeur: 1 });
    for (const a of donnees.armes) {
      const [m1, m2] = [etroit, donnees].map((d) => maillageArme(d, a, a.variantes[0], { pose: 'seule', enJeu: true }));
      expect(m2.largeur / m1.largeur, a.id).toBeCloseTo(1.5, 4);
      expect(Array.from(maillageArme(donnees, a, a.variantes[0], { pose: 'seule' }).positions)).toEqual(Array.from(m1.positions)); // hors de la vue du jeu
      expect(m2.longueur).toBeCloseTo(m1.longueur, 6);
      expect(m2.hauteur).toBeCloseTo(m1.hauteur, 6);
      expect(m2.triangles).toBe(m1.triangles);
      const [c1, c2] = [etroit, donnees].map((d) => maillageArme(d, a, a.variantes[0], { pose: 'caisse', enJeu: true }));
      expect(Array.from(c2.positions)).toEqual(Array.from(c1.positions));
    }
    const m2 = armeParId(donnees, 'm2lanceflammes');
    const [r1, r2] = [etroit, donnees].map((d) => maillageArme(d, m2, m2.variantes[0], { enJeu: true }));
    expect(r2.largeur).toBeLessThan(1.5 * r1.largeur); // réservoirs portés non élargis
    expect(avecEchelle(donnees, { largeur: 9 }).echelle.largeur).toBe(4);
  });

  it('un seul facteur commun (décision du propriétaire), une seule exception : le Colt à ×1,2 (retour du propriétaire) ; la caisse comprise', () => {
    expect(Object.keys(donnees.echelle).sort()).toEqual(['epaisseur', 'largeur', 'lisibilite', 'seuilEpaisseur', 'unitesParMetre']);
    expect(donnees.armes.filter((a) => a.taille !== null).map((a) => [a.id, a.taille])).toEqual([['m1911', 1.2]]);
    const colt = armeParId(donnees, 'm1911');
    expect(echelleJeu(donnees, colt) / echelleJeu(donnees)).toBeCloseTo(1.2 / 0.8, 6);
    expect(lireArmes({ ...json, armes: json.armes.map((a) => ({ ...a, taille: 9 })) }).armes[0].taille).toBe(3);
    for (const a of donnees.armes) {
      const main = maillageArme(donnees, a, a.variantes[0], { pose: 'seule' });
      const posee = maillageArme(donnees, a, a.variantes[0], { pose: 'caisse' });
      if (!a.dos) expect(posee.longueur / main.longueur, a.id).toBeCloseTo(1, 4);
    }
  });
});
