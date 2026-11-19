// Retour du propriétaire après le lot 9e : chorégraphie du rechargement (pur : sans Three.js, DOM, horloge ni hasard). La main gauche va d'un
// point à l'autre : « prise » (sa place sur l'arme), « chargeur » (le chargeur sur l'arme), « poche » (sur le corps, hanche gauche : elle y
// prend le chargeur neuf ou la cartouche), « port » (là où entre la cartouche), « culasse » et « culasse2 » (levier tiré puis relâché),
// « couvercle » (MG42), « pompe » et « pompe2 » (fusil à pompe : en avant, en arrière). Les étapes de data/game/armes-partie.json portent leur
// geste (retire, insere, culasse, couvercle). → images clés [{ t (part du rechargement, 0 à 1), cible }] et marqueurs (objet en main, arme
// sans chargeur, secousses).

const CORPS = new Set(['poche']);
export const surCorps = (cible) => CORPS.has(cible);

// Rechargement « chargeur » : entree.recharge.etapes ; vide : le chargeur était vide au début (étapes siVide, siReste).
// → { cles, objet: [[t0, t1]] (chargeur neuf dans la main), sans: [[t0, t1]] (arme sans chargeur), secousses: [t] (chargeur claqué, culasse) }.
export function choregraphieChargeur(entree, vide) {
  const etapes = (entree?.recharge?.etapes ?? []).filter((e) => !(e.siVide && !vide) && !(e.siReste && vide) && e.geste);
  const cles = [{ t: 0, cible: 'prise' }];
  const objet = [];
  const sans = [];
  const secousses = [];
  let avant = 0;
  let retire = null;
  for (const e of etapes) {
    const d = Math.max(0.02, e.t - avant);
    if (e.geste === 'retire') {
      cles.push({ t: Math.max(avant, e.t - Math.min(0.12, d * 0.7)), cible: 'chargeur' }, { t: e.t, cible: 'chargeur' });
      retire = e.t;
    } else if (e.geste === 'insere') {
      // Vers la poche, une pause (il prend le chargeur), retour à l'arme : le chargeur neuf est dans la main jusqu'à ce qu'il entre.
      const arrive = avant + d * 0.42;
      const prend = avant + d * 0.55;
      cles.push({ t: arrive, cible: 'poche' }, { t: prend, cible: 'poche' }, { t: e.t, cible: 'chargeur' });
      objet.push([arrive, e.t]);
      sans.push([retire ?? avant, e.t]);
      secousses.push(e.t);
      retire = null;
    } else if (e.geste === 'culasse') {
      cles.push({ t: avant + d * 0.55, cible: 'culasse' }, { t: e.t, cible: 'culasse2' });
      secousses.push(e.t);
    } else if (e.geste === 'couvercle') {
      cles.push({ t: avant + d * 0.6, cible: 'couvercle' }, { t: e.t, cible: 'couvercle' });
    }
    avant = e.t;
  }
  if (retire !== null) sans.push([retire, 1]);
  cles.push({ t: avant + (1 - avant) * 0.6, cible: 'prise' }, { t: 1, cible: 'prise' });
  return { cles, objet, sans, secousses };
}

// Rechargement « balle » (balle par balle) : début (main vers la culasse ou le port), puis pour chaque cartouche : poche (il la prend), port
// (elle entre) ; fin : culasse (verrou fermé) ou pompe (avant, arrière, avant). Temps en secondes, ramenés à des parts de la durée.
export function choregraphieBalle(entree, prevu) {
  const r = entree?.recharge;
  if (r?.type !== 'balle') return { cles: [{ t: 0, cible: 'prise' }, { t: 1, cible: 'prise' }], objet: [], sans: [], secousses: [] };
  const n = Math.max(0, Math.floor(prevu));
  const total = r.debut + n * r.parBalle + r.fin;
  const T = (s) => (total > 0 ? s / total : 0);
  const verrou = entree.categorie === 'fusil à verrou';
  const cles = [{ t: 0, cible: 'prise' }, { t: T(r.debut * 0.8), cible: verrou ? 'culasse' : 'port' }];
  const objet = [];
  const secousses = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = r.debut + i * r.parBalle;
    cles.push({ t: T(t0 + r.parBalle * 0.4), cible: 'poche' }, { t: T(t0 + r.parBalle * 0.5), cible: 'poche' }, { t: T(t0 + r.parBalle), cible: 'port' });
    objet.push([T(t0 + r.parBalle * 0.4), T(t0 + r.parBalle)]);
  }
  const f = r.debut + n * r.parBalle;
  if (verrou) {
    cles.push({ t: T(f + r.fin * 0.3), cible: 'culasse2' }, { t: T(f + r.fin * 0.6), cible: 'culasse' });
    secousses.push(T(f + r.fin * 0.6));
  } else {
    cles.push({ t: T(f + r.fin * 0.25), cible: 'pompe' }, { t: T(f + r.fin * 0.5), cible: 'pompe2' }, { t: T(f + r.fin * 0.7), cible: 'pompe' });
    secousses.push(T(f + r.fin * 0.7));
  }
  cles.push({ t: 1, cible: 'prise' });
  return { cles, objet, sans: [], secousses };
}

// Position sur les images clés au temps p (0 à 1) : { de, vers, k } (adoucie : départ et arrivée en douceur).
export function entreCles(cles, p) {
  if (!Array.isArray(cles) || cles.length === 0) return { de: 'prise', vers: 'prise', k: 0 };
  if (p <= cles[0].t) return { de: cles[0].cible, vers: cles[0].cible, k: 0 };
  for (let i = 1; i < cles.length; i += 1) {
    const a = cles[i - 1];
    const b = cles[i];
    if (p <= b.t) {
      const u = b.t > a.t ? (p - a.t) / (b.t - a.t) : 1;
      return { de: a.cible, vers: b.cible, k: u * u * (3 - 2 * u) };
    }
  }
  const z = cles[cles.length - 1].cible;
  return { de: z, vers: z, k: 0 };
}

export const dans = (plages, p) => (plages ?? []).some(([a, b]) => p >= a && p < b);
// Secousse (0 à 1) : un à-coup bref après chaque marqueur (chargeur claqué, culasse relâchée), sur `duree` (part du rechargement).
export function secousse(marques, p, duree = 0.06) {
  let s = 0;
  for (const m of marques ?? []) if (p >= m && p < m + duree) s = Math.max(s, 1 - (p - m) / duree);
  return s;
}
