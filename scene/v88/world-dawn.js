// The dawn world (light grey, morning mist) that opens behind the night room as you scroll.
// Ground, terraces, monoliths and plinths carry their light and colour baked in Blender
// (blender/build_world_web.py), shown unlit; the gold rings under each service glow.
import * as THREE from 'three';
import { createStudioWorld, STUDIO_HORIZON } from './world-studio.js';

// where each service stands (three.js offsets from the brain's spot); must match build_world_web.py
export const STAGES = { website: [0, 0, 0], app: [2.0, 0, -4.6], game: [-2.0, 0, -9.2], ai: [2.0, 0, -13.8], desktop: [-2.0, 0, -18.4], location: [2.0, 0, -23.0], social: [-2.0, 0, -27.6] };
export const HORIZON = new THREE.Color(1.32, 1.34, 1.38);         // the mist and the low sky (scene-linear: AgX brings it to a light grey)

const DECODE = 'vec3 decodeBake(vec3 e){ return e * e * 4.0; }\n';

function bakedMaterial(tex, gain) {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, fog: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uGain = { value: gain };
    sh.fragmentShader = 'uniform float uGain;\n' + DECODE + sh.fragmentShader.replace('#include <map_fragment>',
      `vec4 bakedT = texture2D(map, vMapUv); diffuseColor.rgb = decodeBake(bakedT.rgb) * uGain;
       diffuseColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.006;`);
  };
  return m;
}

export const MONO_HORIZON = new THREE.Color(1.06, 1.08, 1.11);   // mono: a muted light grey world, so the white models stand out   // mono: a near-white mist and sky (scene-linear, through AgX)

export function createDawnWorld({ scene, gltf, version, mono = false, studio = false }) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const studioWorld = studio ? createStudioWorld(group, STAGES) : null;
  // sky: a soft vertical gradient with a warm glow where the sun is just up
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
    uniforms: { uDawn: { value: 0 }, uSun: { value: new THREE.Vector3(0.12, 0.24, -0.96).normalize() }, uHorizon: { value: mono ? MONO_HORIZON : studio ? STUDIO_HORIZON : HORIZON },
                uTop: { value: mono ? new THREE.Vector3(1.12, 1.14, 1.18) : new THREE.Vector3(1.08, 1.11, 1.18) }, uWarm: { value: mono ? 0 : 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uDawn, uWarm; uniform vec3 uSun, uHorizon, uTop; varying vec3 vD;
      void main(){
        float h = clamp(vD.y, -1.0, 1.0);
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.6, h));
        float s = max(dot(vD, uSun), 0.0);
        c += vec3(1.0, 0.86, 0.68) * (pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08) * uWarm;   // the sun's warmth, kept faint (none in mono)
        gl_FragColor = vec4(c, uDawn);
      }` }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  group.add(sky);
  const loader = new THREE.TextureLoader();
  const tex = name => { const t = loader.load(`assets/${name}.webp?${version}`); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; return t; };
  const mats = { ground: bakedMaterial(tex('world_ground'), mono ? 0.82 : 1.0), props: bakedMaterial(tex('world_props'), mono ? 0.85 : 1.0) };
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.66, 0.3).multiplyScalar(3), transparent: true, opacity: 0 });
  const rings = {};
  let ready = false, meta = null;
  const farMat = new THREE.MeshBasicMaterial({ color: mono ? new THREE.Color(0.7, 0.72, 0.76) : new THREE.Color(0.8, 0.82, 0.87), transparent: true, opacity: 0, fog: false, depthWrite: true });   // soft grey against the brighter mist
  const far = new THREE.Group(); group.add(far);
  far.visible = !studio;
  {
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const slab = (w, h, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), farMat); m.position.set(x, -0.95 + h / 2, z); far.add(m); };
    for (let i = 0; i < 12; i++) { const side = i % 2 ? 1 : -1; slab(0.8 + rnd() * 1.6, 5 + rnd() * 10, 0.8 + rnd(), side * (14 + rnd() * 22), -20 - rnd() * 42); }
    for (const [x, z, w, h] of [[-9, -46, 7, 9], [11, -58, 9, 12]]) {      // two great arches on the horizon
      slab(1.2, h, 1.2, x - w / 2, z); slab(1.2, h, 1.2, x + w / 2, z);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 1.2, 1.2), farMat); top.position.set(x, -0.95 + h + 0.6, z); far.add(top);
    }
  }
  // a soft contact shadow on every plinth top, so each floating model reads as standing on its plinth
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.45, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x2a2620, alphaMap: shadowTex, transparent: true, opacity: 0, depthWrite: false, fog: true,
                                                  polygonOffset: true, polygonOffsetFactor: -2 });
  new THREE.FileLoader().setResponseType('json').load(`assets/world.json?${version}`, m => {
    // Reuse the matching baked pedestal for the additional social stop.
    const offset = STAGES.social.map((v, i) => v - STAGES.desktop[i]);
    m.stages.social = { ...m.stages.desktop, offset: STAGES.social,
      plinth: m.stages.desktop.plinth.map((v, i) => v + offset[i]) };
    meta = m;
    for (const st of Object.values(m.stages)) {
      const sh = new THREE.Mesh(new THREE.CircleGeometry(st.radius * 0.78, 48), shadowMat);
      sh.rotation.x = -Math.PI / 2; sh.position.set(st.plinth[0], st.plinth[1] + 0.003, st.plinth[2]);
      group.add(sh);
    }
  });
  // Procedural plinths and glowing rings for all stations and hero brain
  const plinthGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.38, 48);
  const ringGeo = new THREE.TorusGeometry(1.08, 0.026, 16, 64);
  const allStages = { ...STAGES };
  for (const [name, pos] of Object.entries(allStages)) {
    const plinth = new THREE.Mesh(plinthGeo, studioWorld?.plinthMaterial || mats.props);
    plinth.name = `plinth_${name}`;
    plinth.position.set(pos[0], -0.76, pos[2]);
    group.add(plinth);

    const rMesh = new THREE.Mesh(ringGeo, ringMat.clone());
    rMesh.name = `ring_${name}`;
    rMesh.rotation.x = Math.PI / 2;
    rMesh.position.set(pos[0], -0.569, pos[2]);
    group.add(rMesh);
    rings[name] = rMesh;
  }
  rings['hero'] = rings['website'];
  ready = true;

  const tryLoad = (n = 2) => gltf.load(`assets/world.glb?${version}`, g => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      if (studio && /^(monolith|terrace)/.test(o.name)) { o.visible = false; return; }
      const mn = (o.material.name || '').toLowerCase();
      if (mn.startsWith('ring')) { o.material = ringMat.clone(); rings[o.name.replace(/^ring_/, '')] = o; }
      else if (studioWorld && o.name.startsWith('plinth_')) o.material = studioWorld.plinthMaterial;
      else o.material = mn.startsWith('ground') ? (studioWorld?.floorMaterial || mats.ground) : mats.props;
    });
    group.add(g.scene);
    group.traverse(o => { if (o === sky) return; o.updateMatrix(); o.matrixAutoUpdate = false; o.matrixWorldNeedsUpdate = true; });
  }, undefined, () => {});
  tryLoad();

  return {
    group, sky,
    get ready() { return ready; },
    get meta() { return meta; },
    // dawn: 0 night room .. 1 morning world; glow: per stage 0..1 (its ring lights as its service arrives)
    update(dawn, t, solidity = dawn, ringGlow = {}, overview = 0, camera = null, focus = null) {
      group.visible = dawn > 0.001;
      if (!group.visible) return;
      sky.material.uniforms.uDawn.value = dawn;
      const solid = solidity >= 0.999;
      for (const m of [mats.ground, mats.props]) { m.opacity = solidity; if (m.transparent === solid) { m.transparent = !solid; m.needsUpdate = true; } }
      shadowMat.opacity = 0.32 * solidity; farMat.opacity = solidity;
      studioWorld?.update(solidity, overview, camera, focus);
      // each ring wakes as the camera reaches its stage (dark gold until then): a quiet glow, the model is the subject
      for (const [k, r] of Object.entries(rings)) {
        const g = ringGlow[k] ?? 1;
        r.material.opacity = solidity;
        if (mono) r.material.color.setRGB(0.94, 0.94, 0.95);         // mono: a plain white ring, no glow
        else r.material.color.setRGB(1.0, 0.66, 0.3).multiplyScalar(0.35 + (3.25 + 0.6 * Math.sin(t * 1.4 + k.length)) * g);
      }
    },
  };
}
