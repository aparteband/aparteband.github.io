/* ============================================================
   iOS / in-app VIEWPORT HEIGHT FIX (vh стабилизация)
   — адресная строка не дергает геометрию
   — ориентация: портрет/ландшафт со своим baseline
============================================================ */
(function () {
  if (window.__vhFixPolnyV1) return;
  window.__vhFixPolnyV1 = true;

  const frozenByOri = { portrait: 0, landscape: 0 };
  const maxByOri = { portrait: 0, landscape: 0 };

  let settling = false;
  let settleOri = "portrait";
  let settleMax = 0;
  let settleT0 = 0;
  let settleRAF = 0;

  let appStarted = false; // “заморозка” после первого жеста (чтобы адресбар не влиял)

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

  function ensureFrozenFor(ori) {
    if (!appStarted) return false;
    if (!frozenByOri[ori]) {
      const h = maxByOri[ori] || readH();
      frozenByOri[ori] = h;
      updateMaxFor(ori, h);
    }
    apply(frozenByOri[ori]);
    return true;
  }

  function endSettle(commitOri) {
    settling = false;

    if (!settleMax) settleMax = maxByOri[commitOri] || readH();

    frozenByOri[commitOri] = settleMax;
    updateMaxFor(commitOri, settleMax);
    apply(frozenByOri[commitOri]);
  }

  function settleLoop() {
    if (!settling) { settleRAF = 0; return; }

    const h = readH();
    if (h > settleMax) settleMax = h;

    // во время стабилизации применяем только растущий максимум
    apply(settleMax);

    const dt = performance.now() - settleT0;

    // окно стабилизации (in-app после поворота/адресбара)
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

    // До “старта”: живём по максимуму
    if (!appStarted) {
      updateMaxFor(ori, h);
      apply(maxByOri[ori] || h);
      return;
    }

    // После “старта”: адресная строка/клава не должны менять геометрию
    ensureFrozenFor(ori);
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
    const ori = getOriKey();
    if (appStarted) beginSettle(ori);
    else onResizeLike();
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      const ori = getOriKey();
      if (!appStarted) onResizeLike();
      else beginSettle(ori);
    }, 60);
  });

  // “Старт” = первый жест пользователя (после него фиксируем геометрию)
  const GESTURE_EVT =
    window.PointerEvent ? "pointerdown" :
    (("ontouchstart" in window) ? "touchstart" : "mousedown");

  document.addEventListener(GESTURE_EVT, () => {
    if (appStarted) return;
    appStarted = true;
    const ori = getOriKey();
    ensureFrozenFor(ori);
  }, { passive: true, capture: true });
})();

/* ============================================================
   VIDEO: страховка autoplay на некоторых браузерах
   - muted + playsinline уже стоят
============================================================ */
(function () {
  const v = document.getElementById("pl-video");
  if (!v) return;

  function tryPlay() {
    try {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  // при появлении страницы
  tryPlay();

  // после жеста (если браузер душит autoplay)
  const GESTURE_EVT =
    window.PointerEvent ? "pointerdown" :
    (("ontouchstart" in window) ? "touchstart" : "mousedown");

  document.addEventListener(GESTURE_EVT, tryPlay, { passive: true, capture: true });
  window.addEventListener("focus", tryPlay, true);
  window.addEventListener("pageshow", tryPlay, true);
})();
