/* ==========================================================================
   Mercy Studio — server/routes/auth.js
   Sesión (§4.2): login, logout, me, perfil y cambio de contraseña.
   (El chequeo CSRF de no-GET lo aplica app.js a todo /api/auth/* y /api/admin/*.)
   ========================================================================== */
import { readJson } from "../lib/http.js";
import { publicUser } from "../lib/auth.js";

export function registerAuth(router, app) {
  const auth = app.auth.requireAuth;

  router.post("/api/auth/login", async (ctx) => ({ user: await app.auth.login(await readJson(ctx), ctx) }));

  router.post("/api/auth/logout", (ctx) => app.auth.logout(ctx));

  router.get("/api/auth/me", auth, (ctx) => ({ user: publicUser(ctx.user) }));

  router.put("/api/auth/me", auth, async (ctx) => ({ user: await app.auth.updateMe(ctx, await readJson(ctx)) }));

  router.post("/api/auth/password", auth, async (ctx) => app.auth.changePassword(ctx, await readJson(ctx)));
}
