/* ==========================================================================
   Mercy Studio — server/lib/static.js
   Archivos estáticos (reemplaza a nginx), contrato §4.4:
   · SOLO lista blanca: /, páginas de la tienda, /css /js /assets /admin, /uploads (DATA_DIR), /version.txt.
   · Sin path traversal: se rechazan "..", ".", segmentos ocultos, barras invertidas, bytes nulos y
     codificaciones inválidas; además se verifica (realpath) que el archivo quede dentro de su raíz.
   · ETag + 304, Last-Modified, gzip para texto (caché en memoria), Range 206/416 (video en Safari/iOS).
   · Cache-Control: no-cache (sitio) · fuentes 7 días · /uploads 1 año immutable.
   · /admin/**: X-Frame-Options DENY + CSP del contrato. Tienda (todo lo demás): X-Frame-Options SAMEORIGIN + CSP
     propia (defensa en profundidad: solo scripts del sitio, sin <iframe> de terceros encima de la tienda).
   · `transforms`: archivos que se sirven TRANSFORMADOS (p. ej. js/defaults.js sin cupones). Se reconocen
     por identidad del archivo (dispositivo + inodo), así que ni otra capitalización (/js/DEFAULTS.JS en
     discos sin distinción de mayúsculas) ni un enlace llegan al original. Resultado en caché por mtime/tamaño,
     ETag por contenido, gzip y Range igual que el resto.
   ========================================================================== */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { pipeline } from "node:stream";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};
/* En /uploads solo se sirven imágenes y videos (nunca svg/html aunque alguien los copie a mano). */
const UPLOAD_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".mp4", ".m4v", ".webm", ".mov"]);
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".mjs", ".json", ".map", ".webmanifest", ".txt", ".svg"]);
const FONT_EXT = new Set([".woff2", ".woff", ".ttf", ".otf"]);
const PAGES = new Set(["index.html", "catalogo.html", "producto.html", "checkout.html"]);
const ROOT_DIRS = new Set(["css", "js", "assets", "admin"]);

export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/* Tienda: scripts SOLO del sitio (todos son archivos: no hay <script> en línea ni onclick); estilos en línea
   permitidos (degradados de las tarjetas, posiciones de foto); fotos y videos de cualquier https/http (Pexels,
   URLs pegadas en el panel) o del sitio; las peticiones solo al propio servidor (api/public/*). Solo se puede
   enmarcar desde el propio sitio. */
export const STORE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const NOT_FOUND_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página no encontrada · Mercy Studio</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff5e4;color:#3b2d23;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
a{color:#bb3f17;font-weight:600}</style></head>
<body><main><h1 style="font-weight:600;letter-spacing:.02em">Página no encontrada</h1>
<p>La dirección que buscas no existe o fue movida.</p><p><a href="/">Volver al inicio</a></p></main></body></html>
`;

/** Decodifica y valida segmentos; null = ruta no permitida. */
function safeSegments(raw) {
  if (raw.includes("\\") || raw.includes("\0")) return null;
  const parts = raw.split("/").slice(1); // la ruta empieza por "/"
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    let s;
    try { s = decodeURIComponent(p); } catch { return null; }
    if (s === "" && i === parts.length - 1 && i > 0) { out.push(""); continue; } // barra final
    if (!s || s === "." || s === ".." || s.startsWith(".")) return null;
    if (/[\\/\0:]/.test(s) || /[\u0000-\u001f]/.test(s)) return null;
    out.push(s);
  }
  return out;
}

/**
 * Traduce la ruta pedida a { base, rel[] } dentro de la lista blanca.
 * → { redirect } | { version: true } | { base, rel, scope } | null
 */
function resolveWhitelist(pathname, rootDir, uploadsDir) {
  if (pathname === "/") return { base: rootDir, rel: ["index.html"], scope: "site" };
  if (pathname === "/admin") return { redirect: "/admin/" };
  if (pathname === "/admin/") return { base: rootDir, rel: ["admin", "index.html"], scope: "admin" };
  if (pathname === "/version.txt") return { version: true };
  const segs = safeSegments(pathname);
  if (!segs || !segs.length) return null;
  if (segs[segs.length - 1] === "") return null; // directorios: no hay listado
  const top = segs[0];
  if (segs.length === 1 && PAGES.has(top)) return { base: rootDir, rel: segs, scope: "site" };
  if (ROOT_DIRS.has(top) && segs.length >= 2) return { base: rootDir, rel: segs, scope: top === "admin" ? "admin" : "site" };
  if (top === "uploads" && segs.length >= 2) return { base: uploadsDir, rel: segs.slice(1), scope: "uploads" };
  return null;
}

function etagFor(st) {
  return `${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}`;
}

/** ¿If-None-Match coincide con la ETag base (con o sin sufijo -gz, comparación débil)? */
function etagMatches(header, base) {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header.split(",").some((t) => {
    const v = t.trim().replace(/^W\//, "").replace(/^"|"$/g, "").replace(/-gz$/, "");
    return v === base;
  });
}

/** Range "bytes=a-b" → { start, end } | "unsatisfiable" | null (ignorar). Solo un rango. */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null; // varios rangos o formato desconocido → se envía el archivo completo (válido según RFC 9110)
  let start;
  let end;
  if (m[1] === "" && m[2] === "") return null;
  if (m[1] === "") {
    const suffix = parseInt(m[2], 10);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === "" ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export function createStatic({ rootDir, uploadsDir, gitSha = "dev", log = () => {}, transforms = {} }) {
  const gzCache = new Map(); // ruta|mtime|tamaño → Buffer
  const GZ_MAX_ENTRIES = 300;
  const realRoots = new Map();
  // "js/defaults.js" → (texto) => texto
  const transformList = Object.entries(transforms).map(([rel, fn]) => ({ full: join(rootDir, ...rel.split("/")), fn }));
  const memCache = new Map(); // ruta real → { key, promise: { body, tag, gz } }

  /** ¿El archivo pedido (ya resuelto) es uno de los transformados? Compara dispositivo + inodo. */
  async function transformFor(st) {
    for (const t of transformList) {
      const ts = await stat(t.full).catch(() => null);
      if (ts && ts.isFile() && ts.dev === st.dev && ts.ino === st.ino) return t.fn;
    }
    return null;
  }

  function transformed(real, st, fn) {
    const key = `${st.mtimeMs}|${st.size}|${st.ino}`;
    const hit = memCache.get(real);
    if (hit && hit.key === key) return hit.promise;
    const promise = (async () => {
      const out = await fn(await readFile(real, "utf8"));
      const body = Buffer.isBuffer(out) ? out : Buffer.from(String(out));
      const tag = `${body.length.toString(16)}-${createHash("sha1").update(body).digest("hex").slice(0, 20)}`;
      return { body, tag, gz: body.length > 1024 ? await gzipAsync(body, { level: 6 }) : null };
    })();
    memCache.set(real, { key, promise });
    promise.catch(() => { if (memCache.get(real)?.promise === promise) memCache.delete(real); });
    return promise;
  }

  async function realBase(base) {
    if (!realRoots.has(base)) realRoots.set(base, await realpath(base).catch(() => base));
    return realRoots.get(base);
  }

  async function gzipped(full, st) {
    const key = `${full}|${st.mtimeMs}|${st.size}`;
    let buf = gzCache.get(key);
    if (buf) { gzCache.delete(key); gzCache.set(key, buf); return buf; }
    buf = await gzipAsync(await readFile(full), { level: 6 });
    gzCache.set(key, buf);
    if (gzCache.size > GZ_MAX_ENTRIES) gzCache.delete(gzCache.keys().next().value);
    return buf;
  }

  function notFound(ctx, headers) {
    const { req, res } = ctx;
    const body = Buffer.from(NOT_FOUND_HTML);
    res.writeHead(404, { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  return async function serveStatic(ctx) {
    const { req, res, pathname, search } = ctx;
    const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
    const base = isAdmin
      ? { "X-Frame-Options": "DENY", "Content-Security-Policy": ADMIN_CSP }
      : { "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": STORE_CSP };

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...base, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      res.end("Método no permitido");
      return;
    }

    const target = resolveWhitelist(pathname, rootDir, uploadsDir);
    if (!target) return notFound(ctx, base);

    if (target.redirect) {
      res.writeHead(301, { ...base, Location: target.redirect + (search ? "?" + search : ""), "Cache-Control": "no-cache" });
      res.end();
      return;
    }
    if (target.version) {
      const body = Buffer.from(String(gitSha) + "\n");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    const ext = extname(target.rel[target.rel.length - 1]).toLowerCase();
    const type = MIME[ext];
    if (!type || (target.scope === "uploads" && !UPLOAD_EXT.has(ext))) return notFound(ctx, base);

    // Ruta física y verificación de que queda dentro de la raíz (también tras resolver enlaces simbólicos)
    const full = join(target.base, ...target.rel);
    if (!full.startsWith(target.base + sep)) return notFound(ctx, base);
    let st;
    let real;
    try {
      real = await realpath(full);
      // El archivo real (tras enlaces simbólicos) debe seguir dentro de la MISMA zona permitida:
      // /uploads → DATA_DIR/uploads/ · /css/... → <raíz>/css/ · /index.html → exactamente <raíz>/index.html
      const rb = await realBase(target.base);
      const inside = target.scope === "uploads"
        ? real.startsWith(rb + sep)
        : target.rel.length === 1 ? real === join(rb, target.rel[0]) : real.startsWith(join(rb, target.rel[0]) + sep);
      if (!inside) return notFound(ctx, base);
      st = await stat(real);
    } catch {
      return notFound(ctx, base);
    }
    if (!st.isFile()) return notFound(ctx, base);

    // Archivo transformado (en memoria): nunca se envía el original
    let mem = null;
    if (transformList.length) {
      const fn = await transformFor(st);
      if (fn) {
        try { mem = await transformed(real, st, fn); } catch (e) {
          log(`[estático] no se pudo preparar ${pathname}: ${e.message}`);
          return notFound(ctx, base);
        }
      }
    }
    const size = mem ? mem.body.length : st.size;

    let cache = "no-cache";
    if (target.scope === "uploads") cache = "public, max-age=31536000, immutable";
    else if (FONT_EXT.has(ext)) cache = "public, max-age=604800";

    const tag = mem ? mem.tag : etagFor(st);
    const headers = {
      ...base,
      "Content-Type": type,
      "Cache-Control": cache,
      "Accept-Ranges": "bytes",
    };
    // Un transformado depende también del código del servidor: solo ETag (por contenido), sin Last-Modified
    if (!mem) headers["Last-Modified"] = st.mtime.toUTCString();
    const compressible = COMPRESSIBLE.has(ext);
    if (compressible) headers.Vary = "Accept-Encoding";

    // 304: If-None-Match manda; si no viene, If-Modified-Since
    const inm = req.headers["if-none-match"];
    const ims = mem ? undefined : req.headers["if-modified-since"];
    const notModified = inm ? etagMatches(inm, tag)
      : ims ? Math.floor(st.mtimeMs / 1000) <= Math.floor(Date.parse(ims) / 1000) : false;
    const wantsGzip = compressible && size > 1024 && /\bgzip\b/i.test(String(req.headers["accept-encoding"] || "")) && !req.headers.range;
    if (notModified) {
      res.writeHead(304, { ...headers, ETag: `W/"${tag}${wantsGzip ? "-gz" : ""}"` });
      res.end();
      return;
    }

    // Texto comprimido (sin Range)
    if (wantsGzip && size < 8 * 1024 * 1024) {
      let buf = mem?.gz;
      if (!buf) try { buf = await gzipped(real, st); } catch { return notFound(ctx, base); }
      res.writeHead(200, { ...headers, ETag: `W/"${tag}-gz"`, "Content-Encoding": "gzip", "Content-Length": buf.length });
      res.end(req.method === "HEAD" ? undefined : buf);
      return;
    }

    headers.ETag = `W/"${tag}"`;
    // Range (si If-Range no coincide se envía completo)
    let range = parseRange(req.headers.range, size);
    const ifRange = req.headers["if-range"];
    if (range && ifRange && !etagMatches(ifRange, tag) && ifRange !== headers["Last-Modified"]) range = null;
    if (range === "unsatisfiable") {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}`, "Content-Length": 0 });
      res.end();
      return;
    }
    let status = 200;
    let opts;
    if (range) {
      status = 206;
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
      headers["Content-Length"] = range.end - range.start + 1;
      opts = { start: range.start, end: range.end };
    } else {
      headers["Content-Length"] = size;
    }
    res.writeHead(status, headers);
    if (req.method === "HEAD" || headers["Content-Length"] === 0) { res.end(); return; }
    if (mem) { res.end(opts ? mem.body.subarray(opts.start, opts.end + 1) : mem.body); return; }
    pipeline(createReadStream(real, opts), res, (e) => {
      if (e && e.code !== "ERR_STREAM_PREMATURE_CLOSE") log(`[estático] error enviando ${pathname}: ${e.message}`);
    });
  };
}
