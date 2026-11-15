// Rangée « Fenêtres » du HUD (lot 3a) : quelles fenêtres afficher, dans quel ordre. Seules les fenêtres attaquées ou ouvertes comptent ; elles sont triées par
// urgence (ouverte d'abord, puis le moins de planches, puis attaquée). Pur : les fenêtres et les paramètres arrivent en argument, aucun argument n'est
// modifié, aucune exception. Le libellé d'une puce (l'initiale du nom de la fenêtre) vient des données (params.labels, issu de fr.json), jamais du code.
import { isNum } from './vec.js';

export const MAX_CHIPS = 3;

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// windows : [{ id, planks, maxPlanks?, attacked? }] ; params : { labels: { id: texte }, maxChips? }.
// Renvoie la liste complète des fenêtres attaquées ou ouvertes, de la plus urgente à la moins urgente : [{ id, label, planks, max, attacked, open }].
export function urgentWindows(windows, params) {
  const labels = isObject(params?.labels) ? params.labels : {};
  const list = [];
  (Array.isArray(windows) ? windows : []).forEach((w, index) => {
    if (!isObject(w) || typeof w.id !== 'string' || w.id === '') return;
    const max = isNum(w.maxPlanks) && w.maxPlanks >= 1 ? Math.floor(w.maxPlanks) : 4;
    const planks = Math.max(0, Math.min(max, isNum(w.planks) ? Math.floor(w.planks) : 0));
    const open = planks === 0;
    const attacked = w.attacked === true;
    if (!open && !attacked) return;
    list.push({ index, chip: { id: w.id, label: typeof labels[w.id] === 'string' ? labels[w.id] : '', planks, max, attacked, open } });
  });
  list.sort((a, b) => (Number(b.chip.open) - Number(a.chip.open)) || (a.chip.planks - b.chip.planks) || (Number(b.chip.attacked) - Number(a.chip.attacked)) || (a.index - b.index));
  return list.map((entry) => entry.chip);
}

// Puces de la rangée : au plus params.maxChips (3 par défaut), plus le nombre de fenêtres en alerte qui ne tiennent pas (`more`). Vide si aucune alerte.
export function windowChips(windows, params) {
  const limit = isNum(params?.maxChips) && params.maxChips >= 1 ? Math.floor(params.maxChips) : MAX_CHIPS;
  const all = urgentWindows(windows, params);
  return { chips: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}
