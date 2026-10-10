/* ==========================================================================
   Mercy Studio — server/routes/public.js
   Rutas públicas (§4.1): contenido de la tienda, suscripción, cupones y salud.
   ========================================================================== */
import { err, readJson, sendBody } from "../lib/http.js";
import { publicCoupon } from "../lib/coupons.js";

const HOUR = 60 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

/**
 * Límites públicos por IP (contrato §4). Holgados porque muchos clientes pueden salir por la misma IP
 * (operadores móviles con CGNAT, redes de oficina o universidad).
 * `redeemCode` = canjes del MISMO código desde la misma IP: redeem es anónimo (no hay pedidos en el servidor) y
 * sin este cupo cualquiera agotaría en minutos un cupón con límite de usos. Un 429 en redeem no frena a la clienta
 * (la tienda sigue a WhatsApp igual); solo deja de contar ese uso.
 */
export const LIMITS = {
  subscribe: { max: 20, windowMs: HOUR },
  validate: { max: 60, windowMs: TEN_MIN },
  redeem: { max: 20, windowMs: TEN_MIN },
  redeemCode: { max: 5, windowMs: HOUR },
};

export function registerPublic(router, app) {
  const limit = (ctx, name, max, windowMs) => {
    const r = app.limiter.hit(`${name}:${ctx.ip}`, max, windowMs);
    if (!r.ok) throw err.rateLimited(r.retryAfter);
  };

  /** Lee JSON exigiendo application/json (evita envíos de formularios desde otros sitios). */
  const jsonBody = async (ctx) => {
    const ct = String(ctx.req.headers["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json")) throw err.unsupported("Envía los datos en formato JSON (Content-Type: application/json).");
    return readJson(ctx);
  };

  const sendPublic = (ctx, body, tag, type, gz) => {
    const headers = { "Content-Type": type, "Cache-Control": "no-cache", ETag: tag };
    const inm = ctx.req.headers["if-none-match"];
    if (inm && inm.split(",").map((s) => s.trim().replace(/^W\//, "")).includes(tag)) return sendBody(ctx, 304, "", headers);
    sendBody(ctx, 200, body, headers, { gzip: gz });
  };

  router.get("/api/health", () => ({ ok: true, version: app.config.gitSha }));

  router.get("/api/public/content.js", (ctx) => {
    const p = app.content.publicPayload();
    sendPublic(ctx, p.js, p.etagJs, "text/javascript; charset=utf-8", p.gzJs);
  });

  router.get("/api/public/content", (ctx) => {
    const p = app.content.publicPayload();
    sendPublic(ctx, p.json, p.etagJson, "application/json; charset=utf-8", p.gzJson);
  });

  // Con el modal apagado (discountModal.enabled: false) o sin cupón de bienvenida vigente → coupon: null y couponCode "".
  router.post("/api/public/subscribe", async (ctx) => {
    limit(ctx, "subscribe", LIMITS.subscribe.max, LIMITS.subscribe.windowMs);
    const body = await jsonBody(ctx);
    const welcome = app.coupons.welcome();
    await app.subscribers.subscribe(body, welcome ? welcome.code : "");
    return { ok: true, coupon: welcome ? publicCoupon(welcome) : null };
  });

  router.post("/api/public/coupons/validate", async (ctx) => {
    limit(ctx, "coupon-validate", LIMITS.validate.max, LIMITS.validate.windowMs);
    const body = await jsonBody(ctx);
    return app.coupons.check(body?.code);
  });

  /* Suma un uso. La tienda lo llama al ENVIAR el pedido (al abrir WhatsApp), no al confirmar ni al ver la vista previa.
     Es anónimo: usesCount es orientativo (ver contrato §3) y el cupo por IP+código frena el abuso. */
  router.post("/api/public/coupons/redeem", async (ctx) => {
    limit(ctx, "coupon-redeem", LIMITS.redeem.max, LIMITS.redeem.windowMs);
    const body = await jsonBody(ctx);
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().slice(0, 40) : "";
    if (code && app.coupons.byCode(code)) limit(ctx, `coupon-redeem-code:${code}`, LIMITS.redeemCode.max, LIMITS.redeemCode.windowMs);
    return app.coupons.redeem(body?.code);
  });
}
