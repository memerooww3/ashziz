// Service 05: silver Mac Studio. Three live app windows rise from its aluminium enclosure.
import * as THREE from 'three';
import { studioModel } from './product-models.js';
import { loadService, productProgress } from './service-kit.js';
import { getScreen } from './screen-deck.js';
import { smooth, clamp01, outCubic } from './service-website.js';

// the three windows: finished images designed in tools/screens (dash, editor, inbox), see screen-deck.js

export function createDesktopService(ctx) {
  const svc = loadService({ ...ctx, name: 'desktop', productMotion: true, modelFactory: studioModel(ctx.manager) });
  const extras = new THREE.Group(); extras.visible = false; ctx.scene.add(extras);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(6) }));
  led.visible = false; extras.add(led); // Status indicator is attached to the authored front panel.
  const spill = new THREE.PointLight(0xffd29a, 0, 1.6, 1.5); extras.add(spill);
  const defs = [
    { screen: 'dash', w: 0.82, h: 0.54, at: new THREE.Vector3(-0.75, 0.95, 0.10), yaw: 0.28, delay: 0.0 },
    { screen: 'editor', w: 0.92, h: 0.52, at: new THREE.Vector3(0.0, 1.25, -0.06), yaw: 0.0, delay: 0.08 },
    { screen: 'inbox', w: 0.80, h: 0.54, at: new THREE.Vector3(0.78, 0.92, 0.12), yaw: -0.28, delay: 0.16 },
  ];
  const wins = defs.map(d => {
    const scr = getScreen(d.screen);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), scr.install(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    // a soft gold glow behind each pane
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(d.w * 1.3, d.h * 1.4), new THREE.MeshBasicMaterial({
      map: haloTex, color: 0x2a1c08, transparent: true, opacity: 0.22, depthWrite: false }));   // a soft shadow behind each pane
    halo.position.set(0.012, -0.03, -0.012); m.add(halo);
    m.renderOrder = 2; extras.add(m);
    return { ...d, scr, m };
  });
  const cc = new THREE.Vector3(), base = new THREE.Vector3(), camPos = new THREE.Vector3();
  return {
    svc, name: 'desktop', label: 'Start your desktop app', extras,
    viewExtras: () => wins.map(w => w.m),
    get ready() { return svc.ready; },
    get root() { return svc.root; },
    get pickables() { return svc.pickables; },
    pose(u) { this.update(u, 0, false, null, 0); },
    update(u, dt, hover, point, exit = 0, camera = null) {
      if (!svc.ready) return;
      u = productProgress(u);
      const vis = u > 0.02 && exit < 1;
      svc.root.visible = vis; extras.visible = vis && u > 0.45;
      if (!vis) return;
      const f = clamp01((u - 0.06) / 0.32);
      const n = svc.pose(f, exit);
      svc.mendGlow(u, f, 0.4);
      const t = ctx.U.uTime.value, lift = svc.hover(dt, hover, point);
      svc.root.position.copy(svc.base.position); svc.root.position.y += 0.03 * lift - 0.08 * smooth(u, 0.42, 0.62);   // floats clear of its plinth
      cc.fromArray(svc.meta.center); svc.root.localToWorld(cc);
      // its light: a small warm dot on the front and a spill on the floor
      const on = smooth(u, 0.44, 0.52) * (1 - exit);
      const gi = svc.meta.groups.mini;
      if (gi) {
        base.set((gi.min[0] + gi.max[0]) / 2 + (gi.max[0] - gi.min[0]) * 0.38, gi.min[1] + (gi.max[1] - gi.min[1]) * 0.45, gi.max[2] + 0.0006);
        svc.root.localToWorld(led.position.copy(base));
      }
      led.scale.setScalar(Math.max(0.001, on * (0.85 + 0.15 * Math.sin(t * 2))));
      spill.position.copy(cc).add(new THREE.Vector3(0, -0.12, 0.25)); spill.intensity = 0.25 * on;
      // windows rise out of the top and fan open, then breathe
      if (camera) camPos.copy(camera.position);
      const lead = smooth(exit, 0, 0.45);
      for (const W of wins) {
        const k = outCubic(clamp01((u - 0.5 - W.delay) / 0.3)) * (1 - lead);
        const s = clamp01((u - 0.6 - W.delay) / 0.3);
        W.scr.update(s);
        W.m.visible = k > 0.002;
        W.m.position.set(cc.x + W.at.x * k, cc.y + 0.1 + (W.at.y - 0.1) * k + 0.015 * Math.sin(t * 0.8 + W.delay * 20), cc.z + W.at.z * k);
        W.m.scale.setScalar(0.15 + 0.85 * k);
        W.m.lookAt(camPos.x, W.m.position.y, camPos.z); W.m.rotateY(W.yaw * 0.6);
        W.m.material.opacity = k;
      }
      return { landed: n, total: svc.pieces.length, f };
    },
  };
}

const haloTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
