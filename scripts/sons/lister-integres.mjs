// Tableau des sons intégrés au jeu (lot 3i), relu par le propriétaire : emplacement de l'atelier -> identifiant du jeu -> variante -> octets ->
// événement, avec les mesures (durée, centre de gravité spectral, niveau relatif au tir tel qu'entendu en jeu ; lot 5e : les colonnes « avant »,
// mesurées sur le pack d'avant retiré, ne sont plus calculées ; elles restent dans l'historique de Docs/ref/sons-integres.md). Mesures seules :
// aucun son n'est écouté. Écrit Docs/ref/sons-integres.md (à relancer après une modification de data/game/sounds-choix.json).
// Usage : node scripts/sons/lister-integres.mjs [--sortie=-] (« - » : sortie standard seulement).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveAtelier } from '../../js/core/synth2.js';
import { measureSound } from '../../js/core/atelier-check.js';
import { isAtelier, packStats, seedCount } from '../../js/core/sound-choice.js';
import { renderChoice } from '../../js/core/sound-render.js';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const fr = (n, d = 0) => n.toFixed(d).replace('.', ',');
const int = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function listIntegrated() {
  const choix = read('data/game/sounds-choix.json');
  const { sounds } = read('data/game/sounds.json');
  const atelier = resolveAtelier(read('data/game/sounds-atelier.json'));
  const slots = new Map(atelier.slots.map((s) => [s.id, s]));
  const byId = new Map(sounds.map((s) => [s.id, s]));
  const rows = [];
  for (const c of choix.choix) {
    const e = byId.get(c.id);
    const slot = slots.get(c.slot);
    const items = Array.from({ length: seedCount(e) }, (_, k) => renderChoice(e, { seed: k + 1 }));
    const m = measureSound(items[0].samples, items[0].sampleRate, slot, atelier.levelRef);
    const before = null; // lot 5e : pack d'avant retiré
    rows.push({ id: c.id, slot: c.slot, variant: c.variant, macros: c.macros, seeds: seedCount(e), bytes: packStats(items).bytes, duration: m.duration, centroid: m.centroid, levelRel: m.levelRel + (c.gainDb ?? 0), target: slot.target?.level ?? null, event: c.event, before, part: c.part });
  }
  const atelierEntries = sounds.filter(isAtelier);
  return { rows, nonIntegres: choix.nonIntegres ?? [], count: atelierEntries.length };
}

export function toMarkdown({ rows, nonIntegres }) {
  const macro = (m) => Object.entries(m).filter(([k, v]) => !((k === 'grain' || k === 'duree') && v === 1) && !(k !== 'grain' && k !== 'duree' && v === 0)).map(([k, v]) => `${k} ${fr(v, Number.isInteger(v) ? 0 : 2)}`).join(', ') || 'par défaut';
  const lines = [
    '# Sons intégrés au jeu (lot 3i)',
    '',
    'Généré par `node scripts/sons/lister-integres.mjs` d\'après `data/game/sounds-choix.json` (source : `Docs/ref/sons-a-integrer.md`). **Aucun son n\'a été écouté par l\'agent** : mesures seules (Node, Float32 mono, 22 050 Hz pour l\'atelier). Octets : toutes les versions (graines), 4 octets par échantillon. Lot 5e : le pack d\'avant (`sounds-legacy.json`, `?sons=ancien`) est retiré ; les valeurs « avant » des recettes remplacées ne sont plus calculées (voir l\'historique de ce fichier et `Docs/ref/sons-actuels.md`). Niveau : dB relatifs au tir tel qu\'entendu en jeu (niveau court + gain de catégorie − niveau court du tir), version 1 ; les voix d\'avant étaient lues à la hauteur du type (non comptée ici).',
    '',
    '| Emplacement | Identifiant du jeu | Variante (réglages) | Versions | Octets (avant) | Durée s (avant) | Centroïde Hz (avant) | Niveau dB / cible (avant) | Événement |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const b = r.before;
    lines.push(`| \`${r.slot}\` | \`${r.id}\` | ${r.variant} (${macro(r.macros)}) | ${r.seeds} | ${int(r.bytes)}${b ? ` (${int(b.bytes)})` : ''} | ${fr(r.duration, 2)}${b ? ` (${fr(b.duration, 2)})` : ''} | ${int(r.centroid)}${b ? ` (${int(b.centroid)})` : ''} | ${fr(r.levelRel, 1)} / ${r.target ?? '—'}${b ? ` (${fr(b.levelRel, 1)})` : ''} | ${r.event} |`);
  }
  lines.push('', '## Non intégrés', '');
  for (const n of nonIntegres) lines.push(`- \`${n.slot}\` (\`${n.id}\`) : ${n.reason}.`);
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  lines.push('', `Total des sons de l'atelier intégrés : ${int(total)} octets (${fr(total / 1048576, 2)} Mo), mémoire décodée estimée identique (mono). Aucun plafond de poids (décision du propriétaire).`, '');
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = toMarkdown(listIntegrated());
  if (process.argv.includes('--sortie=-')) console.log(md);
  else {
    writeFileSync('Docs/ref/sons-integres.md', md);
    console.log('Docs/ref/sons-integres.md écrit.');
  }
}
