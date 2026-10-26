// Copie Three.js (devDependency) vers vendor/three/ : le module et son fichier frère importé, la licence, la version.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'vendor/three';
const pkg = JSON.parse(readFileSync('node_modules/three/package.json', 'utf8'));
mkdirSync(OUT, { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) copyFileSync(`node_modules/three/build/${file}`, `${OUT}/${file}`);
copyFileSync('node_modules/three/LICENSE', `${OUT}/LICENSE-three.txt`);
writeFileSync(`${OUT}/version.json`, `${JSON.stringify({ version: pkg.version, license: pkg.license })}\n`);
console.log(`Three.js ${pkg.version} (${pkg.license}) copié dans ${OUT}/ (three.module.js, three.core.js, LICENSE-three.txt, version.json)`);
