// Archivos estáticos: lista blanca, traversal, ETag/304, gzip, Range, CSP del panel, /uploads, /version.txt
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import { link, mkdir, readFile, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startServer, makePng } from "./helpers.js";
import { loadFactoryDefaults } from "../lib/content.js";

/** Ejecuta un defaults.js (texto) como lo haría el navegador → window.Mercy */
function runDefaults(code) {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { timeout: 2000 });
  return JSON.parse(JSON.stringify(sandbox.Mercy));
}

let srv;
let c;
before(async () => {
  srv = await startServer();
  c = srv.client();
});
after(() => srv.stop());

test("sirve las páginas de la lista blanca", async () => {
  for (const p of ["/", "/index.html", "/catalogo.html", "/producto.html?id=fe", "/checkout.html"]) {
    const r = await c.get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers["content-type"], /^text\/html; charset=utf-8/);
    assert.equal(r.headers["cache-control"], "no-cache");
    assert.ok(r.headers.etag, "ETag");
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["referrer-policy"], "strict-origin-when-cross-origin");
    // Tienda: solo se puede enmarcar desde el propio sitio + CSP propia (defensa en profundidad)
    assert.equal(r.headers["x-frame-options"], "SAMEORIGIN", p);
    const csp = r.headers["content-security-policy"] || "";
    assert.match(csp, /script-src 'self'(;|$)/, p);
    assert.match(csp, /frame-ancestors 'self'/, p);
    assert.match(csp, /object-src 'none'/, p);
    assert.match(csp, /img-src 'self' data: blob: https: http:/, p);
    assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/, p);
  }
});

test("tipos MIME correctos y caché de fuentes", async () => {
  const js = await c.get("/js/defaults.js");
  assert.equal(js.status, 200);
  assert.equal(js.headers["content-type"], "text/javascript; charset=utf-8");
  assert.match(js.text, /Mercy\.DEFAULT_CONTENT/);
  assert.equal((await c.get("/js/app.mjs")).headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal((await c.get("/css/base.css")).headers["content-type"], "text/css; charset=utf-8");
  const font = await c.get("/assets/fonts/titulo.woff2");
  assert.equal(font.headers["content-type"], "font/woff2");
  assert.equal(font.headers["cache-control"], "public, max-age=604800");
  const png = await c.get("/assets/logo/logo.png");
  assert.equal(png.headers["content-type"], "image/png");
  assert.equal(png.headers["cache-control"], "no-cache");
  assert.equal((await c.get("/assets/video/demo.mp4")).headers["content-type"], "video/mp4");
});

test("404 para todo lo que no está en la lista blanca", async () => {
  for (const p of [
    "/server/secret.js", "/server/app.js", "/data/content.json", "/docs/ADMIN-CONTRATO.md", "/.git/config", "/.env",
    "/package.json", "/tools/x.py", "/assets/fonts/README.md", "/css/", "/js", "/admin/js/", "/uploads/", "/otra.html",
    "/assets/../server/secret.js", "/css/../server/secret.js", "/css/%2e%2e/server/secret.js", "/css/%2E%2E/%2E%2E/etc/passwd",
    "/css/..%2fserver%2fsecret.js", "/css/..%5cserver%5csecret.js", "/css/%00.css", "/css/%zz.css", "/js\\..\\server\\secret.js",
    "/uploads/../users.json", "/uploads/%2e%2e/users.json", "/uploads/..%2fusers.json", "/admin/.hidden.html",
  ]) {
    const r = await c.get(p);
    assert.equal(r.status, 404, `${p} → ${r.status}`);
    assert.doesNotMatch(r.text, /SECRET|secreto|ADMIN_PASSWORD|\[core\]/, p);
  }
});

test("un enlace simbólico que sale de su carpeta permitida no se sirve", async () => {
  await symlink(join(srv.rootDir, "server", "secret.js"), join(srv.rootDir, "js", "fuga.js"));
  const r = await c.get("/js/fuga.js");
  assert.equal(r.status, 404);
});

test("ETag → 304 y gzip para texto", async () => {
  const first = await c.get("/css/base.css");
  assert.equal(first.status, 200);
  const again = await c.get("/css/base.css", { headers: { "if-none-match": first.headers.etag } });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);

  const gz = await c.get("/css/base.css", { headers: { "accept-encoding": "gzip, br" } });
  assert.equal(gz.status, 200);
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.equal(gz.headers.vary, "Accept-Encoding");
  assert.equal(gunzipSync(gz.body).toString(), first.text);
  const gz304 = await c.get("/css/base.css", { headers: { "accept-encoding": "gzip", "if-none-match": gz.headers.etag } });
  assert.equal(gz304.status, 304);
  // archivos pequeños no se comprimen
  assert.equal((await c.get("/js/chico.js", { headers: { "accept-encoding": "gzip" } })).headers["content-encoding"], undefined);
});

test("Range: 206, sufijo, abierto y 416", async () => {
  const full = await c.get("/assets/video/demo.mp4");
  assert.equal(full.headers["accept-ranges"], "bytes");
  const r = await c.get("/assets/video/demo.mp4", { headers: { range: "bytes=0-99" } });
  assert.equal(r.status, 206);
  assert.equal(r.headers["content-range"], "bytes 0-99/4096");
  assert.equal(r.headers["content-length"], "100");
  assert.deepEqual(r.body, full.body.subarray(0, 100));
  const suf = await c.get("/assets/video/demo.mp4", { headers: { range: "bytes=-10" } });
  assert.equal(suf.status, 206);
  assert.equal(suf.headers["content-range"], "bytes 4086-4095/4096");
  const open = await c.get("/assets/video/demo.mp4", { headers: { range: "bytes=4000-" } });
  assert.equal(open.status, 206);
  assert.equal(open.body.length, 96);
  const bad = await c.get("/assets/video/demo.mp4", { headers: { range: "bytes=5000-6000" } });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers["content-range"], "bytes */4096");
  // If-Range que no coincide → completo
  const ifr = await c.get("/assets/video/demo.mp4", { headers: { range: "bytes=0-9", "if-range": '"otra"' } });
  assert.equal(ifr.status, 200);
  // HEAD
  const h = await c.head("/assets/video/demo.mp4");
  assert.equal(h.status, 200);
  assert.equal(h.headers["content-length"], "4096");
  assert.equal(h.body.length, 0);
});

test("/admin → 301 /admin/; CSP y X-Frame-Options en /admin/**", async () => {
  const r = await c.get("/admin");
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, "/admin/");
  const q = await c.get("/admin?next=%23%2Fproductos");
  assert.equal(q.headers.location, "/admin/?next=%23%2Fproductos");
  for (const p of ["/admin/", "/admin/login.html", "/admin/js/main.js", "/admin/no-existe.html"]) {
    const a = await c.get(p);
    assert.equal(a.status, p.includes("no-existe") ? 404 : 200, p);
    assert.equal(a.headers["x-frame-options"], "DENY", p);
    const csp = a.headers["content-security-policy"];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  }
  const panel = await c.get("/admin/");
  assert.match(panel.text, /<title>Panel<\/title>/);
  assert.equal(panel.headers["x-robots-tag"], "noindex, nofollow");
  assert.equal((await c.get("/")).headers["x-robots-tag"], undefined);
});

test("/uploads se sirve desde DATA_DIR con caché inmutable y Range; nunca svg/html", async () => {
  const dir = join(srv.dataDir, "uploads", "2026", "10");
  await mkdir(dir, { recursive: true });
  const png = makePng(8, 8);
  await writeFile(join(dir, "m-prueba-foto.png"), png);
  await writeFile(join(dir, "malo.svg"), "<svg onload=alert(1)>");
  await writeFile(join(dir, "malo.html"), "<script>alert(1)</script>");
  const r = await c.get("/uploads/2026/10/m-prueba-foto.png");
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(r.headers["content-type"], "image/png");
  assert.deepEqual(r.body, png);
  const part = await c.get("/uploads/2026/10/m-prueba-foto.png", { headers: { range: "bytes=1-3" } });
  assert.equal(part.status, 206);
  assert.equal(part.body.toString("latin1"), "PNG");
  assert.equal((await c.get("/uploads/2026/10/malo.svg")).status, 404);
  assert.equal((await c.get("/uploads/2026/10/malo.html")).status, 404);
});

test("/version.txt devuelve GIT_SHA y métodos no permitidos → 405", async () => {
  const v = await c.get("/version.txt");
  assert.equal(v.status, 200);
  assert.equal(v.text.trim(), "test-sha");
  const p = await c.request("POST", "/index.html", { body: "x" });
  assert.equal(p.status, 405);
});

test("/js/defaults.js sale SIN cupones: ni DEFAULT_COUPONS ni couponCode; DEFAULT_CONTENT intacto", async () => {
  const file = join(srv.rootDir, "js", "defaults.js");
  const original = await readFile(file, "utf8");
  assert.match(original, /MERCY15/, "la copia de prueba trae el cupón de fábrica");
  const factory = loadFactoryDefaults(file);
  const r = await c.get("/js/defaults.js");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(r.headers["cache-control"], "no-cache");
  assert.doesNotMatch(r.text, /MERCY15/i);
  assert.doesNotMatch(r.text, /DEFAULT_COUPONS\s*=\s*\[\s*\{/);
  assert.ok(!r.text.includes("DEFAULT_COUPONS = [{"));
  assert.match(r.text, /Mercy\.DEFAULT_COUPONS = \[\];/);
  assert.equal(Number(r.headers["content-length"]), Buffer.byteLength(r.text));
  // Recorte, no regeneración: conserva el encabezado y el formato del archivo
  assert.ok(r.text.startsWith(original.slice(0, 200)));
  // Ejecuta igual que en el navegador: DEFAULT_CONTENT idéntico salvo el código del cupón de bienvenida
  const M = runDefaults(r.text);
  assert.deepEqual(M.DEFAULT_COUPONS, []);
  const expected = structuredClone(factory.content);
  expected.discountModal.couponCode = "";
  assert.deepEqual(M.DEFAULT_CONTENT, expected);
  assert.ok(M.DEFAULT_CONTENT.products.length >= 14);
  // ETag por contenido, coherente entre peticiones; 304; HEAD con la longitud servida
  assert.match(r.headers.etag, /^W\/"[0-9a-f]+-[0-9a-f]{20}"$/);
  assert.equal(r.headers["last-modified"], undefined);
  const again = await c.get("/js/defaults.js");
  assert.equal(again.headers.etag, r.headers.etag);
  assert.equal((await c.get("/js/defaults.js", { headers: { "if-none-match": r.headers.etag } })).status, 304);
  const h = await c.head("/js/defaults.js");
  assert.equal(h.headers["content-length"], r.headers["content-length"]);
  assert.equal(h.body.length, 0);
  // gzip como los demás estáticos
  const gz = await c.get("/js/defaults.js", { headers: { "accept-encoding": "gzip" } });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.equal(gz.headers.vary, "Accept-Encoding");
  assert.equal(gz.headers.etag, r.headers.etag.replace(/"$/, '-gz"'));
  assert.equal(gunzipSync(gz.body).toString(), r.text);
  assert.equal((await c.get("/js/defaults.js", { headers: { "accept-encoding": "gzip", "if-none-match": gz.headers.etag } })).status, 304);
  // Range sobre la versión servida (nunca sobre el original)
  const part = await c.get("/js/defaults.js", { headers: { range: "bytes=0-99" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers["content-range"], `bytes 0-99/${Buffer.byteLength(r.text)}`);
  assert.deepEqual(part.body, Buffer.from(r.text).subarray(0, 100));
  const tail = await c.get("/js/defaults.js", { headers: { range: "bytes=-400" } });
  assert.doesNotMatch(tail.text, /MERCY15/);
});

test("/js/defaults.js: la caché se renueva al cambiar el archivo (mtime) y nunca entrega el original", async () => {
  const file = join(srv.rootDir, "js", "defaults.js");
  const original = await readFile(file, "utf8");
  const first = await c.get("/js/defaults.js");
  const changed = original
    .replace(/"MERCY15"/g, '"OTRO20"')
    .replace("Nueva colección · Renacer", "Colección Cambiada");
  assert.notEqual(changed, original);
  await writeFile(file, changed);
  const st = await stat(file);
  await utimes(file, st.atime, new Date(st.mtimeMs + 5000));
  try {
    const r = await c.get("/js/defaults.js");
    assert.equal(r.status, 200);
    assert.notEqual(r.headers.etag, first.headers.etag);
    assert.doesNotMatch(r.text, /OTRO20|MERCY15/);
    assert.match(r.text, /Colección Cambiada/);
    assert.equal((await c.get("/js/defaults.js", { headers: { "if-none-match": first.headers.etag } })).status, 200);
    const gz = await c.get("/js/defaults.js", { headers: { "accept-encoding": "gzip" } });
    assert.doesNotMatch(gunzipSync(gz.body).toString(), /OTRO20/);
  } finally {
    await writeFile(file, original);
    await utimes(file, st.atime, new Date(st.mtimeMs + 10000));
  }
  assert.doesNotMatch((await c.get("/js/defaults.js")).text, /OTRO20|MERCY15/);
});

test("/js/defaults.js: otra capitalización, enlaces simbólicos o duros tampoco entregan los cupones", async () => {
  await symlink(join(srv.rootDir, "js", "defaults.js"), join(srv.rootDir, "js", "enlace-defaults.js"));
  await link(join(srv.rootDir, "js", "defaults.js"), join(srv.rootDir, "js", "copia-dura.js"));
  for (const p of ["/js/enlace-defaults.js", "/js/copia-dura.js", "/js/DEFAULTS.JS", "/js/Defaults.js", "/js/defaults.JS",
    "/js/default%C5%BF.js" /* «ſ» se pliega a «s» en APFS */, "/js/defaults%2Ejs"]) {
    const r = await c.get(p);
    // En discos sin distinción de mayúsculas (macOS) la variante existe; en Linux da 404. Nunca el original.
    assert.ok(r.status === 200 || r.status === 404, `${p} → ${r.status}`);
    assert.doesNotMatch(r.text, /MERCY15/, p);
    if (r.status === 200) assert.match(r.text, /Mercy\.DEFAULT_COUPONS = \[\];/, p);
  }
});

test("ningún otro estático de la copia de prueba expone el código del cupón", async () => {
  for (const p of ["/", "/catalogo.html", "/producto.html", "/checkout.html", "/css/base.css", "/js/app.mjs", "/js/chico.js",
    "/admin/", "/admin/login.html", "/admin/js/main.js", "/api/public/content", "/api/public/content.js"]) {
    const r = await c.get(p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /MERCY15/, p);
  }
});
