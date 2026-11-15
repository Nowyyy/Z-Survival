// Lot 8j : les tirs (balles, laser de visée, ligne de tir) passent par-dessus les objets bas et à travers les grilles. Seuls les TIRS : le joueur
// et les zombies restent bloqués (leurs collisions, grilles de chemin et champs de flux ne lisent jamais cette liste). Pur et déterministe.
// Données : tirs.world.json de la carte (écrit par npm run carte d'après data/game/tirs-traversables.json, liste du propriétaire) :
// { rdc: { ids: [identifiants des meubles et objets traversables], grilles: [{ id, a, b, n }] }, etage: { ... } }. Une grille est une
// ouverture grillagée dessinée dans un mur (a, b : face intérieure, n : vers la salle) ; le mur logique y est percé pour les tirs seulement,
// exactement comme le dessin (js/game/world.js, cutGrilles : la boîte de mur qui contient le milieu de l'ouverture, sur la longueur [a, b]).
// Sans données (null : ?test=1&tirtraverse=0, ancienne salle) : la liste d'obstacles des tirs est exactement celle d'avant le lot.

import { castRay } from './ray.js';

const FLOORS = ['rdc', 'etage'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => p && isNum(p.x) && isNum(p.y);

// Lit tirs.world.json ; entrée invalide : null (aucun objet traversable).
export function lireTirs(json) {
  if (!json || typeof json !== 'object') return null;
  const out = {};
  for (const f of FLOORS) {
    const e = json[f] ?? {};
    out[f] = {
      ids: new Set(Array.isArray(e.ids) ? e.ids.filter((x) => typeof x === 'string' && x !== '') : []),
      grilles: (Array.isArray(e.grilles) ? e.grilles : []).filter((g) => g && typeof g.id === 'string' && isPoint(g.a) && isPoint(g.b) && isPoint(g.n)),
    };
  }
  return out;
}

// Morceaux d'un mur percé par les grilles qui le traversent : Map(identifiant du mur → morceaux), chaque morceau garde l'identifiant du mur
// (même matière au son d'impact). La boîte de mur qui contient le milieu de l'ouverture (à mi-épaisseur) est coupée sur [a, b], sur toute
// son épaisseur. Grille hors de tout mur : ignorée (npm run carte la refuse).
export function trousGrilles(walls, grilles, thick = 40) {
  const pieces = new Map();
  const current = (w) => pieces.get(w.id) ?? [w];
  for (const g of Array.isArray(grilles) ? grilles : []) {
    const mx = (g.a.x + g.b.x) / 2 - g.n.x * (thick / 2);
    const my = (g.a.y + g.b.y) / 2 - g.n.y * (thick / 2);
    const alongX = Math.abs(g.n.y) >= Math.abs(g.n.x);
    const lo = alongX ? Math.min(g.a.x, g.b.x) : Math.min(g.a.y, g.b.y);
    const hi = alongX ? Math.max(g.a.x, g.b.x) : Math.max(g.a.y, g.b.y);
    for (const w of Array.isArray(walls) ? walls : []) {
      const parts = current(w);
      const k = parts.findIndex((r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
      if (k < 0) continue;
      const r = parts[k];
      const r0 = alongX ? r.x : r.y;
      const r1 = alongX ? r.x + r.w : r.y + r.h;
      const a0 = Math.max(r0, lo);
      const a1 = Math.min(r1, hi);
      const cut = [];
      if (a0 - r0 > 0.01) cut.push(alongX ? { ...r, w: a0 - r0 } : { ...r, h: a0 - r0 });
      if (r1 - a1 > 0.01) cut.push(alongX ? { ...r, x: a1, w: r1 - a1 } : { ...r, y: a1, h: r1 - a1 });
      pieces.set(w.id, [...parts.slice(0, k), ...cut, ...parts.slice(k + 1)]);
      break;
    }
  }
  return pieces;
}

// Prépare, une fois au chargement, ce qui sert à chaque mise à jour des obstacles : par étage { ids, murs (Map des murs percés) } ; null sans données.
export function preparerTirs(json, layouts) {
  const lu = lireTirs(json);
  if (!lu || !layouts) return null;
  const out = {};
  for (const f of FLOORS) {
    const l = layouts[f];
    if (!l) continue;
    out[f] = { ids: lu[f].ids, murs: trousGrilles(l.walls, lu[f].grilles, isNum(l.wallThickness) ? l.wallThickness : 40) };
  }
  return out;
}

// Obstacles des tirs d'une couche (étage) : meubles (hors escaliers), murs, décor solide, portes fermées, dans cet ordre. Avec la préparation :
// sans les objets listés, murs percés aux grilles. Sans préparation : exactement la liste d'avant le lot 8j (mêmes objets, même ordre).
export function obstaclesTirs(couche, portesFermees, prep) {
  if (!couche || couche.empty) return [];
  const meubles = couche.furniture.filter((f) => f.kind !== 'escalier');
  const decor = couche.decor?.solids ?? [];
  const p = prep?.[couche.floorId ?? 'rdc'];
  if (!p) return [...meubles, ...couche.walls, ...decor, ...portesFermees];
  const garde = (o) => !p.ids.has(o.id);
  return [...meubles.filter(garde), ...couche.walls.flatMap((w) => p.murs.get(w.id) ?? [w]), ...decor.filter(garde), ...portesFermees];
}

// npm run carte : vérifie la liste du propriétaire (data/game/tirs-traversables.json, une carte : { rdc: [ids], etage: [ids] }) et rend le
// contenu du fichier dérivé (tirs.world.json) et les problèmes. couches : { rdc, etage } = { obstacles (meubles du monde), solids (décor solide), grilles
// (décor intérieur « grille » : { id, a, b, n }), walls (murs logiques), thick, hauteurs (facultatif : Map identifiant → hauteur DESSINÉE,
// mobilier.world.json) }. Refusés : identifiant inconnu ou en double, pilier, escalier, objet dont la hauteur (dessinée si connue, sinon de
// collision) atteint options.hauteurMax (retour du propriétaire après le lot 8j : la hauteur de l'arme, render.json → gunHeight, 43 ; on ne
// tire jamais à travers ce qui dépasse l'arme ; TIRS_HAUTEUR_MAX sans réglage), grille hors de tout mur. Les grilles passent quelle que soit leur hauteur.
export const TIRS_HAUTEUR_MAX = 100;
export const TIRS_JAMAIS = Object.freeze(['pilier', 'escalier']);
export function tirsMonde(liste, couches, options = {}) {
  const hauteurMax = isNum(options.hauteurMax) && options.hauteurMax > 0 ? options.hauteurMax : TIRS_HAUTEUR_MAX;
  const problems = [];
  const doc = {};
  for (const f of FLOORS) {
    const c = couches?.[f];
    const ids = Array.isArray(liste?.[f]) ? liste[f] : [];
    if (!c) {
      if (ids.length > 0) problems.push(`${f} : étage absent de la carte`);
      continue;
    }
    const objets = new Map([...(c.solids ?? []), ...(c.obstacles ?? [])].map((o) => [o.id, o]));
    const grilles = new Map((c.grilles ?? []).map((g) => [g.id, g]));
    const out = { ids: [], grilles: [] };
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') {
        problems.push(`${f} : identifiant invalide ${JSON.stringify(id)}`);
        continue;
      }
      if (out.ids.includes(id) || out.grilles.some((g) => g.id === id)) {
        problems.push(`${f} : ${id} en double`);
        continue;
      }
      const o = objets.get(id);
      const g = grilles.get(id);
      if (o) {
        if (TIRS_JAMAIS.includes(o.kind)) problems.push(`${f} : ${id} (${o.kind}) arrête toujours les tirs`);
        else if (isNum(c.hauteurs?.get?.(id) ?? o.hauteur) && (c.hauteurs?.get?.(id) ?? o.hauteur) >= hauteurMax) problems.push(`${f} : ${id} (${c.hauteurs?.get?.(id) ?? o.hauteur} de haut, arme à ${hauteurMax}) arrête toujours les tirs`);
        else out.ids.push(id);
      } else if (g && isPoint(g.a) && isPoint(g.b) && isPoint(g.n)) {
        if (trousGrilles(c.walls, [g], isNum(c.thick) ? c.thick : 40).size === 0) problems.push(`${f} : grille ${id} hors de tout mur`);
        else out.grilles.push({ id, a: { x: g.a.x, y: g.a.y }, b: { x: g.b.x, y: g.b.y }, n: { x: g.n.x, y: g.n.y } });
      } else problems.push(`${f} : identifiant inconnu ${id}`);
    }
    doc[f] = out;
  }
  return { doc, problems };
}

// Retour du propriétaire après le lot 8j : les deux bords du cône de visée s'arrêtent, comme le laser, sur les obstacles des tirs (mêmes murs,
// meubles, portes ; les objets traversables laissent passer). Renvoie [longueur du bord gauche (angle − demi-angle), longueur du bord droit].
export function longueursCone(from, angle, half, length, bounds, obstacles) {
  return [-1, 1].map((s) => castRay(from, angle + s * half, length, [], bounds, obstacles).length);
}
