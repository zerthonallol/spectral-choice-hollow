// Game rules: player, inventory, the Overseer AI, lighting circuits, endings.
// Pure TypeScript — the scene and HUD only read this state.
import {
  CLUTTER,
  LAMPS,
  PANELS,
  POI,
  SECTOR_COLS,
  SECTOR_COUNT,
  SPAWNS,
  START_DARK,
  TILE,
  cellAt,
  isSolidCell,
  isWater,
  sectorOf,
  tileCenter,
  worldToTile,
  type ItemKind,
  type Pt,
} from "./map";
import { findPath, lineOfSight, moveCircle, rayDistance, type SolidFn } from "./grid";
import { ITEM_INFO } from "./lore";

// ---------------- Tunables ----------------
export const T = {
  WALK: 3.1,
  RUN: 5.4,
  CROUCH: 1.6,
  WATER_SLOW: 0.75,
  PLAYER_R: 0.35,
  EYE: 1.65,
  EYE_CROUCH: 1.0,
  ACCEL: 14,
  NOISE_RUN: 14,
  NOISE_WALK: 6.5,
  NOISE_CROUCH: 2.2,
  NOISE_WATER: 1.5,
  BATTERY_DRAIN: 0.12, // per second, always (electronics)
  FLASH_DRAIN: 0.25, // extra per second while the flashlight is on
  BATTERY_PACK: 30,
  DARK_SANITY: 0.45, // per second in the dark with the flashlight off
  SANITY_REGEN: 0.35,
  SANITY_REGEN_CAP: 70,
  PROJECT_SANITY: 3.2, // per second, at close range
  MONSTER_R: 0.55,
  M_PATROL_LIT: 1.3,
  M_HUNT_LIT: 1.75,
  M_PATROL_DARK: 1.9,
  M_HUNT_DARK: 4.7,
  M_SIGHT: 22,
  M_FLASH_SIGHT: 14,
  M_ATTACK_R: 1.8,
  M_ATTACK_CD: 1.7,
  M_DMG_LIT: 18,
  M_DMG_DARK: 40,
  LIGHTS_MIN: 28,
  LIGHTS_MAX: 48,
  INTERACT_R: 2.4,
  NUKE_TIME: 110,
  SEAL_TIME: 14,
  SHORT_TIME: 60,
  PEPPER_R: 4.2,
  PEPPER_STUN: 4.5,
  PISTOL_R: 26,
  PISTOL_STUN: 5,
  MONSTER_HP: 3,
  BROADCAST_TIME: 30,
  EVENT_MIN: 40,
  EVENT_MAX: 75,
};

export type Phase = "menu" | "playing" | "paused" | "reading" | "dead" | "ending";
export type Slot = "wrench" | "stungun" | "pepper" | "pistol" | "redFlare" | "whiteFlare" | "cortexin" | "bandage" | "shard";
export const SLOTS: Slot[] = ["wrench", "stungun", "pepper", "pistol", "redFlare", "whiteFlare", "cortexin", "bandage", "shard"];
export type Ending = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ENDING_IDS: Ending[] = [1, 2, 3, 4, 5, 6, 7];

/** Tutorial steps, advanced by the player's own actions. */
export const TUTORIAL = ["move", "look", "flashlight", "crouch", "pickup", "use"] as const;
export type TutorialStep = (typeof TUTORIAL)[number];

export type MonsterState = "patrol" | "hunt" | "investigate" | "stunned" | "blind";

export type GameEvent =
  | { type: "lights"; sector: number; lit: boolean }
  | { type: "pickup"; kind: ItemKind }
  | { type: "hit" }
  | { type: "zap"; x: number; z: number }
  | { type: "attack"; dark: boolean }
  | { type: "door" }
  | { type: "terminal" }
  | { type: "locker" }
  | { type: "flare"; kind: "red" | "white" }
  | { type: "step"; water: boolean; crouch: boolean; run: boolean }
  | { type: "mstep"; x: number; z: number; dark: boolean }
  | { type: "seen" }
  | { type: "reflect" }
  | { type: "inject" }
  | { type: "alarm" }
  | { type: "boom" }
  | { type: "shot" }
  | { type: "spray" }
  | { type: "event"; name: string }
  | { type: "message"; text: string };

export interface Input {
  fwd: number;
  strafe: number;
  run: boolean;
  crouch: boolean;
  yaw: number;
  pitch: number;
}

export interface Flare {
  id: number;
  kind: "red" | "white";
  x: number;
  z: number;
  t: number;
  life: number;
  blinded: boolean;
}

export interface Pickup {
  id: number;
  kind: ItemKind;
  x: number;
  z: number;
  tx: number;
  ty: number;
  taken: boolean;
  locker: boolean;
  opened: boolean;
  tape?: number;
}

export interface Focus {
  kind: "pickup" | "locker" | "door" | "elevator" | "reactor" | "emitter" | "drain" | "panel";
  ref: number;
  x: number;
  z: number;
  label: string;
  ok: boolean;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const forwardOf = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const rightOf = (yaw: number) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

export class Game {
  rng = mulberry32(404);
  phase: Phase = "menu";
  time = 0;
  events: GameEvent[] = [];
  lightsVersion = 0;

  player = {
    x: 0,
    z: 0,
    eye: T.EYE,
    vx: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    health: 100,
    sanity: 100,
    battery: 100,
    flashlight: false,
    crouch: false,
    running: false,
    inWater: false,
    noise: 0,
    noiseImpulse: 0,
    stride: 0,
    speed: 0,
    hurtT: 0,
    cortexinT: 0,
  };

  inv = {
    wrench: false,
    stungun: 0,
    redFlare: 0,
    whiteFlare: 0,
    cortexin: 0,
    bandage: 0,
    shard: 0,
    pepper: 0,
    pistol: 0,
    cards: 0,
    nuke: false,
    tapes: [] as number[],
  };
  selected: Slot = "wrench";
  useCd = 0;

  sectors: { lit: boolean; shortedUntil: number; flickerT: number }[] = [];
  bunkerOpen = false;
  doorAnim = 0;
  elevatorRepaired = false;
  sealT: number | null = null;
  nukeArmedT: number | null = null;
  nukePlanted = false;

  monster = {
    x: 0,
    z: 0,
    yaw: 0,
    state: "patrol" as MonsterState,
    target: null as Pt | null,
    path: [] as { tx: number; ty: number }[],
    repathT: 0,
    stunT: 0,
    attackCd: 0,
    attackAnim: 0,
    speed: 0,
    sees: false,
    projecting: false,
    inLight: true,
    lastSeen: null as Pt | null,
    stride: 0,
    investigateT: 0,
    wounds: 0,
    dead: false,
  };
  lightsTimer = 35;
  broadcastT: number | null = null;
  eventTimer = 50;
  blackoutT = 0;
  blackoutSaved: boolean[] | null = null;
  tutorial: number | null = null;
  tutorialMoved = 0;
  tutorialYaw = 0;

  flares: Flare[] = [];
  flareId = 0;
  pickups: Pickup[] = [];
  focus: Focus | null = null;
  ending: Ending | null = null;
  deathReason: string | null = null;
  readingTape: number | null = null;
  messages: { text: string; t: number }[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.rng = mulberry32(404);
    this.time = 0;
    this.events = [];
    const s = tileCenter(POI.start.tx, POI.start.ty);
    Object.assign(this.player, {
      x: s.x,
      z: s.z,
      eye: T.EYE,
      vx: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      health: 100,
      sanity: 100,
      battery: 100,
      flashlight: false,
      crouch: false,
      running: false,
      inWater: false,
      noise: 0,
      noiseImpulse: 0,
      stride: 0,
      speed: 0,
      hurtT: 0,
      cortexinT: 0,
    });
    this.inv = {
      wrench: false,
      stungun: 0,
      redFlare: 0,
      whiteFlare: 0,
      cortexin: 0,
      bandage: 0,
      shard: 0,
      pepper: 0,
      pistol: 0,
      cards: 0,
      nuke: false,
      tapes: [],
    };
    this.selected = "wrench";
    this.useCd = 0;
    this.sectors = Array.from({ length: SECTOR_COUNT }, (_, i) => ({
      lit: !START_DARK.has(i),
      shortedUntil: 0,
      flickerT: 0,
    }));
    this.lightsVersion++;
    this.bunkerOpen = false;
    this.doorAnim = 0;
    this.elevatorRepaired = false;
    this.sealT = null;
    this.nukeArmedT = null;
    this.nukePlanted = false;
    const m = tileCenter(20, 1);
    Object.assign(this.monster, {
      x: m.x,
      z: m.z,
      yaw: 0,
      state: "patrol",
      target: null,
      path: [],
      repathT: 0,
      stunT: 0,
      attackCd: 0,
      attackAnim: 0,
      speed: 0,
      sees: false,
      projecting: false,
      inLight: true,
      lastSeen: null,
      stride: 0,
      investigateT: 0,
      wounds: 0,
      dead: false,
    });
    this.lightsTimer = 35;
    this.broadcastT = null;
    this.eventTimer = 50;
    this.blackoutT = 0;
    this.blackoutSaved = null;
    this.tutorial = null;
    this.tutorialMoved = 0;
    this.tutorialYaw = 0;
    this.flares = [];
    this.pickups = SPAWNS.map((sp) => {
      const c = tileCenter(sp.tx, sp.ty);
      if (sp.locker) {
        const d = lockerDir(sp.tx, sp.ty);
        c.x += d.dx * (TILE / 2 - 0.4);
        c.z += d.dz * (TILE / 2 - 0.4);
      }
      return {
        id: sp.id,
        kind: sp.kind,
        x: c.x,
        z: c.z,
        tx: sp.tx,
        ty: sp.ty,
        taken: false,
        locker: !!sp.locker,
        opened: !sp.locker,
        tape: sp.tape,
      };
    });
    this.focus = null;
    this.ending = null;
    this.deathReason = null;
    this.readingTape = null;
    this.messages = [];
  }

  // ---------- helpers ----------
  solid: SolidFn = (tx, ty) => {
    const c = cellAt(tx, ty);
    if (isSolidCell(c)) return true;
    if (c === "B" && !this.bunkerOpen) return true;
    return false;
  };

  isLitSector(s: number) {
    return this.sectors[s]?.lit ?? false;
  }

  isLitAt(x: number, z: number) {
    const { tx, ty } = worldToTile(x, z);
    return this.isLitSector(sectorOf(tx, ty));
  }

  emit(e: GameEvent) {
    this.events.push(e);
  }

  say(text: string) {
    this.messages.push({ text, t: this.time });
    if (this.messages.length > 4) this.messages.shift();
    this.emit({ type: "message", text });
  }

  start(tutorial = false) {
    this.reset();
    this.phase = "playing";
    if (tutorial) {
      this.tutorial = 0;
      this.tutorialYaw = this.player.yaw;
    }
    this.say("Смена №19. Найдите способ выбраться из коллектора.");
  }

  get tutorialStep(): TutorialStep | null {
    return this.tutorial === null ? null : TUTORIAL[this.tutorial] ?? null;
  }

  skipTutorial() {
    if (this.tutorial === null) return;
    this.tutorial = null;
    this.say("Обучение завершено. Удачи, техник.");
  }

  /** Advance the tutorial when the player has done what the current step asks. */
  tutorialDone(step: TutorialStep) {
    if (this.tutorialStep !== step) return;
    this.tutorial! += 1;
    if (this.tutorial! >= TUTORIAL.length) {
      this.tutorial = null;
      this.say("Обучение завершено. Надсмотрщик проснулся…");
    }
  }

  // ---------- main step ----------
  step(dt: number, input: Input) {
    if (this.phase !== "playing") return;
    this.time += dt;
    this.useCd = Math.max(0, this.useCd - dt);
    this.stepPlayer(dt, input);
    this.stepTutorial(dt);
    this.stepFlares(dt);
    // While the tutorial runs, the Overseer and the circuits wait.
    if (this.tutorial === null) {
      this.stepLights(dt);
      this.stepEvents(dt);
      if (!this.monster.dead) this.stepMonster(dt);
    }
    this.stepStatus(dt);
    this.stepTimers(dt);
    this.updateFocus();
    this.doorAnim += ((this.bunkerOpen ? 1 : 0) - this.doorAnim) * Math.min(1, dt * 2);
  }

  private stepPlayer(dt: number, input: Input) {
    const p = this.player;
    p.yaw = input.yaw;
    p.pitch = input.pitch;
    p.crouch = input.crouch;
    const { tx, ty } = worldToTile(p.x, p.z);
    p.inWater = isWater(tx, ty);
    const f = forwardOf(p.yaw);
    const r = rightOf(p.yaw);
    let mx = f.x * input.fwd + r.x * input.strafe;
    let mz = f.z * input.fwd + r.z * input.strafe;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const moving = ml > 0.05;
    p.running = input.run && !p.crouch && moving && input.fwd > -0.2;
    let speed = p.crouch ? T.CROUCH : p.running ? T.RUN : T.WALK;
    if (p.inWater) speed *= T.WATER_SLOW;
    const k = 1 - Math.exp(-T.ACCEL * dt);
    p.vx += (mx * speed - p.vx) * k;
    p.vz += (mz * speed - p.vz) * k;
    const np = moveCircle(p, p.vx * dt, p.vz * dt, T.PLAYER_R, this.solid);
    p.x = np.x;
    p.z = np.z;
    p.speed = Math.hypot(p.vx, p.vz);
    const targetEye = (p.crouch ? T.EYE_CROUCH : T.EYE) - (p.inWater ? 0.35 : 0);
    p.eye += (targetEye - p.eye) * Math.min(1, dt * 8);

    // footsteps + noise
    const before = Math.floor(p.stride);
    p.stride += (p.speed * dt) / (p.running ? 1.9 : 1.5);
    if (Math.floor(p.stride) !== before && p.speed > 0.4)
      this.emit({ type: "step", water: p.inWater, crouch: p.crouch, run: p.running });
    let noise = 0;
    if (p.speed > 0.4) noise = p.crouch ? T.NOISE_CROUCH : p.running ? T.NOISE_RUN : T.NOISE_WALK;
    if (p.inWater && noise > 0) noise *= T.NOISE_WATER;
    p.noiseImpulse = Math.max(0, p.noiseImpulse - dt * 12);
    p.noise = Math.max(noise, p.noiseImpulse);
  }

  private stepTutorial(dt: number) {
    if (this.tutorial === null) return;
    const p = this.player;
    this.tutorialMoved += p.speed * dt;
    if (this.tutorialMoved > 3) this.tutorialDone("move");
    let d = p.yaw - this.tutorialYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 1.2) this.tutorialDone("look");
    if (p.flashlight) this.tutorialDone("flashlight");
    if (p.crouch && p.speed > 0.3) this.tutorialDone("crouch");
  }

  /** Random incidents that keep each shift different. */
  private stepEvents(dt: number) {
    if (this.blackoutT > 0) {
      this.blackoutT -= dt;
      if (this.blackoutT <= 0 && this.blackoutSaved) {
        this.blackoutSaved.forEach((lit, i) => this.setSector(i, lit));
        this.blackoutSaved = null;
        this.say("Напряжение восстановлено.");
      }
    }
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = T.EVENT_MIN + this.rng() * (T.EVENT_MAX - T.EVENT_MIN);
    this.triggerEvent(Math.floor(this.rng() * 5));
  }

  triggerEvent(n: number) {
    const p = this.player;
    const m = this.monster;
    switch (n) {
      case 0: {
        if (this.blackoutSaved) return;
        this.blackoutSaved = this.sectors.map((s) => s.lit);
        this.sectors.forEach((_, i) => this.setSector(i, false));
        this.blackoutT = 9;
        this.emit({ type: "event", name: "blackout" });
        this.say("Скачок напряжения! Весь коллектор во тьме.");
        break;
      }
      case 1: {
        // Supply cache dropped down a service shaft near the player.
        const kinds: ItemKind[] = ["battery", "bandage", "whiteFlare", "ammo", "pepper"];
        const kind = kinds[Math.floor(this.rng() * kinds.length)];
        const { tx, ty } = worldToTile(p.x, p.z);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
          if (this.solid(tx + dx, ty + dy)) continue;
          const c = tileCenter(tx + dx, ty + dy);
          this.pickups.push({ id: this.pickups.length, kind, x: c.x, z: c.z, tx: tx + dx, ty: ty + dy, taken: false, locker: false, opened: true });
          break;
        }
        this.emit({ type: "event", name: "cache" });
        this.say("Из вентшахты что-то упало рядом. Посмотрите вокруг.");
        break;
      }
      case 2:
        // A pipe bursts: loud, and the Overseer comes to look.
        p.noiseImpulse = 16;
        m.state = "investigate";
        m.lastSeen = { x: p.x, z: p.z };
        m.investigateT = 4;
        this.emit({ type: "event", name: "pipe" });
        this.say("Рядом лопнула труба! Грохот разнёсся по тоннелям.");
        break;
      case 3: {
        // Fake footsteps behind the player.
        const f = forwardOf(p.yaw);
        this.emit({ type: "mstep", x: p.x - f.x * 4, z: p.z - f.z * 4, dark: true });
        this.emit({ type: "mstep", x: p.x - f.x * 3, z: p.z - f.z * 3, dark: true });
        p.sanity -= 6;
        this.say(p.sanity < 50 ? "За спиной шаги. Там никого нет… правда?" : "Вы слышите шаги позади.");
        break;
      }
      default:
        // Old radio crackles: a hint
        this.emit({ type: "event", name: "radio" });
        this.say(
          this.inv.tapes.length >= 5
            ? "Рация: «…консоль реактора может передать записи наверх…»"
            : this.rng() < 0.5
              ? "Рация: «…патроны к ПМ в оружейке у реки… шкафчик на востоке…»"
              : "Рация: «…перцовка жжёт ему глаза… вблизи…»",
        );
        break;
    }
  }

  private stepLights(dt: number) {
    for (const s of this.sectors) s.flickerT = Math.max(0, s.flickerT - dt);
    for (let i = 0; i < this.sectors.length; i++) {
      const s = this.sectors[i];
      if (s.shortedUntil > 0 && this.time >= s.shortedUntil) {
        s.shortedUntil = 0;
        this.setSector(i, true);
      }
    }
    this.lightsTimer -= dt;
    if (this.lightsTimer > 0 || this.blackoutSaved) return;
    this.lightsTimer = T.LIGHTS_MIN + this.rng() * (T.LIGHTS_MAX - T.LIGHTS_MIN);
    // The Overseer rewires a circuit near the player.
    const { tx, ty } = worldToTile(this.player.x, this.player.z);
    const ps = sectorOf(tx, ty);
    const pc = ps % SECTOR_COLS;
    const pr = Math.floor(ps / SECTOR_COLS);
    const near: number[] = [];
    for (let i = 0; i < this.sectors.length; i++) {
      const c = i % SECTOR_COLS;
      const r = Math.floor(i / SECTOR_COLS);
      if (Math.abs(c - pc) <= 1 && Math.abs(r - pr) <= 1 && this.sectors[i].shortedUntil === 0)
        if (LAMPS.some((l) => l.sector === i)) near.push(i);
    }
    if (!near.length) return;
    const pick = near[Math.floor(this.rng() * near.length)];
    const litCount = this.sectors.filter((s) => s.lit).length;
    const wantLit = !this.sectors[pick].lit;
    if (!wantLit && litCount <= Math.ceil(SECTOR_COUNT * 0.4)) return;
    this.setSector(pick, wantLit);
    this.say(wantLit ? "Где-то щёлкнул рубильник. Свет вернулся." : "Рубильник щёлкнул. Сектор погрузился во тьму.");
  }

  setSector(i: number, lit: boolean) {
    const s = this.sectors[i];
    if (!s || s.lit === lit) return;
    s.lit = lit;
    s.flickerT = 0.9;
    this.lightsVersion++;
    this.emit({ type: "lights", sector: i, lit });
  }

  private stepFlares(dt: number) {
    for (const f of this.flares) f.t += dt;
    this.flares = this.flares.filter((f) => f.t < f.life);
  }

  // ---------- Overseer ----------
  private stepMonster(dt: number) {
    const m = this.monster;
    const p = this.player;
    m.attackCd = Math.max(0, m.attackCd - dt);
    m.attackAnim = Math.max(0, m.attackAnim - dt);
    m.inLight = this.isLitAt(m.x, m.z);
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const dist = Math.hypot(dx, dz);

    if (m.stunT > 0) {
      m.stunT -= dt;
      m.sees = false;
      m.projecting = false;
      m.speed = 0;
      if (m.stunT <= 0) m.state = "hunt";
      return;
    }

    // Red flares blind him.
    for (const f of this.flares) {
      if (f.kind !== "red" || f.blinded) continue;
      if (Math.hypot(f.x - m.x, f.z - m.z) < 8 && lineOfSight(m, f, this.solid)) {
        f.blinded = true;
        m.state = "blind";
        m.stunT = 5;
        this.say("Красный свет ослепил Надсмотрщика!");
        return;
      }
    }

    // Senses
    const los = dist < T.M_SIGHT && lineOfSight(m, p, this.solid);
    const playerLit = this.isLitAt(p.x, p.z);
    const facing = dist < 5 || this.facingDot(m, p) > -0.2;
    let sees = false;
    if (los && facing) {
      if (m.inLight && playerLit) sees = true;
      else if (p.flashlight && dist < T.M_FLASH_SIGHT) sees = true;
    }
    if (sees && !m.sees) this.emit({ type: "seen" });
    m.sees = sees;
    m.projecting = sees && m.inLight;
    let heard = false;
    if (!m.inLight && p.noise > 0 && dist < p.noise) heard = true;
    if (m.inLight && p.noise > 0 && dist < p.noise * 0.35) heard = true;

    if (sees) {
      m.state = "hunt";
      m.lastSeen = { x: p.x, z: p.z };
    } else if (heard) {
      m.state = "investigate";
      m.lastSeen = { x: p.x, z: p.z };
      m.investigateT = 6;
    } else if (this.sealT !== null) {
      // The siren draws him straight to the elevator.
      m.state = "investigate";
      m.lastSeen = { x: p.x, z: p.z };
      m.investigateT = 2;
    } else {
      const white = this.flares.find((f) => f.kind === "white");
      if (white && m.state !== "hunt") {
        m.state = "investigate";
        m.lastSeen = { x: white.x, z: white.z };
        m.investigateT = 3;
      }
    }

    let goal: Pt | null = null;
    if (m.state === "hunt" || m.state === "investigate") {
      goal = sees ? { x: p.x, z: p.z } : m.lastSeen;
      if (goal && Math.hypot(goal.x - m.x, goal.z - m.z) < 1.2 && !sees) {
        m.investigateT -= dt;
        if (m.investigateT <= 0) {
          m.state = "patrol";
          m.lastSeen = null;
          m.target = null;
        }
      }
    } else {
      m.state = "patrol";
      if (!m.target || Math.hypot(m.target.x - m.x, m.target.z - m.z) < 1.2) m.target = this.pickPatrol();
      goal = m.target;
    }

    const chasing = m.state === "hunt" || m.state === "investigate";
    const speed = m.inLight
      ? chasing
        ? T.M_HUNT_LIT
        : T.M_PATROL_LIT
      : chasing
        ? T.M_HUNT_DARK
        : T.M_PATROL_DARK;

    // Path following
    m.repathT -= dt;
    if (goal && m.repathT <= 0) {
      m.repathT = 0.5;
      const a = worldToTile(m.x, m.z);
      const b = worldToTile(goal.x, goal.z);
      m.path = findPath(a.tx, a.ty, b.tx, b.ty, this.solid) ?? [];
    }
    let tx = goal?.x ?? m.x;
    let tz = goal?.z ?? m.z;
    // skip waypoints we can see past
    while (m.path.length > 1) {
      const c = tileCenter(m.path[0].tx, m.path[0].ty);
      if (Math.hypot(c.x - m.x, c.z - m.z) < 0.9) m.path.shift();
      else break;
    }
    if (m.path.length > 1 || (m.path.length === 1 && !lineOfSight(m, { x: tx, z: tz }, this.solid))) {
      const c = tileCenter(m.path[0].tx, m.path[0].ty);
      tx = c.x;
      tz = c.z;
    }
    const mdx = tx - m.x;
    const mdz = tz - m.z;
    const ml = Math.hypot(mdx, mdz);
    const stopAt = sees ? T.M_ATTACK_R * 0.8 : 0.2;
    if (ml > stopAt) {
      const step = Math.min(ml - stopAt, speed * dt);
      const np = moveCircle(m, (mdx / ml) * step, (mdz / ml) * step, T.MONSTER_R, this.solid, false);
      m.x = np.x;
      m.z = np.z;
      m.speed = step / dt;
      const targetYaw = Math.atan2(-mdx, -mdz);
      m.yaw = lerpAngle(m.yaw, targetYaw, Math.min(1, dt * 4));
    } else {
      m.speed = 0;
      if (sees) m.yaw = lerpAngle(m.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 4));
    }
    const before = Math.floor(m.stride);
    m.stride += (m.speed * dt) / 1.4;
    if (Math.floor(m.stride) !== before) this.emit({ type: "mstep", x: m.x, z: m.z, dark: !m.inLight });

    // Attack
    if (dist < T.M_ATTACK_R && m.attackCd <= 0) {
      m.attackCd = T.M_ATTACK_CD;
      m.attackAnim = 0.6;
      const dmg = m.inLight ? T.M_DMG_LIT : T.M_DMG_DARK;
      p.health -= dmg;
      p.sanity -= 8;
      p.hurtT = 0.6;
      this.emit({ type: "attack", dark: !m.inLight });
      if (p.health <= 0) this.die("monster");
    }
  }

  private facingDot(m: { x: number; z: number; yaw: number }, p: Pt) {
    const f = forwardOf(m.yaw);
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const l = Math.hypot(dx, dz) || 1;
    return (f.x * dx + f.z * dz) / l;
  }

  private pickPatrol(): Pt {
    const p = this.player;
    for (let i = 0; i < 40; i++) {
      let tx: number, ty: number;
      if (this.rng() < 0.45) {
        const pt = worldToTile(p.x, p.z);
        tx = pt.tx + Math.round((this.rng() - 0.5) * 16);
        ty = pt.ty + Math.round((this.rng() - 0.5) * 12);
      } else {
        tx = Math.floor(this.rng() * 31);
        ty = Math.floor(this.rng() * 19);
      }
      if (!this.solid(tx, ty)) return tileCenter(tx, ty);
    }
    return tileCenter(POI.emitter.tx, POI.emitter.ty + 2);
  }

  // ---------- status ----------
  private stepStatus(dt: number) {
    const p = this.player;
    const m = this.monster;
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.cortexinT = Math.max(0, p.cortexinT - dt);
    p.battery -= (T.BATTERY_DRAIN + (p.flashlight ? T.FLASH_DRAIN : 0)) * dt;
    if (p.battery <= 15 && p.flashlight && Math.floor(this.time * 2) % 7 === 0) {
      /* low battery flicker handled visually */
    }
    if (p.battery <= 0) {
      p.battery = 0;
      this.finish(4);
      return;
    }
    const lit = this.isLitAt(p.x, p.z);
    if (m.projecting && p.cortexinT <= 0) {
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      p.sanity -= T.PROJECT_SANITY * (0.45 + 0.55 * (1 - Math.min(1, d / T.M_SIGHT))) * dt;
    } else if (!lit && !p.flashlight) {
      p.sanity -= T.DARK_SANITY * dt;
    } else if (lit && p.sanity < T.SANITY_REGEN_CAP) {
      p.sanity = Math.min(T.SANITY_REGEN_CAP, p.sanity + T.SANITY_REGEN * dt);
    }
    if (p.sanity <= 0) {
      p.sanity = 0;
      this.die("mind");
    }
  }

  private stepTimers(dt: number) {
    const p = this.player;
    if (this.sealT !== null) {
      this.sealT -= dt;
      if (this.sealT <= 0) {
        this.sealT = null;
        this.finish(1);
        return;
      }
    }
    if (this.broadcastT !== null) {
      this.broadcastT -= dt;
      // the transmitter is loud: the Overseer homes in
      const m = this.monster;
      if (!m.dead && m.stunT <= 0) {
        m.state = "investigate";
        m.lastSeen = { x: p.x, z: p.z };
        m.investigateT = 2;
      }
      if (this.broadcastT <= 0) {
        this.broadcastT = null;
        this.finish(6);
        return;
      }
    }
    if (this.nukeArmedT !== null) {
      this.nukeArmedT -= dt;
      const d = tileCenter(POI.drain.tx, POI.drain.ty);
      if (Math.hypot(p.x - d.x, p.z - d.z) < 1.6) {
        this.emit({ type: "boom" });
        this.finish(2);
        return;
      }
      if (this.nukeArmedT <= 0) {
        this.nukeArmedT = 0;
        this.emit({ type: "boom" });
        this.die("blast");
      }
    }
  }

  die(reason: string) {
    if (this.phase !== "playing") return;
    this.phase = "dead";
    this.deathReason = reason;
  }

  finish(ending: Ending) {
    if (this.phase !== "playing") return;
    this.phase = "ending";
    this.ending = ending;
  }

  // ---------- interaction ----------
  updateFocus() {
    const p = this.player;
    const f = forwardOf(p.yaw);
    let best: Focus | null = null;
    let bestScore = Infinity;
    const consider = (fx: Omit<Focus, "x" | "z">, x: number, z: number) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > T.INTERACT_R) return;
      const dot = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      if (dot < 0.35 && d > 1.1) return;
      const score = d * (1.6 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = { ...fx, x, z };
      }
    };
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      if (!pk.opened) {
        consider(
          {
            kind: "locker",
            ref: pk.id,
            label: this.inv.wrench ? "Вскрыть шкафчик ключом" : "Шкафчик заклинило — нужен разводной ключ",
            ok: this.inv.wrench,
          },
          pk.x,
          pk.z,
        );
      } else consider({ kind: "pickup", ref: pk.id, label: "Взять: " + ITEM_INFO[pk.kind].name, ok: true }, pk.x, pk.z);
    }
    if (!this.bunkerOpen) {
      const c = tileCenter(POI.bunkerDoor.tx, POI.bunkerDoor.ty);
      const ok = this.inv.cards >= 1;
      consider(
        {
          kind: "door",
          ref: 0,
          label: ok ? "Вставить перфокарту — открыть бункер" : "Бункер заперт. Нужна перфокарта доступа",
          ok,
        },
        c.x + TILE * 0.5,
        c.z,
      );
    }
    {
      const c = tileCenter(POI.elevator.tx, POI.elevator.ty);
      let label: string;
      let ok = false;
      if (this.sealT !== null) label = "Герметизация… держитесь!";
      else if (this.inv.cards < 3) label = `Лифт обесточен. Перфокарты: ${this.inv.cards}/3`;
      else if (!this.elevatorRepaired) {
        ok = this.inv.wrench;
        label = ok ? "Починить привод лифта ключом" : "Привод заклинило — нужен разводной ключ";
      } else {
        ok = true;
        label = "Запустить протокол герметизации";
      }
      consider({ kind: "elevator", ref: 0, label, ok }, c.x, c.z);
    }
    {
      const c = tileCenter(POI.reactor.tx, POI.reactor.ty);
      const canBroadcast = this.inv.tapes.length >= 5 && this.broadcastT === null && !this.inv.nuke;
      const ok = (this.inv.nuke && !this.nukePlanted) || canBroadcast;
      const label = this.nukePlanted
        ? "Заряд взведён. Бегите к дренажу на западе!"
        : this.broadcastT !== null
          ? "Передача идёт… держитесь!"
          : this.inv.nuke
            ? "Установить и взвести термоядерный заряд"
            : canBroadcast
              ? "Передать все 5 плёнок наверх по аварийному каналу"
              : "Консоль реактора. Нужен заряд — или все 5 плёнок";
      consider({ kind: "reactor", ref: 0, label, ok }, c.x, c.z);
    }
    {
      const c = tileCenter(POI.emitter.tx, POI.emitter.ty);
      const ok = this.inv.shard >= 3;
      consider(
        {
          kind: "emitter",
          ref: 0,
          label: ok ? "Настроить излучатель на себя (3 осколка)" : `Главный излучатель. Осколки: ${this.inv.shard}/3`,
          ok,
        },
        c.x,
        c.z + 1.6,
      );
    }
    {
      const c = tileCenter(POI.drain.tx, POI.drain.ty);
      const armed = this.nukeArmedT !== null;
      const shoot = !armed && this.inv.pistol > 0;
      consider(
        {
          kind: "drain",
          ref: 0,
          label: armed
            ? "Прыгнуть в дренаж!"
            : shoot
              ? "Сбить замок решётки выстрелом и уйти по реке"
              : "Дренажный сток к реке. Решётка заварена (замок можно отстрелить)",
          ok: armed || shoot,
        },
        c.x - 1,
        c.z,
      );
    }
    for (const pn of PANELS) {
      const s = this.sectors[pn.sector];
      consider(
        {
          kind: "panel",
          ref: pn.sector,
          label: s.shortedUntil > 0 ? "Щиток замкнут" : s.lit ? "Рубильник: погасить сектор" : "Рубильник: включить свет",
          ok: s.shortedUntil === 0,
        },
        pn.x,
        pn.z,
      );
    }
    this.focus = best;
  }

  interact() {
    if (this.phase !== "playing") return;
    this.updateFocus();
    const f = this.focus;
    if (!f) return;
    if (!f.ok) {
      this.say(f.label);
      return;
    }
    const p = this.player;
    switch (f.kind) {
      case "pickup":
        this.take(this.pickups[f.ref]);
        break;
      case "locker": {
        const pk = this.pickups[f.ref];
        pk.opened = true;
        p.noiseImpulse = 10;
        this.emit({ type: "locker" });
        this.say("Шкафчик поддался со скрежетом.");
        break;
      }
      case "door":
        this.bunkerOpen = true;
        this.emit({ type: "door" });
        this.say("Перфокарта принята. Гермодверь бункера открыта.");
        break;
      case "elevator":
        if (!this.elevatorRepaired) {
          this.elevatorRepaired = true;
          p.noiseImpulse = 12;
          this.emit({ type: "hit" });
          this.say("Муфта привода затянута. Лифт готов.");
        } else if (this.sealT === null) {
          this.sealT = T.SEAL_TIME;
          this.emit({ type: "alarm" });
          this.say("Протокол герметизации запущен. Сирена! Продержитесь у лифта.");
        }
        break;
      case "reactor":
        if (!this.inv.nuke) {
          this.broadcastT = T.BROADCAST_TIME;
          this.emit({ type: "terminal" });
          this.emit({ type: "alarm" });
          this.say("Передача началась! Продержитесь 30 секунд — он слышит сигнал.");
          break;
        }
        this.nukePlanted = true;
        this.inv.nuke = false;
        this.nukeArmedT = T.NUKE_TIME;
        this.emit({ type: "terminal" });
        this.emit({ type: "alarm" });
        this.say("Заряд взведён! Дренажный сток на западе — бегите!");
        break;
      case "emitter":
        this.inv.shard = 0;
        this.emit({ type: "reflect" });
        this.finish(3);
        break;
      case "drain":
        if (this.nukeArmedT !== null) {
          this.emit({ type: "boom" });
          this.finish(2);
        } else {
          this.inv.pistol -= 1;
          this.emit({ type: "shot" });
          this.finish(7);
        }
        break;
      case "panel": {
        const lit = !this.sectors[f.ref].lit;
        this.setSector(f.ref, lit);
        p.noiseImpulse = 9;
        break;
      }
    }
  }

  take(pk: Pickup) {
    if (pk.taken) return;
    pk.taken = true;
    const inv = this.inv;
    switch (pk.kind) {
      case "wrench":
        inv.wrench = true;
        this.selected = "wrench";
        break;
      case "stungun":
        inv.stungun += 3;
        this.selected = "stungun";
        break;
      case "redFlare":
        inv.redFlare += 2;
        break;
      case "whiteFlare":
        inv.whiteFlare += 2;
        break;
      case "cortexin":
        inv.cortexin += 1;
        break;
      case "bandage":
        inv.bandage += 1;
        break;
      case "shard":
        inv.shard += 1;
        break;
      case "card":
        inv.cards += 1;
        break;
      case "nuke":
        inv.nuke = true;
        break;
      case "battery":
        this.player.battery = Math.min(100, this.player.battery + T.BATTERY_PACK);
        break;
      case "pepper":
        inv.pepper += 3;
        this.selected = "pepper";
        break;
      case "pistol":
        inv.pistol += 2;
        this.selected = "pistol";
        break;
      case "ammo":
        inv.pistol += 2;
        break;
      case "tape":
        if (pk.tape !== undefined) {
          inv.tapes.push(pk.tape);
          this.readingTape = pk.tape;
          this.phase = "reading";
        }
        break;
    }
    this.emit({ type: "pickup", kind: pk.kind });
    this.tutorialDone("pickup");
    const extra = pk.kind === "card" ? ` (${inv.cards}/3)` : pk.kind === "shard" ? ` (${inv.shard}/3)` : "";
    this.say("Найдено: " + ITEM_INFO[pk.kind].name + extra);
  }

  closeTape() {
    if (this.phase === "reading") {
      this.phase = "playing";
      this.readingTape = null;
    }
  }

  count(slot: Slot): number {
    const v = this.inv[slot];
    return typeof v === "boolean" ? (v ? 1 : 0) : v;
  }

  select(slot: Slot) {
    this.selected = slot;
  }

  cycle(dir: number) {
    const owned = SLOTS.filter((s) => this.count(s) > 0);
    if (!owned.length) return;
    const i = owned.indexOf(this.selected);
    this.selected = owned[(i + dir + owned.length) % owned.length];
  }

  toggleFlashlight() {
    if (this.phase !== "playing") return;
    if (this.player.battery <= 0) return;
    this.player.flashlight = !this.player.flashlight;
  }

  useItem() {
    if (this.phase !== "playing" || this.useCd > 0) return;
    const slot = this.selected;
    if (this.count(slot) <= 0) return;
    const p = this.player;
    const m = this.monster;
    const f = forwardOf(p.yaw);
    const dx = m.x - p.x;
    const dz = m.z - p.z;
    const d = Math.hypot(dx, dz);
    const dot = d > 0 ? (dx * f.x + dz * f.z) / d : 1;
    this.tutorialDone("use");
    switch (slot) {
      case "pepper":
        this.useCd = 0.9;
        this.inv.pepper -= 1;
        p.noiseImpulse = 3;
        this.emit({ type: "spray" });
        if (!m.dead && d < T.PEPPER_R && dot > 0.6) {
          m.stunT = T.PEPPER_STUN;
          m.state = "blind";
          m.lastSeen = null;
          this.say("Перцовка в экран! Надсмотрщик воет и мечется.");
        } else this.say("Облако перца рассеялось в воздухе.");
        break;
      case "pistol": {
        this.useCd = 0.7;
        this.inv.pistol -= 1;
        p.noiseImpulse = 22;
        this.emit({ type: "shot" });
        if (!m.dead && d < T.PISTOL_R && dot > 0.93 && lineOfSight(p, m, this.solid)) {
          m.wounds += 1;
          if (m.wounds >= T.MONSTER_HP) {
            m.dead = true;
            m.stunT = 999;
            m.state = "stunned";
            m.speed = 0;
            this.say("Последний выстрел. Экран Надсмотрщика гаснет навсегда.");
            this.finish(5);
          } else {
            m.stunT = T.PISTOL_STUN;
            m.state = "stunned";
            this.say(`Попадание! (${m.wounds}/${T.MONSTER_HP}) Он шатается — но встаёт.`);
          }
        } else {
          m.state = "investigate";
          m.lastSeen = { x: p.x, z: p.z };
          m.investigateT = 5;
          this.say("Промах! Эхо выстрела разнеслось по коллектору.");
        }
        break;
      }
      case "wrench":
        this.useCd = 1.0;
        p.noiseImpulse = 8;
        if (d < 2.6 && dot > 0.55) {
          m.stunT = 3.2;
          m.state = "stunned";
          this.emit({ type: "hit" });
          this.say("Удар ключом! Надсмотрщик оглушён.");
        } else this.emit({ type: "hit" });
        break;
      case "stungun": {
        this.useCd = 1.2;
        this.inv.stungun -= 1;
        p.battery = Math.max(0, p.battery - 4);
        p.noiseImpulse = 11;
        if (d < 8 && dot > 0.82 && lineOfSight(p, m, this.solid)) {
          m.stunT = 6;
          m.state = "stunned";
          this.emit({ type: "zap", x: m.x, z: m.z });
          this.say("Разряд! Надсмотрщик бьётся в конвульсиях.");
          break;
        }
        const pn = PANELS.find((pn) => {
          const ox = pn.x - p.x;
          const oz = pn.z - p.z;
          const od = Math.hypot(ox, oz);
          return od < 3.2 && (ox * f.x + oz * f.z) / (od || 1) > 0.5;
        });
        const zx = p.x + f.x * 2;
        const zz = p.z + f.z * 2;
        this.emit({ type: "zap", x: pn?.x ?? zx, z: pn?.z ?? zz });
        if (pn) {
          this.setSector(pn.sector, false);
          this.sectors[pn.sector].shortedUntil = this.time + T.SHORT_TIME;
          this.say("Щиток замкнут. Сектор обесточен на минуту.");
        }
        break;
      }
      case "redFlare":
      case "whiteFlare": {
        this.useCd = 0.8;
        this.inv[slot] -= 1;
        const dist = rayDistance(p, f.x, f.z, 7, this.solid);
        const kind = slot === "redFlare" ? "red" : "white";
        this.flares.push({
          id: this.flareId++,
          kind,
          x: p.x + f.x * Math.max(0.6, dist - 0.3),
          z: p.z + f.z * Math.max(0.6, dist - 0.3),
          t: 0,
          life: kind === "red" ? 12 : 20,
          blinded: false,
        });
        p.noiseImpulse = 5;
        this.emit({ type: "flare", kind });
        break;
      }
      case "cortexin":
        this.useCd = 1;
        this.inv.cortexin -= 1;
        p.sanity = Math.min(100, p.sanity + 60);
        p.cortexinT = 25;
        this.emit({ type: "inject" });
        this.say("Кортексин. Голоса стихают.");
        break;
      case "bandage":
        if (p.health >= 100) return;
        this.useCd = 1;
        this.inv.bandage -= 1;
        p.health = Math.min(100, p.health + 45);
        this.say("Раны перевязаны.");
        break;
      case "shard":
        this.useCd = 1;
        this.inv.shard -= 1;
        p.sanity = Math.min(100, p.sanity + 30);
        this.emit({ type: "reflect" });
        if (d < 14 && lineOfSight(p, m, this.solid)) {
          m.stunT = 8;
          m.state = "stunned";
          this.say("Осколок отразил проекцию! Монстр ослеплён собственным светом.");
        } else this.say("Осколок рассыпался светом. Проекции отступили.");
        break;
    }
  }

  // Exposed for the scene and tests
  get noiseObstacles() {
    return CLUTTER;
  }
}

/** Direction from a tile toward the wall a locker stands against. */
export function lockerDir(tx: number, ty: number) {
  const dirs = [
    [0, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
  ];
  for (const [dx, dz] of dirs) if (isSolidCell(cellAt(tx + dx, ty + dz))) return { dx, dz };
  return { dx: 0, dz: -1 };
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const game = new Game();
