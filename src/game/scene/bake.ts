// Baked lamp lighting: each vertex stores which lamps reach it (with distance,
// facing and line-of-sight already folded into a weight). When a circuit
// switches, only the cheap weighted sum is redone.
import * as THREE from "three";
import { LAMPS, LAMP_Y, TILE, type LampKind } from "../sim/map";
import { baseSolid, lineOfSight } from "../sim/grid";

const K = 6;
const RANGE = 10;

export const LAMP_COLOR: Record<LampKind, [number, number, number]> = {
  sodium: [1.0, 0.6, 0.22],
  emergency: [1.0, 0.16, 0.07],
};

export interface BakeData {
  idx: Int16Array;
  w: Float32Array;
  count: number;
}

export function precomputeBake(pos: Float32Array, nor: Float32Array, nudge: Float32Array): BakeData {
  const count = pos.length / 3;
  const idx = new Int16Array(count * K).fill(-1);
  const w = new Float32Array(count * K);
  const cand: { i: number; w: number }[] = [];
  for (let v = 0; v < count; v++) {
    const px = pos[v * 3],
      py = pos[v * 3 + 1],
      pz = pos[v * 3 + 2];
    const nx = nor[v * 3],
      ny = nor[v * 3 + 1],
      nz = nor[v * 3 + 2];
    const sx = px + nx * 0.12 + nudge[v * 2];
    const sz = pz + nz * 0.12 + nudge[v * 2 + 1];
    cand.length = 0;
    for (const l of LAMPS) {
      const dx = l.x - px,
        dy = LAMP_Y - py,
        dz = l.z - pz;
      const d = Math.hypot(dx, dy, dz);
      if (d > RANGE) continue;
      const ndl = (dx * nx + dy * ny + dz * nz) / (d || 1);
      const wrap = Math.max(0, (ndl + 0.3) / 1.3);
      if (wrap <= 0) continue;
      const att = 1 / (1 + (d / 3.4) ** 2);
      const fade = Math.max(0, 1 - (d / RANGE) ** 4);
      const weight = wrap * att * fade;
      if (weight < 0.01) continue;
      if (!lineOfSight({ x: sx, z: sz }, { x: l.x, z: l.z }, baseSolid)) continue;
      cand.push({ i: l.i, w: weight });
    }
    cand.sort((a, b) => b.w - a.w);
    for (let k = 0; k < Math.min(K, cand.length); k++) {
      idx[v * K + k] = cand[k].i;
      w[v * K + k] = cand[k].w;
    }
  }
  return { idx, w, count };
}

/** lampGain[i] = 0 (off) .. 1 (on) */
export function applyBake(data: BakeData, attr: THREE.BufferAttribute, lampGain: Float32Array, scale: number) {
  const arr = attr.array as Float32Array;
  for (let v = 0; v < data.count; v++) {
    let r = 0,
      g = 0,
      b = 0;
    for (let k = 0; k < K; k++) {
      const li = data.idx[v * K + k];
      if (li < 0) break;
      const gain = lampGain[li];
      if (gain <= 0) continue;
      const c = LAMP_COLOR[LAMPS[li].kind];
      const ww = data.w[v * K + k] * gain * scale;
      r += c[0] * ww;
      g += c[1] * ww;
      b += c[2] * ww;
    }
    arr[v * 3] = r;
    arr[v * 3 + 1] = g;
    arr[v * 3 + 2] = b;
  }
  attr.needsUpdate = true;
}

/** Inject the per-vertex `bake` irradiance into a standard material. */
export function withBake<M extends THREE.MeshStandardMaterial>(mat: M): M {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBake = bake;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBake;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += min(vBake, vec3(4.0)) * diffuseColor.rgb;",
      );
  };
  mat.customProgramCacheKey = () => "bake";
  return mat;
}

export const tileNudge = (x: number, z: number) => {
  const cx = (Math.floor(x / TILE) + 0.5) * TILE;
  const cz = (Math.floor(z / TILE) + 0.5) * TILE;
  return [(cx - x) * 0.03, (cz - z) * 0.03];
};
