// The screens inside the models (laptop, phone, the three Mac windows).
//
// Their content is real HTML pinned onto them (screen-overlay.js), so it is as sharp as the brain's question
// cards on any phone. On the GPU a screen only paints its glass: black while it is off, then its page colour
// fading up as it wakes (the HTML fades in on top). A Mac window's own plane hides while its HTML shows, so
// the rounded HTML corners are the window's corners. update(s) moves a screen from 0 (off) to 1 (awake).
import * as THREE from 'three';

const SPECS = {
  laptop: { frame: false, page: 0xf6f3ed },
  phone:  { frame: false, page: 0xf6f3ed },
  dash:   { frame: true, page: 0xfbf9f5 },
  editor: { frame: true, page: 0xfbf9f5 },
  inbox:  { frame: true, page: 0xfbf9f5 },
};
const cache = {};

export function getScreen(name) {
  if (cache[name]) return cache[name];
  const spec = SPECS[name];
  const U = { uS: { value: 0 }, uOff: { value: new THREE.Color(0x060607) }, uPage: { value: new THREE.Color(spec.page) }, uFrame: { value: spec.frame ? 1 : 0 } };
  const screen = {
    name, spec, textures: [], materials: [],
    get s() { return U.uS.value; },
    update(s) { U.uS.value = s; },
    // the HTML is on top: a window's plane steps aside (its rounded HTML corners are the window's corners)
    plain(v) { if (spec.frame) for (const m of screen.materials) m.visible = !v; },
    install(material) {
      material.map = null; screen.materials.push(material);
      material.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        sh.fragmentShader = 'uniform float uS, uFrame; uniform vec3 uOff, uPage;\n' +
          sh.fragmentShader.replace('#include <map_fragment>', `
            float wake = max(uFrame, smoothstep(0.02, 0.3, uS));
            vec4 page = vec4(mix(uOff, uPage, wake), 1.0);
            if (uS <= 0.0 && uFrame < 0.5) page = vec4(uOff, 1.0);        // off: black glass
            diffuseColor *= page;`);
      };
      material.customProgramCacheKey = () => 'screen-glass';
      material.needsUpdate = true;
      return material;
    },
  };
  return (cache[name] = screen);
}
