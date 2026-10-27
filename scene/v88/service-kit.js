// Shared loader for the service models (02 to 05), built by blender/build_service_web.py.
// Node names are <group>__<kind>_<nn>. Every group turns about its own centre, every piece flies
// in from the dark and mends; the service module adds its own story on top.
import * as THREE from 'three';
import { fragmentState } from './fragment-motion.js';
import { afterFractureCache } from './product-fracture.js';
import { porcelainMaterial, moltenMaterial, seamSubset, clamp01, outQuart, outCubic, FINISH_U } from './service-website.js';

// a dropped request (busy server, flaky network) must not leave a model missing: retry a few times
export function retryLoad(loader, url, onLoad, tries = 4) {
  loader.load(url, onLoad, undefined, () => { if (tries > 1) setTimeout(() => retryLoad(loader, url, onLoad, tries - 1), 700); });
}

export function loadService({ name, gltf, manager, scene, U, version, screens = {}, modelFactory, productMotion = false, onReady, defer = job => { while (!job()); }, lightmaps = null, stage = [0, 0, 0], light = '_light_dawn' }) {
  const LU = { uTime: U.uTime, uFlare: { value: 0 }, uGlow: { value: 0 }, uHoverAmt: { value: 0 },
               uHover: { value: new THREE.Vector3(99, 99, 99) }, uBuild: { value: 0 }, uFlow: { value: 0 } };
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const svc = { name, root, LU, groups: {}, pieces: [], pickables: [], nodes: {}, meta: null, ready: false,
                selfGlow: { value: 0 }, extras: [], productMotion, flyOut: true, keepAssembled: false };
  const given = lightmaps && lightmaps[name];                     // the page may have loaded it already, under its loader
  const lightTex = given || new THREE.Texture(); lightTex.flipY = false; lightTex.colorSpace = THREE.NoColorSpace;
  svc.lightTex = lightTex;                                       // the warm-up uploads it ahead of time (it hides in the shader)
  if (!given) retryLoad(new THREE.ImageLoader(manager), `assets/${name}${light}.webp?${version}`, img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { lightTex.image = img; lightTex.needsUpdate = true; }));   // decoded off the main thread before the upload
  const defaultMetas = {
    app: { root: { position: [0, 0.27, 0], rotation: [0, -0.818, 0], scale: 0.72 }, center: [0, 0, 0], groups: { phone: { pivot: [0, 0, 0], min: [-0.6, -1.2, -0.2], max: [0.6, 1.2, 0.2] } }, seams: {}, K: 1 },
    game: { root: { position: [0, -0.10, 0], rotation: [-0.15, -0.785, 0], scale: 3.4 }, center: [0, 0, 0], groups: { pad: { pivot: [0, 0, 0], min: [-1.0, -0.8, -0.4], max: [1.0, 0.8, 0.4] } }, seams: {}, K: 1 },
    ai: { root: { position: [0, -0.45, 0], rotation: [0.28, -0.937, 0], order: 'YXZ', scale: 0.78 }, center: [0, 0, 0], groups: { cpu: { pivot: [0, 0.08, 0], min: [-0.9, 0, -0.9], max: [0.9, 0.16, 0.9] }, socket: { pivot: [0, 0, 0], min: [-1.2, -0.1, -1.2], max: [1.2, 0.05, 1.2] }, lever: { pivot: [0, 0.04, 1.12], min: [-1.1, 0, 1.0], max: [1.1, 0.08, 1.2] }, pcb: { pivot: [0, -0.04, 0], min: [-1.1, -0.08, -1.1], max: [1.1, 0, 1.1] } }, seams: {}, K: 1 },
    desktop: { root: { position: [0, -0.23, 0], rotation: [0.08, 2.34, 0], scale: 7.5 }, center: [0, 0, 0], groups: { mini: { pivot: [0, 0, 0], min: [-0.065, -0.025, -0.065], max: [0.065, 0.028, 0.065] } }, seams: {}, K: 1 },
    location: { root: { position: [0, -0.48, 0], rotation: [0, -0.83, 0], scale: 1.0 }, center: [0, 0, 0], groups: { pin: { pivot: [0, 0.62, 0], min: [-0.4, 0, -0.1], max: [0.4, 1.05, 0.1] }, dot: { pivot: [0, 0.62, 0], min: [-0.12, 0.5, -0.12], max: [0.12, 0.74, 0.12] } }, seams: {}, K: 1 }
  };
  let buildStarted = false;
  const triggerAssemble = m => {
    if (buildStarted) return;
    buildStarted = true;
    svc.meta = m || defaultMetas[name] || { root: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }, center: [0, 0, 0], groups: {}, seams: {}, K: 1 };
    const assemble = g => { const steps = build(g); defer(() => steps.next().done); };
    if (modelFactory) afterFractureCache(() => assemble(modelFactory(svc.meta)));
    else retryLoad(gltf, `assets/${name}.glb?${version}`, assemble);
  };
  retryLoad(new THREE.FileLoader(manager).setResponseType('json'), `assets/${name}.json?${version}`, m => {
    triggerAssemble(m);
  }, 2);
  setTimeout(() => { if (!buildStarted) triggerAssemble(defaultMetas[name]); }, 1000);

  function* build(g) {
    const m = svc.meta, r = m.root;
    root.position.fromArray(r.position).add(new THREE.Vector3(...stage)); root.rotation.set(r.rotation[0], r.rotation[1], r.rotation[2], r.order || 'YXZ');
    root.scale.setScalar(r.scale);
    svc.base = { position: root.position.clone(), rotation: root.rotation.clone() };
    const seamNames = Object.keys(m.seams);
    const porcelain = {};
    const seamOf = name => m.seams[m.nodes[name]] || m.seams[seamNames[0]];
    // one material per piece, each carrying only the seeds near it (same shader program for all)
    svc.porcelainFor = (seam, self, c) => porcelainMaterial(0xf4f1ea, seamSubset(m.seams[seam] || m.seams[seamNames[0]], m.K, c || new THREE.Vector3()), m.K, lightTex, LU, self);
    const molten = moltenMaterial(LU);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.8, envMap: FINISH_U.envMap });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xe8a94e, metalness: 1, roughness: 0.24, envMapIntensity: FINISH_U.envMap ? 1.3 : 0.9,
                                                  emissive: 0x6b3a08, emissiveIntensity: 0.35, envMap: FINISH_U.envMap });   // the studio's soft boxes give it bright and deep bands
    svc.materials = { porcelain, molten, glass, gold };
    for (const [gname, gi] of Object.entries(m.groups)) {
      const outer = new THREE.Group(), inner = new THREE.Group();
      outer.position.fromArray(gi.pivot); inner.position.fromArray(gi.pivot).multiplyScalar(-1);
      outer.add(inner); root.add(outer);
      svc.groups[gname] = { outer, inner, info: gi, pivot: new THREE.Vector3().fromArray(gi.pivot) };
    }
    const center = new THREE.Vector3().fromArray(m.center);
    const toModel = 1 / r.scale;                         // fly-in distances are set in scene units
    let rng = 11; const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
    let built = 0;
    for (const n of [...g.scene.children]) {
      if (++built % 8 === 0) yield;
      const [gname, kn = ''] = n.name.split('__');
      const kind = kn.replace(/_\d+$/, '');
      const b = new THREE.Box3().setFromObject(n), c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
      let porc = null; const moltenMeshes = [];
      n.traverse(o => {
        if (!o.isMesh) return;
        const mn = o.material.name || '';
        if (modelFactory) { /* Purpose-built product geometry retains its authored materials. */ }
        else if (kind === 'screen') o.material = screens[n.name] || screens.default || glass;
        else if (kind === 'glass') o.material = glass;
        else if (kind === 'gold') o.material = gold;
        else if (mn.startsWith('molten')) { o.material = molten; moltenMeshes.push(o); }
        else o.material = porc || (porc = porcelainMaterial(0xf4f1ea, seamSubset(seamOf(n.name), m.K, c), m.K, lightTex, LU, svc.selfGlow));
        o.userData.service = name;
        svc.pickables.push(o);
      });
      const pivot = new THREE.Group(); pivot.position.copy(c);
      n.position.sub(c); pivot.add(n);
      (svc.groups[gname] ? svc.groups[gname].inner : root).add(pivot);
      const dir = c.clone().sub(center); if (dir.lengthSq() < 1e-10) dir.set(rand() - 0.5, rand() - 0.5, rand() - 0.5);
      dir.normalize();
      const from = dir.multiplyScalar((0.7 + rand() * 0.9) * toModel)
        .add(new THREE.Vector3((rand() - 0.5) * 0.6, productMotion ? (rand() - 0.5) * 0.3 : 0.3 + rand() * 0.9, (rand() - 0.5) * 0.6).multiplyScalar(toModel));
      if (productMotion) {from.multiplyScalar(.55);from.z*=.65;}
      const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const q0 = new THREE.Quaternion().setFromAxisAngle(axis, (1.2 + rand() * 2.2) * (rand() < 0.5 ? -1 : 1));
      const late = kind === 'part' || kind === 'gold' || kind === 'glass' || kind === 'screen';
      const delay = late ? 0.3 + rand() * 0.32 : rand() * 0.34;
      const dur = late ? 0.38 : 0.5;
      const p = { pivot, node: n, c, size, from, q0, delay, dur, kind, group: gname, t: 0, molten: moltenMeshes };
      svc.pieces.push(p); svc.nodes[n.name] = p;
    }
    // Printed badges travel with their shell fragment, never as floating stickers.
    if (modelFactory) for (const badge of svc.pieces.filter(p => p.kind === 'apple-logo')) {
      const shells=svc.pieces.filter(p=>p.kind==='shell'&&p.group===badge.group);
      const owner=shells.sort((a,b)=>a.c.distanceToSquared(badge.c)-b.c.distanceToSquared(badge.c))[0];
      if (owner) {
        owner.pivot.add(badge.pivot);badge.pivot.position.copy(badge.c).sub(owner.c);
        svc.pieces=svc.pieces.filter(p=>p!==badge);
      }
    }
    svc.ready = true;
    if (onReady) onReady(svc);
  }

  const qI = new THREE.Quaternion();
  // f: 0 scattered .. 1 mended; exit: 0 here .. 1 flown back out into the dark
  svc.pose = (f, exit = 0) => {
    let landed = 0;
    for (const p of svc.pieces) {
      const departure=svc.keepAssembled?0:exit;
      const state=fragmentState(f,departure,p.delay*.28),t=state.joined,x=state.released;
      p.pivot.position.copy(p.c).addScaledVector(p.from,state.scatter*state.scatter);
      p.pivot.quaternion.slerpQuaternions(qI,p.q0,Math.min(1,state.scatter));
      p.pivot.scale.setScalar(Math.max(.001,state.size));
      p.pivot.visible=state.visible;
      if(p.kind==='screen') {
        p.pivot.visible=f>=1 && departure===0;p.pivot.position.copy(p.c);p.pivot.quaternion.identity();p.pivot.scale.setScalar(1);
      }
      if(p.kind==='display-fragment')p.pivot.visible=state.visible && !(f>=1&&departure===0);
      if(['grip-stippling','rear-ventilation'].includes(p.kind))p.pivot.visible=f>=1&&departure===0;
      const inside = t < 1 || x > 0;                     // the broken faces only show while apart
      for (const mm of p.molten) mm.visible = inside;
      p.t = t; p.exit = x; if (t >= 1 && x === 0) landed++;
    }
    return landed;
  };
  // hover: a damped spring lift; seams warm under the cursor
  const lift = { v: 0, p: 0 };
  svc.hover = (dt, on, point) => {
    lift.v += ((on ? 1 : 0) - lift.p) * 40 * dt - lift.v * 8 * dt; lift.p += lift.v * dt;
    LU.uHoverAmt.value += ((on ? 1 : 0) - LU.uHoverAmt.value) * (1 - Math.exp(-dt * 6));
    if (point) LU.uHover.value.lerp(point, 0.3);
    LU.uGlow.value = 0.3 * lift.p;
    return lift.p;
  };
  // the mend: gold flares as the last pieces land, then settles
  svc.mendGlow = (u, f, at) => {
    LU.uFlare.value = 0.9 * Math.exp(-Math.pow((u - at) / 0.035, 2)) + 0.25 * (f > 0 && f < 1 ? 1 : 0);
    LU.uBuild.value = f;
  };
  return svc;
}

// letter-spacing that works in every browser
export function spaced(g, txt, x, y, em, size) {
  let cx = x; for (const ch of txt) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + em * size; } return cx;
}
export const ease01 = (s, a, b) => outCubic(clamp01((s - a) / (b - a)));

// Let the camera reach the product before the visible assembly finishes. Pure scroll mapping
// keeps the exact same intermediate poses when scrolling backwards.
export function productProgress(u) {
  return u <= .24 ? 0 : u < .70 ? .06 + (u - .24) * (.34/.46) : .4 + (u - .70) * 2;
}
