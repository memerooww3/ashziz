// Service 03: carbon-black Xbox controller with asymmetric sticks, hybrid D-pad and ABXY controls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { xboxModel } from './product-models.js';
import { loadService, productProgress } from './service-kit.js';
import { smooth, clamp01, outCubic, FINISH_U } from './service-website.js';

function letterTexture(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.font = '500 190px "Fraunces", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 128, 140);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16;
  return t;
}

// our games, as liquid glass cards around the controller
const GAMES = [
  ['W', 'Mr Word Draw', 'Word puzzle · 500 levels'], ['↗', 'Arrow Escape', 'Logic puzzle'],
  ['T', 'Mr Traffic Jam', 'Bus puzzle · 500 levels'], ['◆', 'Mr Tile Match', 'Calm tile match'],
  ['●', 'Mr Hole io', 'Arcade · io'], ['S', 'Mr Survivor io', 'Action · roguelite'],
];
function gameCards() {
  return GAMES.map(([g, name, tag], i) => {
    const el = document.createElement('div'); el.className = 'lg game-card';
    el.innerHTML = `<i>${g}</i><b>${name}</b><span>${tag}</span>`;
    el.style.transitionDelay = `${i * 0.09}s`;
    document.body.appendChild(el);
    return el;
  });
}

export function createGameService(ctx) {
  const svc = loadService({ ...ctx, name: 'game', productMotion: true, modelFactory: xboxModel(ctx.manager) });
  const extras = new THREE.Group(); extras.visible = false; ctx.scene.add(extras);
  const glow = new THREE.PointLight(0x6dc749, 0, 1.8, 1.5); extras.add(glow);
  // the letter tiles
  const tileGeo = new RoundedBoxGeometry(0.15, 0.15, 0.045, 4, 0.022);
  const tileMat = FINISH_U.uGrad.value > 0                     // black metal tiles with gold letters, like the controller
    ? new THREE.MeshPhysicalMaterial({ color: 0x0e0e10, metalness: 0.82, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2, envMap: FINISH_U.envMap })
    : new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.6 });
  const tiles = 'PLAY'.split('').map((ch, i) => {
    const m = new THREE.Mesh(tileGeo, tileMat);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.35, 0.85, 0.24).multiplyScalar(1.6), alphaMap: letterTexture(ch), transparent: true, depthWrite: false }));
    face.position.z = 0.0235; m.add(face);
    const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.0235; m.add(back);
    extras.add(m);
    return { m, i, phase: i * Math.PI / 2 };
  });
  let ready = false;
  const cards = gameCards();
  const proj = new THREE.Vector3(), side = new THREE.Vector3();
  let cardsOn = false;
  function placeCards(camera, cc, t, show) {
    if (show !== cardsOn) { cardsOn = show; cards.forEach(c => c.classList.toggle('on', show)); document.body.classList.toggle('side-cards', show); }
    if (!show && !cards[0].classList.contains('on')) return;
    const W = innerWidth, H = innerHeight, portrait = W / H < 1;
    proj.copy(cc).project(camera);
    const cx = (proj.x * .5 + .5) * W, cy = (-proj.y * .5 + .5) * H;
    side.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.66).add(cc).project(camera);
    const r = Math.abs((side.x * .5 + .5) * W - cx);                  // the controller's half width on screen
    const copyTop = document.getElementById('copy').getBoundingClientRect().top;
    const cw = cards[0].offsetWidth || 214, ch = cards[0].offsetHeight || 64;
    cards.forEach((el, i) => {
      let x, y;
      if (portrait) {                                              // a 2 x 2 grid under the controller (four of them)
        if (i > 3) { el.style.transform = 'translate3d(-999px,-999px,0)'; return; }
        const st = window.__stage && window.__stage.game;
        x = W / 2 + (i % 2 ? 6 : -cw - 6);
        y = (st && st.mode === 'stack' ? Math.min(st.bottom, st.y1) + 12 : Math.min(copyTop - 2 * ch - 18, cy + r * 0.62)) + Math.floor(i / 2) * (ch + 8);
      } else {                                                     // a column either side of the controller, inside the open stage
        const st = window.__stage && window.__stage.game, half = st ? st.half : r;
        const right = i % 2 === 0, row = Math.floor(i / 2), rows = 3, blockH = rows * ch + (rows - 1) * 14;
        x = right ? cx + half + 22 : cx - half - 22 - cw;
        let top = cy - 1.55 * ch + (right ? 0 : ch * 0.45);
        if (st) { x = Math.max(st.x0, Math.min(st.x1 - cw, x)); top = Math.max(st.y0, Math.min(st.y1 - blockH, top)); }
        else { x = Math.max(16, Math.min(W - cw - 16, x)); top -= Math.max(0, top + blockH - (copyTop - 14)); }
        y = top + row * (ch + 14);
      }
      y += Math.sin(t * 0.9 + i * 1.3) * 4;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    });
  }
  function setup() { ready = true; svc.root.userData.product = 'Xbox Carbon Black'; }
  const camPos = new THREE.Vector3();
  return {
    svc, name: 'game', label: 'Start your game', extras,
    viewExtras: () => tiles.map(T => T.m),
    reserve: () => (cards[0].offsetWidth || 214) + 22,             // room the cards need either side (centerBrain)
    reservePortrait: () => ({ above: 0, below: 2 * (cards[0].offsetHeight || 54) + 8 + 12 }),   // upright screens: the 2 x 2 grid under it
    get ready() { return svc.ready; },
    get root() { return svc.root; },
    get pickables() { return svc.pickables; },
    pose(u) { this.update(u, 0, false, null, 0); },
    update(u, dt, hover, point, exit = 0, camera = null) {
      if (!svc.ready) return;
      u = productProgress(u);
      if (!ready) setup();
      const vis = u > 0.02 && exit < 1;
      svc.root.visible = vis; extras.visible = vis && u > 0.5;
      if (!vis) { if (cardsOn && camera) placeCards(camera, new THREE.Vector3(), 0, false); return; }
      const f = clamp01((u - 0.06) / 0.32);
      const n = svc.pose(f, exit);
      svc.mendGlow(u, f, 0.4);
      const t = ctx.U.uTime.value, lift = svc.hover(dt, hover, point);
      const play = smooth(u, 0.42, 0.62) * (1 - smooth(exit, 0.05, 0.7));
      const pad = svc.groups.pad;
      if (pad) {
        // tips toward you and floats, as if picked up
        pad.outer.rotation.set(-0.12 * play + 0.04 * Math.sin(t * 0.7) * play - 0.08 * lift, 0.1 * Math.sin(t * 0.4) * play + 0.1 * lift, 0.04 * Math.sin(t * 0.55) * play);
        pad.outer.position.copy(pad.pivot); pad.outer.position.y += (0.05 * play + 0.012 * Math.sin(t * 0.9) * play + 0.04 * lift) / svc.meta.root.scale;
      }
      // buttons: a running chase of gold, each one flaring as the beat reaches it
      const on = smooth(u, 0.55, 0.7) * (1 - exit);
      const beat = t * 2.6;
      glow.intensity = on * (0.25 + 0.2 * Math.sin(beat * Math.PI));
      // the tiles rise and drift around the controller, always turning to face you
      const rise = smooth(u, 0.6, 0.85) * (1 - smooth(exit, 0, 0.5));
      const cc = svc.root.localToWorld(new THREE.Vector3().fromArray(svc.meta.center));
      glow.position.copy(cc).add(new THREE.Vector3(0, -0.25, 0.2));
      if (camera) camPos.copy(camera.position);
      for (const T of tiles) {
        const a = (T.i - 1.5) * 0.42 + 0.1 * Math.sin(t * 0.35);          // a slow arc above the controller
        const r = 0.95 + 0.04 * Math.sin(t * 0.7 + T.i);
        T.m.position.set(cc.x + Math.sin(a) * r, cc.y + 0.68 + Math.cos(a) * 0.12 + 0.05 * Math.sin(t * 0.9 + T.i * 1.7) - (1 - outCubic(rise)) * 0.7,
                         cc.z + 0.12 * Math.sin(t * 0.5 + T.i));
        T.m.scale.setScalar(Math.max(0.001, outCubic(rise)));
        T.m.lookAt(camPos); T.m.rotateZ(0.15 * Math.sin(t * 0.8 + T.i));
      }
      if (camera) placeCards(camera, cc, t, u > 0.72 && exit < 0.15);
      return { landed: n, total: svc.pieces.length, f };
    },
  };
}
