/**
 * TubeDeck – Popup Controller
 * ===========================
 * Handles user preferences and synchronizes with storage.
 */

(function () {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    stickyPlayer: false,
    hideScrollbars: true,
    hideShorts: true,
    autoPip: false,
    fullAmbient: false,
  };

  const FLAG_URL = "chrome://flags/#auto-picture-in-picture-for-video-playback";
  const SHORTCUTS_URL = "chrome://extensions/shortcuts";

  const enabledEl = document.getElementById("enabled");
  const stickyEl = document.getElementById("stickyPlayer");
  const hideScrollbarsEl = document.getElementById("hideScrollbars");
  const hideShortsEl = document.getElementById("hideShorts");
  const autoPipEl = document.getElementById("autoPip");
  const fullAmbientEl = document.getElementById("fullAmbient");
  const autoPipFlagRow = document.getElementById("autoPipFlagRow");
  const openFlagLink = document.getElementById("openFlagLink");
  const openShortcutsLink = document.getElementById("openShortcutsLink");
  const statusBanner = document.getElementById("statusBanner");

  let bannerTimeout = null;

  function showBanner(text) {
    if (!statusBanner) return;
    if (bannerTimeout) clearTimeout(bannerTimeout);
    statusBanner.textContent = text;
    statusBanner.className = "status-banner visible info";
    bannerTimeout = setTimeout(() => {
      statusBanner.className = "status-banner";
    }, 4500);
  }

  function safeSetStorage(data) {
    try {
      if (chrome.storage?.local) {
        chrome.storage.local.set(data);
      }
    } catch (_) {}
  }

  /* ── Load initial settings ────────────────────────────────────────── */

  try {
    chrome.storage.local.get(DEFAULTS).then((settings) => {
      enabledEl.checked = settings.enabled ?? DEFAULTS.enabled;
      stickyEl.checked = settings.stickyPlayer ?? DEFAULTS.stickyPlayer;
      hideScrollbarsEl.checked = settings.hideScrollbars ?? DEFAULTS.hideScrollbars;
      hideShortsEl.checked = settings.hideShorts ?? DEFAULTS.hideShorts;
      autoPipEl.checked = settings.autoPip ?? DEFAULTS.autoPip;
      if (fullAmbientEl) {
        fullAmbientEl.checked = settings.fullAmbient ?? DEFAULTS.fullAmbient;
      }

      if (autoPipFlagRow) {
        autoPipFlagRow.style.display = autoPipEl.checked ? "flex" : "none";
      }
    }).catch(() => {});
  } catch (_) {}

  /* ── Toggle listeners ─────────────────────────────────────────────── */

  enabledEl.addEventListener("change", () => {
    safeSetStorage({ enabled: enabledEl.checked });
  });

  stickyEl.addEventListener("change", () => {
    safeSetStorage({ stickyPlayer: stickyEl.checked });
  });

  hideScrollbarsEl.addEventListener("change", () => {
    safeSetStorage({ hideScrollbars: hideScrollbarsEl.checked });
  });

  if (fullAmbientEl) {
    fullAmbientEl.addEventListener("change", () => {
      safeSetStorage({ fullAmbient: fullAmbientEl.checked });
    });
  }

  hideShortsEl.addEventListener("change", () => {
    safeSetStorage({ hideShorts: hideShortsEl.checked });
  });

  autoPipEl.addEventListener("change", () => {
    safeSetStorage({ autoPip: autoPipEl.checked });
    if (autoPipFlagRow) {
      autoPipFlagRow.style.display = autoPipEl.checked ? "flex" : "none";
    }
  });

  /* ── Navigation links with clipboard fallback ─────────────────────── */

  if (openFlagLink) {
    openFlagLink.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        chrome.tabs.create({ url: FLAG_URL }, () => {
          if (chrome.runtime.lastError) {
            copyToClipboard(FLAG_URL, "Copied flag URL to clipboard! Paste in a new tab.");
          }
        });
      } catch (_) {
        copyToClipboard(FLAG_URL, "Copied flag URL to clipboard! Paste in a new tab.");
      }
    });
  }

  if (openShortcutsLink) {
    openShortcutsLink.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        chrome.tabs.create({ url: SHORTCUTS_URL }, () => {
          if (chrome.runtime.lastError) {
            copyToClipboard(SHORTCUTS_URL, "Copied chrome://extensions/shortcuts to clipboard!");
          }
        });
      } catch (_) {
        copyToClipboard(SHORTCUTS_URL, "Copied chrome://extensions/shortcuts to clipboard!");
      }
    });
  }

  function copyToClipboard(url, message) {
    try {
      navigator.clipboard.writeText(url);
      showBanner(message);
    } catch (_) {
      showBanner(`Open ${url} in your browser.`);
    }
  }
})();
