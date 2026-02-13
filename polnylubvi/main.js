/* ============================================================
   polnylubvi — VIDEO INSTEAD OF PROJECTION (NO CANVAS)
   ТЗ:
   - внешне как прежняя “проекция справа”
   - вместо рендеринга (canvas/getImageData) — обычное видео
   - x2 масштаб как было (drawScale)
   - y ниже как было (yOffsetPct=0.20), БЕЗ спуска во времени
   - мягкий стык слева (fadeEdgePx)
============================================================ */

/* ---------- CONFIG ---------- */
const CFG = Object.freeze({
  videoSrc: "video.mp4"
});

/* ---------- GEOMETRY (как было у проекции) ---------- */
const PROJ = Object.freeze({
  minDesktopWidth: 720,
  avoidVideoPadPx: 14,
  rightPadPx: 0,

  drawScale: 2.0,     // как было
  yOffsetPct: 0.30,   // как было (ниже), СТАТИЧНО
  fadeEdgePx: 170,    // как было

  panelOverlapPct: 0.10,  // плашка заходит на “проекцию” на 10%
  panelWidthFactor: 0.5   // “в 2 раза уже”
});

/* ---------- HELPERS ---------- */
function byId(id){ return document.getElementById(id); }

function injectPreload(href, as, type){
  try{
    const l = document.createElement("link");
    l.rel = "preload";
    l.as = as;
    l.href = href;
    if (type) l.type = type;
    document.head.appendChild(l);
  }catch(_){}
}

function resolveLocal(name){
  try{ return new URL(name, window.location.href).toString(); }
  catch(_){ return name; }
}

function getViewport(){
  const vv = window.visualViewport;
  const w = (vv && typeof vv.width === "number") ? vv.width : window.innerWidth;
  const h = (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

function readRootVarNumber(name, fallback){
  try{
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseFloat(String(v).trim());
    return Number.isFinite(n) ? n : fallback;
  }catch(_){
    return fallback;
  }
}

function shouldRunDesktop(){
  try{
    const isMobileCoarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isMobileCoarse) return false;
  }catch(_){}
  return (window.innerWidth || 0) >= PROJ.minDesktopWidth;
}

/* object-fit: cover crop, как в твоём старом коде */
function computeCoverCrop(vw, vh, ew, eh, pos01){
  const scale = Math.max(ew / vw, eh / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;

  const excessW = Math.max(0, dispW - ew);
  const excessH = Math.max(0, dispH - eh);

  const offX = excessW * (pos01.x ?? 0.5);
  const offY = excessH * (pos01.y ?? 0.5);

  const sx = offX / scale;
  const sy = offY / scale;
  const sw = ew / scale;
  const sh = eh / scale;

  return { sx, sy, sw, sh };
}

/* ============================================================
   iOS/IN-APP VIEWPORT HEIGHT FIX
============================================================ */
(function vhFix(){
  if (window.__vhFixPolnyLubviV1) return;
  window.__vhFixPolnyLubviV1 = true;

  function setVh(){
    const vv = window.visualViewport;
    const h = (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--vh", (Math.max(1, h) * 0.01) + "px");
  }

  setVh();
  window.addEventListener("resize", setVh);
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", setVh);
    window.visualViewport.addEventListener("scroll", setVh);
  }
  window.addEventListener("pageshow", setVh);
})();

/* ============================================================
   BUILD
============================================================ */
(function build(){
  const app = byId("app");
  if (!app) return;

  injectPreload(resolveLocal(CFG.videoSrc), "video", "video/mp4");

  const stage = document.createElement("div");
  stage.id = "stage";

  const projWrap = document.createElement("div");
  projWrap.id = "proj-wrap";

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

  const panel = document.createElement("div");
  panel.id = "pink-panel";
  panel.setAttribute("aria-hidden", "true");

  stage.appendChild(projWrap);
  stage.appendChild(panel);
  app.appendChild(stage);
// мягкое появление плашки (fade-in)
try {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    panel.classList.add("is-shown");
  } else {
    requestAnimationFrame(() => panel.classList.add("is-shown"));
  }
} catch (_) {
  panel.classList.add("is-shown");
}


  // fade width в CSS var
  document.documentElement.style.setProperty("--fadeEdgePx", (PROJ.fadeEdgePx | 0) + "px");

  function applyMode(){
    const run = shouldRunDesktop();
    projWrap.style.display = run ? "block" : "none";
  }

  function updateLayout(){
    if (!shouldRunDesktop()) return;

    const { w, h } = getViewport();
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 2 || vh < 2) return;

    // “левая видео-область”, относительно которой считалась проекция раньше
    // (height=100vh, width=auto) + desk scale
    const deskScale = readRootVarNumber("--desk-video-scale", 1.0);
    const anchorH = h;
    const anchorW = Math.max(1, Math.round(anchorH * (vw / vh) * (Number.isFinite(deskScale) ? deskScale : 1)));

    // правая область (проекция)
    const allowedX = Math.min(w, Math.max(0, anchorW + (PROJ.avoidVideoPadPx | 0)));
    const allowedW = Math.max(0, w - allowedX - (PROJ.rightPadPx | 0));
    const allowedH = h;

    projWrap.style.left = allowedX + "px";
    projWrap.style.width = allowedW + "px";
    projWrap.style.height = allowedH + "px";

    // если области нет — не рисуем
    if (allowedW < 8 || allowedH < 8) return;

    // crop как у object-fit:cover + object-position:left bottom
    const pos = { x: 0, y: 1 }; // left bottom
    const crop = computeCoverCrop(vw, vh, anchorW, anchorH, pos);

    // cover для crop -> allowed area, затем * drawScale (x2)
    const fitScale = Math.max(allowedW / crop.sw, allowedH / crop.sh);
    const scale = Math.max(0.001, fitScale * (PROJ.drawScale || 1));

    // базовое центрирование как было: (W-dw)/2, (H-dh)/2
    const dwCrop = crop.sw * scale;
    const dhCrop = crop.sh * scale;

    const baseLeft = (allowedW - dwCrop) * 0.5;
    const yShift = allowedH * (PROJ.yOffsetPct || 0); // СТАТИЧНО, без “спуска”
    const baseTop = (allowedH - dhCrop) * 0.5 + yShift;

    // превращаем crop в трансформ полного видео:
    // left = baseLeft - crop.sx*scale, top = baseTop - crop.sy*scale
    const videoLeft = baseLeft - crop.sx * scale;
    const videoTop  = baseTop  - crop.sy * scale;

    video.style.width  = Math.round(vw * scale) + "px";
    video.style.height = Math.round(vh * scale) + "px";
    video.style.left   = Math.round(videoLeft) + "px";
    video.style.top    = Math.round(videoTop) + "px";

    // ширина плашки: до начала проекции + 10% проекции, затем в 2 раза уже
    const basePanelPx = Math.max(0, Math.min(w, Math.round(allowedX + allowedW * (PROJ.panelOverlapPct || 0))));
    const panelW = Math.max(0, Math.round(basePanelPx * (PROJ.panelWidthFactor || 1)));
    panel.style.width = panelW + "px";
  }

  function tryPlay(){
    try{
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }catch(_){}
  }

  applyMode();
  tryPlay();

  // как только есть размеры видео — считаем геометрию
  video.addEventListener("loadedmetadata", () => { applyMode(); updateLayout(); }, { passive: true });
  video.addEventListener("loadeddata", updateLayout, { passive: true });
  video.addEventListener("canplay", updateLayout, { passive: true });

  function onResize(){ applyMode(); updateLayout(); }
  window.addEventListener("resize", onResize);
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
  }
  window.addEventListener("pageshow", onResize);

  const GESTURE_EVT = window.PointerEvent ? "pointerdown" : (("ontouchstart" in window) ? "touchstart" : "mousedown");
  window.addEventListener(GESTURE_EVT, tryPlay, { passive: true, once: true });
})();
