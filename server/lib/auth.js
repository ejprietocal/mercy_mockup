/* ==========================================================================
   Mercy Studio — server/lib/auth.js
   Autenticación y usuarios:
   · Contraseñas con scrypt (N=16384, r=8, p=1, 64 bytes, sal 16 bytes) y timingSafeEqual.
   · Sesiones: token aleatorio de 32 bytes en la cookie mercy_sid; en sessions.json solo su SHA-256.
     12 h deslizantes (30 días con "Recordarme"). Cookie indicadora mercy_admin=1 (sin secreto).
   · CSRF: no-GET a /api/auth/* y /api/admin/* exige X-Mercy-Admin: 1 y Origin del mismo host.
   · Límite de intentos de login: 5 fallos/15 min por IP+correo y 30/15 min por IP.
   · Usuarios con roles admin/editor y las protecciones del contrato (último admin activo…).
   ========================================================================== */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { err, requestHost, serializeCookie } from "./http.js";
import { normalizeEmail, passwordError, validEmail, validateUser } from "./validate.js";
import { newId, nowIso, sha256 } from "./util.js";

const scrypt = promisify(scryptCb);

export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_TTL = 12 * 60 * 60 * 1000;
export const REMEMBER_TTL = 30 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY = 60 * 1000;
export const COOKIE_SID = "mercy_sid";
export const COOKIE_FLAG = "mercy_admin";
const LOGIN_WINDOW = 15 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/* ---------- Contraseñas ---------- */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const hash = await scrypt(String(password).normalize("NFKC"), salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  // Límites: evita que un archivo alterado consuma memoria sin control
  if (![N, r, p].every(Number.isInteger) || N < 1024 || N > 65536 || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!salt.length || expected.length < 16 || expected.length > 128) return false;
  const got = await scrypt(String(password).normalize("NFKC"), salt, expected.length, { N, r, p, maxmem: 128 * N * r * p + 1024 * 1024 });
  return timingSafeEqual(got, expected);
}

/* ---------- Usuario público (nunca passwordHash) ---------- */
export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt || null,
  };
}

export class AuthService {
  constructor(app) {
    this.app = app;
    this.db = app.db;
    this.initialAdmin = null; // { email, password, generated } la vez que se crea
  }

  get users() { return this.db.get("users"); }
  get sessions() { return this.db.get("sessions"); }
  userById(id) { return this.users.find((u) => u.id === id) || null; }
  userByEmail(email) { const e = normalizeEmail(email); return this.users.find((u) => u.email === e) || null; }
  activeAdmins() { return this.users.filter((u) => u.role === "admin" && u.active); }

  async init() {
    await this.db.load("users", []);
    await this.db.load("sessions", [], { pretty: false });
    this.dummyHash = await hashPassword(randomBytes(18).toString("base64url"));
    await this.#purge();
    await this.#seedAdmin();
    this.timer = setInterval(() => this.#purge().catch(() => {}), 60 * 60 * 1000);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  async #purge() {
    const now = Date.now();
    const list = this.sessions;
    const alive = list.filter((s) => s && s.expiresAt > now && this.userById(s.userId)?.active);
    if (alive.length !== list.length) await this.db.set("sessions", alive);
  }

  /** Crea el primer administrador (o lo restablece con ADMIN_RESET=1). */
  async #seedAdmin() {
    const cfg = this.app.config;
    if (this.users.length && !cfg.adminReset) return;
    const email = normalizeEmail(cfg.adminEmail || "admin@mercystudio.co");
    if (!validEmail(email)) throw new Error(`ADMIN_EMAIL no es un correo válido: "${cfg.adminEmail}"`);
    let password = cfg.adminPassword || "";
    let generated = false;
    if (password) {
      const e = passwordError(password);
      if (e) throw new Error(`ADMIN_PASSWORD no es válida: ${e}`);
    } else {
      password = randomBytes(12).toString("base64url");
      generated = true;
    }
    const now = nowIso();
    const existing = this.userByEmail(email);
    let action;
    if (existing) {
      if (!cfg.adminReset) return;
      existing.passwordHash = await hashPassword(password);
      existing.role = "admin";
      existing.active = true;
      existing.updatedAt = now;
      await this.db.save("users");
      await this.db.set("sessions", this.sessions.filter((s) => s.userId !== existing.id));
      action = "restablecido";
      // Acción del sistema (user.id null): se ve en Actividad con el filtro userId=system
      await this.app.activity.log(null, "password", "user", existing.id, `Acceso de «${existing.name}» restablecido al arrancar (ADMIN_RESET)`);
    } else {
      const id = newId("u-");
      this.users.push({
        id,
        name: cfg.adminName || "Administrador",
        email,
        role: "admin",
        active: true,
        passwordHash: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      });
      await this.db.save("users");
      action = "creado";
      await this.app.activity.log(null, "create", "user", id, `Administrador «${cfg.adminName || "Administrador"}» creado al arrancar (ADMIN_EMAIL${cfg.adminReset ? ", ADMIN_RESET" : ""})`);
    }
    this.initialAdmin = { email, password, generated };
    const lines = [
      "",
      "================================================================",
      `  Mercy Studio · usuario administrador ${action}`,
      `  Correo:     ${email}`,
      generated ? `  Contraseña: ${password}   (generada; se muestra SOLO esta vez)` : "  Contraseña: la definida en ADMIN_PASSWORD",
      "  Entra en /admin/ y cámbiala en «Mi perfil».",
      "================================================================",
      "",
    ];
    (cfg.announce || console.log)(lines.join("\n"));
  }

  /* ---------- Sesiones ---------- */
  #ttl(s) { return s.remember ? REMEMBER_TTL : SESSION_TTL; }

  cookies(token, session, secure) {
    const maxAge = Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000));
    return [
      serializeCookie(COOKIE_SID, token, { maxAge, httpOnly: true, sameSite: "Strict", secure }),
      serializeCookie(COOKIE_FLAG, "1", { maxAge, sameSite: "Lax", secure }),
    ];
  }

  clearCookies(secure) {
    return [
      serializeCookie(COOKIE_SID, "", { maxAge: 0, httpOnly: true, sameSite: "Strict", secure }),
      serializeCookie(COOKIE_FLAG, "", { maxAge: 0, sameSite: "Lax", secure }),
    ];
  }

  async createSession(user, remember) {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const session = { id: sha256(token), userId: user.id, remember: !!remember, createdAt: new Date(now).toISOString(), lastSeenAt: now, expiresAt: now + (remember ? REMEMBER_TTL : SESSION_TTL) };
    this.sessions.push(session);
    await this.db.save("sessions");
    return { token, session };
  }

  async destroySession(id) {
    const list = this.sessions;
    if (list.some((s) => s.id === id)) await this.db.set("sessions", list.filter((s) => s.id !== id));
  }

  /** Cierra todas las sesiones de un usuario (salvo `exceptId`). */
  async destroyUserSessions(userId, exceptId = null) {
    const list = this.sessions;
    const next = list.filter((s) => s.userId !== userId || s.id === exceptId);
    if (next.length !== list.length) await this.db.set("sessions", next);
  }

  /** Lee la sesión de la cookie. → { user, session, token } | { invalid: true } | null */
  authenticate(ctx) {
    const token = ctx.cookies[COOKIE_SID];
    if (!token) return null;
    if (!TOKEN_RE.test(token)) return { invalid: true };
    const id = sha256(token);
    const s = this.sessions.find((x) => x.id === id);
    const now = Date.now();
    if (!s) return { invalid: true };
    const user = this.userById(s.userId);
    if (s.expiresAt <= now || !user || !user.active) {
      this.destroySession(id).catch(() => {});
      return { invalid: true };
    }
    if (now - s.lastSeenAt >= TOUCH_EVERY) {
      s.lastSeenAt = now;
      s.expiresAt = now + this.#ttl(s);
      this.db.save("sessions").catch((e) => this.app.config.log(`[sesiones] no se pudo guardar: ${e.message}`));
      ctx.setCookies.push(...this.cookies(token, s, ctx.secure));
    }
    return { user, session: s, token };
  }

  /** Middleware: exige sesión válida. */
  requireAuth = (ctx) => {
    const r = this.authenticate(ctx);
    if (!r || r.invalid) {
      if (r?.invalid || ctx.cookies[COOKIE_FLAG]) ctx.setCookies.push(...this.clearCookies(ctx.secure));
      throw err.unauthorized("Tu sesión expiró o no has iniciado sesión. Vuelve a entrar.");
    }
    ctx.user = r.user;
    ctx.session = r.session;
  };

  /** Middleware: exige rol. */
  requireRole(role) {
    return (ctx) => {
      if (ctx.user?.role !== role) throw err.forbidden("Solo un administrador puede hacer esto.");
    };
  }

  /** CSRF para no-GET en /api/auth/* y /api/admin/*. */
  checkCsrf(ctx) {
    if (ctx.req.headers["x-mercy-admin"] !== "1") throw err.forbidden("Petición rechazada por seguridad (falta la cabecera X-Mercy-Admin).");
    const origin = ctx.req.headers.origin;
    if (origin !== undefined) {
      let host = null;
      try { host = new URL(origin).host.toLowerCase(); } catch { /* origen inválido o "null" */ }
      const own = requestHost(ctx.req, this.app.config.trustProxy);
      if (!host || !own || host !== own) throw err.forbidden("Petición rechazada por seguridad (origen no permitido).");
    }
  }

  /* ---------- Login / logout ---------- */
  async login(body, ctx) {
    const b = body && typeof body === "object" ? body : {};
    const email = normalizeEmail(b.email);
    const password = typeof b.password === "string" ? b.password : "";
    if (!email || !password) {
      const fields = {};
      if (!email) fields.email = "Escribe tu correo.";
      if (!password) fields.password = "Escribe tu contraseña.";
      throw err.validation(fields, "Escribe tu correo y tu contraseña.");
    }
    const lim = this.app.limiter;
    const kPair = `login:${ctx.ip}|${email}`;
    const kIp = `login:${ctx.ip}`;
    const a = lim.check(kPair, 5, LOGIN_WINDOW);
    const c = lim.check(kIp, 30, LOGIN_WINDOW);
    if (!a.ok || !c.ok) throw err.rateLimited(Math.max(a.retryAfter, c.retryAfter));

    const user = this.userByEmail(email);
    const ok = password.length <= 1024 && (await verifyPassword(password, user ? user.passwordHash : this.dummyHash));
    if (!user || !ok) {
      lim.add(kPair, 5, LOGIN_WINDOW);
      lim.add(kIp, 30, LOGIN_WINDOW);
      throw err.unauthorized("Correo o contraseña incorrectos.");
    }
    if (!user.active) throw err.forbidden("Tu usuario está desactivado. Pide a un administrador que lo active.");
    lim.reset(kPair);
    return this.db.tx(async () => {
      user.lastLoginAt = nowIso();
      await this.db.save("users");
      const { token, session } = await this.createSession(user, b.remember === true);
      await this.app.activity.log(user, "login", "session", user.id, `${user.name} inició sesión`);
      ctx.setCookies.push(...this.cookies(token, session, ctx.secure));
      return publicUser(user);
    });
  }

  async logout(ctx) {
    const r = this.authenticate(ctx);
    if (r && !r.invalid) {
      await this.db.tx(async () => {
        await this.destroySession(r.session.id);
        await this.app.activity.log(r.user, "logout", "session", r.user.id, `${r.user.name} cerró sesión`);
      });
    }
    ctx.setCookies.push(...this.clearCookies(ctx.secure));
    return { ok: true };
  }

  /* ---------- Mi perfil ---------- */
  updateMe(ctx, body) {
    return this.db.tx(async () => {
      const me = ctx.user;
      const { value, fields } = validateUser(body, { partial: true });
      if (Object.keys(fields).length) throw err.validation(fields);
      const dup = this.userByEmail(value.email);
      if (dup && dup.id !== me.id) throw err.conflict("Ya existe un usuario con ese correo.", { fields: { email: "Ya existe un usuario con ese correo." } });
      if (value.name === me.name && value.email === me.email) return publicUser(me);
      me.name = value.name;
      me.email = value.email;
      me.updatedAt = nowIso();
      await this.db.save("users");
      await this.app.activity.log(me, "update", "user", me.id, `Usuario «${me.name}» actualizado (perfil)`);
      return publicUser(me);
    });
  }

  async changePassword(ctx, body) {
    const me = ctx.user;
    const b = body && typeof body === "object" ? body : {};
    const current = typeof b.currentPassword === "string" ? b.currentPassword : "";
    const next = b.newPassword;
    const fields = {};
    if (!current) fields.currentPassword = "Escribe tu contraseña actual.";
    const pe = passwordError(next);
    if (pe) fields.newPassword = pe;
    if (Object.keys(fields).length) throw err.validation(fields);
    const key = `password:${ctx.ip}|${me.id}`;
    const lim = this.app.limiter.check(key, 5, LOGIN_WINDOW);
    if (!lim.ok) throw err.rateLimited(lim.retryAfter);
    if (current.length > 1024 || !(await verifyPassword(current, me.passwordHash))) {
      this.app.limiter.add(key, 5, LOGIN_WINDOW);
      throw err.validation({ currentPassword: "La contraseña actual no es correcta." }, "La contraseña actual no es correcta.");
    }
    const hash = await hashPassword(next);
    return this.db.tx(async () => {
      me.passwordHash = hash;
      me.updatedAt = nowIso();
      await this.db.save("users");
      await this.destroyUserSessions(me.id, ctx.session.id);
      await this.app.activity.log(me, "password", "user", me.id, `${me.name} cambió su contraseña`);
      return { ok: true };
    });
  }

  /* ---------- Administración de usuarios ---------- */
  listUsers() {
    return [...this.users].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(publicUser);
  }

  async createUser(ctx, body) {
    const { value, fields } = validateUser(body, { requirePassword: true });
    if (Object.keys(fields).length) throw err.validation(fields);
    const hash = await hashPassword(value.password);
    return this.db.tx(async () => {
      if (this.userByEmail(value.email)) throw err.conflict("Ya existe un usuario con ese correo.", { fields: { email: "Ya existe un usuario con ese correo." } });
      const now = nowIso();
      const u = { id: newId("u-"), name: value.name, email: value.email, role: value.role, active: value.active, passwordHash: hash, createdAt: now, updatedAt: now, lastLoginAt: null };
      this.users.push(u);
      await this.db.save("users");
      await this.app.activity.log(ctx.user, "create", "user", u.id, `Usuario «${u.name}» creado (${u.role === "admin" ? "Administrador" : "Editor"})`);
      return publicUser(u);
    });
  }

  /** `baseUpdatedAt` (X-Base-Updated-At = updatedAt leído) distinto del actual → 409 conflict con `current`. */
  async updateUser(ctx, id, body, { baseUpdatedAt } = {}) {
    const { value, fields } = validateUser(body);
    if (Object.keys(fields).length) throw err.validation(fields);
    const hash = value.password ? await hashPassword(value.password) : null;
    return this.db.tx(async () => {
      const u = this.userById(id);
      if (!u) throw err.notFound("El usuario no existe.");
      if (baseUpdatedAt && baseUpdatedAt !== u.updatedAt) {
        throw err.conflict(`Otra persona guardó cambios en el usuario «${u.name}» mientras lo editabas. Recarga para ver la versión actual (tus cambios no se guardaron).`, { current: publicUser(u) });
      }
      const self = u.id === ctx.user.id;
      if (self && !value.active) throw err.conflict("No puedes desactivar tu propio usuario.", { fields: { active: "No puedes desactivarte a ti mismo." } });
      const losesAdmin = u.role === "admin" && u.active && (value.role !== "admin" || !value.active);
      if (losesAdmin && this.activeAdmins().length <= 1) {
        throw err.conflict("Debe quedar al menos un administrador activo.", { fields: { role: "Debe quedar al menos un administrador activo." } });
      }
      const dup = this.userByEmail(value.email);
      if (dup && dup.id !== id) throw err.conflict("Ya existe un usuario con ese correo.", { fields: { email: "Ya existe un usuario con ese correo." } });
      const deactivated = u.active && !value.active;
      Object.assign(u, { name: value.name, email: value.email, role: value.role, active: value.active, updatedAt: nowIso() });
      if (hash) u.passwordHash = hash;
      await this.db.save("users");
      if (deactivated) await this.destroyUserSessions(u.id);
      else if (hash) await this.destroyUserSessions(u.id, self ? ctx.session.id : null);
      await this.app.activity.log(ctx.user, "update", "user", u.id, `Usuario «${u.name}» actualizado${deactivated ? " (desactivado)" : ""}`);
      if (hash) await this.app.activity.log(ctx.user, "password", "user", u.id, `Contraseña de «${u.name}» cambiada`);
      return publicUser(u);
    });
  }

  deleteUser(ctx, id) {
    return this.db.tx(async () => {
      const u = this.userById(id);
      if (!u) throw err.notFound("El usuario no existe.");
      if (u.id === ctx.user.id) throw err.conflict("No puedes eliminar tu propio usuario.");
      if (u.role === "admin" && u.active && this.activeAdmins().length <= 1) throw err.conflict("Debe quedar al menos un administrador activo.");
      await this.db.set("users", this.users.filter((x) => x.id !== id));
      await this.destroyUserSessions(id);
      await this.app.activity.log(ctx.user, "delete", "user", id, `Usuario «${u.name}» eliminado`);
      return { ok: true };
    });
  }
}
