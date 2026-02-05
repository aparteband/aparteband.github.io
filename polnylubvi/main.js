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

   ТЗ: “один в один” ТОЛЬКО линии с видео, любым способом.
   Реализация:
   - Видео НЕ рисуется в canvas вообще.
   - Из текущего кадра <video> берём только “белые линии” (luma-key + chroma-key),
     всё остальное прозрачное.
   - Накладываем обратно ТОЛЬКО на область видео на экране, с учётом:
     object-fit: cover + object-position (чтобы совпадало пиксель-в-пиксель).

   РЕГУЛИРОВКА:
   - updateFps / holdFrames: покадровость (например 24/3 = 8 fps обновление)
   - lumaThreshold: порог белого (выше = меньше линий)
   - softness: мягкость порога (меньше = жёстче)
   - chromaMax: отсекает “не белое” (меньше = строже белое)
============================================================ */
const LINES_CFG = Object.freeze({
  desktopMinWidth: 1024,     // PC only
  updateFps: 24,
  holdFrames: 3,             // 24/3 = 8 обновлений/сек (покадрово)

  sampleMaxW: 420,           // внутренняя ширина анализа (меньше = легче)
  lumaThreshold: 205,        // 180..230 (подбор)
  softness: 35,              // 10..60 (подбор)
  chromaMax: 38,             // 18..60 (подбор)

  alpha: 0.95                // общая непрозрачность линий
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
  // страховка, если CSS ещё не подхватился
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  // offscreen: берём кадр видео
  const src = document.createElement("canvas");
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;

  // offscreen: маска линий (белое + alpha, остальное прозрачное)
  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d", { willReadFrequently: true });
  if (!mctx) return null;

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

  function ensureSampleSize(v) {
    const vw = v.videoWidth || 0;
    const vh = v.videoHeight || 0;
    if (vw < 2 || vh < 2) return false;

    const sw = Math.max(96, Math.min(LINES_CFG.sampleMaxW | 0, vw));
    const sh = Math.max(96, Math.round(sw * (vh / vw)));

    if (src.width !== sw || src.height !== sh) {
      src.width = sw;
      src.height = sh;
    }
    if (mask.width !== sw || mask.height !== sh) {
      mask.width = sw;
      mask.height = sh;
    }
    return true;
  }

  // object-position parsing: возвращает 0..1
  function parseObjectPosition(posStr) {
    const s = (posStr || "").trim().toLowerCase();
    const parts = s.split(/\s+/).filter(Boolean);

    function kwTo01(v, isX) {
      if (v === "left") return 0;
      if (v === "center") return 0.5;
      if (v === "right") return 1;
      if (v === "top") return 0;
      if (v === "bottom") return 1;
      if (v.endsWith("%")) {
        const n = parseFloat(v);
        if (Number.isFinite(n)) return Math.max(0, Math.min(1, n / 100));
      }
      // px в object-position здесь не поддерживаем как спецслучай (редко нужно)
      return isX ? 0.5 : 0.5;
    }

    // object-position может быть 1 или 2 значений
    if (parts.length === 1) {
      // если одно значение и оно по X — Y центр
      const x = kwTo01(parts[0], true);
      return { x, y: 0.5 };
    }
    const x = kwTo01(parts[0], true);
    const y = kwTo01(parts[1], false);
    return { x, y };
  }

  // вычисляет crop (sx,sy,sw,sh) в координатах исходного видео (vw/vh),
  // как делает object-fit: cover + object-position в элементе (ew/eh)
  function computeCoverCrop(vw, vh, ew, eh, pos01) {
    const scale = Math.max(ew / vw, eh / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;

    const excessW = Math.max(0, dispW - ew);
    const excessH = Math.max(0, dispH - eh);

    const offX = excessW * (pos01.x || 0.5);
    const offY = excessH * (pos01.y || 0.5);

    const sx = offX / scale;
    const sy = offY / scale;
    const sw = ew / scale;
    const sh = eh / scale;

    return { sx, sy, sw, sh, scale };
  }

  function buildMaskFromVideoFrame(v) {
    if (!v || v.readyState < 2) return false;
    if (!ensureSampleSize(v)) return false;

    const sw = src.width, sh = src.height;

    // берём кадр в маленьком разрешении
    sctx.clearRect(0, 0, sw, sh);
    try {
      sctx.drawImage(v, 0, 0, sw, sh);
    } catch (_) {
      return false;
    }

    let img;
    try {
      img = sctx.getImageData(0, 0, sw, sh);
    } catch (_) {
      return false;
    }

    const data = img.data;
    const out = mctx.createImageData(sw, sh);
    const o = out.data;

    const thr = LINES_CFG.lumaThreshold | 0;
    const soft = Math.max(1, LINES_CFG.softness | 0);
    const chromaMax = Math.max(0, LINES_CFG.chromaMax | 0);

    // luma-key + chroma-key: берём только “белые линии”
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const max = (r > g ? (r > b ? r : b) : (g > b ? g : b));
      const min = (r < g ? (r < b ? r : b) : (g < b ? g : b));
      const chroma = max - min;

      // яркость
      const luma = (r * 0.2126 + g * 0.7152 + b * 0.0722);

      if (luma >= thr && chroma <= chromaMax) {
        // мягкий порог: чем ярче — тем плотнее линия
        const a01 = Math.max(0, Math.min(1, (luma - thr) / soft));
        const a = (a01 * 255) | 0;

        o[i] = 255;
        o[i + 1] = 255;
        o[i + 2] = 255;
        o[i + 3] = a;
      } else {
        o[i] = 0;
        o[i + 1] = 0;
        o[i + 2] = 0;
        o[i + 3] = 0;
      }
    }

    mctx.putImageData(out, 0, 0);
    return true;
  }

  function drawMaskOnVideo() {
    ctx.clearRect(0, 0, w, h);

    const v = getVideoEl();
    if (!v) return;

    // положение на экране (с учётом transform)
    const rect = v.getBoundingClientRect();
    if (!rect || rect.width < 2 || rect.height < 2) return;

    // размеры layout-бокса БЕЗ transform (важно для cover-crop)
    const ew = v.clientWidth || v.offsetWidth || rect.width;
    const eh = v.clientHeight || v.offsetHeight || rect.height;

    const vw = v.videoWidth || 0;
    const vh = v.videoHeight || 0;
    if (vw < 2 || vh < 2) return;

    // object-position берём из computedStyle (чтобы совпало с CSS)
    const cs = window.getComputedStyle(v);
    const pos = parseObjectPosition(cs.objectPosition || "50% 50%");
    const fit = (cs.objectFit || "cover").toLowerCase();

    // поддерживаем только cover (как в вашем CSS). Если вдруг не cover — рисуем full-fit.
    let crop = { sx: 0, sy: 0, sw: vw, sh: vh };
    if (fit === "cover") {
      crop = computeCoverCrop(vw, vh, ew, eh, pos);
    }

    // перевод crop из координат видео (vw/vh) в координаты sample canvas (sw/sh)
    const sw = mask.width, sh = mask.height;

    const sxS = (crop.sx / vw) * sw;
    const syS = (crop.sy / vh) * sh;
    const sWS = (crop.sw / vw) * sw;
    const sHS = (crop.sh / vh) * sh;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, LINES_CFG.alpha));

    // рисуем ТОЛЬКО линии поверх видео области
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.width, rect.height);
    ctx.clip();

    ctx.drawImage(
      mask,
      sxS, syS, sWS, sHS,          // source crop (как у video)
      rect.left, rect.top, rect.width, rect.height // destination = video box на экране
    );

    ctx.restore();
  }

  function renderStep() {
    const v = getVideoEl();
    const ok = buildMaskFromVideoFrame(v);
    if (!ok) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    drawMaskOnVideo();
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
    const step = Math.floor(frame / hold);

    if (step !== lastStep) {
      lastStep = step;
      renderStep();
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
