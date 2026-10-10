// Administración de usuarios: CRUD y protecciones (último admin, borrarse a sí mismo, sesiones)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ADMIN, startServer, makeUser } from "./helpers.js";

let srv;
let admin;
let me;
before(async () => {
  srv = await startServer();
  admin = srv.client();
  me = await admin.login();
});
after(() => srv.stop());

test("crear usuario: validaciones, correo único, nunca devuelve el hash", async () => {
  const bad = await admin.post("/api/admin/users", { name: "", email: "malo", role: "jefe", password: "123" });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.name);
  assert.ok(bad.data.error.fields.email);
  assert.ok(bad.data.error.fields.role);
  assert.ok(bad.data.error.fields.password);
  const nopw = await admin.post("/api/admin/users", { name: "Sin clave", email: "sin@prueba.co", role: "editor" });
  assert.equal(nopw.status, 422);
  assert.ok(nopw.data.error.fields.password);
  const r = await admin.post("/api/admin/users", { name: "Carlos", email: "Carlos@Prueba.co", role: "editor", password: "ClaveCarlos01" });
  assert.equal(r.status, 201);
  assert.equal(r.data.item.email, "carlos@prueba.co");
  assert.equal(r.data.item.passwordHash, undefined);
  const dup = await admin.post("/api/admin/users", { name: "Otro", email: "carlos@prueba.co", role: "editor", password: "ClaveCarlos01" });
  assert.equal(dup.status, 409);
  const list = await admin.get("/api/admin/users");
  assert.ok(list.data.items.length >= 2);
  assert.doesNotMatch(list.text, /passwordHash|scrypt\$/);
  const raw = JSON.parse(await readFile(join(srv.dataDir, "users.json"), "utf8"));
  const carlos = raw.find((u) => u.email === "carlos@prueba.co");
  assert.match(carlos.passwordHash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(Buffer.from(carlos.passwordHash.split("$")[5], "base64").length, 64);
  assert.equal(Buffer.from(carlos.passwordHash.split("$")[4], "base64").length, 16);
});

test("último administrador activo: no se puede degradar, desactivar ni borrar; borrarse a sí mismo → 409", async () => {
  const deg = await admin.put(`/api/admin/users/${me.id}`, { name: me.name, email: me.email, role: "editor", active: true });
  assert.equal(deg.status, 409);
  assert.match(deg.data.error.message, /al menos un administrador activo/);
  const off = await admin.put(`/api/admin/users/${me.id}`, { name: me.name, email: me.email, role: "admin", active: false });
  assert.equal(off.status, 409);
  const self = await admin.del(`/api/admin/users/${me.id}`);
  assert.equal(self.status, 409);
  assert.match(self.data.error.message, /propio usuario/);
  // Con un segundo admin, el primero sí puede degradarse… pero el segundo no puede quedar sin admins
  const { user: other, client: oc } = await makeUser(srv, admin, { role: "admin", name: "Beto Admin" });
  const deg2 = await admin.put(`/api/admin/users/${other.id}`, { name: other.name, email: other.email, role: "editor", active: true });
  assert.equal(deg2.status, 200);
  assert.equal(deg2.data.item.role, "editor");
  // Ahora `other` es editor: ya no puede administrar usuarios
  assert.equal((await oc.get("/api/admin/users")).status, 403);
  const del = await admin.del(`/api/admin/users/${other.id}`);
  assert.equal(del.status, 200);
  assert.equal((await oc.get("/api/auth/me")).status, 401, "borrar un usuario cierra sus sesiones");
});

test("desactivar a un usuario cierra sus sesiones y le impide entrar", async () => {
  const { user, client, email, password } = await makeUser(srv, admin, { role: "editor", name: "Diana" });
  assert.equal((await client.get("/api/auth/me")).status, 200);
  const r = await admin.put(`/api/admin/users/${user.id}`, { name: user.name, email: user.email, role: "editor", active: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.item.active, false);
  assert.equal((await client.get("/api/auth/me")).status, 401);
  const login = await srv.client().post("/api/auth/login", { email, password });
  assert.equal(login.status, 403);
  assert.match(login.data.error.message, /desactivado/);
  // reactivar
  await admin.put(`/api/admin/users/${user.id}`, { name: user.name, email: user.email, role: "editor", active: true });
  assert.equal((await srv.client().post("/api/auth/login", { email, password })).status, 200);
});

test("el admin cambia la contraseña de otro usuario: sus sesiones se cierran", async () => {
  const { user, client, email, password } = await makeUser(srv, admin, { role: "editor", name: "Elena" });
  const r = await admin.put(`/api/admin/users/${user.id}`, { name: user.name, email: user.email, role: "editor", active: true, password: "OtraClave2026x" });
  assert.equal(r.status, 200);
  assert.equal((await client.get("/api/auth/me")).status, 401);
  assert.equal((await srv.client().post("/api/auth/login", { email, password })).status, 401);
  assert.equal((await srv.client().post("/api/auth/login", { email, password: "OtraClave2026x" })).status, 200);
  // Cambiar la propia contraseña desde Usuarios conserva la sesión actual
  const self = await admin.put(`/api/admin/users/${me.id}`, { name: me.name, email: me.email, role: "admin", active: true, password: "ClaveAdminNueva1" });
  assert.equal(self.status, 200);
  assert.equal((await admin.get("/api/auth/me")).status, 200);
  await admin.put(`/api/admin/users/${me.id}`, { name: me.name, email: me.email, role: "admin", active: true, password: ADMIN.password });
});

test("usuario inexistente → 404", async () => {
  assert.equal((await admin.put("/api/admin/users/u-noexiste", { name: "x", email: "x@x.co", role: "editor", active: true })).status, 404);
  assert.equal((await admin.del("/api/admin/users/u-noexiste")).status, 404);
});

test("las acciones quedan en la actividad (login, crear usuario, contraseña)", async () => {
  const r = await admin.get("/api/admin/activity?entity=user&limit=50");
  assert.equal(r.status, 200);
  const labels = r.data.items.map((e) => e.label);
  assert.ok(labels.some((l) => /^Usuario «Carlos» creado/.test(l)));
  assert.ok(labels.some((l) => /Contraseña de «Elena» cambiada/.test(l)));
  const logins = await admin.get("/api/admin/activity?entity=session");
  assert.ok(logins.data.items.some((e) => e.action === "login"));
  const mine = await admin.get(`/api/admin/activity?userId=${me.id}&limit=2`);
  assert.equal(mine.data.items.length, 2);
  assert.ok(mine.data.items.every((e) => e.user.id === me.id));
  assert.ok(mine.data.next);
  const page2 = await admin.get(`/api/admin/activity?userId=${me.id}&limit=2&before=${mine.data.next}`);
  assert.equal(page2.data.items.length, 2);
  assert.notEqual(page2.data.items[0].id, mine.data.items[0].id);
});
