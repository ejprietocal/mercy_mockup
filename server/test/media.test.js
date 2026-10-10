// Medios: subir PNG real, rechazar SVG/HTML disfrazado, miniatura, usos (409 in_use), force, /uploads con Range
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { startServer, makePng, makeMp4 } from "./helpers.js";

let srv;
let admin;
before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv.stop());

const upload = (body, type, name, extra = {}) => admin.request("POST", "/api/admin/media", {
  body,
  headers: { "content-type": type, "x-file-name": encodeURIComponent(name), ...extra },
});
const fileOf = (url) => join(srv.dataDir, "uploads", ...url.slice("/uploads/".length).split("/"));
let png;

test("subir un PNG real: 201, firma, dimensiones, ruta AAAA/MM/<id>-<slug>.png", async () => {
  const r = await upload(makePng(40, 30), "image/png", "Foto Camiseta Fé (1).PNG");
  assert.equal(r.status, 201, r.text);
  png = r.data.item;
  assert.equal(png.kind, "image");
  assert.equal(png.mime, "image/png");
  assert.equal(png.width, 40);
  assert.equal(png.height, 30);
  assert.equal(png.name, "Foto Camiseta Fé (1).PNG");
  assert.equal(png.alt, "");
  assert.equal(png.thumbUrl, "");
  assert.equal(png.createdBy, "Ana Admin");
  assert.match(png.url, /^\/uploads\/\d{4}\/\d{2}\/m-[a-z0-9]+-foto-camiseta-fe-1\.png$/);
  assert.equal((await stat(fileOf(png.url))).size, png.bytes);
  const list = await admin.get("/api/admin/media?kind=image");
  assert.equal(list.data.items[0].id, png.id);
  assert.equal((await admin.get("/api/admin/media?kind=video")).data.items.length, 0);
  assert.equal((await admin.get("/api/admin/media?q=camiseta%20fe")).data.items.length, 1);
  // Se sirve en /uploads con caché inmutable y Range
  const pub = srv.client({ admin: false });
  const g = await pub.get(png.url);
  assert.equal(g.status, 200);
  assert.equal(g.headers["cache-control"], "public, max-age=31536000, immutable");
  const part = await pub.get(png.url, { headers: { range: "bytes=0-7" } });
  assert.equal(part.status, 206);
  assert.equal(part.body.length, 8);
});

test("las medidas enviadas por el panel (X-Media-Width/Height) tienen prioridad", async () => {
  const r = await upload(makePng(10, 20), "image/png", "rotada.png", { "x-media-width": "20", "x-media-height": "10" });
  assert.equal(r.data.item.width, 20);
  assert.equal(r.data.item.height, 10);
});

test("subir video MP4 (ftyp)", async () => {
  const r = await upload(makeMp4(), "video/mp4", "hero.mp4", { "x-media-width": "1920", "x-media-height": "1080" });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.data.item.kind, "video");
  assert.equal(r.data.item.mime, "video/mp4");
  assert.equal(r.data.item.width, 1920);
  assert.match(r.data.item.url, /\.mp4$/);
  const part = await srv.client({ admin: false }).get(r.data.item.url, { headers: { range: "bytes=4-7" } });
  assert.equal(part.status, 206);
  assert.equal(part.body.toString("latin1"), "ftyp");
});

test("rechaza SVG, HTML disfrazado de PNG, texto y tipos no permitidos con 415", async () => {
  const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), "image/svg+xml", "x.svg");
  assert.equal(svg.status, 415);
  assert.equal(svg.data.error.code, "unsupported_media");
  const html = await upload(Buffer.from("<!doctype html><script>alert(1)</script>" + " ".repeat(100)), "image/png", "foto.png");
  assert.equal(html.status, 415);
  const svgAsPng = await upload(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'), "image/png", "x.png");
  assert.equal(svgAsPng.status, 415);
  const pdf = await upload(Buffer.from("%PDF-1.7 ....................."), "application/pdf", "x.pdf");
  assert.equal(pdf.status, 415);
  const empty = await upload(Buffer.alloc(0), "image/png", "vacio.png");
  assert.equal(empty.status, 400);
  assert.equal((await admin.get("/api/admin/media")).data.items.every((m) => m.mime !== "image/svg+xml"), true);
});

test("límite de tamaño: imagen > 12 MB → 413", async () => {
  const big = Buffer.concat([makePng(1, 1), Buffer.alloc(12 * 1024 * 1024 + 1)]);
  const r = await upload(big, "image/png", "enorme.png");
  assert.equal(r.status, 413);
  assert.equal(r.data.error.code, "payload_too_large");
});

test("límite sin Content-Length (chunked): miniatura > 2 MB → 413 y sin archivos temporales", async () => {
  const r = await new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: srv.port, method: "PUT", path: `/api/admin/media/${png.id}/thumb`, agent: false,
      headers: { "content-type": "image/png", "transfer-encoding": "chunked", "x-mercy-admin": "1", cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on("error", reject);
    for (let i = 0; i < 5; i++) req.write(Buffer.alloc(512 * 1024, 1));
    req.end();
  });
  assert.equal(r.status, 413);
  assert.equal(r.data.error.code, "payload_too_large");
  const big = await new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: srv.port, method: "POST", path: "/api/admin/media", agent: false,
      headers: { "content-type": "image/png", "transfer-encoding": "chunked", "x-mercy-admin": "1", cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.on("error", reject);
    req.write(makePng(2, 2));
    for (let i = 0; i < 13; i++) req.write(Buffer.alloc(1024 * 1024, 2));
    req.end();
  });
  assert.equal(big, 413);
  assert.deepEqual(await readdir(join(srv.dataDir, "tmp")), [], "el archivo parcial se borra");
});

test("miniatura: PUT /media/:id/thumb guarda <id>-thumb.<ext> y rechaza no-imágenes", async () => {
  const r = await admin.request("PUT", `/api/admin/media/${png.id}/thumb`, { body: makePng(6, 4), headers: { "content-type": "image/png" } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.data.item.thumbUrl, new RegExp(`/${png.id}-thumb\\.png$`));
  assert.equal((await srv.client({ admin: false }).get(r.data.item.thumbUrl)).status, 200);
  const again = await admin.request("PUT", `/api/admin/media/${png.id}/thumb`, { body: makePng(6, 5), headers: { "content-type": "image/png" } });
  assert.match(again.data.item.thumbUrl, /-thumb\.png\?v=[a-z0-9]+$/, "reemplazo con ?v= para saltar la caché");
  const bad = await admin.request("PUT", `/api/admin/media/${png.id}/thumb`, { body: Buffer.from("<html>"), headers: { "content-type": "image/png" } });
  assert.equal(bad.status, 415);
  png = again.data.item;
});

test("editar nombre/alt", async () => {
  const r = await admin.put(`/api/admin/media/${png.id}`, { name: "Camiseta Fe crema", alt: "Camiseta color crema" });
  assert.equal(r.status, 200);
  assert.equal(r.data.item.alt, "Camiseta color crema");
  const bad = await admin.put(`/api/admin/media/${png.id}`, { name: "", alt: "x".repeat(200) });
  assert.equal(bad.status, 422);
});

test("editar sin cambios (mismo nombre y alt, o con espacios de más) → 200 sin escribir ni registrar actividad", async () => {
  const updates = async () => (await admin.get("/api/admin/activity?entity=media&limit=500")).data.items.filter((e) => e.action === "update" && e.entityId === png.id).length;
  const n0 = await updates();
  const file = join(srv.dataDir, "media.json");
  const m0 = (await stat(file)).mtimeMs;
  await new Promise((r) => setTimeout(r, 30));
  const same = await admin.put(`/api/admin/media/${png.id}`, { name: "  Camiseta Fe crema ", alt: "Camiseta color crema" });
  assert.equal(same.status, 200, same.text);
  assert.equal(same.data.item.name, "Camiseta Fe crema");
  assert.equal(same.data.item.alt, "Camiseta color crema");
  const onlyAlt = await admin.put(`/api/admin/media/${png.id}`, { alt: "Camiseta color crema" });   // name ausente = se conserva
  assert.equal(onlyAlt.status, 200);
  assert.equal(await updates(), n0, "sin entradas «Archivo … actualizado» nuevas");
  assert.equal((await stat(file)).mtimeMs, m0, "media.json no se reescribe");
  // Un cambio real sí se registra
  const real = await admin.put(`/api/admin/media/${png.id}`, { name: "Camiseta Fe crema", alt: "Camiseta Fe color crema" });
  assert.equal(real.data.item.alt, "Camiseta Fe color crema");
  assert.equal(await updates(), n0 + 1);
});

test("borrar un archivo en uso → 409 in_use con usos; force=1 lo borra igual (y el archivo físico)", async () => {
  // Usar la foto en un producto y en el modal
  const fe = (await admin.get("/api/admin/products/fe")).data.item;
  fe.colors[0].photos = [{ src: png.url, thumb: png.thumbUrl, alt: "", zoom: null, ox: null, oy: null }];
  const up = await admin.put("/api/admin/products/fe", fe);
  assert.equal(up.status, 200, up.text);
  const dm = (await admin.get("/api/admin/content")).data.discountModal;
  assert.equal((await admin.put("/api/admin/content/discountModal", { ...dm, image: png.url })).status, 200);

  const info = await admin.get(`/api/admin/media/${png.id}`);
  assert.deepEqual(info.data.usages.sort(), ["discountModal.image", "products/fe"]);
  const r = await admin.del(`/api/admin/media/${png.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, "in_use");
  assert.deepEqual(r.data.error.usages.sort(), ["discountModal.image", "products/fe"]);
  const f = await admin.del(`/api/admin/media/${png.id}?force=1`);
  assert.equal(f.status, 200);
  await assert.rejects(stat(fileOf(png.url)));
  assert.equal((await srv.client({ admin: false }).get(png.url)).status, 404);
  assert.equal((await admin.get(`/api/admin/media/${png.id}`)).status, 404);
});

test("borrar un archivo sin uso; el editor también puede subir", async () => {
  const r = await upload(makePng(2, 2), "image/png", "suelta.png");
  assert.equal((await admin.del(`/api/admin/media/${r.data.item.id}`)).status, 200);
  const act = (await admin.get("/api/admin/activity?entity=media")).data.items;
  assert.ok(act.some((e) => e.action === "upload"));
  assert.ok(act.some((e) => e.action === "delete"));
  assert.equal((await admin.request("POST", "/api/admin/media", { body: makePng(), headers: { "content-type": "image/png", "x-mercy-admin": null } })).status, 403, "CSRF también en subidas");
});
