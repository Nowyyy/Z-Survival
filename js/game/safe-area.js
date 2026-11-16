// Zones de sécurité de l'écran (encoches, barres système) : lues par un élément caché dont le padding utilise env(),
// puis publiées en variables CSS --safe-top, --safe-right, --safe-bottom, --safe-left (en pixels).
export function readSafeArea(probe) {
  const style = getComputedStyle(probe);
  const px = (name) => Math.max(0, Number.parseFloat(style.getPropertyValue(name)) || 0);
  return { top: px('padding-top'), right: px('padding-right'), bottom: px('padding-bottom'), left: px('padding-left') };
}

export function installSafeArea(root = document.documentElement) {
  const probe = document.createElement('div');
  probe.className = 'safe-probe';
  probe.setAttribute('aria-hidden', 'true');
  document.body.append(probe);
  const apply = () => {
    const area = readSafeArea(probe);
    for (const [side, value] of Object.entries(area)) root.style.setProperty(`--safe-${side}`, `${value}px`);
    return area;
  };
  // Retour du propriétaire après le lot 9a : après plusieurs rotations ou un retour d'une autre appli, le navigateur d'un téléphone peut laisser la
  // page défilée ou agrandie : l'image et les zones de toucher ne coïncident plus. La page (qui ne défile jamais) est remise à l'origine et à
  // l'échelle 1, puis les tailles sont relues une fois la rotation terminée (deux images plus tard, puis après un court délai : certains
  // navigateurs donnent la nouvelle taille en retard).
  const meta = document.querySelector('meta[name="viewport"]');
  // zoom : seulement après une rotation ou un retour d'arrière-plan (jamais pendant un agrandissement voulu par le joueur, au menu par exemple).
  const recaler = ({ zoom = false } = {}) => {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    const vv = window.visualViewport;
    if (zoom && meta && vv && Math.abs(vv.scale - 1) > 0.01) {
      const contenu = meta.getAttribute('content');
      meta.setAttribute('content', `${contenu}, maximum-scale=1`);
      requestAnimationFrame(() => meta.setAttribute('content', contenu));
    }
    apply();
  };
  let relance = 0;
  const apresRotation = () => {
    recaler({ zoom: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      recaler({ zoom: true });
      window.dispatchEvent(new Event('resize'));
    }));
    clearTimeout(relance);
    relance = setTimeout(() => {
      recaler({ zoom: true });
      window.dispatchEvent(new Event('resize'));
    }, 400);
  };
  const auRetour = () => {
    if (!document.hidden) apresRotation();
  };
  window.addEventListener('resize', () => recaler());
  window.addEventListener('orientationchange', apresRotation);
  window.addEventListener('pageshow', apresRotation);
  document.addEventListener('visibilitychange', auRetour);
  window.visualViewport?.addEventListener('resize', () => recaler());
  return { refresh: () => recaler(), area: apply() };
}
