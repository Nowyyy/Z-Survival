// Éclaboussures de sang autour des zones rouges : générées au canvas, jamais importées.
// Les couleurs viennent des jetons CSS ; le générateur est déterministe pour un rendu stable.
function makeRandom(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function drawSplat(canvas) {
  const screen = canvas.parentElement;
  const box = screen.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  const g = canvas.getContext('2d');
  if (!g) return;
  g.scale(dpr, dpr);

  const style = getComputedStyle(document.documentElement);
  const blood = style.getPropertyValue('--color-action').trim();
  const deep = style.getPropertyValue('--color-action-deep').trim();
  const rnd = makeRandom(11);

  const dot = (x, y, r) => {
    g.fillStyle = rnd() > 0.75 ? deep : blood;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const drip = (x, y, len, w) => {
    g.fillStyle = blood;
    g.fillRect(x, y, w, len);
    g.beginPath();
    g.arc(x + w / 2, y + len, w * 0.95, 0, Math.PI * 2);
    g.fill();
  };

  for (const zone of screen.querySelectorAll('.zone')) {
    const r = zone.getBoundingClientRect();
    const x0 = r.left - box.left - 10;
    const y0 = r.top - box.top - 8;
    const x1 = r.right - box.left + 10;
    const y1 = r.bottom - box.top + 8;
    const w = x1 - x0;
    const h = y1 - y0;
    const count = Math.round((w + h) / 14);
    for (let i = 0; i < count; i++) {
      const t = rnd() * 2 * (w + h);
      let x;
      let y;
      if (t < w) { x = x0 + t; y = y0; }
      else if (t < w + h) { x = x1; y = y0 + (t - w); }
      else if (t < 2 * w + h) { x = x1 - (t - w - h); y = y1; }
      else { x = x0; y = y1 - (t - 2 * w - h); }
      dot(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26, 1.5 + rnd() * 4.5);
    }
    const drips = Math.round(w / 22);
    for (let i = 0; i < drips; i++) {
      drip(x0 + 12 + rnd() * (w - 24), y1 - 6, 8 + rnd() * 26, 2 + rnd() * 3);
    }
  }
}
