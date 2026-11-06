import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Vignette, ChromaticAberration, Noise } from "@react-three/postprocessing";
import { BlendFunction, type ChromaticAberrationEffect } from "postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { game } from "./sim/game";
import { input, readMove, settings, loadSettings, SETTINGS_EVENT } from "./input";
import { audio } from "./audio";
import { Level } from "./scene/Level";
import { Lamps, LightPool } from "./scene/Lamps";
import { Items, Flares } from "./scene/Items";
import { Overseer } from "./scene/Overseer";
import { Pipes, Clutter, Panels, Lockers, BunkerDoor, Elevator, Reactor, Emitter, Drain } from "./scene/Props";

/** Single stepper: input -> simulation -> camera/flashlight -> audio, in that order. */
function PlayerRig() {
  const { camera } = useThree();
  const flash = useRef<THREE.SpotLight>(null!);
  const target = useMemo(() => new THREE.Object3D(), []);
  const bob = useRef(0);
  const ready = useRef(false);

  useEffect(() => {
    flash.current.target = target;
    camera.rotation.order = "YXZ";
  }, [camera, target]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (game.phase === "playing") game.step(dt, readMove());
    const p = game.player;
    if (game.phase === "menu") {
      input.yaw = p.yaw;
      input.pitch = 0;
    }
    bob.current += p.speed * dt * (p.running ? 2.2 : 1.8);
    const by = Math.sin(bob.current * 2) * 0.035 * Math.min(1, p.speed / 3);
    const hurt = p.hurtT > 0 ? (Math.random() - 0.5) * 0.04 : 0;
    camera.position.set(p.x, p.eye + by, p.z);
    camera.rotation.set(p.pitch + hurt, p.yaw + hurt, 0);

    // flashlight follows the camera, flickers when the battery is low
    const fl = flash.current;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fl.position.copy(camera.position).addScaledVector(dir, 0.2).add(new THREE.Vector3(0, -0.15, 0));
    target.position.copy(camera.position).addScaledVector(dir, 6);
    target.updateMatrixWorld();
    const low = p.battery < 15 && Math.random() < 0.08 ? 0.2 : 1;
    fl.intensity = p.flashlight ? 38 * low * (0.6 + 0.4 * Math.min(1, p.battery / 30)) : 0;

    audio.update();
    if (!ready.current && state.clock.elapsedTime > 0.3) {
      ready.current = true;
      document.querySelector("[data-game-root]")?.setAttribute("data-scene-ready", "1");
    }
  });

  return (
    <>
      <spotLight ref={flash} angle={0.5} penumbra={0.55} distance={22} decay={1.5} color="#fff3d6" intensity={0} />
      <primitive object={target} />
    </>
  );
}

/** Chromatic aberration grows as sanity drops. */
function Post() {
  const ca = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);
  useFrame((st) => {
    const e = ca.current;
    if (!e) return;
    const ins = Math.max(0, 1 - game.player.sanity / 100);
    const k = 0.0006 + ins * ins * 0.012 + (game.monster.projecting ? 0.003 : 0);
    const w = Math.sin(st.clock.elapsedTime * 3) * 0.3 + 1;
    e.offset.set(k * w, k * 0.6);
  });
  return (
    <EffectComposer multisampling={0}>
      <ChromaticAberration ref={ca} offset={offset} radialModulation={false} modulationOffset={0} />
      <Noise opacity={0.07} blendFunction={BlendFunction.OVERLAY} />
      <Vignette offset={0.3} darkness={0.85} />
    </EffectComposer>
  );
}

export function GameCanvas() {
  const [low, setLow] = useState(() => {
    loadSettings();
    return settings.lowSpec;
  });
  useEffect(() => {
    const on = () => setLow(settings.lowSpec);
    window.addEventListener(SETTINGS_EVENT, on);
    return () => window.removeEventListener(SETTINGS_EVENT, on);
  }, []);
  return (
    <Canvas
      key={low ? "low" : "high"}
      shadows={!low}
      dpr={low ? 0.6 : [1, 1.5]}
      camera={{ fov: 72, near: 0.05, far: 80 }}
      gl={{ antialias: false, powerPreference: "high-performance", precision: low ? "mediump" : "highp" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        scene.background = new THREE.Color("#050403");
        scene.fog = new THREE.FogExp2("#070605", low ? 0.07 : 0.055);
      }}
    >
      <ambientLight intensity={0.05} color="#8a7a66" />
      <hemisphereLight intensity={0.08} color="#5a5040" groundColor="#0c0a08" />
      <PlayerRig />
      <Level />
      <Lamps />
      <LightPool />
      <Pipes />
      <Clutter />
      <Panels />
      <Lockers />
      <BunkerDoor />
      <Elevator />
      <Reactor />
      <Emitter />
      <Drain />
      <Items />
      <Flares />
      <Overseer />
      {!low && <Post />}
    </Canvas>
  );
}
