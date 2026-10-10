/* ==========================================================================
   Mercy Studio — server/lib/subscribers.js
   Suscriptores (subscribers.json): alta pública deduplicada por correo (minúsculas),
   contador de registros, búsqueda y exportación CSV (UTF-8 con BOM).
   ========================================================================== */
import { err } from "./http.js";
import { normalizeEmail, validEmail } from "./validate.js";
import { formatDateTimeCsv, newId, nowIso } from "./util.js";

export const SOURCES = ["popup", "community", "checkout"];
const SOURCE_LABEL = { popup: "pop-up", community: "comunidad", checkout: "checkout" };

/** Celda CSV segura (comillas y protección contra fórmulas en Excel). */
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class Subscribers {
  constructor(app) {
    this.app = app;
    this.db = app.db;
  }

  async init() { await this.db.load("subscribers", []); }
  get items() { return this.db.get("subscribers"); }

  /** Alta o actualización (count++). → { subscriber, created } */
  subscribe(body, couponCode) {
    const b = body && typeof body === "object" ? body : {};
    const email = normalizeEmail(b.email);
    if (!validEmail(email)) return Promise.reject(err.validation({ email: "Escribe un correo electrónico válido." }, "Escribe un correo electrónico válido."));
    const source = SOURCES.includes(b.source) ? b.source : "popup";
    return this.db.tx(async () => {
      const now = nowIso();
      const list = this.items;
      const i = list.findIndex((s) => s.email === email);
      if (i !== -1) {
        const cur = list[i];
        const next = { ...cur, couponCode: couponCode || cur.couponCode || "", count: (cur.count || 1) + 1, updatedAt: now };
        await this.db.set("subscribers", [next, ...list.slice(0, i), ...list.slice(i + 1)]);
        return { subscriber: next, created: false };
      }
      const s = { id: newId("s-"), email, source, couponCode: couponCode || "", count: 1, createdAt: now, updatedAt: now };
      await this.db.set("subscribers", [s, ...list]);
      return { subscriber: s, created: true };
    });
  }

  list(q) {
    const k = String(q || "").trim().toLowerCase();
    return k ? this.items.filter((s) => s.email.includes(k) || (s.couponCode || "").toLowerCase().includes(k)) : this.items;
  }

  stats() {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return { total: this.items.length, last7d: this.items.filter((s) => Date.parse(s.createdAt) >= since).length };
  }

  remove(id, user) {
    return this.db.tx(async () => {
      const cur = this.items.find((s) => s.id === id);
      if (!cur) throw err.notFound("El suscriptor no existe.");
      await this.db.set("subscribers", this.items.filter((s) => s.id !== id));
      await this.app.activity.log(user, "delete", "subscriber", id, `Suscriptor «${cur.email}» eliminado`);
      return { ok: true };
    });
  }

  csv(q) {
    const rows = [["email", "origen", "cupón", "veces", "creado", "actualizado"]];
    for (const s of this.list(q)) {
      rows.push([s.email, SOURCE_LABEL[s.source] || s.source, s.couponCode || "", s.count || 1, formatDateTimeCsv(s.createdAt), formatDateTimeCsv(s.updatedAt)]);
    }
    return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
}
