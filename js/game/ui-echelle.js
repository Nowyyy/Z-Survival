// Lot 8j : facteur d'échelle de l'interface de la partie (HUD, pause, fin, Options en partie, débogage, message des portes). Une seule
// variable CSS, --ui-k, posée sur la racine : 1 jusqu'à 1080 px de haut, puis hauteur / 1080 (≈ 1,33 à 1440 px), plafonnée à 2.
// Les feuilles (css/game-ui.css) multiplient leurs tailles par ce facteur : ni zoom ni transform, le texte reste net et les zones de toucher
// suivent. Le rendu 3D ne la lit jamais. Le menu principal ne l'utilise pas.
export const UI_HAUTEUR_BASE = 1080;
export const UI_FACTEUR_MAX = 2;

// Facteur pour une hauteur de fenêtre en pixels CSS (valeur invalide : 1).
export function facteurInterface(hauteur) {
  const h = Number(hauteur);
  if (!Number.isFinite(h) || h <= UI_HAUTEUR_BASE) return 1;
  return Math.min(UI_FACTEUR_MAX, h / UI_HAUTEUR_BASE);
}

// Pose --ui-k sur la racine et la tient à jour au redimensionnement. Renvoie la fonction de mise à jour.
export function installerEchelle(win = typeof window === 'undefined' ? null : window) {
  if (!win?.document?.documentElement) return () => 1;
  const root = win.document.documentElement;
  let actuel = null;
  const maj = () => {
    const k = facteurInterface(win.innerHeight);
    if (k !== actuel) {
      actuel = k;
      root.style.setProperty('--ui-k', String(k));
    }
    return k;
  };
  maj();
  win.addEventListener('resize', maj);
  return maj;
}
