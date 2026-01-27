/* ============================================================
   iOS VIEWPORT HEIGHT FIX (vh стабилизация на iOS / in-app)
   — не меняет тайминги, только стабилизирует геометрию при смене адресной строки
============================================================ */
(function () {
  if (window.__vhFixV1) return;
  window.__vhFixV1 = true;

  function setVhVar() {
    const h =
      (window.visualViewport && typeof window.visualViewport.height === "number")
        ? window.visualViewport.height
        : window.innerHeight;

    // 1vh в px
    document.documentElement.style.setProperty("--vh", (h * 0.01) + "px");
  }

  setVhVar();
  window.addEventListener("resize", setVhVar);
  window.addEventListener("orientationchange", setVhVar);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setVhVar);
  }
})();

/* ============================================================
   HARD START GATE (жёсткая заморозка до клика Start)
============================================================ */
(function () {
  if (window.__hardStartGateV1) return;
  window.__hardStartGateV1 = true;

  const ATTR = "data-prestart";
  const STYLE_ID = "hard-start-gate-style";
  const OVERLAY_ID = "boot-overlay";
  const START_BTN_ID = "boot-start-btn";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      html[${ATTR}="1"] body > *{
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      html[${ATTR}="1"] #${OVERLAY_ID},
      html[${ATTR}="1"] #${OVERLAY_ID} *{
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
      html[${ATTR}="1"] *{
        animation-play-state: paused !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(st);
  }

  function arm() {
    ensureStyle();
    try { document.documentElement.setAttribute(ATTR, "1"); } catch (_) {}
  }

  function release() {
    ensureStyle();
    try { document.documentElement.removeAttribute(ATTR); } catch (_) {}
  }

  function api(opts) {
    const enable = !opts ? true : (opts.enable !== false);
    if (enable) arm();
    else release();
  }
  api.arm = arm;
  api.release = release;

  window.__hardStartGate = api;

  arm();

  /* ============================================================
     ВАЖНО (заход 5, strict):
     Раньше gate снимался автоматически по клику Start.
     Теперь auto-release УБРАН, release делаем только вручную
     ПОСЛЕ полной готовности ассетов (в boot-логике).
  ============================================================ */

  /* ============================================================
     FIX 1.1: возврат “Назад” после старта не должен прятать сцену навсегда
     — если приложение уже стартовало, снимаем gate (release)
     — если не стартовало, оставляем gate (arm)
  ============================================================ */
  window.addEventListener("pageshow", (ev) => {
    if (ev && ev.persisted) {
      const started = !!window.__appStarted;
      const overlayExists = !!document.getElementById(OVERLAY_ID);
      if (started || !overlayExists) release();
      else arm();
    }
  });
})();

const starsWrap = document.getElementById("stars");

/* ============================================================
   ASSET MANIFEST (STRICT, NEVER CHANGES)
   — единый фиксированный список файлов проекта (НЕ МЕНЯЕТСЯ)
============================================================ */
const ASSET_MANIFEST = Object.freeze({
  images: Object.freeze([
    "star1.png",
    "star2.png",
    "star3.png",
    "star4.png",
    "star5.png",
    "star6.png",
    "vk.png",
    "ya.png",
    "ap.png",
    "sp.png",
    "zv.png",
    "castle.png",
    "heart.png",
    "sub.png",
    "hero.png",
    "hero-mini.png",
    "sled.png",
    "gora.png"
  ]),
  audio: Object.freeze([
    "open.mp3",
    "ser.mp3",
    "zam.mp3",
    "cl.mp3",
    "bell1.mp3",
    "bell2.mp3",
    "bell3.mp3",
    "bell4.mp3",
    "bell5.mp3",
    "bell6.mp3",
    "gora.mp3"
  ])
});

/* Явные списки (без диапазонов) */
const STAR_IMAGES = Object.freeze([
  "star1.png",
  "star2.png",
  "star3.png",
  "star4.png",
  "star5.png",
  "star6.png"
]);

const STAR_COUNT = 20;

/* MOBILE UI: coarse pointer + no hover (телефон / in-app) */
const __IS_MOBILE_UI =
  !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);

/* gap на мобиле выбираю сам (по твоему разрешению):
   адаптивно от ширины экрана, чтобы иконки не слипались и всегда влезали */
function __clampNum(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function __mobileIconGapPx(w) {
  const ww = Math.max(0, Number(w) || 0);
  return __clampNum(Math.round(ww * 0.04), 10, 22);
}


const ICONS = Object.freeze([
  "vk.png",
  "ya.png",
  "ap.png",
  "sp.png",
  "zv.png"
]);

/* ============================================================
   ASSETS: IMAGE PRELOADER (STEP 2)
   — грузим и ДЕКОДИРУЕМ все картинки заранее
   — не меняем логику сцен и не трогаем места, где используются src
============================================================ */
const Assets = (function () {
  const images = new Map();          // name -> HTMLImageElement
  const imageStatus = new Map();     // name -> "loading" | "ready" | "error"

  let imagesReady = false;
  let imagesPromise = null;

  /* ============================================================
     STEP 3: AUDIO BYTES PRELOADER
     — заранее скачиваем mp3 как ArrayBuffer (БЕЗ проигрывания)
     — складываем в audioBytes: Map(name -> ArrayBuffer)
  ============================================================ */
  const audioBytes = new Map();      // name -> ArrayBuffer
  const audioStatus = new Map();     // name -> "loading" | "ready" | "error"

  let audioBytesReady = false;
  let audioBytesPromise = null;

  function __notifyImagesProgress(done, total) {
    const payload = {
      done,
      total,
      ratio: total ? (done / total) : 1
    };
    window.__assetsImagesProgress = payload;

    if (typeof window.__onAssetsImagesProgress === "function") {
      try { window.__onAssetsImagesProgress(payload); } catch (_) {}
    }
  }

  function __notifyAudioProgress(done, total) {
    const payload = {
      done,
      total,
      ratio: total ? (done / total) : 1
    };
    window.__assetsAudioProgress = payload;

    if (typeof window.__onAssetsAudioProgress === "function") {
      try { window.__onAssetsAudioProgress(payload); } catch (_) {}
    }
  }

  function preloadImages(list) {
    if (imagesPromise) return imagesPromise;

    const names = Array.isArray(list) ? list.slice() : [];
    let done = 0;
    const total = names.length;

    __notifyImagesProgress(done, total);

    const tasks = names.map((name) => {
      return new Promise((resolve) => {
        const img = new Image();
        let settled = false;

        function finish(ok) {
          if (settled) return;
          settled = true;

          if (ok) {
            images.set(name, img);
            imageStatus.set(name, "ready");
          } else {
            imageStatus.set(name, "error");
          }

          done++;
          __notifyImagesProgress(done, total);
          resolve();
        }

        img.decoding = "async";
        img.loading = "eager";

        imageStatus.set(name, "loading");

        img.addEventListener("load", async () => {
          try {
            if (typeof img.decode === "function") {
              await img.decode().catch(() => {});
            }
          } catch (_) {}
          finish(true);
        }, { once: true });

        img.addEventListener("error", () => {
          finish(false);
        }, { once: true });

        img.src = name;

        if (img.complete) {
          Promise.resolve().then(() => {
            if (!settled) finish(img.naturalWidth > 0);
          });
        }
      });
    });

    imagesPromise = Promise.all(tasks).then(() => {
      imagesReady = true;

      const errors = names.filter(n => imageStatus.get(n) === "error");
      return {
        ok: total - errors.length,
        total,
        errors
      };
    });

    return imagesPromise;
  }

  function preloadAudioBytes(list) {
    if (audioBytesPromise) return audioBytesPromise;

    const names = Array.isArray(list) ? list.slice() : [];
    let done = 0;
    const total = names.length;

    __notifyAudioProgress(done, total);

    const tasks = names.map((name) => {
      return new Promise((resolve) => {
        let settled = false;

        function finish(ok, buf) {
          if (settled) return;
          settled = true;

          if (ok && buf instanceof ArrayBuffer) {
            audioBytes.set(name, buf);
            audioStatus.set(name, "ready");
          } else {
            audioStatus.set(name, "error");
          }

          done++;
          __notifyAudioProgress(done, total);
          resolve();
        }

        audioStatus.set(name, "loading");

        (async () => {
          try {
            let res = null;

            try {
              res = await fetch(name, { cache: "force-cache" });
            } catch (_) {
              res = await fetch(name);
            }

            if (!res || !res.ok) {
              finish(false, null);
              return;
            }

            const buf = await res.arrayBuffer();
            if (!(buf instanceof ArrayBuffer)) {
              finish(false, null);
              return;
            }

            finish(true, buf);
          } catch (_) {
            finish(false, null);
          }
        })();
      });
    });

    audioBytesPromise = Promise.all(tasks).then(() => {
      audioBytesReady = true;

      const errors = names.filter(n => audioStatus.get(n) === "error");
      return {
        ok: total - errors.length,
        total,
        errors
      };
    });

    return audioBytesPromise;
  }

  function getImage(name) {
    return images.get(name) || null;
  }

  function hasImage(name) {
    return images.has(name);
  }

  function isImagesReady() {
    return imagesReady;
  }

  function getImageStatus(name) {
    return imageStatus.get(name) || "missing";
  }

  function getAudioBytes(name) {
    return audioBytes.get(name) || null;
  }

  function hasAudioBytes(name) {
    return audioBytes.has(name);
  }

  function isAudioBytesReady() {
    return audioBytesReady;
  }

  function getAudioStatus(name) {
    return audioStatus.get(name) || "missing";
  }

  function resetAll() {
    try { images.clear(); } catch (_) {}
    try { imageStatus.clear(); } catch (_) {}
    imagesReady = false;
    imagesPromise = null;

    try { audioBytes.clear(); } catch (_) {}
    try { audioStatus.clear(); } catch (_) {}
    audioBytesReady = false;
    audioBytesPromise = null;

    try { __notifyImagesProgress(0, 0); } catch (_) {}
    try { __notifyAudioProgress(0, 0); } catch (_) {}
  }

  return Object.freeze({
    images,
    preloadImages,
    getImage,
    hasImage,
    isImagesReady,
    getImageStatus,

    audioBytes,
    preloadAudioBytes,
    getAudioBytes,
    hasAudioBytes,
    isAudioBytesReady,
    getAudioStatus,

    resetAll
  });
})();

/* экспорт для отладки/следующих заходов */
window.Assets = Assets;

/* ============================================================
   AUDIO ENGINE (WEB AUDIO) — STEP 4
   — prepareAfterUserGesture() вызывается строго из клика Start
   — play(): "single" только внутри одного имени, остальные звуки не трогаем
   — bell* и cl: overlap
============================================================ */
const AudioEngine = (function () {
  const AC = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let masterGain = null;

  const buffers = new Map();        // name -> AudioBuffer
  const activeSingle = new Map();   // name -> AudioBufferSourceNode

  let prepared = false;
  let preparePromise = null;

  function _notifyDecodeProgress(done, total) {
    const payload = { done, total, ratio: total ? (done / total) : 1 };
    window.__assetsAudioDecodeProgress = payload;
    if (typeof window.__onAssetsAudioDecodeProgress === "function") {
      try { window.__onAssetsAudioDecodeProgress(payload); } catch (_) {}
    }
  }

  function _ensureContext() {
    if (ctx || !AC) return;
    try {
      ctx = new AC({ latencyHint: "interactive" });
    } catch (_) {
      ctx = new AC();
    }
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }

  function isSupported() { return !!AC; }
  function isPrepared() { return prepared; }
  function now() { return ctx ? ctx.currentTime : 0; }

  /* ============================================================
     STEP 6-min: страховка — ctx может стать suspended после сворачивания/возврата
     tryResume(): мягкая попытка resume, безопасно если ctx ещё нет
  ============================================================ */
  function tryResume() {
    if (!ctx) return Promise.resolve(false);

    if (ctx.state === "suspended") {
      try {
        const p = ctx.resume();
        if (p && typeof p.then === "function") {
          return p.then(() => true).catch(() => false);
        }
        return Promise.resolve(true);
      } catch (_) {
        return Promise.resolve(false);
      }
    }

    return Promise.resolve(ctx.state === "running");
  }

  function reset() {
    try {
      activeSingle.forEach((src) => { try { src.stop(0); } catch (_) {} });
    } catch (_) {}

    activeSingle.clear();
    buffers.clear();
    prepared = false;
    preparePromise = null;
    try { _notifyDecodeProgress(0, 0); } catch (_) {}
  }

  function _decodeArrayBuffer(ab) {
    return new Promise((resolve, reject) => {
      if (!ctx) return reject(new Error("no audio context"));
      const buf = (ab && ab.slice) ? ab.slice(0) : ab;
      try {
        const p = ctx.decodeAudioData(buf, resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  function _unlockSilently() {
    if (!ctx) return;
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(masterGain);
      s.start(ctx.currentTime);
      s.stop(ctx.currentTime + 0.01);
    } catch (_) {}
  }

  function prepareAfterUserGesture(list, getBytes) {
    if (prepared) {
      const total = Array.isArray(list) ? list.length : 0;
      try { _notifyDecodeProgress(total, total); } catch (_) {}
      return Promise.resolve({ ok: total, total, errors: [] });
    }
    if (preparePromise) return preparePromise;

    const names = Array.isArray(list) ? list.slice() : [];

    preparePromise = (async () => {
      if (!isSupported()) {
        prepared = false;
        return { ok: 0, total: names.length, errors: names.slice() };
      }

      _ensureContext();

      try { await ctx.resume(); } catch (_) {}
      _unlockSilently();

      let done = 0;
      const total = names.length;
      const errors = [];

      try { _notifyDecodeProgress(done, total); } catch (_) {}

      for (let i = 0; i < names.length; i++) {
        const name = names[i];

        if (buffers.has(name)) {
          done++;
          try { _notifyDecodeProgress(done, total); } catch (_) {}
          continue;
        }

        try {
          const ab = (typeof getBytes === "function") ? getBytes(name) : null;
          if (!(ab instanceof ArrayBuffer)) {
            errors.push(name);
            done++;
            try { _notifyDecodeProgress(done, total); } catch (_) {}
            continue;
          }

          const audioBuf = await _decodeArrayBuffer(ab);
          buffers.set(name, audioBuf);
        } catch (_) {
          errors.push(name);
        }

        done++;
        try { _notifyDecodeProgress(done, total); } catch (_) {}
      }

      prepared = (errors.length === 0);
      return { ok: total - errors.length, total, errors };
    })();

    return preparePromise;
  }

  function play(name, opts) {
    if (!ctx || !masterGain) return null;

    /* STEP 6-min: если iOS/Safari усыпили контекст — пробуем разбудить */
    if (ctx.state === "suspended") {
      try { ctx.resume(); } catch (_) {}
    }

    const buf = buffers.get(name);
    if (!buf) return null;

    const o = opts || {};
    const mode = o.mode || "overlap"; // "single" | "overlap"
    const when = (typeof o.when === "number" && isFinite(o.when)) ? o.when : ctx.currentTime;
    const volume = (typeof o.volume === "number" && isFinite(o.volume)) ? o.volume : 1;

    if (mode === "single") {
      const prev = activeSingle.get(name);
      if (prev) {
        try { prev.stop(0); } catch (_) {}
        activeSingle.delete(name);
      }
    }

    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const g = ctx.createGain();
      g.gain.value = volume;

      src.connect(g);
      g.connect(masterGain);

      src.start(when);

      if (mode === "single") activeSingle.set(name, src);

      src.onended = () => {
        if (mode === "single") {
          const cur = activeSingle.get(name);
          if (cur === src) activeSingle.delete(name);
        }
      };

      return when;
    } catch (_) {
      return null;
    }
  }

  function atTime(when, cb) {
    if (!ctx) { try { cb(); } catch (_) {} return; }

    let fired = false;
    function fireOnce() {
      if (fired) return;
      fired = true;
      try { cb(); } catch (_) {}
    }

    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
    setTimeout(fireOnce, Math.min(2147483000, delayMs + 8));

    (function rafLoop() {
      if (fired) return;
      if (!ctx) { fireOnce(); return; }
      if (ctx.currentTime >= when - 0.002) { fireOnce(); return; }
      requestAnimationFrame(rafLoop);
    })();
  }

  return Object.freeze({
    isSupported,
    isPrepared,
    now,
    tryResume,
    reset,
    prepareAfterUserGesture,
    play,
    atTime
  });

})();
window.AudioEngine = AudioEngine;

/* ============================================================
   AUDIO AUTO-RESUME GUARD — STEP 6-min
============================================================ */
(function () {
  if (window.__audioAutoResumeGuardV1) return;
  window.__audioAutoResumeGuardV1 = true;

  function kick() {
    try {
      if (window.AudioEngine && typeof window.AudioEngine.tryResume === "function") {
        window.AudioEngine.tryResume();
      }
    } catch (_) {}
  }

  window.addEventListener("pageshow", kick, true);
  window.addEventListener("focus", kick, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) kick();
  }, true);

  const GESTURE_EVT =
    window.PointerEvent ? "pointerdown" :
    (("ontouchstart" in window) ? "touchstart" : "mousedown");

  document.addEventListener(GESTURE_EVT, kick, { passive: true, capture: true });
  document.addEventListener("keydown", kick, true);
})();

/* стартуем “тихую” предзагрузку картинок сразу при загрузке страницы */
try {
  Assets.preloadImages(ASSET_MANIFEST.images);
} catch (_) {}

try {
  Assets.preloadAudioBytes(ASSET_MANIFEST.audio);
} catch (_) {}

/* ============================================================
   INPUT EVENT (FIX 1.2): единый “тап/клик” без дублей
============================================================ */
const __TAP_EVT = (window.PointerEvent ? "pointerup" : "click");

/* ============================================================
   SAFE EXTERNAL OPEN (NO DOUBLE-NAV)
============================================================ */
function __openExternalBlank(url) {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.style.top = "-9999px";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (_) {}
}

/* ============================================================
   AUDIO: HEART (ser.mp3) — WebAudio
============================================================ */
function playSerOnce() {
  try {
    AudioEngine.play("ser.mp3", { mode: "single" });
  } catch (_) {}
}

/* ---------- СОСТОЯНИЕ МИРА ---------- */
const WorldState = {
  mode: "idle",
  locked: false,
  fxBusyCount: 0,
  autoActivationEnabled: true,
  runCompleted: false
};

/* ---------- FX BUSY ---------- */
function fxBegin() {
  WorldState.fxBusyCount = (WorldState.fxBusyCount || 0) + 1;
}
function fxEnd() {
  WorldState.fxBusyCount = Math.max(0, (WorldState.fxBusyCount || 0) - 1);
  if (typeof window.__hintMaybeStartIdle === "function") {
    window.__hintMaybeStartIdle();
  }
}
function isFxBusy() {
  return !!(WorldState.fxBusyCount > 0);
}

/* ---------- SFX: ZAMOK (zam.mp3) — WebAudio ---------- */
function playZamSfxOnce() {
  try {
    AudioEngine.play("zam.mp3", { mode: "single" });
  } catch (_) {}
}

/* ---------- COOLDOWN ---------- */
const SPECIAL_COOLDOWN = 120000;
let lastCastleFoundTime = 0;
let lastHeartFoundTime = 0;

let castleIndex = Math.floor(Math.random() * STAR_COUNT);
let heartIndex;
do {
  heartIndex = Math.floor(Math.random() * STAR_COUNT);
} while (heartIndex === castleIndex);

/* ---------- УТИЛИТЫ ---------- */
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function canShowCastle() {
  return Date.now() - lastCastleFoundTime >= SPECIAL_COOLDOWN;
}
function canShowHeart() {
  return Date.now() - lastHeartFoundTime >= SPECIAL_COOLDOWN;
}

/* ---------- БЛОКИРОВКА КЛИКОВ ПО ЗВЁЗДАМ НА ВРЕМЯ FX ---------- */
function setStarsClicksBlocked(blocked) {
  WorldState.locked = !!blocked;
  document.querySelectorAll(".star").forEach(s => {
    s.style.pointerEvents = blocked ? "none" : "";
  });
}

/* ---------- BELL SFX (обычные звёзды) — WebAudio ---------- */
const BELL_SOURCES = [
  "bell1.mp3",
  "bell2.mp3",
  "bell3.mp3",
  "bell4.mp3",
  "bell5.mp3",
  "bell6.mp3"
];

const __bellByStarIndex = Array.from({ length: STAR_COUNT }, (_, idx) => {
  return BELL_SOURCES[idx % BELL_SOURCES.length];
});

function playBellForIndex(i) {
  const src = __bellByStarIndex[i] || BELL_SOURCES[0];
  try {
    AudioEngine.play(src, { mode: "overlap" });
  } catch (_) {}
}

/* ============================================================
   STAR CACHE + RAF GUARD
============================================================ */
let __starsCache = [];
let __starForcesRAF = 0;

/* ---------- СОЗДАНИЕ ЗВЁЗД ---------- */
function createStars() {
  starsWrap.innerHTML = "";

  const w = window.innerWidth;
  const h = window.innerHeight;
  const maxStarY = h - Math.max(90, h * 0.1);

  const heroRadius = Math.min(w, h) * 0.35;
  const heroX = w / 2;
  const heroY = h / 2;

  const FINAL_STAR_CX = w * 0.08;
  const FINAL_STAR_CY = h * 0.055;
  const FINAL_STAR_KEEP_OUT_PX = (2 * 96) / 2.54;

  // --- Mobile sizing (удобно нажимать, но без гигантов) ---
  const vmin = Math.min(w, h);

  // диапазон размеров звезды (px) на мобиле:
  // iPhone 13 (390px vmin): ~47..86px (удобно тапать, не "монстры")
  let mobMin = 30, mobMax = 80;
  let mobGap0 = 20;
  let mobKeepOutScale = 1;

  if (__IS_MOBILE_UI) {
    const clamp = (val, a, b) => Math.max(a, Math.min(b, val));

    mobMin = clamp(Math.round(vmin * 0.12), 44, 60);
    mobMax = clamp(Math.round(vmin * 0.22), 72, 110);

    // базовый gap (разнос звёзд) на мобиле
    mobGap0 = clamp(Math.round(vmin * 0.07), 14, 30);

    // keepOut вокруг финальной звезды — чуть масштабируем от размера экрана
    mobKeepOutScale = clamp(vmin / 390, 0.85, 1.25);
  }

  const placed = [];
  const createdStars = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement("img");
    star.src = STAR_IMAGES[Math.floor(Math.random() * STAR_IMAGES.length)];
    star.dataset.originalSrc = star.src;
    star.className = "star";

    // размер
    const size = __IS_MOBILE_UI ? rand(mobMin, mobMax) : rand(30, 80);
    star.style.width = size + "px";

    let x = 0, y = 0;
    let cx = 0, cy = 0;
    let ok = false;

    // разнос
    let gap = __IS_MOBILE_UI ? mobGap0 : 20;
    let heroR = heroRadius;

    let keepOut = __IS_MOBILE_UI
      ? (FINAL_STAR_KEEP_OUT_PX * mobKeepOutScale)
      : FINAL_STAR_KEEP_OUT_PX;

    const MAX_TRIES = 600;
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      x = rand(0, Math.max(1, w - size));
      y = rand(0, Math.max(1, maxStarY - size));

      cx = x + size / 2;
      cy = y + size / 2;

      ok = true;

      if (Math.hypot(cx - heroX, cy - heroY) < heroR) ok = false;
      if (ok && Math.hypot(cx - FINAL_STAR_CX, cy - FINAL_STAR_CY) < keepOut) ok = false;

      if (ok) {
        for (const p of placed) {
          const minDist = (size + p.size) / 2 + gap;
          if (Math.hypot(cx - p.cx, cy - p.cy) < minDist) {
            ok = false;
            break;
          }
        }
      }

      if (ok) break;

      // ослабление ограничений — как было по логике, но с моб. масштабом
      if (!__IS_MOBILE_UI) {
        if (tries === 220) gap = 12;
        if (tries === 360) { gap = 6; heroR *= 0.92; keepOut *= 0.92; }
        if (tries === 480) { gap = 0; heroR *= 0.88; keepOut *= 0.88; }
      } else {
        if (tries === 220) gap = Math.max(8, mobGap0 * 0.6);
        if (tries === 360) { gap = Math.max(0, mobGap0 * 0.3); heroR *= 0.92; keepOut *= 0.92; }
        if (tries === 480) { gap = 0; heroR *= 0.88; keepOut *= 0.88; }
      }
    }

    if (!ok) {
      x = rand(0, Math.max(1, w - size));
      y = rand(0, Math.max(1, maxStarY - size));
      cx = x + size / 2;
      cy = y + size / 2;
    }

    placed.push({ x, y, size, cx, cy });

    star.style.left = x + "px";
    star.style.top = "calc(-120 * var(--vh, 1vh))";
    star.style.setProperty("--final-top", y + "px");
    star.style.setProperty("--speed", rand(4, 9) + "s");

    star._cx = cx;
    star._cy = cy;
    star.dataset.cx = cx;
    star.dataset.cy = cy;

    star._mx = 0;
    star._my = 0;

    star.addEventListener("mouseenter", () => star.classList.add("hover"));
    star.addEventListener("mouseleave", () => star.classList.remove("hover"));

    star.addEventListener(__TAP_EVT, (e) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();

      if (WorldState.locked || isFxBusy()) return;

      const progressLocked = !!(WorldState && WorldState.runCompleted);

      if (progressLocked || (i !== castleIndex && i !== heartIndex)) {
        playBellForIndex(i);
      }

      star.classList.add("glow");
      setTimeout(() => star.classList.remove("glow"), 1200);

      if (!progressLocked) {
        if (i === castleIndex && canShowCastle()) showCastle(star);
        if (i === heartIndex && canShowHeart()) showHeart(star);

        if (typeof window.__hintOnStarClick === "function") {
          window.__hintOnStarClick();
        }
      }
    }, { passive: false });

    starsWrap.appendChild(star);
    createdStars.push(star);
  }

  __starsCache = createdStars;
  document.dispatchEvent(new Event("stars:created"));
}

/* ---------- ПУЛЬСАЦИЯ (CASTLE FX) ---------- */
function pulseStars(duration = 6000, onDone) {
  const dur = Math.max(1, duration || 0);

  fxBegin();

  const stars = (__starsCache && __starsCache.length)
    ? __starsCache
    : Array.from(document.querySelectorAll(".star"));

  let t = 0;
  const start = performance.now();

  const loop = setInterval(() => {
    const p = Math.min((performance.now() - start) / dur, 1);
    const power = p * p;

    t += 0.25;

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (!star || !star.isConnected) continue;

      const cx = (typeof star._cx === "number") ? star._cx : (Number(star.dataset.cx) || 0);
      const phase = Math.sin(t + cx * 0.015);
      const brightness = 1.1 + phase * 2.2 * power;
      star.style.filter = `brightness(${brightness})`;
    }

    if (p >= 1) {
      clearInterval(loop);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (s && s.isConnected) s.style.filter = "";
      }

      if (typeof onDone === "function") onDone();
      fxEnd();
    }
  }, 40);
}

/* ---------- ВСПЫШКА ЭКРАНА ---------- */
function flashScreen() {
  const flash = document.createElement("div");
  flash.className = "screen-flash";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 200);
}

/* ---------- ЗАМОК ---------- */
function showCastle(star) {
  if (WorldState.locked || isFxBusy()) return;

  playZamSfxOnce();
  setStarsClicksBlocked(true);
  lastCastleFoundTime = Date.now();

  const rect = star.getBoundingClientRect();
  star.style.visibility = "hidden";

  const castle = document.createElement("img");
  castle.src = "castle.png";
  castle.className = "castle glow";
  castle.style.width = rect.width + "px";
  castle.style.left = rect.left + "px";
  castle.style.top = rect.top + "px";
  document.body.appendChild(castle);

  pulseStars(7000, () => {
    setStarsClicksBlocked(false);
  });

  setTimeout(() => {
    flashScreen();
    castle.remove();
    star.remove();
  }, 1900);
}

/* ---------- СЕРДЦЕ ---------- */
function showHeart(star) {
  if (WorldState.locked || isFxBusy()) return;

  playSerOnce();

  setStarsClicksBlocked(true);
  lastHeartFoundTime = Date.now();

  const rect = star.getBoundingClientRect();
  star.style.visibility = "hidden";

  const heart = document.createElement("img");
  heart.src = "heart.png";
  heart.className = "heart glow";
  heart.style.width = rect.width + "px";
  heart.style.left = rect.left + "px";
  heart.style.top = rect.top + "px";
  document.body.appendChild(heart);

  setTimeout(() => {
    heart.remove();

    swapStarsToHearts(4000, () => {
      setStarsClicksBlocked(false);
    });
  }, 4800);
}

/* ---------- ЗАМЕНА ЗВЁЗД (HEART FX) ---------- */
function swapStarsToHearts(duration = 3000, onDone) {
  const dur = Math.max(0, duration || 0);

  fxBegin();

  const stars = document.querySelectorAll(".star");

  stars.forEach(star => {
    star.style.transition = "opacity 0.8s ease";
    star.src = "heart.png";
    star.style.opacity = "1";
  });

  setTimeout(() => {
    stars.forEach(star => star.style.opacity = "0");

    setTimeout(() => {
      stars.forEach(star => {
        star.src = star.dataset.originalSrc;
        star.style.opacity = "";
        star.style.transition = "";
      });

      if (typeof onDone === "function") onDone();
      fxEnd();
    }, 800);
  }, dur);
}

/* ---------- ИКОНКИ ---------- */
function showIconsFan() {
  const W = window.innerWidth;
  const cx = W / 2;
  const y = window.innerHeight - 80;

  // Desktop: оставляем как было
  const desktopSpread = 360;

  // Mobile: считаем размер так, чтобы:
  // - крайние иконки имели поля ~ 0.5 ширины иконки
  // - gap между иконками был "как на ПК" по ощущениям, но адаптивно (я задал через __mobileIconGapPx)
  let mobileGap = 0;
  let mobileIconSize = 0;
  let mobileStep = 0; // расстояние между центрами

  if (__IS_MOBILE_UI) {
    mobileGap = __mobileIconGapPx(W);
    mobileIconSize = Math.floor((W - 4 * mobileGap) / 6); // формула: W = 6S + 4G
    if (!isFinite(mobileIconSize) || mobileIconSize < 1) mobileIconSize = 1;
    mobileStep = mobileIconSize + mobileGap;
  }

  ICONS.forEach((src, i) => {
    const icon = document.createElement("img");
    icon.src = src;
    icon.className = "icon";

    const offset = i - (ICONS.length - 1) / 2;

    icon.style.left = cx + "px";
    icon.style.top = y + "px";

    if (__IS_MOBILE_UI) {
      // размер строго из расчёта (чтобы гарантированно всё было в пределах экрана)
      icon.style.width = mobileIconSize + "px";

      // разнос: центры через (S + gap)
      icon.style.setProperty("--tx", (offset * mobileStep) + "px");
    } else {
      // как было раньше
      icon.style.setProperty("--tx", (offset * desktopSpread / ICONS.length) + "px");
    }

    icon.style.setProperty("--rot", (offset * 12) + "deg");
    icon.style.animationDelay = `${i * 0.20}s`;

    document.body.appendChild(icon);
  });
}


/* ---------- ПЕРЕХОД ПО ССЫЛКАМ ---------- */
const ICON_LINKS = {
  sp: "https://open.spotify.com/track/3TJEOBS1E6V60S0ny6NFgO?si=am4lQRzWRBWPtUGQP2IXbQ",
  zv: "https://share.zvuk.com/cLQ0/k1qn6icm",
  ap: "https://music.apple.com/ru/artist/a-parte/1808784895",
  vk: "https://vk.ru/artist/aparte_mtc0ntyxnju4nq",
  ya: "https://music.yandex.ru/artist/24094872?ref_id=F39EED55-E192-4565-B8F1-85FE77F75387&utm_medium=copy_link"
};

/* ============================================================
   AUDIO: CLICK (cl.mp3) — WebAudio
============================================================ */
(function () {
  if (window.__clSfxV2) return;
  window.__clSfxV2 = true;

  const CL_SRC = "cl.mp3";

  function playClOnce() {
    try {
      AudioEngine.play(CL_SRC, { mode: "overlap" });
    } catch (_) {}
  }

  window.playClOnce = playClOnce;

  document.addEventListener(
    __TAP_EVT,
    (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest(".icon") || t.closest("#sub-after-turn")) {
        playClOnce();
      }
    },
    true
  );
})();

/* FIX: открытие ссылок по иконкам — без перехода в текущей вкладке */
document.addEventListener(__TAP_EVT, e => {
  const icon = e.target && e.target.closest ? e.target.closest(".icon") : null;
  if (!icon) return;

  if (e && typeof e.preventDefault === "function") e.preventDefault();
  if (e && typeof e.stopPropagation === "function") e.stopPropagation();

  const src = icon.getAttribute("src") || "";
  for (const key in ICON_LINKS) {
    if (src.includes(key)) {
      __openExternalBlank(ICON_LINKS[key]);
      break;
    }
  }
}, true);

/* ---------- КУРСОР И ДВИЖЕНИЕ ЗВЁЗД ---------- */
let mouseX = -9999;
let mouseY = -9999;

document.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function updateStarForces() {
  if (__starForcesRAF) return;

  function tick() {
    const stars = __starsCache;

    if (stars && stars.length) {
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (!star || !star.isConnected) continue;

        const cx = (typeof star._cx === "number") ? star._cx : (Number(star.dataset.cx) || 0);
        const cy = (typeof star._cy === "number") ? star._cy : (Number(star.dataset.cy) || 0);

        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.hypot(dx, dy);

        const maxDist = 130;
        let tx = 0, ty = 0;

        const SAFE_EPS = 0.0001;

        if (dist < maxDist) {
          const safeDist = Math.max(dist, SAFE_EPS);
          const f = (1 - dist / maxDist) * 8;
          tx = (dx / safeDist) * f;
          ty = (dy / safeDist) * f;
        }

        star._mx += (tx - star._mx) * 0.04;
        star._my += (ty - star._my) * 0.04;

        star.style.setProperty("--mx", `${star._mx}px`);
        star.style.setProperty("--my", `${star._my}px`);
      }
    }

    __starForcesRAF = requestAnimationFrame(tick);
  }

  __starForcesRAF = requestAnimationFrame(tick);
}

/* ---------- СТАРТ (BOOT SCREEN: STRICT READY -> (open + scene) SYNC) ---------- */
(function () {
  if (window.__bootScreenV2) return;
  window.__bootScreenV2 = true;

  const OVERLAY_ID = "boot-overlay";
  const BTN_ID = "boot-start-btn";
  const STYLE_ID = "boot-overlay-style";

  let started = false;
  let movedIconsOnce = false;

  let prepState = "idle"; // "idle" | "preparing" | "failed" | "ready"

  if (typeof WorldState === "object" && WorldState) {
    WorldState.autoActivationEnabled = false;
  }

  let __preStartRAF = 0;
  let __clampLastTs = 0;

  function preStartClampTick(ts) {
    if (started) {
      __preStartRAF = 0;
      return;
    }

    const now = (typeof ts === "number") ? ts : performance.now();
    const due = (!__clampLastTs || (now - __clampLastTs >= 140));
    if (due) {
      __clampLastTs = now;

      document.body.classList.remove("scene-fly-up", "hero-ready", "mountain-drop", "scene-reset");

      if (WorldState) {
        WorldState.mode = "idle";
        WorldState.locked = false;
        WorldState.fxBusyCount = 0;
      }

      const mini = document.getElementById("hero-mini");
      const sled = document.getElementById("sled");
      if (mini) {
        mini.style.opacity = "0";
        mini.style.display = "";
        mini.style.transform = "translate(-50%, -50%)";
      }
      if (sled) {
        sled.style.opacity = "0";
        sled.style.display = "";
        sled.style.transform = "translate(-50%, -50%)";
      }

      const ov = document.getElementById("hero-overlay-full");
      if (ov) {
        ov.style.display = "none";
        ov.style.opacity = "0";
      }
    }

    __preStartRAF = requestAnimationFrame(preStartClampTick);
  }

  function startPreStartClamp() {
    if (__preStartRAF) return;
    __clampLastTs = 0;
    __preStartRAF = requestAnimationFrame(preStartClampTick);
  }

  function stopPreStartClamp() {
    if (__preStartRAF) cancelAnimationFrame(__preStartRAF);
    __preStartRAF = 0;
  }

  function hardBootCleanupOnce() {
    document.body.classList.remove("scene-fly-up", "hero-ready", "mountain-drop", "scene-reset");

    document.querySelectorAll(".castle, .heart").forEach(el => el.remove());
    document.querySelectorAll(".icon").forEach(el => el.remove());

    const fs = document.getElementById("final-star-trigger");
    if (fs) fs.remove();
    const fh = document.getElementById("final-star-halo");
    if (fh) fh.remove();

    const sub = document.getElementById("sub-after-turn");
    if (sub) sub.remove();
    try {
      if (typeof window.resetSubAfterTurn === "function") window.resetSubAfterTurn();
    } catch (_) {}

    const mini = document.getElementById("hero-mini");
    const sled = document.getElementById("sled");
    if (mini) {
      mini.style.opacity = "0";
      mini.style.display = "";
      mini.style.transform = "translate(-50%, -50%)";
    }
    if (sled) {
      sled.style.opacity = "0";
      sled.style.display = "";
      sled.style.transform = "translate(-50%, -50%)";
    }

    const ov = document.getElementById("hero-overlay-full");
    if (ov) {
      ov.style.display = "none";
      ov.style.opacity = "0";
    }

    const heroEl = document.getElementById("hero");
    if (heroEl) {
      heroEl.style.visibility = "";
      heroEl.style.opacity = "";
      heroEl.style.display = "";
      heroEl.style.filter = "";
    }

    if (WorldState) {
      WorldState.autoActivationEnabled = false;
      WorldState.mode = "idle";
      WorldState.locked = false;
      WorldState.fxBusyCount = 0;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      #${OVERLAY_ID}{
        position: fixed;
        inset: 0;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 20000;
        touch-action: manipulation;
      }
      #${BTN_ID}{
        width: min(10.5vmin, 55px);
        height: auto;
        cursor: pointer;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: auto;

        filter:
          drop-shadow(0 0 10px rgba(255,255,255,0.55))
          drop-shadow(0 0 26px rgba(255,255,255,0.22));

        opacity: 0.98;
        will-change: transform, filter, opacity;
        transform: translateZ(0) scale(1);
      }
    `;
    document.head.appendChild(st);
  }

  function ensureOverlay() {
    ensureStyle();

    let ov = document.getElementById(OVERLAY_ID);
    if (ov && ov.isConnected) return ov;

    ov = document.createElement("div");
    ov.id = OVERLAY_ID;

    const btn = document.createElement("img");
    btn.id = BTN_ID;
    btn.src = "castle.png";
    btn.alt = "Start";
    btn.setAttribute("draggable", "false");
    btn.setAttribute("tabindex", "0");

    ov.appendChild(btn);
    document.body.appendChild(ov);

    hardBootCleanupOnce();
    startPreStartClamp();

    return ov;
  }

  function removeOverlay() {
    const ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.remove();
  }

  function moveIconsIntoWrapOnce() {
    if (movedIconsOnce) return;
    movedIconsOnce = true;

    const wrap = document.getElementById("scene-wrap");
    if (!wrap) return;

    document.querySelectorAll(".icon").forEach(el => {
      if (el && el.isConnected && el.parentNode !== wrap) {
        wrap.appendChild(el);
      }
    });
  }

  window.__moveIconsIntoWrapOnce = moveIconsIntoWrapOnce;
  window.__resetMoveIconsOnce = function () { movedIconsOnce = false; };

  function startFirstScene() {
    if (started) return;
    started = true;

    window.__appStarted = true;

    stopPreStartClamp();

    if (typeof WorldState === "object" && WorldState) {
      WorldState.autoActivationEnabled = true;
    }

    const heroEl = document.getElementById("hero");
    const heroPrev = heroEl ? {
      display: heroEl.style.display,
      visibility: heroEl.style.visibility,
      opacity: heroEl.style.opacity,
      animation: heroEl.style.animation
    } : null;

    if (heroEl) {
      heroEl.style.display = "none";
      heroEl.style.visibility = "hidden";
      heroEl.style.opacity = "0";
    }

    function restartCssAnimation(el) {
      if (!el) return;
      const prev = el.style.animation;
      el.style.animation = "none";
      void el.offsetHeight;
      el.style.animation = prev || "";
    }

    if (heroEl) {
      heroEl.style.display = heroPrev ? (heroPrev.display || "") : "";
      heroEl.style.visibility = heroPrev ? (heroPrev.visibility || "") : "";
      heroEl.style.opacity = heroPrev ? (heroPrev.opacity || "") : "";
      restartCssAnimation(heroEl);
    }

    updateStarForces();
    createStars();

    setTimeout(() => {
      showIconsFan();
      setTimeout(moveIconsIntoWrapOnce, 0);
    }, 1000);
  }

  /* ----- Рост кнопки: ~5% scale в секунду, без пульсации, без звука ----- */
  let __btnGrowRAF = 0;
  let __btnGrowScale = 1;
  let __btnGrowLastTs = 0;

  function stopBtnGrow() {
    if (__btnGrowRAF) cancelAnimationFrame(__btnGrowRAF);
    __btnGrowRAF = 0;
  }

  function startBtnGrow(btn) {
    stopBtnGrow();
    __btnGrowScale = 1;
    __btnGrowLastTs = performance.now();
    if (btn) btn.style.transform = "translateZ(0) scale(1)";

    const SPEED = 0.05;  // +5% scale/sec
    const MAX = 2.0;     // до 2х — ок

    function loop(ts) {
      if (!btn || !btn.isConnected) { __btnGrowRAF = 0; return; }
      if (started) { __btnGrowRAF = 0; return; }

      const dt = Math.max(0, (ts - __btnGrowLastTs) / 1000);
      __btnGrowLastTs = ts;

      __btnGrowScale = Math.min(MAX, __btnGrowScale + SPEED * dt);
      btn.style.transform = "translateZ(0) scale(" + __btnGrowScale.toFixed(4) + ")";

      __btnGrowRAF = requestAnimationFrame(loop);
    }

    __btnGrowRAF = requestAnimationFrame(loop);
  }

  async function strictPrepareAndStart(btn) {
    prepState = "preparing";
    startBtnGrow(btn);

    const [imgRes, bytesRes] = await Promise.all([
      Assets.preloadImages(ASSET_MANIFEST.images),
      Assets.preloadAudioBytes(ASSET_MANIFEST.audio)
    ]);

    if (imgRes && imgRes.errors && imgRes.errors.length) throw new Error("images");
    if (bytesRes && bytesRes.errors && bytesRes.errors.length) throw new Error("audioBytes");

    const decRes = await AudioEngine.prepareAfterUserGesture(
      ASSET_MANIFEST.audio,
      (name) => Assets.getAudioBytes(name)
    );

    if (decRes && decRes.errors && decRes.errors.length) throw new Error("audioDecode");

    prepState = "ready";

    const when = AudioEngine.now() + 0.05;
    const t0 = AudioEngine.play("open.mp3", { mode: "single", when });

    AudioEngine.atTime((typeof t0 === "number" ? t0 : when), () => {
      if (started) return;

      startFirstScene();

      try {
        if (window.__hardStartGate && typeof window.__hardStartGate.release === "function") {
          window.__hardStartGate.release();
        }
      } catch (_) {}

      stopBtnGrow();
      removeOverlay();
    });
  }

  const overlay = ensureOverlay();
  const btn = overlay.querySelector("#" + BTN_ID);

  async function onStart(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();

    if (started) return;
    if (prepState === "preparing") return;

    if (prepState === "failed") {
      try { stopBtnGrow(); } catch (_) {}
      try { AudioEngine.reset(); } catch (_) {}
      try { if (Assets && typeof Assets.resetAll === "function") Assets.resetAll(); } catch (_) {}

      try { Assets.preloadImages(ASSET_MANIFEST.images); } catch (_) {}
      try { Assets.preloadAudioBytes(ASSET_MANIFEST.audio); } catch (_) {}
    }

    hardBootCleanupOnce();

    try {
      await strictPrepareAndStart(btn);
    } catch (_) {
      prepState = "failed";
      // UI по ошибке пока не показываем; следующий тап запустит заново
    }
  }

  btn.addEventListener(__TAP_EVT, onStart, { passive: false });

  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") onStart(e);
  });

  window.addEventListener("pageshow", () => {
    if (started) return;
    ensureOverlay();
    hardBootCleanupOnce();
    startPreStartClamp();
  });

  document.addEventListener("visibilitychange", () => {
    if (started) return;
    if (!document.hidden) {
      ensureOverlay();
      hardBootCleanupOnce();
      startPreStartClamp();
    }
  });
})();

/* ============================================================
   СЦЕНЫ / ПРОГРЕСС
============================================================ */
let totalStarsInitial = STAR_COUNT;
let starsActivated = 0;
let allStarsTriggered = false;

document.addEventListener(__TAP_EVT, e => {
  if (WorldState && WorldState.runCompleted) return;

  const star = e.target && e.target.closest ? e.target.closest(".star") : null;
  if (!star) return;

  if (star.dataset.activated) return;

  star.dataset.activated = "1";
  starsActivated++;

  if (starsActivated >= totalStarsInitial && !allStarsTriggered) {
    allStarsTriggered = true;
    if (typeof window.__hintStop === "function") window.__hintStop();
    onAllStarsActivated();
  }
});

function onAllStarsActivated() {
  if (WorldState.mode === "mountain-scene") return;
  WorldState.mode = "mountain-scene";
  document.body.classList.add("scene-fly-up");
}

/* ============================================================
   AUTO STAR ACTIVATION (по ТЗ)
============================================================ */
/* ... (остальной твой код без изменений) ... */

/* ===== ниже — код сцены/обёртки ===== */
/* ... (остальной твой код без изменений) ... */

/* ============================================================
   SUB (sub.png)
============================================================ */
/* ... (остальной твой код без изменений) ... */


/* ============================================================
   AUTO STAR ACTIVATION (по ТЗ)
============================================================ */
(function () {
  if (window.__autoStarActivationV1) return;
  window.__autoStarActivationV1 = true;

  const IDLE_MS = 5000;

  const HALO_ID = "auto-star-halo";
  const STYLE_ID = "auto-star-halo-style";

  let enabled = true;
  let idleTimer = null;
  let safePoll = null;
  let activeStar = null;
  let followRAF = 0;
  let lastPicked = null;

  function getFallDurMs() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--fall-dur").trim();
    const m = raw.match(/([0-9.]+)\s*s/);
    return m ? Math.max(0, parseFloat(m[1]) * 1000) : 2800;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      #${HALO_ID}{
        position: fixed;
        left: -9999px;
        top: -9999px;
        width: 90px;
        height: 90px;
        border-radius: 9999px;
        display: none;
        opacity: 0;
        pointer-events: none;
        z-index: 9800;
        transform: translate(-50%,-50%) scale(1);
        background: radial-gradient(
          circle,
          rgba(255,255,255,0.95) 0%,
          rgba(255,255,255,0.55) 22%,
          rgba(255,255,255,0.22) 45%,
          rgba(255,255,255,0.00) 72%
        );
        filter: blur(5px);
        will-change: transform, opacity, filter, left, top, width, height;
      }
      #${HALO_ID}.armed{
        display:block;
        opacity:0;
        animation:
          autoHaloFadeIn 0.5s ease-out 0s 1 both,
          autoHaloPulse 2s ease-in-out 0.35s infinite;
      }
      @keyframes autoHaloFadeIn{from{opacity:0;}to{opacity:1;}}
      @keyframes autoHaloPulse{
        0%{opacity:1;transform:translate(-50%,-50%) scale(1);filter:blur(5px);}
        50%{opacity:.88;transform:translate(-50%,-50%) scale(1.16);filter:blur(7px);}
        100%{opacity:1;transform:translate(-50%,-50%) scale(1);filter:blur(5px);}
      }
    `;
    document.head.appendChild(st);
  }

  function ensureHaloEl() {
    ensureStyle();
    let el = document.getElementById(HALO_ID);
    if (el && el.isConnected) return el;
    el = document.createElement("div");
    el.id = HALO_ID;
    document.body.appendChild(el);
    return el;
  }

  function clearTimers() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (safePoll) clearTimeout(safePoll);
    safePoll = null;
  }

  function stopFollow() {
    if (followRAF) cancelAnimationFrame(followRAF);
    followRAF = 0;
  }

  function isSafeNow() {
    if (!enabled) return false;
    if (!WorldState.autoActivationEnabled) return false;
    if (allStarsTriggered) return false;
    if (WorldState.mode === "mountain-scene") return false;
    if (WorldState.locked) return false;
    if (isFxBusy()) return false;
    if (document.querySelector(".castle, .heart")) return false;
    return true;
  }

  function isStarVisible(star) {
    if (!star || !star.isConnected) return false;
    const cs = getComputedStyle(star);
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity || "1") < 0.05) return false;
    return true;
  }

  function pickRandomUnactivatedStar() {
    const stars = Array.from(document.querySelectorAll(".star"));
    const candidates = stars.filter(s => !s.dataset.activated && isStarVisible(s));
    if (!candidates.length) return null;

    let pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (candidates.length > 1 && lastPicked && pick === lastPicked) {
      pick = candidates[(candidates.indexOf(pick) + 1) % candidates.length];
    }
    lastPicked = pick;
    return pick;
  }

  function hideActive() {
    stopFollow();

    if (activeStar && activeStar.isConnected) {
      activeStar.classList.remove("glow-max");
    }
    activeStar = null;

    const halo = document.getElementById(HALO_ID);
    if (halo) {
      halo.classList.remove("armed");
      halo.style.display = "none";
      halo.style.opacity = "0";
      halo.style.left = "-9999px";
      halo.style.top = "-9999px";
    }
  }

  function updateHalo() {
    if (!activeStar || !activeStar.isConnected) return;

    const r = activeStar.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const halo = ensureHaloEl();
    const size = Math.max(70, Math.min(150, r.width * 1.1));
    halo.style.width = Math.round(size) + "px";
    halo.style.height = Math.round(size) + "px";
    halo.style.left = Math.round(cx) + "px";
    halo.style.top = Math.round(cy) + "px";
  }

  function followLoop() {
    if (!activeStar || !activeStar.isConnected) {
      hideActive();
      waitForSafeThenStartCountdown();
      return;
    }
    if (activeStar.dataset.activated) {
      hideActive();
      waitForSafeThenStartCountdown();
      return;
    }
    if (!isSafeNow()) {
      hideActive();
      waitForSafeThenStartCountdown();
      return;
    }

    updateHalo();
    followRAF = requestAnimationFrame(followLoop);
  }

  function armOnStar(star) {
    hideActive();
    if (!star) return;

    activeStar = star;

    star.classList.remove("glow-max");
    void star.offsetWidth;
    star.classList.add("glow-max");

    const halo = ensureHaloEl();
    halo.classList.remove("armed");
    halo.style.display = "block";
    halo.style.opacity = "0";
    void halo.offsetWidth;
    halo.classList.add("armed");

    updateHalo();
    followRAF = requestAnimationFrame(followLoop);
  }

  function scheduleNextActivation() {
    clearTimers();

    if (!isSafeNow()) {
      waitForSafeThenStartCountdown();
      return;
    }

    idleTimer = setTimeout(() => {
      if (!isSafeNow()) {
        waitForSafeThenStartCountdown();
        return;
      }

      const star = pickRandomUnactivatedStar();
      if (!star) return;

      armOnStar(star);
      scheduleNextActivation();
    }, IDLE_MS);
  }

  function waitForSafeThenStartCountdown() {
    clearTimers();
    safePoll = setTimeout(function loop() {
      if (!enabled) return;
      if (!WorldState.autoActivationEnabled) return;

      if (isSafeNow()) {
        scheduleNextActivation();
        return;
      }
      safePoll = setTimeout(loop, 80);
    }, 80);
  }

  window.__hintOnStarClick = function () {
    if (!enabled) return;
    if (!WorldState.autoActivationEnabled) return;

    hideActive();
    waitForSafeThenStartCountdown();
  };

  window.__hintMaybeStartIdle = function () {
    if (!enabled) return;
    if (!WorldState.autoActivationEnabled) return;
    if (activeStar) return;
    waitForSafeThenStartCountdown();
  };

  window.__hintStop = function () {
    enabled = false;
    hideActive();
    clearTimers();
  };

  document.addEventListener("stars:created", () => {
    if (!enabled) return;
    if (!WorldState.autoActivationEnabled) return;

    hideActive();
    clearTimers();

    const fall = getFallDurMs();
    setTimeout(() => {
      if (!enabled) return;
      if (!WorldState.autoActivationEnabled) return;
      waitForSafeThenStartCountdown();
    }, fall + 120);
  });

  const fall0 = getFallDurMs();
  setTimeout(() => {
    if (!enabled) return;
    if (!WorldState.autoActivationEnabled) return;
    waitForSafeThenStartCountdown();
  }, fall0 + 120);
})();

/* ===== ниже — код сцены/обёртки ===== */

(function initSceneWrapper() {
  if (document.getElementById("scene-wrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "scene-wrap";

  [
    document.getElementById("stars"),
    document.getElementById("hero"),
    ...document.querySelectorAll(".icon")
  ].forEach(el => {
    if (el) wrap.appendChild(el);
  });

  document.body.appendChild(wrap);
})();

(function initMountainScene() {
  if (document.getElementById("mountain-scene")) return;

  const mountain = document.createElement("div");
  mountain.id = "mountain-scene";
  document.body.appendChild(mountain);
})();

(function initMiniHeroScene() {
  if (!document.getElementById("hero-mini")) {
    const heroMini = document.createElement("img");
    heroMini.id = "hero-mini";
    heroMini.src = "hero-mini.png";
    document.body.appendChild(heroMini);
  }

  if (!document.getElementById("sled")) {
    const sled = document.createElement("img");
    sled.id = "sled";
    sled.src = "sled.png";
    document.body.appendChild(sled);
  }
})();

/* ============================================================
   MOUNTAIN ANCHOR V4 (universal, robust trigger)
============================================================ */
(function () {
  if (window.__mountainAnchorV4) return;
  window.__mountainAnchorV4 = true;

  const IMG_W = 1170, IMG_H = 1730;
  const PEAK_X = 287, PEAK_Y = 158;

  const SLED_W = 512, SLED_H = 512;
  const CONTACT_FX = 140 / SLED_W;
  const CONTACT_FY = 320 / SLED_H;

  let appliedForThisLift = false;

  function getStableViewportH() {
    const vh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vh"));
    const oneVhPx = (isFinite(vh) && vh > 0) ? vh : (window.innerHeight * 0.01);
    return oneVhPx * 100;
  }

    function getStableViewportW() {
    if (window.visualViewport && typeof window.visualViewport.width === "number") {
      return window.visualViewport.width;
    }
    return document.documentElement.clientWidth || window.innerWidth;
  }


  function applyMountainToSledContact() {
    const mountain = document.getElementById("mountain-scene");
    const sled = document.getElementById("sled");
    if (!mountain || !sled) return false;

    const r = sled.getBoundingClientRect();
    if (!isFinite(r.left) || r.width < 1 || r.height < 1) return false;

    const VW = Math.max(1, getStableViewportW());
    const VH = Math.max(1, getStableViewportH());

    const xS = r.left + r.width * CONTACT_FX;
    const yS = r.top + r.height * CONTACT_FY;

    const denom = (IMG_H - PEAK_Y);
    if (denom <= 0) return false;

    let s = (VH - yS) / denom;
    if (!isFinite(s) || s <= 0) return false;

    const scaledW = IMG_W * s;
    const scaledH = IMG_H * s;

        let ox = xS - PEAK_X * s;
    let oy = yS - PEAK_Y * s;

    // ВАЖНО: НИКАКИХ подгонок ox/oy.
    // По ТЗ важна точка контакта (xS,yS), а поля/обрезка не важны.
    // Любой clamp/drift в in-app ломает совпадение контакта.

    mountain.style.backgroundImage = 'url("gora.png")';

    mountain.style.backgroundRepeat = "no-repeat";
    mountain.style.backgroundSize = `${scaledW}px ${scaledH}px`;
    mountain.style.backgroundPosition = `${ox}px ${oy}px`;

    return true;
  }

  function onLiftStart() {
    if (appliedForThisLift) return;

    const ok = applyMountainToSledContact();
    if (!ok) return;

    appliedForThisLift = true;

      requestAnimationFrame(() => applyMountainToSledContact());
    setTimeout(() => applyMountainToSledContact(), 80);
    setTimeout(() => applyMountainToSledContact(), 260);
    setTimeout(() => applyMountainToSledContact(), 520);

  }

  function onLiftReset() {
    appliedForThisLift = false;
  }

  const mo = new MutationObserver(() => {
    const b = document.body;
    if (!b) return;

    const fly = b.classList.contains("scene-fly-up");
    const ready = b.classList.contains("hero-ready");

    if (fly && !ready) onLiftStart();

    if (!fly || b.classList.contains("scene-reset")) onLiftReset();
  });

  if (document.body) {
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }, { once: true });
  }

  function maybeReapplyDuringLift() {
    const b = document.body;
    if (!b) return;
    if (!b.classList.contains("scene-fly-up")) return;
    if (b.classList.contains("hero-ready")) return;
    if (!appliedForThisLift) return;
    applyMountainToSledContact();
  }

  window.addEventListener("resize", () => requestAnimationFrame(maybeReapplyDuringLift));
  window.addEventListener("orientationchange", () => setTimeout(maybeReapplyDuringLift, 60));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => requestAnimationFrame(maybeReapplyDuringLift));
  }
})();

const Rider = {
  hero: null,
  sled: null,
  tx: 0,
  ty: 0
};

(function initRiderLink() {
  const hero = document.getElementById("hero-mini");
  const sled = document.getElementById("sled");
  if (!hero || !sled) return;

  Rider.hero = hero;
  Rider.sled = sled;
})();

(function showHeroAfterMountain() {
  const mountain = document.getElementById("mountain-scene");
  if (!mountain) return;

  mountain.addEventListener("transitionend", (e) => {
    if (e.propertyName !== "transform") return;
    if (document.body.classList.contains("hero-ready")) return;

    document.body.classList.add("hero-ready");

    if (Rider.hero) Rider.hero.style.opacity = "1";
    if (Rider.sled) Rider.sled.style.opacity = "1";
  });
})();

/* --- ДАЛЬШЕ: райдер/финал --- */

(function rideDownGrowSwapAndRebound() {
  const OFFSET_X = -16;
  const OFFSET_Y = 8;

  const LANDING_SHIFT_X = -OFFSET_X;
  const LANDING_SHIFT_Y = 0;

  const SPEED_MULT = 1.6;
  const PAUSE_DURATION = 1000;

  const RIDE_DURATION_BASE = 2600;
  const RIDE_DURATION = RIDE_DURATION_BASE / SPEED_MULT;

  const MAX_ROTATE = 50;

  const FULL_W = 1047, FULL_H = 1047, FULL_CW = 788, FULL_CH = 687;
  const MINI_W = 512,  MINI_H = 512,  MINI_CW = 454, MINI_CH = 395;

  let state = "wait";
  let pauseStart = 0;
  let rideStart = 0;

  let targetScale = null;
  let swapped = false;
  let overlay = null;
  let reboundStarted = false;

  let breathEl = null;
  let breathBase = "";
  let breathRAF = 0;
  let breathT0 = 0;
  const BREATH_PERIOD_S = 6;
  const BREATH_AMP_PX = 10;

  function stopOverlayBreath() {
    if (breathRAF) cancelAnimationFrame(breathRAF);
    breathRAF = 0;
    breathEl = null;
    breathBase = "";
    breathT0 = 0;
  }

  function startOverlayBreath(el, baseTransform) {
    stopOverlayBreath();
    breathEl = el;
    breathBase = String(baseTransform || "");
    breathT0 = performance.now();

    function loop(ts) {
      if (!breathEl || !breathEl.isConnected) {
        stopOverlayBreath();
        return;
      }

      const t = (ts - breathT0) / 1000;
      const y = Math.sin(t * 2 * Math.PI / BREATH_PERIOD_S) * BREATH_AMP_PX;

      breathEl.style.transform = breathBase + " translateY(" + y.toFixed(3) + "px)";
      breathRAF = requestAnimationFrame(loop);
    }

    breathRAF = requestAnimationFrame(loop);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function computeTargetScaleByAssets() {
    const vminPx = Math.min(window.innerWidth, window.innerHeight);
    const maxPx = 0.70 * vminPx;

    const k = Math.min(1, maxPx / FULL_W, maxPx / FULL_H);

    const fullContentW = FULL_CW * k;
    const fullContentH = FULL_CH * k;

    const miniBaseW = 0.06 * vminPx;
    const miniBaseH = miniBaseW * (MINI_H / MINI_W);

    const miniContentW_at1 = miniBaseW * (MINI_CW / MINI_W);
    const miniContentH_at1 = miniBaseH * (MINI_CH / MINI_H);

    const sW = fullContentW / miniContentW_at1;
    const sH = fullContentH / miniContentH_at1;

    const s = Math.sqrt(sW * sH);
    return (isFinite(s) && s > 0) ? s : 1;
  }

  function ensureOverlay(mini) {
    const full = document.getElementById("hero");
    if (!full || !mini) return null;

    if (!overlay || !overlay.isConnected) {
      overlay = document.getElementById("hero-overlay-full");
      if (!overlay) {
        overlay = document.createElement("img");
        overlay.id = "hero-overlay-full";
        overlay.src = full.getAttribute("src") || "hero.png";
        overlay.alt = "hero";
        overlay.decoding = "async";
        overlay.loading = "eager";
      }
    }

    const cs = window.getComputedStyle(mini);

    overlay.style.position = "fixed";
    overlay.style.left = cs.left;
    overlay.style.top = cs.top;

    overlay.style.maxWidth = "70vmin";
    overlay.style.maxHeight = "70vmin";
    overlay.style.width = "";
    overlay.style.height = "";

    overlay.style.pointerEvents = "none";
    overlay.style.filter = "";
    overlay.style.willChange = "opacity, transform";

    overlay.style.opacity = "0";
    overlay.style.display = "none";
    overlay.style.visibility = "visible";

    if (overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }

    return overlay;
  }

  function parseDeg(s) {
    const m = String(s || "").match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }

  function getRotateDeg(t) {
    const m = String(t || "").match(/rotate\(([^)]+)\)/);
    return m ? parseDeg(m[1]) : 0;
  }

  function startRebound(ov) {
    if (reboundStarted || !ov) return;
    reboundStarted = true;

    stopOverlayBreath();

    const a0 = getRotateDeg(ov.style.transform || "");

    const REBOUND_TOTAL_MS = 9000;

    const IMPACT_RIGHT_SCALE = 0.5;
    const REBOUND_LEFT_SCALE = 1.2;

    const _tf = ov.style.transform || "";
    const _px = [];

    /* FIX 1.3: вместо matchAll используем RegExp.exec (совместимость) */
    const _re = /translate\(\s*([-0-9.]+)(px|%)\s*,\s*([-0-9.]+)(px|%)\s*\)/g;
    let _m;
    while ((_m = _re.exec(_tf)) !== null) {
      if (_m[2] === "px" && _m[4] === "px") {
        _px.push([parseFloat(_m[1]), parseFloat(_m[3])]);
      }
    }

    const _dx = _px[0] ? _px[0][0] : 0;
    const _dy = _px[0] ? _px[0][1] : 0;
    const _ox = _px[1] ? _px[1][0] : 0;
    const _oy = _px[1] ? _px[1][1] : 0;

    let _x = 0;
    let _vx = 410;

    const _wx = 2 * Math.PI * 1.55;
    const _zx = 0.48;
    const _kx = _wx * _wx;
    const _cx = 2 * _zx * _wx;

    let _ang = a0;
    let _av = 140;

    const _wa = 2 * Math.PI * 0.95;
    const _za = 0.85;
    const _ka = _wa * _wa;
    const _ca = 2 * _za * _wa;

    const ROT_SLOW = 5;
    const REBOUND_RUN_MS = REBOUND_TOTAL_MS * ROT_SLOW;

    let _tStart = null;
    let _prev = null;
    let _tMs = 0;

    let stableMs = 0;

    function _apply() {
      const blendStart = 220;
      const blendDur = 220;

      let w = (_tMs - blendStart) / blendDur;
      if (w < 0) w = 0;
      if (w > 1) w = 1;

      const sc = IMPACT_RIGHT_SCALE + (REBOUND_LEFT_SCALE - IMPACT_RIGHT_SCALE) * w;
      const xApplied = _x * sc;

      ov.style.transform =
        "translate(-50%, -50%) translate(" +
        (_dx + xApplied) +
        "px, " +
        _dy +
        "px) rotate(" +
        _ang +
        "deg) translate(" +
        _ox +
        "px," +
        _oy +
        "px)";
    }

    function finishNow() {
      _x = 0; _vx = 0;
      _ang = 0; _av = 0;
      _apply();

      const mainHero = document.getElementById("hero");
      if (mainHero) {
        mainHero.style.opacity = "0";
        mainHero.style.visibility = "hidden";
        mainHero.style.filter = "";
      }

      const base = ov.style.transform || "";
      startOverlayBreath(ov, base);

      if (typeof window.showSubAfterTurn === "function") {
        window.showSubAfterTurn();
      }
    }

    function _step(ts) {
      if (_tStart === null) {
        _tStart = ts;
        _prev = ts;
        _tMs = 0;
        _apply();
        requestAnimationFrame(_step);
        return;
      }

      const dtMs = ts - _prev;
      let dt = dtMs / 1000;
      if (dt > 0.05) dt = 0.05;
      _prev = ts;

      _tMs = ts - _tStart;

      const ax = -_kx * _x - _cx * _vx;
      _vx += ax * dt;
      _x += _vx * dt;

      const dtA = dt / ROT_SLOW;

      const ROT_BLEND_START = 0.18;
      const ROT_BLEND_END = 0.55;

      let tt = _tMs / REBOUND_RUN_MS;
      if (tt < 0) tt = 0;
      if (tt > 1) tt = 1;

      let k = (tt - ROT_BLEND_START) / (ROT_BLEND_END - ROT_BLEND_START);
      if (k < 0) k = 0;
      if (k > 1) k = 1;
      k = k * k * (3 - 2 * k);

      const dtA2 = dtA * (0.45 + 0.55 * k);

      const aa = -_ka * _ang - _ca * _av;
      _av += aa * dtA2;
      _ang += _av * dtA2;

      _apply();

      const stable =
        Math.abs(_ang) < 0.18 &&
        Math.abs(_av)  < 6 &&
        Math.abs(_x)   < 0.35 &&
        Math.abs(_vx)  < 22;

      stableMs = stable ? (stableMs + dtMs) : 0;

      if (stableMs >= 260 || _tMs >= REBOUND_RUN_MS) {
        finishNow();
        return;
      }

      requestAnimationFrame(_step);
    }

    requestAnimationFrame(_step);
  }

  function frame(ts) {
    if (!document.body.classList.contains("hero-ready")) {
      state = "wait";
      pauseStart = 0;
      rideStart = 0;
      targetScale = null;
      swapped = false;
      reboundStarted = false;

      stopOverlayBreath();
      if (overlay) {
        overlay.style.opacity = "0";
        overlay.style.display = "none";
      }

      const mainHero = document.getElementById("hero");
      if (mainHero && !document.body.classList.contains("scene-fly-up")) {
        mainHero.style.visibility = "";
      }

      requestAnimationFrame(frame);
      return;
    }

    if (!Rider.hero || !Rider.sled) {
      requestAnimationFrame(frame);
      return;
    }

    if (targetScale === null) targetScale = computeTargetScaleByAssets();

    if (state === "wait") {
      pauseStart = ts;
      state = "pause";
    }

    if (state === "pause") {
      if (ts - pauseStart >= PAUSE_DURATION) {
        rideStart = ts;
        state = "ride";
      }
      requestAnimationFrame(frame);
      return;
    }

    if (state === "ride") {
      const elapsed = ts - rideStart;
      const raw = clamp(elapsed / RIDE_DURATION, 0, 1);

      const ACCEL = 1.12;
      const p = Math.pow(raw, ACCEL);

      const targetX = window.innerWidth / 2 - window.innerWidth * 0.08 + LANDING_SHIFT_X;
      const targetY = window.innerHeight / 2 - window.innerHeight * 0.08 + LANDING_SHIFT_Y;

      const arc = Math.sin(p * Math.PI);

      const dx = targetX * p;
      const dy = targetY * p + arc * window.innerHeight * 0.35;

      Rider.tx = dx;
      Rider.ty = dy;

      const rot = MAX_ROTATE * p;

      const base =
        "translate(-50%, -50%) translate(" + dx + "px, " + dy + "px) rotate(" + rot + "deg)";

      let q = 0;
      if (p > 0.5) q = (p - 0.5) / 0.5;
      q = easeOut(clamp(q, 0, 1));

      const s = 1 + (targetScale - 1) * q;

      Rider.hero.style.transform = base + " scale(" + s + ")";
      Rider.sled.style.transform = base;

      if (Rider.sled && q >= 0.72) {
        Rider.sled.style.opacity = "0";
      }

      const b = 5 + (1 - 5) * q;
      Rider.hero.style.filter = "brightness(" + b + ")";

      if (!swapped && raw >= 1) {
        swapped = true;

        const mainHero = document.getElementById("hero");
        if (mainHero) {
          mainHero.style.opacity = "0";
          mainHero.style.visibility = "hidden";
          mainHero.style.filter = "";
        }

        stopOverlayBreath();

        const ov = ensureOverlay(Rider.hero);
        if (ov) {
          ov.style.transform =
            "translate(-50%, -50%) translate(" +
            dx +
            "px, " +
            dy +
            "px) rotate(" +
            rot +
            "deg) translate(" +
            OFFSET_X +
            "px," +
            OFFSET_Y +
            "px)";

          ov.style.display = "block";
          ov.style.opacity = "0";
          ov.getBoundingClientRect();
          ov.style.opacity = "1";

          startRebound(ov);
        }

        Rider.hero.style.display = "none";
        Rider.hero.style.opacity = "0";
        Rider.hero.style.filter = "brightness(1)";

        if (Rider.sled) {
          const prevTr = Rider.sled.style.transition;
          Rider.sled.style.transition = "none";
          Rider.sled.style.opacity = "0";
          requestAnimationFrame(() => {
            if (Rider.sled) Rider.sled.style.transition = prevTr || "";
          });
        }
      }

      if (!swapped && raw < 1) {
        requestAnimationFrame(frame);
      } else {
        state = "done";
      }
    }
  }

  requestAnimationFrame(frame);
})();

(function () {
  let done = false;

  function tick() {
    if (done) return;

    const heroMini = document.getElementById("hero-mini");
    const sled = document.getElementById("sled");

    if (!heroMini || !sled) {
      requestAnimationFrame(tick);
      return;
    }

    const cs = window.getComputedStyle(heroMini);
    if (cs.display === "none" || cs.visibility === "hidden") {
      sled.style.transition = "opacity 0.35s ease-out";
      sled.style.opacity = "0";
      done = true;
      return;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();

(function () {
  let done = false;

  function detachIconsAndSendDown() {
    const wrap = document.getElementById("scene-wrap");
    const icons = Array.from(document.querySelectorAll(".icon"));

    icons.forEach(icon => {
      icon.style.pointerEvents = "none";
      icon.style.setProperty("--hover-scale", "1");

      if (wrap && wrap.contains(icon)) {
        document.body.appendChild(icon);
      }

      icon.classList.add("icon-exit");

      icon.addEventListener(
        "animationend",
        () => {
          icon.style.display = "none";
        },
        { once: true }
      );
    });
  }

  function loop() {
    if (!done && document.body.classList.contains("scene-fly-up")) {
      done = true;
      detachIconsAndSendDown();
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();

(function () {
  let fired = false;

  function run() {
    if (fired) return;
    if (!document.body.classList.contains("scene-fly-up")) {
      requestAnimationFrame(run);
      return;
    }
    fired = true;

    const icons = Array.from(document.querySelectorAll(".icon"));
    const n = icons.length;

    const TOTAL_MS = 1500;
    const FADE_MS = 650;
    const step = n > 1 ? (TOTAL_MS - FADE_MS) / (n - 1) : 0;

    icons.forEach((icon, i) => {
      const delay = (n - 1 - i) * step;

      const wrap = document.getElementById("scene-wrap");
      if (wrap && wrap.contains(icon)) document.body.appendChild(icon);

      icon.style.pointerEvents = "none";
      icon.style.animation = "none";
      icon.style.willChange = "opacity";
      icon.style.transition = "opacity " + FADE_MS + "ms ease-out";
      icon.style.transitionDelay = delay + "ms";

      requestAnimationFrame(() => {
        icon.style.opacity = "0";
      });

      icon.addEventListener(
        "transitionend",
        (e) => {
          if (e.propertyName !== "opacity") return;
          icon.style.display = "none";
        },
        { once: true }
      );
    });
  }

  requestAnimationFrame(run);
})();

(function () {
  let armed = false;
  let fired = false;

  let maxTy = -1e9;

  function loop() {
    if (!document.body.classList.contains("hero-ready")) {
      requestAnimationFrame(loop);
      return;
    }

    if (!armed) {
      armed = true;
      maxTy = -1e9;
    }

    if (fired) {
      requestAnimationFrame(loop);
      return;
    }

    const ty = Number(Rider && Rider.ty);
    if (!isFinite(ty)) {
      requestAnimationFrame(loop);
      return;
    }

    if (ty > maxTy) maxTy = ty;

    if (maxTy > 60 && ty < maxTy - 2) {
      fired = true;
      document.body.classList.add("mountain-drop");
      return;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();

(function () {
  let lastFlyUp = false;
  let lastHeroReady = false;
  let restarted = false;
  let iconsTimer = null;

  function resetIndexes() {
    if (WorldState && WorldState.runCompleted) {
      castleIndex = -1;
      heartIndex = -1;
      lastCastleFoundTime = 0;
      lastHeartFoundTime = 0;
      return;
    }

    castleIndex = Math.floor(Math.random() * STAR_COUNT);
    do {
      heartIndex = Math.floor(Math.random() * STAR_COUNT);
    } while (heartIndex === castleIndex);

    lastCastleFoundTime = 0;
    lastHeartFoundTime = 0;
  }

  function clearIcons() {
    document.querySelectorAll(".icon").forEach(el => el.remove());
  }

  function hideIconsNow() {
    document.querySelectorAll(".icon").forEach(icon => {
      icon.style.animation = "none";
      icon.style.transition = "none";
      icon.style.opacity = "0";
      icon.style.display = "none";
      icon.style.pointerEvents = "none";
    });
  }

  function snapSceneWrapBack() {
    document.body.classList.add("scene-reset");
    document.body.classList.remove("scene-fly-up");

    const wrap = document.getElementById("scene-wrap");
    if (wrap) wrap.offsetHeight;

    requestAnimationFrame(() => {
      document.body.classList.remove("scene-reset");
    });
  }

  function restartScene() {
    if (typeof window.resetSubAfterTurn === "function") {
      window.resetSubAfterTurn();
    }

    WorldState.autoActivationEnabled = false;
    if (typeof window.__hintStop === "function") window.__hintStop();

    snapSceneWrapBack();

    document.body.classList.remove("mountain-drop");
    document.body.classList.remove("hero-ready");

    const mini = document.getElementById("hero-mini");
    const sled = document.getElementById("sled");

    if (mini) {
      mini.style.opacity = "0";
      mini.style.transform = "translate(-50%, -50%)";
    }

    if (sled) {
      sled.style.display = "";
      sled.style.opacity = "0";
      sled.style.transform = "translate(-50%, -50%)";
    }

    WorldState.mode = "idle";
    WorldState.locked = false;

    starsActivated = 0;
    allStarsTriggered = false;
    totalStarsInitial = STAR_COUNT;

    resetIndexes();

    /* FIX 2.1: “момент рестарта = createStars()” */
    try { if (window.__resetMoveIconsOnce) window.__resetMoveIconsOnce(); } catch (_) {}

    createStars();

    clearIcons();
    if (iconsTimer) clearTimeout(iconsTimer);

    iconsTimer = setTimeout(() => {
      showIconsFan();
      try { if (window.__moveIconsIntoWrapOnce) setTimeout(window.__moveIconsIntoWrapOnce, 0); } catch (_) {}
    }, 1000);
  }

  function loop() {
    const flyUp = document.body.classList.contains("scene-fly-up");
    if (flyUp && !lastFlyUp) {
      hideIconsNow();
    }
    lastFlyUp = flyUp;

    const heroReady = document.body.classList.contains("hero-ready");
    if (heroReady && !lastHeroReady) restarted = false;
    lastHeroReady = heroReady;

    if (heroReady && !restarted) {
      const ov = document.getElementById("hero-overlay-full");
      if (ov && window.getComputedStyle(ov).opacity === "1") {
        restarted = true;
        restartScene();
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();

/* ============================================================
   FINAL STAR TRIGGER PATCH (gora.mp3) — WebAudio
============================================================ */
(function () {
  if (window.__starsSlowFallPatched) return;
  window.__starsSlowFallPatched = true;

  if (!window.__finalTriggerStarPatched) {
    window.__finalTriggerStarPatched = true;

    const FINAL_STAR_ID = "final-star-trigger";
    const FINAL_HALO_ID = "final-star-halo";
    const FINAL_STAR_STYLE_ID = "final-star-trigger-style";

    const __startMountainScene =
      (typeof onAllStarsActivated === "function") ? onAllStarsActivated : null;

    function ensureFinalStarStyle() {
      if (document.getElementById(FINAL_STAR_STYLE_ID)) return;

      const st = document.createElement("style");
      st.id = FINAL_STAR_STYLE_ID;

      st.textContent = `
        #${FINAL_HALO_ID} {
          position: absolute;
          left: 8vw;
          top: calc(5.5 * var(--vh, 1vh) + 0.5cm);

          width: 80px;
          height: 80px;
          border-radius: 9999px;

          display: none;
          opacity: 0;

          pointer-events: none;
          z-index: 9998;

          transform: translate(-50%, -50%) scale(1);

          background: radial-gradient(
            circle,
            rgba(255,255,255,0.95) 0%,
            rgba(255,255,255,0.55) 22%,
            rgba(255,255,255,0.22) 45%,
            rgba(255,255,255,0.00) 72%
          );

          filter: blur(5px);
          will-change: transform, opacity, filter;
        }

        #${FINAL_STAR_ID} {
          position: absolute;
          left: 8vw;
          top: calc(5.5 * var(--vh, 1vh) + 0.5cm);

          width: 120px;
          height: auto;

          display: none;
          opacity: 0;

          cursor: pointer;
          pointer-events: auto;

          z-index: 9999;

          transform: translate(-50%, -50%) scale(1);

          filter:
            drop-shadow(0 0 26px rgba(255,255,255,1))
            drop-shadow(0 0 68px rgba(255,255,255,0.95))
            drop-shadow(0 0 130px rgba(255,255,255,0.55));

          will-change: transform, opacity, filter;
        }

        #${FINAL_HALO_ID}.armed {
          display: block;
          opacity: 0;
          animation:
            finalHaloFadeIn 0.5s ease-out 0s 1 both,
            finalHaloPulse 2s ease-in-out 0.35s infinite;
        }

        #${FINAL_STAR_ID}.armed {
          display: block;
          opacity: 0;
          animation:
            finalStarFadeIn 0.5s ease-out 0s 1 both,
            finalStarPulse 2s ease-in-out 0.35s infinite;
        }

        @keyframes finalStarFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes finalHaloFadeIn { from { opacity: 0; } to { opacity: 1; } }

        @keyframes finalStarPulse {
          0% {
            transform: translate(-50%, -50%) scale(1);
            filter:
              drop-shadow(0 0 26px rgba(255,255,255,1))
              drop-shadow(0 0 68px rgba(255,255,255,0.95))
              drop-shadow(0 0 130px rgba(255,255,255,0.55));
          }
          50% {
            transform: translate(-50%, -50%) scale(1.10);
            filter:
              drop-shadow(0 0 34px rgba(255,255,255,1))
              drop-shadow(0 0 92px rgba(255,255,255,0.98))
              drop-shadow(0 0 175px rgba(255,255,255,0.70));
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            filter:
              drop-shadow(0 0 26px rgba(255,255,255,1))
              drop-shadow(0 0 68px rgba(255,255,255,0.95))
              drop-shadow(0 0 130px rgba(255,255,255,0.55));
          }
        }

        @keyframes finalHaloPulse {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
            filter: blur(5px);
          }
          50% {
            opacity: 0.88;
            transform: translate(-50%, -50%) scale(1.16);
            filter: blur(7px);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
            filter: blur(5px);
          }
        }
      `;
      document.head.appendChild(st);
    }

    function ensureFinalHaloEl() {
      ensureFinalStarStyle();

      let halo = document.getElementById(FINAL_HALO_ID);
      if (halo && halo.isConnected) return halo;

      halo = document.createElement("div");
      halo.id = FINAL_HALO_ID;

      if (starsWrap) starsWrap.appendChild(halo);

      return halo;
    }

    function ensureFinalStarEl() {
      ensureFinalStarStyle();
      ensureFinalHaloEl();

      let el = document.getElementById(FINAL_STAR_ID);
      if (el && el.isConnected) return el;

      el = document.createElement("img");
      el.id = FINAL_STAR_ID;
      el.src = "star6.png";
      el.alt = "Продолжить";

      if (starsWrap) starsWrap.appendChild(el);

      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (WorldState && WorldState.locked) return;
        if (typeof __startMountainScene !== "function") return;

        if (WorldState) WorldState.runCompleted = true;

        try {
          AudioEngine.play("gora.mp3", { mode: "single" });
        } catch (_) {}

        hideFinalStarTrigger();
        __startMountainScene();
      });

      return el;
    }

    function showFinalStarTrigger() {
      if (WorldState && WorldState.mode === "mountain-scene") return;

      const halo = ensureFinalHaloEl();
      const star = ensureFinalStarEl();
      if (!halo || !star) return;

      [halo, star].forEach(el => {
        el.style.display = "";
        el.style.opacity = "";
        el.style.animation = "";
        el.style.transform = "";
        el.style.filter = "";
      });

      halo.classList.remove("armed");
      star.classList.remove("armed");
      void star.offsetWidth;
      halo.classList.add("armed");
      star.classList.add("armed");
    }

    function hideFinalStarTrigger() {
      const halo = document.getElementById(FINAL_HALO_ID);
      const star = document.getElementById(FINAL_STAR_ID);

      [halo, star].forEach(el => {
        if (!el) return;
        el.classList.remove("armed");
        el.style.display = "none";
        el.style.opacity = "0";
        el.style.animation = "none";
      });
    }

    function showFinalStarWhenSafe() {
      const t0 = performance.now();
      const MAX_WAIT_MS = 12000;

      (function loop() {
        const locked = !!(WorldState && WorldState.locked);
        const fxOnScreen = !!document.querySelector(".castle, .heart");
        const fxBusy = !!(WorldState && WorldState.fxBusyCount > 0);

        if (!locked && !fxOnScreen && !fxBusy) {
          showFinalStarTrigger();
          return;
        }

        if (performance.now() - t0 >= MAX_WAIT_MS) {
          showFinalStarTrigger();
          return;
        }

        setTimeout(loop, 80);
      })();
    }

    if (typeof onAllStarsActivated === "function") {
      onAllStarsActivated = function () {
        showFinalStarWhenSafe();
      };
    }

    Promise.resolve().then(() => {
      const _createStars = createStars;
      createStars = function () {
        const res = _createStars.apply(this, arguments);

        if (typeof allStarsTriggered !== "undefined" && allStarsTriggered) {
          if (WorldState && WorldState.mode !== "mountain-scene") {
            showFinalStarWhenSafe();
          }
        }

        return res;
      };
    });
  }

  const STAR_FALL_DUR_S = 9;

  const _createStars = createStars;
  createStars = function () {
    const ov = document.getElementById("hero-overlay-full");
    if (ov && getComputedStyle(ov).opacity === "1") {
      document.documentElement.style.setProperty("--fall-dur", STAR_FALL_DUR_S + "s");
    }
    return _createStars.apply(this, arguments);
  };
})();

/* ============================================================
   SUB (sub.png)
============================================================ */
(function () {
  if (window.__subAfterTurnV5) return;
  window.__subAfterTurnV5 = true;

  const SUB_ID = "sub-after-turn";
  const STYLE_ID = "sub-after-turn-style";

  const SUB_LINK = "https://vk.ru/aparte.band?from=groups";

  const SUB_ICON_GAP_PX = 42;
  const SUB_RISE_PX = 0;
  const SUB_NO_STAR_PAD_PX = 26;

  let __subGuardRAF = 0;
  let __subGuardEl = null;

  function __rectsIntersect(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  function __applySubStarMask() {
    if (!__subGuardEl || !__subGuardEl.isConnected) return;

    const cs = getComputedStyle(__subGuardEl);
    if (cs.display === "none" || parseFloat(cs.opacity || "0") < 0.05) return;

    const r0 = __subGuardEl.getBoundingClientRect();
    const r = {
      left: r0.left - SUB_NO_STAR_PAD_PX,
      top: r0.top - SUB_NO_STAR_PAD_PX,
      right: r0.right + SUB_NO_STAR_PAD_PX,
      bottom: r0.bottom + SUB_NO_STAR_PAD_PX
    };

    document.querySelectorAll(".star").forEach(star => {
      if (!star || !star.isConnected) return;

      const sr = star.getBoundingClientRect();
      const hit = __rectsIntersect(sr, r);

      if (hit) {
        if (!star.dataset.subMaskApplied) {
          star.dataset.subMaskApplied = "1";
          star.dataset.subPrevVisibility = star.style.visibility || "";
          star.dataset.subPrevPointer = star.style.pointerEvents || "";
        }
        star.style.visibility = "hidden";
        star.style.pointerEvents = "none";
      } else {
        if (star.dataset.subMaskApplied === "1") {
          star.style.visibility = star.dataset.subPrevVisibility || "";
          star.style.pointerEvents = star.dataset.subPrevPointer || "";
          delete star.dataset.subMaskApplied;
          delete star.dataset.subPrevVisibility;
          delete star.dataset.subPrevPointer;
        }
      }
    });
  }

  function __startSubStarGuard(el) {
    __stopSubStarGuard();
    __subGuardEl = el;

    function loop() {
      if (!__subGuardEl || !__subGuardEl.isConnected) {
        __stopSubStarGuard();
        return;
      }
      __applySubStarMask();
      __subGuardRAF = requestAnimationFrame(loop);
    }

    __subGuardRAF = requestAnimationFrame(loop);
  }

  function __stopSubStarGuard() {
    if (__subGuardRAF) cancelAnimationFrame(__subGuardRAF);
    __subGuardRAF = 0;

    __subGuardEl = null;

    document.querySelectorAll(".star").forEach(star => {
      if (!star || !star.isConnected) return;
      if (star.dataset.subMaskApplied === "1") {
        star.style.visibility = star.dataset.subPrevVisibility || "";
        star.style.pointerEvents = star.dataset.subPrevPointer || "";
        delete star.dataset.subMaskApplied;
        delete star.dataset.subPrevVisibility;
        delete star.dataset.subPrevPointer;
      }
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      #${SUB_ID} {
        position: fixed;
        left: 50%;
        top: calc(72 * var(--vh, 1vh));
        transform: translate(-50%, -50%);

        width: clamp(117px, 22.1vmin, 273px);
        height: auto;

        opacity: 0;
        display: none;

        pointer-events: auto;
        cursor: pointer;

        z-index: 9900;

        transition: opacity 0.9s ease-out;
        will-change: opacity, left, top;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureEl() {
    ensureStyle();

    let el = document.getElementById(SUB_ID);
    if (el && el.isConnected) return el;

    el = document.createElement("img");
    el.id = SUB_ID;
    el.src = "sub.png";
    el.alt = "sub";
    el.setAttribute("draggable", "false");

    /* FIX: без fallback в текущую вкладку (чтобы не было двойного открытия) */
    el.addEventListener(__TAP_EVT, (e) => {
      e.preventDefault();
      e.stopPropagation();
      __openExternalBlank(SUB_LINK);
    }, { passive: false });

    document.body.appendChild(el);
    return el;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && parseFloat(cs.opacity || "0") > 0.05;
  }

  function getVisibleIconRects() {
    const icons = Array.from(document.querySelectorAll(".icon"));
    const rects = [];

    icons.forEach(ic => {
      if (!ic || !ic.isConnected) return;
      const cs = getComputedStyle(ic);
      if (cs.display === "none") return;
      if (parseFloat(cs.opacity || "1") < 0.15) return;

      const r = ic.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;

      rects.push(r);
    });

    return rects;
  }

  function computeFanCenterX(iconRects) {
    if (!iconRects || iconRects.length === 0) return window.innerWidth / 2;
    const minL = Math.min.apply(null, iconRects.map(r => r.left));
    const maxR = Math.max.apply(null, iconRects.map(r => r.right));
    return (minL + maxR) * 0.5;
  }

  function computeSubTopPx(subHeight, iconRects) {
    if (!iconRects || iconRects.length === 0) {
      return Math.max(120, window.innerHeight - 180) - SUB_RISE_PX;
    }

    const iconsTop = Math.min.apply(null, iconRects.map(r => r.top));
    const top = iconsTop - SUB_ICON_GAP_PX - (subHeight / 2) - SUB_RISE_PX;

    const minTop = 60 + subHeight / 2;
    return Math.max(minTop, top);
  }

  window.showSubAfterTurn = function () {
    const el = ensureEl();
    if (!el) return;

    if (isVisible(el)) return;

    el.style.display = "block";
    el.style.opacity = "0";

    el.style.left = "50%";
    el.style.top = "0px";
    el.getBoundingClientRect();
    const subRect = el.getBoundingClientRect();
    const subH = subRect.height || 0;

    const iconRects = getVisibleIconRects();
    const cx = computeFanCenterX(iconRects);
    const topPx = computeSubTopPx(subH, iconRects);

    el.style.left = Math.round(cx) + "px";
    el.style.top = Math.round(topPx) + "px";

    __startSubStarGuard(el);

    el.getBoundingClientRect();
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });
  };

  window.resetSubAfterTurn = function () {
    const el = document.getElementById(SUB_ID);
    if (!el || !el.isConnected) return;

    __stopSubStarGuard();

    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.display = "none";
    el.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (!el || !el.isConnected) return;
      el.style.transition = "opacity 0.9s ease-out";
    });
  };
})();
