// Lot 8i : sons du menu principal (Docs/ref/sons-menu.md). Pur : ni Web Audio, ni DOM, ni réseau, ni stockage, ni horloge, ni hasard natif.
// - lireSons(json) : catalogue de data/menu/sons.json (sons, variantes, variante par défaut, gains) ; lireChoix(json, catalogue) : variantes
//   retenues (data/menu/sons-choix.json), la variante par défaut quand le fichier, un nom ou une variante sont invalides.
// - gainsVolumes : gains des effets et de la musique d'après « Son coupé », le volume du jeu et celui de la musique.
// - admettreClic : un seul clic à la fois, volume dégressif quand on touche vite.
// - sonsOuverture(chrono, reglages) : sons d'une ouverture de caisses, aux instants de la chronologie pure (js/core/ouverture.js).
// - avancerMusique : états de la musique des menus (silence, attente du geste, musique, baisse, fondu, arrêt).
export const GROUPES = Object.freeze(['chute', 'menu', 'raretes', 'ouverture']);
export const VARIANTES = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']); // deux au moins, dans l'ordre
export const VOLUME_PAS = 10;
export const VOLUME_DEFAUT = 100;

const estObjet = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const fini = (n) => typeof n === 'number' && Number.isFinite(n);
const borne = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// --- Catalogue et choix --------------------------------------------------------------------------------------------------------------------
// data/menu/sons.json → { catalogue, erreurs } ; catalogue null si une erreur. Chaque son : { id, groupe, gain, defaut, versions, variantes }.
export function lireSons(json) {
  const erreurs = [];
  if (!estObjet(json) || !Array.isArray(json.sons)) return { catalogue: null, erreurs: ['fichier absent ou invalide'] };
  const sons = [];
  const vus = new Set();
  for (const s of json.sons) {
    const id = typeof s?.id === 'string' && /^[a-z][a-z0-9-]*$/.test(s.id) ? s.id : null;
    if (!id) {
      erreurs.push('son sans identifiant valide');
      continue;
    }
    if (vus.has(id)) erreurs.push(`${id} : en double`);
    vus.add(id);
    if (!GROUPES.includes(s.groupe)) erreurs.push(`${id} : groupe inconnu`);
    const variantes = Array.isArray(s.variantes) ? s.variantes : [];
    const ids = variantes.map((v) => v?.id);
    if (variantes.length < 2 || variantes.length > VARIANTES.length || ids.some((v, i) => v !== VARIANTES[i])) erreurs.push(`${id} : variantes A, B (puis C à G) attendues, dans l'ordre`);
    for (const v of variantes) {
      if (typeof v?.nom !== 'string' || v.nom.length === 0) erreurs.push(`${id}.${v?.id} : nom absent`);
      if (!fini(v?.dur) || v.dur <= 0 || v.dur > 4) erreurs.push(`${id}.${v?.id} : durée invalide`);
      if (!Array.isArray(v?.couches) || v.couches.length === 0) erreurs.push(`${id}.${v?.id} : aucune couche`);
    }
    if (!ids.includes(s.defaut)) erreurs.push(`${id} : variante par défaut inconnue`);
    if (!fini(s.gain) || s.gain <= 0 || s.gain > 1) erreurs.push(`${id} : gain invalide`);
    const versions = s.versions === undefined ? 1 : s.versions;
    if (!Number.isInteger(versions) || versions < 1 || versions > 3) erreurs.push(`${id} : versions invalides`);
    // aChoisir : son encore à juger par le propriétaire (la page d'écoute ne montre que ceux-là par défaut).
    sons.push(Object.freeze({ id, groupe: s.groupe, gain: s.gain, defaut: s.defaut, versions, variantes, aChoisir: s.aChoisir === true }));
  }
  const m = estObjet(json.musique) ? json.musique : null;
  const mv = Array.isArray(m?.variantes) ? m.variantes.map((v) => v?.id) : [];
  if (!m || mv.length < 2 || mv.some((v, i) => v !== VARIANTES[i]) || !mv.includes(m.defaut)) erreurs.push('musique : variantes ou variante par défaut invalides');
  const c = estObjet(json.clic) ? json.clic : {};
  const clic = { ecart: fini(c.ecart) ? borne(c.ecart, 0, 1) : 0.05, fenetre: fini(c.fenetre) ? borne(c.fenetre, 0, 2) : 0.25, degressif: fini(c.degressif) ? borne(c.degressif, 0.1, 1) : 0.6, plancher: fini(c.plancher) ? borne(c.plancher, 0, 1) : 0.25 };
  if (erreurs.length) return { catalogue: null, erreurs };
  return { catalogue: Object.freeze({ sons: Object.freeze(sons), clic: Object.freeze(clic), musique: m }), erreurs };
}

// Variantes retenues : { choix: { nom: 'A' | 'B' | 'C' }, ecarts: [textes] }. Toujours complet : un fichier absent ou invalide, un nom inconnu
// ou une variante qui n'existe pas pour ce son donnent la variante par défaut du catalogue (l'écart est noté, rien n'échoue).
export function lireChoix(json, catalogue) {
  const choix = {};
  const ecarts = [];
  const demande = estObjet(json) && estObjet(json.choix) ? json.choix : null;
  if (!demande) ecarts.push('fichier de choix absent ou invalide : variantes par défaut');
  const connus = new Set(['musique']);
  for (const s of catalogue?.sons ?? []) {
    connus.add(s.id);
    const v = demande?.[s.id];
    const ok = typeof v === 'string' && s.variantes.some((x) => x.id === v);
    if (demande && v !== undefined && !ok) ecarts.push(`${s.id} : variante « ${String(v).slice(0, 12)} » inconnue, ${s.defaut} par défaut`);
    choix[s.id] = ok ? v : s.defaut;
  }
  const m = catalogue?.musique;
  if (m) {
    const v = demande?.musique;
    const ok = typeof v === 'string' && m.variantes.some((x) => x.id === v);
    if (demande && v !== undefined && !ok) ecarts.push(`musique : variante « ${String(v).slice(0, 12)} » inconnue, ${m.defaut} par défaut`);
    choix.musique = ok ? v : m.defaut;
  }
  for (const k of Object.keys(demande ?? {})) if (!connus.has(k)) ecarts.push(`${String(k).slice(0, 40)} : son inconnu, ignoré`);
  return { choix, ecarts };
}

// Texte de data/menu/sons-choix.json pour des variantes données (page d'écoute : à copier dans le fichier) ; ordre du catalogue.
export function texteChoix(choix, catalogue, note = '') {
  const out = {};
  for (const s of catalogue?.sons ?? []) out[s.id] = choix?.[s.id] ?? s.defaut;
  if (catalogue?.musique) out.musique = choix?.musique ?? catalogue.musique.defaut;
  return `${JSON.stringify({ _note: note, choix: out }, null, 2)}\n`;
}

// --- Volumes -------------------------------------------------------------------------------------------------------------------------------
// Volume de 0 à 100, au pas le plus proche ; valeur invalide : `defaut`.
export function normaliserVolume(n, defaut = VOLUME_DEFAUT, pas = VOLUME_PAS) {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return defaut;
  const p = fini(pas) && pas > 0 ? pas : VOLUME_PAS;
  return borne(Math.round(v / p) * p, 0, 100);
}

// Gains (0 à 1) des effets (sons de la partie, effets du menu) et de la musique (musique des menus, mélodie d'annonce de vague). « Son coupé »
// coupe tout. Loi linéaire, celle du volume de la partie depuis le lot 8c (volume / 100) : 0 % = silence, 100 % = plein niveau.
export function gainsVolumes({ coupe = false, jeu = VOLUME_DEFAUT, musique = VOLUME_DEFAUT } = {}) {
  if (coupe === true) return { effets: 0, musique: 0 };
  return { effets: normaliserVolume(jeu, VOLUME_DEFAUT, 1) / 100, musique: normaliserVolume(musique, VOLUME_DEFAUT, 1) / 100 };
}

// --- Clic ----------------------------------------------------------------------------------------------------------------------------------
// Un seul clic à la fois : un clic demandé moins de `ecart` s après le précédent n'est pas joué ; dans la `fenetre` (s) qui suit un clic joué,
// le suivant est joué moins fort (× `degressif` à chaque fois, jamais sous `plancher`) ; au-delà, plein niveau. t : secondes (horloge de l'appelant).
export const creerClic = () => ({ dernier: -Infinity, gain: 1 });
export function admettreClic(etat, t, regles = {}) {
  const e = estObjet(etat) ? etat : creerClic();
  const ecart = fini(regles.ecart) ? regles.ecart : 0.05;
  const fenetre = fini(regles.fenetre) ? regles.fenetre : 0.25;
  const depuis = t - e.dernier;
  if (depuis < ecart) return { etat: e, jouer: false, gain: 0 };
  const gain = depuis < fenetre ? Math.max(fini(regles.plancher) ? regles.plancher : 0.25, e.gain * (fini(regles.degressif) ? regles.degressif : 0.6)) : 1;
  return { etat: { dernier: t, gain }, jouer: true, gain };
}

// --- Ouvertures ----------------------------------------------------------------------------------------------------------------------------

// Instants des pas de l'arrivée : la marche avance de sortie(p) = 1 − (1 − p)³ (js/core/ouverture.js, instant().marche.pas) ; le k-ième pas
// touche le sol quand elle vaut k / pas.
export function instantsPas(arrivee) {
  const n = Number.isInteger(arrivee?.pas) ? arrivee.pas : 0;
  const out = [];
  for (let k = 1; k <= n; k += 1) out.push((1 - (1 - k / n) ** (1 / 3)) * arrivee.duree);
  return out;
}

// Sons d'une ouverture, triés par instant : [{ t, son, caisse (−1 : arrivée), gain, fin (arrêt en fondu, s) | null, zombie | null, cle }].
// chrono : chronologie(…) de js/core/ouverture.js ; reglages : lireOuvertures(…).reglages (durées des réactions). Aucun instant propre : tout
// vient de la chronologie (tapis, tir, étincelles, couvercle, lumière, rayons, explosion, projection, réactions, vol, case).
// Retours du propriétaire (après le lot 8i) : plus de voix de zombie ni de sang qui coule ; le tapis ne s'entend qu'à l'arrivée de la première
// caisse (plus entre les caisses d'un ×10) ; un petit son quand le point d'exclamation apparaît au-dessus des zombies (une fois par caisse, plus
// fort avec « !! » et « !!! ») ; le corps qui tombe est gardé. Puis : plus de mélodie de signature de rareté (la rareté reste montrée par
// la lumière, les rayons et la carte).
export function sonsOuverture(chrono, reglages) {
  if (!chrono || !Array.isArray(chrono.caisses)) return [];
  const out = [];
  const ajouter = (t, son, caisse, extra = {}) => {
    if (fini(t)) out.push({ t, son, caisse, gain: 1, fin: null, zombie: null, ...extra });
  };
  const pas = instantsPas(chrono.arrivee);
  pas.forEach((t, k) => ajouter(t, 'ouv-pas', -1, { gain: 0.5 + 0.5 * ((k + 1) / pas.length), zombie: k % 2 }));
  for (const c of chrono.caisses) {
    if (c.i === 0) ajouter(c.tapis[0], 'ouv-tapis', c.i, { fin: c.tapis[1] });
    ajouter(c.tir, 'ouv-tir', c.i);
    ajouter(c.etincelles[0], 'ouv-impact', c.i);
    ajouter(c.couvercle[0], 'ouv-couvercle', c.i);
    ajouter(c.lumiere[0], 'ouv-lumiere', c.i);
    if (c.explosion) ajouter(c.explosion[0], 'ouv-explosion', c.i);
    if (c.projection) {
      ajouter(c.projection.souffle, 'ouv-souffle', c.i);
      ajouter(c.projection.impact, 'ouv-ecrasement', c.i);
    }
    let marque = false;
    for (const r of c.reactions ?? []) {
      const d = reglages?.reactions?.[r.geste];
      if (!d) continue;
      if (d.marque && d.vue && !marque) {
        marque = true;
        ajouter(r.debut + d.vue[0], 'ouv-exclamation', c.i, { gain: [0.7, 0.85, 1][d.marque.length - 1] ?? 1 });
      }
      if (d.sol) ajouter(r.debut + d.sol[0], 'ouv-zombie-tombe', c.i, { zombie: r.zombie });
    }
    if (c.vol) ajouter(c.vol[0], 'ouv-carte', c.i);
    if (c.case !== null && c.case !== undefined) ajouter(c.case, 'ouv-case', c.i);
  }
  return out.map((e, k) => ({ ...e, k })).sort((a, b) => a.t - b.t || a.k - b.k).map(({ k, ...e }, i) => Object.freeze({ ...e, cle: i, ordre: k }));
}

// Indice du premier son d'instant ≥ t (liste triée) : reprise après un saut (« toucher l'écran » passe la caisse en cours).
export function indiceSon(sons, t) {
  let i = 0;
  while (i < sons.length && sons[i].t < t) i += 1;
  return i;
}

// --- Musique -------------------------------------------------------------------------------------------------------------------------------
export const MODES_MUSIQUE = Object.freeze(['silence', 'attente', 'joue', 'baisse', 'fondu', 'arret']);
export const EVENEMENTS_MUSIQUE = Object.freeze(['pret', 'geste', 'ouverture', 'fin-ouverture', 'jouer', 'cachee', 'visible', 'coupe', 'retabli']);
export const creerMusique = () => Object.freeze({ pret: false, geste: false, ouverture: false, cachee: false, coupe: false, partie: false, mode: 'silence' });

// Mode d'après les faits : « JOUER » touché → fondu (définitif : la partie a ses propres sons) ; menu pas encore prêt (introduction, écran de
// chargement) → silence ; aucun geste encore → attente ; son coupé ou page cachée → arrêt ; ouverture de caisses en cours → baisse ; sinon musique.
function modeMusique(e) {
  if (e.partie) return 'fondu';
  if (!e.pret) return 'silence';
  if (!e.geste) return 'attente';
  if (e.coupe || e.cachee) return 'arret';
  return e.ouverture ? 'baisse' : 'joue';
}
export function avancerMusique(etat, evenement) {
  const e = { ...(estObjet(etat) ? etat : creerMusique()) };
  if (evenement === 'pret') e.pret = true;
  else if (evenement === 'geste') e.geste = true;
  else if (evenement === 'ouverture') e.ouverture = true;
  else if (evenement === 'fin-ouverture') e.ouverture = false;
  else if (evenement === 'jouer') e.partie = true;
  else if (evenement === 'cachee') e.cachee = true;
  else if (evenement === 'visible') e.cachee = false;
  else if (evenement === 'coupe') e.coupe = true;
  else if (evenement === 'retabli') e.coupe = false;
  e.mode = modeMusique(e);
  return Object.freeze(e);
}

// Niveau visé de la musique (0 à 1, avant le volume) dans un mode : plein, baissé (`baisse`, 0 à 1) ou nul.
export function niveauMusique(mode, baisse = 0.35) {
  if (mode === 'joue') return 1;
  if (mode === 'baisse') return borne(fini(baisse) ? baisse : 0.35, 0, 1);
  return 0;
}
