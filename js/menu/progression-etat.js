// Lot 8h : progression v2 du menu (zs.save.v2, Docs/ref/sauvegarde-v2.md) : un seul dépôt pour tout le menu (même choix que la partie : mémoire sous
// ?test=1 sauf store=local, lecture seule en mode essai), avec le canal entre onglets et la fusion (js/core/save-merge.js, chargé seulement quand un
// autre onglet se manifeste) et l'événement `storage` (un autre onglet a écrit : le menu se met à jour). Toute écriture du menu passe par commit()
// (opérations de js/core/progression.js : le prix est prélevé dans la même écriture que l'objet obtenu, jamais l'un sans l'autre).
import { createRepository } from '../save/index.js';
import { solde as soldeDe } from '../core/progression.js';
import { pageSearch } from '../game/graphics-boot.js';

// Identifiant unique d'opération ou d'achat : 8 chiffres hexadécimaux tirés par crypto (aucun générateur pseudo-aléatoire), plus un compteur de la page.
let compteur = 0;
export function nouvelId() {
  compteur += 1;
  try {
    return `${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')}${compteur.toString(36)}`;
  } catch {
    return `m${Date.now().toString(36)}${compteur.toString(36)}`;
  }
}

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
let chargement = null;

// donnees (facultatif) : { save, economy, stats } déjà chargés (preparerMenu) ; sinon demandés ici ; options : { search } (adresse, tests). Le
// premier appel crée le dépôt ; les suivants le rendent. → Promise<progression>.
export function chargerProgression(donnees = null, options = {}) {
  chargement ??= (donnees ? Promise.resolve([donnees.save, donnees.economy, donnees.stats]) : Promise.all(['save', 'economy', 'player-stats'].map((n) => json(`data/game/${n}.json`))))
    .then(([save, economy, stats]) => creerProgression({ save, economy, stats }, options));
  return chargement;
}

function stockage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function creerProgression(params, { search = pageSearch(), storage = stockage() } = {}) {
  const abonnes = new Set();
  const { repository, mode } = createRepository({
    search,
    storage,
    params,
    format: 'v2',
    listen: (handler) => {
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    persist: () => navigator.storage?.persist?.(),
    channel: () => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(params.save?.v2?.storageKey ?? 'zs.save.v2') : null),
    merge: () => import('../core/save-merge.js'),
    now: () => Date.now(),
  });
  let lu = repository.load();
  const prevenir = (refused) => {
    for (const f of [...abonnes]) {
      try {
        f(lu.save, refused);
      } catch {
        // un abonné qui lève ne bloque pas les autres
      }
    }
  };
  // Un autre onglet (ou une réparation entre onglets) a changé la progression ; refused : opérations de cet onglet annulées après coup.
  repository.subscribe((save, status, refused) => {
    lu = { ...lu, status: status ?? lu.status, save };
    prevenir(refused);
  });
  let persistance = false;
  return {
    params,
    mode,
    lire: () => lu,
    relire() {
      lu = repository.load();
      return lu;
    },
    solde: () => soldeDe(lu.save),
    // ops : opérations de js/core/progression.js. → { ok, refused: [{ id, raison }], error? } ; la progression lue est celle qui vient d'être écrite.
    commit(ops) {
      const r = repository.commit(ops, Date.now());
      if (!r.ok) return { ok: false, refused: [], error: r.error ?? 'error' };
      lu = { status: 'ok', save: r.save, warnings: [] };
      if (r.applied && !persistance && !mode.readOnly) {
        persistance = true;
        Promise.resolve(repository.requestPersistence()).catch(() => {});
      }
      prevenir(r.refused ?? []);
      return { ok: true, refused: r.refused ?? [] };
    },
    // Choix du Profil (avatar, pseudo) : le plus récent l'emporte entre onglets (date). → résultat de commit.
    choisir(champ, valeur) {
      return this.commit([{ id: nouvelId(), t: 'choix', champ, valeur, date: Date.now() }]);
    },
    // Nouveautés lues (écran Information) : seuls les identifiants pas encore gardés sont écrits ; rien de nouveau, aucune écriture.
    marquerLues(ids) {
      const deja = new Set(lu.save?.lues ?? []);
      const nouveaux = [...new Set(ids)].filter((id) => typeof id === 'string' && !deja.has(id));
      return nouveaux.length ? this.commit([{ id: nouvelId(), t: 'lues', ids: nouveaux }]) : { ok: true, refused: [] };
    },
    // Outil de débogage « Remettre la progression V0.8 à zéro » : efface zs.save.v2 seulement (jamais zs.save.v1).
    effacer() {
      const r = repository.clear();
      lu = repository.load();
      prevenir([]);
      return r;
    },
    info: () => repository.info(),
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
}
