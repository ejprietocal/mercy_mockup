// Versión pública de js/defaults.js (server/lib/public-defaults.js): recorte por tokens, comprobación en vm y respaldos
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { REPO_ROOT } from "../app.js";
import { publicDefaultsJs, tokenize } from "../lib/public-defaults.js";

const run = (code) => {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { timeout: 2000 });
  return JSON.parse(JSON.stringify(sandbox.Mercy));
};
const HEAD = "window.Mercy = window.Mercy || {};\n";
const CONTENT = 'Mercy.DEFAULT_CONTENT = { schemaVersion: 1, discountModal: { enabled: true, couponCode: "BIENVENIDA" }, texts: { a: "x" } };\n';

test("el js/defaults.js real se recorta (modo cut) sin códigos y con DEFAULT_CONTENT intacto", () => {
  const src = readFileSync(join(REPO_ROOT, "js", "defaults.js"), "utf8");
  const orig = run(src);
  const codes = [orig.DEFAULT_CONTENT.discountModal.couponCode, ...orig.DEFAULT_COUPONS.map((c) => c.code)].filter(Boolean);
  assert.ok(codes.length > 0);
  const r = publicDefaultsJs(src);
  assert.equal(r.mode, "cut");
  for (const code of codes) assert.ok(!r.code.includes(code), code);
  assert.match(r.code, /Mercy\.DEFAULT_COUPONS = \[\];/);
  const M = run(r.code);
  assert.deepEqual(M.DEFAULT_COUPONS, []);
  orig.DEFAULT_CONTENT.discountModal.couponCode = "";
  assert.deepEqual(M.DEFAULT_CONTENT, orig.DEFAULT_CONTENT);
  assert.ok(r.code.length < src.length && r.code.length > src.length * 0.9);
});

test("cadenas, comentarios, plantillas y regex con ] ; // o «DEFAULT_COUPONS =» no confunden el recorte", () => {
  const src = HEAD
    + "/* Ojo: Mercy.DEFAULT_COUPONS = [ { code: \"COMENTARIO\" } ]; */\n"
    + "// Mercy.DEFAULT_COUPONS = [\n"
    + CONTENT
    + "Mercy.DEFAULT_COUPONS = [\n"
    + "  { code: 'SECRETO1', description: \"cierra ] y ; y // y /* y \\\" y }\" },\n"
    + "  { code: `SECRETO2`, re: /[\\]\\/]x/g.source, n: [1, [2, { a: 3 }]], t: `${\"}\"}]` },\n"
    + "]\n"
    + "Mercy.EXTRA = { ok: true, cadena: \"Mercy.DEFAULT_COUPONS = ['NO']\" };\n";
  const r = publicDefaultsJs(src);
  assert.equal(r.mode, "cut", r.code);
  assert.doesNotMatch(r.code, /SECRETO1|SECRETO2|BIENVENIDA/);
  const M = run(r.code);
  assert.deepEqual(M.DEFAULT_COUPONS, []);
  assert.equal(M.DEFAULT_CONTENT.discountModal.couponCode, "");
  assert.equal(M.DEFAULT_CONTENT.texts.a, "x");
  assert.deepEqual(M.EXTRA, { ok: true, cadena: "Mercy.DEFAULT_COUPONS = ['NO']" });
  assert.match(r.code, /COMENTARIO/, "los comentarios se dejan tal cual");
});

test("literal sin terminar → se corta hasta el final del archivo", () => {
  const src = HEAD + CONTENT + 'Mercy.DEFAULT_COUPONS = [\n  { code: "SINCERRAR", value: 15 },\n';
  const r = publicDefaultsJs(src);
  assert.ok(["unverified", "cut"].includes(r.mode), r.mode);
  assert.doesNotMatch(r.code, /SINCERRAR|BIENVENIDA/);
  assert.ok(r.code.trimEnd().endsWith("Mercy.DEFAULT_COUPONS = [];"));
  const M = run(r.code);
  assert.deepEqual(M.DEFAULT_COUPONS, []);
  assert.equal(M.DEFAULT_CONTENT.texts.a, "x");
});

test("expresiones que siguen al literal, comillas en la clave y asignación dentro de una función", () => {
  const a = publicDefaultsJs(HEAD + 'Mercy.DEFAULT_CONTENT = { "discountModal": { "couponCode": "CLAVE" } };\n'
    + 'Mercy.DEFAULT_COUPONS = [{ code: "MAPA" }].map(function (c) { return c; });\nMercy.X = 1;\n');
  assert.equal(a.mode, "cut", a.code);
  assert.doesNotMatch(a.code, /MAPA|CLAVE/);
  assert.equal(run(a.code).X, 1);
  const b = publicDefaultsJs(HEAD + "(function () {\n  Mercy.DEFAULT_COUPONS = [{ code: \"DENTRO\" }]\n})();\n" + CONTENT);
  assert.equal(b.mode, "cut", b.code);
  assert.doesNotMatch(b.code, /DENTRO|BIENVENIDA/);
  assert.equal(run(b.code).DEFAULT_CONTENT.texts.a, "x");
  // Asignación directa del cupón de bienvenida
  const c = publicDefaultsJs(HEAD + CONTENT + 'Mercy.DEFAULT_CONTENT.discountModal.couponCode = "TARDE";\n');
  assert.equal(c.mode, "cut");
  assert.doesNotMatch(c.code, /TARDE|BIENVENIDA/);
});

test("si el recorte no basta (alias, push, plantilla) se regenera desde los valores: sin cupones y con el contenido igual", () => {
  for (const extra of [
    'Mercy.DEFAULT_COUPONS = [];\nMercy.DEFAULT_COUPONS.push({ code: "EMPUJADO" });\n',
    'var M = Mercy; M.DEFAULT_COUPONS = [{ code: "ALIAS" }];\n',
    'Mercy["DEFAULT_COUPONS"] = [{ code: "CORCHETES" }];\n',
    'Mercy.DEFAULT_CONTENT.discountModal.couponCode = `PLANTILLA`;\nMercy.DEFAULT_COUPONS = [];\n',
  ]) {
    const r = publicDefaultsJs(HEAD + CONTENT + extra);
    assert.equal(r.mode, "regenerated", extra);
    assert.doesNotMatch(r.code, /EMPUJADO|ALIAS|CORCHETES|PLANTILLA|BIENVENIDA/, extra);
    const M = run(r.code);
    assert.deepEqual(M.DEFAULT_COUPONS, []);
    assert.deepEqual(M.DEFAULT_CONTENT, { schemaVersion: 1, discountModal: { enabled: true, couponCode: "" }, texts: { a: "x" } });
  }
});

test("archivo que no corre en vm (APIs del navegador) → recorte sin comprobar; roto del todo → solo DEFAULT_COUPONS = []", () => {
  const browser = publicDefaultsJs(HEAD + "Mercy.LANG = document.documentElement.lang;\n" + CONTENT + 'Mercy.DEFAULT_COUPONS = [{ code: "NAVEGADOR" }];\n');
  assert.equal(browser.mode, "unverified");
  assert.doesNotMatch(browser.code, /NAVEGADOR|BIENVENIDA/);
  assert.match(browser.code, /document\.documentElement\.lang/);
  const broken = publicDefaultsJs('Mercy.DEFAULT_COUPONS = [{ code: "ROTO" }];\n}}} esto no es JavaScript (((');
  assert.equal(broken.mode, "stub");
  assert.doesNotMatch(broken.code, /ROTO/);
  assert.deepEqual(run(broken.code), { DEFAULT_COUPONS: [] });
  // Sin DEFAULT_COUPONS ni couponCode: queda igual
  const plain = HEAD + 'Mercy.DEFAULT_CONTENT = { texts: { a: "x" } };\n';
  assert.deepEqual(publicDefaultsJs(plain), { code: plain, mode: "cut" });
  // Archivo vacío: no hay nada que ocultar (se sirve vacío; el servidor avisa en el log porque no se pudo comprobar)
  assert.deepEqual(publicDefaultsJs(""), { code: "", mode: "unverified" });
});

test("tokenize: distingue regex de división y salta comentarios", () => {
  const toks = [...tokenize('a = b / c; r = /x\\/]/g; s = "//"; /* = */ t = `a${ {"k": "}"}.k }b`;')];
  assert.deepEqual(toks.filter((t) => t.type === "regex").length, 1);
  assert.deepEqual(toks.filter((t) => t.type === "str").length, 1);
  assert.deepEqual(toks.filter((t) => t.type === "tmpl").length, 1);
  assert.equal(toks.filter((t) => t.type === "punct" && t.value === "=").length, 4);
});
