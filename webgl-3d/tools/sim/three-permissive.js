import base from '../stub/three.js';
const permissive = (o) => new Proxy(o, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined; if (k === 'then') return undefined; const v = permissive({}); t[k] = Object.assign(function(){ return v; }, v); return t[k]; } });
const LIGHT = /Light$/;
const PERM = new Set(['WebGLRenderer','WebGLRenderTarget','WebGLCubeRenderTarget','PMREMGenerator','CubeCamera','Clock','Raycaster']);
const NOOP = ['setDrawRange','computeBoundingSphere','computeBoundingBox','lookAt','applyMatrix4','rotateX','rotateY','rotateZ','setFromPoints','getAttribute','deleteAttribute','normalizeNormals','toNonIndexed','center'];
const patch = (o) => { if (o && typeof o === 'object') for (const n of NOOP) if (!(n in o)) o[n] = function(){ return this; }; return o; };
const THREE = new Proxy(base, { get(t, k) {
  if (k === 'Clock') return function(){ return { getElapsedTime: () => global.__simT || 0, getDelta: () => 0.05, start(){}, stop(){} }; };
  if (k === 'Fog' || k === 'FogExp2') return function(){ return { color: THREE.Color(), near: 1, far: 100, density: 0.01 }; };
  if (/Curve3?$/.test(k)) return function(pts){ const P = pts || []; const V = (x,y,z)=>{ const v = base.Vector3(); v.x=x; v.y=y; v.z=z; return v; };
    const at = (u) => { if (!P.length || !P[0] || P[0].x == null) return V(0,0,0); u = Math.max(0, Math.min(1, u || 0)); const f = u * (P.length - 1); const i = Math.min(P.length - 2, Math.max(0, Math.floor(f))); const t = f - i; const a = P[i], b = P[Math.min(P.length-1, i+1)]; return V(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t, a.z + (b.z-a.z)*t); };
    return { points: P, getPoint: at, getPointAt: at, getPoints: (n=5) => Array.from({length:n+1},(_,i)=>at(i/n)), getSpacedPoints: (n=5) => Array.from({length:n+1},(_,i)=>at(i/n)), getLength: () => 1, getTangent: () => V(0,0,1), getTangentAt: () => V(0,0,1), computeFrenetFrames: () => ({ tangents: [], normals: [], binormals: [] }) }; };
  if (PERM.has(k)) return function(){ const o = permissive({ domElement: {}, shadowMap: {}, capabilities: {}, info: { render: {} } }); return o; };
  if (typeof k === 'string' && LIGHT.test(k)) return function(){ const o = t[k] ? new t[k]() : {}; const l = o && typeof o === 'object' ? o : {}; l.shadow = permissive({ mapSize: { set(){} }, camera: {} }); if(!l.target) l.target = { position: { set(){}, copy(){} } }; if(!l.color||!l.color.copy) l.color = THREE.Color(); if(!l.position) l.position = { set(){}, copy(){} }; return l; };
  const v = t[k];
  if (typeof v === 'function' && /Geometry$|^Mesh$|^Points$|^Line|^Group$|^Object3D$|^Sprite$|^InstancedMesh$/.test(k)) return function(...a){ const o = new v(...a); patch(o); if (o.geometry && o.geometry !== o) patch(o.geometry); return o; };
  return v;
} });
export default THREE;
