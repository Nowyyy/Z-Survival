import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireArmes } from '../../js/core/armes/armes.js';
import { ARMES_POSEES, fichierPoses } from '../../js/armes/poses-calcul.js';
import { ARTICULATIONS, REGLES } from '../../js/armes/tenue.js';

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

  it.each(toutes)('%s (%s) : mains sur leurs prises, rien dans la tête ni le torse (crosse exceptée), canon dans l\'axe, arme devant le personnage', (id, mode, p) => {
    expect(p.controle.droite, 'main droite').toBeLessThanOrEqual(0.05);
    expect(p.controle.gauche, 'main gauche').toBeLessThanOrEqual(0.05);
    expect(p.controle.traverse, 'points de l\'arme dans la tête ou le torse').toBe(0);
    expect(p.controle.visee, 'écart à l\'axe de visée (degrés)').toBeLessThanOrEqual(5);
    expect(p.controle.devant, 'bouche devant le corps (vue de dessus)').toBeGreaterThan(5);
  });

  it.each(toutes)('%s (%s) : limites du propriétaire (torse 30° au plus, épaules ±9 au moins, bras +20 % au plus) ; angles de toutes les articulations', (id, mode, p) => {
    expect(p.torse).toBeLessThanOrEqual(30);
    expect(p.epaules).toBeGreaterThanOrEqual(9);
    expect(p.bras).toBeLessThanOrEqual(1.2);
    if (p.pose === 'pistolet') expect([p.torse, p.epaules, p.bras]).toEqual([0, 11.5, 1]);
    expect(Object.keys(p.angles)).toEqual([...ARTICULATIONS]);
    for (const a of Object.values(p.angles)) expect(a.every(Number.isFinite)).toBe(true);
  });
});
