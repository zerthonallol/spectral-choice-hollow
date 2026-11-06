import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "@/game/GameCanvas";
import { Hud } from "@/game/Hud";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Световой Код — 3D-хоррор в коллекторе" },
      { name: "description", content: "Выживите в тёмных туннелях коллектора: свет, фонарь и рассудок против Надсмотрщика. Четыре концовки." },
      { property: "og:title", content: "Световой Код — 3D-хоррор" },
      { property: "og:description", content: "Свет — единственное, что держит Надсмотрщика на расстоянии. Браузерный хоррор от первого лица." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div data-game-root className="fixed inset-0 overflow-hidden bg-background">
      <GameCanvas />
      <Hud />
    </div>
  );
}
