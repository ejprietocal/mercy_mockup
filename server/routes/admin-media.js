/* ==========================================================================
   Mercy Studio — server/routes/admin-media.js
   Biblioteca de medios (§4.3, editor y admin).
   ========================================================================== */
import { err, readJson } from "../lib/http.js";

export function registerAdminMedia(router, app) {
  const auth = app.auth.requireAuth;

  router.get("/api/admin/media", auth, (ctx) => ({
    items: app.media.list({ kind: ctx.query.get("kind"), q: ctx.query.get("q") }),
  }));

  router.get("/api/admin/media/:id", auth, (ctx) => {
    const item = app.media.get(ctx.params.id);
    if (!item) throw err.notFound("El archivo no existe.");
    return { item, usages: app.media.usages(item) };
  });

  router.post("/api/admin/media", auth, async (ctx) => {
    const item = await app.media.upload(ctx, ctx.user);
    ctx.status = 201;
    return { item };
  });

  router.put("/api/admin/media/:id/thumb", auth, async (ctx) => ({ item: await app.media.setThumb(ctx, ctx.params.id) }));

  router.put("/api/admin/media/:id", auth, async (ctx) => ({ item: await app.media.update(ctx.params.id, await readJson(ctx), ctx.user) }));

  router.delete("/api/admin/media/:id", auth, (ctx) => {
    const force = ["1", "true"].includes(String(ctx.query.get("force") || ""));
    return app.media.remove(ctx.params.id, { force }, ctx.user);
  });
}
