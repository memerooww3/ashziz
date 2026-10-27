// Clip a convex product enclosure into closed, deterministic Voronoi cells.
// Exterior normals/UVs are interpolated unchanged, so the assembled finish has no seams.
import * as THREE from 'three';
const EPS = 1e-8;
const lerp = (a,b,t) => { const o=new Array(a.length); for(let i=0;i<a.length;i++)o[i]=a[i]+(b[i]-a[i])*t; return o; };
function clip(polygons, nx, ny, distance, closeCuts) {
  const out=[], cuts=[];let crossed=false;
  for(const poly of polygons) {
    const result=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length];
      const da=a[0]*nx+a[1]*ny-distance,db=b[0]*nx+b[1]*ny-distance;
      if(da<=EPS) result.push(a);
      if((da < -EPS && db > EPS)||(da > EPS && db < -EPS)) {
        const v=lerp(a,b,da/(da-db));result.push(v);cuts.push(v);crossed=true;
      }
    }
    if(result.length>=3){out.push(result);for(const v of result)if(Math.abs(v[0]*nx+v[1]*ny-distance)<=EPS*2)cuts.push(v);}
  }
  // A convex shell's intersection with a plane is a convex polygon. Sort a 2D hull,
  // dropping collinear triangle intersections before adding the solid cut wall.
  if(closeCuts && crossed && cuts.length>=3) {
    const points=cuts.map(v=>({v,u:-ny*v[0]+nx*v[1],w:v[2]})).sort((a,b)=>Math.abs(a.u-b.u)>EPS?a.u-b.u:a.w-b.w);
    const unique=points.filter((p,i)=>!i||Math.abs(p.u-points[i-1].u)+Math.abs(p.w-points[i-1].w)>EPS);
    const cross=(a,b,c)=>(b.u-a.u)*(c.w-a.w)-(b.w-a.w)*(c.u-a.u);
    const half=list=>{const h=[];for(const p of list){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=EPS*EPS)h.pop();h.push(p);}return h;};
    const lower=half(unique),upper=half([...unique].reverse());lower.pop();upper.pop();
    const hull=[...lower,...upper];
    if(hull.length>=3)out.push(hull.map(({v})=>[v[0],v[1],v[2],nx,ny,0,0,0]));
  }
  return out;
}
// ---------------------------------------------------------------- prebuilt shards
// Cutting the shells is the heaviest thing a phone did while the site loaded, and it did it on every visit. The
// shards are cut once, ahead of time (tools/qa/bake-fracture.mjs writes public/assets/fracture.bin), and the site
// only reads them. Each set is found by a fingerprint of the exact geometry and grid it came from, so a model that
// changes simply misses and is cut here as before: the file can be stale, never wrong.
const ALGO=1;                                                  // bump when the cutting itself changes
let shardCache=null,cacheState='off',waiters=[];
const baking=typeof location!=='undefined'&&new URLSearchParams(location.search).has('bakefracture')?new Map():null;
const verifying=typeof location!=='undefined'&&new URLSearchParams(location.search).has('verifyfracture')?(globalThis.__fractureVerify={sets:0,shards:0,countMismatch:0,pos:0,normal:0,uv:0}):null;   // QA
function fingerprint(arrays,columns,rows,closeCuts) {
  let a=0x811c9dc5^ALGO,b=0x9e3779b1^(columns*131+rows*7+(closeCuts?1:0));
  for(const arr of arrays) {
    if(!arr)continue;
    const u=new Uint32Array(arr.buffer,arr.byteOffset,arr.length);
    for(let i=0;i<u.length;i++){const v=u[i];a=Math.imul(a^v,16777619);b=Math.imul(b^(v>>>7|v<<25),2246822519)+i|0;}
  }
  return `${(a>>>0).toString(36)}.${(b>>>0).toString(36)}.${columns}x${rows}${closeCuts?'c':'o'}.${arrays[0].length}`;
}
function settle(cache) {
  shardCache=cache;cacheState=cache?'ready':'failed';
  const w=waiters;waiters=[];for(const f of w)f();
}
// Fetch the prebuilt shards (gzip inside the file, so it stays small on any server). A model build that comes first
// waits for it (up to 12 s, never longer); without it everything is cut here exactly as before.
export function loadFractureCache(url, waitMs=1500) {        // fall back quickly if fracture cache is not present
  if(baking||cacheState!=='off'||typeof DecompressionStream==='undefined'||typeof fetch==='undefined')return;
  cacheState='loading';
  const timer=setTimeout(()=>{if(cacheState==='loading')settle(null);},waitMs);
  fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();})
    .then(buf=>{if(cacheState==='loading'){clearTimeout(timer);settle(parseShards(buf));}})
    .catch(()=>{if(cacheState==='loading'){clearTimeout(timer);settle(null);}});
}
export function afterFractureCache(fn) { if(cacheState==='loading')waiters.push(fn); else fn(); }
export const fractureCacheState=()=>({state:cacheState,sets:shardCache?shardCache.size:0,baked:baking?baking.size:null});

// file: 'FRC1', algo, sets; per set: key, shards; per shard: vertex count, unique count, bounds, then
// quantised unique vertices (positions and uvs as deltas, normals as int16) and the per-vertex index list
function parseShards(buf) {
  const dv=new DataView(buf);let o=0;
  const u8=()=>dv.getUint8(o++),u16=()=>{const v=dv.getUint16(o,true);o+=2;return v;},u32=()=>{const v=dv.getUint32(o,true);o+=4;return v;},f32=()=>{const v=dv.getFloat32(o,true);o+=4;return v;};
  if(u32()!==0x31435246||u32()!==ALGO)return null;
  const map=new Map(),sets=u32();
  for(let s=0;s<sets;s++) {
    const kl=u16();let key='';for(let i=0;i<kl;i++)key+=String.fromCharCode(u8());
    const shards=[],n=u16();
    for(let k=0;k<n;k++) {
      const count=u32(),unique=u32(),pmin=[f32(),f32(),f32()],pmax=[f32(),f32(),f32()],tmin=[f32(),f32()],tmax=[f32(),f32()];
      const take=(Ctor,len)=>{const a=new Ctor(buf.slice(o,o+len*Ctor.BYTES_PER_ELEMENT));o+=len*Ctor.BYTES_PER_ELEMENT;return a;};
      const qp=take(Uint16Array,unique*3),qn=take(Int16Array,unique*3),qt=take(Uint16Array,unique*2),idx=take(unique<65536?Uint16Array:Uint32Array,count);
      shards.push({count,unique,pmin,pmax,tmin,tmax,qp,qn,qt,idx});
    }
    map.set(key,shards);
  }
  return map;
}
function shardGeometry(d) {
  const {count,unique,pmin,pmax,tmin,tmax,qp,qn,qt,idx}=d;
  const up=new Float32Array(unique*3),un=new Float32Array(unique*3),ut=new Float32Array(unique*2);
  const ps=[0,1,2].map(i=>(pmax[i]-pmin[i])/65535),ts=[0,1].map(i=>(tmax[i]-tmin[i])/65535);
  let a=0,b=0,c=0,e=0,f=0;
  for(let i=0;i<unique;i++) {
    a=(a+qp[i*3])&65535;b=(b+qp[i*3+1])&65535;c=(c+qp[i*3+2])&65535;e=(e+qt[i*2])&65535;f=(f+qt[i*2+1])&65535;
    up[i*3]=pmin[0]+a*ps[0];up[i*3+1]=pmin[1]+b*ps[1];up[i*3+2]=pmin[2]+c*ps[2];
    un[i*3]=qn[i*3]/32767;un[i*3+1]=qn[i*3+1]/32767;un[i*3+2]=qn[i*3+2]/32767;
    ut[i*2]=tmin[0]+e*ts[0];ut[i*2+1]=tmin[1]+f*ts[1];
  }
  const pos=new Float32Array(count*3),norm=new Float32Array(count*3),uv=new Float32Array(count*2);
  for(let i=0;i<count;i++){const j=idx[i];pos[i*3]=up[j*3];pos[i*3+1]=up[j*3+1];pos[i*3+2]=up[j*3+2];norm[i*3]=un[j*3];norm[i*3+1]=un[j*3+1];norm[i*3+2]=un[j*3+2];uv[i*2]=ut[j*2];uv[i*2+1]=ut[j*2+1];}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.computeBoundingBox();geo.computeBoundingSphere();
  return geo;
}
// the baking page hands every set it cut to the bake script, as one binary
export function exportFractureBake() {
  if(!baking)return null;
  const parts=[];let size=0;const push=a=>{parts.push(a);size+=a.byteLength;};
  const head=new DataView(new ArrayBuffer(12));head.setUint32(0,0x31435246,true);head.setUint32(4,ALGO,true);head.setUint32(8,baking.size,true);push(new Uint8Array(head.buffer));
  for(const [key,geos] of baking) {
    const kh=new DataView(new ArrayBuffer(2+key.length+2));kh.setUint16(0,key.length,true);for(let i=0;i<key.length;i++)kh.setUint8(2+i,key.charCodeAt(i));kh.setUint16(2+key.length,geos.length,true);push(new Uint8Array(kh.buffer));
    for(const g of geos) {
      const P=g.attributes.position.array,N=g.attributes.normal.array,T=g.attributes.uv.array,count=P.length/3;
      const pmin=[Infinity,Infinity,Infinity],pmax=[-Infinity,-Infinity,-Infinity],tmin=[Infinity,Infinity],tmax=[-Infinity,-Infinity];
      for(let i=0;i<count;i++){for(let k=0;k<3;k++){pmin[k]=Math.min(pmin[k],P[i*3+k]);pmax[k]=Math.max(pmax[k],P[i*3+k]);}for(let k=0;k<2;k++){tmin[k]=Math.min(tmin[k],T[i*2+k]);tmax[k]=Math.max(tmax[k],T[i*2+k]);}}
      const q=(v,lo,hi)=>hi>lo?Math.round((v-lo)/(hi-lo)*65535):0;
      const seen=new Map(),qp=[],qn=[],qt=[],idx=new Uint32Array(count);
      for(let i=0;i<count;i++) {
        const v=[q(P[i*3],pmin[0],pmax[0]),q(P[i*3+1],pmin[1],pmax[1]),q(P[i*3+2],pmin[2],pmax[2]),Math.round(N[i*3]*32767),Math.round(N[i*3+1]*32767),Math.round(N[i*3+2]*32767),q(T[i*2],tmin[0],tmax[0]),q(T[i*2+1],tmin[1],tmax[1])];
        const k=v.join(',');let j=seen.get(k);
        if(j===undefined){j=seen.size;seen.set(k,j);qp.push(v[0],v[1],v[2]);qn.push(v[3],v[4],v[5]);qt.push(v[6],v[7]);}
        idx[i]=j;
      }
      const unique=seen.size,dp=new Uint16Array(unique*3),dt=new Uint16Array(unique*2);
      for(let i=unique*3-1;i>=0;i--)dp[i]=(qp[i]-(i>=3?qp[i-3]:0))&65535;
      for(let i=unique*2-1;i>=0;i--)dt[i]=(qt[i]-(i>=2?qt[i-2]:0))&65535;
      const sh=new DataView(new ArrayBuffer(48));sh.setUint32(0,count,true);sh.setUint32(4,unique,true);
      [...pmin,...pmax,...tmin,...tmax].forEach((v,i)=>sh.setFloat32(8+i*4,v,true));push(new Uint8Array(sh.buffer));
      push(new Uint8Array(dp.buffer));push(new Uint8Array(new Int16Array(qn).buffer));push(new Uint8Array(dt.buffer));
      push(new Uint8Array((unique<65536?Uint16Array.from(idx):idx).buffer));
    }
  }
  const out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.byteLength;}
  return out;
}

export function fractureShell(mesh, columns, rows, closeCuts=true) {
  const source=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
  const P=source.attributes.position,N=source.attributes.normal,T=source.attributes.uv;
  const key=shardCache||baking?fingerprint([P.array,N&&N.array,T&&T.array],columns,rows,closeCuts):null;
  const prebuilt=shardCache&&shardCache.get(key);
  if(prebuilt) {                                               // read, not cut: the same shards, from the file
    const shards=prebuilt.map(d=>{const shard=new THREE.Mesh(shardGeometry(d),mesh.material);shard.quaternion.copy(mesh.quaternion);shard.scale.copy(mesh.scale);return shard;});
    if(verifying) {                                             // QA: cut it here as well and measure the difference
      const saved=shardCache;shardCache=null;
      const real=fractureShell(new THREE.Mesh(source.clone(),mesh.material),columns,rows,closeCuts);shardCache=saved;
      const r=verifying;r.sets++;if(real.length!==shards.length)r.countMismatch++;
      real.forEach((m,i)=>{const g=shards[i]&&shards[i].geometry,h=m.geometry;if(!g||g.attributes.position.count!==h.attributes.position.count){r.countMismatch++;return;}
        h.computeBoundingBox();const size=h.boundingBox.getSize(new THREE.Vector3()).length()||1;
        const d=(k,s=1)=>{const x=g.attributes[k].array,y=h.attributes[k].array;let m=0;for(let j=0;j<x.length;j++)m=Math.max(m,Math.abs(x[j]-y[j])/s);return m;};
        r.pos=Math.max(r.pos,d('position',size));r.normal=Math.max(r.normal,d('normal'));r.uv=Math.max(r.uv,d('uv'));r.shards++;});
    }
    if(source!==mesh.geometry)source.dispose();mesh.geometry.dispose();
    return shards;
  }
  source.computeBoundingBox();const b=source.boundingBox,w=b.max.x-b.min.x,h=b.max.y-b.min.y;
  const polygons=[];
  for(let i=0;i<P.count;i+=3) {
    const poly=[];for(let k=0;k<3;k++){const j=i+k;poly.push([P.getX(j),P.getY(j),P.getZ(j),N.getX(j),N.getY(j),N.getZ(j),T?T.getX(j):0,T?T.getY(j):0]);}polygons.push(poly);
  }
  let seed=31;const random=()=>((seed=seed*16807%2147483647)/2147483647);
  const sites=[];
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)sites.push([b.min.x+(x+.5+(random()-.5)*.5)*w/columns,b.min.y+(y+.5+(random()-.5)*.5)*h/rows]);
  const shards=[];
  for(let i=0;i<sites.length;i++) {
    const [x,y]=sites[i], planes=[];
    for(let j=0;j<sites.length;j++)if(j!==i){
      const [xx,yy]=sites[j],dx=xx-x,dy=yy-y,length=Math.hypot(dx,dy);
      planes.push([dx/length,dy/length,((xx*xx+yy*yy)-(x*x+y*y))/(2*length)]);
    }
    // Exact shortcut: a triangle that passes every earlier cut untouched (strictly inside, so it adds no cut
    // points) and then lies wholly beyond one cut would be dropped there by clip() anyway, leaving no trace.
    // Skipping it up front gives the same shard, without copying most of the shell through every cut.
    let faces=polygons.filter(poly=>{
      for(const [nx,ny,d] of planes) {
        let inside=true,beyond=true;
        for(const v of poly){const s=v[0]*nx+v[1]*ny-d;if(s>=-2*EPS)inside=false;if(s<=EPS)beyond=false;}
        if(beyond)return false;
        if(!inside)return true;
      }
      return true;
    });
    for(const [nx,ny,d] of planes){if(!faces.length)break;faces=clip(faces,nx,ny,d,closeCuts);}
    if(!faces.length)continue;
    const pos=[],norm=[],uv=[];
    for(const poly of faces)for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){pos.push(v[0],v[1],v[2]);norm.push(v[3],v[4],v[5]);uv.push(v[6],v[7]);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.computeBoundingBox();geo.computeBoundingSphere();
    const shard=new THREE.Mesh(geo,mesh.material);shard.quaternion.copy(mesh.quaternion);shard.scale.copy(mesh.scale);shards.push(shard);
  }
  if(baking&&!baking.has(key))baking.set(key,shards.map(sh=>sh.geometry.clone()));   // a copy: callers may move a shard's geometry later
  if(source!==mesh.geometry)source.dispose();mesh.geometry.dispose();
  return shards;
}
