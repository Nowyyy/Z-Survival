// Retour du propriétaire : « tous les éléments qui défilent (Boutique vers le bas, choix des cartes de l'Infini…) doivent pouvoir glisser à la
// souris, comme un doigt ». Souris seulement (le toucher et le stylet gardent le défilement du navigateur) : bouton gauche enfoncé sur une zone
// qui défile, le contenu suit la souris au-delà de 6 px (le clic est alors annulé : on ne déclenche pas le bouton sous le curseur), puis il
// continue sur son élan et ralentit ; l'aimantation (scroll-snap) est suspendue pendant le geste et rendue à la fin. Les curseurs, champs de
// saisie et listes déroulantes gardent leur comportement. Mouvement réduit : pas d'élan.

const SEUIL = 6; // px avant que le geste devienne un glissement
const FROTTEMENT = 0.92; // par image de 16 ms
const ELAN_MIN = 0.05; // px/ms
// Appuis déjà pris par une racine plus proche (racines imbriquées).
const deja = new WeakSet();
const EXCLUS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-sans-glisser]';

function defile(n, axe) {
  const st = getComputedStyle(n);
  const o = axe === 'x' ? st.overflowX : st.overflowY;
  if (o !== 'auto' && o !== 'scroll') return false;
  return axe === 'x' ? n.scrollWidth > n.clientWidth + 1 : n.scrollHeight > n.clientHeight + 1;
}

// Plus proche ancêtre (jusqu'à racine comprise) qui défile sur au moins un axe : { el, x, y } ou null.
export function zoneDefilante(cible, racine) {
  for (let n = cible; n && n.nodeType === 1; n = n.parentElement) {
    const x = defile(n, 'x');
    const y = defile(n, 'y');
    if (x || y) return { el: n, x, y };
    if (n === racine) break;
  }
  return null;
}

// Installe le glissement à la souris sur racine (une fois par racine). Renvoie une fonction qui le retire.
export function activerGlisser(racine, { fenetre = window } = {}) {
  if (racine.__zsGlisser) return racine.__zsGlisser;
  const reduit = fenetre.matchMedia?.('(prefers-reduced-motion: reduce)');
  let g = null;
  let elan = 0;

  const arreterElan = () => {
    if (elan) fenetre.cancelAnimationFrame(elan);
    elan = 0;
  };
  const rendreAimantation = (z) => {
    z.el.style.scrollSnapType = z.snap;
    z.el.style.scrollBehavior = z.comportement;
  };
  // Clic qui suit un glissement : annulé (une seule fois, dans la même tâche que le relâchement).
  const annulerClic = () => {
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    fenetre.addEventListener('click', stop, { capture: true, once: true });
    fenetre.setTimeout(() => fenetre.removeEventListener('click', stop, { capture: true }), 0);
  };

  const bas = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || deja.has(e)) return;
    if (e.target.closest?.(EXCLUS)) return;
    const z = zoneDefilante(e.target, racine);
    if (!z) return;
    deja.add(e); // racines imbriquées (menu dans la page) : un seul geste par appui
    arreterElan();
    g = { ...z, id: e.pointerId, x0: e.clientX, y0: e.clientY, sl: z.el.scrollLeft, st: z.el.scrollTop, actif: false, snap: '', comportement: '', vx: 0, vy: 0, tx: e.clientX, ty: e.clientY, tt: e.timeStamp };
  };
  const bouge = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.actif) {
      if (Math.hypot(g.x ? dx : 0, g.y ? dy : 0) < SEUIL) return;
      g.actif = true;
      g.snap = g.el.style.scrollSnapType;
      g.comportement = g.el.style.scrollBehavior;
      g.el.style.scrollSnapType = 'none';
      g.el.style.scrollBehavior = 'auto';
      racine.classList.add('zs-glisse');
      fenetre.getSelection?.()?.removeAllRanges();
    }
    if (g.x) g.el.scrollLeft = g.sl - dx;
    if (g.y) g.el.scrollTop = g.st - dy;
    // Vitesse lissée (px/ms) pour l'élan.
    const dt = Math.max(1, e.timeStamp - g.tt);
    g.vx = 0.7 * ((g.tx - e.clientX) / dt) + 0.3 * g.vx;
    g.vy = 0.7 * ((g.ty - e.clientY) / dt) + 0.3 * g.vy;
    g.tx = e.clientX;
    g.ty = e.clientY;
    g.tt = e.timeStamp;
    e.preventDefault();
  };
  const haut = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const z = g;
    g = null;
    if (!z.actif) return;
    racine.classList.remove('zs-glisse');
    annulerClic();
    // Élan : la vitesse décroît à chaque image ; immobile depuis plus de 80 ms : aucun élan.
    let vx = z.x ? z.vx : 0;
    let vy = z.y ? z.vy : 0;
    if (e.timeStamp - z.tt > 80 || reduit?.matches) vx = vy = 0;
    let t0 = performance.now();
    const pas = (t) => {
      const dt = Math.min(48, t - t0);
      t0 = t;
      z.el.scrollLeft += vx * dt;
      z.el.scrollTop += vy * dt;
      const f = FROTTEMENT ** (dt / 16);
      vx *= f;
      vy *= f;
      if (Math.abs(vx) > ELAN_MIN || Math.abs(vy) > ELAN_MIN) elan = fenetre.requestAnimationFrame(pas);
      else {
        elan = 0;
        rendreAimantation(z);
      }
    };
    if (Math.abs(vx) > ELAN_MIN || Math.abs(vy) > ELAN_MIN) elan = fenetre.requestAnimationFrame(pas);
    else rendreAimantation(z);
  };
  const annule = (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (g.actif) {
      racine.classList.remove('zs-glisse');
      rendreAimantation(g);
    }
    g = null;
  };
  // Pas de glisser-déposer natif (images, liens) pendant un geste à la souris dans une zone qui défile.
  const glisserNatif = (e) => {
    if (zoneDefilante(e.target, racine)) e.preventDefault();
  };

  racine.addEventListener('pointerdown', bas);
  racine.addEventListener('dragstart', glisserNatif);
  fenetre.addEventListener('pointermove', bouge, { passive: false });
  fenetre.addEventListener('pointerup', haut);
  fenetre.addEventListener('pointercancel', annule);
  const retirer = () => {
    arreterElan();
    racine.removeEventListener('pointerdown', bas);
    racine.removeEventListener('dragstart', glisserNatif);
    fenetre.removeEventListener('pointermove', bouge);
    fenetre.removeEventListener('pointerup', haut);
    fenetre.removeEventListener('pointercancel', annule);
    delete racine.__zsGlisser;
  };
  racine.__zsGlisser = retirer;
  return retirer;
}
