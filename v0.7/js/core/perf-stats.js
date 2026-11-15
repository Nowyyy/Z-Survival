// Mesure de fluidité (lot 5b, ?perf=1) : fonctions pures, sans DOM, horloge, réseau ni stockage. Les temps (millisecondes) sont fournis par l'appelant
// (horodatages des images et horloge haute résolution, côté page) ; ce module calcule les percentiles, les images longues, la fréquence d'écran,
// les accrocs au premier usage, le plafond d'images aligné sur l'écran et le texte du rapport à copier. Toute entrée invalide est ignorée sans exception.

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const list = (v) => (Array.isArray(v) ? v.filter((n) => finite(n) && n >= 0) : []);

// Percentile (p de 0 à 100) d'une liste de nombres, par rang le plus proche ; liste vide : 0.
export function percentile(values, p) {
  const v = list(values).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const q = finite(p) ? Math.min(100, Math.max(0, p)) : 50;
  const rank = Math.ceil((q / 100) * v.length) - 1;
  return v[Math.min(v.length - 1, Math.max(0, rank))];
}

// Images longues : intervalles au-delà de 1,5 × et de 2 × la médiane.
export function longFrames(intervals, median = percentile(intervals, 50)) {
  const v = list(intervals);
  const m = finite(median) && median > 0 ? median : 0;
  if (m === 0) return { over15: 0, over2: 0 };
  let over15 = 0;
  let over2 = 0;
  for (const d of v) {
    if (d > 1.5 * m) over15 += 1;
    if (d > 2 * m) over2 += 1;
  }
  return { over15, over2 };
}

// Résumé d'une série d'intervalles entre images : nombre, médiane, p95, p99, maximum, images longues, images par seconde obtenues (lot 5b-F :
// nombre d'images / durée couverte, ce que le joueur voit vraiment, distinct de la cadence de la page).
export function frameSummary(intervals) {
  const v = list(intervals);
  const median = percentile(v, 50);
  const sum = v.reduce((a, b) => a + b, 0);
  return { count: v.length, median, p95: percentile(v, 95), p99: percentile(v, 99), max: v.length ? Math.max(...v) : 0, ...longFrames(v, median), fps: sum > 0 ? (1000 * v.length) / sum : 0 };
}

// Cadence de la page (images que le navigateur propose : écran, ou plafond du navigateur comme les 60 images/s de Safari), arrondie à 30, 60,
// 90 ou 120 Hz (null sans mesure). Lot 5b-F : d'après le 10e centile des intervalles, pas la médiane : quand le jeu n'arrive pas à suivre, la
// médiane mesure sa lenteur (« 30 Hz » à l'Élevé sur un iPhone qui propose 60 images/s) ; les images les plus rapides gardent la cadence proposée.
// Une page qui ne tient jamais la cadence (toutes les images au double) reste lue à la moitié : le rapport le dit avec les images obtenues.
export const REFRESH_RATES = [30, 60, 90, 120];
export const REFRESH_PERCENTILE = 10;
export function refreshRate(intervals) {
  const m = percentile(intervals, REFRESH_PERCENTILE);
  if (!(m > 0)) return null;
  const hz = 1000 / m;
  return REFRESH_RATES.reduce((best, r) => (Math.abs(r - hz) < Math.abs(best - hz) ? r : best), REFRESH_RATES[0]);
}

// ?cap=N (expérience, jamais par défaut) : 0, 30, 45 ou 60 ; toute autre valeur : null (pas de plafond).
export const CAP_VALUES = [0, 30, 45, 60];
export function parseCap(value) {
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return CAP_VALUES.includes(n) ? n : null;
}

// Plafond aligné sur l'écran : on dessine une image sur `every` (entier ≥ 1) ; fps = fréquence / every. aligned : faux si le plafond ne divise pas la
// fréquence (60 sur un écran de 90 Hz : trames irrégulières, avertissement affiché).
export function capPlan(hz, cap) {
  if (!finite(hz) || hz <= 0 || !finite(cap) || cap <= 0) return { every: 1, fps: finite(hz) && hz > 0 ? hz : null, aligned: true, active: false };
  const ratio = hz / cap;
  const every = Math.max(1, Math.round(ratio));
  return { every, fps: hz / every, aligned: Math.abs(ratio - every) < 0.05, active: every > 1 };
}

// Accrocs au premier usage : pour chaque événement { name, at } (premier tir, premier sang…), durée maximale d'une image dans les `span` ms qui
// suivent (span) : images finies après l'événement et commencées avant la fin de la fenêtre. frames : [{ at, duration }] (fin de l'image et intervalle depuis la précédente). Renvoie [{ name, at, max, frames }] dans l'ordre des événements.
export function firstUseHitches(events, frames, span = 600) {
  const w = finite(span) && span > 0 ? span : 600;
  const f = Array.isArray(frames) ? frames.filter((x) => x && finite(x.at) && finite(x.duration)) : [];
  const ev = Array.isArray(events) ? events.filter((e) => e && typeof e.name === 'string' && finite(e.at)) : [];
  return ev.map((e) => {
    const inside = f.filter((x) => x.at >= e.at && x.at - x.duration <= e.at + w); // images qui se terminent après l'événement et commencent dans la fenêtre
    return { name: e.name, at: e.at, max: inside.length ? Math.max(...inside.map((x) => x.duration)) : null, frames: inside.length };
  });
}

// Journal d'images glissant (pur : les temps sont fournis). push(at, interval, work) ; since(now, ms) : les entrées des `ms` dernières millisecondes.
export function createFrameLog(capacity = 2400) {
  const cap = Math.max(16, Math.floor(finite(capacity) ? capacity : 2400));
  const at = new Float64Array(cap);
  const interval = new Float32Array(cap);
  const work = new Float32Array(cap);
  let head = 0;
  let size = 0;
  return {
    push(t, d, w = 0) {
      if (!finite(t) || !finite(d) || d < 0) return;
      at[head] = t;
      interval[head] = d;
      work[head] = finite(w) && w >= 0 ? w : 0;
      head = (head + 1) % cap;
      size = Math.min(cap, size + 1);
    },
    // Entrées dont l'horodatage est dans ]now - ms, now] (toutes si ms est absent), de la plus ancienne à la plus récente.
    since(now, ms) {
      const out = { at: [], interval: [], work: [] };
      for (let i = 0; i < size; i += 1) {
        const k = (head - size + i + cap) % cap;
        if (finite(ms) && finite(now) && !(at[k] > now - ms && at[k] <= now)) continue;
        out.at.push(at[k]);
        out.interval.push(interval[k]);
        out.work.push(work[k]);
      }
      return out;
    },
    clear() {
      head = 0;
      size = 0;
    },
    get size() {
      return size;
    },
  };
}

// Histogramme d'une session entière (sans tout garder) : cases de binMs jusqu'à maxMs, au-delà dans la dernière case ; percentiles à binMs près.
export function createHistogram(binMs = 0.25, maxMs = 250) {
  const bin = finite(binMs) && binMs > 0 ? binMs : 0.25;
  const n = Math.max(1, Math.ceil((finite(maxMs) && maxMs > bin ? maxMs : 250) / bin));
  const counts = new Uint32Array(n + 1);
  let total = 0;
  let max = 0;
  let sum = 0;
  const at = (q) => {
    const target = Math.max(1, Math.ceil(q * total));
    let seen = 0;
    for (let i = 0; i <= n; i += 1) {
      seen += counts[i];
      if (seen >= target) return Math.min(max, (i + 0.5) * bin);
    }
    return max;
  };
  return {
    add(v) {
      if (!finite(v) || v < 0) return;
      counts[Math.min(n, Math.floor(v / bin))] += 1;
      total += 1;
      sum += v;
      if (v > max) max = v;
    },
    summary() {
      if (total === 0) return frameSummary([]);
      const median = at(0.5);
      let over15 = 0;
      let over2 = 0;
      for (let i = 0; i <= n; i += 1) {
        const low = i * bin;
        if (low > 1.5 * median) over15 += counts[i];
        if (low > 2 * median) over2 += counts[i];
      }
      return { count: total, median, p95: at(0.95), p99: at(0.99), max, over15, over2, fps: sum > 0 ? (1000 * total) / sum : 0 };
    },
    clear() {
      counts.fill(0);
      total = 0;
      sum = 0;
      max = 0;
    },
  };
}

// Système résumé (sans identifier l'appareil) : famille, version du système et navigateur d'après le user-agent.
// Lot 5b-E : depuis iOS 26, Safari fige la version d'iOS du user-agent (18.x) ; sa propre version (Version/27.0) suit celle d'iOS : elle donne
// alors le système (« iOS 27 »), la valeur figée restant dans uaOs. Les autres navigateurs d'iOS n'ont pas cette indication : version du user-agent.
// Lot 5b-G : Chrome sur Android annonce toujours « Android 10; K » (version et modèle masqués) ; hints = navigator.userAgentData.getHighEntropyValues
// (['platformVersion']) quand le navigateur le permet : { platform, platformVersion } donne la vraie version (jamais le modèle, jamais demandé).
export function summarizeUA(ua, hints = null) {
  const s = typeof ua === 'string' ? ua.slice(0, 400) : '';
  const v = (re) => (s.match(re)?.[1] ?? '').replace(/_/g, '.');
  let os = 'autre';
  let uaOs = null;
  if (/iPhone|iPad|iPod/.test(s)) {
    uaOs = v(/OS (\d+[_.]\d+)/) || null;
    const safari = /CriOS|FxiOS|EdgiOS/.test(s) ? 0 : Number(v(/Version\/(\d+)/)) || 0;
    os = safari >= 26 && Number(String(uaOs).split('.')[0]) < safari ? `iOS ${safari}` : `iOS ${uaOs ?? ''}`.trim();
    if (os === `iOS ${uaOs}`) uaOs = null; // version lue telle quelle : rien de figé à signaler
  }
  else if (/Android/.test(s)) {
    const said = v(/Android (\d+(?:\.\d+)?)/);
    const h = hints !== null && typeof hints === 'object' ? hints : {};
    const real = h.platform === 'Android' && typeof h.platformVersion === 'string' ? h.platformVersion.match(/^(\d{1,3})(?:\.(\d{1,3}))?/) : null;
    const masked = /Android 10; K\)/.test(s); // user-agent réduit de Chrome
    if (real) {
      const version = real[2] && real[2] !== '0' ? `${real[1]}.${real[2]}` : real[1];
      os = `Android ${version}`;
      if (said && said !== version) uaOs = said;
    } else if (masked) {
      os = 'Android';
      uaOs = said;
    } else os = `Android ${said}`.trim();
  }
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Linux|X11/.test(s)) os = 'Linux';
  let browser = 'autre';
  if (/CriOS\/(\d+)/.test(s)) browser = `Chrome ${v(/CriOS\/(\d+)/)} (iOS)`;
  else if (/FxiOS\/(\d+)/.test(s)) browser = `Firefox ${v(/FxiOS\/(\d+)/)} (iOS)`;
  else if (/Firefox\/(\d+)/.test(s)) browser = `Firefox ${v(/Firefox\/(\d+)/)}`;
  else if (/SamsungBrowser\/(\d+)/.test(s)) browser = `Samsung Internet ${v(/SamsungBrowser\/(\d+)/)}`;
  else if (/Edg\/(\d+)/.test(s)) browser = `Edge ${v(/Edg\/(\d+)/)}`;
  else if (/Chrome\/(\d+)/.test(s)) browser = `Chrome ${v(/Chrome\/(\d+)/)}`;
  else if (/Version\/(\d+(?:\.\d+)?).*Safari/.test(s)) browser = `Safari ${v(/Version\/(\d+(?:\.\d+)?)/)}`;
  return { os, browser, mobile: /Mobile|Android|iPhone|iPad/.test(s), ...(uaOs ? { uaOs } : {}) };
}

// Nombre court à la française (virgule décimale) ; absent : « — ».
export function fr(n, digits = 1) {
  if (!finite(n)) return '—';
  return n.toFixed(digits).replace('.', ',');
}

// Paramètres de l'adresse, résumés pour le rapport (clés et valeurs courtes, 12 au plus, sans caractères de contrôle).
export function paramsLine(search) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search.slice(0, 1000) : '');
  } catch {
    return '';
  }
  const clean = (t) => String(t).replace(/[^\w.,:-]/g, '').slice(0, 24);
  return [...q.entries()].slice(0, 12).map(([k, val]) => (val === '' ? clean(k) : `${clean(k)}=${clean(val)}`)).join('&');
}

const line = (label, parts) => `${label} : ${parts.filter((p) => p !== null && p !== '').join(' · ')}`;
const series = (s, t) => [`${s.count} ${t.frames} (${fr(s.fps, 0)} ${t.fps})`, `${t.median} ${fr(s.median)} ms`, `p95 ${fr(s.p95)}`, `p99 ${fr(s.p99)}`, `max ${fr(s.max)}`, `>1,5× ${s.over15}`, `>2× ${s.over2}`];

// Texte compact du rapport (à coller dans une conversation). data : sortie de l'état du profileur ; t : libellés (fr.json, clés game.perf.report.*).
export function formatReport(data, t = {}) {
  const d = data !== null && typeof data === 'object' ? data : {};
  const L = (k, fallback) => (typeof t[k] === 'string' ? t[k] : fallback);
  const tt = { frames: L('frames', 'images'), median: L('median', 'médiane'), fps: L('fps', 'i/s obtenues') };
  const win = d.window ?? frameSummary([]);
  const all = d.session ?? frameSummary([]);
  // Lot 5b-E : moyennes par étape (Safari arrondit son horloge haute résolution à la milliseconde : les médianes n'y valent que 0 ou 1).
  const stages = d.stagesMean && typeof d.stagesMean === 'object' ? d.stagesMean : d.stages && typeof d.stages === 'object' ? d.stages : {};
  const ios60 = d.refresh === 60 && /^iOS/.test(String(d.system?.os ?? ''));
  const info = d.renderer ?? {};
  const lines = [
    `${L('title', 'Z-Survival — rapport de fluidité')} v1`,
    line(L('system', 'Système'), [d.system?.uaOs ? `${d.system.os} (${L('uaOs', 'user-agent figé à')} ${d.system.uaOs})` : d.system?.os ?? '—', d.system?.browser ?? '—', d.refresh ? `${L('screen', 'cadence de la page')} ${d.refresh} Hz${ios60 ? ` (${L('ios60', 'Safari : 60 images/s par défaut, même sur un écran 120 Hz')})` : ''}` : `${L('screen', 'cadence de la page')} —`, `DPR ${fr(d.dpr, 2)}`, `canvas ${d.canvas?.width ?? 0}×${d.canvas?.height ?? 0}`]),
    line(L('preset', 'Préréglage'), [d.preset ?? '—', d.params ? `${L('params', 'paramètres')} ${d.params}` : '']),
    line(L('window', '5 s'), series(win, tt)),
    line(L('session', 'Session'), series(all, tt)),
    line(L('work', 'Travail/image (moyenne, ms)'), Object.entries(stages).map(([k, v]) => `${k} ${fr(v)}`)),
    line(L('render', 'Rendu'), [`${info.calls ?? 0} ${L('calls', 'appels')}`, `${info.triangles ?? 0} ${L('triangles', 'triangles')}`, `${info.programs ?? 0} ${L('programs', 'programmes')}`, `${info.geometries ?? 0} ${L('geometries', 'géométries')}`, `${info.textures ?? 0} ${L('textures', 'textures')}`]),
    line(L('first', 'Première image'), d.firstFrame ? [`${L('workShort', 'travail')} ${fr(d.firstFrame.total)} ms`, ...Object.entries(d.firstFrame.stages ?? {}).map(([k, v]) => `${k} ${fr(v)}`), `${L('next', 'image suivante après')} ${fr(d.firstFrame.next, 0)} ms`] : ['—']),
    line(L('longtasks', 'Tâches longues'), [d.longTasks?.supported === false ? L('unsupported', 'non prises en charge') : `${d.longTasks?.count ?? 0} (max ${fr(d.longTasks?.max ?? 0, 0)} ms${finite(d.longTasks?.maxSince) ? ` ${L('at', 'à')} ${fr(d.longTasks.maxSince / 1000)} s` : ''}, ${fr(d.longTasks?.total ?? 0, 0)} ms)`]),
    line(L('hitches', 'Premier usage (max image dans les 600 ms)'), (Array.isArray(d.hitches) && d.hitches.length ? d.hitches : []).map((h) => `${h.name} ${h.max === null ? '—' : `${fr(h.max, 0)} ms`}${finite(h.since) ? ` ${L('at', 'à')} ${fr(h.since / 1000)} s` : ''}`).concat(Array.isArray(d.hitches) && d.hitches.length ? [] : [L('none', 'aucun')])),
    line(L('memory', 'Mémoire JS'), [finite(d.heapMB) ? `${fr(d.heapMB)} Mo` : L('unavailable', 'non disponible')]),
    line(L('cap', 'Plafond'), [d.cap?.value ? `${d.cap.value} (${L('every', '1 image sur')} ${d.cap.every}${d.cap.aligned === false ? ` ; ${L('misaligned', 'non aligné sur l\'écran : trames irrégulières')}` : ''})` : L('nocap', 'aucun')]),
  ];
  return lines.join('\n');
}
