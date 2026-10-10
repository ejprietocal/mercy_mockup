// Secciones del contenido: PUT válidos/ inválidos (422 con fields), concurrencia, integridad (in_use)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers.js";

let srv;
let admin;
const content = async () => (await admin.get("/api/admin/content")).data;
const put = (section, value, headers) => admin.put(`/api/admin/content/${section}`, value, { headers });

before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

test("GET /api/admin/content incluye meta.sections, borradores y couponCode", async () => {
  const c = await content();
  assert.equal(c.schemaVersion, 1);
  for (const s of ["settings", "home", "discountModal", "texts", "colors", "fits", "categories", "collections", "sizeCharts", "reviews"]) {
    assert.ok(c.meta.sections[s]?.updatedAt, `meta.sections.${s}`);
  }
  assert.equal(c.discountModal.couponCode, "MERCY15");
  assert.equal(c.products.length, 14);
});

test("cada sección acepta su valor actual y uno modificado; responde { section, value, meta }", async () => {
  const c = await content();
  const changes = {
    settings: { ...c.settings, brand: "Mercy Studio CO", whatsapp: "+57 300 123 4567", pageSize: 9 },
    home: { ...c.home, hero: { ...c.home.hero, title: "Lo que crees,\r\nahora lo *vistes*  ", media: { ...c.home.hero.media, src: "/uploads/2026/10/m-x-video.mp4" } } },
    discountModal: { ...c.discountModal, delayMs: 5000, autoOpen: false },
    texts: { ...c.texts, topStrip: ["Uno", "", "Dos"] },
    colors: [...c.colors, { id: "azul", name: "Azul", hex: "#2F2F63" }],
    fits: [...c.fits, { id: "slim", name: "Slim" }],
    categories: [...c.categories, { id: "medias", name: "Medias", details: ["Algodón"], sizeChart: "", inFooter: false }],
    collections: [...c.collections, { id: "gracia", name: "Gracia", description: "Nueva" }],
    sizeCharts: [...c.sizeCharts, { id: "medias", name: "Medias", head: ["Talla", "Largo"], unit: "cm", rows: { regular: [["Única", 20]] } }],
    reviews: [...c.reviews, { name: "Nueva Persona", city: "Pasto", stars: 4, quote: "Buenísima", text: "", visible: false }],
  };
  for (const [section, value] of Object.entries(changes)) {
    const r = await put(section, value);
    assert.equal(r.status, 200, `${section}: ${r.text}`);
    assert.equal(r.data.section, section);
    assert.ok(r.data.meta.sections[section].updatedAt);
    assert.equal(r.data.meta.sections[section].updatedBy, "Ana Admin");
  }
  const after2 = await content();
  assert.equal(after2.settings.whatsapp, "573001234567", "solo dígitos");
  assert.equal(after2.settings.pageSize, 9);
  assert.equal(after2.home.hero.title, "Lo que crees,\nahora lo *vistes*", "normaliza saltos y espacios");
  assert.deepEqual(after2.texts.topStrip, ["Uno", "Dos"], "descarta vacíos");
  assert.equal(after2.colors.at(-1).hex, "#2f2f63", "hex en minúsculas");
  assert.match(after2.reviews.at(-1).id, /^r-[a-z0-9]+$/, "id generado para reseñas nuevas");
  assert.equal(after2.discountModal.couponCode, "MERCY15");
  // Las claves desconocidas se descartan
  const extra = await put("texts", { ...after2.texts, hacker: "<script>", catalog: { ...after2.texts.catalog, x: 1 } });
  assert.equal(extra.status, 200);
  assert.equal(extra.data.value.hacker, undefined);
  assert.equal(extra.data.value.catalog.x, undefined);
});

test("datos inválidos → 422 con fields por ruta (en español)", async () => {
  const c = await content();
  const cases = [
    ["settings", { ...c.settings, whatsapp: "abc", pageSize: 100, giftMaxChars: 5, social: { ...c.settings.social, instagram: "javascript:alert(1)" } }, ["whatsapp", "pageSize", "giftMaxChars", "social.instagram"]],
    ["home", { ...c.home, hero: { ...c.home.hero, title: "", media: { ...c.home.hero.media, type: "gif", poster: "data:image/png;base64,AAA" } }, marquee: [{ icon: "bomba", text: "" }], bestSellers: { ...c.home.bestSellers, count: 0 } },
      ["hero.title", "hero.media.type", "hero.media.poster", "marquee.0.icon", "marquee.0.text", "bestSellers.count"]],
    ["home", { ...c.home, marquee: [] }, ["marquee"]],
    ["home", { ...c.home, hero: { ...c.home.hero, subtitle: "x".repeat(2001), ctaHref: "vbscript:x" } }, ["hero.subtitle", "hero.ctaHref"]],
    ["discountModal", { ...c.discountModal, delayMs: 999999, enabled: "sí", image: "javascript:void(0)" }, ["delayMs", "enabled", "image"]],
    ["texts", { ...c.texts, topStrip: [], searchSuggestions: Array.from({ length: 11 }, (_, i) => "s" + i) }, ["topStrip", "searchSuggestions"]],
    ["colors", [{ id: "Negro Mate", name: "", hex: "negro" }], ["0.id", "0.name", "0.hex"]],
    ["colors", [...c.colors, { id: "negro", name: "Negro 2", hex: "#000000" }], [`${c.colors.length}.id`]],
    ["categories", c.categories.map((x, i) => (i === 0 ? { ...x, sizeChart: "no-existe" } : x)), ["0.sizeChart"]],
    ["sizeCharts", [{ id: "x", name: "X", head: ["Talla", "Pecho"], unit: "cm", rows: { inventada: [["S", 1]], regular: [["S", 1, 2]] } }, ...c.sizeCharts], ["0.rows.inventada", "0.rows.regular.0"]],
    ["reviews", [{ id: "r1", name: "", stars: 9 }], ["0.name", "0.stars"]],
    ["home", "no soy un objeto", ["_"]],
  ];
  for (const [section, value, paths] of cases) {
    const r = await put(section, value);
    assert.equal(r.status, 422, `${section}: ${r.text}`);
    assert.equal(r.data.error.code, "validation");
    assert.equal(typeof r.data.error.message, "string");
    for (const p of paths) assert.ok(r.data.error.fields[p], `${section} → falta fields["${p}"] en ${JSON.stringify(r.data.error.fields)}`);
  }
  // Nada de lo anterior se guardó
  assert.deepEqual((await content()).settings, c.settings);
});

test("sección desconocida → 404; cuerpo demasiado grande → 413", async () => {
  assert.equal((await put("pagos", {})).status, 404);
  const big = await admin.request("PUT", "/api/admin/content/texts", { body: Buffer.alloc(2 * 1024 * 1024 + 10, 32), headers: { "content-type": "application/json" } });
  assert.equal(big.status, 413);
  assert.equal(big.data.error.code, "payload_too_large");
});

test("concurrencia: X-Base-Updated-At distinto → 409 conflict con la versión actual", async () => {
  const c = await content();
  const base = c.meta.sections.texts.updatedAt;
  const ok = await put("texts", { ...c.texts, footerTagline: "Primera" }, { "x-base-updated-at": base });
  assert.equal(ok.status, 200);
  const stale = await put("texts", { ...c.texts, footerTagline: "Segunda" }, { "x-base-updated-at": base });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, "conflict");
  assert.equal(stale.data.error.current.value.footerTagline, "Primera");
  const fresh = await put("texts", { ...c.texts, footerTagline: "Segunda" }, { "x-base-updated-at": ok.data.meta.sections.texts.updatedAt });
  assert.equal(fresh.status, 200);
});

test("guardar sin cambios no crea revisión", async () => {
  const before2 = (await admin.get("/api/admin/revisions")).data.items.length;
  const c = await content();
  const r = await put("home", c.home);
  assert.equal(r.status, 200);
  assert.equal((await admin.get("/api/admin/revisions")).data.items.length, before2);
});

test("integridad: borrar color/horma/categoría/colección/guía en uso → 409 in_use", async () => {
  const c = await content();
  const noNegro = await put("colors", c.colors.filter((x) => x.id !== "negro"));
  assert.equal(noNegro.status, 409);
  assert.equal(noNegro.data.error.code, "in_use");
  assert.match(noNegro.data.error.message, /«Negro»/);
  assert.ok(noNegro.data.error.usages.includes("products/fe"));
  assert.ok(noNegro.data.error.products.some((p) => p.id === "fe" && p.name === "Camiseta Fe"));

  const noCat = await put("categories", c.categories.filter((x) => x.id !== "hoodies"));
  assert.equal(noCat.status, 409);
  assert.ok(noCat.data.error.usages.includes("products/salmo-23"));

  const noCol = await put("collections", c.collections.filter((x) => x.id !== "salmos"));
  assert.equal(noCol.status, 409);
  const noFit = await put("fits", c.fits.filter((x) => x.id !== "boxy"));
  assert.equal(noFit.status, 409);
  const noChart = await put("sizeCharts", c.sizeCharts.filter((x) => x.id !== "hoodies"));
  assert.equal(noChart.status, 409);
  assert.ok(noChart.data.error.usages.includes("categories/hoodies"));

  // Lo que NO está en uso sí se puede borrar
  const free = await put("colors", c.colors.filter((x) => x.id !== "azul"));
  assert.equal(free.status, 200);
  // Una horma sin productos se borra y sus filas desaparecen de las guías (cascada)
  const noSlim = await put("fits", c.fits.filter((x) => x.id !== "slim"));
  assert.equal(noSlim.status, 200);
  const fresh = await content();
  assert.ok(fresh.sizeCharts.every((sc) => !("slim" in sc.rows)));
  const noReg = await put("sizeCharts", fresh.sizeCharts.filter((x) => x.id !== "medias"));
  assert.equal(noReg.status, 200);
});

test("categoría usada por un cupón → 409 in_use con coupons/<código>", async () => {
  const c = await content();
  const cat = await put("categories", [...c.categories, { id: "temporal", name: "Temporal", details: [], sizeChart: "", inFooter: false }]);
  assert.equal(cat.status, 200);
  const cp = await admin.post("/api/admin/coupons", { code: "SOLOTEMP", type: "percent", value: 5, appliesTo: "categories", categoryIds: ["temporal"] });
  assert.equal(cp.status, 201, cp.text);
  const r = await put("categories", c.categories);
  assert.equal(r.status, 409);
  assert.ok(r.data.error.usages.includes("coupons/SOLOTEMP"));
});
