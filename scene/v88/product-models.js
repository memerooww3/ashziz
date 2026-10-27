// Product-specific geometry; retained as separate components for the service assembly animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fractureShell } from './product-fracture.js';
import { FINISH_U } from './service-website.js';

export function metal(color, roughness = .32, metalness = .72) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness, envMap: FINISH_U.envMap,
    envMapIntensity: 1.1, clearcoat: .18, clearcoatRoughness: .3 });
  m.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
    '#include <lights_fragment_maps>\n irradiance += vec3(0.36, 0.37, 0.39) * PI;'); };
  m.customProgramCacheKey = () => 'product-soft-studio-1';
  return m;
}
const rubber = () => metal(0x17191b, .72, .03);
function rr(w,h,r) {
  const s=new THREE.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function slab(w,h,d,r,mat) {
  const bevel=d>.01?Math.min(d*.06,w*.006):0;
  const geo=new THREE.ExtrudeGeometry(rr(w-2*bevel,h-2*bevel,Math.max(.0001,r-bevel)),{depth:d-2*bevel,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:20});geo.translate(0,0,-d/2+bevel);
  return new THREE.Mesh(geo,mat);
}
function box(w,h,d,r,mat) {return new THREE.Mesh(new RoundedBoxGeometry(w,h,d,4,r),mat);}
function disc(r,d,mat) {const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d,64),mat);m.rotation.x=Math.PI/2;return m;}
function plane(w,h,mat) {return new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);}
function textMap(txt,color='#ffffff',size=160) {
  const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');
  g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';g.font=`600 ${size}px Arial`;g.fillText(txt,256,137);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
function label(txt,w,h,color) {return plane(w,h,new THREE.MeshBasicMaterial({map:textMap(txt,color),transparent:true,depthWrite:false}));}
function logoTexture(manager, name) {const t=new THREE.TextureLoader(manager).load(`/assets/${name}?v=products-1`);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
function decal(map,w,h,color=0xffffff) {return plane(w,h,new THREE.MeshPhysicalMaterial({map,color,transparent:true,alphaTest:.08,depthWrite:false,metalness:.3,roughness:.32}));}
function factory(group,center,rotation=0) {
  const scene=new THREE.Group();let index=0;
  return { scene, add(mesh,name,x=0,y=0,z=0) {
    if(name==='screen') {
      const glass=mesh.clone();glass.geometry=mesh.geometry.clone();glass.material=new THREE.MeshBasicMaterial({color:0x060607,side:THREE.DoubleSide});
      for(const shard of fractureShell(glass,4,7)) {
        const n=new THREE.Group();n.name=`${group}__display-fragment_${index++}`;
        shard.position.set(x,y,z);n.add(shard);n.rotation.y=rotation;n.position.fromArray(center);scene.add(n);
      }
    }
    const grid = { 'carbon-black-body':[7,5], 'base-foot':[5,5], 'base-seam':[5,5], 'camera-plate':[4,3], 'burgundy-frame': [4,7], 'ceramic-back': [4,7], 'display-bezel': [4,7], 'silver-unibody': [5,5] }[name];
    if (grid) {
      for (const [i,shard] of fractureShell(mesh,...grid,name!=='carbon-black-body').entries()) {
        const n=new THREE.Group();n.name=`${group}__shell_${String(index++).padStart(3,'0')}`;
        shard.name=`${name}-shard-${i}`;shard.position.set(x,y,z);n.add(shard);
        n.rotation.y=rotation;n.position.fromArray(center);scene.add(n);
      }
      return mesh;
    }
    const n=new THREE.Group();n.name=`${group}__${name}_${String(index++).padStart(3,'0')}`;
    mesh.name=name;mesh.position.set(x,y,z);n.add(mesh);
    n.rotation.y=rotation;n.position.fromArray(center);scene.add(n);return mesh;
  }};
}

export function iphoneModel(manager,screenMat) {
  const apple=logoTexture(manager,'laptop-apple-logo.png');
  const screenCompile=screenMat.onBeforeCompile;
  screenMat.transparent=true;
  screenMat.onBeforeCompile=shader=>{
    screenCompile(shader);
    shader.vertexShader='varying vec2 productUv;\n'+shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n productUv=uv;');
    shader.fragmentShader='varying vec2 productUv;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n vec2 q=abs(productUv-0.5)*vec2(1.0,2.111)-vec2(0.37,0.9255); if(length(max(q,0.0))>0.13) discard;');
  };
  screenMat.customProgramCacheKey=()=> 'iphone-rounded-display';
  return meta => {
    // Canonical front +Z faces the user camera naturally.
    const M=factory('phone',meta.center,0),add=M.add;
    const burgundy=metal(0x672936,.36,.65),glassRed=metal(0x762f40,.34,.32),rim=metal(0x9b6170,.25,.8);
    glassRed.clearcoat=.42;glassRed.clearcoatRoughness=.22;
    const black=metal(0x08090c,.19,.18),glass=metal(0x09182b,.10,.28);
    glass.clearcoat=1;glass.clearcoatRoughness=.08;
    add(slab(1.075,2.20,.135,.145,burgundy),'burgundy-frame');
    add(slab(1.046,2.17,.008,.137,glassRed),'ceramic-back',0,0,-.072);
    add(slab(1.047,2.17,.008,.137,black),'display-bezel',0,0,.071);
    const screen=plane(.983,2.075,screenMat);add(screen,'screen',0,0,.077);
    // The clipped HTML screen carries its own Dynamic Island and status bar.
    add(slab(.275,.073,.003,.036,black),'dynamic-island',0,.957,.081);
    const home=slab(.33,.009,.002,.004,metal(0xb8b8bc,.5,.05));add(home,'home-indicator',0,-1.012,.081);
    add(slab(.957,.63,.064,.12,burgundy),'camera-plate',0,.70,-.103);
    const cameraCenters=[[.284,.83],[.284,.55],[-.025,.69]];
    cameraCenters.forEach(([x,y],i)=>{
      add(disc(.133,.035,rim),`lens-rim-${i}`,x,y,-.153);
      add(disc(.116,.039,black),`lens-barrel-${i}`,x,y,-.172);
      add(disc(.092,.006,glass),`lens-glass-${i}`,x,y,-.195);
      const coating=new THREE.Mesh(new THREE.TorusGeometry(.096,.0022,8,48),metal(0x385160,.22,.5));
      add(coating,`lens-coating-${i}`,x,y,-.199);
      add(disc(.051,.007,metal(0x03050a,.16,.35)),`lens-aperture-${i}`,x,y,-.2);
      const glint=disc(.021,.002,metal(0x405a81,.12,.5));add(glint,`lens-reflection-${i}`,x-.026,y+.027,-.205);
      const fine=disc(.008,.001,metal(0x718b99,.16,.25));add(fine,`lens-glint-${i}`,x+.031,y-.028,-.205);
    });
    add(disc(.045,.008,metal(0xf4ead4,.3,.05)),'flash',-.318,.84,-.141);
    add(disc(.039,.008,black),'lidar',-.318,.57,-.141);
    add(disc(.012,.005,black),'rear-microphone',-.318,.70,-.142);
    const mark=decal(apple,.30,.30,0x160a0e);mark.rotation.y=Math.PI;add(mark,'apple-logo',0,-.16,-.078);
    for(const [side,y,h,name] of [[-1,.65,.12,'action-button'],[-1,.35,.22,'volume-up'],[-1,.04,.22,'volume-down'],[1,.35,.31,'power-button'],[1,-.48,.25,'camera-control']])
      add(box(.017,h,.065,.007,rim),name,side*.542,y,0);
    for(const side of [-1,1])for(const y of [-.84,.89])add(box(.003,.015,.136,.001,metal(0xc799a2,.6,.05)),'antenna-band',side*.538,y,0);
    const usb=slab(.14,.04,.003,.014,black);usb.rotation.x=Math.PI/2;add(usb,'usb-c',0,-1.102,0);
    const tongue=slab(.096,.009,.002,.004,metal(0x303238,.6,.12));tongue.rotation.x=Math.PI/2;add(tongue,'usb-c-tongue',0,-1.104,0);
    const contact=metal(0xb7a274,.4,.65);
    for(let i=0;i<8;i++)add(box(.005,.001,.006,.0004,contact),'usb-c-contact',-.035+i*.01,-1.105,.004);
    for(let side of [-1,1])for(let i=0;i<5;i++){const hole=disc(.011,.003,black);hole.rotation.x=0;add(hole,'speaker-hole',side*(.19+i*.045),-1.102,0);}
    for(const x of [-.107,.107]){const screw=disc(.006,.002,rim);screw.rotation.x=0;add(screw,'bottom-screw',x,-1.103,0);}
    add(slab(.30,.008,.002,.003,black),'earpiece',0,1.053,.077);
    return {scene:M.scene};
  };
}

export function xboxModel(manager) {
  const xbox=logoTexture(manager,'xbox-logo.png');xbox.repeat.set(124/410,1);
  return meta => {
    const M=factory('pad',meta.center,0),add=M.add;
    const shell=metal(0x242629,.54,.06),trim=metal(0x0d0e10,.66,.05),rub=rubber(),button=metal(0x101214,.27,.12);
    const s=new THREE.Shape();s.moveTo(-.13,.10);s.bezierCurveTo(-.174,.10,-.181,.052,-.187,.005);
    s.bezierCurveTo(-.196,-.05,-.207,-.116,-.175,-.128);s.bezierCurveTo(-.137,-.143,-.111,-.063,-.079,-.055);
    s.quadraticCurveTo(0,-.034,.079,-.055);s.bezierCurveTo(.111,-.063,.137,-.143,.175,-.128);
    s.bezierCurveTo(.207,-.116,.196,-.05,.187,.005);s.bezierCurveTo(.181,.052,.174,.10,.13,.10);s.closePath();
    const bodyGeo=new THREE.ExtrudeGeometry(s,{depth:.052,bevelEnabled:true,bevelSize:.008,bevelThickness:.009,bevelSegments:5,curveSegments:24});bodyGeo.translate(0,0,-.026);
    add(new THREE.Mesh(bodyGeo,shell),'carbon-black-body');
    for(const side of [-1,1]) {
      const grip=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),rub);grip.scale.set(.039,.076,.028);grip.rotation.z=-side*.26;
      add(grip,'textured-grip',side*.158,-.054,-.011);
      add(box(.106,.024,.029,.01,trim),'bumper',side*.112,.102,-.006);
      add(box(.054,.026,.036,.01,trim),'trigger',side*.13,.093,-.034);
      add(label(side<0?'LB':'RB',.032,.015,'#a6a9ae'),'bumper-label',side*.111,.102,.011);
    }
    for(const [x,y] of [[-.112,.041],[.052,-.035]]) {
      add(disc(.034,.005,trim),'stick-socket',x,y,.038);
      add(disc(.019,.017,rub),'stick-shaft',x,y,.048);
      add(disc(.029,.010,rub),'thumbstick-cap',x,y,.061);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.025,.002,8,48),metal(0x414447,.7,.1));add(ring,'thumbstick-rim',x,y,.068);
      add(disc(.022,.002,trim),'thumbstick-dish',x,y,.067);
    }
    add(disc(.036,.008,metal(0x30343a,.43,.45)),'hybrid-dpad',-.048,-.034,.041);
    add(box(.051,.015,.007,.002,trim),'dpad-horizontal',-.048,-.034,.048);
    add(box(.015,.051,.007,.002,trim),'dpad-vertical',-.048,-.034,.048);
    for(const [ch,x,y,color] of [['Y',.116,.077,'#f7cc24'],['B',.151,.043,'#ee4650'],['A',.116,.009,'#55c957'],['X',.081,.043,'#3e9fed']]) {
      const cap=disc(.0145,.010,button);add(cap,`button-${ch}`,x,y,.043);
      add(label(ch,.034,.022,color),`label-${ch}`,x,y,.049);
    }
    add(disc(.016,.007,trim),'xbox-button',0,.068,.040);
    add(decal(xbox,.027,.027),'xbox-logo',0,.068,.045);
    for(const [x,symbol] of [[-.030,'▣'],[.030,'≡']]) {
      add(disc(.009,.005,button),'menu-button',x,.024,.039);
      add(label(symbol,.012,.012,'#dddddd'),'menu-icon',x,.024,.043);
    }
    add(box(.018,.011,.005,.005,button),'share-button',0,-.004,.039);
    add(label('↑',.012,.011,'#eeeeee'),'share-icon',0,-.004,.043);
    add(box(.017,.007,.003,.002,trim),'usb-c',0,.108,-.01);
    // Fine moulded grip stippling, batched into one instanced draw call.
    const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(.0007,5,4),metal(0x45494c,.9,.02),160);
    const matrix=new THREE.Matrix4();let k=0;
    for(const side of [-1,1])for(let row=0;row<10;row++)for(let col=0;col<8;col++)matrix.makeTranslation(side*(.151+col*.003),-.05-row*.005,.032),dots.setMatrixAt(k++,matrix);
    add(dots,'grip-stippling');
    return {scene:M.scene};
  };
}

export function studioModel(manager) {
  const apple=logoTexture(manager,'laptop-apple-logo.png');
  return meta => {
    const M=factory('mini',meta.center),add=M.add;
    const silver=metal(0xd0d3d7,.36,.45),edge=metal(0x90969e,.36,.8),dark=metal(0x111317,.65,.05);
    const body=slab(.127,.127,.051,.014,silver);body.rotation.x=-Math.PI/2;add(body,'silver-unibody',0,.002,0);
    const foot=slab(.111,.111,.003,.022,dark);foot.rotation.x=-Math.PI/2;add(foot,'base-foot',0,-.025,0);
    const seam=slab(.125,.125,.001,.014,edge);seam.rotation.x=-Math.PI/2;add(seam,'base-seam',0,-.023,0);
    const mark=decal(apple,.034,.034,0x15191d);mark.rotation.set(-Math.PI/2,0,Math.PI);add(mark,'apple-logo',0,.0276,0);
    // The model's front is -Z; ports are inset dark cavities with a metal inner tongue.
    for(const x of [.025,.039]){
      const p=slab(.006,.0027,.0005,.0013,dark);add(p,'front-usb-c',x,-.001,-.06365);
      add(box(.0048,.00045,.0006,.00015,edge),'usb-c-tongue',x,-.001,-.064);
    }
    add(box(.017,.0013,.0006,.0004,dark),'sdxc-slot',-.005,-.001,-.0637);
    const led=disc(.0008,.0005,new THREE.MeshBasicMaterial({color:0xeaffef}));add(led,'status-led',-.048,-.001,-.0637);
    for(const x of [-.035,-.023,-.011,.001])add(slab(.006,.0027,.0005,.0012,dark),'rear-thunderbolt',x,-.002,.0637);
    for(const x of [.014,.025])add(box(.007,.003,.0006,.0003,dark),'rear-usb-a',x,-.002,.0637);
    add(box(.009,.004,.0006,.0005,dark),'ethernet',.040,-.002,.0637);
    add(box(.008,.0028,.0006,.0006,dark),'hdmi',.021,-.011,.0637);
    add(disc(.002,.001,dark),'power-port',0,-.013,.0637);
    // Rear and underside ventilation is one instanced mesh.
    const vents=new THREE.InstancedMesh(new THREE.SphereGeometry(.00065,6,4),dark,336);const matrix=new THREE.Matrix4();let n=0;
    for(let row=0;row<6;row++)for(let col=0;col<56;col++){matrix.makeScale(1,1,.2);matrix.setPosition(-.052+col*.0019,.008+row*.0023,.06355);vents.setMatrixAt(n++,matrix);}
    add(vents,'rear-ventilation');
    return {scene:M.scene};
  };
}

export function intelFinish(svc) {
  const silver=metal(0x777e86,.65,.4),pcb=metal(0x15393b,.55,.2),socket=metal(0x232b32,.52,.2),contacts=metal(0xcdb576,.25,.85);
  silver.envMapIntensity=.35; silver.clearcoat=0; silver.flatShading=true;socket.flatShading=true;
  for(const p of svc.pieces)p.node.traverse(o=>{if(!o.isMesh)return;
    o.material=p.group==='cpu'?silver:p.group==='lever'?contacts:p.kind==='whole'?pcb:socket;
  });
  svc.root.userData.product='Intel processor';
}
export function intelDecal(manager) {return logoTexture(manager,'intel-wordmark.png');}

export function intelModel(manager) {
  const intelLogo = logoTexture(manager, 'intel-wordmark.png');
  return meta => {
    const scene = new THREE.Group();
    let index = 0;
    const addPiece = (mesh, groupName, name, x = 0, y = 0, z = 0) => {
      const n = new THREE.Group();
      n.name = `${groupName}__${name}_${String(index++).padStart(3, '0')}`;
      mesh.name = name;
      mesh.position.set(x, y, z);
      n.add(mesh);
      n.position.fromArray(meta.center || [0, 0, 0]);
      scene.add(n);
      return mesh;
    };

    const silver = metal(0x777e86, .45, .8);
    const pcb = metal(0x15393b, .55, .2);
    const socket = metal(0x232b32, .52, .2);
    const contacts = metal(0xcdb576, .25, .85);

    // 1. Socket and PCB
    const pcbMesh = slab(2.2, 2.2, 0.08, 0.04, pcb);
    pcbMesh.rotation.x = -Math.PI / 2;
    addPiece(pcbMesh, 'pcb', 'substrate', 0, -0.04, 0);

    const socketMesh = slab(2.35, 2.35, 0.09, 0.06, socket);
    socketMesh.rotation.x = -Math.PI / 2;
    addPiece(socketMesh, 'socket', 'housing', 0, -0.01, 0);

    // Flat socket perimeter frame sitting flush on the socket (no protruding sticks)
    const frameL = box(0.12, 0.04, 1.9, 0.02, contacts);
    addPiece(frameL, 'socket', 'frame-l', -1.02, 0.04, 0);
    const frameR = box(0.12, 0.04, 1.9, 0.02, contacts);
    addPiece(frameR, 'socket', 'frame-r', 1.02, 0.04, 0);
    const frameTop = box(2.16, 0.04, 0.12, 0.02, contacts);
    addPiece(frameTop, 'socket', 'frame-top', 0, 0.04, -0.96);
    const frameBottom = box(2.16, 0.04, 0.12, 0.02, contacts);
    addPiece(frameBottom, 'socket', 'frame-bottom', 0, 0.04, 0.96);

    // 2. Retention lever lying flat along the front socket edge
    const leverBar = box(2.25, 0.04, 0.04, 0.015, contacts);
    addPiece(leverBar, 'lever', 'lever-arm', 0, 0.04, 1.12);
    const leverCatch = box(0.06, 0.05, 0.12, 0.02, contacts);
    addPiece(leverCatch, 'lever', 'lever-catch', 1.14, 0.05, 1.08);

    // 3. CPU IHS (Integrated Heat Spreader)
    const ihs = slab(1.85, 1.85, 0.14, 0.08, silver);
    ihs.rotation.x = -Math.PI / 2;
    for (const [i, shard] of fractureShell(ihs, 4, 4).entries()) {
      addPiece(shard, 'cpu', `ihs-shard-${i}`, 0, 0.08, 0);
    }

    const wingL = box(0.12, 0.08, 0.18, 0.02, silver);
    addPiece(wingL, 'cpu', 'wing-l', -0.96, 0.07, 0);
    const wingR = box(0.12, 0.08, 0.18, 0.02, silver);
    addPiece(wingR, 'cpu', 'wing-r', 0.96, 0.07, 0);

    const logoMesh = decal(intelLogo, 1.15, 0.38, 0x0071c5);
    logoMesh.rotation.x = -Math.PI / 2;
    addPiece(logoMesh, 'cpu', 'intel-logo', 0, 0.155, 0);

    return { scene };
  };
}

export function locationModel(manager) {
  return meta => {
    const scene = new THREE.Group();
    let index = 0;
    const addPiece = (mesh, groupName, name, x = 0, y = 0, z = 0) => {
      const n = new THREE.Group();
      n.name = `${groupName}__${name}_${String(index++).padStart(3, '0')}`;
      mesh.name = name;
      mesh.position.set(x, y, z);
      n.add(mesh);
      n.position.fromArray(meta.center || [0, 0, 0]);
      scene.add(n);
      return mesh;
    };

    const gold = metal(0xe5b052, 0.20, 0.95);
    gold.emissive.set(0x8a5d18); gold.emissiveIntensity = 0.55;
    gold.clearcoat = 0.8; gold.clearcoatRoughness = 0.12;

    // Dark polished porcelain matching 3am.mp4 frame_004.jpg
    const darkShell = metal(0x0e1117, 0.22, 0.85);
    darkShell.clearcoat = 1.0;
    darkShell.clearcoatRoughness = 0.08;

    // Slender, iconic teardrop pin geometry matching 3am.mp4 frame_004.jpg
    const shape = new THREE.Shape();
    const R = 0.36, cy = 0.62;
    shape.moveTo(0, 0.04);
    shape.bezierCurveTo(-0.08, 0.22, -R, 0.44, -R, cy);
    shape.absarc(0, cy, R, Math.PI, 0, true);
    shape.bezierCurveTo(R, 0.44, 0.08, 0.22, 0, 0.04);
    shape.closePath();

    const hole = new THREE.Path();
    hole.absarc(0, cy, 0.175, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const depth = 0.14;
    const pinGeo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.024,
      bevelThickness: 0.024,
      bevelSegments: 4,
      curveSegments: 32
    });
    pinGeo.translate(0, 0, -(depth + 0.024) / 2);

    const pinMesh = new THREE.Mesh(pinGeo, darkShell);
    for (const [i, shard] of fractureShell(pinMesh, 3, 4).entries()) {
      addPiece(shard, 'pin', `pin-shard-${i}`, 0, 0, 0);
    }

    // Gold collar lining the interior of the eye hole
    const collarGeo = new THREE.CylinderGeometry(0.172, 0.172, depth + 0.05, 32, 1, true);
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, gold);
    addPiece(collarMesh, 'pin', 'eye-collar', 0, cy, 0);

    // Front & back gold bevel rims around the eye hole
    const rimGeo = new THREE.TorusGeometry(0.174, 0.016, 16, 48);
    const rimFront = new THREE.Mesh(rimGeo, gold);
    addPiece(rimFront, 'pin', 'eye-rim-front', 0, cy, (depth + 0.048) / 2);

    const rimBack = new THREE.Mesh(rimGeo, gold);
    addPiece(rimBack, 'pin', 'eye-rim-back', 0, cy, -(depth + 0.048) / 2);

    // Central floating gold sphere
    const dotGeo = new THREE.SphereGeometry(0.10, 32, 24);
    const dotMesh = new THREE.Mesh(dotGeo, gold);
    addPiece(dotMesh, 'dot', 'center-dot', 0, cy, 0);

    return { scene };
  };
}
