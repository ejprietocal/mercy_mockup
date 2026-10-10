#!/usr/bin/env node
/* ==========================================================================
   Mercy Studio — server/index.js
   Arranque: node server/index.js   (Node ≥ 22, sin dependencias)
   Variables: PORT, HOST, DATA_DIR, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_RESET,
              TRUST_PROXY, NODE_ENV, GIT_SHA. Ver docs/SERVIDOR.md.
   ========================================================================== */
import { join } from "node:path";
import { createServer, REPO_ROOT } from "./app.js";

const env = process.env;
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`Mercy Studio necesita Node 22 o superior (tienes ${process.versions.node}).`);
  process.exit(1);
}

let srv;
try {
  srv = await createServer({
    port: Number(env.PORT || 4000),
    host: env.HOST || "0.0.0.0",
    dataDir: env.DATA_DIR || join(REPO_ROOT, "data"),
    trustProxy: env.TRUST_PROXY,
    gitSha: env.GIT_SHA || "dev",
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
    adminName: env.ADMIN_NAME,
    adminReset: ["1", "true", "yes"].includes(String(env.ADMIN_RESET || "").toLowerCase()),
  });
} catch (e) {
  console.error("\n[mercy] No se pudo arrancar el servidor:\n  " + (e?.message || e) + "\n");
  if (e?.code === "EADDRINUSE") console.error(`  El puerto ${env.PORT || 4000} ya está en uso. Usa PORT=otro_puerto.\n`);
  process.exit(1);
}

const cfg = srv.app.config;
console.log(`[mercy] Mercy Studio ${cfg.gitSha} escuchando en ${srv.url} (${env.NODE_ENV || "development"})`);
console.log(`[mercy] Datos en ${cfg.dataDir} · Panel: ${srv.url}/admin/`);

/* ---------- Errores no controlados: se registran; los de sockets no tumban el proceso ---------- */
process.on("unhandledRejection", (e) => console.error("[mercy] Promesa rechazada sin manejar:", e));
process.on("uncaughtException", (e) => {
  console.error("[mercy] Excepción no controlada:", e);
  if (["ECONNRESET", "EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(e?.code)) return;
  shutdown("uncaughtException", 1);
});

/* ---------- Apagado limpio (Docker envía SIGTERM) ---------- */
let stopping = false;
async function shutdown(signal, code = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`[mercy] ${signal}: cerrando (esperando escrituras pendientes)…`);
  const force = setTimeout(() => { console.error("[mercy] Cierre forzado tras 10 s."); process.exit(code || 1); }, 10_000);
  force.unref();
  try {
    await srv.close();
  } catch (e) {
    console.error("[mercy] Error al cerrar:", e);
  }
  process.exit(code);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
