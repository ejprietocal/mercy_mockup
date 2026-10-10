/* ==========================================================================
   Mercy Studio — server/routes/admin-manage.js
   Solo administrador (§4.3 y §5): cupones, suscriptores, usuarios, actividad y revisiones.
   ========================================================================== */
import { baseUpdatedAt, err, readJson, sendBody } from "../lib/http.js";
import { diffContent } from "../lib/diff.js";
import { colombiaToday } from "../lib/util.js";

export function registerAdminManage(router, app) {
  const auth = app.auth.requireAuth;
  const admin = app.auth.requireRole("admin");

  /* ---------- Cupones ---------- */
  router.get("/api/admin/coupons", auth, admin, () => ({ items: app.coupons.list }));

  router.post("/api/admin/coupons", auth, admin, async (ctx) => {
    const item = await app.coupons.create(await readJson(ctx), ctx.user);
    ctx.status = 201;
    return { item };
  });

  router.get("/api/admin/coupons/:id", auth, admin, (ctx) => {
    const item = app.coupons.byId(ctx.params.id);
    if (!item) throw err.notFound("El cupón no existe.");
    return { item };
  });

  // X-Base-Updated-At opcional (item.updatedAt leído) → 409 conflict si otra persona lo cambió
  router.put("/api/admin/coupons/:id", auth, admin, async (ctx) => ({
    item: await app.coupons.update(ctx.params.id, await readJson(ctx), ctx.user, { baseUpdatedAt: baseUpdatedAt(ctx) }),
  }));

  router.delete("/api/admin/coupons/:id", auth, admin, (ctx) => app.coupons.remove(ctx.params.id, ctx.user));

  /* ---------- Suscriptores ---------- */
  router.get("/api/admin/subscribers", auth, admin, (ctx) => ({
    items: app.subscribers.list(ctx.query.get("q")),
    total: app.subscribers.items.length,
  }));

  router.get("/api/admin/subscribers.csv", auth, admin, (ctx) => {
    sendBody(ctx, 200, app.subscribers.csv(ctx.query.get("q")), {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptores-mercy-${colombiaToday()}.csv"`,
      "Cache-Control": "no-store",
    });
  });

  router.delete("/api/admin/subscribers/:id", auth, admin, (ctx) => app.subscribers.remove(ctx.params.id, ctx.user));

  /* ---------- Usuarios ---------- */
  router.get("/api/admin/users", auth, admin, () => ({ items: app.auth.listUsers() }));

  router.get("/api/admin/users/:id", auth, admin, (ctx) => {
    const item = app.auth.listUsers().find((u) => u.id === ctx.params.id);
    if (!item) throw err.notFound("El usuario no existe.");
    return { item };
  });

  router.post("/api/admin/users", auth, admin, async (ctx) => {
    const item = await app.auth.createUser(ctx, await readJson(ctx));
    ctx.status = 201;
    return { item };
  });

  router.put("/api/admin/users/:id", auth, admin, async (ctx) => ({
    item: await app.auth.updateUser(ctx, ctx.params.id, await readJson(ctx), { baseUpdatedAt: baseUpdatedAt(ctx) }),
  }));

  router.delete("/api/admin/users/:id", auth, admin, (ctx) => app.auth.deleteUser(ctx, ctx.params.id));

  /* ---------- Actividad ---------- */
  router.get("/api/admin/activity", auth, admin, (ctx) => app.activity.query({
    limit: ctx.query.get("limit") || 100,
    before: ctx.query.get("before") || null,
    entity: ctx.query.get("entity") || null,
    userId: ctx.query.get("userId") || null,
  }));

  /* ---------- Revisiones ---------- */
  router.get("/api/admin/revisions", auth, admin, () => ({ items: app.revisions.list() }));

  router.get("/api/admin/revisions/:id", auth, admin, async (ctx) => {
    const rev = await app.revisions.get(ctx.params.id);
    if (!rev) throw err.notFound("La revisión no existe.");
    const prevMeta = app.revisions.previousOf(rev.id);
    const prev = prevMeta ? await app.revisions.get(prevMeta.id) : null;
    const { changes, truncated } = prev ? diffContent(prev.content, rev.content, 150) : { changes: [], truncated: false };
    return {
      revision: { id: rev.id, at: rev.at, user: rev.user, summary: rev.summary },
      previous: prevMeta ? { id: prevMeta.id, at: prevMeta.at, summary: prevMeta.summary } : null,
      changes,
      truncated,
    };
  });

  // → { ok, content, coupons: [{ id, code, deactivated }] (cupones que cambiaron), missingMedia: ["/uploads/…"] (ya no existen) }
  router.post("/api/admin/revisions/:id/restore", auth, admin, async (ctx) => {
    const r = await app.content.restore(ctx.params.id, ctx.user);
    return { ok: true, content: r.content, coupons: r.coupons, missingMedia: r.missingMedia };
  });
}
