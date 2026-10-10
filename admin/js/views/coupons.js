/* ==========================================================================
   Mercy Studio · Panel — views/coupons.js
   Cupones (solo administrador, contrato §3 "Cupones" y §4.3):
   · #/cupones        listado con estado calculado (Activo, Inactivo, Programado, Vencido, Agotado),
                      usos, vigencia, a qué aplica, insignia "Bienvenida" (discountModal.couponCode),
                      filtros, búsqueda y acciones (editar, copiar, duplicar, activar/desactivar, eliminar).
   · #/cupones/nuevo  y #/cupones/:id  editor con resumen en vivo en lenguaje natural, vigencia en hora
                      de Colombia, compra mínima, límite de usos, "Reiniciar contador" (PUT resetUses) y
                      alcance: todo el catálogo, categorías (chips) o productos (selector con miniaturas).
   Los clientes escriben el código en el carrito o en el checkout (js/store.js valida y calcula el descuento).
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api, ApiError } from "../core/api.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import {
  badge, button, card, confirmDialog, dataTable, emptyState, iconButton, menu, modal, notice, pageHeader,
  showApiError, statCard, statusBadge, toast, withBusy,
} from "../core/ui.js";
import { date, dateTime, fold, money, number, plural, relativeTime, todayCO } from "../core/format.js";
import { pexelsSized } from "../core/media.js";

const CODE_RE = /^[A-Z0-9_-]{3,30}$/;
const CODE_MSG = "Usa de 3 a 30 caracteres: letras sin tildes ni ñ, números, guion (-) o guion bajo (_).";
const enc = encodeURIComponent;
const MESES = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];

/* ---------- Estado y textos de un cupón ---------- */
const STATE_LABEL = { active: "Activo", inactive: "Inactivo", scheduled: "Programado", expired: "Vencido", exhausted: "Agotado" };
const STATE_ORDER = { active: 0, scheduled: 1, inactive: 2, exhausted: 3, expired: 4 };

/** Mismo orden que el servidor (couponStatus): inactivo → aún no empieza → vencido → agotado → activo. */
export function couponState(c, today = todayCO()) {
  if (!c) return "inactive";
  if (!c.active) return "inactive";
  if (c.startsAt && today < c.startsAt) return "scheduled";
  if (c.endsAt && today > c.endsAt) return "expired";
  if (c.maxUses != null && (c.usesCount || 0) >= c.maxUses) return "exhausted";
  return "active";
}

/** "15%" o "$20.000" (igual que la etiqueta pública del servidor). */
export function couponLabel(c) {
  if (c?.value === null || c?.value === undefined || c.value === "") return "—";
  return c.type === "fixed" ? money(c.value) : `${c.value}%`;
}

/** "1 oct. 2026" (fechas del resumen en lenguaje natural). */
function shortDate(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

function stateHint(c) {
  switch (couponState(c)) {
    case "inactive": return "Desactivado: la tienda lo rechaza.";
    case "scheduled": return `Aún no empieza: vale desde el ${date(c.startsAt, { long: true })}.`;
    case "expired": return `Venció el ${date(c.endsAt, { long: true })}.`;
    case "exhausted": return `Alcanzó su límite de ${plural(c.maxUses, "uso", "usos")}.`;
    default: return "Vigente: la tienda lo acepta.";
  }
}

function stateBadge(c) {
  const b = statusBadge(couponState(c));
  b.title = stateHint(c);
  return b;
}

function validityText(c) {
  if (c.startsAt && c.endsAt) return `${date(c.startsAt)} – ${date(c.endsAt)}`;
  if (c.startsAt) return `Desde ${date(c.startsAt)}`;
  if (c.endsAt) return `Hasta ${date(c.endsAt)}`;
  return "Sin límite";
}

function usesText(c) {
  return `${number(c.usesCount || 0)} / ${c.maxUses ? number(c.maxUses) : "ilimitado"}`;
}

const listJoin = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} y ${arr[arr.length - 1]}`);

function catName(data, id) { return data?.categories?.find((c) => c.id === id)?.name || id; }
function prodName(data, id) { return data?.products?.find((p) => p.id === id)?.name || id; }

/** Columna "Aplica a": Todo · Hoodies · 2 categorías · Camiseta Fe · 3 productos (con la lista en el título). */
function scopeCell(c, data) {
  if (c.appliesTo === "categories") {
    const names = (c.categoryIds || []).map((id) => catName(data, id));
    return h("span", { title: names.join(", ") }, names.length === 1 ? names[0] : plural(names.length, "categoría", "categorías"));
  }
  if (c.appliesTo === "products") {
    const names = (c.productIds || []).map((id) => prodName(data, id));
    return h("span", { title: names.join(", ") }, names.length === 1 ? names[0] : plural(names.length, "producto", "productos"));
  }
  return h("span.muted", "Todo");
}

/** Frase del resumen: "15% de descuento en camisetas, desde el 1 oct. 2026, máx. 100 usos." */
export function couponSentence(v, data) {
  const label = v.value ? couponLabel(v) : v.type === "fixed" ? "$—" : "—%";
  let scope = "todo el catálogo";
  if (v.appliesTo === "categories") {
    const names = (v.categoryIds || []).map((id) => catName(data, id).toLowerCase());
    scope = names.length ? listJoin(names) : "las categorías que elijas";
  } else if (v.appliesTo === "products") {
    const ids = v.productIds || [];
    scope = !ids.length ? "los productos que elijas" : ids.length <= 3 ? listJoin(ids.map((id) => prodName(data, id))) : `${number(ids.length)} productos`;
  }
  const parts = [`${label} de descuento en ${scope}`];
  if (v.minSubtotal) parts.push(`en compras desde ${money(v.minSubtotal)}${v.appliesTo === "all" ? "" : " en esos productos"}`);
  if (v.startsAt && v.endsAt) {
    const sameYear = v.startsAt.slice(0, 4) === v.endsAt.slice(0, 4);
    parts.push(`del ${sameYear ? shortDate(v.startsAt).replace(/ \d{4}$/, "") : shortDate(v.startsAt)} al ${shortDate(v.endsAt)}`);
  } else if (v.startsAt) parts.push(`desde el ${shortDate(v.startsAt)}`);
  else if (v.endsAt) parts.push(`hasta el ${shortDate(v.endsAt)}`);
  if (v.maxUses) parts.push(`máx. ${plural(v.maxUses, "uso", "usos")}`);
  return `${parts.join(", ")}.`;
}

/** 422 "categoryIds.1"/"productIds.0" (otra persona lo borró mientras editabas) → mensaje con los nombres. */
function explainMissing(fields, body, data) {
  const out = { ...fields };
  for (const [key, name] of [["productIds", (id) => prodName(data, id)], ["categoryIds", (id) => catName(data, id)]]) {
    const bad = Object.keys(out).filter((k) => k.startsWith(`${key}.`)).map((k) => { const id = body[key][Number(k.split(".")[1])]; delete out[k]; return id; }).filter(Boolean);
    if (bad.length) {
      const what = key === "productIds" ? ["Este producto ya no existe", "Estos productos ya no existen"] : ["Esta categoría ya no existe", "Estas categorías ya no existen"];
      out[key] = `${bad.length === 1 ? what[0] : what[1]}: ${bad.map(name).join(", ")}. Quítalos de la lista y guarda de nuevo.`;
    }
  }
  return out;
}

/* ---------- Utilidades ---------- */
/** Copia al portapapeles (con respaldo para navegadores sin permiso). → true si se copió. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const host = document.querySelector("dialog[open]") || document.body;
    const ta = h("textarea", { style: "position:fixed;top:0;left:0;opacity:0;pointer-events:none", "aria-hidden": "true" });
    ta.value = text;
    host.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyCode(code) {
  if (await copyText(code)) toast(`Código ${code} copiado.`);
  else toast("No se pudo copiar. Selecciona el código y cópialo a mano.", { type: "warning" });
}

/** Código aleatorio fácil de dictar (sin 0/O ni 1/I/L): "MERCY-7K3Q9P". */
function randomCode(prefix = "MERCY") {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return `${prefix}-${Array.from(buf, (n) => alphabet[n % alphabet.length]).join("")}`;
}

/** Código sugerido para una copia: VERANO-COPIA, VERANO-COPIA2… (máx. 30 caracteres, sin repetir). */
function copyCodeFor(code, taken) {
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "-COPIA" : `-COPIA${n}`;
    const c = code.slice(0, 30 - suffix.length) + suffix;
    if (!taken.has(c)) return c;
  }
  return randomCode();
}

/** Lo que se envía al servidor (el servidor ignora id, usesCount y fechas de creación). */
function payloadOf(c) {
  return {
    code: c.code, description: c.description || "", type: c.type, value: c.value, active: !!c.active,
    startsAt: c.startsAt || null, endsAt: c.endsAt || null, minSubtotal: c.minSubtotal || 0, maxUses: c.maxUses || null,
    appliesTo: c.appliesTo, categoryIds: c.appliesTo === "categories" ? c.categoryIds || [] : [], productIds: c.appliesTo === "products" ? c.productIds || [] : [],
  };
}

/** Valor del formulario: solo lo editable (vacío en compra mínima = sin mínimo). */
function toForm(c) {
  return {
    code: c.code || "", description: c.description || "", type: c.type || "percent", value: c.value ?? null, active: c.active !== false,
    startsAt: c.startsAt || null, endsAt: c.endsAt || null, minSubtotal: c.minSubtotal || null, maxUses: c.maxUses || null,
    appliesTo: c.appliesTo || "all", categoryIds: c.categoryIds || [], productIds: c.productIds || [],
  };
}

function firstPhoto(p) {
  for (const c of p.colors || []) if (c.photos?.length) return c.photos[0].thumb || c.photos[0].src;
  return "";
}

function productThumb(p) {
  const src = firstPhoto(p);
  return h("span.mk-thumb", { style: src ? null : { background: `linear-gradient(160deg, ${p.tile?.from || "#d8bea6"}, ${p.tile?.to || "#a76d4a"})` }, "aria-hidden": "true" },
    src ? h("img", { src: pexelsSized(src, 160), alt: "", loading: "lazy", decoding: "async" }) : h("span.mk-thumb__txt", (p.tile?.lines?.[0] || p.name || "?").slice(0, 3)));
}

/* ---------- Diálogo "Duplicar" ---------- */
function askCopyCode(source, taken) {
  const id = uid("dup");
  const errId = uid("dup-e");
  const input = h("input.input.mk-code-input", { id, value: copyCodeFor(source.code, taken), maxlength: 30, autocomplete: "off", spellcheck: "false", "aria-describedby": `${id}-help ${errId}` });
  const err = h("p.field__error", { id: errId, hidden: true });
  const check = () => {
    const v = input.value.trim().toUpperCase();
    const msg = !v ? "Escribe el código del nuevo cupón." : !CODE_RE.test(v) ? CODE_MSG : taken.has(v) ? "Ya existe un cupón con este código." : null;
    err.hidden = !msg;
    replace(err, msg ? [icon("alert-circle", { size: 14 }), h("span", msg)] : null);
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    return msg ? null : v;
  };
  input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true") check(); });
  const m = modal({
    title: `Duplicar ${source.code}`,
    size: "sm",
    content: h("form.stack", { novalidate: true, onSubmit: (e) => { e.preventDefault(); const v = check(); if (v) m.close(v); } },
      h("div.field",
        h("label.field__label", { for: id }, "Código del nuevo cupón"),
        input,
        h("p.field__help", { id: `${id}-help` }, "Se copian el descuento, el alcance y los límites. La copia empieza desactivada y con 0 usos para que la revises."),
        err)),
    actions: [
      { label: "Cancelar", value: null },
      { label: "Duplicar", variant: "primary", icon: "copy", onClick: () => { const v = check(); if (!v) { input.focus(); return false; } m.close(v); return false; } },
    ],
  });
  return m.result.then((v) => (typeof v === "string" ? v : null));
}

/** Crea la copia en el servidor → item nuevo (o null si se canceló). */
async function duplicateCoupon(c, allCodes) {
  const code = await askCopyCode(c, allCodes);
  if (!code) return null;
  try {
    const { item } = await api.post("/api/admin/coupons", { ...payloadOf(c), code, active: false });
    toast(`Cupón ${item.code} creado como copia (desactivado).`);
    return item;
  } catch (e) {
    showApiError(e);
    return null;
  }
}

async function deleteCoupon(c, welcomeCode) {
  if (c.code === welcomeCode) {
    // No se puede eliminar mientras el modal lo entregue: se explica de una vez (sin un botón «Eliminar» que lleve a otro error)
    modal({
      title: `${c.code} es el cupón de bienvenida`,
      size: "sm",
      content: [
        h("p.modal__text", "Es el código que el modal de descuento entrega a quien se suscribe, así que no se puede eliminar mientras esté elegido ahí."),
        h("p.muted", "Para eliminarlo, primero elige otro cupón de bienvenida en «Modal de descuento». Si solo quieres que deje de funcionar, desactívalo."),
      ],
      actions: [
        { label: "Entendido", value: null },
        { label: "Ir a Modal de descuento", variant: "primary", icon: "gift", onClick: () => { location.hash = "#/descuento"; } },
      ],
    });
    return false;
  }
  const ok = await confirmDialog({
    title: `¿Eliminar el cupón ${c.code}?`,
    message: `Los clientes que lo tengan ya no podrán usarlo. ${c.usesCount ? `Se usó ${plural(c.usesCount, "vez", "veces")}. ` : ""}No se puede deshacer.`,
    confirmLabel: "Eliminar cupón",
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.del(`/api/admin/coupons/${enc(c.id)}`);
    toast(`Cupón ${c.code} eliminado.`);
    return true;
  } catch (e) {
    showApiError(e, { title: `No se puede eliminar ${c.code}` });
    return false;
  }
}

/**
 * Cambiar el código de un cupón que ya se entregó o se usó deja sin descuento a quien lo tiene: el código viejo deja
 * de existir (el checkout dice «Ese código no existe») y, si es el de bienvenida, quien ya se suscribió no puede
 * pedir el nuevo desde el pop-up. Se avisa antes y se sugiere crear un cupón nuevo. → true = cambiarlo igual.
 */
async function confirmRename(item, newCode, isWelcome) {
  const used = item.usesCount || 0;
  let delivered = 0;
  if (isWelcome) {
    try {
      const { items } = await api.get(`/api/admin/subscribers?q=${enc(item.code)}`);
      delivered = (items || []).filter((x) => String(x.couponCode || "").toUpperCase() === item.code).length;
    } catch { /* sin el conteo se avisa igual */ }
  }
  if (!isWelcome && !used) return true;
  const facts = [
    isWelcome ? (delivered
      ? `${plural(delivered, "persona lo recibió", "personas lo recibieron")} al suscribirse. Con el cambio, «${item.code}» deja de existir: si lo escriben en el carrito o el checkout, la tienda les dirá que no existe, y como ya están suscritas no pueden pedir el código nuevo desde el pop-up.`
      : `Es el cupón de bienvenida: quien ya lo tenga guardado se quedará sin descuento, porque «${item.code}» deja de existir.`) : null,
    used ? `Se usó ${plural(used, "vez", "veces")}: los clientes que guardaron «${item.code}» ya no podrán usarlo.` : null,
  ].filter(Boolean);
  return confirmDialog({
    title: `¿Cambiar ${item.code} por ${newCode}?`,
    message: facts.join(" "),
    details: h("p.muted", isWelcome
      ? "Si quieres otro código para los nuevos suscriptores, mejor crea un cupón nuevo y elígelo en «Modal de descuento»: así el anterior sigue funcionando para quienes ya lo tienen."
      : "Si quieres un código nuevo, mejor duplica el cupón (Más acciones › Duplicar) y desactiva este cuando ya no deba usarse."),
    confirmLabel: "Cambiar el código",
    cancelLabel: "No cambiarlo",
    danger: true,
  });
}

/** Activar/desactivar sin abrir el editor → item actualizado (o null). */
async function toggleCoupon(c, welcomeCode) {
  const turningOff = c.active;
  if (turningOff && c.code === welcomeCode) {
    const ok = await confirmDialog({
      title: `¿Desactivar ${c.code}?`,
      message: "Es el cupón de bienvenida: mientras esté desactivado la tienda oculta el pop-up de descuento y los botones «Obtén … de descuento» del carrito, el checkout y la sección Comunidad.",
      confirmLabel: "Desactivar",
      danger: true,
    });
    if (!ok) return null;
  }
  try {
    const { item } = await api.put(`/api/admin/coupons/${enc(c.id)}`, { ...payloadOf(c), active: !c.active });
    toast(item.active ? `Cupón ${item.code} activado.` : `Cupón ${item.code} desactivado: la tienda ya no lo acepta.`);
    return item;
  } catch (e) {
    showApiError(e);
    return null;
  }
}

/* ==========================================================================
   Listado
   ========================================================================== */
async function listView(el, params, ctx) {
  const [{ items }, data] = await Promise.all([
    api.get("/api/admin/coupons", { signal: ctx.signal }),
    content.load({ force: true }),
  ]);
  let list = items;
  const welcomeCode = data.discountModal?.couponCode || "";

  const statsBox = h("div.stats.mk-stats");
  const warnBox = h("div");
  const renderTop = () => {
    const today = todayCO();
    const st = list.map((c) => couponState(c, today));
    replace(statsBox,
      statCard({ label: "Vigentes", value: st.filter((s) => s === "active").length, hint: "La tienda los acepta hoy", icon: "check-circle", tone: "success" }),
      statCard({ label: "Programados", value: st.filter((s) => s === "scheduled").length, hint: "Empiezan más adelante", icon: "calendar", tone: "info" }),
      statCard({ label: "Sin vigencia", value: st.filter((s) => s === "inactive" || s === "expired" || s === "exhausted").length, hint: "Inactivos, vencidos o agotados", icon: "x-circle", tone: "neutral" }),
      statCard({ label: "Usos totales", value: list.reduce((n, c) => n + (c.usesCount || 0), 0), hint: "Pedidos confirmados con código", icon: "ticket", tone: "accent" }));
    const w = list.find((c) => c.code === welcomeCode);
    const ws = w ? couponState(w, today) : null;
    replace(warnBox, w && ws !== "active"
      ? notice({
        tone: "warning",
        title: `El cupón de bienvenida ${w.code} no está vigente (${STATE_LABEL[ws].toLowerCase()})`,
        message: "Mientras tanto la tienda oculta el pop-up de descuento y los botones «Obtén … de descuento». Actívalo, cambia sus fechas o elige otro cupón en «Modal de descuento».",
        action: h("div.cluster", button({ label: "Editar cupón", size: "sm", href: `#/cupones/${enc(w.id)}` }), button({ label: "Modal de descuento", size: "sm", variant: "ghost", href: "#/descuento" })),
      })
      : null);
  };

  const replaceRow = (item) => { list = list.map((c) => (c.id === item.id ? item : c)); table.setRows(list); renderTop(); };

  // Celda principal con botones: el núcleo convierte [data-row-link] en el enlace de la fila (rowHref)
  const codeCell = (c) => h("div.mk-code-cell",
    h("div.mk-code-cell__top",
      h("span.mk-code", { "data-row-link": "" }, c.code),
      iconButton({ icon: "copy", label: `Copiar el código ${c.code}`, size: "sm", className: "mk-copy", onClick: () => copyCode(c.code) }),
      c.code === welcomeCode ? h("a.mk-welcome", { href: "#/descuento", title: "Cupón de bienvenida del modal de descuento (se entrega al suscribirse). Clic para ir al modal." }, badge("Bienvenida", "accent")) : null),
    c.description ? h("span.mk-code-cell__desc", { title: c.description }, c.description) : null,
    h("div.mk-only-mobile.mk-cell-sub", h("strong", couponLabel(c)), stateBadge(c)));

  const usesCell = (c) => {
    const pct = c.maxUses ? Math.min(100, Math.round(((c.usesCount || 0) / c.maxUses) * 100)) : null;
    return h("div.mk-uses",
      h("span.mk-uses__num", usesText(c)),
      pct !== null ? h("span.mk-meter", { "aria-hidden": "true" }, h("span", { style: { width: `${pct}%` }, class: pct >= 100 && "is-full" })) : null);
  };

  const table = dataTable({
    caption: "Cupones de descuento",
    stateKey: "cupones",
    columns: [
      { key: "code", label: "Código", sortable: true, primary: true, render: codeCell, value: (c) => c.code },
      { key: "value", label: "Descuento", render: (c) => h("div.mk-disc", h("strong", couponLabel(c)), h("span.muted.small", c.type === "fixed" ? "Valor fijo" : "Porcentaje")), value: (c) => couponLabel(c), hideOn: "mobile" },
      { key: "state", label: "Estado", sortable: true, render: stateBadge, value: (c) => STATE_ORDER[couponState(c)], hideOn: "mobile" },
      { key: "uses", label: "Usos", sortable: true, render: usesCell, value: (c) => c.usesCount || 0, hideOn: "mobile" },
      { key: "validity", label: "Vigencia", sortable: true, render: (c) => h("span.nowrap", validityText(c)), value: (c) => c.endsAt || "9999", hideOn: "mobile" },
      { key: "scope", label: "Aplica a", render: (c) => scopeCell(c, data), hideOn: "tablet" },
    ],
    rows: list,
    search: { placeholder: "Buscar por código o descripción…", keys: ["code", "description"] },
    filters: [
      { key: "state", label: "Estado", allLabel: "Estado: todos", options: Object.entries(STATE_LABEL).map(([value, label]) => ({ value, label })), test: (c, v) => couponState(c) === v },
      { key: "type", label: "Tipo", allLabel: "Tipo: todos", options: [{ value: "percent", label: "Porcentaje" }, { value: "fixed", label: "Valor fijo" }] },
    ],
    rowHref: (c) => `#/cupones/${enc(c.id)}`,
    rowActions: (c) => [
      { label: "Editar", icon: "edit", href: `#/cupones/${enc(c.id)}`, primary: true },
      { label: "Copiar código", icon: "copy", onClick: () => copyCode(c.code) },
      { label: "Duplicar", icon: "layers", onClick: async () => { const item = await duplicateCoupon(c, new Set(list.map((x) => x.code))); if (item) { list = [item, ...list]; table.setRows(list); renderTop(); } } },
      { label: c.active ? "Desactivar" : "Activar", icon: c.active ? "eye-off" : "eye", onClick: async () => { const item = await toggleCoupon(c, welcomeCode); if (item) replaceRow(item); } },
      { divider: true },
      { label: "Eliminar", icon: "trash", danger: true, onClick: async () => { if (await deleteCoupon(c, welcomeCode)) { list = list.filter((x) => x.id !== c.id); table.setRows(list); renderTop(); } } },
    ],
    empty: { icon: "ticket", title: "Aún no hay cupones", message: "Crea un código de porcentaje o de valor fijo. Tus clientes lo escriben en el carrito o en el checkout.", action: { label: "Crear cupón", href: "#/cupones/nuevo", icon: "plus" } },
  });
  renderTop();

  el.append(h("div.page",
    pageHeader({
      title: "Cupones",
      breadcrumbs: [{ label: "Marketing" }],
      subtitle: "Códigos de descuento que tus clientes escriben en el carrito o en el checkout de la tienda.",
      actions: [
        button({ label: "Probar en el checkout", icon: "external", href: "../checkout.html", target: "_blank" }),
        button({ label: "Nuevo cupón", icon: "plus", variant: "primary", href: "#/cupones/nuevo" }),
      ],
    }),
    warnBox,
    statsBox,
    card({ flush: true, className: "mk-tbl", body: table.el })));
}

/* ==========================================================================
   Selector de productos (campo del formulario)
   ========================================================================== */
function productPicker(products, { value, onChange, id, describedBy }) {
  let selected = new Set(value || []);
  let onlySelected = false;
  const search = h("input.input.input--search", { id, type: "search", placeholder: "Buscar por nombre, referencia o categoría…", autocomplete: "off", "aria-label": "Buscar productos", "aria-describedby": describedBy });
  const count = h("span.mk-pp__count", { "aria-live": "polite" });
  const onlyBtn = button({ label: "Ver solo los elegidos", size: "sm", variant: "ghost", onClick: () => { onlySelected = !onlySelected; render(); } });
  const clearBtn = button({ label: "Quitar todos", size: "sm", variant: "ghost", onClick: () => { selected = new Set(); emit(); render(); search.focus(); } });
  const ul = h("ul.mk-pp__list", { "aria-label": "Productos" });
  const emptyMsg = h("p.mk-pp__empty", { hidden: true });
  const cats = new Map((content.data?.categories || []).map((c) => [c.id, c.name]));

  const ordered = () => {
    const known = products.filter((p) => selected.has(p.id)).map((p) => p.id);
    const unknown = [...selected].filter((x) => !products.some((p) => p.id === x));
    return [...known, ...unknown];
  };
  const emit = () => onChange(ordered());

  function render() {
    const q = fold(search.value).trim();
    const rows = products.filter((p) => (!onlySelected || selected.has(p.id)) && (!q || fold(`${p.name} ${p.ref || ""} ${p.id} ${cats.get(p.category) || ""}`).includes(q)));
    // Elegidos que ya no existen (se eliminaron mientras tanto, o vienen de una versión restaurada): visibles y con «Quitar»
    const missing = [...selected].filter((x) => !products.some((p) => p.id === x)).map((pid) => h("li.mk-pp__item.is-on.mk-pp__item--missing",
      h("div.mk-pp__label",
        icon("alert", { size: 18, className: "mk-pp__alert" }),
        h("span.mk-pp__text", h("span.mk-pp__name", `${pid} (ya no existe)`), h("span.mk-pp__meta", "Se eliminó o cambió de id. Quítalo para poder guardar.")),
        button({ label: "Quitar", icon: "x", size: "sm", variant: "ghost", ariaLabel: `Quitar ${pid}, que ya no existe`, onClick: () => { selected.delete(pid); emit(); render(); search.focus(); } }))));
    replace(ul, missing, rows.map((p) => {
      const cid = uid("pp");
      const cb = h("input.check__input", { type: "checkbox", id: cid, checked: selected.has(p.id) });
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(p.id); else selected.delete(p.id);
        emit();
        updCount();
        li.classList.toggle("is-on", cb.checked);
      });
      const li = h("li.mk-pp__item", { class: selected.has(p.id) && "is-on" },
        h("label.mk-pp__label", { for: cid },
          cb,
          h("span.check__box", { "aria-hidden": "true" }, icon("check", { size: 14, strokeWidth: 3 })),
          productThumb(p),
          h("span.mk-pp__text",
            h("span.mk-pp__name", p.name),
            h("span.mk-pp__meta", [cats.get(p.category) || p.category, money(p.price), p.ref].filter(Boolean).join(" · "))),
          p.status === "draft" ? statusBadge("draft") : null));
      return li;
    }));
    emptyMsg.hidden = rows.length > 0 || missing.length > 0;
    emptyMsg.textContent = onlySelected && !selected.size ? "Aún no eliges productos." : `No hay productos que coincidan con «${search.value.trim()}».`;
    updCount();
  }
  function updCount() {
    count.textContent = selected.size ? `${plural(selected.size, "producto elegido", "productos elegidos")}` : "Ningún producto elegido";
    onlyBtn.querySelector(".btn__label").textContent = onlySelected ? "Ver todos" : "Ver solo los elegidos";
    onlyBtn.setAttribute("aria-pressed", String(onlySelected));
    clearBtn.hidden = !selected.size;
  }
  search.addEventListener("input", render);
  render();
  const el = h("div.mk-pp",
    h("div.mk-pp__bar", h("div.table-search.mk-pp__search", icon("search", { size: 16, className: "table-search__icon" }), search), h("div.mk-pp__tools", count, onlyBtn, clearBtn)),
    ul, emptyMsg);
  return { el, setValue: (v) => { selected = new Set(v || []); render(); }, focus: () => search.focus() };
}

/* ==========================================================================
   Editor (nuevo y existente)
   ========================================================================== */
const NEW_COUPON = { code: "", description: "", type: "percent", value: 10, active: true, startsAt: null, endsAt: null, minSubtotal: 0, maxUses: null, appliesTo: "all", categoryIds: [], productIds: [] };

async function editorView(el, id, ctx) {
  let item = null;
  let all;
  try {
    const [one, coupons] = await Promise.all([
      id ? api.get(`/api/admin/coupons/${enc(id)}`, { signal: ctx.signal }) : null,
      api.get("/api/admin/coupons", { signal: ctx.signal }),
      content.load({ force: true }),
    ]);
    item = one?.item || null;
    all = coupons.items;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      el.append(h("div.page", pageHeader({ title: "Cupón no encontrado", breadcrumbs: [{ label: "Marketing" }, { label: "Cupones", href: "#/cupones" }] }),
        card({ body: emptyState({ icon: "ticket", title: "Este cupón no existe", message: "Puede que otra persona lo haya eliminado. Vuelve al listado para ver los cupones actuales.", action: { label: "Ver cupones", href: "#/cupones", icon: "arrow-left" } }) })));
      return;
    }
    throw e;
  }
  const data = content.data;
  let welcomeCode = data.discountModal?.couponCode || "";
  let titleEl = null;
  let subtitleEl = null;
  const isNew = !item;
  const isWelcome = () => !!item && item.code === welcomeCode;
  const takenCodes = () => new Set(all.filter((c) => c.id !== item?.id).map((c) => c.code));
  if (item) ctx.setTitle(item.code);

  const form = createForm({
    ctx,
    value: toForm(item || NEW_COUPON),
    saveLabel: isNew ? "Crear cupón" : "Guardar",
    successMessage: isNew ? "Cupón creado." : "Cupón guardado.",
    validate: (v) => {
      const out = {};
      if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) out.endsAt = "La fecha final debe ser igual o posterior a la inicial.";
      if (v.appliesTo === "categories" && !v.categoryIds.length) out.categoryIds = "Elige al menos una categoría.";
      if (v.appliesTo === "products" && !v.productIds.length) out.productIds = "Elige al menos un producto.";
      return out;
    },
    onSubmit: async (v) => {
      const body = payloadOf({ ...v, code: String(v.code || "").trim().toUpperCase() });
      const renamedWelcome = isWelcome() && body.code !== item.code;
      if (item && body.code !== item.code && !(await confirmRename(item, body.code, isWelcome()))) {
        throw new DOMException("No se cambió el código", "AbortError"); // sigue editando, sin guardar
      }
      let r;
      try {
        r = item ? await api.put(`/api/admin/coupons/${enc(item.id)}`, body) : await api.post("/api/admin/coupons", body);
      } catch (e) {
        if (e.isValidation && e.fields) e.fields = explainMissing(e.fields, body, data);
        throw e;
      }
      const prevId = item?.id;
      item = r.item;
      all = [item, ...all.filter((c) => c.id !== item.id)];
      if (renamedWelcome) {
        welcomeCode = item.code;
        content.invalidate(); // el servidor también cambió discountModal.couponCode
        toast(`El modal de descuento ahora entrega el código ${item.code}.`, { type: "info" });
      }
      if (!prevId) setTimeout(() => ctx.navigate(`/cupones/${enc(item.id)}`, { replace: true, force: true }));
      else {
        ctx.setTitle(item.code);
        if (titleEl) titleEl.textContent = item.code;
        if (subtitleEl) subtitleEl.textContent = item.description || "Código de descuento de la tienda.";
      }
      renderSide();
      return toForm(item);
    },
  });

  /* --- Código --- */
  const genBtn = button({ label: "Generar", icon: "sparkle", size: "sm", variant: "ghost", onClick: () => { form.set("code", randomCode()); codeField.querySelector("input")?.focus(); } });
  const codeField = f.text(form, "code", {
    label: "Código", required: true, maxlength: 30, className: "mk-code-field", spellcheck: false, placeholder: "Ej. NAVIDAD20",
    transform: (v) => v.toUpperCase().replace(/\s+/g, ""),
    help: "Es lo que tus clientes escriben en el carrito o en el checkout. Se guarda en MAYÚSCULAS; no distingue mayúsculas al usarlo.",
    validate: (v) => {
      const s = String(v || "").trim().toUpperCase();
      if (!CODE_RE.test(s)) return CODE_MSG;
      if (takenCodes().has(s)) return "Ya existe un cupón con este código.";
      return null;
    },
  });
  { // botón "Generar" junto a la etiqueta (como "Cursiva de marca" en los títulos)
    const lbl = codeField.querySelector(".field__label");
    if (lbl) {
      const row = h("div.field__labelrow");
      lbl.replaceWith(row);
      row.append(lbl, genBtn);
    }
  }

  /* --- Valor según el tipo (se redibuja al cambiar de tipo) --- */
  const lastByType = { percent: null, fixed: null };
  const valueSlot = h("div.mk-slot");
  let renderedType = null;
  const renderValue = () => {
    renderedType = form.get("type");
    replace(valueSlot, renderedType === "fixed"
      ? f.money(form, "value", { label: "Valor del descuento", required: true, min: 1, max: 100_000_000, width: "md", help: "Pesos que se restan del subtotal de los productos participantes (nunca más que ese subtotal)." })
      : f.number(form, "value", { label: "Porcentaje", required: true, min: 1, max: 100, suffix: "%", width: "sm", placeholder: "15", help: "Entre 1 y 100. Se calcula sobre los productos participantes." }));
  };

  /* --- Alcance (se redibuja al cambiar) --- */
  const scopeSlot = h("div.mk-slot");
  let renderedScope = null;
  const products = data.products || [];
  const renderScope = () => {
    renderedScope = form.get("appliesTo");
    if (renderedScope === "categories") {
      const counts = new Map();
      for (const p of products) counts.set(p.category, (counts.get(p.category) || 0) + 1);
      replace(scopeSlot, f.chips(form, "categoryIds", {
        label: "Categorías", required: true, requiredMessage: "Elige al menos una categoría.",
        options: (data.categories || []).map((c) => ({ value: c.id, label: `${c.name} (${counts.get(c.id) || 0})` })),
        missingLabel: (id) => `Categoría «${id}»`,
        help: "El descuento se calcula solo sobre las prendas de estas categorías. El número es la cantidad de productos.",
      }));
    } else if (renderedScope === "products") {
      replace(scopeSlot, f.custom(form, "productIds", {
        label: "Productos", required: true, requiredMessage: "Elige al menos un producto.", group: true,
        help: "El descuento se calcula solo sobre estos productos. Los borradores no se ven en la tienda.",
        create: (o) => productPicker(products, o),
      }));
    } else {
      replace(scopeSlot, h("p.muted.small.mk-scope-all", icon("check-circle", { size: 16 }), "Aplica a todos los productos del carrito."));
    }
  };

  /* --- Resumen y uso (columna derecha) --- */
  const headBadge = h("span.mk-hbadge");
  const sumCode = h("p.mk-sum__code");
  const sumSentence = h("p.mk-sum__sentence");
  const sumList = h("dl.kv.mk-sum__kv");
  const sumState = h("div.mk-sum__state");
  const usageBox = h("div.mk-usage");
  const welcomeBox = h("div");

  function renderSummary() {
    const v = form.value;
    const preview = { ...v, usesCount: item?.usesCount || 0 };
    const st = couponState(preview);
    replace(headBadge, item ? stateBadge(item) : null);
    sumCode.textContent = String(v.code || "").trim().toUpperCase() || "SIN CÓDIGO";
    sumCode.classList.toggle("is-empty", !v.code);
    sumSentence.textContent = couponSentence(v, data);
    replace(sumList,
      h("dt", "Tipo"), h("dd", v.type === "fixed" ? "Valor fijo" : "Porcentaje"),
      h("dt", "Compra mínima"), h("dd", v.minSubtotal ? money(v.minSubtotal) : "Sin mínimo"),
      h("dt", "Límite de usos"), h("dd", v.maxUses ? plural(v.maxUses, "uso", "usos") : "Ilimitado"),
      h("dt", "Vigencia"), h("dd", validityText(v)));
    const b = statusBadge(st);
    replace(sumState, h("span.muted.small", item ? "Estado con estos datos:" : "Al crearlo quedará:"), b, h("p.mk-sum__hint", stateHint(preview)));
    replace(welcomeBox, isWelcome()
      ? notice({
        tone: st === "active" ? "info" : "warning",
        title: "Cupón de bienvenida",
        message: st === "active"
          ? `Se entrega a quienes dejan su correo en el pop-up y en la sección Comunidad. Los textos con {descuento} muestran «${couponLabel(v)}».`
          : "Con estos datos no está vigente: la tienda ocultará el pop-up de descuento y los botones «Obtén … de descuento».",
        action: button({ label: "Modal de descuento", size: "sm", href: "#/descuento" }),
      })
      : null);
  }

  function renderSide() {
    renderSummary();
    if (!item) { replace(usageBox, null); return; }
    const used = item.usesCount || 0;
    const pct = item.maxUses ? Math.min(100, Math.round((used / item.maxUses) * 100)) : null;
    const resetBtn = button({ label: "Reiniciar contador", icon: "refresh", size: "sm", disabled: !used, onClick: () => resetUses(resetBtn) });
    replace(usageBox,
      h("div.mk-usage__num", h("strong", number(used)), h("span", item.maxUses ? `de ${number(item.maxUses)} usos` : used === 1 ? "uso · sin límite" : "usos · sin límite")),
      pct !== null ? h("span.mk-meter.mk-meter--lg", { role: "img", "aria-label": `${pct}% del límite usado` }, h("span", { style: { width: `${pct}%` }, class: pct >= 100 && "is-full" })) : null,
      h("p.muted.small", "Cuenta un uso cada pedido confirmado en el checkout con este código."),
      h("div.cluster", resetBtn),
      h("dl.kv.mk-usage__meta",
        h("dt", "Creado"), h("dd", h("time", { datetime: item.createdAt, title: dateTime(item.createdAt) }, date(item.createdAt)), item.createdBy ? ` por ${item.createdBy}` : ""),
        h("dt", "Modificado"), h("dd", h("time", { datetime: item.updatedAt, title: dateTime(item.updatedAt) }, relativeTime(item.updatedAt)))));
  }

  async function resetUses(btn) {
    const ok = await confirmDialog({
      title: "¿Reiniciar el contador de usos?",
      message: `${item.code} vuelve a 0 usos${item.maxUses ? ` y se puede usar otra vez ${plural(item.maxUses, "vez", "veces")}` : ""}. Los cambios sin guardar del formulario no se tocan.`,
      confirmLabel: "Reiniciar contador",
      danger: true,
    });
    if (!ok) return;
    try {
      const { item: next } = await withBusy(btn, () => api.put(`/api/admin/coupons/${enc(item.id)}`, { ...payloadOf(item), resetUses: true }), { label: "Reiniciando…" });
      item = next;
      all = all.map((c) => (c.id === item.id ? item : c));
      renderSide();
      toast("Contador de usos reiniciado.");
    } catch (e) {
      showApiError(e);
    }
  }

  form.on("change", ({ path }) => {
    if (form.get("type") !== renderedType) renderValue();
    if (form.get("appliesTo") !== renderedScope) renderScope();
    if (path === "" || path === "value") lastByType[form.get("type")] = form.get("value");
    renderSummary();
  });

  // Al cambiar de tipo, cada tipo recuerda su propio valor (15 % no se convierte en $15)
  const typeField = f.segmented(form, "type", {
    label: "Tipo de descuento",
    options: [{ value: "percent", label: "Porcentaje", icon: "percent" }, { value: "fixed", label: "Valor fijo", icon: "tag" }],
    onChange: (t) => form.set("value", lastByType[t] ?? null),
  });
  lastByType[form.get("type")] = form.get("value");
  renderValue();
  renderScope();

  /* --- Acciones del encabezado --- */
  const actions = [];
  if (item) {
    actions.push(button({ label: "Probar en el checkout", icon: "external", href: "../checkout.html", target: "_blank" }));
    actions.push(menu({
      label: "Más acciones",
      items: () => [
        { label: "Copiar código", icon: "copy", onClick: () => copyCode(item.code) },
        { label: "Duplicar", icon: "layers", onClick: async () => { const copy = await duplicateCoupon(item, new Set(all.map((c) => c.code))); if (copy) ctx.navigate(`/cupones/${enc(copy.id)}`); } },
        { divider: true },
        { label: "Eliminar cupón", icon: "trash", danger: true, onClick: async () => { if (await deleteCoupon(item, welcomeCode)) ctx.navigate("/cupones", { force: true }); } },
      ],
    }));
  } else {
    actions.push(button({ label: "Cancelar", variant: "ghost", href: "#/cupones" }));
  }

  const createBtn = isNew ? form.actions({ saveLabel: "Crear cupón", showDiscard: false, alwaysEnabled: true }) : null;

  el.append(h("div.page.page--form",
    pageHeader({
      title: isNew ? "Nuevo cupón" : item.code,
      breadcrumbs: [{ label: "Marketing" }, { label: "Cupones", href: "#/cupones" }],
      subtitle: isNew ? "Crea un código de descuento de porcentaje o de valor fijo." : item.description || "Código de descuento de la tienda.",
      badge: headBadge,
      actions,
    }),
    welcomeBox,
    h("div.mk-editor",
      h("div.mk-editor__main",
        card({
          title: "Código",
          description: "Cómo se llama el cupón y para qué es.",
          body: form.element(
            codeField,
            f.text(form, "description", { label: "Descripción interna", maxlength: 160, optional: true, placeholder: "Ej. Campaña de Navidad en Instagram", help: "Solo para el equipo: no se muestra en la tienda." }),
          ),
        }),
        card({
          title: "Descuento",
          body: form.element(f.row(typeField, valueSlot)),
        }),
        card({
          title: "Aplica a",
          description: "Qué productos del carrito reciben el descuento.",
          body: form.element(
            f.segmented(form, "appliesTo", { label: "Productos participantes", className: "mk-scope-seg", options: [{ value: "all", label: "Todo el catálogo" }, { value: "categories", label: "Categorías" }, { value: "products", label: "Productos" }] }),
            scopeSlot,
          ),
        }),
        card({
          title: "Requisitos y límites",
          body: form.element(f.row(
            f.money(form, "minSubtotal", { label: "Compra mínima", optional: true, max: 100_000_000, placeholder: "Sin mínimo", help: "Vacío = sin mínimo. Se compara con el subtotal de los productos participantes; si no llega, la tienda muestra «Compra mínima de $X para usar este código»." }),
            f.number(form, "maxUses", { label: "Límite de usos", optional: true, nullable: true, min: 1, max: 100_000_000, placeholder: "Ilimitado", help: "Vacío = ilimitado. Al llegar al límite la tienda responde «Este código ya alcanzó su límite de usos»." }),
          )),
        }),
        card({
          title: "Estado y vigencia",
          body: form.element(
            f.switch(form, "active", { label: "Cupón activo", description: "Si lo apagas, la tienda lo rechaza con «Este código no está activo»." }),
            f.row(
              f.date(form, "startsAt", { label: "Válido desde", optional: true }),
              f.date(form, "endsAt", { label: "Válido hasta", optional: true, validate: (v, fm) => (v && fm.get("startsAt") && v < fm.get("startsAt") ? "La fecha final debe ser igual o posterior a la inicial." : null) }),
            ),
            h("p.field__help.mk-dates-help", icon("clock", { size: 14 }), "Vacío = sin límite. Las fechas incluyen el día completo, en hora de Colombia."),
          ),
        })),
      h("aside.mk-editor__side", { "aria-label": "Resumen del cupón" },
        card({
          title: "Resumen",
          className: "mk-sum",
          body: [sumCode, sumSentence, sumState, sumList, createBtn],
        }),
        item ? card({ title: "Uso", body: usageBox }) : null,
        card({
          className: "mk-howto",
          body: [
            h("p.mk-howto__title", icon("info", { size: 16 }), "Cómo lo usan tus clientes"),
            h("p.muted.small", "Escriben el código en el carrito o en el checkout. Se acepta un código por pedido y el descuento se ve en el resumen antes de enviar el pedido por WhatsApp."),
          ],
        })))));
  titleEl = el.querySelector(".page-title");
  subtitleEl = el.querySelector(".page-subtitle");
  renderSide();
}

/* ==========================================================================
   Rutas
   ========================================================================== */
export default [
  {
    path: "/cupones",
    title: "Cupones",
    roles: ["admin"],
    render: (el, params, ctx) => listView(el, params, ctx),
  },
  {
    path: "/cupones/nuevo",
    title: "Nuevo cupón",
    roles: ["admin"],
    render: (el, params, ctx) => editorView(el, null, ctx),
  },
  {
    path: "/cupones/:id",
    title: "Editar cupón",
    roles: ["admin"],
    render: (el, { id }, ctx) => editorView(el, id, ctx),
  },
];
