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
   LINES OVERLAY (Canvas) — PC only
   РЕГУЛИРОВКА ПАРАМЕТРОВ ТУТ:
   - lineWidthPx: толщина линий
   - baseAmpPx:   амплитуда волны (чем больше — тем “волнистее”)
   - wavelengthPx: длина волны (меньше = чаще изгибы)
   - speed:       скорость “течения”
   - cycleSec:    цикл выпрямления (волна->прямая->волна)
   - jitterPx:    дрожание “как от руки”
============================================================ */
const LINES_CFG = Object.freeze({
  desktopMinWidth: 1024,  // ПК-условие (мобилу не трогаем)
  count: 4,               // количество линий
  lineWidthPx: 4,

  baseAmpPx: 58,          // волнистость (амплитуда)
  wavelengthPx: 320,      // длина волны

  speed: 1.35,            // ✅ СКОРОСТЬ (было ~0.55) — быстрее
  cycleSec: 14,           // цикл выпрямления

  jitterPx: 1.1,          // дрожь “как от руки”

  yStepPx: 6,             // ✅ БОЛЬШЕ ТОЧЕК (меньше шаг = больше точек, было 26)
  topBottomOverscanPx: 80,

  avoidVideo: true,       // ✅ не рисовать в зоне видео
  avoidVideoPadPx: 14,    // отступ вправо от края видео
  rightPadPx: 24          // отступ справа (чтобы не упиралось в край)
});


function shouldRunLines() {
  try {
    return window.matchMedia(`(min-width: ${LINES_CFG.desktopMinWidth}px)`).matches;
  } catch (_) {
    return false;
  }
}

function createLinesCanvas(stage) {
  if (!stage) return null;

  // не дублируем
  if (document.getElementById("line-canvas")) return null;

  const canvas = document.createElement("canvas");
  canvas.id = "line-canvas";
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  let rafId = 0;
  let w = 0, h = 0, dpr = 1;

   // позиции линий ВНУТРИ области справа от видео (0..1 относительно этой области)
  const xFracsRight = [0.12, 0.36, 0.62, 0.86];

  const lines = xFracsRight.slice(0, LINES_CFG.count).map((xr, i) => ({
    xr,
    p1: (i * 1.9) + 0.3,
    p2: (i * 2.6) + 1.1,
    s:  0.7 + i * 0.08
  }));

  function getSafeLeftPx() {
    if (!LINES_CFG.avoidVideo) return 0;
    const v = document.getElementById("bg-video");
    if (!v || !v.getBoundingClientRect) return 0;
    const r = v.getBoundingClientRect();
    // правая граница видео + небольшой отступ
    return Math.max(0, Math.min(w, Math.ceil(r.right) + LINES_CFG.avoidVideoPadPx));
  }


  function resize() {
    const vv = window.visualViewport;
    const ww = (vv && typeof vv.width === "number") ? vv.width : window.innerWidth;
    const hh = (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;

    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = Math.max(1, Math.floor(ww));
    h = Math.max(1, Math.floor(hh));

    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function smoothstep01(x) {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  }

  function draw(tSec) {
    ctx.clearRect(0, 0, w, h);

    // waviness: 1 -> волна, 0 -> прямая (цикл туда-сюда)
    const u = (tSec / LINES_CFG.cycleSec) % 1;
    // 0..1..0
    const tri = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
    // сгладить “залипание” на прямой/волне
    const waviness = smoothstep01(tri);

    const k1 = (2 * Math.PI) / Math.max(40, LINES_CFG.wavelengthPx);
    const k2 = (2 * Math.PI) / Math.max(40, LINES_CFG.wavelengthPx * 0.62);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = LINES_CFG.lineWidthPx;

    const y0 = -LINES_CFG.topBottomOverscanPx;
    const y1 = h + LINES_CFG.topBottomOverscanPx;
        const step = Math.max(2, LINES_CFG.yStepPx); // ✅ больше точек

       const safeLeft = getSafeLeftPx();
    const regionLeft = safeLeft;
    const regionRight = Math.max(regionLeft + 1, w - LINES_CFG.rightPadPx);
    const regionW = Math.max(1, regionRight - regionLeft);

    // если видео заняло почти всё — просто ничего не рисуем
    if (regionW < 80) return;

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];

      // базовая X-позиция внутри правой области
      const xBase = regionLeft + (L.xr * regionW);

      const amp = LINES_CFG.baseAmpPx * waviness;

      // собираем точки
      const pts = [];
      for (let y = y0; y <= y1; y += step) {
        const tt = tSec * LINES_CFG.speed * L.s;

        const jitter =
          LINES_CFG.jitterPx * (
            0.55 * Math.sin(tt * 3.1 + y * 0.018 + L.p2) +
            0.45 * Math.sin(tt * 2.2 + y * 0.011 + L.p1)
          );

        const wave =
          Math.sin(k1 * y + tt + L.p1) +
          0.35 * Math.sin(k2 * y - tt * 0.9 + L.p2);

        let x = xBase + (amp * 0.72 * wave) + jitter;

        // ✅ страховка: никогда не заходим на видео
        if (LINES_CFG.avoidVideo && x < regionLeft + 2) x = regionLeft + 2;

        pts.push([x, y]);
      }

      if (pts.length < 2) continue;

      // ✅ сглаживание (quadratic через midpoints)
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);

      for (let p = 1; p < pts.length - 1; p++) {
        const xMid = (pts[p][0] + pts[p + 1][0]) * 0.5;
        const yMid = (pts[p][1] + pts[p + 1][1]) * 0.5;
        ctx.quadraticCurveTo(pts[p][0], pts[p][1], xMid, yMid);
      }

      // добиваем до конца
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);

      ctx.stroke();
    }


  function loop() {
    if (!shouldRunLines()) {
      // если вдруг сузили окно — выключаем
      cancelAnimationFrame(rafId);
      rafId = 0;
      try { canvas.remove(); } catch (_) {}
      return;
    }

    const tSec = (performance.now() || 0) * 0.001;
    draw(tSec);
    rafId = requestAnimationFrame(loop);
  }

  function onResize() {
    resize();
  }

  resize();
  rafId = requestAnimationFrame(loop);

  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
  }
  window.addEventListener("pageshow", onResize);

  // возвращаем “деструктор” на случай будущих правок
  return function destroy() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    window.removeEventListener("resize", onResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", onResize);
      window.visualViewport.removeEventListener("scroll", onResize);
    }
    window.removeEventListener("pageshow", onResize);
    try { canvas.remove(); } catch (_) {}
  };
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

  // lines overlay (PC only)
  let destroyLines = null;
  if (shouldRunLines()) {
    destroyLines = createLinesCanvas(stage);
  }

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
