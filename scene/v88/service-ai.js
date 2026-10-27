// Service 04, AI Agents: the kintsugi processor.
// The socket mends, the chip mends above it, drops into the socket and the lever locks it. Then
// light runs through its gold cracks and five agents (gold sparks with trails) wake and circle it,
// each one linked to the chip by a pulse of light.
import * as THREE from 'three';
import { intelFinish, intelDecal, intelModel } from './product-models.js';
import { loadService, productProgress } from './service-kit.js';
import { smooth, clamp01, outCubic, FINISH_U } from './service-website.js';

const TRAIL = 40;
// comet trail: points that shrink and fade behind each agent
const trailMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: Math.min(devicePixelRatio, 2) } },
  vertexShader: `attribute float aFade; uniform float uPx; varying float vF;
    void main(){ vF = aFade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * (2.5 + 13.0 * aFade) * (1.2 / -mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vF; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d); if (r > .25) discard;
    gl_FragColor = vec4(vec3(0.08, 0.5, 1.0) * (1.0 - r * 4.0) * vF * 1.6, 1.0); }`,
});

// what each agent is doing right now: a glass label per agent, tied to its spark by a gold line
const AGENTS = [
  ['Support agent', ['Answered a refund question', 'Closed 12 chats', 'Sent an order update'], 'replies in 3 seconds'],
  ['Sales agent', ['Booked a demo for Thursday', 'Followed up 8 leads', 'Sent a price quote'], 'never misses a lead'],
  ['Booking agent', ['Confirmed a table for 4', 'Moved a 3 PM slot', 'Sent 20 reminders'], 'works all night'],
  ['Ops agent', ['Synced 46 invoices', 'Updated stock levels', 'Flagged a late order'], 'keeps the books tidy'],
  ['Reviews agent', ['Thanked a 5 star guest', 'Replied to 5 reviews', 'Drafted a kind reply'], 'in your brand voice'],
];
function agentLabels() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'agent-lines';
  document.body.appendChild(svg);
  const labels = AGENTS.map(([name, tasks, note], i) => {
    const el = document.createElement('div'); el.className = 'lg agent';
    el.innerHTML = `<b><em></em>${name}</b><span>${tasks[0]}</span><small>${note.toUpperCase()}</small>`;
    el.style.transitionDelay = `${i * 0.1}s`;
    document.body.appendChild(el);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '2.6');
    svg.append(path, dot);
    return { el, span: el.querySelector('span'), tasks, path, dot, shown: 0, i };
  });
  return { svg, labels };
}

export function createAIService(ctx) {
  const svc = loadService({ ...ctx, name: 'ai', productMotion: true, modelFactory: intelModel(ctx.manager), onReady: s => { intelFinish(s); if (ctx.onReady) ctx.onReady(s); } });   // keep the page's hook (framing + GPU warm-up)
  const extras = new THREE.Group(); extras.visible = false; ctx.scene.add(extras);
  const coreLight = new THREE.PointLight(0x168bff, 0, 2.2, 1.4); extras.add(coreLight);
  const orbGeo = new THREE.SphereGeometry(0.03, 24, 16);
  const agents = Array.from({ length: 5 }, (_, i) => {
    const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(.04, .48, 1.0).multiplyScalar(1.35) }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), new THREE.MeshBasicMaterial({
      color: 0x269fff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
    orb.add(halo);
    // trail: a fading ribbon of past positions
    const tp = new Float32Array(TRAIL * 3), tc = new Float32Array(TRAIL);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aFade', new THREE.BufferAttribute(tc, 1));
    const trail = new THREE.Points(tg, trailMat); trail.frustumCulled = false;
    // link: chip -> agent, with a bright pulse travelling along it
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const link = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x299bef, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); link.frustumCulled = false;
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(.15, .6, 1).multiplyScalar(5) }));
    extras.add(orb, trail, link, pulse);
    return { orb, trail, tp, tc, link, pulse, i, fill: 0,
             r: 0.62 + i * 0.07, tilt: -0.5 + i * 0.27, speed: 0.55 + 0.12 * (i % 3), phase: i * 1.257 };
  });
  let raise = 0.03, leverOpen = -1.9, decal = null;
  const ui = agentLabels();
  let uiOn = false;
  const sp = new THREE.Vector3();
  function placeLabels(camera, t, show) {
    if (show !== uiOn) { uiOn = show; ui.labels.forEach(L => L.el.classList.toggle('on', show)); ui.svg.style.opacity = show ? 1 : 0; document.body.classList.toggle('side-agents', show); }
    if (!show) return;
    const W = innerWidth, H = innerHeight, portrait = W / H < 1, list = portrait ? ui.labels.slice(0, 3) : ui.labels;
    ui.labels.forEach(L => { if (!list.includes(L)) { L.el.style.transform = 'translate3d(-999px,-999px,0)'; L.path.setAttribute('d', ''); L.dot.setAttribute('cx', -99); } });
    sp.copy(cc).project(camera);
    const cx = (sp.x * .5 + .5) * W, cy = (-sp.y * .5 + .5) * H;
    const copyTop = document.getElementById('copy').getBoundingClientRect().top;
    list.forEach((L, k) => {
      const A = agents[L.i];
      // live task: changes every few seconds with a typing reveal
      const idx = Math.floor((t + L.i * 1.13) / 3.1) % L.tasks.length;
      if (idx !== L.shown) { L.shown = idx; L.span.textContent = L.tasks[idx]; L.span.classList.remove('type'); void L.span.offsetWidth; L.span.classList.add('type'); }
      const w = L.el.offsetWidth || 200, h = L.el.offsetHeight || 54;
      let x, y;
      if (portrait) {                                              // two above the chip, one under it, in the room centerBrain kept for them
        const st = window.__stage && window.__stage.ai;
        x = [16, W - w - 16, (W - w) / 2][k];
        y = st && st.mode === 'stack' ? (k < 2 ? Math.max(st.top, st.y0) - h - 12 : Math.min(st.bottom, st.y1) + 12)
                                      : [168, 168 + h + 12, Math.min(copyTop - h - 14, cy + 120)][k];
      }
      else {                                                       // a column either side of the chip, inside the open stage
        const st = window.__stage && window.__stage.ai;
        const right = k < 3, row = right ? k : k - 3, rows = right ? 3 : 2, blockH = rows * h + (rows - 1) * 22;
        let top = cy - (right ? 1.6 : 1.0) * (h + 16) + (right ? 0 : 30);
        if (st) {
          x = right ? cx + st.half + 20 : cx - st.half - 20 - w;
          x = Math.max(st.x0, Math.min(st.x1 - w, x)); top = Math.max(st.y0, Math.min(st.y1 - blockH, top));
        } else {
          x = right ? Math.min(W - w - 24, cx + W * 0.2) : Math.max(24, cx - W * 0.2 - w);
          if (!right) top -= Math.max(0, top + blockH - (copyTop - 14));
        }
        y = top + row * (h + 22);
      }
      y += Math.sin(t * 0.8 + L.i) * 3;
      L.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // leader: from the label's near edge to the spark
      sp.copy(A.orb.position).project(camera);
      const ox = (sp.x * .5 + .5) * W, oy = (-sp.y * .5 + .5) * H;
      const ex = ox > x + w / 2 ? x + w : x, ey = y + h / 2;
      L.path.setAttribute('d', `M${ex.toFixed(1)},${ey.toFixed(1)} L${((ex + ox) / 2).toFixed(1)},${ey.toFixed(1)} L${ox.toFixed(1)},${oy.toFixed(1)}`);
      L.dot.setAttribute('cx', ox.toFixed(1)); L.dot.setAttribute('cy', oy.toFixed(1));
    });
  }
  const decalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: intelDecal(ctx.manager), transparent: true, depthWrite: false,
                                                 polygonOffset: true, polygonOffsetFactor: -2 });
  function placeDecal() {
    const gi = svc.meta.groups.cpu; if (!gi) return;
    const w = (gi.max[0] - gi.min[0]) * 0.62;
    decal = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1217 / 3000), decalMat);
    decal.name = 'intel-logo'; decal.rotation.x = -Math.PI / 2;
    decal.position.set((gi.min[0] + gi.max[0]) / 2, gi.max[1] + w * 0.004, (gi.min[2] + gi.max[2]) / 2);
    svc.groups.cpu.inner.add(decal);
  }
  const cc = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  return {
    svc, name: 'ai', label: 'Start your AI agent', extras,
    reserve: () => (ui.labels[0].el.offsetWidth || 207) + 20,      // room the labels need either side (centerBrain)
    reservePortrait: () => { const h = ui.labels[0].el.offsetHeight || 54; return { above: h + 12, below: h + 12 }; },
    get ready() { return svc.ready; },
    get root() { return svc.root; },
    get pickables() { return svc.pickables; },
    pose(u) { this.update(u, 0, false, null, 0); },
    update(u, dt, hover, point, exit = 0, camera = null) {
      if (!svc.ready) return;
      u = productProgress(u);
      if (!decal) placeDecal();
      const vis = u > 0.02 && exit < 1;
      svc.root.visible = vis; extras.visible = vis && u > 0.55;
      if (!vis) { if (uiOn) placeLabels(camera, 0, false); return; }
      const f = clamp01((u - 0.06) / 0.32);
      const n = svc.pose(f, exit);
      svc.mendGlow(u, f, 0.4);
      const t = ctx.U.uTime.value, lift = svc.hover(dt, hover, point);
      const S = svc.meta.root.scale;
      // the chip waits above the socket, drops in with a small settle, then the lever swings shut
      const drop = smooth(u, 0.42, 0.56);
      const settle = Math.exp(-Math.pow((u - 0.565) / 0.012, 2)) * 0.06;
      const cpu = svc.groups.cpu, lever = svc.groups.lever;
      if (cpu) {
        cpu.outer.position.copy(cpu.pivot);
        cpu.outer.position.y += raise * (1 - drop) - raise * settle + (0.03 * lift) / S;
        cpu.outer.rotation.set(0.25 * (1 - drop), 0.6 * (1 - drop), 0);
      }
      if (lever) lever.outer.rotation.x = leverOpen * (1 - smooth(u, 0.56, 0.66));
      svc.root.position.copy(svc.base.position); svc.root.position.y += 0.03 * lift;
      // light runs through the cracks once it is seated
      const live = smooth(u, 0.6, 0.72) * (1 - exit);
      svc.LU.uFlow.value = 0.9 * live;
      if (decal) decal.visible = f >= 1 && (exit === 0 || svc.keepAssembled);                          // only on a whole chip
      // agents
      cc.fromArray(svc.meta.center); svc.root.localToWorld(cc);
      // on black metal a light this close is a white glare: by day it stays faint and higher (the gold cracks carry the life)
      const blackLid = FINISH_U.uGrad.value > 0;
      coreLight.position.copy(cc).add(new THREE.Vector3(0, blackLid ? 0.6 : 0.25, 0.1)); coreLight.intensity = (blackLid ? 0.05 : 0.5) * live;
      const wake = smooth(u, 0.62, 0.86) * (1 - smooth(exit, 0, 0.4));
      for (const A of agents) {
        const a = A.phase + t * A.speed, r = A.r * (0.6 + 0.4 * outCubic(wake));
        p.set(Math.cos(a) * r, Math.sin(a * 1.7 + A.i) * 0.08, Math.sin(a) * r * 0.62);
        p.applyAxisAngle(new THREE.Vector3(1, 0, 0), A.tilt * 0.4).applyAxisAngle(new THREE.Vector3(0, 0, 1), A.tilt * 0.3).add(cc);
        p.y += 0.05;
        A.orb.position.copy(p); A.orb.scale.setScalar(Math.max(0.001, wake));
        // trail
        A.tp.copyWithin(3, 0, (TRAIL - 1) * 3); A.tp[0] = p.x; A.tp[1] = p.y; A.tp[2] = p.z;
        if (A.fill < TRAIL) { for (let k = A.fill; k < TRAIL; k++) { A.tp[k * 3] = p.x; A.tp[k * 3 + 1] = p.y; A.tp[k * 3 + 2] = p.z; } A.fill = TRAIL; }
        for (let k = 0; k < TRAIL; k++) A.tc[k] = Math.pow(1 - k / TRAIL, 1.4) * wake;
        A.trail.geometry.attributes.position.needsUpdate = true; A.trail.geometry.attributes.aFade.needsUpdate = true;
        // link and its pulse
        const lp = A.link.geometry.attributes.position;
        lp.setXYZ(0, cc.x, cc.y + 0.02, cc.z); lp.setXYZ(1, p.x, p.y, p.z); lp.needsUpdate = true;
        A.link.material.opacity = 0.22 * wake;
        const k = (t * 0.9 + A.i * 0.37) % 1;
        A.pulse.position.lerpVectors(q.set(cc.x, cc.y + 0.02, cc.z), p, k);
        A.pulse.scale.setScalar(Math.max(0.001, wake * Math.sin(k * Math.PI)));
      }
      if (camera) placeLabels(camera, t, wake > 0.8 && exit < 0.12);
      return { landed: n, total: svc.pieces.length, f };
    },
  };
}
