// Sesión, CSRF, roles y usuarios
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ADMIN, startServer, makeUser, freshIp } from "./helpers.js";

let srv;
let admin;
before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

test("login correcto: usuario sin hash, cookies HttpOnly/SameSite y me", async () => {
  const c = srv.client();
  const r = await c.post("/api/auth/login", { email: ADMIN.email.toUpperCase(), password: ADMIN.password });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.data.user).sort(), ["active", "createdAt", "email", "id", "lastLoginAt", "name", "role", "updatedAt"]);
  assert.equal(r.data.user.role, "admin");
  assert.equal(r.data.user.name, "Ana Admin");
  assert.doesNotMatch(r.text, /passwordHash|scrypt/);
  const cookies = [].concat(r.headers["set-cookie"]);
  const sid = cookies.find((x) => x.startsWith("mercy_sid="));
  const flag = cookies.find((x) => x.startsWith("mercy_admin="));
  assert.match(sid, /HttpOnly/);
  assert.match(sid, /SameSite=Strict/);
  assert.match(sid, /Path=\//);
  assert.match(sid, /Max-Age=43200/);
  assert.doesNotMatch(sid, /Secure/);
  assert.match(flag, /^mercy_admin=1;/);
  assert.doesNotMatch(flag, /HttpOnly/);
  const me = await c.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, ADMIN.email);
  assert.equal(me.headers["cache-control"], "no-store");
  // Detrás de proxy HTTPS (TRUST_PROXY) la cookie lleva Secure; "Recordarme" = 30 días
  const s = await srv.client().post("/api/auth/login", { ...ADMIN, remember: true }, { headers: { "x-forwarded-proto": "https" } });
  const sid2 = [].concat(s.headers["set-cookie"]).find((x) => x.startsWith("mercy_sid="));
  assert.match(sid2, /Secure/);
  assert.match(sid2, /Max-Age=2592000/);
  // En sessions.json solo el SHA-256 del token
  const token = sid.split(";")[0].split("=")[1];
  const raw = await readFile(join(srv.dataDir, "sessions.json"), "utf8");
  assert.ok(!raw.includes(token));
});

test("login fallido: mensaje genérico; sin sesión → 401", async () => {
  const c = srv.client();
  const r = await c.post("/api/auth/login", { email: ADMIN.email, password: "incorrecta123" });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, "unauthorized");
  assert.equal(r.data.error.message, "Correo o contraseña incorrectos.");
  const u = await c.post("/api/auth/login", { email: "nadie@prueba.co", password: "incorrecta123" });
  assert.equal(u.data.error.message, "Correo o contraseña incorrectos.");
  const v = await c.post("/api/auth/login", { email: "", password: "" });
  assert.equal(v.status, 422);
  assert.equal((await c.get("/api/auth/me")).status, 401);
  assert.equal((await c.get("/api/admin/content")).status, 401);
  // Cookie inventada → 401 y borra las cookies
  const fake = await c.get("/api/admin/content", { headers: { cookie: "mercy_sid=" + "a".repeat(43) + "; mercy_admin=1" } });
  assert.equal(fake.status, 401);
  assert.ok([].concat(fake.headers["set-cookie"]).some((x) => /^mercy_admin=;.*Max-Age=0/.test(x)));
});

test("límite de intentos: 5 fallos por IP+correo → 429 con Retry-After (y luego ni la clave correcta pasa)", async () => {
  const c = srv.client({ ip: freshIp() });
  for (let i = 0; i < 5; i++) {
    const r = await c.post("/api/auth/login", { email: ADMIN.email, password: "mala-clave-" + i });
    assert.equal(r.status, 401);
  }
  const r = await c.post("/api/auth/login", { email: ADMIN.email, password: ADMIN.password });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, "rate_limited");
  assert.ok(Number(r.headers["retry-after"]) > 0);
  assert.match(r.data.error.message, /Intenta de nuevo en \d+ minutos?/);
  // Otra IP sí puede entrar
  const ok = await srv.client({ ip: freshIp() }).post("/api/auth/login", ADMIN);
  assert.equal(ok.status, 200);
});

test("límite de 30 fallos por IP (distintos correos)", async () => {
  const c = srv.client({ ip: freshIp() });
  for (let i = 0; i < 30; i++) {
    const r = await c.post("/api/auth/login", { email: `x${i}@prueba.co`, password: "mala-clave-larga" });
    assert.equal(r.status, 401);
  }
  assert.equal((await c.post("/api/auth/login", { email: "otro@prueba.co", password: "mala-clave-larga" })).status, 429);
});

test("CSRF: sin X-Mercy-Admin → 403; Origin ajeno → 403; Origin propio → OK", async () => {
  const noHeader = await admin.request("PUT", "/api/admin/content/reviews", { json: [], headers: { "x-mercy-admin": null } });
  assert.equal(noHeader.status, 403);
  assert.equal(noHeader.data.error.code, "forbidden");
  const login = await srv.client({ admin: false }).post("/api/auth/login", ADMIN);
  assert.equal(login.status, 403, "también /api/auth/*");
  const evil = await admin.post("/api/admin/products/fe/duplicate", undefined, { headers: { origin: "https://malo.example" } });
  assert.equal(evil.status, 403);
  const nul = await admin.post("/api/admin/products/fe/duplicate", undefined, { headers: { origin: "null" } });
  assert.equal(nul.status, 403);
  const own = await admin.post("/api/admin/products/fe/duplicate", undefined, { headers: { origin: srv.base } });
  assert.equal(own.status, 201);
  await admin.del(`/api/admin/products/${own.data.item.id}`);
  // GET no exige la cabecera
  assert.equal((await admin.get("/api/admin/content", { headers: { "x-mercy-admin": null } })).status, 200);
});

test("roles: el editor recibe 403 en cupones, usuarios, ajustes, suscriptores, actividad y revisiones", async () => {
  const { client: ed } = await makeUser(srv, admin, { role: "editor" });
  for (const p of ["/api/admin/coupons", "/api/admin/users", "/api/admin/subscribers", "/api/admin/subscribers.csv", "/api/admin/activity", "/api/admin/revisions"]) {
    const r = await ed.get(p);
    assert.equal(r.status, 403, p);
    assert.equal(r.data.error.code, "forbidden");
  }
  assert.equal((await ed.post("/api/admin/coupons", { code: "EDITOR10", value: 10 })).status, 403);
  assert.equal((await ed.post("/api/admin/users", { name: "X", email: "x@y.co", password: "1234567890" })).status, 403);
  const settings = (await admin.get("/api/admin/content")).data.settings;
  const s = await ed.put("/api/admin/content/settings", { ...settings, brand: "Otra" });
  assert.equal(s.status, 403);
  // Pero sí puede contenido, productos y medios
  assert.equal((await ed.get("/api/admin/content")).status, 200);
  assert.equal((await ed.get("/api/admin/products")).status, 200);
  assert.equal((await ed.get("/api/admin/media")).status, 200);
  const stats = await ed.get("/api/admin/stats");
  assert.equal(stats.status, 200);
  assert.equal(stats.data.coupons, null);
  assert.equal(stats.data.subscribers, null);
  assert.ok(stats.data.recentActivity.every((e) => !["coupon", "user", "subscriber", "session"].includes(e.entity)));
  const as = (await admin.get("/api/admin/stats")).data;
  assert.equal(typeof as.coupons.total, "number");
  assert.equal(typeof as.subscribers.total, "number");
  assert.equal(as.products.total >= 14, true);
});

test("editor no puede cambiar discountModal.couponCode (se conserva); el admin sí", async () => {
  const { client: ed } = await makeUser(srv, admin, { role: "editor" });
  await admin.post("/api/admin/coupons", { code: "OTRO25", type: "percent", value: 25 });
  const dm = (await admin.get("/api/admin/content")).data.discountModal;
  const r = await ed.put("/api/admin/content/discountModal", { ...dm, couponCode: "OTRO25", title: "Nuevo *título*" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.value.couponCode, "MERCY15");
  assert.equal(r.data.value.title, "Nuevo *título*");
  const a = await admin.put("/api/admin/content/discountModal", { ...r.data.value, couponCode: "otro25" });
  assert.equal(a.data.value.couponCode, "OTRO25");
  const bad = await admin.put("/api/admin/content/discountModal", { ...r.data.value, couponCode: "NOEXISTE" });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.couponCode);
  await admin.put("/api/admin/content/discountModal", { ...dm });
});

test("logout borra la sesión y las cookies", async () => {
  const c = srv.client();
  await c.login();
  const r = await c.post("/api/auth/logout");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
  assert.ok([].concat(r.headers["set-cookie"]).some((x) => /^mercy_sid=;.*Max-Age=0/.test(x)));
  assert.equal(c.jar.size, 0);
  assert.equal((await c.get("/api/auth/me")).status, 401);
});

test("perfil: cambiar nombre/correo; correo repetido → 409", async () => {
  const { client: ed, email } = await makeUser(srv, admin, { role: "editor", name: "Pedro" });
  const r = await ed.put("/api/auth/me", { name: "Pedro Pérez", email: email.toUpperCase() });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.name, "Pedro Pérez");
  assert.equal(r.data.user.email, email);
  const dup = await ed.put("/api/auth/me", { name: "Pedro", email: ADMIN.email });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, "conflict");
  const inv = await ed.put("/api/auth/me", { name: "", email: "malo" });
  assert.equal(inv.status, 422);
  assert.ok(inv.data.error.fields.name && inv.data.error.fields.email);
});

test("cambio de contraseña: valida la actual, mínimo 10 y cierra las demás sesiones", async () => {
  const { client: a, email, password } = await makeUser(srv, admin, { role: "editor" });
  const b = srv.client();
  await b.login(email, password);
  const short = await a.post("/api/auth/password", { currentPassword: password, newPassword: "corta" });
  assert.equal(short.status, 422);
  assert.ok(short.data.error.fields.newPassword);
  const wrong = await a.post("/api/auth/password", { currentPassword: "no-es-la-actual", newPassword: "NuevaClave2026" });
  assert.equal(wrong.status, 422);
  assert.ok(wrong.data.error.fields.currentPassword);
  const ok = await a.post("/api/auth/password", { currentPassword: password, newPassword: "NuevaClave2026" });
  assert.equal(ok.status, 200);
  assert.equal((await a.get("/api/auth/me")).status, 200, "la sesión actual sigue");
  assert.equal((await b.get("/api/auth/me")).status, 401, "las demás se cierran");
  assert.equal((await srv.client().post("/api/auth/login", { email, password })).status, 401);
  assert.equal((await srv.client().post("/api/auth/login", { email, password: "NuevaClave2026" })).status, 200);
});
