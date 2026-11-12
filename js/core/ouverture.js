// Lot 8f : ouvertures de caisses en 3D (Docs/ref/menu-principal.md). Pur : ni Three.js, ni DOM, ni réseau, ni stockage, ni horloge, ni hasard
// propre. Le rendu (js/menu/ouverture/) ne fait que suivre ce module, le temps en argument : chronologie d'une ouverture (×1 ou ×10 : arrivée en
// marchant, puis pour chaque caisse le tapis, le tir, le couvercle, la lumière, les rayons, l'objet, les réactions des zombies, la projection du
// légendaire et le vol de la carte vers sa case), forces des effets par rareté (data/menu/ouvertures.json, modifiable par le propriétaire),
// rareté qui règle les effets d'un élément obtenu, côté de réapparition du zombie projeté (graine de l'achat, js/core/rng.js), promenade des
// zombies et état de chaque élément à un instant donné (instant). L'ouverture montre un résultat déjà tiré : elle ne tire rien.
import { createRng, nextInt } from './rng.js';

export const REACTIONS = Object.freeze(['aucune', 'sursaut-leger', 'sursaut', 'saut', 'chute', 'projection']);
// Réactions jouées par les zombies (projection : l'un est projeté, l'autre fait « chute-forte »).
export const GESTES = Object.freeze(['sursaut-leger', 'sursaut', 'saut', 'chute', 'chute-forte']);
export const EVENEMENTS = Object.freeze(['etincelles', 'couvercle', 'lumiere', 'rayons', 'onde', 'eclair', 'secousse', 'particules', 'objet']);
export const ZOMBIES = 2;
export const QUANTITES = Object.freeze([1, 10]);
// Au plus trois éclairs d'écran par seconde (accessibilité : aucun clignotement de plus de 3 par seconde).
export const ECLAIRS_PAR_SECONDE = 3;

const estObjet = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const nombre = (n, min = 0, max = 1e4) => (typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null);
const plage = (p, min = 0, max = 1e4) => (Array.isArray(p) && p.length === 2 && nombre(p[0], min, max) !== null && nombre(p[1], min, max) !== null && p[0] <= p[1] ? Object.freeze([p[0], p[1]]) : null);
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
// Progression 0 → 1 dans [a, b] (0 avant, 1 après).
export const progres = (t, a, b) => (b <= a ? (t >= a ? 1 : 0) : clamp01((t - a) / (b - a)));
const dans = (t, p) => Boolean(p) && t >= p[0] && t < p[1];
const decale = (p, d) => Object.freeze([p[0] + d, p[1] + d]);
// Lissages (0 → 1).
export const lisse = (x) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const sortie = (x) => 1 - (1 - clamp01(x)) ** 3;

// --- Données -------------------------------------------------------------------------------------------------------------------------------
const FORCES = ['rayons', 'eventail', 'largeur', 'eclair', 'onde', 'etincelles', 'secousse'];
const BORNES_FORCES = { rayons: [0, 7], eventail: [0, 180], largeur: [0.1, 3], eclair: [0, 1], onde: [0, 10], etincelles: [0, 14], secousse: [0, 30] };

function lireOuvertureRel(o, nom, erreurs) {
  if (!estObjet(o)) {
    erreurs.push(`${nom} : ouverture absente`);
    return null;
  }
  const out = {};
  for (const e of EVENEMENTS) {
    const p = plage(o[e], 0, 30);
    if (!p) erreurs.push(`${nom}.ouverture.${e} : plage invalide`);
    out[e] = p;
  }
  out.reaction = nombre(o.reaction, 0, 30);
  if (out.reaction === null) erreurs.push(`${nom}.ouverture.reaction invalide`);
  // L'objet n'est jamais montré avant que le couvercle ne parte.
  if (out.objet && out.couvercle && out.objet[0] < out.couvercle[0]) erreurs.push(`${nom} : objet avant le couvercle`);
  return Object.freeze(out);
}

// data/menu/ouvertures.json → { reglages, erreurs } ; reglages null si une erreur (l'ouverture n'est alors pas jouée : résultat direct).
// raretes : identifiants dans l'ordre de data/menu/raretes.json (chaque rareté doit avoir ses effets).
export function lireOuvertures(json, raretes) {
  const erreurs = [];
  if (!estObjet(json)) return { reglages: null, erreurs: ['fichier absent ou invalide'] };
  const ids = Array.isArray(raretes) ? raretes.filter((r) => typeof r === 'string') : [];
  if (ids.length === 0) erreurs.push('aucune rareté');
  const a = estObjet(json.arrivee) ? json.arrivee : {};
  const arrivee = { duree: nombre(a.duree, 0.1, 20), fondu: plage(a.fondu, 0, 20), pas: Number.isInteger(a.pas) && a.pas >= 0 && a.pas <= 40 ? a.pas : null };
  if (arrivee.duree === null || !arrivee.fondu || arrivee.pas === null) erreurs.push('arrivee invalide');
  const j1 = estObjet(json.x1) ? json.x1 : {};
  const x1 = { tapis: plage(j1.tapis, 0, 30), tir: nombre(j1.tir, 0, 30), ouverture: lireOuvertureRel(j1.ouverture, 'x1', erreurs), boutons: plage(j1.boutons, 0, 30) };
  if (!x1.tapis || x1.tir === null || !x1.boutons) erreurs.push('x1 invalide');
  else if (x1.tir < x1.tapis[1]) erreurs.push('x1 : tir avant la fin du tapis');
  const j10 = estObjet(json.x10) ? json.x10 : {};
  const x10 = { periode: nombre(j10.periode, 0.5, 30), tapis: plage(j10.tapis, 0, 30), tir: nombre(j10.tir, 0, 30), ouverture: lireOuvertureRel(j10.ouverture, 'x10', erreurs), vol: plage(j10.vol, 0, 30), fin: nombre(j10.fin, 0, 10) };
  if (x10.periode === null || !x10.tapis || x10.tir === null || !x10.vol || x10.fin === null) erreurs.push('x10 invalide');
  else {
    if (x10.tir < x10.tapis[1]) erreurs.push('x10 : tir avant la fin du tapis');
    // La carte part avant que la caisse suivante n'arrive ; elle ne s'envole qu'une fois sortie de la caisse.
    if (x10.ouverture?.objet && x10.vol[0] < x10.ouverture.objet[1]) erreurs.push('x10 : vol avant la sortie de la carte');
    if (x10.tir + x10.vol[1] > x10.periode) erreurs.push('x10 : la carte doit partir avant la caisse suivante');
  }
  const jl = estObjet(json.legendaire) ? json.legendaire : {};
  const jp = estObjet(jl.projection) ? jl.projection : {};
  const jr = estObjet(jl.retour) ? jl.retour : {};
  const legendaire = {
    duree: nombre(jl.duree, 0.5, 30),
    explosion: plage(jl.explosion, 0, 30),
    projection: { delai: nombre(jp.delai, 0, 10), vol: nombre(jp.vol, 0.01, 10), colle: nombre(jp.colle, 0, 10), glissade: nombre(jp.glissade, 0.01, 10), trainees: nombre(jp.trainees, 0, 10) },
    objet: plage(jl.objet, 0, 30),
    vol: plage(jl.vol, 0, 30),
    retour: { apparition: nombre(jr.apparition, 0, 10), marche: nombre(jr.marche, 0.01, 10) },
  };
  if (legendaire.duree === null || !legendaire.explosion || !legendaire.objet || !legendaire.vol || Object.values(legendaire.projection).some((v) => v === null) || Object.values(legendaire.retour).some((v) => v === null)) erreurs.push('legendaire invalide');
  else if (x10.periode !== null && legendaire.duree <= x10.periode) erreurs.push('legendaire : la caisse dorée doit durer plus longtemps');
  else if (x10.tir !== null && x10.tir + legendaire.vol[1] > legendaire.duree) erreurs.push('legendaire : la carte doit partir avant la caisse suivante');
  else if (x10.tir !== null && x10.tir + finRetour(legendaire) > legendaire.duree) erreurs.push('legendaire : le zombie doit revenir avant la caisse suivante');
  const reactions = {};
  const jre = estObjet(json.reactions) ? json.reactions : {};
  for (const g of GESTES) {
    const r = estObjet(jre[g]) ? jre[g] : {};
    const v = { duree: nombre(r.duree, 0.05, 10), hauteur: nombre(r.hauteur, 0, 200), marque: typeof r.marque === 'string' && /^!{1,3}$/.test(r.marque) ? r.marque : null, vue: r.vue === undefined ? null : plage(r.vue, 0, 10), sol: r.sol === undefined ? null : plage(r.sol, 0, 10) };
    if (v.duree === null || v.hauteur === null || (r.marque !== undefined && !v.marque) || (r.vue !== undefined && !v.vue) || (r.sol !== undefined && !v.sol)) erreurs.push(`reaction ${g} invalide`);
    reactions[g] = Object.freeze(v);
  }
  const promenade = (Array.isArray(json.promenade) ? json.promenade : []).slice(0, ZOMBIES).map((p) => ({ x: nombre(p?.x, -1, 1), amplitude: nombre(p?.amplitude, -1, 1), periode: nombre(p?.periode, 1, 120) }));
  if (promenade.length !== ZOMBIES || promenade.some((p) => Object.values(p).some((v) => v === null))) erreurs.push('promenade invalide');
  const effets = {};
  const je = estObjet(json.effets) ? json.effets : {};
  for (const id of ids) {
    const e = estObjet(je[id]) ? je[id] : null;
    if (!e) {
      erreurs.push(`effets de ${id} absents`);
      continue;
    }
    const v = {};
    for (const f of FORCES) {
      const [lo, hi] = BORNES_FORCES[f];
      v[f] = nombre(e[f], lo, hi);
      if (v[f] === null) erreurs.push(`effets de ${id} : ${f} invalide`);
    }
    if (v.rayons !== null && !Number.isInteger(v.rayons)) erreurs.push(`effets de ${id} : rayons entier`);
    if (v.etincelles !== null && !Number.isInteger(v.etincelles)) erreurs.push(`effets de ${id} : etincelles entier`);
    v.ondeDouble = e.ondeDouble === true;
    v.explosion = e.explosion === true;
    v.reaction = REACTIONS.includes(e.reaction) ? e.reaction : null;
    if (!v.reaction) erreurs.push(`effets de ${id} : reaction inconnue`);
    effets[id] = Object.freeze(v);
  }
  if (erreurs.length) return { reglages: null, erreurs };
  return {
    reglages: Object.freeze({ arrivee: Object.freeze(arrivee), x1: Object.freeze(x1), x10: Object.freeze(x10), legendaire: Object.freeze({ ...legendaire, projection: Object.freeze(legendaire.projection), retour: Object.freeze(legendaire.retour) }), reactions: Object.freeze(reactions), promenade: Object.freeze(promenade.map(Object.freeze)), effets: Object.freeze(effets), raretes: Object.freeze([...ids]) }),
    erreurs,
  };
}

// Forces des effets d'une rareté (rareté inconnue : celles de la plus basse).
export function effets(reglages, rarete) {
  return reglages?.effets?.[rarete] ?? reglages?.effets?.[reglages?.raretes?.[0]] ?? null;
}

// Rareté qui règle les effets d'un élément obtenu (règle du lot 8f) : objet ou tenue : sa rareté ; personnage (sans rareté) : nouveau → la rareté
// dont le jeton est la teinte de sa caisse (recrues : rare, vétérans : épique, légendes : légendaire ; aucune : la plus haute) ; déjà obtenu →
// la plus basse (commun), comme le bord gris de son résultat. r : résultat d'achat du lot 8e ({ type, caisse, objets, issues }) ; raretes : catalogue.
export function rareteEffets(r, i, raretes) {
  const liste = Array.isArray(raretes) ? raretes : [];
  const basse = liste[0]?.id ?? null;
  if (!r || !Array.isArray(r.objets) || !r.objets[i]) return basse;
  if (r.type === 'personnage') {
    const issue = Array.isArray(r.issues) ? r.issues[i] : null;
    if (!issue?.nouveau) return basse;
    return liste.find((x) => x.jeton === r.caisse?.teinte)?.id ?? liste.at(-1)?.id ?? basse;
  }
  const rid = r.objets[i].rarete;
  return liste.some((x) => x.id === rid) ? rid : basse;
}

// Zombie projeté et côté de sa réapparition (légendaire), d'après la graine de l'achat et le rang de la caisse : déterministe.
export function choixLegendaire(graine, i = 0) {
  const g = Number.isSafeInteger(graine) && graine >= 0 ? graine : 1;
  const r0 = createRng((g ^ Math.imul((i + 1) >>> 0, 0x9e3779b1)) >>> 0);
  const a = nextInt(r0, ZOMBIES);
  const b = nextInt(a.rng, 2);
  return Object.freeze({ zombie: a.value, cote: b.value === 0 ? 'gauche' : 'droite' });
}

function finRetour(l) {
  const p = l.projection;
  return (l.explosion?.[0] ?? 0) + p.delai + p.vol + p.colle + p.glissade + l.retour.apparition + l.retour.marche;
}

// --- Chronologie ---------------------------------------------------------------------------------------------------------------------------
// raretes : rareté des effets de chaque caisse, dans l'ordre du tirage (1 ou 10) ; graine : celle de l'achat (choix du légendaire).
// Renvoie { quantite, duree, arrivee, caisses: [...], eclairs: [...], fin } (temps en secondes depuis le début de l'ouverture), ou null.
export function chronologie(reglages, raretes, { graine = 1 } = {}) {
  if (!reglages || !Array.isArray(raretes) || !QUANTITES.includes(raretes.length)) return null;
  const quantite = raretes.length;
  const dix = quantite === 10;
  const mode = dix ? reglages.x10 : reglages.x1;
  const L = reglages.legendaire;
  const caisses = [];
  let debut = reglages.arrivee.duree;
  for (let i = 0; i < quantite; i += 1) {
    const rarete = raretes[i];
    const fx = effets(reglages, rarete);
    const leg = fx.reaction === 'projection';
    const T = debut + mode.tir;
    const o = mode.ouverture;
    const c = { i, rarete, effets: fx, legendaire: leg, debut, tapis: decale(mode.tapis, debut), tir: T };
    for (const e of EVENEMENTS) c[e] = decale(o[e], T);
    c.explosion = leg && fx.explosion ? decale(L.explosion, T) : null;
    c.onde2 = fx.ondeDouble ? Object.freeze([c.onde[0] + 0.18, c.onde[1] + 0.3]) : null;
    if (fx.eclair <= 0) c.eclair = null;
    if (fx.secousse <= 0) c.secousse = null;
    if (fx.etincelles <= 0) c.particules = null;
    // Réactions des zombies (le second un peu après le premier, comme dans la maquette).
    const choix = leg ? choixLegendaire(graine, i) : null;
    c.reactions = [];
    if (fx.reaction !== 'aucune') {
      for (let z = 0; z < ZOMBIES; z += 1) {
        if (choix && z === choix.zombie) continue;
        const geste = leg ? 'chute-forte' : fx.reaction;
        const d = reglages.reactions[geste];
        const a = T + o.reaction + z * 0.03;
        c.reactions.push(Object.freeze({ zombie: z, geste, debut: a, fin: a + d.duree }));
      }
    }
    c.projection = null;
    c.sombre = null;
    c.trainees = null;
    if (leg) {
      const p = L.projection;
      const depart = c.explosion ? c.explosion[0] + p.delai : T + o.reaction + p.delai;
      const impact = depart + p.vol;
      const decolle = impact + p.colle;
      const bas = decolle + p.glissade;
      const apparition = bas + L.retour.apparition;
      c.projection = Object.freeze({ zombie: choix.zombie, cote: choix.cote, depart, impact, decolle, bas, apparition, place: apparition + L.retour.marche });
      c.sombre = Object.freeze([impact, decolle + p.glissade * 0.85]);
      c.trainees = Object.freeze([decolle, bas + p.trainees]);
      // L'objet doré sort derrière le zombie collé à l'écran (révélé par la glissade).
      c.objet = decale(L.objet, T);
    }
    c.vol = null;
    c.case = null;
    if (dix) {
      c.vol = decale(leg ? L.vol : mode.vol, T);
      c.case = c.vol[1];
      c.fin = debut + (leg ? L.duree : mode.periode);
    } else {
      const b = decale(mode.boutons, T);
      const apres = c.projection ? c.projection.bas + 0.3 : -Infinity;
      c.boutons = b[0] >= apres ? b : Object.freeze([apres, apres + (b[1] - b[0])]);
      c.fin = c.boutons[1];
    }
    for (const k of ['reactions']) c[k] = Object.freeze(c[k]);
    caisses.push(Object.freeze(c));
    debut = c.fin;
  }
  const derniere = caisses.at(-1);
  // ×10 : l'ouverture finit quand la dernière case est remplie (et le zombie projeté revenu), plus une courte pause ; ×1 : quand les boutons sont là.
  const fin = dix ? Math.max(derniere.case, derniere.projection?.place ?? 0) + reglages.x10.fin : derniere.fin;
  const eclairs = limiterEclairs(caisses.filter((c) => c.eclair).map((c) => ({ caisse: c.i, debut: c.eclair[0], fin: c.eclair[1], force: c.effets.eclair, rarete: c.rarete })));
  return Object.freeze({ quantite, duree: fin, fin, arrivee: reglages.arrivee, caisses: Object.freeze(caisses), eclairs: Object.freeze(eclairs), graine });
}

// Éclairs d'écran : au plus ECLAIRS_PAR_SECONDE départs dans une seconde glissante ; au-delà, l'éclair est atténué à 0 (jamais plus de 3 par
// seconde, même accéléré : l'accélération des tests change l'horloge, pas la chronologie).
export function limiterEclairs(liste) {
  const out = [];
  for (const e of [...liste].sort((a, b) => a.debut - b.debut)) {
    const recents = out.filter((x) => x.force > 0 && e.debut - x.debut < 1);
    out.push(Object.freeze({ ...e, force: recents.length >= ECLAIRS_PAR_SECONDE ? 0 : e.force }));
  }
  return out;
}

// Nombre de départs d'éclairs visibles dans la pire seconde glissante (contrôle des tests).
export function eclairsParSeconde(chrono) {
  const t = (chrono?.eclairs ?? []).filter((e) => e.force > 0).map((e) => e.debut);
  let max = 0;
  for (const a of t) max = Math.max(max, t.filter((b) => b >= a && b < a + 1).length);
  return max;
}

// Promenade d'un zombie (aller, pause, retour, comme la maquette) : { x (fraction de la largeur de la scène, autour de p.x), sens (1 ou -1), marche (0 ou 1) }.
export function promenade(p, t) {
  const u = (((t / p.periode) % 1) + 1) % 1;
  // 0 → 0,48 : aller ; 0,48 → 0,52 : pause (demi-tour) ; 0,52 → 0,96 : retour ; 0,96 → 1 : pause.
  let k;
  let sens;
  let marche;
  if (u < 0.48) [k, sens, marche] = [lisse(u / 0.48), 1, 1];
  else if (u < 0.52) [k, sens, marche] = [1, -1, 0];
  else if (u < 0.96) [k, sens, marche] = [1 - lisse((u - 0.52) / 0.44), -1, 1];
  else [k, sens, marche] = [0, 1, 0];
  return { x: p.x + p.amplitude * k, sens: p.amplitude < 0 ? -sens : sens, marche };
}

// --- État à un instant --------------------------------------------------------------------------------------------------------------------
// Ce que le rendu dessine au temps t (secondes depuis le début de l'ouverture) : progressions de 0 à 1 et indices. Pur, sans mémoire.
export function instant(chrono, reglages, t) {
  if (!chrono || !reglages) return null;
  const A = chrono.arrivee;
  const out = {
    t,
    fondu: 1 - progres(t, A.fondu[0], A.fondu[1]),
    marche: { avance: sortie(progres(t, 0, A.duree)), pas: A.pas > 0 ? clamp01(t / A.duree) * A.pas : 0, enMarche: t < A.duree },
    tapis: 0,
    active: -1,
    caisses: [],
    tir: { recul: 0, flamme: 0, trainee: 0, reticule: 0 },
    eclair: { force: 0, rarete: null },
    secousse: 0,
    sombre: 0,
    cases: 0,
    boutons: 0,
    zombies: [],
    fini: t >= chrono.fin,
  };
  // Tapis : un pas par caisse (de 0 à quantité), lissé pendant son déplacement.
  for (const c of chrono.caisses) out.tapis += lisse(progres(t, c.tapis[0], c.tapis[1]));
  for (const c of chrono.caisses) {
    if (t >= c.debut && t < c.fin) out.active = c.i;
    const objetVisible = t >= c.objet[0] && (!c.vol || t < c.vol[1]);
    out.caisses.push({
      i: c.i,
      rarete: c.rarete,
      position: c.i + 1 - out.tapis, // 0 : au centre du tapis ; 1 : en attente à gauche ; −1 : partie à droite
      ouverte: t >= c.couvercle[0],
      etincelles: dans(t, c.etincelles) ? progres(t, c.etincelles[0], c.etincelles[1]) : 0,
      couvercle: progres(t, c.couvercle[0], c.couvercle[1]),
      lumiere: lisse(progres(t, c.lumiere[0], c.lumiere[1])),
      rayons: progres(t, c.rayons[0], c.rayons[1]),
      onde: dans(t, c.onde) && c.effets.onde > 0 ? progres(t, c.onde[0], c.onde[1]) : 0,
      onde2: c.onde2 && dans(t, c.onde2) ? progres(t, c.onde2[0], c.onde2[1]) : 0,
      particules: c.particules && dans(t, c.particules) ? progres(t, c.particules[0], c.particules[1]) : 0,
      explosion: c.explosion && dans(t, c.explosion) ? progres(t, c.explosion[0], c.explosion[1]) : 0,
      objet: objetVisible ? { sortie: sortie(progres(t, c.objet[0], c.objet[1])), vol: c.vol ? lisse(progres(t, c.vol[0], c.vol[1])) : 0 } : null,
    });
    // Tir : recul et flamme (0,12 s), traînée (0,08 s), réticule écarté (0,6 s).
    if (t >= c.tir && t < c.tir + 0.6) {
      const d = t - c.tir;
      out.tir = { recul: d < 0.12 ? 1 - d / 0.12 : 0, flamme: d < 0.1 ? 1 - d / 0.1 : 0, trainee: d < 0.08 ? 1 - d / 0.08 : 0, reticule: 1 - d / 0.6 };
    }
    if (c.secousse && dans(t, c.secousse)) out.secousse = Math.max(out.secousse, c.effets.secousse * (1 - progres(t, c.secousse[0], c.secousse[1])));
    if (c.sombre && dans(t, c.sombre)) out.sombre = Math.min(progres(t, c.sombre[0], c.sombre[0] + 0.1), 1 - progres(t, c.sombre[1] - 0.25, c.sombre[1])) * 0.6;
    if (c.case !== null && t >= c.case) out.cases += 1;
    if (c.boutons) out.boutons = progres(t, c.boutons[0], c.boutons[1]);
  }
  for (const e of chrono.eclairs) {
    if (e.force > 0 && t >= e.debut && t < e.fin) {
      // Montée rapide (0,04 s) puis décroissance.
      const f = e.force * Math.min(progres(t, e.debut, e.debut + 0.04), 1 - progres(t, e.debut + 0.04, e.fin));
      if (f > out.eclair.force) out.eclair = { force: f, rarete: e.rarete };
    }
  }
  for (let z = 0; z < ZOMBIES; z += 1) out.zombies.push(zombieA(chrono, reglages, z, t));
  return out;
}

// État d'un zombie : promenade, geste en cours (progression), marque (« ! »), projection (légendaire).
function zombieA(chrono, reglages, z, t) {
  const base = promenade(reglages.promenade[z], t);
  const out = { x: base.x, sens: base.sens, marche: base.marche, geste: null, p: 0, hauteur: 0, sol: 0, etape: null, pe: 0, recul: 0, marque: null, marqueEchelle: 0, projection: null };
  for (const c of chrono.caisses) {
    for (const r of c.reactions) {
      if (r.zombie !== z || t < r.debut || t >= r.fin) continue;
      const d = reglages.reactions[r.geste];
      const u = t - r.debut;
      out.geste = r.geste;
      out.p = progres(t, r.debut, r.fin);
      // Saut : parabole sur la première partie du geste (jusqu'à la chute pour une chute).
      const montee = d.sol ? d.sol[0] : Math.min(d.duree, 0.5);
      out.hauteur = u < montee ? d.hauteur * 4 * (u / montee) * (1 - u / montee) : 0;
      if (d.sol) {
        out.sol = u < d.sol[0] ? progres(u, d.sol[0] * 0.55, d.sol[0]) : u < d.sol[1] ? 1 : 1 - progres(u, d.sol[1], d.duree);
        // Retour du propriétaire (« la chute fait trop simple ») : étapes d'une chute : saut (bras levés), chute en arrière avec rebond, au sol
        // (soubresauts), relevé ; recul : déplacement en arrière (0 → 1 pendant la chute, garde la place au sol, revient au relevé).
        const a = d.sol[0] * 0.55;
        const b = d.sol[0] + 0.18;
        if (u < a) [out.etape, out.pe] = ['saut', progres(u, 0, a)];
        else if (u < b) [out.etape, out.pe] = ['chute', progres(u, a, b)];
        else if (u < d.sol[1]) [out.etape, out.pe] = ['sol', progres(u, b, d.sol[1])];
        else [out.etape, out.pe] = ['releve', progres(u, d.sol[1], d.duree)];
        out.recul = u < a ? 0 : u < d.sol[1] ? lisse(progres(u, a, d.sol[0])) : 1 - lisse(progres(u, d.sol[1], d.duree));
      }
      if (d.marque && d.vue && u >= d.vue[0] && u < d.vue[1]) {
        out.marque = d.marque;
        const v = u - d.vue[0];
        out.marqueEchelle = v < 0.09 ? 0.3 + (v / 0.09) * 1.1 : v < 0.18 ? 1.4 - ((v - 0.09) / 0.09) * 0.4 : 1;
      }
    }
    const P = c.projection;
    if (P && P.zombie === z && t >= P.depart && t < P.place) {
      let phase;
      let p;
      if (t < P.impact) [phase, p] = ['vol', progres(t, P.depart, P.impact)];
      else if (t < P.decolle) [phase, p] = ['colle', progres(t, P.impact, P.decolle)];
      else if (t < P.bas) [phase, p] = ['glisse', lisse(progres(t, P.decolle, P.bas))];
      else if (t < P.apparition) [phase, p] = ['absent', progres(t, P.bas, P.apparition)];
      else [phase, p] = ['retour', progres(t, P.apparition, P.place)];
      out.projection = { phase, p, cote: P.cote };
      if (phase === 'retour') {
        // Réapparaît au fond, sur le côté tiré, et marche jusqu'à sa place (promenade du moment).
        const bord = P.cote === 'gauche' ? -0.62 : 0.62;
        out.x = bord + (base.x - bord) * lisse(p);
        out.sens = base.x > bord ? 1 : -1;
        out.marche = 1;
      }
    }
  }
  return out;
}

// Chronologie d'un résultat d'achat du lot 8e (raretés des effets selon rareteEffets), ou null (offre du jour, données invalides).
export function chronologieAchat(reglages, r, raretes) {
  if (!r || r.type === 'offre' || !Array.isArray(r.objets)) return null;
  return chronologie(reglages, r.objets.map((_, i) => rareteEffets(r, i, raretes)), { graine: r.graine });
}

// Retour du propriétaire : toucher l'écran (doigt ou souris) passe la caisse en cours. Temps où sauter depuis t : pendant l'arrivée, le départ de la
// première caisse ; ×10 : la fin de la caisse en cours (départ de la suivante ; la dernière : fin de l'ouverture, donc le résultat) ; ×1 : la fin
// (carte et boutons). null : rien à passer. Les cartes des caisses passées sont déjà dans leurs cases (instant est pur).
export function prochainSaut(chrono, t) {
  if (!chrono || !(t < chrono.fin)) return null;
  if (t < chrono.arrivee.duree) return chrono.caisses[0].debut;
  if (chrono.quantite === 1) return chrono.fin;
  const c = chrono.caisses.find((k) => t < k.fin);
  return !c || c.i === chrono.quantite - 1 ? chrono.fin : c.fin;
}
