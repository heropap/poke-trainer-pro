"use client";

import { useState } from "react";
import { Card } from "@/types/card";

interface CardImageProps {
  card: Card;
  size?: "small" | "large";
  className?: string;
  onClick?: (card: Card) => void;
}

export default function CardImage({
  card,
  size = "small",
  className = "",
  onClick,
}: CardImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const src = size === "small" ? card.images.small : card.images.large;
  const width = size === "small" ? 245 : 734;
  const height = size === "small" ? 342 : 1024;

  return (
    <div
      className={`relative inline-block overflow-hidden rounded-lg ${
        onClick ? "cursor-pointer transition-transform hover:scale-105" : ""
      } ${className}`}
      onClick={() => onClick?.(card)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(card);
        }
      }}
      data-testid={`card-image-${card.id}`}
    >
      {isLoading && !hasError && (
        <div
          className="absolute inset-0 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
          style={{ width, height }}
        />
      )}
      {hasError ? (
        <div
          className="flex items-center justify-center rounded-lg bg-zinc-100 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
          style={{ width, height }}
        >
          <div>
            <div className="text-2xl">🃏</div>
            <div className="mt-1 px-2">{card.name}</div>
          </div>
        </div>
      ) : (
        <img
          src={src}
          alt={card.name}
          width={width}
          height={height}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`rounded-lg ${isLoading ? "opacity-0" : "opacity-100"} transition-opacity duration-200`}
        />
      )}
    </div>
  );
}
