/* ==========================================================================
   Mercy Studio — server/lib/util.js
   Utilidades compartidas: ids ordenables, fechas en hora de Colombia, formato
   de pesos, slugs, comparación profunda y normalización para búsquedas.
   ========================================================================== */
import { createHash, randomBytes } from "node:crypto";

/* ---------- Ids ---------- */
// Ordenables por tiempo (base36) + secuencia + aleatorio: "mg1x9k2a00f3a91c".
let lastTs = 0;
let seq = 0;
export function newId(prefix = "") {
  let ts = Date.now();
  if (ts <= lastTs) { ts = lastTs; seq++; } else { lastTs = ts; seq = 0; }
  return prefix + ts.toString(36) + seq.toString(36).padStart(2, "0") + randomBytes(3).toString("hex");
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const nowIso = () => new Date().toISOString();

/* ---------- Fechas (Colombia = UTC-5 fijo, sin horario de verano) ---------- */
const CO_OFFSET_MS = -5 * 60 * 60 * 1000;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Fecha de hoy en Colombia como "AAAA-MM-DD". */
export function colombiaToday(at = Date.now()) {
  return new Date(at + CO_OFFSET_MS).toISOString().slice(0, 10);
}

/** Partes de una fecha ISO en hora de Colombia. */
function coParts(iso) {
  const d = new Date(new Date(iso).getTime() + CO_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** "9 de octubre de 2026, 3:45 p. m." */
export function formatDateTimeEs(iso) {
  const p = coParts(iso);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ampm = p.h < 12 ? "a. m." : "p. m.";
  return `${p.d} de ${MESES[p.m]} de ${p.y}, ${h12}:${String(p.min).padStart(2, "0")} ${ampm}`;
}

/** "AAAA-MM-DD" → "1 de octubre de 2026" */
export function formatDateEs(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** ISO → "2026-10-09 15:45" (hora de Colombia), para CSV. */
export function formatDateTimeCsv(iso) {
  if (!iso) return "";
  const p = coParts(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)}`;
}

/** Año y mes (Colombia) para la carpeta de subidas: ["2026", "10"]. */
export function colombiaYearMonth(at = Date.now()) {
  const s = colombiaToday(at);
  return [s.slice(0, 4), s.slice(5, 7)];
}

/* ---------- Dinero ---------- */
/** 20000 → "$20.000" (COP, sin decimales, separador de miles con punto). */
export function formatCOP(n) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (v < 0 ? "-$" : "$") + s;
}

/* ---------- Texto ---------- */
/** Minúsculas sin tildes, para comparar en búsquedas. */
export function fold(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Foto Camiseta Fe (1).JPG" → "foto-camiseta-fe-1" */
export function slugify(s, max = 40) {
  const out = fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
  return out;
}

/* ---------- Objetos ---------- */
export const clone = (v) => structuredClone(v);
/** Comparación profunda de valores JSON (los normalizadores producen claves en orden estable). */
export const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
