/* ==========================================================================
   Mercy Studio — server/lib/diff.js
   Diferencias entre dos instantáneas de contenido, como rutas legibles:
     home.hero.title · home.marquee[0].text · products[fe].price · products[fe].colors[negro].stock.S
   · Listas de objetos con `id` (o `color` en los colores del producto) se comparan por id.
   · Listas de valores simples se reportan completas (un solo cambio).
   · Se ignoran meta y las marcas updatedAt/updatedBy/createdAt.
   ========================================================================== */
import { deepEqual, isPlainObject } from "./util.js";

const SKIP_KEYS = new Set(["updatedAt", "updatedBy", "createdAt"]);
const isPrimitive = (v) => v === null || typeof v !== "object";

function idKey(a, b) {
  const all = [...a, ...b];
  if (!all.length) return null;
  for (const key of ["id", "color"]) {
    if (all.every((x) => isPlainObject(x) && typeof x[key] === "string")) {
      const ids = (arr) => arr.map((x) => x[key]);
      if (new Set(ids(a)).size === a.length && new Set(ids(b)).size === b.length) return key;
    }
  }
  return null;
}

function walk(a, b, path, st) {
  if (st.out.length >= st.max) { if (!deepEqual(a, b)) st.truncated = true; return; }
  if (deepEqual(a, b)) return;
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      if (SKIP_KEYS.has(k)) continue;
      walk(a[k], b[k], path ? `${path}.${k}` : k, st);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const key = idKey(a, b);
    if (key) {
      const mapA = new Map(a.map((x) => [x[key], x]));
      const mapB = new Map(b.map((x) => [x[key], x]));
      for (const x of b) walk(mapA.get(x[key]), x, `${path}[${x[key]}]`, st);
      for (const x of a) if (!mapB.has(x[key])) walk(x, undefined, `${path}[${x[key]}]`, st);
      // Mismo conjunto pero distinto orden
      const orderA = a.map((x) => x[key]).filter((id) => mapB.has(id));
      const orderB = b.map((x) => x[key]).filter((id) => mapA.has(id));
      if (!deepEqual(orderA, orderB) && st.out.length < st.max) st.out.push({ path: `${path} (orden)`, before: orderA, after: orderB });
      return;
    }
    if (a.every(isPrimitive) && b.every(isPrimitive)) {
      st.out.push({ path, before: a, after: b });
      return;
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`, st);
    return;
  }
  st.out.push({ path, before: a === undefined ? null : a, after: b === undefined ? null : b });
}

/** → { changes: [{ path, before, after }], truncated } */
export function diffContent(before, after, max = 150) {
  const st = { out: [], max, truncated: false };
  const a = isPlainObject(before) ? before : {};
  const b = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => k !== "meta" && k !== "schemaVersion");
  for (const k of keys) walk(a[k], b[k], k, st);
  return { changes: st.out, truncated: st.truncated };
}
