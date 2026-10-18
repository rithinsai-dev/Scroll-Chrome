/**
 * YouTube Split Scroll â€“ Popup Script
 * ====================================
 *
 * Reads/writes settings to chrome.storage.local.
 * The content script listens for storage.onChanged to apply them live.
 */

(function () {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    stickyPlayer: false,
    hideScrollbars: true,
  };

  const enabledEl = document.getElementById("enabled");
  const stickyEl = document.getElementById("stickyPlayer");
  const hideScrollbarsEl = document.getElementById("hideScrollbars");

  /* â”€â”€ Load current settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  chrome.storage.local.get(DEFAULTS).then((settings) => {
    enabledEl.checked = settings.enabled;
    stickyEl.checked = settings.stickyPlayer;
    hideScrollbarsEl.checked = settings.hideScrollbars;
  });

  /* â”€â”€ Save on change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  enabledEl.addEventListener("change", () => {
    chrome.storage.local.set({ enabled: enabledEl.checked });
  });

  stickyEl.addEventListener("change", () => {
    chrome.storage.local.set({ stickyPlayer: stickyEl.checked });
  });

  hideScrollbarsEl.addEventListener("change", () => {
    chrome.storage.local.set({ hideScrollbars: hideScrollbarsEl.checked });
  });
})();

