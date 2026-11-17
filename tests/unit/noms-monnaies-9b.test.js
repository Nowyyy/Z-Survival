import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appliquerOps, CHAMPS_STOCKES, defaultProgression, serialiser, solde, soldeDiamants } from '../../js/core/progression.js';

// Lot 9b (Docs/ref/economie.md, section « Noms ») : garde-fou des noms de monnaie. Les noms du code disent ce que le joueur voit : médailles (bronze,
// gagnées aux manches et au monde), diamants (gemme bleue, portes, milliers, paliers, premier monde, jour), Zollars (jaune). Seule exception : la
// table CHAMPS_STOCKES de js/core/progression.js, qui garde les champs stockés de zs.save.v2 et des codes ZS2 (« bleu » = médailles, « medailles » =
// diamants) pour la Recette V0.8. Ce test échoue si « bleu »/« blue » (au sens monnaie) ou « medaille » (au sens diamants) réapparaît ailleurs.

// Fichiers suivis lus : code, styles, pages, données, scripts et tests. Hors champ : documentation (Docs/, *.md : bilans et fiches gardent
// l'histoire), textes du propriétaire et journal affiché (noms-versions-et-lots.txt, data/changelog.json, versions.json), dépendances copiées, fichiers
// binaires, et ce fichier (il cite les motifs qu'il cherche).
const HORS_CHAMP = /^(Docs\/|vendor\/|fonts\/|assets\/|node_modules\/)|\.md$|^(noms-versions-et-lots\.txt|data\/changelog\.json|versions\.json|package-lock\.json|tests\/unit\/noms-monnaies-9b\.test\.js)$/;
const TEXTE = /\.(js|mjs|json|css|html|txt|yml)$/;
const fichiers = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && TEXTE.test(f) && !HORS_CHAMP.test(f));
const lignes = fichiers.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((texte, i) => ({ f, n: i + 1, texte })));
const ou = (l) => `${l.f}:${l.n}`;

// Seules lignes permises à citer un ancien nom : la table (définition de CHAMPS_STOCKES) et les lignes marquées « ancien nom (lot 9b) » (table des
// anciennes clés pour lire une base d'avant le lot, tests/unit/persos-jeu.test.js ; test qui vérifie l'absence d'un ancien texte).
const TABLE = (l) => (l.f === 'js/core/progression.js' && /^export const CHAMPS_STOCKES = /.test(l.texte)) || /\/\/ ancien nom \(lot 9b\)/.test(l.texte);
// Tenues des personnages : « bleu » y est une couleur de vêtement (identifiant de tenue, libellé, jeton --perso-tissu-bleu).
const TENUES = 'data/game/characters-v2.json';

// Couleurs (pas des monnaies) : jetons et mots dont la couleur est le sens.
const COULEURS = new Set(['color-money-blue', 'perso-tissu-bleu', 'assembleur', 'assembleurs', 'Assembleur', 'bleu', 'bleue', 'bleus', 'bleues', 'bleut', 'bleu-gris']);
// « bleu » employé comme nom de code : après une ponctuation de code (.bleu, 'bleu', "bleu", #bleu), clé ou appel (bleu:, bleu=, bleu(), variable
// (const bleu), propriété abrégée ou paramètre ({ bleu }, (x, bleu = 0)).
const BLEU_CODE = /[.'"`[#_$]bleu[es]?(?=[^\sA-Za-zÀ-ÿ-]|$)|(?:^|[^A-Za-zÀ-ÿ-])bleu[es]?(?=[:=(])|\b(?:const|let|var) bleu|[{(,]\s*bleu[es]?(?=\s*[,}=:)])/;
// Monnaie bleue dans un texte (commentaire, titre de test, note de données).
const BLEU_TEXTE = /monnaie bleue|solde bleu|bonus bleu|prime bleue|bleue? gagnée?s?|\b(?:la|une|les|de|des) bleues?\b|\d[\d\s ]* bleus\b|\bbleus? (?:de la partie|gardée?s?|en attente)/i;

describe('garde-fou des noms de monnaie (lot 9b)', () => {
  it('la table de correspondance existe une seule fois, à la frontière de la sauvegarde', () => {
    expect(CHAMPS_STOCKES).toEqual({ medailles: 'bleu', diamants: 'medailles' });
    expect(Object.isFrozen(CHAMPS_STOCKES)).toBe(true);
    const definitions = lignes.filter((l) => /\bCHAMPS_STOCKES\s*=/.test(l.texte)).map(ou);
    expect(definitions).toEqual([expect.stringMatching(/^js\/core\/progression\.js:/)]);
    // Ailleurs dans le code du jeu, la table n'est lue que par la sauvegarde (progression.js) : aucun module de js/ ne l'importe.
    expect(lignes.filter((l) => l.f.startsWith('js/') && l.f !== 'js/core/progression.js' && /CHAMPS_STOCKES/.test(l.texte)).map(ou)).toEqual([]);
  });

  it('« bleu »/« blue » au sens monnaie : aucun identifiant, clé, classe, fichier ni texte hors de la table', () => {
    const fautes = [];
    for (const l of lignes) {
      if (TABLE(l) || l.f === TENUES) continue;
      for (const m of l.texte.matchAll(/[A-Za-z0-9_$-]*(?:bleu|Bleu|BLEU|blue|Blue|BLUE)[A-Za-z0-9_$-]*/g)) {
        if (!COULEURS.has(m[0].replace(/^-+/, ''))) fautes.push(`${ou(l)} ${m[0]}`);
      }
      if (BLEU_CODE.test(l.texte) || BLEU_TEXTE.test(l.texte)) fautes.push(`${ou(l)} ${l.texte.trim().slice(0, 100)}`);
    }
    expect(fautes).toEqual([]);
    expect(fichiers.filter((f) => /bleu|blue/i.test(f))).toEqual([]);
  });

  it('« medaille » au sens diamants : anciens noms des sources de diamants absents, textes, couleurs et icônes accordés', () => {
    // Anciens identifiants qui désignaient les diamants (portes, milliers, paliers, monde, jour, simulateur, banque).
    const ANCIENS = /\bmedaille(?:Porte|Zombies|ZombiesPas|Palier|PalierPas|Monde|Jour)\b|\bmedaillesZombies\b|\bmedaillesPartie\b|onglets-medailles|\b(?:simulate|campagne)Medailles\b|\b(?:medVides|soldeMed|addMed|medGain|medTotal|medManche)\b/;
    expect(lignes.filter((l) => !TABLE(l) && ANCIENS.test(l.texte)).map((l) => `${ou(l)} ${l.texte.trim().slice(0, 80)}`)).toEqual([]);
    // Textes : une clé « medaille » ne parle jamais de diamants, une clé « diamant » jamais de médailles.
    const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
    for (const [k, v] of Object.entries(fr)) {
      if (/medaille/i.test(k)) expect(v, k).not.toMatch(/diamant/i);
      if (/diamant/i.test(k)) expect(v, k).not.toMatch(/médaille/i);
    }
    // Données : les sources de diamants sont des clés « diamant* » ; maxMedailles et maxDiamants plafonnent chacun leur solde.
    const eco = JSON.parse(readFileSync('data/game/economy.json', 'utf8'));
    expect(Object.keys(eco).filter((k) => /medaille/i.test(k))).toEqual(['maxMedailles']);
    expect(Object.keys(eco).filter((k) => /^diamant/.test(k)).sort()).toEqual(['diamantJour', 'diamantMonde', 'diamantPalier', 'diamantPalierPas', 'diamantPorte', 'diamantZombies', 'diamantZombiesPas']);
    // Styles : une règle « diamant » n'a jamais la couleur des médailles (bronze), une règle « medaille » jamais celle des diamants (gemme bleue).
    for (const f of ['css/game-ui.css', 'css/menu.css']) {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [sel, corps] = [m[1].trim(), m[2]];
        if (/diamant/.test(sel)) expect(corps, `${f} ${sel}`).not.toContain('--color-money-medaille');
        if (/medaille/.test(sel)) expect(corps, `${f} ${sel}`).not.toContain('--color-money-blue');
      }
    }
    // Icônes : dans jeu.html, une ligne « diamants » porte la gemme, une ligne « médailles » la médaille ; de même pour les blocs de la partie.
    const html = readFileSync('jeu.html', 'utf8');
    for (const m of html.matchAll(/<p id="([^"]*)" class="([^"]*)"[^>]*>([\s\S]*?)<\/p>/g)) {
      const nom = `${m[1]} ${m[2]}`;
      const propre = m[3].replace(/<span class="[^"]*(?:diamant|medaille)[^"]*">[\s\S]*$/, ''); // sans le solde voisin imbriqué (pause)
      if (/diamant/.test(nom)) expect(propre, m[1]).not.toContain('hud-medaille');
      if (/medaille/.test(nom)) expect(propre, m[1]).not.toContain('hud-gem');
    }
    const gains = readFileSync('js/game/gains-manche.js', 'utf8');
    expect(gains.slice(gains.indexOf('export function createMedaillesManche'), gains.indexOf('export const MEDAILLE_D'))).toMatch(/iconeMedaille\(\)/);
    expect(gains.slice(gains.indexOf('export function createDiamantsManche'))).toMatch(/iconeGemme\(\)/);
  });

  it('les noms du code suivent les gains : manches → médailles, portes et paliers → diamants ; champs stockés inchangés', () => {
    const params = { economy: JSON.parse(readFileSync('data/game/economy.json', 'utf8')) };
    const s = appliquerOps(defaultProgression(), [{ id: 'm', t: 'gain', medailles: 20 }, { id: 'd', t: 'gain', diamants: 10 }], 1, params).save;
    expect([solde(s), soldeDiamants(s), s.medailles.gagne, s.diamants.gagne]).toEqual([20, 10, 20, 10]);
    const ecrit = serialiser(s);
    expect([ecrit[CHAMPS_STOCKES.medailles], ecrit[CHAMPS_STOCKES.diamants]]).toEqual([{ gagne: 20, depense: 0 }, { gagne: 10, depense: 0, jour: 0 }]);
    expect(Object.hasOwn(ecrit, 'diamants')).toBe(false);
  });
});
