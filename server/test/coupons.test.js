// Cupones (admin): CRUD, validación, código único, protección del cupón de bienvenida, usos
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.js";

let srv;
let admin;
before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

test("listado inicial con el cupón de fábrica MERCY15", async () => {
  const r = await admin.get("/api/admin/coupons");
  assert.equal(r.status, 200);
  const m = r.data.items.find((c) => c.code === "MERCY15");
  assert.ok(m);
  assert.equal(m.type, "percent");
  assert.equal(m.value, 15);
  assert.equal(m.usesCount, 0);
  assert.ok(m.createdAt && m.updatedAt && m.createdBy);
});

test("crear: normaliza código a MAYÚSCULAS, defaults y 409 por código repetido", async () => {
  const r = await admin.post("/api/admin/coupons", { code: " navidad-20 ", description: "Navidad", type: "fixed", value: 20000, startsAt: "2026-12-01", endsAt: "2026-12-31", minSubtotal: 100000, maxUses: 50, usesCount: 999, appliesTo: "all", categoryIds: ["camisetas"], extra: 1 });
  assert.equal(r.status, 201, r.text);
  const c = r.data.item;
  assert.equal(c.code, "NAVIDAD-20");
  assert.equal(c.usesCount, 0, "usesCount lo maneja el servidor");
  assert.deepEqual(c.categoryIds, [], "appliesTo=all vacía las listas");
  assert.equal(c.extra, undefined);
  assert.equal(c.active, true);
  assert.match(c.id, /^c-/);
  assert.equal(c.createdBy, "Ana Admin");
  const dup = await admin.post("/api/admin/coupons", { code: "Navidad-20", type: "percent", value: 5 });
  assert.equal(dup.status, 409);
  assert.ok(dup.data.error.fields.code);
  assert.equal((await admin.get(`/api/admin/coupons/${c.id}`)).data.item.code, "NAVIDAD-20");
});

test("validación de cupones → 422 con fields", async () => {
  const r = await admin.post("/api/admin/coupons", { code: "A!", type: "percent", value: 150, startsAt: "2026-02-30", endsAt: "ayer", minSubtotal: -1, maxUses: 0, appliesTo: "products", productIds: ["no-existe"] });
  assert.equal(r.status, 422);
  const f = r.data.error.fields;
  for (const k of ["code", "value", "startsAt", "endsAt", "minSubtotal", "maxUses", "productIds.0"]) assert.ok(f[k], `falta ${k} en ${JSON.stringify(f)}`);
  const order = await admin.post("/api/admin/coupons", { code: "FECHAS", value: 10, startsAt: "2026-12-31", endsAt: "2026-12-01" });
  assert.ok(order.data.error.fields.endsAt);
  const cats = await admin.post("/api/admin/coupons", { code: "SINCATS", value: 10, appliesTo: "categories", categoryIds: [] });
  assert.ok(cats.data.error.fields.categoryIds);
  const fixed = await admin.post("/api/admin/coupons", { code: "FIJOCERO", type: "fixed", value: 0 });
  assert.ok(fixed.data.error.fields.value);
});

test("actualizar: conserva usesCount salvo resetUses; 404 si no existe", async () => {
  const c = (await admin.post("/api/admin/coupons", { code: "USOS", type: "percent", value: 10 })).data.item;
  await srv.client({ admin: false }).post("/api/public/coupons/redeem", { code: "USOS" });
  const r = await admin.put(`/api/admin/coupons/${c.id}`, { ...c, value: 12, usesCount: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.data.item.value, 12);
  assert.equal(r.data.item.usesCount, 1, "no se pierde el uso aunque el panel envíe un valor viejo");
  assert.equal(r.data.item.createdAt, c.createdAt);
  const reset = await admin.put(`/api/admin/coupons/${c.id}`, { ...r.data.item, resetUses: true });
  assert.equal(reset.data.item.usesCount, 0);
  assert.equal((await admin.put("/api/admin/coupons/c-noexiste", c)).status, 404);
});

test("cupón de bienvenida: no se puede borrar (409 in_use); renombrarlo actualiza el modal", async () => {
  const m = (await admin.get("/api/admin/coupons")).data.items.find((c) => c.code === "MERCY15");
  const del = await admin.del(`/api/admin/coupons/${m.id}`);
  assert.equal(del.status, 409);
  assert.equal(del.data.error.code, "in_use");
  assert.deepEqual(del.data.error.usages, ["discountModal.couponCode"]);
  const ren = await admin.put(`/api/admin/coupons/${m.id}`, { ...m, code: "MERCY15B" });
  assert.equal(ren.status, 200);
  const content = (await admin.get("/api/admin/content")).data;
  assert.equal(content.discountModal.couponCode, "MERCY15B");
  const revs = (await admin.get("/api/admin/revisions")).data.items;
  assert.match(revs[0].summary, /cupón de bienvenida: MERCY15B/);
  const pub = await srv.client({ admin: false }).get("/api/public/content");
  assert.equal(pub.data.discountModal.welcome.label, "15%");
  await admin.put(`/api/admin/coupons/${m.id}`, { ...m, code: "MERCY15" });
  assert.equal((await admin.get("/api/admin/content")).data.discountModal.couponCode, "MERCY15");
});

test("eliminar un cupón normal", async () => {
  const c = (await admin.post("/api/admin/coupons", { code: "BORRAME", value: 10 })).data.item;
  const r = await admin.del(`/api/admin/coupons/${c.id}`);
  assert.equal(r.status, 200);
  assert.equal((await admin.get(`/api/admin/coupons/${c.id}`)).status, 404);
  const v = await srv.client({ admin: false }).post("/api/public/coupons/validate", { code: "BORRAME" });
  assert.equal(v.data.reason, "not_found");
  const act = (await admin.get("/api/admin/activity?entity=coupon")).data.items.map((e) => e.label);
  assert.ok(act.includes("Cupón «BORRAME» eliminado"));
  assert.ok(act.includes("Cupón «BORRAME» creado"));
});

test("suscriptores: listado con total, búsqueda, CSV con BOM y borrado", async () => {
  const pub = srv.client({ admin: false });
  await pub.post("/api/public/subscribe", { email: "uno@correo.co", source: "popup" });
  await pub.post("/api/public/subscribe", { email: "=cmd@correo.co", source: "checkout" });
  await pub.post("/api/public/subscribe", { email: "uno@correo.co", source: "community" });
  const r = await admin.get("/api/admin/subscribers");
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 2);
  assert.equal(r.data.items[0].email, "uno@correo.co", "el más reciente primero");
  assert.equal(r.data.items[0].count, 2);
  assert.equal((await admin.get("/api/admin/subscribers?q=CMD")).data.items.length, 1);
  const csv = await admin.get("/api/admin/subscribers.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.headers["content-type"], /^text\/csv; charset=utf-8/);
  assert.match(csv.headers["content-disposition"], /attachment; filename="suscriptores-mercy-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(csv.body[0], 0xef);
  assert.equal(csv.body[1], 0xbb);
  assert.equal(csv.body[2], 0xbf);
  const lines = csv.text.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "email,origen,cupón,veces,creado,actualizado");
  assert.match(lines[1], /^uno@correo\.co,pop-up,MERCY15,2,\d{4}-\d{2}-\d{2} \d{2}:\d{2},/);
  assert.ok(lines.some((l) => l.startsWith("'=cmd@correo.co,checkout")), "protección contra fórmulas");
  const id = r.data.items[0].id;
  assert.equal((await admin.del(`/api/admin/subscribers/${id}`)).status, 200);
  assert.equal((await admin.get("/api/admin/subscribers")).data.total, 1);
  assert.equal((await admin.del(`/api/admin/subscribers/${id}`)).status, 404);
});
