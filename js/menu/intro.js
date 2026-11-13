// Lot 8g : écran d'introduction E0 (Docs/ref/menu-principal.md, « Lot 8g ») : au vrai lancement en mode menu, fond noir et logo animé de No Way Studio
// au centre (assets/studio/, fourni par le propriétaire), puis fondu ; demarrage.js crée alors l'écran de chargement E7, qui charge le menu (retour du
// propriétaire : rien ne se charge pendant le logo). Chargé par demarrage.js seulement quand l'introduction se joue (introAuDemarrage,
// js/core/graphics.js : jamais en partie directe, ni au retour d'une partie, ni sous ?test=1 sans ?intro=1).
// Retour du propriétaire : son du logo (assets/studio/no-way-studio-logo-son.mp3, fourni par lui) joué avec l'animation, nouveau logo calé sur ce son.
// Les navigateurs (Safari surtout) refusent tout son avant un geste, et le jeu n'en joue aucun avant (CLAUDE.md) : écran « Toucher pour commencer »
// (fond noir, texte au milieu, sans logo : retour du propriétaire) ; au toucher ou à une touche, le logo animé et le son partent ensemble. Sans geste
// pendant 4 s, le logo se joue sans son.
// - Pendant le logo, un appui (n'importe où) ou une touche passe l'introduction (le son s'éteint en fondu) ; « Toucher pour passer » (bouton, 44 px)
//   apparaît au bout d'une seconde. Durée : celle du son (6,5 s, l'animation finit à 5,7 s).
// - prefers-reduced-motion : copie fixe du logo (son état final) pendant 1 s, sans geste, sans son, sans fondu.
// - Annoncée aux lecteurs d'écran (« No Way Studio » : nom de l'image et zone d'annonce). Animations « e0-* » (css/menu.css).
import { loadDict } from '../game/texts.js';
import { adresseStudio } from './chargement.js';

export const LOGO_ANIME = 'assets/studio/no-way-studio-logo-anime.svg';
export const LOGO_FIXE = 'assets/studio/no-way-studio-logo-fixe.svg';
export const SON = 'assets/studio/no-way-studio-logo-son.mp3';
export const DUREE_MS = 6500; // son du logo : 6,8 s dont 0,5 s de silence final ; animation finie à 5,7 s
export const REDUIT_MS = 1000; // mouvement réduit : logo fixe pendant 1 s
export const GESTE_MS = 4000; // sans geste : le logo se joue sans son au bout de 4 s
export const INDICE_MS = 1000; // « Toucher pour passer » au bout d'une seconde
export const FONDU_MS = 400;
export const FONDU_SON_S = 0.3;
const FILET_MS = 9000; // logo qui ne se charge pas (fichier absent, réseau lent) : l'introduction ne bloque jamais plus longtemps après son départ
const MODIFICATEURS = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];

function el(tag, classes, attrs = {}) {
  const n = document.createElement(tag);
  n.className = classes;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// Joue l'introduction. Renvoie { fin (promesse : début du fondu, ou fin immédiate), passer(), etat() }.
export function jouerIntro({ root = document.body, reduit = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const t0 = performance.now();
  const temps = { geste: null, affiche: null, sonDebut: null, fin: null, retire: null };
  // geste (attente du toucher) → attente (logo en chargement) → joue → sortie (fondu) → finie
  let phase = reduit ? 'attente' : 'geste';
  let passe = false;
  let son = reduit ? 'aucun' : 'charge'; // aucun · charge · pret · joue · eteint · muet (sans geste) · echec
  let resoudre = null;
  const fin = new Promise((r) => {
    resoudre = r;
  });
  const minuteries = [];
  const plus = (fn, ms) => minuteries.push(setTimeout(fn, ms));
  const maintenant = () => performance.now() - t0;

  const box = el('div', 'e0', { id: 'e0', 'data-block': 'E0' });
  if (reduit) box.classList.add('e0-reduit');
  else box.classList.add('e0-geste');
  const logo = el('img', 'e0-logo', { id: 'e0-logo', alt: '', width: '824', height: '628', decoding: 'async' });
  // Retour du propriétaire (iPhone) : logo caché jusqu'à son affichage (image lue et décodée). Montrée sans adresse, l'image laissait voir à Safari un
  // rectangle vide (cadre du texte de remplacement) une fraction de seconde après « Toucher pour commencer ».
  logo.hidden = true;
  const commencer = el('button', 'e0-commencer', { type: 'button', id: 'e0-commencer' });
  commencer.hidden = reduit;
  const indice = el('button', 'e0-passer', { type: 'button', id: 'e0-passer' });
  const annonce = el('p', 'sr-only', { id: 'e0-annonce', 'aria-live': 'polite' });
  box.append(logo, commencer, indice, annonce);
  root.append(box);

  loadDict().then((d) => {
    const nom = d['game.menu.studio.nom'] ?? '';
    logo.alt = nom;
    commencer.textContent = d['game.menu.intro.commencer'] ?? '';
    indice.textContent = d['game.menu.intro.passer'] ?? '';
    annonce.textContent = nom; // annoncé une fois la zone en place
  }).catch(() => {});

  // Son : fichier lu pendant l'attente du geste (aucun son ni contexte audio avant) ; contexte audio créé dans le geste, puis décodage.
  let ctx = null;
  let gain = null;
  let source = null;
  let tampon = null;
  const donneesSon = reduit ? null : fetch(SON).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${SON} : ${r.status}`)))).catch(() => null);
  function eteindre() {
    if (!ctx || !gain) return;
    const c = ctx;
    try {
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.linearRampToValueAtTime(0, c.currentTime + FONDU_SON_S);
    } catch {
      // contexte déjà fermé
    }
    if (son === 'joue') son = 'eteint';
    setTimeout(() => c.close().catch(() => {}), FONDU_SON_S * 1000 + 100);
    ctx = null;
  }
  function jouerSon() {
    if (!ctx || !tampon || phase !== 'joue') return;
    try {
      source = ctx.createBufferSource();
      source.buffer = tampon;
      gain = ctx.createGain();
      source.connect(gain).connect(ctx.destination);
      source.start();
      son = 'joue';
      temps.sonDebut = maintenant();
    } catch {
      son = 'echec';
    }
  }

  function terminer() {
    if (phase === 'sortie' || phase === 'finie') return;
    for (const m of minuteries.splice(0)) clearTimeout(m);
    document.removeEventListener('keydown', touche, true);
    box.removeEventListener('pointerdown', appui);
    phase = 'sortie';
    temps.fin = maintenant();
    eteindre();
    resoudre();
    const retirer = () => {
      if (phase === 'finie') return;
      phase = 'finie';
      temps.retire = maintenant();
      box.remove();
    };
    if (reduit) retirer();
    else {
      box.classList.add('e0-sortie');
      box.addEventListener('animationend', (e) => {
        if (e.target === box) retirer();
      });
      setTimeout(retirer, FONDU_MS + 200);
    }
  }

  // Départ du logo animé (avec le son si le geste a eu lieu et que le son est prêt).
  function demarrer() {
    if (phase !== 'geste') return;
    for (const m of minuteries.splice(0)) clearTimeout(m);
    phase = 'attente';
    box.classList.remove('e0-geste');
    commencer.hidden = true;
    plus(terminer, FILET_MS);
    adresseStudio(LOGO_ANIME).then((a) => {
      logo.src = a;
    }, terminer);
  }
  // Geste : contexte audio créé et repris dans le geste même (exigence de Safari), puis décodage du son et départ du logo.
  function geste() {
    if (phase !== 'geste') return;
    temps.geste = maintenant();
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      ctx = AC ? new AC() : null;
      ctx?.resume?.().catch(() => {});
    } catch {
      ctx = null;
    }
    if (!ctx) {
      son = 'echec';
      demarrer();
      return;
    }
    const c = ctx;
    Promise.resolve(donneesSon).then((buf) => (buf ? c.decodeAudioData(buf) : Promise.reject(new Error('son absent')))).then((t) => {
      tampon = t;
      if (son === 'charge') son = 'pret';
    }, () => {
      son = 'echec';
    }).finally(demarrer);
  }

  function passer() {
    if (phase === 'sortie' || phase === 'finie') return;
    passe = true;
    terminer();
  }
  const appui = (e) => {
    e.preventDefault(); // l'appui ne traverse pas vers l'écran de chargement ni le menu
    if (phase === 'geste') geste();
    else if (phase === 'joue') passer();
  };
  const touche = (e) => {
    if (MODIFICATEURS.includes(e.code)) return;
    e.preventDefault();
    e.stopPropagation();
    if (phase === 'geste') geste();
    else if (phase === 'joue') passer();
  };
  box.addEventListener('pointerdown', appui);
  indice.addEventListener('click', passer);
  document.addEventListener('keydown', touche, true);

  // Le compte à rebours part quand le logo animé est affiché (son animation commence à ce moment-là) ; le son part au même instant.
  const affiche = () => {
    if (phase !== 'attente') return;
    phase = 'joue';
    logo.hidden = false;
    temps.affiche = maintenant();
    box.classList.add('e0-joue');
    jouerSon();
    for (const m of minuteries.splice(0)) clearTimeout(m);
    plus(terminer, reduit ? REDUIT_MS : DUREE_MS);
    if (!reduit) plus(() => box.classList.add('e0-indice'), INDICE_MS);
  };
  logo.addEventListener('error', terminer);
  // Image lue : décodée avant d'être montrée (aucune image à moitié peinte), puis affichée avec le son.
  logo.addEventListener('load', () => {
    const decodee = typeof logo.decode === 'function' ? logo.decode().catch(() => {}) : Promise.resolve();
    decodee.then(() => {
      if (phase === 'attente') affiche();
    });
  }, { once: true });
  if (reduit) {
    box.classList.add('e0-indice');
    plus(terminer, FILET_MS);
    adresseStudio(LOGO_FIXE).then((a) => {
      logo.src = a;
    }, terminer);
  } else {
    // Attente du geste (retour du propriétaire : sans logo, texte au milieu de l'écran) ; sans geste, départ sans son.
    plus(() => {
      if (phase !== 'geste') return;
      son = 'muet';
      demarrer();
    }, GESTE_MS);
  }

  return {
    fin,
    passer,
    etat: () => ({ phase, passe, reduit, son, logo: phase === 'geste' ? null : reduit ? LOGO_FIXE : LOGO_ANIME, indice: box.classList.contains('e0-indice'), visible: box.isConnected, debut: t0, ...temps }),
  };
}
