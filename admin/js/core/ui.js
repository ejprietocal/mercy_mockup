/* ==========================================================================
   Mercy Studio · Panel — core/ui.js
   Componentes de interfaz (devuelven elementos DOM; ninguno usa HTML en línea):
   · button / iconButton / withBusy / spinner
   · toast · modal · confirmDialog · promptDialog · showApiError (in_use con la lista de usos)
   · pageHeader (migas + acciones) · card · section (bloque con descripción a la izquierda)
   · emptyState · skeleton · errorState ("Reintentar") · notice · badge / statusBadge · statCard
   · tabs · menu (desplegable) · dataTable (búsqueda, filtros, orden, paginación, acciones por fila)
   · revealElement (abre pestañas/acordeones que esconden un campo) · placeholderView
   Accesibilidad: foco visible, Escape cierra, trampa de foco en diálogos, aria-live en avisos.
   ========================================================================== */
import { $, append, focusables, h, srOnly, uid } from "./dom.js";
import { icon } from "./icons.js";
import { ApiError, isAbort } from "./api.js";
import { content } from "./store.js";
import { session } from "./session.js";
import { navFor } from "./nav.js";
import { fold, number } from "./format.js";

/* ==========================================================================
   Botones
   ========================================================================== */
/**
 * button({ label, icon, iconRight, variant: "primary"|"secondary"|"ghost"|"danger"|"link", size: "sm"|"lg",
 *          onClick, href, target, type, disabled, title, ariaLabel, className, block })
 * Con href devuelve <a> (target "_blank" agrega rel="noopener").
 */
export function button({ label = "", icon: ic, iconRight, variant = "secondary", size, onClick, href, target, type = "button", disabled, title, ariaLabel, className, block, attrs } = {}) {
  const cls = ["btn", `btn--${variant}`, size && `btn--${size}`, block && "btn--block", !label && "btn--icon", className];
  const kids = [ic && icon(ic, { size: size === "sm" ? 16 : 18 }), label && h("span.btn__label", label), iconRight && icon(iconRight, { size: 16 })];
  if (href) {
    return h("a", { class: cls, href, target, rel: target === "_blank" ? "noopener" : null, title, "aria-label": ariaLabel, onClick, ...attrs }, kids);
  }
  return h("button", { class: cls, type, disabled, title, "aria-label": ariaLabel, onClick, ...attrs }, kids);
}

/** Botón solo con ícono (con nombre accesible y tooltip). */
export function iconButton({ icon: ic, label, onClick, variant = "ghost", size, href, target, className, disabled, attrs } = {}) {
  return button({ icon: ic, variant, size, onClick, href, target, title: label, ariaLabel: label, className, disabled, attrs });
}

export const spinner = (label = "") => h("span.spinner", { role: label ? "status" : null, "aria-hidden": label ? null : "true" }, label && srOnly(label));

/**
 * withBusy(boton, async () => …, { label: "Guardando…" }) → bloquea el botón mientras corre y lo restaura.
 * Devuelve lo que devuelva la función (o lanza su error).
 */
export async function withBusy(btn, fn, { label } = {}) {
  if (!btn) return fn();
  if (btn.getAttribute("aria-busy") === "true") return undefined;
  const lbl = btn.querySelector(".btn__label");
  const prev = lbl?.textContent;
  const wasDisabled = btn.disabled;
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;
  btn.classList.add("is-busy");
  const sp = spinner();
  btn.prepend(sp);
  if (lbl && label) lbl.textContent = label;
  try {
    return await fn();
  } finally {
    sp.remove();
    btn.classList.remove("is-busy");
    btn.removeAttribute("aria-busy");
    btn.disabled = wasDisabled;
    if (lbl && label) lbl.textContent = prev;
  }
}

/**
 * ¿Se puede ordenar arrastrando? No en pantallas táctiles ni en celulares: ahí el asa se oculta (admin.css) y quedan
 * las flechas. Para que los textos de ayuda no pidan arrastrar algo que no se puede arrastrar.
 */
export function canDrag() {
  try { return !window.matchMedia("(pointer: coarse), (max-width: 720px)").matches; } catch { return true; }
}
/** Ayuda para ordenar según el dispositivo: sortHint() → "Arrastra o usa las flechas para cambiar el orden." */
export const sortHint = (what = "cambiar el orden") => (canDrag() ? `Arrastra o usa las flechas para ${what}.` : `Usa las flechas para ${what}.`);

/* ==========================================================================
   Avisos (toasts)
   ========================================================================== */
const TOAST_ICON = { success: "check-circle", error: "alert-circle", warning: "alert", info: "info" };
const modalStack = []; // <dialog> abiertos con showModal(), del más antiguo al más reciente

/** Diálogo modal abierto más reciente (fuera de él todo queda inerte y detrás del fondo oscuro). */
function topModal(except) {
  for (let i = modalStack.length - 1; i >= 0; i--) {
    const d = modalStack[i];
    if (d !== except && d.isConnected && d.open) return d;
  }
  // <dialog> abiertos por fuera de modal() (no debería pasar, pero no cuesta mirar)
  const native = Array.from(document.querySelectorAll("dialog[open]")).filter((d) => {
    if (d === except) return false;
    try { return d.matches(":modal"); } catch { return true; }
  });
  return native[native.length - 1] || null;
}

/**
 * Región de avisos. Con un <dialog> modal abierto, la región vive DENTRO de ese diálogo: así queda en la capa
 * superior (sobre el fondo oscuro) y sus botones se pueden usar (el resto de la página está inerte). Al cerrar el
 * diálogo, vuelve al siguiente diálogo abierto o al <body> con los avisos que tenga.
 */
function toastRegion({ except } = {}) {
  let r = document.getElementById("toasts");
  if (!r) r = h("div.toasts", { id: "toasts", "aria-live": "polite", "aria-relevant": "additions" });
  const host = topModal(except) || document.body;
  if (r.parentElement !== host) host.append(r);
  return r;
}

/**
 * toast("Cambios guardados.", { type: "success"|"error"|"warning"|"info", title, timeout, action: { label, onClick } })
 * → { dismiss() }. Los errores duran más y se anuncian con role="alert".
 */
export function toast(message, { type = "success", title, timeout, action } = {}) {
  const region = toastRegion();
  const el = h("div.toast", { class: `toast--${type}`, role: type === "error" ? "alert" : "status" },
    icon(TOAST_ICON[type] || "info", { size: 20, className: "toast__icon" }),
    h("div.toast__body", title && h("strong.toast__title", title), h("p.toast__msg", message)),
    action && h("button.toast__action", { type: "button", onClick: () => { dismiss(); action.onClick?.(); } }, action.label),
    h("button.toast__close", { type: "button", "aria-label": "Cerrar aviso", onClick: () => dismiss() }, icon("x", { size: 16 })));
  region.append(el);
  while (region.children.length > 4) region.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add("is-in"));
  const ms = timeout ?? (type === "error" ? 9000 : 4500);
  let timer = null;
  let gone = false;
  const start = () => { if (ms > 0) timer = setTimeout(dismiss, ms); };
  const stop = () => clearTimeout(timer);
  el.addEventListener("mouseenter", stop);
  el.addEventListener("mouseleave", start);
  el.addEventListener("focusin", stop);
  el.addEventListener("focusout", start);
  start();
  function dismiss() {
    if (gone) return;
    gone = true;
    stop();
    el.classList.remove("is-in");
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  }
  return { dismiss, el };
}

/* ==========================================================================
   Diálogos
   ========================================================================== */
let openModals = 0;

/**
 * modal({ title, description, content, size: "sm"|"md"|"lg"|"xl", actions, dismissible, onClose, className, initialFocus })
 *   content: Node | Node[] | (api) => Node
 *   actions: [{ label, variant, icon, value, onClick: async (api) => false|void, autofocus }]
 *     onClick que devuelve false deja el diálogo abierto; si no, se cierra con `value`.
 * → { el, body, footer, close(valor), result: Promise<valor|null>, setBusy(bool) }
 * Escape y clic en el fondo cierran (si dismissible). El foco queda atrapado dentro y vuelve al botón que lo abrió.
 */
export function modal({ title, description, content: body, size = "md", actions = [], dismissible = true, onClose, className, initialFocus } = {}) {
  const titleId = uid("dlg-t");
  const descId = description ? uid("dlg-d") : null;
  const opener = document.activeElement;
  let resolve;
  const result = new Promise((r) => { resolve = r; });
  let closed = false;

  const bodyEl = h("div.modal__body");
  const footer = actions.length ? h("div.modal__footer") : null;
  const panel = h("div.modal__panel",
    h("header.modal__header",
      h("div.modal__titles", h("h2.modal__title", { id: titleId }, title), description && h("p.modal__desc", { id: descId }, description)),
      dismissible && iconButton({ icon: "x", label: "Cerrar", onClick: () => close(null), className: "modal__x" })),
    bodyEl,
    footer);
  const dlg = h("dialog.modal", { class: [`modal--${size}`, className], "aria-labelledby": titleId, "aria-describedby": descId }, panel);

  const api = { el: dlg, body: bodyEl, footer, close, result, setBusy };
  const kids = typeof body === "function" ? body(api) : body;
  append(bodyEl, kids);

  for (const a of actions) {
    const b = button({ label: a.label, icon: a.icon, variant: a.variant || "secondary", attrs: a.autofocus ? { "data-autofocus": "" } : undefined });
    b.addEventListener("click", async () => {
      if (a.onClick) {
        let r;
        try {
          r = await withBusy(b, () => a.onClick(api), { label: a.busyLabel });
        } catch (e) {
          showApiError(e);
          return;
        }
        if (r === false) return;
      }
      close(a.value !== undefined ? a.value : a.label);
    });
    footer.append(b);
  }

  function setBusy(busy) {
    for (const b of dlg.querySelectorAll(".modal__footer .btn, .modal__x")) b.disabled = !!busy;
  }

  // Un enlace dentro del diálogo (p. ej. a un producto) o el botón Atrás cambian la ruta: el diálogo se cierra
  const onRouteChange = () => close(null);
  window.addEventListener("hashchange", onRouteChange);

  function close(value = null) {
    if (closed) return;
    closed = true;
    window.removeEventListener("hashchange", onRouteChange);
    const si = modalStack.indexOf(dlg);
    if (si !== -1) modalStack.splice(si, 1);
    // Los avisos que se mostraron sobre este diálogo siguen visibles después de cerrarlo
    if (document.getElementById("toasts")?.parentElement === dlg) toastRegion({ except: dlg });
    try { dlg.close(); } catch { /* ya cerrado */ }
    dlg.remove();
    openModals = Math.max(0, openModals - 1);
    if (!openModals) document.documentElement.classList.remove("has-modal");
    if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    try { onClose?.(value); } finally { resolve(value); }
  }

  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (dismissible) close(null);
  });
  // Clic en el fondo (solo si el clic empezó y terminó fuera del panel)
  let downOnBackdrop = false;
  dlg.addEventListener("mousedown", (e) => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener("click", (e) => {
    if (dismissible && downOnBackdrop && e.target === dlg) close(null);
    downOnBackdrop = false;
  });
  // Trampa de foco
  dlg.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = focusables(dlg);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  document.body.append(dlg);
  openModals++;
  document.documentElement.classList.add("has-modal");
  dlg.showModal();
  modalStack.push(dlg);
  const target = (typeof initialFocus === "string" ? $(initialFocus, dlg) : initialFocus)
    || $("[data-autofocus]", bodyEl) || $("[autofocus]", bodyEl)
    || focusables(bodyEl).find((el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
    || $("[data-autofocus]", dlg) || focusables(dlg).find((el) => !el.classList.contains("modal__x")) || panel;
  if (target === panel) panel.setAttribute("tabindex", "-1");
  requestAnimationFrame(() => target.focus({ preventScroll: true }));
  return api;
}

/**
 * confirmDialog({ title, message, confirmLabel, cancelLabel, danger, details }) → Promise<boolean>
 *   if (await confirmDialog({ title: "¿Eliminar producto?", message: "No se puede deshacer.", danger: true })) …
 */
export function confirmDialog({ title = "¿Confirmas?", message = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, details } = {}) {
  const m = modal({
    title,
    size: "sm",
    content: [message && h("p.modal__text", message), details],
    actions: [
      { label: cancelLabel, variant: "secondary", value: false, autofocus: danger },
      { label: confirmLabel, variant: danger ? "danger" : "primary", value: true, autofocus: !danger },
    ],
  });
  return m.result.then((v) => v === true);
}

/**
 * promptDialog({ title, label, value, placeholder, help, confirmLabel, required, validate: (v) => "error"|null })
 * → Promise<string|null> (null = canceló).
 */
export function promptDialog({ title, label, value = "", placeholder = "", help, confirmLabel = "Aceptar", required = true, validate, maxlength } = {}) {
  const id = uid("prompt");
  const errId = uid("prompt-e");
  const input = h("input.input", { id, value, placeholder, maxlength, "aria-describedby": errId, autocomplete: "off" });
  const err = h("p.field__error", { id: errId, hidden: true });
  const check = () => {
    const v = input.value.trim();
    const msg = required && !v ? "Este campo es obligatorio." : validate ? validate(v) : null;
    err.hidden = !msg;
    err.textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    return msg ? null : v;
  };
  const m = modal({
    title,
    size: "sm",
    content: h("form.stack", { novalidate: true, onSubmit: (e) => { e.preventDefault(); const v = check(); if (v !== null) m.close(v); } },
      h("div.field", h("label.field__label", { for: id }, label), input, help && h("p.field__help", help), err)),
    actions: [
      { label: "Cancelar", value: null },
      { label: confirmLabel, variant: "primary", onClick: () => { const v = check(); if (v === null) { input.focus(); return false; } m.close(v); return false; } },
    ],
  });
  return m.result.then((v) => (typeof v === "string" ? v : null));
}

/* ---------- Errores de la API ---------- */
const SECTION_LABELS = {
  settings: "Ajustes", home: "Inicio", discountModal: "Modal de descuento", texts: "Textos del sitio", colors: "Colores", fits: "Hormas",
  categories: "Categorías", collections: "Colecciones", sizeCharts: "Guía de tallas", reviews: "Reseñas",
};
const SECTION_ROUTES = {
  settings: "#/ajustes", home: "#/inicio", discountModal: "#/descuento", texts: "#/textos", colors: "#/colores", fits: "#/hormas",
  categories: "#/categorias", collections: "#/colecciones", sizeCharts: "#/tallas", reviews: "#/resenas",
};
const SUB_LABELS = { hero: "video/imagen principal", logo: "logos", image: "imagen", couponCode: "cupón de bienvenida", media: "medios" };

/* ¿El usuario actual puede abrir un enlace interno del panel? El router registra la comprobación con las `roles`
   de cada ruta (setLinkAccess); si no lo ha hecho (o la ruta no existe), se usan las `roles` del menú (core/nav.js). */
let linkAccess = null;
/** Lo llama core/router.js: (ruta "/cupones") → true | false | null (null = no hay una ruta registrada para eso). */
export function setLinkAccess(fn) { linkAccess = typeof fn === "function" ? fn : null; }

/** canOpen("#/cupones/abc") → false para un editor (la sección es solo de administradores). Enlaces externos → true. */
export function canOpen(href) {
  const s = String(href || "");
  if (!s.startsWith("#/")) return true;
  const path = s.slice(1).split("?")[0] || "/";
  const viaRouter = linkAccess ? linkAccess(path) : null;
  if (viaRouter === true || viaRouter === false) return viaRouter;
  return session.can(navFor(path)?.item?.roles);
}

/**
 * "products/fe" → { label: "Producto «Camiseta Fe»", href: "#/productos/fe" } · "home.hero" → { label: "Inicio · video/imagen principal", href: "#/inicio" }
 * href es null cuando la persona no puede abrir esa sección (p. ej. un editor y "coupons/…" o "settings.logo"): muestra solo el texto.
 */
export function describeUsage(u, products = []) {
  const s = String(u || "");
  let out;
  if (s.startsWith("products/")) {
    const id = s.slice(9);
    const name = products.find((p) => p.id === id)?.name || content.data?.products?.find((p) => p.id === id)?.name || id;
    out = { label: `Producto «${name}»`, href: `#/productos/${encodeURIComponent(id)}` };
  } else if (s.startsWith("coupons/")) {
    out = { label: `Cupón ${s.slice(8)}`, href: "#/cupones" };
  } else if (s.startsWith("categories/")) {
    const id = s.slice(11);
    const name = content.data?.categories?.find((c) => c.id === id)?.name || id;
    out = { label: `Categoría «${name}»`, href: "#/categorias" };
  } else {
    const [sec, sub] = s.split(".");
    const base = SECTION_LABELS[sec] || sec;
    out = { label: sub ? `${base} · ${SUB_LABELS[sub] || sub}` : base, href: SECTION_ROUTES[sec] || null };
  }
  if (out.href && !canOpen(out.href)) out.href = null;
  return out;
}

/**
 * Muestra un error de la API de la forma adecuada:
 *   in_use → diálogo con la lista de lugares donde se usa · abort → nada · 401 → nada si va al ingreso; aviso si la
 *   persona cerró el diálogo «Tu sesión se cerró» (e.sessionDismissed) · otro → toast de error.
 */
export function showApiError(e, { title } = {}) {
  if (!e || isAbort(e)) return;
  if (!(e instanceof ApiError)) {
    console.error(e);
    toast("Ocurrió un error inesperado. Recarga la página e intenta de nuevo.", { type: "error", title });
    return;
  }
  if (e.status === 401) {
    // Cerró el diálogo «Tu sesión se cerró» sin volver a entrar (si no, ya se está yendo al ingreso)
    if (e.sessionDismissed) toast("No se hizo el cambio porque tu sesión se cerró. Inténtalo otra vez para volver a entrar.", { type: "error", title: title || "Sesión cerrada" });
    return;
  }
  if (e.isInUse) {
    const usages = e.data?.usages || [];
    const products = e.data?.products || [];
    const items = usages.map((u) => describeUsage(u, products));
    modal({
      title: title || "No se puede completar",
      size: "md",
      content: [
        h("p.modal__text", e.message),
        items.length ? h("div.stack-sm", h("p.muted", "Dónde se está usando:"), h("ul.usage-list", items.map((it) => h("li", it.href ? h("a", { href: it.href }, it.label) : it.label)))) : null,
      ],
      actions: [{ label: "Entendido", variant: "primary" }],
    });
    return;
  }
  toast(e.message, { type: "error", title });
}

/* ==========================================================================
   Estructura de página
   ========================================================================== */
/**
 * pageHeader({ title, subtitle, breadcrumbs: [{ label, href }], actions: [Node], badge: Node })
 * Las migas son los niveles ANTERIORES (la página actual es el título).
 */
export function pageHeader({ title, subtitle, breadcrumbs = [], actions = [], badge } = {}) {
  const acts = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
  return h("header.page-header",
    breadcrumbs.length ? h("nav.breadcrumbs", { "aria-label": "Ruta de navegación" },
      h("ol", breadcrumbs.map((b) => h("li", b.href ? h("a", { href: b.href }, b.label) : h("span", b.label))))) : null,
    h("div.page-header__row",
      h("div.page-header__titles",
        h("div.page-header__title-row", h("h1.page-title", { tabindex: "-1" }, title), badge),
        subtitle && h("p.page-subtitle", subtitle)),
      acts.length ? h("div.page-header__actions", acts) : null));
}

/**
 * card({ title, description, actions, body, footer, className, flush })
 * flush: sin relleno interno (para tablas a todo el ancho).
 */
export function card({ title, description, actions, body, footer, className, flush = false, id } = {}) {
  const tid = title ? uid("card") : null;
  const acts = actions ? (Array.isArray(actions) ? actions : [actions]).filter(Boolean) : [];
  return h("section.card", { class: [className, flush && "card--flush"], id, "aria-labelledby": tid },
    title || acts.length ? h("div.card__header",
      h("div.card__titles", title && h("h2.card__title", { id: tid }, title), description && h("p.card__desc", description)),
      acts.length ? h("div.card__actions", acts) : null) : null,
    h("div.card__body", body),
    footer ? h("div.card__footer", footer) : null);
}

/**
 * section({ title, description, body, aside }) — bloque "anotado" estilo ajustes de Shopify:
 * título y explicación a la izquierda, tarjeta con los campos a la derecha (apilado en móvil).
 */
export function section({ title, description, body, aside, id } = {}) {
  const tid = uid("sec");
  return h("section.layout-section", { id, "aria-labelledby": tid },
    h("div.layout-section__intro", h("h2.layout-section__title", { id: tid }, title), description && h("p.layout-section__desc", description), aside),
    h("div.layout-section__content", h("div.card", h("div.card__body", body))));
}

/** emptyState({ icon, title, message, action: { label, href, onClick, icon } | Node, compact }) */
export function emptyState({ icon: ic = "package", title = "Aún no hay nada aquí", message, action, compact = false } = {}) {
  const act = action instanceof Node ? action : action ? button({ variant: "primary", icon: action.icon, label: action.label, href: action.href, onClick: action.onClick }) : null;
  return h("div.empty", { class: compact && "empty--compact" },
    h("div.empty__icon", icon(ic, { size: compact ? 22 : 28 })),
    h("h3.empty__title", title),
    message && h("p.empty__msg", message),
    act && h("div.empty__action", act));
}

/** Esqueleto de carga. variant: "page" | "table" | "form" | "cards" */
export function skeleton({ variant = "page", rows = 5 } = {}) {
  const line = (w) => h("span.sk", { style: { width: w } });
  const block = (hgt) => h("span.sk.sk--block", { style: { height: hgt } });
  let body;
  if (variant === "table") body = h("div.sk-table", Array.from({ length: rows }, () => h("div.sk-row", line("28%"), line("18%"), line("14%"), line("10%"))));
  else if (variant === "form") body = h("div.sk-form", Array.from({ length: rows }, () => h("div.sk-field", line("22%"), block("38px"))));
  else if (variant === "cards") body = h("div.sk-cards", Array.from({ length: rows }, () => block("96px")));
  else body = [h("div.sk-head", line("36%"), line("22%")), h("div.sk-cards", Array.from({ length: 3 }, () => block("96px"))), block("220px")];
  return h("div.skeleton", { "aria-busy": "true" }, srOnly("Cargando…"), body);
}

/** errorState({ error, title, onRetry }) — mensaje claro + botón "Reintentar". */
export function errorState({ error, title = "No se pudo cargar esta sección", onRetry } = {}) {
  const msg = error?.message || "Ocurrió un error inesperado.";
  return h("div.empty.empty--error", { role: "alert" },
    h("div.empty__icon", icon("alert-circle", { size: 28 })),
    h("h3.empty__title", title),
    h("p.empty__msg", msg),
    onRetry && h("div.empty__action", button({ label: "Reintentar", icon: "refresh", variant: "primary", onClick: onRetry })));
}

/** notice({ tone: "info"|"success"|"warning"|"danger", title, message, action }) — aviso dentro de la página. */
export function notice({ tone = "info", title, message, action, className } = {}) {
  const ic = { info: "info", success: "check-circle", warning: "alert", danger: "alert-circle" }[tone] || "info";
  return h("div.notice", { class: [`notice--${tone}`, className], role: tone === "danger" ? "alert" : "status" },
    icon(ic, { size: 20, className: "notice__icon" }),
    h("div.notice__body", title && h("strong.notice__title", title), message && h("p.notice__msg", message)),
    action ? h("div.notice__action", action) : null);
}

/* ---------- Insignias ---------- */
/** badge("Publicado", "success"|"warning"|"danger"|"info"|"accent"|"neutral", { dot }) */
export function badge(text, tone = "neutral", { dot = false, title } = {}) {
  return h("span.badge", { class: [`badge--${tone}`, dot && "badge--dot"], title }, text);
}

const STATUS = {
  published: ["Publicado", "success"], draft: ["Borrador", "neutral"],
  active: ["Activo", "success"], inactive: ["Inactivo", "neutral"],
  scheduled: ["Programado", "info"], expired: ["Vencido", "warning"], exhausted: ["Agotado", "warning"],
  soldout: ["Agotado", "danger"], low: ["Poco stock", "warning"], instock: ["Con stock", "success"],
  admin: ["Administrador", "accent"], editor: ["Editor", "info"],
  visible: ["Visible", "success"], hidden: ["Oculta", "neutral"],
};
/** statusBadge("published" | "draft" | "active" | "inactive" | "soldout" | "low" | "admin" | "editor" | …) */
export function statusBadge(status) {
  const [label, tone] = STATUS[status] || [String(status || "—"), "neutral"];
  return badge(label, tone, { dot: true });
}

/** statCard({ label, value, hint, icon, href, tone }) — tarjeta numérica del escritorio. */
export function statCard({ label, value, hint, icon: ic, href, tone = "neutral" } = {}) {
  const kids = [
    h("div.stat__top", h("span.stat__label", label), ic && h("span.stat__icon", { class: `stat__icon--${tone}` }, icon(ic, { size: 18 }))),
    h("div.stat__value", typeof value === "number" ? number(value) : value ?? "—"),
    hint && h("div.stat__hint", hint),
  ];
  return href ? h("a.stat", { href, class: `stat--${tone}` }, kids) : h("div.stat", { class: `stat--${tone}` }, kids);
}

/* ==========================================================================
   Pestañas
   ========================================================================== */
/**
 * tabs({ items: [{ id, label, icon, badge, content: Node | () => Node }], active, onChange, label })
 * → { el, select(id), active, panel(id), setBadge(id, valor) }. Todos los paneles quedan montados (los campos de un
 * formulario siguen vivos). Teclado: ← → Inicio Fin. revealElement() activa la pestaña que contiene un campo con
 * error, y las pestañas con campos en error muestran una marca (también para lectores de pantalla).
 */
export function tabs({ items = [], active, onChange, label = "Secciones", className } = {}) {
  const base = uid("tabs");
  const list = h("div.tabs__list", { role: "tablist", "aria-label": label });
  const panels = h("div.tabs__panels");
  const btns = new Map();
  const pans = new Map();
  let current = null;
  const hasBadge = (v) => v !== undefined && v !== null && v !== "" && v !== false;

  for (const it of items) {
    const tid = `${base}-t-${it.id}`;
    const pid = `${base}-p-${it.id}`;
    const b = h("button.tabs__tab", { type: "button", role: "tab", id: tid, "aria-controls": pid, "aria-selected": "false", tabindex: "-1", onClick: () => select(it.id, true) },
      it.icon && icon(it.icon, { size: 16 }), h("span", it.label), hasBadge(it.badge) ? h("span.tabs__badge", String(it.badge)) : null);
    const p = h("div.tabs__panel", { role: "tabpanel", id: pid, "aria-labelledby": tid, tabindex: "0", hidden: true, "data-reveal": "" });
    p.addEventListener("reveal", () => select(it.id, true));
    append(p, typeof it.content === "function" ? it.content() : it.content);
    btns.set(it.id, b);
    pans.set(it.id, p);
    list.append(b);
    panels.append(p);
  }

  /** Número (o texto) junto al nombre de la pestaña; null / "" / undefined lo quita. */
  function setBadge(id, value) {
    const b = btns.get(id);
    if (!b) return;
    let el = b.querySelector(":scope > .tabs__badge");
    if (!hasBadge(value)) { el?.remove(); return; }
    if (!el) {
      el = h("span.tabs__badge");
      const mark = b.querySelector(":scope > .tabs__err");
      if (mark) mark.before(el); else b.append(el);
    }
    el.textContent = String(value);
  }

  /* Marca las pestañas que tienen campos con error (el Form solo puede mostrar una a la vez) */
  const markErrors = () => {
    for (const [id, p] of pans) {
      const bad = !!p.querySelector('[aria-invalid="true"], .field.has-error');
      const b = btns.get(id);
      const mark = b.querySelector(":scope > .tabs__err");
      b.classList.toggle("has-error", bad);
      if (bad && !mark) b.append(h("span.tabs__err", { role: "img", "aria-label": "tiene errores", title: "Hay campos con errores en esta pestaña" }, icon("alert-circle", { size: 14 })));
      else if (!bad && mark) mark.remove();
    }
  };
  let markQueued = false;
  if (typeof MutationObserver === "function") {
    new MutationObserver(() => {
      if (markQueued) return;
      markQueued = true;
      queueMicrotask(() => { markQueued = false; markErrors(); });
    }).observe(panels, { subtree: true, attributes: true, attributeFilter: ["aria-invalid", "class"] });
  }

  list.addEventListener("keydown", (e) => {
    const ids = items.map((i) => i.id);
    const i = ids.indexOf(current);
    let n = null;
    if (e.key === "ArrowRight") n = ids[(i + 1) % ids.length];
    else if (e.key === "ArrowLeft") n = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === "Home") n = ids[0];
    else if (e.key === "End") n = ids[ids.length - 1];
    if (n !== null) {
      e.preventDefault();
      select(n, true);
      btns.get(n).focus();
    }
  });

  function select(id, fromUser = false) {
    if (!btns.has(id) || id === current) return;
    if (current !== null) {
      btns.get(current).setAttribute("aria-selected", "false");
      btns.get(current).tabIndex = -1;
      pans.get(current).hidden = true;
    }
    current = id;
    btns.get(id).setAttribute("aria-selected", "true");
    btns.get(id).tabIndex = 0;
    pans.get(id).hidden = false;
    if (fromUser) onChange?.(id);
  }
  select(btns.has(active) ? active : items[0]?.id);
  const el = h("div.tabs", { class: className }, list, panels);
  return { el, select: (id) => select(id, false), get active() { return current; }, panel: (id) => pans.get(id), setBadge };
}

/**
 * Hace visible un elemento escondido en pestañas, acordeones (<details>) o ítems plegados:
 * los contenedores con [hidden][data-reveal] reciben el evento "reveal" para abrirse.
 * { tabs: false } abre solo los plegables (no cambia de pestaña): el Form lo usa para los errores que no son el primero.
 */
export function revealElement(el, { tabs: switchTabs = true } = {}) {
  const chain = [];
  for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) chain.unshift(n);
  for (const n of chain) {
    if (n.tagName === "DETAILS" && !n.open) n.open = true;
    if (n.hasAttribute("data-reveal") && n.hidden && (switchTabs || n.getAttribute("role") !== "tabpanel")) n.dispatchEvent(new CustomEvent("reveal"));
  }
}

/* ==========================================================================
   Menú desplegable
   ========================================================================== */
/**
 * menu({ items: [{ label, icon, onClick, href, target, danger, disabled } | { divider: true } | { header: Node }],
 *        label, icon, trigger, variant }) → botón que abre el menú.
 * El menú se dibuja sobre la página (position: fixed), así no lo recortan tablas con scroll.
 */
export function menu({ items = [], label = "Más acciones", icon: ic = "more", trigger, align = "end", variant = "ghost", size } = {}) {
  const btn = trigger || iconButton({ icon: ic, label, variant, size });
  const menuId = uid("menu");
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", menuId);
  let pop = null;
  let offs = [];

  const list = () => (typeof items === "function" ? items() : items).filter(Boolean);
  const itemEls = () => (pop ? Array.from(pop.querySelectorAll(".menu__item:not([disabled])")) : []);

  function open() {
    if (pop) return;
    pop = h("div.menu", { id: menuId, role: "menu", "aria-label": label });
    for (const it of list()) {
      if (it.divider) { pop.append(h("div.menu__sep", { role: "separator" })); continue; }
      if (it.header) { pop.append(h("div.menu__header", it.header)); continue; }
      const kids = [it.icon && icon(it.icon, { size: 16 }), h("span", it.label)];
      const cls = ["menu__item", it.danger && "is-danger"];
      const el = it.href
        ? h("a", { class: cls, role: "menuitem", tabindex: "-1", href: it.href, target: it.target, rel: it.target === "_blank" ? "noopener" : null, onClick: () => close(false) }, kids)
        : h("button", { class: cls, type: "button", role: "menuitem", tabindex: "-1", disabled: it.disabled, onClick: () => { close(true); it.onClick?.(); } }, kids);
      pop.append(el);
    }
    document.body.append(pop);
    position();
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("is-active");
    itemEls()[0]?.focus();
    const onDown = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(false); };
    const onKey = (e) => {
      const els = itemEls();
      const i = els.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
      else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
      else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
      else if (e.key === "Tab") close(false);
    };
    const onScroll = (e) => { if (!pop?.contains(e.target)) close(false); };
    document.addEventListener("pointerdown", onDown, true);
    pop.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    offs = [
      () => document.removeEventListener("pointerdown", onDown, true),
      () => window.removeEventListener("resize", onScroll),
      () => document.removeEventListener("scroll", onScroll, true),
    ];
  }

  function position() {
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const ht = pop.offsetHeight;
    let left = align === "start" ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + ht > window.innerHeight - 8 && r.top - ht - 6 > 8) top = r.top - ht - 6;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function close(refocus) {
    if (!pop) return;
    offs.forEach((f) => f());
    offs = [];
    pop.remove();
    pop = null;
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("is-active");
    if (refocus && btn.isConnected) btn.focus();
  }

  btn.addEventListener("click", (e) => { e.stopPropagation(); pop ? close(false) : open(); });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && !pop) { e.preventDefault(); open(); }
  });
  return btn;
}

/* ==========================================================================
   Tabla de datos
   ========================================================================== */
const tableMemory = new Map(); // stateKey → { q, filters, sort, page } (se recuerda al volver a la lista)
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
/* Elementos que no pueden ir dentro de un <a> y que, al hacer clic, no deben abrir la fila */
const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button'], [role='link'], [contenteditable='true']";

/**
 * dataTable({
 *   columns: [{ key, label, sortable, render: (row) => Node|string, value: (row) => valor para ordenar/buscar,
 *               align: "start"|"end"|"center", width, hideOn: "mobile" (≤ 720 px) | "tablet" (≤ 960 px),
 *               primary: true }],   // enlace a rowHref: envuelve la celda, o solo [data-row-link] si la celda tiene botones
 *   rows,                       // lista inicial (luego table.setRows(lista))
 *   search: { placeholder, keys: ["name","ref"], text: (row) => "texto extra" } | false,
 *   filters: [{ key, label, allLabel, options: [{ value, label }], test: (row, value) => bool }],
 *   sort: { key, dir: "asc"|"desc" }, pageSize: 25,
 *   rowActions: (row) => [{ label, icon, onClick, href, danger, primary }],   // primary = botón visible; el resto va en "⋯"
 *   rowHref: (row) => "#/productos/fe",          // clic en la fila = abrir el enlace principal
 *   onRowClick: (row, evento) => …,              // en lugar de rowHref: clic en la fila (p. ej. abrir un diálogo)
 *   onStateChange: ({ q, filters, sort, page }, { source: "user"|"api" }) => …,   // búsqueda, filtro, orden o página
 *   empty: { icon, title, message, action }, toolbar: [Node], caption, stateKey: "productos", rowKey: (row) => row.id,
 * }) → { el, setRows(rows), refresh(), rows, visibleRows, setLoading(bool),
 *        state, setFilter(key, valor), setSort(key, dir), setSearch(q), setState({ q, filters, sort, page }) }
 */
export function dataTable(opts = {}) {
  const {
    columns = [], search = {}, filters = [], pageSize = 25, rowActions, rowHref, empty = {}, toolbar = [],
    caption, stateKey, rowKey = (r) => r.id, onRowClick, onStateChange,
  } = opts;
  const mem = stateKey ? tableMemory.get(stateKey) : null;
  const st = { q: mem?.q || "", filters: { ...(mem?.filters || {}) }, sort: mem?.sort || opts.sort || null, page: mem?.page || 1 };
  let rows = opts.rows || [];
  let loading = false;

  const valueOf = (col, row) => (col.value ? col.value(row) : row?.[col.key]);
  const snapshot = () => ({ q: st.q, filters: { ...st.filters }, sort: st.sort ? { ...st.sort } : null, page: st.page });
  const remember = () => { if (stateKey) tableMemory.set(stateKey, { q: st.q, filters: { ...st.filters }, sort: st.sort, page: st.page }); };
  /** Guarda el estado, redibuja y avisa a onStateChange. */
  const changed = (source = "user") => {
    remember();
    render();
    if (onStateChange) {
      try { onStateChange(snapshot(), { source }); } catch (e) { console.error(e); }
    }
  };

  /* --- Barra de herramientas --- */
  const searchId = uid("tbl-q");
  const searchInput = search !== false
    ? h("input.input.input--search", { id: searchId, type: "search", placeholder: search.placeholder || "Buscar…", value: st.q, autocomplete: "off" })
    : null;
  let searchTimer = 0;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { st.q = searchInput.value; st.page = 1; changed(); }, 120);
    });
  }
  const knownFilter = (f, v) => v === "" || v === null || v === undefined || f.options.some((o) => String(o.value) === String(v));
  // Un filtro recordado que ya no existe (p. ej. una categoría eliminada) no debe esconder filas sin mostrarse
  for (const f of filters) if (!knownFilter(f, st.filters[f.key])) delete st.filters[f.key];
  const filterEls = filters.map((f) => {
    const id = uid("tbl-f");
    const sel = h("select.input.input--select", { id, "aria-label": f.label, dataset: { filter: f.key } },
      h("option", { value: "" }, f.allLabel || `${f.label}: todos`),
      f.options.map((o) => h("option", { value: o.value, selected: String(st.filters[f.key] ?? "") === String(o.value) }, o.label)));
    sel.addEventListener("change", () => { st.filters[f.key] = sel.value; st.page = 1; changed(); });
    return sel;
  });
  const bar = (searchInput || filterEls.length || toolbar.length)
    ? h("div.table-toolbar",
      searchInput && h("div.table-search", h("label.sr-only", { for: searchId }, search.placeholder || "Buscar"), icon("search", { size: 16, className: "table-search__icon" }), searchInput),
      filterEls.length ? h("div.table-filters", filterEls) : null,
      toolbar.length ? h("div.table-toolbar__extra", toolbar) : null)
    : null;

  /* --- Tabla --- */
  const thead = h("thead");
  const tbody = h("tbody");
  const table = h("table.table", caption && h("caption.sr-only", caption), thead, tbody);
  const wrap = h("div.table-wrap", table);
  const info = h("p.table-info", { "aria-live": "polite" });
  const pager = h("div.table-pager");
  const foot = h("div.table-foot", info, pager);
  const emptyBox = h("div.table-empty", { hidden: true });
  const el = h("div.data-table", bar, wrap, emptyBox, foot);
  // Si la tabla no cabe (se desplaza de lado), la columna fija de acciones muestra una sombra a su izquierda
  const updScroll = () => wrap.classList.toggle("is-scrollable", wrap.scrollWidth > wrap.clientWidth + 1);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(updScroll);
    ro.observe(wrap);
    ro.observe(table);
  }

  function renderHead() {
    const tr = h("tr");
    for (const col of columns) {
      const sorted = st.sort?.key === col.key ? st.sort.dir : null;
      const th = h("th", {
        scope: "col",
        class: [col.align && `is-${col.align}`, col.hideOn && `hide-${col.hideOn}`, col.className],
        style: col.width ? { width: col.width } : null,
        "aria-sort": col.sortable ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : null,
      });
      if (col.sortable) {
        th.append(h("button.th-sort", {
          type: "button",
          onClick: () => {
            st.sort = { key: col.key, dir: sorted === "asc" ? "desc" : "asc" };
            changed();
          },
        }, col.label, icon(sorted === "desc" ? "chevron-down" : sorted === "asc" ? "chevron-up" : "chevron-down", { size: 14, className: sorted ? "is-on" : "is-off" })));
      } else th.append(col.label ? col.label : "");
      tr.append(th);
    }
    if (rowActions) tr.append(h("th.is-end.col-actions", { scope: "col" }, srOnly("Acciones")));
    thead.replaceChildren(tr);
  }

  function filtered() {
    let list = rows.slice();
    for (const f of filters) {
      const v = st.filters[f.key];
      if (v !== undefined && v !== "") list = list.filter((r) => (f.test ? f.test(r, v) : String(r[f.key]) === String(v)));
    }
    const q = fold(st.q).trim();
    if (q) {
      const keys = search?.keys || [];
      list = list.filter((r) => {
        const parts = [];
        for (const c of columns) { const v = valueOf(c, r); if (typeof v === "string" || typeof v === "number") parts.push(v); }
        for (const k of keys) { const v = r?.[k]; if (Array.isArray(v)) parts.push(v.join(" ")); else if (v !== undefined && v !== null) parts.push(v); }
        if (search?.text) parts.push(search.text(r));
        return fold(parts.join(" ")).includes(q);
      });
    }
    if (st.sort) {
      const col = columns.find((c) => c.key === st.sort.key);
      if (col) {
        const dir = st.sort.dir === "desc" ? -1 : 1;
        list.sort((a, b) => {
          const va = valueOf(col, a);
          const vb = valueOf(col, b);
          if (va === vb) return 0;
          if (va === null || va === undefined || va === "") return 1;
          if (vb === null || vb === undefined || vb === "") return -1;
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return collator.compare(String(va), String(vb)) * dir;
        });
      }
    }
    return list;
  }

  function cell(col, row) {
    let v = col.render ? col.render(row) : valueOf(col, row);
    if (v === null || v === undefined || v === "") v = h("span.muted", "—");
    if (col.primary && rowHref) v = primaryLink(v, rowHref(row));
    return h("td", { class: [col.align && `is-${col.align}`, col.hideOn && `hide-${col.hideOn}`, col.primary && "is-primary", col.className], "data-label": col.label || null }, v);
  }

  /* Fila clicable accesible: UN enlace real por fila (teclado y lectores de pantalla) y el clic en el resto de la fila
     lo abre. Si la celda principal no tiene controles, el enlace la envuelve entera (como siempre); si tiene botones
     (no se pueden anidar en un <a>), el enlace va solo en el texto marcado con [data-row-link] (o en el <a> que ya
     traiga, o en el primer texto). */
  function primaryLink(v, href) {
    const node = v instanceof Node ? v : document.createTextNode(String(v));
    const isEl = node.nodeType === 1;
    if (!isEl || (!node.matches(INTERACTIVE) && !node.querySelector(INTERACTIVE))) return h("a.table-link", { href, dataset: { rowLink: "" } }, node);
    const linkify = (el) => {
      let a = el;
      if (el.tagName !== "A") {
        a = document.createElement("a");
        for (const at of Array.from(el.attributes)) a.setAttribute(at.name, at.value);
        a.append(...el.childNodes);
        el.replaceWith(a);
      }
      if (!a.getAttribute("href")) a.setAttribute("href", href);
      a.classList.add("table-link");
      a.dataset.rowLink = "";
    };
    const marked = node.matches("[data-row-link]") ? node : node.querySelector("[data-row-link]");
    if (marked) { linkify(marked); return node; }
    const existing = node.matches("a.table-link") ? node : node.querySelector("a.table-link");
    if (existing) { linkify(existing); return node; }
    const firstText = (el) => {
      for (const c of el.children) {
        if (c.matches(INTERACTIVE)) continue;
        if (!c.querySelector(INTERACTIVE)) { if (c.textContent.trim()) return c; continue; }
        const inner = firstText(c);
        if (inner) return inner;
      }
      return null;
    };
    const target = firstText(node);
    if (target) linkify(target);
    return node;
  }

  function actionsCell(row) {
    const acts = (rowActions(row) || []).filter(Boolean);
    const inline = acts.filter((a) => a.primary);
    const rest = acts.filter((a) => !a.primary);
    return h("td.is-end.col-actions",
      h("div.row-actions",
        inline.map((a) => button({ label: a.label, icon: a.icon, size: "sm", variant: a.danger ? "danger" : "secondary", href: a.href, onClick: a.onClick })),
        rest.length ? menu({ label: "Más acciones", items: rest }) : null));
  }

  function render() {
    renderHead();
    if (loading) {
      tbody.replaceChildren(...Array.from({ length: 4 }, () => h("tr.is-loading", h("td", { colspan: columns.length + (rowActions ? 1 : 0) }, h("span.sk", { style: { width: "60%" } })))));
      emptyBox.hidden = true;
      wrap.hidden = false;
      info.textContent = "Cargando…";
      pager.replaceChildren();
      return;
    }
    if (!rows.length) {
      wrap.hidden = true;
      foot.hidden = true;
      if (bar) bar.hidden = !st.q && !Object.values(st.filters).some(Boolean) && !toolbar.length;
      emptyBox.hidden = false;
      emptyBox.replaceChildren(emptyState({ title: "Aún no hay elementos", ...empty }));
      return;
    }
    if (bar) bar.hidden = false;
    foot.hidden = false;
    wrap.hidden = false;
    emptyBox.hidden = true;
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    st.page = Math.min(Math.max(1, st.page), pages);
    const start = (st.page - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    if (!pageRows.length) {
      const hasQuery = !!st.q || Object.values(st.filters).some(Boolean);
      tbody.replaceChildren(h("tr", h("td.table-noresults", { colspan: columns.length + (rowActions ? 1 : 0) },
        h("p", hasQuery ? `No hay resultados${st.q ? ` para «${st.q}»` : ""}.` : "No hay elementos."),
        hasQuery ? button({ label: "Limpiar búsqueda y filtros", variant: "link", onClick: clearFilters }) : null)));
    } else {
      tbody.replaceChildren(...pageRows.map((row) => {
        const tr = h("tr", { dataset: { key: rowKey(row) } }, columns.map((c) => cell(c, row)), rowActions ? actionsCell(row) : null);
        if (rowHref || onRowClick) {
          tr.classList.add("is-clickable");
          tr.addEventListener("click", (e) => {
            if (e.button || e.target.closest(`${INTERACTIVE}, .menu`)) return;
            if (String(window.getSelection?.() || "").trim()) return; // estaba seleccionando texto para copiarlo
            if (onRowClick) { onRowClick(row, e); return; }
            if (e.metaKey || e.ctrlKey || e.shiftKey) window.open(tr.querySelector("a[data-row-link]")?.href || rowHref(row), "_blank", "noopener");
            else location.hash = rowHref(row);
          });
        }
        return tr;
      }));
    }
    info.textContent = list.length
      ? `${number(start + 1)}–${number(start + pageRows.length)} de ${number(list.length)}${list.length !== rows.length ? ` (filtrados de ${number(rows.length)})` : ""}`
      : `0 de ${number(rows.length)}`;
    pager.replaceChildren();
    if (pages > 1) {
      pager.append(
        iconButton({ icon: "chevron-left", label: "Página anterior", variant: "secondary", size: "sm", disabled: st.page <= 1, onClick: () => { st.page--; changed(); } }),
        h("span.table-pager__label", `Página ${st.page} de ${pages}`),
        iconButton({ icon: "chevron-right", label: "Página siguiente", variant: "secondary", size: "sm", disabled: st.page >= pages, onClick: () => { st.page++; changed(); } }),
      );
    }
  }

  function clearFilters() {
    st.q = "";
    st.filters = {};
    st.page = 1;
    if (searchInput) searchInput.value = "";
    filterEls.forEach((s) => { s.value = ""; });
    changed();
    searchInput?.focus();
  }

  /** Cambia búsqueda, filtros, orden o página desde la vista (p. ej. con lo que trae la URL). Valores desconocidos se ignoran. */
  function setState(next = {}, { notify = true } = {}) {
    if ("q" in next) {
      st.q = String(next.q ?? "");
      clearTimeout(searchTimer);
      if (searchInput) searchInput.value = st.q;
    }
    if (next.filters) {
      for (const [key, v] of Object.entries(next.filters)) {
        const i = filters.findIndex((f) => f.key === key);
        if (i === -1) continue;
        const val = knownFilter(filters[i], v) ? String(v ?? "") : "";
        st.filters[key] = val;
        filterEls[i].value = val;
      }
    }
    if ("sort" in next) {
      const s = next.sort;
      st.sort = s && columns.some((c) => c.key === s.key) ? { key: s.key, dir: s.dir === "desc" ? "desc" : "asc" } : null;
    }
    st.page = Number.isInteger(next.page) && next.page > 0 ? next.page : ("q" in next || next.filters ? 1 : st.page);
    if (notify) changed("api");
    else { remember(); render(); }
  }

  render();
  return {
    el,
    setRows(next) { rows = next || []; loading = false; render(); },
    refresh: render,
    setLoading(v) { loading = !!v; render(); },
    get rows() { return rows; },
    get visibleRows() { return filtered(); },
    /** { q, filters, sort, page } actuales (copia). */
    get state() { return snapshot(); },
    setState,
    setFilter: (key, value) => setState({ filters: { [key]: value } }),
    setSort: (key, dir = "asc") => setState({ sort: key ? { key, dir } : null }),
    setSearch: (q) => setState({ q }),
  };
}

/* ==========================================================================
   Vista provisional (para secciones que aún no se construyen)
   ========================================================================== */
export function placeholderView({ title, description, breadcrumbs = [] } = {}) {
  return h("div.page",
    pageHeader({ title, breadcrumbs, subtitle: description }),
    card({ body: emptyState({ icon: "construction", title: "Sección en construcción", message: "Esta parte del panel se está construyendo. Muy pronto podrás editarla desde aquí." }) }));
}
