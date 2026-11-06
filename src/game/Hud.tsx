import { useEffect, useRef, useState, type ReactNode } from "react";
import { game, SLOTS, ENDING_IDS, type Ending } from "./sim/game";
import { MenuScene } from "./scene/MenuScene";
import { ITEM_INFO, TAPES, ENDINGS, DEATHS } from "./sim/lore";
import {
  input,
  look,
  settings,
  saveSettings,
  loadSettings,
  isTouchMode,
  SETTINGS_EVENT,
  tutorialSeen,
  markTutorialSeen,
} from "./input";
import { audio } from "./audio";
import { ITEM_ART } from "./itemArt";

function snapshot() {
  const p = game.player;
  return {
    phase: game.phase,
    health: p.health,
    sanity: p.sanity,
    battery: p.battery,
    flashlight: p.flashlight,
    selected: game.selected,
    counts: SLOTS.map((s) => game.count(s)),
    cards: game.inv.cards,
    tapes: game.inv.tapes.slice(),
    nuke: game.inv.nuke,
    focus: game.focus ? { label: game.focus.label, ok: game.focus.ok } : null,
    messages: game.messages.filter((m) => game.time - m.t < 6).map((m) => m.text),
    readingTape: game.readingTape,
    ending: game.ending,
    death: game.deathReason,
    nukeT: game.nukeArmedT,
    sealT: game.sealT,
    projecting: game.monster.projecting,
    broadcastT: game.broadcastT,
    blackout: game.blackoutT > 0,
    tutorial: game.tutorialStep,
    tutorialIndex: game.tutorial,
    wounds: game.monster.wounds,
  };
}
type Snap = ReturnType<typeof snapshot>;

const canvasEl = () => document.querySelector("[data-game-root] canvas") as HTMLCanvasElement | null;
const lock = () => {
  if (!isTouchMode()) void canvasEl()?.requestPointerLock?.();
};

const ENDINGS_KEY = "light-codes-endings";
function loadEndings(): Ending[] {
  try {
    return JSON.parse(localStorage.getItem(ENDINGS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveEnding(e: Ending) {
  const all = loadEndings();
  if (all.includes(e)) return;
  try {
    localStorage.setItem(ENDINGS_KEY, JSON.stringify([...all, e]));
  } catch {
    /* ignore */
  }
}

async function startGame(tutorial = false) {
  await audio.init();
  game.start(tutorial);
  input.yaw = game.player.yaw;
  input.pitch = 0;
  lock();
}

export function Hud() {
  const [s, setS] = useState<Snap>(snapshot);
  const [touch, setTouch] = useState(false);
  const [showInv, setShowInv] = useState(false);

  useEffect(() => {
    loadSettings();
    setTouch(isTouchMode());
    const id = window.setInterval(() => setS(snapshot()), 100);
    return () => window.clearInterval(id);
  }, []);

  // keyboard + mouse
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      input.keys.add(e.code);
      if (e.code === "Tab") {
        e.preventDefault();
        setShowInv((v) => !v);
      }
      if (game.phase === "reading" && (e.code === "KeyE" || e.code === "Escape")) {
        game.closeTape();
        lock();
        return;
      }
      if (game.phase !== "playing") return;
      if (e.code === "Enter") game.skipTutorial();
      if (e.code === "KeyF") game.toggleFlashlight();
      if (e.code === "KeyE") game.interact();
      if (e.code === "KeyQ") game.cycle(-1);
      if (e.code === "KeyR") game.cycle(1);
      if (e.code === "Space") game.useItem();
      const n = Number(e.key);
      if (n >= 1 && n <= SLOTS.length) {
        const slot = SLOTS[n - 1];
        if (slot) game.select(slot);
      }
    };
    const up = (e: KeyboardEvent) => input.keys.delete(e.code);
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement && game.phase === "playing") look(e.movementX, e.movementY, 0.0022);
    };
    const mdown = (e: MouseEvent) => {
      if (game.phase !== "playing" || isTouchMode()) return;
      if (!document.pointerLockElement) {
        if ((e.target as HTMLElement).tagName === "CANVAS") lock();
        return;
      }
      if (e.button === 0) game.useItem();
      if (e.button === 2) game.interact();
    };
    const wheel = (e: WheelEvent) => {
      if (game.phase === "playing") game.cycle(e.deltaY > 0 ? 1 : -1);
    };
    const lockChange = () => {
      if (!document.pointerLockElement && game.phase === "playing" && !isTouchMode()) game.phase = "paused";
    };
    const blur = () => input.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", mdown);
    window.addEventListener("wheel", wheel);
    window.addEventListener("blur", blur);
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", lockChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", mdown);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
      document.removeEventListener("pointerlockchange", lockChange);
    };
  }, []);

  const resume = () => {
    game.phase = "playing";
    lock();
  };

  const insanity = Math.max(0, 1 - s.sanity / 100);

  useEffect(() => {
    if (s.phase === "ending" && s.ending) saveEnding(s.ending);
  }, [s.phase, s.ending]);


  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-hud">
      <div className="crt-overlay" style={{ opacity: 0.55 + insanity * 0.45 }} />
      {s.phase === "playing" && insanity > 0.45 && <div className="hallucination" style={{ opacity: insanity - 0.3 }} />}
      {s.phase !== "menu" && s.phase !== "ending" && s.phase !== "dead" && (
        <>
          {/* status bars */}
          <div className="absolute left-4 top-4 flex w-56 flex-col gap-2">
            <Bar label="Здоровье" value={s.health} kind="health" />
            <Bar label="Рассудок" value={s.sanity} kind="sanity" />
            <Bar label={`Батарея ${s.flashlight ? "· ВКЛ" : "· ВЫКЛ"}`} value={s.battery} kind="battery" />
          </div>
          {/* timers */}
          <div className="absolute right-4 top-4 flex flex-col items-end gap-1 text-right">
            {s.nukeT !== null && <div className="hud-alert">ЗАРЯД: {Math.ceil(s.nukeT)} с</div>}
            {s.sealT !== null && <div className="hud-alert">ГЕРМЕТИЗАЦИЯ: {Math.ceil(s.sealT)} с</div>}
            {s.broadcastT !== null && <div className="hud-alert">ПЕРЕДАЧА: {Math.ceil(s.broadcastT)} с</div>}
            {s.blackout && <div className="hud-alert">ОБЕСТОЧЕНО</div>}
            <div className="text-xs text-hud-dim">
              Перфокарты {s.cards}/3 · Плёнки {s.tapes.length}/{TAPES.length}
            </div>
          </div>
          {/* crosshair + focus */}
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hud/70" />
          {s.focus && (
            <div className="absolute left-1/2 top-[56%] -translate-x-1/2 text-center">
              <div className={`hud-chip ${s.focus.ok ? "" : "hud-chip-warn"}`}>
                {!touch && <span className="hud-key">E</span>} {s.focus.label}
              </div>
            </div>
          )}
          {/* messages */}
          <div className="absolute bottom-28 left-1/2 flex w-[min(90vw,640px)] -translate-x-1/2 flex-col items-center gap-1 text-center text-sm">
            {s.messages.map((m, i) => (
              <div key={i + m} className="hud-msg">
                {m}
              </div>
            ))}
          </div>
          {/* hotbar */}
          <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
            {SLOTS.map((slot, i) => {
              const c = s.counts[i] ?? 0;
              return (
                <button
                  key={slot}
                  onClick={() => game.select(slot)}
                  title={ITEM_INFO[slot].name}
                  className={`hud-slot ${s.selected === slot ? "hud-slot-active" : ""} ${c ? "" : "opacity-35"}`}
                >
                  <span className="absolute left-1 top-0.5 z-10 text-[10px] text-hud-dim">{i + 1}</span>
                  <img src={ITEM_ART[slot]} alt={ITEM_INFO[slot].name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                  {slot !== "wrench" && <span className="absolute bottom-0.5 right-1 z-10 text-[10px]">{c}</span>}
                </button>
              );
            })}
          </div>
          <div className="absolute bottom-[4.6rem] left-1/2 -translate-x-1/2 text-xs text-hud-dim">
            {ITEM_INFO[s.selected].name}
          </div>
          {!touch && (
            <div className="absolute bottom-4 left-4 hidden text-[10px] leading-4 text-hud-dim lg:block">
              WASD — ходьба · Shift — бег · C — присесть
              <br />
              ЛКМ/Пробел — предмет · E/ПКМ — действие · F — фонарь
              <br />
              1–9 / колесо — выбор · Tab — инвентарь · Esc — пауза
            </div>
          )}
          <button
            onClick={() => setShowInv((v) => !v)}
            className="hud-btn pointer-events-auto absolute right-4 top-20 text-xs"
          >
            Инвентарь
          </button>
        </>
      )}

      {s.phase === "playing" && s.tutorial && <TutorialCard step={s.tutorial} index={s.tutorialIndex ?? 0} touch={touch} />}
      {showInv && s.phase !== "menu" && <Inventory s={s} onClose={() => setShowInv(false)} />}
      {touch && s.phase === "playing" && <TouchControls flashlight={s.flashlight} />}

      {s.phase === "reading" && s.readingTape !== null && (
        <TapeReader index={s.readingTape} onClose={() => { game.closeTape(); lock(); }} />
      )}
      {s.phase === "paused" && (
        <Screen title="Пауза">
          <button className="hud-btn-primary" onClick={resume}>Продолжить</button>
          <SettingsPanel onTouch={setTouch} />
          <button className="hud-btn" onClick={() => { game.phase = "menu"; }}>В главное меню</button>
        </Screen>
      )}
      {s.phase === "menu" && <MainMenu onTouch={setTouch} />}
      {s.phase === "dead" && (
        <Screen title={DEATHS[s.death ?? "monster"]?.title ?? "Смена окончена"} tone="danger">
          <p className="max-w-md text-center text-sm text-hud-dim">{DEATHS[s.death ?? "monster"]?.text}</p>
          <button className="hud-btn-primary" onClick={() => void startGame()}>Начать смену заново</button>
          <button className="hud-btn" onClick={() => { game.phase = "menu"; }}>В главное меню</button>
        </Screen>
      )}
      {s.phase === "ending" && s.ending && (
        <Screen title={ENDINGS[s.ending].title} subtitle={ENDINGS[s.ending].subtitle}>
          <p className="max-w-xl text-center leading-relaxed text-hud">{ENDINGS[s.ending].text}</p>
          <div className="flex max-w-xl flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-hud-dim">
            {ENDING_IDS.map((n) => (
              <span key={n} className={n === s.ending ? "text-primary" : ""}>{ENDINGS[n].title}</span>
            ))}
          </div>
          <button className="hud-btn-primary" onClick={() => void startGame()}>Новая смена</button>
          <button className="hud-btn" onClick={() => { game.phase = "menu"; }}>В главное меню</button>
        </Screen>
      )}
    </div>
  );
}

function Bar({ label, value, kind }: { label: string; value: number; kind: "health" | "sanity" | "battery" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] uppercase tracking-widest text-hud-dim">
        <span>{label}</span>
        <span>{Math.round(v)}</span>
      </div>
      <div className="hud-bar">
        <div className={`hud-bar-fill hud-bar-${kind} ${v < 25 ? "animate-pulse" : ""}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function Screen({ title, subtitle, tone, children }: { title: string; subtitle?: string; tone?: "danger"; children: ReactNode }) {
  return (
    <div className="hud-screen pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
      {subtitle && <div className="text-xs uppercase tracking-[0.3em] text-hud-dim">{subtitle}</div>}
      <h1 className={`hud-title ${tone === "danger" ? "text-destructive" : ""}`}>{title}</h1>
      {children}
    </div>
  );
}

function MainMenu({ onTouch }: { onTouch: (v: boolean) => void }) {
  const [tab, setTab] = useState<"main" | "settings" | "endings">("main");
  const [endings, setEndings] = useState<Ending[]>([]);
  const [firstTime, setFirstTime] = useState(false);
  useEffect(() => {
    setEndings(loadEndings());
    setFirstTime(!tutorialSeen());
  }, []);
  const begin = (tut: boolean) => {
    markTutorialSeen();
    void startGame(tut);
  };
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 menu-fade-in">
        <MenuScene low={settings.lowSpec} />
      </div>
      <div className="menu-shade absolute inset-0" />
      <div className="relative flex h-full flex-col justify-center gap-5 p-8 sm:p-14 md:w-[52%]">
        <div className="menu-rise text-xs uppercase tracking-[0.4em] text-hud-dim" style={{ animationDelay: "0.2s" }}>
          Коллектор «Б» · Смена №19
        </div>
        <h1 className="menu-rise menu-title hud-flicker" style={{ animationDelay: "0.4s" }}>
          Световой
          <br />
          Код
        </h1>
        <p className="menu-rise max-w-sm text-sm text-hud-dim" style={{ animationDelay: "0.6s" }}>
          Свет — единственное, что держит Надсмотрщика на расстоянии. Не смотрите в его экран.
        </p>
        {tab === "main" && (
          <div className="flex w-72 flex-col gap-2">
            {[
              { label: firstTime ? "Начать смену (с обучением)" : "Начать смену", primary: true, on: () => begin(firstTime) },
              { label: "Обучение", on: () => begin(true) },
              { label: `Концовки ${endings.length}/${ENDING_IDS.length}`, on: () => setTab("endings") },
              { label: "Настройки и управление", on: () => setTab("settings") },
            ].map((b, i) => (
              <button
                key={b.label}
                className={`menu-rise menu-item ${b.primary ? "hud-btn-primary" : "hud-btn"}`}
                style={{ animationDelay: `${0.8 + i * 0.1}s` }}
                onClick={b.on}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
        {tab === "settings" && (
          <div className="menu-rise flex w-72 flex-col gap-3">
            <SettingsPanel onTouch={onTouch} />
            <button className="hud-btn" onClick={() => setTab("main")}>Назад</button>
          </div>
        )}
        {tab === "endings" && (
          <div className="menu-rise flex w-80 flex-col gap-2">
            <div className="hud-panel flex flex-col gap-1.5 text-xs">
              {ENDING_IDS.map((n) => {
                const open = endings.includes(n);
                return (
                  <div key={n} className="flex justify-between gap-2 border-t border-border/40 pt-1.5 first:border-0 first:pt-0">
                    <span className={open ? "text-primary" : "text-hud-dim"}>{open ? ENDINGS[n].title : "???"}</span>
                    <span className="text-hud-dim">{ENDINGS[n].subtitle.split("·")[0]}</span>
                  </div>
                );
              })}
            </div>
            <button className="hud-btn" onClick={() => setTab("main")}>Назад</button>
          </div>
        )}
        <p className="menu-rise text-[10px] text-hud-dim" style={{ animationDelay: "1.3s" }}>
          Лучше в наушниках. Он смотрит.
        </p>
      </div>
    </div>
  );
}

const TUTORIAL_TEXT: Record<string, { desk: string; touch: string }> = {
  move: { desk: "Идите: W A S D", touch: "Двигайтесь левым джойстиком" },
  look: { desk: "Осмотритесь мышью по сторонам", touch: "Ведите пальцем по правой части экрана" },
  flashlight: { desk: "Включите фонарь: F. Он садит батарею — и выдаёт вас", touch: "Включите фонарь кнопкой" },
  crouch: { desk: "Пройдите пригнувшись: C — так тише", touch: "Пригнитесь и пройдите немного" },
  pickup: { desk: "Подойдите к предмету рядом и нажмите E", touch: "Подойдите к предмету и нажмите «Действие»" },
  use: { desk: "Используйте предмет: ЛКМ или Пробел (выбор — 1–9)", touch: "Нажмите «Предмет», чтобы использовать" },
};

function TutorialCard({ step, index, touch }: { step: string; index: number; touch: boolean }) {
  const t = TUTORIAL_TEXT[step];
  return (
    <div className="absolute left-1/2 top-20 w-[min(90vw,420px)] -translate-x-1/2">
      <div key={step} className="hud-panel tutorial-card text-center">
        <div className="mb-1 text-[10px] uppercase tracking-[0.3em] text-hud-dim">
          Обучение · {index + 1}/{Object.keys(TUTORIAL_TEXT).length}
        </div>
        <div className="text-sm text-primary">{touch ? t?.touch : t?.desk}</div>
        <div className="mt-2 h-1 bg-border/40">
          <div className="h-full bg-primary transition-all" style={{ width: `${(index / 6) * 100}%` }} />
        </div>
        <button className="hud-btn pointer-events-auto mt-2 px-2 py-0.5 text-[10px]" onClick={() => game.skipTutorial()}>
          Пропустить обучение{touch ? "" : " [Enter]"}
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({ onTouch }: { onTouch: (v: boolean) => void }) {
  const [, force] = useState(0);
  const set = (fn: () => void) => {
    fn();
    saveSettings();
    audio.setVolume(settings.volume);
    onTouch(isTouchMode());
    force((n) => n + 1);
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  };
  return (
    <div className="hud-panel flex w-72 flex-col gap-3 text-xs">
      <label className="flex flex-col gap-1">
        Чувствительность мыши: {settings.sensitivity.toFixed(1)}
        <input type="range" min={0.3} max={3} step={0.1} value={settings.sensitivity}
          onChange={(e) => set(() => (settings.sensitivity = Number(e.target.value)))} />
      </label>
      <label className="flex flex-col gap-1">
        Громкость: {Math.round(settings.volume * 100)}%
        <input type="range" min={0} max={1} step={0.05} value={settings.volume}
          onChange={(e) => set(() => (settings.volume = Number(e.target.value)))} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.invertY} onChange={(e) => set(() => (settings.invertY = e.target.checked))} />
        Инвертировать ось Y
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={settings.lowSpec} onChange={(e) => set(() => (settings.lowSpec = e.target.checked))} />
        <span>Оптимизация для слабых ПК<br /><span className="text-[10px] text-hud-dim">Без теней и эффектов, ниже разрешение — выше FPS.</span></span>
      </label>
      <div className="flex flex-col gap-1">
        Управление
        <div className="flex gap-1">
          {([["auto", "Авто"], ["desktop", "Клав+мышь"], ["touch", "Сенсор"]] as const).map(([k, l]) => (
            <button key={k} className={`hud-btn flex-1 px-1 ${settings.controls === k ? "hud-slot-active" : ""}`}
              onClick={() => set(() => (settings.controls = k))}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Inventory({ s, onClose }: { s: Snap; onClose: () => void }) {
  const rows: { kind: keyof typeof ITEM_INFO; name: string; hint: string; n: string }[] = [
    ...SLOTS.map((slot, i) => ({ kind: slot, name: ITEM_INFO[slot].name, hint: ITEM_INFO[slot].hint, n: slot === "wrench" ? (s.counts[i] ? "есть" : "—") : String(s.counts[i] ?? 0) })),
    { kind: "card" as const, name: ITEM_INFO.card.name, hint: ITEM_INFO.card.hint, n: `${s.cards}/3` },
    { kind: "tape" as const, name: ITEM_INFO.tape.name, hint: ITEM_INFO.tape.hint, n: `${s.tapes.length}/${TAPES.length}` },
    { kind: "nuke" as const, name: ITEM_INFO.nuke.name, hint: ITEM_INFO.nuke.hint, n: s.nuke ? "есть" : "—" },
    { kind: "battery" as const, name: ITEM_INFO.battery.name, hint: ITEM_INFO.battery.hint, n: `${Math.round(s.battery)}%` },
  ];
  return (
    <div className="hud-panel pointer-events-auto absolute right-4 top-32 max-h-[60vh] w-80 overflow-auto text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="uppercase tracking-widest">Инвентарь</span>
        <button className="hud-btn px-2 py-0.5" onClick={onClose}>✕</button>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="flex gap-2 border-t border-border/40 py-1.5">
          <div className="hud-slot shrink-0 overflow-hidden">
            {ITEM_ART[r.kind] ? <img src={ITEM_ART[r.kind]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="text-xl">☢</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between"><span>{r.name}</span><span className="text-primary">{r.n}</span></div>
            <div className="text-[10px] text-hud-dim">{r.hint}</div>
          </div>
        </div>
      ))}
      {s.tapes.length > 0 && (
        <div className="mt-2 border-t border-border/40 pt-2">
          <div className="mb-1 uppercase tracking-widest">Плёнки</div>
          {s.tapes.map((t) => (
            <button key={t} className="hud-btn mb-1 w-full text-left" onClick={() => { game.readingTape = t; game.phase = "reading"; document.exitPointerLock?.(); }}>
              ▶ {TAPES[t]?.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TapeReader({ index, onClose }: { index: number; onClose: () => void }) {
  const tape = TAPES[index];
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!tape) return null;
  const play = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (playing) {
      synth.cancel();
      setPlaying(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(tape.lines.join(" "));
    u.lang = "ru-RU";
    u.rate = 0.85;
    u.pitch = 0.6;
    u.volume = settings.volume;
    u.onend = () => setPlaying(false);
    synth.speak(u);
    setPlaying(true);
  };
  return (
    <div className="hud-screen pointer-events-auto absolute inset-0 flex items-center justify-center p-6">
      <div className="hud-panel w-[min(92vw,560px)]">
        <div className="mb-1 text-[10px] uppercase tracking-[0.3em] text-hud-dim">Аудиолог · кассета</div>
        <h2 className="mb-3 font-display text-2xl text-primary">{tape.title}</h2>
        <div className={`tape-reels mb-3 ${playing ? "tape-reels-on" : ""}`}><span /><span /></div>
        <div className="flex flex-col gap-2 text-sm leading-relaxed">
          {tape.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="hud-btn flex-1" onClick={play}>{playing ? "■ Стоп" : "▶ Прослушать"}</button>
          <button className="hud-btn-primary flex-1" onClick={onClose}>Закрыть [E]</button>
        </div>
      </div>
    </div>
  );
}

function TouchControls({ flashlight }: { flashlight: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const joyId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const joy = (e: React.PointerEvent) => {
    const r = base.current?.getBoundingClientRect();
    if (!r) return;
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R);
    let dy = e.clientY - (r.top + R);
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    input.joyX = dx / R;
    input.joyY = dy / R;
    input.touchRun = l > R * 0.95;
    setKnob({ x: dx, y: dy });
  };
  const joyEnd = () => {
    joyId.current = null;
    input.joyX = input.joyY = 0;
    input.touchRun = false;
    setKnob({ x: 0, y: 0 });
  };
  const btn = (label: string, fn: () => void, active = false) => (
    <button className={`touch-btn ${active ? "touch-btn-on" : ""}`} onPointerDown={(e) => { e.stopPropagation(); fn(); }}>{label}</button>
  );

  return (
    <div className="pointer-events-auto absolute inset-0 touch-none">
      {/* look pad: right 60% of the screen */}
      <div
        className="absolute bottom-0 right-0 top-0 w-3/5"
        onPointerDown={(e) => { lookId.current = e.pointerId; last.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (lookId.current !== e.pointerId) return;
          look(e.clientX - last.current.x, e.clientY - last.current.y, 0.005);
          last.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (lookId.current = null)}
        onPointerCancel={() => (lookId.current = null)}
      />
      {/* move joystick */}
      <div
        ref={base}
        className="touch-joy absolute bottom-24 left-6 h-32 w-32"
        onPointerDown={(e) => { joyId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); joy(e); }}
        onPointerMove={(e) => joyId.current === e.pointerId && joy(e)}
        onPointerUp={joyEnd}
        onPointerCancel={joyEnd}
      >
        <div className="touch-knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
      <div className="absolute bottom-24 right-4 grid grid-cols-2 gap-2">
        {btn("Действие", () => game.interact())}
        {btn("Предмет", () => game.useItem())}
        {btn("Фонарь", () => game.toggleFlashlight(), flashlight)}
        {btn("Присесть", () => (input.touchCrouch = !input.touchCrouch), input.touchCrouch)}
        {btn("◀", () => game.cycle(-1))}
        {btn("▶", () => game.cycle(1))}
      </div>
      <button className="touch-btn absolute left-1/2 top-4 -translate-x-1/2" onPointerDown={() => (game.phase = "paused")}>❚❚</button>
    </div>
  );
}
