/* ============================================================
   iOS VIEWPORT HEIGHT FIX (стабилизация vh без дерганий)
   — держим максимум по ориентации, не уменьшаем при адресной строке
============================================================ */
(function () {
  if (window.__vhFixPolnyLubvi) return;
  window.__vhFixPolnyLubvi = true;

  const docEl = document.documentElement;

  function getOriKey() {
    return (window.innerWidth >= window.innerHeight) ? "landscape" : "portrait";
  }

  const maxByOri = { portrait: 0, landscape: 0 };
  let lastOri = getOriKey();
  let settleTimer = null;

  function measureH() {
    const vv = window.visualViewport;
    return (vv && typeof vv.height === "number") ? vv.height : window.innerHeight;
  }

  function applyMaxVh() {
    const ori = getOriKey();
    const h = measureH();

    if (ori !== lastOri) {
      lastOri = ori;
      maxByOri[ori] = 0;
    }

    if (h > maxByOri[ori]) maxByOri[ori] = h;

    const used = maxByOri[ori] || h;
    docEl.style.setProperty("--vh", (used * 0.01) + "px");
  }

  function onResizeAny() {
    // не уменьшаем, только обновляем максимум
    applyMaxVh();
  }

  function onOrientationChange() {
    // даём устройству стабилизироваться и собрать максимальную высоту
    if (settleTimer) clearTimeout(settleTimer);

    maxByOri.portrait = 0;
    maxByOri.landscape = 0;
    applyMaxVh();

    const start = Date.now();
    (function tick() {
      applyMaxVh();
      if (Date.now() - start < 800) {
        requestAnimationFrame(tick);
      }
    })();

    settleTimer = setTimeout(applyMaxVh, 850);
  }

  applyMaxVh();
  window.addEventListener("resize", onResizeAny, { passive: true });
  window.addEventListener("orientationchange", onOrientationChange, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResizeAny, { passive: true });
    window.visualViewport.addEventListener("scroll", onResizeAny, { passive: true });
  }
})();

/* ============================================================
   ТРАЙЛИНГ-СЛЭШ (чтобы относительные пути не ломались)
============================================================ */
(function () {
  const p = window.location.pathname;
  if (/\/polnylubvi$/.test(p)) {
    window.location.replace(p + "/" + window.location.search + window.location.hash);
  }
})();

/* ============================================================
   PRELOAD/WARMUP (быстрее после перехода с главной)
============================================================ */
(function () {
  const imgs = [
    "./release_title.png",
    "./spotify.png",
    "./apple.png",
    "./zvuk.png",
    "./kion.png",
    "./vk.png",
    "./yandex.png"
  ];

  imgs.forEach((src) => {
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    if (im.decode) im.decode().catch(() => {});
  });

  const v = document.getElementById("clip");
  if (!v) return;

  // на iOS иногда autoplay всё равно требует жест — подстрахуемся
  const tryPlay = () => v.play().catch(() => {});
  tryPlay();

  const once = () => {
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("touchstart", once);
    tryPlay();
  };

  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("touchstart", once, { passive: true });
})();
