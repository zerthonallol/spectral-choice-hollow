// Collision, line of sight and path finding on the tile grid.
import { CLUTTER, CLUTTER_RADIUS, MAP_H, MAP_W, TILE, cellAt, isSolidCell, type Pt } from "./map";

export type SolidFn = (tx: number, ty: number) => boolean;

export const baseSolid: SolidFn = (tx, ty) => isSolidCell(cellAt(tx, ty));

/** Moves a circle by (dx,dz) against solid tiles and clutter, axis-separated. */
export function moveCircle(
  p: Pt,
  dx: number,
  dz: number,
  r: number,
  solid: SolidFn,
  clutter = true,
): Pt {
  let x = p.x + dx;
  x = resolveAxis(x, p.z, r, solid, "x");
  let z = p.z + dz;
  z = resolveAxis(x, z, r, solid, "z");
  if (clutter) {
    for (const c of CLUTTER) {
      const ox = x - c.x;
      const oz = z - c.z;
      const min = r + CLUTTER_RADIUS;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = c.x + (ox / d) * min;
        z = c.z + (oz / d) * min;
      }
    }
  }
  return { x, z };
}

function resolveAxis(x: number, z: number, r: number, solid: SolidFn, axis: "x" | "z") {
  const minTx = Math.floor((x - r) / TILE);
  const maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((z - r) / TILE);
  const maxTy = Math.floor((z + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++)
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!solid(tx, ty)) continue;
      // closest point on tile box
      const bx0 = tx * TILE,
        bx1 = bx0 + TILE,
        bz0 = ty * TILE,
        bz1 = bz0 + TILE;
      const cx = Math.max(bx0, Math.min(x, bx1));
      const cz = Math.max(bz0, Math.min(z, bz1));
      const ox = x - cx;
      const oz = z - cz;
      if (ox * ox + oz * oz >= r * r) continue;
      if (axis === "x") {
        if (x < (bx0 + bx1) / 2) x = bx0 - r - 1e-4;
        else x = bx1 + r + 1e-4;
      } else {
        if (z < (bz0 + bz1) / 2) z = bz0 - r - 1e-4;
        else z = bz1 + r + 1e-4;
      }
    }
  return axis === "x" ? x : z;
}

/** True when nothing solid lies between a and b (sampled every 0.25 m). */
export function lineOfSight(a: Pt, b: Pt, solid: SolidFn): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    if (solid(Math.floor(x / TILE), Math.floor(z / TILE))) return false;
  }
  return true;
}

/** Distance along a ray until it hits a wall (max `max`). */
export function rayDistance(a: Pt, dirX: number, dirZ: number, max: number, solid: SolidFn) {
  const step = 0.15;
  for (let d = step; d <= max; d += step) {
    const x = a.x + dirX * d;
    const z = a.z + dirZ * d;
    if (solid(Math.floor(x / TILE), Math.floor(z / TILE))) return d - step;
  }
  return max;
}

/** BFS path of tile coords from start to goal (inclusive of goal), or null. */
export function findPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  solid: SolidFn,
): { tx: number; ty: number }[] | null {
  if (solid(gx, gy)) return null;
  const N = MAP_W * MAP_H;
  const prev = new Int32Array(N).fill(-1);
  const start = sy * MAP_W + sx;
  const goal = gy * MAP_W + gx;
  const q = new Int32Array(N);
  let qh = 0,
    qt = 0;
  q[qt++] = start;
  prev[start] = start;
  while (qh < qt) {
    const cur = q[qh++];
    if (cur === goal) break;
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    const nb = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (prev[ni] !== -1 || solid(nx, ny)) continue;
      prev[ni] = cur;
      q[qt++] = ni;
    }
  }
  if (prev[goal] === -1) return null;
  const path: { tx: number; ty: number }[] = [];
  let c = goal;
  while (c !== start) {
    path.push({ tx: c % MAP_W, ty: (c / MAP_W) | 0 });
    c = prev[c];
  }
  return path.reverse();
}
