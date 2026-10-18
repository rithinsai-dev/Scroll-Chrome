/**
 * YouTube Split Scroll â€“ Content Script
 * ======================================
 *
 * Responsibilities:
 *  1. Toggle the `yt-split-scroll` class on <html> based on user preference.
 *  2. Re-apply settings after YouTube's SPA navigation (yt-navigate-finish).
 *  3. Fix infinite scroll in the #secondary column: YouTube's built-in
 *     IntersectionObserver watches the viewport, but our CSS makes #secondary
 *     a separate scroll container.  We observe the continuation-item inside
 *     #secondary and scroll it into the viewport to trigger loading.
 *  4. Listen for live setting changes from the popup via storage.onChanged.
 *
 * â”€â”€â”€ YOUTUBE SELECTORS (update if YouTube changes its DOM) â”€â”€â”€â”€â”€â”€â”€â”€
 *  #secondary                       â€“ right sidebar column
 *  ytd-continuation-item-renderer   â€“ "load more" sentinel in the sidebar
 *  ytd-watch-flexy                  â€“ main watch page component
 *  #player-container-outer          â€“ video player outer wrapper
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

(function () {
  "use strict";

  /* â”€â”€ Default settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const DEFAULTS = {
    enabled: true,
    stickyPlayer: false,
    hideScrollbars: true,
  };

  /* â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  let currentSettings = { ...DEFAULTS };
  let continuationObserver = null; // IntersectionObserver for infinite scroll
  let mutationObs = null;          // MutationObserver to find continuation items

  /* â”€â”€ Apply classes to <html> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function applyClasses() {
    const root = document.documentElement;
    root.classList.toggle("yt-split-scroll", currentSettings.enabled);
    root.classList.toggle(
      "yt-split-scroll-sticky-player",
      currentSettings.enabled && currentSettings.stickyPlayer
    );
    root.classList.toggle(
      "yt-split-scroll-hide-scrollbars",
      currentSettings.enabled && currentSettings.hideScrollbars
    );
  }

  /* â”€â”€ Infinite-scroll fix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  /**
   * YouTube lazy-loads more suggestions when `ytd-continuation-item-renderer`
   * enters the viewport.  Since we turned #secondary into its own scroll
   * container, the element never enters the *document* viewport.
   *
   * Fix: use an IntersectionObserver rooted at #secondary.  When the sentinel
   * becomes visible inside that container we scroll it into the document
   * viewport momentarily (via scrollIntoView with { block: 'nearest' } on
   * a zero-height wrapper) which lets YouTube's own observer fire.
   *
   * As a fallback, we also directly click any <button> inside it, which
   * YouTube sometimes renders as a manual "Show more" trigger.
   */
  function triggerLoad(entry) {
    if (!entry.isIntersecting) return;

    const el = entry.target;

    // Strategy 1: Click any button YouTube placed inside the renderer
    const btn = el.querySelector("button, tp-yt-paper-button, yt-button-renderer button");
    if (btn) {
      btn.click();
      return;
    }

    // Strategy 2: Briefly make the element visible to YouTube's own
    // viewport-based observer by dispatching a scroll event on the
    // window.  This nudges YouTube's internal IntersectionObserver.
    window.dispatchEvent(new Event("scroll"));
  }

  function setupContinuationObserver() {
    // Disconnect any previous observer
    if (continuationObserver) {
      continuationObserver.disconnect();
      continuationObserver = null;
    }

    if (!currentSettings.enabled) return;

    const secondary = document.querySelector(
      "ytd-watch-flexy:not([theater]):not([fullscreen]) #secondary"
    );
    if (!secondary) return;

    // Observe inside #secondary (our custom scroll container)
    continuationObserver = new IntersectionObserver(
      (entries) => entries.forEach(triggerLoad),
      {
        root: secondary,
        rootMargin: "0px 0px 400px 0px", // trigger 400px before the bottom
        threshold: 0,
      }
    );

    // Observe all current continuation items
    const sentinels = secondary.querySelectorAll(
      "ytd-continuation-item-renderer"
    );
    sentinels.forEach((el) => continuationObserver.observe(el));
  }

  /**
   * MutationObserver: watch #secondary for dynamically-added
   * continuation-item-renderer elements (they are replaced after each batch).
   */
  function setupMutationWatcher() {
    if (mutationObs) {
      mutationObs.disconnect();
      mutationObs = null;
    }

    if (!currentSettings.enabled) return;

    const secondary = document.querySelector("#secondary");
    if (!secondary) return;

    mutationObs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          // Check if the added node IS a continuation-item, or contains one
          const items =
            node.matches && node.matches("ytd-continuation-item-renderer")
              ? [node]
              : node.querySelectorAll
                ? Array.from(
                    node.querySelectorAll("ytd-continuation-item-renderer")
                  )
                : [];

          items.forEach((el) => {
            if (continuationObserver) continuationObserver.observe(el);
          });
        }
      }
    });

    mutationObs.observe(secondary, { childList: true, subtree: true });
  }

  /* â”€â”€ Initialization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function init() {
    applyClasses();
    // Small delay so YouTube finishes rendering the watch page DOM
    setTimeout(() => {
      setupContinuationObserver();
      setupMutationWatcher();
    }, 800);
  }

  /* â”€â”€ Load settings and start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  chrome.storage.local
    .get(DEFAULTS)
    .then((result) => {
      currentSettings = { ...DEFAULTS, ...result };
      init();
    })
    .catch(() => {
      // If storage fails (e.g. in private browsing), use defaults
      init();
    });

  /* â”€â”€ React to YouTube SPA navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // YouTube fires this custom event after every client-side navigation.
  document.addEventListener("yt-navigate-finish", () => {
    init();
  });

  /* â”€â”€ React to setting changes from the popup (live update) â”€â”€â”€â”€â”€ */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.enabled !== undefined) {
      currentSettings.enabled =
        changes.enabled.newValue ?? DEFAULTS.enabled;
    }
    if (changes.stickyPlayer !== undefined) {
      currentSettings.stickyPlayer =
        changes.stickyPlayer.newValue ?? DEFAULTS.stickyPlayer;
    }
    if (changes.hideScrollbars !== undefined) {
      currentSettings.hideScrollbars =
        changes.hideScrollbars.newValue ?? DEFAULTS.hideScrollbars;
    }

    init();
  });
})();

