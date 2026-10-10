// Etiquetas sociales (Open Graph / Twitter) en las páginas de la tienda, feed de catálogo para Meta y píxel de Meta
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.js";

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
