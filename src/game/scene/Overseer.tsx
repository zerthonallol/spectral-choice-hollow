// The Overseer: ~3 m tall, stitched from cables, pipes and flesh, with a
// glowing projector screen for a face. Built procedurally.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { game } from "../sim/game";
import { getTextures } from "./textures";

const screenVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const screenFrag = /* glsl */ `
uniform float uTime; uniform float uMode; uniform float uPower;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float line = floor(uv.y * 90.0);
  uv.x += (h(vec2(line, floor(uTime*12.0))) - 0.5) * 0.04 * (0.4 + uMode);
  float n = h(floor(uv * vec2(160.0, 90.0)) + floor(uTime * 24.0));
  vec2 c = uv - vec2(0.5);
  c.x *= 1.5;
  // a single staring eye
  float iris = smoothstep(0.17, 0.15, length(c));
  float pupil = smoothstep(0.07 - uMode*0.03, 0.05 - uMode*0.03, length(c - vec2(sin(uTime*0.7)*0.03, 0.0)));
  float lid = smoothstep(0.0, 0.03, 0.22 - abs(c.y) * (1.0 + 2.5*abs(sin(uTime*0.31))));
  vec3 calm = vec3(0.75, 0.95, 1.0);
  vec3 hunt = vec3(1.0, 0.18, 0.1);
  vec3 col = mix(calm, hunt, uMode);
  vec3 o = col * (0.18 + n * 0.35);
  o += col * iris * lid * 1.6;
  o *= 1.0 - pupil * lid * 0.95;
  o *= 0.85 + 0.15 * sin(vUv.y * 600.0);
  float vig = smoothstep(0.75, 0.2, length(vUv - 0.5));
  gl_FragColor = vec4(o * vig * uPower * 2.2, 1.0);
}`;

function cableCurve(seed: number, top: THREE.Vector3, bottom: THREE.Vector3, bulge: number) {
  const r = (k: number) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5;
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const p = new THREE.Vector3().lerpVectors(bottom, top, t);
    const b = Math.sin(t * Math.PI) * bulge;
    p.x += r(i) * b;
    p.z += r(i + 7) * b;
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function Overseer() {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const cone = useRef<THREE.Mesh>(null!);
  const tex = getTextures();

  const res = useMemo(() => {
    const screen = new THREE.ShaderMaterial({
      vertexShader: screenVert,
      fragmentShader: screenFrag,
      uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uPower: { value: 1 } },
      toneMapped: false,
    });
    const flesh = new THREE.MeshStandardMaterial({ color: "#6e2a26", roughness: 0.35, metalness: 0.05 });
    const flesh2 = new THREE.MeshStandardMaterial({ color: "#9a5148", roughness: 0.5 });
    const pipe = new THREE.MeshStandardMaterial({ map: tex.metal, color: "#7a7164", metalness: 0.75, roughness: 0.4 });
    const cable = new THREE.MeshStandardMaterial({ color: "#121110", roughness: 0.55, metalness: 0.2 });
    const cableTubes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * 0.22, 2.45, Math.sin(a) * 0.16);
      const bot = new THREE.Vector3(Math.cos(a + 0.6) * 0.18, 1.35, Math.sin(a + 0.6) * 0.14);
      cableTubes.push(new THREE.TubeGeometry(cableCurve(i + 1, top, bot, 0.35), 16, 0.035 + (i % 3) * 0.012, 5));
    }
    // fleshy mass deformed from an icosahedron
    const lump = new THREE.IcosahedronGeometry(0.42, 3);
    const pa = lump.getAttribute("position");
    for (let i = 0; i < pa.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pa, i);
      const n = Math.sin(v.x * 9) * Math.sin(v.y * 7 + 1) * Math.sin(v.z * 8 + 2);
      v.multiplyScalar(1 + n * 0.22);
      v.y *= 1.4;
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    lump.computeVertexNormals();
    const coneGeo = new THREE.ConeGeometry(2.6, 9, 24, 1, true).translate(0, -4.5, 0).rotateX(-Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.6, 0.85, 1.0),
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    return { screen, flesh, flesh2, pipe, cable, cableTubes, lump, coneGeo, coneMat };
  }, [tex]);

  useFrame((st, dt) => {
    const m = game.monster;
    const t = st.clock.elapsedTime;
    root.current.position.set(m.x, 0, m.z);
    // The model is built facing +Z, while sim yaw points along -Z — flip it so it walks face-first.
    root.current.rotation.y = m.yaw + Math.PI;
    const stride = m.stride * Math.PI;
    const moving = Math.min(1, m.speed / 2);
    legL.current.rotation.x = Math.sin(stride) * 0.45 * moving;
    legR.current.rotation.x = -Math.sin(stride) * 0.45 * moving;
    const stunned = m.stunT > 0;
    const shake = stunned ? Math.sin(t * 45) * 0.06 : 0;
    body.current.position.y = Math.abs(Math.cos(stride)) * 0.08 * moving;
    body.current.rotation.z = Math.sin(stride) * 0.05 * moving + shake;
    body.current.rotation.x = (m.state === "hunt" ? 0.18 : 0.06) + (stunned ? 0.35 : 0);
    const reach = m.attackAnim > 0 ? Math.sin((m.attackAnim / 0.6) * Math.PI) * 1.6 : 0;
    armL.current.rotation.x = -Math.sin(stride) * 0.3 * moving - reach + Math.sin(t * 1.3) * 0.05;
    armR.current.rotation.x = Math.sin(stride) * 0.3 * moving - reach * 0.8 + Math.sin(t * 1.1 + 1) * 0.05;
    head.current.rotation.y = Math.sin(t * 0.6) * 0.25 * (m.state === "patrol" ? 1 : 0.2) + shake * 3;
    head.current.rotation.z = Math.sin(t * 0.37) * 0.12 + (stunned ? 0.4 : 0);
    const u = res.screen.uniforms;
    u.uTime.value = t;
    const hunt = m.state === "hunt" || m.state === "investigate" ? 1 : 0;
    u.uMode.value += (hunt - u.uMode.value) * Math.min(1, dt * 3);
    u.uPower.value = stunned ? (Math.random() > 0.5 ? 0.2 : 1) : m.inLight ? 1 : 0.35;
    const coneTarget = m.projecting ? 0.14 + Math.random() * 0.03 : m.inLight && !stunned ? 0.035 : 0;
    res.coneMat.opacity += (coneTarget - res.coneMat.opacity) * Math.min(1, dt * 5);
    res.coneMat.color.setRGB(0.6 + hunt * 0.4, 0.85 - hunt * 0.6, 1.0 - hunt * 0.8);
    cone.current.visible = res.coneMat.opacity > 0.005;
  });

  const Leg = ({ side, r }: { side: number; r: React.RefObject<THREE.Group> }) => (
    <group ref={r} position={[side * 0.2, 1.45, 0]}>
      <mesh position={[0, -0.38, 0]} castShadow material={res.pipe}>
        <cylinderGeometry args={[0.08, 0.06, 0.8, 8]} />
      </mesh>
      <mesh position={[0, -0.8, 0]} castShadow material={res.flesh}>
        <sphereGeometry args={[0.1, 8, 6]} />
      </mesh>
      <mesh position={[0, -1.12, 0.06]} rotation={[-0.12, 0, 0]} castShadow material={res.pipe}>
        <cylinderGeometry args={[0.06, 0.05, 0.66, 8]} />
      </mesh>
      <mesh position={[0, -1.42, 0.1]} castShadow material={res.cable}>
        <boxGeometry args={[0.14, 0.06, 0.32]} />
      </mesh>
    </group>
  );

  const Arm = ({ side, r }: { side: number; r: React.RefObject<THREE.Group> }) => (
    <group ref={r} position={[side * 0.42, 2.35, 0]} rotation={[0, 0, side * 0.12]}>
      <mesh position={[0, -0.45, 0]} castShadow material={res.cable}>
        <cylinderGeometry args={[0.05, 0.04, 0.95, 6]} />
      </mesh>
      <mesh position={[0, -0.95, 0]} castShadow material={res.flesh2}>
        <sphereGeometry args={[0.07, 8, 6]} />
      </mesh>
      <mesh position={[0, -1.45, 0.05]} castShadow material={res.pipe}>
        <cylinderGeometry args={[0.04, 0.03, 0.95, 6]} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[k * 0.04, -2.0, 0.08]} rotation={[0.3, 0, k * 0.25]} castShadow material={res.cable}>
          <cylinderGeometry args={[0.012, 0.006, 0.28, 4]} />
        </mesh>
      ))}
    </group>
  );

  return (
    <group ref={root}>
      <Leg side={-1} r={legL} />
      <Leg side={1} r={legR} />
      <group ref={body}>
        {/* pelvis */}
        <mesh position={[0, 1.45, 0]} castShadow material={res.pipe}>
          <boxGeometry args={[0.55, 0.18, 0.28]} />
        </mesh>
        {/* cable torso */}
        {res.cableTubes.map((g, i) => (
          <mesh key={i} geometry={g} material={res.cable} castShadow />
        ))}
        <mesh position={[0.04, 1.95, 0.02]} geometry={res.lump} material={res.flesh} castShadow />
        {/* rib pipes */}
        {[1.75, 2.0, 2.25].map((y, i) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={res.pipe}>
            <torusGeometry args={[0.3 - i * 0.02, 0.03, 6, 14, Math.PI * 1.2]} />
          </mesh>
        ))}
        {/* shoulders */}
        <mesh position={[0, 2.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={res.pipe}>
          <cylinderGeometry args={[0.07, 0.07, 0.95, 8]} />
        </mesh>
        <Arm side={-1} r={armL} />
        <Arm side={1} r={armR} />
        {/* neck cables */}
        <mesh position={[0, 2.55, 0]} castShadow material={res.cable}>
          <cylinderGeometry args={[0.09, 0.14, 0.3, 8]} />
        </mesh>
        {/* projector head */}
        <group ref={head} position={[0, 2.82, 0]}>
          <mesh castShadow material={res.pipe}>
            <boxGeometry args={[0.72, 0.5, 0.5]} />
          </mesh>
          <mesh position={[0, 0, 0.26]} material={res.screen}>
            <planeGeometry args={[0.62, 0.4]} />
          </mesh>
          <mesh position={[0, 0.3, -0.1]} material={res.cable}>
            <boxGeometry args={[0.4, 0.1, 0.3]} />
          </mesh>
          <mesh ref={cone} position={[0, 0, 0.3]} geometry={res.coneGeo} material={res.coneMat} />
        </group>
      </group>
    </group>
  );
}
