// Lot 4f-A — Tâche « planifier » de .github/workflows/tests.yml : choix du palier (événement, nom de branche, palier demandé)
// et, pour le palier standard, base de la sélection. Écrit dans GITHUB_OUTPUT : palier (vide = rien à lancer), base, args
// (arguments de selectionner.mjs) ; un message dans le résumé du travail. Fonctions pures : lib/ci.mjs.
//
// Environnement : GITHUB_EVENT_NAME, GITHUB_REF, PALIER_DEMANDE (inputs.palier), AVANT (github.event.before),
//                 BASE_REF (github.base_ref), BASE_SHA (github.event.pull_request.base.sha).
// Usage local (à blanc) : GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/essai/standard-1 node scripts/tests/ci-palier.mjs
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { basesCandidates, palierDeLExecution } from './lib/ci.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
const env = process.env;
const contexte = { evenement: env.GITHUB_EVENT_NAME ?? 'push', ref: env.GITHUB_REF ?? '', palierDemande: env.PALIER_DEMANDE || undefined };
const { palier, message } = palierDeLExecution(contexte);
let base = '';
let args = '';
let detail = '';
if (palier === 'standard') {
  const candidats = basesCandidates({ ...contexte, avant: env.AVANT ?? '', baseRef: env.BASE_REF ?? '', baseSha: env.BASE_SHA ?? '' });
  for (const c of candidats) {
    const sha = git('rev-parse', '--verify', '--quiet', `${c}^{commit}`);
    if (sha) {
      base = sha;
      detail = `base ${c}${c === sha ? '' : ` = ${sha.slice(0, 12)}`}`;
      break;
    }
  }
  args = base ? `--base ${base}` : '--tout';
  if (!base) detail = `aucune base valide parmi ${candidats.join(', ')} : rejeu total`;
} else if (palier === 'publication') args = '--depuis-version --publication';
else if (palier === 'complet') args = '--tout';
const ligne = `${message}${detail ? ` ; ${detail}` : ''}`;
console.log(ligne);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### Palier : ${palier ?? 'aucun'}\n\n${ligne}\n\n`);
if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `palier=${palier ?? ''}\nbase=${base}\nargs=${args}\n`);
