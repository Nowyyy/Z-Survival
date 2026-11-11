// Lot 8e : caisses mystère de la Boutique (Docs/ref/menu-principal.md). Pur : ni rendu, ni stockage, ni réseau, ni horloge, ni hasard propre ; le
// hasard vient d'une graine entière donnée par le menu (crypto.getRandomValues), passée au générateur à graine de js/core/rng.js. Données :
// data/menu/caisses.json (caisses, prix, chances par rareté en pour cent) et le catalogue du lot 8d (js/core/equipement.js, lireCatalogue).
// Règles : une rareté est tirée selon les pour cent de la caisse (cumul dans l'ordre des raretés), puis un objet uniformément parmi les objets du
// catalogue qui existent dans cette rareté (ordre du catalogue) ; ×10 = dix tirages indépendants à la suite du même générateur, sans garantie (le
// premier est celui de ×1 avec la même graine). Une caisse dont une rareté tirable n'a aucun objet dans le catalogue est refusée à la lecture
// (erreur listée). Entrée invalide : null ou liste vide, jamais d'exception. Prix affichés, jamais prélevés avant le lot 8h.
import { createRng, nextFloat } from './rng.js';

export const TIRAGES_X10 = 10;
const ID = /^[a-z0-9-]{1,32}$/;
// Teinte d'une caisse (couleur de ses « ? », de ses rayons et de sa bande) : un jeton existant de css/tokens.css.
const TEINTE = /^--(menu|rarete)-[a-z0-9-]{1,40}$/;
export const TEINTE_DEFAUT = '--menu-panneau-bois-texte';
const TOLERANCE = 1e-9;
const estObjet = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const texte = (s, max = 40) => (typeof s === 'string' && s.trim() !== '' ? s.trim().slice(0, max) : null);
const prix = (n) => (Number.isInteger(n) && n >= 0 && n <= 1e9 ? n : null);
const catalogueValide = (cat) => estObjet(cat) && Array.isArray(cat.raretes) && cat.objets instanceof Map;
const graineValide = (g) => Number.isSafeInteger(g) && g >= 0;

// Objets du catalogue qui existent dans une rareté, dans l'ordre du catalogue : [{ id, nom }].
export function objetsDeRarete(cat, rid) {
  if (!catalogueValide(cat)) return [];
  return [...cat.objets.values()].filter((o) => o?.raretes?.[rid]).map((o) => ({ id: o.id, nom: o.nom }));
}

// data/menu/caisses.json → { caisses, erreurs }. Caisse gardée seulement si : identifiant unique, nom, prix et prix10 entiers, chances sur des
// raretés connues (pour cent > 0), somme de 100 (à 10⁻⁹ près), chaque rareté tirable avec au moins un objet du catalogue. Teinte invalide : erreur,
// teinte par défaut. Chances rangées dans l'ordre des raretés.
export function lireCaisses(json, cat) {
  const erreurs = [];
  const caisses = [];
  if (!catalogueValide(cat)) return { caisses, erreurs: ['caisses : catalogue absent'] };
  const brut = estObjet(json) && Array.isArray(json.caisses) ? json.caisses : [];
  if (brut.length === 0) erreurs.push('caisses : liste absente ou vide');
  for (const c of brut) {
    const id = estObjet(c) && typeof c.id === 'string' && ID.test(c.id) ? c.id : null;
    if (!id || caisses.some((x) => x.id === id)) {
      erreurs.push(`caisse invalide ou en double : ${estObjet(c) ? c.id : c}`);
      continue;
    }
    const nom = texte(c.nom);
    const p1 = prix(c.prix);
    const p10 = prix(c.prix10);
    if (!nom || p1 === null || p10 === null) {
      erreurs.push(`caisse ${id} : nom, prix ou prix10 invalide`);
      continue;
    }
    let teinte = typeof c.teinte === 'string' && TEINTE.test(c.teinte) ? c.teinte : null;
    if (!teinte) {
      erreurs.push(`caisse ${id} : teinte invalide`);
      teinte = TEINTE_DEFAUT;
    }
    const sources = estObjet(c.chances) ? c.chances : {};
    let ok = true;
    for (const [rid, v] of Object.entries(sources)) {
      if (!cat.raretes.some((r) => r.id === rid)) {
        erreurs.push(`caisse ${id} : rareté inconnue ${rid}`);
        ok = false;
      } else if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100) {
        erreurs.push(`caisse ${id} : chance invalide pour ${rid}`);
        ok = false;
      } else if (objetsDeRarete(cat, rid).length === 0) {
        erreurs.push(`caisse ${id} : aucun objet ${rid} dans le catalogue`);
        ok = false;
      }
    }
    const chances = cat.raretes.filter((r) => Object.hasOwn(sources, r.id)).map((r) => Object.freeze({ rarete: r.id, pourcent: sources[r.id] }));
    const somme = chances.reduce((s, x) => s + (Number.isFinite(x.pourcent) ? x.pourcent : 0), 0);
    if (chances.length === 0 || Math.abs(somme - 100) > TOLERANCE) {
      erreurs.push(`caisse ${id} : chances de somme ${somme} (100 attendu)`);
      ok = false;
    }
    if (!ok) continue;
    caisses.push(Object.freeze({ id, nom, teinte, prix: p1, prix10: p10, chances: Object.freeze(chances) }));
  }
  return { caisses, erreurs };
}

const caisseValide = (caisse, cat) => catalogueValide(cat) && estObjet(caisse) && Array.isArray(caisse.chances) && caisse.chances.length > 0
  && caisse.chances.every((x) => estObjet(x) && cat.raretes.some((r) => r.id === x.rarete) && Number.isFinite(x.pourcent) && x.pourcent > 0);

// Chances affichées (E3-6) : [{ rarete, nom, pourcent, objets: [{ id, nom }] }] dans l'ordre des raretés ; caisse invalide : [].
export function chances(caisse, cat) {
  if (!caisseValide(caisse, cat)) return [];
  return caisse.chances.map((x) => ({ rarete: x.rarete, nom: cat.raretes.find((r) => r.id === x.rarete)?.nom ?? x.rarete, pourcent: x.pourcent, objets: objetsDeRarete(cat, x.rarete) }));
}

// Raretés extrêmes d'une caisse (texte « Un objet commun à rare ») : { min, max, n } ou null.
export function bornes(caisse, cat) {
  const c = chances(caisse, cat);
  return c.length ? { min: c[0].rarete, max: c[c.length - 1].rarete, n: c.length } : null;
}

// Un tirage avec le générateur donné : { objet: { id, rarete, niveau: 1 } | null, rng }.
function tirage(caisse, cat, rng) {
  const total = caisse.chances.reduce((s, x) => s + x.pourcent, 0);
  const a = nextFloat(rng);
  const u = a.value * total;
  let cumul = 0;
  let rarete = caisse.chances[caisse.chances.length - 1].rarete;
  for (const x of caisse.chances) {
    cumul += x.pourcent;
    if (u < cumul) {
      rarete = x.rarete;
      break;
    }
  }
  const b = nextFloat(a.rng);
  const objets = objetsDeRarete(cat, rarete);
  if (objets.length === 0) return { objet: null, rng: b.rng };
  const o = objets[Math.min(objets.length - 1, Math.floor(b.value * objets.length))];
  return { objet: Object.freeze({ id: o.id, rarete, niveau: 1 }), rng: b.rng };
}

// Plusieurs tirages à la suite d'une même graine ; null si une entrée est invalide ou si un tirage tombe sur une rareté sans objet.
export function tirerN(caisse, cat, graine, n) {
  if (!caisseValide(caisse, cat) || !graineValide(graine) || !Number.isInteger(n) || n < 1 || n > 100) return null;
  let rng = createRng(graine);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = tirage(caisse, cat, rng);
    if (!t.objet) return null;
    out.push(t.objet);
    rng = t.rng;
  }
  return Object.freeze(out);
}

// « Ouvrir ×1 » : un objet { id, rarete, niveau: 1 } (déterministe pour une graine donnée) ou null.
export function tirer(caisse, cat, graine) {
  return tirerN(caisse, cat, graine, 1)?.[0] ?? null;
}
// « Ouvrir ×10 » : dix objets dans l'ordre (dix tirages indépendants, aucune garantie) ou null.
export const tirer10 = (caisse, cat, graine) => tirerN(caisse, cat, graine, TIRAGES_X10);

// Résumé d'un résultat (E3-5) : nombre d'objets par rareté (raretés présentes, dans l'ordre des raretés) et le meilleur objet (rareté la plus haute,
// le premier obtenu à égalité). Entrée invalide : { compte: [], meilleur: null }.
export function resume(objets, cat) {
  if (!catalogueValide(cat) || !Array.isArray(objets)) return { compte: [], meilleur: null };
  const rang = (o) => cat.raretes.findIndex((r) => r.id === o?.rarete);
  const valides = objets.filter((o) => estObjet(o) && rang(o) >= 0);
  const compte = cat.raretes.map((r) => ({ rarete: r.id, n: valides.filter((o) => o.rarete === r.id).length })).filter((x) => x.n > 0);
  let meilleur = null;
  for (const o of valides) if (!meilleur || rang(o) > rang(meilleur)) meilleur = o;
  return { compte, meilleur };
}

// Prix d'un achat (affiché, jamais prélevé avant le lot 8h) : quantité 1 ou 10, sinon null.
export const prixAchat = (caisse, quantite) => (quantite === 1 ? caisse?.prix ?? null : quantite === TIRAGES_X10 ? caisse?.prix10 ?? null : null);
