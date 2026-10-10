// Actividad: acciones del sistema (user.id null) al arrancar y filtro userId=system; ADMIN_RESET queda registrado
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, ADMIN } from "./helpers.js";

test("filtro userId=system: solo acciones del sistema (siembra del admin y ADMIN_RESET), paginado como los demás", async () => {
  const first = await startServer();
  const dataDir = first.dataDir;
  let me;
  try {
    const admin = first.client();
    me = await admin.login();
    const sys = await admin.get("/api/admin/activity?userId=system");
    assert.equal(sys.status, 200);
    assert.equal(sys.data.items.length, 1, JSON.stringify(sys.data.items));
    const seed = sys.data.items[0];
    assert.deepEqual(seed.user, { id: null, name: "Sistema" });
    assert.equal(seed.action, "create");
    assert.equal(seed.entity, "user");
    assert.equal(seed.entityId, me.id);
    assert.match(seed.label, /^Administrador «Ana Admin» creado al arrancar/);
    // Las de una persona no incluyen las del sistema (y viceversa)
    const mine = (await admin.get(`/api/admin/activity?userId=${me.id}`)).data.items;
    assert.ok(mine.length >= 1 && mine.every((e) => e.user.id === me.id));
    assert.ok(!mine.some((e) => e.id === seed.id));
    // Se combina con entity
    assert.equal((await admin.get("/api/admin/activity?userId=system&entity=session")).data.items.length, 0);
    assert.equal((await admin.get("/api/admin/activity?userId=system&entity=user")).data.items.length, 1);
  } finally {
    await first.stop({ keepData: true });
  }

  // Segundo arranque con ADMIN_RESET=1 y otra contraseña: queda una acción del sistema más
  const NEW_PASSWORD = "OtraClave2026!!";
  const second = await startServer({ dataDir, adminReset: true, adminPassword: NEW_PASSWORD });
  try {
    const c = second.client();
    assert.equal((await c.post("/api/auth/login", { email: ADMIN.email, password: ADMIN.password })).status, 401, "la clave vieja ya no sirve");
    await c.login(ADMIN.email, NEW_PASSWORD);
    const p1 = await c.get("/api/admin/activity?userId=system&limit=1");
    assert.equal(p1.data.items.length, 1);
    assert.equal(p1.data.items[0].action, "password");
    assert.equal(p1.data.items[0].entityId, me.id);
    assert.equal(p1.data.items[0].user.id, null);
    assert.match(p1.data.items[0].label, /^Acceso de «Ana Admin» restablecido al arrancar \(ADMIN_RESET\)$/);
    assert.ok(p1.data.next, "hay una página más (la siembra)");
    const p2 = await c.get(`/api/admin/activity?userId=system&limit=1&before=${p1.data.next}`);
    assert.equal(p2.data.items.length, 1);
    assert.equal(p2.data.items[0].action, "create");
    assert.equal(p2.data.next, null);
    // Sin filtro aparecen mezcladas con las de las personas
    const all = (await c.get("/api/admin/activity")).data.items;
    assert.ok(all.some((e) => e.user.id === null) && all.some((e) => e.user.id === me.id));
  } finally {
    await second.stop();
  }
});
