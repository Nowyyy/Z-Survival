// Lot 8g (retour du propriétaire) : son du logo du studio. Original fourni par le propriétaire : Docs/studio/no-way-studio-logo-son.wav (WAV PCM 16 bits,
// stéréo, 44,1 kHz, 6,8 s, 1,2 Mo ; jamais retouché, non publié) ; copie dérivée publiée : assets/studio/no-way-studio-logo-son.mp3 (MP3 128 kbit/s
// stéréo, lu par tous les navigateurs, Safari compris), encodée par ffmpeg (outil du système, pas une dépendance du projet ; métadonnées retirées,
// sortie reproductible). Le fichier dérivé est commité : la CI n'a pas besoin de ffmpeg (un test vérifie sa somme SHA-256).
//
// Usage : node scripts/studio/son.mjs --ecrire
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const ORIGINAL = 'Docs/studio/no-way-studio-logo-son.wav';
export const SORTIE = 'assets/studio/no-way-studio-logo-son.mp3';
export const ARGS = ['-y', '-loglevel', 'error', '-i', ORIGINAL, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-codec:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-id3v2_version', '0', '-write_xing', '0', SORTIE];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--ecrire')) {
    console.log(`ffmpeg ${ARGS.join(' ')}`);
    process.exit(0);
  }
  const r = spawnSync('ffmpeg', ARGS, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`${SORTIE} écrit`);
}
