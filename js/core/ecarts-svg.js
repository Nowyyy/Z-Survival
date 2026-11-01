// Dessin SVG des écarts entre la carte et le modèle 3D (lot 3g, page ecarts.html) : la carte actuelle d'un étage (murs, fenêtres, piliers,
// escaliers, mobilier avec ses identifiants) et, superposé en pointillés, le relevé du modèle (coupe à 1,2 m, piliers, marches, ouvrages de fenêtre,
// objets) ; les objets du modèle sans équivalent ont leur propre classe (hachures), les écarts de plus de 60 unités un cadre et un texte.
// Pur : renvoie une chaîne, déterministe, texte échappé, aucune couleur (classes de css/ecarts.css), ne lève aucune exception sur des entrées inattendues.
import { buildLayout } from './layout.js';
import { escapeXml } from './map-svg.js';
import { planToUnits } from './releve.js';
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const list = (a) => (Array.isArray(a) ? a : []);
const n = (v) => String(Math.round(num(v) * 100) / 100);
const rectTag = (r, cls, extra = '') => `<rect class="${cls}" x="${n(r.x)}" y="${n(r.y)}" width="${n(Math.max(0, r.w))}" height="${n(Math.max(0, r.h))}"${extra}/>`;
const textTag = (x, y, cls, text, size) => `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-size="${n(size)}" text-anchor="middle">${escapeXml(text)}</text>`;
const id = (v) => ` data-id="${escapeXml(v ?? '')}"`;

// Rectangle { x0, y0, x1, y1 } (pixels du plan) vers { x, y, w, h } (unités du jeu).
export function pxRect(r, transform) {
  if (!isObject(r) || ![r.x0, r.y0, r.x1, r.y1].every(isNum)) return null;
  const [ax, ay] = planToUnits(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), transform);
  const [bx, by] = planToUnits(Math.max(r.x0, r.x1), Math.max(r.y0, r.y1), transform);
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

// releve : releve.json ; world : world.json (ou etage.world.json) de l'étage dessiné ; options : { floor ('rdc' | 'etage'), rows (lignes de
// compareFloor pour cet étage), labels: { title, desc, scale, big } }. Renvoie le texte du SVG (chaîne vide si world est invalide).
export function ecartsToSvg(releve, world, options = {}) {
  if (!isObject(world) || !isObject(world.size) || !isNum(world.size.width) || !isNum(world.size.height) || world.size.width <= 0 || world.size.height <= 0) return '';
  const opts = isObject(options) ? options : {};
  const labels = isObject(opts.labels) ? opts.labels : {};
  const floor = opts.floor === 'etage' ? 'etage' : 'rdc';
  const rows = list(opts.rows).filter((r) => isObject(r));
  const T = isObject(world.transform) ? world.transform : {};
  const layout = buildLayout(world, {});
  const room = layout.room;
  const crop = { x: room.x - 240, y: room.y - 240, w: room.width + 480, h: room.height + 480 };
  const unit = Math.max(crop.w, crop.h) / 100;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="ecarts-svg" viewBox="${n(crop.x)} ${n(crop.y)} ${n(crop.w)} ${n(crop.h)}" role="img" aria-labelledby="ecarts-titre ecarts-desc" preserveAspectRatio="xMidYMid meet">`);
  parts.push(`<title id="ecarts-titre">${escapeXml(labels.title ?? '')}</title>`);
  parts.push(`<desc id="ecarts-desc">${escapeXml(labels.desc ?? '')}</desc>`);
  parts.push('<defs><pattern id="ecarts-hachures" patternUnits="userSpaceOnUse" width="24" height="24" patternTransform="rotate(45)"><rect class="hachure" x="0" y="0" width="10" height="24"/></pattern></defs>');
  parts.push(rectTag(crop, 'fond'));

  // Carte actuelle.
  parts.push(`<g class="carte">${layout.floor.map((r) => rectTag(r, 'sol')).join('')}${layout.walls.map((w) => rectTag(w, 'mur', id(w.id))).join('')}</g>`);
  parts.push(`<g class="fenetres">${layout.windows.map((w) => {
    const g = layout.gaps.find((q) => q.id === w.id);
    return g ? `${rectTag(g, 'fenetre', id(w.id))}${textTag(g.x + g.w / 2, g.y + g.h / 2 + unit * 0.5, 'etiquette etiquette-fenetre', w.id, unit * 1.4)}` : '';
  }).join('')}</g>`);
  const pillars = list(world.pillars).filter((o) => isObject(o) && [o.x, o.y, o.w, o.h].every(isNum));
  const stairs = list(world.stairs).filter((o) => isObject(o) && [o.x, o.y, o.w, o.h].every(isNum));
  const structural = new Set([...pillars, ...stairs].map((o) => o.id));
  const furniture = layout.furniture.filter((o) => !structural.has(o.id) && o.kind !== 'pilier' && o.kind !== 'escalier');
  parts.push(`<g class="piliers">${pillars.map((o) => rectTag(o, 'pilier', id(o.id))).join('')}</g>`);
  parts.push(`<g class="escaliers">${stairs.map((o) => rectTag(o, 'escalier', id(o.id))).join('')}</g>`);
  parts.push(`<g class="meubles">${furniture.map((o) => `${rectTag(o, `meuble${o.provisional ? ' meuble-provisoire' : ''}`, id(o.id))}${textTag(o.x + o.w / 2, o.y + o.h / 2 + unit * 0.35, 'etiquette etiquette-meuble', o.id, unit * 0.9)}`).join('')}</g>`);

  // Relevé du modèle (pointillés).
  const fl = isObject(releve?.floors?.[floor]) ? releve.floors[floor] : {};
  const R = (r) => pxRect(r, T);
  const releveParts = [];
  for (const w of list(fl.walls)) { const r = R(w); if (r) releveParts.push(rectTag(r, 'releve releve-mur')); }
  for (const l of list(fl.lines)) {
    if (!isObject(l) || ![l.x1, l.y1, l.x2, l.y2].every(isNum)) continue;
    const [ax, ay] = planToUnits(l.x1, l.y1, T);
    const [bx, by] = planToUnits(l.x2, l.y2, T);
    releveParts.push(`<line class="releve releve-ligne" x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}"/>`);
  }
  for (const p of list(fl.pillars)) { const r = isObject(p) && isNum(p.x) && isNum(p.y) ? R({ x0: p.x - num(p.size, 7) / 2, y0: p.y - num(p.size, 7) / 2, x1: p.x + num(p.size, 7) / 2, y1: p.y + num(p.size, 7) / 2 }) : null; if (r) releveParts.push(rectTag(r, 'releve releve-pilier', id(p.id))); }
  for (const s of list(releve?.stairs).filter((q) => isObject(q) && !q.outside)) { const r = R(s); if (r) releveParts.push(rectTag(r, 'releve releve-escalier', id(s.id))); }
  for (const w of list(releve?.windows).filter((q) => isObject(q) && q.floor === floor)) { const r = R(w); if (r) releveParts.push(rectTag(r, 'releve releve-fenetre', id(w.id))); }
  const unmatched = new Set(rows.filter((r) => r.nature === 'objet').map((r) => r.ref));
  for (const g of list(releve?.groups).filter((q) => isObject(q) && q.floor === floor)) {
    const r = R(g.plan);
    if (!r) continue;
    if (unmatched.has(g.key)) releveParts.push(`${rectTag(r, `releve objet-sans objet-${escapeXml(String(g.klass ?? 'inconnu')).replace(/[^a-z-]/g, '')}`, id(g.key))}${textTag(r.x + r.w / 2, r.y - unit * 0.3, 'etiquette etiquette-objet', g.key, unit * 0.9)}`);
    else releveParts.push(rectTag(r, 'releve releve-objet', id(g.key)));
  }
  parts.push(`<g class="releve-groupe">${releveParts.join('')}</g>`);

  // Écarts de plus de 60 unités : cadre et texte (jamais la couleur seule).
  const big = rows.filter((r) => r.level === 'plus-60' && isObject(r.box));
  parts.push(`<g class="ecarts">${big.map((r) => {
    const b = R({ x0: r.box.x0 - 3, y0: r.box.y0 - 3, x1: r.box.x1 + 3, y1: r.box.y1 + 3 });
    return b ? `${rectTag(b, 'ecart', id(r.id))}${textTag(b.x + b.w / 2, b.y + b.h + unit * 1.3, 'etiquette etiquette-ecart', `${r.id} ${labels.big ?? ''}`.trim(), unit * 1.1)}` : '';
  }).join('')}</g>`);

  // Échelle de 500 unités, en bas à gauche du cadre.
  const sx = crop.x + 60;
  const sy = crop.y + crop.h - 60;
  parts.push(`<g class="echelle"><line class="echelle-trait" x1="${n(sx)}" y1="${n(sy)}" x2="${n(sx + 500)}" y2="${n(sy)}"/><line class="echelle-trait" x1="${n(sx)}" y1="${n(sy - 20)}" x2="${n(sx)}" y2="${n(sy + 20)}"/><line class="echelle-trait" x1="${n(sx + 500)}" y1="${n(sy - 20)}" x2="${n(sx + 500)}" y2="${n(sy + 20)}"/>${textTag(sx + 250, sy - 30, 'etiquette echelle-etiquette', labels.scale ?? '', unit * 1.4)}</g>`);
  parts.push('</svg>');
  return parts.join('');
}
