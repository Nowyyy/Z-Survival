// Calculateur d'arrière-plan de l'atelier des sons (lot 3h) : l'interface reste réactive pendant le calcul et la mesure d'un son.
// Messages : { type: 'init', atelier, sounds } puis { type: 'render', id, job } -> { id, ok, result | error } (tampon transféré).
import { createRenderer } from './render.js';

let renderJob = null;
self.onmessage = (event) => {
  const msg = event.data ?? {};
  if (msg.type === 'init') {
    renderJob = createRenderer({ atelier: msg.atelier, sounds: msg.sounds });
    self.postMessage({ type: 'ready' });
    return;
  }
  if (msg.type !== 'render' || !renderJob) return;
  try {
    const result = renderJob(msg.job);
    self.postMessage({ type: 'done', id: msg.id, ok: true, result }, [result.samples.buffer]);
  } catch (error) {
    self.postMessage({ type: 'done', id: msg.id, ok: false, error: String(error?.message ?? error) });
  }
};
