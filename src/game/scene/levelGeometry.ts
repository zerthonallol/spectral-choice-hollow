// Builds merged level meshes (walls, floors, ceiling, channel sides, water).
import * as THREE from "three";
import { CEIL, MAP_H, MAP_W, TILE, WATER_DEPTH, cellAt, isSolidCell } from "../sim/map";

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  nudge: number[] = [];
  idx: number[] = [];

  /** quad from origin o, spanning a (u) and b (v), subdivided su x sv */
  quad(
    o: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3,
    n: THREE.Vector3,
    su: number,
    sv: number,
    uv: (p: THREE.Vector3, s: number, t: number) => [number, number],
    center: { x: number; z: number },
  ) {
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    for (let j = 0; j <= sv; j++)
      for (let i = 0; i <= su; i++) {
        const s = i / su,
          t = j / sv;
        p.copy(o).addScaledVector(a, s).addScaledVector(b, t);
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(n.x, n.y, n.z);
        const [u, v] = uv(p, s, t);
        this.uv.push(u, v);
        this.nudge.push((center.x - p.x) * 0.03, (center.z - p.z) * 0.03);
      }
    for (let j = 0; j < sv; j++)
      for (let i = 0; i < su; i++) {
        const a0 = base + j * (su + 1) + i;
        const a1 = a0 + 1;
        const b0 = a0 + su + 1;
        const b1 = b0 + 1;
        // winding so the face normal = cross(a, b)
        this.idx.push(a0, a1, b0, a1, b1, b0);
      }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("bake", new THREE.Float32BufferAttribute(new Float32Array(this.pos.length), 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return { geometry: g, nudge: new Float32Array(this.nudge) };
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const walk = (tx: number, ty: number) => !isSolidCell(cellAt(tx, ty));

export function buildLevel() {
  const walls = new Builder();
  const floors = new Builder();
  const ceil = new Builder();
  const water = new Builder();
  const T = TILE;
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      const c = cellAt(tx, ty);
      if (isSolidCell(c) && c !== "M") continue;
      const x0 = tx * T,
        z0 = ty * T;
      const center = { x: x0 + T / 2, z: z0 + T / 2 };
      const wet = c === "~";
      const fy = wet ? -WATER_DEPTH : 0;
      // floor (y up). a: +x, b: +z -> normal = b x a? use winding consistent with normal up.
      floors.quad(V(x0, fy, z0), V(0, 0, T), V(T, 0, 0), V(0, 1, 0), 3, 3, (p) => [p.x / T, p.z / T], center);
      ceil.quad(V(x0, CEIL, z0), V(T, 0, 0), V(0, 0, T), V(0, -1, 0), 2, 2, (p) => [p.x / T, p.z / T], center);
      if (wet)
        water.quad(V(x0, -0.14, z0), V(0, 0, T), V(T, 0, 0), V(0, 1, 0), 1, 1, (p) => [p.x / 6, p.z / 6], center);
      if (c === "M") continue;
      const bottom = wet ? -WATER_DEPTH - 0.1 : 0;
      const h = CEIL - bottom;
      const vOf = (p: THREE.Vector3) => (p.y - 0) / CEIL;
      // neighbours
      const nbs: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dy] of nbs) {
        const nc = cellAt(tx + dx, ty + dy);
        const solidN = nc === "#";
        const lowerN = nc === "~" && !wet; // channel side face
        if (!solidN && !lowerN) continue;
        const top = solidN ? CEIL : 0;
        const bot = solidN ? bottom : -WATER_DEPTH - 0.1;
        const hh = top - bot;
        // wall face on edge, normal pointing back into this tile (-dx,-dy)
        const n = V(-dx, 0, -dy);
        let o: THREE.Vector3, a: THREE.Vector3;
        // cross(a, up) must equal the inward normal
        if (dx === 1) {
          o = V(x0 + T, bot, z0);
          a = V(0, 0, T);
        } else if (dx === -1) {
          o = V(x0, bot, z0 + T);
          a = V(0, 0, -T);
        } else if (dy === 1) {
          o = V(x0 + T, bot, z0 + T);
          a = V(-T, 0, 0);
        } else {
          o = V(x0, bot, z0);
          a = V(T, 0, 0);
        }
        const b = V(0, hh, 0);
        const sv = solidN ? 4 : 1;
        walls.quad(
          o,
          a,
          b,
          n,
          3,
          sv,
          (p) => [(dx !== 0 ? p.z : p.x) / T, vOf(p)],
          center,
        );
        void h;
      }
    }
  return {
    walls: walls.geometry(),
    floors: floors.geometry(),
    ceil: ceil.geometry(),
    water: water.geometry(),
  };
}
