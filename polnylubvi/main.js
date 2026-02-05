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
   Вариант A: линии получаются ИЗ КАДРОВ ВИДЕО (контуры),
   но рисуются ТОЛЬКО ВНЕ ОБЛАСТИ ВИДЕО (не касаются видео).
   Обновление — покадрово (hold), синхронно и стабильно (без хаоса).

   РЕГУЛИРОВКА ПАРАМЕТРОВ (менять здесь):
   - updateFps:     как часто обновлять “рисунок” (покадровость)
   - holdFrames:    удержание (updateFps/holdFrames = итоговая частота обновления)
   - sampleMaxW:    внутреннее разрешение анализа (меньше = стабильнее/легче)
   - edgeThreshold: порог контуров (больше = меньше линий)
   - drawScale:     масштаб вывода (по ТЗ = 2)
   - videoPadPx:    отступ от видео (чтобы точно не касались)
============================================================ */
const LINES_CFG = Object.freeze({
  desktopMinWidth: 1024,   // ПК-only
  updateFps: 24,           // внутренняя частота “кадров”
  holdFrames: 3,           // держим 3 кадра => 24/3 = 8 обновлений/сек (покадрово)

  sampleMaxW: 320,         // анализируем видео в меньшем размере
  edgeThreshold: 110,      // порог контуров (подберите 90..140)
  invert: false,           // не трогаем (оставлено на будущее)

  drawScale: 2.0,          // ✅ МАСШТАБ ×2 (по ТЗ)
  alpha: 0.95,             // непрозрачность линий

  videoPadPx: 10,          // доп. отступ от границы видео (чтобы “не касались”)
  rightPadPx: 0,           // если нужен отступ справа — поставьте, например, 20
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

  // offscreen: берём кадр видео
  const src = document.createElement("canvas");
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;

  // offscreen: результат контуров (белые линии на прозрачном)
  const edges = document.createElement("canvas");
  const ectx = edges.getContext("2d", { willReadFrequently: true });
  if (!ectx) return null;

  let rafId = 0;
  let w = 0, h = 0, dpr = 1;
  let lastStep = -1;

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

  function getVideoEl() {
    return document.getElementById("bg-video");
  }

  function getVideoRectPad() {
    const v = getVideoEl();
    if (!v || !v.getBoundingClientRect) return null;
    const r = v.getBoundingClientRect();
    // padding, чтобы точно не касалось видео
    const pad = LINES_CFG.videoPadPx || 0;
    return {
      left: Math.max(0, Math.floor(r.left) - pad),
      top: Math.max(0, Math.floor(r.top) - pad),
      right: Math.min(w, Math.ceil(r.right) + pad),
      bottom: Math.min(h, Math.ceil(r.bottom) + pad)
    };
  }

  // вычисляет размеры анализа по аспекту видео
  function ensureSampleSize(v) {
    const vw = v.videoWidth || 0;
    const vh = v.videoHeight || 0;
    if (vw < 2 || vh < 2) return false;

    const sw = Math.max(64, Math.min(LINES_CFG.sampleMaxW | 0, vw));
    const sh = Math.max(64, Math.round(sw * (vh / vw)));

    if (src.width !== sw || src.height !== sh) {
      src.width = sw;
      src.height = sh;
    }
    if (edges.width !== sw || edges.height !== sh) {
      edges.width = sw;
      edges.height = sh;
    }
    return true;
  }

  function buildEdgesFromVideo(v) {
    // видео должно иметь данные
    if (!v || v.readyState < 2) return false;
    if (!ensureSampleSize(v)) return false;

    const sw = src.width, sh = src.height;

    // 1) берём кадр видео в маленьком размере (это уже стабилизирует)
    sctx.clearRect(0, 0, sw, sh);
    try {
      sctx.drawImage(v, 0, 0, sw, sh);
    } catch (_) {
      return false;
    }

    // 2) читаем пиксели
    let img;
    try {
      img = sctx.getImageData(0, 0, sw, sh);
    } catch (_) {
      return false;
    }
    const data = img.data;

    // 3) grayscale
    const gray = new Uint8Array(sw * sh);
    for (let i = 0, p = 0; p < gray.length; p++, i += 4) {
      // лёгкая “киношная” яркость, чтобы края были стабильнее
      const r = data[i], g = data[i + 1], b = data[i + 2];
      gray[p] = (r * 0.2126 + g * 0.7152 + b * 0.0722) | 0;
    }

    // 4) Sobel edges (дешёвый, стабильный)
    const out = ectx.createImageData(sw, sh);
    const o = out.data;
    const thr = LINES_CFG.edgeThreshold | 0;

    // чистим альфу
    for (let i = 0; i < o.length; i += 4) o[i + 3] = 0;

    // sobel по внутренним пикселям
    for (let y = 1; y < sh - 1; y++) {
      const yoff = y * sw;
      for (let x = 1; x < sw - 1; x++) {
        const i0 = yoff + x;

        const tl = gray[i0 - sw - 1], tc = gray[i0 - sw], tr = gray[i0 - sw + 1];
        const ml = gray[i0 - 1],                 mr = gray[i0 + 1];
        const bl = gray[i0 + sw - 1], bc = gray[i0 + sw], br = gray[i0 + sw + 1];

        const gx = (-tl + tr) + (-2 * ml + 2 * mr) + (-bl + br);
        const gy = (-tl - 2 * tc - tr) + (bl + 2 * bc + br);

        // magnitude (без sqrt — стабильнее и быстрее)
        const mag = (Math.abs(gx) + Math.abs(gy)) | 0;

        if (mag >= thr) {
          const oi = i0 * 4;
          o[oi] = 255;
          o[oi + 1] = 255;
          o[oi + 2] = 255;
          o[oi + 3] = 255;
        }
      }
    }

    ectx.putImageData(out, 0, 0);
    return true;
  }

  function drawEdgesOutsideVideo() {
    ctx.clearRect(0, 0, w, h);

    const vr = getVideoRectPad();
    // если вдруг нет видео-rect — ничего не рисуем (по ТЗ: не касаться видео)
    if (!vr) return;

    // разрешённая область = всё вне видео.
    // Так как видео слева и на весь экран по высоте, по факту это “правая часть”.
    // Делаем клип на правую область: x от vr.right до конца.
    const allowedX = Math.max(0, vr.right);
    const allowedW = Math.max(0, w - allowedX - (LINES_CFG.rightPadPx || 0));
    const allowedH = h;

    if (allowedW < 10 || allowedH < 10) return;

    // вписываем/масштабируем контуры в разрешённую область
    const sw = edges.width, sh = edges.height;
    if (sw < 2 || sh < 2) return;

    // базовый scale: “вписать” в область, затем ×2 по ТЗ
    const fit = Math.min(allowedW / sw, allowedH / sh);
    const scale = Math.max(0.01, fit * (LINES_CFG.drawScale || 1));

    const dw = sw * scale;
    const dh = sh * scale;

    // центрируем внутри разрешённой области (лишнее обрежется клипом)
    const dx = allowedX + (allowedW - dw) * 0.5;
    const dy = (allowedH - dh) * 0.5;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, LINES_CFG.alpha));

    // ЖЁСТКИЙ КЛИП: только “вне видео” (в данной компоновке это правая область)
    ctx.beginPath();
    ctx.rect(allowedX, 0, allowedW, allowedH);
    ctx.clip();

    // рендерим контуры
    // (smoothing оставляем включённым — меньше “пиксельной грязи” при масштабе ×2)
    ctx.drawImage(edges, dx, dy, dw, dh);

    ctx.restore();
  }

  function renderStep(step) {
    const v = getVideoEl();
    // строим контуры из текущего видео-кадра; если не готово — просто чистим
    const ok = buildEdgesFromVideo(v);
    if (!ok) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    drawEdgesOutsideVideo();
  }

  function loop() {
    if (!shouldRunLines()) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      try { canvas.remove(); } catch (_) {}
      return;
    }

    const fps = Math.max(1, LINES_CFG.updateFps);
    const hold = Math.max(1, LINES_CFG.holdFrames);

    const tSec = (performance.now() || 0) * 0.001;
    const frame = Math.floor(tSec * fps);
    const step = Math.floor(frame / hold); // новый “рисунок” раз в hold кадров

    if (step !== lastStep) {
      lastStep = step;
      renderStep(step);
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
