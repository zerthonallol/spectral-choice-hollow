import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { game } from "../sim/game";
import { LAMPS } from "../sim/map";
import { applyBake, precomputeBake, withBake, type BakeData } from "./bake";
import { buildLevel } from "./levelGeometry";
import { getTextures } from "./textures";

export const lampGain = new Float32Array(LAMPS.length);
export function refreshLampGain() {
  for (const l of LAMPS) lampGain[l.i] = game.sectors[l.sector]?.lit ? 1 : 0;
}

export function Level() {
  const tex = getTextures();
  const built = useMemo(() => {
    const lv = buildLevel();
    const parts = [lv.walls, lv.floors, lv.ceil, lv.water].map((p) => ({
      geometry: p.geometry,
      bake: precomputeBake(
        p.geometry.getAttribute("position").array as Float32Array,
        p.geometry.getAttribute("normal").array as Float32Array,
        p.nudge,
      ),
    }));
    return parts;
  }, []);

  const mats = useMemo(() => {
    const wall = withBake(
      new THREE.MeshStandardMaterial({
        map: tex.wall,
        roughnessMap: tex.wallRough,
        bumpMap: tex.wall,
        bumpScale: 1.2,
        roughness: 1,
        metalness: 0,
      }),
    );
    const floor = withBake(
      new THREE.MeshStandardMaterial({
        map: tex.floor,
        roughnessMap: tex.floorRough,
        bumpMap: tex.floor,
        bumpScale: 0.8,
        roughness: 1,
        metalness: 0.05,
      }),
    );
    const ceil = withBake(new THREE.MeshStandardMaterial({ map: tex.ceil, roughness: 0.95 }));
    const water = withBake(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#1d2a17"),
        roughness: 0.12,
        metalness: 0.1,
        normalMap: tex.waterNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        iridescence: 1,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [180, 620],
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        transparent: false,
      }),
    );
    return [wall, floor, ceil, water];
  }, [tex]);

  useEffect(
    () => () => {
      built.forEach((b) => b.geometry.dispose());
      mats.forEach((m) => m.dispose());
    },
    [built, mats],
  );

  const version = useRef(-1);
  useFrame((_, delta) => {
    if (version.current !== game.lightsVersion) {
      version.current = game.lightsVersion;
      refreshLampGain();
      const scales = [1.15, 1.05, 0.9, 1.3];
      built.forEach((b, i) =>
        applyBake(b.bake as BakeData, b.geometry.getAttribute("bake") as THREE.BufferAttribute, lampGain, scales[i]),
      );
    }
    // slow drift of the toxic film on the water
    const n = tex.waterNormal;
    n.offset.x += delta * 0.015;
    n.offset.y += delta * 0.008;
  });

  return (
    <group>
      {built.map((b, i) => (
        <mesh
          key={i}
          geometry={b.geometry}
          material={mats[i]}
          receiveShadow
          castShadow={i === 0}
          matrixAutoUpdate={false}
        />
      ))}
    </group>
  );
}
