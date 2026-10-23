/**
 * TubeDeck – Content Script
 * =========================
 * Lightweight & optimized for low-spec systems:
 *  - Native browser autoPictureInPicture & MediaSession integration (no gesture drop errors)
 *  - Global Picture-in-Picture dismissals via background service worker and Ctrl+Shift+8
 *  - Dual-layer in-page shortcuts (Ctrl+Shift+8, Alt+Shift+X, Alt+X)
 *  - Debounced auto-exit on tab/window restoration ensuring zero DComp visual drops
 *  - Throttled sentinel & rAF debounced mutation observers (near-zero CPU footprint)
 *  - Safe runtime messaging protecting against extension context invalidation & lastError leaks
 *  - Automatic observer disconnection when navigating away from watch pages
 */

(function () {
  "use strict";

  const DEFAULT_PIP_SHORTCUT = {
    key: "8",
    code: "Digit8",
    altKey: false,
    ctrlKey: true,
    shiftKey: true,
    metaKey: false,
    display: "Ctrl+Shift+8",
  };

  const DEFAULTS = {
    enabled: true,
    stickyPlayer: false,
    hideScrollbars: true,
    hideShorts: true,
    autoPip: false,
    fullAmbient: false,
    pipShortcut: DEFAULT_PIP_SHORTCUT,
  };

  let currentSettings = { ...DEFAULTS };
  let continuationObserver = null;
  let mutationObs = null;
  let mutationThrottleTimer = null;
  let returnDebounceTimer = null;
  let lastSentinelTriggerTime = 0;
  let lastShortcutHandledTime = 0;
  let currentObservedVideo = null;

  /* ── Safe Messaging (Consumes lastError to prevent uncaught logs) ─── */

  function safeSendMessage(msg) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(msg, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    } catch (_) {}
  }

  function isWatchPage() {
    return window.location.pathname.startsWith("/watch");
  }

  /* ── State Synchronization for MAIN World Script ─────────────────── */

  function syncAutoPipState() {
    try {
      const active = currentSettings.enabled && currentSettings.autoPip;
      document.documentElement.setAttribute(
        "data-yt-split-scroll-auto-pip",
        active ? "true" : "false"
      );
    } catch (_) {}
  }

  function syncAmbientState() {
    try {
      const active = currentSettings.enabled && currentSettings.fullAmbient;
      document.documentElement.setAttribute(
        "data-yt-split-scroll-full-ambient",
        active ? "true" : "false"
      );
    } catch (_) {}
  }

  /* ── CSS Class Toggling ───────────────────────────────────────────── */

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
    root.classList.toggle(
      "yt-split-scroll-hide-shorts",
      currentSettings.enabled && currentSettings.hideShorts
    );
    root.classList.toggle(
      "yt-split-scroll-auto-pip",
      currentSettings.enabled && currentSettings.autoPip
    );
    root.classList.toggle(
      "yt-split-scroll-full-ambient",
      currentSettings.enabled && currentSettings.fullAmbient
    );

    syncAutoPipState();
    syncAmbientState();
  }

  /* ── Infinite Scroll Sentinel Watcher (Throttled for low-spec CPUs) ─ */

  function triggerLoad(entry) {
    if (!entry.isIntersecting) return;

    const now = Date.now();
    if (now - lastSentinelTriggerTime < 350) return; // Max 1 trigger per 350ms
    lastSentinelTriggerTime = now;

    const el = entry.target;
    const btn = el.querySelector("button, tp-yt-paper-button, yt-button-renderer button");
    if (btn) {
      btn.click();
      return;
    }

    try {
      window.dispatchEvent(new Event("scroll"));
    } catch (_) {}
  }

  function setupContinuationObserver() {
    if (continuationObserver) {
      continuationObserver.disconnect();
      continuationObserver = null;
    }

    if (!currentSettings.enabled || !isWatchPage()) return;

    const secondary = document.querySelector(
      "ytd-watch-flexy:not([theater]):not([fullscreen]) #secondary"
    );
    if (!secondary) return;

    try {
      continuationObserver = new IntersectionObserver(
        (entries) => entries.forEach(triggerLoad),
        {
          root: secondary,
          rootMargin: "0px 0px 400px 0px",
          threshold: 0,
        }
      );

      const sentinels = secondary.querySelectorAll("ytd-continuation-item-renderer");
      sentinels.forEach((el) => continuationObserver.observe(el));
    } catch (_) {}
  }

  /* ── Mutation Watcher (Debounced via requestAnimationFrame) ───────── */

  function setupMutationWatcher() {
    if (mutationObs) {
      mutationObs.disconnect();
      mutationObs = null;
    }

    if (!currentSettings.enabled || !isWatchPage()) return;

    const secondary = document.querySelector("#secondary-inner") || document.querySelector("#secondary");
    if (!secondary) return;

    try {
      mutationObs = new MutationObserver(() => {
        if (mutationThrottleTimer) return;
        mutationThrottleTimer = requestAnimationFrame(() => {
          mutationThrottleTimer = null;
          if (!continuationObserver || !secondary) return;
          try {
            const sentinels = secondary.querySelectorAll("ytd-continuation-item-renderer");
            sentinels.forEach((el) => continuationObserver.observe(el));
          } catch (_) {}
        });
      });

      mutationObs.observe(secondary, { childList: true, subtree: true });
    } catch (_) {}
  }

  /* ── Video Detection & Attribute Management ──────────────────────── */

  function findVideoElement() {
    const mainVideo =
      document.querySelector("#movie_player video") ||
      document.querySelector("ytd-watch-flexy video.html5-main-video") ||
      document.querySelector("video.html5-main-video");
    if (mainVideo) return mainVideo;

    const videos = Array.from(document.querySelectorAll("video"));
    return videos.find((v) => v.offsetWidth > 0 && v.offsetHeight > 0) || videos[0] || null;
  }

  function unlockVideoPip(video) {
    if (!video) return;
    try {
      video.removeAttribute("disablepictureinpicture");
      video.disablePictureInPicture = false;

      if (currentSettings.enabled && currentSettings.autoPip) {
        video.autoPictureInPicture = true;
        video.setAttribute("autopictureinpicture", "true");
      } else {
        video.autoPictureInPicture = false;
        video.removeAttribute("autopictureinpicture");
      }

      if (!video._splitScrollTracked) {
        video._splitScrollTracked = true;
        video.addEventListener("enterpictureinpicture", () => {
          safeSendMessage({ action: "pip-started" });
        });
        video.addEventListener("leavepictureinpicture", () => {
          safeSendMessage({ action: "pip-stopped" });
        });
      }
    } catch (_) {}
  }

  // Observer that strips disablepictureinpicture if YouTube dynamically re-applies it
  const pipAttributeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "disablepictureinpicture") {
        if (m.target instanceof HTMLVideoElement && m.target.hasAttribute("disablepictureinpicture")) {
          m.target.removeAttribute("disablepictureinpicture");
          m.target.disablePictureInPicture = false;
        }
      }
    }
  });

  function setupAutoPip() {
    if (!isWatchPage()) return;
    syncAutoPipState();

    const video = findVideoElement();
    if (!video) return;

    unlockVideoPip(video);

    if (currentObservedVideo !== video) {
      currentObservedVideo = video;
      try {
        pipAttributeObserver.observe(video, {
          attributes: true,
          attributeFilter: ["disablepictureinpicture"],
        });
      } catch (_) {}
    }
  }

  /* ── Debounced Auto-Exit PiP on Window / Tab Return ───────────────── */

  function handleTabReturn() {
    if (!currentSettings.enabled || !currentSettings.autoPip) return;

    if (returnDebounceTimer) {
      clearTimeout(returnDebounceTimer);
    }

    // Delay 250ms so Windows DWM unminimize animation finishes and DirectX surface is composited
    returnDebounceTimer = setTimeout(async () => {
      returnDebounceTimer = null;
      if (document.visibilityState !== "visible") return;

      if (document.pictureInPictureElement) {
        try {
          await document.exitPictureInPicture();
        } catch (_) {}
      }
    }, 250);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleTabReturn();
    } else {
      if (returnDebounceTimer) {
        clearTimeout(returnDebounceTimer);
        returnDebounceTimer = null;
      }
    }
  });

  window.addEventListener("focus", () => {
    if (document.visibilityState === "visible") {
      handleTabReturn();
    }
  });

  /* ── Picture-in-Picture Toggle ─────────────────────────────────────── */

  function togglePictureInPicture() {
    lastShortcutHandledTime = Date.now();
    if (returnDebounceTimer) {
      clearTimeout(returnDebounceTimer);
      returnDebounceTimer = null;
    }

    try {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
        return;
      }

      const video = findVideoElement();
      if (!video) return;

      unlockVideoPip(video);

      video.requestPictureInPicture().catch((err) => {
        // Silently catch gesture checks if invoked without user activation
        if (err.name !== "NotAllowedError" && err.name !== "InvalidStateError") {
          console.warn("[Split Scroll] PiP toggle:", err.name, err.message);
        }
      });
    } catch (_) {}
  }

  document.addEventListener(
    "enterpictureinpicture",
    () => {
      safeSendMessage({ action: "pip-started" });
    },
    true
  );

  document.addEventListener(
    "leavepictureinpicture",
    () => {
      safeSendMessage({ action: "pip-stopped" });
    },
    true
  );

  /* ── Native Command & Message Dispatcher ─────────────────────────── */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;

    if (message.action === "exit-pip" || message.action === "exit-pip-if-active") {
      if (returnDebounceTimer) {
        clearTimeout(returnDebounceTimer);
        returnDebounceTimer = null;
      }
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
        sendResponse({ exited: true, wasActive: true, success: true });
      } else {
        sendResponse({ exited: false, wasActive: false, success: true });
      }
      return;
    }

    if (message.action === "window-focused") {
      handleTabReturn();
      sendResponse({ received: true });
      return;
    }

    if (message.action === "window-defocused") {
      if (currentSettings.enabled && currentSettings.autoPip) {
        const video = findVideoElement();
        if (video && !video.paused && !video.ended && !document.pictureInPictureElement) {
          try {
            unlockVideoPip(video);
            video.requestPictureInPicture().catch(() => {});
          } catch (_) {}
        }
      }
      sendResponse({ received: true });
      return;
    }

    if (message.action === "toggle-pip") {
      // If we just handled this shortcut from in-page keydown, avoid race condition collision
      if (Date.now() - lastShortcutHandledTime < 800) {
        sendResponse({ success: true, ignoredDuplicate: true });
        return;
      }
      togglePictureInPicture();
      sendResponse({ success: true });
    }
  });

  /* ── In-Page Keyboard Shortcut Handler ───────────────────────────── */

  function isEditableElement(element) {
    if (!element) return false;
    if (element.isContentEditable) return true;
    const tag = element.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function handleKeyDown(e) {
    if (!currentSettings.enabled) return;

    const activeEl = document.activeElement;
    if (isEditableElement(e.target) || isEditableElement(activeEl)) {
      return;
    }

    const key = e.key ? e.key.toLowerCase() : "";
    const code = e.code ? e.code.toLowerCase() : "";

    // 1. Built-in global standard shortcut: Ctrl+Shift+8
    const isCtrlShift8 = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (key === "8" || code === "digit8");

    // 2. Popular alternate shortcuts: Alt+P, Alt+Shift+X, Alt+X
    const isAltP = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (key === "p" || code === "keyp");
    const isAltShiftX = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (key === "x" || code === "keyx");
    const isAltX = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (key === "x" || code === "keyx");

    // 3. User customized shortcut (synced from Chrome commands or custom selection)
    const custom = currentSettings.pipShortcut;
    let customMatches = false;
    if (custom) {
      const matchKey = custom.key && key === custom.key.toLowerCase();
      const matchCode = custom.code && code === custom.code.toLowerCase();
      const matchAlt = !!e.altKey === !!custom.altKey;
      const matchCtrl = !!e.ctrlKey === !!custom.ctrlKey;
      const matchShift = !!e.shiftKey === !!custom.shiftKey;
      const matchMeta = !!e.metaKey === !!custom.metaKey;
      customMatches = (matchKey || matchCode) && matchAlt && matchCtrl && matchShift && matchMeta;
    }

    if (isCtrlShift8 || isAltP || isAltShiftX || isAltX || customMatches) {
      e.preventDefault();
      e.stopPropagation();
      togglePictureInPicture();
    }
  }

  window.addEventListener("keydown", handleKeyDown, true);

  /* ── Cleanup on Navigation Away ───────────────────────────────────── */

  function cleanupWatchPage() {
    if (continuationObserver) {
      continuationObserver.disconnect();
      continuationObserver = null;
    }
    if (mutationObs) {
      mutationObs.disconnect();
      mutationObs = null;
    }
    if (pipAttributeObserver) {
      pipAttributeObserver.disconnect();
    }
    if (mutationThrottleTimer) {
      cancelAnimationFrame(mutationThrottleTimer);
      mutationThrottleTimer = null;
    }
    if (returnDebounceTimer) {
      clearTimeout(returnDebounceTimer);
      returnDebounceTimer = null;
    }
    currentObservedVideo = null;
  }

  document.addEventListener("yt-navigate-start", () => {
    if (!isWatchPage()) {
      cleanupWatchPage();
    }
  });

  /* ── Initialization ───────────────────────────────────────────────── */

  function init() {
    applyClasses();

    if (!isWatchPage()) {
      cleanupWatchPage();
      return;
    }

    setupAutoPip();

    setTimeout(() => {
      if (isWatchPage()) {
        setupContinuationObserver();
        setupMutationWatcher();
        setupAutoPip();
      }
    }, 600);
  }

  // Load initial settings
  try {
    chrome.storage.local
      .get(DEFAULTS)
      .then((result) => {
        currentSettings = { ...DEFAULTS, ...result };
        init();
      })
      .catch(() => {
        init();
      });
  } catch (_) {
    init();
  }

  document.addEventListener("yt-navigate-finish", () => {
    init();
  });

  /* ── Real-Time Storage Listener ──────────────────────────────────── */

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (changes.enabled !== undefined) {
        currentSettings.enabled = changes.enabled.newValue ?? DEFAULTS.enabled;
      }
      if (changes.stickyPlayer !== undefined) {
        currentSettings.stickyPlayer = changes.stickyPlayer.newValue ?? DEFAULTS.stickyPlayer;
      }
      if (changes.hideScrollbars !== undefined) {
        currentSettings.hideScrollbars = changes.hideScrollbars.newValue ?? DEFAULTS.hideScrollbars;
      }
      if (changes.hideShorts !== undefined) {
        currentSettings.hideShorts = changes.hideShorts.newValue ?? DEFAULTS.hideShorts;
      }
      if (changes.autoPip !== undefined) {
        currentSettings.autoPip = changes.autoPip.newValue ?? DEFAULTS.autoPip;
      }
      if (changes.fullAmbient !== undefined) {
        currentSettings.fullAmbient = changes.fullAmbient.newValue ?? DEFAULTS.fullAmbient;
      }
      if (changes.pipShortcut !== undefined) {
        currentSettings.pipShortcut = changes.pipShortcut.newValue ?? DEFAULT_PIP_SHORTCUT;
      }

      init();
    });
  } catch (_) {}
})();
