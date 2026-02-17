
import React from "react";
import { GameCard } from "@/engine/game-state";
import { createPortal } from "react-dom";

interface CardDetailModalProps {
  card: GameCard;
  onClose: () => void;
}

export function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  // Prevent scrolling when modal is open
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="relative flex max-h-[90vh] max-w-[90vw] flex-col gap-4 rounded-xl bg-zinc-900 p-6 shadow-2xl border border-zinc-700 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white"
        >
          ✕
        </button>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Large Card Image */}
          <div className="flex-shrink-0">
             {card.card.images?.large ? (
              <img
                src={card.card.images.large}
                alt={card.card.name}
                className="max-h-[70vh] w-auto rounded-xl shadow-2xl"
              />
            ) : (
              <div className="flex h-[400px] w-[300px] items-center justify-center rounded-xl bg-indigo-900 text-white">
                No Image Available
              </div>
            )}
          </div>

          {/* Card Details */}
          <div className="flex flex-col gap-4 text-zinc-100 max-w-md overflow-y-auto max-h-[70vh]">
            <div>
              <h2 className="text-2xl font-bold text-white">{card.card.name}</h2>
              <div className="flex gap-2 text-sm text-zinc-400">
                <span>{card.card.supertype}</span>
                {card.card.subtypes?.map(s => <span key={s}>• {s}</span>)}
              </div>
            </div>

            {/* HP & Types */}
            {card.card.hp && (
              <div className="flex items-center gap-4">
                <div className="text-xl font-bold text-red-400">HP {card.card.hp}</div>
                <div className="flex gap-1">
                  {card.card.types?.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded bg-zinc-800 text-xs border border-zinc-700">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Attacks */}
            {card.card.attacks && (
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-zinc-300 border-b border-zinc-700 pb-1">Attacks</h3>
                {card.card.attacks.map((attack, i) => (
                  <div key={i} className="bg-zinc-800/50 p-3 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-lg">{attack.name}</span>
                      <span className="font-bold text-yellow-400 text-lg">{attack.damage}</span>
                    </div>
                    <div className="flex gap-1 mb-2">
                      {attack.cost?.map((c, j) => (
                         <span key={j} className="text-xs text-zinc-500 bg-zinc-900 px-1.5 rounded">{c}</span>
                      ))}
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{attack.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Abilities */}
            {card.card.abilities && (
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-zinc-300 border-b border-zinc-700 pb-1">Abilities</h3>
                {card.card.abilities.map((ability, i) => (
                  <div key={i} className="bg-red-900/20 border border-red-900/30 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-400 font-bold text-xs uppercase">{ability.type}</span>
                      <span className="font-bold text-lg text-red-100">{ability.name}</span>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{ability.text}</p>
                  </div>
                ))}
              </div>
            )}
            
            {/* Rules / Effects (for Trainers) */}
            {card.card.rules && (
               <div className="bg-blue-900/20 border border-blue-900/30 p-3 rounded-lg text-sm text-blue-100">
                 {card.card.rules.map((rule, i) => <p key={i} className="mb-1">{rule}</p>)}
               </div>
            )}

            <div className="mt-auto pt-4 text-xs text-zinc-500 border-t border-zinc-800">
               ID: {card.card.id} | Artist: {card.card.artist} | Rarity: {card.card.rarity}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
