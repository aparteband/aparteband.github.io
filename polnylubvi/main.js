/* ============================================================
   polnylubvi — DOM is generated here.
   HTML stays minimal forever. Edit only JS + CSS дальше.
============================================================ */

/* ---------- CONFIG (правишь тут) ---------- */
const CFG = Object.freeze({
  videoSrc: "video.mp4", // файл в папке polnylubvi/
  // release title image:
  releaseTitleSrc: "release_title.png",

  // streaming buttons: png files + url
  streams: Object.freeze([
    { key: "yandex",  img: "yandex.png",  url: "https://music.yandex.ru/album/36297300/track/138373316?ref_id=4BDABF68-5903-4C4A-98A7-35D7E17B8213&utm_medium=copy_link" },
    { key: "zvuk",    img: "zvuk.png",    url: "https://share.zvuk.com/cLQ0/9bw5ym1b" },
    { key: "kion",    img: "kion.png",    url: "https://mts-music-spo.onelink.me/sKFX/ex58sdmo" },
    { key: "apple",   img: "apple.png",   url: "https://music.apple.com/ru/album/%D0%BF%D0%BE%D0%BB%D0%BD%D1%8B-%D0%BB%D1%8E%D0%B1%D0%B2%D0%B8/1808785284?i=1808785286" },
    { key: "vk",      img: "vk.png",      url: "https://vk.ru/audio-2001043938_136043938" },
    // временно как ты сказала (поменяешь потом)
    { key: "spotify", img: "spotify.png", url: "https://vk.ru/audio-2001043938_136043938спотик" }
  ])
});

/* ---------- HELPERS ---------- */
function byId(id) { return document.getElementById(id); }

function injectPreload(href, as, type) {
  try {
    const l = document.createElement("link");
    l.rel = "preload";
    l.as = as;
    l.href = href;
    if (type) l.type = type;
    document.head.appendChild(l);
  } catch (_) {}
}

function resolveLocal(name) {
  // гарантирует корректный путь внутри /polnylubvi/ и при прямом заходе
  try {
    return new URL(name, window.location.href).toString();
  } catch (_) {
    return name;
  }
}

/* ============================================================
   COLOR CORRECTION (как на твоём скрине)
   Регулировать можно ТОЛЬКО здесь:
============================================================ */
const VIDEO_FILTER = "grayscale(1) contrast(1.28) brightness(0.93)";

/* ============================================================
   iOS/IN-APP VIEWPORT HEIGHT FIX (простая стабильная версия)
   — обновляет --vh на resize/scroll visualViewport
============================================================ */
(function vhFix() {
  if (window.__vhFixPolnyLubviV1) return;
  window.__vhFixPolnyLubviV1 = true;

  function setVh() {
    const vv = window.visualViewport;
    const h = (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--vh", (Math.max(1, h) * 0.01) + "px");
  }

  setVh();
  window.addEventListener("resize", setVh);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setVh);
    window.visualViewport.addEventListener("scroll", setVh);
  }
  window.addEventListener("pageshow", setVh);
})();

/* ============================================================
   BUILD DOM (вся разметка создаётся здесь)
============================================================ */
(function build() {
  const app = byId("app");
  if (!app) return;

  // preload — только видео
  injectPreload(resolveLocal(CFG.videoSrc), "video", "video/mp4");

  // stage
  const stage = document.createElement("div");
  stage.id = "stage";

  // video (обычный показ, без canvas/рендеринга)
  const video = document.createElement("video");
  video.id = "bg-video";
  video.src = resolveLocal(CFG.videoSrc);
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";

  // ✅ цветокоррекция
  video.style.filter = VIDEO_FILTER;

  // ✅ розовая плашка (как было у тебя сейчас)
  const panel = document.createElement("div");
  panel.id = "pink-panel";
  panel.setAttribute("aria-hidden", "true");

  panel.style.position = "fixed";
  panel.style.left = "0";
  panel.style.top = "0";
  panel.style.bottom = "0";              // на всю высоту
  panel.style.height = "auto";
  panel.style.pointerEvents = "none";
  panel.style.zIndex = "10050";
  panel.style.transform = "none";
  panel.style.borderRadius = "0";        // прямые углы
  panel.style.background = "rgba(253, 176, 192, 0.55)";

  // “всплывающая”
  panel.style.boxShadow = "24px 0 60px rgba(0,0,0,0.35)";
  panel.style.backdropFilter = "blur(8px)";
  panel.style.webkitBackdropFilter = "blur(8px)";
  panel.style.borderRight = "1px solid rgba(255,255,255,0.10)";

  stage.appendChild(video);
  stage.appendChild(panel);
  app.appendChild(stage);

  // ✅ ширина плашки: как в твоей текущей версии (в 2 раза уже, слева)
  const OVERLAP_PCT = 0.10;

  function getLayoutWidth() {
    return (document.documentElement && document.documentElement.clientWidth) || window.innerWidth || 0;
  }

  function updatePinkPanel() {
    try {
      const ww = getLayoutWidth();
      if (ww < 2) return;

      const r = video.getBoundingClientRect();
      if (!r) return;

      // логика оставлена как у тебя в текущей версии
      const allowedX = Math.min(ww, Math.max(0, Math.ceil(r.right)));
      const allowedW = Math.max(0, ww - allowedX);

      const basePx = Math.max(0, Math.min(ww, Math.round(allowedX + allowedW * OVERLAP_PCT)));
      const wPx = Math.max(0, Math.round(basePx * 0.5)); // в 2 раза уже
      panel.style.width = wPx + "px";
    } catch (_) {}
  }

  updatePinkPanel();
  requestAnimationFrame(updatePinkPanel);
  setTimeout(updatePinkPanel, 0);

  video.addEventListener("loadedmetadata", updatePinkPanel, { passive: true });
  video.addEventListener("loadeddata", updatePinkPanel, { passive: true });
  video.addEventListener("canplay", updatePinkPanel, { passive: true });

  window.addEventListener("resize", updatePinkPanel);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updatePinkPanel);
    window.visualViewport.addEventListener("scroll", updatePinkPanel);
  }
  window.addEventListener("pageshow", updatePinkPanel);

  // autoplay страховка
  function tryPlay() {
    try {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }
  tryPlay();

  const GESTURE_EVT = window.PointerEvent
    ? "pointerdown"
    : (("ontouchstart" in window) ? "touchstart" : "mousedown");
  window.addEventListener(GESTURE_EVT, tryPlay, { passive: true, once: true });
})();
