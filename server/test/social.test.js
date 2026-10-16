// Etiquetas sociales (Open Graph / Twitter) en las páginas de la tienda, feed de catálogo para Meta y píxel de Meta
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.js";
import { photosFor, productMainPhoto, productPhotos } from "../lib/social.js";

let srv;
let admin;
const anon = () => srv.client({ admin: false });
const PUBLIC = { "x-forwarded-proto": "https", "x-forwarded-host": "tienda.ejemplo.co" };
const meta = (html, key) => { const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html); return m ? m[1] : null; };

before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

test("inicio: título y descripción de SEO, Open Graph con URL e imagen absolutas, canónica, ETag y 304", async () => {
  const r = await anon().get("/", { headers: PUBLIC });
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /^text\/html/);
  assert.equal(r.headers["cache-control"], "no-cache");
  assert.match(r.text, /<title>Mercy Studio — Viste con propósito<\/title>/);
  assert.equal((r.text.match(/<title>/g) || []).length, 1, "un solo <title>");
  assert.equal(meta(r.text, "og:type"), "website");
  assert.equal(meta(r.text, "og:site_name"), "Mercy Studio");
  assert.equal(meta(r.text, "og:url"), "https://tienda.ejemplo.co/");
  assert.equal(meta(r.text, "og:title"), "Mercy Studio — Viste con propósito");
  assert.match(meta(r.text, "og:description"), /prendas con propósito/);
  assert.match(meta(r.text, "og:image"), /^https:\/\/images\.pexels\.com\//, "póster del hero");
  assert.equal(meta(r.text, "twitter:card"), "summary_large_image");
  assert.match(r.text, /<link rel="canonical" href="https:\/\/tienda\.ejemplo\.co\/">/);
  assert.equal(meta(r.text, "robots"), null);
  const again = await anon().get("/", { headers: { ...PUBLIC, "if-none-match": r.headers.etag } });
  assert.equal(again.status, 304);
  const head = await anon().head("/", { headers: PUBLIC });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
});

test("catálogo y pago: títulos del panel, descripción con {marca}, foto del primer producto; el pago no se indexa", async () => {
  const c = await anon().get("/catalogo.html", { headers: PUBLIC });
  assert.match(c.text, /<title>Catálogo — Mercy Studio<\/title>/);
  assert.equal(meta(c.text, "og:url"), "https://tienda.ejemplo.co/catalogo.html");
  assert.match(meta(c.text, "og:description"), /^Toda la colección de Mercy Studio/);
  assert.match(meta(c.text, "og:image"), /^https:\/\/images\.pexels\.com\//);
  const k = await anon().get("/checkout.html", { headers: PUBLIC });
  assert.match(k.text, /<title>Finalizar compra — Mercy Studio<\/title>/);
  assert.equal(meta(k.text, "robots"), "noindex");
  assert.match(meta(k.text, "og:description"), /Finaliza tu compra en Mercy Studio/);
  assert.match(meta(k.text, "og:image"), /^https:\/\/tienda\.ejemplo\.co\/assets\/logo\//, "sin foto propia → logo absoluto");
});

test("producto: og:type product, precio, disponibilidad y primera foto; id anterior; borrador e inexistente → noindex", async () => {
  const r = await anon().get("/producto.html?id=fe", { headers: PUBLIC });
  assert.match(r.text, /<title>Camiseta Fe — Mercy Studio<\/title>/);
  assert.equal(meta(r.text, "og:type"), "product");
  assert.equal(meta(r.text, "og:url"), "https://tienda.ejemplo.co/producto.html?id=fe");
  assert.equal(meta(r.text, "product:price:amount"), "79900");
  assert.equal(meta(r.text, "product:price:currency"), "COP");
  assert.equal(meta(r.text, "product:availability"), "in stock");
  assert.equal(meta(r.text, "product:retailer_item_id"), "fe");
  assert.match(meta(r.text, "og:image"), /^https:\/\/images\.pexels\.com\//);
  assert.equal(meta(r.text, "og:image:alt"), "Camiseta Fe");
  assert.match(meta(r.text, "description"), /Camiseta Fe — colección Renacer\. Ropa con propósito cristiano/);
  assert.equal((r.text.match(/<meta name="description"/g) || []).length, 1, "la descripción del archivo se reemplaza");
  // Agotada → out of stock
  const a = await anon().get("/producto.html?id=amen", { headers: PUBLIC });
  assert.equal(meta(a.text, "product:availability"), "out of stock");
  // Renombrar: el id anterior sigue sirviendo la ficha, con la URL canónica nueva
  const item = (await admin.get("/api/admin/products/fe")).data.item;
  assert.equal((await admin.put("/api/admin/products/fe", { ...item, id: "fe-nuevo" })).status, 200);
  const old = await anon().get("/producto.html?id=fe", { headers: PUBLIC });
  assert.equal(meta(old.text, "og:url"), "https://tienda.ejemplo.co/producto.html?id=fe-nuevo");
  // Borrador → como no encontrado (no se promociona)
  assert.equal((await admin.put("/api/admin/products/fe-nuevo", { ...item, id: "fe-nuevo", status: "draft" })).status, 200);
  const d = await anon().get("/producto.html?id=fe-nuevo", { headers: PUBLIC });
  assert.equal(d.status, 200);
  assert.equal(meta(d.text, "robots"), "noindex");
  assert.match(d.text, /<title>Prenda no encontrada — Mercy Studio<\/title>/);
  const n = await anon().get("/producto.html?id=no-existe", { headers: PUBLIC });
  assert.equal(meta(n.text, "robots"), "noindex");
  const sin = await anon().get("/producto.html", { headers: PUBLIC });
  assert.equal(meta(sin.text, "robots"), "noindex");
});

test("feed de catálogo para Meta (CSV): solo publicados, precio en COP, enlaces y fotos absolutos, agotados out of stock", async () => {
  const r = await anon().get("/api/public/feed-meta.csv", { headers: PUBLIC });
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /^text\/csv; charset=utf-8/);
  assert.equal(r.headers["cache-control"], "no-cache");
  assert.equal(r.headers["x-robots-tag"], "noindex, nofollow");
  const lines = r.text.trim().split("\n");
  assert.equal(lines[0], "id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,product_type");
  const gracia = lines.find((l) => l.startsWith('"gracia",'));
  assert.ok(gracia, "Camiseta Gracia en el feed");
  assert.match(gracia, /"Camiseta Gracia"/);
  assert.match(gracia, /"in stock","new","89900\.00 COP","https:\/\/tienda\.ejemplo\.co\/producto\.html\?id=gracia","https:\/\/images\.pexels\.com\/[^"]+"/);
  assert.match(gracia, /"Mercy Studio","Camisetas"$/);
  const amen = lines.find((l) => l.startsWith('"amen",'));
  assert.match(amen, /"out of stock"/);
  assert.ok(!lines.some((l) => l.startsWith('"fe-nuevo",')), "los borradores no salen");
  assert.equal(lines.length - 1, (await anon().get("/api/public/content")).data.products.length, "una fila por producto publicado");
});

test("píxel de Meta: vacío por defecto, solo dígitos, llega al contenido público; la CSP de la tienda permite su script", async () => {
  const st = (await admin.get("/api/admin/content")).data.settings;
  assert.equal(st.metaPixelId, "");
  const bad = await admin.put("/api/admin/content/settings", { ...st, metaPixelId: "abc" });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.metaPixelId);
  const ok = await admin.put("/api/admin/content/settings", { ...st, metaPixelId: " 123456789012345 " });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.value.metaPixelId, "123456789012345");
  const pub = await anon().get("/api/public/content");
  assert.equal(pub.data.settings.metaPixelId, "123456789012345");
  const page = await anon().get("/");
  const csp = page.headers["content-security-policy"];
  assert.match(csp, /script-src 'self' https:\/\/connect\.facebook\.net(;|$)/);
  assert.match(csp, /connect-src 'self' https:\/\/www\.facebook\.com https:\/\/connect\.facebook\.net(;|$)/);
});

test("PUBLIC_URL manda sobre el host de la petición", async () => {
  const s2 = await startServer({ publicUrl: "https://mercystudio.co/" });
  try {
    const r = await s2.client({ admin: false }).get("/catalogo.html");
    assert.equal(meta(r.text, "og:url"), "https://mercystudio.co/catalogo.html");
    assert.match(meta(r.text, "og:image"), /^https:\/\//);
    const feed = await s2.client({ admin: false }).get("/api/public/feed-meta.csv");
    assert.match(feed.text, /"https:\/\/mercystudio\.co\/producto\.html\?id=gracia"/);
  } finally { await s2.stop(); }
});

/* ---------- Foto principal (misma regla que la tarjeta de la tienda) y fotos por estampado ---------- */
const ph = (name) => ({ src: `/uploads/2026/10/m-${name}.webp`, thumb: "", alt: "", zoom: null, ox: null, oy: null });
const abs = (name) => `https://tienda.ejemplo.co/uploads/2026/10/m-${name}.webp`;
const product = (id, colors, prints = []) => ({
  id, name: `Prenda ${id}`, status: "published", category: "camisetas", sizes: ["S", "M"], price: 50000,
  colors, prints, tile: { from: "#d8bea6", to: "#a76d4a", lines: ["X"] },
});
/** Campos de una fila del CSV (todos van entre comillas). */
const csvRow = (line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
const NARANJA = { id: "naranja", name: "Naranja", hex: "#e8620a" };
const AZUL = { id: "azul", name: "Azul noche", hex: "#2f2f63" };
const ROSA = { id: "rosa", name: "Rosa", hex: "#e85a9a" };

test("og:image = foto principal: color inicial (el primero con stock) + estampado inicial; si no, sus fotos de color", async () => {
  // negro (sin stock) tiene fotos, pero el color inicial de la ficha es crema (primero con stock)
  const a = product("principal-color", [
    { color: "negro", photos: [ph("negro-1")], stock: { S: 0, M: 0 } },
    { color: "crema", photos: [ph("crema-1"), ph("crema-2")], stock: { S: 0, M: 2 } },
  ]);
  assert.equal((await admin.post("/api/admin/products", a)).status, 201);
  let r = await anon().get("/producto.html?id=principal-color", { headers: PUBLIC });
  assert.equal(meta(r.text, "og:image"), abs("crema-1"));
  assert.equal(meta(r.text, "twitter:image"), abs("crema-1"));

  // Con estampados: la combinación crema + naranja (estampado inicial) manda sobre las fotos del color
  const b = product("principal-estampado", [
    { color: "negro", photos: [ph("negro-1")], printPhotos: { naranja: [ph("negro-naranja")] }, stock: { S: 0, M: 0 } },
    { color: "crema", photos: [ph("crema-1")], printPhotos: { azul: [ph("crema-azul")], naranja: [ph("crema-naranja")] }, stock: { S: 1, M: 0 } },
  ], [NARANJA, AZUL]);
  assert.equal((await admin.post("/api/admin/products", b)).status, 201);
  r = await anon().get("/producto.html?id=principal-estampado", { headers: PUBLIC });
  assert.equal(meta(r.text, "og:image"), abs("crema-naranja"));

  // El color inicial sin fotos de ese estampado ni propias → las del estampado inicial en el primer color que las tenga
  const c = product("principal-otro-color", [
    { color: "negro", photos: [ph("negro-1")], printPhotos: { naranja: [ph("negro-naranja")] }, stock: { S: 0, M: 0 } },
    { color: "crema", photos: [], printPhotos: { azul: [ph("crema-azul")] }, stock: { S: 1, M: 0 } },
  ], [NARANJA, AZUL]);
  assert.equal((await admin.post("/api/admin/products", c)).status, 201);
  r = await anon().get("/producto.html?id=principal-otro-color", { headers: PUBLIC });
  assert.equal(meta(r.text, "og:image"), abs("negro-naranja"));
});

test("og:image con SOLO fotos de estampado (ni del color ni del estampado inicial): primera combinación con fotos", async () => {
  // Estampado inicial = naranja, sin fotos en ningún color; ningún color tiene fotos base →
  // se recorre color por color (orden del producto) y, en cada uno, estampado por estampado
  const p = product("solo-estampado", [
    { color: "negro", photos: [], printPhotos: { azul: [ph("negro-azul")] }, stock: { S: 0, M: 0 } },
    { color: "crema", photos: [], printPhotos: { azul: [ph("crema-azul")] }, stock: { S: 3, M: 0 } },
  ], [NARANJA, AZUL]);
  assert.equal((await admin.post("/api/admin/products", p)).status, 201);
  const r = await anon().get("/producto.html?id=solo-estampado", { headers: PUBLIC });
  assert.equal(meta(r.text, "og:image"), abs("negro-azul"));
  // Orden del recorrido: primero el color (negro solo tiene rosa, el último estampado) y no el estampado
  // (recorriendo estampado por estampado saldría crema-azul): así coincide con la tarjeta de la tienda
  const o = product("solo-estampado-orden", [
    { color: "negro", photos: [], printPhotos: { rosa: [ph("negro-rosa")] }, stock: { S: 0, M: 0 } },
    { color: "crema", photos: [], printPhotos: { azul: [ph("crema-azul")] }, stock: { S: 1, M: 0 } },
  ], [NARANJA, AZUL, ROSA]);
  assert.equal((await admin.post("/api/admin/products", o)).status, 201);
  const ro = await anon().get("/producto.html?id=solo-estampado-orden", { headers: PUBLIC });
  assert.equal(meta(ro.text, "og:image"), abs("negro-rosa"));
  // Sin ninguna foto → logo
  const none = product("sin-fotos", [{ color: "negro", photos: [], stock: { S: 1 } }], [NARANJA]);
  assert.equal((await admin.post("/api/admin/products", none)).status, 201);
  const n = await anon().get("/producto.html?id=sin-fotos", { headers: PUBLIC });
  assert.match(meta(n.text, "og:image"), /^https:\/\/tienda\.ejemplo\.co\/assets\/logo\//);
});

test("feed de Meta: image_link = foto principal; additional_image_link = resto sin repetir (color base y luego estampados), máx. 10", async () => {
  const p = product("feed-estampado", [
    { color: "negro", photos: [ph("negro-1"), ph("negro-2")], printPhotos: { azul: [ph("negro-azul")], naranja: [ph("negro-naranja"), ph("negro-1")] }, stock: { S: 0, M: 0 } },
    { color: "crema", photos: [ph("crema-1")], printPhotos: { naranja: [ph("crema-naranja")] }, stock: { S: 2, M: 0 } },
  ], [NARANJA, AZUL]);
  assert.equal((await admin.post("/api/admin/products", p)).status, 201);
  const r = await anon().get("/api/public/feed-meta.csv", { headers: PUBLIC });
  const header = r.text.split("\n")[0].split(",");
  const row = csvRow(r.text.split("\n").find((l) => l.startsWith('"feed-estampado",')));
  const col = (k) => row[header.indexOf(k)];
  assert.equal(col("image_link"), abs("crema-naranja"), "crema = color inicial, naranja = estampado inicial");
  assert.deepEqual(col("additional_image_link").split(","), [
    abs("negro-1"), abs("negro-2"), abs("negro-naranja"), abs("negro-azul"), abs("crema-1"),
  ], "por color: base y luego estampados en orden de prints; sin repetir");

  // Recorte: como siempre, 10 adicionales
  const many = product("feed-muchas", [
    { color: "negro", photos: Array.from({ length: 10 }, (_, i) => ph(`b${i}`)), printPhotos: { naranja: Array.from({ length: 10 }, (_, i) => ph(`n${i}`)) }, stock: { S: 1, M: 0 } },
  ], [NARANJA]);
  assert.equal((await admin.post("/api/admin/products", many)).status, 201);
  const r2 = await anon().get("/api/public/feed-meta.csv", { headers: PUBLIC });
  const row2 = csvRow(r2.text.split("\n").find((l) => l.startsWith('"feed-muchas",')));
  assert.equal(row2[header.indexOf("image_link")], abs("n0"));
  const extra = row2[header.indexOf("additional_image_link")].split(",");
  assert.equal(extra.length, 10);
  assert.deepEqual(extra.slice(0, 3), [abs("b0"), abs("b1"), abs("b2")]);
});

test("regla de fotos (photosFor): combinación → color → estampado en otro color → primer color con fotos → []", () => {
  const p = {
    sizes: ["S"],
    prints: [NARANJA, AZUL],
    colors: [
      { color: "negro", photos: [ph("negro-1")], printPhotos: { azul: [ph("negro-azul")] }, stock: { S: 0 } },
      { color: "crema", photos: [], printPhotos: { naranja: [ph("crema-naranja")], fantasma: [ph("crema-fantasma")] }, stock: { S: 1 } },
      { color: "verde", photos: [], stock: { S: 1 } },
    ],
  };
  const srcs = (list) => list.map((x) => x.src.replace(/^\/uploads\/2026\/10\/m-|\.webp$/g, ""));
  assert.deepEqual(srcs(photosFor(p, "crema")), ["crema-naranja"], "sin estampado = el inicial (naranja)");
  assert.deepEqual(srcs(photosFor(p, "crema", "naranja")), ["crema-naranja"]);
  assert.deepEqual(srcs(photosFor(p, "negro", "naranja")), ["negro-1"], "el color base antes que el estampado de otro color");
  assert.deepEqual(srcs(photosFor(p, "verde", "azul")), ["negro-azul"], "estampado en el primer color que lo tenga");
  assert.deepEqual(srcs(photosFor(p, "verde", "")), ["negro-1"], "\"\" = sin estampado → primer color con fotos");
  assert.deepEqual(srcs(photosFor(p, "crema", "fantasma")), ["negro-1"], "un estampado que no existe en el producto no cuenta");
  assert.deepEqual(srcs([productMainPhoto(p)]), ["crema-naranja"]);
  assert.deepEqual(srcs(productPhotos(p).map((src) => ({ src }))), ["crema-naranja", "negro-1", "negro-azul"]);
  // Respaldo de la foto principal: colores en orden y, en cada uno, estampados en orden (no al revés)
  const r = {
    sizes: ["S"],
    prints: [NARANJA, AZUL, ROSA],
    colors: [
      { color: "negro", photos: [], printPhotos: { rosa: [ph("negro-rosa")] }, stock: { S: 0 } },
      { color: "crema", photos: [], printPhotos: { azul: [ph("crema-azul")] }, stock: { S: 1 } },
    ],
  };
  assert.deepEqual(srcs([productMainPhoto(r)]), ["negro-rosa"], "color por color; recorriendo primero por estampado saldría crema-azul");
  // Sin estampados: la regla de siempre (color o el primero con fotos)
  const q = { sizes: ["S"], colors: [{ color: "negro", photos: [], stock: { S: 1 } }, { color: "crema", photos: [ph("crema-1")], stock: { S: 0 } }] };
  assert.deepEqual(srcs(photosFor(q, "negro")), ["crema-1"]);
  assert.deepEqual(photosFor({ colors: [{ color: "negro", photos: [] }] }, "negro"), []);
  assert.equal(productMainPhoto({ colors: [] }), null);
});
