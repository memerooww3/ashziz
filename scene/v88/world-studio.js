// Optional tech-studio art direction. World geometry only; product motion stays independent.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const STUDIO_HORIZON = new THREE.Color(1.24, 1.29, 1.32);
const STATIONS = [
  ['website','01 / WEB ENGINEERING',0xd6a66d],
  ['app','02 / MOBILE LAB',0xbe7b87],
  ['game','03 / PLAY SYSTEMS',0x9bbd84],
  ['ai','04 / INTELLIGENCE LAB',0x74b6c7],
  ['desktop','05 / COMPUTE STUDIO',0xa6b9c6],
  ['location','06 / CONNECTED WORLD',0xd4ad75],
  ['social','07 / SOCIAL STUDIO',0xbca4d8],
];
export function createStudioWorld(parent, stages) {
  const root=new THREE.Group();root.name='tech-studio';parent.add(root);
  const enclosure=new THREE.Group();enclosure.name='studio-cutaway';root.add(enclosure);
  const materials=[];
  const standard=(color,metalness=.1,roughness=.55)=>{
    const m=new THREE.MeshStandardMaterial({color,metalness,roughness,transparent:true,opacity:0});materials.push(m);return m;
  };
  const basic=(color)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0});materials.push(m);return m;};
  const ivory=standard(0xc7c4bb,.12,.65), graphite=standard(0x26363c,.35,.42), silver=standard(0x87999d,.65,.38), dark=standard(0x18282f,.2,.58);
  // The original bake includes shadows from its monoliths. Use a clean studio
  // floor so removed architecture cannot leave disconnected shadow patches.
  const floorMaterial=standard(0xd6d8d4,.08,.78);
  floorMaterial.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',
      '#include <lights_fragment_maps>\n irradiance += vec3(0.32,0.33,0.34) * PI;');
  };
  floorMaterial.customProgramCacheKey=()=> 'studio-floor-1';
  // The shared props atlas contains shadows from the old monoliths, including
  // a black wedge on the AI pedestal. Light studio plinths from this scene.
  const plinthMaterial=standard(0xe5e3de,.06,.72);
  plinthMaterial.onBeforeCompile=floorMaterial.onBeforeCompile;
  plinthMaterial.customProgramCacheKey=()=> 'studio-plinth-1';
  const light=basic(new THREE.Color(1.6,1.35,1.04));
  const box=(g,w,h,d,x,y,z,mat,r=.025)=>{
    const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,r),mat);o.position.set(x,y,z);g.add(o);return o;
  };
  const line=(g,points,mat)=>{
    const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
    const o=new THREE.Line(geo,mat);g.add(o);return o;
  };
  const outline=(g,x,y,w,h,mat,z=.15)=>line(g,[[x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],[x-w/2,y-h/2,z]],mat);
  // One connected, open-ceiling laboratory rather than isolated props in fog.
  const wall=standard(0xb6c4c5,.1,.72), inset=standard(0x8d9fa5,.2,.6);
  box(enclosure,.18,4.6,39,5.4,1.35,-14.5,wall,.07);
  box(enclosure,13.8,4.6,.18,-1.4,1.35,-34,wall,.07);
  box(enclosure,.22,.23,39,5.24,-.79,-14.5,graphite,.025);
  box(enclosure,.25,.06,39,5.22,2.95,-14.5,light,.018);
  for(let i=0;i<8;i++){
    const z=2-i*4.6;
    box(enclosure,.06,2.8,4.22,5.285,1.32,z,inset,.025);
    box(enclosure,.15,3.8,.055,5.22,1.13,z-2.23,silver,.018);
    box(enclosure,.18,.014,3.6,5.16,.06,z,light,.004);
    // Narrow suspended softboxes run across the studio at each bay.
    box(enclosure,4.2,.07,.12,3.25,3.35,z,silver,.025);
    box(enclosure,3.9,.012,.07,3.23,3.307,z,light,.005);
  }
  const seams=new THREE.LineBasicMaterial({color:0xb0b9b9,transparent:true,opacity:0});materials.push(seams);
  for(let x=-8;x<=5;x+=2)line(root,[[x,-.944,5],[x,-.944,-34]],seams);
  for(let z=5;z>=-34;z-=2)line(root,[[-8,-.944,z],[5,-.944,z]],seams);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'), grad=sc.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(15,25,32,.38)');grad.addColorStop(1,'rgba(15,25,32,0)');sc.fillStyle=grad;sc.fillRect(0,0,128,128);
  const shadowMap=new THREE.CanvasTexture(shadowCanvas);
  for(const [name,title,hex] of STATIONS){
    const [sx,,sz]=stages[name],g=new THREE.Group();g.name=`studio-${name}`;
    g.position.set(sx+(name==='social'?3.85:1.85),-.94,sz-(name==='social'?.2:2.15));g.rotation.y=-Math.PI/4;g.scale.setScalar(name==='social'?.32:.52);enclosure.add(g);
    const accent=basic(new THREE.Color(hex).multiplyScalar(1.35));
    const trace=new THREE.LineBasicMaterial({color:hex,transparent:true,opacity:0});materials.push(trace);
    // A freestanding equipment wall with a recessed face, metal frame and light reveal.
    box(g,3.45,.14,.64,0,.07,0,ivory,.055);
    // Open studio bay: an overhead softbox, side supports and a low work surface.
    box(g,3.65,.10,1.05,0,2.45,.25,silver,.035);
    box(g,3.18,.012,.52,0,2.392,.32,light,.005);
    for(const side of [-1,1])box(g,.07,2.42,.07,side*1.73,1.23,.58,silver,.018);
    box(g,3.5,.08,.8,0,.46,.31,ivory,.026);
    box(g,3.18,2.24,.22,0,1.2,-.08,graphite,.08);
    box(g,2.90,1.96,.025,0,1.2,.04,dark,.018);
    box(g,3.0,.017,.02,0,2.22,.055,light,.006);
    box(g,.018,1.7,.022,-1.48,1.2,.055,accent,.006);
    box(g,.018,1.7,.022,1.48,1.2,.055,accent,.006);
    // Side cooling fins and lower brushed-metal equipment rail.
    for(let i=0;i<8;i++)box(g,.022,1.54,.065,-1.35+i*.053,1.18,.065,silver,.006);
    box(g,2.7,.12,.04,0,.59,.09,silver,.016);
    for(let i=0;i<3;i++)box(g,.045,.013,.01,1.03+i*.09,.59,.116,i===0?accent:light,.005);
    const c=document.createElement('canvas');c.width=1024;c.height=96;
    const ctx=c.getContext('2d');ctx.fillStyle='#bbc7c9';ctx.font='500 28px monospace';ctx.fillText(title,20,57);ctx.fillStyle='#d9bc8e';ctx.fillText('ASHZIZ / STUDIO',710,57);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
    const lm=new THREE.MeshBasicMaterial({map,transparent:true,opacity:0,depthWrite:false});materials.push(lm);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(2.65,.248),lm);label.position.set(.05,2.02,.066);g.add(label);
    // Each station uses a restrained technical drawing, not a competing hero object.
    if(name==='website'){
      outline(g,.3,1.2,1.65,1.05,trace);line(g,[[-.525,1.53,.15],[1.125,1.53,.15]],trace);
      outline(g,-.2,1.12,.4,.52,trace);outline(g,.55,1.23,.78,.3,trace);outline(g,.55,.87,.78,.17,trace);
    }else if(name==='app'){
      for(let i=0;i<3;i++){
        const o=new THREE.Mesh(new THREE.TorusGeometry(.2+i*.18,.007,6,72),accent);o.position.set(.35,1.2,.13);g.add(o);
      }
      for(let i=0;i<5;i++)line(g,[[1.04,.78+i*.2,.14],[1.23,.78+i*.2,.14]],trace);
    }else if(name==='game'){
      for(let i=0;i<4;i++)outline(g,-.15+(i%2)*.72,.87+Math.floor(i/2)*.62,.57,.47,trace);
      line(g,[[-.65,.59,.14],[-.65,.48,.14],[1.18,.48,.14],[1.18,.59,.14]],trace);
    }else if(name==='ai'){
      outline(g,.3,1.2,.54,.54,trace);
      for(let i=0;i<5;i++){
        const y=.94+i*.13;
        line(g,[[-.8,y+(i-2)*.09,.14],[-.35,y+(i-2)*.09,.14],[-.12,y,.14],[.03,y,.14]],trace);
        line(g,[[.57,y,.14],[.76,y,.14],[.94,y+(i-2)*.09,.14],[1.29,y+(i-2)*.09,.14]],trace);
      }
      outline(g,.3,1.2,.31,.31,trace);
    }else if(name==='desktop'){
      for(let i=0;i<9;i++)box(g,1.55,.025,.035,.3,.77+i*.103,.12,silver,.008);
      box(g,.2,.025,.04,1.22,1.6,.13,accent,.008);
    }else if(name==='social'){
      outline(g,.3,1.18,.28,.28,trace);
      for(const [x,y] of [[-.35,.78],[.95,.78],[-.35,1.58],[.95,1.58]]){
        line(g,[[.3,1.18,.14],[x,y,.14]],trace);outline(g,x,y,.32,.26,trace);
      }
    }else{
      for(let i=0;i<4;i++)outline(g,.3,1.17,.45+i*.35,.3+i*.25,trace);
      line(g,[[-.75,.65,.16],[-.28,.94,.16],[.3,1.17,.16],[.7,1.53,.16],[1.25,1.6,.16]],trace);
    }
    // Foot shadows anchor new architecture to the baked floor.
    const sm=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,opacity:0,depthWrite:false});materials.push(sm);
    const sh=new THREE.Mesh(new THREE.PlaneGeometry(4.5,2),sm);sh.rotation.x=-Math.PI/2;sh.position.set(0,.004,.1);g.add(sh);
    // Flush floor inlays carry the studio palette between the display and equipment wall.
    const inlay=new THREE.Group();inlay.position.set(sx,-.941,sz);root.add(inlay);
    for(const side of [-1,1])box(inlay,.012,.006,2.15,side*1.12,0,-.6,silver,.002);
    box(inlay,2.25,.006,.012,0,0,.48,silver,.002);
  }
  // Bays share metal with floor inlays. Separate their materials so the
  // cutaway opens the view without fading the floor or its wayfinding lines.
  // Each station gets its own copies too, so one that stands between the camera and the model can step aside.
  const clones=(group,skip)=>{
    const map=new Map();
    group.traverse(o=>{
      if(!o.material||skip(o))return;
      const original=o.material;
      if(!map.has(original))map.set(original,{material:original.clone(),depthWrite:original.depthWrite});
      o.material=map.get(original).material;
    });
    return map;
  };
  const stationGroups=enclosure.children.filter(o=>o.name.startsWith('studio-'));
  const stations=stationGroups.map(g=>({g,centre:null,mats:clones(g,()=>false),fade:1}));
  const shell=clones(enclosure,o=>{for(let p=o;p;p=p.parent)if(stationGroups.includes(p))return true;return false;});
  const setAlpha=(map,a)=>{for(const {material,depthWrite} of map.values()){material.opacity=a;material.depthWrite=depthWrite&&a>=.999;}};
  return {root,floorMaterial,plinthMaterial,update(solidity,overview=0,camera=null,focus=null){
    root.visible=solidity>.001;
    for(const m of materials)m.opacity=solidity;
    const alpha=solidity*(1-THREE.MathUtils.clamp(overview,0,1));
    enclosure.visible=alpha>.001;
    setAlpha(shell,alpha);
    for(const st of stations){
      // a station nearer the camera than the model it is looking at would block the view: it fades out
      let fade=1;
      if(camera&&focus){
        if(!st.centre){st.g.updateWorldMatrix(true,false);st.centre=st.g.localToWorld(new THREE.Vector3(0,1.2,0));}   // stations never move
        const ahead=focus.distanceTo(camera.position)-st.centre.distanceTo(camera.position);
        fade=1-THREE.MathUtils.smoothstep(ahead,-.4,.9);
      }
      st.fade+=(fade-st.fade)*.18;                                       // eased, never a pop
      const a=alpha*st.fade;
      st.g.visible=a>.002;
      setAlpha(st.mats,a);
    }
  }};
}
