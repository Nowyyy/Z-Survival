// Voile du fondu entre étages (lot 3e) : l'élément HTML #floor-fade (décoratif, aria-hidden, sans événement), de la couleur de la brume (--game-fog), dont l'opacité est
// celle du voile calculé par js/core/floor-transition.js. Aucun filter, mix-blend-mode ni backdrop-filter, aucun matériau transparent dans la scène, aucun décalage de
// mise en page. N'écrit dans le DOM que si l'opacité change.
export function createFloorFade(root = document) {
  const el = root.getElementById('floor-fade');
  let shown = 0;
  return {
    set(veil) {
      const v = Number.isFinite(veil) ? Math.min(1, Math.max(0, veil)) : 0;
      if (!el || v === shown) return;
      shown = v;
      el.style.opacity = v === 0 ? '0' : String(Math.round(v * 1000) / 1000);
    },
    value: () => shown,
  };
}
