// Retour du propriétaire après le lot 9e : chorégraphie du rechargement (pur : sans Three.js, DOM, horloge ni hasard). La main gauche va d'un
// point à l'autre : « prise » (sa place sur l'arme), « chargeur » (le chargeur sur l'arme), « poche » (sur le corps, hanche gauche : elle y
// prend le chargeur neuf ou la cartouche), « port » (là où entre la cartouche), « culasse » et « culasse2 » (levier tiré puis relâché),
// « couvercle » (MG42), « pompe » et « pompe2 » (fusil à pompe : en avant, en arrière). Les étapes de data/game/armes-partie.json portent leur
// geste (retire, insere, culasse, couvercle). → images clés [{ t (part du rechargement, 0 à 1), cible }] de la main gauche (cles) et, pour un
// levier à droite (MG42, Garand, verrou du Kar98k), de la main droite (clesD ; « prise » : sa place sur l'arme), et marqueurs (objet en main,
// arme sans chargeur, secousses). Partie J : le geste du levier est calé sur son son (saisi au début du son, tiré en 0,12 s, lâché à 0,17 s).

const CORPS = new Set(['poche']);
export const surCorps = (cible) => CORPS.has(cible);

// Rechargement « chargeur » : entree.recharge.etapes ; vide : le chargeur était vide au début (étapes siVide, siReste).
// → { cles, objet: [[t0, t1]] (chargeur neuf dans la main), sans: [[t0, t1]] (arme sans chargeur), secousses: [t] (chargeur claqué, culasse) }.
export function choregraphieChargeur(entree, vide) {
  const etapes = (entree?.recharge?.etapes ?? []).filter((e) => !(e.siVide && !vide) && !(e.siReste && vide) && e.geste);
  const D = Math.max(0.1, entree?.recharge?.duree ?? entree?.rechargement ?? 1);
  const droite = entree?.levier?.main === 'droite';
  const cles = [{ t: 0, cible: 'prise' }];
  const clesD = [{ t: 0, cible: 'prise' }];
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
      // Levier tiré (glissière du Colt, levier d'armement) : la main l'atteint, le saisit quand le son commence, le tire, le lâche.
      const lev = [
        { t: Math.max(avant, e.t - Math.min(0.3 / D, d * 0.6)), cible: 'culasse' },
        { t: e.t, cible: 'culasse' },
        { t: Math.min(1, e.t + 0.12 / D), cible: 'culasse2' },
        { t: Math.min(1, e.t + 0.17 / D), cible: 'culasse2' },
      ];
      if (droite) {
        cles.push({ t: e.t, cible: 'prise' });
        clesD.push(...lev, { t: Math.min(1, e.t + 0.17 / D + (1 - e.t) * 0.35), cible: 'prise' });
      } else cles.push(...lev);
      secousses.push(Math.min(1, e.t + 0.17 / D));
    } else if (e.geste === 'couvercle') {
      cles.push({ t: avant + d * 0.6, cible: 'couvercle' }, { t: e.t, cible: 'couvercle' });
    }
    avant = e.t;
  }
  if (retire !== null) sans.push([retire, 1]);
  const dernier = cles[cles.length - 1].t;
  cles.push({ t: Math.max(dernier, avant + (1 - avant) * 0.6), cible: 'prise' }, { t: 1, cible: 'prise' });
  clesD.push({ t: 1, cible: 'prise' });
  return { cles, clesD: clesD.length > 2 ? clesD : null, objet, sans, secousses };
}

// Rechargement « balle » (balle par balle). Kar98k (poche « une ») : la main droite ouvre le verrou dès le début, la gauche va prendre les
// cartouches dans la poche une seule fois, puis les enfonce une à une ; à la fin, la droite referme le verrou (son au début du geste).
// Winchester : une cartouche prise dans la poche à chaque fois ; à la fin, la pompe (son au début du geste : arrière à 0,06 s, avant à 0,21 s).
export function choregraphieBalle(entree, prevu) {
  const r = entree?.recharge;
  if (r?.type !== 'balle') return { cles: [{ t: 0, cible: 'prise' }, { t: 1, cible: 'prise' }], clesD: null, objet: [], sans: [], secousses: [] };
  const n = Math.max(0, Math.floor(prevu));
  const total = r.debut + n * r.parBalle + r.fin;
  const T = (sec) => Math.min(1, Math.max(0, total > 0 ? sec / total : 0));
  const f = r.debut + n * r.parBalle;
  const objet = [];
  const secousses = [];
  if (r.poche === 'une') {
    const cles = [{ t: 0, cible: 'prise' }, { t: T(0.2), cible: 'prise' }, { t: T(0.6), cible: 'poche' }, { t: T(0.75), cible: 'poche' }, { t: T(r.debut), cible: 'port' }];
    for (let i = 0; i < n; i += 1) {
      const ti = r.debut + (i + 1) * r.parBalle;
      cles.push({ t: T(ti - r.parBalle * 0.45), cible: 'portHaut' }, { t: T(ti - r.parBalle * 0.1), cible: 'port' });
    }
    cles.push({ t: T(f + r.fin * 0.5), cible: 'prise' }, { t: 1, cible: 'prise' });
    objet.push([T(0.6), T(f)]);
    const clesD = [
      { t: 0, cible: 'prise' }, { t: T(0.05), cible: 'culasse' }, { t: T(0.17), cible: 'culasse2' },
      { t: T(f), cible: 'culasse2' }, { t: T(f + 0.08), cible: 'culasse' }, { t: T(f + 0.16), cible: 'culasse' }, { t: T(f + 0.35), cible: 'prise' }, { t: 1, cible: 'prise' },
    ];
    secousses.push(T(f + 0.08));
    return { cles, clesD, objet, sans: [], secousses };
  }
  const cles = [{ t: 0, cible: 'prise' }, { t: T(r.debut * 0.8), cible: 'port' }];
  for (let i = 0; i < n; i += 1) {
    const t0 = r.debut + i * r.parBalle;
    cles.push({ t: T(t0 + r.parBalle * 0.4), cible: 'poche' }, { t: T(t0 + r.parBalle * 0.5), cible: 'poche' }, { t: T(t0 + r.parBalle), cible: 'port' });
    objet.push([T(t0 + r.parBalle * 0.4), T(t0 + r.parBalle)]);
  }
  cles.push({ t: T(f), cible: 'pompe' }, { t: T(f + 0.06), cible: 'pompe2' }, { t: T(f + 0.21), cible: 'pompe' }, { t: 1, cible: 'prise' });
  secousses.push(T(f + 0.21));
  return { cles, clesD: null, objet, sans: [], secousses };
}

// Manœuvre après le tir (verrou, pompe), clés en secondes depuis le son : { de, vers, k } au temps t (secondes depuis le tir).
export function entreClesManoeuvre(def, t) {
  const cles = (def?.cles ?? []).map((c) => ({ t: def.debut + c.t, cible: c.cible }));
  return entreCles(cles, t);
}
// Poids d'une main pilotée par images clés : 0 sur sa « prise » (la pose de tenue reste), 1 ailleurs, en fondu à l'aller et au retour.
export function poidsMain(pos) {
  if (pos.de === 'prise' && pos.vers === 'prise') return 0;
  return (pos.de === 'prise' ? pos.k : 1) * (pos.vers === 'prise' ? 1 - pos.k : 1);
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
