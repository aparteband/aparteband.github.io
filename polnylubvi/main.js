/* ============================================================
   iOS / in-app STABLE VH (без дерганий адресной строки)
   - держим максимум по ориентации
   - при повороте — окно стабилизации (~750ms), берём максимум
============================================================ */
(function () {
  if (window.__vhFixPolnyV1) return;
  window.__vhFixPolnyV1 = true;

  const maxByOri = { portrait: 0, landscape: 0 };

  let settling = false;
  let settleOri = "portrait";
  let settleMax = 0;
  let settleT0 = 0;
  let settleRAF = 0;

  function getOriKey() {
    try {
      if (window.matchMedia && window.matchMedia("(orientation: portrait)").matches) return "portrait";
    } catch (_) {}
    const w = (window.visualViewport && typeof window.visualViewport.width === "number")
      ? window.visualViewport.width
      : (document.documentElement.clientWidth || window.innerWidth || 1);
    const h = (window.visualViewport && typeof window.visualViewport.height === "number")
      ? window.visualViewport.height
      : (window.innerHeight || 1);
    return (h >= w) ? "portrait" : "landscape";
  }

  function readH() {
    const vv = window.visualViewport;
    const h = (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;
    return Math.max(1, h);
  }

  function apply(pxH) {
    document.documentElement.style.setProperty("--vh", (pxH * 0.01) + "px");
  }

  function updateMaxFor(ori, h) {
    const prev = maxByOri[ori] || 0;
    if (!prev || h > prev) maxByOri[ori] = h;
  }

  function endSettle(commitOri) {
    settling = false;
    if (!settleMax) settleMax = maxByOri[commitOri] || readH();
    updateMaxFor(commitOri, settleMax);
    apply(settleMax);
  }

  function settleLoop() {
    if (!settling) { settleRAF = 0; return; }

    const h = readH();
    if (h > settleMax) settleMax = h;

    apply(settleMax);

    const dt = performance.now() - settleT0;
    if (dt >= 750) {
      endSettle(settleOri);
      settleRAF = 0;
      return;
    }

    settleRAF = requestAnimationFrame(settleLoop);
  }

  function beginSettle(ori) {
    settling = true;
    settleOri = ori;
    settleMax = 0;
    settleT0 = performance.now();

    if (settleRAF) cancelAnimationFrame(settleRAF);
    settleRAF = requestAnimationFrame(settleLoop);
  }

  function onResizeLike() {
    const ori = getOriKey();
    const h = readH();

    if (settling) {
      if (h > settleMax) settleMax = h;
      return;
    }

    updateMaxFor(ori, h);
    apply(maxByOri[ori] || h);
  }

  (function init() {
    const ori = getOriKey();
    const h = readH();
    updateMaxFor(ori, h);
    apply(maxByOri[ori] || h);
  })();

  window.addEventListener("resize", onResizeLike);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResizeLike);
    window.visualViewport.addEventListener("scroll", onResizeLike);
  }

  window.addEventListener("pageshow", () => {
    const ori = getOriKey();
    beginSettle(ori);
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => beginSettle(getOriKey()), 60);
  });
})();

/* ============================================================
   VIDEO autoplay страховка (iOS иногда требует жеста даже на muted)
============================================================ */
(function () {
  const v = document.getElementById("left-video");
  if (!v) return;

  function tryPlay() {
    try {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  // пробуем сразу
  if (document.readyState === "complete" || document.readyState === "interactive") {
    tryPlay();
  } else {
    document.addEventListener("DOMContentLoaded", tryPlay, { once: true });
  }

  // при возврате/фокусе
  window.addEventListener("pageshow", tryPlay, true);
  window.addEventListener("focus", tryPlay, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryPlay();
  }, true);

  // первый жест пользователя
  const GESTURE_EVT =
    window.PointerEvent ? "pointerdown" :
    (("ontouchstart" in window) ? "touchstart" : "mousedown");

  document.addEventListener(GESTURE_EVT, tryPlay, { passive: true, capture: true, once: true });
})();

/* ============================================================
   Anti double-tap zoom fallback (мягко, без ломания ссылок)
============================================================ */
(function () {
  let last = 0;
  document.addEventListener("touchend", function (e) {
    const now = Date.now();
    if (now - last <= 280) {
      // если это не клик по ссылке — гасим двойной тап
      const t = e.target;
      const isLink = !!(t && t.closest && t.closest("a"));
      if (!isLink) {
        try { e.preventDefault(); } catch (_) {}
      }
    }
    last = now;
  }, { passive: false });
})();
