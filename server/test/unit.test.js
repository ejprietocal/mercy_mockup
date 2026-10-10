// Pruebas unitarias: contenido de fábrica válido, URLs, firmas de archivos, diff, cupones, utilidades, db
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "../app.js";
import { loadFactoryDefaults } from "../lib/content.js";
import { isSafeUrl, refsFrom, validateContent, validateCoupon, validateProduct, validateSection } from "../lib/validate.js";
import { sniff, imageSize } from "../lib/media.js";
import { diffContent } from "../lib/diff.js";
import { couponLabel, couponStatus } from "../lib/coupons.js";
import { colombiaToday, formatCOP, formatDateTimeEs, slugify } from "../lib/util.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { Db } from "../lib/db.js";
import { RateLimiter } from "../lib/ratelimit.js";
import { makePng } from "./helpers.js";

test("el contenido de fábrica (js/defaults.js) pasa TODAS las validaciones sin errores ni cambios", () => {
  const { content, coupons } = loadFactoryDefaults(join(REPO_ROOT, "js", "defaults.js"));
  const { value, fields } = validateContent(content, { couponCodes: new Set(coupons.map((c) => c.code)) });
  assert.deepEqual(fields, {});
  for (const k of Object.keys(content)) {
    if (k === "meta") continue;
    assert.deepEqual(value[k], content[k], `la sección ${k} cambia al normalizarse`);
  }
  for (const c of coupons) assert.deepEqual(validateCoupon(c, refsFrom(value)).fields, {});
  // cada producto por separado y cada sección por separado
  const refs = refsFrom(value, coupons);
  for (const p of content.products) assert.deepEqual(validateProduct(p, refs).fields, {}, p.id);
  for (const s of ["settings", "home", "discountModal", "texts", "colors", "fits", "categories", "collections", "sizeCharts", "reviews"]) {
    assert.deepEqual(validateSection(s, content[s], refs).fields, {}, s);
  }
});

test("URLs seguras según §2", () => {
  for (const ok of ["https://x.co/a.jpg", "http://x.co", "/uploads/2026/10/a.webp", "/assets/logo/a.png", "assets/logo/a.png", "uploads/a.mp4"]) assert.ok(isSafeUrl(ok, "media"), ok);
  for (const ok of ["catalogo.html", "catalogo.html?cat=hoodies", "producto.html?id=fe", "index.html#x", "#comunidad", "/checkout.html"]) assert.ok(isSafeUrl(ok, "link"), ok);
  for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:image/png;base64,AA", "vbscript:x", "//malo.com/x", "/uploads/../users.json", "assets/../../etc", "ftp://x.co", "https://", "https://x.co/a b", "https://x.co/\"onerror=", "catalogo.html", "#x"]) {
    assert.ok(!isSafeUrl(bad, "media"), bad);
  }
  assert.ok(!isSafeUrl("assets/logo.png", "external"));
  assert.ok(isSafeUrl("https://instagram.com/mercy", "external"));
});

test("detección por firma de bytes", () => {
  const png = makePng(3, 5);
  assert.deepEqual(sniff(png), { kind: "image", mime: "image/png", ext: "png" });
  assert.deepEqual(imageSize(png, "image/png"), { width: 3, height: 5 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  assert.equal(sniff(jpeg).mime, "image/jpeg");
  assert.deepEqual(imageSize(jpeg, "image/jpeg"), { width: 600, height: 300 });
  const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([10, 0, 20, 0]), Buffer.alloc(10)]);
  assert.equal(sniff(gif).mime, "image/gif");
  assert.deepEqual(imageSize(gif, "image/gif"), { width: 10, height: 20 });
  const webp = Buffer.alloc(40);
  webp.write("RIFF", 0, "latin1"); webp.write("WEBP", 8, "latin1"); webp.write("VP8X", 12, "latin1");
  webp.writeUIntLE(99, 24, 3); webp.writeUIntLE(49, 27, 3);
  assert.equal(sniff(webp).mime, "image/webp");
  assert.deepEqual(imageSize(webp, "image/webp"), { width: 100, height: 50 });
  const ftyp = (major, compat = []) => {
    const b = Buffer.alloc(16 + compat.length * 4 + 16);
    b.writeUInt32BE(16 + compat.length * 4, 0); b.write("ftyp", 4, "latin1"); b.write(major, 8, "latin1");
    compat.forEach((c, i) => b.write(c, 16 + i * 4, "latin1"));
    return b;
  };
  assert.equal(sniff(ftyp("avif", ["mif1", "avif"])).mime, "image/avif");
  assert.equal(sniff(ftyp("mif1", ["avif"])).mime, "image/avif");
  assert.equal(sniff(ftyp("isom", ["isom", "mp41"])).mime, "video/mp4");
  assert.equal(sniff(ftyp("qt  ")).mime, "video/quicktime");
  assert.equal(sniff(ftyp("heic", ["mif1", "heic"])), null);
  assert.equal(sniff(ftyp("M4A ")), null);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("....B\x82\x84webm"), Buffer.alloc(20)]);
  assert.equal(sniff(webm).mime, "video/webm");
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniff(Buffer.from("<!doctype html><html></html>")), null);
  assert.equal(sniff(Buffer.from("%PDF-1.4 xxxxxxxxx")), null);
});

test("diff de contenido: rutas por id, listas simples y truncado", () => {
  const a = { meta: { x: 1 }, home: { hero: { title: "A" } }, products: [{ id: "fe", price: 1, colors: [{ color: "negro", stock: { S: 1 } }], updatedAt: "1" }], texts: { topStrip: ["a"] } };
  const b = { meta: { x: 2 }, home: { hero: { title: "B" } }, products: [{ id: "fe", price: 2, colors: [{ color: "negro", stock: { S: 3 } }], updatedAt: "2" }, { id: "nuevo", price: 5 }], texts: { topStrip: ["a", "b"] } };
  const { changes } = diffContent(a, b);
  assert.deepEqual(changes.map((c) => c.path), ["home.hero.title", "products[fe].price", "products[fe].colors[negro].stock.S", "products[nuevo]", "texts.topStrip"]);
  assert.deepEqual(changes.find((c) => c.path === "products[nuevo]"), { path: "products[nuevo]", before: null, after: { id: "nuevo", price: 5 } });
  const big = { list: Array.from({ length: 300 }, (_, i) => ({ v: i })) };
  const big2 = { list: Array.from({ length: 300 }, (_, i) => ({ v: i + 1 })) };
  const t = diffContent(big, big2, 150);
  assert.equal(t.changes.length, 150);
  assert.equal(t.truncated, true);
  const order = diffContent({ colors: [{ id: "a" }, { id: "b" }] }, { colors: [{ id: "b" }, { id: "a" }] });
  assert.deepEqual(order.changes, [{ path: "colors (orden)", before: ["a", "b"], after: ["b", "a"] }]);
});

test("cupones: vigencia (fechas inclusivas, Colombia) y etiqueta", () => {
  const base = { active: true, startsAt: null, endsAt: null, maxUses: null, usesCount: 0 };
  assert.equal(couponStatus(null), "not_found");
  assert.equal(couponStatus({ ...base, active: false }), "inactive");
  assert.equal(couponStatus({ ...base, startsAt: "2026-10-10" }, "2026-10-09"), "not_started");
  assert.equal(couponStatus({ ...base, startsAt: "2026-10-09" }, "2026-10-09"), null);
  assert.equal(couponStatus({ ...base, endsAt: "2026-10-09" }, "2026-10-09"), null);
  assert.equal(couponStatus({ ...base, endsAt: "2026-10-08" }, "2026-10-09"), "expired");
  assert.equal(couponStatus({ ...base, maxUses: 3, usesCount: 3 }), "exhausted");
  assert.equal(couponLabel({ type: "percent", value: 15 }), "15%");
  assert.equal(couponLabel({ type: "fixed", value: 20000 }), "$20.000");
  assert.equal(couponLabel({ type: "fixed", value: 1250000 }), "$1.250.000");
  // 2026-10-10 03:00 UTC = 2026-10-09 22:00 en Colombia
  assert.equal(colombiaToday(Date.parse("2026-10-10T03:00:00Z")), "2026-10-09");
  assert.equal(colombiaToday(Date.parse("2026-10-10T05:00:00Z")), "2026-10-10");
});

test("utilidades de formato", () => {
  assert.equal(formatCOP(89900), "$89.900");
  assert.equal(formatCOP(500), "$500");
  assert.equal(slugify("Foto Camiseta Fé (1)"), "foto-camiseta-fe-1");
  assert.equal(formatDateTimeEs("2026-10-09T20:45:00Z"), "9 de octubre de 2026, 3:45 p. m.");
  assert.equal(formatDateTimeEs("2026-01-01T05:05:00Z"), "1 de enero de 2026, 12:05 a. m.");
});

test("contraseñas scrypt: formato, verificación y rechazo de hashes alterados", async () => {
  const h = await hashPassword("Contraseña Segura 1");
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("Contraseña Segura 1", h), true);
  assert.equal(await verifyPassword("Contraseña Segura 2", h), false);
  assert.equal(await verifyPassword("x", "texto-cualquiera"), false);
  assert.equal(await verifyPassword("x", h.replace("$16384$", "$1048576$")), false, "N fuera de límites");
});

test("db: escrituras coalescidas, atómicas y en orden; tx serializada", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mercy-db-"));
  try {
    const db = new Db(dir);
    await db.init();
    await db.load("cosas", []);
    const writes = [];
    for (let i = 0; i < 50; i++) {
      db.get("cosas").push(i);
      writes.push(db.save("cosas"));
    }
    await Promise.all(writes);
    assert.equal(JSON.parse(await readFile(join(dir, "cosas.json"), "utf8")).length, 50);
    const order = [];
    await Promise.all([
      db.tx(async () => { await new Promise((r) => setTimeout(r, 30)); order.push(1); }),
      db.tx(async () => { order.push(2); }),
      db.tx(async () => { throw new Error("falla"); }).catch(() => order.push("x")),
      db.tx(async () => { order.push(3); }),
    ]);
    assert.deepEqual(order, [1, 2, "x", 3]);
    await db.flush();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("limitador: ventana deslizante y Retry-After", () => {
  const rl = new RateLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rl.hit("k", 3, 1000, t0 + i).ok, true);
  const no = rl.hit("k", 3, 1000, t0 + 10);
  assert.equal(no.ok, false);
  assert.equal(no.retryAfter, 1);
  assert.equal(rl.hit("k", 3, 1000, t0 + 1001).ok, true);
  rl.stop();
});
