/**
 * Tests for Card Image Optimization (Feature 24)
 *
 * Tests:
 * 1. next.config.ts has image configuration
 * 2. image-preloader utility functions
 * 3. CardBack component exports
 * 4. BattlePageClient imports preloader
 * 5. VisualCard imports next/image
 * 6. CardImage imports next/image
 * 7. CardDetailModal imports next/image
 */

import * as fs from "fs";
import * as path from "path";
import {
  preloadImages,
  preloadDeckImages,
  addPreloadLinks,
  createLazyLoadObserver,
  CARD_BACK_SVG_DATA_URI,
  CARD_BACK_GRADIENT,
} from "@/lib/image-preloader";

// ─── 1. next.config.ts has image configuration ───

describe("next.config.ts image configuration", () => {
  test("has remotePatterns for pokemontcg.io", () => {
    const configPath = path.join(__dirname, "../../next.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("images.pokemontcg.io");
    expect(content).toContain("remotePatterns");
  });

  test("has image formats configured", () => {
    const configPath = path.join(__dirname, "../../next.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("image/avif");
    expect(content).toContain("image/webp");
  });

  test("has imageSizes for card dimensions", () => {
    const configPath = path.join(__dirname, "../../next.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("imageSizes");
    expect(content).toContain("150");
    expect(content).toContain("245");
  });
});

// ─── 2. image-preloader utility functions ───

describe("image-preloader", () => {
  test("CARD_BACK_SVG_DATA_URI is a valid data URI", () => {
    expect(CARD_BACK_SVG_DATA_URI).toMatch(/^data:image\/svg\+xml,/);
    expect(CARD_BACK_SVG_DATA_URI.length).toBeGreaterThan(100);
  });

  test("CARD_BACK_GRADIENT is a CSS gradient string", () => {
    expect(CARD_BACK_GRADIENT).toContain("linear-gradient");
    expect(CARD_BACK_GRADIENT).toContain("#");
  });

  test("preloadImages handles empty array", async () => {
    const result = await preloadImages([]);
    expect(result.loaded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test("preloadImages filters non-http URLs", async () => {
    const result = await preloadImages(["", "not-a-url", "ftp://invalid"]);
    expect(result.loaded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test("preloadDeckImages returns cancel function", () => {
    const { cancel, promise } = preloadDeckImages([]);
    expect(typeof cancel).toBe("function");
    expect(promise).toBeInstanceOf(Promise);
  });

  test("preloadDeckImages handles empty URLs", async () => {
    const progressCalls: [number, number][] = [];
    const { promise } = preloadDeckImages(
      [],
      (loaded, total) => progressCalls.push([loaded, total])
    );
    await promise;
    // No URLs to preload, no progress calls
    expect(progressCalls.length).toBe(0);
  });

  test("preloadDeckImages filters non-http URLs", async () => {
    const { promise } = preloadDeckImages(["not-a-url", "", "local/path.png"]);
    await promise;
    // Should complete without error
  });

  test("addPreloadLinks returns cleanup function", () => {
    const cleanup = addPreloadLinks([]);
    expect(typeof cleanup).toBe("function");
    cleanup(); // Should not throw
  });

  test("createLazyLoadObserver returns observe and disconnect", () => {
    const observer = createLazyLoadObserver(() => {});
    expect(typeof observer.observe).toBe("function");
    expect(typeof observer.disconnect).toBe("function");
    observer.disconnect();
  });
});

// ─── 3. CardBack component file exists ───

describe("CardBack component", () => {
  test("CardBack.tsx exists with proper exports", () => {
    const filePath = path.join(__dirname, "../components/battle/board/CardBack.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function CardBack");
    expect(content).toContain("svg");
    expect(content).toContain("width");
    expect(content).toContain("height");
  });

  test("CardBack has animated prop support", () => {
    const filePath = path.join(__dirname, "../components/battle/board/CardBack.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("animated");
    expect(content).toContain("animateTransform");
  });
});

// ─── 4. BattlePageClient imports preloader ───

describe("BattlePageClient image preloading", () => {
  test("imports preloadDeckImages and addPreloadLinks", () => {
    const filePath = path.join(__dirname, "../app/battle/BattlePageClient.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("preloadDeckImages");
    expect(content).toContain("addPreloadLinks");
    expect(content).toContain("image-preloader");
  });

  test("preloads active Pokemon images with high priority", () => {
    const filePath = path.join(__dirname, "../app/battle/BattlePageClient.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("criticalUrls");
    expect(content).toContain("addPreloadLinks(criticalUrls)");
  });
});

// ─── 5. VisualCard uses next/image ───

describe("VisualCard next/image integration", () => {
  test("imports next/image", () => {
    const filePath = path.join(__dirname, "../components/battle/board/VisualCard.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('import Image from "next/image"');
  });

  test("uses Image component for remote URLs", () => {
    const filePath = path.join(__dirname, "../components/battle/board/VisualCard.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("<Image");
    expect(content).toContain('startsWith("http")');
  });

  test("falls back to img for non-remote URLs", () => {
    const filePath = path.join(__dirname, "../components/battle/board/VisualCard.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("<img");
  });

  test("uses sizes prop for responsive images", () => {
    const filePath = path.join(__dirname, "../components/battle/board/VisualCard.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("sizes=");
  });
});

// ─── 6. CardImage uses next/image ───

describe("CardImage next/image integration", () => {
  test("imports next/image", () => {
    const filePath = path.join(__dirname, "../components/card/CardImage.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('import Image from "next/image"');
  });

  test("has optimized prop (opt-in for backward compat)", () => {
    const filePath = path.join(__dirname, "../components/card/CardImage.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("optimized");
    expect(content).toContain("<Image");
    expect(content).toContain("sizes=");
  });
});

// ─── 7. CardDetailModal uses next/image ───

describe("CardDetailModal next/image integration", () => {
  test("imports next/image", () => {
    const filePath = path.join(__dirname, "../components/battle/board/CardDetailModal.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('import Image from "next/image"');
  });

  test("uses priority loading for detail modal", () => {
    const filePath = path.join(__dirname, "../components/battle/board/CardDetailModal.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("priority");
    expect(content).toContain("<Image");
  });
});
