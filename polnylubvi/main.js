/* ============================================================
   iOS/IN-APP stable VH (как в "замке": не даём адресной строке дергать геометрию)
   — держим максимум высоты по ориентации
============================================================ */
(function () {
  if (window.__vhFixPolnyLubviV1) return;
  window.__vhFixPolnyLubviV1 = true;

  const maxByOri = { portrait: 0, landscape: 0 };

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

  function update() {
    const ori = getOriKey();
    const h = readH();

    if (!maxByOri[ori] || h > maxByOri[ori]) maxByOri[ori] = h;
    apply(maxByOri[ori] || h);
  }

  update();
  window.addEventListener("resize", update);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", update);
    window.visualViewport.addEventListener("scroll", update);
  }
  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      // при смене ориентации пересобираем максимум заново
      maxByOri.portrait = 0;
      maxByOri.landscape = 0;
      update();
    }, 60);
  });
})();

/* ============================================================
   Anti double-tap zoom (доп. страховка)
============================================================ */
(function () {
  if (window.__antiDoubleTapV1) return;
  window.__antiDoubleTapV1 = true;

  document.addEventListener("dblclick", (e) => {
    e.preventDefault();
  }, { passive: false });

  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
  }, { passive: false });
})();

/* ============================================================
   Warm assets (быстрее после перехода)
============================================================ */
(function () {
  const imgs = [
    "release_title.png",
    "yandex.png",
    "vk.png",
    "kion.png",
    "zvuk.png",
    "apple.png",
    "spotify.png"
  ];

  try {
    imgs.forEach((src) => {
      const im = new Image();
      im.decoding = "async";
      im.loading = "eager";
      im.src = src;
      if (typeof im.decode === "function") im.decode().catch(() => {});
    });
  } catch (_) {}

  // видео: принудительно дергаем load, чтобы оно начало качаться сразу
  try {
    const v = document.getElementById("bg-video");
    if (v) {
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.load();

      // autoplay на iOS иногда требует микрожеста; но т.к. muted+inline — обычно ок.
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch (_) {}
})();

/* ============================================================
   Normalize icon sizes (оптическая соразмерность без искажений)
   — анализируем PNG по альфа-пикселям и подбираем единый scale
============================================================ */
(function () {
  if (window.__iconNormalizeV1) return;
  window.__iconNormalizeV1 = true;

  const ICON_SEL = ".stream-icon";
  const TARGET_H = 34; // должен соответствовать CSS height (desktop)

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function measureAlphaBounds(img) {
    return new Promise((resolve) => {
      try {
        const iw = img.naturalWidth || 0;
        const ih = img.naturalHeight || 0;
        if (!iw || !ih) return resolve(null);

        // уменьшим для скорости
        const maxW = 420;
        const s = Math.min(1, maxW / iw);
        const w = Math.max(1, Math.round(iw * s));
        const h = Math.max(1, Math.round(ih * s));

        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const data = ctx.getImageData(0, 0, w, h).data;

        let top = h, bottom = -1;

        // порог по альфе — чтобы шум/полупрозрачность тоже учитывалась, но не фон
        const A_THR = 10;

        for (let y = 0; y < h; y++) {
          let rowHas = false;
          const row = y * w * 4;
          for (let x = 0; x < w; x++) {
            const a = data[row + x * 4 + 3];
            if (a > A_THR) { rowHas = true; break; }
          }
          if (rowHas) {
            if (y < top) top = y;
            bottom = y;
          }
        }

        if (bottom < 0) return resolve(null);

        const contentH = Math.max(1, bottom - top + 1);
        resolve({ contentH, scale: 1 / s }); // scale обратно к оригиналу не нужен, но оставим
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function normalize() {
    const icons = Array.from(document.querySelectorAll(ICON_SEL));
    if (!icons.length) return;

    // ждём загрузку/декод
    await Promise.all(icons.map((img) => {
      return new Promise((r) => {
        if (img.complete && img.naturalWidth > 0) return r();
        img.addEventListener("load", () => r(), { once: true });
        img.addEventListener("error", () => r(), { once: true });
      });
    }));

    const measures = [];
    for (const img of icons) {
      const m = await measureAlphaBounds(img);
      if (m && isFinite(m.contentH)) measures.push({ img, contentH: m.contentH });
    }
    if (!measures.length) return;

    // целевая высота контента — медиана (устойчиво к выбросам)
    const hs = measures.map(x => x.contentH).sort((a,b)=>a-b);
    const mid = hs[Math.floor(hs.length / 2)] || hs[0] || TARGET_H;

    for (const it of measures) {
      // scale делаем ОДИНАКОВЫМ по осям (не растягиваем)
      let k = mid / it.contentH;

      // чтобы не улетало
      k = clamp(k, 0.82, 1.22);

      it.img.style.setProperty("--icon-scale", String(k));
    }
  }

  // запуск
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalize, { once: true });
  } else {
    normalize();
  }

  // при поворотах / изменении --vh можно пересчитать (иконки не меняются, но пусть будет безопасно)
  window.addEventListener("orientationchange", () => setTimeout(normalize, 80));
})();
