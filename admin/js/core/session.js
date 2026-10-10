/* ==========================================================================
   Mercy Studio · Panel — core/session.js
   Usuario actual y permisos (contrato §5).
   · session.user → { id, name, email, role, active, createdAt, updatedAt, lastLoginAt } | null
   · can("admin") · can(["admin", "editor"]) · can() (sin roles = cualquiera con sesión)
   · session.onChange(fn) avisa cuando cambia el usuario (p. ej. tras editar "Mi perfil").
   El servidor SIEMPRE vuelve a verificar el rol: aquí solo se ocultan cosas.
   ========================================================================== */
import { api } from "./api.js";

export const ROLES = ["admin", "editor"];
export const ROLE_LABELS = { admin: "Administrador", editor: "Editor" };

let current = null;
const listeners = new Set();

/** ¿El usuario actual tiene alguno de estos roles? Sin roles → true (basta la sesión). */
export function can(roles) {
  if (!current) return false;
  if (roles === undefined || roles === null) return true;
  const list = Array.isArray(roles) ? roles : [roles];
  return list.length === 0 || list.includes(current.role);
}

export const session = {
  get user() { return current; },
  get role() { return current?.role || null; },
  get isAdmin() { return current?.role === "admin"; },
  get roleLabel() { return ROLE_LABELS[current?.role] || ""; },
  can,

  /** GET /api/auth/me (un 401 redirige al login). */
  async load() {
    const { user } = await api.get("/api/auth/me");
    this.set(user);
    return user;
  },

  set(user) {
    current = user || null;
    for (const fn of listeners) {
      try { fn(current); } catch (e) { console.error(e); }
    }
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Cierra la sesión en el servidor y vuelve al ingreso. */
  async logout() {
    try {
      await api.post("/api/auth/logout", undefined, { auth: false });
    } catch {
      // aunque falle la red, se sale igual (la cookie expira sola)
    }
    current = null;
    location.assign("login.html?salida=1");
  },
};
