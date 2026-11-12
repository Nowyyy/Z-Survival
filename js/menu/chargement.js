// Lot 8a : écran de chargement E7 (mode menu ; Docs/ref/menu-principal.md), en deux phases.
// - « menu » (démarrage) : seul le menu se charge (modules du menu, textes, nouveautés, liens, solde de la sauvegarde, polices). Décor de nuit dessiné
//   en code (ciel, lune, bâtiment et deux fenêtres éclairées, brume lente), titre « Z-Survival » : « -Survival » affiché, puis le Z tombe une seule
//   fois (chute, rebond, bascule à droite, ~13°), secousse, tiret écrasé, quatre nuages de poussière, trois coulures. Quand tout est prêt et la chute
//   finie : menu E8 (js/menu/menu.js), puis cet écran est retiré.
// - « jeu » (après « JOUER ») : le même écran, chute du Z rejouée ; le jeu se charge (modules dont Three.js, données, textures, sons, création du
//   jeu : progression envoyée par main.js, qui attend la fin de la chute avant de créer la partie) ; à 100 %, l'écran est retiré et la partie apparaît.
// Les deux : barre et pourcentage réels (js/core/menu-etat.js), astuce (data/menu/astuces.json), version (build-info.json). Sous
// prefers-reduced-motion : Z posé, sans chute ni secousse. Animations « e7-* » (css/menu.css).
// Lot 8g : logo du studio en petit en bas à gauche (copie fixe, assets/studio/) dans les deux phases. Après l'introduction du studio, demarrage.js crée
// cet écran à la fin du logo (retour du propriétaire) : chargement complet, chute du Z comprise.
import { avancer, choisirAstuce, creerProgression, MODULES_ATTENDUS, pourcentage, texteVersion } from '../core/menu-etat.js';
import { fmt, loadDict } from '../game/texts.js';
import { CANAUX_DEBUG } from '../core/graphics.js';
import { pageCanal } from '../game/graphics-boot.js';
import { couluresSvg } from '../logo.js';

const SVG = 'http://www.w3.org/2000/svg';
const FIN_CHUTE_MS = 4000; // filet de sécurité si la fin d'animation n'arrive pas (onglet caché) : la chute dure 2,8 s
const POLICES_MS = 3000; // attente maximale des polices du menu
export const LOGO_STUDIO_FIXE = 'assets/studio/no-way-studio-logo-fixe.svg'; // lot 8g : copie fixe du logo (scripts/studio/logo-fixe.mjs)

// Lot 8g : adresse d'affichage d'un fichier du logo du studio : son texte lu une fois (fetch, même origine), puis une adresse data: de type
// image/svg+xml (aucune requête de plus). Le type ne dépend ainsi pas du serveur (le serveur local des tests sert les .svg sans type d'image).
const adressesStudio = new Map();
const enData = (texte) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texte)}`;
export function adresseStudio(chemin) {
  if (!adressesStudio.has(chemin)) {
    adressesStudio.set(chemin, fetch(chemin).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${chemin} : ${r.status}`)))).then(enData));
  }
  return adressesStudio.get(chemin);
}

function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// Décor (vue 932 × 430, ancré en bas) : ciel par dégradé CSS, lune et halo, bâtiment à toit plat avec cheminée, deux fenêtres éclairées.
// Lot 8b : écran de chargement seulement (l'onglet Jouer a sa propre scène, js/menu/jouer.js).
export function decorNuit(classe = 'e7-decor') {
  const svg = svgEl('svg', { class: classe, viewBox: '0 0 932 430', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('circle', { class: 'menu-lune-halo', cx: '770', cy: '86', r: '50' }),
    svgEl('circle', { class: 'menu-lune', cx: '770', cy: '86', r: '26' }),
    svgEl('path', { class: 'menu-batiment', d: 'M0 430V372h70v-20h40v20h120V318h22v-16h20v16h200v-24h26v24h152v54h86v-30h60v30h160v58z' }),
    svgEl('rect', { class: 'menu-fenetre', x: '300', y: '336', width: '20', height: '24' }),
    svgEl('rect', { class: 'menu-fenetre', x: '560', y: '340', width: '20', height: '24' }),
  );
  return svg;
}

function graine(search, phase) {
  const q = new URLSearchParams(search);
  const base = q.get('test') === '1' ? Number.parseInt(q.get('seed') ?? '1', 10) || 1 : Date.now() % 2147483647; // tests : astuce fixe
  return phase === 'jeu' ? base + 1 : base; // une autre astuce pendant le chargement du jeu
}

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// phase : 'menu' ou 'jeu' ; jouer(option) : appelé par « JOUER » du menu (demarrage.js charge alors le jeu ; lot 8b : option de démarrage).
// son : { lire(), poser(réglages) } (lot 8c : son et volume des Options du menu, gardés en mémoire par demarrage.js), transmis au menu.
export function creerChargement({ phase = 'menu', jouer = () => {}, son = null, root = document.body, search = globalThis.location?.search ?? '' } = {}) {
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pose = reduit; // retour du propriétaire : la chute du Z se rejoue à chaque chargement (menu, partie, retour au menu)
  let etat = creerProgression(phase);
  const journal = []; // pourcentages affichés, dans l'ordre (tests : __zsMenu.etat().journal)
  let donnees = null; // phase menu : { dict, infos, liens, solde }
  let menu = null;
  let chuteFinie = pose;
  let sortie = false;
  let dict = {};
  const t = (k) => dict[k] ?? '';

  const box = el('div', ['e7', `e7-phase-${phase}`], { 'data-block': 'E7', id: 'e7' });
  const scene = el('div', ['e7-scene'], { 'aria-hidden': 'true' });
  scene.append(decorNuit(), el('div', ['e7-brume', 'e7-brume-1']), el('div', ['e7-brume', 'e7-brume-2']));
  const centre = el('div', ['e7-centre']);
  const titre = el('h1', ['e7-titre'], { id: 'e7-titre' });
  const z = el('span', ['e7-z'], { id: 'e7-z' });
  z.textContent = 'Z';
  const tiret = el('span', ['e7-tiret']);
  tiret.textContent = '-';
  const reste = el('span', ['e7-reste']);
  reste.textContent = 'Survival';
  const impact = el('span', ['e7-impact'], { 'aria-hidden': 'true' });
  for (const sens of ['g1', 'g2', 'd1', 'd2']) impact.append(el('span', ['e7-poussiere', `e7-poussiere-${sens}`]));
  const coulures = el('span', ['e7-coulures'], { 'aria-hidden': 'true' });
  coulures.append(couluresSvg());
  z.append(coulures);
  titre.append(z, tiret, reste, impact);
  const barre = el('div', ['e7-barre'], { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', id: 'e7-barre' });
  const remplissage = el('div', ['e7-remplissage']);
  barre.append(remplissage);
  const ligne = el('p', ['e7-etat']);
  const etatTexte = el('span', [], { id: 'e7-texte' });
  const pourcent = el('span', ['e7-pourcent'], { id: 'e7-pourcent' });
  ligne.append(etatTexte, document.createTextNode(' '), pourcent);
  const astuce = el('p', ['e7-astuce'], { id: 'e7-astuce' });
  astuce.hidden = true;
  const erreur = el('p', ['e7-erreur'], { role: 'alert', id: 'e7-erreur' });
  erreur.hidden = true;
  centre.append(titre, barre, ligne, astuce, erreur);
  const version = el('p', ['e7-version'], { id: 'e7-version' });
  // Lot 8g : logo du studio (copie fixe), nom accessible posé avec les textes.
  const studio = el('img', ['e7-studio'], { id: 'e7-studio', alt: '', width: '792', height: '556', decoding: 'async' });
  adresseStudio(LOGO_STUDIO_FIXE).then((a) => {
    studio.src = a;
  }, () => studio.remove());
  const annonce = el('p', ['sr-only'], { 'aria-live': 'polite', id: 'e7-annonce' });
  box.append(scene, centre, studio, version, annonce, el('div', ['menu-grain'], { 'aria-hidden': 'true' }));
  if (pose) box.classList.add('e7-pose');
  root.append(box);
  document.getElementById('boot')?.remove();

  let annonce25 = -1;
  function afficher() {
    const n = pourcentage(etat);
    if (journal[journal.length - 1] !== n) journal.push(n);
    remplissage.style.transform = `scaleX(${n / 100})`;
    barre.setAttribute('aria-valuenow', String(n));
    pourcent.textContent = fmt(t('game.menu.chargement.pourcent'), { n });
    const palier = Math.floor(n / 25);
    if (palier !== annonce25 && dict['game.menu.chargement.annonce']) {
      annonce25 = palier;
      annonce.textContent = n >= 100 ? t('game.menu.chargement.pret') : fmt(t('game.menu.chargement.annonce'), { n: palier * 25 });
    }
  }

  afficher(); // 0 %
  // Textes (dictionnaire partagé avec boot.js, le menu et main.js), astuce et version : posés dès qu'ils arrivent.
  const textes = loadDict().catch(() => ({}));
  textes.then((d) => {
    dict = d;
    titre.setAttribute('aria-label', 'Z-Survival');
    studio.alt = t('game.menu.studio.nom');
    barre.setAttribute('aria-label', t(phase === 'jeu' ? 'game.menu.chargement.jeu' : 'game.menu.chargement.aria'));
    etatTexte.textContent = t(phase === 'jeu' ? 'game.menu.chargement.texteJeu' : 'game.menu.chargement.texte');
    afficher();
  });
  Promise.all([json('data/menu/astuces.json'), textes]).then(([data]) => {
    const texte = choisirAstuce(data?.astuces, graine(search, phase));
    if (!texte) return;
    astuce.replaceChildren(Object.assign(el('span', ['e7-astuce-libelle']), { textContent: t('game.menu.astuce') }), document.createTextNode(` ${texte}`));
    astuce.hidden = false;
  });
  // build-info.json n'est écrit avec certitude que sur source (dépôt), dev et release (assembleur) : ailleurs, aucune requête (ni erreur 404).
  const info = CANAUX_DEBUG.includes(pageCanal()) ? json('build-info.json') : Promise.resolve(null);
  Promise.all([info, textes]).then(([build]) => {
    const v = texteVersion(build);
    if (v && dict[v.cle]) version.textContent = fmt(dict[v.cle], v.params);
  });

  // Erreur pendant le chargement : message de l'écran de préparation (game.loading.error) et détail, au lieu de rester bloqué.
  const surErreur = (detail) => {
    if (sortie) return;
    erreur.textContent = `${t('game.loading.error')} ${String(detail ?? '').slice(0, 300)}`.trim();
    erreur.hidden = false;
  };
  const onError = (e) => surErreur(e.target?.tagName === 'SCRIPT' ? e.target.src : e.message);
  const onRejet = (e) => surErreur(e.reason?.message ?? e.reason);
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejet);
  const retirer = () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejet);
  };

  function progres(etape, fraction) {
    etat = avancer(etat, etape, fraction);
    afficher();
    passer();
  }

  // Phase « jeu » : fichiers JavaScript du jeu reçus depuis « JOUER » (entrées de minutage des ressources) ; main.js termine l'étape « modules ».
  if (phase === 'jeu') {
    try {
      const debut = performance.now();
      const deja = performance.getEntriesByType('resource').filter((e) => /\.js(\?|$)/.test(e.name)).length;
      const vus = new Set();
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.startTime >= debut && /\.js(\?|$)/.test(e.name)) vus.add(e.name);
        progres('modules', vus.size / Math.max(1, MODULES_ATTENDUS - deja));
      }).observe({ type: 'resource' });
    } catch {
      // minutage des ressources indisponible : l'étape avance seulement quand main.js commence
    }
  }

  // Phase « menu » : modules du menu, données (textes, nouveautés, liens, solde), polices. La chute du Z (une fois) ne dépend pas de la progression.
  const menuModule = phase === 'menu' ? import('./menu.js') : null;
  if (phase === 'menu') {
    progres('modules', 0.5); // l'écran de chargement et l'état du menu sont là ; le module du menu suit
    menuModule.then((m) => {
      progres('modules', 1);
      return m.preparerMenu({ onProgress: (f) => progres('donnees', f) });
    }).then((d) => {
      donnees = d;
      progres('donnees', 1);
    }).catch((e) => surErreur(e?.message ?? e));
    const polices = document.fonts?.load
      ? Promise.all(['1em "Rubik Wet Paint"', '1em "Barlow"', '700 1em "Barlow"', '1em "Rubik Dirt"'].map((f) => document.fonts.load(f).catch(() => {})))
      : Promise.resolve();
    Promise.race([polices, new Promise((r) => setTimeout(r, POLICES_MS))]).then(() => progres('polices', 1));
  }
  let chuteResolue = null;
  const chute = new Promise((resolve) => {
    chuteResolue = resolve;
  });
  if (chuteFinie) chuteResolue();
  const finChute = () => {
    if (chuteFinie) return;
    chuteFinie = true;
    chuteResolue();
    passer();
  };
  // Retour du propriétaire : la chute part dès l'apparition de l'écran, indépendante de la progression ; le Z attend ensuite, posé, la fin du
  // chargement (la police du titre est préchargée par demarrage.js : sans elle, le Z garde la police de secours).
  if (!pose) {
    box.classList.add('e7-joue');
    setTimeout(finChute, FIN_CHUTE_MS);
    coulures.querySelector('.logo-coulure-3').addEventListener('animationend', finChute, { once: true }); // la dernière goutte
  }

  // Fin : phase « menu », menu E8 (chargement fini et chute finie) ; phase « jeu », la partie est créée (main.js) : l'écran est retiré.
  function passer() {
    if (sortie || !chuteFinie || !etat.pret) return;
    if (phase === 'jeu') {
      sortie = true;
      retirer();
      box.remove();
      return;
    }
    if (!donnees) return;
    sortie = true;
    menuModule.then((m) => {
      document.getElementById('loading')?.setAttribute('hidden', ''); // écran de préparation d'avant : il ne doit jamais couvrir le menu
      menu = m.creerMenu({
        ...donnees,
        root,
        son,
        jouer: (option) => {
          menu.element.remove();
          jouer(option); // lot 8b : option de démarrage (mode histoire ou infini)
        },
      });
      retirer();
      if (reduit) box.remove();
      else {
        box.classList.add('e7-sortie');
        box.addEventListener('animationend', () => box.remove(), { once: true });
        setTimeout(() => box.remove(), 600);
      }
    }).catch((e) => {
      sortie = false;
      surErreur(e?.message ?? e);
    });
  }

  afficher();
  return {
    progres,
    chute, // promesse : la chute du Z est finie (main.js attend avant de créer la partie, phase « jeu »)
    etat: () => ({ phase, pourcentage: pourcentage(etat), pret: etat.pret, chuteFinie, journal: [...journal], visible: box.isConnected, menu: menu?.element.isConnected ? menu.etat() : null }),
  };
}
