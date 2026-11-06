// Level data and grid helpers. Pure TS: no React, no three.js.

export const TILE = 3; // meters per grid cell
export const CEIL = 3.6; // ceiling height
export const WATER_DEPTH = 0.5; // channel floor below walkway
export const LAMP_Y = 3.3;

// Legend
// #  wall          .  walkway         ~  toxic water channel (walkable, loud)
// S  start         B  bunker door     E  main elevator     R  reactor console
// M  Overseer's emitter (solid)       X  drain outflow to the river
const RAW = [
  "###############################",
  "#....#.........#.......#.....E#",
  "#....B..~~~~...#..~~~..#.###..#",
  "#....#..~~~~...#..~M~..#.#....#",
  "######..~~~~.......~~~.....#..#",
  "#.......~~~~...#..~~~..#...#..#",
  "#.####..~~~~...#.......#.###.##",
  "#.#..#.........####.####.#....#",
  "#.#..###.#####....~....#.#.##.#",
  "#.#......#...#.####~####...#..#",
  "#.####.###.#.#.#..~..#.###.#.##",
  "#......#...#...#..~..#...#.#..#",
  "###.#.##.#####.#..~..###.#.##.#",
  "#X..#..#.....#.....~......#...#",
  "#.###..#.###.#######~#####.#.R#",
  "#...#......#..........~~....#.#",
  "#.#.####.#.#####.###.~~.####.##",
  "#S#......#.......#....~~......#",
  "###############################",
];

export const MAP_W = RAW[0].length;
export const MAP_H = RAW.length;

export type Cell = "#" | "." | "~" | "S" | "B" | "E" | "R" | "M" | "X";

export const GRID: Cell[][] = RAW.map((r) => r.split("") as Cell[]);

export interface Pt {
  x: number;
  z: number;
}

export const cellAt = (tx: number, ty: number): Cell =>
  tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? "#" : GRID[ty][tx];

export const isWater = (tx: number, ty: number) => cellAt(tx, ty) === "~";

export const tileCenter = (tx: number, ty: number): Pt => ({
  x: (tx + 0.5) * TILE,
  z: (ty + 0.5) * TILE,
});

export const worldToTile = (x: number, z: number) => ({
  tx: Math.floor(x / TILE),
  ty: Math.floor(z / TILE),
});

function findCell(c: Cell) {
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) if (GRID[y][x] === c) return { tx: x, ty: y };
  throw new Error("missing cell " + c);
}

export const POI = {
  start: findCell("S"),
  bunkerDoor: findCell("B"),
  elevator: findCell("E"),
  reactor: findCell("R"),
  emitter: findCell("M"),
  drain: findCell("X"),
};

// ---- Sectors: 8x6-tile blocks, each with its own lighting circuit ----
export const SECTOR_W = 8;
export const SECTOR_H = 6;
export const SECTOR_COLS = Math.ceil(MAP_W / SECTOR_W);
export const SECTOR_ROWS = Math.ceil(MAP_H / SECTOR_H);
export const SECTOR_COUNT = SECTOR_COLS * SECTOR_ROWS;

export const sectorOf = (tx: number, ty: number) =>
  Math.floor(ty / SECTOR_H) * SECTOR_COLS + Math.floor(tx / SECTOR_W);

export type LampKind = "sodium" | "emergency";
// Emergency (red) circuits; everything else burns sodium yellow.
export const EMERGENCY_SECTORS = new Set([5, 10, 12]);
// Sectors that start dark.
export const START_DARK = new Set([2, 9, 13]);

export interface Lamp {
  i: number;
  tx: number;
  ty: number;
  x: number;
  z: number;
  sector: number;
  kind: LampKind;
}

export interface Panel {
  sector: number;
  tx: number;
  ty: number;
  // world position on the wall face and the wall's outward normal
  x: number;
  z: number;
  nx: number;
  nz: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export const isSolidCell = (c: Cell) => c === "#" || c === "M";

function buildLamps(): Lamp[] {
  const out: Lamp[] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const c = GRID[y][x];
      if (isSolidCell(c)) continue;
      if ((x + 2 * y) % 4 !== 0) continue;
      const sector = sectorOf(x, y);
      const p = tileCenter(x, y);
      out.push({
        i: out.length,
        tx: x,
        ty: y,
        x: p.x,
        z: p.z,
        sector,
        kind: EMERGENCY_SECTORS.has(sector) ? "emergency" : "sodium",
      });
    }
  return out;
}

function buildPanels(): Panel[] {
  const out: Panel[] = [];
  const done = new Set<number>();
  for (let y = 1; y < MAP_H - 1; y++)
    for (let x = 1; x < MAP_W - 1; x++) {
      const c = GRID[y][x];
      if (c !== ".") continue;
      const s = sectorOf(x, y);
      if (done.has(s)) continue;
      // prefer the tile in the middle of the sector
      const cx = (s % SECTOR_COLS) * SECTOR_W + SECTOR_W / 2;
      const cy = Math.floor(s / SECTOR_COLS) * SECTOR_H + SECTOR_H / 2;
      if (Math.abs(x - cx) > 3 || Math.abs(y - cy) > 2) continue;
      for (const [dx, dy] of DIRS) {
        if (cellAt(x + dx, y + dy) !== "#") continue;
        const p = tileCenter(x, y);
        out.push({
          sector: s,
          tx: x,
          ty: y,
          x: p.x + dx * (TILE / 2 - 0.08),
          z: p.z + dy * (TILE / 2 - 0.08),
          nx: -dx,
          nz: -dy,
        });
        done.add(s);
        break;
      }
    }
  return out;
}

export const LAMPS = buildLamps();
export const PANELS = buildPanels();

export type ItemKind =
  | "wrench"
  | "stungun"
  | "redFlare"
  | "whiteFlare"
  | "cortexin"
  | "bandage"
  | "tape"
  | "card"
  | "shard"
  | "nuke"
  | "battery";

export interface Spawn {
  id: number;
  kind: ItemKind;
  tx: number;
  ty: number;
  locker?: boolean;
  tape?: number;
}

const S = (kind: ItemKind, tx: number, ty: number, extra: Partial<Spawn> = {}) => ({
  kind,
  tx,
  ty,
  ...extra,
});

export const SPAWNS: Spawn[] = [
  S("wrench", 3, 15),
  S("bandage", 6, 17),
  S("tape", 5, 13, { tape: 0 }),
  S("battery", 10, 15),
  S("card", 12, 11, { locker: true }),
  S("stungun", 3, 8),
  S("cortexin", 5, 11),
  S("battery", 10, 11, { locker: true }),
  S("redFlare", 6, 9),
  S("whiteFlare", 12, 2),
  S("redFlare", 13, 1, { locker: true }),
  S("tape", 13, 5, { tape: 1 }),
  S("battery", 1, 5),
  S("shard", 17, 11),
  S("card", 24, 3),
  S("bandage", 26, 7),
  S("tape", 29, 9, { tape: 2 }),
  S("cortexin", 24, 11),
  S("shard", 28, 13),
  S("card", 26, 17, { locker: true }),
  S("battery", 14, 17),
  S("redFlare", 19, 15),
  S("whiteFlare", 16, 13),
  S("shard", 3, 3),
  S("nuke", 1, 1),
  S("tape", 2, 2, { tape: 3 }),
  S("tape", 27, 1, { tape: 4 }),
  S("battery", 22, 5),
  S("battery", 29, 4),
].map((s, id) => ({ id, ...s }));

// Barrels & crates: dead-end corners, deterministic.
export interface Clutter {
  x: number;
  z: number;
  kind: "barrel" | "crate";
  rot: number;
}

function buildClutter(): Clutter[] {
  const out: Clutter[] = [];
  const reserved = new Set(SPAWNS.map((s) => s.tx + "," + s.ty));
  for (const p of Object.values(POI)) reserved.add(p.tx + "," + p.ty);
  for (const p of PANELS) reserved.add(p.tx + "," + p.ty);
  for (let y = 1; y < MAP_H - 1; y++)
    for (let x = 1; x < MAP_W - 1; x++) {
      if (GRID[y][x] !== ".") continue;
      if (reserved.has(x + "," + y)) continue;
      const walls = DIRS.filter(([dx, dy]) => cellAt(x + dx, y + dy) === "#");
      if (walls.length < 2) continue;
      if ((x * 13 + y * 7) % 3 !== 0) continue;
      // corner between two perpendicular walls
      const wx = walls.find(([dx]) => dx !== 0);
      const wz = walls.find(([, dy]) => dy !== 0);
      if (!wx || !wz) continue;
      const c = tileCenter(x, y);
      const kind = (x + y) % 2 === 0 ? "barrel" : "crate";
      out.push({
        x: c.x + wx[0] * (TILE / 2 - 0.5),
        z: c.z + wz[1] * (TILE / 2 - 0.5),
        kind,
        rot: (x * 0.7 + y * 1.3) % Math.PI,
      });
    }
  return out;
}

export const CLUTTER = buildClutter();
export const CLUTTER_RADIUS = 0.42;
