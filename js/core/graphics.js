// Préréglages graphiques (lot 5b) : logique pure, sans DOM, stockage, réseau ni horloge. Lecture de data/game/graphics.json (valeurs vérifiées, défauts de
// l'Élevé pour toute valeur invalide), choix du préréglage (?gfx= > choix mémorisé de l'appareil > auto), décision d'Auto (une baisse d'un cran au plus,
// entre deux manches, jamais sous Faible, jamais de remontée), fusion avec les paramètres explicites de l'adresse (ils l'emportent toujours).
// Rien ici ne touche la logique du jeu : ces réglages ne changent que l'image.

export const PRESET_IDS = ['faible', 'moyen', 'eleve'];
export const CHOICES = ['auto', ...PRESET_IDS];
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

// data/game/graphics.json -> { schema, presets: { faible, moyen, eleve: { live, load } }, auto } ; entrée hostile : tout à l'Élevé, auto par défaut.
export function parseGraphics(json) {
  const j = obj(json);
  const presets = obj(j.presets);
  const a = obj(j.auto);
  const initial = obj(a.initial);
  return {
    schema: j.schema === 1 ? 1 : null,
    presets: Object.fromEntries(PRESET_IDS.map((id) => [id, { live: parseLive(obj(presets[id]).live), load: parseLoad(obj(presets[id]).load) }])),
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

// Réglages effectifs d'un préréglage : copie de ses valeurs, puis les paramètres explicites par-dessus. overridden : clés remplacées par l'adresse.
export function settingsFor(cfg, presetId, explicit = {}) {
  const c = cfg && cfg.presets ? cfg : parseGraphics(null);
  const p = c.presets[pick(presetId, PRESET_IDS, 'eleve')];
  const e = obj(explicit);
  const live = { ...p.live, feux: { ...p.live.feux } };
  const load = { ...p.load };
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
  return { preset: pick(presetId, PRESET_IDS, 'eleve'), live, load, overridden };
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
