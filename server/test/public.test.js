// API pública: contenido de la tienda, content.js, suscripción, validar/redimir cupones, salud
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import { startServer, freshIp } from "./helpers.js";
import { colombiaToday } from "../lib/util.js";

let srv;
let admin;
const anon = () => srv.client({ admin: false });
const day = (offset) => colombiaToday(Date.now() + offset * 86400000);

before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

test("GET /api/health", async () => {
  const r = await anon().get("/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, version: "test-sha" });
});

test("contenido público: sin borradores, sin couponCode, welcome 15%, __source server", async () => {
  // Un borrador no debe salir
  const draft = await admin.post("/api/admin/products/fe/duplicate");
  assert.equal(draft.status, 201);
  assert.equal(draft.data.item.status, "draft");
  const r = await anon().get("/api/public/content");
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "no-cache");
  assert.ok(r.headers.etag);
  const c = r.data;
  assert.equal(c.__source, "server");
  assert.equal(c.schemaVersion, 1);
  assert.ok(c.meta.updatedAt);
  assert.equal(c.meta.sections, undefined);
  assert.equal(c.meta.updatedBy, undefined);
  assert.equal(c.discountModal.couponCode, undefined);
  assert.doesNotMatch(r.text, /couponCode/);
  assert.deepEqual(c.discountModal.welcome, { label: "15%", type: "percent", value: 15 });
  assert.ok(c.products.length >= 14);
  assert.ok(c.products.every((p) => p.status === "published"));
  assert.ok(!c.products.some((p) => p.id === draft.data.item.id));
  assert.ok(c.products.every((p) => p.updatedBy === undefined));
  assert.ok(c.settings && c.home && c.texts && c.colors && c.categories && c.sizeCharts && c.reviews);
  // 304 con la ETag
  const again = await anon().get("/api/public/content", { headers: { "if-none-match": r.headers.etag } });
  assert.equal(again.status, 304);
});

test("content.js es JavaScript ejecutable que define window.MercyContent", async () => {
  const r = await anon().get("/api/public/content.js");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(r.headers["cache-control"], "no-cache");
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.runInNewContext(r.text, sandbox);
  assert.equal(sandbox.MercyContent.__source, "server");
  assert.equal(sandbox.MercyContent.discountModal.welcome.label, "15%");
  // gzip
  const gz = await anon().get("/api/public/content.js", { headers: { "accept-encoding": "gzip" } });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.equal(gunzipSync(gz.body).toString(), r.text);
  // 304
  assert.equal((await anon().get("/api/public/content.js", { headers: { "if-none-match": r.headers.etag } })).status, 304);
});

test("welcome = null si el cupón de bienvenida está inactivo; label fijo con miles", async () => {
  const list = (await admin.get("/api/admin/coupons")).data.items;
  const w = list.find((x) => x.code === "MERCY15");
  const off = await admin.put(`/api/admin/coupons/${w.id}`, { ...w, active: false });
  assert.equal(off.status, 200);
  assert.equal((await anon().get("/api/public/content")).data.discountModal.welcome, null);
  // Cupón fijo como bienvenida
  const fixed = await admin.post("/api/admin/coupons", { code: "BIENVENIDA20", type: "fixed", value: 20000, description: "20 mil" });
  assert.equal(fixed.status, 201);
  const cur = (await admin.get("/api/admin/content")).data.discountModal;
  const put = await admin.put("/api/admin/content/discountModal", { ...cur, couponCode: "BIENVENIDA20" });
  assert.equal(put.status, 200, put.text);
  assert.deepEqual((await anon().get("/api/public/content")).data.discountModal.welcome, { label: "$20.000", type: "fixed", value: 20000 });
  // volver como estaba
  await admin.put("/api/admin/content/discountModal", { ...cur, couponCode: "MERCY15" });
  await admin.put(`/api/admin/coupons/${w.id}`, { ...w, active: true });
  assert.equal((await anon().get("/api/public/content")).data.discountModal.welcome.label, "15%");
});

test("suscribirse: dedupe por correo, count, cupón devuelto, 422 con correo inválido", async () => {
  const c = anon();
  const r1 = await c.post("/api/public/subscribe", { email: "  Laura@Correo.CO ", source: "popup" });
  assert.equal(r1.status, 200, r1.text);
  assert.equal(r1.data.ok, true);
  assert.equal(r1.data.coupon.code, "MERCY15");
  assert.equal(r1.data.coupon.label, "15%");
  const r2 = await c.post("/api/public/subscribe", { email: "laura@correo.co", source: "community" });
  assert.equal(r2.status, 200);
  const subs = (await admin.get("/api/admin/subscribers?q=laura")).data;
  assert.equal(subs.items.length, 1);
  assert.equal(subs.items[0].email, "laura@correo.co");
  assert.equal(subs.items[0].count, 2);
  assert.equal(subs.items[0].source, "popup");
  assert.equal(subs.items[0].couponCode, "MERCY15");
  const bad = await c.post("/api/public/subscribe", { email: "no-es-correo", source: "popup" });
  assert.equal(bad.status, 422);
  assert.equal(bad.data.error.code, "validation");
  assert.ok(bad.data.error.fields.email);
  // Debe ser JSON (bloquea formularios de otros sitios)
  const form = await c.request("POST", "/api/public/subscribe", { body: "email=a@b.co", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(form.status, 415);
});

test("suscribirse con el modal apagado (enabled: false): coupon null, couponCode vacío y welcome null en el contenido público", async () => {
  const cur = (await admin.get("/api/admin/content")).data.discountModal;
  assert.equal(cur.enabled, true);
  // Con el modal encendido hay cupón (y un suscriptor previo lo recibe)
  const c = anon();
  const before = await c.post("/api/public/subscribe", { email: "antes-del-apagado@correo.co", source: "popup" });
  assert.equal(before.data.coupon.code, "MERCY15");
  const off = await admin.put("/api/admin/content/discountModal", { ...cur, enabled: false });
  assert.equal(off.status, 200, off.text);
  try {
    // Contenido público coherente: sin welcome (JSON y content.js)
    const pub = await anon().get("/api/public/content");
    assert.equal(pub.data.discountModal.enabled, false);
    assert.equal(pub.data.discountModal.welcome, null);
    assert.doesNotMatch(pub.text, /MERCY15/);
    const js = await anon().get("/api/public/content.js");
    const sandbox = { window: {} };
    sandbox.window = sandbox;
    vm.runInNewContext(js.text, sandbox);
    assert.equal(sandbox.MercyContent.discountModal.welcome, null);
    // Suscribirse funciona, pero sin cupón
    for (const source of ["popup", "community", "checkout"]) {
      const r = await c.post("/api/public/subscribe", { email: `apagado-${source}@correo.co`, source });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(r.data, { ok: true, coupon: null });
    }
    const subs = (await admin.get("/api/admin/subscribers?q=apagado-")).data.items;
    assert.equal(subs.length, 3);
    assert.ok(subs.every((s) => s.couponCode === ""), JSON.stringify(subs));
    // Quien ya se había suscrito con cupón lo conserva (el registro guarda el cupón que recibió)
    const again = await c.post("/api/public/subscribe", { email: "antes-del-apagado@correo.co", source: "popup" });
    assert.deepEqual(again.data, { ok: true, coupon: null });
    const prev = (await admin.get("/api/admin/subscribers?q=antes-del-apagado")).data.items[0];
    assert.equal(prev.couponCode, "MERCY15");
    assert.equal(prev.count, 2);
    // El cupón sigue existiendo y se puede validar a mano (apagar el modal no desactiva el cupón)
    assert.equal((await c.post("/api/public/coupons/validate", { code: "MERCY15" })).data.ok, true);
  } finally {
    await admin.put("/api/admin/content/discountModal", { ...cur, enabled: true });
  }
  // Al encenderlo vuelve el cupón
  assert.equal((await anon().get("/api/public/content")).data.discountModal.welcome.label, "15%");
  const on = await c.post("/api/public/subscribe", { email: "encendido@correo.co", source: "popup" });
  assert.equal(on.data.coupon.code, "MERCY15");
  assert.equal((await admin.get("/api/admin/subscribers?q=encendido@")).data.items[0].couponCode, "MERCY15");
});

test("suscribirse sin cupón de bienvenida vigente (modal encendido): coupon null y couponCode vacío", async () => {
  const list = (await admin.get("/api/admin/coupons")).data.items;
  const w = list.find((x) => x.code === "MERCY15");
  assert.equal((await admin.put(`/api/admin/coupons/${w.id}`, { ...w, active: false })).status, 200);
  try {
    const r = await anon().post("/api/public/subscribe", { email: "sin-vigente@correo.co" });
    assert.deepEqual(r.data, { ok: true, coupon: null });
    assert.equal((await admin.get("/api/admin/subscribers?q=sin-vigente")).data.items[0].couponCode, "");
  } finally {
    await admin.put(`/api/admin/coupons/${w.id}`, { ...w, active: true });
  }
});

test("suscribirse: límite de 20 por hora por IP → 429 con Retry-After", async () => {
  const c = srv.client({ admin: false, ip: freshIp() });
  for (let i = 0; i < 20; i++) {
    const r = await c.post("/api/public/subscribe", { email: `limite${i}@correo.co` });
    assert.equal(r.status, 200, `intento ${i}`);
  }
  const r = await c.post("/api/public/subscribe", { email: "limite-x@correo.co" });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, "rate_limited");
  assert.ok(Number(r.headers["retry-after"]) > 0);
});

test("validar cupón: not_found, inactive, not_started, expired, exhausted y vigente (fechas inclusivas en Colombia)", async () => {
  const mk = async (body) => {
    const r = await admin.post("/api/admin/coupons", { type: "percent", value: 10, ...body });
    assert.equal(r.status, 201, r.text);
    return r.data.item;
  };
  await mk({ code: "INACTIVO", active: false });
  await mk({ code: "FUTURO", startsAt: day(1) });
  await mk({ code: "VENCIDO", endsAt: day(-1) });
  await mk({ code: "HOYSI", startsAt: day(0), endsAt: day(0) });
  await mk({ code: "FIJO5000", type: "fixed", value: 5000, minSubtotal: 50000, appliesTo: "categories", categoryIds: ["hoodies"] });
  const c = anon();
  const v = async (code) => (await c.post("/api/public/coupons/validate", { code })).data;
  assert.deepEqual(Object.keys(await v("NOEXISTE")).sort(), ["message", "ok", "reason"]);
  assert.equal((await v("NOEXISTE")).reason, "not_found");
  assert.equal((await v("")).reason, "not_found");
  assert.equal((await v("inactivo")).reason, "inactive");
  const fut = await v("FUTURO");
  assert.equal(fut.reason, "not_started");
  assert.match(fut.message, /disponible desde/);
  assert.equal((await v("VENCIDO")).reason, "expired");
  const hoy = await v("hoysi");
  assert.equal(hoy.ok, true);
  assert.deepEqual(hoy.coupon, { code: "HOYSI", type: "percent", value: 10, label: "10%", appliesTo: "all", categoryIds: [], productIds: [], minSubtotal: 0 });
  const fijo = await v("FIJO5000");
  assert.equal(fijo.coupon.label, "$5.000");
  assert.equal(fijo.coupon.type, "fixed");
  assert.equal(fijo.coupon.minSubtotal, 50000);
  assert.deepEqual(fijo.coupon.categoryIds, ["hoodies"]);
  // siempre HTTP 200
  assert.equal((await c.post("/api/public/coupons/validate", { code: "VENCIDO" })).status, 200);
});

test("cupón público sin «description» (nota interna): validate, redeem y subscribe solo devuelven lo que usa la tienda", async () => {
  const NOTA = "Nota interna: campaña con influenciadores (no publicar)";
  const r = await admin.post("/api/admin/coupons", { code: "NOTAINTERNA", type: "percent", value: 12, description: NOTA });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.data.item.description, NOTA, "el panel sí la ve");
  const KEYS = ["appliesTo", "categoryIds", "code", "label", "minSubtotal", "productIds", "type", "value"];
  const c = srv.client({ admin: false, ip: freshIp() });
  for (const path of ["/api/public/coupons/validate", "/api/public/coupons/redeem"]) {
    const res = await c.post(path, { code: "notainterna" });
    assert.equal(res.data.ok, true, path);
    assert.deepEqual(Object.keys(res.data.coupon).sort(), KEYS, path);
    assert.doesNotMatch(res.text, /influenciadores/, path);
  }
  // El cupón de bienvenida de fábrica (MERCY15) también trae descripción interna
  const welcome = (await admin.get("/api/admin/coupons")).data.items.find((x) => x.code === "MERCY15");
  assert.ok(welcome.description);
  const sub = await c.post("/api/public/subscribe", { email: "sin-descripcion@correo.co", source: "popup" });
  assert.equal(sub.data.coupon.code, "MERCY15");
  assert.deepEqual(Object.keys(sub.data.coupon).sort(), KEYS);
  assert.ok(!sub.text.includes(welcome.description));
  await admin.del(`/api/admin/coupons/${r.data.item.id}`);
});

test("redimir cupón: suma usos y se agota con maxUses", async () => {
  const r = await admin.post("/api/admin/coupons", { code: "DOSUSOS", type: "fixed", value: 10000, maxUses: 2 });
  assert.equal(r.status, 201);
  const c = anon();
  const a = await c.post("/api/public/coupons/redeem", { code: "dosusos" });
  assert.equal(a.data.ok, true);
  assert.equal(a.data.coupon.label, "$10.000");
  // validar NO suma usos
  await c.post("/api/public/coupons/validate", { code: "DOSUSOS" });
  const [b, d] = await Promise.all([
    c.post("/api/public/coupons/redeem", { code: "DOSUSOS" }),
    c.post("/api/public/coupons/redeem", { code: "DOSUSOS" }),
  ]);
  const oks = [b.data.ok, d.data.ok].filter(Boolean).length;
  assert.equal(oks, 1, "solo uno de los dos canjes simultáneos puede pasar");
  const last = await c.post("/api/public/coupons/redeem", { code: "DOSUSOS" });
  assert.equal(last.status, 200);
  assert.equal(last.data.reason, "exhausted");
  const item = (await admin.get(`/api/admin/coupons/${r.data.item.id}`)).data.item;
  assert.equal(item.usesCount, 2);
});

test("límite de validación de cupones por IP (60/10 min); cada IP tiene su propio cupo", async () => {
  const c = srv.client({ admin: false, ip: freshIp() });
  for (let i = 0; i < 60; i++) assert.equal((await c.post("/api/public/coupons/validate", { code: "X" })).status, 200, `intento ${i}`);
  const r = await c.post("/api/public/coupons/validate", { code: "X" });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, "rate_limited");
  assert.ok(Number(r.headers["retry-after"]) > 0);
  // Otra IP no se ve afectada
  assert.equal((await srv.client({ admin: false, ip: freshIp() }).post("/api/public/coupons/validate", { code: "X" })).status, 200);
});

test("límite de canje de cupones por IP (20/10 min), separado del de validar", async () => {
  const ip = freshIp();
  const c = srv.client({ admin: false, ip });
  for (let i = 0; i < 20; i++) assert.equal((await c.post("/api/public/coupons/redeem", { code: "NOEXISTE" })).status, 200, `intento ${i}`);
  const r = await c.post("/api/public/coupons/redeem", { code: "NOEXISTE" });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, "rate_limited");
  assert.equal((await c.post("/api/public/coupons/validate", { code: "NOEXISTE" })).status, 200, "validar tiene su propio cupo");
});

test("rutas de API desconocidas → 404 JSON; JSON inválido → 400", async () => {
  const r = await anon().get("/api/no-existe");
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, "not_found");
  const bad = await anon().request("POST", "/api/public/coupons/validate", { body: "{no json", headers: { "content-type": "application/json" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.code, "bad_request");
  const m = await anon().request("DELETE", "/api/public/content");
  assert.equal(m.status, 405);
});
