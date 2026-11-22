// Lot 9k — Emplacements possibles des caisses d'armes (pièces 2 à 4 de la carte 1) : contre un mur de la pièce, la caisse du lot 9c (70 × 30,
// 22 de haut) le long du mur. Écartés : à moins de 160 d'une fenêtre (son point de réparation compris), à moins de 60 d'une porte, de 40 d'un
// escalier, de 50 d'une lampe ; entre 0 et 50 (couloir minimal de la carte) d'un meuble ou d'un pilier (collée à un meuble le long du même mur, elle ne ferme aucun passage) ; à moins de 60 d'un objet du décor des
// murs (lot 9j) ; hors de la pièce. Classement : faces tournées vers le sud d'abord (la caméra les voit de face), puis loin des fenêtres.
// Pur Node, lit les fichiers générés par npm run carte ; sortie en texte (et --json fichier). Usage : node scripts/equilibrage/caisses.mjs [--json f] [--proposition (écrit caisses-armes.proposition.json)]
import { readFileSync, writeFileSync } from 'node:fs';
import { rectMur } from '../../js/core/mobilier-epoque.js';
import { segmentRects } from '../../js/core/shape.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';

const DIR = 'data/game/maps/rez-de-chaussee/';
const lire = (f) => JSON.parse(readFileSync(DIR + f, 'utf8'));
export const CAISSE = Object.freeze({ long: 70, large: 30, haut: 22 });
export const ECARTS = Object.freeze({ fenetre: 160, porte: 60, escalier: 40, lampe: 50, meuble: 50, decorMur: 60, bout: 20, pas: 1, contact: 0.5 });
export const PIECES = Object.freeze({ aile: 'winchester1897', 'etage-gauche': 'kar98k', 'etage-droite': 'thompson' });

const dans = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const gap = (a, b) => Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
const chevauche = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const gapPt = (r, p) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
const r1 = (v) => Math.round(v * 10) / 10;

export function emplacementsCaisses() {
  const rdc = lire('world.json');
  const etage = lire('etage.world.json');
  const lampes = lire('lampes.world.json').lampes;
  const decorMurs = lire('mobilier.world.json').epoque?.murs ?? [];
  const zw = zonesToWorld(parseZones(lire('zones.json')), rdc.transform);
  const out = {};
  for (const [zid, arme] of Object.entries(PIECES)) {
    const zone = zw.zones.find((z) => z.id === zid);
    const w = zone.floor === 'rdc' ? rdc : etage;
    const poly = zone.region.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
    const murs = segmentRects(w.walls, w.wallThickness);
    const portes = zw.doors.flatMap((d) => [...(d.blocks ?? []).filter((b) => b.floor === zone.floor).flatMap((b) => [b.rect, b.opening && { x: Math.min(b.opening.x1, b.opening.x2), y: Math.min(b.opening.y1, b.opening.y2), w: Math.abs(b.opening.x2 - b.opening.x1) || 1, h: Math.abs(b.opening.y2 - b.opening.y1) || 1 }]), d.floor === zone.floor && d.opening ? { x: Math.min(d.opening.x1, d.opening.x2), y: Math.min(d.opening.y1, d.opening.y2), w: Math.abs(d.opening.x2 - d.opening.x1) || 1, h: Math.abs(d.opening.y2 - d.opening.y1) || 1 } : null]).filter(Boolean);
    const escaliers = (w.stairs ?? []).filter((s) => Number.isFinite(s.w));
    const meubles = w.obstacles ?? [];
    const lp = lampes.filter((l) => l.floor === zone.floor);
    const dm = decorMurs.filter((d) => d.floor === zone.floor);
    const liste = [];
    for (const m of murs) {
      for (const face of ['s', 'n', 'e', 'w']) {
        const horiz = face === 's' || face === 'n';
        const len = horiz ? m.w : m.h;
        for (let t = ECARTS.bout + CAISSE.long / 2; t <= len - ECARTS.bout - CAISSE.long / 2; t += ECARTS.pas) {
          const rect = horiz
            ? { x: m.x + t - CAISSE.long / 2, y: face === 's' ? m.y + m.h : m.y - CAISSE.large, w: CAISSE.long, h: CAISSE.large }
            : { x: face === 'e' ? m.x + m.w : m.x - CAISSE.large, y: m.y + t - CAISSE.long / 2, w: CAISSE.large, h: CAISSE.long };
          const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
          if (![[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h]].every(([x, y]) => dans(x, y, poly))) continue;
          if (murs.some((o) => o !== m && gap(rect, o) < 0.01 && !(gap(rect, o) === 0 && (rect.x + rect.w <= o.x || o.x + o.w <= rect.x || rect.y + rect.h <= o.y || o.y + o.h <= rect.y)))) continue;
          const dFen = Math.min(...w.windows.map((f) => gapPt(rect, f)));
          const dPorte = Math.min(Infinity, ...portes.map((p) => gap(rect, p)));
          const dEsc = Math.min(Infinity, ...escaliers.map((s) => gap(rect, s)));
          const dLampe = Math.min(Infinity, ...lp.map((l) => gapPt(rect, l)));
          const dMeuble = Math.min(Infinity, ...meubles.map((o) => gap(rect, o)));
          // Décor des murs (lot 9j) : un objet au pied du mur ou accroché que la caisse recouvrirait est « remplacé » (npm run carte ne pose
          // aucun objet devant un obstacle) ; listé, et classé après les places qui ne remplacent rien.
          const remplace = dm.filter((d) => { const r = rectMur(d); return chevauche(rect, { x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 }); }).map((d) => `${d.id} (${d.type})`);
          const dDecor = Math.min(Infinity, ...dm.filter((d) => !remplace.some((x) => x.startsWith(d.id))).map((d) => gapPt(rect, d)));
          if (meubles.some((o) => chevauche(rect, o))) continue;
          if (dFen < ECARTS.fenetre || dPorte < ECARTS.porte || dEsc < ECARTS.escalier || dLampe < ECARTS.lampe || (dMeuble > ECARTS.contact && dMeuble < ECARTS.meuble) || dDecor < ECARTS.decorMur) continue;
          liste.push({ piece: zid, arme, floor: zone.floor, mur: m.id ?? null, face, x: r1(c.x), y: r1(c.y), rect: { x: r1(rect.x), y: r1(rect.y), w: rect.w, h: rect.h }, distances: { fenetre: r1(dFen), porte: Number.isFinite(dPorte) ? r1(dPorte) : null, escalier: Number.isFinite(dEsc) ? r1(dEsc) : null, lampe: Number.isFinite(dLampe) ? r1(dLampe) : null, meuble: Number.isFinite(dMeuble) ? r1(dMeuble) : null, decorMur: Number.isFinite(dDecor) ? r1(dDecor) : null }, remplace });
        }
      }
    }
    const rang = { s: 0, e: 1, w: 1, n: 2 };
    liste.sort((a, b) => a.remplace.length - b.remplace.length || rang[a.face] - rang[b.face] || b.distances.fenetre - a.distances.fenetre);
    // Un emplacement par portion de mur (150 au moins entre deux retenus).
    const garde = [];
    for (const c of liste) if (!garde.some((g) => Math.hypot(g.x - c.x, g.y - c.y) < 150)) garde.push(c);
    out[zid] = garde;
  }
  return out;
}

// Deux places proposées par pièce (partie B ; choix du propriétaire au GO) : A d'abord (la plus visible ou la plus dégagée), B ensuite.
export const CHOIX = Object.freeze({
  aile: [{ x: 1455, y: 1240 }, { x: 1240, y: 2445 }],
  'etage-gauche': [{ x: 1455, y: 1526 }, { x: 1085, y: 1541 }],
  'etage-droite': [{ x: 1665, y: 1965 }, { x: 2230, y: 2335 }],
});
export function propositionCaisses(candidats = emplacementsCaisses()) {
  const pieces = {};
  for (const [zid, places] of Object.entries(CHOIX)) {
    pieces[zid] = { arme: PIECES[zid], places: places.map((q, i) => {
      const c = candidats[zid].find((x) => Math.hypot(x.x - q.x, x.y - q.y) < 1.5);
      if (!c) throw new Error(`${zid} : place ${q.x}, ${q.y} absente des emplacements possibles`);
      return { id: `${zid}-${'AB'[i]}`, ...c };
    }) };
  }
  return { _provisoire: "Lot 9k, partie B : proposition des places des caisses d'armes (deux par pièce, A et B), générée par node scripts/equilibrage/caisses.mjs --proposition ; jamais lue par le jeu (le choix du propriétaire, au GO, ira dans caisses-armes.json). Caisse du lot 9c (70 × 30, 22 de haut) contre le mur ; face : côté du mur vers lequel la caisse s'ouvre (s : vers le sud). remplace : objet du décor des murs (lot 9j) qui disparaîtrait (aucun objet devant un obstacle).", caisse: CAISSE, ecarts: ECARTS, pieces };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const r = emplacementsCaisses();
  for (const [zid, l] of Object.entries(r)) {
    console.log(`\n## ${zid} (${PIECES[zid]}) : ${l.length} emplacements possibles`);
    for (const c of l) console.log(`- ${c.floor} face ${c.face} (${c.x}, ${c.y}) ; fenêtre ${c.distances.fenetre} · porte ${c.distances.porte ?? '—'} · escalier ${c.distances.escalier ?? '—'} · lampe ${c.distances.lampe ?? '—'} · meuble ${c.distances.meuble ?? '—'} · décor ${c.distances.decorMur ?? '—'}${c.remplace.length ? ` ; remplace ${c.remplace.join(', ')}` : ''}`);
  }
  if (process.argv.includes('--proposition')) writeFileSync(`${DIR}caisses-armes.proposition.json`, `${JSON.stringify(propositionCaisses(r), null, 1)}\n`);
  const i = process.argv.indexOf('--json');
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(r, null, 1));
}
