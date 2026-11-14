// Lot 8j : message « Porte ouverte à la manche X » à l'approche d'une porte encore fermée. Pur et en LECTURE SEULE : lit les portes de la carte
// (layouts.doors : { id, planned, openAfterWave, blocks: { rdc: [{ rect }], etage: [...] } }) et leur état ({ [id]: { open } }), ne rend qu'un
// objet ; rien n'est écrit dans l'état du jeu. Manche affichée : openAfterWave + 1 (la porte s'ouvre à la fin de la manche openAfterWave ;
// même convention que nextDoor, js/core/zones.js). Une porte « planned » ou ouverte n'a jamais de message.
import { distanceToRect } from './collision.js';

export const PORTE_DEFAUT = Object.freeze({ distance: 200 });
export const PORTE_BORNES = Object.freeze({ min: 20, max: 2000 });

// Réglage lu dans data/game/reglages-partie.json (porte.distance, unités du jeu) ; hors bornes ou invalide : le défaut.
export function reglagesPorte(json) {
  const d = json?.distance;
  return { distance: typeof d === 'number' && Number.isFinite(d) && d >= PORTE_BORNES.min && d <= PORTE_BORNES.max ? d : PORTE_DEFAUT.distance };
}

// Porte fermée la plus proche du joueur sur son étage, à `distance` au plus (bord du bloc le plus proche) : { id, manche, distance } ou null.
export function porteProche(portes, etat, joueur, etage = 'rdc', distance = PORTE_DEFAUT.distance) {
  if (!Array.isArray(portes) || !joueur || !Number.isFinite(joueur.x) || !Number.isFinite(joueur.y)) return null;
  let best = null;
  for (const p of portes) {
    if (!p || p.planned === true || etat?.[p.id]?.open === true || !Number.isInteger(p.openAfterWave) || p.openAfterWave < 1) continue;
    const blocs = Array.isArray(p.blocks?.[etage]) ? p.blocks[etage] : [];
    for (const b of blocs) {
      const r = b?.rect;
      if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !(r.w > 0) || !(r.h > 0)) continue;
      const d = distanceToRect(joueur.x, joueur.y, r);
      if (d <= distance && (best === null || d < best.distance)) best = { id: p.id, manche: p.openAfterWave + 1, distance: d };
    }
  }
  return best;
}
