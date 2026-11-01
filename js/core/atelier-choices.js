// « Mes choix » de l'atelier des sons (lot 3h), pur : un emplacement par ligne, au format
// `emplacement=variante(hauteur=…,matiere=…,grain=…,duree=…,ampleur=…)` ; nombres avec un point décimal, deux décimales au plus.
// Ce texte est ce que le propriétaire copie et envoie ; scripts/sons/projection.mjs le relit. Rien n'est stocké.
import { MACRO_IDS, macroValues } from './synth2.js';
import { isNum } from './vec.js';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const LINE = /^\s*([a-z0-9-]+)\s*=\s*([A-Z])\s*(?:\((.*)\))?\s*$/;

// Nombre court : deux décimales au plus, sans zéros inutiles, jamais « -0 ».
export function formatNumber(n) {
  if (!isNum(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

// choices : { emplacement: { variant: 'A', macros: {…} } } ; slots (facultatif) : ordre des lignes et bornes des macros.
export function serializeChoices(choices, slots = null) {
  if (!isObj(choices)) return '';
  const order = Array.isArray(slots) ? slots.map((s) => s?.id).filter((id) => typeof id === 'string' && Object.hasOwn(choices, id)) : [];
  const ids = [...order, ...Object.keys(choices).filter((id) => !order.includes(id)).sort()];
  const lines = [];
  for (const id of ids) {
    const c = choices[id];
    if (!isObj(c) || typeof c.variant !== 'string' || !/^[A-Z]$/.test(c.variant) || !/^[a-z0-9-]+$/.test(id)) continue;
    const slot = Array.isArray(slots) ? slots.find((s) => s?.id === id) : null;
    const variant = slot?.variants?.find((v) => v?.id === c.variant) ?? null;
    const values = variant ? macroValues(variant, c.macros) : Object.fromEntries(MACRO_IDS.map((k) => [k, isNum(c.macros?.[k]) ? c.macros[k] : 0]));
    lines.push(`${id}=${c.variant}(${MACRO_IDS.map((k) => `${k}=${formatNumber(values[k])}`).join(',')})`);
  }
  return lines.join('\n');
}

// Lecture tolérante : lignes vides et commentaires (#) ignorés ; une ligne invalide est signalée dans `errors` (jamais d'exception).
// Avec slots : emplacement et variante doivent exister, les macros sont bornées. Renvoie { choices, errors }.
export function parseChoices(text, slots = null) {
  const choices = {};
  const errors = [];
  const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const m = LINE.exec(line);
    if (!m) {
      errors.push({ line: index + 1, text: line, reason: 'format' });
      return;
    }
    const [, id, variant, args] = m;
    const macros = {};
    let bad = false;
    for (const part of (args ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
      const kv = /^([a-z]+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(part);
      if (!kv || !MACRO_IDS.includes(kv[1])) {
        bad = true;
        continue;
      }
      macros[kv[1]] = Number(kv[2]);
    }
    if (bad) errors.push({ line: index + 1, text: line, reason: 'macro' });
    if (Array.isArray(slots)) {
      const slot = slots.find((s) => s?.id === id);
      const v = slot?.variants?.find((x) => x?.id === variant);
      if (!slot || !v) {
        errors.push({ line: index + 1, text: line, reason: slot ? 'variante' : 'emplacement' });
        return;
      }
      choices[id] = { variant, macros: macroValues(v, macros) };
    } else choices[id] = { variant, macros };
  });
  return { choices, errors };
}
