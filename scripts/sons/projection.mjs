// Projection du pack de sons du jeu après intégration des choix de l'atelier (lot 3h, pour le lot 3i). Imprime, n'écrit rien.
// Poids : tampons actuels de data/game/sounds.json − tampons remplacés + tampons des emplacements choisis (plan « integration » de
// data/game/sounds-atelier.json : identifiants produits, identifiants remplacés, nombre de versions), au format du jeu (Float32 mono,
// 4 octets par échantillon) et mémoire estimée une fois décodé (mono : identique), sans plafond (limite levée par le propriétaire au lot 3i) ;
// temps de calcul au chargement mesuré en Node, comparé à la référence.
// Usage : node scripts/sons/projection.mjs [--variante=A|B|C] [--choix=<fichier « Mes choix »>] [--p1] [--voix=type|hauteur]
//   --variante : la même variante partout (A par défaut ; un emplacement sans cette variante garde A) ; --choix : un fichier texte au
//   format de « Mes choix » : seuls les emplacements cités sont intégrés (« actuel » : le son du jeu reste, « aucun » : pas de son) ;
//   --p1 : priorité 1 seulement ;
//   --voix=hauteur : un seul jeu de voix (celles du marcheur) lu à la hauteur de chaque type, comme aujourd'hui.
import { readFileSync } from 'node:fs';
import { renderSound, variantCount } from '../../js/core/synth.js';
import { renderVariant, resolveAtelier } from '../../js/core/synth2.js';
import { parseChoices } from '../../js/core/atelier-choices.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;

export function project({ atelierRaw, sounds, choices = {}, variant = 'A', p1Only = false, voicePlan = 'type', measureTime = true, onlyChosen = false }) {
  const data = resolveAtelier(atelierRaw);
  const current = new Map();
  let refBytes = 0;
  let refMs = 0;
  for (const recipe of sounds) {
    let bytes = 0;
    let ms = 0;
    for (let v = 0; v < variantCount(recipe); v += 1) {
      const t0 = performance.now();
      const r = renderSound(recipe, v);
      ms += performance.now() - t0;
      bytes += r.samples.length * 4;
    }
    current.set(recipe.id, { bytes, ms, set: recipe.set });
    refBytes += bytes;
    refMs += ms;
  }
  const removed = new Set();
  const rows = [];
  for (const slot of data.slots) {
    if (p1Only && slot.priority !== 1) continue;
    const plan = slot.integration;
    if (!plan || plan.versions <= 0) continue;
    if (voicePlan === 'hauteur' && plan.pitchPlan) continue;
    const chosen = choices[slot.id];
    if (onlyChosen && !chosen) continue;
    if (chosen && (chosen.variant === 'actuel' || chosen.variant === 'aucun')) continue;
    const vId = chosen?.variant ?? (slot.variants.some((v) => v.id === variant) ? variant : 'A');
    const macros = chosen?.macros ?? {};
    let bytes = 0;
    let ms = 0;
    let seconds = 0;
    for (let k = 1; k <= plan.versions; k += 1) {
      const t0 = performance.now();
      const r = renderVariant(slot, vId, macros, k);
      ms += measureTime ? performance.now() - t0 : 0;
      bytes += r.bytes;
      seconds = r.duration;
    }
    bytes *= plan.ids.length;
    ms *= plan.ids.length;
    for (const id of plan.replaces) removed.add(id);
    rows.push({ slot: slot.id, variant: vId, ids: plan.ids, replaces: plan.replaces, versions: plan.versions, seconds, bytes, ms });
  }
  let removedBytes = 0;
  let removedMs = 0;
  for (const id of removed) {
    removedBytes += current.get(id)?.bytes ?? 0;
    removedMs += current.get(id)?.ms ?? 0;
  }
  const added = rows.reduce((s, r) => s + r.bytes, 0);
  const addedMs = rows.reduce((s, r) => s + r.ms, 0);
  const total = refBytes - removedBytes + added;
  return { refBytes, refMs, removedBytes, removedMs, added, addedMs, total, decodedBytes: total, totalMs: refMs - removedMs + addedMs, rows: rows.sort((a, b) => b.bytes - a.bytes), removed: [...removed] };
}

const mb = (b) => (b / 1048576).toFixed(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const atelierRaw = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
  // Lot 3i : la référence reste le pack d'avant l'intégration (recettes remplacées remises depuis sounds-legacy.json).
  const legacy = new Map(JSON.parse(readFileSync('data/game/sounds-legacy.json', 'utf8')).sounds.map((r) => [r.id, r]));
  const sounds = JSON.parse(readFileSync('data/game/sounds.json', 'utf8')).sounds.flatMap((r) => (r.engine === 'atelier' ? (legacy.has(r.id) ? [legacy.get(r.id)] : []) : [r]));
  const file = arg('choix');
  const choices = file ? parseChoices(readFileSync(file, 'utf8'), resolveAtelier(atelierRaw).slots) : { choices: {}, errors: [] };
  for (const e of choices.errors) console.log(`ligne ${e.line} ignorée (${e.reason}) : ${e.text}`);
  const variant = arg('variante') ?? 'A';
  const voicePlan = arg('voix') === 'hauteur' ? 'hauteur' : 'type';
  const r = project({ atelierRaw, sounds, choices: choices.choices, variant, p1Only: process.argv.includes('--p1'), voicePlan, onlyChosen: Boolean(file) });
  console.log(`Choix : ${file ? `fichier ${file}` : `variante ${variant} partout`} ; voix : ${voicePlan === 'type' ? 'un jeu de tampons par type' : 'hauteur de lecture (comme aujourd\'hui)'}${process.argv.includes('--p1') ? ' ; priorité 1 seulement' : ''}.`);
  console.log('emplacement\tvariante\tidentifiants\tversions\tdurée s\toctets\tms');
  for (const row of r.rows) console.log(`${row.slot}\t${row.variant}\t${row.ids.join(',')}\t${row.versions}\t${row.seconds.toFixed(2)}\t${row.bytes}\t${row.ms.toFixed(0)}`);
  console.log(`\nRéférence (main) : ${r.refBytes} octets (${mb(r.refBytes)} Mo), calcul ${r.refMs.toFixed(0)} ms.`);
  console.log(`Retirés : ${r.removed.join(', ')} = ${r.removedBytes} octets, ${r.removedMs.toFixed(0)} ms ; ajoutés : ${r.added} octets, ${r.addedMs.toFixed(0)} ms.`);
  console.log(`Pack projeté : ${r.total} octets (${mb(r.total)} Mo) ; mémoire estimée une fois décodé : ${mb(r.decodedBytes)} Mo (mono) ; calcul au chargement ${r.totalMs.toFixed(0)} ms (référence ${r.refMs.toFixed(0)} ms, ${r.totalMs >= r.refMs ? '+' : ''}${(r.totalMs - r.refMs).toFixed(0)} ms).`);
}
