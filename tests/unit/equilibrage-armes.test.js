// Lot 9k — Bornes de l'équilibrage retenu par le propriétaire (seconde révision de la proposition : « un minimum dur, le joueur meurt et améliore
// son personnage avec les objets » ; armes : dégâts et prix seulement ; vie des zombies plus régulière). Calculs de scripts/equilibrage/modele.mjs
// (aisance : zombies tués par seconde ÷ zombies arrivant par seconde, rapportée au Colt sans équipement, moyenne des manches 1 à 10 ; précision
// du joueur automatique). Valeurs provisoires : ces tests gardent les relations, pas les chiffres exacts des armes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { waveSpec } from '../../js/core/waves.js';
import { modele, vague } from '../../scripts/equilibrage/modele.mjs';

const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const armesPartie = json('data/game/armes-partie.json');
const waves = json('data/game/waves.json');
const enemies = json('data/game/enemies.json');
const PRECISION = { m1911: 0.85, winchester1897: 0.67, kar98k: 0.8, thompson: 0.8 };
const M = modele({ armesPartie, waves, enemies, precision: PRECISION });
const A = armesPartie.armes;
const CAISSES = [['winchester1897', 11], ['kar98k', 21], ['thompson', 31]];
const tues = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => waveSpec(a + i, waves).total).reduce((s, n) => s + n, 0) * 10;

describe('prix et rachat', () => {
  // Zollars en poche à l'ouverture de chaque pièce si tout est tué (10 par zombie), l'arme précédente achetée à son prix.
  const poche11 = tues(1, 10);
  const poche21 = poche11 - A.winchester1897.prix + tues(11, 20);
  const poche31 = poche21 - A.kar98k.prix + tues(21, 30);
  it('chaque prix vaut 40 à 60 % des Zollars en poche à l\'ouverture de sa pièce ; prix croissants', () => {
    for (const [id, poche] of [['winchester1897', poche11], ['kar98k', poche21], ['thompson', poche31]]) {
      expect(A[id].prix / poche, id).toBeGreaterThanOrEqual(0.4);
      expect(A[id].prix / poche, id).toBeLessThanOrEqual(0.6);
    }
    expect(A.winchester1897.prix).toBeLessThan(A.kar98k.prix);
    expect(A.kar98k.prix).toBeLessThan(A.thompson.prix);
  });
  it('rachat (munitions pleines) : 30 à 40 % du prix ; le Colt ne se vend pas', () => {
    for (const [id] of CAISSES) {
      expect(A[id].rachat / A[id].prix, id).toBeGreaterThanOrEqual(0.3);
      expect(A[id].rachat / A[id].prix, id).toBeLessThanOrEqual(0.4);
    }
    expect(A.m1911.prix).toBe(0);
  });
});

describe('puissance des armes', () => {
  it('à sa manche d\'achat, chaque arme de caisse tue plus vite que le Colt ; la Thompson au moins 1,5 fois', () => {
    for (const [id, v] of CAISSES) expect(M.aisance(id, v), id).toBeGreaterThan(M.aisance('m1911', v));
    expect(M.aisance('thompson', 31)).toBeGreaterThanOrEqual(1.5 * M.aisance('m1911', 31));
  });
  it('usure : dix manches après son achat, le pompe et la Thompson ont perdu au moins 30 % de leur aisance (l\'arme suivante a de l\'intérêt)', () => {
    for (const [id, v] of [['winchester1897', 11], ['thompson', 31]]) expect(M.aisance(id, v + 10), id).toBeLessThan(0.7 * M.aisance(id, v));
  });
  it('Kar98k (choix du propriétaire : « armes faibles assumées ») : sa cadence le plafonne (aucune perforation) ; à la 21, moins bon que le pompe', () => {
    const plafond = modele({ armesPartie: { ...armesPartie, armes: { ...A, kar98k: { ...A.kar98k, degats: 1e6 } } }, waves, enemies, precision: PRECISION }).aisance('kar98k', 21);
    expect(M.aisance('kar98k', 21)).toBeGreaterThan(0.85 * plafond);
    expect(M.aisance('kar98k', 21)).toBeLessThan(M.aisance('winchester1897', 21));
  });
  it('choix du propriétaire : seuls les dégâts et les prix changent (chargeur, réserve, cadence, rechargement de la table du lot 9e)', () => {
    const avant = { m1911: [7, null, 0.4, 1.4], winchester1897: [6, 30, 0.9, 3.31], kar98k: [5, 30, 1.05, 3.9], thompson: [30, 660, 0.09, 2.4] };
    for (const [id, [c, r, cad, rech]] of Object.entries(avant)) expect([A[id].chargeur, A[id].reserve, A[id].cadence, A[id].rechargement], id).toEqual([c, r, cad, rech]);
  });
});

describe('vie des zombies (choix du propriétaire : plus régulière, coups inchangés)', () => {
  it('vie du marcheur aux manches 1 / 10 / 20 / 21 / 31 / 40 : 50 / 95 / 145 / 151 / 223 / 318 (arrondis)', () => {
    expect([1, 10, 20, 21, 31, 40].map((v) => Math.round(vague(v, waves, enemies).vies.marcheur))).toEqual([50, 95, 145, 151, 223, 318]);
  });
  it('de la 21 à la 40, la demande (vie × arrivées) monte toujours, de 6 % au plus par manche (4 % de vie, plus le mélange des types)', () => {
    for (let v = 22; v <= 40; v += 1) {
      const r = vague(v, waves, enemies).demande / vague(v - 1, waves, enemies).demande;
      expect(r, String(v)).toBeGreaterThan(1);
      expect(r, String(v)).toBeLessThanOrEqual(1.06);
    }
  });
  it('coups des zombies inchangés (10, ×1,05 par manche, plafond ×3)', () => {
    expect(enemies.zombie.contactDamage).toBe(10);
    expect(waves.damage).toEqual({ factor: 1.05, cap: 3 });
  });
});
