/* ==========================================================================
   Mercy Studio · Panel — core/router.js
   Rutas hash del panel (contrato §7): "#/productos/fe?tab=fotos".
   · Cada vista registra [{ path: "/productos/:id", title, roles, render(el, params, ctx) → cleanup? }].
   · Las rutas fijas ganan a las de parámetro (/productos/nuevo antes que /productos/:id).
   · Guardas por rol → vista "Sin permiso"; ruta desconocida → "Página no encontrada".
   · document.title = "<Página> · Panel Mercy Studio".
   · Protección de salida: si una vista tiene cambios sin guardar (ctx.guard), se pregunta antes de salir
     (navegación interna) y el navegador avisa al cerrar/recargar la pestaña.
   ========================================================================== */
import { h } from "./dom.js";
import { session } from "./session.js";
import { isAbort } from "./api.js";
import { card, confirmDialog, emptyState, errorState, pageHeader, setLinkAccess, skeleton } from "./ui.js";

export const APP_TITLE = "Panel Mercy Studio";
const routes = [];
const listeners = new Set();
let outlet = null;
let current = null;
let currentHash = "#/";
let token = 0;
let bypassGuardOnce = false;
let started = false;
let leaving = false; // salida al ingreso ya confirmada: el navegador no vuelve a preguntar

/* ---------- Registro ---------- */
function compile(path) {
  const parts = path.split("/").filter(Boolean);
  return { parts, statics: parts.filter((p) => p[0] !== ":").length };
}

/**
 * Registra rutas. Acepta una lista o un solo objeto:
 *   { path: "/cupones/:id", title: "Cupón" | (params) => "…", roles: ["admin"], render: (el, params, ctx) => {…} }
 */
export function registerRoutes(list, { source = "" } = {}) {
  const arr = Array.isArray(list) ? list : [list];
  for (const r of arr) {
    if (!r || typeof r.path !== "string" || !r.path.startsWith("/") || typeof r.render !== "function") {
      console.error(`[router] Ruta inválida${source ? ` en ${source}` : ""}:`, r);
      continue;
    }
    const exists = routes.findIndex((x) => x.path === r.path);
    const rec = { ...r, source, ...compile(r.path) };
    if (exists !== -1) {
      console.warn(`[router] La ruta ${r.path} se registró dos veces (${routes[exists].source} y ${source}); gana la última.`);
      routes[exists] = rec;
    } else routes.push(rec);
  }
  routes.sort((a, b) => b.statics - a.statics || a.parts.length - b.parts.length);
}

export const allRoutes = () => routes.slice();

/** Busca la ruta de un path ("/productos/fe") → { route, params } | null */
export function matchRoute(path) {
  const segs = path.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const p = r.parts[i];
      if (p[0] === ":") {
        try { params[p.slice(1)] = decodeURIComponent(segs[i]); } catch { ok = false; break; }
      } else if (p !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

export function canAccess(route) {
  return !!route && session.can(route.roles);
}

// ui.canOpen()/describeUsage() usan las roles reales de las rutas (sin enlaces a secciones que el rol no puede abrir)
setLinkAccess((path) => {
  const m = matchRoute(path);
  return m ? canAccess(m.route) : null;
});

/** "#/productos/fe?tab=x" → { path: "/productos/fe", query: URLSearchParams } */
export function parseHash(hash = location.hash) {
  let raw = String(hash || "").replace(/^#/, "");
  if (!raw) raw = "/";
  const qi = raw.indexOf("?");
  const p = qi === -1 ? raw : raw.slice(0, qi);
  const q = qi === -1 ? "" : raw.slice(qi + 1);
  return { path: "/" + p.split("/").filter(Boolean).join("/"), query: new URLSearchParams(q) };
}

function normalizeHash(to) {
  let s = String(to || "/");
  if (s.startsWith("#")) s = s.slice(1);
  if (!s.startsWith("/")) s = "/" + s;
  return "#" + s;
}

/* ---------- Estado / eventos ---------- */
/** fn({ path, route, params, title, query }) cada vez que cambia la vista o su título. */
export function onRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(extra = {}) {
  const info = { path: current?.path, route: current?.route || null, params: current?.params || {}, query: current?.query, title: current?.title || "", ...extra };
  for (const fn of listeners) {
    try { fn(info); } catch (e) { console.error(e); }
  }
}

export const currentRoute = () => current;

function titleOf(route, params) {
  try {
    return typeof route.title === "function" ? route.title(params) || "" : route.title || "";
  } catch {
    return "";
  }
}

function setDocTitle(t) {
  if (current) current.title = t;
  document.title = t ? `${t} · ${APP_TITLE}` : APP_TITLE;
}

/** ¿La vista actual tiene cambios sin guardar? */
export function isDirty() {
  if (!current) return false;
  for (const g of current.guards) {
    try { if (g()) return true; } catch { /* guarda rota: se ignora */ }
  }
  return false;
}

function confirmLeave() {
  return confirmDialog({
    title: "¿Salir sin guardar?",
    message: "Tienes cambios sin guardar en esta página. Si sales ahora, se perderán.",
    confirmLabel: "Salir sin guardar",
    cancelLabel: "Seguir editando",
    danger: true,
  });
}

/* ---------- Navegación ---------- */
/**
 * navigate("/productos/fe") · navigate("#/cupones", { replace: true }) · navigate("/", { force: true }) (sin preguntar)
 * → Promise<boolean> (false si la persona decidió quedarse).
 */
export async function navigate(to, { replace = false, force = false } = {}) {
  const hash = normalizeHash(to);
  if (!force && isDirty() && !(await confirmLeave())) return false;
  if (replace || hash === location.hash) {
    history.replaceState(null, "", hash);
    await render(hash);
  } else {
    bypassGuardOnce = true; // ya se preguntó (o se forzó): el hashchange no vuelve a preguntar
    location.hash = hash;
  }
  return true;
}

/** Sale del panel a otra página (p. ej. al ingreso) sin el aviso del navegador: la persona ya decidió salir. */
export function leaveTo(url) {
  leaving = true;
  location.assign(url);
  setTimeout(() => { leaving = false; }, 3000);
}

/** Vuelve a dibujar la vista actual ({ force: true } = sin preguntar por cambios sin guardar). */
export async function reload({ force = false } = {}) {
  if (!force && isDirty() && !(await confirmLeave())) return false;
  await render(currentHash);
  return true;
}

/** Cambia la query de la ruta actual sin volver a dibujar (p. ej. la pestaña abierta). */
export function setQuery(obj = {}, { replace = true } = {}) {
  if (!current) return;
  const q = new URLSearchParams(current.query);
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  const hash = `#${current.path}${s ? "?" + s : ""}`;
  if (replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
  currentHash = hash;
  current.hash = hash;
  current.query = q;
}

async function onHashChange() {
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/")) {
    // Anclas internas (#main…) no son rutas: se deja la vista como está
    history.replaceState(null, "", currentHash);
    return;
  }
  if (hash === currentHash) return;
  if (bypassGuardOnce) {
    bypassGuardOnce = false;
  } else if (isDirty()) {
    const target = hash;
    history.replaceState(null, "", currentHash);
    if (!(await confirmLeave())) return;
    history.pushState(null, "", target);
    await render(target);
    return;
  }
  await render(hash);
}

function teardown() {
  if (!current) return;
  try { current.controller.abort(); } catch { /* nada */ }
  for (const fn of current.cleanups.splice(0).reverse()) {
    try { fn(); } catch (e) { console.error(e); }
  }
  current.guards.clear();
}

function focusHeading(el) {
  const target = el.querySelector("h1") || outlet;
  if (target && typeof target.focus === "function") {
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
}

function forbiddenView() {
  return h("div.page",
    pageHeader({ title: "Sin permiso" }),
    card({ body: emptyState({ icon: "lock", title: "No tienes permiso para ver esta sección", message: "Esta sección es solo para administradores. Si necesitas acceso, pídeselo a un administrador del equipo.", action: { label: "Ir al Escritorio", href: "#/", icon: "dashboard" } }) }));
}

function notFoundView() {
  return h("div.page",
    pageHeader({ title: "Página no encontrada" }),
    card({ body: emptyState({ icon: "search", title: "Esta página del panel no existe", message: "Revisa la dirección o vuelve al Escritorio.", action: { label: "Ir al Escritorio", href: "#/", icon: "dashboard" } }) }));
}

async function render(hash, { focus = true } = {}) {
  const my = ++token;
  teardown();
  currentHash = hash;
  const { path, query } = parseHash(hash);
  const m = matchRoute(path);
  const controller = new AbortController();
  current = { hash, path, query, route: m?.route || null, params: m?.params || {}, controller, cleanups: [], guards: new Set(), title: "" };
  const state = current;

  const el = h("div.view__content", { hidden: true });
  const loading = h("div.view__loading");
  const view = h("div.view", loading, el);
  outlet.replaceChildren(view);
  outlet.setAttribute("aria-busy", "true");
  window.scrollTo(0, 0);
  const done = () => {
    loading.remove();
    el.hidden = false;
    outlet.removeAttribute("aria-busy");
    if (focus) focusHeading(el);
  };

  if (!m || !canAccess(m.route)) {
    setDocTitle(m ? "Sin permiso" : "Página no encontrada");
    el.append(m ? forbiddenView() : notFoundView());
    emit();
    done();
    return;
  }

  setDocTitle(titleOf(m.route, m.params));
  emit();
  const ctx = {
    route: m.route,
    params: m.params,
    path,
    get query() { return state.query; },
    get user() { return session.user; },
    get isAdmin() { return session.isAdmin; },
    can: (roles) => session.can(roles),
    signal: controller.signal,
    get isCurrent() { return my === token; },
    onCleanup(fn) { if (typeof fn === "function") state.cleanups.push(fn); },
    guard(fn) { state.guards.add(fn); return () => state.guards.delete(fn); },
    setTitle(t) { if (my !== token) return; setDocTitle(t); emit({ title: t }); },
    navigate,
    reload,
    setQuery,
  };

  const slow = setTimeout(() => { if (my === token) loading.append(skeleton()); }, 140);
  try {
    const r = await m.route.render(el, m.params, ctx);
    if (my !== token) {
      if (typeof r === "function") { try { r(); } catch { /* nada */ } }
      return;
    }
    if (typeof r === "function") state.cleanups.push(r);
  } catch (e) {
    if (my !== token || isAbort(e)) return;
    if (e?.status === 401) return; // se está redirigiendo al ingreso
    console.error(`[router] Error al mostrar ${path}:`, e);
    el.replaceChildren(h("div.page", pageHeader({ title: titleOf(m.route, m.params) || "Error" }),
      card({ body: errorState({ error: e, onRetry: () => reload({ force: true }) }) })));
  } finally {
    clearTimeout(slow);
  }
  if (my === token) done();
}

/** Arranca el router dentro de `outletEl` (el <main>). */
export function startRouter(outletEl) {
  if (started) return;
  started = true;
  outlet = outletEl;
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("beforeunload", (e) => {
    if (!leaving && isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  const hash = location.hash && location.hash.startsWith("#/") ? location.hash : "#/";
  if (hash !== location.hash) history.replaceState(null, "", hash);
  render(hash);
}
