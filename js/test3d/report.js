// Rapport du banc d'essai : texte brut à copier. Rien n'est envoyé nulle part.
const fix = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '0');

// Date du test (seul endroit de js/test3d/ qui lit l'horloge civile).
export const testDate = () => new Date(Date.now()).toISOString();

// win : fenêtre du navigateur ; rendererName : nom du moteur de rendu (WEBGL_debug_renderer_info) ou ''.
export function collectEnvironment(win, rendererName = '') {
  const nav = win?.navigator ?? {};
  return {
    userAgent: String(nav.userAgent ?? 'inconnu'),
    screen: `${win?.screen?.width ?? 0}×${win?.screen?.height ?? 0}`,
    viewport: `${win?.innerWidth ?? 0}×${win?.innerHeight ?? 0}`,
    devicePixelRatio: Number(win?.devicePixelRatio ?? 1),
    cores: nav.hardwareConcurrency ?? null,
    memory: nav.deviceMemory ?? null,
    renderer: rendererName || '',
  };
}

export function readRendererName(gl) {
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}

export function formatResult(result, index, total) {
  const c = result.config;
  const size = result.width ? `, canvas ${result.width}×${result.height}` : '';
  const ratio = `ratio effectif ${fix(result.pixelRatio, 2)}${size}`;
  // Une mesure sans WebGL (pseudo-3D) porte un libellé et n'a pas d'appels de dessin.
  const head = c.label
    ? `Mesure ${index + 1}/${total} : ${c.label} (${ratio})`
    : `Configuration ${index + 1}/${total} : ${c.zombies} zombies, ombres ${c.shadows ? 'oui' : 'non'}, résolution max × ${c.maxPixelRatio} (${ratio})`;
  const draw = c.label ? '  Appels de dessin : sans objet (canvas 2D)' : `  Appels de dessin (moyenne) : ${result.calls} ; triangles (moyenne) : ${result.triangles}`;
  return [
    head,
    `  Images par seconde (moyenne) : ${fix(result.fps)}`,
    `  Temps d'image : médian ${fix(result.median)} ms, 95e centile ${fix(result.p95)} ms`,
    `  1 % bas : ${fix(result.low1)} images par seconde`,
    `  Images de plus de 50 ms : ${result.long} (sur ${result.frames} images mesurées)`,
    draw,
  ].join('\n');
}

// info : { title, threeVersion, date, env, results, total, quick, interrupted } ; interrupted : 'hidden', 'stop' ou null.
export function buildReport(info) {
  const { env = {}, results = [], total = 6 } = info ?? {};
  const lines = [
    info?.title ?? 'Z-Survival — Test 3D jetable — rapport du banc d\'essai',
    `Three.js : ${info?.threeVersion ?? 'inconnue'}`,
    `Date du test : ${info?.date ?? 'inconnue'}`,
    `Navigateur : ${env.userAgent ?? 'inconnu'}`,
    `Écran : ${env.screen ?? '?'} ; fenêtre : ${env.viewport ?? '?'} ; devicePixelRatio : ${env.devicePixelRatio ?? '?'}`,
    `Processeurs logiques : ${env.cores ?? 'non disponible'}`,
    `Mémoire de l'appareil : ${env.memory ? `${env.memory} Go (approximation du navigateur)` : 'non disponible'}`,
    `Moteur de rendu : ${env.renderer || 'non disponible'}`,
    `Mode : ${info?.quick ? 'rapide (tests, 1 s par configuration)' : 'complet (6 s par configuration, 1re seconde ignorée)'}`,
    '',
  ];
  if (results.length === 0) lines.push('Aucune configuration mesurée.');
  results.forEach((result, i) => lines.push(formatResult(result, i, total), ''));
  if (info?.interrupted === 'hidden') lines.push('Banc interrompu : onglet caché. Les configurations suivantes n\'ont pas été mesurées.');
  else if (info?.interrupted) lines.push('Banc arrêté à la main. Les configurations suivantes n\'ont pas été mesurées.');
  else if (results.length > 0 && results.length < total) lines.push('Banc non terminé.');
  return lines.join('\n').trimEnd();
}
