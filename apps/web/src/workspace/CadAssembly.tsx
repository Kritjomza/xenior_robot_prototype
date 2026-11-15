import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
type Part = {name:string;color?:number[];attributes:{position:{array:number[]};normal?:{array:number[]}};index:{array:number[]}};
export function CadAssembly() {
 const canvas = useRef<HTMLCanvasElement>(null);
 const [status,setStatus]=useState('Loading STEP assembly…');
 const [wire,setWire]=useState(false);
 const materials=useRef<THREE.MeshStandardMaterial[]>([]);
 useEffect(()=>{materials.current.forEach(m=>{m.wireframe=wire;});},[wire]);
 useEffect(()=>{
  if(!canvas.current)return;
  let renderer:THREE.WebGLRenderer;
  try {renderer=new THREE.WebGLRenderer({canvas:canvas.current,antialias:true});}catch{setStatus('WebGL is unavailable in this browser.');return;}
  let disposed=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#181a1d');
  const camera=new THREE.PerspectiveCamera(40,1,0.01,100000);
  const controls=new OrbitControls(camera,canvas.current);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x555555,3));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(1,2,3);scene.add(light);
  const resize=()=>{const el=canvas.current;if(!el)return;renderer.setSize(el.clientWidth,el.clientHeight,false);camera.aspect=el.clientWidth/Math.max(1,el.clientHeight);camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(canvas.current);resize();
  fetch('/models/delta-assembly.json').then(r=>{if(!r.ok)throw Error('CAD asset could not be loaded');return r.json();}).then((data:{meshes:Part[]})=>{
   if(disposed)return;
   const group=new THREE.Group();
   data.meshes.forEach(part=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.attributes.position.array,3));geometry.setIndex(part.index.array);geometry.computeVertexNormals();const c=part.color;const material=new THREE.MeshStandardMaterial({color:c?new THREE.Color(c[0],c[1],c[2]):new THREE.Color('#b6bec5'),metalness:0.35,roughness:0.5});materials.current.push(material);const mesh=new THREE.Mesh(geometry,material);mesh.name=part.name;group.add(mesh);});
   group.rotation.x=-Math.PI/2;scene.add(group);
   const box=new THREE.Box3().setFromObject(group);const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3()).length();group.position.sub(center);camera.position.set(size*.65,size*.4,size*.65);controls.target.set(0,0,0);controls.update();
   setStatus(`${data.meshes.length} CAD parts · millimeters · Reference assembly`);
  }).catch(e=>{if(!disposed)setStatus(String(e));});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  return()=>{disposed=true;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.current.forEach(m=>m.dispose());materials.current=[];renderer.dispose();};
 },[]);
 return <div><div style={{height:'min(60vh, 600px)',minHeight:320}}><canvas ref={canvas} style={{width:'100%',height:'100%',display:'block'}} aria-label="Original STEP robot assembly. Drag to orbit and scroll to zoom." /></div><div className="twin-toolbar"><label><input type="checkbox" checked={wire} onChange={e=>setWire(e.target.checked)}/> Wireframe</label><span role="status">{status}</span></div><p>Original CAD geometry. Joint mapping is not calibrated; use Simulation for the existing motion preview.</p></div>;
}
