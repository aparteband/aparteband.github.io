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

  // preloads (чтобы при переходе с aparte.band уже было в кеше максимально)
  injectPreload(resolveLocal(CFG.videoSrc), "video", "video/mp4");
  injectPreload(resolveLocal(CFG.releaseTitleSrc), "image");
  CFG.streams.forEach(s => injectPreload(resolveLocal(s.img), "image"));

  // stage
  const stage = document.createElement("div");
  stage.id = "stage";

  // video
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

  // title image (центр)
  const title = document.createElement("img");
  title.id = "release-title";
  title.src = resolveLocal(CFG.releaseTitleSrc);
  title.alt = "release title";
  title.decoding = "async";
  title.loading = "eager";
  title.setAttribute("draggable", "false");

  // pink panel
  const panel = document.createElement("div");
  panel.id = "pink-panel";
  panel.setAttribute("aria-label", "streaming links");

  // links column
  const nav = document.createElement("nav");
  nav.id = "stream-links";

  CFG.streams.forEach((s) => {
    const a = document.createElement("a");
    a.className = "stream-link";
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", s.key);

    const img = document.createElement("img");
    img.className = "stream-logo";
    img.src = resolveLocal(s.img);
    img.alt = s.key;
    img.decoding = "async";
    img.loading = "eager";
    img.setAttribute("draggable", "false");

    a.appendChild(img);
    nav.appendChild(a);
  });

  panel.appendChild(nav);

  stage.appendChild(video);
  stage.appendChild(title);
  stage.appendChild(panel);

  app.appendChild(stage);

  // autoplay страховка (iOS / in-app может не стартануть сразу)
  function tryPlay() {
    try {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }
  tryPlay();

  // один “жест” пользователя, чтобы гарантированно запустить видео где запрещён autoplay
  const GESTURE_EVT = window.PointerEvent ? "pointerdown" : (("ontouchstart" in window) ? "touchstart" : "mousedown");
  window.addEventListener(GESTURE_EVT, tryPlay, { passive: true, once: true });

})();
