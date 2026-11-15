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
// Lot 8k (Docs/ref/economie.md) : une caisse par rubrique ; la caisse de personnages tire aussi une RARETÉ (chaque personnage a la sienne,
// data/menu/personnages.json), puis un personnage de cette rareté ; pitié par rubrique (lirePitie, chancesTirage, tirerPitie) : les compteurs viennent
// de la progression v2 et y retournent avec l'achat (même écriture que le prix en médailles).
import { createRng, nextFloat } from './rng.js';

export const TIRAGES_X10 = 10;
export const TYPES_CAISSE = Object.freeze(['equipement', 'personnage', 'cosmetique']);
// Dessin de la caisse (retour du propriétaire : un design par genre de caisse) ; absent : bois.
export const MODELES = Object.freeze(['bois', 'militaire', 'elite', 'recrues', 'veterans', 'legendes', 'tenues', 'mode', 'couture']);
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
  if (type === 'personnage') return (Array.isArray(cat.personnages) ? cat.personnages : []).filter((p) => p.rarete === cle).map((p) => ({ id: p.id, nom: p.nom }));
  return objetsDeRarete(cat, cle);
}
// Clés possibles d'un type, dans l'ordre du catalogue.
const clesDe = (_type, cat) => cat.raretes.map((r) => r.id); // lot 8k : raretés pour les trois types (personnages compris)

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
        erreurs.push(`caisse ${id} : rareté inconnue ${cle}`);
        ok = false;
      } else if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100) {
        erreurs.push(`caisse ${id} : chance invalide pour ${cle}`);
        ok = false;
      } else if (elementsDe(type, cat, cle).length === 0) {
        erreurs.push(type === 'equipement' ? `caisse ${id} : aucun objet ${cle} dans le catalogue` : `caisse ${id} : aucun élément ${cle} dans le catalogue`);
        ok = false;
      }
    }
    const chancesLues = cles.filter((k) => Object.hasOwn(sources, k)).map((k) => Object.freeze({ rarete: k, pourcent: sources[k] }));
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

const cleDe = (x) => x.rarete;
const caisseValide = (caisse, cat) => {
  if (!catalogueValide(cat) || !estObjet(caisse) || !Array.isArray(caisse.chances) || caisse.chances.length === 0) return false;
  const cles = clesDe(typeDe(caisse), cat);
  return caisse.chances.every((x) => estObjet(x) && cles.includes(cleDe(x)) && Number.isFinite(x.pourcent) && x.pourcent > 0);
};

// Chances affichées (E3-6) : [{ rarete, nom, pourcent, objets: [{ id, nom }] }] dans l'ordre du catalogue (lot 8k : personnages compris, par
// rareté) ; caisse invalide : [].
export function chances(caisse, cat) {
  if (!caisseValide(caisse, cat)) return [];
  const type = typeDe(caisse);
  return caisse.chances.map((x) => ({ rarete: x.rarete, nom: cat.raretes.find((r) => r.id === x.rarete)?.nom ?? x.rarete, pourcent: x.pourcent, objets: elementsDe(type, cat, x.rarete) }));
}

// Raretés extrêmes d'une caisse à raretés (texte « Un objet commun à rare ») : { min, max, n } ou null (caisse invalide ou de personnages).
export function bornes(caisse, cat) {
  if (typeDe(caisse) === 'personnage') return null;
  const c = chances(caisse, cat);
  return c.length ? { min: c[0].rarete, max: c[c.length - 1].rarete, n: c.length } : null;
}

// Part des deux raretés les plus hautes (« Épique ou mieux : 4 % » sur la carte ; lot 8k : personnages compris) ; caisse invalide : null.
export function partHaute(caisse, cat) {
  if (!caisseValide(caisse, cat)) return null;
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
  const objet = type === 'personnage' ? { type, id: o.id, rarete: cle } : type === 'cosmetique' ? { type, id: o.id, rarete: cle } : { id: o.id, rarete: cle, niveau: 1 };
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

// --- Lot 8k : pitié (une caisse par rubrique, compteurs par rubrique gardés dans la progression v2 ; Docs/ref/economie.md) ----------------------
// Règles (caisses.json → pitie) : { haute: { rarete, garanti }, top: { rarete, douce, pas, garanti } } : « haute » (épique ou mieux) garantie au
// garanti-ième tirage sans elle ; « top » (légendaire) à sa chance de base jusqu'au tirage douce, puis + pas points par tirage, garantie au
// garanti-ième. Compteurs { e, l } : tirages faits depuis la dernière rareté haute ou mieux (e), depuis le dernier « top » (l).
export const PITIE_DEFAUT = Object.freeze({ haute: Object.freeze({ rarete: 'epique', garanti: 10 }), top: Object.freeze({ rarete: 'legendaire', douce: 50, pas: 5, garanti: 70 }) });
const entierPos = (n, min, max) => (Number.isInteger(n) && n >= min && n <= max ? n : null);
export function lirePitie(json, cat) {
  const erreurs = [];
  const p = estObjet(json) && estObjet(json.pitie) ? json.pitie : null;
  if (!p || !catalogueValide(cat)) return { regles: null, erreurs: ['pitie : règles absentes'] };
  const rang = (rid) => cat.raretes.findIndex((r) => r.id === rid);
  const h = estObjet(p.haute) ? p.haute : {};
  const t = estObjet(p.top) ? p.top : {};
  const haute = { rarete: h.rarete, garanti: entierPos(h.garanti, 1, 999) };
  const top = { rarete: t.rarete, douce: entierPos(t.douce, 0, 998), pas: typeof t.pas === 'number' && Number.isFinite(t.pas) && t.pas >= 0 && t.pas <= 100 ? t.pas : null, garanti: entierPos(t.garanti, 1, 999) };
  if (rang(haute.rarete) < 0 || haute.garanti === null) erreurs.push('pitie : haute invalide');
  if (rang(top.rarete) < 0 || top.douce === null || top.pas === null || top.garanti === null || top.garanti <= top.douce) erreurs.push('pitie : top invalide');
  if (!erreurs.length && rang(top.rarete) < rang(haute.rarete)) erreurs.push('pitie : top plus basse que haute');
  if (erreurs.length) return { regles: null, erreurs };
  return { regles: Object.freeze({ haute: Object.freeze(haute), top: Object.freeze(top) }), erreurs };
}
const compteursValides = (c) => estObjet(c) && Number.isInteger(c.e) && Number.isInteger(c.l) && c.e >= 0 && c.l >= 0;
export const COMPTEURS_ZERO = Object.freeze({ e: 0, l: 0 });

// Chances du prochain tirage selon les compteurs : [{ rarete, pourcent }] dans l'ordre du catalogue, somme 100. Le « top » monte selon l, la
// garantie « haute » ne garde que les raretés hautes ; les autres raretés gardent leurs proportions de base. Caisse ou règles invalides : [].
export function chancesTirage(caisse, cat, regles, compteurs) {
  if (!caisseValide(caisse, cat) || !regles || !compteursValides(compteurs)) return [];
  const rang = (rid) => cat.raretes.findIndex((r) => r.id === rid);
  const base = caisse.chances.map((x) => ({ rarete: x.rarete, pourcent: x.pourcent, rang: rang(x.rarete) }));
  if (base.some((x) => x.rang < 0)) return [];
  const iH = rang(regles.haute.rarete);
  const iT = rang(regles.top.rarete);
  const total = base.reduce((s, x) => s + x.pourcent, 0);
  const t0 = (base.find((x) => x.rang === iT)?.pourcent ?? 0) / total * 100;
  const nl = compteurs.l + 1;
  const ne = compteurs.e + 1;
  let pT = nl >= regles.top.garanti ? 100 : nl > regles.top.douce ? Math.min(100, t0 + regles.top.pas * (nl - regles.top.douce)) : t0;
  if (!base.some((x) => x.rang === iT)) pT = 0;
  const reste = base.filter((x) => x.rang !== iT && (ne < regles.haute.garanti || x.rang >= iH));
  const poids = reste.reduce((s, x) => s + x.pourcent, 0);
  if (poids <= 0) pT = base.some((x) => x.rang === iT) ? 100 : 0;
  return base.map((x) => ({ rarete: x.rarete, pourcent: x.rang === iT ? pT : reste.includes(x) && poids > 0 ? (x.pourcent / poids) * (100 - pT) : 0 }));
}
// Compteurs après un tirage de la rareté donnée.
export function compteursApres(cat, regles, compteurs, rarete) {
  const rang = (rid) => cat.raretes.findIndex((r) => r.id === rid);
  const r = rang(rarete);
  return Object.freeze({ e: r >= rang(regles.haute.rarete) ? 0 : compteurs.e + 1, l: r >= rang(regles.top.rarete) ? 0 : compteurs.l + 1 });
}
// Tirages restants avant la garantie (affichés) : { haute: N (le N-ième tirage est garanti), top: N au plus }.
export const avantGarantie = (regles, compteurs) => (regles && compteursValides(compteurs) ? { haute: Math.max(1, regles.haute.garanti - compteurs.e), top: Math.max(1, regles.top.garanti - compteurs.l) } : null);

// Tirages avec pitié : n tirages à la suite d'une même graine, compteurs avancés dans l'ordre. → { objets, compteurs (finaux), suite (compteurs
// après chaque tirage) } ou null (entrée invalide). Même graine et mêmes compteurs : même résultat.
export function tirerPitie(caisse, cat, regles, compteurs, graine, n) {
  if (!caisseValide(caisse, cat) || !regles || !compteursValides(compteurs) || !graineValide(graine) || !Number.isInteger(n) || n < 1 || n > 100) return null;
  const type = typeDe(caisse);
  let rng = createRng(graine);
  let c = Object.freeze({ e: compteurs.e, l: compteurs.l });
  const objets = [];
  const suite = [];
  for (let i = 0; i < n; i += 1) {
    const ch = chancesTirage(caisse, cat, regles, c);
    const a = nextFloat(rng);
    const u = a.value * 100;
    let cumul = 0;
    let cle = null;
    for (const x of ch) {
      if (x.pourcent <= 0) continue;
      cumul += x.pourcent;
      cle = x.rarete;
      if (u < cumul) break;
    }
    const b = nextFloat(a.rng);
    rng = b.rng;
    const liste = elementsDe(type, cat, cle);
    if (!cle || liste.length === 0) return null;
    const o = liste[Math.min(liste.length - 1, Math.floor(b.value * liste.length))];
    objets.push(Object.freeze(type === 'personnage' ? { type, id: o.id, rarete: cle } : type === 'cosmetique' ? { type, id: o.id, rarete: cle } : { id: o.id, rarete: cle, niveau: 1 }));
    c = compteursApres(cat, regles, c, cle);
    suite.push(c);
  }
  return { objets: Object.freeze(objets), compteurs: c, suite: Object.freeze(suite) };
}
