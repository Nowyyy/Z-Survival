// Lot 5o — Contrôle de publication : liste blanche des commandes que scripts/publication/controler.mjs a le droit de lancer (pur, testé).
// Le contrôle est en LECTURE SEULE : aucune commande git qui écrit (push, fetch, commit, branch, tag, worktree, reset…), `gh api` en GET seulement
// et sans champ, `curl` en GET vers le site publié sans fichier de sortie, et l'assemblage local (scripts/site/local.mjs) dans un dossier HORS du dépôt.
import { isAbsolute, relative, resolve } from 'node:path';

export const GIT_LECTURE = Object.freeze(['rev-parse', 'merge-base', 'show', 'cat-file', 'log', 'diff', 'ls-remote', 'for-each-ref', 'ls-tree', 'remote']);
export const SITE_PUBLIE = 'https://nowyyy.github.io/Z-Survival/';
const GH_INTERDITS = /^(-f|-F|--field|--raw-field|--input|-H|--header|--hostname|-X(?!GET$).*|--method=(?!GET$).*)$/;
const CURL_INTERDITS = /^(-o|--output|-O|--remote-name|-T|--upload-file|-d|--data.*|-F|--form.*|-K|--config|-X|--request|-I|--head|-x|--proxy|--create-dirs)$/;

// Le chemin est-il en dehors du dépôt (ni le dépôt lui-même, ni un de ses sous-dossiers) ?
export function horsDepot(chemin, racine) {
  if (typeof chemin !== 'string' || chemin === '' || typeof racine !== 'string') return false;
  const rel = relative(resolve(racine), resolve(chemin));
  return rel.startsWith('..') || isAbsolute(rel);
}

// { ok, raison } : la commande est-elle permise ?
export function autorise(cmd, args, { racine = process.cwd() } = {}) {
  const a = Array.isArray(args) ? args.map(String) : null;
  if (a === null) return { ok: false, raison: 'arguments attendus' };
  if (cmd === 'git') {
    const sub = a[0];
    if (!GIT_LECTURE.includes(sub)) return { ok: false, raison: `git ${sub ?? ''} n'est pas une lecture` };
    if (a.some((x) => /^--output(=|$)|^--ext-diff$|^-c$|^--exec-path/.test(x))) return { ok: false, raison: 'option d\'écriture ou de configuration refusée' };
    if (sub === 'remote' && !(a[1] === 'get-url' && a.length === 3)) return { ok: false, raison: 'git remote : get-url seulement' };
    if (sub === 'merge-base' && a[1] !== '--is-ancestor') return { ok: false, raison: 'git merge-base : --is-ancestor seulement' };
    if (sub === 'ls-remote' && a[1] !== '--heads') return { ok: false, raison: 'git ls-remote : --heads seulement' };
    return { ok: true, raison: '' };
  }
  if (cmd === 'gh') {
    if (a[0] !== 'api') return { ok: false, raison: 'gh : api seulement' };
    const i = a.indexOf('--method');
    if (i < 0 || a[i + 1] !== 'GET') return { ok: false, raison: 'gh api : --method GET obligatoire' };
    if (a.some((x) => GH_INTERDITS.test(x))) return { ok: false, raison: 'gh api : champ, en-tête ou méthode refusés' };
    const chemins = a.slice(1).filter((x, k, arr) => !x.startsWith('-') && arr[k - 1] !== '--method');
    if (chemins.length !== 1 || !/^repos\/[\w.-]+\/[\w.-]+(\/[\w./%=&?:-]*)?$/.test(chemins[0])) return { ok: false, raison: 'gh api : un chemin repos/… attendu' };
    return { ok: true, raison: '' };
  }
  if (cmd === 'curl') {
    if (a.some((x) => CURL_INTERDITS.test(x))) return { ok: false, raison: 'curl : écriture, envoi ou méthode refusés' };
    const urls = a.filter((x) => /^https?:/.test(x));
    if (urls.length !== 1 || !urls[0].startsWith(SITE_PUBLIE)) return { ok: false, raison: 'curl : une adresse du site publié seulement' };
    return { ok: true, raison: '' };
  }
  if (cmd === 'node') {
    if (a[0] !== 'scripts/site/local.mjs') return { ok: false, raison: 'node : scripts/site/local.mjs seulement' };
    const i = a.indexOf('--out');
    if (i < 0 || !horsDepot(a[i + 1], racine)) return { ok: false, raison: 'assemblage : --out hors du dépôt obligatoire' };
    if (a.includes('--push')) return { ok: false, raison: 'assemblage : --push refusé' };
    return { ok: true, raison: '' };
  }
  return { ok: false, raison: `commande ${cmd} refusée` };
}

// « owner/repo » d'une adresse GitHub (https ou ssh), ou null.
export function depotGitHub(url) {
  const m = typeof url === 'string' ? url.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/) : null;
  return m ? { owner: m[1], repo: m[2] } : null;
}

// Arguments de la ligne de commande : { mode: 'avant'|'apres', json, sansBuild, site } ou { erreur }.
export function lireArguments(argv, racine) {
  const a = Array.isArray(argv) ? argv.map(String) : [];
  const out = { mode: 'avant', json: null, sansBuild: false, site: SITE_PUBLIE };
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    if (x === '--avant') out.mode = 'avant';
    else if (x === '--apres') out.mode = 'apres';
    else if (x === '--sans-build') out.sansBuild = true;
    else if (x === '--json') {
      out.json = a[i + 1] ?? null;
      i += 1;
      if (!out.json || !horsDepot(out.json, racine)) return { erreur: '--json : un chemin hors du dépôt est obligatoire' };
    } else return { erreur: `option inconnue : ${x}` };
  }
  if (a.includes('--avant') && a.includes('--apres')) return { erreur: '--avant et --apres s\'excluent' };
  return out;
}
