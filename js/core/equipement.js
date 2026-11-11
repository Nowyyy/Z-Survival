// Lot 8d : objets, équipement porté, fusion, personnages et statistiques effectives du Personnage (Docs/ref/menu-principal.md). Pur : ni rendu,
// ni stockage, ni réseau, ni horloge, ni hasard. Les données (data/menu/raretes.json, objets.json, personnages.json, inventaire-depart.json)
// arrivent en argument ; chaque fonction prend un état et rend un nouvel état (l'ancien n'est jamais modifié) ; une entrée invalide (objet inconnu,
// emplacement impossible, triplet incomplet, niveau au maximum, personnage verrouillé) est refusée sans exception : l'état rendu est alors le même
// objet. Jusqu'au lot 8h, cet état vit en mémoire seulement (js/menu/equipement-etat.js) et les prix sont affichés, jamais prélevés.
import { ALL_STAT_IDS, normalizeLevels } from './player-stats.js';

export const TYPES = Object.freeze(['arme', 'tenue', 'gants', 'bottes', 'accessoire']);
// Emplacements de l'écran Personnage : à gauche arme, tenue, gants ; à droite bottes et deux accessoires.
export const EMPLACEMENTS = Object.freeze(['arme', 'tenue', 'gants', 'bottes', 'accessoire1', 'accessoire2']);
export const emplacementsDuType = (type) => (type === 'accessoire' ? ['accessoire1', 'accessoire2'] : TYPES.includes(type) ? [type] : []);
export const typeEmplacement = (e) => (e === 'accessoire1' || e === 'accessoire2' ? 'accessoire' : EMPLACEMENTS.includes(e) ? e : null);

// Tolérance de l'arrondi final (0,2 + 0,7 + 0,1 doit donner 1, pas 0,999… arrondi à 0).
export const EPSILON = 1e-9;
const NIVEAU_OPTION_MAX = 99;

const ID = /^[a-z0-9-]{1,32}$/;
const estObjet = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const entier = (n, min, max) => (Number.isInteger(n) && n >= min && n <= max ? n : null);
const texte = (s, max = 60) => (typeof s === 'string' && s.trim() !== '' ? s.trim().slice(0, max) : null);
const prix = (n) => (Number.isInteger(n) && n >= 0 && n <= 1e9 ? n : null);

// Carte de bonus { statistique: niveaux } : clés de player-stats.js, nombres finis de 0 à 99 (fractionnaires permis) ; le reste est ignoré.
function lireBonus(brut, ou, erreurs) {
  const out = {};
  if (brut === undefined) return out;
  if (!estObjet(brut)) {
    erreurs.push(`${ou} : objet attendu`);
    return out;
  }
  for (const [k, v] of Object.entries(brut)) {
    if (!ALL_STAT_IDS.includes(k)) erreurs.push(`${ou} : statistique inconnue ${k}`);
    else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > NIVEAU_OPTION_MAX) erreurs.push(`${ou} : valeur invalide pour ${k}`);
    else if (v > 0) out[k] = v;
  }
  return out;
}

// --- Lecture et validation des données -----------------------------------------------------------------------------------------------------
export function lireRaretes(json, erreurs = []) {
  const brut = estObjet(json) && Array.isArray(json.raretes) ? json.raretes : [];
  if (brut.length === 0) erreurs.push('raretes : liste absente ou vide');
  const raretes = [];
  for (const r of brut) {
    const id = estObjet(r) && typeof r.id === 'string' && ID.test(r.id) ? r.id : null;
    if (!id || raretes.some((x) => x.id === id)) {
      erreurs.push(`rareté invalide ou en double : ${estObjet(r) ? r.id : r}`);
      continue;
    }
    const jeton = typeof r.jeton === 'string' && /^--rarete-[a-z-]{1,24}$/.test(r.jeton) ? r.jeton : null;
    if (!jeton) erreurs.push(`rareté ${id} : jeton invalide`);
    raretes.push({ id, nom: texte(r.nom, 24) ?? id, jeton: jeton ?? '--rarete-commun', prixFusion: prix(r.prixFusion) });
  }
  return raretes;
}

export function lireObjets(json, raretes, erreurs = []) {
  const brut = estObjet(json) && Array.isArray(json.objets) ? json.objets : [];
  const objets = new Map();
  for (const o of brut) {
    const id = estObjet(o) && typeof o.id === 'string' && ID.test(o.id) ? o.id : null;
    if (!id || objets.has(id)) {
      erreurs.push(`objet invalide ou en double : ${estObjet(o) ? o.id : o}`);
      continue;
    }
    if (!TYPES.includes(o.type)) {
      erreurs.push(`objet ${id} : type inconnu ${o.type}`);
      continue;
    }
    const parRarete = {};
    const sources = estObjet(o.raretes) ? o.raretes : {};
    for (const [rid, d] of Object.entries(sources)) {
      if (!raretes.some((r) => r.id === rid)) {
        erreurs.push(`objet ${id} : rareté inconnue ${rid}`);
        continue;
      }
      const niveauMax = estObjet(d) ? entier(d.niveauMax, 1, 999) : null;
      if (!niveauMax) {
        erreurs.push(`objet ${id} (${rid}) : niveauMax invalide`);
        continue;
      }
      parRarete[rid] = {
        bonus: lireBonus(d.bonus, `objet ${id} (${rid}) bonus`, erreurs),
        bonusParNiveau: lireBonus(d.bonusParNiveau, `objet ${id} (${rid}) bonusParNiveau`, erreurs),
        niveauMax,
        prixAmelioration: prix(d.prixAmelioration) ?? 0,
      };
    }
    if (Object.keys(parRarete).length === 0) {
      erreurs.push(`objet ${id} : sans rareté`);
      continue;
    }
    objets.set(id, { id, nom: texte(o.nom, 24) ?? id, type: o.type, raretes: parRarete });
  }
  return objets;
}

export function lirePersonnages(json, erreurs = []) {
  const brut = estObjet(json) && Array.isArray(json.personnages) ? json.personnages : [];
  const personnages = [];
  for (const p of brut) {
    const id = estObjet(p) && typeof p.id === 'string' && ID.test(p.id) ? p.id : null;
    if (!id || personnages.some((x) => x.id === id)) {
      erreurs.push(`personnage invalide ou en double : ${estObjet(p) ? p.id : p}`);
      continue;
    }
    const c = p.capacite;
    if (!estObjet(c) || !texte(c.nom)) {
      erreurs.push(`personnage ${id} : sans capacité`);
      continue;
    }
    const teinte = typeof p.teinte === 'string' && /^--menu-perso-[a-z0-9-]{1,24}$/.test(p.teinte) ? p.teinte : null;
    if (!teinte) erreurs.push(`personnage ${id} : teinte invalide`);
    const niveauMax = entier(p.niveauMax, 1, 999) ?? 1;
    personnages.push({
      id,
      nom: texte(p.nom, 24) ?? id,
      teinte: teinte ?? '--menu-perso-inconnu',
      debloque: p.debloque === true,
      niveauDepart: Math.min(niveauMax, entier(p.niveau, 1, 999) ?? 1),
      niveauMax,
      prixAmelioration: prix(p.prixAmelioration) ?? 0,
      capacite: {
        nom: texte(c.nom),
        description: texte(c.description, 120) ?? '',
        effet: lireBonus(c.effet, `personnage ${id} effet`, erreurs),
        effetParNiveau: lireBonus(c.effetParNiveau, `personnage ${id} effetParNiveau`, erreurs),
      },
    });
  }
  if (!personnages.some((p) => p.debloque)) erreurs.push('personnages : aucun personnage débloqué');
  return personnages;
}

// Inventaire de départ : exemplaires valides (uid unique, objet et rareté connus, niveau borné) et équipement porté (type de l'emplacement,
// jamais deux fois le même exemplaire).
export function lireInventaire(json, cat, erreurs = []) {
  const brut = estObjet(json) && Array.isArray(json.objets) ? json.objets : [];
  const objets = [];
  for (const o of brut) {
    const uid = estObjet(o) && typeof o.uid === 'string' && ID.test(o.uid) ? o.uid : null;
    const def = uid ? cat.objets.get(o.id) : null;
    const d = def?.raretes[o.rarete];
    if (!uid || objets.some((x) => x.uid === uid) || !d) {
      erreurs.push(`inventaire : exemplaire invalide ${estObjet(o) ? o.uid : o}`);
      continue;
    }
    const n = Number.isInteger(o.niveau) ? Math.min(d.niveauMax, Math.max(1, o.niveau)) : 1;
    objets.push(Object.freeze({ uid, id: def.id, rarete: o.rarete, niveau: n }));
  }
  const porte = Object.fromEntries(EMPLACEMENTS.map((e) => [e, null]));
  const eq = estObjet(json?.equipement) ? json.equipement : {};
  for (const e of EMPLACEMENTS) {
    const uid = eq[e];
    if (uid === null || uid === undefined) continue;
    const o = objets.find((x) => x.uid === uid);
    if (!o || !emplacementsDuType(cat.objets.get(o.id).type).includes(e) || Object.values(porte).includes(uid)) {
      erreurs.push(`équipement : ${e} invalide`);
      continue;
    }
    porte[e] = uid;
  }
  return { objets, porte };
}

// Les quatre fichiers → { cat: { raretes, objets (Map), personnages }, depart: { objets, porte, choisi }, erreurs }.
export function lireCatalogue({ raretes, objets, personnages, inventaire } = {}) {
  const erreurs = [];
  const r = lireRaretes(raretes, erreurs);
  const cat = { raretes: r, objets: lireObjets(objets, r, erreurs), personnages: lirePersonnages(personnages, erreurs) };
  const inv = lireInventaire(inventaire, cat, erreurs);
  const voulu = estObjet(personnages) ? personnages.choisi : null;
  const choisi = cat.personnages.find((p) => p.id === voulu && p.debloque) ?? cat.personnages.find((p) => p.debloque) ?? null;
  return { cat, depart: { ...inv, choisi: choisi?.id ?? null }, erreurs };
}

export function creerEtatEquipement(cat, depart) {
  return Object.freeze({
    objets: Object.freeze([...(depart?.objets ?? [])]),
    porte: Object.freeze({ ...Object.fromEntries(EMPLACEMENTS.map((e) => [e, null])), ...(depart?.porte ?? {}) }),
    persos: Object.freeze(Object.fromEntries(cat.personnages.map((p) => [p.id, p.niveauDepart]))),
    choisi: depart?.choisi ?? null,
    suivant: 1, // numéro du prochain objet né d'une fusion (uid « f<N> »)
  });
}

const geler = (etat, champs) => Object.freeze({ ...etat, ...champs });

// --- Objets ------------------------------------------------------------------------------------------------------------------------------
export const objetDe = (etat, uid) => etat.objets.find((o) => o.uid === uid) ?? null;
export const emplacementDe = (etat, uid) => EMPLACEMENTS.find((e) => uid !== null && etat.porte[e] === uid) ?? null;
export const definition = (cat, o) => (o ? cat.objets.get(o.id)?.raretes[o.rarete] ?? null : null);
export const indexRarete = (cat, rid) => cat.raretes.findIndex((r) => r.id === rid);
export const rareteSuivante = (cat, rid) => {
  const i = indexRarete(cat, rid);
  return i >= 0 && i + 1 < cat.raretes.length ? cat.raretes[i + 1].id : null;
};

// Bonus d'un exemplaire : bonus + bonusParNiveau × (niveau − 1), sans arrondi.
export function bonusObjet(cat, o) {
  const d = definition(cat, o);
  if (!d) return {};
  const out = {};
  for (const id of ALL_STAT_IDS) {
    const v = (d.bonus[id] ?? 0) + (d.bonusParNiveau[id] ?? 0) * (o.niveau - 1);
    if (v > 0) out[id] = v;
  }
  return out;
}

// Équiper : l'objet va dans l'emplacement de son type (accessoire : l'emplacement demandé, sinon le premier libre, sinon le premier) ; porté
// ailleurs, il en est d'abord retiré. Refusé : objet inconnu, emplacement impossible pour son type, déjà porté (sans emplacement demandé).
export function equiper(etat, cat, uid, emplacement = null) {
  const o = objetDe(etat, uid);
  const def = o ? cat.objets.get(o.id) : null;
  if (!def) return etat;
  const possibles = emplacementsDuType(def.type);
  if (emplacement !== null && !possibles.includes(emplacement)) return etat;
  const actuel = emplacementDe(etat, uid);
  if (emplacement === null && actuel !== null) return etat;
  const cible = emplacement ?? possibles.find((e) => etat.porte[e] === null) ?? possibles[0];
  if (actuel === cible) return etat;
  const porte = { ...etat.porte };
  if (actuel) porte[actuel] = null;
  porte[cible] = uid;
  return geler(etat, { porte: Object.freeze(porte) });
}

// Retirer : un emplacement ou un exemplaire porté ; rien à retirer : refusé.
export function retirer(etat, cible) {
  const e = EMPLACEMENTS.includes(cible) ? cible : emplacementDe(etat, cible);
  if (!e || etat.porte[e] === null) return etat;
  return geler(etat, { porte: Object.freeze({ ...etat.porte, [e]: null }) });
}

// Améliorer : { possible, prix, raison: null | 'inconnu' | 'max' } ; le prix est affiché, jamais prélevé avant le lot 8h.
export function infoAmelioration(etat, cat, uid) {
  const o = objetDe(etat, uid);
  const d = definition(cat, o);
  if (!d) return { possible: false, prix: null, raison: 'inconnu' };
  if (o.niveau >= d.niveauMax) return { possible: false, prix: null, raison: 'max', niveauMax: d.niveauMax };
  return { possible: true, prix: d.prixAmelioration, raison: null, niveauMax: d.niveauMax };
}
export function ameliorer(etat, cat, uid) {
  if (!infoAmelioration(etat, cat, uid).possible) return etat;
  return geler(etat, { objets: Object.freeze(etat.objets.map((o) => (o.uid === uid ? Object.freeze({ ...o, niveau: o.niveau + 1 }) : o))) });
}

// Exemplaires identiques (même id, même rareté) d'un exemplaire, lui compris.
export const identiques = (etat, uid) => {
  const o = objetDe(etat, uid);
  return o ? etat.objets.filter((x) => x.id === o.id && x.rarete === o.rarete) : [];
};
// Fusionnable : la rareté suivante existe pour cet objet (un légendaire ne se fusionne plus).
export const fusionnable = (cat, o) => {
  const s = o ? rareteSuivante(cat, o.rarete) : null;
  return Boolean(s && cat.objets.get(o.id)?.raretes[s]);
};

// --- Fusion -----------------------------------------------------------------------------------------------------------------------------
// État des trois emplacements de la fusion (uid ou null) : { possible, places (nombre), manque, objet (id), rarete, resultat (rareté), prix,
// raison: null | 'vide' | 'inconnu' | 'double' | 'different' | 'max' }.
export function etatFusion(etat, cat, places) {
  const liste = (Array.isArray(places) ? places : []).slice(0, 3).filter((u) => u !== null && u !== undefined);
  const base = { possible: false, places: liste.length, manque: 3 - liste.length, objet: null, rarete: null, resultat: null, prix: null };
  if (liste.length === 0) return { ...base, raison: 'vide' };
  if (new Set(liste).size !== liste.length) return { ...base, raison: 'double' };
  const objs = liste.map((u) => objetDe(etat, u));
  if (objs.some((o) => !o)) return { ...base, raison: 'inconnu' };
  const [p] = objs;
  const info = { ...base, objet: p.id, rarete: p.rarete, resultat: rareteSuivante(cat, p.rarete) };
  if (objs.some((o) => o.id !== p.id || o.rarete !== p.rarete)) return { ...info, raison: 'different' };
  if (!fusionnable(cat, p)) return { ...info, resultat: null, raison: 'max' };
  info.prix = cat.raretes[indexRarete(cat, p.rarete)].prixFusion;
  return { ...info, possible: liste.length === 3, raison: null };
}

// Fusionner trois exemplaires distincts de même id et même rareté : un exemplaire de la rareté suivante (même id), de niveau le plus haut des trois
// borné au niveauMax de la nouvelle rareté ; si l'un était porté, le résultat est porté à sa place (un deuxième emplacement occupé par le triplet
// est libéré). → { etat, uid } (uid null : refusé, état inchangé). Le prix est affiché, jamais prélevé avant le lot 8h.
export function fusionner(etat, cat, places) {
  const f = etatFusion(etat, cat, places);
  if (!f.possible) return { etat, uid: null };
  const uids = places.slice(0, 3);
  const objs = uids.map((u) => objetDe(etat, u));
  const max = cat.objets.get(f.objet).raretes[f.resultat].niveauMax;
  let n = etat.suivant;
  while (etat.objets.some((o) => o.uid === `f${n}`)) n += 1;
  const uid = `f${n}`;
  const nouveau = Object.freeze({ uid, id: f.objet, rarete: f.resultat, niveau: Math.min(max, Math.max(...objs.map((o) => o.niveau))) });
  const porte = { ...etat.porte };
  let pose = false;
  for (const e of EMPLACEMENTS) {
    if (!uids.includes(porte[e])) continue;
    porte[e] = pose ? null : uid;
    pose = true;
  }
  return { etat: geler(etat, { objets: Object.freeze([...etat.objets.filter((o) => !uids.includes(o.uid)), nouveau]), porte: Object.freeze(porte), suivant: n + 1 }), uid };
}

// Lot 8e : objets obtenus dans une caisse de la Boutique (js/core/caisses.js) : un exemplaire de niveau 1 par objet tiré { id, rarete } connu du
// catalogue, uid « c<N> » numéroté par le même compteur que les fusions (jamais un uid existant), ajouté à la fin de l'inventaire, non porté ; même
// modèle que ceux du lot 8d (équiper, améliorer, fusionner). → { etat, uids } ; liste vide ou un objet inconnu : refusé, { etat (le même), uids: [] }.
export function ajouterObjets(etat, cat, tires) {
  const liste = Array.isArray(tires) ? tires : [];
  if (liste.length === 0 || liste.length > 100 || !liste.every((o) => estObjet(o) && cat.objets.get(o.id)?.raretes[o.rarete])) return { etat, uids: [] };
  let n = etat.suivant;
  const nouveaux = [];
  for (const o of liste) {
    while (etat.objets.some((x) => x.uid === `c${n}`)) n += 1;
    nouveaux.push(Object.freeze({ uid: `c${n}`, id: o.id, rarete: o.rarete, niveau: 1 }));
    n += 1;
  }
  return { etat: geler(etat, { objets: Object.freeze([...etat.objets, ...nouveaux]), suivant: n }), uids: nouveaux.map((o) => o.uid) };
}

// Objets compatibles : ceux de même id et même rareté que le premier placé (placés compris) ; sans objet placé, tous les fusionnables.
export function compatibles(etat, cat, places) {
  const premier = (Array.isArray(places) ? places : []).map((u) => objetDe(etat, u)).find(Boolean);
  if (premier) return fusionnable(cat, premier) ? etat.objets.filter((o) => o.id === premier.id && o.rarete === premier.rarete) : [];
  return etat.objets.filter((o) => fusionnable(cat, o));
}

// Remplir automatiquement : complète les places vides avec des exemplaires compatibles non placés (d'abord ceux qui ne sont pas portés) ; sans objet
// placé, prend le premier groupe fusionnable qui a trois exemplaires (rareté la plus haute d'abord), sinon le groupe le plus fourni. → nouvelles places.
export function remplirAuto(etat, cat, places) {
  const p = [0, 1, 2].map((i) => (Array.isArray(places) && objetDe(etat, places[i]) ? places[i] : null));
  let candidats = compatibles(etat, cat, p);
  if (!p.some(Boolean)) {
    const groupes = new Map();
    for (const o of candidats) groupes.set(`${o.id}|${o.rarete}`, [...(groupes.get(`${o.id}|${o.rarete}`) ?? []), o]);
    const tries = [...groupes.values()].sort((a, b) => (b.length >= 3) - (a.length >= 3) || indexRarete(cat, b[0].rarete) - indexRarete(cat, a[0].rarete) || b.length - a.length);
    candidats = tries[0] ?? [];
  }
  const libres = candidats.filter((o) => !p.includes(o.uid)).sort((a, b) => (emplacementDe(etat, a.uid) !== null) - (emplacementDe(etat, b.uid) !== null));
  return p.map((u) => u ?? libres.shift()?.uid ?? null);
}

// --- Personnages ------------------------------------------------------------------------------------------------------------------------
export const personnageDe = (cat, id) => cat.personnages.find((p) => p.id === id) ?? null;
export function choisirPersonnage(etat, cat, id) {
  const p = personnageDe(cat, id);
  if (!p || !p.debloque || etat.choisi === id) return etat;
  return geler(etat, { choisi: id });
}
export function infoPersonnage(etat, cat, id) {
  const p = personnageDe(cat, id);
  if (!p) return null;
  const niveau = etat.persos[id] ?? p.niveauDepart;
  const raison = !p.debloque ? 'verrouille' : niveau >= p.niveauMax ? 'max' : null;
  return { niveau, niveauMax: p.niveauMax, prix: raison ? null : p.prixAmelioration, choisi: etat.choisi === id, verrouille: !p.debloque, peutAmeliorer: raison === null, raison };
}
export function ameliorerPersonnage(etat, cat, id) {
  const info = infoPersonnage(etat, cat, id);
  if (!info?.peutAmeliorer) return etat;
  return geler(etat, { persos: Object.freeze({ ...etat.persos, [id]: info.niveau + 1 }) });
}
// Effet de la capacité au niveau N : effet + effetParNiveau × (N − 1), sans arrondi.
export function effetCapacite(perso, niveau) {
  const out = {};
  if (!perso) return out;
  const n = Number.isInteger(niveau) && niveau >= 1 ? niveau : 1;
  for (const id of ALL_STAT_IDS) {
    const v = (perso.capacite.effet[id] ?? 0) + (perso.capacite.effetParNiveau[id] ?? 0) * (n - 1);
    if (v > 0) out[id] = v;
  }
  return out;
}

// --- Statistiques effectives -------------------------------------------------------------------------------------------------------------
// Bonus non arrondis : objets portés + capacité du personnage choisi (ou d'un autre personnage, pour l'aperçu de l'écran Personnages).
export function bonusTotal(etat, cat, persoId = etat.choisi) {
  const total = {};
  const ajouter = (b) => {
    for (const [k, v] of Object.entries(b)) total[k] = (total[k] ?? 0) + v;
  };
  for (const e of EMPLACEMENTS) ajouter(bonusObjet(cat, objetDe(etat, etat.porte[e])));
  const p = personnageDe(cat, persoId);
  if (p?.debloque) ajouter(effetCapacite(p, etat.persos[p.id] ?? p.niveauDepart));
  return total;
}

// Niveau effectif = niveau de base (sauvegarde, normalisé) + bonus des objets portés + effet de la capacité, additionnés sans arrondi ; le total
// est arrondi à l'entier inférieur (tolérance EPSILON), puis borné à [0, maximum de player-stats.json]. Statistiques rendues : celles de la base
// normalisée et celles qui reçoivent un bonus ; sans bonus, exactement les niveaux de la base (garantie : partie = sauvegarde).
// → { niveaux, base, bonus } ; params = data/game/player-stats.json.
export function statistiquesEffectives(base, etat, cat, params, persoId = etat?.choisi) {
  const b = normalizeLevels(estObjet(base) ? base : {}, params).levels;
  const bonus = etat && cat ? bonusTotal(etat, cat, persoId) : {};
  const brut = { ...b };
  for (const [k, v] of Object.entries(bonus)) brut[k] = Math.floor((b[k] ?? 0) + v + EPSILON);
  return { niveaux: normalizeLevels(brut, params).levels, base: b, bonus };
}
