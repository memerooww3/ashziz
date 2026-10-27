// Stop 06, Visit us: a kintsugi map pin (blender/make_pin.py, fractured by build_service_web.py).
// It mends over its plinth, the gold dot in its eye starts to beat, the pin turns slowly so you can
// see through it, and gold ripples run out across the plinth, like a location ping on a map.
import * as THREE from 'three';
import { locationModel } from './product-models.js';
import { loadService } from './service-kit.js';
import { smooth, clamp01 } from './service-website.js';

export function createLocationService(ctx) {
  const svc = loadService({ ...ctx, name: 'location', productMotion: true, modelFactory: locationModel(ctx.manager) });
  const extras = new THREE.Group(); extras.visible = false; ctx.scene.add(extras);
  // ripples: thin gold rings that grow out from under the pin and fade
  const rippleTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const r = g.createRadialGradient(128, 128, 96, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
  })();
  const ripples = [0, 1, 2].map(i => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: rippleTex, color: new THREE.Color(1, 0.62, 0.24).multiplyScalar(2.2), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 3; extras.add(m);
    return { m, phase: i / 3 };
  });
  // a warm glow pooled under the tip, where the pin points
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: glowTex, color: new THREE.Color(1, 0.6, 0.22).multiplyScalar(1.6), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  spot.rotation.x = -Math.PI / 2; spot.renderOrder = 3; extras.add(spot);
  let ground = null;                                          // the plinth top under the tip (world space), found once
  const tmp = new THREE.Box3(), cc = new THREE.Vector3();
  return {
    svc, name: 'location', label: 'Open the map', extras,
    get ready() { return svc.ready; },
    get root() { return svc.root; },
    get pickables() { return svc.pickables; },
    pose(u) { this.update(u, 0, false, null, 0); },
    update(u, dt, hover, point, exit = 0) {
      if (!svc.ready) return;
      const vis = u > 0.02 && exit < 1;
      svc.root.visible = vis; extras.visible = vis && u > 0.3;
      if (!vis) return;
      const f = clamp01((u - 0.06) / 0.32);
      const n = svc.pose(f, exit);
      svc.mendGlow(u, f, 0.4);
      const t = ctx.U.uTime.value, lift = svc.hover(dt, hover, point);
      const live = smooth(u, 0.42, 0.7);
      if (!ground) {                                          // measured at rest, before any bob or turn
        svc.root.position.copy(svc.base.position); svc.root.rotation.copy(svc.base.rotation); svc.root.updateMatrixWorld(true);
        ground = new THREE.Vector3(svc.base.position.x, -0.565, svc.base.position.z);
      }
      // settled: upright living float and subtle turn facing the camera
      svc.root.rotation.copy(svc.base.rotation);
      svc.root.rotation.y += 0.12 * Math.sin(t * 0.65) * live;   // centred on the camera, so you see through its eye
      svc.root.position.copy(svc.base.position);
      svc.root.position.y += (0.025 * Math.sin(t * 1.3) + 0.02) * live + 0.025 * lift;
      // the dot beats like a live location; the gold catches it
      const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 3.2), 3) * live;
      const dot = svc.groups.dot;
      if (dot) dot.outer.scale.setScalar(1 + 0.16 * beat);
      if (svc.materials) svc.materials.gold.emissiveIntensity = 0.35 + 1.1 * beat + 0.6 * lift;
      // ripples run out across the plinth
      for (const r of ripples) {
        const k = (t * 0.42 + r.phase) % 1;
        r.m.position.copy(ground);
        r.m.scale.setScalar(0.12 + 1.15 * k);
        r.m.material.opacity = live * (1 - exit) * Math.pow(1 - k, 1.6) * smooth(k, 0, 0.08) * 0.85;
      }
      spot.position.copy(ground); spot.position.y += 0.001; spot.scale.setScalar(0.5);
      spot.material.opacity = live * (0.45 + 0.35 * beat);
      return { landed: n, total: svc.pieces.length, f };
    },
  };
}

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
