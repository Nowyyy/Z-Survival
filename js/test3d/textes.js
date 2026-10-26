// Textes de l'interface du test 3D jetable, en français dans ce seul fichier (exception documentée, hors fr.json).
export const T = {
  titre: 'Test 3D jetable',
  provisoire: 'Page jetable de comparaison Three.js / Phaser. Rien ici n’est destiné au jeu final.',
  reglages: 'Réglages',
  fermer: 'Fermer',
  camera: 'Caméra',
  'camera.dessus': 'Dessus',
  'camera.75': '75°',
  'camera.60': '60°',
  rendu: 'Rendu',
  ombres: 'Ombres',
  ombresOui: 'Ombres : oui',
  ombresNon: 'Ombres : non',
  resolution: 'Résolution maximale',
  'resolution.1': '× 1',
  'resolution.1.5': '× 1,5',
  'resolution.2': '× 2',
  zombies: 'Zombies',
  autoplay: 'Autoplay',
  autoplayOui: 'Autoplay : oui',
  autoplayNon: 'Autoplay : non',
  bench: 'Banc d’essai',
  benchLance: 'Lancer le banc d’essai',
  benchStop: 'Arrêter le banc d’essai',
  benchEtat: 'Banc d’essai : configuration {n} sur {total}',
  benchFini: 'Banc d’essai terminé. Rapport ci-dessous.',
  benchInterrompu: 'Banc d’essai interrompu : onglet caché.',
  copier: 'Copier le rapport',
  copie: 'Rapport copié.',
  copieRefusee: 'Copie refusée par le navigateur : le texte est sélectionné, copie-le à la main.',
  rapport: 'Rapport',
  rapportVide: 'Aucun rapport pour l’instant.',
  comparer: 'Comparer',
  jeuFps: 'Jeu actuel avec compteur',
  fps: 'Images/s',
  median: 'médiane',
  appels: 'appels',
  triangles: 'triangles',
  canvas: 'canvas',
  webglAbsent: 'WebGL n’est pas disponible sur cet appareil ou ce navigateur : la page Three.js ne peut pas s’afficher.',
  nonRepresentatif: 'Mesure faite dans un environnement non représentatif d’un téléphone.',
  pseudoTitre: 'Pseudo-3D (Phaser)',
  mesure: 'Mesurer {s} s',
  mesureEnCours: 'Mesure en cours…',
  mesureFinie: 'Mesure terminée, ajoutée au rapport.',
  liensTitre: 'Pages de comparaison',
  sansJs: 'Cette page a besoin de JavaScript. / This page needs JavaScript.',
};

// Remplace {clé} par des valeurs.
export const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));

// Pose les textes de la page : data-t="clé" remplit textContent, data-t-label="clé" remplit aria-label.
export function applyTextes(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t] ?? el.dataset.t;
  for (const el of root.querySelectorAll('[data-t-label]')) el.setAttribute('aria-label', T[el.dataset.tLabel] ?? el.dataset.tLabel);
}
