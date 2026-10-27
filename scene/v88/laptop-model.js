// Precision rounded panels, in the original laptop's model coordinates.
// Explicit bevel normals preserve flat aluminium faces without faceted highlights.
import * as THREE from 'three';
import { fractureShell } from './product-fracture.js';

export function milledPanel(w, h, d, radius, bevel, material) {
  const positions=[], normals=[], uv=[], rings=[];
  const steps=w<2?6:16, bevelSteps=w<2?3:5, b=Math.min(bevel,d/2), r=Math.max(radius,b);
  const profile=[];
  for(let i=0;i<=bevelSteps;i++)profile.push([-Math.PI/2+i*Math.PI/2/bevelSteps,-d/2+b]);
  for(let i=0;i<=bevelSteps;i++)profile.push([i*Math.PI/2/bevelSteps,d/2-b]);
  for(const [a,z] of profile) {
    const ring=[], rr=r-b+b*Math.cos(a);
    for(let corner=0;corner<4;corner++)for(let i=0;i<=steps;i++) {
      const t=corner*Math.PI/2+i*Math.PI/2/steps;
      const cx=(corner===0||corner===3?1:-1)*(w/2-r);
      const cy=(corner<2?1:-1)*(h/2-r);
      ring.push([cx+Math.cos(t)*rr,cy+Math.sin(t)*rr,z+b*Math.sin(a),Math.cos(t)*Math.cos(a),Math.sin(t)*Math.cos(a),Math.sin(a)]);
    }
    rings.push(ring);
  }
  const vertex=v=>{positions.push(...v.slice(0,3));normals.push(...v.slice(3,6));uv.push(v[0]/w+.5,v[1]/h+.5);};
  const tri=(a,b,c)=>{vertex(a);vertex(b);vertex(c);};
  const count=rings[0].length;
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<count;j++) {
    const n=(j+1)%count,a=rings[k][j],bb=rings[k][n],c=rings[k+1][n],dd=rings[k+1][j];
    tri(a,bb,c);tri(a,c,dd);
  }
  for(let j=0;j<count;j++) {
    const n=(j+1)%count;
    tri([0,0,-d/2,0,0,-1],rings[0][n],rings[0][j]);
    tri([0,0,d/2,0,0,1],rings.at(-1)[j],rings.at(-1)[n]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeBoundingBox();g.computeBoundingSphere();return new THREE.Mesh(g,material);
}

export function createProceduralLaptopSource() {
  const scene = new THREE.Group();
  const lidCenter = new THREE.Vector3(.1127, 2.13072, -2.4553);
  
  // 1. Screen mesh
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.65, 4.04), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  screenMesh.name = 'screen';
  screenMesh.geometry.rotateX(-0.25068);
  screenMesh.geometry.translate(lidCenter.x, lidCenter.y, lidCenter.z);
  scene.add(screenMesh);

  // 2. Keyboard keys in standard 6-row arrangement
  const rows = [
    { count: 14, z: -1.35, w: 0.35, d: 0.16, gap: 0.05 },
    { count: 14, z: -1.05, w: 0.35, d: 0.22, gap: 0.05 },
    { count: 14, z: -0.75, w: 0.35, d: 0.22, gap: 0.05 },
    { count: 13, z: -0.45, w: 0.38, d: 0.22, gap: 0.05 },
    { count: 12, z: -0.15, w: 0.42, d: 0.22, gap: 0.05 },
    { count: 7,  z:  0.15, w: 0.48, d: 0.22, gap: 0.06, space: true }
  ];
  let keyIdx = 0;
  for (const r of rows) {
    const totalW = r.count * r.w + (r.count - 1) * r.gap;
    let startX = -totalW / 2 + 0.1127;
    for (let c = 0; c < r.count; c++) {
      let kw = r.w;
      if (r.space && c === 3) kw = 2.1;
      const kx = startX + kw / 2;
      const keyMesh = new THREE.Mesh(new THREE.BoxGeometry(kw, 0.035, r.d));
      keyMesh.name = `key_${keyIdx++}`;
      keyMesh.position.set(kx, 0.250, r.z);
      scene.add(keyMesh);
      startX += kw + r.gap;
    }
  }
  return { scene };
}

export function refineLaptop(source, shell, keys, dark) {
  const nodes=[], frontNormal=new THREE.Vector3(0,.24806367,.96874373), lidCenter=new THREE.Vector3(.1127,2.13072,-2.4553);
  const place=(mesh,position,rotation=0)=>{mesh.geometry.rotateX(rotation);mesh.geometry.translate(...position);return mesh;};
  const panel=(mesh,name,position,rotation)=> {
    for(const [i,shard] of fractureShell(mesh,8,5).entries()){shard.name=`${name}_${i}`;place(shard,position,rotation);nodes.push(shard);}
  };
  panel(milledPanel(6.83,4.35,.235,.18,.025,shell),'body',[.1127,.1175,.1107],-Math.PI/2);
  const back=lidCenter.clone().addScaledVector(frontNormal,-.045);
  panel(milledPanel(6.83,4.20,.09,.17,.018,shell),'lid',back.toArray(),-.25068);
  panel(milledPanel(6.65,4.04,.018,.115,.005,dark),'bezel',lidCenter.toArray(),-.25068);
  for(const original of (source?.scene?.children || [])) {
    if(original.name==='screen') {
      const anchor=original.clone();nodes.push(anchor);
      const mesh=new THREE.Mesh(original.geometry.clone(),dark);
      mesh.geometry.rotateX(.25068);
      for(const [i,shard] of fractureShell(mesh,8,5).entries()) {
        shard.geometry.rotateX(-.25068);shard.name=`display_${i}`;nodes.push(shard);
      }
    }
    if(!original.name.startsWith('key_'))continue;
    const b=new THREE.Box3().setFromObject(original),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
    const key=place(milledPanel(size.x*.96,size.z*.96,.035,.027,.007,keys),[c.x,.250,c.z],-Math.PI/2);
    key.name=original.name;nodes.push(key);
  }
  const scene=new THREE.Group();scene.add(...nodes);scene.updateMatrixWorld(true);
  return {scene, lidCenter, frontNormal};
}

