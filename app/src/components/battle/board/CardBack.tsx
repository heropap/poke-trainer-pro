/**
 * CardBack — Face-down card placeholder used for deck, opponent hand, etc.
 *
 * SVG-based design with animated subtle glow effect.
 */

import React from "react";

interface CardBackProps {
  width?: number;
  height?: number;
  className?: string;
  onClick?: () => void;
  animated?: boolean;
}

export function CardBack({
  width = 150,
  height = 210,
  className = "",
  onClick,
  animated = false,
}: CardBackProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg shadow-md ${onClick ? "cursor-pointer hover:scale-105 transition-transform" : ""} ${className}`}
      style={{ width, height }}
      onClick={onClick}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 150 210"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id="cardBackBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="25%" stopColor="#0f1b2d" />
            <stop offset="50%" stopColor="#1a2744" />
            <stop offset="75%" stopColor="#0d1926" />
            <stop offset="100%" stopColor="#1e3a5f" />
          </linearGradient>
          <radialGradient id="cardBackOrb" cx="50%" cy="50%" r="40%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1e3a5f" stopOpacity="0" />
          </radialGradient>
          <pattern id="cardBackPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1" fill="#3b82f6" opacity="0.1" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width="150" height="210" rx="8" fill="url(#cardBackBg)" />

        {/* Dot pattern */}
        <rect width="150" height="210" rx="8" fill="url(#cardBackPattern)" />

        {/* Border */}
        <rect
          x="6"
          y="6"
          width="138"
          height="198"
          rx="5"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1"
          opacity="0.2"
        />

        {/* Center orb */}
        <circle cx="75" cy="105" r="45" fill="url(#cardBackOrb)" />

        {/* Inner ring */}
        <circle
          cx="75"
          cy="105"
          r="24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.5"
          opacity="0.3"
        >
          {animated && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 75 105"
              to="360 75 105"
              dur="8s"
              repeatCount="indefinite"
            />
          )}
        </circle>

        {/* Center dot */}
        <circle cx="75" cy="105" r="6" fill="#3b82f6" opacity="0.5" />

        {/* Corner accents */}
        <circle cx="20" cy="20" r="3" fill="#3b82f6" opacity="0.15" />
        <circle cx="130" cy="20" r="3" fill="#3b82f6" opacity="0.15" />
        <circle cx="20" cy="190" r="3" fill="#3b82f6" opacity="0.15" />
        <circle cx="130" cy="190" r="3" fill="#3b82f6" opacity="0.15" />
      </svg>
    </div>
  );
}
