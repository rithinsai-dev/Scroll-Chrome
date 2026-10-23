# TubeDeck for YouTube

A power-user Chrome & Firefox extension that elevates your YouTube experience with dual-column independent scrolling, sticky video pinning, YouTube Shorts suppression, invisible scrollbars, and seamless Auto Picture-in-Picture.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

---

## Features

- **Independent column scrolling** — the primary (left) and secondary (right) columns each get their own scrollbar on the YouTube watch page.
- **Hide Shorts everywhere** (optional, enabled by default) — eliminates YouTube Shorts shelves, feed items, watch recommendations, and navigation drawer links for a distraction-free experience.
- **Hidden scrollbars** (optional, enabled by default) — keep column scrolling completely invisible for a clean, minimalist UI without visual distraction.
- **Picture-in-Picture (PiP) shortcut** — toggle floating PiP mode with an ergonomic shortcut (`Ctrl+Shift+8` global default that works even when the floating PiP window is focused; also supports `Alt+P`, `Alt+Shift+X`, and `Alt+X`).
- **Auto PiP** (optional, disabled by default) — automatically enters PiP mode via Chrome's native MediaSession API when switching tabs. For window switching, Alt+Tab, or minimizing, enable Chrome's flag at `chrome://flags/#auto-picture-in-picture-for-video-playback` via the 1-click link in the popup. In-page playback smoothly restores when returning to the window.
- **Ambient lighting blend & Full Ambient Glow** (optional, high-intensity mode) — smoothly bleeds YouTube's ambient glow across the page, with an optional full-viewport Ambilight mode that casts high-intensity video-reactive ambient lighting across the entire screen with frosted glassmorphism cards.
- **Ultra-compact minimalist popup** — redesigned with instant 0ms opening performance, sleek micro-switches, and zero visual clutter.
- **Theater & fullscreen safe** — the split scroll is automatically disabled in theater mode and fullscreen.
- **Responsive** — narrow viewports (< 1016 px) keep YouTube's default single-column layout.
- **Toolbar toggle** — click the extension icon to configure features instantly with real-time sync across all open YouTube tabs.
- **Sticky player** (optional) — pin the video player to the top of the left column while scrolling comments.
- **Infinite scroll preserved** — a content script ensures YouTube's "load more suggestions" still triggers when you scroll inside the sidebar.

---

## Install

### Option A: Temporary install (for development)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **"Load Temporary Add-on…"**.
3. Navigate to this project folder and select `manifest.json`.
4. The extension is now active. It will be removed when you close Firefox.

### Option B: Live-reload with `web-ext`

```bash
# Install web-ext globally (requires Node.js ≥ 18)
npm install -g web-ext

# Run from the project root
cd path/to/Scroll
npx web-ext run --firefox="C:\Program Files\Mozilla Firefox\firefox.exe"

# Or if Firefox is on PATH:
npx web-ext run
```

`web-ext run` launches a clean Firefox profile with the extension loaded. It auto-reloads when you edit files.

Useful flags:
- `--firefox-profile=<name>` — use an existing profile instead of a temporary one.
- `--keep-profile-changes` — persist changes to the profile between runs.
- `--start-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"` — open a test page on launch.

### Option C: Permanent install (unsigned)

Firefox stable requires all extensions to be signed. To install unsigned:

1. Use **Firefox Developer Edition**, **Nightly**, or **ESR**.
2. Go to `about:config` and set `xpinstall.signatures.required` to `false`.
3. Package the extension: `npx web-ext build` (creates a `.zip` in `web-ext-artifacts/`).
4. Rename the `.zip` to `.xpi`.
5. Drag the `.xpi` into Firefox, or go to `about:addons` → gear icon → "Install Add-on From File…".

### Option D: Signed via addons.mozilla.org (permanent on any Firefox)

1. Create an account at [addons.mozilla.org](https://addons.mozilla.org).
2. Go to **Developer Hub** → **Submit a New Add-on**.
3. Choose **"On your own"** (unlisted / self-distributed) if you don't want it in the public store.
4. Upload the `.zip` from `npx web-ext build`.
5. Mozilla will auto-sign it. Download the signed `.xpi` and install it in Firefox.

Alternatively, use the CLI:
```bash
npx web-ext sign --api-key=YOUR_JWT_ISSUER --api-secret=YOUR_JWT_SECRET --channel=unlisted
```

---

## Usage

1. Go to any YouTube video page (e.g. `https://www.youtube.com/watch?v=...`).
2. The left column (player + comments) and right column (suggestions) now scroll independently.
3. Click the extension icon in the toolbar to toggle split scrolling or enable the sticky player.

---

## Updating selectors when YouTube changes its DOM

YouTube updates its DOM periodically. All YouTube-specific selectors are documented in two places:

| File | What to update |
|------|----------------|
| [`style.css`](style.css) | CSS selectors in the table at the top of the file |
| [`content.js`](content.js) | JS selectors in the table comment at the top of the file |

### Key selectors to check

| Selector | What it targets |
|----------|-----------------|
| `ytd-watch-flexy` | Main watch-page custom element |
| `ytd-watch-flexy[theater]` | Theater mode attribute |
| `ytd-watch-flexy[fullscreen]` | Fullscreen attribute |
| `#columns` | Flex container holding left and right columns |
| `#primary` | Left column (player, title, description, comments) |
| `#secondary` | Right column (suggested videos, playlists) |
| `ytd-continuation-item-renderer` | Infinite-scroll sentinel in sidebar |
| `#player-container-outer` | Video player wrapper (for sticky player) |
| `--ytd-masthead-height` | CSS variable for header height (default 56px) |

### How to check

1. Open YouTube in Firefox, press `F12` to open DevTools.
2. Use the Inspector to verify the selectors above still exist.
3. If a selector has changed, update it in both `style.css` and `content.js`.

---

## Project structure

```
Scroll/
├── manifest.json          # Extension manifest (MV3, Firefox)
├── style.css              # Core CSS for split scrolling
├── content.js             # Content script: toggle, infinite scroll fix, SPA nav
├── popup/
│   ├── popup.html         # Toolbar popup UI
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup logic (read/write settings)
├── icons/
│   ├── icon-48.png        # Toolbar icon (48×48)
│   └── icon-96.png        # Toolbar icon (96×96)
└── README.md              # This file
```

---

## Known limitations

- **Infinite scroll**: The fix uses `IntersectionObserver` rooted at `#secondary` plus `MutationObserver` to detect new sentinels. If YouTube changes how it triggers lazy loading (e.g., moves to a scroll-event-based approach), this may need updating.
- **Banners / promos**: The masthead offset uses YouTube's own `--ytd-masthead-height` CSS variable, which should handle promotional banners. If YouTube stops using this variable, the 56px fallback may leave a small gap.
- **Live chat**: On live streams, the chat panel replaces `#secondary`. The extension's CSS still applies, but the chat's own scroll container may interact unexpectedly.

---

## License

MIT
