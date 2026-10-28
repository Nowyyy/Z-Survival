// Dessin d'une carte en SVG (lot 3b, page de contrôle carte.html) : murs, fenêtres numérotées, piliers, escaliers, rampe, mobilier, zone de départ,
// points d'apparition, échelle de 500 unités et cadre de 100 px de plan en filigrane. Pur : renvoie une chaîne, déterministe, texte échappé, aucune
// couleur (tout passe par des classes de css/carte.css), n'écrit rien dans ses arguments, ne lève aucune exception sur des entrées inattendues.
import { buildLayout } from './layout.js';
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const n = (v) => String(Math.round(num(v) * 100) / 100);
const rectTag = (r, cls, extra = '') => `<rect class="${cls}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}"${extra}/>`;
const textTag = (x, y, cls, text, size, extra = '') => `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-size="${n(size)}" text-anchor="middle"${extra}>${escapeXml(text)}</text>`;

// Décalage de l'étiquette d'une fenêtre : vers l'extérieur du mur.
const OUT = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] };
const LABEL_DISTANCE = 95;

// world : world.json ; decor : decor.json ; options : { labels: { title, desc, scale, frame, start }, showSpawns (vrai), crop ('monde' ou 'batiment') }.
// Renvoie le texte du SVG (une chaîne vide si world est invalide).
export function mapToSvg(world, decor, options = {}) {
  if (!isObject(world) || !isObject(world.size) || !isNum(world.size.width) || !isNum(world.size.height) || world.size.width <= 0 || world.size.height <= 0) return '';
  const opts = isObject(options) ? options : {};
  const labels = isObject(opts.labels) ? opts.labels : {};
  const layout = buildLayout(world, isObject(decor) ? decor : {});
  const { width: W, height: H } = layout.size;
  const room = layout.room;
  const crop = opts.crop === 'batiment' ? { x: room.x - 300, y: room.y - 300, w: room.width + 600, h: room.height + 600 } : { x: 0, y: 0, w: W, h: H };
  const unit = Math.max(W, H) / 100; // taille de base des textes : 1 % du monde
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="carte-svg" viewBox="${n(crop.x)} ${n(crop.y)} ${n(crop.w)} ${n(crop.h)}" role="img" aria-labelledby="carte-titre carte-desc" preserveAspectRatio="xMidYMid meet">`);
  parts.push(`<title id="carte-titre">${escapeXml(labels.title ?? '')}</title>`);
  parts.push(`<desc id="carte-desc">${escapeXml(labels.desc ?? '')}</desc>`);
  parts.push(rectTag({ x: 0, y: 0, w: W, h: H }, 'monde'));

  // Sol extérieur : bandes de décor (route, trottoir, sentiers, rampe).
  const ground = Array.isArray(decor?.ground) ? decor.ground.filter((g) => isObject(g) && [g.x, g.y, g.w, g.h].every(isNum)) : [];
  parts.push(`<g class="sol">${ground.map((g) => rectTag(g, `sol sol-${escapeXml(String(g.kind ?? 'autre')).replace(/[^a-z0-9-]/gi, '')}`, ` data-id="${escapeXml(g.id ?? '')}"`)).join('')}</g>`);

  // Bâtiment : sol, murs (percés des fenêtres), fenêtres.
  parts.push(`<g class="batiment">${layout.floor.map((r) => rectTag(r, 'sol-batiment')).join('')}</g>`);
  parts.push(`<g class="murs">${layout.walls.map((w) => rectTag(w, 'mur', ` data-id="${escapeXml(w.id ?? '')}"`)).join('')}</g>`);
  const windows = layout.windows.filter((w) => isNum(w.x) && isNum(w.y));
  const gapOf = (id) => layout.gaps.find((g) => g.id === id);
  parts.push(`<g class="fenetres">${windows.map((w) => {
    const g = gapOf(w.id);
    const d = OUT[w.side] ?? [0, 0];
    return `${g ? rectTag(g, 'fenetre', ` data-id="${escapeXml(w.id ?? '')}"`) : ''}${textTag(w.x + d[0] * LABEL_DISTANCE, w.y + d[1] * LABEL_DISTANCE + unit * 0.4, 'fenetre-etiquette', w.id ?? '', unit * 1.6, ` data-id="${escapeXml(w.id ?? '')}"`)}`;
  }).join('')}</g>`);

  // Piliers, escaliers, rampe, mobilier.
  const pillars = Array.isArray(world.pillars) ? world.pillars : [];
  const stairs = Array.isArray(world.stairs) ? world.stairs : [];
  const structural = new Set([...pillars, ...stairs].map((o) => o.id));
  const furniture = layout.furniture.filter((o) => !structural.has(o.id) && o.kind !== 'pilier' && o.kind !== 'escalier');
  parts.push(`<g class="meubles">${furniture.map((o) => rectTag(o, `meuble meuble-${escapeXml(String(o.kind ?? 'autre')).replace(/[^a-z0-9-]/gi, '')}`, ` data-id="${escapeXml(o.id ?? '')}"`)).join('')}</g>`);
  parts.push(`<g class="escaliers">${stairs.filter((o) => [o.x, o.y, o.w, o.h].every(isNum)).map((o) => rectTag(o, 'escalier', ` data-id="${escapeXml(o.id ?? '')}"`)).join('')}</g>`);
  if (isObject(world.ramp) && [world.ramp.x, world.ramp.y, world.ramp.w, world.ramp.h].every(isNum)) parts.push(`<g class="rampe">${rectTag(world.ramp, 'rampe', ` data-id="${escapeXml(world.ramp.id ?? '')}"`)}</g>`);
  parts.push(`<g class="piliers">${pillars.filter((o) => [o.x, o.y, o.w, o.h].every(isNum)).map((o) => rectTag(o, 'pilier', ` data-id="${escapeXml(o.id ?? '')}"`)).join('')}</g>`);
  parts.push(`<g class="blocs">${layout.furniture.filter((o) => Array.isArray(o.parts) && o.parts.length > 1).map((o) => rectTag(o, 'bloc', ` data-id="${escapeXml(o.id)}"`)).join('')}</g>`);

  // Départ du joueur et zone libre.
  const zone = num(world.startZone, 0);
  parts.push(`<g class="depart"><circle class="depart-zone" cx="${n(layout.start.x)}" cy="${n(layout.start.y)}" r="${n(zone)}"/><circle class="depart-point" cx="${n(layout.start.x)}" cy="${n(layout.start.y)}" r="${n(unit * 0.5)}"/>${textTag(layout.start.x, layout.start.y - zone - unit * 0.5, 'depart-etiquette', labels.start ?? '', unit * 1.2)}</g>`);

  // Points d'apparition.
  if (opts.showSpawns !== false) {
    const spawns = Array.isArray(decor?.spawnPoints) ? decor.spawnPoints.filter((p) => isObject(p) && isNum(p.x) && isNum(p.y)) : [];
    parts.push(`<g class="apparitions">${spawns.map((p) => `<circle class="apparition" cx="${n(p.x)}" cy="${n(p.y)}" r="${n(unit * 0.45)}" data-id="${escapeXml(p.id ?? '')}"/>${textTag(p.x, p.y - unit * 0.8, 'apparition-etiquette', p.id ?? '', unit * 0.9)}`).join('')}</g>`);
  }

  // Cadre de 100 px de plan (500 unités) en filigrane et échelle graphique de 500 unités, en bas à gauche du monde.
  const frame = 500;
  const fx = Math.max(crop.x + 40, 40);
  const fy = Math.max(crop.y + 40, 40);
  parts.push(`<g class="cadre">${rectTag({ x: fx, y: fy, w: frame, h: frame }, 'cadre-trait')}${textTag(fx + frame / 2, fy + frame / 2, 'cadre-etiquette', labels.frame ?? '', unit * 1.4)}</g>`);
  const sy = crop.y + crop.h - 60;
  parts.push(`<g class="echelle"><line class="echelle-trait" x1="${n(fx)}" y1="${n(sy)}" x2="${n(fx + 500)}" y2="${n(sy)}"/><line class="echelle-bout" x1="${n(fx)}" y1="${n(sy - 20)}" x2="${n(fx)}" y2="${n(sy + 20)}"/><line class="echelle-bout" x1="${n(fx + 500)}" y1="${n(sy - 20)}" x2="${n(fx + 500)}" y2="${n(sy + 20)}"/>${textTag(fx + 250, sy - 30, 'echelle-etiquette', labels.scale ?? '', unit * 1.4)}</g>`);
  parts.push('</svg>');
  return parts.join('');
}
