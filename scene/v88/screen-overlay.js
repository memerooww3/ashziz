// Crisp screens: the laptop, phone and Mac-window screens drawn as real HTML (like the brain's question cards),
// pinned onto the 3D screen every frame with a perspective transform that maps the element's corners exactly
// onto the screen's four projected corners. The browser renders the text at the phone's own pixel density, so
// it stays sharp at any size; the 3D screen underneath only paints its plain page while the HTML is on top.
//
// Each overlay is laid out at about the size it appears on screen (--u = 1/100 of its width), so the browser
// rasterises it near 1:1 and never scales a small bitmap up.
import * as THREE from 'three';

const ASPECT = { laptop: 1216 / 2048, phone: 1916 / 900, dash: 546 / 806, editor: 520 / 910, inbox: 546 / 780 };
const v3 = new THREE.Vector3();

// the 8 unknowns of the projective map taking 4 source points to 4 destination points
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c]; if (!f) continue;
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

// the four corners of a screen mesh (the vertices nearest to its texture's corners), in the mesh's own space
function cornersOf(mesh) {
  const g = mesh.geometry, P = g.attributes.position, T = g.attributes.uv;
  if (!P || !T) return null;
  const want = [[0, 1], [1, 1], [1, 0], [0, 0]];               // top-left, top-right, bottom-right, bottom-left
  return want.map(([u, v]) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < T.count; i++) { const d = (T.getX(i) - u) ** 2 + (T.getY(i) - v) ** 2; if (d < bd) { bd = d; best = i; } }
    return { p: new THREE.Vector3(P.getX(best), P.getY(best), P.getZ(best)), uv: [T.getX(best), T.getY(best)] };
  });
}

const ease = k => 1 - Math.pow(1 - k, 3);
const clamp01 = x => Math.max(0, Math.min(1, x));

export function createScreenOverlays({ scene, camera, getScreen, host }) {
  const items = Object.keys(ASPECT).map(name => {
    const el = host.querySelector(`[data-screen="${name}"]`);
    const timed = [...el.querySelectorAll('[data-t]')].map(e => ({ e, t: +e.dataset.t, d: +(e.dataset.d || 0.2), rise: +(e.dataset.rise || 1.5), wipe: e.dataset.wipe, span: +(e.dataset.span || 0.3) }));
    return { name, el, deck: getScreen(name), timed, mesh: null, corners: null, W: 0, lastS: -1, shown: false, frame: name === 'dash' || name === 'editor' || name === 'inbox' };
  });
  let tick = 0;

  function findMeshes() {
    const want = items.filter(it => !it.mesh && it.deck.materials.length);
    if (!want.length) return;
    scene.traverse(o => {
      if (!o.isMesh) return;
      for (const it of want) if (!it.mesh && it.deck.materials.includes(o.material)) {
        const c = cornersOf(o); if (c) { it.mesh = o; it.corners = c; }
      }
    });
  }
  const chainVisible = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hide = it => { if (it.shown) { it.el.style.visibility = 'hidden'; it.shown = false; it.deck.plain(false); } };

  function animate(it, s) {                                     // the load-in, same timing as the 3D screen's
    if (Math.abs(s - it.lastS) < 0.0005) return;
    it.lastS = s;
    for (const x of it.timed) {
      if (x.wipe) {                                             // a line that draws itself, left to right
        const k = clamp01((s - x.t) / x.span);
        x.e.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
        x.e.style.opacity = s > x.t ? 1 : 0;
      } else {
        const k = ease(clamp01((s - x.t) / x.d));
        x.e.style.opacity = k.toFixed(3);
        x.e.style.transform = k < 1 ? `translateY(${((1 - k) * x.rise * it.W / 100).toFixed(2)}px)` : '';
      }
    }
  }

  return function update() {
    if ((tick++ & 31) === 0) findMeshes();
    camera.updateMatrixWorld();
    for (const it of items) {
      const s = it.deck.s, m = it.mesh;
      const op = it.frame ? (m ? m.material.opacity : 0) : clamp01((s - 0.02) / 0.28);
      if (!m || s <= 0 || op < 0.01 || !chainVisible(m)) { hide(it); continue; }
      m.updateWorldMatrix(true, false);
      const pts = [];
      let ok = true, depth = 0;
      for (const c of it.corners) {
        v3.copy(c.p).applyMatrix4(m.matrixWorld); depth += v3.distanceTo(camera.position); v3.project(camera);
        if (v3.z < -1 || v3.z > 1) { ok = false; break; }
        pts.push([(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight]);
      }
      if (!ok) { hide(it); continue; }
      // lay it out at about its on-screen width (re-laid only when that changes by more than 12 %)
      const uSpan = Math.max(0.05, it.corners[1].uv[0] - it.corners[0].uv[0]);
      const onScreen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / uSpan;
      // Keep the page on distant overview devices instead of leaving blank glass.
      if (onScreen < 6) { hide(it); continue; }
      if (!it.W || Math.abs(onScreen - it.W) / it.W > 0.12) {
        it.W = Math.max(120, Math.min(1600, Math.round(onScreen / 4) * 4));
        it.el.style.width = it.W + 'px'; it.el.style.height = Math.round(it.W * ASPECT[it.name]) + 'px';
        it.el.style.setProperty('--u', (it.W / 100) + 'px'); it.lastS = -1;
      }
      const W = it.W, H = Math.round(W * ASPECT[it.name]);
      const src = it.corners.map(c => [c.uv[0] * W, (1 - c.uv[1]) * H]);
      const h = homography(src, pts);
      if (!h) { hide(it); continue; }
      it.el.style.transform = `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
      it.el.style.opacity = op.toFixed(3);
      it.el.style.zIndex = String(Math.round(10000 - depth * 250));   // nearer screens stack on top, as in 3D
      animate(it, s);
      if (!it.shown) { it.el.style.visibility = 'visible'; it.shown = true; it.deck.plain(true); }
    }
  };
}
