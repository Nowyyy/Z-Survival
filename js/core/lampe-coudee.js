// Lot 9i (atelier, avant le « GO 9i ») : lampe coudée de l'armée américaine (inspirée du modèle TL-122 : corps cylindrique, tête coudée à angle droit,
// lentille, pince de ceinture) accrochée sur la gauche de la poitrine du joueur, à la place de la lampe frontale de l'ancienne variante B (pièces
// « lamp » et « lampBand » sur la tête). Pur : pièces au format de data/game/characters-v2.json (os « chest » ; x vers la gauche du personnage,
// z vers l'avant, unités du personnage), aucune lumière : il n'existe aucune lumière dynamique du joueur dans le jeu (la frontale n'était qu'une
// pièce émissive), seule la lentille garde la matière « glow » (jeton --perso-lampe). Docs/ref/decor-epoque.md, « Lampe du joueur ».
const POS = Object.freeze({ x: 4.6, y: 7.4, z: 5.5 }); // gauche du haut de la poitrine, contre la veste (capsule de la poitrine : rayon 5,2)

export const PIECES_TL122 = Object.freeze([
  { id: 'tlPince', joint: 'chest', kind: 'box', dims: { w: 0.7, h: 3.2, d: 0.5 }, offset: [POS.x, POS.y + 0.4, POS.z - 0.6], rotation: [0, 0, 0], palette: 'metal' },
  { id: 'tlCorps', joint: 'chest', kind: 'taper', dims: { r0: 1.05, r1: 1.05, h: 4.2, sides: 8, sx: 1, sz: 1 }, offset: [POS.x, POS.y, POS.z], rotation: [0, 0, 0], palette: 'lampeCorps' },
  { id: 'tlTete', joint: 'chest', kind: 'box', dims: { w: 2.1, h: 2.1, d: 1.9 }, offset: [POS.x, POS.y + 2.9, POS.z + 0.5], rotation: [0, 0, 0], palette: 'lampeCorps' },
  { id: 'tlLentille', joint: 'chest', kind: 'box', dims: { w: 1.5, h: 1.5, d: 0.4 }, offset: [POS.x, POS.y + 2.9, POS.z + 1.6], rotation: [0, 0, 0], palette: 'lampe', material: 'glow' },
]);
export const PIECES_FRONTALE = Object.freeze(['lamp', 'lampBand']);

// Variante du joueur avec la lampe coudée (copie) : frontale retirée, pièces de la TL-122 ajoutées, couleurs « lampe » (--perso-lampe, lueur) et
// « lampeCorps » (olive de la tenue : palette pantalon de la variante, sinon --perso-casque). Les autres pièces ne changent pas.
export function avecLampeCoudee(variant) {
  if (!variant || !Array.isArray(variant.parts)) return variant;
  const palette = { ...(variant.palette ?? {}) };
  palette.lampe = palette.lampe ?? '--perso-lampe';
  palette.lampeCorps = palette.lampeCorps ?? palette.pantalon ?? '--perso-casque';
  palette.metal = palette.metal ?? '--perso-metal';
  return { ...variant, palette, parts: [...variant.parts.filter((p) => !PIECES_FRONTALE.includes(p.id) && !p.id?.startsWith?.('tl')), ...PIECES_TL122.map((p) => ({ ...p, dims: { ...p.dims }, offset: [...p.offset], rotation: [...p.rotation] }))] };
}

// Point de la lentille dans le repère de l'os « chest » (au cas où une lumière serait un jour ajoutée : elle partirait d'ici, vers l'avant).
export const LENTILLE = Object.freeze({ offset: [POS.x, POS.y + 2.9, POS.z + 1.8], direction: [0, 0, 1] });
