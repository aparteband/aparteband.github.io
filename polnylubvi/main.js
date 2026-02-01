/* ============================================================
   iOS VIEWPORT HEIGHT FIX (vh стабилизация на iOS / in-app)
   — чтобы не дёргалось при адресной строке / повороте
============================================================ */
(function () {
  if (window.__vhFixV2_polny) return;
  window.__vhFixV2_polny = true;

  let raf = 0;

  function setVhVar() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h =
        (window.visualViewport && typeof window.visualViewport.height === "number")
          ? window.visualViewport.height
          : window.innerHeight;

      document.documentElement.style.setProperty("--vh", (h * 0.01) + "px");
    });
  }

  setVhVar();

  window.addEventListener("resize", setVhVar, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setVhVar, { passive: true });
    window.visualViewport.addEventListener("scroll", setVhVar, { passive: true });
  }
})();

/* ============================================================
   Anti double-tap zoom (мягко, чтобы не ломать ссылки)
============================================================ */
(function () {
  if (window.__antiDoubleTap_polny) return;
  window.__antiDoubleTap_polny = true;

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    function (e) {
      const now = Date.now();
      const dt = now - lastTouchEnd;
      lastTouchEnd = now;

      // если очень быстрый повтор — предотвращаем зум
      // но не блокируем стандартные элементы ввода
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : "";
      if (dt < 300 && tag !== "input" && tag !== "textarea" && tag !== "select") {
        e.preventDefault();
      }
    },
    { passive: false }
  );
})();

/* ============================================================
   Video autoplay safety (iOS иногда требует “пинка”)
============================================================ */
(function () {
  const v = document.getElementById("bgVideo");
  if (!v) return;

  // На всякий случай
  v.muted = true;
  v.playsInline = true;
  v.loop = true;

  function tryPlay() {
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  // пробуем сразу
  tryPlay();

  // если iOS заблокировал — стартуем на первом жесте
  const unlock = () => {
    tryPlay();
    window.removeEventListener("pointerdown", unlock, { passive: true });
    window.removeEventListener("touchstart", unlock, { passive: true });
  };

  window.addEventListener("pointerdown", unlock, { passive: true, once: true });
  window.addEventListener("touchstart", unlock, { passive: true, once: true });

  // при возврате на вкладку
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryPlay();
  });
})();
