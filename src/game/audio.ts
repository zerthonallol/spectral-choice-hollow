import { game } from "./sim/game";
import { settings } from "./input";

/**
 * Web Audio engine: CC0 samples for one-shots, synthesized ambience
 * (pipe hum, drips), hallucination whispers and a proximity heartbeat.
 */
const SAMPLES = [
  "boom", "clunk", "door", "flesh", "heavy0", "heavy1", "hit", "pickup",
  "step0", "step1", "step2", "step3", "step4", "terminal", "zap",
] as const;
type Sample = (typeof SAMPLES)[number];

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buffers = new Map<Sample, AudioBuffer>();
  whisperGain!: GainNode;
  humGain!: GainNode;
  nextDrip = 0;
  nextBeat = 0;
  stepI = 0;

  async init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(ctx.destination);
    this.buildAmbience();
    await Promise.all(
      SAMPLES.map(async (s) => {
        try {
          const r = await fetch(`/audio/${s}.ogg`);
          this.buffers.set(s, await ctx.decodeAudioData(await r.arrayBuffer()));
        } catch {
          /* missing sample: stay silent */
        }
      }),
    );
  }

  setVolume(v: number) {
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private noiseBuffer(seconds: number, brown: boolean) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private buildAmbience() {
    const ctx = this.ctx!;
    // pipe hum: detuned low saws through a lowpass, slowly wobbling
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    lp.connect(this.humGain).connect(this.master);
    for (const [f, g] of [[49, 0.5], [50.4, 0.5], [99, 0.25], [147, 0.1]] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 90;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    // rushing water / air in pipes: brown noise
    const rush = ctx.createBufferSource();
    rush.buffer = this.noiseBuffer(6, true);
    rush.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = "lowpass";
    rf.frequency.value = 500;
    const rg = ctx.createGain();
    rg.gain.value = 0.22;
    rush.connect(rf).connect(rg).connect(this.master);
    rush.start();
    // whispers: band-passed white noise, amplitude-modulated, panned around
    const wn = ctx.createBufferSource();
    wn.buffer = this.noiseBuffer(4, false);
    wn.loop = true;
    this.whisperGain = ctx.createGain();
    this.whisperGain.gain.value = 0;
    const bp1 = ctx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 2400;
    bp1.Q.value = 3;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 900;
    bp2.Q.value = 6;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const amOsc = ctx.createOscillator();
    amOsc.frequency.value = 5.3;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.5;
    amOsc.connect(amDepth).connect(am.gain);
    amOsc.start();
    const formant = ctx.createOscillator();
    formant.frequency.value = 0.9;
    const fDepth = ctx.createGain();
    fDepth.gain.value = 700;
    formant.connect(fDepth).connect(bp1.frequency);
    formant.start();
    const pan = ctx.createStereoPanner();
    const panOsc = ctx.createOscillator();
    panOsc.frequency.value = 0.13;
    panOsc.connect(pan.pan);
    panOsc.start();
    wn.connect(bp1);
    wn.connect(bp2);
    bp1.connect(am);
    bp2.connect(am);
    am.connect(pan).connect(this.whisperGain).connect(this.master);
    wn.start();
  }

  private drip(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    const f = 900 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 0.09);
    const g = ctx.createGain();
    const v = 0.04 + Math.random() * 0.08;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 2 - 1;
    o.connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  private thump(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  play(s: Sample, vol = 1, pan = 0, rate = 1) {
    const ctx = this.ctx;
    const buf = this.buffers.get(s);
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p).connect(this.master);
    src.start();
  }

  /** Pan and attenuation of a world point relative to the player. */
  spatial(x: number, z: number, range: number) {
    const p = game.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const rx = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz;
    return { vol: Math.max(0, 1 - d / range) ** 1.5, pan: d > 0.01 ? rx / d : 0 };
  }

  /** Called every frame after game.step: drains events and drives continuous layers. */
  update() {
    const ctx = this.ctx;
    const events = game.events;
    game.events = [];
    if (!ctx) return;
    const now = ctx.currentTime;
    const playing = game.phase === "playing";
    const p = game.player;
    const m = game.monster;

    for (const e of events) {
      switch (e.type) {
        case "step":
          this.play(`step${this.stepI++ % 5}` as Sample, e.crouch ? 0.25 : e.run ? 0.7 : 0.45, 0, e.water ? 0.7 : 1);
          break;
        case "mstep": {
          const s = this.spatial(e.x, e.z, 30);
          this.play(Math.random() > 0.5 ? "heavy0" : "heavy1", s.vol * 0.9, s.pan, 0.9);
          break;
        }
        case "pickup":
          this.play("pickup", 0.7);
          break;
        case "hit":
          this.play("hit", 0.8);
          break;
        case "zap": {
          const s = this.spatial(e.x, e.z, 20);
          this.play("zap", 0.4 + s.vol * 0.6, s.pan);
          break;
        }
        case "attack":
          this.play("flesh", 1);
          break;
        case "door":
          this.play("door", 0.9);
          break;
        case "terminal":
          this.play("terminal", 0.7);
          break;
        case "locker":
        case "lights":
          this.play("clunk", 0.6);
          break;
        case "flare":
          this.play("zap", 0.3, 0, 0.6);
          break;
        case "boom":
        case "alarm":
          this.play("boom", 1, 0, e.type === "alarm" ? 1.6 : 1);
          break;
        case "inject":
        case "reflect":
          this.play("pickup", 0.5, 0, 0.6);
          break;
        default:
          break;
      }
    }

    // continuous layers
    const insanity = 1 - p.sanity / 100;
    const whisper = playing ? Math.max(0, insanity - 0.25) * 0.9 + (m.projecting ? 0.25 : 0) : 0;
    this.whisperGain.gain.setTargetAtTime(Math.min(0.6, whisper), now, 0.4);
    this.humGain.gain.setTargetAtTime(playing ? 0.16 : 0.07, now, 0.5);

    if (now >= this.nextDrip) {
      this.drip(now + 0.01);
      this.nextDrip = now + 0.4 + Math.random() * 2.6;
    }

    if (playing) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      const near = Math.max(0, Math.min(1, 1 - (d - 3) / 20));
      const hunt = m.state === "hunt" ? 0.25 : 0;
      const k = Math.min(1, near + hunt);
      if (k > 0.05 && now >= this.nextBeat) {
        const bpm = 55 + 100 * k;
        const v = 0.25 + 0.6 * k;
        this.thump(now + 0.01, v);
        this.thump(now + 0.2, v * 0.6);
        this.nextBeat = now + 60 / bpm;
      }
    }
  }
}

export const audio = new AudioEngine();
