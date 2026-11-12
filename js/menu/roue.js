// Roue de chargement du menu (retour du propriétaire : « plus grosse et plus visible », et aussi pendant le chargement d'un onglet) : anneau
// épais sur un disque sombre, lueur rouge, texte « Chargement… » dessous ; rôle status (annoncée). Styles : .menu-roue (css/menu.css, jetons).
// Mouvement réduit : anneau immobile, le texte reste.

// Roue posée dans parent (position absolue au centre ; fixe si fixe), retirée par retirer(). texte : libellé affiché et annoncé.
export function creerRoue(parent, { texte, fixe = false, id } = {}) {
  const roue = document.createElement('div');
  roue.className = fixe ? 'menu-roue menu-roue-fixe' : 'menu-roue';
  roue.setAttribute('role', 'status');
  if (id) roue.id = id;
  const anneau = document.createElement('span');
  anneau.className = 'menu-roue-anneau';
  anneau.setAttribute('aria-hidden', 'true');
  const libelle = document.createElement('span');
  libelle.className = 'menu-roue-texte';
  libelle.textContent = texte ?? '';
  roue.append(anneau, libelle);
  parent.append(roue);
  let retiree = false;
  return {
    element: roue,
    retirer() {
      if (retiree) return;
      retiree = true;
      roue.remove();
    },
  };
}

// Roue montée seulement si l'attente dure plus de delai ms (pas d'éclair pour un chargement déjà en cache) ; fin() l'enlève (ou annule).
export function roueDifferee(parent, options = {}, delai = 120) {
  let roue = null;
  const minuterie = setTimeout(() => {
    roue = creerRoue(parent, options);
  }, delai);
  return {
    fin() {
      clearTimeout(minuterie);
      roue?.retirer();
    },
  };
}

// Même chose pour une promesse : roue retirée à sa fin, quoi qu'il arrive. Renvoie la promesse d'origine.
export function pendant(promesse, parent, options = {}, delai = 120) {
  const r = roueDifferee(parent, options, delai);
  promesse.then(r.fin, r.fin);
  return promesse;
}
