/* ==========================================================================
   Mercy Studio — server/lib/public-defaults.js
   Versión PÚBLICA de js/defaults.js (la que entrega el servidor en /js/defaults.js).
   El contrato dice que los códigos de cupón nunca salen al público, y en modo servidor la tienda no
   necesita los cupones de fábrica (valida contra la API). Por eso, al servir el archivo:
   · `Mercy.DEFAULT_COUPONS = <literal>;`  →  `Mercy.DEFAULT_COUPONS = [];`
     (se corta hasta el final del literal o, si no termina, hasta el final del archivo);
   · `couponCode: "<CÓDIGO>"`              →  `couponCode: ""`  (cupón de bienvenida del modal).
   Se trabaja sobre TOKENS de JavaScript (cadenas, plantillas, comentarios y regex se saltan enteros),
   no con una regex sobre todo el archivo. Después se COMPRUEBA el resultado ejecutándolo en node:vm:
   DEFAULT_COUPONS vacío, couponCode vacío y todo lo demás (DEFAULT_CONTENT…) idéntico al original.
   Si la comprobación falla, se regenera el archivo desde los valores evaluados (nunca se sirve el original).
   En file:// la tienda sigue leyendo el archivo completo del disco (modo demostración).
   ========================================================================== */
import vm from "node:vm";
import { isDeepStrictEqual } from "node:util";

const ID_START = /[A-Za-z_$\u0080-￿]/;
const ID_PART = /[A-Za-z0-9_$\u0080-￿]/;
const DIGIT = /[0-9]/;
const SPACE = /\s/;
/* Palabras tras las que un "/" empieza una regex (y no es una división) */
const REGEX_AFTER_WORD = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);

function skipString(src, i) {
  const q = src[i++];
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    i++;
    if (ch === q) return i;
  }
  return src.length; // sin cerrar: hasta el final
}

function skipTemplate(src, i) {
  i++; // `
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === "`") return i + 1;
    if (ch === "$" && src[i + 1] === "{") { i = skipCode(src, i + 2, "}"); continue; }
    i++;
  }
  return src.length;
}

function skipRegex(src, i) {
  i++; // /
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === "\n") return i; // no era una regex: se corta en la línea
    i++;
    if (inClass) { if (ch === "]") inClass = false; }
    else if (ch === "[") inClass = true;
    else if (ch === "/") break;
  }
  while (i < src.length && ID_PART.test(src[i])) i++; // banderas
  return i;
}

/** Código dentro de ${ … } de una plantilla: devuelve la posición tras la llave que lo cierra. */
function skipCode(src, i, close) {
  let depth = 0;
  for (const t of tokenize(src, i)) {
    if (t.type !== "punct") continue;
    if (t.value === "{") depth++;
    else if (t.value === "}") {
      if (depth === 0 && close === "}") return t.end;
      depth--;
    }
  }
  return src.length;
}

/**
 * Tokens de JavaScript suficientes para un archivo de datos (generador):
 * { type: "str" | "tmpl" | "regex" | "word" | "punct", value?, start, end }. Espacios y comentarios no generan tokens.
 */
export function* tokenize(src, from = 0) {
  let i = from;
  let prev = null;
  const regexAllowed = () => !prev
    || (prev.type === "punct" && !")]}".includes(prev.value))
    || (prev.type === "word" && REGEX_AFTER_WORD.has(prev.value));
  while (i < src.length) {
    const ch = src[i];
    if (SPACE.test(ch)) { i++; continue; }
    if (ch === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); i = e === -1 ? src.length : e; continue; }
    if (ch === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e === -1 ? src.length : e + 2; continue; }
    const start = i;
    let t;
    if (ch === '"' || ch === "'") { i = skipString(src, i); t = { type: "str" }; }
    else if (ch === "`") { i = skipTemplate(src, i); t = { type: "tmpl" }; }
    else if (ch === "/" && regexAllowed()) { i = skipRegex(src, i); t = { type: "regex" }; }
    else if (ID_START.test(ch) || DIGIT.test(ch)) {
      const num = DIGIT.test(ch);
      i++;
      while (i < src.length && (ID_PART.test(src[i]) || (num && src[i] === "."))) i++;
      t = { type: "word", value: src.slice(start, i) };
    } else if (ch === "=") {
      const v = src[i + 1] === "=" ? (src[i + 2] === "=" ? "===" : "==") : src[i + 1] === ">" ? "=>" : "=";
      i += v.length;
      t = { type: "punct", value: v };
    } else {
      i++;
      t = { type: "punct", value: ch };
    }
    t.start = start;
    t.end = i;
    prev = t;
    yield t;
  }
}

/** Texto de una cadena "…"/'…' sin comillas (crudo, sin decodificar escapes). */
const strInner = (src, t) => src.slice(t.start + 1, Math.max(t.start + 1, t.end - 1));
const OPEN = { "[": "]", "{": "}", "(": ")" };
const CLOSERS = new Set(["]", "}", ")"]);

/**
 * Busca `Mercy.DEFAULT_COUPONS = …` y devuelve los rangos a reemplazar por `[];` y los de cada valor de `couponCode`.
 * → { coupons: [{ start, end }], codes: [{ start, end }] }
 */
function findEdits(src) {
  const toks = [...tokenize(src)];
  const coupons = [];
  const codes = [];
  const isWord = (k, v) => toks[k]?.type === "word" && toks[k].value === v;
  const isPunct = (k, v) => toks[k]?.type === "punct" && toks[k].value === v;
  for (let k = 0; k < toks.length; k++) {
    // Mercy.DEFAULT_COUPONS = <valor>
    if (isWord(k, "Mercy") && isPunct(k + 1, ".") && isWord(k + 2, "DEFAULT_COUPONS") && isPunct(k + 3, "=")) {
      const v = k + 4;
      if (!toks[v]) { coupons.push({ start: toks[k + 3].end, end: src.length }); break; }
      let end = src.length; // si el literal no termina: hasta el final del archivo
      let next = toks.length;
      const first = toks[v];
      if (first.type === "punct" && OPEN[first.value]) {
        // Literal [ … ] / { … }: hasta su cierre (contando anidados)
        let depth = 0;
        for (let j = v; j < toks.length; j++) {
          const t = toks[j];
          if (t.type !== "punct") continue;
          if (OPEN[t.value]) depth++;
          else if (CLOSERS.has(t.value) && --depth === 0) { end = t.end; next = j + 1; break; }
        }
        const after = toks[next];
        const newLine = after && /\n/.test(src.slice(end, after.start));
        if (after && isPunct(next, ";")) { end = after.end; next++; }
        else if (after && !(newLine && after.type === "word")) next = -1; // la expresión sigue (p. ej. `].map(…)`)
      } else next = -1;
      if (next === -1) {
        // Expresión cualquiera: hasta el ";" del mismo nivel o el final del archivo
        let depth = 0;
        end = src.length;
        next = toks.length;
        for (let j = v; j < toks.length; j++) {
          const t = toks[j];
          if (t.type !== "punct") continue;
          if (OPEN[t.value]) depth++;
          else if (CLOSERS.has(t.value)) {
            if (depth === 0) { end = t.start; next = j; break; } // cierra el bloque que contiene la asignación
            depth--;
          } else if (t.value === ";" && depth === 0) { end = t.end; next = j + 1; break; }
        }
      }
      coupons.push({ start: first.start, end });
      k = next - 1;
      continue;
    }
    // couponCode: "…"  ·  "couponCode": "…"  ·  x.couponCode = "…"
    const t = toks[k];
    const key = (t.type === "word" && t.value === "couponCode") || (t.type === "str" && strInner(src, t) === "couponCode");
    if (key && (isPunct(k + 1, ":") || isPunct(k + 1, "=")) && toks[k + 2]?.type === "str") {
      codes.push({ start: toks[k + 2].start, end: toks[k + 2].end });
    }
  }
  return { coupons, codes };
}

/** Aplica reemplazos sin solapes (los que caen dentro de un tramo ya cortado se descartan). */
function applyEdits(src, edits) {
  const sorted = edits.slice().sort((a, b) => a.start - b.start);
  const kept = [];
  for (const e of sorted) if (!kept.length || e.start >= kept[kept.length - 1].end) kept.push(e);
  let out = "";
  let pos = 0;
  for (const e of kept) { out += src.slice(pos, e.start) + e.text; pos = e.end; }
  return out + src.slice(pos);
}

/** Ejecuta el archivo en un sandbox (como lo hace la siembra) → objeto Mercy en JSON puro, o null si falla. */
function evaluate(code) {
  try {
    const sandbox = { window: {} };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: "defaults.js", timeout: 2000 });
    const M = sandbox.Mercy;
    return M && typeof M === "object" ? JSON.parse(JSON.stringify(M)) : null;
  } catch {
    return null;
  }
}

const compiles = (code) => { try { new vm.Script(code); return true; } catch { return false; } };

/** Lo que debe quedar: igual al original, sin cupones y con couponCode "". */
function expectedPublic(M) {
  const out = structuredClone(M);
  if ("DEFAULT_COUPONS" in out) out.DEFAULT_COUPONS = [];
  const dm = out.DEFAULT_CONTENT?.discountModal;
  if (dm && typeof dm === "object" && "couponCode" in dm) dm.couponCode = "";
  return out;
}

/** Archivo regenerado desde los valores evaluados (último recurso, siempre seguro). */
function regenerate(expected) {
  const lines = [
    "/* Mercy Studio — defaults.js (versión pública generada por el servidor: sin cupones de fábrica). */",
    "window.Mercy = window.Mercy || {};",
  ];
  for (const [k, v] of Object.entries(expected)) {
    if (k === "DEFAULT_COUPONS") continue;
    const json = JSON.stringify(v).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    lines.push(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? `Mercy.${k} = ${json};` : `Mercy[${JSON.stringify(k)}] = ${json};`);
  }
  lines.push("Mercy.DEFAULT_COUPONS = [];");
  return lines.join("\n") + "\n";
}

/**
 * js/defaults.js → versión pública. Nunca lanza.
 * → { code, mode: "cut" | "regenerated" | "unverified" | "stub" }
 *   cut         = recorte por tokens comprobado en vm (lo normal; conserva comentarios y formato)
 *   regenerated = el recorte no pasó la comprobación: se generó desde los valores evaluados
 *   unverified  = el original no se puede ejecutar en vm (p. ej. usa APIs del navegador): recorte sin comprobar
 *   stub        = ni eso compila: solo `Mercy.DEFAULT_COUPONS = []`
 */
export function publicDefaultsJs(source) {
  const src = String(source ?? "");
  let cut = src;
  try {
    const { coupons, codes } = findEdits(src);
    cut = applyEdits(src, [
      ...coupons.map((r) => ({ ...r, text: "[];" })),
      ...codes.map((r) => ({ ...r, text: '""' })),
    ]);
  } catch {
    cut = null;
  }
  const original = evaluate(src);
  if (original) {
    const expected = expectedPublic(original);
    const got = cut !== null ? evaluate(cut) : null;
    if (got && isDeepStrictEqual(got, expected)) return { code: cut, mode: "cut" };
    return { code: regenerate(expected), mode: "regenerated" };
  }
  if (cut !== null && compiles(cut)) return { code: cut, mode: "unverified" };
  return { code: "window.Mercy = window.Mercy || {};\nMercy.DEFAULT_COUPONS = [];\n", mode: "stub" };
}
