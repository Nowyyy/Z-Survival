// Lot 8g : lecture des données de l'écran Crédits (Docs/ref/menu-principal.md, « Lot 8g »). Pur : ni rendu, ni stockage, ni réseau, ni horloge.
// data/menu/credits.json (modifiable par le propriétaire sans lot) et data/menu/licences.json (écrit par scripts/studio/licences.mjs). Toute entrée
// invalide est ignorée (sans exception) ; les textes sont rendus en texte brut par js/menu/credits.js.
export const MAX_SECTIONS = 12;
export const MAX_NOMS = 60;
export const MAX_TITRE = 60;
export const MAX_NOM = 80;
export const LICENCES_OBLIGATOIRES = Object.freeze(['three', 'barlow', 'rubik-wet-paint', 'rubik-dirt', 'discord']);

// Caractères de contrôle (codes 0 à 31 et 127) remplacés par une espace.
const sansControle = (s) => Array.from(s, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('');
const texte = (s, max) => (typeof s === 'string' ? sansControle(s).trim().slice(0, max) : '');
const propre = (o, k) => {
  const d = o && typeof o === 'object' ? Object.getOwnPropertyDescriptor(o, k) : undefined;
  return d && 'value' in d ? d.value : undefined;
};

// → [{ titre, noms: [..], provisoire }] : titre non vide ; noms non vides ; section sans nom gardée seulement si provisoire.
export function lireCredits(json) {
  const brut = propre(json, 'sections');
  const sections = [];
  for (const s of Array.isArray(brut) ? brut.slice(0, MAX_SECTIONS) : []) {
    const titre = texte(propre(s, 'titre'), MAX_TITRE);
    if (!titre) continue;
    const listeNoms = propre(s, 'noms');
    const noms = (Array.isArray(listeNoms) ? listeNoms.slice(0, MAX_NOMS) : []).map((n) => texte(n, MAX_NOM)).filter(Boolean);
    const provisoire = propre(s, 'provisoire') === true;
    if (noms.length === 0 && !provisoire) continue;
    sections.push({ titre, noms, provisoire });
  }
  return sections;
}

// → [{ id, nom, role, licence, avis, texte }] : champs textes obligatoires (role facultatif), identifiants uniques ; texte de licence gardé entier.
export function lireLicences(json) {
  const brut = propre(json, 'licences');
  const ids = new Set();
  const out = [];
  for (const l of Array.isArray(brut) ? brut.slice(0, 20) : []) {
    const id = propre(l, 'id');
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(id) || ids.has(id)) continue;
    const nom = texte(propre(l, 'nom'), 60);
    const licence = texte(propre(l, 'licence'), 80);
    const avisBrut = propre(l, 'avis');
    const texteBrut = propre(l, 'texte');
    if (!nom || !licence || typeof avisBrut !== 'string' || !avisBrut.trim() || typeof texteBrut !== 'string' || !texteBrut.trim()) continue;
    ids.add(id);
    out.push({ id, nom, role: texte(propre(l, 'role'), 80), licence, avis: avisBrut.trim().slice(0, 2000), texte: texteBrut.slice(0, 20000) });
  }
  return out;
}

// Licences obligatoires absentes des données lues (liste vide : tout y est).
export const licencesManquantes = (licences) => LICENCES_OBLIGATOIRES.filter((id) => !licences.some((l) => l.id === id));
