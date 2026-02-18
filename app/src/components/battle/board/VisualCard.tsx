
import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { GameCard } from "@/engine/game-state";
import { CANT_ATTACK_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN, ABILITY_BLOCKED, VSTAR_USED } from "@/engine/effects/markers";
import { useAnimation } from "./AnimationProvider";

/** Hostnames configured in next.config.ts remotePatterns — must match exactly */
const OPTIMIZED_IMAGE_HOSTS = new Set([
  "images.pokemontcg.io",
  "images.scrydex.com",
]);

/** Check if a URL's hostname is configured for next/image optimization.
 *  Must be a remote URL that startsWith("http") and have a known hostname. */
function isOptimizableUrl(src: string): boolean {
  if (!src.startsWith("http")) return false;
  try {
    return OPTIMIZED_IMAGE_HOSTS.has(new URL(src).hostname);
  } catch (_e) {
    return false;
  }
}

/** Map energy type name to a color */
const ENERGY_COLORS: Record<string, string> = {
  Grass: "bg-green-500",
  Fire: "bg-red-500",
  Water: "bg-blue-500",
  Lightning: "bg-yellow-400",
  Psychic: "bg-purple-500",
  Fighting: "bg-orange-700",
  Darkness: "bg-gray-800",
  Metal: "bg-gray-400",
  Dragon: "bg-amber-600",
  Fairy: "bg-pink-400",
  Colorless: "bg-zinc-400",
};

/** Map energy type to a short label */
const ENERGY_LABELS: Record<string, string> = {
  Grass: "G",
  Fire: "R",
  Water: "W",
  Lightning: "L",
  Psychic: "P",
  Fighting: "F",
  Darkness: "D",
  Metal: "M",
  Dragon: "N",
  Fairy: "Y",
  Colorless: "C",
};

/** Map energy type to a text color for contrast */
const ENERGY_TEXT_COLORS: Record<string, string> = {
  Grass: "text-white",
  Fire: "text-white",
  Water: "text-white",
  Lightning: "text-black",
  Psychic: "text-white",
  Fighting: "text-white",
  Darkness: "text-white",
  Metal: "text-black",
  Dragon: "text-white",
  Fairy: "text-white",
  Colorless: "text-black",
};

function getEnergyTypeFromCard(energyCard: GameCard): string {
  if (energyCard.card.subtypes?.includes("Basic") && energyCard.card.types && energyCard.card.types.length > 0) {
    return energyCard.card.types[0];
  }
  const name = energyCard.card.name || "";
  const types = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Fairy"];
  for (const t of types) {
    if (name.includes(t)) return t;
  }
  return "Colorless";
}

/** Map marker name to display style */
function getMarkerStyle(name: string): { bg: string; text: string; label: string } {
  if (name === CANT_ATTACK_NEXT_TURN) {
    return { bg: "bg-red-600", text: "text-white", label: "封" };
  }
  if (name.startsWith("CANT_USE_ATTACK:")) {
    return { bg: "bg-red-500", text: "text-white", label: "限" };
  }
  if (name === PREVENT_RETREAT_NEXT_TURN) {
    return { bg: "bg-red-700", text: "text-white", label: "锁" };
  }
  if (name === ABILITY_BLOCKED) {
    return { bg: "bg-blue-600", text: "text-white", label: "禁" };
  }
  if (name === VSTAR_USED) {
    return { bg: "bg-yellow-500", text: "text-black", label: "V★" };
  }
  // Default: yellow for unknown markers
  return { bg: "bg-yellow-600", text: "text-white", label: "●" };
}

interface VisualCardProps {
  card: GameCard;
  scale?: number; // Default 1.0
  isHoverable?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
  showHp?: boolean;
  showEnergy?: boolean;
}

export function VisualCard({
  card,
  scale = 1.0,
  isHoverable = true,
  onClick,
  onContextMenu,
  className = "",
  showHp = false,
  showEnergy = false,
}: VisualCardProps) {
  // Standard card ratio is 2.5 : 3.5 (e.g. 250px : 350px)
  // We'll use a base width of 150px for calculation
  const width = 150 * scale;
  const height = 210 * scale;

  const hp = card.card.hp ? parseInt(card.card.hp, 10) : 0;
  const currentHp = hp > 0 ? hp - card.damageCounters * 10 : 0;
  const hpPercentage = hp > 0 ? (currentHp / hp) * 100 : 0;

  // Damage Animation Logic
  const [damageDelta, setDamageDelta] = React.useState<number | null>(null);
  const [isShaking, setIsShaking] = React.useState(false);
  const prevDamageRef = React.useRef(card.damageCounters);

  React.useEffect(() => {
    if (card.damageCounters > prevDamageRef.current) {
      const delta = (card.damageCounters - prevDamageRef.current) * 10;
      setDamageDelta(delta);
      setIsShaking(true);
      const timer = setTimeout(() => {
        setDamageDelta(null);
        setIsShaking(false);
      }, 1000);
      prevDamageRef.current = card.damageCounters;
      return () => clearTimeout(timer);
    }
    prevDamageRef.current = card.damageCounters;
  }, [card.damageCounters]);

  // Group attached energy by type for display
  const energySummary: { type: string; count: number }[] = [];
  if (showEnergy && card.attachedEnergy.length > 0) {
    const counts: Record<string, number> = {};
    for (const e of card.attachedEnergy) {
      const type = getEnergyTypeFromCard(e);
      counts[type] = (counts[type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(counts)) {
      energySummary.push({ type, count });
    }
  }

  return (
    <motion.div
      className={`relative select-none ${className} ${
        isHoverable
          ? "cursor-pointer transition-transform hover:z-10 hover:scale-110"
          : ""
      }`}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      animate={
        isShaking
          ? { x: [0, -5, 5, -3, 3, 0] }
          : { x: 0 }
      }
      transition={isShaking ? { duration: 0.4, ease: "easeInOut" } : {}}
    >
      {/* Card Image */}
      <div className={`h-full w-full overflow-hidden rounded-lg shadow-md ${
        card.card.rarity === "Proxy"
          ? "bg-gradient-to-br from-amber-900 via-zinc-800 to-amber-900"
          : "bg-zinc-800"
      }`}>
        {card.card.images?.small ? (
          isOptimizableUrl(card.card.images.small) ? (
            <Image
              src={card.card.images.small}
              alt={card.card.name}
              width={Math.round(width)}
              height={Math.round(height)}
              className="h-full w-full object-cover"
              loading="lazy"
              sizes={`${Math.round(width)}px`}
              placeholder="empty"
            />
          ) : (
            <img
              src={card.card.images.small}
              alt={card.card.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )
        ) : (
          <div className={`flex h-full w-full flex-col items-center justify-center p-2 text-center text-xs text-white ${
            card.card.rarity === "Proxy"
              ? "bg-gradient-to-br from-amber-900/80 via-zinc-800/80 to-amber-900/80"
              : "bg-indigo-900"
          }`}>
            <span className="font-semibold">{card.card.name}</span>
            {card.card.rarity === "Proxy" && card.card.hp && (
              <span className="mt-1 text-[9px] text-amber-300">HP {card.card.hp}</span>
            )}
          </div>
        )}
      </div>

      {/* Proxy Card Indicator */}
      {card.card.rarity === "Proxy" && (
        <div className="absolute left-1/2 top-0.5 -translate-x-1/2 rounded bg-amber-500 px-1.5 py-0.5 text-[7px] font-bold text-black shadow-md">
          PROXY
        </div>
      )}

      {/* Energy Indicators (Bottom Stack Style) */}
      {showEnergy && card.attachedEnergy.length > 0 && (
        <div className="absolute -bottom-3 left-0 z-20 flex w-full justify-center -space-x-1 px-1">
          {card.attachedEnergy.map((energy, index) => {
            const type = getEnergyTypeFromCard(energy);
            const isNew = index === card.attachedEnergy.length - 1;
            return (
              <div
                key={energy.instanceId}
                className={`relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-lg transition-all duration-500 ${
                  ENERGY_COLORS[type] || "bg-zinc-500"
                } ${isNew ? "animate-[bounce_0.5s_ease-out]" : ""}`}
                style={{
                  zIndex: index,
                  transform: `translateY(${index % 2 === 0 ? "0px" : "-2px"})`,
                }}
                title={energy.card.name}
              >
                <span className={`text-[10px] font-bold ${ENERGY_TEXT_COLORS[type] || "text-white"}`}>
                  {ENERGY_LABELS[type] || "?"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Status Conditions (right side) */}
      {card.statusConditions.length > 0 && (
        <div className="absolute right-0.5 top-7 flex flex-col gap-0.5">
          {card.statusConditions.map((status) => (
            <div
              key={status}
              className={`rounded-full px-1 py-0.5 text-[7px] font-bold shadow-md ${
                status === "poisoned" ? "bg-purple-600 text-white" :
                status === "burned" ? "bg-orange-600 text-white" :
                status === "asleep" ? "bg-blue-600 text-white" :
                status === "paralyzed" ? "bg-yellow-500 text-black" :
                status === "confused" ? "bg-pink-500 text-white" :
                "bg-zinc-600 text-white"
              }`}
            >
              {status === "poisoned" ? "毒" :
               status === "burned" ? "烧" :
               status === "asleep" ? "眠" :
               status === "paralyzed" ? "痹" :
               status === "confused" ? "混" : status}
            </div>
          ))}
        </div>
      )}

      {/* Marker Badges (left side) */}
      {card.markers && Object.keys(card.markers).length > 0 && (
        <div className="absolute left-0.5 top-7 flex flex-col gap-0.5">
          {Object.entries(card.markers).map(([name, value]) => {
            if (value <= 0) return null;
            const { bg, text, label } = getMarkerStyle(name);
            return (
              <div
                key={name}
                className={`rounded-full px-1 py-0.5 text-[7px] font-bold shadow-md ${bg} ${text}`}
                title={name}
              >
                {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Attached Tools indicator */}
      {card.attachedTools.length > 0 && (
        <div className="absolute right-0.5 top-0.5 rounded bg-cyan-600 px-1 py-0.5 text-[7px] font-bold text-white shadow-md">
          {card.attachedTools[0].card.name.slice(0, 6)}
        </div>
      )}

      {/* HP Bar (Overlay) — spring animated */}
      {showHp && hp > 0 && (
        <div className="absolute bottom-1 left-1/2 w-10/12 -translate-x-1/2 transform rounded-full bg-zinc-900/80 px-1 py-0.5 shadow-sm backdrop-blur-sm">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
            <motion.div
              className={`h-full rounded-full ${
                hpPercentage > 50
                  ? "bg-green-500"
                  : hpPercentage > 20
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              animate={{ width: `${Math.max(hpPercentage, 0)}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
            />
          </div>
          <div className="mt-0.5 text-center text-[9px] font-bold leading-none text-white">
            {currentHp}/{hp}
          </div>
        </div>
      )}

      {/* Damage Counters (if any) */}
      {card.damageCounters > 0 && !showHp && (
        <div className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md">
          {card.damageCounters * 10}
        </div>
      )}

      {/* Floating Damage Text — framer-motion */}
      <AnimatePresence>
        {damageDelta !== null && (
          <motion.div
            key={`dmg-${damageDelta}-${Date.now()}`}
            className="absolute left-1/2 top-1/2 z-50 pointer-events-none"
            initial={{ x: "-50%", y: "-50%", opacity: 1, scale: 1.2 }}
            animate={{ x: "-50%", y: "-120%", opacity: 0, scale: 0.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="text-4xl font-black text-red-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ WebkitTextStroke: "1px white" }}>
              -{damageDelta}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
