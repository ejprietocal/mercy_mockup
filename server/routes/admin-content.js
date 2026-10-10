/* ==========================================================================
   Mercy Studio — server/routes/admin-content.js
   Panel (§4.3): contenido por secciones, productos y escritorio (stats).
   ========================================================================== */
import { baseUpdatedAt as baseOf, err, readJson, sendBody } from "../lib/http.js";

const EDITOR_HIDDEN = new Set(["coupon", "user", "subscriber", "session"]);

export function registerAdminContent(router, app) {
  const auth = app.auth.requireAuth;

  // JSON (y gzip) en caché por versión del contenido: con muchos productos son ~1 MB por petición
  router.get("/api/admin/content", auth, (ctx) => {
    const p = app.content.adminPayload();
    sendBody(ctx, 200, p.json, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, { gzip: p.gz });
  });

  /* Usos que el editor no puede ver por sí mismo (no tiene acceso a Cupones): cuántos cupones usan cada
     categoría / producto, para bloquear su id en el panel. Sin códigos. */
  router.get("/api/admin/usages", auth, () => ({ coupons: app.coupons.usage() }));

  router.put("/api/admin/content/:section", auth, async (ctx) => {
    const body = await readJson(ctx);
    const r = await app.content.updateSection(ctx.params.section, body, ctx.user, { baseUpdatedAt: baseOf(ctx) });
    return { section: r.section, value: r.value, meta: r.meta };
  });

  /* ---------- Productos ---------- */
  router.get("/api/admin/products", auth, () => ({ items: app.content.data.products }));

  router.get("/api/admin/products/:id", auth, (ctx) => {
    const item = app.content.getProduct(ctx.params.id);
    if (!item) throw err.notFound("El producto no existe.");
    return { item };
  });

  router.post("/api/admin/products", auth, async (ctx) => {
    const item = await app.content.createProduct(await readJson(ctx), ctx.user);
    ctx.status = 201;
    return { item };
  });

  router.put("/api/admin/products/:id", auth, async (ctx) => {
    const item = await app.content.updateProduct(ctx.params.id, await readJson(ctx), ctx.user, { baseUpdatedAt: baseOf(ctx) });
    return { item };
  });

  router.delete("/api/admin/products/:id", auth, (ctx) => app.content.deleteProduct(ctx.params.id, ctx.user));

  router.post("/api/admin/products/:id/duplicate", auth, async (ctx) => {
    const item = await app.content.duplicateProduct(ctx.params.id, ctx.user);
    ctx.status = 201;
    return { item };
  });

  /* ---------- Escritorio ---------- */
  router.get("/api/admin/stats", auth, (ctx) => {
    const isAdmin = ctx.user.role === "admin";
    const recent = isAdmin
      ? app.activity.query({ limit: 10 }).items
      : app.activity.items.filter((e) => !EDITOR_HIDDEN.has(e.entity)).slice(0, 10);
    return {
      products: app.content.productStats(),
      coupons: isAdmin ? app.coupons.stats() : null,
      subscribers: isAdmin ? app.subscribers.stats() : null,
      media: app.media.stats(),
      recentActivity: recent,
    };
  });
}
