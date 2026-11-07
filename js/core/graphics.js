// Préréglages graphiques (lot 5b) : logique pure, sans DOM, stockage, réseau ni horloge. Lecture de data/game/graphics.json (valeurs vérifiées, défauts de
// l'Élevé pour toute valeur invalide), choix du préréglage (?gfx= > choix mémorisé de l'appareil > auto), décision d'Auto (une baisse d'un cran au plus,
// entre deux manches, jamais sous Faible, jamais de remontée), fusion avec les paramètres explicites de l'adresse (ils l'emportent toujours).
// Lot 5j : options séparées (un vecteur par préréglage, Perso enregistré à part), vecteur effectif et origines, passage à Perso, options en attente.
// Rien ici ne touche la logique du jeu : ces réglages ne changent que l'image.

export const PRESET_IDS = ['faible', 'moyen', 'eleve'];
export const CHOICES = ['auto', ...PRESET_IDS, 'perso']; // lot 5j : Perso (vecteur enregistré)
export const VHS_MODES = ['off', 'statique', 'anime'];
export const FOG_MODES = ['simple', 'reduit', 'complet'];
export const SANG_LEVELS = ['0', 'reduit', '1'];
export const PERSO_LOADS = ['choix', 'A', 'B', 'C', 'riche'];
export const DECOR_MODES = ['reduit', 'complet'];

// Valeurs de l'Élevé = rendu actuel du jeu (render.json, blood.json, vhs.json, persos-choix.json, ?dpr par défaut) : repli de toute valeur invalide.
export const ELEVE = Object.freeze({
  live: Object.freeze({ dprMax: 2, ombres: true, ombreTaille: 1024, vhs: 'anime', brouillard: 'complet', feux: Object.freeze({ voitureFoyers: 2, fumeeHelico: 1, particules: 1, lueur: true }), sang: '1', cadavres: 2 }),
  load: Object.freeze({ personnages: 'choix', anticrenelage: true, texturesFines: true, decor: 'complet' }),
});
export const AUTO_DEFAULTS = Object.freeze({ initial: Object.freeze({ grossier: 'moyen', autre: 'eleve' }), seuilMs: 22, fenetreSecondes: 10, irregulier: Object.freeze({ part: 0.1, facteur: 1.5 }), baisse: 'entre-manches', remonte: false });

const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback);
const int = (v, lo, hi, fallback) => (Number.isInteger(v) && v >= lo && v <= hi ? v : fallback);
const pick = (v, values, fallback) => (values.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const SHADOW_SIZES = [256, 512, 1024, 2048];

function parseLive(raw) {
  const r = obj(raw);
  const f = obj(r.feux);
  const d = ELEVE.live;
  return {
    dprMax: num(r.dprMax, 0.5, 2, d.dprMax),
    ombres: bool(r.ombres, d.ombres),
    ombreTaille: pick(r.ombreTaille, SHADOW_SIZES, d.ombreTaille),
    vhs: pick(r.vhs, VHS_MODES, d.vhs),
    brouillard: pick(r.brouillard, FOG_MODES, d.brouillard),
    feux: { voitureFoyers: int(f.voitureFoyers, 1, 8, d.feux.voitureFoyers), fumeeHelico: num(f.fumeeHelico, 0, 1, d.feux.fumeeHelico), particules: num(f.particules, 0.1, 1, d.feux.particules), lueur: bool(f.lueur, d.feux.lueur) },
    sang: pick(r.sang, SANG_LEVELS, d.sang),
    cadavres: int(r.cadavres, 0, 6, d.cadavres),
  };
}
function parseLoad(raw) {
  const r = obj(raw);
  const d = ELEVE.load;
  return {
    personnages: pick(r.personnages, PERSO_LOADS, d.personnages),
    anticrenelage: bool(r.anticrenelage, d.anticrenelage),
    texturesFines: bool(r.texturesFines, d.texturesFines),
    decor: pick(r.decor, DECOR_MODES, d.decor),
  };
}

// Lot 5j : options de l'écran Options. Clés de réglage qu'une valeur d'option peut fixer (chemins dans la partie live ou load des réglages).
export const OPTION_GROUPS = ['live', 'load'];
export const SETTING_KEYS = Object.freeze({
  live: Object.freeze(['dprMax', 'ombres', 'ombreTaille', 'vhs', 'brouillard', 'feux.voitureFoyers', 'feux.fumeeHelico', 'feux.particules', 'feux.lueur', 'sang', 'cadavres']),
  load: Object.freeze(['personnages', 'anticrenelage', 'texturesFines', 'decor']),
});
export const ORIGINS = ['preset', 'perso', 'adresse'];
const ID_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
const VALUE_RE = /^[A-Za-z0-9._-]{1,16}$/;
const KEY_RE = /^game\.[A-Za-z0-9._-]{1,80}$/;
const MAX_OPTIONS = 32;
const MAX_VALUES = 8;
const getPath = (o, path) => path.split('.').reduce((v, k) => (v !== null && typeof v === 'object' ? v[k] : undefined), o);
function setPath(o, path, value) {
  const keys = path.split('.');
  let t = o;
  for (const k of keys.slice(0, -1)) t = t[k] !== null && typeof t[k] === 'object' ? t[k] : (t[k] = {});
  t[keys[keys.length - 1]] = value;
}
const scalar = (v) => typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

// Liste des options (graphics.json → options) : identifiants uniques, section connue, groupe live ou load, valeurs dont les réglages sont des clés
// connues du groupe ; une option invalide est ignorée (jamais d'exception).
export function parseOptions(json) {
  const j = obj(json);
  const sections = Array.isArray(j.sections) ? [...new Set(j.sections.filter((s) => typeof s === 'string' && ID_RE.test(s)))] : [];
  const list = Array.isArray(j.options) ? j.options.slice(0, MAX_OPTIONS) : [];
  const seen = new Set();
  const options = [];
  for (const raw of list) {
    const o = obj(raw);
    if (typeof o.id !== 'string' || !ID_RE.test(o.id) || seen.has(o.id) || !sections.includes(o.section) || !OPTION_GROUPS.includes(o.group)) continue;
    if (typeof o.texte !== 'string' || !KEY_RE.test(o.texte) || !Array.isArray(o.valeurs)) continue;
    const ids = new Set();
    const valeurs = [];
    for (const rv of o.valeurs.slice(0, MAX_VALUES)) {
      const v = obj(rv);
      const r = obj(v.reglages);
      const entries = Object.entries(r);
      if (typeof v.id !== 'string' || !VALUE_RE.test(v.id) || ids.has(v.id) || typeof v.texte !== 'string' || !KEY_RE.test(v.texte)) continue;
      if (!entries.length || !entries.every(([k, x]) => SETTING_KEYS[o.group].includes(k) && scalar(x))) continue;
      ids.add(v.id);
      valeurs.push(Object.freeze({ id: v.id, texte: v.texte, reglages: Object.freeze(Object.fromEntries(entries)) }));
    }
    if (valeurs.length < 2) continue;
    seen.add(o.id);
    options.push(Object.freeze({ id: o.id, section: o.section, group: o.group, texte: o.texte, valeurs: Object.freeze(valeurs) }));
  }
  return { sections: sections.filter((s) => options.some((o) => o.section === s)), options };
}

// Réglages du rendu ({ live, load }, mêmes champs et mêmes vérifications que le lot 5b) d'un vecteur d'options ; valeur absente ou inconnue : le
// réglage reste celui de l'Élevé (repli de parseLive / parseLoad).
export function vectorSettings(cfg, vector) {
  const c = cfg && Array.isArray(cfg.options) ? cfg : parseGraphics(null);
  const v = obj(vector);
  const raw = { live: { feux: {} }, load: {} };
  for (const o of c.options) {
    const val = o.valeurs.find((x) => x.id === v[o.id]);
    if (val) for (const [k, x] of Object.entries(val.reglages)) setPath(raw[o.group], k, x);
  }
  return { live: parseLive(raw.live), load: parseLoad(raw.load) };
}

// Valeur d'une option qui correspond à des réglages (tous ses réglages égaux ; only : seulement ces clés de premier niveau), ou null (ex. ?dpr=1.25 :
// aucune valeur de la liste).
export function valueFor(option, settings, only = null) {
  const part = obj(obj(settings)[option?.group]);
  const use = ([k]) => !Array.isArray(only) || only.includes(k.split('.')[0]);
  const val = (option?.valeurs ?? []).find((x) => Object.entries(x.reglages).filter(use).every(([k, want]) => Object.is(getPath(part, k), want)) && Object.entries(x.reglages).some(use));
  return val ? val.id : null;
}

// Vecteur d'options valide : chaque option connue prend la valeur donnée si elle est permise, sinon celle de fallback ; identifiants inconnus ignorés.
export function sanitizeVector(cfg, raw, fallback = {}) {
  const c = cfg && Array.isArray(cfg.options) ? cfg : parseGraphics(null);
  const r = obj(raw);
  const f = obj(fallback);
  const out = {};
  for (const o of c.options) {
    const ok = (x) => typeof x === 'string' && o.valeurs.some((v) => v.id === x);
    out[o.id] = ok(r[o.id]) ? r[o.id] : ok(f[o.id]) ? f[o.id] : o.valeurs[o.valeurs.length - 1].id;
  }
  return out;
}

// Préréglage le plus proche d'un vecteur (le plus de valeurs égales ; à égalité : Moyen, puis Élevé, puis Faible).
export function nearestPreset(cfg, raw) {
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  const r = obj(raw);
  let best = 'moyen';
  let score = -1;
  for (const id of ['moyen', 'eleve', 'faible']) {
    const n = c.options.filter((o) => r[o.id] === c.vectors[id][o.id]).length;
    if (n > score) {
      best = id;
      score = n;
    }
  }
  return best;
}

// Configuration Perso enregistrée : null si absente ; sinon un vecteur complet (valeurs inconnues ou absentes : celles du préréglage le plus proche).
export function sanitizeCustom(cfg, raw) {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  return sanitizeVector(c, raw, c.vectors[nearestPreset(c, raw)]);
}

// data/game/graphics.json -> { schema, defaut, sections, options, vectors: { faible, moyen, eleve }, presets: { faible, moyen, eleve: { live, load } }, auto } ;
// presets = réglages des vecteurs (forme du lot 5b, lue par main.js et graphics-apply.js) ; entrée hostile : tout à l'Élevé, auto par défaut.
export function parseGraphics(json) {
  const j = obj(json);
  const presets = obj(j.presets);
  const a = obj(j.auto);
  const initial = obj(a.initial);
  const { sections, options } = parseOptions(j);
  const base = { options };
  const vectors = Object.fromEntries(PRESET_IDS.map((id) => [id, sanitizeVector(base, presets[id], null)]));
  // Valeur absente d'un préréglage : celle qui correspond au repli de l'Élevé (ELEVE), sinon la dernière de la liste.
  for (const id of PRESET_IDS) {
    for (const o of options) if (!o.valeurs.some((v) => v.id === obj(presets[id])[o.id])) vectors[id][o.id] = valueFor(o, ELEVE) ?? vectors[id][o.id];
  }
  return {
    schema: j.schema === 2 ? 2 : null,
    defaut: 'auto',
    sections,
    options,
    vectors,
    presets: Object.fromEntries(PRESET_IDS.map((id) => [id, vectorSettings(base, vectors[id])])),
    auto: {
      initial: { grossier: pick(initial.grossier, PRESET_IDS, AUTO_DEFAULTS.initial.grossier), autre: pick(initial.autre, PRESET_IDS, AUTO_DEFAULTS.initial.autre) },
      seuilMs: num(a.seuilMs, 4, 200, AUTO_DEFAULTS.seuilMs),
      fenetreSecondes: num(a.fenetreSecondes, 1, 120, AUTO_DEFAULTS.fenetreSecondes),
      irregulier: { part: num(obj(a.irregulier).part, 0.01, 1, AUTO_DEFAULTS.irregulier.part), facteur: num(obj(a.irregulier).facteur, 1.1, 4, AUTO_DEFAULTS.irregulier.facteur) },
      baisse: 'entre-manches',
      remonte: false,
    },
  };
}

// ?gfx=faible|moyen|eleve|auto ; autre valeur ou absent : null.
export function parseGfxParam(value) {
  return typeof value === 'string' && CHOICES.includes(value) ? value : null;
}

// Classe d'appareil d'Auto, sans identifier l'appareil : « grossier » (pointeur grossier ou téléphone d'après le user-agent) ou « autre ».
export function deviceClass(device) {
  const d = obj(device);
  const ua = typeof d.ua === 'string' ? d.ua.slice(0, 400) : '';
  return d.coarse === true || /Mobi|Android|iPhone|iPad|iPod/.test(ua) ? 'grossier' : 'autre';
}

// Priorité : ?gfx= > choix mémorisé (zs.device.v1) > auto. Renvoie { choice, preset, origin, auto, device } ; en auto, preset = le préréglage initial de la classe.
export function resolvePreset(param, stored, device, cfg) {
  const c = cfg && cfg.presets ? cfg : parseGraphics(null);
  const fromParam = parseGfxParam(param);
  const fromStore = parseGfxParam(stored);
  const choice = fromParam ?? fromStore ?? 'auto';
  const origin = fromParam ? 'parametre' : fromStore ? 'memorise' : 'defaut';
  const cls = deviceClass(device);
  const preset = choice === 'auto' ? c.auto.initial[cls] : choice;
  return { choice, preset, origin, auto: choice === 'auto', device: cls };
}

// Médiane (nombres finis positifs) ; liste vide : null.
export function medianOf(values) {
  const v = Array.isArray(values) ? values.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0).sort((a, b) => a - b) : [];
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Lot 5b-G : part des images irrégulières d'une série d'intervalles : celles au-delà de `facteur` × la cadence (10e centile des intervalles, comme la
// cadence de la page du rapport de ?perf=1). Une médiane basse peut cacher des à-coups (Pixel 7 à l'Élevé : médiane 11,1 ms, un tiers d'images longues).
export function irregularShare(values, facteur = AUTO_DEFAULTS.irregulier.facteur) {
  const v = Array.isArray(values) ? values.filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0).sort((a, b) => a - b) : [];
  if (!v.length) return 0;
  const cadence = v[Math.max(0, Math.ceil(0.1 * v.length) - 1)];
  const f = typeof facteur === 'number' && Number.isFinite(facteur) && facteur > 1 ? facteur : AUTO_DEFAULTS.irregulier.facteur;
  return v.filter((d) => d > f * cadence).length / v.length;
}

// Décision d'Auto. frameStats : { medianMs, activeSeconds, betweenWaves, longShare (lot 5b-G : part des images irrégulières) } (temps d'image médian sur la fenêtre de jeu actif, durée de jeu actif mesurée,
// vrai seulement entre deux manches) ; current : préréglage en cours ; params : section auto. Renvoie { preset, changed, reason } : un cran plus bas
// au plus, jamais sous Faible, jamais plus haut ; rien en pleine manche ni sans fenêtre complète.
export function autoDecision(frameStats, current, params) {
  const s = obj(frameStats);
  const p = { ...AUTO_DEFAULTS, ...obj(params) };
  const cur = pick(current, PRESET_IDS, 'eleve');
  const keep = (reason) => ({ preset: cur, changed: false, reason });
  if (s.betweenWaves !== true) return keep('en-manche');
  const seconds = typeof s.activeSeconds === 'number' && Number.isFinite(s.activeSeconds) ? s.activeSeconds : 0;
  if (seconds < num(p.fenetreSecondes, 1, 120, AUTO_DEFAULTS.fenetreSecondes)) return keep('mesure-courte');
  const m = typeof s.medianMs === 'number' && Number.isFinite(s.medianMs) ? s.medianMs : null;
  const share = typeof s.longShare === 'number' && Number.isFinite(s.longShare) ? s.longShare : 0;
  const slow = m !== null && m > num(p.seuilMs, 4, 200, AUTO_DEFAULTS.seuilMs);
  const jerky = share > num(obj(p.irregulier).part, 0.01, 1, AUTO_DEFAULTS.irregulier.part);
  if (!slow && !jerky) return keep('fluide');
  const i = PRESET_IDS.indexOf(cur);
  if (i <= 0) return keep('plancher');
  return { preset: PRESET_IDS[i - 1], changed: true, reason: 'baisse', cause: slow ? 'lent' : 'irregulier' };
}

// Paramètres explicites de l'adresse qui l'emportent sur le préréglage (valeurs reconnues seulement, comme les lecteurs existants de main.js et
// persos-params.js) : { perso, sang, usure, detail, vhs, shadows, dpr } (null = absent ou invalide).
export function explicitParams(search) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    q = new URLSearchParams('');
  }
  const get = (k, ok) => (q.has(k) && ok(q.get(k)) ? q.get(k) : null);
  const dpr = Number(q.get('dpr'));
  return {
    perso: get('perso', (v) => PERSO_LOADS.includes(v)),
    sang: get('sang', (v) => SANG_LEVELS.includes(v)),
    usure: get('usure', (v) => ['auto', '0', '1', '2', '3'].includes(v)),
    detail: get('detail', (v) => v === '0' || v === '1'),
    vhs: get('vhs', (v) => v === '0' || v === '1'),
    shadows: get('shadows', (v) => v === '0' || v === '1'),
    dpr: q.has('dpr') && Number.isFinite(dpr) && dpr >= 0.5 && dpr <= 2 ? dpr : null,
  };
}

// Paramètres explicites de l'adresse par-dessus des réglages { live, load } (copie) ; overridden : clés remplacées par l'adresse.
export function applyExplicit(base, explicit = {}) {
  const b = obj(base);
  const e = obj(explicit);
  const live = { ...obj(b.live), feux: { ...obj(obj(b.live).feux) } };
  const load = { ...obj(b.load) };
  const overridden = [];
  if (e.perso !== null && e.perso !== undefined) {
    load.personnages = e.perso;
    overridden.push('personnages');
  }
  if (e.sang !== null && e.sang !== undefined) {
    live.sang = e.sang;
    live.cadavres = null; // nombre de cadavres de blood.json pour ce niveau
    overridden.push('sang', 'cadavres');
  }
  if (e.detail !== null && e.detail !== undefined) {
    load.texturesFines = e.detail === '1';
    load.decor = e.detail === '1' ? 'complet' : 'reduit';
    overridden.push('texturesFines', 'decor');
  }
  if (e.vhs !== null && e.vhs !== undefined) {
    live.vhs = e.vhs === '1' ? 'anime' : 'off';
    overridden.push('vhs');
  }
  if (e.shadows !== null && e.shadows !== undefined) {
    live.ombres = e.shadows === '1';
    overridden.push('ombres');
  }
  if (typeof e.dpr === 'number') {
    live.dprMax = e.dpr;
    overridden.push('dprMax');
  }
  return { live, load, overridden };
}

// Réglages effectifs d'un préréglage : copie de ses valeurs, puis les paramètres explicites par-dessus. overridden : clés remplacées par l'adresse.
export function settingsFor(cfg, presetId, explicit = {}) {
  const c = cfg && cfg.presets ? cfg : parseGraphics(null);
  const id = pick(presetId, PRESET_IDS, 'eleve');
  return { preset: id, ...applyExplicit(c.presets[id], explicit) };
}

// ---- Lot 5j : options (préréglages, Perso, adresse) ----
// Option imposée par l'adresse : une de ses clés de réglage (premier niveau du chemin) a été remplacée par un paramètre explicite.
const imposedBy = (o, overridden) => o.valeurs.some((v) => Object.keys(v.reglages).some((k) => overridden.includes(k.split('.')[0])));
const explicitOf = (u) => (typeof u === 'string' ? explicitParams(u) : obj(u));

// Vecteur effectif. choice : auto, faible, moyen, eleve ou perso (inconnu : auto) ; custom : configuration Perso enregistrée (ou null) ; urlParams :
// adresse (chaîne) ou sortie d'explicitParams ; device : { coarse, ua } (classe d'Auto) ; current : préréglage en cours d'Auto (baisse entre deux
// manches ; absent : le préréglage initial de la classe). En Auto, les options « load » restent celles du préréglage initial (comme au lot 5b : une
// baisse ne change que les options « live »). Renvoie { choice, preset, initial, base, vector, origins, imposed, settings } : base = valeurs avant
// l'adresse, vector = valeurs effectives (null : valeur de l'adresse hors de la liste, ex. ?dpr=1.25), origins[id] = preset | perso | adresse.
export function effectiveOptions(choice, custom, urlParams, device, cfg, current = null) {
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  const ch = CHOICES.includes(choice) ? choice : 'auto';
  const initial = c.auto.initial[deviceClass(device)];
  let preset = ch;
  let base;
  if (ch === 'perso') base = sanitizeCustom(c, custom) ?? { ...c.vectors[initial] };
  else if (ch === 'auto') {
    preset = PRESET_IDS.includes(current) ? current : initial;
    base = Object.fromEntries(c.options.map((o) => [o.id, (o.group === 'load' ? c.vectors[initial] : c.vectors[preset])[o.id]]));
  } else base = { ...c.vectors[ch] };
  const settings = applyExplicit(vectorSettings(c, base), explicitOf(urlParams));
  const vector = {};
  const origins = {};
  const imposed = [];
  for (const o of c.options) {
    if (imposedBy(o, settings.overridden)) {
      vector[o.id] = valueFor(o, settings) ?? valueFor(o, settings, settings.overridden); // ex. ?shadows=0 sur des ombres hautes : « aucune »
      origins[o.id] = 'adresse';
      imposed.push(o.id);
    } else {
      vector[o.id] = base[o.id];
      origins[o.id] = ch === 'perso' ? 'perso' : 'preset';
    }
  }
  return { choice: ch, preset, initial, base, vector, origins, imposed, settings: { preset, ...settings } };
}

// État de l'écran Options : { choice, custom, current, url, device, locked } (locked : ?gfx= dans l'adresse, rien n'est modifiable ni écrit).
export function optionsState(s = {}, cfg = null) {
  const o = obj(s);
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  return {
    choice: CHOICES.includes(o.choice) ? o.choice : 'auto',
    custom: sanitizeCustom(c, o.custom),
    current: PRESET_IDS.includes(o.current) ? o.current : null,
    url: typeof o.url === 'string' ? o.url.slice(0, 2000) : explicitOf(o.url),
    device: obj(o.device),
    locked: o.locked === true,
  };
}
const effectiveOf = (st, c) => effectiveOptions(st.choice, st.custom, st.url, st.device, c, st.current);

// Une option modifiée à la main : passage à Perso (depuis tout autre choix, Auto compris), les autres options gardant leurs valeurs du moment
// (celles d'avant l'adresse pour une option imposée, qui n'est jamais enregistrée). Option inconnue, valeur non permise, option imposée par
// l'adresse ou état verrouillé : l'état est rendu tel quel (même objet).
export function setOption(state, id, value, cfg) {
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  const st = optionsState(state, c);
  const o = c.options.find((x) => x.id === id);
  if (st.locked || !o || typeof value !== 'string' || !o.valeurs.some((v) => v.id === value)) return state;
  const eff = effectiveOf(st, c);
  if (eff.origins[id] === 'adresse') return state;
  return { ...st, choice: 'perso', custom: { ...eff.base, [id]: value } };
}

// Choix d'un préréglage : Faible, Moyen, Élevé (vecteur du préréglage), Auto (préréglage initial de la classe), Perso (configuration enregistrée,
// sinon les valeurs du moment). La configuration Perso est toujours gardée à part. Nom inconnu ou état verrouillé : l'état tel quel.
export function choosePreset(state, name, cfg) {
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  const st = optionsState(state, c);
  if (st.locked || !CHOICES.includes(name)) return state;
  if (name === st.choice) return state;
  if (name === 'perso') return { ...st, choice: 'perso', custom: st.custom ?? { ...effectiveOf(st, c).base } };
  return { ...st, choice: name, current: null };
}

// Options « load » dont la valeur voulue diffère de celle du jeu en cours (running : vecteur effectif du chargement) : s'appliqueront au rechargement.
export function pendingReload(effective, running, cfg) {
  const c = cfg && cfg.vectors ? cfg : parseGraphics(null);
  const e = obj(obj(effective).vector ?? effective);
  const r = obj(obj(running).vector ?? running);
  return c.options.filter((o) => o.group === 'load' && o.id in e && o.id in r && e[o.id] !== r[o.id]).map((o) => o.id);
}

// Adresse passée au chargeur des personnages : la variante et le niveau de sang du préréglage, sauf s'ils sont déjà dans l'adresse. La table des
// choix (« choix ») n'ajoute rien : c'est le défaut actuel.
export function presetSearch(search, settings) {
  const s = typeof search === 'string' ? search.slice(0, 2000) : '';
  let q;
  try {
    q = new URLSearchParams(s);
  } catch {
    return s;
  }
  const st = obj(settings);
  const load = obj(st.load);
  const live = obj(st.live);
  if (!q.has('perso') && PERSO_LOADS.includes(load.personnages) && load.personnages !== 'choix') q.set('perso', load.personnages);
  if (!q.has('sang') && SANG_LEVELS.includes(live.sang)) q.set('sang', live.sang);
  const out = q.toString();
  return out ? `?${out}` : '';
}

// blood.json avec le nombre de cadavres du préréglage pour un niveau (copie : l'original n'est pas modifié) ; n invalide : l'original tel quel.
export function bloodWithCorpses(blood, level, n) {
  const b = obj(blood);
  const levels = obj(b.levels);
  if (!Number.isInteger(n) || n < 0 || !SANG_LEVELS.includes(level) || !levels[level]) return blood;
  return { ...b, levels: { ...levels, [level]: { ...levels[level], corpses: n } } };
}
