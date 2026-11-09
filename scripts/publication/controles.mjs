// Lot 5o — Contrôle de publication : décisions PURES (aucun disque, réseau, git ni horloge). Chaque contrôle reçoit des données déjà lues par
// scripts/publication/controler.mjs et renvoie { id, controle, resultat, detail } ; resultat ∈ OK, KO, ATTENTION, NON VÉRIFIABLE.
// Une donnée qui n'a pas pu être lue arrive sous la forme { erreur: '…' } : le contrôle qui en dépend est « NON VÉRIFIABLE », jamais « OK ».
// Jamais d'exception, quelle que soit l'entrée (un contrôle dont les données sont illisibles est « NON VÉRIFIABLE »).
import { parseNoms, appliquerNoms, MAX_NOM, MAX_DESCRIPTION } from '../site/noms.mjs';
import { buildSiteInfo } from '../site/site-info.mjs';
import { validateVersions } from '../versions/schema.mjs';

export const OK = 'OK';
export const KO = 'KO';
export const ATTENTION = 'ATTENTION';
export const NV = 'NON VÉRIFIABLE';
export const RESULTATS = [OK, ATTENTION, NV, KO];
const GRAVITE = { [OK]: 0, [ATTENTION]: 1, [NV]: 2, [KO]: 3 };
export const LIMITE_CLAUDE = 8400;
export const MARGE_CLAUDE = 150;
export const MARGE_CLAUDE_MIN = 100;
export const WORKFLOWS_DEV = ['Tests', 'Pages'];
export const GESTE_MAIN_DANS_DEV = 'Pull Request main → dev, « Create a merge commit », sans « Resolve conflicts », CI verte';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const illisible = (d) => d === undefined || (isObject(d) && typeof d.erreur === 'string');
const raison = (d) => (isObject(d) && typeof d.erreur === 'string' ? d.erreur : 'donnée absente');
const court = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '?');
const liste = (items, max = 8) => {
  const arr = Array.isArray(items) ? items.map(String) : [];
  return arr.length <= max ? arr.join(', ') : `${arr.slice(0, max).join(', ')} et ${arr.length - max} de plus`;
};

// Pire de plusieurs constats [{ resultat, texte }] : KO l'emporte, puis NON VÉRIFIABLE, puis ATTENTION.
function pire(constats) {
  const list = constats.filter((c) => c && GRAVITE[c.resultat] !== undefined);
  if (list.length === 0) return { resultat: OK, texte: '' };
  const worst = list.reduce((a, b) => (GRAVITE[b.resultat] > GRAVITE[a.resultat] ? b : a));
  const textes = [...list].sort((a, b) => GRAVITE[b.resultat] - GRAVITE[a.resultat]).map((c) => c.texte).filter(Boolean);
  return { resultat: worst.resultat, texte: textes.join(' ; ') };
}

// Texte d'une cellule : une ligne, sans « | », 400 caractères au plus.
export function nettoyer(text, max = 400) {
  const s = [...String(text ?? '')].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  return [...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s;
}

// Enveloppe : un contrôle qui lève (données hostiles) devient « NON VÉRIFIABLE ».
function controle(id, nom, fn) {
  return (donnees) => {
    try {
      const r = fn(isObject(donnees) ? donnees : {});
      return { id, controle: nom, resultat: GRAVITE[r.resultat] === undefined ? NV : r.resultat, detail: nettoyer(r.texte) };
    } catch (error) {
      return { id, controle: nom, resultat: NV, detail: nettoyer(`données illisibles (${error?.name ?? 'erreur'})`) };
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Contrôles communs
export const fraicheur = controle('fraicheur', 'références origin/* à jour', ({ locales, distantes }) => {
  if (illisible(distantes)) return { resultat: NV, texte: `git ls-remote impossible (${raison(distantes)}) : origin/* peut être périmé` };
  if (!isObject(locales) || !isObject(distantes)) return { resultat: NV, texte: 'références illisibles' };
  const ecarts = [];
  for (const [nom, sha] of Object.entries(distantes)) if (locales[nom] !== sha) ecarts.push(`${nom} (${locales[nom] ? court(locales[nom]) : 'absente'} → ${court(sha)})`);
  for (const nom of Object.keys(locales)) if (!(nom in distantes) && nom !== 'HEAD') ecarts.push(`${nom} (supprimée sur origin)`);
  return ecarts.length ? { resultat: ATTENTION, texte: `lancer « git fetch origin --prune » puis relancer : ${liste(ecarts)}` } : { resultat: OK, texte: `${Object.keys(distantes).length} branches identiques à origin` };
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Contrôles --avant
export const dev = controle('avant-1', 'dev', ({ devSha, bilans }) => {
  if (illisible(devSha) || typeof devSha !== 'string') return { resultat: KO, texte: `origin/dev introuvable (${raison(devSha)})` };
  if (illisible(bilans) || !Array.isArray(bilans)) return { resultat: NV, texte: `origin/dev ${court(devSha)} ; bilans illisibles` };
  const noms = bilans.filter((b) => /^lot-[0-9a-z-]+\.md$/.test(b)).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  if (noms.length === 0) return { resultat: ATTENTION, texte: `origin/dev ${court(devSha)} ; aucun bilan dans Docs/lots/` };
  const cible = noms.includes('lot-5o.md') ? 'lot-5o.md' : noms.at(-1);
  return { resultat: OK, texte: `origin/dev ${court(devSha)} ; bilan : Docs/lots/${cible}` };
});

// runs : exécutions GitHub Actions du hash (REST), [{ name, status, conclusion, event, id }].
export const ciDev = controle('avant-2', 'CI de dev', ({ devSha, runs }) => {
  if (illisible(runs) || !Array.isArray(runs)) return { resultat: NV, texte: `exécutions illisibles (${raison(runs)})` };
  const constats = WORKFLOWS_DEV.map((nom) => {
    const du = runs.filter((r) => isObject(r) && r.name === nom);
    if (du.length === 0) return { resultat: KO, texte: `${nom} : aucune exécution sur ${court(devSha)}` };
    const enCours = du.filter((r) => r.status !== 'completed');
    if (enCours.length) return { resultat: KO, texte: `${nom} : en cours (${enCours.map((r) => r.id).join(', ')}) : relancer le contrôle à la fin` };
    const dernier = du.reduce((a, b) => ((Number(b.id) || 0) > (Number(a.id) || 0) ? b : a));
    return dernier.conclusion === 'success' ? { resultat: OK, texte: `${nom} : réussi (${dernier.id})` } : { resultat: KO, texte: `${nom} : ${dernier.conclusion ?? 'sans conclusion'} (${dernier.id})` };
  });
  const p = pire(constats);
  return { resultat: p.resultat, texte: p.resultat === OK ? `${court(devSha)} : ${constats.map((c) => c.texte).join(' ; ')}` : p.texte };
});

export const mainAncetre = controle('avant-3', 'main ancêtre de dev', ({ ancetre }) => {
  if (ancetre === true) return { resultat: OK, texte: 'origin/main est un ancêtre de origin/dev' };
  if (ancetre === false) return { resultat: KO, texte: `origin/main a des commits absents de dev : ${GESTE_MAIN_DANS_DEV}` };
  return { resultat: NV, texte: `git merge-base impossible (${raison(ancetre)})` };
});

export const pullRequests = controle('avant-4', 'Pull Requests ouvertes', ({ prs }) => {
  if (illisible(prs) || !Array.isArray(prs)) return { resultat: NV, texte: `liste illisible (${raison(prs)})` };
  if (prs.length === 0) return { resultat: OK, texte: 'aucune' };
  const textes = prs.filter(isObject).map((p) => `#${p.number} ${p.head?.ref ?? '?'} → ${p.base?.ref ?? '?'}`);
  const sensibles = prs.filter((p) => isObject(p) && ['main', 'dev'].includes(p.base?.ref));
  return { resultat: sensibles.length ? ATTENTION : OK, texte: `${sensibles.length ? `${sensibles.length} vers main ou dev : ` : ''}${liste(textes)}` };
});

// devVersions, mainVersions : objets versions.json ; refAncetre : le ref de latest est-il un ancêtre de origin/dev ; archiveInfo : build-info.json
// de la version remplacée dans origin/archive (objet, null s'il n'existe pas, ou { erreur }).
export const versions = controle('avant-5', 'versions.json', ({ devVersions, mainVersions, refAncetre, archiveInfo }) => {
  if (illisible(devVersions)) return { resultat: KO, texte: `versions.json de dev illisible (${raison(devVersions)})` };
  const v = validateVersions(devVersions);
  if (!v.ok) return { resultat: KO, texte: `schéma invalide : ${liste(v.errors, 3)}` };
  const latest = devVersions.versions.find((x) => x.id === devVersions.latest);
  const constats = [];
  if (latest.status !== 'actuelle') constats.push({ resultat: KO, texte: `${latest.id} n'a pas le statut « actuelle »` });
  if (refAncetre === false) constats.push({ resultat: KO, texte: `ref de ${latest.id} (${court(latest.ref)}) absent de origin/dev` });
  else if (refAncetre !== true) constats.push({ resultat: NV, texte: `ref de ${latest.id} non vérifié (${raison(refAncetre)})` });
  if (illisible(mainVersions) || !isObject(mainVersions)) constats.push({ resultat: NV, texte: `versions.json de main illisible (${raison(mainVersions)})` });
  else {
    const remplacee = mainVersions.latest;
    if (remplacee === devVersions.latest) constats.push({ resultat: KO, texte: `version non préparée : latest = ${remplacee} comme sur main (déclarer la nouvelle version, archiver ${remplacee})` });
    else {
      const entree = devVersions.versions.find((x) => x.id === remplacee);
      if (!entree) constats.push({ resultat: KO, texte: `${remplacee} (latest de main) absente du versions.json de dev` });
      else if (entree.status !== 'archive') constats.push({ resultat: KO, texte: `${remplacee} (remplacée) doit être « archive » (trouvé « ${entree.status} »)` });
      else if (illisible(archiveInfo)) constats.push({ resultat: NV, texte: `origin/archive illisible (${raison(archiveInfo)})` });
      else if (!isObject(archiveInfo)) constats.push({ resultat: KO, texte: `${remplacee}/build-info.json absent de origin/archive (version non archivée)` });
      else if (archiveInfo.ref !== entree.ref) constats.push({ resultat: KO, texte: `${remplacee} : ref ${court(entree.ref)} ≠ archive ${court(archiveInfo.ref)}` });
      else constats.push({ resultat: OK, texte: `${remplacee} archivée (${court(entree.ref)})` });
    }
  }
  const p = pire(constats);
  return { resultat: p.resultat, texte: `latest ${latest.id} (${court(latest.ref)}) ; ${p.texte || 'conforme'}` };
});

// brouillons : textes de noms ou descriptions connus pour être des brouillons (liste vide par défaut).
export const noms = controle('avant-6', 'fichier des noms', ({ texte, devVersions, brouillons = [] }) => {
  if (illisible(texte) || typeof texte !== 'string') return { resultat: KO, texte: `noms-versions-et-lots.txt illisible (${raison(texte)})` };
  const latest = isObject(devVersions) ? devVersions.latest : null;
  const parsed = parseNoms(texte);
  if (parsed.erreurs.length) return { resultat: KO, texte: `${parsed.erreurs.length} erreur(s), ligne ${parsed.erreurs[0].ligne} : ${parsed.erreurs[0].message}` };
  if (typeof latest !== 'string') return { resultat: NV, texte: 'latest inconnu (versions.json de dev illisible)' };
  const bloc = parsed.blocs.find((b) => b.type === 'version' && b.id === latest);
  if (!bloc) return { resultat: KO, texte: `aucun bloc [${latest}] pour la version latest` };
  const constats = [];
  if (typeof bloc.nom !== 'string') constats.push({ resultat: ATTENTION, texte: `[${latest}] sans « nom »` });
  else if ([...bloc.nom].length > MAX_NOM) constats.push({ resultat: KO, texte: `nom de ${[...bloc.nom].length} caractères (${MAX_NOM} au plus)` });
  if (typeof bloc.description !== 'string') constats.push({ resultat: ATTENTION, texte: `[${latest}] sans « description »` });
  else if ([...bloc.description].length > MAX_DESCRIPTION) constats.push({ resultat: KO, texte: `description de ${[...bloc.description].length} caractères (${MAX_DESCRIPTION} au plus)` });
  const brouillon = (Array.isArray(brouillons) ? brouillons : []).filter((b) => typeof b === 'string' && b !== '' && (b === bloc.nom || b === bloc.description));
  if (brouillon.length) constats.push({ resultat: ATTENTION, texte: `texte identique à un brouillon connu : ${liste(brouillon, 2)}` });
  const p = pire(constats);
  return { resultat: p.resultat, texte: `[${latest}] nom « ${bloc.nom ?? '—'} »${p.texte ? ` ; ${p.texte}` : ''}` };
});

// Évolutions de l'accueil une fois versions.json de dev publié sur main (même calcul que l'assembleur : noms appliqués, puis site-info).
export const evolutions = controle('avant-7', 'évolutions après publication', ({ devVersions, changelog, texteNoms }) => {
  if (illisible(devVersions) || illisible(changelog)) return { resultat: NV, texte: `données illisibles (${raison(illisible(devVersions) ? devVersions : changelog)})` };
  const appliques = appliquerNoms({ versions: devVersions, changelog }, typeof texteNoms === 'string' ? parseNoms(texteNoms) : []);
  const info = buildSiteInfo({ versions: appliques.versions, changelog: appliques.changelog, dev: { present: true, sha: '0000000', date: '2000-01-01T00:00:00Z' }, genere: '2000-01-01T00:00:00Z' });
  if (info.evolutions.length === 0) return { resultat: OK, texte: '« evolutions » de site-info.json vide' };
  const parVersion = new Map();
  for (const e of info.evolutions) parVersion.set(e.version, [...(parVersion.get(e.version) ?? []), e.id]);
  return { resultat: KO, texte: `${info.evolutions.length} lot(s) d'une version non publiée : ${[...parVersion].map(([ver, ids]) => `${ver} (${liste(ids, 4)})`).join(' ; ')}` };
});

// seed : texte de Docs/seed.md (dev) ; dernierCommit : { sha, auteur, committer } (logins GitHub, REST) ou { erreur } ; proprietaires : logins admis.
export const seed = controle('avant-8', 'seed', ({ texte, devVersions, dernierCommit, proprietaires }) => {
  if (illisible(texte) || typeof texte !== 'string') return { resultat: KO, texte: `Docs/seed.md illisible (${raison(texte)})` };
  const version = texte.match(/^Version (0\.\d+)\b/m)?.[1];
  const publiee = texte.match(/version publiée \(Recette\)\s*:\s*V(\d+\.\d+)/i)?.[1];
  const latest = isObject(devVersions) ? devVersions.latest : null;
  const constats = [];
  if (!version) constats.push({ resultat: ATTENTION, texte: 'ligne « Version 0.xx » introuvable' });
  if (!publiee) constats.push({ resultat: KO, texte: 'mention « version publiée (Recette) : V0.N » introuvable' });
  else if (typeof latest !== 'string') constats.push({ resultat: NV, texte: 'latest inconnu' });
  else if (`v${publiee}` !== latest) constats.push({ resultat: KO, texte: `le seed cite V${publiee}, latest est ${latest}` });
  if (illisible(dernierCommit) || !isObject(dernierCommit)) constats.push({ resultat: NV, texte: `auteur du dernier commit non vérifiable (${raison(dernierCommit)})` });
  else {
    const admis = new Set((Array.isArray(proprietaires) ? proprietaires : []).filter((x) => typeof x === 'string' && x !== '').map((x) => x.toLowerCase()));
    const comptes = [dernierCommit.auteur, dernierCommit.committer].filter((x) => typeof x === 'string');
    if (admis.size === 0) constats.push({ resultat: NV, texte: 'propriétaire du dépôt inconnu' });
    else if (comptes.some((c) => admis.has(c.toLowerCase()))) constats.push({ resultat: OK, texte: `dernier commit ${court(dernierCommit.sha)} par ${comptes.join(' / ')}` });
    else constats.push({ resultat: ATTENTION, texte: `dernier commit ${court(dernierCommit.sha)} par ${comptes.join(' / ') || 'compte inconnu'}, pas par le propriétaire` });
  }
  const p = pire(constats);
  return { resultat: p.resultat, texte: `Version ${version ?? '?'}, Recette citée V${publiee ?? '?'}${p.texte ? ` ; ${p.texte}` : ''}` };
});

export const claude = controle('avant-9', 'CLAUDE.md', ({ texte }) => {
  if (illisible(texte) || typeof texte !== 'string') return { resultat: NV, texte: `CLAUDE.md illisible (${raison(texte)})` };
  const n = texte.length; // caractères comptés comme JavaScript (unités UTF-16, comme les outils de Claude Code)
  const marge = LIMITE_CLAUDE - n;
  const t = `${n} caractères (${new TextEncoder().encode(texte).length} octets), marge ${marge} (limite ${LIMITE_CLAUDE})`;
  if (marge < MARGE_CLAUDE_MIN) return { resultat: KO, texte: t };
  if (marge < MARGE_CLAUDE) return { resultat: ATTENTION, texte: t };
  // Les bilans comptent parfois en octets (wc -m hors UTF-8) : signalé si cette mesure-là n'a plus sa marge.
  const margeOctets = LIMITE_CLAUDE - new TextEncoder().encode(texte).length;
  if (margeOctets < MARGE_CLAUDE) return { resultat: ATTENTION, texte: `${t} ; compté en octets, marge ${margeOctets}` };
  return { resultat: OK, texte: t };
});

// run : dernière exécution réussie de Tests sur essai/complet-* ({ id, head_sha, head_branch } ou null) ; identique : contenu du code de dev
// identique à celui du run (git diff --quiet hors documentation) ; dernierComplet : contenu de tests/dernier-complet.json.
export const complet = controle('avant-10', 'palier complet', ({ run, identique, dernierComplet }) => {
  const constats = [];
  if (illisible(run)) constats.push({ resultat: NV, texte: `exécutions illisibles (${raison(run)})` });
  else if (!isObject(run)) constats.push({ resultat: KO, texte: 'aucun palier complet réussi sur une branche essai/complet-*' });
  else if (identique === true) constats.push({ resultat: OK, texte: `${run.head_branch} (${court(run.head_sha)}, ${run.id}) : même code que dev` });
  else if (identique === false) constats.push({ resultat: KO, texte: `palier complet à refaire sur le contenu final (${run.head_branch} ${court(run.head_sha)} ≠ dev hors documentation)` });
  else constats.push({ resultat: NV, texte: `${run.head_branch} (${court(run.head_sha)}) : comparaison impossible (${raison(identique)})` });
  if (dernierComplet === null) constats.push({ resultat: ATTENTION, texte: 'tests/dernier-complet.json vaut null (premier palier complet à enregistrer)' });
  else if (illisible(dernierComplet)) constats.push({ resultat: NV, texte: `tests/dernier-complet.json illisible (${raison(dernierComplet)})` });
  const p = pire(constats);
  return { resultat: p.resultat, texte: p.texte };
});

export const RACINE_SITE = ['index.html', 'Recette', 'dev', '404.html'];
// site : { sansBuild, erreur?, racine: [noms], canalRecette, canalDev } (canaux lus dans la balise zs-canal).
export const site = controle('avant-11', 'construction et site', ({ sansBuild, erreur, racine, canalRecette, canalDev }) => {
  if (sansBuild === true) return { resultat: NV, texte: 'sauté (--sans-build)' };
  if (typeof erreur === 'string') return { resultat: KO, texte: `construction ou assemblage en échec : ${erreur}` };
  if (!Array.isArray(racine)) return { resultat: NV, texte: 'site non lu' };
  const manque = RACINE_SITE.filter((n) => !racine.includes(n));
  const archives = racine.filter((n) => /^v\d+\.\d+$/.test(n));
  const constats = [];
  if (manque.length) constats.push({ resultat: KO, texte: `absents à la racine : ${liste(manque)}` });
  if (archives.length === 0) constats.push({ resultat: KO, texte: 'aucun dossier v0.* à la racine' });
  if (canalRecette !== 'release') constats.push({ resultat: KO, texte: `Recette/jeu.html : zs-canal « ${canalRecette ?? 'absent'} » (release attendu)` });
  if (canalDev !== 'dev') constats.push({ resultat: KO, texte: `dev/jeu.html : zs-canal « ${canalDev ?? 'absent'} » (dev attendu)` });
  const p = pire(constats);
  return { resultat: p.resultat, texte: p.texte || `racine : ${liste(racine, 12)} ; canaux release et dev` };
});

export const workflows = controle('avant-12', 'workflows', ({ fichiers }) => {
  if (illisible(fichiers) || !Array.isArray(fichiers)) return { resultat: NV, texte: `git diff impossible (${raison(fichiers)})` };
  if (fichiers.length === 0) return { resultat: OK, texte: '.github identique entre main et dev' };
  return { resultat: ATTENTION, texte: `.github change entre main et dev (pages.yml utilise l'assembleur de la branche qui déclenche : le déploiement de main changera) : ${liste(fichiers)}` };
});

// lotsNonFusionnes : [{ nom, sha }] des branches lot-* absentes de dev ; essais : nombre de branches essai/*.
export const branches = controle('avant-13', 'branches', ({ lotsNonFusionnes, essais }) => {
  if (illisible(lotsNonFusionnes) || !Array.isArray(lotsNonFusionnes)) return { resultat: NV, texte: `branches illisibles (${raison(lotsNonFusionnes)})` };
  const info = `${Number.isInteger(essais) ? essais : '?'} branche(s) essai/*`;
  if (lotsNonFusionnes.length === 0) return { resultat: OK, texte: `toutes les branches lot-* sont dans dev ; ${info}` };
  return { resultat: ATTENTION, texte: `lot-* non fusionnées dans dev : ${liste(lotsNonFusionnes.map((b) => `${b.nom} ${court(b.sha)}`))} ; ${info}` };
});

export const dependances = controle('avant-14', 'dépendances', ({ packageJson }) => {
  if (illisible(packageJson)) return { resultat: NV, texte: `package.json illisible (${raison(packageJson)})` };
  let data;
  try {
    data = typeof packageJson === 'string' ? JSON.parse(packageJson) : packageJson;
  } catch {
    return { resultat: KO, texte: 'package.json : JSON invalide' };
  }
  const deps = isObject(data) ? data.dependencies : undefined;
  if (deps === undefined || (isObject(deps) && Object.keys(deps).length === 0)) return { resultat: OK, texte: 'dependencies vide' };
  return { resultat: KO, texte: `dependencies non vide : ${liste(isObject(deps) ? Object.keys(deps) : [String(deps)])}` };
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Contrôles --apres
export const mainEgalDev = controle('apres-1', 'contenu de main = dev', ({ resume }) => {
  if (illisible(resume) || typeof resume !== 'string') return { resultat: NV, texte: `git diff impossible (${raison(resume)})` };
  return resume.trim() === '' ? { resultat: OK, texte: 'arbres identiques' } : { resultat: KO, texte: `arbres différents : ${resume.trim().split('\n').slice(-1)[0]}` };
});

export const pagesMain = controle('apres-2', 'Pages sur main', ({ mainSha, runs }) => {
  if (illisible(runs) || !Array.isArray(runs)) return { resultat: NV, texte: `exécutions illisibles (${raison(runs)})` };
  const pages = runs.filter((r) => isObject(r) && r.name === 'Pages');
  if (pages.length === 0) return { resultat: KO, texte: `aucune exécution de Pages sur ${court(mainSha)}` };
  if (pages.some((r) => r.status !== 'completed')) return { resultat: KO, texte: 'Pages en cours : relancer le contrôle à la fin' };
  const push = pages.filter((r) => r.event === 'push');
  if (push.length === 0) return { resultat: KO, texte: `Pages lancé à la main seulement (${liste(pages.map((r) => r.event))}) : jamais de déclenchement manuel sur main` };
  const dernier = push.reduce((a, b) => ((Number(b.id) || 0) > (Number(a.id) || 0) ? b : a));
  return dernier.conclusion === 'success' ? { resultat: OK, texte: `Pages réussi sur ${court(mainSha)} (${dernier.id})` } : { resultat: KO, texte: `Pages : ${dernier.conclusion} (${dernier.id})` };
});

// reponses : { chemin: { status, body } | { erreur } } ; latest : id de la Recette ; remplacee : id de la version archivée par la publication.
export function attentesAdresses(latest, remplacee) {
  const zsCanal = (canal) => (b) => b.includes(`<meta name="zs-canal" content="${canal}">`);
  const json = (fn) => (b) => {
    try {
      return fn(JSON.parse(b));
    } catch {
      return false;
    }
  };
  return [
    { chemin: '', status: 200, cle: 'page « en construction »', test: (b) => /en construction/i.test(b) },
    { chemin: 'Recette/', status: 200, cle: 'accueil', test: () => true },
    { chemin: 'Recette/jeu.html', status: 200, cle: 'zs-canal release', test: zsCanal('release') },
    { chemin: 'Recette/site-info.json', status: 200, cle: `recette.id = ${latest}, evolutions vide`, test: json((d) => d?.recette?.id === latest && Array.isArray(d.evolutions) && d.evolutions.length === 0) },
    { chemin: 'Recette/build-info.json', status: 200, cle: 'canal release', test: json((d) => d?.channel === 'release') },
    { chemin: 'dev/jeu.html', status: 200, cle: 'zs-canal dev', test: zsCanal('dev') },
    ...(typeof remplacee === 'string' ? [{ chemin: `${remplacee}/`, status: 200, cle: `version ${remplacee} archivée`, test: () => true }] : []),
    { chemin: 'recette/', status: 404, cle: 'redirection par 404.html vers Recette', test: (b) => b.includes('Recette') },
  ];
}

export const adresses = controle('apres-3', 'adresses du site', ({ reponses, latest, remplacee }) => {
  if (!isObject(reponses)) return { resultat: NV, texte: 'aucune adresse lue' };
  const constats = attentesAdresses(latest, remplacee).map((a) => {
    const r = reponses[a.chemin];
    if (illisible(r) || !isObject(r)) return { resultat: NV, texte: `/${a.chemin} : ${raison(r)}` };
    if (r.status !== a.status) return { resultat: KO, texte: `/${a.chemin} : HTTP ${r.status} (${a.status} attendu)` };
    if (!a.test(typeof r.body === 'string' ? r.body : '')) return { resultat: KO, texte: `/${a.chemin} : ${a.cle} attendu` };
    return { resultat: OK, texte: `/${a.chemin} ${r.status}` };
  });
  const p = pire(constats);
  if (constats.every((c) => c.resultat === NV)) return { resultat: NV, texte: `réseau indisponible ou refusé : ${constats[0]?.texte ?? ''}` };
  return { resultat: p.resultat, texte: p.texte };
});

export const mainAncetreApres = controle('apres-4', 'main ancêtre de dev', ({ ancetre }) => {
  if (ancetre === true) return { resultat: OK, texte: 'origin/main est un ancêtre de origin/dev' };
  if (ancetre === false) return { resultat: ATTENTION, texte: `ramener main dans dev : ${GESTE_MAIN_DANS_DEV}` };
  return { resultat: NV, texte: `git merge-base impossible (${raison(ancetre)})` };
});

export const dernierComplet = controle('apres-5', 'tests/dernier-complet.json', ({ valeur }) => {
  if (valeur === null) return { resultat: ATTENTION, texte: 'vaut encore null : enregistrer le palier complet (node scripts/tests/enregistrer-complet.mjs)' };
  if (illisible(valeur)) return { resultat: NV, texte: `illisible (${raison(valeur)})` };
  return { resultat: OK, texte: 'enregistré' };
});

export const aSupprimer = controle('apres-6', 'branches à supprimer (propriétaire)', ({ essais, lotsFusionnes }) => {
  if (!Array.isArray(essais) || !Array.isArray(lotsFusionnes)) return { resultat: NV, texte: `branches illisibles (${raison(Array.isArray(essais) ? lotsFusionnes : essais)})` };
  const tout = [...essais, ...lotsFusionnes];
  return { resultat: OK, texte: tout.length ? `information : ${liste(tout, 20)}` : 'aucune' };
});

export const AVANT = [fraicheur, dev, ciDev, mainAncetre, pullRequests, versions, noms, evolutions, seed, claude, complet, site, workflows, branches, dependances];
export const APRES = [fraicheur, mainEgalDev, pagesMain, adresses, mainAncetreApres, dernierComplet, aSupprimer];

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Résumé, tableau, code de sortie.
export const codeSortie = (resultats) => (Array.isArray(resultats) && resultats.some((r) => r?.resultat === KO) ? 1 : 0);

export function resume(resultats, mode = 'avant') {
  const list = Array.isArray(resultats) ? resultats.filter(isObject) : [];
  const ko = list.filter((r) => r.resultat === KO);
  const lignes = [];
  for (const r of list.filter((x) => x.resultat === ATTENTION)) lignes.push(`ATTENTION — ${r.controle} : ${r.detail}`);
  for (const r of list.filter((x) => x.resultat === NV)) lignes.push(`NON VÉRIFIABLE — ${r.controle} : ${r.detail}`);
  if (mode === 'apres') lignes.push(ko.length ? `PUBLICATION INCOMPLÈTE : ${ko.length} KO (${ko.map((r) => r.controle).join(', ')})` : 'PUBLICATION VÉRIFIÉE (aucun KO)');
  else lignes.push(ko.length ? `PAS PRÊT : ${ko.length} KO (${ko.map((r) => r.controle).join(', ')})` : 'PRÊT À PUBLIER');
  return lignes;
}

export function tableau(resultats) {
  const list = Array.isArray(resultats) ? resultats.filter(isObject) : [];
  return ['| contrôle | résultat | détail |', '|---|---|---|', ...list.map((r) => `| ${nettoyer(r.controle, 60)} | ${r.resultat} | ${nettoyer(r.detail)} |`)].join('\n');
}
