// Siembra desde js/defaults.js y revisiones de fábrica: no re-sembrar sobre datos existentes, volver al contenido
// de fábrica (restaurar «Contenido inicial» o borrar content.json) y revisiones fijadas que nunca se descartan.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFixtureRoot, startServer } from "./helpers.js";
import { loadFactoryDefaults, RESEED_SUMMARY, BASELINE_SUMMARY } from "../lib/content.js";
import { Revisions, INITIAL_SUMMARY } from "../lib/revisions.js";

const cleanup = [];
after(async () => { for (const d of cleanup) await rm(d, { recursive: true, force: true }); });

/** Reescribe js/defaults.js de la copia de prueba a partir del de fábrica, con cambios. */
async function writeDefaults(rootDir, mutate) {
  const file = join(rootDir, "js", "defaults.js");
  const f = loadFactoryDefaults(file);
  mutate(f);
  await writeFile(file, `window.Mercy = window.Mercy || {};\nMercy.DEFAULT_CONTENT = ${JSON.stringify(f.content, null, 2)};\nMercy.DEFAULT_COUPONS = ${JSON.stringify(f.coupons, null, 2)};\n`);
}

const start = async (rootDir, dataDir, logs) => {
  const srv = await startServer({ rootDir, dataDir, log: (m) => logs?.push(m), logRequests: false });
  const admin = srv.client();
  await admin.login();
  return { srv, admin };
};

test("cambiar js/defaults.js no re-siembra; borrar content.json vuelve al de fábrica actual; «Contenido inicial» se puede restaurar", async () => {
  const rootDir = await makeFixtureRoot();
  const dataDir = await mkdtemp(join(tmpdir(), "mercy-data-"));
  cleanup.push(rootDir, dataDir);
  let { srv, admin } = await start(rootDir, dataDir);

  // 1) Sitio en marcha con un cambio hecho en el panel
  const c0 = (await admin.get("/api/admin/content")).data;
  assert.equal(c0.home.hero.eyebrow, "Nueva colección · Renacer");
  assert.equal((await admin.put("/api/admin/content/home", { ...c0.home, hero: { ...c0.home.hero, eyebrow: "Editado en el panel" } })).status, 200);
  const revs1 = (await admin.get("/api/admin/revisions")).data.items;
  assert.deepEqual(revs1.map((r) => r.summary), ["Sección «Inicio» actualizada", INITIAL_SUMMARY]);
  assert.equal(revs1[0].pinned, undefined, "la API de revisiones no cambia de forma");
  await srv.stop({ keepData: true });

  // 2) Llega un js/defaults.js nuevo (otro texto y otro cupón de bienvenida) → NO se toca el sitio
  await writeDefaults(rootDir, (f) => {
    f.content.home.hero.eyebrow = "Fábrica nueva";
    f.content.discountModal.couponCode = "NUEVO10";
    f.coupons = [{ ...f.coupons[0], id: "c-nuevo10", code: "NUEVO10", value: 10 }];
  });
  const logs = [];
  ({ srv, admin } = await start(rootDir, dataDir, logs));
  assert.equal((await admin.get("/api/admin/content")).data.home.hero.eyebrow, "Editado en el panel");
  assert.equal((await admin.get("/api/admin/revisions")).data.items.length, 2, "sin revisiones nuevas");
  assert.deepEqual((await admin.get("/api/admin/coupons")).data.items.map((c) => c.code), ["MERCY15"]);
  assert.ok(!logs.some((m) => m.includes("content.json creado")), logs.join("\n"));
  // La versión pública del archivo nuevo tampoco expone su cupón
  assert.doesNotMatch((await srv.client().get("/js/defaults.js")).text, /NUEVO10/);
  await srv.stop({ keepData: true });

  // 3) Borrar content.json con el servidor detenido → contenido de fábrica ACTUAL; cupones intactos
  await rm(join(dataDir, "content.json"));
  logs.length = 0;
  ({ srv, admin } = await start(rootDir, dataDir, logs));
  const c3 = (await admin.get("/api/admin/content")).data;
  assert.equal(c3.home.hero.eyebrow, "Fábrica nueva");
  assert.equal(c3.discountModal.couponCode, "", "NUEVO10 no existe en coupons.json: el modal queda sin cupón (y el servidor arranca)");
  assert.ok(logs.some((m) => m.includes("NUEVO10") && m.includes("no existe en coupons.json")), logs.join("\n"));
  assert.deepEqual((await admin.get("/api/admin/coupons")).data.items.map((c) => c.code), ["MERCY15"]);
  assert.equal((await srv.client({ admin: false }).get("/api/public/content")).data.discountModal.welcome, null);
  const revs3 = (await admin.get("/api/admin/revisions")).data.items;
  assert.equal(revs3.length, 3);
  assert.equal(revs3[0].summary, RESEED_SUMMARY);
  assert.equal(revs3[0].user.name, "Sistema");
  assert.equal(revs3.at(-1).summary, INITIAL_SUMMARY);
  // el diff de la revisión recreada se ve frente a la anterior
  const d3 = (await admin.get(`/api/admin/revisions/${revs3[0].id}`)).data;
  assert.ok(d3.changes.some((x) => x.path === "home.hero.eyebrow" && x.before === "Editado en el panel" && x.after === "Fábrica nueva"));

  // 4) Restaurar «Contenido inicial» = el contenido de fábrica con que arrancó el sitio (el js/defaults.js de entonces).
  //    Los cupones no forman parte de las revisiones: el cupón de bienvenida sigue siendo el vigente ("" aquí) y el
  //    administrador lo elige en «Modal de descuento» (como pide el aviso del arranque).
  const r = await admin.post(`/api/admin/revisions/${revs3.at(-1).id}/restore`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.content.home.hero.eyebrow, "Nueva colección · Renacer");
  assert.equal(r.data.content.discountModal.couponCode, "", "restaurar no cambia el cupón de bienvenida");
  assert.equal((await srv.client({ admin: false }).get("/api/public/content")).data.discountModal.welcome, null);
  const dm4 = (await admin.get("/api/admin/content")).data.discountModal;
  assert.equal((await admin.put("/api/admin/content/discountModal", { ...dm4, couponCode: "MERCY15" })).status, 200);
  assert.equal((await srv.client({ admin: false }).get("/api/public/content")).data.discountModal.welcome.label, "15%");
  await srv.stop({ keepData: true });

  // 5) Si el cupón de bienvenida de fábrica SÍ existe, el content.json recreado lo conserva
  ({ srv, admin } = await start(rootDir, dataDir));
  assert.equal((await admin.post("/api/admin/coupons", { code: "NUEVO10", type: "percent", value: 10 })).status, 201);
  await srv.stop({ keepData: true });
  await rm(join(dataDir, "content.json"));
  ({ srv, admin } = await start(rootDir, dataDir));
  assert.equal((await admin.get("/api/admin/content")).data.discountModal.couponCode, "NUEVO10");
  assert.equal((await srv.client({ admin: false }).get("/api/public/content")).data.discountModal.welcome.label, "10%");
  const revs5 = (await admin.get("/api/admin/revisions")).data.items;
  assert.equal(revs5[0].summary, RESEED_SUMMARY);
  assert.equal(revs5.at(-1).summary, INITIAL_SUMMARY);
  await srv.stop({ keepData: true });

  // 6) Contenido sin historial (se borró revisions/) → revisión base que NO se llama «Contenido inicial»
  for (const f of await readdir(join(dataDir, "revisions"))) await rm(join(dataDir, "revisions", f));
  ({ srv, admin } = await start(rootDir, dataDir));
  const revs6 = (await admin.get("/api/admin/revisions")).data.items;
  assert.deepEqual(revs6.map((x) => x.summary), [BASELINE_SUMMARY]);
  await srv.stop();
});

test("coupons.json borrado con contenido existente: los cupones de fábrica incompatibles se omiten sin impedir el arranque", async () => {
  const rootDir = await makeFixtureRoot();
  const dataDir = await mkdtemp(join(tmpdir(), "mercy-data-"));
  cleanup.push(rootDir, dataDir);
  let { srv } = await start(rootDir, dataDir);
  await srv.stop({ keepData: true });
  await writeDefaults(rootDir, (f) => {
    f.coupons.push({ ...f.coupons[0], id: "c-raro", code: "RARO", appliesTo: "categories", categoryIds: ["no-existe"] });
  });
  await rm(join(dataDir, "coupons.json"));
  const logs = [];
  let admin;
  ({ srv, admin } = await start(rootDir, dataDir, logs));
  assert.deepEqual((await admin.get("/api/admin/coupons")).data.items.map((c) => c.code), ["MERCY15"]);
  assert.ok(logs.some((m) => m.includes("RARO") && m.includes("se omite")), logs.join("\n"));
  await srv.stop();

  // En un sitio NUEVO el mismo js/defaults.js incoherente sí es un error (lo detecta quien lo editó)
  const fresh = await mkdtemp(join(tmpdir(), "mercy-data-"));
  cleanup.push(fresh);
  await assert.rejects(startServer({ rootDir, dataDir: fresh }), /cupón de fábrica #2 \(RARO\)/);
});

test("revisiones fijadas: «Contenido inicial» nunca se descarta al pasar del máximo (también con datos de antes)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mercy-rev-"));
  cleanup.push(dir);
  const sys = { id: null, name: "Sistema" };
  const revs = new Revisions(dir, { max: 3 });
  await revs.init();
  const initial = await revs.add({ user: sys, summary: INITIAL_SUMMARY, content: { v: 0 }, pinned: true });
  for (let i = 1; i <= 5; i++) await revs.add({ user: { id: "u-1", name: "Ana" }, summary: `Cambio ${i}`, content: { v: i } });
  assert.deepEqual(revs.list().map((r) => r.summary), ["Cambio 5", "Cambio 4", INITIAL_SUMMARY]);
  assert.equal((await readdir(dir)).length, 3);
  assert.deepEqual((await revs.get(initial.id)).content, { v: 0 });
  assert.ok(!("pinned" in revs.list()[2]));

  // Reiniciar: el índice se reconstruye y la fijada sigue fijada
  const again = new Revisions(dir, { max: 3 });
  await again.init();
  await again.add({ user: sys, summary: "Cambio 6", content: { v: 6 } });
  assert.deepEqual(again.list().map((r) => r.summary), ["Cambio 6", "Cambio 5", INITIAL_SUMMARY]);

  // Datos creados antes de `pinned`: la «Contenido inicial» del Sistema se trata como fijada
  const file = join(dir, `${initial.id}.json`);
  const raw = JSON.parse(await readFile(file, "utf8"));
  delete raw.pinned;
  await writeFile(file, JSON.stringify(raw));
  const legacy = new Revisions(dir, { max: 3 });
  await legacy.init();
  await legacy.add({ user: sys, summary: "Cambio 7", content: { v: 7 } });
  assert.deepEqual(legacy.list().map((r) => r.summary), ["Cambio 7", "Cambio 6", INITIAL_SUMMARY]);
});
