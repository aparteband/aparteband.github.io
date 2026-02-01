// Ссылки на стриминги (строго из твоего сообщения)
const URLS = {
  yandex:  "https://music.yandex.ru/album/36297300/track/138373316?ref_id=4BDABF68-5903-4C4A-98A7-35D7E17B8213&utm_medium=copy_link",
  zvuk:    "https://share.zvuk.com/cLQ0/9bw5ym1b",
  kion:    "https://mts-music-spo.onelink.me/sKFX/ex58sdmo",
  apple:   "https://music.apple.com/ru/album/%D0%BF%D0%BE%D0%BB%D0%BD%D1%8B-%D0%BB%D1%8E%D0%B1%D0%B2%D0%B8/1808785284?i=1808785286",
  vk:      "https://vk.ru/audio-2001043938_136043938",
  spotify: "https://vk.ru/audio-2001043938_136043938спотик"
};

// Аккуратно обрезаем лишний хвост, если он не часть URL (например, "спотик")
function sanitizeUrl(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();

  // Берём всё, что начинается с http(s) и продолжается без пробелов
  const m = trimmed.match(/^https?:\/\/\S+/i);
  if (!m) return "";

  // Убираем хвостовые не-ASCII символы (чтобы "спотик" не ломал ссылку)
  return m[0].replace(/[^\x21-\x7E]+$/g, "");
}

function setHref(id, rawUrl) {
  const a = document.getElementById(id);
  if (!a) return;

  const url = sanitizeUrl(rawUrl);
  if (!url) return;

  a.href = url;
}

setHref("lnkYandex",  URLS.yandex);
setHref("lnkZvuk",    URLS.zvuk);
setHref("lnkKion",    URLS.kion);
setHref("lnkApple",   URLS.apple);
setHref("lnkVk",      URLS.vk);
setHref("lnkSpotify", URLS.spotify);
