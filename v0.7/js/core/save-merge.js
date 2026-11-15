// Fusion entre onglets (lot 5o) : décide, pour UN onglet, lesquels de ses gains déjà écrits manquent à la valeur stockée la plus récente, sans jamais
// compter un gain deux fois. Pur : aucune horloge, aucun accès au navigateur ; les données arrivent toutes faites (relevés des écritures, valeurs vues).
//
// Le défaut corrigé : la lecture qui précède une écriture peut être périmée (l'écriture d'un autre onglet n'est pas encore visible) ; l'écriture qui suit
// efface alors le gain de l'autre onglet. Rien n'empêche cette lecture périmée ; on la répare après coup :
//   - chaque écriture d'un onglet du jeu est annoncée aux autres onglets par un relevé { by, base, value } : texte lu avant d'écrire, texte écrit ;
//   - chaque onglet numérote ses gains écrits (seq) et retient, pour ses propres écritures, les numéros qu'elles ajoutent (adds) ;
//   - quand la valeur stockée change, l'onglet remonte la chaîne des relevés depuis cette valeur : les gains qu'il y trouve sont inclus ; la chaîne
//     s'arrête sur une valeur vue sans relevé (au chargement : aucun gain ; par l'événement du stockage : aucun gain créé après l'avoir vue) ;
//   - seuls les gains CERTAINEMENT absents sont réécrits (une seule fois par valeur : idempotent) ; dans le doute, rien n'est fait.
// Aucune garantie ne dépend de l'ordre d'arrivée entre l'événement du stockage et le relevé : la décision attend les deux.
// La sauvegarde stockée ne change pas de format : les relevés ne passent que par le canal entre onglets (jamais stockés).

import { RECORD_KIND, RECORD_VERSION } from './save.js';

const MAX_ID = 64;
const MAX_STEPS = 512;

const isText = (t, max) => typeof t === 'string' && t.length <= max;
const isInt = (n) => typeof n === 'number' && Number.isInteger(n);

// Relevé reçu d'un autre onglet (données non sûres : même origine, mais n'importe quelle page peut écrire sur le canal). { by, base, value } ou null.
export function parseRecord(message, maxText) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return null;
  if (message.kind !== RECORD_KIND || message.v !== RECORD_VERSION) return null;
  const { by, base, value } = message;
  if (!isText(by, MAX_ID) || by === '') return null;
  if (!isText(value, maxText) || value === '') return null;
  if (base !== null && !isText(base, maxText)) return null;
  return { by, base, value };
}

// Somme de plusieurs différences (commitDelta de save.js) : money, earned, runs, worlds s'additionnent ; bestWave et bestKills gardent le maximum.
export function sumDeltas(list) {
  const out = { money: 0, earned: 0, runs: 0, worlds: 0, bestWave: 0, bestKills: 0 };
  for (const d of Array.isArray(list) ? list : []) {
    if (d === null || typeof d !== 'object') continue;
    for (const k of ['money', 'earned', 'runs', 'worlds']) if (isInt(d[k])) out[k] += d[k];
    for (const k of ['bestWave', 'bestKills']) if (isInt(d[k])) out[k] = Math.max(out[k], d[k]);
  }
  return out;
}

// Auteur retenu d'un texte écrit plusieurs fois à l'identique (même base, même gain, même milliseconde) : le plus petit identifiant, le même pour tous
// les onglets. Le navigateur ne garde qu'une écriture (la seconde ne change rien) : l'onglet écarté réécrit son gain.
function writerOf(view, text) {
  const mine = view.own.get(text);
  let best = mine ? { by: view.id, base: mine.base, adds: mine.adds } : null;
  for (const r of view.records.get(text) ?? []) if (best === null || r.by < best.by) best = { by: r.by, base: r.base, adds: null };
  return best;
}

// view : { id, settled (gains ≤ settled : effacés volontairement, jamais réécrits), ops: Map seq → différence, own: Map texte → { base, adds },
//          records: Map texte → [{ by, base }], seen: Map texte → nombre de gains de l'onglet quand il a vu ce texte (chargement : 0 ; événement : seq) }.
// tip : texte stocké le plus récent (null : clé absente). Renvoie la liste triée des gains (seq) certainement absents de tip, ou null (attendre : un
// relevé ou un événement manque encore).
export function missingOps(view, tip) {
  if (tip === null || tip === undefined) return [];
  if (!view.own.has(tip) && !view.seen.has(tip)) return null;
  const inc = new Set();
  let bound;
  let cur = tip;
  for (let steps = 0; ; steps += 1) {
    if (steps > MAX_STEPS) return null;
    const w = writerOf(view, cur);
    if (w !== null) {
      if (!view.own.has(cur) && !view.seen.has(cur)) return null; // valeur d'un autre onglet dont l'événement n'est pas encore arrivé
      if (w.by === view.id) for (const s of w.adds) inc.add(s);
      if (w.base === null) {
        bound = 0;
        break;
      }
      cur = w.base;
      continue;
    }
    if (view.seen.has(cur)) {
      bound = view.seen.get(cur);
      break;
    }
    return null; // ni relevé ni vue : inconnue (ancienne version, page Sauvegarde, valeur antérieure au chargement)
  }
  const out = [];
  for (const seq of view.ops.keys()) if (seq > view.settled && seq > bound && !inc.has(seq)) out.push(seq);
  return out.sort((a, b) => a - b);
}

// Base plus récente que la copie locale : un autre onglet a annoncé (relevé) une écriture bâtie sur `text`, que le stockage de cet onglet ne montre pas
// encore. Suit la chaîne tant qu'elle est unique (deux descendants : conflit, on s'arrête). Renvoie le texte le plus récent, ou null s'il n'y en a pas.
// N'est qu'une optimisation : la réparation reste la garantie (une écriture bâtie sur ce texte reste correcte s'il n'est jamais stocké : elle le contient).
export function newerBase(view, text) {
  if (text === null || text === undefined) return null;
  let cur = text;
  for (let steps = 0; steps < MAX_STEPS; steps += 1) {
    const children = [];
    for (const [value, list] of view.records) if (value !== cur && list.some((r) => r.base === cur)) children.push(value);
    if (children.length !== 1 || view.own.has(children[0])) break;
    cur = children[0];
  }
  return cur === text ? null : cur;
}
