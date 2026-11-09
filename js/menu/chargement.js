// Lot 8a : écran de chargement E7 (mode menu ; Docs/ref/menu-principal.md). Décor de nuit dessiné en code (ciel, lune, bâtiment et deux fenêtres
// éclairées, brume lente), titre « Z-Survival » : « -Survival » affiché, puis le Z tombe une seule fois (chute, rebond, bascule à droite, ~13°),
// secousse, tiret écrasé, quatre nuages de poussière, trois coulures ; barre et pourcentage réels (js/core/menu-etat.js), astuce de
// data/menu/astuces.json, version de build-info.json. Sous prefers-reduced-motion : Z posé, sans chute ni secousse. Animations « e7-* » (css/menu.css).
// Quand le jeu est prêt et la chute finie : menu E8 (js/menu/menu.js), puis cet écran est retiré.
import { avancer, choisirAstuce, creerProgression, MODULES_ATTENDUS, pourcentage, texteVersion } from '../core/menu-etat.js';
import { fmt, loadDict } from '../game/texts.js';
import { CANAUX_DEBUG } from '../core/graphics.js';
import { pageCanal } from '../game/graphics-boot.js';

const SVG = 'http://www.w3.org/2000/svg';
const FIN_CHUTE_MS = 4000; // filet de sécurité si la fin d'animation n'arrive pas (onglet caché) : la chute dure 2,8 s

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

function graine(search) {
  const q = new URLSearchParams(search);
  if (q.get('test') === '1') return Number.parseInt(q.get('seed') ?? '1', 10) || 1; // tests : astuce fixe
  return Date.now() % 2147483647;
}

export function creerChargement({ root = document.body, search = globalThis.location?.search ?? '' } = {}) {
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let etat = creerProgression();
  const journal = []; // pourcentages affichés, dans l'ordre (tests : getMenu().chargement)
  let api = null;
  let menu = null;
  let chuteFinie = reduit;
  let sortie = false;
  let dict = {};
  const t = (k) => dict[k] ?? '';

  const box = el('div', ['e7'], { 'data-block': 'E7', id: 'e7' });
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
  for (const n of [1, 2, 3]) coulures.append(el('span', ['e7-coulure', `e7-coulure-${n}`]));
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
  const annonce = el('p', ['sr-only'], { 'aria-live': 'polite', id: 'e7-annonce' });
  box.append(scene, centre, version, annonce, el('div', ['menu-grain'], { 'aria-hidden': 'true' }));
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

  // Textes (dictionnaire partagé avec boot.js et main.js), astuce et version : posés dès qu'ils arrivent.
  loadDict().then((d) => {
    dict = d;
    titre.setAttribute('aria-label', 'Z-Survival');
    barre.setAttribute('aria-label', t('game.menu.chargement.aria'));
    etatTexte.textContent = t('game.menu.chargement.texte');
    afficher();
  }).catch(() => {});
  const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([json('data/menu/astuces.json'), loadDict().catch(() => ({}))]).then(([data]) => {
    const texte = choisirAstuce(data?.astuces, graine(search));
    if (!texte) return;
    astuce.replaceChildren(Object.assign(el('span', ['e7-astuce-libelle']), { textContent: t('game.menu.astuce') }), document.createTextNode(` ${texte}`));
    astuce.hidden = false;
  });
  // build-info.json n'est écrit avec certitude que sur source (dépôt), dev et release (assembleur) : ailleurs, aucune requête (ni erreur 404).
  const info = CANAUX_DEBUG.includes(pageCanal()) ? json('build-info.json') : Promise.resolve(null);
  Promise.all([info, loadDict().catch(() => ({}))]).then(([build]) => {
    const v = texteVersion(build);
    if (v && dict[v.cle]) version.textContent = fmt(dict[v.cle], v.params);
  });

  // Modules : un fichier JavaScript reçu à la fois (entrées de minutage des ressources), jusqu'à MODULES_ATTENDUS ; main.js termine l'étape.
  try {
    const vus = new Set();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (/\.js(\?|$)/.test(e.name)) vus.add(e.name);
      progres('modules', vus.size / MODULES_ATTENDUS);
    }).observe({ type: 'resource', buffered: true });
  } catch {
    // minutage des ressources indisponible : l'étape avance seulement quand main.js commence
  }

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

  // Chute du Z : lancée une fois la police du titre prête (au plus 1,5 s d'attente), une seule fois ; fin à la dernière coulure.
  const menuModule = import('./menu.js');
  const finChute = () => {
    if (chuteFinie) return;
    chuteFinie = true;
    passer();
  };
  if (!reduit) {
    const police = document.fonts?.load ? document.fonts.load('1em "Rubik Wet Paint"').catch(() => {}) : Promise.resolve();
    Promise.race([police, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      box.classList.add('e7-joue');
      setTimeout(finChute, FIN_CHUTE_MS);
    });
    coulures.lastElementChild.addEventListener('animationend', finChute, { once: true });
  } else {
    box.classList.add('e7-pose');
  }

  function passer() {
    if (sortie || !chuteFinie || !api || !etat.pret) return;
    sortie = true;
    menuModule.then((m) => {
      menu = m.creerMenu({ ...api, root });
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejet);
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

  function progres(etape, fraction) {
    etat = avancer(etat, etape, fraction);
    afficher();
    passer();
  }

  afficher();
  return {
    progres,
    // Jeu prêt : la compilation est faite ; le menu s'ouvre à la fin de la chute.
    pret(a) {
      api = a;
      progres('compilation', 1);
    },
    etat: () => ({ pourcentage: pourcentage(etat), pret: etat.pret, chuteFinie, journal: [...journal], visible: box.isConnected, menu: menu?.etat?.() ?? null }),
  };
}
