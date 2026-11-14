// Lot 8d ; lot 8h : état de l'équipement du Personnage, de l'inventaire, des personnages et des tenues, DÉRIVÉ de la progression v2 (zs.save.v2,
// js/menu/progression-etat.js) : catalogue (data/menu/raretes.json, objets.json, personnages.json) et état au format de js/core/equipement.js
// ({ objets: [{ uid, id, rarete, niveau }], porte, persos, choisi, debloques }). Chaque geste (équiper, améliorer, fusionner, choisir, acheter…)
// devient une opération de js/core/progression.js écrite tout de suite ; le prix est prélevé en monnaie bleue dans la même écriture que ce qui est
// obtenu ; une opération refusée (solde, inventaire plein, autre onglet) ne change rien. Chargé à la demande : à la première ouverture de l'onglet
// Personnage ou de la Boutique, ou à « JOUER » ; jamais au démarrage du menu.
import { creerEtatEquipement, EMPLACEMENTS, equiper, etatFusion, fusionner, infoAmelioration, infoPersonnage, lireCatalogue, obtenirPersonnages, objetDe, personnageDe, retirer, statistiquesEffectives, choisirPersonnage, estDebloque } from '../core/equipement.js';
import { chargerProgression, nouvelId } from './progression-etat.js';

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export { nouvelId }; // lot 8h : identifiants d'opération (js/menu/progression-etat.js)

// État au format de js/core/equipement.js d'après la progression v2 (objets inconnus du catalogue écartés, niveaux bornés à leur maximum).
export function etatDepuis(save, cat) {
  const base = creerEtatEquipement(cat, null);
  const objets = (save?.objets ?? [])
    .map((o) => {
      const d = cat.objets.get(o.i)?.raretes[o.r];
      return d ? Object.freeze({ uid: o.u, id: o.i, rarete: o.r, niveau: Math.min(d.niveauMax, Math.max(1, o.n)) }) : null;
    })
    .filter(Boolean);
  const porte = Object.fromEntries(EMPLACEMENTS.map((e) => [e, objets.some((o) => o.uid === save?.porte?.[e]) ? save.porte[e] : null]));
  const debloques = Object.freeze([...(save?.persos?.debloques ?? [])]);
  const persos = { ...base.persos };
  for (const [id, n] of Object.entries(save?.persos?.niveaux ?? {})) if (personnageDe(cat, id)) persos[id] = Math.min(personnageDe(cat, id).niveauMax, n);
  const etat = Object.freeze({ ...base, objets: Object.freeze(objets), porte: Object.freeze(porte), persos: Object.freeze(persos), debloques, choisi: null });
  const voulu = personnageDe(cat, save?.persos?.choisi);
  const choisi = voulu && estDebloque(etat, voulu) ? voulu.id : cat.personnages.find((p) => estDebloque(etat, p))?.id ?? null;
  return Object.freeze({ ...etat, choisi });
}

let chargement = null;

// → Promise<{ cat, erreurs, prog, etat(), solde(), collection(), achetees(jour), abonner(f), statistiques(base, params, persoId?), actions… }>.
// Chaque action renvoie { ok, raison? ('solde' | 'plein' | 'absent' | 'niveau' | 'offre' | 'invalide' | 'refuse' | 'ecriture'), … }.
export function chargerEquipement() {
  chargement ??= Promise.all([...['raretes', 'objets', 'personnages'].map((n) => json(`data/menu/${n}.json`)), chargerProgression()]).then(([raretes, objets, personnages, prog]) => {
    const { cat, erreurs } = lireCatalogue({ raretes, objets, personnages, inventaire: null });
    // Catalogue donné au format v2 : un objet inconnu (ancienne arme d'un essai, objet retiré du catalogue) est retiré à la prochaine écriture.
    prog.params.catalogue = new Map([...cat.objets].map(([id, o]) => [id, { type: o.type, raretes: Object.keys(o.raretes) }]));
    let etat = etatDepuis(prog.lire().save, cat);
    const abonnes = new Set();
    prog.abonner((save, refused) => {
      etat = etatDepuis(save, cat);
      for (const f of [...abonnes]) f(etat, refused);
    });

    // Personnages débloqués par les données (catalogue) mais absents de la progression : ajoutés une fois, à leur niveau de départ, avant une
    // opération qui en a besoin (choisir, améliorer, obtenir un doublon).
    const debloquerDonnees = () => {
      const manquants = cat.personnages.filter((p) => p.debloque && !etat.debloques.includes(p.id)).map((p) => ({ id: p.id, niveau: p.niveauDepart }));
      return manquants.length ? [{ id: nouvelId(), t: 'debloquer', persos: manquants }] : [];
    };
    // Écrit des opérations ; résultat de la dernière (la principale).
    const ecrire = (ops) => {
      const r = prog.commit(ops);
      if (!r.ok) return { ok: false, raison: r.error === 'locked' ? 'verrouille' : 'ecriture' };
      const refus = r.refused.find((x) => x.id === ops.at(-1).id);
      return refus ? { ok: false, raison: refus.raison } : { ok: true };
    };
    const now = () => Date.now();
    const solde = () => prog.solde();

    return {
      cat,
      erreurs,
      prog,
      etat: () => etat,
      solde,
      // Tenues obtenues : { id: 1 } (forme de js/core/caisses.js ajouterCosmetiques).
      collection: () => Object.freeze(Object.fromEntries((prog.lire().save?.tenues ?? []).map((id) => [id, 1]))),
      // Offres du jour déjà achetées (clés) pour ce jour local.
      achetees: (jour) => (prog.lire().save?.offres?.jour === jour ? [...prog.lire().save.offres.achetees] : []),
      abonner(f) {
        abonnes.add(f);
        return () => abonnes.delete(f);
      },
      statistiques: (base, params, persoId) => statistiquesEffectives(base, etat, cat, params, persoId),

      // --- Équipement (gratuit) -------------------------------------------------------------------------------------------------------------
      equiper(uid, emplacement = null) {
        const n = equiper(etat, cat, uid, emplacement);
        if (n === etat) return { ok: false, raison: 'invalide' };
        return ecrire([{ id: nouvelId(), t: 'choix', champ: 'porte', valeur: { ...n.porte }, date: now() }]);
      },
      retirer(cible) {
        const n = retirer(etat, cible);
        if (n === etat) return { ok: false, raison: 'invalide' };
        return ecrire([{ id: nouvelId(), t: 'choix', champ: 'porte', valeur: { ...n.porte }, date: now() }]);
      },
      // --- Dépenses (monnaie bleue) ---------------------------------------------------------------------------------------------------------
      ameliorer(uid) {
        const info = infoAmelioration(etat, cat, uid);
        const o = objetDe(etat, uid);
        if (!info.possible || !o) return { ok: false, raison: 'niveau' };
        if (solde() < info.prix) return { ok: false, raison: 'solde' };
        return ecrire([{ id: nouvelId(), t: 'ameliorer', u: uid, de: o.niveau, prix: info.prix }]);
      },
      fusionner(places) {
        const f = etatFusion(etat, cat, places);
        if (!f.possible) return { ok: false, raison: 'invalide', uid: null };
        if (solde() < f.prix) return { ok: false, raison: 'solde', uid: null };
        const apercu = fusionner(etat, cat, places); // niveau du résultat (règle de js/core/equipement.js)
        const nouveau = objetDe(apercu.etat, apercu.uid);
        const id = nouvelId();
        const r = ecrire([{ id, t: 'fusion', uids: places.slice(0, 3), nouveau: { u: `${id}.0`, i: nouveau.id, r: nouveau.rarete, n: nouveau.niveau }, prix: f.prix }]);
        return { ...r, uid: r.ok ? `${id}.0` : null };
      },
      choisirPersonnage(id) {
        if (choisirPersonnage(etat, cat, id) === etat) return { ok: false, raison: 'invalide' };
        return ecrire([...debloquerDonnees(), { id: nouvelId(), t: 'choix', champ: 'choisi', valeur: id, date: now() }]);
      },
      ameliorerPersonnage(id) {
        const info = infoPersonnage(etat, cat, id);
        if (!info?.peutAmeliorer) return { ok: false, raison: 'niveau' };
        if (solde() < info.prix) return { ok: false, raison: 'solde' };
        return ecrire([...debloquerDonnees(), { id: nouvelId(), t: 'perso', perso: id, de: info.niveau, prix: info.prix }]);
      },
      // Achat d'objets (caisse d'équipement, offre du jour) : uid uniques ; offre : { jour, cle } (une fois par jour). → { ok, raison?, uids }.
      acheterObjets({ prix, objets, offre = null }) {
        if (!Array.isArray(objets) || objets.length === 0 || !objets.every((o) => cat.objets.get(o.id)?.raretes[o.rarete])) return { ok: false, raison: 'invalide', uids: [] };
        if (etat.objets.length + objets.length > cat.inventaireMax) return { ok: false, raison: 'plein', uids: [] };
        if (solde() < prix) return { ok: false, raison: 'solde', uids: [] };
        const id = nouvelId();
        const uids = objets.map((_, i) => `${id}.${i}`);
        const r = ecrire([{ id, t: 'achat', prix, place: cat.inventaireMax, objets: objets.map((o, i) => ({ u: uids[i], i: o.id, r: o.rarete })), offre }]);
        return { ...r, uids: r.ok ? uids : [] };
      },
      // Achat de personnages (caisse de personnages) : issues calculées par la règle de js/core/equipement.js (nouveau ou un niveau de plus).
      acheterPersonnages({ prix, ids }) {
        const apercu = obtenirPersonnages(etat, cat, ids);
        if (apercu.issues.length !== ids.length) return { ok: false, raison: 'invalide', issues: [] };
        if (solde() < prix) return { ok: false, raison: 'solde', issues: [] };
        const persos = ids.map((pid) => ({ id: pid, max: personnageDe(cat, pid).niveauMax, depart: personnageDe(cat, pid).niveauDepart }));
        const r = ecrire([...debloquerDonnees(), { id: nouvelId(), t: 'achat', prix, persos }]);
        return { ...r, issues: r.ok ? apercu.issues : [] };
      },
      // Achat de tenues (caisse de cosmétiques).
      acheterTenues({ prix, ids }) {
        if (solde() < prix) return { ok: false, raison: 'solde' };
        return ecrire([{ id: nouvelId(), t: 'achat', prix, tenues: ids }]);
      },
      // --- Outils de débogage (canaux source et dev seulement : js/menu/debogage.js) -------------------------------------------------------
      ajouterBleu(n) {
        return ecrire([{ id: nouvelId(), t: 'gain', bleu: n }]);
      },
      async donnerDemo() {
        const demo = await json('data/menu/inventaire-depart.json');
        const objetsDemo = (demo?.objets ?? []).filter((o) => cat.objets.get(o.id)?.raretes[o.rarete]);
        if (objetsDemo.length === 0) return { ok: false, raison: 'invalide' };
        if (etat.objets.length + objetsDemo.length > cat.inventaireMax) return { ok: false, raison: 'plein' };
        const id = nouvelId();
        const uid = new Map(objetsDemo.map((o, i) => [o.uid, `${id}.${i}`]));
        const porte = Object.fromEntries(EMPLACEMENTS.map((e) => [e, uid.get(demo?.equipement?.[e]) ?? null]));
        const achat = { id, t: 'achat', prix: 0, place: cat.inventaireMax, objets: objetsDemo.map((o) => ({ u: uid.get(o.uid), i: o.id, r: o.rarete })) };
        const niveaux = objetsDemo.filter((o) => o.niveau > 1).flatMap((o) => Array.from({ length: Math.min(o.niveau, cat.objets.get(o.id).raretes[o.rarete].niveauMax) - 1 }, (_, k) => ({ id: nouvelId(), t: 'ameliorer', u: uid.get(o.uid), de: k + 1, prix: 0 })));
        return ecrire([achat, ...niveaux, { id: nouvelId(), t: 'choix', champ: 'porte', valeur: porte, date: now() }]);
      },
      debloquerTous() {
        return ecrire([{ id: nouvelId(), t: 'debloquer', persos: cat.personnages.map((p) => ({ id: p.id, niveau: p.niveauDepart })) }]);
      },
      remettreAZero: () => prog.effacer(),
    };
  });
  return chargement;
}
