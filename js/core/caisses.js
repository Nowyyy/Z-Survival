// Lot 8e : caisses mystère et offres du jour de la Boutique (Docs/ref/menu-principal.md). Pur : ni rendu, ni stockage, ni réseau, ni horloge, ni
// hasard propre ; le hasard vient d'une graine entière donnée par le menu (crypto.getRandomValues ; pour les offres du jour : le numéro du jour,
// calculé par le menu), passée au générateur à graine de js/core/rng.js. Données : data/menu/caisses.json (caisses, prix, chances en pour cent,
// règles des offres du jour), data/menu/cosmetiques.json et le catalogue du lot 8d (js/core/equipement.js, lireCatalogue).
// Trois types de caisses (retour du propriétaire) : « equipement » (chances par rareté, objet du catalogue), « cosmetique » (chances par rareté,
// tenue de data/menu/cosmetiques.json), « personnage » (chances par personnage de data/menu/personnages.json). Règles : une clé (rareté ou
// personnage) est tirée selon les pour cent de la caisse (cumul dans l'ordre du catalogue), puis, pour une rareté, un élément uniformément parmi
// ceux du catalogue qui existent dans cette rareté (ordre du catalogue) ; ×10 = dix tirages indépendants à la suite du même générateur, sans
// garantie (le premier est celui de ×1 avec la même graine). Une caisse dont une clé tirable n'a aucun élément est refusée à la lecture (erreur
// listée). Entrée invalide : null ou liste vide, jamais d'exception. Prix affichés, jamais prélevés avant le lot 8h.
import { createRng, nextFloat } from './rng.js';

export const TIRAGES_X10 = 10;
export const TYPES_CAISSE = Object.freeze(['equipement', 'personnage', 'cosmetique']);
// Dessin de la caisse (retour du propriétaire : un design par genre de caisse) ; absent : bois.
export const MODELES = Object.freeze(['bois', 'militaire', 'elite', 'recrues', 'tenues']);
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
const typeDe = (caisse) => (TYPES_CAISSE.includes(caisse?.type) ? caisse.type : 'equipement');

// Tenues (cosmétiques, data/menu/cosmetiques.json) → [{ id, nom, rarete }] valides (rareté connue), dans l'ordre du fichier.
export function lireCosmetiques(json, raretes, erreurs = []) {
  const brut = estObjet(json) && Array.isArray(json.cosmetiques) ? json.cosmetiques : [];
  const out = [];
  for (const c of brut) {
    const id = estObjet(c) && typeof c.id === 'string' && ID.test(c.id) ? c.id : null;
    if (!id || out.some((x) => x.id === id) || !Array.isArray(raretes) || !raretes.some((r) => r.id === c.rarete)) {
      erreurs.push(`cosmétique invalide : ${estObjet(c) ? c.id : c}`);
      continue;
    }
    out.push(Object.freeze({ id, nom: texte(c.nom, 32) ?? id, rarete: c.rarete }));
  }
  return out;
}

// Objets du catalogue qui existent dans une rareté, dans l'ordre du catalogue : [{ id, nom }].
export function objetsDeRarete(cat, rid) {
  if (!catalogueValide(cat)) return [];
  return [...cat.objets.values()].filter((o) => o?.raretes?.[rid]).map((o) => ({ id: o.id, nom: o.nom }));
}
// Éléments tirables d'une clé selon le type de caisse : rareté (équipement, cosmétique) ou personnage.
export function elementsDe(type, cat, cle) {
  if (!catalogueValide(cat)) return [];
  if (type === 'cosmetique') return (Array.isArray(cat.cosmetiques) ? cat.cosmetiques : []).filter((c) => c.rarete === cle).map((c) => ({ id: c.id, nom: c.nom }));
  if (type === 'personnage') return (Array.isArray(cat.personnages) ? cat.personnages : []).filter((p) => p.id === cle).map((p) => ({ id: p.id, nom: p.nom }));
  return objetsDeRarete(cat, cle);
}
// Clés possibles d'un type, dans l'ordre du catalogue.
const clesDe = (type, cat) => (type === 'personnage' ? (cat.personnages ?? []).map((p) => p.id) : cat.raretes.map((r) => r.id));

// data/menu/caisses.json → { caisses, erreurs }. Caisse gardée seulement si : identifiant unique, type connu (equipement par défaut), nom, prix et
// prix10 entiers, chances sur des clés connues du type (pour cent > 0), somme de 100 (à 10⁻⁹ près), chaque clé tirable avec au moins un élément.
// Teinte invalide : erreur, teinte par défaut. Chances rangées dans l'ordre du catalogue.
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
    const type = c.type === undefined ? 'equipement' : c.type;
    const nom = texte(c.nom);
    const p1 = prix(c.prix);
    const p10 = prix(c.prix10);
    if (!TYPES_CAISSE.includes(type) || !nom || p1 === null || p10 === null) {
      erreurs.push(`caisse ${id} : type, nom, prix ou prix10 invalide`);
      continue;
    }
    let teinte = typeof c.teinte === 'string' && TEINTE.test(c.teinte) ? c.teinte : null;
    if (!teinte) {
      erreurs.push(`caisse ${id} : teinte invalide`);
      teinte = TEINTE_DEFAUT;
    }
    const modele = c.modele === undefined ? 'bois' : c.modele;
    if (!MODELES.includes(modele)) {
      erreurs.push(`caisse ${id} : modèle inconnu ${c.modele}`);
      continue;
    }
    const cles = clesDe(type, cat);
    const sources = estObjet(c.chances) ? c.chances : {};
    let ok = true;
    // Retour du propriétaire : une caisse à raretés (objets, tenues) contient toutes les raretés ; une meilleure caisse en augmente seulement les
    // chances.
    const manquantes = type === 'personnage' ? [] : cles.filter((k) => !Object.hasOwn(sources, k));
    if (manquantes.length) {
      erreurs.push(`caisse ${id} : raretés absentes ${manquantes.join(', ')}`);
      ok = false;
    }
    for (const [cle, v] of Object.entries(sources)) {
      if (!cles.includes(cle)) {
        erreurs.push(`caisse ${id} : ${type === 'personnage' ? 'personnage' : 'rareté'} inconnu(e) ${cle}`);
        ok = false;
      } else if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100) {
        erreurs.push(`caisse ${id} : chance invalide pour ${cle}`);
        ok = false;
      } else if (elementsDe(type, cat, cle).length === 0) {
        erreurs.push(type === 'equipement' ? `caisse ${id} : aucun objet ${cle} dans le catalogue` : `caisse ${id} : aucun élément ${cle} dans le catalogue`);
        ok = false;
      }
    }
    const chancesLues = cles.filter((k) => Object.hasOwn(sources, k)).map((k) => Object.freeze(type === 'personnage' ? { personnage: k, pourcent: sources[k] } : { rarete: k, pourcent: sources[k] }));
    const somme = chancesLues.reduce((s, x) => s + (Number.isFinite(x.pourcent) ? x.pourcent : 0), 0);
    if (chancesLues.length === 0 || Math.abs(somme - 100) > TOLERANCE) {
      erreurs.push(`caisse ${id} : chances de somme ${somme} (100 attendu)`);
      ok = false;
    }
    if (!ok) continue;
    caisses.push(Object.freeze({ id, type, modele, nom, teinte, prix: p1, prix10: p10, chances: Object.freeze(chancesLues) }));
  }
  return { caisses, erreurs };
}

const cleDe = (x) => x.rarete ?? x.personnage;
const caisseValide = (caisse, cat) => {
  if (!catalogueValide(cat) || !estObjet(caisse) || !Array.isArray(caisse.chances) || caisse.chances.length === 0) return false;
  const cles = clesDe(typeDe(caisse), cat);
  return caisse.chances.every((x) => estObjet(x) && cles.includes(cleDe(x)) && Number.isFinite(x.pourcent) && x.pourcent > 0);
};

// Chances affichées (E3-6) : [{ rarete | personnage, nom, pourcent, objets: [{ id, nom }] }] dans l'ordre du catalogue ; caisse invalide : [].
export function chances(caisse, cat) {
  if (!caisseValide(caisse, cat)) return [];
  const type = typeDe(caisse);
  return caisse.chances.map((x) => (type === 'personnage'
    ? { personnage: x.personnage, nom: cat.personnages.find((p) => p.id === x.personnage)?.nom ?? x.personnage, pourcent: x.pourcent, objets: elementsDe(type, cat, x.personnage) }
    : { rarete: x.rarete, nom: cat.raretes.find((r) => r.id === x.rarete)?.nom ?? x.rarete, pourcent: x.pourcent, objets: elementsDe(type, cat, x.rarete) }));
}

// Raretés extrêmes d'une caisse à raretés (texte « Un objet commun à rare ») : { min, max, n } ou null (caisse invalide ou de personnages).
export function bornes(caisse, cat) {
  if (typeDe(caisse) === 'personnage') return null;
  const c = chances(caisse, cat);
  return c.length ? { min: c[0].rarete, max: c[c.length - 1].rarete, n: c.length } : null;
}

// Part des deux raretés les plus hautes (« Épique ou mieux : 4 % » sur la carte) ; caisse de personnages ou invalide : null.
export function partHaute(caisse, cat) {
  if (typeDe(caisse) === 'personnage' || !caisseValide(caisse, cat)) return null;
  const hautes = cat.raretes.slice(-2).map((r) => r.id);
  const p = caisse.chances.filter((x) => hautes.includes(x.rarete)).reduce((s, x) => s + x.pourcent, 0);
  return { rarete: hautes[0], pourcent: Math.round(p * 100) / 100 };
}

// Un tirage avec le générateur donné : { objet | null, rng }. Équipement : { id, rarete, niveau: 1 } ; cosmétique : { type: 'cosmetique', id, rarete } ;
// personnage : { type: 'personnage', id }.
function tirage(caisse, cat, rng) {
  const type = typeDe(caisse);
  const total = caisse.chances.reduce((s, x) => s + x.pourcent, 0);
  const a = nextFloat(rng);
  const u = a.value * total;
  let cumul = 0;
  let cle = cleDe(caisse.chances[caisse.chances.length - 1]);
  for (const x of caisse.chances) {
    cumul += x.pourcent;
    if (u < cumul) {
      cle = cleDe(x);
      break;
    }
  }
  const b = nextFloat(a.rng);
  const liste = elementsDe(type, cat, cle);
  if (liste.length === 0) return { objet: null, rng: b.rng };
  const o = liste[Math.min(liste.length - 1, Math.floor(b.value * liste.length))];
  const objet = type === 'personnage' ? { type, id: o.id } : type === 'cosmetique' ? { type, id: o.id, rarete: cle } : { id: o.id, rarete: cle, niveau: 1 };
  return { objet: Object.freeze(objet), rng: b.rng };
}

// Plusieurs tirages à la suite d'une même graine ; null si une entrée est invalide ou si un tirage tombe sur une clé sans élément.
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

// « Ouvrir ×1 » : un élément (déterministe pour une graine donnée) ou null.
export function tirer(caisse, cat, graine) {
  return tirerN(caisse, cat, graine, 1)?.[0] ?? null;
}
// « Ouvrir ×10 » : dix éléments dans l'ordre (dix tirages indépendants, aucune garantie) ou null.
export const tirer10 = (caisse, cat, graine) => tirerN(caisse, cat, graine, TIRAGES_X10);

// Résumé d'un résultat à raretés (E3-5) : nombre par rareté (raretés présentes, dans l'ordre des raretés) et le meilleur élément (rareté la plus
// haute, le premier obtenu à égalité). Entrée invalide : { compte: [], meilleur: null }.
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

// Collection de tenues obtenues (mémoire de la page jusqu'au lot 8h) : { id: nombre } → { collection (nouvel objet figé), nouveaux: [bool] }.
// Identifiant inconnu du catalogue : refusé (même collection, nouveaux vide).
export function ajouterCosmetiques(collection, cat, ids) {
  const base = estObjet(collection) ? collection : {};
  const connus = new Set((Array.isArray(cat?.cosmetiques) ? cat.cosmetiques : []).map((c) => c.id));
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => connus.has(id))) return { collection: base, nouveaux: [] };
  const out = { ...base };
  const nouveaux = ids.map((id) => {
    const nouveau = !out[id];
    out[id] = (out[id] ?? 0) + 1;
    return nouveau;
  });
  return { collection: Object.freeze(out), nouveaux };
}

// --- Offres du jour (retour du propriétaire : « shop temporaire qui change toutes les 24 h ») ---------------------------------------------------
// Règles (caisses.json → offres) : nombre d'offres (1 à 12), chances par rareté (somme 100, chaque rareté avec des objets), prix par rareté.
export function lireOffres(json, cat) {
  const erreurs = [];
  if (!catalogueValide(cat)) return { regles: null, erreurs: ['offres : catalogue absent'] };
  const o = estObjet(json) && estObjet(json.offres) ? json.offres : null;
  if (!o) return { regles: null, erreurs: ['offres : règles absentes'] };
  const nombre = Number.isInteger(o.nombre) && o.nombre >= 1 && o.nombre <= 12 ? o.nombre : null;
  if (!nombre) erreurs.push('offres : nombre invalide');
  const chancesLues = [];
  for (const r of cat.raretes) {
    const v = estObjet(o.chances) ? o.chances[r.id] : undefined;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100 || objetsDeRarete(cat, r.id).length === 0) erreurs.push(`offres : chance invalide pour ${r.id}`);
    else if (prix(o.prix?.[r.id]) === null) erreurs.push(`offres : prix invalide pour ${r.id}`);
    else chancesLues.push(Object.freeze({ rarete: r.id, pourcent: v, prix: o.prix[r.id] }));
  }
  for (const k of Object.keys(estObjet(o.chances) ? o.chances : {})) if (!cat.raretes.some((r) => r.id === k)) erreurs.push(`offres : rareté inconnue ${k}`);
  const somme = chancesLues.reduce((s, x) => s + x.pourcent, 0);
  if (chancesLues.length === 0 || Math.abs(somme - 100) > TOLERANCE) erreurs.push(`offres : chances de somme ${somme} (100 attendu)`);
  if (erreurs.length) return { regles: null, erreurs };
  return { regles: Object.freeze({ nombre, chances: Object.freeze(chancesLues) }), erreurs };
}

// Graine d'un jour : mélange entier du numéro du jour (jours voisins, offres sans rapport).
const graineJour = (jour) => (Math.imul((jour >>> 0) ^ 0x9e3779b9, 2654435761) ^ 0x5bd1e995) >>> 0;
// Offres d'un jour (numéro de jour entier ≥ 0, calculé par le menu à partir de la date locale) : [{ id, rarete, prix, cle }], « nombre » offres
// d'objets différents (au plus autant que d'objets au catalogue), déterministes pour un jour donné ; règles ou jour invalides : [].
export function offresDuJour(regles, cat, jour) {
  if (!regles || !catalogueValide(cat) || !Number.isSafeInteger(jour) || jour < 0) return [];
  const total = regles.chances.reduce((s, x) => s + x.pourcent, 0);
  let rng = createRng(graineJour(jour));
  const out = [];
  for (let essai = 0; out.length < regles.nombre && essai < regles.nombre * 20; essai += 1) {
    const a = nextFloat(rng);
    const b = nextFloat(a.rng);
    rng = b.rng;
    const u = a.value * total;
    let cumul = 0;
    let choix = regles.chances[regles.chances.length - 1];
    for (const x of regles.chances) {
      cumul += x.pourcent;
      if (u < cumul) {
        choix = x;
        break;
      }
    }
    const liste = objetsDeRarete(cat, choix.rarete);
    const o = liste[Math.min(liste.length - 1, Math.floor(b.value * liste.length))];
    if (out.some((x) => x.id === o.id)) continue; // six objets différents
    out.push(Object.freeze({ id: o.id, rarete: choix.rarete, prix: choix.prix, cle: `${jour}-${out.length}` }));
  }
  return Object.freeze(out);
}
