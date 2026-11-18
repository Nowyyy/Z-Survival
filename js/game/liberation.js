// Lot 9d : libération d'une partie sans rechargement (Docs/ref/retour-menu.md). Le registre garde ce qu'une partie crée hors d'elle-même
// (écouteurs de window, document…, minuteries, fonctions de libération des modules) et le défait dans l'ordre inverse. Une étape qui lève
// n'empêche pas les suivantes : les erreurs sont rendues, l'appelant décide (filet de sécurité : rechargement).
// libererThree : géométries, matières, textures et cartes d'ombre d'objets Three.js (scène, stocks hors scène), sans importer Three.js.

export function creerRegistre() {
  const taches = [];
  let libere = false;
  return {
    get libere() {
      return libere;
    },
    // addEventListener tenu : retiré avec les mêmes options (capture comprise).
    ecouter(cible, type, fn, options) {
      if (!cible?.addEventListener) return fn;
      cible.addEventListener(type, fn, options);
      taches.push(() => cible.removeEventListener(type, fn, options));
      return fn;
    },
    intervalle(fn, ms) {
      const id = setInterval(fn, ms);
      taches.push(() => clearInterval(id));
      return id;
    },
    delai(fn, ms) {
      const id = setTimeout(fn, ms);
      taches.push(() => clearTimeout(id));
      return id;
    },
    ajouter(fn) {
      if (typeof fn === 'function') taches.push(fn);
      return fn;
    },
    taille: () => taches.length,
    // → liste des erreurs rencontrées (vide : tout est défait). Un second appel ne fait rien.
    liberer() {
      if (libere) return [];
      libere = true;
      const erreurs = [];
      while (taches.length > 0) {
        const t = taches.pop();
        try {
          t();
        } catch (e) {
          erreurs.push(e);
        }
      }
      return erreurs;
    },
  };
}

// Textures portées par une matière (map, normalMap, uniformes…) : toute valeur qui a isTexture.
function texturesDe(materiau) {
  const out = [];
  for (const v of Object.values(materiau)) if (v?.isTexture) out.push(v);
  for (const u of Object.values(materiau.uniforms ?? {})) if (u?.value?.isTexture) out.push(u.value);
  return out;
}

// racines : objets Three.js (scène, groupes et personnages détachés) ; vus : Set partagé (rien n'est libéré deux fois). → nombre d'objets libérés.
export function libererThree(racines, vus = new Set()) {
  let n = 0;
  const liberer = (x) => {
    if (!x || vus.has(x) || typeof x.dispose !== 'function') return;
    vus.add(x);
    x.dispose();
    n += 1;
  };
  for (const racine of racines) {
    racine?.traverse?.((o) => {
      liberer(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        for (const t of texturesDe(m)) liberer(t);
        liberer(m);
      }
      if (o.shadow) {
        // Carte d'ombre : sa texture de profondeur n'est pas libérée avec elle (Three.js 0.186, comme les ouvertures du lot 8f).
        liberer(o.shadow.map?.depthTexture);
        liberer(o.shadow.map?.texture);
        if (!vus.has(o.shadow)) {
          vus.add(o.shadow);
          o.shadow.dispose?.();
        }
      }
      liberer(o.skeleton);
      if (o.isInstancedMesh) o.dispose?.();
    });
  }
  return n;
}
