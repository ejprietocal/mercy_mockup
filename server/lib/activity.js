/* ==========================================================================
   Mercy Studio — server/lib/activity.js
   Registro de actividad (activity.json, máx. 5000, la más reciente primero).
   { id, at, user: { id, name }, action, entity, entityId, label }
   ========================================================================== */
import { newId, nowIso } from "./util.js";

export const MAX_ACTIVITY = 5000;
export const SYSTEM_USER = Object.freeze({ id: null, name: "Sistema" });
/** Valor de `userId` en GET /api/admin/activity para las acciones del sistema (user.id null). */
export const SYSTEM_FILTER = "system";

export class Activity {
  constructor(db) { this.db = db; }

  get items() { return this.db.get("activity"); }

  /** Agrega una entrada. Devuelve la promesa de escritura (coalescida). */
  log(user, action, entity, entityId, label) {
    const entry = {
      id: newId("a-"),
      at: nowIso(),
      user: user ? { id: user.id ?? null, name: user.name || "Sistema" } : { ...SYSTEM_USER },
      action,
      entity,
      entityId: entityId ?? null,
      label,
    };
    const list = this.items;
    list.unshift(entry);
    if (list.length > MAX_ACTIVITY) list.length = MAX_ACTIVITY;
    return this.db.save("activity").then(() => entry);
  }

  /** Página de actividad con filtros (`userId: "system"` = acciones del sistema). → { items, next } */
  query({ limit = 100, before = null, entity = null, userId = null, entities = null } = {}) {
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    let list = this.items;
    if (entity) list = list.filter((e) => e.entity === entity);
    if (entities) list = list.filter((e) => entities.includes(e.entity));
    if (userId === SYSTEM_FILTER) list = list.filter((e) => !e.user?.id);
    else if (userId) list = list.filter((e) => e.user?.id === userId);
    let start = 0;
    if (before) {
      const i = list.findIndex((e) => e.id === before);
      start = i === -1 ? list.length : i + 1;
    }
    const items = list.slice(start, start + lim);
    const next = start + lim < list.length && items.length ? items[items.length - 1].id : null;
    return { items, next };
  }
}
