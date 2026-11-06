import type { ItemKind } from "./sim/map";
import wrench from "@/assets/items/wrench.jpg";
import stungun from "@/assets/items/stungun.jpg";
import redFlare from "@/assets/items/redFlare.jpg";
import whiteFlare from "@/assets/items/whiteFlare.jpg";
import cortexin from "@/assets/items/cortexin.jpg";
import bandage from "@/assets/items/bandage.jpg";
import shard from "@/assets/items/shard.jpg";
import card from "@/assets/items/card.jpg";
import tape from "@/assets/items/tape.jpg";
import battery from "@/assets/items/battery.jpg";
import pepper from "@/assets/items/pepper.jpg";
import pistol from "@/assets/items/pistol.jpg";
import ammo from "@/assets/items/ammo.jpg";

export const ITEM_ART: Partial<Record<ItemKind, string>> = {
  wrench, stungun, redFlare, whiteFlare, cortexin, bandage, shard, card, tape, battery, pepper, pistol, ammo,
};
