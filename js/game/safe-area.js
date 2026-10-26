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
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  return { refresh: apply, area: apply() };
}
