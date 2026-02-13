/* ============================================================
   polnylubvi — DOM is generated here.
   ЗАМЕНА ПРОЕКЦИИ НА ВИДЕО (без canvas, без рендеринга)
   - Внешне как у проекции справа
   - Без "спуска вниз во времени"
============================================================ */

/* ---------- CONFIG ---------- */
const CFG = Object.freeze({
  videoSrc: "video.mp4"
});

/* ---------- PROJECTION-LIKE GEOMETRY (как было у проекции) ---------- */
const PROJ_CFG = Object.freeze({
  minDesktopWidth: 720,   // запуск на ПК-окнах
  avoidVideoPadPx: 14,    // как было
  fadeEdgePx: 170,        // как было
  yOffsetPct: 0.20,       // как было (СТАТИЧНО)
  drawScale: 2.0,         // как было (x2)
  panelOverlapPct: 0.10,  // как было в твоей логике
  panelWidthFactor: 0.5   // "в 2 раза уже" как было у тебя
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
  try {
    return new URL(name, window.location.href).toString();
  } catch (_) {
    return name;
  }
}

function getViewportSize() {
  const vv = window.visualViewport;
  const w = (vv && typeof vv.width === "number") ? vv.width : window.innerWidth;
  const h = (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

function shouldRunDesktop() {
  // мобилу не трогаем
  try {
    const isMobileCoarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isMobileCoarse) return false;
  } catch (_) {}
  return (window.innerWidth || 0) >= (PROJ_CFG.minDesktopWidth || 0);
}

function readCssNumberVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseFloat(String(v).trim());
    return Number.isFinite(n) ? n : fallback;
  } catch (_) {
    return fallback;
  }
}

/* ============================================================
   iOS/IN-APP VIEWPORT HEIGHT FIX
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
   BUILD DOM
============================================================ */
(function build() {
  const app = byId("app");
  if (!app) return;

  injectPreload(resolveLocal(CFG.videoSrc), "video", "video/mp4");

  const stage = document.createElement("div");
  stage.id = "stage";

  // невидимый якорь (чтобы сохранить геометрию проекции как раньше)
  const anchor = document.createElement("div");
  anchor.id = "video-anchor";

  // область проекции справа
  const projWrap = document.createElement("div");
  projWrap.id = "proj-wrap";

  // видео внутри области проекции
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

  projWrap.appendChild(video);

  // розовая плашка
  const panel = document.createElement("div");
  panel.id = "pink-panel";
  panel.setAttribute("aria-hidden", "true");

  stage.appendChild(anchor);
  stage.appendChild(projWrap);
  stage.appendChild(panel);
  app.appendChild(stage);

  function applyMode() {
    const run = shouldRunDesktop();
    projWrap.style.display = run ? "block" : "none";
    anchor.style.display = run ? "block" : "none";
  }

  function updateLayout() {
    if (!shouldRunDesktop()) return;

    const { w, h } = getViewportSize();
    if (w < 2 || h < 2) return;

    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 2 || vh < 2) return;

    // учёт desk scale как было у исходного скрытого видео
    const deskScale = readCssNumberVar("--desk-video-scale", 1.0);

    // ширина "исходного видео" как в старом CSS (height=100vh, width=auto)
    const aspect = vw / vh;
    const anchorW = Math.max(0, Math.round(h * aspect * (Number.isFinite(deskScale) ? deskScale : 1)));

    anchor.style.width = anchorW + "px";

    // левая граница "проекции" как раньше: right(anchor) + pad
    const projLeft = Math.min(w, Math.max(0, anchorW + (PROJ_CFG.avoidVideoPadPx | 0)));

    // CSS vars для проекции
    document.documentElement.style.setProperty("--proj-left", projLeft + "px");
    document.documentElement.style.setProperty("--proj-fade", (PROJ_CFG.fadeEdgePx | 0) + "px");
    document.documentElement.style.setProperty("--proj-scale", String(PROJ_CFG.drawScale || 1));

    // статический yOffset (БЕЗ спуска во времени)
    const yShiftPx = Math.round(h * (PROJ_CFG.yOffsetPct || 0));
    document.documentElement.style.setProperty("--proj-y-shift", yShiftPx + "px");

    // ширина плашки — оставляю твою логику как была
    const allowedW = Math.max(0, w - projLeft);
    const basePx = Math.max(0, Math.min(w, Math.round(projLeft + allowedW * (PROJ_CFG.panelOverlapPct || 0))));
    const panelW = Math.max(0, Math.round(basePx * (PROJ_CFG.panelWidthFactor || 1)));
    panel.style.width = panelW + "px";
  }

  // autoplay страховка
  function tryPlay() {
    try {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  // порядок: режим → попытка play → layout по метаданным
  applyMode();
  tryPlay();

  video.addEventListener("loadedmetadata", () => {
    applyMode();
    updateLayout();
  }, { passive: true });

  video.addEventListener("loadeddata", updateLayout, { passive: true });
  video.addEventListener("canplay", updateLayout, { passive: true });

  function onResize() {
    applyMode();
    updateLayout();
  }

  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
  }
  window.addEventListener("pageshow", onResize);

  const GESTURE_EVT = window.PointerEvent
    ? "pointerdown"
    : (("ontouchstart" in window) ? "touchstart" : "mousedown");
  window.addEventListener(GESTURE_EVT, tryPlay, { passive: true, once: true });
})();
