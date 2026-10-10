/* ==========================================================================
   Mercy Studio — server/app.js
   Arma la aplicación (datos, servicios, rutas, estáticos) y el servidor HTTP.
   · createApp(opts)    → app (sin escuchar en ningún puerto; útil para pruebas)
   · createServer(opts) → { app, server, port, url, close() } ya escuchando
   Opciones: dataDir, rootDir, defaultsPath, port, host, trustProxy, gitSha, adminEmail,
             adminPassword, adminName, adminReset, publicUrl, log (fn | false), announce (fn).
   ========================================================================== */
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Db } from "./lib/db.js";
import { Activity } from "./lib/activity.js";
import { Revisions } from "./lib/revisions.js";
import { CouponService } from "./lib/coupons.js";
import { ContentService } from "./lib/content.js";
import { AuthService } from "./lib/auth.js";
import { MediaService } from "./lib/media.js";
import { Subscribers } from "./lib/subscribers.js";
import { RateLimiter } from "./lib/ratelimit.js";
import { createStatic } from "./lib/static.js";
import { publicDefaultsJs } from "./lib/public-defaults.js";
import { createPages, isStorePage } from "./lib/social.js";
import {
  HttpError, Router, SECURITY_HEADERS, apiSegments, clientIp, err, isSecure, parseCookies, parseTrustProxy,
  sendError, sendJson, splitUrl,
} from "./lib/http.js";
import { registerPublic } from "./routes/public.js";
import { registerAuth } from "./routes/auth.js";
import { registerAdminContent } from "./routes/admin-content.js";
import { registerAdminMedia } from "./routes/admin-media.js";
import { registerAdminManage } from "./routes/admin-manage.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveConfig(o = {}) {
  const rootDir = resolve(o.rootDir || REPO_ROOT);
  const log = o.log === false ? () => {} : typeof o.log === "function" ? o.log : (m) => console.log(m);
  return {
    rootDir,
    dataDir: resolve(o.dataDir || join(REPO_ROOT, "data")),
    defaultsPath: resolve(o.defaultsPath || join(rootDir, "js", "defaults.js")),
    port: o.port ?? 4000,
    host: o.host || "0.0.0.0",
    trustProxy: parseTrustProxy(o.trustProxy),
    gitSha: o.gitSha || "dev",
    // Origen público del sitio (https://tienda.co) para enlaces absolutos (etiquetas sociales, feed). Vacío = el de la petición.
    publicUrl: String(o.publicUrl || "").trim().replace(/\/+$/, ""),
    adminEmail: o.adminEmail || "admin@mercystudio.co",
    adminPassword: o.adminPassword || "",
    adminName: o.adminName || "Administrador",
    adminReset: !!o.adminReset,
    log,
    logRequests: o.logRequests ?? o.log !== false,
    announce: o.announce || ((m) => console.log(m)),
  };
}

export async function createApp(options = {}) {
  const config = resolveConfig(options);
  const db = new Db(config.dataDir);
  await db.init();
  await db.load("activity", [], { pretty: false });

  const app = { config, db, limiter: new RateLimiter() };
  app.activity = new Activity(db);
  app.revisions = new Revisions(db.revisionsDir);
  await app.revisions.init();
  app.coupons = new CouponService(app);
  app.content = new ContentService(app);
  app.auth = new AuthService(app);
  app.media = new MediaService(app);
  app.subscribers = new Subscribers(app);
  await app.auth.init();       // usuarios primero (para atribuir la siembra)
  await app.content.init();    // contenido + cupones (+ revisión inicial)
  await app.media.init();
  await app.subscribers.init();

  const router = new Router();
  registerPublic(router, app);
  registerAuth(router, app);
  registerAdminContent(router, app);
  registerAdminMedia(router, app);
  registerAdminManage(router, app);
  const serveStatic = createStatic({
    rootDir: config.rootDir,
    uploadsDir: db.uploadsDir,
    gitSha: config.gitSha,
    log: config.log,
    // /js/defaults.js sale sin Mercy.DEFAULT_COUPONS ni couponCode (los códigos de cupón nunca son públicos)
    transforms: {
      "js/defaults.js": (code) => {
        const r = publicDefaultsJs(code);
        if (r.mode !== "cut") config.log(`[estático] Aviso: js/defaults.js no se pudo recortar de forma comprobada (modo «${r.mode}»); se sirve una versión segura sin cupones.`);
        return r.code;
      },
    },
  });

  // Páginas de la tienda con el <head> completado para redes (Open Graph); si el archivo no existe, sigue el estático
  app.servePage = createPages({ rootDir: config.rootDir });

  app.handle = (req, res) => handle(app, router, serveStatic, req, res);
  app.close = async () => {
    await db.flush();
    app.limiter.stop();
    app.auth.stop();
  };
  return app;
}

async function handle(app, router, serveStatic, req, res) {
  const t0 = performance.now();
  const { pathname, search } = splitUrl(req.url);
  if (app.config.logRequests && pathname !== "/api/health") {
    res.on("finish", () => {
      app.config.log(`${new Date().toISOString()} ${req.method} ${pathname} ${res.statusCode} ${Math.round(performance.now() - t0)}ms`);
    });
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  // El panel y la API nunca deben aparecer en buscadores
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/")) res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const trust = app.config.trustProxy;
  const ctx = {
    app, req, res, pathname, search,
    method: req.method,
    query: new URLSearchParams(search),
    params: {},
    ip: clientIp(req, trust),
    secure: isSecure(req, trust),
    cookies: parseCookies(req.headers.cookie),
    user: null,
    session: null,
    status: 200,
    setCookies: [],
    closeAfter: false,
  };

  try {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await handleApi(app, router, ctx);
    } else if ((req.method === "GET" || req.method === "HEAD") && isStorePage(pathname) && await app.servePage(ctx)) {
      // servida con etiquetas sociales
    } else {
      await serveStatic(ctx);
    }
  } catch (e) {
    if (!(e instanceof HttpError)) {
      app.config.log(`[error] ${req.method} ${pathname}: ${e?.stack || e}`);
      e = err.server();
    }
    if (!res.headersSent) sendError(ctx, e);
    else res.destroy();
  }
}

async function handleApi(app, router, ctx) {
  const segs = apiSegments(ctx.pathname);
  if (!segs) throw err.badRequest("La dirección no es válida.");
  const m = router.match(ctx.method, segs);
  if (!m) throw err.notFound("Ruta no encontrada.");
  if (m.allowed) {
    ctx.res.setHeader("Allow", m.allowed.join(", "));
    throw new HttpError(405, "bad_request", "Método no permitido.");
  }
  ctx.params = m.params;
  const isPanel = segs[1] === "auth" || segs[1] === "admin";
  if (isPanel && !["GET", "HEAD", "OPTIONS"].includes(ctx.method)) app.auth.checkCsrf(ctx);
  let result;
  for (const h of m.handlers) {
    result = await h(ctx);
    if (ctx.res.headersSent) return;
  }
  if (result !== undefined && !ctx.res.headersSent) sendJson(ctx, ctx.status || 200, result);
}

/** Crea la app y escucha. port 0 = puerto libre. */
export async function createServer(options = {}) {
  const app = await createApp(options);
  const server = http.createServer({ requestTimeout: 30 * 60 * 1000, headersTimeout: 60 * 1000 }, app.handle);
  server.keepAliveTimeout = 65 * 1000;
  server.on("clientError", (e, socket) => {
    if (socket.writable && !socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });
  await new Promise((res, rej) => {
    const onErr = (e) => { server.off("listening", onOk); rej(e); };
    const onOk = () => { server.off("error", onErr); res(); };
    server.once("error", onErr);
    server.once("listening", onOk);
    server.listen(app.config.port, app.config.host);
  });
  const port = server.address().port;
  const shownHost = app.config.host === "0.0.0.0" || app.config.host === "::" ? "localhost" : app.config.host;
  let closing = null;
  return {
    app,
    server,
    port,
    url: `http://${shownHost}:${port}`,
    close() {
      closing ??= (async () => {
        await new Promise((r) => {
          server.close(() => r());
          server.closeIdleConnections?.();
          setTimeout(() => { server.closeAllConnections?.(); }, 5000).unref();
        });
        await app.close();
      })();
      return closing;
    },
  };
}
