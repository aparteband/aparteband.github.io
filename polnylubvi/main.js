/* ============================================================
   iOS / in-app STABLE VIEWPORT HEIGHT FIX (max-per-orientation)
   — предотвращает “дёрганье” композиции при адресной строке/панелях
   — адаптивно к повороту: окно стабилизации берёт максимум и фиксирует
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
    const vv = window.visualViewport;
    const w = (vv && typeof vv.width === "number") ? vv.width : (document.documentElement.clientWidth || window.innerWidth || 1);
    const h = (vv && typeof vv.height === "number") ? vv.height : (window.innerHeight || 1);
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

    maxByOri[commitOri] = Math.max(maxByOri[commitOri] || 0, settleMax);
    apply(maxByOri[commitOri]);

    // чтобы всё “схлопнулось” без рывка после ориентации
    try { window.dispatchEvent(new Event("polny:vh-applied")); } catch (_) {}
  }

  function settleLoop() {
    if (!settling) { settleRAF = 0; return; }

    const h = readH();
    if (h > settleMax) settleMax = h;

    // во время стабилизации применяем только растущий максимум
    apply(settleMax);

    const dt = performance.now() - settleT0;

    // окно стабилизации (in-app/ios)
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

    // всегда держим максимум и не уменьшаем (адресная строка не дёргает композицию)
    updateMaxFor(ori, h);
    apply(maxByOri[ori] || h);
  }

  // первичная установка
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
    // pageshow в in-app может быть “переходом”
    beginSettle(getOriKey());
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => beginSettle(getOriKey()), 60);
  });
})();

/* ============================================================
   VIDEO AUTOPLAY GUARD
   — autoplay muted playsinline обычно стартует сам
   — если браузер заблокирует — стартуем при первом жесте
============================================================ */
(function () {
  const v = document.getElementById("shot");
  if (!v) return;

  function tryPlay() {
    try {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => {}).catch(() => {});
      }
    } catch (_) {}
  }

  // пробуем сразу
  tryPlay();

  // если не получилось — дёрнем при первом жесте
  const GESTURE_EVT =
    window.PointerEvent ? "pointerdown" :
    (("ontouchstart" in window) ? "touchstart" : "mousedown");

  let armed = true;
  function onFirstGesture() {
    if (!armed) return;
    armed = false;
    tryPlay();
    document.removeEventListener(GESTURE_EVT, onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
  }

  document.addEventListener(GESTURE_EVT, onFirstGesture, { passive: true, capture: true });
  document.addEventListener("keydown", onFirstGesture, true);
})();
