/** Shared input state written by keyboard/mouse/touch handlers, read once per frame by the stepper. */
export const input = {
  keys: new Set<string>(),
  yaw: 0,
  pitch: 0,
  // touch joystick (-1..1)
  joyX: 0,
  joyY: 0,
  touchRun: false,
  touchCrouch: false,
};

export const settings = {
  sensitivity: 1,
  volume: 0.8,
  invertY: false,
  controls: "auto" as "auto" | "desktop" | "touch",
  lowSpec: false,
};

/** Fired when graphics-affecting settings change so the 3D view can rebuild. */
export const SETTINGS_EVENT = "game-settings-change";

const KEY = "light-codes-settings";
const TUT_KEY = "light-codes-tutorial-done";

/** Rough guess whether this is a phone or a weak laptop. */
export function isWeakDevice() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return coarse || cores <= 4 || mem <= 4;
}

export function tutorialSeen() {
  try {
    return localStorage.getItem(TUT_KEY) === "1";
  } catch {
    return false;
  }
}
export function markTutorialSeen() {
  try {
    localStorage.setItem(TUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
    else settings.lowSpec = isWeakDevice();
  } catch {
    /* ignore */
  }
}
export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function isTouchMode() {
  if (settings.controls === "touch") return true;
  if (settings.controls === "desktop") return false;
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function look(dx: number, dy: number, scale: number) {
  const s = scale * settings.sensitivity;
  input.yaw -= dx * s;
  input.pitch -= dy * s * (settings.invertY ? -1 : 1);
  input.pitch = Math.max(-1.45, Math.min(1.45, input.pitch));
}

export function readMove() {
  const k = input.keys;
  let fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
  let strafe = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
  if (Math.abs(input.joyX) > 0.05 || Math.abs(input.joyY) > 0.05) {
    fwd = -input.joyY;
    strafe = input.joyX;
  }
  const run = k.has("ShiftLeft") || k.has("ShiftRight") || input.touchRun;
  const crouch = k.has("KeyC") || k.has("ControlLeft") || input.touchCrouch;
  return { fwd, strafe, run, crouch, yaw: input.yaw, pitch: input.pitch };
}
