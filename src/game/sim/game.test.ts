import { describe, expect, it } from "vitest";
import { Game, T, forwardOf, rightOf } from "./game";
import { GRID, LAMPS, MAP_W, PANELS, POI, SECTOR_COUNT, SPAWNS, tileCenter } from "./map";
import { findPath } from "./grid";

const idle = (g: Game) => ({ fwd: 0, strafe: 0, run: false, crouch: false, yaw: g.player.yaw, pitch: 0 });

function teleport(g: Game, tx: number, ty: number) {
  const c = tileCenter(tx, ty);
  g.player.x = c.x;
  g.player.z = c.z;
}

function farMonster(g: Game) {
  g.monster.x = tileCenter(29, 17).x;
  g.monster.z = tileCenter(29, 17).z;
  g.monster.stunT = 9999;
}

describe("level", () => {
  it("every row is the same width", () => {
    for (const r of GRID) expect(r.length).toBe(MAP_W);
  });
  it("every item and objective is reachable from the start once the bunker is open", () => {
    const g = new Game();
    g.bunkerOpen = true;
    const s = POI.start;
    for (const sp of SPAWNS) expect(findPath(s.tx, s.ty, sp.tx, sp.ty, g.solid), `spawn ${sp.kind}`).not.toBeNull();
    for (const k of ["elevator", "reactor", "drain"] as const)
      expect(findPath(s.tx, s.ty, POI[k].tx, POI[k].ty, g.solid), k).not.toBeNull();
  });
  it("the bunker is sealed until opened", () => {
    const g = new Game();
    expect(findPath(POI.start.tx, POI.start.ty, 1, 1, g.solid)).toBeNull();
  });
  it("has lamps and a switch panel in every lit circuit", () => {
    expect(LAMPS.length).toBeGreaterThan(40);
    const lampSectors = new Set(LAMPS.map((l) => l.sector));
    const panelSectors = new Set(PANELS.map((p) => p.sector));
    expect(SECTOR_COUNT).toBeGreaterThan(8);
    for (const s of lampSectors) expect(panelSectors.has(s), `panel in sector ${s}`).toBe(true);
  });
});

describe("controls", () => {
  it("W moves where the camera looks, D moves to screen right", () => {
    expect(forwardOf(0)).toEqual({ x: -0, z: -1 });
    const r = rightOf(0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    const g = new Game();
    g.start();
    farMonster(g);
    const z0 = g.player.z;
    for (let i = 0; i < 30; i++) g.step(1 / 30, { ...idle(g), fwd: 1, yaw: 0 });
    expect(g.player.z).toBeLessThan(z0 - 1);
  });
  it("walking through water is louder than on the walkway", () => {
    const g = new Game();
    g.start();
    farMonster(g);
    teleport(g, 3, 13);
    for (let i = 0; i < 20; i++) g.step(1 / 30, { ...idle(g), strafe: 1, yaw: 0 });
    const dry = g.player.noise;
    teleport(g, 9, 3);
    for (let i = 0; i < 20; i++) g.step(1 / 30, { ...idle(g), fwd: 1, yaw: Math.PI });
    expect(g.player.inWater).toBe(true);
    expect(g.player.noise).toBeGreaterThan(dry);
  });
});

describe("endings", () => {
  it("ending 4: batteries run dry", () => {
    const g = new Game();
    g.start();
    farMonster(g);
    g.player.battery = 0.5;
    for (let i = 0; i < 200 && g.phase === "playing"; i++) g.step(0.05, idle(g));
    expect(g.ending).toBe(4);
  });

  it("ending 3: three shards at the emitter", () => {
    const g = new Game();
    g.start();
    farMonster(g);
    g.inv.shard = 3;
    const c = tileCenter(POI.emitter.tx, POI.emitter.ty + 1);
    g.player.x = c.x;
    g.player.z = c.z;
    g.player.yaw = 0; // facing -z, toward the emitter
    g.step(0.016, { ...idle(g), yaw: 0 });
    expect(g.focus?.kind).toBe("emitter");
    g.interact();
    expect(g.ending).toBe(3);
  });

  it("ending 2: arm the charge and reach the drain", () => {
    const g = new Game();
    g.start();
    farMonster(g);
    g.inv.nuke = true;
    teleport(g, POI.reactor.tx, POI.reactor.ty);
    g.step(0.016, idle(g));
    expect(g.focus?.kind).toBe("reactor");
    g.interact();
    expect(g.nukeArmedT).toBe(T.NUKE_TIME);
    teleport(g, POI.drain.tx, POI.drain.ty);
    g.step(0.016, idle(g));
    expect(g.ending).toBe(2);
  });

  it("the charge kills you if you do not reach the drain in time", () => {
    const g = new Game();
    g.start();
    farMonster(g);
    g.nukeArmedT = 0.1;
    g.player.battery = 100;
    for (let i = 0; i < 10; i++) g.step(0.05, idle(g));
    expect(g.phase).toBe("dead");
    expect(g.deathReason).toBe("blast");
  });

  it("ending 1: three cards, wrench repair, then the sealing countdown", () => {
    const g = new Game();
    g.start();
    farMonster(g);
    teleport(g, POI.elevator.tx, POI.elevator.ty);
    g.step(0.016, idle(g));
    g.interact();
    expect(g.elevatorRepaired).toBe(false);
    g.inv.cards = 3;
    g.inv.wrench = true;
    g.interact();
    expect(g.elevatorRepaired).toBe(true);
    g.interact();
    expect(g.sealT).toBe(T.SEAL_TIME);
    for (let i = 0; i < 400 && g.phase === "playing"; i++) {
      g.player.health = 100;
      g.step(0.05, idle(g));
    }
    expect(g.ending).toBe(1);
  });
});

describe("overseer", () => {
  it("is slow in the light and fast in the dark", () => {
    expect(T.M_HUNT_DARK).toBeGreaterThan(T.M_HUNT_LIT * 2);
    expect(T.RUN).toBeGreaterThan(T.M_HUNT_DARK);
  });
  it("a shard stuns him and costs the shard", () => {
    const g = new Game();
    g.start();
    g.inv.shard = 1;
    g.selected = "shard";
    const c = tileCenter(POI.start.tx, POI.start.ty - 2);
    g.monster.x = c.x;
    g.monster.z = c.z;
    g.player.yaw = 0;
    g.useItem();
    expect(g.inv.shard).toBe(0);
    expect(g.monster.stunT).toBeGreaterThan(0);
  });
});
