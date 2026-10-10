/* ==========================================================================
   Mercy Studio · Panel — core/format.js
   Formatos y utilidades puras (sin DOM):
   · money(89900) → "$89.900" · number · bytes · date / dateTime / relativeTime (hora de Colombia)
   · slugify, fold (minúsculas sin tildes), escapeHtml, debounce, clone, deepEqual
   · getPath / setPath con rutas "a.b.0.c" (las que usa Form y los errores del servidor)
   ========================================================================== */

export const TZ = "America/Bogota";
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* ---------- Números y dinero ---------- */
/** 1234567 → "1.234.567" (separador de miles con punto, sin decimales salvo `decimals`). */
export function number(n, decimals = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const fixed = Math.abs(v).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec && Number(dec) !== 0 ? "," + dec : "");
  return (v < 0 ? "-" : "") + s;
}

/** 89900 → "$89.900" (COP sin decimales). */
export function money(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-$" : "$") + number(Math.abs(v));
}

/** 1536 → "1,5 KB" */
export function bytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${number(x, x < 10 ? 1 : 0)} ${units[i]}`;
}

/** plural(3, "producto", "productos") → "3 productos" */
export function plural(n, one, many) {
  return `${number(n)} ${n === 1 ? one : many}`;
}

/* ---------- Fechas (siempre en hora de Colombia) ---------- */
function partsCO(d) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month - 1, d: +o.day, h: +o.hour, min: +o.minute };
}

const isYmd = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** "2026-10-09" o ISO → "9 oct 2026" ({ long: true } → "9 de octubre de 2026"). */
export function date(v, { long = false } = {}) {
  if (!v) return "—";
  let p;
  if (isYmd(v)) {
    const [y, m, d] = v.split("-").map(Number);
    p = { y, m: m - 1, d };
  } else {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    p = partsCO(d);
  }
  return long ? `${p.d} de ${MESES[p.m]} de ${p.y}` : `${p.d} ${MESES_CORTOS[p.m]} ${p.y}`;
}

/** ISO → "9 oct 2026, 3:45 p. m." */
export function dateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const p = partsCO(d);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${p.d} ${MESES_CORTOS[p.m]} ${p.y}, ${h12}:${String(p.min).padStart(2, "0")} ${p.h < 12 ? "a. m." : "p. m."}`;
}

/** ISO → "hace un momento" · "hace 5 min" · "hace 2 h" · "ayer" · "hace 3 días" · fecha corta. */
export function relativeTime(v, now = Date.now()) {
  if (!v) return "—";
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((now - t) / 1000);
  if (s < 0) return dateTime(v);
  if (s < 45) return "hace un momento";
  const min = Math.round(s / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const today = todayCO(now);
  const day = todayCO(t);
  const diffDays = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  if (diffDays <= 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} días`;
  return date(v);
}

/** Fecha de hoy en Colombia "AAAA-MM-DD". */
export function todayCO(at = Date.now()) {
  const p = partsCO(new Date(at));
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/* ---------- Texto ---------- */
/** Minúsculas sin tildes (para búsquedas). */
export function fold(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Camiseta Fé Nueva!" → "camiseta-fe-nueva" (formato de id del contrato, máx. 60). */
export function slugify(s, max = 60) {
  return fold(s).replace(/ñ/g, "n").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function truncate(s, n = 80) {
  const t = String(s ?? "");
  return [...t].length > n ? [...t].slice(0, n - 1).join("") + "…" : t;
}

/** "Ana María Pérez" → "AP" */
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Cantidad de caracteres como la cuenta el servidor (puntos de código: un emoji = 1). */
export const charCount = (s) => [...String(s ?? "")].length;

/* ---------- Funciones ---------- */
export function debounce(fn, ms = 250) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

/* ---------- Objetos ---------- */
export function clone(v) {
  if (v === undefined) return undefined;
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

/** Igualdad profunda de valores JSON (no importa el orden de las claves). */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

/** Divide "a.b.0.c" en ["a","b",0,"c"] (los números son índices). */
export function splitPath(path) {
  if (path === "" || path === null || path === undefined) return [];
  return String(path).split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

export function getPath(obj, path) {
  let cur = obj;
  for (const k of splitPath(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Asigna en sitio creando objetos/listas intermedios. Devuelve obj. */
export function setPath(obj, path, value) {
  const keys = splitPath(path);
  if (!keys.length) return value;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === null || typeof cur[k] !== "object") cur[k] = typeof keys[i + 1] === "number" ? [] : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

/* ---------- URLs (mismas reglas que el servidor, contrato §2) ---------- */
const BAD_URL_CHARS = /[\s"'<>\\`\u0000-\u001f\u007f]/;
const SITE_FILE_RE = /^\/?(?:uploads|assets)\/[^?#]+(?:[?#].*)?$/;
const PAGE_RE = /^\/?(?:index|catalogo|producto|checkout)\.html(?:[?#].*)?$/;

/**
 * kind: "external" (solo http/https: redes sociales) · "media" (http/https o /uploads, /assets)
 *       "link" (además páginas del sitio y anclas #…).
 */
export function isSafeUrl(s, kind = "link") {
  if (typeof s !== "string" || !s || s.length > 2048 || BAD_URL_CHARS.test(s)) return false;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
    } catch {
      return false;
    }
  }
  if (kind === "external") return false;
  if (SITE_FILE_RE.test(s)) return !s.split(/[?#]/)[0].split("/").some((p) => p === ".." || p === ".");
  if (kind === "media") return false;
  return PAGE_RE.test(s) || s.startsWith("#");
}

export const URL_MESSAGES = {
  external: "Usa una dirección completa que empiece por https://",
  media: "Usa una URL https://… o un archivo de la biblioteca de medios (/uploads/…).",
  link: "Usa una URL https://…, una página del sitio (p. ej. catalogo.html) o un ancla (#…).",
};

/** URL del contenido → URL usable desde /admin/ (assets/… relativo a la raíz del sitio). */
export function siteUrl(u) {
  const s = String(u || "");
  if (!s) return "";
  if (/^(https?:|blob:|data:)/i.test(s) || s.startsWith("/")) return s;
  return "/" + s.replace(/^\.\//, "");
}

/** Nombre de archivo de una URL: "/uploads/2026/10/m-123-foto.webp" → "m-123-foto.webp" */
export function fileNameOf(u) {
  const s = String(u || "").split(/[?#]/)[0];
  const last = s.split("/").filter(Boolean).pop() || s;
  try { return decodeURIComponent(last); } catch { return last; }
}
