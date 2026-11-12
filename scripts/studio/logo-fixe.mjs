// Lot 8g : copie fixe du logo du studio (assets/studio/no-way-studio-logo-fixe.svg), dérivée par script de l'original fourni par le propriétaire
// (assets/studio/no-way-studio-logo-anime.svg, jamais retouché). Elle sert là où le logo doit rester immobile : sous prefers-reduced-motion
// (introduction, Crédits), sur l'écran de chargement et dans le menu à trois barres. Une image SVG affichée par <img> ne se fige pas de l'extérieur :
// d'où cette copie. Transformation : la feuille <style> de l'original est remplacée par l'état final de ses animations (celui qu'il donne lui-même
// sous prefers-reduced-motion : aucune animation, plaque inclinée de −4°) ; le bloc <metadata> (manifeste C2PA de l'original, dont la signature ne
// vaudrait plus pour une copie modifiée) est retiré. Rien d'autre ne change (formes, couleurs, viewBox, nom accessible).
//
// Usage : node scripts/studio/logo-fixe.mjs (vérifie : code 1 si la copie manque ou diffère) · node scripts/studio/logo-fixe.mjs --ecrire
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const ORIGINAL = 'assets/studio/no-way-studio-logo-anime.svg';
export const FIXE = 'assets/studio/no-way-studio-logo-fixe.svg';
export const STYLE_FIXE = '<style>.tilt{transform:rotate(-4deg)}</style>';

// Texte de l'original → texte de la copie fixe. Lève une erreur si l'original n'a pas exactement une feuille <style> et au plus un <metadata>.
export function logoFixe(svg) {
  const styles = svg.match(/<style>[\s\S]*?<\/style>/g) ?? [];
  if (styles.length !== 1) throw new Error(`une seule feuille <style> attendue (${styles.length})`);
  if (!/prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\.tilt\{transform:rotate\(-4deg\)\}\}/.test(styles[0])) {
    throw new Error('état fixe de l\'original introuvable (règle prefers-reduced-motion)');
  }
  const metas = svg.match(/<metadata>[\s\S]*?<\/metadata>/g) ?? [];
  if (metas.length > 1) throw new Error('plusieurs blocs <metadata>');
  let out = svg.replace(styles[0], STYLE_FIXE);
  if (metas.length) out = out.replace(metas[0], '');
  return out.replace(/\s+xmlns:c2pa="[^"]*"/, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const attendu = logoFixe(readFileSync(resolve(ROOT, ORIGINAL), 'utf8'));
  if (process.argv.includes('--ecrire')) {
    writeFileSync(resolve(ROOT, FIXE), attendu);
    console.log(`${FIXE} écrit (${Buffer.byteLength(attendu)} octets)`);
  } else {
    let actuel = null;
    try {
      actuel = readFileSync(resolve(ROOT, FIXE), 'utf8');
    } catch {
      // absente
    }
    if (actuel !== attendu) {
      console.error(`${FIXE} absente ou périmée : node scripts/studio/logo-fixe.mjs --ecrire`);
      process.exit(1);
    }
    console.log(`${FIXE} à jour`);
  }
}
