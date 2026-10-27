// Service 01, Website: rose-gold aluminium laptop with a black keyboard.
// Its pieces fly in from the dark and mend, the lid opens, and the ASHZIZ landing page loads on the
// screen. Precision panels and keycaps retain the original layout, with reversible assembly.
// Shared kintsugi material helpers below still serve the other models.
import * as THREE from 'three';
import { getScreen } from './screen-deck.js';
import { milledPanel, refineLaptop, createProceduralLaptopSource } from './laptop-model.js';
import { fragmentState, laptopTimeline } from './fragment-motion.js';
import { fractureShell, afterFractureCache } from './product-fracture.js';

const DECODE = 'vec3 decodeBake(vec3 e){ return e * e * 4.0; }\n';
const GOLD = new THREE.Color(1.0, 0.72, 0.32);
export const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = x => Math.min(1, Math.max(0, x));
export const outQuart = t => 1 - Math.pow(1 - t, 4);
export const outCubic = t => 1 - Math.pow(1 - t, 3);

// ---------------------------------------------------------------- materials
// The finish every model shares, set by index.html before the services are made: black metal with gold
// gradients and detail (uGrad 1, the brain's finish, reflecting the studio envMap) or the old white porcelain (uGrad 0).
export const FINISH_U = { uGrad: { value: 1 }, uVeins: { value: 1 }, uBumpK: { value: 1 }, envMap: null };
// three's perturbNormalArb: a height that changes from pixel to pixel tilts the normal (the detail layers use it)
const BUMP_GLSL = 'vec3 bumpN(vec3 sp, vec3 sn, vec2 dH, float fd){ vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp)); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx); float det = dot(sx, r1) * fd; return normalize(abs(det) * sn - sign(det) * (dH.x * r1 + dH.y * r2)); }\n';
const SEAM_GLSL = `
  uniform vec3 uSeeds[16]; uniform int uN;
  float lh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float ln3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(lh(i), lh(i+vec3(1,0,0)), f.x), mix(lh(i+vec3(0,1,0)), lh(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(lh(i+vec3(0,0,1)), lh(i+vec3(1,0,1)), f.x), mix(lh(i+vec3(0,1,1)), lh(i+vec3(1,1,1)), f.x), f.y), f.z); }
  // distance to the wall of this point's Voronoi cell (seam units): the crack between two pieces
  float seamEdge(vec3 p){
    float d1 = 1e9; int a = 0;
    for (int i = 0; i < 16; i++) { if (i >= uN) break; vec3 d = p - uSeeds[i]; float q = dot(d, d); if (q < d1) { d1 = q; a = i; } }
    vec3 sa = uSeeds[a]; float md = 1e9;
    for (int i = 0; i < 16; i++) { if (i >= uN) break; if (i == a) continue; vec3 sb = uSeeds[i];
      md = min(md, (dot(p - sb, p - sb) - d1) / (2.0 * length(sb - sa))); }
    return md;
  }
`;

// A piece is one Voronoi cell, so its own seed and its nearest neighbours draw every seam on it:
// 14 seeds instead of the whole set keeps the seam shader cheap.
export function seamSubset(group, K, c, n = 14) {
  const q = [c.x * K * group.squash[0], c.y * K * group.squash[1], c.z * K * group.squash[2]];
  const seeds = group.seeds.map(s => [s, (s[0] - q[0]) ** 2 + (s[1] - q[1]) ** 2 + (s[2] - q[2]) ** 2])
    .sort((a, b) => a[1] - b[1]).slice(0, n).map(a => a[0]);
  return { seeds, squash: group.squash };
}

export function porcelainMaterial(color, group, K, lightTex, LU, self = null) {
  const seeds = Array.from({ length: 16 }, (_, i) => new THREE.Vector3(...(group.seeds[i] || [999, 999, 999])));
  const uni = { uSeeds: { value: seeds }, uN: { value: Math.min(16, group.seeds.length) }, uSq: { value: new THREE.Vector3(...group.squash) }, uLMGain: { value: 0.5 },
                uK: { value: K }, uLM: { value: lightTex }, uSelf: self || { value: 0 }, uFlow: { value: 0 }, ...LU,
                uGrad: FINISH_U.uGrad, uVeins: FINISH_U.uVeins, uBumpK: FINISH_U.uBumpK };
  const black = FINISH_U.uGrad.value > 0;
  const m = new THREE.MeshPhysicalMaterial(black ? {
    // black metal under a clear coat, reflecting the studio: the brain's finish (a touch rougher, for the flat panels)
    color: 0x0e0e10, roughness: 0.3, metalness: 0.82, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
    envMap: FINISH_U.envMap, side: THREE.DoubleSide } : {
    // flat panels mirror the studio's softboxes far more than the round brain does: a softer, dimmer glaze
    color, roughness: 0.3, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.16,
    envMapIntensity: 0.5, side: THREE.DoubleSide,
    envMapRotation: new THREE.Euler(0, 2.6, 0) });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'uniform vec3 uSq;\nuniform float uK;\nvarying vec3 vSeamP;\nvarying vec2 vLMuv;\nvarying vec3 vWorldL;\nvarying vec3 vObjW;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSeamP = position * uK * uSq; vLMuv = uv; vWorldL = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vObjW = position * length(modelMatrix[0].xyz);                  // the model's own space at world size: detail stays put as it moves`);
    sh.fragmentShader = 'uniform sampler2D uLM;\nuniform float uLMGain, uSelf, uFlow, uGrad, uVeins, uBumpK;\nuniform float uTime, uFlare, uGlow, uHoverAmt, uBuild;\nuniform vec3 uHover;\nvarying vec3 vSeamP;\nvarying vec2 vLMuv;\nvarying vec3 vWorldL;\nvarying vec3 vObjW;\n' +
      DECODE + SEAM_GLSL + BUMP_GLSL + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        // a little jag and a swelling width, kept inside the gold so the real crack never shows
        vec3 sp = vSeamP + (vec3(ln3(vSeamP * 9.0), ln3(vSeamP * 9.0 + 7.1), ln3(vSeamP * 9.0 + 3.7)) - 0.5) * 0.008;
        float sd = seamEdge(sp);
        float wf = mix(0.6, 1.25, ln3(vSeamP * 0.64 + 2.0));
        float fw = fwidth(sd);
        float gold = 1.0 - smoothstep(0.017 * wf - fw * 0.5, 0.025 * wf + fw * 0.5, sd);
        // a soft shade either side of the lacquer, like the raised bead of the render, gives the gold depth
        float bead = mix(0.78, 1.0, smoothstep(0.025 * wf, 0.06 * wf + fw, sd));
        // black metal and gold as gradients (the brain's finish): how open each point is to the light comes from
        // its Cycles bake, so corners and undersides sit deep and the faces toward the sky lift to gunmetal
        float lmL = dot(decodeBake(texture2D(uLM, vLMuv).rgb), vec3(0.3, 0.59, 0.11));
        float cv = smoothstep(0.04, 0.9, lmL);
        float up = smoothstep(-0.4, 0.9, normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz).y);
        float aura = (1.0 - gold) * (1.0 - smoothstep(0.025 * wf, 0.07 * wf + fw, sd));
        // the smaller cracks of kintsugi: fine gold hairlines meandering through the black, in patches
        // (two octaves, so on a flat panel they run jagged like real cracks instead of looping like smooth noise)
        float rv = abs(ln3(vObjW * 7.0 + 3.1) * 0.62 + ln3(vObjW * 21.0 + 9.4) * 0.38 - 0.5);
        float vein = (1.0 - smoothstep(0.0, 0.022 + fwidth(rv) * 1.2, rv)) * smoothstep(0.62, 0.72, ln3(vObjW * 2.2 + 7.0)) * (1.0 - gold) * uVeins * uGrad;
        float goldish = max(gold, vein * 0.9);
        vec3 blk = mix(vec3(0.0025, 0.0025, 0.003), vec3(0.032, 0.033, 0.037), pow(cv, 1.4) * (0.4 + 0.6 * up));
        blk = mix(blk, vec3(0.06, 0.032, 0.008), aura * 0.4);
        float gt = dot(vObjW, normalize(vec3(0.55, 0.75, -0.35))) * 1.7 + uTime * 0.03;
        float tri = abs(fract(gt) * 2.0 - 1.0);
        vec3 gc = mix(mix(vec3(0.34, 0.15, 0.02), vec3(0.8, 0.47, 0.09), smoothstep(0.0, 0.55, tri)), vec3(1.0, 0.85, 0.5), smoothstep(0.6, 1.0, tri));
        gc *= 0.9 + 0.4 * cv;
        diffuseColor.rgb *= mix(bead, 1.0, uGrad);
        diffuseColor.rgb = mix(diffuseColor.rgb, blk, uGrad);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.9, 0.58, 0.2), gc, uGrad), goldish);       // white finish: deeper than the brain's, flat gold mirrors more sky`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float leafN = ln3(vObjW * 90.0);
        roughnessFactor = mix(roughnessFactor - cv * 0.06 * uGrad, mix(0.3, 0.22, uGrad) + (leafN - 0.5) * 0.12 * uGrad, goldish);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 1.0, goldish);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // detail: the gold stands proud of the black (a soft bevel along every seam and hairline), the gold has a
          // beaten-leaf crinkle, the black a fine hammered grain; each layer fades before it is finer than a pixel
          float lod = length(fwidth(vObjW));
          float hRaise = (1.0 - smoothstep(0.012 * wf, 0.045 * wf, sd)) + vein * 0.45;
          float hLeaf = (leafN - 0.5) * 0.6 * gold * (1.0 - smoothstep(0.35, 0.8, lod * 90.0));
          float hHam = (ln3(vObjW * 55.0) - 0.5) * 0.12 * (1.0 - gold) * (1.0 - smoothstep(0.35, 0.8, lod * 55.0));   // gentler than the brain's: flat panels show every ripple
          float hD = (hRaise + hLeaf + hHam) * uGrad * uBumpK;
          normal = bumpN(-vViewPosition, normal, vec2(dFdx(hD), dFdy(hD)), faceDirection);
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat *= 1.0 - goldish;                               // bare gold: no glaze over the seams`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        irradiance += decodeBake(texture2D(uLM, vLMuv).rgb) * PI * uLMGain;   // the room's light, baked in Cycles (Cycles reads brighter than the brain's bake)`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // black metal: the sun and the rim light would glare off every flat panel like silver; the studio's soft boxes
        // give the highlights instead (the brain keeps its rim light: it is round, so it only catches an edge)
        reflectedLight.directSpecular *= mix(1.0, 0.15, uGrad);
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect *= mix(1.0, 0.15, uGrad);
        #endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          // corners and undersides hold less of the studio: reflections fall away there, so every edge and panel reads
          float so = mix(1.0, mix(0.35, 1.1, cv), uGrad);
          reflectedLight.indirectSpecular *= so; reflectedLight.indirectDiffuse *= so;
          #ifdef USE_CLEARCOAT
            clearcoatSpecularIndirect *= mix(1.0, mix(0.5, 1.0, cv), uGrad);
          #endif
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hv = uHoverAmt * exp(-pow(distance(vWorldL, uHover) / 0.35, 2.0));
        totalEmissiveRadiance += vec3(1.0, 0.6, 0.2) * gold * (0.12 + 1.6 * uFlare + 0.5 * uGlow + 2.2 * hv);
        totalEmissiveRadiance += vec3(1.0, 0.55, 0.18) * 0.05 * hv;
        totalEmissiveRadiance += vec3(1.0, 0.82, 0.58) * uSelf * (1.0 - gold);   // backlight / inner glow
        totalEmissiveRadiance += vec3(1.0, 0.45, 0.06) * goldish * 0.2 * uGrad;  // the gold keeps its warmth against the grey morning
        // the shine: a glint of light runs across the gold every few seconds
        float gs = dot(vObjW, normalize(vec3(-0.6, 0.35, 0.72)));
        totalEmissiveRadiance += vec3(1.0, 0.84, 0.5) * goldish * exp(-pow((gs - (mod(uTime * 0.3, 3.4) - 1.7)) / 0.08, 2.0)) * 1.6 * uGrad;
        // light running through the cracks (AI chip): bright bands travel along the seams
        float run = pow(0.5 + 0.5 * sin(dot(vSeamP, vec3(1.3, 0.4, 1.7)) * 2.2 - uTime * 3.0), 6.0);
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.22) * gold * uFlow * (0.4 + 3.0 * run);`);
  };
  return m;
}

// the broken faces of a piece: gold lacquer, molten while the pieces are apart
export function moltenMaterial(LU) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: LU.uTime, uBuild: LU.uBuild },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uBuild; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 p = vP * 2.6 + vec3(0.0, uTime * 0.25, uTime * 0.1);
        float n = n3(p) * 0.6 + n3(p * 2.3) * 0.4;
        float veins = 1.0 - smoothstep(0.0, 0.08, abs(n - 0.5));
        vec3 deep = vec3(0.32, 0.08, 0.005), hot = vec3(0.95, 0.45, 0.06), white = vec3(1.0, 0.8, 0.4);
        vec3 c = mix(deep, hot, smoothstep(0.25, 0.8, n)) + white * veins * 1.2;
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec3 molten = c * (1.2 + 1.2 * fres) * 1.5;
        vec3 mended = vec3(0.5, 0.33, 0.12);                               // once whole, the cracks read as quiet gold
        gl_FragColor = vec4(mix(molten, mended, smoothstep(0.85, 1.0, uBuild)), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------- the landing page on the screen
// A finished 4K image designed in tools/screens/laptop.html; the GPU plays its load-in (screen-deck.js).

// Laptop-specific anodised aluminium; other services keep their shared finish.
function roseGoldMaterial() {
  const grain=new Uint8Array(128*128*4);let seed=17;
  for(let i=0;i<grain.length;i+=4){seed=seed*16807%2147483647;const v=225+Math.floor(seed/2147483647*30);grain[i]=grain[i+1]=grain[i+2]=v;grain[i+3]=255;}
  const finish=new THREE.DataTexture(grain,128,128);finish.wrapS=finish.wrapT=THREE.RepeatWrapping;
  finish.repeat.set(36,24);finish.minFilter=THREE.LinearMipmapLinearFilter;finish.magFilter=THREE.LinearFilter;
  finish.generateMipmaps=true;finish.anisotropy=8;finish.needsUpdate=true;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xedc3b2, metalness: 0.68, roughness: 0.36, roughnessMap:finish,
    clearcoat: 0.04, clearcoatRoughness: 0.45,
    envMap: FINISH_U.envMap, envMapIntensity: 1.3, envMapRotation:new THREE.Euler(0,1.1,0),
  });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      irradiance += vec3(0.56, 0.55, 0.54) * PI;`)
      .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        reflectedLight.directSpecular *= 0.32;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect *= 0.32;
        #endif`);
  };
  m.customProgramCacheKey=()=> 'laptop-anodised-2';
  return m;
}

function keyLegendAtlas() {
  const labels = [
    'esc','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','⏻',
    '`','1','2','3','4','5','6','7','8','9','0','−','=','delete',
    'tab','Q','W','E','R','T','Y','U','I','O','P','[',']','\\',
    'caps','A','S','D','F','G','H','J','K','L',';',"'",'return',
    'shift','Z','X','C','V','B','N','M',',','.','/','shift',
    '↑','fn','control','option','⌘','','⌘','option','←','↓','→',
  ];
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#e6e7ea'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  labels.forEach((label,i) => {
    ctx.font = `${label.length > 2 ? 30 : 48}px Helvetica, Arial, sans-serif`;
    ctx.fillText(label, (i % 16 + 0.5) * 128, (Math.floor(i / 16) + 0.52) * 128);
  });
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 16;
  return { labels, material: new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }) };
}

function appleBadge(manager) {
  const map = new THREE.TextureLoader(manager).load('assets/laptop-apple-logo.png?v=rose-1');
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 16;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshPhysicalMaterial({
    color: 0x241e20, metalness: 0.9, roughness: 0.29, envMap: FINISH_U.envMap, envMapIntensity: .6,
    map, transparent: true, alphaTest: 0.25, depthWrite: false, side: THREE.DoubleSide,
  }));
}

// ---------------------------------------------------------------- the service
export function createWebsiteService({ gltf, manager, scene, U, version, stage = [0, 0, 0], light = '_light_dawn' }) {
  const LU = { uTime: U.uTime, uFlare: { value: 0 }, uGlow: { value: 0 }, uHoverAmt: { value: 0 },
               uHover: { value: new THREE.Vector3(99, 99, 99) }, uBuild: { value: 0 } };
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const lidHinge = new THREE.Group(), lidInner = new THREE.Group();
  root.add(lidHinge); lidHinge.add(lidInner);
  const pieces = [], pickables = [];
  const fixedDetails=[];
  let seed=71;
  const rand=()=>((seed=seed*16807%2147483647)/2147483647);
  const motion=c=> {
    const dir=c.clone().sub(new THREE.Vector3(.1127,1,-.7));
    dir.y+=.6;if(dir.lengthSq()<.01)dir.set(rand()-.5,rand(),rand()-.5);dir.normalize();
    const from=dir.multiplyScalar((.7+rand()*.55)/meta.root.scale);
    from.z*=.55;
    const axis=new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).normalize();
    return {from,q0:new THREE.Quaternion().setFromAxisAngle(axis,(rand()-.5)*5),delay:rand()*.18};
  };
  const deckDetails = new THREE.Group(), lidDetails = new THREE.Group();
  root.add(deckDetails); lidInner.add(lidDetails);
  const screen = getScreen('laptop');
  const screenMat = screen.install(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.38, metalness: 0, clearcoat: .15, clearcoatRoughness: .32, envMapIntensity: .3, envMap: FINISH_U.envMap });
  // the screen lights the keys and the deck as it boots
  const screenLight = new THREE.PointLight(0xdfe6ff, 0, 1.6, 1.4);
  lidInner.add(screenLight);
  let meta = null, ready = false, hingeLocal = new THREE.Vector3(), lidClosed = 1.8;
  const lightTex = new THREE.Texture(); lightTex.flipY = false; lightTex.colorSpace = THREE.NoColorSpace;
  const retry = (loader, url, onLoad, tries = 4) => loader.load(url, onLoad, undefined, () => { if (tries > 1) setTimeout(() => retry(loader, url, onLoad, tries - 1), 700); });
  retry(new THREE.ImageLoader(manager), `assets/laptop${light}.webp?${version}`, img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { lightTex.image = img; lightTex.needsUpdate = true; }));   // decoded off the main thread before the upload
  const defaultLaptopMeta = {
    root: { position: [0, 0.12, 0], rotationY: 0.15, scale: 0.28 },
    hinge: [0.1127, 0.24, -1.9],
    lidClosed: 1.8,
    center: [0.1127, 1.1, -1.0]
  };
  let buildStarted = false;
  const triggerBuild = (m, g) => {
    if (buildStarted) return;
    buildStarted = true;
    meta = m || defaultLaptopMeta;
    afterFractureCache(() => build(g || createProceduralLaptopSource()));
  };
  retry(new THREE.FileLoader(manager).setResponseType('json'), `assets/laptop.json?${version}`, m => {
    meta = m || defaultLaptopMeta;
    gltf.load(`assets/laptop.glb?${version}`, g => triggerBuild(meta, g), undefined, () => {
      triggerBuild(meta, createProceduralLaptopSource());
    });
  }, 2);
  setTimeout(() => { if (!buildStarted) triggerBuild(defaultLaptopMeta, createProceduralLaptopSource()); }, 1200);

  function build(g) {
    const r = meta.root;
    root.position.fromArray(r.position).add(new THREE.Vector3(...stage)); root.rotation.y = r.rotationY; root.scale.setScalar(r.scale);
    hingeLocal.fromArray(meta.hinge); hingeLocal.y=.24; lidClosed = meta.lidClosed;
    lidHinge.position.copy(hingeLocal); lidInner.position.copy(hingeLocal).multiplyScalar(-1);
    screenLight.position.set(0, 2.4, -1.2);              // in front of the display, model units
    const shellMat = roseGoldMaterial();
    const deckMat=shellMat.clone();
    deckMat.onBeforeCompile=sh=> {
      shellMat.onBeforeCompile(sh);
      sh.vertexShader='varying vec3 deckPosition;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n deckPosition=position;');
      sh.fragmentShader=`varying vec3 deckPosition;
        float deckSlot(vec2 p, vec2 halfSize, float r){vec2 q=abs(p)-halfSize+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
        `+sh.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
          if(deckPosition.y>.20 &&
            (deckSlot(deckPosition.xz-vec2(.128,-.442),vec2(2.845,1.015),.065)<0.0 ||
             deckSlot(deckPosition.xz-vec2(.1127,1.31),vec2(1.44,.65),.075)<0.0)) discard;`);
    };
    deckMat.customProgramCacheKey=()=> 'laptop-recessed-deck-1';
    const keysMat = new THREE.MeshPhysicalMaterial({ color: 0x101114, metalness: 0.03, roughness: 0.63, clearcoat: 0, envMap: FINISH_U.envMap, envMapIntensity: 0.35 });
    g=refineLaptop(g,shellMat,keysMat,bezelMat);
    const molten = new THREE.MeshStandardMaterial({ color: 0xc78d7a, metalness: 0.75, roughness: 0.32, envMap: FINISH_U.envMap, side: THREE.DoubleSide });
    const nodes = [...g.scene.children];
    g.scene.updateMatrixWorld(true);
    const bodyNodes = nodes.filter(n => n.name.startsWith('body_'));
    const deckHeight = (x,z) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));
      return ray.intersectObjects(bodyNodes,true)[0]?.point.y ?? 0.25;
    };
    const grilleHeights = [-2.94,3.15].map(x=>deckHeight(x,-0.45));
    const lidRay = new THREE.Raycaster(new THREE.Vector3(0.1127,2.15,-5),new THREE.Vector3(0,0,1));
    const badgeSurface = lidRay.intersectObjects(nodes.filter(n=>n.name.startsWith('lid_')),true)[0];
    const cameraRay = new THREE.Raycaster(new THREE.Vector3(0.1127,4.025,0),new THREE.Vector3(0,0,-1));
    const cameraSurface = cameraRay.intersectObjects(nodes.filter(n=>n.name.startsWith('bezel_')),true)[0];
    // All key caps share one material and all legends share one atlas.
    const legends = keyLegendAtlas();
    for (const n of nodes) {
      const kind = n.name.split('_')[0];                  // body | lid | key | bezel | screen
      const onLid = kind === 'lid' || kind === 'bezel' || kind === 'screen' || kind === 'display';
      const b = new THREE.Box3().setFromObject(n), c = b.getCenter(new THREE.Vector3());
      const porc = kind === 'key' ? keysMat : kind==='body' ? deckMat : shellMat;
      const moltenMeshes = [];
      n.traverse(o => {
        if (!o.isMesh) return;
        const mn = o.material.name;
        if (kind === 'screen') o.material = screenMat;
        else if (kind === 'bezel' || kind === 'display') o.material = bezelMat;
        else if (mn.startsWith('molten')) { o.material = molten; moltenMeshes.push(o); }
        else o.material = porc;
        o.userData.service = 'website';
        pickables.push(o);
      });
      const pivot = new THREE.Group(); pivot.position.copy(c);
      n.position.sub(c); pivot.add(n);
      if (kind === 'key') {
        const i = Number(n.name.split('_')[1]);
        if (legends.labels[i]) {
          const size = b.getSize(new THREE.Vector3());
          const geo = new THREE.PlaneGeometry(size.x * 0.86, size.z * 0.86);
          const uv = geo.attributes.uv;
          for(let j=0;j<uv.count;j++) uv.setXY(j, (i%16+uv.getX(j))/16, 1-(Math.floor(i/16)+1-uv.getY(j))/8);
          const label = new THREE.Mesh(geo, legends.material); label.name = 'legend_'+i;
          label.rotation.x = -Math.PI/2; label.position.set(0, b.max.y-c.y+0.0015, 0);
          pivot.add(label);
        }
      }
      (onLid ? lidInner : root).add(pivot);
      pieces.push({pivot,c,...motion(c),kind,landed:false,molten:moltenMeshes});
    }
    // A dark polished Apple mark on the back of the display; follows the hinge.
    const badge = appleBadge(manager); badge.name = 'apple-logo';
    if (badgeSurface) {
      badge.position.copy(badgeSurface.point).addScaledVector(badgeSurface.face.normal,0.004);
      badge.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),badgeSurface.face.normal);
      badge.rotateZ(Math.PI);
    }
    root.userData.badgeSurface = badgeSurface ? {point:badgeSurface.point.toArray(), normal:badgeSurface.face.normal.toArray()} : null;
    lidDetails.add(badge);
    if (cameraSurface) {
      const webcam = new THREE.Mesh(new THREE.CircleGeometry(0.026,24), new THREE.MeshPhysicalMaterial({color:0x07101c,metalness:0.4,roughness:0.17,clearcoat:1,envMap:FINISH_U.envMap}));
      webcam.name='webcam'; webcam.position.copy(cameraSurface.point).addScaledVector(cameraSurface.face.normal,0.002);
      webcam.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),cameraSurface.face.normal); lidDetails.add(webcam);
    }
    // Fine perforations beside the keyboard, drawn in a single texture per grille.
    const grilleCanvas = document.createElement('canvas'); grilleCanvas.width=128; grilleCanvas.height=1024;
    const gc=grilleCanvas.getContext('2d'); gc.fillStyle='#453334';
    for(let y=8;y<1024;y+=10) for(let x=8;x<128;x+=10) { gc.beginPath();gc.arc(x,y,1.8,0,Math.PI*2);gc.fill(); }
    const grilleMap=new THREE.CanvasTexture(grilleCanvas); grilleMap.anisotropy=16;
    const grilleMat=new THREE.MeshBasicMaterial({map:grilleMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    for(const [i,x] of [-2.94,3.15].entries()) {
      const grille=new THREE.Mesh(new THREE.PlaneGeometry(0.21,1.82),grilleMat);
      grille.name='speaker-grille'; grille.rotation.x=-Math.PI/2; grille.position.set(x,grilleHeights[i]+0.002,-0.45);deckDetails.add(grille);
    }
    const detail=(name,w,h,d,r,mat,x,y,z,rx=-Math.PI/2,ry=0)=> {
      const mesh=milledPanel(w,h,d,r,Math.min(.004,d/3),mat);mesh.name=name;
      mesh.rotation.set(rx,ry,0);mesh.position.set(x,y,z);deckDetails.add(mesh);return mesh;
    };
    // Recessed cavity floors stay with the chassis when the modules lift out.
    const cavityMat=new THREE.MeshStandardMaterial({color:0x242327,metalness:.35,roughness:.65,envMap:FINISH_U.envMap});
    detail('keyboard-cavity',5.72,2.06,.018,.065,cavityMat,.128,.085,-.442);
    detail('trackpad-cavity',2.91,1.33,.018,.075,cavityMat,.1127,.085,1.31);
    // A shallow keyboard well and almost-flush glass trackpad, with a hairline reveal.
    detail('keyboard-well',5.69,2.03,.035,.065,keysMat,.128,.215,-.442);
    const revealMat=new THREE.MeshStandardMaterial({color:0x956e63,metalness:.55,roughness:.5,envMap:FINISH_U.envMap});
    detail('trackpad-reveal',2.88,1.30,.030,.075,revealMat,.1127,.213,1.31);
    const trackMat=shellMat.clone();trackMat.roughness=.47;trackMat.color.setHex(0xe0ad9e);trackMat.onBeforeCompile=shellMat.onBeforeCompile;trackMat.customProgramCacheKey=shellMat.customProgramCacheKey;
    detail('glass-trackpad',2.856,1.276,.010,.065,trackMat,.1127,.227,1.31);
    detail('hinge-spine',5.86,.105,.10,.05,keysMat,.1127,.238,-1.86);
    // Port liners, inset tongues and contact pins; sidewall planes stay flush to the enclosure.
    const portMat=new THREE.MeshStandardMaterial({color:0x090a0d,roughness:.72});
    for(const [i,z] of [-1.18,-.72].entries()) {
      detail(`usb-c-rim-${i}`,.31,.088,.004,.036,revealMat,-3.303,.12,z,0,-Math.PI/2);
      detail(`usb-c-port-${i}`,.276,.061,.005,.028,portMat,-3.306,.12,z,0,-Math.PI/2);
      detail(`usb-c-tongue-${i}`,.19,.014,.006,.006,keysMat,-3.310,.12,z,0,-Math.PI/2);
    }
    detail('magsafe-liner',.40,.078,.005,.025,portMat,-3.306,.12,-1.67,0,-Math.PI/2);
    for(let i=0;i<5;i++)detail(`magsafe-contact-${i}`,.028,.022,.007,.008,revealMat,-3.312,.12,-1.79+i*.06,0,-Math.PI/2);
    const jack=new THREE.Mesh(new THREE.CircleGeometry(.044,32),portMat);jack.name='headphone-port';jack.rotation.y=Math.PI/2;jack.position.set(3.529,.12,-1.25);deckDetails.add(jack);
    const footMat=new THREE.MeshStandardMaterial({color:0x29282a,roughness:.9});
    for(const x of [-2.65,2.87])for(const z of [-1.51,1.79]) {
      const foot=new THREE.Mesh(new THREE.CylinderGeometry(.15,.14,.025,32),footMat);foot.name='rubber-foot';foot.position.set(x,-.01,z);deckDetails.add(foot);
      const screw=new THREE.Mesh(new THREE.CircleGeometry(.018,16),revealMat);screw.name='underside-screw';screw.rotation.x=Math.PI/2;screw.position.set(x,-.001,z+(z<0?.24:-.24));deckDetails.add(screw);
    }
    // Attach small details to their shell so they travel with the structural panels.
    // The large well/trackpad/hinge are independent components in the assembly sequence.
    for(const group of [deckDetails,lidDetails])for(const mesh of [...group.children]) {
      const kind=mesh.name==='webcam'?'bezel':group===lidDetails?'lid':'body';
      const owner=pieces.filter(p=>p.kind===kind).sort((a,b)=>a.c.distanceToSquared(mesh.position)-b.c.distanceToSquared(mesh.position))[0];
      if(['keyboard-well','trackpad-reveal','glass-trackpad','hinge-spine','keyboard-cavity','trackpad-cavity'].includes(mesh.name)) {
        group.remove(mesh);
        const cols=mesh.name.startsWith('keyboard')?8:mesh.name==='hinge-spine'?12:4;
        const rows=mesh.name==='hinge-spine'?1:3;
        for(const shard of fractureShell(mesh,cols,rows)) {
          shard.position.copy(mesh.position);shard.updateMatrix();shard.geometry.applyMatrix4(shard.matrix);
          shard.position.set(0,0,0);shard.quaternion.identity();shard.scale.setScalar(1);
          const c=new THREE.Box3().setFromObject(shard).getCenter(new THREE.Vector3());
          const pivot=new THREE.Group();pivot.position.copy(c);shard.position.sub(c);pivot.add(shard);root.add(pivot);
          pieces.push({pivot,c,...motion(c),kind:'detail',molten:[]});
        }
      } else if(owner) {mesh.position.sub(owner.c);owner.pivot.add(mesh);fixedDetails.push(mesh);}
    }
    root.userData.finish='rose-gold'; root.userData.keyLegends=legends.labels.filter(Boolean).length;
    root.userData.refinement='precision-chassis-v1';
    root.userData.motion='radial-fragments-v2';
    ready = true;
  }

  let landedCount = 0;
  // f: 0 scattered .. 1 mended; open: 0 closed .. 1 open; s: screen 0 off .. 1 loaded
  function pose(f, open, exit = 0, hingeLift = 0) {
    landedCount = 0;
    for (const p of pieces) {
      const state=fragmentState(f,exit,p.delay),t=state.joined,x=state.released;
      p.pivot.position.copy(p.c).addScaledVector(p.from,state.scatter*state.scatter*(innerWidth<innerHeight?.55:1));
      p.pivot.quaternion.slerpQuaternions(new THREE.Quaternion(),p.q0,Math.min(1,state.scatter));
      p.pivot.scale.setScalar(Math.max(.001,state.size));
      p.pivot.visible=state.visible;
      // Whole screen is only the HTML projection anchor after every shard has joined.
      if(p.kind==='screen') {
        p.pivot.visible=f>=1 && exit===0;
        p.pivot.position.copy(p.c);p.pivot.quaternion.identity();p.pivot.scale.setScalar(1);
      }
      if(p.kind==='display')p.pivot.visible=state.visible && !(f>=1 && exit===0);
      for(const m of p.molten)m.visible=t<1 || x>0;
      p.t=t;p.exit=x;if(t>=1&&x===0)landedCount++;
    }
    for(const d of fixedDetails)d.visible=f>=1 && exit===0;
    lidHinge.rotation.x = lidClosed * (1 - open);
    lidHinge.position.y=hingeLocal.y+hingeLift;
    deckDetails.visible = lidDetails.visible = f > 0.98;
  }

  const hoverLift = { v: 0, p: 0 };
  return {
    root, pickables, lightTex, pieces, keepAssembled:false, // exposed for geometry and motion QA
    get ready() { return ready; },
    pose,
    // w: this section's scroll (0 hero .. 1 settled); hover: 0..1 with the world point under the cursor
    update(w, dt, hover, hoverPoint, exit = 0) {
      if (!ready) return { landed: 0 };
      root.visible = w > 0.22 && exit < 1;
      if(!root.visible)screen.update(0);
      if (!root.visible) return { landed: 0 };
      const {f,open,departure,hingeLift,screen:s}=laptopTimeline(w,exit,this.keepAssembled);
      pose(f,open,departure,hingeLift);
      // gold flares as the last pieces land, then settles to a warm glow
      const mend = Math.exp(-Math.pow((w - 0.66) / 0.035, 2));
      LU.uFlare.value = 0.9 * mend + 0.25 * (f > 0 && f < 1 ? 1 : 0);
      LU.uBuild.value = f;
      // hover: the laptop lifts toward you and the seams warm under the cursor
      // Exact critically damped spring: frame-rate independent, with no hover overshoot.
      const target=hover?1:0,omega=10,d=hoverLift.p-target,c=hoverLift.v+omega*d,decay=Math.exp(-omega*dt);
      hoverLift.p=target+(d+c*dt)*decay;hoverLift.v=(hoverLift.v-omega*c*dt)*decay;
      LU.uHoverAmt.value += ((hover ? 1 : 0) - LU.uHoverAmt.value) * (1 - Math.exp(-dt * 6));
      if (hoverPoint) LU.uHover.value.lerp(hoverPoint, 0.3);
      LU.uGlow.value = 0.3 * hoverLift.p;
      const r = meta.root;
      root.position.set(r.position[0] + stage[0], r.position[1] + stage[1] + 0.035 * hoverLift.p, r.position[2] + stage[2]);
      root.rotation.y = r.rotationY + 0.05 * hoverLift.p;
      // the screen: a quick power-on, then the page draws itself in
      const power = smooth(s, 0, 0.14);
      screenMat.color.setScalar(power);
      screenLight.intensity = 0.06 * power;
      screen.update(s);
      return { landed: landedCount, total: pieces.length, f, open, s };
    },
  };
}
