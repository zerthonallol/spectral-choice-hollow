// Procedural canvas textures (client only). Generated once and cached.
import * as THREE from "three";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise
function makeNoise(size: number, cells: number, seed: number) {
  const r = rng(seed);
  const g = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx),
        y0 = Math.floor(fy);
      const tx = fx - x0,
        ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx),
        sy = ty * ty * (3 - 2 * ty);
      const i = (xx: number, yy: number) => g[(yy % cells) * cells + (xx % cells)];
      const a = i(x0, y0),
        b = i(x0 + 1, y0),
        c = i(x0, y0 + 1),
        d = i(x0 + 1, y0 + 1);
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  return out;
}

function fbm(size: number, seed: number, octaves = [4, 8, 16, 32, 64], weights = [0.4, 0.25, 0.15, 0.12, 0.08]) {
  const out = new Float32Array(size * size);
  octaves.forEach((c, k) => {
    const n = makeNoise(size, c, seed + k * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * weights[k];
  });
  return out;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function toTex(c: HTMLCanvasElement, color: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function applyNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: Float32Array,
  nSize: number,
  base: [number, number, number],
  amp: number,
  alpha = 1,
) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = n[(y % nSize) * nSize + (x % nSize)] - 0.5;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const target = base[k] + v * amp;
        img.data[i + k] = img.data[i + k] * (1 - alpha) + target * alpha;
      }
    }
  ctx.putImageData(img, 0, 0);
}

let cache: ReturnType<typeof build> | null = null;
export function getTextures() {
  if (!cache) cache = build();
  return cache;
}

function build() {
  const R = rng(19);
  const N = 256;
  const noiseA = fbm(N, 3);
  const noiseB = fbm(N, 77);

  // ---------------- WALL (u: along wall, v: floor->ceiling) ----------------
  const WW = 512,
    WH = 640;
  const [wc, w] = canvas(WW, WH);
  const [wr, wrc] = canvas(WW, WH); // roughness
  // concrete upper
  w.fillStyle = "#5d5a4b";
  w.fillRect(0, 0, WW, WH);
  applyNoise(w, WW, WH, noiseA, N, [92, 89, 74], 120, 1);
  wrc.fillStyle = "#d8d8d8";
  wrc.fillRect(0, 0, WW, WH);
  // formwork seams
  w.fillStyle = "rgba(20,18,12,0.35)";
  for (let x = 0; x < WW; x += 128) w.fillRect(x, 0, 2, WH * 0.62);
  w.fillRect(0, WH * 0.2, WW, 2);
  // tile band (lower 38%)
  const tileTop = WH * 0.62;
  const ts = 32;
  for (let y = tileTop; y < WH; y += ts)
    for (let x = 0; x < WW; x += ts * 2) {
      const missing = R() < 0.05;
      const grime = R();
      const l = 150 + R() * 25 - grime * 30;
      w.fillStyle = missing
        ? `rgb(70,66,52)`
        : `rgb(${l * 0.82},${l * 0.88},${l * 0.7})`;
      w.fillRect(x + 1, y + 1, ts * 2 - 2, ts - 2);
      wrc.fillStyle = missing ? "#e0e0e0" : `rgb(${60 + grime * 60},0,0)`;
      wrc.fillRect(x + 1, y + 1, ts * 2 - 2, ts - 2);
    }
  w.fillStyle = "rgba(30,30,20,0.9)";
  for (let y = tileTop; y < WH; y += ts) w.fillRect(0, y, WW, 1.5);
  // hazard band above the tiles
  const hb = tileTop - 22;
  w.fillStyle = "#c79a1d";
  w.fillRect(0, hb, WW, 18);
  w.fillStyle = "#1d1a12";
  for (let x = -40; x < WW + 40; x += 36) {
    w.beginPath();
    w.moveTo(x, hb + 18);
    w.lineTo(x + 18, hb);
    w.lineTo(x + 32, hb);
    w.lineTo(x + 14, hb + 18);
    w.fill();
  }
  wrc.fillStyle = "#909090";
  wrc.fillRect(0, hb, WW, 18);
  // grime: overlay noise with multiply
  const img = w.getImageData(0, 0, WW, WH);
  for (let y = 0; y < WH; y++)
    for (let x = 0; x < WW; x++) {
      const v = noiseB[(y % N) * N + (x % N)];
      const bottomDirt = Math.max(0, (y - WH * 0.82) / (WH * 0.18));
      const m = 0.75 + v * 0.45 - bottomDirt * 0.35;
      const i = (y * WW + x) * 4;
      img.data[i] *= m;
      img.data[i + 1] *= m * 1.02;
      img.data[i + 2] *= m * 0.92;
    }
  w.putImageData(img, 0, 0);
  // drips and rust streaks from the top
  for (let k = 0; k < 40; k++) {
    const x = R() * WW;
    const len = 60 + R() * 380;
    const g = w.createLinearGradient(0, 0, 0, len);
    const rust = R() < 0.4;
    g.addColorStop(0, rust ? "rgba(96,48,18,0.55)" : "rgba(15,20,12,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    w.fillStyle = g;
    w.fillRect(x, 0, 2 + R() * 6, len);
  }
  // green slime near floor
  for (let k = 0; k < 30; k++) {
    const x = R() * WW;
    const g = w.createRadialGradient(x, WH, 0, x, WH, 30 + R() * 50);
    g.addColorStop(0, "rgba(46,70,22,0.7)");
    g.addColorStop(1, "rgba(46,70,22,0)");
    w.fillStyle = g;
    w.fillRect(x - 90, WH - 90, 180, 90);
  }

  // ---------------- FLOOR (one 3m tile) ----------------
  const FS = 512;
  const [fc, f] = canvas(FS, FS);
  const [fr, frc] = canvas(FS, FS);
  f.fillStyle = "#4a4a40";
  f.fillRect(0, 0, FS, FS);
  applyNoise(f, FS, FS, noiseA, N, [70, 68, 58], 90);
  // slab joints
  f.fillStyle = "rgba(12,12,8,0.7)";
  f.fillRect(0, 0, FS, 3);
  f.fillRect(0, 0, 3, FS);
  f.fillRect(0, FS / 2, FS, 2);
  // wetness / roughness
  const fimg = f.getImageData(0, 0, FS, FS);
  const rimg = frc.createImageData(FS, FS);
  for (let y = 0; y < FS; y++)
    for (let x = 0; x < FS; x++) {
      const v = noiseB[((y >> 1) % N) * N + ((x >> 1) % N)];
      const wet = Math.max(0, Math.min(1, (v - 0.5) * 5));
      const i = (y * FS + x) * 4;
      const m = 1 - wet * 0.45;
      fimg.data[i] *= m;
      fimg.data[i + 1] *= m;
      fimg.data[i + 2] *= m * 0.95;
      const rough = 235 - wet * 210;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough;
      rimg.data[i + 3] = 255;
    }
  f.putImageData(fimg, 0, 0);
  frc.putImageData(rimg, 0, 0);
  // central drain grate
  f.fillStyle = "#23241f";
  f.fillRect(FS / 2 - 60, FS / 2 - 40, 120, 80);
  f.fillStyle = "#3d3c33";
  for (let x = FS / 2 - 56; x < FS / 2 + 56; x += 12) f.fillRect(x, FS / 2 - 36, 6, 72);
  // ---------------- CEILING ----------------
  const [cc, c] = canvas(256, 256);
  c.fillStyle = "#3a3830";
  c.fillRect(0, 0, 256, 256);
  applyNoise(c, 256, 256, noiseA, N, [52, 50, 42], 70);
  c.fillStyle = "rgba(10,10,6,0.6)";
  c.fillRect(0, 0, 256, 10);
  c.fillRect(0, 128, 256, 4);

  // ---------------- WATER normal map ----------------
  const WN = 256;
  const [nc, n] = canvas(WN, WN);
  const h = fbm(WN, 5, [8, 16, 32], [0.5, 0.3, 0.2]);
  const nimg = n.createImageData(WN, WN);
  for (let y = 0; y < WN; y++)
    for (let x = 0; x < WN; x++) {
      const hx = h[y * WN + ((x + 1) % WN)] - h[y * WN + ((x - 1 + WN) % WN)];
      const hy = h[((y + 1) % WN) * WN + x] - h[((y - 1 + WN) % WN) * WN + x];
      const nx = -hx * 6,
        ny = -hy * 6,
        nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * WN + x) * 4;
      nimg.data[i] = (nx / l * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  n.putImageData(nimg, 0, 0);

  // ---------------- METAL (rusty) ----------------
  const [mc, mm] = canvas(256, 256);
  mm.fillStyle = "#6c6458";
  mm.fillRect(0, 0, 256, 256);
  applyNoise(mm, 256, 256, noiseB, N, [104, 92, 78], 110);
  for (let k = 0; k < 60; k++) {
    const x = R() * 256,
      y = R() * 256;
    const g = mm.createRadialGradient(x, y, 0, x, y, 6 + R() * 24);
    g.addColorStop(0, "rgba(120,52,16,0.7)");
    g.addColorStop(1, "rgba(120,52,16,0)");
    mm.fillStyle = g;
    mm.fillRect(x - 30, y - 30, 60, 60);
  }

  // ---------------- HAZARD stripes ----------------
  const [hc, hz] = canvas(128, 128);
  hz.fillStyle = "#d2a11f";
  hz.fillRect(0, 0, 128, 128);
  hz.fillStyle = "#16130c";
  for (let x = -128; x < 256; x += 48) {
    hz.beginPath();
    hz.moveTo(x, 128);
    hz.lineTo(x + 128, 0);
    hz.lineTo(x + 152, 0);
    hz.lineTo(x + 24, 128);
    hz.fill();
  }
  applyNoise(hz, 128, 128, noiseA, N, [120, 100, 40], 80, 0.25);

  const wall = toTex(wc, true);
  const wallRough = toTex(wr, false);
  const floor = toTex(fc, true);
  const floorRough = toTex(fr, false);
  const ceil = toTex(cc, true);
  const waterNormal = toTex(nc, false);
  const metal = toTex(mc, true);
  const hazard = toTex(hc, true);
  return { wall, wallRough, floor, floorRough, ceil, waterNormal, metal, hazard };
}

/** A canvas with text for the Overseer's wall projections. */
export function makeMemoryTexture(lines: string[]) {
  const [c, x] = canvas(1024, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (text: string, seed: number) => {
    const r = rng(seed);
    x.clearRect(0, 0, 1024, 512);
    // ghost face: two dark eye holes in a soft glow
    const g = x.createRadialGradient(512, 230, 20, 512, 230, 260);
    g.addColorStop(0, "rgba(255,240,220,0.55)");
    g.addColorStop(0.6, "rgba(255,230,200,0.12)");
    g.addColorStop(1, "rgba(255,230,200,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 512);
    x.fillStyle = "rgba(0,0,0,0.7)";
    x.beginPath();
    x.ellipse(452, 200, 34, 22 + r() * 10, 0, 0, Math.PI * 2);
    x.ellipse(572, 200, 34, 22 + r() * 10, 0, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.ellipse(512, 300, 40, 12 + r() * 30, 0, 0, Math.PI * 2);
    x.fill();
    x.font = "bold 72px 'Oswald', 'Arial Narrow', sans-serif";
    x.textAlign = "center";
    x.fillStyle = "rgba(255,245,230,0.95)";
    x.fillText(text, 512 + (r() - 0.5) * 8, 440);
    // scanlines
    x.fillStyle = "rgba(0,0,0,0.35)";
    for (let y = 0; y < 512; y += 4) x.fillRect(0, y, 1024, 1.5);
    tex.needsUpdate = true;
  };
  draw(lines[0], 1);
  return { tex, draw };
}
