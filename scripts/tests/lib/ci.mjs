// Lot 4f-A — Choix du palier et de la base de sélection en CI (fonctions pures ; scripts/tests/ci-palier.mjs lit l'environnement et git).

const ZERO = /^0+$/;

/**
 * Palier lancé par une exécution de .github/workflows/tests.yml.
 * @param {{evenement: string, ref: string, palierDemande?: string}} o
 *   evenement : github.event_name ; ref : github.ref (refs/heads/…) ; palierDemande : inputs.palier (workflow_dispatch) ;
 *   cree : github.event.created (push qui crée la branche)
 * @returns {{palier: 'standard'|'publication'|'complet'|null, message: string}}
 */
export function palierDeLExecution({ evenement, ref = '', palierDemande, cree = false }) {
  const branche = ref.replace(/^refs\/heads\//, '');
  // Lot 4f : une branche essai/** est lancée par l'événement create (sans filtre de chemins) ; le push qui la crée ne lance rien.
  if (evenement === 'create') {
    if (!ref.startsWith('refs/heads/essai/')) return { palier: null, message: `création de ${ref} : aucun palier` };
    return palierDeLExecution({ evenement: 'push', ref });
  }
  if (evenement === 'push' && cree && branche.startsWith('essai/')) return { palier: null, message: `création de ${branche} par un push : lancée par l'événement create (aucun doublon)` };
  if (evenement === 'workflow_dispatch') {
    const p = ['standard', 'publication', 'complet'].includes(palierDemande) ? palierDemande : 'standard';
    return { palier: p, message: `lancement manuel : palier ${p}` };
  }
  if (evenement === 'pull_request') return { palier: 'standard', message: 'pull request : palier standard' };
  if (evenement === 'push') {
    if (branche.startsWith('essai/')) {
      if (/^essai\/complet-[^/]+$/.test(branche)) return { palier: 'complet', message: `branche ${branche} : palier complet (mesure en CI)` };
      if (/^essai\/standard-[^/]+$/.test(branche)) return { palier: 'standard', message: `branche ${branche} : palier standard (mesure en CI)` };
      return { palier: null, message: `branche ${branche} : aucun palier (seuls essai/complet-* et essai/standard-* lancent des tests)` };
    }
    if (branche === 'dev' || /^lot-[^/]+$/.test(branche)) return { palier: 'standard', message: `push de ${branche} : palier standard` };
    return { palier: null, message: `push de ${branche} : aucun palier` };
  }
  return { palier: null, message: `événement ${evenement} : aucun palier` };
}

/**
 * Références candidates pour la base de la sélection du palier standard, dans l'ordre (la première qui existe gagne ;
 * ci-palier.mjs vérifie chacune avec git). Pour un push : le commit précédent (github.event.before) s'il est valide, sinon origin/main ;
 * pour une pull request : la branche de base (origin/<base_ref>, puis son commit) ; pour essai/standard-* : origin/dev, sinon origin/main.
 */
export function basesCandidates({ evenement, ref = '', avant = '', baseRef = '', baseSha = '' }) {
  const branche = ref.replace(/^refs\/heads\//, '');
  const valide = (s) => /^[0-9a-f]{7,40}$/.test(s) && !ZERO.test(s);
  if (evenement === 'pull_request') return [...(baseRef ? [`origin/${baseRef}`] : []), ...(valide(baseSha) ? [baseSha] : []), 'origin/main'];
  if ((evenement === 'push' || evenement === 'create') && branche.startsWith('essai/')) return ['origin/dev', 'origin/main'];
  if (evenement === 'push') return [...(valide(avant) ? [avant] : []), 'origin/main'];
  return ['origin/dev', 'origin/main'];
}
