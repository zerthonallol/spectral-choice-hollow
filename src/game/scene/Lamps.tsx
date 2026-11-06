import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { game } from "../sim/game";
import { CEIL, LAMPS, LAMP_Y, type Lamp } from "../sim/map";
import { LAMP_COLOR } from "./bake";
import { getTextures } from "./textures";

const POOL = 4;
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

/** Lamp brightness factor right now (flicker after a switch, 0 when off). */
export function lampLevel(l: Lamp, t: number) {
  const s = game.sectors[l.sector];
  if (!s) return 0;
  if (s.flickerT > 0) {
    const f = Math.sin(t * 60 + l.i * 3.1) * Math.sin(t * 23 + l.i);
    return f > 0.1 ? 1 : 0.05;
  }
  // rare idle flicker on a few failing tubes
  if (s.lit && l.i % 11 === 3) {
    const f = Math.sin(t * 7 + l.i) + Math.sin(t * 31.7);
    return f > 1.75 ? 0.15 : 1;
  }
  return s.lit ? 1 : 0;
}

export function Lamps() {
  const housing = useRef<THREE.InstancedMesh>(null!);
  const bulbs = useRef<THREE.InstancedMesh>(null!);
  const tex = getTextures();

  useLayoutEffect(() => {
    LAMPS.forEach((l, i) => {
      const rot = (l.tx + l.ty) % 2 === 0 ? 0 : Math.PI / 2;
      tmpM.makeRotationY(rot).setPosition(l.x, CEIL - 0.12, l.z);
      housing.current.setMatrixAt(i, tmpM);
      tmpM.makeRotationY(rot).setPosition(l.x, CEIL - 0.2, l.z);
      bulbs.current.setMatrixAt(i, tmpM);
      bulbs.current.setColorAt(i, tmpC.setRGB(1, 1, 1));
    });
    housing.current.instanceMatrix.needsUpdate = true;
    bulbs.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const b = bulbs.current;
    for (const l of LAMPS) {
      const lv = lampLevel(l, t);
      const c = LAMP_COLOR[l.kind];
      const k = lv > 0.5 ? 3.2 : 0.04;
      b.setColorAt(l.i, tmpC.setRGB(c[0] * k + 0.02, c[1] * k + 0.02, c[2] * k + 0.02));
    }
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={housing} args={[undefined, undefined, LAMPS.length]} castShadow={false}>
        <boxGeometry args={[1.3, 0.16, 0.42]} />
        <meshStandardMaterial map={tex.metal} color="#77736a" roughness={0.6} metalness={0.7} />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, LAMPS.length]}>
        <boxGeometry args={[1.1, 0.06, 0.24]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

interface Slot {
  light: THREE.PointLight;
  lamp: number; // lamp index, or -1000-flareId for flares
  fade: number;
}

/** A fixed pool of real lights that follows the nearest active lamps and flares. */
export function LightPool() {
  const group = useRef<THREE.Group>(null!);
  const spot = useRef<THREE.SpotLight>(null!);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const slots = useRef<Slot[]>([]);
  const spotLamp = useRef(-1);
  const spotFade = useRef(0);

  useLayoutEffect(() => {
    slots.current = [];
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight("#ffb050", 0, 11, 2);
      group.current.add(light);
      slots.current.push({ light, lamp: -1, fade: 0 });
    }
    spot.current.target = spotTarget;
    return () => {
      slots.current.forEach((s) => s.light.dispose());
    };
  }, [spotTarget]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const p = game.player;
    type Cand = { key: number; x: number; y: number; z: number; d: number; col: THREE.ColorRepresentation | [number, number, number]; power: number };
    const cands: Cand[] = [];
    for (const f of game.flares) {
      const life = Math.min(1, (f.life - f.t) / 1.5) * (0.85 + Math.random() * 0.3);
      cands.push({
        key: -1000 - f.id,
        x: f.x,
        y: 0.3,
        z: f.z,
        d: -1,
        col: f.kind === "red" ? [1, 0.12, 0.08] : [1, 0.95, 0.88],
        power: 28 * life,
      });
    }
    for (const l of LAMPS) {
      const lv = lampLevel(l, t);
      if (lv < 0.5) continue;
      const d = (l.x - p.x) ** 2 + (l.z - p.z) ** 2;
      if (d > 26 * 26) continue;
      cands.push({ key: l.i, x: l.x, y: LAMP_Y - 0.15, z: l.z, d, col: LAMP_COLOR[l.kind], power: 16 });
    }
    cands.sort((a, b) => a.d - b.d);
    const chosen = cands.slice(0, POOL);
    const keys = new Set(chosen.map((c) => c.key));
    // release slots whose lamp left the set
    for (const s of slots.current) if (!keys.has(s.lamp)) s.lamp = -1;
    for (const c of chosen) {
      let s = slots.current.find((s) => s.lamp === c.key);
      if (!s) {
        s = slots.current.find((s) => s.lamp === -1)!;
        s.lamp = c.key;
        s.fade = 0;
      }
      s.fade = Math.min(1, s.fade + delta * 5);
      s.light.position.set(c.x, c.y, c.z);
      const col = c.col as [number, number, number];
      s.light.color.setRGB(col[0], col[1], col[2]);
      s.light.intensity = c.power * s.fade;
    }
    for (const s of slots.current) if (s.lamp === -1) s.light.intensity = 0;

    // shadow-casting key light: nearest active lamp
    let best = -1;
    let bestD = 12 * 12;
    for (const c of cands) {
      if (c.key < 0) continue;
      if (c.d < bestD) {
        bestD = c.d;
        best = c.key;
      }
    }
    if (best !== spotLamp.current) {
      spotFade.current -= delta * 6;
      if (spotFade.current <= 0) {
        spotLamp.current = best;
        spotFade.current = 0;
      }
    } else spotFade.current = Math.min(1, spotFade.current + delta * 4);
    const sl = spot.current;
    if (spotLamp.current >= 0) {
      const l = LAMPS[spotLamp.current];
      const c = LAMP_COLOR[l.kind];
      sl.position.set(l.x, LAMP_Y - 0.2, l.z);
      spotTarget.position.set(l.x, 0, l.z);
      spotTarget.updateMatrixWorld();
      sl.color.setRGB(c[0], c[1], c[2]);
      sl.intensity = 46 * spotFade.current * (lampLevel(l, t) > 0.5 ? 1 : 0);
    } else sl.intensity = 0;
  });

  return (
    <group ref={group}>
      <spotLight
        ref={spot}
        angle={1.15}
        penumbra={0.35}
        distance={13}
        decay={1.6}
        intensity={0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={0.3}
        shadow-camera-far={14}
      />
      <primitive object={spotTarget} />
    </group>
  );
}
