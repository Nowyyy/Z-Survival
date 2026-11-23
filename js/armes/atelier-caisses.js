// Lot 9k — Atelier des armes, section « Caisses sur la carte » (proposition de la partie B, rien n'est branché sur la partie) : plan de chaque
// pièce (murs, fenêtres, portes, escaliers, meubles, lampes, décor des murs) avec les deux places proposées (A, B) et la portée du message
// (deux cases), message de proximité dessiné dans ses trois états, bouton tactile, touche proposée, son d'achat à écouter, tableau
// d'équilibrage proposé. Données : data/game/armes-partie.proposition.json et data/game/maps/rez-de-chaussee/caisses-armes.proposition.json
// (fichiers de proposition, jamais lus par le jeu). Absents : la section n'est pas créée.
import { formatMoney } from '../core/economy.js';
import { rectMur } from '../core/mobilier-epoque.js';
import { segmentRects } from '../core/shape.js';
import { parseZones, zonesToWorld } from '../core/zones.js';

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.append(n);
  return n;
};
const html = (tag, cls = null, texte = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (texte !== null) n.textContent = texte;
  return n;
};
const z = (v) => String(v).replace('.', ',');

export async function sectionCaisses({ t, charger, jouerSon, nomArme }) {
  const [prop, caisses, rdc, etage, zonesJson, lampes, mobilier] = await Promise.all([
    'data/game/armes-partie.proposition.json', 'data/game/maps/rez-de-chaussee/caisses-armes.proposition.json', 'data/game/maps/rez-de-chaussee/world.json',
    'data/game/maps/rez-de-chaussee/etage.world.json', 'data/game/maps/rez-de-chaussee/zones.json', 'data/game/maps/rez-de-chaussee/lampes.world.json',
    'data/game/maps/rez-de-chaussee/mobilier.world.json',
  ].map((c) => charger(c).catch(() => null)));
  if (!prop || !caisses || !rdc) return null;
  const zw = zonesToWorld(parseZones(zonesJson), rdc.transform);
  const achat = prop.achat ?? {};
  const sec = html('section', 'atelier-section');
  sec.id = 'caisses-carte';
  sec.setAttribute('aria-labelledby', 'caisses-carte-titre');
  const h2 = html('h2', 'atelier-heading', t('dev.armes.carte.titre'));
  h2.id = 'caisses-carte-titre';
  sec.append(h2, html('p', 'atelier-note', t('dev.armes.carte.intro')));

  // --- Plans des trois pièces -------------------------------------------------------------------------------------------------------------
  const plans = html('div', 'armes-plans');
  for (const [zid, piece] of Object.entries(caisses.pieces ?? {})) {
    const zone = zw.zones.find((q) => q.id === zid);
    if (!zone) continue;
    const w = zone.floor === 'rdc' ? rdc : etage;
    const poly = zone.region.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const m = 60;
    const box = { x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m };
    const dans = (r) => r.x + r.w > box.x && r.x < box.x + box.w && r.y + r.h > box.y && r.y < box.y + box.h;
    const fig = html('figure', 'armes-plan');
    const titre = t('dev.armes.carte.piece', { piece: t(`dev.armes.carte.zone.${zid}`), arme: nomArme(piece.arme) });
    const svg = el('svg', { viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, role: 'img', 'aria-label': titre, class: 'armes-plan-svg' });
    el('polygon', { points: poly.map((p) => p.join(',')).join(' '), class: 'plan-sol' }, svg);
    for (const o of (w.obstacles ?? []).filter(dans)) el('rect', { x: o.x, y: o.y, width: o.w, height: o.h, class: o.kind === 'pilier' ? 'plan-pilier' : 'plan-meuble' }, svg);
    for (const s of (w.stairs ?? []).filter((q) => Number.isFinite(q.w)).filter(dans)) el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, class: 'plan-escalier' }, svg);
    for (const r of segmentRects(w.walls, w.wallThickness).filter(dans)) el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: 'plan-mur' }, svg);
    for (const f of w.windows ?? []) {
      const horiz = f.side === 'nord' || f.side === 'sud';
      el('line', { x1: f.x - (horiz ? 36 : 0), y1: f.y - (horiz ? 0 : 36), x2: f.x + (horiz ? 36 : 0), y2: f.y + (horiz ? 0 : 36), class: 'plan-fenetre' }, svg);
      const lb = el('text', { x: f.x, y: f.y - 28, class: 'plan-texte' }, svg);
      lb.textContent = f.id;
    }
    for (const d of zw.doors) {
      if (d.floor === zone.floor && d.opening) el('line', { x1: d.opening.x1, y1: d.opening.y1, x2: d.opening.x2, y2: d.opening.y2, class: 'plan-porte' }, svg);
      for (const b of (d.blocks ?? []).filter((q) => q.floor === zone.floor && q.rect)) el('rect', { x: b.rect.x, y: b.rect.y, width: b.rect.w, height: b.rect.h, class: 'plan-bloc' }, svg);
    }
    for (const l of (lampes?.lampes ?? []).filter((q) => q.floor === zone.floor)) el('circle', { cx: l.x, cy: l.y, r: 9, class: 'plan-lampe' }, svg);
    for (const dm of (mobilier?.epoque?.murs ?? []).filter((q) => q.floor === zone.floor)) {
      const r = rectMur(dm);
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: 'plan-decor' }, svg);
    }
    const infos = html('ul', 'armes-plan-places');
    for (const p of piece.places) {
      el('circle', { cx: p.x, cy: p.y, r: Math.max(p.rect.w, p.rect.h) / 2 + num(achat.distance, 120), class: 'plan-portee' }, svg);
      el('rect', { x: p.rect.x, y: p.rect.y, width: p.rect.w, height: p.rect.h, class: 'plan-caisse' }, svg);
      const lettre = p.id.slice(-1);
      const tx = el('text', { x: p.x, y: p.y + 12, class: 'plan-lettre' }, svg);
      tx.textContent = lettre;
      const d = p.distances;
      infos.append(html('li', null, t('dev.armes.carte.place', { lettre, face: t(`dev.armes.carte.face.${p.face}`), x: z(p.x), y: z(p.y), fenetre: z(d.fenetre), porte: d.porte === null ? '–' : z(d.porte), escalier: d.escalier === null ? '–' : z(d.escalier), lampe: d.lampe === null ? '–' : z(d.lampe), remplace: p.remplace.length ? t('dev.armes.carte.remplace', { liste: p.remplace.join(', ') }) : t('dev.armes.carte.rien') })));
    }
    fig.append(svg, html('figcaption', 'atelier-note', titre), infos);
    plans.append(fig);
  }
  sec.append(html('h3', 'armes-sous-titre', t('dev.armes.carte.plans')), html('p', 'atelier-note', t('dev.armes.carte.legende')), plans);

  // --- Message de proximité, bouton tactile, touche, son ------------------------------------------------------------------------------------
  const pw = prop.armes?.winchester1897 ?? {};
  const prix = formatMoney(pw.prix ?? 0);
  const rachat = formatMoney(pw.rachat ?? 0);
  const manque = formatMoney(Math.min(300, pw.prix ?? 300));
  const msg = html('div', 'armes-messages');
  const etats = [
    ['achat', t('dev.armes.carte.msg.achat', { arme: nomArme('winchester1897'), prix }), false],
    ['munitions', t('dev.armes.carte.msg.munitions', { prix: rachat }), false],
    ['manque', `${t('dev.armes.carte.msg.achat', { arme: nomArme('winchester1897'), prix })} · ${t('dev.armes.carte.msg.manque', { n: manque })}`, true],
    ['refus', t('dev.armes.carte.msg.refus'), true],
  ];
  for (const [id, texte, gris] of etats) {
    const ligne = html('div', 'armes-message-ligne');
    ligne.append(html('span', 'armes-message-etat', t(`dev.armes.carte.etat.${id}`)));
    const p = html('p', `armes-message${gris ? ' armes-message-gris' : ''}`, texte);
    p.id = `carte-msg-${id}`;
    ligne.append(p);
    msg.append(ligne);
  }
  const bouton = html('button', 'armes-achat-bouton');
  bouton.type = 'button';
  bouton.id = 'carte-bouton';
  bouton.append(html('span', 'armes-achat-libelle', t('dev.armes.carte.bouton')), html('span', 'armes-achat-prix', t('dev.armes.carte.prixCourt', { prix })));
  const son = html('button', 'button atelier-button', t('dev.armes.carte.son'));
  son.type = 'button';
  son.id = 'carte-son';
  if (achat.son) son.addEventListener('click', () => jouerSon(achat.son, 0));
  else son.disabled = true;
  sec.append(html('h3', 'armes-sous-titre', t('dev.armes.carte.interaction')), html('p', 'atelier-note', t('dev.armes.carte.touche', { touche: achat.toucheLibelle ?? 'B' })), msg, bouton, son);

  // --- Équilibrage proposé ------------------------------------------------------------------------------------------------------------------
  const eq = prop._equilibrage;
  if (eq?.armes) {
    const hote = html('div', 'armes-tableau-hote');
    hote.tabIndex = 0;
    const table = html('table', 'armes-tableau');
    const vagues = eq.vagues ?? [];
    const tete = html('tr');
    for (const c of [t('dev.armes.carte.col.arme'), t('dev.armes.carte.col.tir'), t('dev.armes.carte.col.munitions'), t('dev.armes.carte.col.prix'), ...vagues.map((v) => t('dev.armes.carte.col.vague', { v }))]) {
      const th = html('th', null, c);
      th.scope = 'col';
      tete.append(th);
    }
    const thead = html('thead');
    thead.append(tete);
    const tbody = html('tbody');
    for (const [id, a] of Object.entries(eq.armes)) {
      const tr = html('tr');
      const e = prop.armes[id];
      const cells = [nomArme(id), t('dev.armes.carte.tir', { d: e.degats, p: e.plombs ?? 1, c: z(e.cadence) }), t('dev.armes.carte.mun', { c: e.chargeur, r: e.reserve === null ? '∞' : e.reserve, t: z(e.rechargement) }), id === prop.armeDepart ? '–' : t('dev.armes.carte.prixRachat', { p: formatMoney(e.prix), r: formatMoney(e.rachat ?? 0) }), ...vagues.map((v) => (Number.isFinite(a.aisance?.[v]) ? z(a.aisance[v].toFixed(2)) : '–'))];
      for (const c of cells) tr.append(html('td', null, String(c)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    hote.append(table);
    sec.append(html('h3', 'armes-sous-titre', t('dev.armes.carte.equilibrage')), html('p', 'atelier-note', t('dev.armes.carte.equilibrageNote')), hote);
  }
  return sec;
}
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
