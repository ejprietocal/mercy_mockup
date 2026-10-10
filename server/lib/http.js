/* ==========================================================================
   Mercy Studio — server/lib/http.js
   Capa HTTP mínima (sin dependencias):
   · HttpError + fábricas de errores con el formato del contrato (§4).
   · Router con parámetros (/api/admin/products/:id).
   · Lectura de cuerpo JSON con límite (413) y de cuerpo binario en streaming a archivo.
   · Respuestas JSON (gzip si conviene), cookies, IP del cliente y HTTPS detrás de proxy.
   ========================================================================== */
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { gzipSync } from "node:zlib";

/* ---------- Errores ---------- */
export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || null;   // campos adicionales dentro de { error: {…} } (fields, usages, current…)
    this.headers = null;          // cabeceras adicionales (Retry-After…)
  }
}

export const err = {
  badRequest: (m = "La petición no es válida.", extra) => new HttpError(400, "bad_request", m, extra),
  validation: (fields, m = "Revisa los campos marcados.") => new HttpError(422, "validation", m, { fields }),
  unauthorized: (m = "Inicia sesión para continuar.") => new HttpError(401, "unauthorized", m),
  forbidden: (m = "No tienes permiso para hacer esto.") => new HttpError(403, "forbidden", m),
  notFound: (m = "No encontrado.") => new HttpError(404, "not_found", m),
  conflict: (m, extra) => new HttpError(409, "conflict", m, extra),
  inUse: (m, extra) => new HttpError(409, "in_use", m, extra),
  tooLarge: (m = "El contenido es demasiado grande.") => new HttpError(413, "payload_too_large", m),
  unsupported: (m = "Formato no permitido.") => new HttpError(415, "unsupported_media", m),
  rateLimited: (retryAfter, m) => {
    const mins = Math.max(1, Math.ceil(retryAfter / 60));
    const e = new HttpError(429, "rate_limited",
      m || `Demasiados intentos. Intenta de nuevo en ${mins} ${mins === 1 ? "minuto" : "minutos"}.`, { retryAfter });
    e.headers = { "Retry-After": String(retryAfter) };
    return e;
  },
  server: (m = "Ocurrió un error inesperado en el servidor. Intenta de nuevo.") => new HttpError(500, "server", m),
};

/* ---------- Router ---------- */
export class Router {
  constructor() { this.routes = []; }

  add(method, pattern, ...handlers) {
    const parts = pattern.split("/").filter(Boolean);
    this.routes.push({ method, parts, handlers });
  }
  get(p, ...h) { this.add("GET", p, ...h); }
  post(p, ...h) { this.add("POST", p, ...h); }
  put(p, ...h) { this.add("PUT", p, ...h); }
  delete(p, ...h) { this.add("DELETE", p, ...h); }

  /** → { handlers, params } | { allowed: [métodos] } (ruta existe con otro método) | null */
  match(method, segments) {
    const m = method === "HEAD" ? "GET" : method;
    const allowed = new Set();
    for (const r of this.routes) {
      if (r.parts.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p[0] === ":") params[p.slice(1)] = segments[i];
        else if (p !== segments[i]) { ok = false; break; }
      }
      if (!ok) continue;
      if (r.method === m) return { handlers: r.handlers, params };
      allowed.add(r.method);
    }
    return allowed.size ? { allowed: [...allowed] } : null;
  }
}

/* ---------- URL ---------- */
/** Separa ruta y query SIN normalizar (el estático valida la ruta cruda). */
export function splitUrl(rawUrl) {
  const url = rawUrl || "/";
  const q = url.indexOf("?");
  return q === -1 ? { pathname: url, search: "" } : { pathname: url.slice(0, q), search: url.slice(q + 1) };
}

/** Segmentos decodificados de una ruta de la API; null si la codificación es inválida. */
export function apiSegments(pathname) {
  const out = [];
  for (const raw of pathname.split("/")) {
    if (!raw) continue;
    let s;
    try { s = decodeURIComponent(raw); } catch { return null; }
    if (s.includes("\0")) return null;
    out.push(s);
  }
  return out;
}

/* ---------- Proxy, IP y HTTPS ---------- */
/** TRUST_PROXY: "", "0", "false" → no; "1"/"true" → 1 salto; "N" → N saltos. */
export function parseTrustProxy(v) {
  if (v === true) return 1;
  if (v === false || v == null) return 0;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "yes") return 1;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 0;
}

export function clientIp(req, trustHops) {
  const direct = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (!trustHops) return direct;
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!xff.length) return direct;
  // El proxy de confianza AÑADE al final: tomamos la entrada N desde la derecha.
  const ip = xff[Math.max(0, xff.length - trustHops)];
  return (ip || direct).replace(/^::ffff:/, "");
}

export function isSecure(req, trustHops) {
  if (req.socket.encrypted) return true;
  if (!trustHops) return false;
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";
}

export function requestHost(req, trustHops) {
  if (trustHops && req.headers["x-forwarded-host"]) return String(req.headers["x-forwarded-host"]).split(",")[0].trim().toLowerCase();
  return String(req.headers.host || "").toLowerCase();
}

/* ---------- Cookies ---------- */
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    let v = part.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, httpOnly = false, sameSite = "Lax", secure = false, path = "/" } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}`;
  if (maxAge != null) s += `; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
  if (maxAge === 0) s += "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  if (httpOnly) s += "; HttpOnly";
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += "; Secure";
  return s;
}

/* ---------- Respuestas ---------- */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function acceptsGzip(req) {
  return /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
}

/**
 * Envía `body` (Buffer o string) con gzip si el cliente lo acepta y vale la pena.
 * Aplica las cookies pendientes de ctx.setCookies.
 * `gzip`: función que devuelve el cuerpo YA comprimido (en caché del llamador) para no comprimir en cada petición.
 */
export function sendBody(ctx, status, body, headers = {}, { gzip: pre } = {}) {
  const { req, res } = ctx;
  if (res.headersSent) return;
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""), "utf8");
  const h = { ...headers };
  if (ctx.setCookies?.length) h["Set-Cookie"] = ctx.setCookies;
  if (ctx.closeAfter) h.Connection = "close";
  if (buf.length > 1024 && status !== 204 && status !== 304 && acceptsGzip(req) && /json|javascript|text|csv/.test(h["Content-Type"] || "")) {
    buf = typeof pre === "function" ? pre() : gzipSync(buf);
    h["Content-Encoding"] = "gzip";
    h.Vary = "Accept-Encoding";
  }
  if (status !== 204 && status !== 304) h["Content-Length"] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === "HEAD" || status === 204 || status === 304 ? undefined : buf);
}

export function sendJson(ctx, status, obj, headers = {}) {
  sendBody(ctx, status, JSON.stringify(obj), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

/** Cabecera X-Base-Updated-At (concurrencia optimista: el updatedAt que leyó el panel) o null. */
export function baseUpdatedAt(ctx) {
  const v = ctx.req.headers["x-base-updated-at"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function sendError(ctx, e) {
  const body = { error: { code: e.code, message: e.message, ...(e.extra || {}) } };
  sendJson(ctx, e.status, body, e.headers || {});
}

/* ---------- Cuerpos ---------- */
export const JSON_LIMIT = 2 * 1024 * 1024;
/* Si un cuerpo supera el límite, se leen y descartan hasta 64 MB más para poder responder un 413
   limpio (el navegador lo ve como respuesta y no como "error de red"); más allá se corta la conexión. */
const DRAIN_CAP = 64 * 1024 * 1024;

function tooLargeMsg(limit) {
  const mb = limit / (1024 * 1024);
  return `El archivo o los datos superan el máximo permitido (${mb >= 1 ? Math.round(mb) + " MB" : Math.round(limit / 1024) + " KB"}).`;
}

/** Descarta el resto del cuerpo y luego rechaza con `error` (o corta si se pasa de DRAIN_CAP). */
function rejectAfterDrain(ctx, error, already = 0) {
  const { req } = ctx;
  return new Promise((_, reject) => {
    if (req.complete || req.destroyed) { reject(error); return; }
    let n = already;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      req.off("data", onData); req.off("end", finish); req.off("close", finish); req.off("error", finish);
      reject(error);
    };
    const onData = (c) => {
      n += c.length;
      if (n > DRAIN_CAP) { ctx.closeAfter = true; req.pause(); finish(); }
    };
    req.on("data", onData);
    req.on("end", finish);
    req.on("close", finish);
    req.on("error", finish);
    req.resume();
  });
}

/** ¿Content-Length declarado ya supera el límite? → promesa rechazada (drenando si es razonable). */
function declaredTooLarge(ctx, limit) {
  const declared = Number(ctx.req.headers["content-length"]);
  if (!Number.isFinite(declared) || declared <= limit) return null;
  const e = err.tooLarge(tooLargeMsg(limit));
  if (declared > limit + DRAIN_CAP) { ctx.closeAfter = true; return Promise.reject(e); }
  return rejectAfterDrain(ctx, e);
}

/** Lee el cuerpo completo en memoria (máx. `limit` bytes). */
export function readBuffer(ctx, limit) {
  const { req } = ctx;
  const early = declaredTooLarge(ctx, limit);
  if (early) return early;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (e, v) => { if (done) return; done = true; cleanup(); e ? reject(e) : resolve(v); };
    const onData = (c) => {
      size += c.length;
      if (size > limit) {
        cleanup();
        done = true;
        chunks.length = 0;
        rejectAfterDrain(ctx, err.tooLarge(tooLargeMsg(limit)), size).catch(reject);
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks));
    const onError = () => finish(err.badRequest("La petición se interrumpió."));
    const onClose = () => { if (!req.complete) finish(err.badRequest("La petición se interrumpió.")); };
    const cleanup = () => { req.off("data", onData); req.off("end", onEnd); req.off("error", onError); req.off("close", onClose); };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

/** Lee y parsea JSON (≤ 2 MB). Cuerpo vacío → {}. */
export async function readJson(ctx, limit = JSON_LIMIT) {
  const ct = String(ctx.req.headers["content-type"] || "").toLowerCase();
  const buf = await readBuffer(ctx, limit);
  if (!buf.length) return {};
  if (ct && !ct.includes("application/json")) throw err.unsupported("Envía los datos en formato JSON (Content-Type: application/json).");
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw err.badRequest("El cuerpo de la petición no es JSON válido.");
  }
}

/**
 * Guarda el cuerpo crudo en `dest` en streaming (sin cargarlo en memoria).
 * Si supera `limit` responde 413 (y borra el archivo parcial). Devuelve los bytes escritos.
 */
export function receiveToFile(ctx, dest, limit) {
  const { req } = ctx;
  const early = declaredTooLarge(ctx, limit);
  if (early) return early;
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(dest, { flags: "wx", mode: 0o644 });
    let bytes = 0;
    let done = false;
    // Espera a que el archivo se cierre (si aún se estaba abriendo) antes de borrarlo
    const discard = () => new Promise((r) => {
      if (ws.closed) return r();
      ws.once("close", r);
      ws.destroy();
    }).then(() => unlink(dest).catch(() => {}));
    const finish = (e, v) => {
      if (done) return;
      done = true;
      cleanup();
      if (e) discard().finally(() => reject(e));
      else resolve(v);
    };
    const onData = (c) => {
      bytes += c.length;
      if (bytes > limit) {
        done = true;
        cleanup();
        discard().finally(() => rejectAfterDrain(ctx, err.tooLarge(tooLargeMsg(limit)), bytes).catch(reject));
        return;
      }
      if (!ws.write(c)) { req.pause(); ws.once("drain", () => { if (!done) req.resume(); }); }
    };
    const onEnd = () => { if (!done) ws.end(); };
    const onReqError = () => finish(err.badRequest("La subida se interrumpió."));
    const onClose = () => { if (!req.complete) finish(err.badRequest("La subida se interrumpió.")); };
    const cleanup = () => { req.off("data", onData); req.off("end", onEnd); req.off("error", onReqError); req.off("close", onClose); };
    ws.on("finish", () => finish(null, bytes));
    ws.on("error", (e) => finish(e));
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onReqError);
    req.on("close", onClose);
  });
}
