// Copie Phaser (devDependency) vers vendor/ : fichier minifié et licence. Ne jamais éditer vendor/phaser.min.js.
import { copyFileSync } from 'node:fs';

copyFileSync('node_modules/phaser/dist/phaser.min.js', 'vendor/phaser.min.js');
copyFileSync('node_modules/phaser/LICENSE.md', 'vendor/LICENSE-phaser.txt');
console.log('Phaser copié dans vendor/ (phaser.min.js, LICENSE-phaser.txt)');
