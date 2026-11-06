import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { game } from "../sim/game";
import type { ItemKind } from "../sim/map";
import { getTextures } from "./textures";

function Std(props: { color: string; metal?: number; rough?: number; emissive?: string; ei?: number; map?: THREE.Texture }) {
  return (
    <meshStandardMaterial
      color={props.color}
      metalness={props.metal ?? 0.2}
      roughness={props.rough ?? 0.6}
      emissive={props.emissive ?? "#000000"}
      emissiveIntensity={props.ei ?? 1}
      map={props.map}
    />
  );
}

export function ItemModel({ kind }: { kind: ItemKind }) {
  const tex = getTextures();
  switch (kind) {
    case "wrench":
      return (
        <group rotation={[0, 0, 0.3]}>
          <mesh castShadow>
            <boxGeometry args={[0.06, 0.42, 0.025]} />
            <Std color="#8c3b1c" metal={0.8} rough={0.5} map={tex.metal} />
          </mesh>
          <mesh position={[0, 0.25, 0]} castShadow>
            <torusGeometry args={[0.06, 0.025, 6, 12, Math.PI * 1.4]} />
            <Std color="#9a9080" metal={0.9} rough={0.35} />
          </mesh>
        </group>
      );
    case "stungun":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.1, 0.07, 0.24]} />
            <Std color="#d6a516" rough={0.45} />
          </mesh>
          <mesh position={[0, -0.07, 0.07]} castShadow>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <Std color="#1b1b1b" />
          </mesh>
          {[-0.025, 0.025].map((x) => (
            <mesh key={x} position={[x, 0, -0.14]}>
              <boxGeometry args={[0.01, 0.01, 0.05]} />
              <Std color="#ccc" metal={1} rough={0.2} emissive="#7fd7ff" ei={2} />
            </mesh>
          ))}
        </group>
      );
    case "redFlare":
    case "whiteFlare":
      return (
        <group rotation={[Math.PI / 2.4, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 10]} />
            <Std color={kind === "redFlare" ? "#b0170e" : "#e8e2d4"} rough={0.5} />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.033, 0.033, 0.05, 10]} />
            <Std color="#222" />
          </mesh>
        </group>
      );
    case "cortexin":
      return (
        <group rotation={[0, 0, Math.PI / 2.2]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.18, 10]} />
            <meshPhysicalMaterial color="#c8ffe8" transmission={0.6} roughness={0.1} thickness={0.05} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.022, 0.022, 0.15, 10]} />
            <Std color="#3cff9a" emissive="#2cff8a" ei={1.6} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.07, 4]} />
            <Std color="#ddd" metal={1} rough={0.2} />
          </mesh>
          <mesh position={[0, -0.11, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.04, 10]} />
            <Std color="#1d3d8c" />
          </mesh>
        </group>
      );
    case "bandage":
      return (
        <group>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.08, 14]} />
            <Std color="#e9e4d8" rough={0.95} />
          </mesh>
          <mesh position={[0.12, -0.02, 0]} castShadow>
            <boxGeometry args={[0.1, 0.05, 0.14]} />
            <Std color="#5b5a36" rough={0.9} />
          </mesh>
          <mesh position={[0.12, 0.006, 0]}>
            <boxGeometry args={[0.04, 0.001, 0.012]} />
            <Std color="#b11" emissive="#900" />
          </mesh>
        </group>
      );
    case "tape":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.2, 0.025, 0.13]} />
            <Std color="#262626" rough={0.4} />
          </mesh>
          <mesh position={[0, 0.014, 0.0]}>
            <boxGeometry args={[0.15, 0.002, 0.06]} />
            <Std color="#e7d9a8" emissive="#3a3010" />
          </mesh>
          {[-0.045, 0.045].map((x) => (
            <mesh key={x} position={[x, 0.016, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.004, 10]} />
              <Std color="#eee" />
            </mesh>
          ))}
        </group>
      );
    case "card":
      return (
        <mesh castShadow rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.19, 0.004, 0.08]} />
          <Std color="#e8d79a" rough={0.8} emissive="#5a4a10" ei={0.6} />
        </mesh>
      );
    case "shard":
      return (
        <mesh castShadow scale={[0.8, 1.6, 0.35]}>
          <octahedronGeometry args={[0.1]} />
          <meshStandardMaterial color="#e6f4ff" metalness={1} roughness={0.04} emissive="#5fd2ff" emissiveIntensity={0.7} />
        </mesh>
      );
    case "nuke":
      return (
        <group>
          <mesh castShadow position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.5, 18]} />
            <Std color="#3d4a3a" metal={0.6} rough={0.4} map={tex.metal} />
          </mesh>
          {[0.08, 0.42].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[0.205, 0.205, 0.06, 18]} />
              <Std color="#d2a11f" />
            </mesh>
          ))}
          <mesh position={[0, 0.53, 0]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <Std color="#f22" emissive="#ff1a0a" ei={3} />
          </mesh>
        </group>
      );
    case "battery":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.12, 0.2, 0.08]} />
            <Std color="#1f2622" rough={0.5} />
          </mesh>
          <mesh position={[0, 0.03, 0.041]}>
            <planeGeometry args={[0.1, 0.05]} />
            <Std color="#4f4" emissive="#3dff6a" ei={2} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <boxGeometry args={[0.04, 0.02, 0.03]} />
            <Std color="#aaa" metal={1} rough={0.3} />
          </mesh>
        </group>
      );
  }
}

function Pickup({ id }: { id: number }) {
  const ref = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const pk = game.pickups[id];
  const baseY = pk.locker ? 0.95 : pk.kind === "nuke" ? 0.02 : 0.32;
  useFrame((st) => {
    const p = game.pickups[id];
    const g = ref.current;
    g.visible = !!p && !p.taken;
    if (!g.visible) return;
    const t = st.clock.elapsedTime + id;
    g.position.set(p.x, baseY + (p.locker || p.kind === "nuke" ? 0 : Math.sin(t * 2) * 0.05), p.z);
    g.rotation.y = p.kind === "nuke" ? 0 : t * 0.8;
    const r = ring.current;
    r.visible = p.opened && !p.locker;
    const m = r.material as THREE.MeshBasicMaterial;
    m.opacity = 0.35 + Math.sin(t * 3) * 0.15;
  });
  return (
    <group>
      <group ref={ref}>
        <ItemModel kind={pk.kind} />
      </group>
      <mesh ref={ring} position={[pk.x, 0.02, pk.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.36, 28]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Items() {
  return (
    <group>
      {game.pickups.map((p) => (
        <Pickup key={p.id} id={p.id} />
      ))}
    </group>
  );
}

export function Flares() {
  const group = useRef<THREE.Group>(null!);
  const MAX = 6;
  useFrame((st) => {
    const g = group.current;
    for (let i = 0; i < MAX; i++) {
      const child = g.children[i] as THREE.Group;
      const f = game.flares[i];
      child.visible = !!f;
      if (!f) continue;
      child.position.set(f.x, 0.06, f.z);
      const glow = child.children[1] as THREE.Mesh;
      const mat = glow.material as THREE.MeshBasicMaterial;
      const flick = 0.8 + Math.random() * 0.4;
      if (f.kind === "red") mat.color.setRGB(6 * flick, 0.5 * flick, 0.3 * flick);
      else mat.color.setRGB(5 * flick, 4.8 * flick, 4.4 * flick);
      glow.scale.setScalar(0.9 + Math.sin(st.clock.elapsedTime * 30) * 0.1);
    }
  });
  return (
    <group ref={group}>
      {Array.from({ length: MAX }, (_, i) => (
        <group key={i} visible={false}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
            <meshStandardMaterial color="#6b1a12" />
          </mesh>
          <mesh position={[0.16, 0.02, 0]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
