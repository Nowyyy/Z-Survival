// Lot 3g (retours du propriétaire) : mur percé autour du joueur caché, dans le shader des matières opaques (murs, atlas de props) : même calcul que
// js/core/see-through.js (seeThroughLevel), tramage par gl_FragCoord (discard), aucun matériau transparent. La passe d'ombre n'est pas touchée.
import * as THREE from 'three';

// uniforms partagés par toutes les matières percées ; set(x, z) : position du joueur (sol de la scène).
export function createSeeThrough(settings) {
  const uniforms = {
    uSeePlayer: { value: new THREE.Vector3(0, -1e6, 0) },
    uSeeOn: { value: settings ? 1 : 0 },
    uSeeRadius: { value: settings?.radius ?? 0 },
    uSeeEdge: { value: settings?.edge ?? 0.7 },
    uSeeMinY: { value: settings?.minY ?? 1 },
    uSeeFar: { value: settings?.far ?? 0.98 },
  };
  const apply = (material) => {
    if (!settings) return material;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSeeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;\nuniform vec3 uSeePlayer;\nuniform float uSeeOn;\nuniform float uSeeRadius;\nuniform float uSeeEdge;\nuniform float uSeeMinY;\nuniform float uSeeFar;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (uSeeOn > 0.5) {
    vec3 sd = uSeePlayer - cameraPosition;
    float st = dot(vSeeWorld - cameraPosition, sd) / max(dot(sd, sd), 1.0);
    if (st > 0.0 && st < uSeeFar && vSeeWorld.y > uSeeMinY) {
      float sr = length(vSeeWorld - (cameraPosition + sd * st));
      float sR = uSeeRadius * st;
      if (sr < sR) {
        vec2 sq = mod(floor(gl_FragCoord.xy), 2.0);
        if (sr < sR * uSeeEdge ? sq.x == sq.y : (sq.x + sq.y) < 0.5) discard;
      }
    }
  }`);
    };
    material.customProgramCacheKey = () => 'mur-perce';
    material.needsUpdate = true;
    return material;
  };
  return {
    uniforms,
    apply,
    set(x, z, chest = settings?.chest ?? 26) {
      uniforms.uSeePlayer.value.set(x, chest, z);
    },
    state: () => ({ on: uniforms.uSeeOn.value === 1, radius: uniforms.uSeeRadius.value, player: uniforms.uSeePlayer.value.toArray() }),
  };
}
