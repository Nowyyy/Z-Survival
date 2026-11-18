import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { armeParId, lireArmes, maillageArme, sectionsBretelle } from '../../js/core/armes/armes.js';
import { ARMES_POSEES, calculerPoses, fichierPoses } from '../../js/armes/poses-calcul.js';
import { ARTICULATIONS, CORPS_LONG, RAYON_MAIN, REGLES, echantillons } from '../../js/armes/tenue.js';

// Lot 9c (décision du propriétaire) : poses de tenue calculées sur une instance du personnage de l'atelier (le personnage du jeu ne change
// pas) ; data/armes/poses.json doit être à jour, et chaque arme posée doit être tenue correctement.
const j = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fichier = j('data/armes/poses.json');
const donnees = lireArmes(j('data/armes/armes.json'));
const calcul = fichierPoses({ characters: j('data/game/characters-v2.json'), poses: j('data/game/poses-v2.json'), donnees });
const toutes = Object.entries(fichier.armes).flatMap(([id, a]) => Object.entries(a.modes).map(([mode, p]) => [id, mode, p]));

describe('poses de tenue (data/armes/poses.json)', () => {
  it('le fichier est à jour : même calcul, mêmes règles, même facteur commun que les données', () => {
    expect(fichier.facteur).toBe(donnees.echelle.lisibilite);
    expect(fichier.regles).toEqual(JSON.parse(JSON.stringify(REGLES)));
    expect(Object.keys(fichier.armes).sort()).toEqual([...ARMES_POSEES].sort());
    expect(JSON.parse(JSON.stringify(calcul))).toEqual(fichier);
  });

  it('les dix armes dans les poses demandées par le propriétaire (pistolet à deux mains et à une main, épaule, hanche, sur l\'épaule)', () => {
    const attendu = { m1911: 'pistolet', kar98k: 'epaule', garand: 'epaule', thompson: 'epaule', stg44: 'epaule', winchester1897: 'epaule', bar: 'hanche', mg42: 'hanche', m2lanceflammes: 'hanche', panzerschreck: 'sur-epaule' };
    expect(Object.fromEntries(Object.entries(fichier.armes).map(([id, a]) => [id, a.pose]))).toEqual(attendu);
    expect(Object.keys(fichier.armes.m1911.modes).sort()).toEqual(['deux-mains', 'une-main']);
    expect(fichier.armes.m2lanceflammes.modes['deux-mains'].arme.dos.lacet).toBe(-fichier.armes.m2lanceflammes.modes['deux-mains'].torse); // réservoirs tournés avec le torse
  });

  it.each(toutes)('%s (%s) : mains sur leurs prises et contre l\'arme (pas dedans), rien dans la tête ni le torse (crosse exceptée), canon dans l\'axe, arme devant le personnage', (id, mode, p) => {
    expect(p.controle.droite, 'main droite').toBeLessThanOrEqual(0.05);
    expect(p.controle.gauche, 'main gauche').toBeLessThanOrEqual(0.05);
    expect(p.controle.traverse, 'points de l\'arme dans la tête ou le torse').toBe(0);
    expect(p.controle.mains, 'points de l\'arme sous les paumes (retour : « la main arrière est dans l\'arme »)').toBe(0);
    if (p.arme.bretelle) expect(p.controle.bretelle, 'bretelle dans un bras, une main ou le torse (retour : « la bretelle doit être contre le bras »)').toBe(0);
    expect(p.controle.visee, 'écart à l\'axe de visée (degrés)').toBeLessThanOrEqual(5);
    expect(p.controle.devant, 'bouche devant le corps (vue de dessus)').toBeGreaterThan(5);
  });

  it.each(toutes)('%s (%s) : limites du propriétaire (torse 30° au plus, épaules ±9 au moins, bras +20 % au plus) ; angles de toutes les articulations', (id, mode, p) => {
    expect(p.torse).toBeLessThanOrEqual(30);
    expect(p.epaules).toBeGreaterThanOrEqual(9);
    expect(p.bras).toBeLessThanOrEqual(1.2);
    if (p.pose === 'pistolet') expect(p.torse).toBe(0); // pistolet : de face (corps long commun : voir plus bas)
    expect(Object.keys(p.angles)).toEqual([...ARTICULATIONS]);
    for (const a of Object.values(p.angles)) expect(a.every(Number.isFinite)).toBe(true);
  });
});

describe('bretelle (retour : « la main ne doit pas être mise sur la bretelle mais sur l\'arme »)', () => {
  it.each([['kar98k'], ['garand']])('%s : bretelle déviée contre le bras, attaches fixes, main gauche sur l\'arme', (id) => {
    const p = fichier.armes[id].modes['deux-mains'];
    const a = armeParId(donnees, id);
    const base = sectionsBretelle(donnees, a, a.variantes[0]);
    expect(p.arme.bretelle).toHaveLength(base.length);
    for (const i of [0, base.length - 1]) expect(p.arme.bretelle[i]).toEqual([base[i].x, base[i].y, base[i].z].map(Math.round));
    expect(p.controle.bretelle).toBe(0);
    // La paume gauche touche l'arme (bretelle exclue) : point de l'arme le plus proche à RAYON_MAIN (+ un pas de 0,05), pas plus loin.
    const pts = echantillons(maillageArme(donnees, a, a.variantes[0], { pose: 'seule', sansBretelle: true }).positions);
    let d = Infinity;
    for (let i = 0; i < pts.length; i += 3) d = Math.min(d, Math.hypot(pts[i] - p.prises.gauche[0], pts[i + 1] - p.prises.gauche[1], pts[i + 2] - p.prises.gauche[2]));
    expect(d).toBeGreaterThanOrEqual(RAYON_MAIN - 0.01);
    expect(d).toBeLessThan(RAYON_MAIN + 0.1);
  });
});

describe('corps retenu par le propriétaire : bras ×1,2 et épaules ±9 pour toutes les armes (CORPS_LONG)', () => {
  // Pour comparer : le corps adapté à chaque arme (écartements et allongements essayés arme par arme).
  const adapte = calculerPoses({ characters: j('data/game/characters-v2.json'), poses: j('data/game/poses-v2.json'), donnees, ids: ['m1911'] });
  it('poses.json : corps commun noté pour le lot d\'intégration', () => {
    expect(fichier.corps).toEqual({ epaules: CORPS_LONG.epaules, bras: CORPS_LONG.f });
    expect(fichier.corps).toEqual({ epaules: 9, bras: 1.2 });
  });
  it.each(toutes)('%s (%s) : même corps, tenue correcte', (id, mode, p) => {
    expect([p.bras, p.epaules]).toEqual([1.2, 9]);
    expect([p.controle.droite, p.controle.gauche, p.controle.traverse, p.controle.mains]).toEqual([0, 0, 0, 0]);
    if (p.arme.bretelle) expect(p.controle.bretelle).toBe(0);
    expect(p.controle.visee).toBeLessThanOrEqual(5);
    expect(p.controle.devant).toBeGreaterThan(5);
    expect(p.torse).toBeLessThanOrEqual(30);
  });

  it.each([['deux-mains'], ['une-main']])('Colt (%s) : bras tendus comme avec le corps du personnage, pas repliés (retour du propriétaire)', (mode) => {
    const long = fichier.armes.m1911.modes[mode];
    const normal = adapte.armes.m1911.modes[mode];
    expect([normal.bras, normal.epaules]).toEqual([1, 11.5]);
    expect(Math.abs(long.angles.elbowR[0])).toBeLessThanOrEqual(Math.abs(normal.angles.elbowR[0]) + 0.01);
    expect(long.controle.devant).toBeGreaterThan(normal.controle.devant);
  });
});
