// Lot 8i : moteur des sons du menu (Docs/ref/sons-menu.md), chargé à la demande par js/menu/sons/sons.js après un geste : catalogue
// (data/menu/sons.json), variantes retenues (data/menu/sons-choix.json), tampons calculés dans un calculateur d'arrière-plan (calcul.js ; repli :
// sur place, un tampon par image), lecture, clic sans accumulation, musique des menus (musique.js, chargé à son premier départ), sons d'une
// ouverture de caisses suivis sur la chronologie pure. Chaîne : source → gain du son → gain « effets » (volume du jeu) → sortie ;
// musique → gain « musique » (volume de la musique) → sortie. Les tampons d'un groupe se libèrent (ouverture) ; journal des lectures (tests).
import { admettreClic, avancerMusique, creerClic, creerMusique as etatMusiqueInitial, gainsVolumes, indiceSon, lireChoix, lireSons, niveauMusique, sonsOuverture } from '../../core/sons-menu.js';

const JOURNAL_MAX = 300;
const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const imageSuivante = () => new Promise((resolve) => {
  let fait = false;
  const go = () => {
    if (!fait) {
      fait = true;
      resolve();
    }
  };
  requestAnimationFrame(go);
  setTimeout(go, 100);
});

// faits() : { pret, geste, ouverture, cachee, coupe, partie } ; volumes() : { coupe, jeu, musique } (js/menu/sons/sons.js).
export async function creerMoteur({ ctx, faits, volumes }) {
  const [brut, choixBrut] = await Promise.all([json('data/menu/sons.json'), json('data/menu/sons-choix.json')]);
  const { catalogue, erreurs } = lireSons(brut);
  if (!catalogue) throw new Error(`sons.json : ${erreurs.join(' ; ')}`);
  const { choix } = lireChoix(choixBrut, catalogue);
  const sons = new Map(catalogue.sons.map((s) => [s.id, s]));
  const reglagesMusique = catalogue.musique;
  const effets = ctx.createGain();
  const busMusique = ctx.createGain();
  effets.connect(ctx.destination);
  busMusique.connect(ctx.destination);
  const tampons = new Map(); // nom -> [AudioBuffer par version]
  const enCalcul = new Map(); // nom -> promesse
  const actifs = new Set(); // { source, gain, groupe, nom }
  const journal = [];
  const noter = (e) => {
    journal.push(e);
    if (journal.length > JOURNAL_MAX) journal.shift();
  };
  let ferme = false;
  let vol = volumes();
  let clic = creerClic();
  let calculMs = 0;

  // ---------- calcul des tampons ----------
  let worker = null; // Worker, null (pas encore créé) ou false (indisponible)
  let prochain = 0;
  const attente = new Map();
  let surPlace = null;
  function calculateur() {
    if (worker !== null) return worker || null;
    try {
      worker = new Worker(new URL('./calcul.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const p = attente.get(event.data?.id);
        if (!p) return;
        attente.delete(event.data.id);
        if (event.data.ok) p.resolve(event.data);
        else p.repli();
      };
      worker.onerror = () => {
        worker = false;
        for (const p of attente.values()) p.repli();
        attente.clear();
      };
    } catch {
      worker = false;
    }
    return worker || null;
  }
  // Repli sans calculateur : synthèse chargée ici, un tampon par image (le menu reste réactif entre deux tampons).
  async function rendreSurPlace(son, variante, version) {
    surPlace ??= import('./synthese.js');
    const { rendreSon } = await surPlace;
    await imageSuivante();
    const t0 = performance.now();
    const r = rendreSon(son, variante, version);
    return { samples: r.samples, sampleRate: r.sampleRate, ms: performance.now() - t0 };
  }
  function rendre(son, variante, version) {
    const w = calculateur();
    if (!w) return rendreSurPlace(son, variante, version);
    prochain += 1;
    const id = prochain;
    return new Promise((resolve) => {
      attente.set(id, { resolve, repli: () => resolve(rendreSurPlace(son, variante, version)) });
      w.postMessage({ id, son, variante, version });
    });
  }
  function calculer(s) {
    if (tampons.has(s.id)) return Promise.resolve();
    if (!enCalcul.has(s.id)) {
      enCalcul.set(s.id, Promise.all(Array.from({ length: s.versions }, (_, k) => rendre(s, choix[s.id], k + 1))).then((rendus) => {
        enCalcul.delete(s.id);
        if (ferme || !rendus.every((r) => r.samples?.length > 0)) return;
        tampons.set(s.id, rendus.map((r) => {
          calculMs += r.ms;
          const b = ctx.createBuffer(1, r.samples.length, r.sampleRate);
          b.copyToChannel(r.samples, 0);
          return b;
        }));
      }));
    }
    return enCalcul.get(s.id);
  }
  // Tampons d'un groupe (les raretés servent aussi aux ouvertures : jamais recalculées).
  function preparer(groupe) {
    return Promise.all(catalogue.sons.filter((s) => s.groupe === groupe).map(calculer)).then(() => true);
  }
  function arreterGroupe(groupe, fondu = 0.03) {
    const t = ctx.currentTime;
    for (const a of [...actifs]) {
      if (groupe && a.groupe !== groupe) continue;
      try {
        a.gain.gain.cancelScheduledValues(t);
        a.gain.gain.setValueAtTime(a.gain.gain.value, t);
        a.gain.gain.linearRampToValueAtTime(0, t + fondu);
        a.source.stop(t + fondu + 0.02);
      } catch { /* déjà arrêtée */ }
      actifs.delete(a);
    }
  }
  function liberer(groupe) {
    arreterGroupe(groupe);
    for (const s of catalogue.sons) if (s.groupe === groupe) tampons.delete(s.id);
  }

  // ---------- lecture ----------
  // options : { gain, delai (s), version (dès 1), fin (s depuis maintenant : arrêt en fondu), groupe (suivi), origine (journal) }.
  function jouer(nom, { gain = 1, delai = 0, version = 1, fin = null, groupe = null, origine = 'menu' } = {}) {
    const s = sons.get(nom);
    const liste = tampons.get(nom);
    if (ferme || !s || !liste || vol.coupe || ctx.state !== 'running') {
      noter({ son: nom, joue: false, raison: !s ? 'inconnu' : !liste ? 'pas-pret' : vol.coupe ? 'coupe' : 'contexte', origine });
      return null;
    }
    const source = ctx.createBufferSource();
    source.buffer = liste[(Math.max(1, version) - 1) % liste.length];
    const g = ctx.createGain();
    g.gain.value = s.gain * gain;
    source.connect(g).connect(effets);
    const t = ctx.currentTime + Math.max(0, delai);
    source.start(t);
    const a = { source, gain: g, groupe: groupe ?? s.groupe, nom };
    actifs.add(a);
    source.onended = () => {
      actifs.delete(a);
      g.disconnect();
    };
    const arreter = (fondu = 0.08, quand = ctx.currentTime) => {
      try {
        g.gain.setValueAtTime(s.gain * gain, quand);
        g.gain.linearRampToValueAtTime(0, quand + fondu);
        source.stop(quand + fondu + 0.02);
      } catch { /* déjà arrêtée */ }
    };
    if (fin !== null && fin > delai) arreter(0.08, ctx.currentTime + fin);
    noter({ son: nom, joue: true, variante: choix[nom], gain: s.gain * gain, t, origine });
    return { arreter };
  }

  // ---------- musique ----------
  let em = etatMusiqueInitial();
  let lecteur = null;
  let lecteurEnCours = null;
  let partie = false;
  function appliquerVolumes() {
    const g = gainsVolumes(vol);
    effets.gain.value = g.effets;
    busMusique.gain.value = g.musique;
  }
  async function lecteurMusique() {
    if (lecteur) return lecteur;
    lecteurEnCours ??= Promise.all([import('./musique.js'), import('../../core/musique-menu.js')]).then(([m, c]) => {
      const brutV = reglagesMusique.variantes.find((x) => x.id === choix.musique) ?? reglagesMusique.variantes[0];
      const v = c.lireMusique(brutV);
      if (!v || ferme) return null;
      lecteur = m.creerMusique({ ctx, sortie: busMusique, variante: v, reglages: reglagesMusique });
      return lecteur;
    }).catch(() => null);
    return lecteurEnCours;
  }
  function appliquerMusique(avant) {
    const mode = em.mode;
    if (mode === avant) return;
    noter({ musique: mode, t: ctx.currentTime });
    if (mode === 'joue' || mode === 'baisse') {
      const cible = niveauMusique(mode, reglagesMusique.baisseOuverture);
      lecteurMusique().then((l) => {
        if (!l || em.mode !== mode) return;
        if (l.etat().enMarche) l.niveau(cible, reglagesMusique.fonduBaisse ?? 0.4);
        else l.demarrer(cible, l.etat().notes === 0 ? reglagesMusique.fonduEntree ?? 2.5 : 0.8);
      });
    } else if (mode === 'arret') lecteur?.arreter(0.2);
    else if (mode === 'fondu' && !partie) {
      // « JOUER » : fondu de sortie, puis tout est libéré (la partie garde ses propres sons).
      partie = true;
      const fondu = reglagesMusique.fonduJouer ?? 1.2;
      const l = lecteur;
      l?.niveau(0, fondu);
      setTimeout(() => {
        l?.liberer();
        if (lecteur === l) lecteur = null;
      }, fondu * 1000 + 100);
    }
  }
  function evenement(ev) {
    const avant = em.mode;
    em = avancerMusique(em, ev);
    appliquerMusique(avant);
    // Menu affiché : ses sons se calculent en arrière-plan (clic et commandes d'abord, signatures de rareté ensuite).
    if (ev === 'pret') preparer('menu').then(() => preparer('raretes'));
    // Page cachée : le contexte est suspendu après le fondu de la musique, repris au retour.
    if (ev === 'cachee') setTimeout(() => em.cachee && !ferme && ctx.suspend?.().catch(() => {}), 400);
    if (ev === 'visible' && !ferme) ctx.resume?.().catch(() => {});
  }

  // ---------- ouverture de caisses ----------
  // Suit le temps de l'ouverture (boucle d'images de js/menu/ouverture/ouverture.js) : suivre(t) joue les sons dont l'instant vient d'être
  // atteint, dans l'ordre de la chronologie ; un saut (« toucher l'écran », « Passer ») coupe les sons en cours et reprend au premier son
  // d'instant ≥ t ; arreter() coupe tout. Jamais de minuterie : seuls les instants de la chronologie comptent.
  function ouverture(chrono, reglages) {
    const liste = sonsOuverture(chrono, reglages);
    let i = 0;
    let dernier = 0;
    const tenus = []; // sons tenus (tapis, sang) : arrêtés à leur instant de fin
    return {
      sons: liste,
      suivre(t) {
        if (ferme) return;
        // Saut en avant de plus d'une demi-seconde (ou retour en arrière) : caisse passée.
        if (t < dernier || t - dernier > 0.5) {
          arreterGroupe('ouverture');
          tenus.length = 0;
          i = indiceSon(liste, t);
          noter({ ouverture: 'saut', t: ctx.currentTime, temps: t });
        }
        dernier = t;
        while (i < liste.length && liste[i].t <= t) {
          const e = liste[i];
          i += 1;
          const h = jouer(e.son, { gain: e.gain, version: (e.zombie ?? 0) + 1, groupe: 'ouverture', origine: 'ouverture' });
          if (h && e.fin !== null) tenus.push({ fin: e.fin, h });
        }
        for (let k = tenus.length - 1; k >= 0; k -= 1) {
          if (t >= tenus[k].fin) {
            tenus[k].h.arreter(0.08);
            tenus.splice(k, 1);
          }
        }
      },
      arreter() {
        arreterGroupe('ouverture');
        tenus.length = 0;
        i = liste.length;
      },
    };
  }

  // Faits déjà acquis avant le chargement du moteur.
  appliquerVolumes();
  const f = faits();
  for (const [cle, ev] of [['coupe', 'coupe'], ['cachee', 'cachee'], ['ouverture', 'ouverture'], ['geste', 'geste'], ['pret', 'pret'], ['partie', 'jouer']]) if (f[cle]) evenement(ev);

  return {
    preparer,
    liberer,
    jouer,
    evenement,
    ouverture,
    // Clic du menu : un seul à la fois, volume dégressif quand on touche vite (js/core/sons-menu.js).
    clic() {
      const r = admettreClic(clic, ctx.currentTime, catalogue.clic);
      clic = r.etat;
      if (!r.jouer) {
        noter({ son: 'clic', joue: false, raison: 'ecart', origine: 'clic' });
        return null;
      }
      return jouer('clic', { gain: r.gain, origine: 'clic' });
    },
    volumes(v) {
      vol = { ...v };
      appliquerVolumes();
    },
    fermer() {
      ferme = true;
      arreterGroupe(null);
      tampons.clear();
      lecteur?.liberer();
      lecteur = null;
      if (worker) worker.terminate();
      worker = false;
      effets.disconnect();
      busMusique.disconnect();
    },
    etat() {
      const octets = {};
      const parGroupe = {};
      for (const s of catalogue.sons) {
        const l = tampons.get(s.id);
        if (l) octets[s.groupe] = (octets[s.groupe] ?? 0) + l.reduce((n, b) => n + b.length * 4, 0);
      }
      for (const a of actifs) parGroupe[a.groupe] = (parGroupe[a.groupe] ?? 0) + 1;
      return {
        pretes: [...tampons.keys()], octets, actifs: parGroupe, calculMs: Math.round(calculMs), calculateur: worker ? 'arriere-plan' : worker === false ? 'sur-place' : 'aucun', choix: { ...choix },
        gains: { effets: effets.gain.value, musique: busMusique.gain.value },
        musique: { mode: em.mode, lecteur: lecteur?.etat() ?? null }, journal: journal.map((e) => ({ ...e })),
      };
    },
  };
}
