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
   Цель: как в референсе — синхронные волны, покадрово, без хаоса.
   - Нет микродрожи линии (контур не трясётся)
   - Волна меняется ПОКАДРОВО (hold-кадры)
   - Все линии двигаются синхронно (в одну сторону), с ощущением движения вверх/вниз
   - Не рисуем поверх видео (только справа от границы видео)

   РЕГУЛИРОВКА ПАРАМЕТРОВ (менять здесь):
   - frameFps:       внутренняя частота
   - holdFrames:     удержание кадра (итоговая “покадровость” = frameFps/holdFrames)
   - flowPxPerStep:  сколько пикселей “едет” узор по Y за один шаг (скорость вверх/вниз)
   - flowDirection:  -1 = узор “едет вверх”, +1 = “едет вниз”
   - phaseRadPerStep: дополнительное покадровое изменение формы (без рандома)
   - swayPx:         общий синхронный изгиб линий вбок (ощущение “выгибаются в одну сторону”)
   - yStepPx:        плотность точек (меньше = глаже)
   - avoidVideoPadPx: отступ от видео
============================================================ */
const LINES_CFG = Object.freeze({
  desktopMinWidth: 1024,  // ПК-условие (мобилу не трогаем)
  count: 4,
  lineWidthPx: 4,

  baseAmpPx: 58,
  wavelengthPx: 320,      // основной “шаг” волны

  cycleSec: 14,           // цикл выпрямления (волна->прямая->волна), тоже покадрово

  yStepPx: 4,             // гладкость геометрии (точек больше)
  topBottomOverscanPx: 80,

  avoidVideo: true,
  avoidVideoPadPx: 14,
  rightPadPx: 24,

  // покадровость / синхрон
  frameFps: 24,
  holdFrames: 3,          // 24/3 = 8 fps обновление формы (покадрово как в видео)
  flowPxPerStep: 14,      // скорость движения узора вверх/вниз (px за шаг)
  flowDirection: -1,      // -1 вверх, +1 вниз
  phaseRadPerStep: 0.22,  // медленное синхронное изменение формы (без хаоса)
  swayPx: 18              // общий изгиб вбок, синхронно для всех линий
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
  if (document.getElementById("line-canvas")) return null;

  const canvas = document.createElement("canvas");
  canvas.id = "line-canvas";
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  let rafId = 0;
  let w = 0, h = 0, dpr = 1;

  // последний “шаг” (не кадр), чтобы не перерисовывать одно и то же
  let lastStep = -1;

  // линии ВНУТРИ области справа от видео (0..1 относительно этой области)
  const xFracsRight = [0.12, 0.36, 0.62, 0.86];

  // небольшой постоянный разброс амплитуды по линиям (НЕ влияет на синхрон движения)
  const ampMul = [1.00, 0.92, 1.06, 0.96];

  const lines = xFracsRight.slice(0, LINES_CFG.count).map((xr, i) => ({
    xr,
    amp: ampMul[i] || 1.0
  }));

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

  function getSafeLeftPx() {
    if (!LINES_CFG.avoidVideo) return 0;
    const v = document.getElementById("bg-video");
    if (!v || !v.getBoundingClientRect) return 0;
    const r = v.getBoundingClientRect();
    return Math.max(0, Math.min(w, Math.ceil(r.right) + LINES_CFG.avoidVideoPadPx));
  }

  // рисуем один “шаг” (покадрово)
  function drawStep(step) {
    ctx.clearRect(0, 0, w, h);

    const fps = Math.max(1, LINES_CFG.frameFps);
    const hold = Math.max(1, LINES_CFG.holdFrames);
    const stepDt = hold / fps;      // секунд на шаг
    const tSec = step * stepDt;

    // покадровое выпрямление
    const u = (tSec / LINES_CFG.cycleSec) % 1;
    const tri = 0.5 - 0.5 * Math.cos(2 * Math.PI * u); // 0..1..0
    const waviness = smoothstep01(tri);

    // синхронный “скролл” узора по Y (даёт ощущение движения вверх/вниз)
    const scrollY = (step * LINES_CFG.flowPxPerStep) * (LINES_CFG.flowDirection || 1);

    // синхронная фаза (покадрово, без случайностей)
    const phase = step * LINES_CFG.phaseRadPerStep;

    // общий синхронный изгиб вбок (в одну сторону для всех линий)
    const sway = LINES_CFG.swayPx * Math.sin(phase * 0.7);

    const k1 = (2 * Math.PI) / Math.max(40, LINES_CFG.wavelengthPx);
    const k2 = (2 * Math.PI) / Math.max(40, LINES_CFG.wavelengthPx * 0.62);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = LINES_CFG.lineWidthPx;

    const y0 = -LINES_CFG.topBottomOverscanPx;
    const y1 = h + LINES_CFG.topBottomOverscanPx;
    const stepY = Math.max(2, LINES_CFG.yStepPx);

    // область рисования: только справа от видео
    const safeLeft = getSafeLeftPx();
    const regionLeft = safeLeft;
    const regionRight = Math.max(regionLeft + 1, w - LINES_CFG.rightPadPx);
    const regionW = Math.max(1, regionRight - regionLeft);
    if (regionW < 80) return;

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];

      // базовая позиция линии справа от видео
      const xBase = regionLeft + (L.xr * regionW) + sway;

      // амплитуда волны (и покадровое выпрямление)
      const amp = (LINES_CFG.baseAmpPx * waviness) * L.amp;

      // собираем точки (внутри шага — гладко, между шагами — покадрово)
      const pts = [];
      for (let y = y0; y <= y1; y += stepY) {
        // важное: узор “едет” по Y (scrollY), а фаза (phase) даёт синхронный эффект изменения формы
        const yy = y + scrollY;

        const wave =
          Math.sin(k1 * yy + phase) +
          0.35 * Math.sin(k2 * yy - phase * 0.9);

        let x = xBase + (amp * 0.72 * wave);

        // не заходим на видео
        if (LINES_CFG.avoidVideo && x < regionLeft + 2) x = regionLeft + 2;

        pts.push([x, y]);
      }

      if (pts.length < 2) continue;

      // сглаживание кривой
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);

      for (let p = 1; p < pts.length - 1; p++) {
        const xMid = (pts[p][0] + pts[p + 1][0]) * 0.5;
        const yMid = (pts[p][1] + pts[p + 1][1]) * 0.5;
        ctx.quadraticCurveTo(pts[p][0], pts[p][1], xMid, yMid);
      }

      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }
  }

  function loop() {
    if (!shouldRunLines()) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      try { canvas.remove(); } catch (_) {}
      return;
    }

    const fps = Math.max(1, LINES_CFG.frameFps);
    const hold = Math.max(1, LINES_CFG.holdFrames);

    const tSec = (performance.now() || 0) * 0.001;
    const frame = Math.floor(tSec * fps);
    const step = Math.floor(frame / hold); // новый рисунок раз в hold кадров

    if (step !== lastStep) {
      lastStep = step;
      drawStep(step);
    }

    rafId = requestAnimationFrame(loop);
  }

  function onResize() { resize(); }

  resize();
  rafId = requestAnimationFrame(loop);

  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
  }
  window.addEventListener("pageshow", onResize);

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

  // lines overlay (PC only) — после того как видео уже в DOM
  let destroyLines = null;
  if (shouldRunLines()) {
    destroyLines = createLinesCanvas(stage);
  }

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

  // destroyLines оставлен на будущее (если потом захочешь включать/выключать)
  void destroyLines;

})();
