import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { game, lockerDir } from "../sim/game";
import { CEIL, CLUTTER, MAP_H, MAP_W, PANELS, POI, TILE, cellAt, isSolidCell, tileCenter } from "../sim/map";
import { getTextures } from "./textures";

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s3 = new THREE.Vector3();
const p3 = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---------------- pipes & cables along the walls ----------------
function buildPipes() {
  const pipes: THREE.Matrix4[] = [];
  const cables: THREE.Matrix4[] = [];
  const valves: THREE.Matrix4[] = [];
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      const c = cellAt(tx, ty);
      if (isSolidCell(c) || c === "B") continue;
      const cen = tileCenter(tx, ty);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (cellAt(tx + dx, ty + dy) !== "#") continue;
        const wx = cen.x + dx * (TILE / 2 - 0.22);
        const wz = cen.z + dy * (TILE / 2 - 0.22);
        q.setFromUnitVectors(Y_AXIS, dx !== 0 ? Z_AXIS : X_AXIS);
        const big = (tx * 3 + ty * 5 + dx + dy * 2) % 3 !== 0;
        if (big) {
          m4.compose(p3.set(wx, 2.95, wz), q, s3.set(0.17, TILE, 0.17));
          pipes.push(m4.clone());
          if ((tx + ty) % 4 === 0) {
            const vq = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, new THREE.Vector3(-dx, 0, -dy));
            m4.compose(p3.set(wx - dx * 0.2, 2.95, wz - dy * 0.2), vq, s3.set(0.22, 0.05, 0.22));
            valves.push(m4.clone());
          }
        }
        m4.compose(
          p3.set(cen.x + dx * (TILE / 2 - 0.12), 2.45, cen.z + dy * (TILE / 2 - 0.12)),
          q,
          s3.set(0.06, TILE, 0.06),
        );
        cables.push(m4.clone());
        m4.compose(
          p3.set(cen.x + dx * (TILE / 2 - 0.16), 0.55, cen.z + dy * (TILE / 2 - 0.16)),
          q,
          s3.set(0.09, TILE, 0.09),
        );
        if ((tx + ty) % 2 === 0) pipes.push(m4.clone());
      }
    }
  return { pipes, cables, valves };
}

function Instanced({
  mats,
  geometry,
  material,
  castShadow = false,
}: {
  mats: THREE.Matrix4[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    mats.forEach((m, i) => ref.current.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [mats]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, mats.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
    />
  );
}

export function Pipes() {
  const tex = getTextures();
  const data = useMemo(buildPipes, []);
  const res = useMemo(
    () => ({
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
      cyl6: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
      wheel: new THREE.TorusGeometry(0.8, 0.22, 6, 12).rotateX(Math.PI / 2),
      pipe: new THREE.MeshStandardMaterial({ map: tex.metal, color: "#8a8370", roughness: 0.55, metalness: 0.6 }),
      cable: new THREE.MeshStandardMaterial({ color: "#151513", roughness: 0.7 }),
      valve: new THREE.MeshStandardMaterial({ color: "#8b1d12", roughness: 0.5, metalness: 0.4 }),
    }),
    [tex],
  );
  return (
    <group>
      <Instanced mats={data.pipes} geometry={res.cyl} material={res.pipe} />
      <Instanced mats={data.cables} geometry={res.cyl6} material={res.cable} />
      <Instanced mats={data.valves} geometry={res.wheel} material={res.valve} />
    </group>
  );
}

// ---------------- barrels and crates ----------------
export function Clutter() {
  const tex = getTextures();
  const { barrels, crates, res } = useMemo(() => {
    const barrels: THREE.Matrix4[] = [];
    const crates: THREE.Matrix4[] = [];
    for (const c of CLUTTER) {
      q.setFromAxisAngle(Y_AXIS, c.rot);
      if (c.kind === "barrel") barrels.push(new THREE.Matrix4().compose(p3.set(c.x, 0.55, c.z), q, s3.set(0.38, 1.1, 0.38)));
      else crates.push(new THREE.Matrix4().compose(p3.set(c.x, 0.4, c.z), q, s3.set(0.8, 0.8, 0.8)));
    }
    return {
      barrels,
      crates,
      res: {
        barrel: new THREE.CylinderGeometry(1, 1, 1, 14),
        crate: new THREE.BoxGeometry(1, 1, 1),
        barrelMat: new THREE.MeshStandardMaterial({ map: tex.metal, color: "#3d5a46", roughness: 0.5, metalness: 0.5 }),
        crateMat: new THREE.MeshStandardMaterial({ map: tex.metal, color: "#8a6a3e", roughness: 0.85 }),
      },
    };
  }, [tex]);
  return (
    <group>
      <Instanced mats={barrels} geometry={res.barrel} material={res.barrelMat} castShadow />
      <Instanced mats={crates} geometry={res.crate} material={res.crateMat} castShadow />
    </group>
  );
}

// ---------------- electrical panels (one per circuit) ----------------
function PanelMesh({ i }: { i: number }) {
  const pn = PANELS[i];
  const lever = useRef<THREE.Group>(null!);
  const led = useRef<THREE.MeshBasicMaterial>(null!);
  const tex = getTextures();
  const yaw = Math.atan2(pn.nx, pn.nz);
  useFrame((_, dt) => {
    const s = game.sectors[pn.sector];
    if (!s) return;
    const target = s.lit ? -0.6 : 0.6;
    lever.current.rotation.x += (target - lever.current.rotation.x) * Math.min(1, dt * 10);
    const c = s.shortedUntil > 0 ? [2.4, 1.2, 0.1] : s.lit ? [0.2, 2.6, 0.4] : [2.6, 0.15, 0.1];
    led.current.color.setRGB(c[0], c[1], c[2]);
  });
  return (
    <group position={[pn.x, 1.45, pn.z]} rotation={[0, yaw, 0]}>
      <mesh castShadow position={[0, 0, 0.08]}>
        <boxGeometry args={[0.7, 0.9, 0.16]} />
        <meshStandardMaterial map={tex.metal} color="#5b6a5a" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.32, 0.17]}>
        <planeGeometry args={[0.5, 0.12]} />
        <meshStandardMaterial map={tex.hazard} roughness={0.6} />
      </mesh>
      <group ref={lever} position={[0, -0.05, 0.2]}>
        <mesh position={[0, 0.16, 0.04]} castShadow>
          <boxGeometry args={[0.05, 0.34, 0.05]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.34, 0.04]}>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshStandardMaterial color="#9c1b12" roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0.24, -0.3, 0.17]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshBasicMaterial ref={led} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Panels() {
  return (
    <group>
      {PANELS.map((_, i) => (
        <PanelMesh key={i} i={i} />
      ))}
    </group>
  );
}

// ---------------- lockers ----------------
function Locker({ id }: { id: number }) {
  const pk = game.pickups[id];
  const door = useRef<THREE.Group>(null!);
  const tex = getTextures();
  const d = lockerDir(pk.tx, pk.ty);
  const c = tileCenter(pk.tx, pk.ty);
  const yaw = Math.atan2(-d.dx, -d.dz); // face back into the corridor
  const x = c.x + d.dx * (TILE / 2 - 0.3);
  const z = c.z + d.dz * (TILE / 2 - 0.3);
  useFrame((_, dt) => {
    const open = game.pickups[id]?.opened ? -1.9 : 0;
    door.current.rotation.y += (open - door.current.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* carcass: back, sides, top, shelf */}
      <mesh position={[0, 1.0, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 2.0, 0.04]} />
        <meshStandardMaterial map={tex.metal} color="#4f5e66" roughness={0.6} metalness={0.5} />
      </mesh>
      {[-0.43, 0.43].map((sx) => (
        <mesh key={sx} position={[sx, 1.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 2.0, 0.5]} />
          <meshStandardMaterial map={tex.metal} color="#4f5e66" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.0, 0]} castShadow>
        <boxGeometry args={[0.9, 0.04, 0.5]} />
        <meshStandardMaterial map={tex.metal} color="#4f5e66" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <boxGeometry args={[0.84, 0.03, 0.46]} />
        <meshStandardMaterial color="#3a3f3c" roughness={0.7} metalness={0.4} />
      </mesh>
      <group ref={door} position={[-0.45, 0, 0.25]}>
        <mesh position={[0.45, 1.0, 0]} castShadow>
          <boxGeometry args={[0.9, 2.0, 0.03]} />
          <meshStandardMaterial map={tex.metal} color="#6f7f86" roughness={0.55} metalness={0.55} />
        </mesh>
        {[1.7, 1.6, 1.5].map((y) => (
          <mesh key={y} position={[0.45, y, 0.02]}>
            <boxGeometry args={[0.5, 0.025, 0.01]} />
            <meshStandardMaterial color="#1b1f20" />
          </mesh>
        ))}
        <mesh position={[0.8, 1.05, 0.04]}>
          <boxGeometry args={[0.04, 0.16, 0.04]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

export function Lockers() {
  return (
    <group>
      {game.pickups
        .filter((p) => p.locker)
        .map((p) => (
          <Locker key={p.id} id={p.id} />
        ))}
    </group>
  );
}

// ---------------- bunker door ----------------
export function BunkerDoor() {
  const tex = getTextures();
  const slab = useRef<THREE.Group>(null!);
  const c = tileCenter(POI.bunkerDoor.tx, POI.bunkerDoor.ty);
  useFrame(() => {
    slab.current.position.y = game.doorAnim * (CEIL - 0.25);
  });
  return (
    <group position={[c.x, 0, c.z]}>
      <group ref={slab}>
        <mesh position={[0, CEIL / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.35, CEIL, TILE]} />
          <meshStandardMaterial map={tex.metal} color="#7d7a6c" roughness={0.45} metalness={0.7} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.18, 0.5, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <planeGeometry args={[TILE - 0.2, 0.5]} />
            <meshStandardMaterial map={tex.hazard} roughness={0.6} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={"w" + s} position={[s * 0.2, 1.8, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.45, 0.06, 8, 20]} />
            <meshStandardMaterial color="#5a1a12" roughness={0.4} metalness={0.6} />
          </mesh>
        ))}
      </group>
      {/* card reader beside the frame */}
      <mesh position={[0.6, 1.4, TILE / 2 - 0.08]}>
        <boxGeometry args={[0.22, 0.32, 0.1]} />
        <meshStandardMaterial color="#222" roughness={0.5} />
      </mesh>
      <ReaderLed position={[0.6, 1.5, TILE / 2 - 0.14]} />
    </group>
  );
}

function ReaderLed(props: { position: [number, number, number] }) {
  const m = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    if (game.bunkerOpen) m.current.color.setRGB(0.2, 2.5, 0.4);
    else m.current.color.setRGB(2.5, 0.2, 0.1);
  });
  return (
    <mesh position={props.position}>
      <boxGeometry args={[0.12, 0.04, 0.02]} />
      <meshBasicMaterial ref={m} toneMapped={false} />
    </mesh>
  );
}

// ---------------- elevator ----------------
export function Elevator() {
  const tex = getTextures();
  const beacon = useRef<THREE.Group>(null!);
  const beaconMat = useRef<THREE.MeshBasicMaterial>(null!);
  const c = tileCenter(POI.elevator.tx, POI.elevator.ty);
  const wz = c.z - TILE / 2;
  useFrame((_, dt) => {
    const active = game.sealT !== null;
    beacon.current.rotation.y += dt * (active ? 9 : 0.6);
    const k = active ? 4 : game.elevatorRepaired ? 1.5 : 0.25;
    beaconMat.current.color.setRGB(1 * k, 0.45 * k, 0.05 * k);
  });
  return (
    <group>
      {/* shaft opening with cage bars */}
      <mesh position={[c.x, 1.5, wz + 0.05]}>
        <planeGeometry args={[2.4, 3]} />
        <meshStandardMaterial color="#0b0c0b" roughness={1} />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} position={[c.x - 1.15 + i * 0.23, 1.5, wz + 0.15]} castShadow>
          <boxGeometry args={[0.035, 3, 0.035]} />
          <meshStandardMaterial color="#9a8f74" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      {[0.1, 1.5, 2.95].map((y) => (
        <mesh key={y} position={[c.x, y, wz + 0.15]}>
          <boxGeometry args={[2.5, 0.06, 0.06]} />
          <meshStandardMaterial color="#9a8f74" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[c.x, 3.2, wz + 0.1]}>
        <boxGeometry args={[2.8, 0.25, 0.2]} />
        <meshStandardMaterial map={tex.hazard} roughness={0.6} />
      </mesh>
      <group ref={beacon} position={[c.x + 1.25, 3.25, wz + 0.25]}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.12, 0.2, 12]} />
          <meshBasicMaterial ref={beaconMat} toneMapped={false} />
        </mesh>
        <mesh position={[0.08, 0, 0]}>
          <boxGeometry args={[0.04, 0.22, 0.2]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
      <Terminal position={[c.x + 1.0, 0, c.z - 0.6]} rotation={-0.6} kind="elevator" />
    </group>
  );
}

function Terminal({
  position,
  rotation,
  kind,
}: {
  position: [number, number, number];
  rotation: number;
  kind: "elevator" | "reactor";
}) {
  const tex = getTextures();
  const screen = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const alarm = kind === "reactor" ? game.nukeArmedT !== null : game.sealT !== null;
    const k = 0.9 + Math.sin(t * 40) * 0.05;
    if (alarm && Math.sin(t * 8) > 0) screen.current.color.setRGB(2.2, 0.2, 0.1);
    else screen.current.color.setRGB(0.25 * k, 1.4 * k, 0.6 * k);
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.2, 0.55]} />
        <meshStandardMaterial map={tex.metal} color="#5e6158" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.35, -0.05]} rotation={[-0.4, 0, 0]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.35]} />
        <meshStandardMaterial map={tex.metal} color="#4d5049" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.39, 0.13]} rotation={[-0.4, 0, 0]}>
        <planeGeometry args={[0.62, 0.36]} />
        <meshBasicMaterial ref={screen} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------- reactor console ----------------
export function Reactor() {
  const tex = getTextures();
  const core = useRef<THREE.MeshBasicMaterial>(null!);
  const c = tileCenter(POI.reactor.tx, POI.reactor.ty);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (game.nukePlanted) {
      const k = Math.sin(t * (game.nukeArmedT !== null && game.nukeArmedT < 30 ? 18 : 6)) > 0 ? 3 : 0.4;
      core.current.color.setRGB(k, k * 0.15, 0.05);
    } else core.current.color.setRGB(0.1, 0.5, 0.35);
  });
  return (
    <group>
      <Terminal position={[c.x + 0.7, 0, c.z]} rotation={Math.PI / 2 + Math.PI} kind="reactor" />
      <group position={[c.x + 1.15, 0, c.z - 1.0]}>
        <mesh position={[0, 1.3, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.4, 2.6, 16]} />
          <meshStandardMaterial map={tex.metal} color="#7a7a6c" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[-0.3, 1.4, 0]}>
          <boxGeometry args={[0.06, 0.8, 0.3]} />
          <meshBasicMaterial ref={core} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[c.x + 1.3, 2.6, c.z + 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.08, 8, 20]} />
        <meshStandardMaterial map={tex.hazard} roughness={0.5} />
      </mesh>
    </group>
  );
}

// ---------------- the Overseer's main emitter ----------------
export function Emitter() {
  const tex = getTextures();
  const c = tileCenter(POI.emitter.tx, POI.emitter.ty);
  const ring = useRef<THREE.Group>(null!);
  const lens = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    ring.current.rotation.y += dt * 0.4;
    const k = 1.6 + Math.sin(t * 2.3) * 0.4 + (game.inv.shard * 0.5);
    lens.current.color.setRGB(0.55 * k, 0.95 * k, 1.0 * k);
  });
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.35, 1.5, 0.5, 20]} />
        <meshStandardMaterial map={tex.metal} color="#56584f" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.7, 2.4, 16]} />
        <meshStandardMaterial map={tex.metal} color="#6e675a" metalness={0.75} roughness={0.4} />
      </mesh>
      <group ref={ring}>
        {[0.9, 1.5, 2.1].map((y, i) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.85 - i * 0.08, 0.07, 8, 28]} />
            <meshStandardMaterial color="#9b6a2a" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.95, 2.9, Math.sin(a) * 0.95]} rotation={[0, -a, 0.35]}>
              <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
              <meshStandardMaterial color="#121212" roughness={0.7} />
            </mesh>
          );
        })}
      </group>
      <mesh position={[0, 3.0, 0]}>
        <sphereGeometry args={[0.38, 20, 14]} />
        <meshBasicMaterial ref={lens} toneMapped={false} />
      </mesh>
      {/* three empty shard sockets */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.6, 1.2, Math.sin(a) * 0.6]}>
            <octahedronGeometry args={[0.11]} />
            <meshStandardMaterial color="#1a1a1a" metalness={1} roughness={0.15} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------- drain outflow ----------------
export function Drain() {
  const c = tileCenter(POI.drain.tx, POI.drain.ty);
  const x = c.x - TILE / 2 + 0.05;
  const glow = useRef<THREE.MeshBasicMaterial>(null!);
  const bars = useRef<THREE.Group>(null!);
  useFrame((st, dt) => {
    const armed = game.nukeArmedT !== null;
    const k = armed ? 2.4 + Math.sin(st.clock.elapsedTime * 3) * 0.3 : 1.1;
    glow.current.color.setRGB(0.55 * k, 0.8 * k, 0.9 * k);
    const target = armed ? 2.6 : 0;
    bars.current.position.y += (target - bars.current.position.y) * Math.min(1, dt * 1.5);
  });
  return (
    <group position={[x, 1.25, c.z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <circleGeometry args={[1.05, 28]} />
        <meshBasicMaterial ref={glow} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <torusGeometry args={[1.1, 0.12, 10, 32]} />
        <meshStandardMaterial color="#5f5a4c" metalness={0.8} roughness={0.4} />
      </mesh>
      <group ref={bars}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-0.9 + i * 0.3, 0, 0.08]}>
            <boxGeometry args={[0.05, 2.0, 0.05]} />
            <meshStandardMaterial color="#3c3a33" metalness={0.8} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
