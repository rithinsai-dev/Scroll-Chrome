/**
 * TubeDeck – Main World Script
 * ============================
 * Runs natively in YouTube's MAIN execution world via manifest.json content_scripts.
 * Connects to the browser's MediaSession API so Chrome can automatically transition
 * the video into Picture-in-Picture on tab switch without requiring a synthetic user gesture.
 */

(function () {
  "use strict";

  function isAutoPipActive() {
    return document.documentElement.getAttribute("data-yt-split-scroll-auto-pip") === "true";
  }

  function findMainVideo() {
    return (
      document.querySelector("#movie_player video") ||
      document.querySelector("ytd-watch-flexy video.html5-main-video") ||
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video")
    );
  }

  function registerMediaSession() {
    if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setActionHandler !== "function") {
      return;
    }

    try {
      if (isAutoPipActive()) {
        navigator.mediaSession.setActionHandler("enterpictureinpicture", async () => {
          const video = findMainVideo();
          if (
            video &&
            !video.paused &&
            !video.ended &&
            video.readyState >= 2 &&
            document.pictureInPictureElement !== video
          ) {
            try {
              video.removeAttribute("disablepictureinpicture");
              video.disablePictureInPicture = false;
              await video.requestPictureInPicture();
            } catch (_) {}
          }
        });
      } else {
        try {
          navigator.mediaSession.setActionHandler("enterpictureinpicture", null);
        } catch (_) {}
      }
    } catch (_) {}
  }

  function isFullAmbientActive() {
    return document.documentElement.getAttribute("data-yt-split-scroll-full-ambient") === "true";
  }

  function ensureCinematicsEnabled() {
    if (!isFullAmbientActive()) return;

    try {
      const player =
        document.getElementById("movie_player") ||
        document.querySelector(".html5-video-player");

      if (player && typeof player.setOption === "function") {
        player.setOption("cinematics", "enabled", true);
      }
    } catch (_) {}
  }

  // Intercept setActionHandler to prevent YouTube from clearing our enterpictureinpicture handler
  if ("mediaSession" in navigator && typeof navigator.mediaSession.setActionHandler === "function") {
    const originalSet = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = function (action, handler) {
      if (action === "enterpictureinpicture" && isAutoPipActive()) {
        if (!handler) return; // Retain active handler
      }
      return originalSet(action, handler);
    };
  }

  // React to attribute changes from content script
  const observer = new MutationObserver(() => {
    registerMediaSession();
    ensureCinematicsEnabled();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      "data-yt-split-scroll-auto-pip",
      "data-yt-split-scroll-full-ambient",
    ],
  });

  document.addEventListener("yt-navigate-finish", () => {
    setTimeout(ensureCinematicsEnabled, 500);
  });

  registerMediaSession();
  ensureCinematicsEnabled();
})();
