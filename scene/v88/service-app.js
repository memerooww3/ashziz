// Service 02: burgundy iPhone. Components assemble from the back, then turn to reveal the live app.
import * as THREE from 'three';
import { iphoneModel } from './product-models.js';
import { loadService } from './service-kit.js';
import { getScreen } from './screen-deck.js';
import { smooth } from './service-website.js';
import { phoneTimeline } from './fragment-motion.js';

function finishPhone(svc) {
  // Each camera's coatings and rings stay with its lens while the shell shatters.
  const attach=(child,owner)=> {
    owner.pivot.add(child.pivot);child.pivot.position.copy(child.c).sub(owner.c);
    svc.pieces=svc.pieces.filter(p=>p!==child);
  };
  for(let i=0;i<3;i++) {
    const owner=svc.pieces.find(p=>p.kind===`lens-rim-${i}`);
    if(owner)for(const child of [...svc.pieces].filter(p=>p!==owner&&p.kind.startsWith('lens-')&&p.kind.endsWith(`-${i}`)))attach(child,owner);
  }
  svc.phoneDetails=[];
  for(const child of [...svc.pieces].filter(p=>['speaker-hole','antenna-band','usb-c','usb-c-tongue','usb-c-contact','bottom-screw','earpiece'].includes(p.kind))) {
    const owner=svc.pieces.filter(p=>p.kind==='shell').sort((a,b)=>a.c.distanceToSquared(child.c)-b.c.distanceToSquared(child.c))[0];
    if(owner){attach(child,owner);svc.phoneDetails.push(child.pivot);}
  }
  svc.root.userData.motion='phone-back-hold-turn-v1';
}

// the app on the screen: a finished image designed in tools/screens/phone.html (see screen-deck.js)

export function createAppService(ctx) {
  const screen = getScreen('phone');
  const screenMat = screen.install(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const svc = loadService({ ...ctx, name: 'app', productMotion: true, screens: { default: screenMat }, modelFactory: iphoneModel(ctx.manager, screenMat), onReady: s => { finishPhone(s); if (ctx.onReady) ctx.onReady(s); } });   // keep the page's hook (framing + GPU warm-up)
  const glowLight = new THREE.PointLight(0xffd6a0, 0, 1.4, 1.6);
  return {
    svc, name: 'app', label: 'Start your app',
    get ready() { return svc.ready; },
    get root() { return svc.root; },
    get pickables() { return svc.pickables; },
    pose(u) { this.update(u, 0, false, null, 0); },
    // u: this section's scroll 0..1; exit: 0..1 as the next service takes over
    update(u, dt, hover, point, exit = 0) {
      if (!svc.ready) return;
      svc.root.visible = u > 0.24 && exit < 1;
      if (!svc.root.visible) {screen.update(0);glowLight.intensity=0;return;}
      const {f,turn,departure,screen:s,detail}=phoneTimeline(u,exit,svc.keepAssembled);
      const n = svc.pose(f, departure);
      for(const d of svc.phoneDetails)d.visible=detail;
      svc.mendGlow(u, f, 0.60);
      const ph = svc.groups.phone;
      if (ph && glowLight.parent !== ph.inner) { ph.inner.add(glowLight); glowLight.position.copy(ph.pivot).add(new THREE.Vector3(0, 0, 0.6)); }   // in front of the display
      // A stable rear showcase, then one eased turn; no time-driven wobble during assembly.
      const lift = svc.hover(dt, hover && s>.95 && departure===0, point);
      if (ph) {
        const targetYaw = -0.818;
        ph.outer.rotation.set(-0.035*turn-0.04*lift, Math.PI*(1-turn) + targetYaw + .10*lift, .015*turn);
        ph.outer.position.copy(ph.pivot);ph.outer.position.y += .035*lift/svc.meta.root.scale;
      }
      const power = smooth(s, 0, 0.20);
      screenMat.color.setScalar(power * (1 + 0.1 * lift));
      glowLight.intensity = 0.08 * power;
      screen.update(s);
      return { landed: n, total: svc.pieces.length, f, s, turn, departure };
    },
  };
}
