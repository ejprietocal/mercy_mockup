// Revisiones (instantáneas, diff, restaurar) y persistencia entre reinicios
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { startServer } from "./helpers.js";

let srv;
let admin;
before(async () => {
  srv = await startServer();
  admin = srv.client();
  await admin.login();
});
after(() => srv?.stop());

test("la primera revisión es «Contenido inicial» y no tiene cambios", async () => {
  const r = await admin.get("/api/admin/revisions");
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 1);
  const first = r.data.items[0];
  assert.equal(first.summary, "Contenido inicial");
  assert.equal(first.user.name, "Sistema");
  assert.ok(first.bytes > 1000);
  const d = await admin.get(`/api/admin/revisions/${first.id}`);
  assert.equal(d.status, 200);
  assert.deepEqual(d.data.changes, []);
  assert.equal(d.data.revision.summary, "Contenido inicial");
  assert.equal(d.data.revision.content, undefined, "el detalle no devuelve la instantánea completa");
});

test("cada cambio crea una revisión con resumen y diff legible frente a la anterior", async () => {
  const c = (await admin.get("/api/admin/content")).data;
  await admin.put("/api/admin/content/home", { ...c.home, hero: { ...c.home.hero, eyebrow: "Colección Gracia" }, marquee: [...c.home.marquee, { icon: "gift", text: "Regalos" }] });
  const fe = (await admin.get("/api/admin/products/fe")).data.item;
  fe.price = 81900;
  fe.colors[0].stock.S = 9;
  await admin.put("/api/admin/products/fe", fe);
  const list = (await admin.get("/api/admin/revisions")).data.items;
  assert.equal(list.length, 3);
  assert.equal(list[0].summary, "Producto «Camiseta Fe» actualizado");
  assert.equal(list[1].summary, "Sección «Inicio» actualizada");
  assert.equal(list[0].user.name, "Ana Admin");

  const home = (await admin.get(`/api/admin/revisions/${list[1].id}`)).data;
  const paths = home.changes.map((x) => x.path);
  assert.ok(paths.includes("home.hero.eyebrow"));
  const ch = home.changes.find((x) => x.path === "home.hero.eyebrow");
  assert.equal(ch.before, "Nueva colección · Renacer");
  assert.equal(ch.after, "Colección Gracia");
  assert.ok(paths.includes("home.marquee[4]"));
  assert.equal(home.truncated, false);

  const prod = (await admin.get(`/api/admin/revisions/${list[0].id}`)).data;
  const pp = prod.changes.map((x) => x.path).sort();
  assert.deepEqual(pp, ["products[fe].colors[negro].stock.S", "products[fe].price"]);
  assert.equal(prod.changes.find((x) => x.path === "products[fe].price").before, 79900);
  assert.equal(prod.previous.id, list[1].id);
  assert.equal((await admin.get("/api/admin/revisions/r-noexiste000")).status, 404);
  assert.equal((await admin.get("/api/admin/revisions/..%2f..%2fusers")).status, 404);
});

test("restaurar: el contenido vuelve a la instantánea y se crea «Restaurado desde la revisión del …»", async () => {
  const list = (await admin.get("/api/admin/revisions")).data.items;
  const initial = list.at(-1);
  const r = await admin.post(`/api/admin/revisions/${initial.id}/restore`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.content.home.hero.eyebrow, "Nueva colección · Renacer");
  assert.equal(r.data.content.products.find((p) => p.id === "fe").price, 79900);
  const c = (await admin.get("/api/admin/content")).data;
  assert.equal(c.home.marquee.length, 4);
  assert.ok(c.meta.sections.home.updatedAt > initial.at, "la sección restaurada queda con fecha nueva");
  const fe = c.products.find((p) => p.id === "fe");
  assert.equal(fe.updatedBy, "Ana Admin", "el producto que cambió queda marcado");
  const gracia = c.products.find((p) => p.id === "gracia");
  assert.equal(gracia.updatedBy, "Sistema", "los que no cambiaron conservan sus marcas");
  const after2 = (await admin.get("/api/admin/revisions")).data.items;
  assert.equal(after2.length, 4);
  // Cita la versión restaurada (dos versiones del mismo minuto se distinguen por su resumen)
  assert.match(after2[0].summary, /^Restaurado desde la revisión del \d{1,2} de [a-z]+ de \d{4}, \d{1,2}:\d{2} [ap]\. m\. \(«Contenido inicial»\)$/);
  const act = (await admin.get("/api/admin/activity?entity=revision")).data.items;
  assert.equal(act[0].action, "restore");
  assert.equal(act[0].entityId, initial.id);
  assert.match(act[0].label, /«Contenido inicial»\)$/);
  // Público también restaurado
  const pub = (await srv.client({ admin: false }).get("/api/public/content")).data;
  assert.equal(pub.products.find((p) => p.id === "fe").price, 79900);
  assert.equal((await admin.post("/api/admin/revisions/r-noexiste000/restore")).status, 404);
});

test("los datos persisten tras reiniciar el servidor (mismo DATA_DIR)", async () => {
  const dataDir = srv.dataDir;
  const rootDir = srv.rootDir;
  const before2 = (await admin.get("/api/admin/revisions")).data.items.length;
  await admin.post("/api/admin/coupons", { code: "PERSISTE", value: 10 });
  await srv.stop({ keepData: true });
  srv = await startServer({ dataDir, rootDir });
  admin = srv.client();
  await admin.login();
  assert.equal((await admin.get("/api/admin/revisions")).data.items.length, before2);
  assert.ok((await admin.get("/api/admin/coupons")).data.items.some((c) => c.code === "PERSISTE"));
  const files = await readdir(dataDir);
  for (const f of ["content.json", "users.json", "sessions.json", "coupons.json", "activity.json"]) assert.ok(files.includes(f), f);
  assert.ok(!files.some((f) => f.endsWith(".tmp")), "sin temporales sueltos");
  assert.equal((await readdir(join(dataDir, "revisions"))).length, before2);
});
