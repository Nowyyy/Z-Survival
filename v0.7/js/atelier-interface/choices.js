// Atelier de l'interface (lot 3k) : « Mes choix », pur (aucun DOM ni stockage : la page n'enregistre rien, le texte se copie).
// Format : une ligne par écran « ecran=hud;direction=B;argent=haut-droite;texte=M;densite=compacte;fond=leger;contour=fin »,
// puis une ligne par proposition de priorité 2 « priorite2=retour-degats:B ». Lecture tolérante : lignes inconnues ignorées, avec avertissements.

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
export const MACRO_KEYS = ['argent', 'texte', 'densite', 'fond', 'contour'];
const MAX_TEXT = 4000;

// cfg : data/game/ui-atelier.json (screens, directions, macros, priority2).
function vocabulary(cfg) {
  return {
    screens: Array.isArray(cfg?.screens) ? cfg.screens : [],
    directions: Array.isArray(cfg?.directions) ? cfg.directions : [],
    macros: isObject(cfg?.macros) ? cfg.macros : {},
    priority2: Array.isArray(cfg?.priority2) ? cfg.priority2 : [],
  };
}

// Choix valide d'un écran : { direction, argent, texte, densite, fond, contour } (macros absentes pour « actuel ») ; sinon null.
export function normalizeChoice(choice, cfg) {
  const v = vocabulary(cfg);
  if (!isObject(choice) || !v.directions.includes(choice.direction)) return null;
  const out = { direction: choice.direction };
  if (choice.direction === 'actuel') return out;
  for (const k of MACRO_KEYS) {
    const list = Array.isArray(v.macros[k]) ? v.macros[k] : [];
    if (list.includes(choice[k])) out[k] = choice[k];
  }
  return out;
}

// choices = { screens: { hud: { direction, …macros } }, priority2: { 'retour-degats': 'B' } } → texte (écrans dans l'ordre de la configuration).
export function serializeChoices(choices, cfg) {
  const v = vocabulary(cfg);
  const lines = [];
  const screens = isObject(choices?.screens) ? choices.screens : {};
  for (const screen of v.screens) {
    if (!Object.hasOwn(screens, screen)) continue;
    const c = normalizeChoice(screens[screen], cfg);
    if (!c) continue;
    lines.push([`ecran=${screen}`, `direction=${c.direction}`, ...MACRO_KEYS.filter((k) => c[k]).map((k) => `${k}=${c[k]}`)].join(';'));
  }
  const p2 = isObject(choices?.priority2) ? choices.priority2 : {};
  for (const p of v.priority2) {
    if (Object.hasOwn(p2, p.id) && Array.isArray(p.variants) && p.variants.includes(p2[p.id])) lines.push(`priorite2=${p.id}:${p2[p.id]}`);
  }
  return lines.join('\n');
}

// Texte → { choices: { screens, priority2 }, warnings } ; jamais d'exception ; le texte est tronqué à 4 000 caractères.
export function parseChoices(text, cfg) {
  const v = vocabulary(cfg);
  const screens = {};
  const priority2 = {};
  const warnings = [];
  const source = typeof text === 'string' ? text.slice(0, MAX_TEXT) : '';
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const p2 = /^priorite2=([a-z0-9-]+):([A-Za-z]+)$/.exec(line);
    if (p2) {
      const prop = v.priority2.find((p) => p.id === p2[1]);
      if (prop && prop.variants.includes(p2[2])) priority2[p2[1]] = p2[2];
      else warnings.push(`ligne ${i + 1} : proposition inconnue`);
      return;
    }
    const fields = {};
    for (const part of line.split(';')) {
      const m = /^([a-z0-9]+)=([A-Za-z0-9-]+)$/.exec(part.trim());
      if (!m) {
        warnings.push(`ligne ${i + 1} : champ illisible`);
        continue;
      }
      if (m[1] === '__proto__' || m[1] === 'constructor' || m[1] === 'prototype') continue;
      fields[m[1]] = m[2];
    }
    if (!v.screens.includes(fields.ecran)) {
      warnings.push(`ligne ${i + 1} : écran inconnu`);
      return;
    }
    const c = normalizeChoice(fields, cfg);
    if (!c) {
      warnings.push(`ligne ${i + 1} : direction inconnue`);
      return;
    }
    const dropped = MACRO_KEYS.filter((k) => Object.hasOwn(fields, k) && !c[k]);
    if (dropped.length && c.direction !== 'actuel') warnings.push(`ligne ${i + 1} : valeur ignorée (${dropped.join(', ')})`);
    screens[fields.ecran] = c;
  });
  return { choices: { screens, priority2 }, warnings };
}
