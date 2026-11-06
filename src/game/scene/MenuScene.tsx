// Main-menu backdrop: a dim tunnel corner with the Overseer peeking around
// the wall, its projector-face following the cursor.
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Overseer } from "./Overseer";
import { getTextures } from "./textures";

function Corner() {
  const tex = getTextures();
  const mats = useMemo(() => {
    const wall = new THREE.MeshStandardMaterial({ map: tex.wall, roughnessMap: tex.wallRough, color: "#8a8070" });
    const floor = new THREE.MeshStandardMaterial({ map: tex.floor, roughnessMap: tex.floorRough, color: "#6a6255" });
    return { wall, floor };
  }, [tex]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={mats.floor}>
        <planeGeometry args={[20, 20]} />
      </mesh>
      {/* the wall he hides behind, edge at x = 0.35 */}
      <mesh position={[2.35, 1.8, 0.4]} castShadow receiveShadow material={mats.wall}>
        <boxGeometry args={[4, 3.6, 0.6]} />
      </mesh>
      {/* back wall of the tunnel */}
      <mesh position={[0, 1.8, -2.2]} receiveShadow material={mats.wall}>
        <boxGeometry args={[12, 3.6, 0.4]} />
      </mesh>
      <mesh position={[-3.2, 1.8, 0]} rotation-y={Math.PI / 2} receiveShadow material={mats.wall}>
        <boxGeometry args={[6, 3.6, 0.4]} />
      </mesh>
    </group>
  );
}

function FlickerLamp() {
  const light = useRef<THREE.PointLight>(null!);
  const tube = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = Math.sin(t * 13) + Math.sin(t * 31.7) + Math.sin(t * 2.1);
    const on = f > -1.9 ? 1 : 0.08;
    light.current.intensity = 9 * on;
    tube.current.color.setRGB(3 * on, 2 * on, 0.9 * on);
  });
  return (
    <group position={[-1.2, 3.3, -0.6]}>
      <pointLight ref={light} color="#ffb060" distance={9} decay={1.6} castShadow shadow-mapSize={[512, 512]} />
      <mesh>
        <boxGeometry args={[0.9, 0.06, 0.12]} />
        <meshBasicMaterial ref={tube} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CameraDrift() {
  useFrame(({ camera, clock, pointer }) => {
    const t = clock.elapsedTime;
    camera.position.x += (-0.6 + pointer.x * 0.25 + Math.sin(t * 0.2) * 0.1 - camera.position.x) * 0.03;
    camera.position.y += (1.7 + pointer.y * 0.12 - camera.position.y) * 0.03;
    camera.lookAt(0.6, 2.0, 0);
  });
  return null;
}

export function MenuScene({ low = false }: { low?: boolean }) {
  return (
    <Canvas
      shadows={!low}
      dpr={low ? 0.6 : [1, 1.5]}
      camera={{ fov: 45, position: [-0.6, 1.7, 5.2], near: 0.1, far: 30 }}
      gl={{ antialias: !low, powerPreference: low ? "low-power" : "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        scene.background = new THREE.Color("#050403");
        scene.fog = new THREE.FogExp2("#060504", 0.07);
      }}
    >
      <ambientLight intensity={0.25} color="#8a7a66" />
      <pointLight position={[-0.6, 2.4, 1.6]} intensity={5} distance={5} decay={1.5} color="#9fc4e0" />
      <pointLight position={[0.3, 2.9, 0.4]} intensity={3} distance={2} decay={2} color="#bfe6ff" />
      <spotLight position={[-2, 1, 4]} angle={0.6} penumbra={0.8} intensity={6} color="#7fa8c8" distance={12} />
      <FlickerLamp />
      <Corner />
      {/* Overseer half behind the wall, leaning out to look at you */}
      <group position={[0.35, 0, -0.35]} rotation-y={-0.3}>
        <Overseer menu />
      </group>
      <CameraDrift />
    </Canvas>
  );
}
