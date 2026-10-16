// Productos: CRUD, validación (colores/fotos/stock/referencias), fotos por estampado, renombrar, duplicar, conflictos
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

const photo = (n) => ({ src: `https://images.pexels.com/photos/${n}/pexels-photo-${n}.jpeg`, thumb: "", alt: `Foto ${n}`, zoom: null, ox: null, oy: null });
const baseProduct = () => ({
  id: "camiseta-prueba",
  ref: "PRU-001",
  name: "Camiseta Prueba",
  status: "published",
  category: "camisetas",
  collection: "renacer",
  fits: ["regular", "oversize"],
  sizes: ["S", "M", "L"],
  price: 89900,
  badge: "Nuevo",
  envioGratis: true,
  soldOut: false,
  bestRank: 20,
  newRank: 1,
  rating: 4.8,
  reviewsCount: 3,
  colors: [
    { color: "negro", photos: [photo(1), photo(2), photo(3), photo(4)], stock: { S: 1, M: 2, L: 3 } },
    { color: "crema", photos: [{ src: "/uploads/2026/10/m-abc-foto.webp", thumb: "/uploads/2026/10/m-abc-thumb.webp", alt: "", zoom: 1.5, ox: "50%", oy: "40%" }], stock: { S: 0, M: "4", XL: 9 } },
  ],
  prints: [{ id: "naranja", name: "Naranja", hex: "#E8620A" }],
  video: { src: "/uploads/2026/10/m-v-video.mp4", poster: "" },
  tile: { from: "#d8bea6", to: "#a76d4a", lines: ["PRUEBA"], sub: "", stacked: false, small: false, fs: null },
  tags: ["prueba"],
  desc: "Descripción",
  story: "Historia",
  details: [],
  care: [],
  createdAt: "1999-01-01T00:00:00.000Z",
  hackeado: true,
});

test("crear producto: 201, normaliza stock y descarta claves desconocidas", async () => {
  const r = await admin.post("/api/admin/products", baseProduct());
  assert.equal(r.status, 201, r.text);
  const p = r.data.item;
  assert.equal(p.id, "camiseta-prueba");
  assert.equal(p.hackeado, undefined);
  assert.notEqual(p.createdAt, "1999-01-01T00:00:00.000Z", "createdAt lo pone el servidor");
  assert.equal(p.updatedBy, "Ana Admin");
  assert.deepEqual(p.colors[1].stock, { S: 0, M: 4, L: 0 }, "faltantes = 0, sobrantes fuera, números");
  assert.equal(p.prints[0].hex, "#e8620a");
  assert.equal(p.colors[0].photos.length, 4);
  const one = await admin.get("/api/admin/products/camiseta-prueba");
  assert.equal(one.status, 200);
  assert.deepEqual(one.data.item, p);
  assert.ok((await admin.get("/api/admin/products")).data.items.some((x) => x.id === p.id));
  // También en el contenido público (está publicado)
  const pub = await srv.client({ admin: false }).get("/api/public/content");
  assert.ok(pub.data.products.some((x) => x.id === "camiseta-prueba"));
});

test("id duplicado → 409 conflict con fields.id", async () => {
  const r = await admin.post("/api/admin/products", { ...baseProduct(), id: "fe" });
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, "conflict");
  assert.ok(r.data.error.fields.id);
});

test("validación: máximo 10 fotos por color, referencias, tallas, precio, URLs", async () => {
  const p = baseProduct();
  p.id = "otro-producto";
  for (let n = 5; n <= 11; n++) p.colors[0].photos.push(photo(n));   // 11 fotos
  p.colors.push({ color: "fucsia", photos: [], stock: {} });
  p.colors.push({ color: "negro", photos: [], stock: {} });
  p.category = "pantalones";
  p.collection = "no-existe";
  p.fits = ["regular", "skinny"];
  p.sizes = ["S", "S", ""];
  p.price = -5;
  p.colors[1].photos[0].src = "javascript:alert(1)";
  p.colors[1].photos[0].ox = "150%";
  p.video = { src: "data:video/mp4;base64,AAAA" };
  p.tile.from = "rojo";
  const r = await admin.post("/api/admin/products", p);
  assert.equal(r.status, 422);
  const f = r.data.error.fields;
  assert.equal(f["colors.0.photos"], "Máximo 10 fotos por color.");
  for (const k of ["colors.2.color", "colors.3.color", "category", "collection", "fits.1", "sizes.1", "sizes.2", "price", "colors.1.photos.0.src", "colors.1.photos.0.ox", "video.src", "tile.from"]) {
    assert.ok(f[k], `falta fields["${k}"] en ${JSON.stringify(f)}`);
  }
  const empty = await admin.post("/api/admin/products", { id: "vacio", name: "Vacío", category: "camisetas", sizes: ["S"], colors: [] });
  assert.equal(empty.status, 422);
  assert.ok(empty.data.error.fields.colors);
  const badId = await admin.post("/api/admin/products", { ...baseProduct(), id: "Con Espacios" });
  assert.ok(badId.data.error.fields.id);
});

test("hasta 10 fotos por color se aceptan (todas, en orden)", async () => {
  const p = { ...baseProduct(), id: "diez-fotos" };
  p.colors[0].photos = Array.from({ length: 10 }, (_, i) => photo(100 + i));
  const r = await admin.post("/api/admin/products", p);
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(r.data.item.colors[0].photos.map((x) => x.alt), Array.from({ length: 10 }, (_, i) => `Foto ${100 + i}`));
  assert.equal((await admin.del("/api/admin/products/diez-fotos")).status, 200);
});

/* ---------- Fotos por combinación color + estampado (colors[].printPhotos) ---------- */
const printed = () => ({
  ...baseProduct(),
  id: "estampada",
  name: "Camiseta Estampada",
  prints: [{ id: "naranja", name: "Naranja", hex: "#e8620a" }, { id: "azul", name: "Azul noche", hex: "#2f2f63" }],
  colors: [
    {
      color: "negro",
      photos: [photo(1)],
      // Claves en otro orden que los estampados, una de un estampado que no existe y una lista vacía
      printPhotos: { azul: [photo(21)], fantasma: [photo(29)], naranja: [photo(22), { src: "/uploads/2026/10/m-n-naranja.webp" }] },
      stock: { S: 1, M: 2, L: 3 },
    },
    { color: "crema", photos: [photo(2)], printPhotos: { naranja: [], fantasma: "no es una lista" }, stock: { S: 1 } },
    { color: "terracota", photos: [], printPhotos: null, stock: {} },
  ],
});

test("fotos por estampado: se guardan y devuelven; orden de los estampados; claves inexistentes y listas vacías fuera", async () => {
  const r = await admin.post("/api/admin/products", printed());
  assert.equal(r.status, 201, r.text);
  const [negro, crema, terracota] = r.data.item.colors;
  assert.deepEqual(Object.keys(negro), ["color", "photos", "printPhotos", "stock"]);
  assert.deepEqual(Object.keys(negro.printPhotos), ["naranja", "azul"], "orden = orden de prints; «fantasma» se descarta");
  assert.deepEqual(negro.printPhotos.azul, [photo(21)]);
  // vPhoto normaliza cada foto (campos faltantes con su valor por defecto)
  assert.deepEqual(negro.printPhotos.naranja[1], { src: "/uploads/2026/10/m-n-naranja.webp", thumb: "", alt: "", zoom: null, ox: null, oy: null });
  // Sin ninguna lista con fotos la clave NO aparece (misma forma que un producto sin fotos de estampado)
  assert.deepEqual(Object.keys(crema), ["color", "photos", "stock"]);
  assert.deepEqual(Object.keys(terracota), ["color", "photos", "stock"]);
  assert.deepEqual((await admin.get("/api/admin/products/estampada")).data.item, r.data.item);
  const pub = (await srv.client({ admin: false }).get("/api/public/content")).data.products.find((x) => x.id === "estampada");
  assert.deepEqual(pub.colors[0].printPhotos, negro.printPhotos, "llegan a la tienda");
  // Guardar lo mismo otra vez no cambia nada (sin revisión nueva)
  const same = await admin.put("/api/admin/products/estampada", r.data.item);
  assert.equal(same.status, 200);
  assert.equal(same.data.item.updatedAt, r.data.item.updatedAt);
});

test("fotos por estampado: máximo 10, objeto obligatorio, cada foto se valida", async () => {
  const many = printed();
  many.id = "estampada-2";
  many.colors[0].printPhotos.naranja = Array.from({ length: 11 }, (_, i) => photo(200 + i));
  let r = await admin.post("/api/admin/products", many);
  assert.equal(r.status, 422);
  assert.equal(r.data.error.fields["colors.0.printPhotos.naranja"], "Máximo 10 fotos por estampado.");
  many.colors[0].printPhotos.naranja = Array.from({ length: 10 }, (_, i) => photo(200 + i));
  r = await admin.post("/api/admin/products", many);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.data.item.colors[0].printPhotos.naranja.length, 10);
  assert.equal((await admin.del("/api/admin/products/estampada-2")).status, 200);

  for (const bad of [[photo(1)], "naranja", 5, true]) {
    const p = printed();
    p.id = "estampada-3";
    p.colors[1].printPhotos = bad;
    const e = await admin.post("/api/admin/products", p);
    assert.equal(e.status, 422, JSON.stringify(bad));
    assert.equal(e.data.error.fields["colors.1.printPhotos"], "Formato inválido (se esperaba un objeto).");
  }
  const p = printed();
  p.id = "estampada-3";
  p.colors[0].printPhotos.naranja[0] = { src: "javascript:alert(1)", ox: "150%", zoom: 9 };
  p.colors[0].printPhotos.azul = "no es una lista";
  const e = await admin.post("/api/admin/products", p);
  assert.equal(e.status, 422);
  const f = e.data.error.fields;
  for (const k of ["colors.0.printPhotos.naranja.0.src", "colors.0.printPhotos.naranja.0.ox", "colors.0.printPhotos.naranja.0.zoom", "colors.0.printPhotos.azul"]) {
    assert.ok(f[k], `falta fields["${k}"] en ${JSON.stringify(f)}`);
  }
  assert.ok(!Object.keys(f).some((k) => k.includes("fantasma")), "las claves de estampados inexistentes no se validan");
});

test("fotos por estampado: renombrar o quitar un estampado descarta sus fotos", async () => {
  const cur = (await admin.get("/api/admin/products/estampada")).data.item;
  // «naranja» pasa a llamarse «mandarina» (id nuevo) sin mover las fotos → las de «naranja» se descartan
  const renamed = structuredClone(cur);
  renamed.prints[0] = { id: "mandarina", name: "Mandarina", hex: "#e8620a" };
  let r = await admin.put("/api/admin/products/estampada", renamed);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.data.item.colors[0].printPhotos), ["azul"]);
  // Quitar «azul»: el color se queda sin fotos de estampado → la clave desaparece
  const removed = structuredClone(r.data.item);
  removed.prints = removed.prints.filter((x) => x.id !== "azul");
  r = await admin.put("/api/admin/products/estampada", removed);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.data.item.colors[0]), ["color", "photos", "stock"]);
  // Sin estampados, cualquier printPhotos se descarta
  r = await admin.put("/api/admin/products/estampada", { ...r.data.item, prints: [], colors: r.data.item.colors.map((c) => ({ ...c, printPhotos: { mandarina: [photo(3)] } })) });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.data.item.colors.every((c) => !("printPhotos" in c)));
  assert.equal((await admin.del("/api/admin/products/estampada")).status, 200);
});

test("actualizar: concurrencia con X-Base-Updated-At (409) y sin cambios no crea revisión", async () => {
  const cur = (await admin.get("/api/admin/products/camiseta-prueba")).data.item;
  const r = await admin.put("/api/admin/products/camiseta-prueba", { ...cur, price: 99900 }, { headers: { "x-base-updated-at": cur.updatedAt } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.item.price, 99900);
  assert.notEqual(r.data.item.updatedAt, cur.updatedAt);
  assert.equal(r.data.item.createdAt, cur.createdAt);
  const stale = await admin.put("/api/admin/products/camiseta-prueba", { ...cur, price: 1 }, { headers: { "x-base-updated-at": cur.updatedAt } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, "conflict");
  assert.equal(stale.data.error.current.price, 99900);
  const revs = (await admin.get("/api/admin/revisions")).data.items.length;
  const same = await admin.put("/api/admin/products/camiseta-prueba", r.data.item);
  assert.equal(same.status, 200);
  assert.equal(same.data.item.updatedAt, r.data.item.updatedAt);
  assert.equal((await admin.get("/api/admin/revisions")).data.items.length, revs);
  assert.equal((await admin.put("/api/admin/products/no-existe", baseProduct())).status, 404);
});

test("renombrar id (body.id ≠ :id): valida unicidad y actualiza cupones que lo usan", async () => {
  const cp = await admin.post("/api/admin/coupons", { code: "SOLOPRUEBA", type: "percent", value: 10, appliesTo: "products", productIds: ["camiseta-prueba"] });
  assert.equal(cp.status, 201, cp.text);
  const cur = (await admin.get("/api/admin/products/camiseta-prueba")).data.item;
  const clash = await admin.put("/api/admin/products/camiseta-prueba", { ...cur, id: "fe" });
  assert.equal(clash.status, 409);
  const r = await admin.put("/api/admin/products/camiseta-prueba", { ...cur, id: "camiseta-renombrada" });
  assert.equal(r.status, 200);
  assert.equal(r.data.item.id, "camiseta-renombrada");
  assert.equal((await admin.get("/api/admin/products/camiseta-prueba")).status, 404);
  assert.equal((await admin.get("/api/admin/products/camiseta-renombrada")).status, 200);
  const coupon = (await admin.get(`/api/admin/coupons/${cp.data.item.id}`)).data.item;
  assert.deepEqual(coupon.productIds, ["camiseta-renombrada"]);
  const act = await admin.get("/api/admin/activity?entity=product&limit=1");
  assert.match(act.data.items[0].label, /id «camiseta-prueba» → «camiseta-renombrada»/);
});

test("duplicar: copia en borrador con id -copia[-n] y nombre «(copia)»", async () => {
  const a = await admin.post("/api/admin/products/fe/duplicate");
  assert.equal(a.status, 201);
  assert.equal(a.data.item.id, "fe-copia");
  assert.equal(a.data.item.name, "Camiseta Fe (copia)");
  assert.equal(a.data.item.status, "draft");
  const b = await admin.post("/api/admin/products/fe/duplicate");
  assert.equal(b.data.item.id, "fe-copia-2");
  const list = (await admin.get("/api/admin/products")).data.items.map((p) => p.id);
  assert.equal(list[list.indexOf("fe") + 1], "fe-copia-2", "la copia queda justo después del original");
  // Los borradores no salen al público
  const pub = (await srv.client({ admin: false }).get("/api/public/content")).data.products.map((p) => p.id);
  assert.ok(!pub.includes("fe-copia"));
  assert.equal((await admin.post("/api/admin/products/no-existe/duplicate")).status, 404);
});

test("eliminar: 200 y desaparece; quita el id de los cupones (el que se queda sin productos se desactiva)", async () => {
  const r = await admin.del("/api/admin/products/camiseta-renombrada");
  assert.equal(r.status, 200);
  // SOLOPRUEBA solo tenía este producto: queda inactivo (si no, seguiría «vigente» sin aplicar nunca)
  assert.deepEqual(r.data, { ok: true, couponsDeactivated: ["SOLOPRUEBA"] });
  assert.equal((await admin.get("/api/admin/products/camiseta-renombrada")).status, 404);
  const coupons = (await admin.get("/api/admin/coupons")).data.items;
  assert.ok(coupons.every((c) => !c.productIds.includes("camiseta-renombrada")));
  const solo = coupons.find((c) => c.code === "SOLOPRUEBA");
  assert.equal(solo.active, false);
  assert.deepEqual(solo.productIds, []);
  // y se puede seguir guardando (p. ej. otra descripción) sin elegir productos mientras siga inactivo
  const put = await admin.put(`/api/admin/coupons/${solo.id}`, { ...solo, description: "sin productos" });
  assert.equal(put.status, 200, put.text);
  const act = (await admin.get("/api/admin/activity?entity=coupon&limit=5")).data.items;
  assert.ok(act.some((a) => /Cupón «SOLOPRUEBA» desactivado: se quedó sin productos \(ya no existe «Camiseta Prueba»\)/.test(a.label)), JSON.stringify(act.map((a) => a.label)));
  // activarlo exige elegir al menos un producto
  const on = await admin.put(`/api/admin/coupons/${solo.id}`, { ...solo, active: true });
  assert.equal(on.status, 422);
  assert.ok(on.data.error.fields.productIds);
  assert.equal((await admin.del("/api/admin/products/camiseta-renombrada")).status, 404);
});

test("cada cambio de producto deja revisión y actividad", async () => {
  const revs = (await admin.get("/api/admin/revisions")).data.items.map((r) => r.summary);
  assert.ok(revs.includes("Producto «Camiseta Prueba» creado"));
  assert.ok(revs.includes("Producto «Camiseta Renombrada» eliminado") || revs.some((s) => /Producto «Camiseta Prueba» eliminado/.test(s)));
  assert.ok(revs.some((s) => s.startsWith("Producto «Camiseta Fe (copia)» creado")));
  const act = (await admin.get("/api/admin/activity?entity=product")).data.items;
  assert.ok(act.some((e) => e.action === "delete" && e.entityId === "camiseta-renombrada"));
});
