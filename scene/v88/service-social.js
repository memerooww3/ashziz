// Five independent ceramic / anodised-metal brand tiles.
// Every tile shares the site's reversible scroll burst and floating motion.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { fractureShell } from './product-fracture.js';
import { fragmentState, clamp, easeBetween } from './fragment-motion.js';
import { metal } from './product-models.js';

export const SOCIAL_LINKS = [
  {id:'youtube',name:'YouTube',file:'youtube',color:'#ed2029',href:'https://www.youtube.com/@ashziz'},
  {id:'facebook',name:'Facebook',file:'facebook-f',color:'#1877f2',href:'https://www.facebook.com/ashziz'},
  {id:'instagram',name:'Instagram',file:'instagram',color:'#d63685',href:'https://www.instagram.com/ashziz/'},
  {id:'linkedin',name:'LinkedIn',file:'linkedin-in',color:'#0a66c2',href:'https://www.linkedin.com/company/ashziz/'},
  {id:'gmb',name:'Google Maps',file:'google-maps',color:'#f7f9fc',href:'https://maps.google.com/?q=24.446319,54.390268'},
];

export function createSocialService(ctx) {
  const root = new THREE.Group(); root.name = 'social-floating-tiles'; root.visible = false; ctx.scene.add(root);
  // Keep the lower tiles suspended cleanly above the circular pedestal (plinth top is at y -0.57).
  // Elevate the cluster so bottom tiles hover above the plinth rim with full visibility.
  root.position.set(ctx.stage[0], 0.20, ctx.stage[2]);
  root.rotation.set(.06, -.72, -.035);
  root.scale.setScalar(.70);
  const base = root.position.clone(), pieces = [], pickables = [], satellites = [], shadows = [];
  const svc = {name:'social',root,ready:false,productMotion:true,keepAssembled:false,pieces,pickables,meta:{center:[0,0,0]}};
  // the logo builds run through the page's warm-up queue: one per slice, never while the intro plays
  const defer = ctx.defer || (job => { while (!job()); });
  let seed = 73;
  const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  const silver = metal(0xc7cdd1,.23,.9);
  const graphite = metal(0x171f28,.3,.62), ceramic = metal(0xf3f1e9,.24,.12);
  ceramic.clearcoat=.7; ceramic.clearcoatRoughness=.18; ceramic.emissive.set(0xc7c9c7); ceramic.emissiveIntensity=.28;
  const cube = (w,h,d,r,mat) => {
    // RoundedBox clamps its radius to depth / 2. An extruded rounded profile
    // keeps a generous plan-view corner even on a slim product enclosure.
    const b=Math.min(.008,d*.14),x=-w/2+b,y=-h/2+b,W=w-2*b,H=h-2*b,R=Math.max(.001,r-b),shape=new THREE.Shape();
    shape.moveTo(x+R,y);shape.lineTo(x+W-R,y);shape.quadraticCurveTo(x+W,y,x+W,y+R);
    shape.lineTo(x+W,y+H-R);shape.quadraticCurveTo(x+W,y+H,x+W-R,y+H);
    shape.lineTo(x+R,y+H);shape.quadraticCurveTo(x,y+H,x,y+H-R);
    shape.lineTo(x,y+R);shape.quadraticCurveTo(x,y,x+R,y);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:4,curveSegments:16});
    geo.translate(0,0,-d/2+b);return new THREE.Mesh(geo,mat);
  };

  // Bake each component's own transform before fracturing; the satellite's
  // attitude stays on its parent, separate from the reversible fragment pose.
  const bake = mesh => {mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.setScalar(1);return mesh;};
  function piece(mesh,parent=root) {
    mesh.geometry.computeBoundingBox(); const c=mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
    const pivot=new THREE.Group();pivot.position.copy(c);mesh.position.copy(c).negate();pivot.add(mesh);parent.add(pivot);
    const dir=c.clone().add(parent===root?new THREE.Vector3():parent.position).normalize();
    if(dir.lengthSq()<.01)dir.set(.2,.3,.6).normalize();
    const p={pivot,c,from:dir.multiplyScalar(.34+rand()*.55),q:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).normalize(),(rand()-.5)*3.2),delay:rand()*.065};
    pieces.push(p);mesh.userData.service='social';pickables.push(mesh);return p;
  }
  function split(mesh,nx,ny,parent=root,closeCuts=true) {bake(mesh);return fractureShell(mesh,nx,ny,closeCuts).map(m=>piece(m,parent));}
  function single(mesh,parent=root) {return piece(bake(mesh),parent);}
  function skin(w,h,d,r,mat,z,parent,n=3) {const m=cube(w,h,d,r,mat);m.position.z=z;return split(m,n,n,parent);}

  // Carefully arranged poses matching 3am.mp4 frame_005.jpg:
  // Top row: YouTube (left) & Facebook (right)
  // Center: Google Maps (raised, facing camera)
  // Bottom row: Instagram (bottom-left) & LinkedIn (bottom-right) hovering over the pedestal rim
  const poses = [
    {p:[-.64, .58, .05], r:[-.10, .22, -.12]},  // 0: YouTube
    {p:[.64, .56, -.05], r:[.12, -.22, .08]},   // 1: Facebook
    {p:[-.58, -.34, .14], r:[.08, .22, .06]},   // 2: Instagram (lifted cleanly above plinth)
    {p:[.58, -.36, .02], r:[-.08, -.18, -.08]}, // 3: LinkedIn (lifted cleanly above plinth)
    {p:[0, .10, .16], r:[-.02, .04, -.02]},     // 4: Google Maps (central focus)
  ];
  const loader=new SVGLoader(ctx.manager);
  const loads=SOCIAL_LINKS.map((brand,i)=>new Promise((resolve,reject)=>{
    const pose=poses[i],group=new THREE.Group();group.position.fromArray(pose.p);group.rotation.set(...pose.r);root.add(group);
    const sat={group,position:group.position.clone(),rotation:group.rotation.clone(),hover:0};satellites.push(sat);
    // Machined rear shell, polished bevel, thin dark gasket, ceramic face.
    skin(.65,.65,.112,.155,graphite,-.033,group);
    skin(.66,.66,.064,.16,silver,.024,group);
    skin(.628,.628,.042,.144,graphite,.052,group);
    skin(.604,.604,.052,.13,ceramic,.075,group);
    // Brand-colour edge light and a bevelled glass-like emblem, never a flat decal.
    const brandMat=metal(brand.color,.25,.08);brandMat.emissive.set(brand.color);brandMat.emissiveIntensity=.18;brandMat.clearcoat=.9;brandMat.clearcoatRoughness=.12;
    if(brand.id==='instagram') {
      brandMat.color.set(0xffffff);
      const compile=brandMat.onBeforeCompile.bind(brandMat);
      brandMat.onBeforeCompile=shader=>{
        compile(shader);
        shader.vertexShader='varying vec2 vSocialUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vSocialUv=uv;');
        shader.fragmentShader='varying vec2 vSocialUv;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float t=clamp((vSocialUv.x+vSocialUv.y)*.5,0.,1.);
          vec3 a=mix(vec3(1.,.527,.082),vec3(.930,.074,.067),smoothstep(0.,.32,t));
          vec3 b=mix(vec3(.930,.074,.067),vec3(.658,.018,.283),smoothstep(.32,.62,t));
          vec3 c=mix(vec3(.658,.018,.283),vec3(.168,.089,.738),smoothstep(.62,1.,t));
          diffuseColor.rgb *= t<.32?a:(t<.62?b:c);`);
      };
      brandMat.customProgramCacheKey=()=> 'social-instagram-vector-gradient-1';
    }
    const edge = new THREE.Mesh(new THREE.CapsuleGeometry(.005,.027,3,10),brandMat);edge.rotation.z=Math.PI/2;edge.position.set(-.175,-.235,.111);single(edge,group);
    // a readable name plate; 1024 px is sharp at any size it is seen at
    const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=160;
    const lc=labelCanvas.getContext('2d');lc.fillStyle='#3b434a';lc.textAlign='center';lc.font='600 92px monospace';lc.letterSpacing='6px';lc.fillText(brand.id==='gmb'?'GOOGLE MAPS':brand.name.toUpperCase(),512,112);
    const labelMap=new THREE.CanvasTexture(labelCanvas);labelMap.colorSpace=THREE.SRGBColorSpace;labelMap.anisotropy=16;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.36,.056),new THREE.MeshBasicMaterial({map:labelMap,transparent:true,depthWrite:false}));label.position.set(.032,-.228,.109);single(label,group);
    if(brand.id==='gmb') {
      const faceMaterial=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.025,depthWrite:true});
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.375,.375),faceMaterial);
      face.position.set(0,.05,.108);single(face,group);
      new THREE.ImageLoader(ctx.manager).load('/assets/social/google-maps-256.webp',img=>{
        const map=new THREE.CanvasTexture(img);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=16;
        faceMaterial.map=map;faceMaterial.needsUpdate=true;
      });
    }
    const buildLogoFromData = data => {
      const paths=data.paths;const groupShape=new THREE.Group();
      for(const p of paths) {
        const shapes=SVGLoader.createShapes(p);
        for(const shape of shapes) {
          const geo=new THREE.ExtrudeGeometry(shape,{depth:.032,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:3,curveSegments:12});
          const m=new THREE.Mesh(geo,brandMat);groupShape.add(m);
        }
      }
      const logo=groupShape;
      const b=new THREE.Box3().setFromObject(logo);const size=b.getSize(new THREE.Vector3());
      const maxDim=Math.max(size.x,size.y);const targetDim=brand.id==='gmb'?.38:.35;const scale=targetDim/maxDim;
      const center=b.getCenter(new THREE.Vector3());
      // Render the emblem shadow onto a canvas texture
      const shadowWidth=Math.max(.72,size.x*scale*1.4),shadowHeight=Math.max(.72,size.y*scale*1.4);
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;
      const shadowCtx=shadowCanvas.getContext('2d');
      const canvasScale=256/shadowWidth*scale;
      const drawOutline=()=>{
        shadowCtx.beginPath();
        for(const p of paths) {
          for(const sub of p.subPaths) {
            const pts=sub.getPoints();if(pts.length<2)continue;
            shadowCtx.moveTo((pts[0].x-center.x)*canvasScale+128,(center.y-pts[0].y)*canvasScale+128);
            for(let k=1;k<pts.length;k++)shadowCtx.lineTo((pts[k].x-center.x)*canvasScale+128,(center.y-pts[k].y)*canvasScale+128);
            shadowCtx.closePath();
          }
        }
        shadowCtx.fill('evenodd');
      };
      shadowCtx.fillStyle='rgba(0,0,0,.27)';shadowCtx.filter='blur(6px)';shadowCtx.translate(4,6);drawOutline();
      shadowCtx.setTransform(1,0,0,1,0,0);shadowCtx.filter='blur(1px)';shadowCtx.fillStyle='rgba(0,0,0,.12)';drawOutline();
      const shadowMap=new THREE.CanvasTexture(shadowCanvas);shadowMap.colorSpace=THREE.SRGBColorSpace;
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(shadowWidth,shadowWidth),new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,opacity:0}));
      shadow.position.z=.1025;group.add(shadow);shadows.push(shadow);
      for(const child of logo.children) {
        const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry;
        g.translate(-center.x,-center.y,0);g.scale(scale,-scale,scale);
        for(const attribute of Object.values(g.attributes)) {
          for(let t=0;t<attribute.count;t+=3)for(let k=0;k<attribute.itemSize;k++) {
            const a=(t+1)*attribute.itemSize+k,b=(t+2)*attribute.itemSize+k;
            const value=attribute.array[a];attribute.array[a]=attribute.array[b];attribute.array[b]=value;
          }
          attribute.needsUpdate=true;
        }
        const pos=g.attributes.position,uv=g.attributes.uv;
        for(let j=0;j<uv.count;j++)uv.setXY(j,pos.getX(j)/.35+.5,pos.getY(j)/.35+.5);
        child.geometry=g;child.position.z=.108;split(child,3,3,group,false);
      }
      resolve();
    };

    const primaryUrl = `/assets/social/${brand.file}.svg`;
    loader.load(primaryUrl, buildLogoFromData, undefined, err => {
      if (brand.id === 'gmb') {
        loader.load('/assets/social/google-maps-outline.svg', buildLogoFromData, undefined, () => resolve());
      } else {
        console.warn(`[Social] Could not load ${primaryUrl}:`, err);
        resolve();
      }
    });
  }));
  Promise.all(loads).then(()=>{svc.ready=true;ctx.onReady?.(svc);}).catch(error=>{svc.ready=true;ctx.onReady?.(svc);console.error('Social logo load failed',error);});

  const identity=new THREE.Quaternion(),localPoint=new THREE.Vector3();let hoverMix=0;
  return {svc,name:'social',label:'Explore our channels',root,pickables,get ready(){return svc.ready;},
    pose(u){return this.update(u,0,false,null,0);},
    update(u,dt,hover,point,exit=0) {
      if(!svc.ready)return;
      root.visible=u>.24&&exit<1;if(!root.visible)return;
      const f=clamp((u-.24)/.46),departure=svc.keepAssembled?0:exit;
      const settled=easeBetween(u,.72,.86)*(1-easeBetween(departure,0,.10));
      const time=ctx.U.uTime.value;
      for(const p of pieces) {
        const st=fragmentState(f,departure,p.delay);
        p.pivot.position.copy(p.c).addScaledVector(p.from,st.scatter*st.scatter);
        p.pivot.quaternion.slerpQuaternions(identity,p.q,Math.min(1,st.scatter));
        p.pivot.scale.setScalar(Math.max(.001,st.size));p.pivot.visible=st.visible;
      }
      let nearest=-1;
      if(hover&&point) {root.worldToLocal(localPoint.copy(point));let distance=Infinity;satellites.forEach((s,i)=>{const d=s.position.distanceToSquared(localPoint);if(d<distance){distance=d;nearest=i;}});}
      const blend=1-Math.exp(-Math.max(dt,0)*7);
      hoverMix+=((hover?1:0)-hoverMix)*blend;
      satellites.forEach((s,i)=>{
        s.hover+=((nearest===i?1:0)-s.hover)*blend;
        s.group.position.copy(s.position);s.group.position.y+=settled*.012*Math.sin(time*.7+i*1.8);s.group.position.z+=s.hover*.065;
        s.group.rotation.copy(s.rotation);s.group.rotation.y+=settled*.018*Math.sin(time*.5+i)+s.hover*.035;
      });
      for(const shadow of shadows) {shadow.material.opacity=easeBetween(f,.96,1)*(1-easeBetween(departure,0,.04));shadow.visible=shadow.material.opacity>.001;}
      root.position.copy(base);root.position.y+=.012*hoverMix;
      root.rotation.set(.06,-.72+.035*easeBetween(u,.74,.94)+.02*hoverMix,-.035);
      return {f,landed:f===1?pieces.length:0,total:pieces.length};
    },
  };
}
