// Minimal-Stub von three.js für Laufzeittests ohne Browser/WebGL.
// Erlaubt es, die Modellbau-Funktionen wirklich AUFZURUFEN — reine
// Syntaxprüfung findet Scope- und Laufzeitfehler in diesen Funktionen nicht.
const vec = () => ({ x:0,y:0,z:0, set(){return this}, copy(){return this}, clone(){return vec()},
  add(){return this}, sub(){return this}, multiplyScalar(){return this}, normalize(){return this}, setScalar(){return this},
  lerp(){return this}, distanceTo(){return 1}, length(){return 1}, cross(){return this}, dot(){return 0},
  subVectors(){return this}, addVectors(){return this}, crossVectors(){return this}, setFromAxisAngle(){return this},
  // applyQuaternion/applyMatrix fehlten — jeder Code, der eine Weltrichtung in
  // lokale Koordinaten dreht (Pistenraupe, Abgasfahne), brach im Test ab.
  applyQuaternion(){return this}, applyMatrix4(){return this}, applyAxisAngle(){return this},
  negate(){return this}, divideScalar(){return this}, addScaledVector(){return this},
  lengthSq(){return 1}, manhattanLength(){return 1}, angleTo(){return 0},
  project(){return this}, unproject(){return this}, min(){return this}, max(){return this},
  clamp(){return this}, floor(){return this}, round(){return this}, equals(){return false},
  fromArray(){return this}, toArray(){return [0,0,0]}, setY(){return this}, setX(){return this}, setZ(){return this} });
const obj = () => { const o = {
  position: vec(), rotation:{x:0,y:0,z:0,set(){},copy(){},clone(){return{x:0,y:0,z:0,set(){}}}}, scale: vec(),
  quaternion:{set(){},copy(){},slerp(){},multiply(){return this},setFromAxisAngle(){return this},setFromRotationMatrix(){return this},invert(){return this}},
  userData:{}, children:[], visible:true, castShadow:false, receiveShadow:false, matrix:{}, count:6,
  add(...c){for(const x of c) if(x) this.children.push(x); return this}, remove(){return this},
  clone(){return obj()}, lookAt(){}, updateMatrix(){}, updateMatrixWorld(){}, localToWorld(v){return v||vec()},
  traverse(f){ f(this); for(const c of this.children) c.traverse && c.traverse(f); },
  getWorldPosition(v){ return v || vec() }, getWorldQuaternion(q){ return q || {} },
  getWorldDirection(v){ return v || vec() }, worldToLocal(v){ return v || vec() },
  getPoint(){return vec()}, setMatrixAt(){}, setColorAt(){}, dispose(){},
  instanceMatrix:{needsUpdate:false}, instanceColor:{needsUpdate:false, array:new Float32Array(65536)},
  attributes:{ position:{count:36,array:new Float32Array(108),setXYZ(){},needsUpdate:false},
               normal:{array:new Float32Array(108)}, color:{array:new Float32Array(144),needsUpdate:false} },
  // setAttribute muss das Attribut WIRKLICH ablegen, sonst liest jeder Test
  // die Dummy-Arrays statt der berechneten Geometrie.
  setAttribute(name, attr){ if(name && attr) this.attributes[name] = attr; return this; },
  getAttribute(name){ return this.attributes[name]; },
  setIndex(){}, computeVertexNormals(){}, toNonIndexed(){return this},
  translate(){return this}, rotateX(){return this}, rotateY(){return this}, rotateZ(){return this}, makeScale(){return this},
  compose(){return this}, points:[], isMesh:true, material:null };
  o.scale.set=function(){return this};
  // geometry zeigt auf dasselbe Objekt: mesh.geometry.attributes.position
  // muss im Test genauso funktionieren wie bei echtem three.js
  o.geometry = o;
  // Positions-Attribut vollwertig: Lese- UND Schreibzugriff. Ohne getX/getY/getZ
  // lief der Fahnen-Code im Test nie durch.
  {
    const pa = o.attributes.position, arr = pa.array;
    pa.getX = (i)=>arr[i*3]; pa.getY = (i)=>arr[i*3+1]; pa.getZ = (i)=>arr[i*3+2];
    pa.setX = (i,v)=>{arr[i*3]=v;}; pa.setY = (i,v)=>{arr[i*3+1]=v;}; pa.setZ = (i,v)=>{arr[i*3+2]=v;};
    pa.setXYZ = (i,x,y,z)=>{arr[i*3]=x;arr[i*3+1]=y;arr[i*3+2]=z;};
  }
  // Geometrien haben eine eigene scale(x,y,z)-METHODE (nicht den Vektor der
  // Objekte) — ohne sie schlägt jede Geometrie-Skalierung im Test fehl.
  o.scaleGeo = function(){ return this };
  return o; };
const THREE = new Proxy({}, { get(_, k) {
  if (['DoubleSide','FrontSide','BackSide'].includes(k)) return 2;
  if (k === 'MathUtils') return { lerp:(a,b,t)=>a+(b-a)*t, clamp:(v,a,b)=>Math.max(a,Math.min(b,v)) };
  if (k === 'default') return THREE;
  if (k === 'PMREMGenerator') return function(){ return { fromEquirectangular(){ return { texture:{} } }, dispose(){} } };
  if (k === 'EquirectangularReflectionMapping') return 303;
  if (k === 'SRGBColorSpace') return 'srgb';
  if (k === 'Vector3' || k === 'Vector2' || k === 'Euler') return function(){ return vec() };
  // Shape/Path: makePrismRoof & Co. bauen damit ihre Profile. Ohne moveTo/lineTo
  // liefen diese Funktionen im Test in einen TypeError — makeHotel war
  // deshalb ueberhaupt nicht testbar.
  if (k === 'Shape' || k === 'Path' || k === 'Curve' || k === 'CurvePath')
    return function(){ const pts=[]; return {
      currentPoint: vec(), holes: [], points: pts,
      moveTo(x,y){ pts.push([x,y]); return this },
      lineTo(x,y){ pts.push([x,y]); return this },
      bezierCurveTo(){ return this }, quadraticCurveTo(){ return this },
      absarc(){ return this }, arc(){ return this }, ellipse(){ return this },
      splineThru(){ return this }, closePath(){ return this },
      getPoints(){ return pts.map(()=>vec()) },
      getSpacedPoints(){ return pts.map(()=>vec()) },
      extractPoints(){ return { shape: pts.map(()=>vec()), holes: [] } }
    } };
  if (k === 'Quaternion') return function(){ return { set(){return this}, copy(){return this},
    multiply(){return this}, setFromAxisAngle(){return this}, setFromRotationMatrix(){return this},
    invert(){return this}, slerp(){return this} } };
  if (k === 'Color') return function(){ const c={r:.5,g:.5,b:.5,isColor:true,set(){return this},copy(){return this},
    lerp(){return this},setRGB(){return this},setHex(){return this},setHSL(){return this},setStyle(){return this},
    multiplyScalar(){return this},add(){return this},offsetHSL(){return this},
    getHex(){return 0x5588cd},getHexString(){return '5588cd'},getStyle(){return '#5588cd'}};
    c.clone=()=>THREE.Color(); return c; };
  if (k === 'Float32BufferAttribute' || k === 'BufferAttribute' || k === 'InstancedBufferAttribute')
    return function(a, itemSize){
      const arr = a instanceof Float32Array ? a : Float32Array.from(a || [0,0,0,0,0,0]);
      const n = itemSize || 3;
      return { array: arr, itemSize: n, needsUpdate: false, count: (arr.length / n) | 0,
        getX:(i)=>arr[i*n], getY:(i)=>arr[i*n+1], getZ:(i)=>arr[i*n+2],
        setX:(i,v)=>{arr[i*n]=v;}, setY:(i,v)=>{arr[i*n+1]=v;}, setZ:(i,v)=>{arr[i*n+2]=v;},
        setXYZ:(i,x,y,z)=>{arr[i*n]=x;arr[i*n+1]=y;arr[i*n+2]=z;} };
    };
  if (/Texture$/.test(k)) return function(){ const t=obj(); t.offset={x:0,y:0,set(){return this}}; t.repeat={x:1,y:1,set(){return this}}; t.needsUpdate=false; return t; };
  if (/Material$/.test(k)) return function(o2){ const m=obj(); Object.assign(m,o2||{});
    if(!m.color||!m.color.copy) m.color=THREE.Color(); if(!m.emissive||!m.emissive.copy) m.emissive=THREE.Color();
    if(m.opacity==null) m.opacity=1; if(!m.userData) m.userData={}; return m; };
  return function(){
    const o = obj();
    // ECHTE PlaneGeometry: die Fahnen rechnen auf den Stützpunkten. Mit dem
    // alten Null-Array liess sich die Verformung im Test nicht messen.
    if (k === 'PlaneGeometry') {
      const w = arguments[0] ?? 1, h = arguments[1] ?? 1;
      const sw = Math.max(1, arguments[2] ?? 1), sh = Math.max(1, arguments[3] ?? 1);
      const n = (sw + 1) * (sh + 1);
      const arr = new Float32Array(n * 3);
      let idx = 0;
      for (let iy = 0; iy <= sh; iy++) for (let ix = 0; ix <= sw; ix++) {
        arr[idx++] = -w / 2 + (ix / sw) * w;
        arr[idx++] =  h / 2 - (iy / sh) * h;
        arr[idx++] = 0;
      }
      const pa = { count: n, array: arr, needsUpdate: false,
        getX:(i)=>arr[i*3], getY:(i)=>arr[i*3+1], getZ:(i)=>arr[i*3+2],
        setX:(i,v)=>{arr[i*3]=v;}, setY:(i,v)=>{arr[i*3+1]=v;}, setZ:(i,v)=>{arr[i*3+2]=v;},
        setXYZ:(i,x,y,z)=>{arr[i*3]=x;arr[i*3+1]=y;arr[i*3+2]=z;} };
      o.attributes = { position: pa, normal: { array: new Float32Array(n*3) },
                       color: { array: new Float32Array(n*3), needsUpdate:false } };
      o.geometry = o;
      // translate/rotate wirken hier WIRKLICH, sonst läge der Fahnenursprung
      // im Test an einer anderen Stelle als im Spiel.
      o.translate = (dx=0, dy=0, dz=0) => {
        for (let i = 0; i < n; i++) { arr[i*3]+=dx; arr[i*3+1]+=dy; arr[i*3+2]+=dz; }
        return o;
      };
      return o;
    }
    if (/Mesh|Sprite|Points|Line/.test(k)) {
      o.material = arguments[1] || THREE.MeshStandardMaterial();
      // Das übergebene Geometrieobjekt WIRKLICH übernehmen. Vorher zeigte
      // mesh.geometry immer auf das Mesh selbst — Code, der über
      // mesh.geometry.attributes.position rechnet (Fahnentuch, Rauch),
      // lief dadurch im Test auf einem leeren Dummy-Array statt auf den
      // echten Stützpunkten und konnte gar nicht fehlschlagen.
      if (arguments[0] && arguments[0].attributes) o.geometry = arguments[0];
    }
    // Geometrie-Objekte: scale() ist hier eine Methode, kein Vektor
    if (/Geometry$/.test(k)) o.scale = function(){ return this };
    return o;
  };
}});
export default THREE;
