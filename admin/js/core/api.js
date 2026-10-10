/* ==========================================================================
   Mercy Studio · Panel — core/api.js
   Cliente HTTP del panel (contrato §4):
   · fetch con credentials "same-origin"; JSON de ida y vuelta.
   · Toda petición no-GET lleva X-Mercy-Admin: 1 (protección CSRF del servidor).
   · Errores → ApiError { status, code, message (español, listo para mostrar), fields, data }.
   · 401 → si el panel registró onSessionLost (core/reauth.js), él decide: volver a entrar en un diálogo sin salir
     de la página (la petición se repite sola) o ir al ingreso; si no, redirige a login.html?next=<hash>&motivo=sesion.
     { auth: false } = ni una cosa ni la otra (página de ingreso, cerrar sesión).
   · upload() usa XMLHttpRequest para informar el progreso de la subida.
   ========================================================================== */

const NETWORK_MSG = "No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.";
const STATUS_MSG = {
  400: "La petición no es válida.",
  401: "Tu sesión expiró o no has iniciado sesión. Vuelve a entrar.",
  403: "No tienes permiso para hacer esto.",
  404: "No se encontró lo que buscas.",
  409: "Hubo un conflicto con los datos actuales. Recarga e intenta de nuevo.",
  413: "El archivo o el contenido es demasiado grande.",
  415: "Formato no permitido.",
  422: "Revisa los campos marcados.",
  429: "Demasiados intentos. Espera un momento e intenta de nuevo.",
  500: "Ocurrió un error inesperado en el servidor. Intenta de nuevo.",
  502: "El servidor no responde en este momento. Intenta de nuevo en unos minutos.",
  503: "El servidor no está disponible en este momento. Intenta de nuevo en unos minutos.",
  504: "El servidor tardó demasiado en responder. Intenta de nuevo.",
};
const CODE_BY_STATUS = { 400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 413: "payload_too_large", 415: "unsupported_media", 422: "validation", 429: "rate_limited" };

/** Error de la API con el formato del contrato. `data` = objeto `error` completo (usages, current, retryAfter…). */
export class ApiError extends Error {
  constructor({ status = 0, code = "server", message = "", fields = null, data = null } = {}) {
    super(message || STATUS_MSG[status] || NETWORK_MSG);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields || null;
    this.data = data || {};
  }
  /** 409 por edición concurrente (trae la versión vigente en data.current). */
  get isConflict() { return this.status === 409 && this.code === "conflict" && this.data && "current" in this.data; }
  get isInUse() { return this.code === "in_use"; }
  get isValidation() { return this.code === "validation"; }
  get retryAfter() { return Number(this.data?.retryAfter) || 0; }
}

export const isAbort = (e) => e?.name === "AbortError";

/* ---------- Redirección al login ---------- */
let redirecting = false;
let redirectTimer = 0;

export function loginUrl({ next = location.hash, reason = "" } = {}) {
  const n = next && next.startsWith("#/") ? next : "#/";
  return `login.html?next=${encodeURIComponent(n)}${reason ? `&motivo=${reason}` : ""}`;
}

export function redirectToLogin(reason = "sesion") {
  if (redirecting) return;
  redirecting = true;
  location.assign(loginUrl({ reason }));
  // Si la salida se canceló (p. ej. el aviso del navegador «¿Salir del sitio?»), el siguiente 401 vuelve a intentarlo
  clearTimeout(redirectTimer);
  redirectTimer = setTimeout(() => { redirecting = false; }, 3000);
}

/* ---------- Sesión perdida (401) ---------- */
let sessionLostHandler = null;
let pendingRecovery = null;

/**
 * onSessionLost(async ({ method, url }) => "retry" | "dismissed" | "redirect")
 *   "retry"      la persona volvió a entrar: la petición se repite (una vez) con la sesión nueva
 *   "dismissed"  cerró el diálogo y sigue en la página: la petición falla con e.sessionDismissed = true
 *   "redirect"   el manejador ya llevó al ingreso
 * Varias peticiones con 401 a la vez comparten el mismo diálogo.
 */
export function onSessionLost(fn) { sessionLostHandler = typeof fn === "function" ? fn : null; }

function recoverSession(method, url) {
  if (!sessionLostHandler) { redirectToLogin("sesion"); return Promise.resolve("redirect"); }
  if (!pendingRecovery) {
    pendingRecovery = Promise.resolve()
      .then(() => sessionLostHandler({ method, url }))
      .catch((e) => { console.error(e); redirectToLogin("sesion"); return "redirect"; })
      .finally(() => { pendingRecovery = null; });
  }
  return pendingRecovery;
}

/* ---------- Núcleo ---------- */
async function readBody(res) {
  const type = res.headers.get("content-type") || "";
  if (res.status === 204) return null;
  if (type.includes("application/json")) {
    try { return await res.json(); } catch { return null; }
  }
  try { return { text: await res.text() }; } catch { return null; }
}

function toError(status, body) {
  const e = body && typeof body === "object" && body.error && typeof body.error === "object" ? body.error : null;
  return new ApiError({
    status,
    code: e?.code || CODE_BY_STATUS[status] || "server",
    message: e?.message || STATUS_MSG[status] || STATUS_MSG[500],
    fields: e?.fields || null,
    data: e || {},
  });
}

const isBinary = (b) => b instanceof Blob || b instanceof ArrayBuffer || ArrayBuffer.isView(b) || b instanceof FormData;

/**
 * request("PUT", "/api/admin/content/home", { body, headers, signal, auth })
 *   body: objeto → JSON · Blob/ArrayBuffer → binario tal cual.
 *   auth: false → un 401 NO redirige al login (lo usa la página de ingreso).
 *   raw: true → devuelve el Response (para descargas).
 */
export async function request(method, url, { body, headers = {}, signal, auth = true, raw = false, retried = false } = {}) {
  const h = { Accept: "application/json", ...headers };
  if (method !== "GET" && method !== "HEAD") h["X-Mercy-Admin"] = "1";
  const init = { method, credentials: "same-origin", headers: h, signal, cache: "no-store" };
  if (body !== undefined) {
    if (isBinary(body)) init.body = body;
    else {
      h["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError({ status: 0, code: "network", message: NETWORK_MSG });
  }
  if (raw && res.ok) return res;
  const data = await readBody(res);
  if (!res.ok) {
    const err = toError(res.status, data);
    if (res.status === 401 && auth && !retried) {
      const r = await recoverSession(method, url);
      if (r === "retry" && !signal?.aborted) return request(method, url, { body, headers, signal, auth, raw, retried: true });
      err.sessionDismissed = r === "dismissed";
    } else if (res.status === 401 && auth) err.sessionDismissed = true; // volvió a entrar y aun así 401: se avisa en la página
    throw err;
  }
  return data;
}

/**
 * Subida binaria con progreso (XMLHttpRequest).
 *   upload("/api/admin/media", blob, { method: "POST", headers: { "X-File-Name": … }, onProgress: (f) => …, signal })
 *   onProgress(fracción 0–1, bytesEnviados, total)
 */
export function upload(url, blob, opts = {}) {
  return uploadOnce(url, blob, opts).catch(async (err) => {
    if (!(err instanceof ApiError) || err.status !== 401 || opts.auth === false) throw err;
    const r = await recoverSession(opts.method || "POST", url);
    if (r === "retry" && !opts.signal?.aborted) return uploadOnce(url, blob, opts);
    err.sessionDismissed = r === "dismissed";
    throw err;
  });
}

function uploadOnce(url, blob, { method = "POST", headers = {}, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.responseType = "text";
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Mercy-Admin", "1");
    const all = { "Content-Type": blob.type || "application/octet-stream", ...headers };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== null) xhr.setRequestHeader(k, String(v));
    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) onProgress(ev.loaded / ev.total, ev.loaded, ev.total);
      });
    }
    const onAbort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) { reject(new DOMException("Subida cancelada", "AbortError")); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    const done = () => signal?.removeEventListener("abort", onAbort);
    xhr.addEventListener("load", () => {
      done();
      let body = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { body = null; }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1, blob.size, blob.size);
        resolve(body);
      } else {
        reject(toError(xhr.status, body));
      }
    });
    xhr.addEventListener("error", () => { done(); reject(new ApiError({ status: 0, code: "network", message: NETWORK_MSG })); });
    xhr.addEventListener("abort", () => { done(); reject(new DOMException("Subida cancelada", "AbortError")); });
    xhr.send(blob);
  });
}

/** Atajos: api.get(url) · api.post(url, body) · api.put(url, body, { headers }) · api.del(url) · api.upload(url, blob, opts) */
export const api = {
  get: (url, opts) => request("GET", url, opts),
  post: (url, body, opts) => request("POST", url, { ...opts, body }),
  put: (url, body, opts) => request("PUT", url, { ...opts, body }),
  del: (url, opts) => request("DELETE", url, opts),
  upload,
  request,
};

/** Construye "/api/admin/media?kind=image&q=…" omitiendo vacíos. */
export function withQuery(url, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${url}${url.includes("?") ? "&" : "?"}${s}` : url;
}

/** Descarga un archivo de la API (p. ej. el CSV de suscriptores) respetando la sesión. */
export async function download(url, fallbackName = "descarga") {
  const res = await request("GET", url, { raw: true, headers: { Accept: "*/*" } });
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  const name = m ? m[1] : fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  return name;
}
