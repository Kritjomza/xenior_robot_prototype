import { forwardRef, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RobotState } from "../generated/state";
import { deltaScenePose, type Point3 } from "./deltaScenePose";

export type DeltaRobotSceneHandle = {
  resetView: () => void;
  fitView: () => void;
};

const up = new THREE.Vector3(0, 1, 0);
const vector = (point: Point3) => new THREE.Vector3(...point);

function positionBeam(mesh: THREE.Mesh, start: Point3, end: Point3) {
  const a = vector(start);
  const b = vector(end);
  const direction = b.clone().sub(a);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
  mesh.scale.y = direction.length();
}

function beam(material: THREE.Material, radius: number) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 14), material);
}

export const DeltaRobotScene = forwardRef<DeltaRobotSceneHandle, { state: RobotState }>(
  function DeltaRobotScene({ state }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const initialStateRef = useRef(state);
    const updateRef = useRef<(state: RobotState) => void>(() => {});
    const resetRef = useRef<() => void>(() => {});
    const fitRef = useRef<() => void>(() => {});
    const [error, setError] = useState("");

    useEffect(() => {
      if (typeof ref === "function") {
        ref({ resetView: () => resetRef.current(), fitView: () => fitRef.current() });
        return () => ref(null);
      }
      if (ref) {
        ref.current = { resetView: () => resetRef.current(), fitView: () => fitRef.current() };
        return () => { ref.current = null; };
      }
    }, [ref]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      } catch {
        setError("3D graphics unavailable in this browser. Open RoboDK for station view.");
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x151e31);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x151e31, 10, 24);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.minDistance = 3;
      controls.maxDistance = 16;
      const target = new THREE.Vector3(0, -2.2, 0);
      const setCamera = (distance: number) => {
        controls.target.copy(target);
        camera.position.set(distance * 0.65, distance * 0.38, distance * 0.85);
        camera.lookAt(target);
        controls.update();
      };
      resetRef.current = () => setCamera(8);
      fitRef.current = () => setCamera(6.6);
      resetRef.current();

      scene.add(new THREE.HemisphereLight(0xd9ecff, 0x34415a, 2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(4, 8, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x6ca8ff, 1.2);
      rim.position.set(-5, 1, -4);
      scene.add(rim);

      const navy = new THREE.MeshStandardMaterial({ color: 0x243e75, metalness: 0.4, roughness: 0.43 });
      const metal = new THREE.MeshStandardMaterial({ color: 0xacc7e7, metalness: 0.78, roughness: 0.23 });
      const linkBlue = new THREE.MeshStandardMaterial({ color: 0x6bb7eb, metalness: 0.55, roughness: 0.32 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x142238, metalness: 0.55, roughness: 0.35 });
      const orange = new THREE.MeshStandardMaterial({ color: 0xf47a36, metalness: 0.28, roughness: 0.42 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.62, 0.24, 64), navy);
      base.position.y = 0;
      scene.add(base);
      const rimRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.045, 10, 64), orange);
      rimRing.rotation.x = Math.PI / 2;
      rimRing.position.y = -0.14;
      scene.add(rimRing);
      const center = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, 0.22, 32), metal);
      center.position.y = -0.21;
      scene.add(center);

      const motors = Array.from({ length: 3 }, () => {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.52), dark);
        scene.add(housing);
        return housing;
      });
      const upper = Array.from({ length: 3 }, () => {
        const link = beam(metal, 0.095);
        scene.add(link);
        return link;
      });
      const lower = Array.from({ length: 6 }, () => {
        const link = beam(linkBlue, 0.047);
        scene.add(link);
        return link;
      });
      const elbows = Array.from({ length: 3 }, () => {
        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), orange);
        scene.add(joint);
        return joint;
      });
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.74, 0.17, 48), navy);
      scene.add(platform);
      const platformRing = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 8, 48), orange);
      platformRing.rotation.x = Math.PI / 2;
      scene.add(platformRing);
      const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.35, 20), orange);
      scene.add(tool);

      const floor = new THREE.GridHelper(8, 16, 0x577293, 0x35475f);
      floor.position.y = -5.15;
      scene.add(floor);
      const axes = new THREE.AxesHelper(0.6);
      axes.position.set(-3.55, -5.12, -3.55);
      scene.add(axes);

      updateRef.current = (telemetry) => {
        const pose = deltaScenePose(telemetry);
        pose.motors.forEach((point, index) => {
          motors[index].position.copy(vector(point));
          positionBeam(upper[index], point, pose.elbows[index]);
          elbows[index].position.copy(vector(pose.elbows[index]));
          const angle = (index * Math.PI * 2) / 3;
          const tangent: Point3 = [-Math.sin(angle) * 0.12, 0, Math.cos(angle) * 0.12];
          for (const [sideIndex, offset] of [-1, 1].entries()) {
            const elbow: Point3 = pose.elbows[index].map((v, axis) => v + tangent[axis] * offset) as Point3;
            const attachment: Point3 = pose.platformJoints[index].map((v, axis) => v + tangent[axis] * offset) as Point3;
            positionBeam(lower[index * 2 + sideIndex], elbow, attachment);
          }
        });
        platform.position.set(pose.tool[0], pose.tool[1] + 0.15, pose.tool[2]);
        platformRing.position.set(pose.tool[0], pose.tool[1] + 0.25, pose.tool[2]);
        tool.position.set(pose.tool[0], pose.tool[1] - 0.12, pose.tool[2]);
      };
      updateRef.current(initialStateRef.current);

      const resize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      resize();
      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });

      return () => {
        renderer.setAnimationLoop(null);
        observer.disconnect();
        controls.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) object.geometry.dispose();
        });
        for (const material of [navy, metal, linkBlue, dark, orange]) material.dispose();
        renderer.dispose();
      };
    }, []);

    useEffect(() => updateRef.current(state), [state]);

    return <div className="delta-scene">
      <canvas ref={canvasRef} aria-label="Interactive 3D delta robot" />
      {error && <p role="alert" className="delta-scene-error">{error}</p>}
      <div className="delta-scene-readout" aria-hidden="true">
        <strong>LIVE POSE</strong>
        <span>X {state.x_mm.toFixed(1)} · Y {state.y_mm.toFixed(1)} · Z {state.z_mm.toFixed(1)} mm</span>
      </div>
      <span className="delta-scene-hint">Drag to orbit · scroll to zoom</span>
    </div>;
  },
);

export default DeltaRobotScene;
