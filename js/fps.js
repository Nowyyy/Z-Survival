// Compteur d'images par seconde de jeu.html?fps=1 : moyenne glissante sur 5 s.
const WINDOW = 5000;
const el = document.createElement('p');
el.id = 'fps-counter';
el.setAttribute('aria-hidden', 'true');
el.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:30;margin:0;padding:2px 8px;'
  + 'font:700 14px/1.3 var(--font-sans);color:var(--color-text);background:var(--color-bg);border-radius:4px;pointer-events:none';
el.textContent = 'Images/s : 0';
document.body.append(el);

const stamps = [];
function tick(now) {
  stamps.push(now);
  while (stamps.length > 1 && stamps[0] < now - WINDOW) stamps.shift();
  const span = now - stamps[0];
  el.textContent = `Images/s : ${span > 0 ? Math.round(((stamps.length - 1) * 1000) / span) : 0}`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
