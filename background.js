/**
 * TubeDeck – Background Service Worker
 * ====================================
 * Handles global Picture-in-Picture shortcuts, syncs shortcuts from chrome.commands,
 * tracks active PiP across all YouTube tabs, and handles window focus (Alt+Tab) for Auto-PiP.
 */

function parseShortcutString(str) {
  if (!str || typeof str !== "string") return null;
  const rawParts = str.split("+").map((t) => t.trim()).filter(Boolean);
  if (rawParts.length === 0) return null;

  const keyToken = rawParts[rawParts.length - 1];
  const modifiers = rawParts.slice(0, -1).map((m) => m.toLowerCase());

  const ctrlKey = modifiers.includes("ctrl") || modifiers.includes("macctrl") || modifiers.includes("control");
  const altKey = modifiers.includes("alt") || modifiers.includes("option");
  const shiftKey = modifiers.includes("shift");
  const metaKey = modifiers.includes("command") || modifiers.includes("meta");

  let code = "";
  if (/^[a-zA-Z]$/.test(keyToken)) {
    code = "Key" + keyToken.toUpperCase();
  } else if (/^[0-9]$/.test(keyToken)) {
    code = "Digit" + keyToken;
  } else if (/^f[1-9][0-2]?$/i.test(keyToken)) {
    code = keyToken.toUpperCase();
  } else if (keyToken.toLowerCase() === "up") {
    code = "ArrowUp";
  } else if (keyToken.toLowerCase() === "down") {
    code = "ArrowDown";
  } else if (keyToken.toLowerCase() === "left") {
    code = "ArrowLeft";
  } else if (keyToken.toLowerCase() === "right") {
    code = "ArrowRight";
  }

  return {
    key: keyToken.toLowerCase(),
    code: code || keyToken,
    altKey,
    ctrlKey,
    shiftKey,
    metaKey,
    display: str,
  };
}

async function syncCommandShortcuts() {
  try {
    if (chrome.commands && typeof chrome.commands.getAll === "function") {
      const commands = await chrome.commands.getAll();
      const pipCmd = commands.find((c) => c.name === "toggle-pip");
      if (pipCmd && pipCmd.shortcut) {
        const parsed = parseShortcutString(pipCmd.shortcut);
        if (parsed) {
          await chrome.storage.local.set({ pipShortcut: parsed });
        }
      }
    }
  } catch (_) {}
}

async function getPipInfo() {
  try {
    const data = await chrome.storage.session.get(["pipTabId", "pipWindowId"]);
    return {
      tabId: data.pipTabId || null,
      windowId: data.pipWindowId || null,
    };
  } catch {
    return { tabId: null, windowId: null };
  }
}

async function setPipInfo(tabId, windowId) {
  try {
    if (tabId) {
      await chrome.storage.session.set({ pipTabId: tabId, pipWindowId: windowId || null });
    } else {
      await chrome.storage.session.remove(["pipTabId", "pipWindowId"]);
    }
  } catch {}
}

async function getPipTabId() {
  const info = await getPipInfo();
  return info.tabId;
}

async function setPipTabId(tabId) {
  await setPipInfo(tabId, null);
}

chrome.runtime.onInstalled.addListener(() => {
  syncCommandShortcuts();
});

chrome.runtime.onStartup.addListener(() => {
  syncCommandShortcuts();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.action === "pip-started" && sender.tab?.id) {
    setPipInfo(sender.tab.id, sender.tab.windowId || null);
    sendResponse({ received: true });
  } else if (message.action === "pip-stopped") {
    setPipInfo(null, null);
    sendResponse({ received: true });
  } else if (message.action === "sync-shortcuts") {
    syncCommandShortcuts().then(() => sendResponse({ synced: true }));
    return true;
  } else if (message.action === "open-shortcuts-page") {
    try {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      sendResponse({ opened: true });
    } catch (_) {
      sendResponse({ opened: false });
    }
  } else if (message.action === "open-flags-page") {
    try {
      chrome.tabs.create({ url: "chrome://flags/#auto-picture-in-picture-for-video-playback" });
      sendResponse({ opened: true });
    } catch (_) {
      sendResponse({ opened: false });
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabId: currentPipTabId } = await getPipInfo();
  if (currentPipTabId === tabId) {
    await setPipInfo(null, null);
  }
});

/* ── Window Focus Listener for Auto-PiP (Alt+Tab & Minimize) ─────── */

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  try {
    const data = await chrome.storage.local.get({ enabled: true, autoPip: false });
    if (!data.enabled || !data.autoPip) return;

    const { tabId: currentPipTabId, windowId: currentPipWindowId } = await getPipInfo();

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Switched away to an external application (PiP floats on top of the external app)
    } else if (currentPipTabId && currentPipWindowId && windowId === currentPipWindowId) {
      // The exact Chrome window with YouTube regained active focus: exit PiP cleanly
      chrome.tabs.sendMessage(currentPipTabId, { action: "window-focused" }).catch(() => {});
    }
  } catch (_) {}
});

/* ── Global Command Dispatcher (chrome.commands) ──────────────────── */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") return;

  // Sync latest command shortcut
  syncCommandShortcuts();

  // 1. If we have a cached PiP tab, ask it to exit PiP
  const trackedTabId = await getPipTabId();
  if (trackedTabId) {
    try {
      const response = await chrome.tabs.sendMessage(trackedTabId, { action: "exit-pip" });
      if (response?.exited) {
        await setPipTabId(null);
        return;
      }
    } catch {
      await setPipTabId(null);
    }
  }

  // 2. Query all YouTube tabs: exit PiP on any tab that currently has an active PiP element
  let closedAny = false;
  try {
    const ytTabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
    for (const tab of ytTabs) {
      if (!tab.id) continue;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "exit-pip" });
        if (response?.exited) {
          closedAny = true;
          await setPipTabId(null);
          return;
        }
      } catch {}
    }
  } catch {}

  if (closedAny) return;

  // 3. If no tab had PiP open, user wanted to open PiP on the currently active YouTube tab
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && activeTab.url?.includes("youtube.com")) {
      chrome.tabs.sendMessage(activeTab.id, { action: "toggle-pip" }).catch(() => {});
    }
  } catch {}
});
