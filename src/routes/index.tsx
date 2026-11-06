import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { game } from "@/game/sim/game";
import { GameCanvas } from "@/game/GameCanvas";
import { Hud } from "@/game/Hud";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Световой Код — 3D-хоррор в коллекторе" },
      { name: "description", content: "Выживите в тёмных туннелях коллектора: свет, фонарь и рассудок против Надсмотрщика. Семь концовок." },
      { property: "og:title", content: "Световой Код — 3D-хоррор" },
      { property: "og:description", content: "Свет — единственное, что держит Надсмотрщика на расстоянии. Браузерный хоррор от первого лица." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  // Pause the tunnel renderer while the menu (with its own scene) is open.
  const [inMenu, setInMenu] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => setInMenu(game.phase === "menu"), 200);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div data-game-root className="fixed inset-0 overflow-hidden bg-background">
      <GameCanvas active={!inMenu} />
      <Hud />
    </div>
  );
}
