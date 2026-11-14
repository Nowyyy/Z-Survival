// Lot 8h : progression v2 (clé zs.save.v2, Docs/ref/sauvegarde-v2.md). Format, réparation champ par champ, opérations atomiques (gains de manche,
// achats, améliorations, fusions, choix), code d'export ZS2 et import d'un code ZS1 (migré comme une sauvegarde v1). Pur : ni stockage, ni horloge
// (dates en argument), ni hasard ; aucune exception ; les arguments ne sont jamais modifiés.
// params : { save: save.json (section v2), economy: economy.json, stats: player-stats.json } ; tout est facultatif (repli le plus strict).
import { crc32, decodeSave, fromBase64Url, statMaxLevels, toBase64Url } from './save.js';
import { ALL_STAT_IDS } from './player-stats.js';

export const VERSION = 2;
export const EMPLACEMENTS = Object.freeze(['tete', 'gants', 'bottes', 'torse', 'accessoire', 'pantalon']);
export const MODES = Object.freeze(['histoire', 'infini']);
export const SOLDE_MAX = 9_999_999;
export const JOURNAL_MAX = 64;
export const OBJETS_DUR = 1000; // plafond de sécurité du format (le plafond de jeu, inventaireMax, est dans data/menu/objets.json)
export const LUES_MAX = 200;
export const PERSO_DEFAUT = 'survivant';
export const AVATAR_DEFAUT = 'anonyme';
export const REFUS = Object.freeze(['solde', 'plein', 'absent', 'niveau', 'offre', 'invalide']);

const SAFE = Number.MAX_SAFE_INTEGER;
const MAX_WARNINGS = 20;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UID = /^[0-9a-z][0-9a-z.-]{0,31}$/;
const OP_ID = /^[0-9A-Za-z._:-]{1,48}$/;
const CLE_OFFRE = /^\d{1,7}-\d{1,2}$/;
const INTERDITS = /[\p{Cc}\p{Cf}]/u;
const INTERDITES = new Set(['__proto__', 'constructor', 'prototype']);
const CONNUES = ['v', 'rev', 'savedAt', 'w', 'bleu', 'objets', 'porte', 'persos', 'tenues', 'offres', 'niveaux', 'records', 'mondes', 'profil', 'lues', 'dates', 'journal'];
const EXTRA_MAX = 8192; // octets gardés pour les champs inconnus de la racine (version plus récente du même format)

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const own = (o, k) => isObject(o) && Object.hasOwn(o, k);
const isInt = (n) => typeof n === 'number' && Number.isInteger(n);
const warn = (w, t) => {
  if (w.length < MAX_WARNINGS) w.push(t);
};
const soldeMaxOf = (params) => (isInt(params?.economy?.maxBleu) && params.economy.maxBleu >= 0 ? params.economy.maxBleu : SOLDE_MAX);

export function defaultProgression() {
  return {
    v: VERSION,
    rev: 0,
    savedAt: 0,
    bleu: { gagne: 0, depense: 0 },
    objets: [],
    porte: Object.fromEntries(EMPLACEMENTS.map((e) => [e, null])),
    persos: { debloques: [PERSO_DEFAUT], niveaux: { [PERSO_DEFAUT]: 1 }, choisi: PERSO_DEFAUT },
    tenues: [],
    offres: { jour: 0, achetees: [] },
    niveaux: Object.fromEntries(ALL_STAT_IDS.map((id) => [id, 0])),
    records: { histoire: {}, infini: {} },
    mondes: [],
    profil: { avatar: AVATAR_DEFAUT, pseudo: null, tues: 0, partiesHistoire: 0, partiesInfini: 0, tempsMs: 0 },
    lues: [],
    dates: { porte: 0, choisi: 0, avatar: 0, pseudo: 0 },
    journal: [],
  };
}

export const solde = (save) => Math.max(0, (save?.bleu?.gagne ?? 0) - (save?.bleu?.depense ?? 0));

function int(value, min, max, name, w, fallback) {
  if (value === undefined) return fallback;
  if (!isInt(value)) {
    warn(w, `${name} : entier attendu`);
    return fallback;
  }
  if (value < min || value > max) {
    warn(w, `${name} : hors bornes`);
    return Math.min(max, Math.max(min, value));
  }
  return value;
}
const field = (raw, k) => (own(raw, k) ? raw[k] : undefined);

// Liste d'identifiants uniques (motif re), au plus max ; le reste est ignoré avec un avertissement.
function ids(value, re, max, name, w) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warn(w, `${name} : liste attendue`);
    return [];
  }
  const out = [];
  for (const v of value) {
    if (typeof v !== 'string' || !re.test(v) || INTERDITES.has(v) || out.includes(v)) {
      warn(w, `${name} : entrée ignorée`);
      continue;
    }
    if (out.length >= max) {
      warn(w, `${name} : trop d'entrées`);
      break;
    }
    out.push(v);
  }
  return out;
}

export function pseudoValide(p) {
  if (typeof p !== 'string' || INTERDITS.test(p)) return null;
  const t = p.trim().replace(/\s+/gu, ' ');
  const n = Array.from(t).length;
  return n >= 2 && n <= 20 ? t : null;
}

// Catalogue facultatif (params.catalogue : Map id → { type, raretes: [ids] }) : un objet inconnu ou d'une rareté absente est retiré.
function objetValide(o, params) {
  if (!isObject(o) || typeof o.u !== 'string' || !UID.test(o.u) || typeof o.i !== 'string' || !ID.test(o.i) || typeof o.r !== 'string' || !ID.test(o.r)) return null;
  if (!isInt(o.n) || o.n < 1 || o.n > 999) return null;
  const cat = params?.catalogue;
  if (cat instanceof Map) {
    const def = cat.get(o.i);
    if (!def || (Array.isArray(def.raretes) && !def.raretes.includes(o.r))) return null;
  }
  return { u: o.u, i: o.i, r: o.r, n: o.n };
}
const typeDe = (params, id) => (params?.catalogue instanceof Map ? params.catalogue.get(id)?.type ?? null : null);

// Réécrit n'importe quoi en progression v2 valide, champ par champ : { save, warnings, extra } (extra : champs inconnus de la racine, gardés).
export function sanitize(raw, params) {
  const w = [];
  const save = defaultProgression();
  if (!isObject(raw)) {
    warn(w, 'racine invalide : progression par défaut');
    return { save, warnings: w, extra: {} };
  }
  save.rev = int(field(raw, 'rev'), 0, SAFE, 'rev', w, 0);
  save.savedAt = int(field(raw, 'savedAt'), 0, SAFE, 'savedAt', w, 0);
  // Monnaie bleue : deux compteurs qui ne font que croître ; dépensé ≤ gagné ; solde ≤ plafond.
  const b = field(raw, 'bleu');
  if (b !== undefined && !isObject(b)) warn(w, 'bleu : objet attendu');
  const gagne = int(field(b, 'gagne'), 0, SAFE, 'bleu.gagne', w, 0);
  let depense = int(field(b, 'depense'), 0, SAFE, 'bleu.depense', w, 0);
  if (depense > gagne) {
    warn(w, 'bleu : dépensé supérieur au gagné');
    depense = gagne;
  }
  save.bleu = { gagne: Math.min(gagne, depense + soldeMaxOf(params)), depense };
  // Inventaire : exemplaires valides, uid uniques.
  const objets = field(raw, 'objets');
  if (objets !== undefined && !Array.isArray(objets)) warn(w, 'objets : liste attendue');
  const vus = new Set();
  for (const o of Array.isArray(objets) ? objets : []) {
    const ok = objetValide(o, params);
    if (!ok || vus.has(ok.u)) {
      warn(w, 'objets : exemplaire ignoré');
      continue;
    }
    if (save.objets.length >= OBJETS_DUR) {
      warn(w, 'objets : trop d\'exemplaires');
      break;
    }
    vus.add(ok.u);
    save.objets.push(ok);
  }
  // Équipement porté : un exemplaire de l'inventaire par emplacement (et du bon type, si le catalogue est connu), jamais deux fois.
  const porte = field(raw, 'porte');
  const portes = new Set();
  for (const e of EMPLACEMENTS) {
    const u = field(porte, e);
    if (u === undefined || u === null) continue;
    const obj = save.objets.find((o) => o.u === u);
    const type = obj ? typeDe(params, obj.i) : null;
    if (!obj || portes.has(u) || (type !== null && type !== e)) {
      warn(w, `porte.${e} : invalide`);
      continue;
    }
    portes.add(u);
    save.porte[e] = u;
  }
  // Personnages : débloqués, niveaux (1 à 99), choisi (débloqué).
  const persos = field(raw, 'persos');
  const debloques = ids(field(persos, 'debloques'), ID, 64, 'persos.debloques', w);
  if (!debloques.includes(PERSO_DEFAUT)) debloques.unshift(PERSO_DEFAUT);
  const niv = field(persos, 'niveaux');
  const niveaux = {};
  for (const id of debloques) niveaux[id] = int(field(niv, id), 1, 99, `persos.niveaux.${id}`, w, 1);
  const choisi = field(persos, 'choisi');
  save.persos = { debloques, niveaux, choisi: typeof choisi === 'string' && debloques.includes(choisi) ? choisi : PERSO_DEFAUT };
  if (choisi !== undefined && save.persos.choisi !== choisi) warn(w, 'persos.choisi : invalide');
  save.tenues = ids(field(raw, 'tenues'), ID, 500, 'tenues', w);
  const offres = field(raw, 'offres');
  save.offres = { jour: int(field(offres, 'jour'), 0, 9_999_999, 'offres.jour', w, 0), achetees: ids(field(offres, 'achetees'), CLE_OFFRE, 24, 'offres.achetees', w) };
  // Niveaux de base (0 au départ : lot d'équilibrage à venir).
  const levelMax = statMaxLevels(params);
  const nv = field(raw, 'niveaux');
  for (const id of ALL_STAT_IDS) save.niveaux[id] = int(field(nv, id), 0, levelMax[id], `niveaux.${id}`, w, 0);
  // Records : meilleure manche par monde (ou carte), histoire et infini séparés.
  const rec = field(raw, 'records');
  for (const mode of MODES) {
    const m = field(rec, mode);
    if (m !== undefined && !isObject(m)) warn(w, `records.${mode} : objet attendu`);
    let n = 0;
    for (const [k, v] of Object.entries(isObject(m) ? m : {})) {
      if (!ID.test(k) || INTERDITES.has(k) || n >= 32) {
        warn(w, `records.${mode} : entrée ignorée`);
        continue;
      }
      const best = int(v, 0, 1_000_000, `records.${mode}.${k}`, w, 0);
      if (best > 0) {
        save.records[mode][k] = best;
        n += 1;
      }
    }
  }
  save.mondes = ids(field(raw, 'mondes'), ID, 32, 'mondes', w);
  const p = field(raw, 'profil');
  const avatar = field(p, 'avatar');
  const pseudo = field(p, 'pseudo');
  save.profil = {
    avatar: typeof avatar === 'string' && ID.test(avatar) ? avatar : AVATAR_DEFAUT,
    pseudo: pseudo === null || pseudo === undefined ? null : pseudoValide(pseudo),
    tues: int(field(p, 'tues'), 0, SAFE, 'profil.tues', w, 0),
    partiesHistoire: int(field(p, 'partiesHistoire'), 0, SAFE, 'profil.partiesHistoire', w, 0),
    partiesInfini: int(field(p, 'partiesInfini'), 0, SAFE, 'profil.partiesInfini', w, 0),
    tempsMs: int(field(p, 'tempsMs'), 0, SAFE, 'profil.tempsMs', w, 0),
  };
  if (pseudo !== undefined && pseudo !== null && save.profil.pseudo === null) warn(w, 'profil.pseudo : invalide');
  save.lues = ids(field(raw, 'lues'), /^[0-9A-Za-z._-]{1,64}$/, LUES_MAX, 'lues', w);
  const d = field(raw, 'dates');
  for (const k of Object.keys(save.dates)) save.dates[k] = int(field(d, k), 0, SAFE, `dates.${k}`, w, 0);
  save.journal = ids(field(raw, 'journal'), OP_ID, JOURNAL_MAX, 'journal', w);
  // Champs inconnus de la racine : gardés tels quels (dans la limite EXTRA_MAX), pour qu'une version plus récente du même format ne les perde pas.
  const extra = {};
  let taille = 0;
  for (const k of Object.keys(raw)) {
    if (CONNUES.includes(k) || INTERDITES.has(k) || k.length > 40) continue;
    let t;
    try {
      t = JSON.stringify(raw[k]);
    } catch {
      t = undefined;
    }
    if (t === undefined || taille + t.length > EXTRA_MAX) {
      warn(w, `champ inconnu non gardé : ${k.slice(0, 24)}`);
      continue;
    }
    taille += t.length;
    extra[k] = JSON.parse(t);
  }
  if (Object.keys(extra).length) warn(w, `champs inconnus gardés : ${Object.keys(extra).length}`);
  return { save, warnings: w, extra };
}

// { ok: true, save, warnings, extra } ou { ok: false, error: 'bad-schema' | 'future-version' }.
export function lire(raw, params) {
  if (!isObject(raw) || !isInt(raw.v) || raw.v < 1) return { ok: false, error: 'bad-schema' };
  if (raw.v > VERSION) return { ok: false, error: 'future-version' };
  if (raw.v !== VERSION) return { ok: false, error: 'bad-schema' };
  const r = sanitize(raw, params);
  return { ok: true, save: r.save, warnings: r.warnings, extra: r.extra };
}

// Ordre fixe des clés écrites (texte stable), champs inconnus gardés après.
export function serialiser(save, extra = {}) {
  const s = save;
  const out = { v: VERSION, rev: s.rev, savedAt: s.savedAt };
  if (typeof s.w === 'string') out.w = s.w;
  Object.assign(out, {
    bleu: { gagne: s.bleu.gagne, depense: s.bleu.depense },
    objets: s.objets.map((o) => ({ u: o.u, i: o.i, r: o.r, n: o.n })),
    porte: Object.fromEntries(EMPLACEMENTS.map((e) => [e, s.porte[e] ?? null])),
    persos: { debloques: [...s.persos.debloques], niveaux: { ...s.persos.niveaux }, choisi: s.persos.choisi },
    tenues: [...s.tenues],
    offres: { jour: s.offres.jour, achetees: [...s.offres.achetees] },
    niveaux: Object.fromEntries(ALL_STAT_IDS.map((id) => [id, s.niveaux[id]])),
    records: { histoire: { ...s.records.histoire }, infini: { ...s.records.infini } },
    mondes: [...s.mondes],
    profil: { ...s.profil },
    lues: [...s.lues],
    dates: { ...s.dates },
    journal: [...s.journal],
  });
  for (const [k, v] of Object.entries(isObject(extra) ? extra : {})) if (!Object.hasOwn(out, k)) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Opérations. Chacune a un identifiant unique (id) ; une opération déjà au journal est ignorée (jamais appliquée deux fois) ; une opération
// impossible sur la valeur la plus récente (solde, inventaire plein, exemplaire absent, niveau changé, offre déjà achetée) est REFUSÉE en entier :
// rien n'est ajouté, rien n'est prélevé. Types :
//   gain     { bleu, tues, tempsMs, partie: 'histoire'|'infini'|null, record: { mode, monde, manche }|null, monde (terminé)|null }
//   achat    { prix, place (plafond de l'inventaire), objets: [{ u, i, r }], persos: [{ id, max }], tenues: [id], offre: { jour, cle }|null }
//   ameliorer { u, de, prix }            perso { perso, de, prix }          fusion { uids: [3], nouveau: { u, i, r, n }, prix }
//   choix    { champ: 'porte'|'choisi'|'avatar'|'pseudo', valeur, date }  lues { ids: [] }
//   debloquer { persos: [id | { id, niveau }] } (personnages débloqués par les données, outil de débogage) ; remise à zéro : le dépôt (clear)
const clone = (s) => serialiser(s);

function appliquer(s, op, params) {
  const prix = isInt(op.prix) && op.prix >= 0 ? op.prix : 0;
  const payer = () => {
    if (solde(s) < prix) return false;
    s.bleu.depense += prix;
    return true;
  };
  switch (op.t) {
    case 'gain': {
      const max = soldeMaxOf(params);
      const g = isInt(op.bleu) && op.bleu > 0 ? op.bleu : 0;
      s.bleu.gagne += Math.max(0, Math.min(g, max - solde(s)));
      const add = (k, v) => {
        if (isInt(v) && v > 0) s.profil[k] = Math.min(SAFE, s.profil[k] + v);
      };
      add('tues', op.tues);
      add('tempsMs', op.tempsMs);
      if (op.partie === 'histoire') add('partiesHistoire', 1);
      if (op.partie === 'infini') add('partiesInfini', 1);
      const r = op.record;
      if (isObject(r) && MODES.includes(r.mode) && typeof r.monde === 'string' && ID.test(r.monde) && isInt(r.manche) && r.manche > 0) {
        s.records[r.mode][r.monde] = Math.max(s.records[r.mode][r.monde] ?? 0, Math.min(r.manche, 1_000_000));
      }
      if (typeof op.monde === 'string' && ID.test(op.monde) && !s.mondes.includes(op.monde) && s.mondes.length < 32) s.mondes.push(op.monde);
      return null;
    }
    case 'achat': {
      const objets = Array.isArray(op.objets) ? op.objets : [];
      const place = isInt(op.place) && op.place >= 0 ? Math.min(op.place, OBJETS_DUR) : OBJETS_DUR;
      if (s.objets.length + objets.length > place) return 'plein';
      const nouveaux = [];
      for (const o of objets) {
        const ok = objetValide({ ...o, n: 1 }, params);
        if (!ok || s.objets.some((x) => x.u === ok.u) || nouveaux.some((x) => x.u === ok.u)) return 'invalide';
        nouveaux.push(ok);
      }
      const offre = isObject(op.offre) ? op.offre : null;
      if (offre && (!isInt(offre.jour) || typeof offre.cle !== 'string' || !CLE_OFFRE.test(offre.cle))) return 'invalide';
      if (offre && s.offres.jour === offre.jour && s.offres.achetees.includes(offre.cle)) return 'offre';
      if (!payer()) return 'solde';
      s.objets.push(...nouveaux);
      for (const p of Array.isArray(op.persos) ? op.persos : []) {
        if (!isObject(p) || typeof p.id !== 'string' || !ID.test(p.id)) continue;
        const max = isInt(p.max) && p.max >= 1 ? Math.min(p.max, 99) : 99;
        if (!s.persos.debloques.includes(p.id)) {
          if (s.persos.debloques.length >= 64) continue;
          s.persos.debloques.push(p.id);
          s.persos.niveaux[p.id] = isInt(p.depart) && p.depart >= 1 ? Math.min(p.depart, max) : 1;
        } else s.persos.niveaux[p.id] = Math.min(max, (s.persos.niveaux[p.id] ?? 1) + 1);
      }
      for (const t of Array.isArray(op.tenues) ? op.tenues : []) if (typeof t === 'string' && ID.test(t) && !s.tenues.includes(t) && s.tenues.length < 500) s.tenues.push(t);
      if (offre) {
        if (s.offres.jour !== offre.jour) s.offres = { jour: offre.jour, achetees: [] };
        s.offres.achetees.push(offre.cle);
      }
      return null;
    }
    case 'ameliorer': {
      const o = s.objets.find((x) => x.u === op.u);
      if (!o) return 'absent';
      if (o.n !== op.de || o.n >= 999) return 'niveau';
      if (!payer()) return 'solde';
      o.n += 1;
      return null;
    }
    case 'perso': {
      if (!s.persos.debloques.includes(op.perso)) return 'absent';
      if ((s.persos.niveaux[op.perso] ?? 1) !== op.de || op.de >= 99) return 'niveau';
      if (!payer()) return 'solde';
      s.persos.niveaux[op.perso] = op.de + 1;
      return null;
    }
    case 'fusion': {
      const uids = Array.isArray(op.uids) ? op.uids : [];
      if (uids.length !== 3 || new Set(uids).size !== 3) return 'invalide';
      const trois = uids.map((u) => s.objets.find((x) => x.u === u));
      if (trois.some((x) => !x)) return 'absent';
      const n = isObject(op.nouveau) ? objetValide(op.nouveau, params) : null;
      if (!n || s.objets.some((x) => x.u === n.u)) return 'invalide';
      if (!payer()) return 'solde';
      let slot = null;
      for (const e of EMPLACEMENTS) if (uids.includes(s.porte[e])) {
        slot ??= e;
        s.porte[e] = null;
      }
      s.objets = s.objets.filter((x) => !uids.includes(x.u));
      s.objets.push(n);
      if (slot !== null && (typeDe(params, n.i) ?? slot) === slot) s.porte[slot] = n.u;
      return null;
    }
    case 'choix': {
      const date = isInt(op.date) && op.date >= 0 ? op.date : 0;
      if (!Object.hasOwn(s.dates, op.champ)) return 'invalide';
      if (date < s.dates[op.champ]) return null; // un choix plus récent existe déjà : celui-ci est dépassé (pas une erreur)
      if (op.champ === 'porte') {
        if (!isObject(op.valeur)) return 'invalide';
        const next = Object.fromEntries(EMPLACEMENTS.map((e) => [e, null]));
        const vus = new Set();
        for (const e of EMPLACEMENTS) {
          const u = op.valeur[e];
          const obj = typeof u === 'string' ? s.objets.find((x) => x.u === u) : null;
          if (obj && !vus.has(u) && (typeDe(params, obj.i) ?? e) === e) {
            next[e] = u;
            vus.add(u);
          }
        }
        s.porte = next;
      } else if (op.champ === 'choisi') {
        if (!s.persos.debloques.includes(op.valeur)) return 'absent';
        s.persos.choisi = op.valeur;
      } else if (op.champ === 'avatar') {
        if (typeof op.valeur !== 'string' || !ID.test(op.valeur)) return 'invalide';
        s.profil.avatar = op.valeur;
      } else {
        const p = op.valeur === null ? null : pseudoValide(op.valeur);
        if (op.valeur !== null && p === null) return 'invalide';
        s.profil.pseudo = p;
      }
      s.dates[op.champ] = date;
      return null;
    }
    case 'lues': {
      for (const id of Array.isArray(op.ids) ? op.ids : []) if (typeof id === 'string' && /^[0-9A-Za-z._-]{1,64}$/.test(id) && !s.lues.includes(id)) s.lues.push(id);
      if (s.lues.length > LUES_MAX) s.lues = s.lues.slice(-LUES_MAX);
      return null;
    }
    case 'debloquer': {
      // Liste d'identifiants ou de { id, niveau } (niveau de départ du personnage, 1 par défaut).
      for (const x of Array.isArray(op.persos) ? op.persos : []) {
        const id = typeof x === 'string' ? x : isObject(x) ? x.id : null;
        if (typeof id !== 'string' || !ID.test(id) || s.persos.debloques.includes(id) || s.persos.debloques.length >= 64) continue;
        s.persos.debloques.push(id);
        s.persos.niveaux[id] = isObject(x) && isInt(x.niveau) && x.niveau >= 1 ? Math.min(x.niveau, 99) : 1;
      }
      return null;
    }
    default:
      return 'invalide';
  }
}

// Applique une liste d'opérations, dans l'ordre, à la progression (nettoyée d'abord). → { save (neuve : rev + 1, savedAt = now), refused: [{ id, raison }],
// applied: [ids] }. Une liste vide donne quand même une nouvelle révision (réparation entre onglets).
export function appliquerOps(save, ops, now, params) {
  const s = clone(sanitize(save, params).save);
  const refused = [];
  const applied = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!isObject(op) || typeof op.id !== 'string' || !OP_ID.test(op.id)) continue;
    if (s.journal.includes(op.id)) continue; // déjà appliquée (autre onglet, relecture) : jamais deux fois
    const raison = appliquer(s, op, params);
    s.journal.push(op.id);
    if (s.journal.length > JOURNAL_MAX) s.journal = s.journal.slice(-JOURNAL_MAX);
    if (raison) refused.push({ id: op.id, raison });
    else applied.push(op.id);
  }
  delete s.w;
  s.rev = Math.min(SAFE, s.rev + 1);
  if (isInt(now) && now >= 0) s.savedAt = Math.min(SAFE, now);
  return { save: s, refused, applied };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Import d'une sauvegarde v1 (code ZS1) : niveaux, record de l'histoire du bâtiment, parties, monde terminé ; argent non converti ; le reste par défaut.
export function depuisV1(v1, monde = 'batiment') {
  const s = defaultProgression();
  if (!isObject(v1)) return s;
  for (const id of ALL_STAT_IDS) if (isInt(v1.stats?.[id]) && v1.stats[id] > 0) s.niveaux[id] = v1.stats[id];
  if (isInt(v1.records?.bestWave) && v1.records.bestWave > 0) s.records.histoire[monde] = v1.records.bestWave;
  if (isInt(v1.records?.runs) && v1.records.runs > 0) s.profil.partiesHistoire = v1.records.runs;
  if (isInt(v1.records?.worldsCompleted) && v1.records.worldsCompleted > 0) s.mondes = [monde];
  return s;
}

const prefixeV2 = (params) => (typeof params?.save?.v2?.exportPrefix === 'string' && params.save.v2.exportPrefix !== '' ? params.save.v2.exportPrefix : 'ZS2');
const maxCodeV2 = (params) => (isInt(params?.save?.v2?.maxCodeLength) && params.save.v2.maxCodeLength > 0 ? params.save.v2.maxCodeLength : 0);
const INVISIBLE = /[\s\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const hex8 = (n) => n.toString(16).padStart(8, '0');

// Code ZS2.<base64url du JSON>.<CRC32> de toute la progression (nettoyée ; journal et date d'écriture compris).
export function encoder(save, params) {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(serialiser(sanitize(save, params).save))));
  return `${prefixeV2(params)}.${body}.${hex8(crc32(body))}`;
}

// Code ZS2 ou ZS1 → { ok: true, save, source: 'ZS2' | 'ZS1', warnings } ou { ok: false, error } (codes d'erreur de save.js). Ne lève jamais.
export function decoder(text, params) {
  try {
    if (text === undefined || text === null) return { ok: false, error: 'empty' };
    if (typeof text !== 'string') return { ok: false, error: 'bad-format' };
    const limit = Math.max(maxCodeV2(params), isInt(params?.save?.maxCodeLength) ? params.save.maxCodeLength : 0);
    if (text.length > Math.max(limit, 1) * 16) return { ok: false, error: 'too-long' };
    const code = text.replace(INVISIBLE, '');
    if (code === '') return { ok: false, error: 'empty' };
    const prefix = code.split('.')[0];
    if (prefix === (params?.save?.exportPrefix ?? 'ZS1')) {
      const r = decodeSave(code, params);
      return r.ok ? { ok: true, save: depuisV1(r.save), source: 'ZS1', warnings: r.warnings } : r;
    }
    if (prefix !== prefixeV2(params)) return { ok: false, error: 'bad-prefix' };
    if (code.length > maxCodeV2(params)) return { ok: false, error: 'too-long' };
    const parts = code.split('.');
    if (parts.length !== 3 || parts[1] === '' || !/^[0-9a-f]{8}$/.test(parts[2])) return { ok: false, error: 'bad-format' };
    const bytes = fromBase64Url(parts[1]);
    if (bytes === null) return { ok: false, error: 'bad-base64' };
    if (hex8(crc32(parts[1])) !== parts[2]) return { ok: false, error: 'bad-checksum' };
    let raw;
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return { ok: false, error: 'bad-json' };
    }
    const r = lire(raw, params);
    return r.ok ? { ok: true, save: r.save, source: 'ZS2', warnings: r.warnings } : { ok: false, error: r.error === 'future-version' ? 'future-version' : 'bad-schema' };
  } catch {
    return { ok: false, error: 'bad-format' };
  }
}

// Aperçu d'un import (pages Sauvegarde et Profil).
export function decrire(save, params) {
  const s = sanitize(save, params).save;
  return {
    solde: solde(s), gagne: s.bleu.gagne, objets: s.objets.length, persos: s.persos.debloques.length, tenues: s.tenues.length,
    records: { histoire: { ...s.records.histoire }, infini: { ...s.records.infini } }, mondes: s.mondes.length,
    tues: s.profil.tues, parties: s.profil.partiesHistoire + s.profil.partiesInfini, tempsMs: s.profil.tempsMs,
    niveaux: ALL_STAT_IDS.reduce((n, id) => n + s.niveaux[id], 0),
  };
}

// Somme des différences pour la fusion entre onglets (save-merge.js) : une différence v2 est une liste d'opérations ; les plus anciennes d'abord.
export const enchainer = (delta, plus) => [...(Array.isArray(plus) ? plus.flat() : []), ...(Array.isArray(delta) ? delta : [])];
