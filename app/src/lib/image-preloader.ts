/**
 * Image Preloader — Preloads card images at battle start for faster rendering
 *
 * Uses <link rel="preload"> for priority images and Image() for bulk preloading.
 * Provides IntersectionObserver-based lazy loading hook for card grids.
 */

// ─── Card Back Placeholder ───
// Used when a card image is loading or face-down (e.g., deck, opponent hand)
export const CARD_BACK_GRADIENT = "linear-gradient(135deg, #1e3a5f 0%, #0f1b2d 25%, #1a2744 50%, #0d1926 75%, #1e3a5f 100%)";

export const CARD_BACK_SVG_DATA_URI = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="50%" stop-color="#0f1b2d"/>
      <stop offset="100%" stop-color="#1e3a5f"/>
    </linearGradient>
    <radialGradient id="orb" cx="50%" cy="50%" r="35%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#1e3a5f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="245" height="342" rx="12" fill="url(#bg)"/>
  <circle cx="122.5" cy="171" r="60" fill="url(#orb)"/>
  <circle cx="122.5" cy="171" r="30" fill="none" stroke="#3b82f680" stroke-width="2"/>
  <circle cx="122.5" cy="171" r="8" fill="#3b82f6" opacity="0.6"/>
</svg>
`)}`;

// ─── Preload Functions ───

/**
 * Preload a single image URL using the browser's native Image constructor.
 * Returns a promise that resolves when the image is loaded or rejects on error.
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!url || !url.startsWith("http")) {
      resolve();
      return;
    }
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload: ${url}`));
    img.src = url;
  });
}

/**
 * Preload multiple images concurrently with a concurrency limit.
 * Silently ignores failures to avoid blocking the game.
 */
export async function preloadImages(
  urls: string[],
  concurrency = 6
): Promise<{ loaded: number; failed: number }> {
  const uniqueUrls = [...new Set(urls.filter(u => u && u.startsWith("http")))];
  let loaded = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < uniqueUrls.length; i += concurrency) {
    const batch = uniqueUrls.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(preloadImage));
    for (const r of results) {
      if (r.status === "fulfilled") loaded++;
      else failed++;
    }
  }

  return { loaded, failed };
}

/**
 * Preload deck images at battle start.
 * Extracts all unique image URLs from the game state's visible cards
 * (hand, active, bench) and preloads them in priority order.
 */
export function preloadDeckImages(
  cardImageUrls: string[],
  onProgress?: (loaded: number, total: number) => void
): { cancel: () => void; promise: Promise<void> } {
  let cancelled = false;
  const uniqueUrls = [...new Set(cardImageUrls.filter(u => u && u.startsWith("http")))];
  const total = uniqueUrls.length;

  const promise = (async () => {
    let loaded = 0;
    const BATCH_SIZE = 4;

    for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
      if (cancelled) break;
      const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(preloadImage));
      loaded += results.filter(r => r.status === "fulfilled").length;
      onProgress?.(loaded, total);
    }
  })();

  return {
    cancel: () => { cancelled = true; },
    promise,
  };
}

/**
 * Add <link rel="preload"> tags to document head for critical images.
 * Best for the first few images that should load ASAP (active Pokemon, etc).
 */
export function addPreloadLinks(urls: string[]): () => void {
  if (typeof document === "undefined") return () => {};

  const links: HTMLLinkElement[] = [];
  const uniqueUrls = [...new Set(urls.filter(u => u && u.startsWith("http")))].slice(0, 8);

  for (const url of uniqueUrls) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    link.fetchPriority = "high";
    document.head.appendChild(link);
    links.push(link);
  }

  // Cleanup function to remove preload links
  return () => {
    for (const link of links) {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }
  };
}

// ─── IntersectionObserver Lazy Loading Hook ───

/**
 * Creates an IntersectionObserver that triggers loading when elements enter viewport.
 * Returns a ref callback to attach to elements that should be lazy-loaded.
 */
export function createLazyLoadObserver(
  onVisible: (element: Element) => void,
  options?: IntersectionObserverInit
): { observe: (el: Element) => void; disconnect: () => void } {
  if (typeof IntersectionObserver === "undefined") {
    // SSR fallback — immediately trigger
    return {
      observe: (el) => onVisible(el),
      disconnect: () => {},
    };
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        onVisible(entry.target);
        observer.unobserve(entry.target);
      }
    }
  }, {
    rootMargin: "200px", // Start loading 200px before entering viewport
    threshold: 0.01,
    ...options,
  });

  return {
    observe: (el) => observer.observe(el),
    disconnect: () => observer.disconnect(),
  };
}
