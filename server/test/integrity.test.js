// Integridad entre contenido y cupones (restaurar, borrar y renombrar productos), concurrencia de cupones y usuarios,
// ids anteriores de productos (formerIds), renombre de hormas/categorías, normalizaciones y caché del gzip.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { startServer, makeUser, makePng, freshIp } from "./helpers.js";

let srv;
let admin;
before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

const content = async () => (await admin.get("/api/admin/content")).data;
const revisions = async () => (await admin.get("/api/admin/revisions")).data.items;
const couponBy = async (code) => (await admin.get("/api/admin/coupons")).data.items.find((c) => c.code === code) || null;
const pub = () => srv.client({ admin: false });
const restore = (id) => admin.post(`/api/admin/revisions/${id}/restore`);
const product = (id, extra = {}) => ({
  id, ref: "", name: `Producto ${id}`, status: "published", category: "camisetas", collection: "", fits: ["regular"], sizes: ["M"], price: 50000,
  colors: [{ color: "negro", photos: [], stock: { M: 3 } }], tile: { from: "#d8bea6", to: "#a76d4a", lines: ["X"] }, ...extra,
});

/* ---------- Restaurar: cupón de bienvenida ---------- */
test("restaurar NO cambia el cupón de bienvenida: código renombrado o reutilizado por otro cupón", async () => {
  const c = await content();
  const home = { ...c.home, hero: { ...c.home.hero, eyebrow: "R1 bienvenida" } };
  assert.equal((await admin.put("/api/admin/content/home", home)).status, 200);
  const r1 = (await revisions())[0];
  // El cupón de bienvenida se renombra (el modal pasa a BIENVENIDA) y luego OTRO cupón toma el código viejo
  const w = await couponBy("MERCY15");
  assert.equal((await admin.put(`/api/admin/coupons/${w.id}`, { ...w, code: "BIENVENIDA" })).status, 200);
  assert.equal((await content()).discountModal.couponCode, "BIENVENIDA");
  const vip = await admin.post("/api/admin/coupons", { code: "MERCY15", type: "percent", value: 50 });
  assert.equal(vip.status, 201, vip.text);

  const r = await restore(r1.id);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.content.home.hero.eyebrow, "R1 bienvenida");
  assert.equal(r.data.content.discountModal.couponCode, "BIENVENIDA", "se conserva el cupón de bienvenida vigente");
  const p = (await pub().get("/api/public/content")).data;
  assert.deepEqual(p.discountModal.welcome, { label: "15%", type: "percent", value: 15 }, "no regala el VIP del 50 %");
  const sub = await pub().post("/api/public/subscribe", { email: "restaura@correo.co", source: "popup" });
  assert.equal(sub.data.coupon.code, "BIENVENIDA");
  // El modal se puede seguir guardando (admin y editora)
  const dm = (await content()).discountModal;
  assert.equal((await admin.put("/api/admin/content/discountModal", { ...dm, title: "Título nuevo" })).status, 200);
  const { client: ed } = await makeUser(srv, admin, { role: "editor" });
  assert.equal((await ed.put("/api/admin/content/discountModal", { ...dm, title: "Título de la editora" })).status, 200);

  // Volver a dejar el código de fábrica (para las demás pruebas)
  await admin.del(`/api/admin/coupons/${vip.data.item.id}`);
  const bien = await couponBy("BIENVENIDA");
  assert.equal((await admin.put(`/api/admin/coupons/${bien.id}`, { ...bien, code: "MERCY15" })).status, 200);
  assert.equal((await content()).discountModal.couponCode, "MERCY15");
});

/* ---------- Restaurar: cupones por categoría y por producto ---------- */
test("restaurar no puede quitar una categoría que usa un cupón (409 in_use con el cupón)", async () => {
  const base = (await revisions())[0];
  const c = await content();
  const cats = [...c.categories, { id: "promo-navidad", name: "Promo navidad", details: [], sizeChart: "", inFooter: false }];
  assert.equal((await admin.put("/api/admin/content/categories", cats)).status, 200);
  const navi = await admin.post("/api/admin/coupons", { code: "NAVI10", type: "percent", value: 10, appliesTo: "categories", categoryIds: ["promo-navidad"] });
  assert.equal(navi.status, 201, navi.text);
  const r = await restore(base.id);
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, "in_use");
  assert.match(r.data.error.message, /^No se puede restaurar esta versión: quitaría la categoría «Promo navidad», que está en uso \(1 cupón: NAVI10\)/);
  assert.deepEqual(r.data.error.usages, ["coupons/NAVI10"]);
  assert.ok((await content()).categories.some((x) => x.id === "promo-navidad"), "no se restauró nada");
  // Sin el cupón, sí se puede
  await admin.del(`/api/admin/coupons/${navi.data.item.id}`);
  assert.equal((await restore(base.id)).status, 200);
  assert.ok(!(await content()).categories.some((x) => x.id === "promo-navidad"));
});

test("restaurar quita de los cupones los productos que desaparecen (el que queda vacío se desactiva) y sigue los renombres", async () => {
  const base = (await revisions())[0];
  assert.equal((await admin.post("/api/admin/products", product("producto-nuevo-x"))).status, 201);
  const xsolo = (await admin.post("/api/admin/coupons", { code: "XSOLO", type: "fixed", value: 5000, appliesTo: "products", productIds: ["producto-nuevo-x"] })).data.item;
  const mix = (await admin.post("/api/admin/coupons", { code: "XMIX", type: "fixed", value: 5000, appliesTo: "products", productIds: ["producto-nuevo-x", "fe"] })).data.item;
  const r = await restore(base.id);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.data.coupons.map((x) => [x.code, x.deactivated]).sort(), [["XMIX", false], ["XSOLO", true]]);
  const a = await couponBy("XSOLO");
  assert.deepEqual([a.productIds, a.active], [[], false]);
  const b = await couponBy("XMIX");
  assert.deepEqual([b.productIds, b.active], [["fe"], true]);
  // Ya no queda un cupón imposible de guardar: «Desactivar» (o cualquier cambio) responde 200
  assert.equal((await admin.put(`/api/admin/coupons/${a.id}`, { ...a, description: "x" })).status, 200);
  assert.equal((await admin.put(`/api/admin/coupons/${b.id}`, { ...b, active: false })).status, 200);
  await admin.del(`/api/admin/coupons/${xsolo.id}`);
  await admin.del(`/api/admin/coupons/${mix.id}`);
});

test("renombrar un producto guarda su id anterior (formerIds) y restaurar la versión previa lo devuelve sin romper el cupón", async () => {
  const solo = (await admin.post("/api/admin/coupons", { code: "SOLOFE", type: "percent", value: 5, appliesTo: "products", productIds: ["fe"] })).data.item;
  const before = (await revisions())[0];
  const fe = (await admin.get("/api/admin/products/fe")).data.item;
  const ren = await admin.put("/api/admin/products/fe", { ...fe, id: "camiseta-fe", formerIds: ["inventado"] });
  assert.equal(ren.status, 200, ren.text);
  assert.deepEqual(ren.data.item.formerIds, ["fe"], "el servidor gestiona formerIds (ignora el del cuerpo)");
  assert.deepEqual((await couponBy("SOLOFE")).productIds, ["camiseta-fe"]);
  // La tienda recibe los ids anteriores (enlaces, carritos y favoritos viejos)
  const p = (await pub().get("/api/public/content")).data.products.find((x) => x.id === "camiseta-fe");
  assert.deepEqual(p.formerIds, ["fe"]);
  // Guardar sin cambios no crea revisión aunque el cuerpo no traiga formerIds
  const n = (await revisions()).length;
  const { formerIds, ...noFormer } = ren.data.item;
  assert.equal((await admin.put("/api/admin/products/camiseta-fe", noFormer)).status, 200);
  assert.equal((await revisions()).length, n);

  const r = await restore(before.id);
  assert.equal(r.status, 200, r.text);
  const back = r.data.content.products.find((x) => x.id === "fe");
  assert.ok(back && !r.data.content.products.some((x) => x.id === "camiseta-fe"));
  assert.deepEqual(back.formerIds, ["camiseta-fe"], "el id del tiempo intermedio sigue llevando al producto");
  assert.deepEqual((await couponBy("SOLOFE")).productIds, ["fe"], "el cupón vuelve a apuntar al id restaurado");
  assert.equal((await couponBy("SOLOFE")).active, true);
  assert.deepEqual(r.data.coupons, [{ id: solo.id, code: "SOLOFE", deactivated: false }]);

  // Duplicar no copia los ids anteriores; crear ignora los del cuerpo
  const dup = await admin.post("/api/admin/products/fe/duplicate");
  assert.equal(dup.data.item.formerIds, undefined);
  await admin.del(`/api/admin/products/${dup.data.item.id}`);
  const created = await admin.post("/api/admin/products", product("con-anteriores", { formerIds: ["viejo"] }));
  assert.equal(created.data.item.formerIds, undefined);
  await admin.del("/api/admin/products/con-anteriores");
  await admin.del(`/api/admin/coupons/${solo.id}`);
});

test("restaurar avisa de los archivos /uploads que ya no existen (missingMedia)", async () => {
  const up = await admin.request("POST", "/api/admin/media", { body: makePng(8, 8), headers: { "content-type": "image/png", "x-file-name": "modal.png" } });
  assert.equal(up.status, 201, up.text);
  const url = up.data.item.url;
  const dm = (await content()).discountModal;
  assert.equal((await admin.put("/api/admin/content/discountModal", { ...dm, image: url })).status, 200);
  const withImage = (await revisions())[0];
  assert.equal((await admin.put("/api/admin/content/discountModal", { ...dm, image: "" })).status, 200);
  assert.equal((await admin.del(`/api/admin/media/${up.data.item.id}`)).status, 200);
  const r = await restore(withImage.id);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.content.discountModal.image, url);
  assert.deepEqual(r.data.missingMedia, [url]);
  // Con todo en su lugar → lista vacía
  assert.equal((await admin.put("/api/admin/content/discountModal", { ...dm, image: "" })).status, 200);
  const ok = await restore((await revisions())[0].id);
  assert.deepEqual(ok.data.missingMedia, []);
});

/* ---------- Concurrencia: cupones y usuarios ---------- */
test("cupones: X-Base-Updated-At viejo → 409 conflict con la versión actual (no se pisa lo que guardó otra persona)", async () => {
  const c = (await admin.post("/api/admin/coupons", { code: "LOSTUPD", type: "percent", value: 10, maxUses: 100 })).data.item;
  const b = await admin.put(`/api/admin/coupons/${c.id}`, { ...c, value: 25, maxUses: 5, endsAt: "2026-12-31" }, { headers: { "x-base-updated-at": c.updatedAt } });
  assert.equal(b.status, 200, b.text);
  const stale = await admin.put(`/api/admin/coupons/${c.id}`, { ...c, active: false }, { headers: { "x-base-updated-at": c.updatedAt } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, "conflict");
  assert.match(stale.data.error.message, /Otra persona guardó cambios en el cupón «LOSTUPD»/);
  assert.equal(stale.data.error.current.value, 25);
  const now = await couponBy("LOSTUPD");
  assert.deepEqual([now.value, now.maxUses, now.endsAt, now.active], [25, 5, "2026-12-31", true]);
  // Los canjes no cambian updatedAt (no generan conflictos con quien edita)
  await pub().post("/api/public/coupons/redeem", { code: "LOSTUPD" });
  const after2 = await couponBy("LOSTUPD");
  assert.equal(after2.usesCount, 1);
  assert.equal(after2.updatedAt, now.updatedAt);
  const fresh = await admin.put(`/api/admin/coupons/${c.id}`, { ...after2, active: false }, { headers: { "x-base-updated-at": after2.updatedAt } });
  assert.equal(fresh.status, 200, fresh.text);
  assert.equal(fresh.data.item.usesCount, 1);
  await admin.del(`/api/admin/coupons/${c.id}`);
});

test("usuarios: X-Base-Updated-At viejo → 409 conflict (desactivar desde un listado viejo no revierte nombre ni rol)", async () => {
  const { user: ana } = await makeUser(srv, admin, { role: "editor", name: "Ana" });
  const b = await admin.put(`/api/admin/users/${ana.id}`, { ...ana, name: "Ana María", role: "admin" }, { headers: { "x-base-updated-at": ana.updatedAt } });
  assert.equal(b.status, 200, b.text);
  const stale = await admin.put(`/api/admin/users/${ana.id}`, { ...ana, active: false }, { headers: { "x-base-updated-at": ana.updatedAt } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, "conflict");
  assert.equal(stale.data.error.current.name, "Ana María");
  assert.equal(stale.data.error.current.passwordHash, undefined, "nunca devuelve el hash");
  const cur = (await admin.get(`/api/admin/users/${ana.id}`)).data.item;
  assert.deepEqual([cur.name, cur.role, cur.active], ["Ana María", "admin", true]);
  // Sin la cabecera se comporta como siempre
  assert.equal((await admin.put(`/api/admin/users/${ana.id}`, { ...cur, active: false })).status, 200);
});

/* ---------- Hormas y categorías: renombre frente a borrado ---------- */
test("renombrar una horma conserva sus filas de la guía de tallas (borrarla sí las quita)", async () => {
  const c = await content();
  assert.equal((await admin.put("/api/admin/content/fits", [...c.fits, { id: "cuadrada", name: "Cuadrada" }])).status, 200);
  const c2 = await content();
  const charts = c2.sizeCharts.map((sc) => sc.id === "camisetas" ? { ...sc, rows: { ...sc.rows, cuadrada: sc.rows.regular } } : sc);
  assert.equal((await admin.put("/api/admin/content/sizeCharts", charts)).status, 200);
  const c3 = await content();
  const renamed = c3.fits.map((f) => (f.id === "cuadrada" ? { id: "box", name: "Cuadrada" } : f));
  const r = await admin.put("/api/admin/content/fits", renamed, { headers: { "x-base-updated-at": c3.meta.sections.fits.updatedAt } });
  assert.equal(r.status, 200, r.text);
  const cam = (await content()).sizeCharts.find((sc) => sc.id === "camisetas");
  assert.ok(!("cuadrada" in cam.rows));
  assert.deepEqual(cam.rows.box, c3.sizeCharts.find((sc) => sc.id === "camisetas").rows.cuadrada, "las filas pasan al id nuevo");
  // Borrar la horma (sin productos) sí quita sus filas (cascada documentada)
  const c4 = await content();
  assert.equal((await admin.put("/api/admin/content/fits", c4.fits.filter((f) => f.id !== "box"))).status, 200);
  assert.ok(!("box" in (await content()).sizeCharts.find((sc) => sc.id === "camisetas").rows));
});

test("categoría usada solo por un cupón: el editor ve sus usos (sin códigos) y el renombre dice «cambiar el id»", async () => {
  const c = await content();
  assert.equal((await admin.put("/api/admin/content/categories", [...c.categories, { id: "promo", name: "Promo", details: [], sizeChart: "", inFooter: false }])).status, 200);
  const promo5 = (await admin.post("/api/admin/coupons", { code: "PROMO5", type: "percent", value: 5, appliesTo: "categories", categoryIds: ["promo"] })).data.item;
  const { client: ed } = await makeUser(srv, admin, { role: "editor" });
  assert.equal((await ed.get("/api/admin/coupons")).status, 403);
  const u = await ed.get("/api/admin/usages");
  assert.equal(u.status, 200);
  assert.equal(u.data.coupons.categories.promo, 1);
  assert.ok(!u.text.includes("PROMO5"), "sin códigos de cupón");
  const cur = await content();
  const renamed = cur.categories.map((x) => (x.id === "promo" ? { ...x, id: "promociones" } : x));
  const r = await ed.put("/api/admin/content/categories", renamed);
  assert.equal(r.status, 409);
  assert.match(r.data.error.message, /^No puedes cambiar el id de «Promo» porque está en uso \(1 cupón: PROMO5\)\.$/);
  const del = await ed.put("/api/admin/content/categories", cur.categories.filter((x) => x.id !== "promo"));
  assert.match(del.data.error.message, /^No puedes eliminar «Promo»/);
  await admin.del(`/api/admin/coupons/${promo5.id}`);
  assert.equal((await admin.put("/api/admin/content/categories", cur.categories.filter((x) => x.id !== "promo"))).status, 200);
});

/* ---------- Normalizaciones ---------- */
test("normalizaciones: saludo de WhatsApp multilínea, unidad vacía en la guía y tarjeta sin líneas", async () => {
  const c = await content();
  const s = await admin.put("/api/admin/content/settings", { ...c.settings, whatsappGreeting: "Hola Mercy Studio 👋\nQuiero hacer un pedido" });
  assert.equal(s.status, 200, s.text);
  assert.equal(s.data.value.whatsappGreeting, "Hola Mercy Studio 👋\nQuiero hacer un pedido");
  const charts = c.sizeCharts.map((sc, i) => (i === 0 ? { ...sc, unit: "" } : i === 1 ? (({ unit, ...rest }) => rest)(sc) : sc));
  const g = await admin.put("/api/admin/content/sizeCharts", charts);
  assert.equal(g.status, 200, g.text);
  assert.equal(g.data.value[0].unit, "", "unidad vacía se respeta");
  assert.equal(g.data.value[1].unit, "cm", "sin la clave → cm");
  const t = await admin.post("/api/admin/products", product("sin-lineas", { name: "Camiseta Prueba", tile: { from: "#d8bea6", to: "#a76d4a", lines: [] } }));
  assert.equal(t.status, 201, t.text);
  assert.deepEqual(t.data.item.tile.lines, [], "no se congela el nombre en la tarjeta");
  const t2 = await admin.put("/api/admin/products/sin-lineas", { ...t.data.item, name: "Camiseta Renombrada" });
  assert.deepEqual(t2.data.item.tile.lines, []);
  await admin.del("/api/admin/products/sin-lineas");
  assert.equal((await admin.put("/api/admin/content/settings", c.settings)).status, 200);
  assert.equal((await admin.put("/api/admin/content/sizeCharts", c.sizeCharts)).status, 200);
});

/* ---------- Canje: cupo por IP y código ---------- */
test("redeem: máximo 5 canjes del MISMO código por IP y hora (otro código u otra IP siguen)", async () => {
  await admin.post("/api/admin/coupons", { code: "CUPOA", type: "percent", value: 10 });
  await admin.post("/api/admin/coupons", { code: "CUPOB", type: "percent", value: 10 });
  const ip = freshIp();
  const c = srv.client({ admin: false, ip });
  for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/public/coupons/redeem", { code: "cupoa" })).data.ok, true, `canje ${i}`);
  const r = await c.post("/api/public/coupons/redeem", { code: "CUPOA" });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, "rate_limited");
  assert.equal((await couponBy("CUPOA")).usesCount, 5, "el 6.º no suma");
  assert.equal((await c.post("/api/public/coupons/redeem", { code: "CUPOB" })).data.ok, true, "otro código tiene su cupo");
  assert.equal((await srv.client({ admin: false, ip: freshIp() }).post("/api/public/coupons/redeem", { code: "CUPOA" })).data.ok, true, "otra IP también");
  assert.equal((await c.post("/api/public/coupons/validate", { code: "CUPOA" })).data.ok, true, "validar no se ve afectado");
});

/* ---------- gzip en caché ---------- */
test("content.js, /api/public/content y /api/admin/content: gzip calculado una vez por versión y correcto", async () => {
  const gz = { headers: { "accept-encoding": "gzip" } };
  for (const [cl, path] of [[pub(), "/api/public/content.js"], [pub(), "/api/public/content"], [admin, "/api/admin/content"]]) {
    const plain = await cl.get(path);
    const a = await cl.get(path, gz);
    const b = await cl.get(path, gz);
    assert.equal(a.headers["content-encoding"], "gzip", path);
    assert.equal(gunzipSync(a.body).toString("utf8"), plain.text, path);
    assert.ok(a.body.equals(b.body), `${path}: mismo gzip (en caché)`);
    assert.equal(Number(a.headers["content-length"]), a.body.length);
  }
  const p1 = app().content.publicPayload();
  assert.equal(p1.gzJs(), p1.gzJs(), "la misma instancia de Buffer");
  // Un cambio de contenido genera otra versión (y otro gzip)
  const c = await content();
  assert.equal((await admin.put("/api/admin/content/texts", { ...c.texts, footerTagline: "Otra frase para el gzip" })).status, 200);
  const after2 = await pub().get("/api/public/content.js", gz);
  assert.match(gunzipSync(after2.body).toString("utf8"), /Otra frase para el gzip/);
  const ad = await admin.get("/api/admin/content", gz);
  assert.match(gunzipSync(ad.body).toString("utf8"), /Otra frase para el gzip/);
  assert.equal(ad.headers["cache-control"], "no-store");
  assert.equal((await admin.put("/api/admin/content/texts", c.texts)).status, 200);
});
const app = () => srv.app;
