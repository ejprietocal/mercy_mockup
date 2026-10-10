/* ==========================================================================
   Mercy Studio · Panel — views/products.js
   Productos (contrato §3 "products", §4.3 y §7; patrón C de admin/README.md):
   · #/productos        listado: miniatura, nombre y referencia, categoría, precio, stock total (y tallas
                        sin stock), estado (Publicado / Borrador / Agotado / Poco stock), actualizado.
                        Búsqueda (nombre, referencia, etiquetas, categoría, colores), filtros por categoría y
                        estado (lee y mantiene ?estado=agotados|poco-stock del Escritorio y ?categoria=<id> de
                        Categorías), orden (nombre, precio, más
                        vendidos, novedades, stock, actualizado) y acciones: editar, ver en la tienda,
                        duplicar, publicar / pasar a borrador, eliminar.
   · #/productos/nuevo  y #/productos/:id  editor por pestañas con barra de guardado:
                        General · Colores y stock (hormas, tallas, colores con hasta 4 fotos y stock por
                        talla) · Descripción (detalles y cuidados heredables) · Estampados · Video ·
                        Tarjeta sin foto (vista previa en vivo) · Orden y reseñas. Columna lateral con la
                        tarjeta tal como se ve en el catálogo. Maneja 422 (cada error en su campo, también
                        colors.N.photos y colors.N.stock.TALLA), 409 por edición concurrente e id repetido.
   La tienda lee estos datos en js/data.js (solo productos publicados) y los muestra en catalogo.html,
   producto.html y en "Los más vendidos" del Inicio.
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { ApiError } from "../core/api.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import { pexelsSized } from "../core/media.js";
import {
  button, card, confirmDialog, dataTable, emptyState, menu, modal, notice, pageHeader,
  promptDialog, showApiError, statusBadge, tabs, toast,
} from "../core/ui.js";
import { HEX_RE, SLUG_RE, clone, dateTime, fold, money, number, plural, relativeTime, siteUrl, slugify } from "../core/format.js";

export const LOW_STOCK = 10;           // igual que el servidor y el Escritorio: 1–10 unidades en total = poco stock
const MAX_COLORS = 12;                 // contrato §3: 1–12 colores por producto
const MAX_PHOTOS = 4;                  // contrato §3: máx. 4 fotos por color
const MAX_STOCK = 100000;
const STD_SIZES = ["S", "M", "L", "XL", "XXL"];
const SIZE_RE = /^[\p{L}\p{N}][\p{L}\p{N} ./+-]{0,11}$/u;          // mismo patrón que el servidor
const SIZE_MSG = "Usa letras o números (p. ej. S, XL, Única, 10-12).";
const SIZE_RANK = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];
const SLUG_MSG = "Usa solo letras minúsculas sin tildes, números y guiones (máx. 60 caracteres).";
const TILE_FROM = "#d8bea6";           // respaldos de js/data.js
const TILE_TO = "#b77e5d";
const enc = encodeURIComponent;
const storeUrl = (id) => `../producto.html?id=${enc(id)}`;

/* ==========================================================================
   Utilidades de producto (mismas reglas que la tienda, js/data.js)
   ========================================================================== */
const colorTotal = (c) => Object.values(c?.stock || {}).reduce((a, b) => a + (Number(b) || 0), 0);
export const productStock = (p) => (p?.colors || []).reduce((s, c) => s + colorTotal(c), 0);
const isSoldOut = (p) => !!p.soldOut || productStock(p) === 0;
const isLow = (p) => !isSoldOut(p) && productStock(p) <= LOW_STOCK;
const hexOr = (v, d) => (typeof v === "string" && HEX_RE.test(v) ? v : d);

/** Celdas color × talla en 0 ("tallas sin stock"). */
function emptyCells(p) {
  let n = 0;
  for (const c of p.colors || []) for (const s of p.sizes || []) if (!(Number(c.stock?.[s]) > 0)) n++;
  return n;
}

/** Índice del color que la tienda muestra primero: el primero con stock (o el primero). */
function initialColorIndex(colors = []) {
  const i = colors.findIndex((c) => colorTotal(c) > 0);
  return i === -1 ? 0 : i;
}

/** Fotos de un color; si no tiene, las del primer color que tenga (como la tienda). */
function photosFor(p, index) {
  const own = p.colors?.[index]?.photos || [];
  if (own.length) return own;
  return (p.colors || []).find((c) => c.photos?.length)?.photos || [];
}

const firstPhoto = (p) => (p.colors || []).find((c) => c.photos?.length)?.photos[0] || null;

/** URL de una foto para un ancho dado (Pexels con ?w=, subidas con su miniatura de 600 px). */
function photoSrc(ph, w = 600) {
  const src = String(ph?.src || "");
  if (w <= 600 && ph?.thumb) return siteUrl(ph.thumb);
  return pexelsSized(src, w);
}

const tileLines = (p) => {
  const lines = (p.tile?.lines || []).map((l) => String(l ?? "").trim()).filter(Boolean);
  return lines.length ? lines : [String(p.name || "MERCY").toUpperCase()];
};

/** Orden "natural" de tallas: XS < S < M < L < XL…, números de menor a mayor, el resto al final. */
function sortSizes(list) {
  const rank = (s) => {
    const u = String(s).toUpperCase();
    const i = SIZE_RANK.indexOf(u);
    if (i !== -1) return i;
    const n = parseFloat(u);
    return Number.isFinite(n) ? 100 + n : 1000;
  };
  return list.slice().sort((a, b) => rank(a) - rank(b));
}

/** Tallas conocidas siempre en mayúsculas ("xl" → "XL"). */
const normSize = (s) => (/^(?:x{0,3}s|m|x{0,4}l|[2-4]xl)$/i.test(s) ? s.toUpperCase() : s);

function uniqueSlug(base, taken) {
  const b = (base || "producto").slice(0, 56).replace(/-+$/, "") || "producto";
  if (!taken.has(b)) return b;
  for (let n = 2; ; n++) if (!taken.has(`${b}-${n}`)) return `${b}-${n}`;
}

/* ==========================================================================
   Piezas visuales compartidas
   ========================================================================== */
/** Miniatura cuadrada: primera foto del primer color con fotos o el degradado de la tarjeta. */
function thumb(p, { size = "md" } = {}) {
  const t = p.tile || {};
  const tile = () => h("span.pr-thumb.pr-thumb--tile", {
    class: `pr-thumb--${size}`,
    style: { background: `linear-gradient(155deg, ${hexOr(t.from, TILE_FROM)}, ${hexOr(t.to, TILE_TO)})` },
    "aria-hidden": "true",
  }, h("span", tileLines(p)[0].slice(0, 2)));
  const ph = firstPhoto(p);
  if (!ph) return tile();
  const img = h("img", { src: photoSrc(ph, 160), alt: "", loading: "lazy", decoding: "async" });
  const box = h("span.pr-thumb", { class: `pr-thumb--${size}`, "aria-hidden": "true" }, img);
  img.addEventListener("error", () => box.replaceWith(tile()), { once: true });
  return box;
}

/** Tarjeta sin foto (degradado + texto), con el mismo cálculo de tamaño que js/ui.js de la tienda. */
function tileEl(p, { sub = true } = {}) {
  const t = p.tile || {};
  const lines = tileLines(p);
  const longest = lines.reduce((m, l) => Math.max(m, [...l].length), 1);
  let fs = Math.max(9, 30 - 2.6 * longest);
  if (t.stacked) fs = Math.max(9, 26 - 2.2 * longest);
  if (t.small) fs *= 0.82;
  if (Number(t.fs) > 0) fs = Number(t.fs);
  const inner = t.stacked
    ? [h("span.pe-tile__line.pe-tile__line--sm", lines[0]), h("span.pe-tile__line.pe-tile__line--lg", lines[1] || "")]
    : lines.map((l) => h("span.pe-tile__line", l));
  return h("div.pe-tile", {
    class: t.stacked && "pe-tile--stacked",
    style: { "--tile-from": hexOr(t.from, TILE_FROM), "--tile-to": hexOr(t.to, TILE_TO), "--tile-fs": `${fs.toFixed(2)}cqw` },
  }, h("div.pe-tile__text", inner, sub && t.sub ? h("span.pe-tile__sub", t.sub) : null));
}

/** Modal "es un borrador" (los borradores no se ven en la tienda). */
function draftDialog(name, onPublish, { pending = false } = {}) {
  return modal({
    title: "Este producto es un borrador",
    size: "sm",
    content: [
      h("p.modal__text", `«${name || "Este producto"}» no se ve en la tienda: quien abra su enlace verá «Prenda no encontrada».`),
      h("p.muted", pending
        ? "Publícalo para que aparezca en el catálogo. Al publicar también se guardan los cambios que tienes pendientes."
        : "Publícalo para que aparezca en el catálogo y se pueda comprar."),
    ],
    actions: [
      { label: "Cerrar", value: null },
      onPublish ? { label: "Publicar ahora", variant: "primary", icon: "eye", busyLabel: "Publicando…", onClick: onPublish } : null,
    ].filter(Boolean),
  });
}

/* ==========================================================================
   #/productos — listado
   ========================================================================== */
const SORTS = [
  { id: "name", label: "Nombre (A–Z)", key: "name", dir: "asc" },
  { id: "best", label: "Más vendidos", key: "bestRank", dir: "asc" },
  { id: "new", label: "Novedades", key: "newRank", dir: "asc" },
  { id: "price-asc", label: "Precio: menor a mayor", key: "price", dir: "asc" },
  { id: "price-desc", label: "Precio: mayor a menor", key: "price", dir: "desc" },
  { id: "stock", label: "Stock: menor a mayor", key: "stock", dir: "asc" },
  { id: "updated", label: "Actualizados recientemente", key: "updatedAt", dir: "desc" },
];
const ESTADOS = [
  { value: "publicados", label: "Publicados", test: (p) => p.status === "published" },
  { value: "borradores", label: "Borradores", test: (p) => p.status !== "published" },
  { value: "agotados", label: "Agotados", test: isSoldOut },
  { value: "poco-stock", label: `Poco stock (1–${LOW_STOCK} uds.)`, test: isLow },
];

async function listView(el, params, ctx) {
  const data = await content.load({ force: true });
  if (!ctx.isCurrent) return;
  const cats = new Map((data.categories || []).map((c) => [c.id, c]));
  const cols = new Map((data.collections || []).map((c) => [c.id, c]));
  const palette = new Map((data.colors || []).map((c) => [c.id, c]));
  let rows = (data.products || []).slice();
  let busy = false;

  const catName = (p) => cats.get(p.category)?.name || p.category || "";

  /* --- Celdas --- */
  const productCell = (p) => {
    const total = productStock(p);
    return h("span.pr-prod",
      thumb(p),
      h("span.pr-prod__text",
        h("span.pr-prod__name", p.name),
        h("span.pr-prod__meta",
          h("span", p.ref || "Sin referencia"),
          h("span.pr-dots", { "aria-hidden": "true" }, (p.colors || []).slice(0, 8).map((c) => h("span.pr-dot", { style: { background: palette.get(c.color)?.hex || "#999" }, title: palette.get(c.color)?.name || c.color })))),
        h("span.pr-prod__mobile", `${money(p.price)} · ${plural(total, "unidad", "unidades")}`)));
  };
  const stockCell = (p) => {
    const total = productStock(p);
    const empty = emptyCells(p);
    return h("span.pr-stock",
      h("span.pr-stock__total", { class: total === 0 ? "is-zero" : total <= LOW_STOCK ? "is-low" : null }, plural(total, "unidad", "unidades")),
      empty ? h("span.pr-stock__empty", plural(empty, "talla sin stock", "tallas sin stock")) : null);
  };
  const statusCell = (p) => {
    const total = productStock(p);
    return h("span.pr-status",
      statusBadge(p.status === "published" ? "published" : "draft"),
      isSoldOut(p) ? h("span", { title: p.soldOut && total > 0 ? "Marcado como agotado aunque tiene stock" : "Sin unidades" }, statusBadge("soldout")) : isLow(p) ? statusBadge("low") : null);
  };

  const columns = [
    { key: "name", label: "Producto", sortable: true, primary: true, render: productCell, value: (p) => p.name },
    { key: "category", label: "Categoría", sortable: true, hideOn: "tablet", render: (p) => catName(p) || null, value: catName },
    { key: "price", label: "Precio", sortable: true, align: "end", hideOn: "mobile", className: "nowrap", render: (p) => money(p.price), value: (p) => p.price },
    { key: "stock", label: "Stock", sortable: true, hideOn: "mobile", render: stockCell, value: productStock },
    { key: "status", label: "Estado", render: statusCell, value: (p) => (p.status === "published" ? "Publicado" : "Borrador") },
    { key: "bestRank", label: "Más vendidos", sortable: true, align: "end", className: "pr-col-rank pr-col-best", render: (p) => `#${p.bestRank}`, value: (p) => p.bestRank },
    { key: "newRank", label: "Novedades", sortable: true, align: "end", className: "pr-col-rank pr-col-new", render: (p) => `#${p.newRank}`, value: (p) => p.newRank },
    {
      key: "updatedAt", label: "Actualizado", sortable: true, hideOn: "tablet", className: "nowrap",
      render: (p) => (p.updatedAt ? h("time", { datetime: p.updatedAt, title: `${dateTime(p.updatedAt)}${p.updatedBy ? ` · ${p.updatedBy}` : ""}` }, relativeTime(p.updatedAt)) : null),
      value: (p) => (p.updatedAt ? Date.parse(p.updatedAt) : 0),
    },
  ];

  /* --- Acciones --- */
  const replaceRow = (oldId, item) => { rows = rows.map((r) => (r.id === oldId ? item : r)); refresh(); };

  async function guarded(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { showApiError(e); } finally { busy = false; }
  }

  async function setStatus(p, status) {
    const fresh = await content.product(p.id);
    const item = fresh.status === status ? fresh : await content.updateProduct(p.id, { ...fresh, status });
    replaceRow(p.id, item);
    if (status === "published") {
      toast(`«${item.name}» está publicado y ya se ve en la tienda.`, { action: { label: "Ver en la tienda", onClick: () => window.open(storeUrl(item.id), "_blank", "noopener") } });
    } else toast(`«${item.name}» pasó a borrador: ya no se ve en la tienda.`);
  }

  const duplicate = (p) => guarded(async () => {
    const copy = await content.duplicateProduct(p.id);
    toast(`Creamos «${copy.name}» en borrador. Revísalo y publícalo cuando esté listo.`);
    ctx.navigate(`/productos/${enc(copy.id)}`);
  });

  const remove = (p) => guarded(async () => {
    const ok = await confirmDialog({
      title: `¿Eliminar «${p.name}»?`,
      message: `Se quitará de la tienda y del panel${p.status === "published" ? " de inmediato" : ""}. Un administrador puede recuperarlo en Revisiones: abre «Producto eliminado» y toca «Deshacer este cambio» (no toca nada más del sitio).`,
      confirmLabel: "Eliminar producto",
      danger: true,
    });
    if (!ok) return;
    await content.deleteProduct(p.id);
    rows = rows.filter((r) => r.id !== p.id);
    refresh();
    toast("Producto eliminado.");
  });

  const rowActions = (p) => [
    { label: "Editar", icon: "edit", href: `#/productos/${enc(p.id)}`, primary: true },
    p.status === "published"
      ? { label: "Ver en la tienda", icon: "external", href: storeUrl(p.id), target: "_blank" }
      : { label: "Ver en la tienda", icon: "external", onClick: () => draftDialog(p.name, () => setStatus(p, "published")) },
    { label: "Duplicar", icon: "copy", onClick: () => duplicate(p) },
    p.status === "published"
      ? { label: "Pasar a borrador", icon: "eye-off", onClick: () => guarded(() => setStatus(p, "draft")) }
      : { label: "Publicar", icon: "eye", onClick: () => guarded(() => setStatus(p, "published")) },
    { divider: true },
    { label: "Eliminar", icon: "trash", danger: true, onClick: () => remove(p) },
  ];

  /* --- Orden (selector sincronizado con los encabezados de la tabla) --- */
  const sortSel = h("select.input.input--select.pr-sort", { "aria-label": "Ordenar por" },
    h("option", { value: "", hidden: true }, "Orden personalizado"),
    SORTS.map((s) => h("option", { value: s.id }, s.label)));

  const table = dataTable({
    caption: "Productos",
    stateKey: "productos",
    columns,
    rows,
    search: {
      placeholder: "Buscar por nombre, ref. o etiqueta…",
      keys: ["ref", "tags", "id"],
      text: (p) => [cols.get(p.collection)?.name, ...(p.colors || []).map((c) => palette.get(c.color)?.name)].filter(Boolean).join(" "),
    },
    filters: [
      { key: "category", label: "Categoría", allLabel: "Categoría: todas", options: (data.categories || []).map((c) => ({ value: c.id, label: c.name })) },
      { key: "estado", label: "Estado", allLabel: "Estado: todos", options: ESTADOS.map(({ value, label }) => ({ value, label })), test: (p, v) => ESTADOS.find((x) => x.value === v)?.test(p) ?? true },
    ],
    sort: { key: "name", dir: "asc" },
    pageSize: 25,
    rowHref: (p) => `#/productos/${enc(p.id)}`,
    rowActions,
    // Filtros en la URL (se pueden compartir o recargar) y selector «Ordenar» al día con los encabezados
    onStateChange: (state) => {
      syncSort(state.sort);
      if (ctx.isCurrent) ctx.setQuery({ estado: state.filters.estado || null, categoria: state.filters.category || null });
    },
    toolbar: [h("label.pr-sortbox", h("span.pr-sortbox__label", "Ordenar"), sortSel)],
    empty: { icon: "shirt", title: "Aún no hay productos", message: "Crea el primero con sus colores, tallas, stock y hasta 4 fotos por color.", action: { label: "Crear producto", href: "#/productos/nuevo", icon: "plus" } },
  });

  /** El selector «Ordenar» muestra el orden de la tabla (también si se ordena con los encabezados). */
  function syncSort(cur = table.state.sort) {
    const match = cur && SORTS.find((s) => s.key === cur.key && s.dir === cur.dir);
    sortSel.value = match ? match.id : "";
    table.el.classList.toggle("pr-show-best", cur?.key === "bestRank");
    table.el.classList.toggle("pr-show-new", cur?.key === "newRank");
  }
  sortSel.addEventListener("change", () => {
    const s = SORTS.find((x) => x.id === sortSel.value);
    if (s) table.setSort(s.key, s.dir);
  });

  /* --- Orden inicial desde la URL: ?orden=mas-vendidos|novedades (p. ej. desde Inicio › Los más vendidos) --- */
  const qOrden = { "mas-vendidos": "best", novedades: "new" }[ctx.query.get("orden") || ""];
  if (qOrden) {
    // Toda la lista en ese orden: sin la búsqueda ni los filtros recordados de la última visita
    const s = SORTS.find((x) => x.id === qOrden);
    table.setState({ q: "", filters: { estado: "", category: "" }, sort: { key: s.key, dir: s.dir } });
    ctx.setQuery({ orden: null });
  }

  /* --- Filtro inicial desde la URL: ?estado=agotados|poco-stock (Escritorio) · ?categoria=<id> (Categorías) --- */
  const qEstado = ctx.query.get("estado");
  const qCat = ctx.query.get("categoria");
  const okEstado = !!qEstado && ESTADOS.some((x) => x.value === qEstado);
  const okCat = !!qCat && cats.has(qCat);
  if (okEstado || okCat) {
    // Un enlace con filtro muestra exactamente eso: sin la búsqueda ni los otros filtros recordados
    table.setState({ q: "", filters: { estado: okEstado ? qEstado : "", category: okCat ? qCat : "" } });
  } else {
    // Sin filtro en la URL (o uno que ya no existe): la URL refleja lo que se recordó de la última visita
    const st = table.state;
    ctx.setQuery({ estado: st.filters.estado || null, categoria: st.filters.category || null });
  }

  /* --- Encabezado --- */
  const subtitle = h("p.page-subtitle");
  function summary() {
    const pub = rows.filter((p) => p.status === "published").length;
    const out = rows.filter(isSoldOut).length;
    subtitle.textContent = rows.length
      ? `${plural(rows.length, "producto", "productos")} · ${plural(pub, "publicado", "publicados")} · ${plural(rows.length - pub, "borrador", "borradores")}${out ? ` · ${plural(out, "agotado", "agotados")}` : ""}`
      : "Catálogo de la tienda: precios, colores, fotos, tallas y stock.";
  }
  function refresh() {
    table.setRows(rows);
    syncSort();
    summary();
  }

  const header = pageHeader({
    title: "Productos",
    breadcrumbs: [{ label: "Tienda" }],
    actions: [
      button({ label: "Ver catálogo", icon: "external", href: "../catalogo.html", target: "_blank" }),
      button({ label: "Nuevo producto", icon: "plus", variant: "primary", href: "#/productos/nuevo" }),
    ],
  });
  header.querySelector(".page-header__titles")?.append(subtitle);
  summary();
  syncSort();

  el.append(h("div.page.pr-page", header, card({ flush: true, body: table.el })));
}

/* ==========================================================================
   #/productos/nuevo · #/productos/:id — editor
   ========================================================================== */
function newProduct(data) {
  const ps = data.products || [];
  const best = ps.map((p) => p.bestRank).filter((n) => Number.isInteger(n) && n < 999);
  const news = ps.map((p) => p.newRank).filter((n) => Number.isInteger(n));
  return {
    id: "", ref: "", name: "", status: "published",
    category: "", collection: "",
    fits: [], sizes: STD_SIZES.slice(),
    price: null, badge: "Nuevo", envioGratis: false, soldOut: false,
    bestRank: Math.min(9999, best.length ? Math.max(...best) + 1 : 1),
    newRank: news.length ? Math.max(0, Math.min(...news) - 1) : 1,
    rating: 0, reviewsCount: 0,
    colors: [{ color: "", photos: [], stock: Object.fromEntries(STD_SIZES.map((s) => [s, 0])) }],
    prints: [], video: null,
    tile: { from: TILE_FROM, to: TILE_TO, lines: [], sub: "", stacked: false, small: false, fs: null },
    tags: [], desc: "", story: "", details: [], care: [],
  };
}

/** Completa claves que el formulario necesita (sin cambiar el significado). */
function normalize(p) {
  p.colors = Array.isArray(p.colors) ? p.colors : [];
  p.sizes = Array.isArray(p.sizes) ? p.sizes : [];
  for (const c of p.colors) {
    c.photos = Array.isArray(c.photos) ? c.photos : [];
    c.stock = c.stock && typeof c.stock === "object" ? c.stock : {};
  }
  p.prints = Array.isArray(p.prints) ? p.prints : [];
  p.tile = { from: TILE_FROM, to: TILE_TO, lines: [], sub: "", stacked: false, small: false, fs: null, ...(p.tile || {}) };
  for (const k of ["fits", "tags", "details", "care"]) if (!Array.isArray(p[k])) p[k] = [];
  return p;
}

/** Lo que se envía al servidor: stock exacto por talla, video vacío = null, ids de estampados. */
function prepare(v) {
  const p = clone(v);
  const sizes = p.sizes || [];
  p.colors = (p.colors || []).map((c) => ({
    ...c,
    stock: Object.fromEntries(sizes.map((s) => [s, Number.isFinite(c.stock?.[s]) ? c.stock[s] : 0])),
  }));
  if (!p.video || !String(p.video.src || "").trim()) p.video = null;
  const taken = new Set();
  p.prints = (p.prints || []).map((x) => {
    const id = x.id && SLUG_RE.test(x.id) && !taken.has(x.id) ? x.id : uniqueSlug(slugify(x.name) || "estampado", taken);
    taken.add(id);
    return { ...x, id };
  });
  p.tile = { ...p.tile, lines: (p.tile?.lines || []).map((l) => String(l ?? "").trim()).filter(Boolean) };
  p.badge = String(p.badge || "").trim();
  return p;
}

/** Interruptor suelto (no enlazado a una ruta), con las clases del framework. */
function switchControl({ label, description, onChange }) {
  const id = uid("sw");
  const input = h("input.switch__input", { id, type: "checkbox", role: "switch" });
  input.addEventListener("change", () => onChange?.(input.checked));
  const el = h("div.field.field--switch",
    h("label.switch", { for: id }, input,
      h("span.switch__track", { "aria-hidden": "true" }, h("span.switch__thumb")),
      h("span.switch__label", label, description && h("span.check__desc", description))));
  return { el, input, set: (v) => { input.checked = !!v; } };
}

function missingView(el, id) {
  el.append(h("div.page",
    pageHeader({ title: "Producto no encontrado", breadcrumbs: [{ label: "Tienda" }, { label: "Productos", href: "#/productos" }] }),
    card({ body: emptyState({ icon: "search", title: "Este producto no existe", message: `No encontramos un producto con el id «${id}». Puede que lo hayan eliminado o que su enlace haya cambiado.`, action: { label: "Ver todos los productos", href: "#/productos", icon: "shirt" } }) })));
}

async function editorView(el, id, ctx) {
  const data = await content.load({ force: true });
  let value;
  if (id) {
    try {
      value = await content.product(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (ctx.isCurrent) { ctx.setTitle("Producto no encontrado"); missingView(el, id); }
        return;
      }
      throw e;
    }
  } else value = newProduct(data);
  if (!ctx.isCurrent) return;
  normalize(value);

  const isNew = !id;
  const palette = (data.colors || []).slice();
  const paletteById = new Map(palette.map((c) => [c.id, c]));
  const cats = new Map((data.categories || []).map((c) => [c.id, c]));
  const otherIds = new Set((data.products || []).map((p) => p.id).filter((x) => x !== id));
  const showPhotos = data.settings?.showPhotos !== false;
  const homeCount = Math.max(1, Math.min(12, Number(data.home?.bestSellers?.count) || 4));
  let idTouched = !isNew;
  const stockMemory = new Map();      // color → { talla: unidades } (no perder lo escrito al quitar/poner tallas)
  const colorSelects = new Set();      // refrescos de los selectores de color (colores ya usados)

  if (!isNew) ctx.setTitle(value.name);

  const form = createForm({
    ctx,
    value,
    saveLabel: isNew ? "Crear producto" : "Guardar",
    successMessage: isNew ? "Producto creado." : "Cambios guardados.",
    validate: (v) => {
      const out = {};
      if (v.id && otherIds.has(v.id)) out.id = "Ya existe otro producto con este id.";
      const seen = new Set();
      (v.colors || []).forEach((c, i) => {
        if (!c.color) out[`colors.${i}.color`] = "Elige un color.";
        else if (seen.has(c.color)) out[`colors.${i}.color`] = "Este color ya está en el producto.";
        seen.add(c.color);
      });
      if (!(v.colors || []).length) out.colors = "Agrega al menos un color.";
      return out;
    },
    onSubmit: async (v, { force }) => {
      const body = prepare(v);
      const item = isNew ? await content.createProduct(body) : await content.updateProduct(id, body, { force });
      if (isNew || item.id !== id) {
        if (!isNew) toast(`El enlace del producto ahora es producto.html?id=${item.id}.`, { type: "info", title: "Cambiaste el id" });
        const tab = t.active && t.active !== "general" ? `?tab=${t.active}` : "";
        setTimeout(() => ctx.navigate(`/productos/${enc(item.id)}${tab}`, { replace: true, force: true }));
      }
      return item;
    },
  });

  /* ------------------------------------------------------------------ */
  /* General                                                              */
  /* ------------------------------------------------------------------ */
  const idField = f.text(form, "id", {
    label: "Id del enlace",
    required: true,
    maxlength: 60,
    spellcheck: false,
    transform: (v) => fold(v).replace(/ñ/g, "n").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    pattern: SLUG_RE,
    patternMessage: SLUG_MSG,
    validate: (v) => (v && otherIds.has(v) ? "Ya existe otro producto con este id." : null),
    help: "…",
    onChange: () => { idTouched = true; },
  });
  const idHelp = idField.querySelector(".field__help");
  const renameNote = notice({ tone: "warning", title: "Vas a cambiar el enlace del producto", message: "…" });
  // El id (dato técnico) va plegado: se ve el enlace y se abre solo para cambiarlo (o si tiene un error)
  const idSummary = h("code.pe-idbox__url");
  const idBox = h("details.ct-adv.pe-idbox",
    h("summary.ct-adv__sum", icon("chevron-right", { size: 16, className: "ct-adv__chev" }), h("span", "Enlace en la tienda:"), idSummary, h("span.pe-idbox__change", "Cambiar")),
    h("div.ct-adv__body", idField));
  const updId = () => {
    const v = form.get("id") || "…";
    idHelp.textContent = `Dirección en la tienda: producto.html?id=${v}. Se genera con el nombre; cámbialo solo si es necesario.`;
    idSummary.textContent = `producto.html?id=${v}`;
    const renamed = !isNew && form.get("id") && form.get("id") !== id;
    renameNote.hidden = !renamed;
    if (renamed) renameNote.querySelector(".notice__msg").textContent = `Al guardar, pasará de producto.html?id=${id} a producto.html?id=${form.get("id")}. Los enlaces viejos (compartidos o en favoritos) dejarán de funcionar.`;
  };

  const nameField = f.text(form, "name", {
    label: "Nombre",
    required: true,
    maxlength: 120,
    placeholder: "Ej.: Camiseta Fe",
    help: "Título de la tarjeta en el catálogo y de la ficha del producto.",
    onChange: (v) => {
      if (!isNew || idTouched) return;
      const s = slugify(v);
      form.set("id", s ? uniqueSlug(s, otherIds) : "");
    },
  });

  const badgeField = f.text(form, "badge", { label: "Insignia", optional: true, maxlength: 20, placeholder: "Ej.: Nuevo", help: "Etiqueta sobre la foto de la tarjeta. «Nuevo» sale en terracota; las demás, en café oscuro." });
  const badgeSuggest = h("div.pe-suggest", h("span.pe-suggest__label", "Sugerencias:"),
    ["Nuevo", "Oversize"].map((b) => button({ label: b, size: "sm", variant: "secondary", onClick: () => form.set("badge", b) })),
    button({ label: "Sin insignia", size: "sm", variant: "ghost", onClick: () => form.set("badge", "") }));

  const generalTab = [
    card({
      title: "Información básica",
      body: [
        nameField,
        idBox,
        renameNote,
        f.text(form, "ref", { label: "Referencia", optional: true, maxlength: 30, width: "md", placeholder: "Ej.: FE-002", transform: (v) => v.toUpperCase(), help: "Código interno. También sirve para buscar en el panel y en la tienda." }),
      ],
    }),
    card({
      title: "Estado y organización",
      body: [
        f.segmented(form, "status", {
          label: "Estado",
          options: [{ value: "published", label: "Publicado", icon: "eye" }, { value: "draft", label: "Borrador", icon: "eye-off" }],
          help: "Borrador = no se ve en la tienda (útil mientras preparas fotos y stock).",
        }),
        f.row(
          f.select(form, "category", { label: "Categoría", required: true, placeholder: "Elige una categoría", options: (data.categories || []).map((c) => ({ value: c.id, label: c.name })), help: "Filtro del catálogo, guía de tallas y detalles por defecto." }),
          f.select(form, "collection", { label: "Colección", emptyLabel: "Sin colección", options: (data.collections || []).map((c) => ({ value: c.id, label: c.name })), help: "Se muestra en la ficha («Colección Renacer»)." }),
        ),
        h("p.pe-links", "Administra las listas en ", h("a", { href: "#/categorias" }, "Categorías"), " y ", h("a", { href: "#/colecciones" }, "Colecciones"), "."),
      ],
    }),
    card({
      title: "Precio y venta",
      body: [
        f.row(
          f.money(form, "price", { label: "Precio", required: true, min: 0, max: 100000000, help: "En pesos colombianos, sin decimales." }),
          h("div.stack-sm", badgeField, badgeSuggest),
        ),
        f.switch(form, "envioGratis", { label: "Envío gratis", help: "Muestra «Envío gratis» en la tarjeta, en la ficha y en el carrito." }),
        f.switch(form, "soldOut", { label: "Forzar «Agotado»", help: "Lo muestra agotado aunque tenga stock (no se puede comprar). Sin stock ya sale agotado solo." }),
      ],
    }),
    card({
      title: "Búsqueda",
      body: f.tags(form, "tags", { label: "Etiquetas", optional: true, lowercase: true, max: 30, maxlength: 40, placeholder: "Escribe una palabra y presiona Enter", help: "Palabras con las que te encuentran en el buscador de la tienda, además del nombre, la referencia, la categoría y la colección." }),
    }),
  ];

  /* ------------------------------------------------------------------ */
  /* Colores, fotos y stock                                               */
  /* ------------------------------------------------------------------ */
  /** Grilla de stock por talla de un color (cada talla es un campo con su propio error). */
  function stockGrid(path) {
    const total = h("strong.pe-stock__total");
    const outInfo = h("span.pe-stock__out");
    const grid = h("div.pe-stock__grid", { role: "group", "aria-label": "Unidades por talla" });
    const err = h("p.field__error", { hidden: true });
    const fillBtn = button({ label: "Llenar todas con…", size: "sm", variant: "ghost", icon: "edit", onClick: () => fill() });
    const root = h("div.pe-stock",
      h("div.pe-stock__head",
        h("div.pe-stock__titles", h("span.field__label", "Stock por talla"), h("span.pe-stock__sum", "Total: ", total, outInfo)),
        fillBtn),
      grid, err,
      h("p.field__help", "Unidades disponibles. Las tallas en 0 salen tachadas («agotada») en la tienda."));
    let cellOffs = [];

    const updTotal = () => {
      const sizes = form.get("sizes") || [];
      const st = form.get(path) || {};
      const sum = sizes.reduce((a, s) => a + (Number(st[s]) || 0), 0);
      const out = sizes.filter((s) => !(Number(st[s]) > 0)).length;
      total.textContent = plural(sum, "unidad", "unidades");
      outInfo.textContent = out ? ` · ${plural(out, "talla sin stock", "tallas sin stock")}` : "";
    };

    function cell(size) {
      const p = `${path}.${size}`;
      const cid = uid("st");
      const eid = `${cid}-err`;
      const input = h("input.input.input--number.pe-stock__input", { id: cid, type: "number", min: 0, max: MAX_STOCK, step: 1, inputmode: "numeric", "aria-describedby": eid });
      const state = h("span.pe-stock__state", { "aria-hidden": "true" });
      const cerr = h("p.pe-stock__err", { id: eid, hidden: true });
      const wrap = h("div.pe-stock__cell", h("label.pe-stock__size", { for: cid }, size), input, state, cerr);
      const mark = () => {
        const v = form.get(p);
        const out = !(Number(v) > 0);
        wrap.classList.toggle("is-out", out);
        state.textContent = out ? "Agotada" : "";
        input.setAttribute("aria-label", `Talla ${size}${out ? ", agotada" : ""}: unidades`);
      };
      let entry;
      input.addEventListener("input", () => {
        const n = input.value === "" ? null : Number(input.value);
        form.set(p, Number.isFinite(n) ? n : null, { source: entry });
        mark();
      });
      input.addEventListener("blur", () => { if (form.get(p) === null || form.get(p) === undefined) form.set(p, 0); });
      entry = {
        path: p,
        el: wrap,
        sync: () => {
          const v = form.get(p);
          if (document.activeElement !== input || Number(input.value) !== v) input.value = v === null || v === undefined ? "" : String(v);
          mark();
        },
        setError(msg) {
          wrap.classList.toggle("has-error", !!msg);
          cerr.hidden = !msg;
          cerr.textContent = msg || "";
          input.setAttribute("aria-invalid", msg ? "true" : "false");
        },
        focus: () => input.focus(),
        validate: () => {
          if (!(form.get("sizes") || []).includes(size)) return null;
          const v = form.get(p);
          if (v === null || v === undefined) return null;
          return Number.isInteger(v) && v >= 0 && v <= MAX_STOCK ? null : `Usa un número entero entre 0 y ${number(MAX_STOCK)}.`;
        },
      };
      cellOffs.push(form.register(entry));
      entry.sync();
      return wrap;
    }

    function render() {
      cellOffs.forEach((off) => off());
      cellOffs = [];
      const sizes = form.get("sizes") || [];
      grid.replaceChildren(...sizes.map(cell));
      if (!sizes.length) grid.append(h("p.muted.small", "Agrega tallas arriba para escribir el stock."));
      fillBtn.disabled = !sizes.length;
      updTotal();
    }

    async function fill() {
      const v = await promptDialog({
        title: "Llenar todas las tallas",
        label: "Unidades por talla",
        value: "0",
        help: "Pon el mismo número en todas las tallas de este color. Luego puedes ajustar cada una.",
        confirmLabel: "Llenar",
        validate: (x) => (/^\d+$/.test(x) && Number(x) <= MAX_STOCK ? null : `Escribe un número entero entre 0 y ${number(MAX_STOCK)}.`),
      });
      if (v === null) return;
      const n = Number(v);
      form.set(path, Object.fromEntries((form.get("sizes") || []).map((s) => [s, n])));
      toast(`Todas las tallas quedaron con ${plural(n, "unidad", "unidades")}.`);
    }

    form.register({
      path,
      el: root,
      sync: render,
      setError(msg) { err.hidden = !msg; replace(err, msg ? [icon("alert-circle", { size: 14 }), h("span", msg)] : null); },
      focus: () => grid.querySelector("input")?.focus(),
      childChanged: updTotal,
    });
    render();
    return root;
  }

  /** Selector de color de la paleta (con muestra) que no deja repetir colores del producto. */
  function colorSelect(path, index) {
    return f.custom(form, path, {
      label: "Color",
      required: true,
      help: "Solo aparecen los colores de la paleta. ¿Falta uno? Créalo en Colores.",
      validate: (v) => {
        if (!v) return "Elige un color.";
        return (form.get("colors") || []).some((c, j) => j !== index && c.color === v) ? "Este color ya está en el producto." : null;
      },
      create: ({ id: cid, describedBy, value: initial, onChange }) => {
        let cur = initial || "";
        const sel = h("select.input.input--select", { id: cid, "aria-describedby": describedBy, "aria-required": "true" });
        const sw = h("span.pe-colorsel__swatch", { "aria-hidden": "true" });
        const root = h("div.pe-colorsel", sw, sel);
        const paint = () => {
          const hex = paletteById.get(cur)?.hex;
          sw.style.background = hex || "";
          sw.classList.toggle("is-empty", !hex);
        };
        const fillOpts = () => {
          const used = new Set((form.get("colors") || []).map((c, j) => (j !== index ? c.color : null)).filter(Boolean));
          replace(sel,
            h("option", { value: "" }, "Elige un color"),
            palette.map((c) => h("option", { value: c.id, disabled: used.has(c.id) }, used.has(c.id) ? `${c.name} (ya está en el producto)` : c.name)),
            cur && !paletteById.has(cur) ? h("option", { value: cur }, `${cur} (ya no está en la paleta)`) : null);
          sel.value = cur;
          paint();
        };
        sel.addEventListener("change", () => { cur = sel.value; paint(); onChange(cur); });
        colorSelects.add({ el: root, fill: fillOpts });
        fillOpts();
        return { el: root, setValue: (v) => { cur = v || ""; fillOpts(); }, focus: () => sel.focus() };
      },
    });
  }

  const colorsField = f.list(form, "colors", {
    label: "Colores",
    min: 1,
    max: MAX_COLORS,
    collapsible: true,
    initiallyOpen: (c, i) => i === 0,  // el primer color empieza abierto; los demás, plegados
    confirmRemove: true,
    addLabel: "Agregar color",
    emptyText: "Agrega al menos un color.",
    help: "Cada color tiene sus fotos y su stock. El orden es el de la tienda: el primer color con stock es el que se ve primero.",
    newItem: (arr) => {
      const used = new Set(arr.map((c) => c.color));
      const free = palette.find((c) => !used.has(c.id));
      if (!free) toast("Ya usaste todos los colores de la paleta. Crea uno nuevo en Colores.", { type: "warning" });
      return { color: free?.id || "", photos: [], stock: Object.fromEntries((form.get("sizes") || []).map((s) => [s, 0])) };
    },
    itemLabel: (it, i) => paletteById.get(it?.color)?.name || it?.color || `Color ${i + 1} (sin elegir)`,
    renderItem: (p, i) => {
      return h("div.pe-color",
        colorSelect(`${p}.color`, i),
        f.photos(form, `${p}.photos`, { label: "Fotos", max: MAX_PHOTOS, help: "Hasta 4 por color. La primera es la principal: sale en la tarjeta del catálogo y abre la galería. Se optimizan solas al subirlas." }),
        stockGrid(`${p}.stock`));
    },
  });
  colorsField.classList.add("pe-colors");

  /** Encabezado de cada color: muestra, "Primero en la tienda", fotos y unidades. */
  function refreshColorHeads() {
    const ol = colorsField.querySelector(":scope > ol.list-field");
    if (!ol) return;
    const colors = form.get("colors") || [];
    const first = initialColorIndex(colors);
    Array.from(ol.children).forEach((li, i) => {
      const c = colors[i];
      const toggle = li.querySelector(":scope > .list-item__head .list-item__toggle");
      if (!c || !toggle) return;
      let sw = toggle.querySelector(".pe-chead__swatch");
      if (!sw) { sw = h("span.pe-chead__swatch", { "aria-hidden": "true" }); toggle.insertBefore(sw, toggle.querySelector(".list-item__title")); }
      let meta = toggle.querySelector(".pe-chead__meta");
      if (!meta) { meta = h("span.pe-chead__meta"); toggle.append(meta); }
      const hex = paletteById.get(c.color)?.hex;
      sw.style.background = hex || "";
      sw.classList.toggle("is-empty", !hex);
      const tot = (form.get("sizes") || []).reduce((a, s) => a + (Number(c.stock?.[s]) || 0), 0);
      const n = c.photos?.length || 0;
      replace(meta,
        i === first && colors.length > 1 ? h("span.pe-chip.pe-chip--accent", "Primero en la tienda") : null,
        h("span.pe-chip", { class: !n && "is-muted" }, n ? `${n}/${MAX_PHOTOS} fotos` : "Sin fotos"),
        h("span.pe-chip", { class: !tot && "is-danger" }, tot ? plural(tot, "ud.", "uds.") : "Sin stock"));
    });
  }

  /* Tallas: atajos y sincronización del stock de todos los colores */
  const sizesField = f.tags(form, "sizes", {
    label: "Tallas",
    required: true,
    requiredMessage: "Agrega al menos una talla.",
    max: 12,
    maxMessage: "Máximo 12 tallas.",
    maxlength: 12,
    placeholder: "Escribe una talla y presiona Enter",
    validate: (v) => {
      const bad = (v || []).find((s) => !SIZE_RE.test(s));
      return bad ? `«${bad}»: ${SIZE_MSG}` : null;
    },
    help: "En el orden en que se muestran. Al agregar o quitar una talla, su columna de stock se agrega o se quita en todos los colores.",
  });
  const sizeShortcuts = h("div.pe-suggest",
    h("span.pe-suggest__label", "Atajos:"),
    button({ label: "S a XXL", size: "sm", onClick: () => form.set("sizes", STD_SIZES.slice()) }),
    button({ label: "Talla única", size: "sm", onClick: () => form.set("sizes", ["Única"]) }),
    button({ label: "Ordenar (XS → XXL)", size: "sm", variant: "ghost", icon: "arrow-down", onClick: () => form.set("sizes", sortSizes(form.get("sizes") || [])) }));

  function syncStock() {
    const sizes = form.get("sizes") || [];
    (form.get("colors") || []).forEach((c, i) => {
      const cur = c.stock || {};
      const mem = { ...(stockMemory.get(c.color) || {}), ...cur };
      stockMemory.set(c.color, mem);
      form.set(`colors.${i}.stock`, Object.fromEntries(sizes.map((s) => [s, cur[s] ?? mem[s] ?? 0])));
    });
  }

  const soldOutNote = notice({ tone: "warning", title: "Marcaste el producto como agotado", message: "En la tienda todas las tallas salen agotadas aunque tengan stock. Quítalo en General › Precio y venta." });

  const colorsTab = [
    card({
      title: "Hormas y tallas",
      body: [
        f.chips(form, "fits", {
          label: "Hormas",
          options: (data.fits || []).map((x) => ({ value: x.id, label: x.name })),
          help: "Opciones de horma en la ficha y pestañas de la guía de tallas. Déjalo vacío en gorras y accesorios.",
        }),
        h("div.stack-sm", sizesField, sizeShortcuts),
      ],
    }),
    card({
      title: "Colores, fotos y stock",
      description: "Hasta 12 colores. Las fotos y el stock cambian en la tienda al elegir cada color.",
      actions: button({ label: "Administrar colores", icon: "palette", size: "sm", variant: "ghost", href: "#/colores" }),
      body: [soldOutNote, colorsField],
    }),
  ];

  /* ------------------------------------------------------------------ */
  /* Descripción y contenido                                             */
  /* ------------------------------------------------------------------ */
  /** Lista que, vacía, usa la de la categoría o la general (switch "Usar los de…"). */
  function inheritBlock({ path, label, switchLabel, source, lead, none, emptyText, editHref, editLabel, max, itemLabel }) {
    const body = h("div.pe-inherit__body");
    let mode = (form.get(path) || []).length ? "custom" : "inherit";
    const sw = switchControl({
      label: switchLabel,
      onChange: async (on) => {
        if (on) {
          const n = (form.get(path) || []).filter((x) => String(x).trim()).length;
          if (n && !(await confirmDialog({ title: `¿${switchLabel}?`, message: `Se quitarán ${plural(n, "línea propia", "líneas propias")} de este producto cuando guardes.`, confirmLabel: "Sí, usarlos", danger: true }))) { sw.set(false); return; }
          form.set(path, []);
          mode = "inherit";
        } else {
          mode = "custom";
          if (!(form.get(path) || []).length) form.set(path, clone(source()));
        }
        render();
        if (mode === "custom") requestAnimationFrame(() => body.querySelector("input")?.focus());
      },
    });
    function render() {
      sw.set(mode === "inherit");
      if (mode === "inherit") {
        const items = source();
        replace(body, h("div.pe-inherit__src",
          h("p.pe-inherit__lead", items.length ? lead() : none()),
          items.length ? h("ul.pe-bullets", items.map((x) => h("li", x))) : null,
          h("p.small", h("a", { href: editHref }, editLabel), " · o apaga el interruptor para escribir unos propios.")));
      } else {
        replace(body, f.list(form, path, {
          label,
          max,
          addLabel: "Agregar línea",
          emptyText: emptyText(),
          newItem: "",
          renderItem: (p, i) => f.text(form, p, { label: `${itemLabel} ${i + 1}`, className: "pe-sr-label", maxlength: 300, placeholder: "Escribe una línea…" }),
        }));
      }
    }
    form.on("change", ({ path: p }) => {
      if (p === "") { mode = (form.get(path) || []).length ? "custom" : "inherit"; render(); }
      else if (p === "category" && mode === "inherit") render();
    });
    render();
    return h("div.pe-inherit", sw.el, body);
  }

  const catOf = () => cats.get(form.get("category"));
  const descTab = [
    card({
      title: "Textos de la ficha",
      body: [
        f.textarea(form, "desc", { label: "Descripción corta", optional: true, maxlength: 2000, recommended: 300, rows: 3, placeholder: "Ej.: Camiseta en algodón de 210 g, con horma Oversize o Regular…", help: "Va debajo del precio en la ficha del producto y es la descripción que ve Google." }),
        f.textarea(form, "story", { label: "La historia del diseño", optional: true, maxlength: 2000, rows: 4, help: "Bloque oscuro «La historia del diseño» al final de la ficha. Déjalo vacío para ocultarlo." }),
      ],
    }),
    card({
      title: "Detalles",
      description: "Acordeón «Detalles» de la ficha, ítem por ítem.",
      body: inheritBlock({
        path: "details", label: "Detalles propios", switchLabel: "Usar los detalles de la categoría", itemLabel: "Detalle", max: 20,
        source: () => catOf()?.details || [],
        lead: () => `En la tienda se muestran los detalles de la categoría «${catOf()?.name}»:`,
        none: () => (catOf() ? `La categoría «${catOf().name}» no tiene detalles todavía.` : "Elige una categoría en General para ver sus detalles."),
        emptyText: () => "Sin detalles propios: se usarán los de la categoría.",
        editHref: "#/categorias", editLabel: "Editar en Categorías",
      }),
    }),
    card({
      title: "Cuidados de la prenda",
      description: "Acordeón «Cuidados de la prenda» de la ficha.",
      body: inheritBlock({
        path: "care", label: "Cuidados propios", switchLabel: "Usar los cuidados generales", itemLabel: "Cuidado", max: 12,
        source: () => data.texts?.care || [],
        lead: () => "En la tienda se muestran los cuidados generales (Textos del sitio):",
        none: () => "Los cuidados generales están vacíos.",
        emptyText: () => "Sin cuidados propios: se usarán los generales.",
        editHref: "#/textos", editLabel: "Editar en Textos del sitio",
      }),
    }),
  ];

  /* ------------------------------------------------------------------ */
  /* Estampados                                                           */
  /* ------------------------------------------------------------------ */
  const initialPrintIds = () => new Set((form.initial.prints || []).map((x) => x.id));
  const printsTab = card({
    title: "Estampados",
    description: "Opcional. Si la prenda se ofrece con varios colores de estampado, la ficha muestra el selector «Estampado» (el primero viene elegido).",
    body: f.list(form, "prints", {
      label: "Estampados",
      max: 12,
      addLabel: "Agregar estampado",
      emptyText: "Sin estampados: la ficha no muestra el selector.",
      newItem: () => ({ id: "", name: "", hex: "#bb3f17" }),
      itemLabel: (it, i) => it?.name || `Estampado ${i + 1}`,
      renderItem: (p, i) => {
        const code = h("code");
        const idNote = h("p.field__help.pe-print-id", "Código: ", code);
        const showId = () => { code.textContent = form.get(`${p}.id`) || "se crea al escribir el nombre"; };
        const el = h("div.stack-sm",
          f.row(
            f.text(form, `${p}.name`, {
              label: "Nombre", required: true, maxlength: 40, placeholder: "Ej.: Naranja",
              onChange: (v) => {
                const cur = form.get(`${p}.id`);
                if (!cur || !initialPrintIds().has(cur)) {
                  const taken = new Set((form.get("prints") || []).map((x, j) => (j !== i ? x.id : null)).filter(Boolean));
                  form.set(`${p}.id`, slugify(v) ? uniqueSlug(slugify(v), taken) : "");
                }
                showId();
              },
            }),
            f.color(form, `${p}.hex`, { label: "Color del estampado", required: true })),
          idNote);
        showId();
        return el;
      },
    }),
  });

  /* ------------------------------------------------------------------ */
  /* Video                                                                */
  /* ------------------------------------------------------------------ */
  const posterField = f.media(form, "video.poster", { label: "Imagen de portada (póster)", kind: "image", optional: true, help: "Se ve antes de reproducir. Si subes el video desde tu equipo, la creamos automáticamente." });
  const videoTab = card({
    title: "Video de la prenda",
    description: "Opcional. Es la última diapositiva de la galería («Video»). Sin video, la ficha muestra «Video próximamente».",
    body: [
      f.media(form, "video.src", {
        label: "Video",
        kind: "video",
        previewBg: "dark",
        help: "MP4 o WebM horizontal o vertical, de hasta 150 MB. Mejor si dura menos de 30 segundos.",
        onChange: (u, item, frm) => {
          if (!u) { frm.set("video", null); return; }
          if (item?.thumbUrl && !frm.get("video.poster")) frm.set("video.poster", item.thumbUrl);
        },
      }),
      posterField,
    ],
  });

  /* ------------------------------------------------------------------ */
  /* Tarjeta sin foto                                                     */
  /* ------------------------------------------------------------------ */
  const tilePrev = h("div.pe-tileprev__frame");
  const tileTab = card({
    title: "Tarjeta sin foto",
    description: "Se usa cuando el producto no tiene fotos, cuando apagas «Mostrar fotos» en Ajustes o si una foto no carga.",
    body: h("div.pe-tilegrid",
      h("div.stack",
        f.row(f.color(form, "tile.from", { label: "Color de arriba", required: true }), f.color(form, "tile.to", { label: "Color de abajo", required: true })),
        f.list(form, "tile.lines", {
          label: "Líneas de texto",
          max: 3,
          addLabel: "Agregar línea",
          emptyText: "Sin líneas: se usa el nombre del producto.",
          newItem: "",
          renderItem: (p, i) => f.text(form, p, { label: `Línea ${i + 1}`, className: "pe-sr-label", maxlength: 30, placeholder: i ? "Ej.: ES EL CAMINO" : "Ej.: JESÚS" }),
        }),
        f.text(form, "tile.sub", { label: "Subtítulo", optional: true, maxlength: 60, placeholder: "Ej.: SOBRE GRACIA", help: "Letra pequeña bajo el texto. Sale en la ficha y en «Los más vendidos» del Inicio." }),
        f.switch(form, "tile.stacked", { label: "Apilado", help: "Primera línea pequeña y segunda grande (ej.: SALMO / 23)." }),
        f.switch(form, "tile.small", { label: "Texto más pequeño", help: "Para nombres largos que no caben." }),
        f.number(form, "tile.fs", { label: "Tamaño exacto del texto", optional: true, nullable: true, min: 6, max: 40, suffix: "% del ancho", width: "md", help: "Vacío = automático según el largo de las líneas." })),
      h("div.pe-tileprev", h("p.pe-tileprev__label", "Vista previa"), tilePrev, h("p.field__help", "Así se ve la tarjeta en el catálogo (sin foto)."))),
  });
  const updTile = () => replace(tilePrev, tileEl(form.get(), { sub: true }));

  /* ------------------------------------------------------------------ */
  /* Orden y reseñas                                                      */
  /* ------------------------------------------------------------------ */
  const published = (data.products || []).filter((p) => p.id !== id && p.status === "published");
  const bestInfo = h("p.pe-rankinfo", { "aria-live": "polite" });
  const newInfo = h("p.pe-rankinfo", { "aria-live": "polite" });
  const ratingPrev = h("p.pe-rating", { "aria-hidden": "true" });
  const position = (key, v) => 1 + published.filter((p) => Number(p[key]) < v).length;
  const updRanks = () => {
    const isPub = form.get("status") === "published";
    const total = published.length + (isPub ? 1 : 0);
    const b = Number(form.get("bestRank"));
    const n = Number(form.get("newRank"));
    if (!isPub) {
      bestInfo.textContent = "Es un borrador: no aparece en la tienda hasta que lo publiques.";
      newInfo.textContent = "";
    } else {
      if (Number.isInteger(b)) {
        const pos = position("bestRank", b);
        bestInfo.textContent = `Queda en el puesto ${pos} de ${total}${pos <= homeCount ? ` · aparece en «Los más vendidos» del Inicio (muestra ${homeCount})` : ` · el Inicio muestra los primeros ${homeCount}`}.`;
      } else bestInfo.textContent = "";
      newInfo.textContent = Number.isInteger(n) ? `Queda en el puesto ${position("newRank", n)} de ${total} en el orden «Novedades» del catálogo.` : "";
    }
    const r = Number(form.get("rating")) || 0;
    const c = Number(form.get("reviewsCount")) || 0;
    replace(ratingPrev, r > 0 || c > 0
      ? [h("span.pe-rating__stars", { style: { "--r": String(Math.max(0, Math.min(5, r))) } }), h("span", `${String(r.toFixed(1)).replace(".", ",")} (${number(c)})`)]
      : h("span.muted", "Con 0 y 0 la ficha no muestra calificación."));
  };
  const orderTab = [
    card({
      title: "Orden en la tienda",
      description: "Número menor = aparece primero. Puedes repetir números; en empate decide el orden de la lista.",
      body: f.row(
        h("div.stack-sm", f.number(form, "bestRank", { label: "Puesto en Más vendidos", required: true, min: 0, max: 9999, help: "Orden de «Los más vendidos» del Inicio y del orden «Más vendidos» del catálogo." }), bestInfo),
        h("div.stack-sm", f.number(form, "newRank", { label: "Puesto en Novedades", required: true, min: 0, max: 9999, help: "Orden «Novedades» del catálogo." }), newInfo)),
    }),
    card({
      title: "Calificación",
      description: "Estrellas y número de reseñas junto al nombre, en la ficha del producto.",
      body: [
        f.row(
          f.number(form, "rating", { label: "Calificación", integer: false, step: 0.1, min: 0, max: 5, required: true, suffix: "de 5", help: "Entre 0 y 5, con un decimal (ej.: 4,9)." }),
          f.number(form, "reviewsCount", { label: "Número de reseñas", required: true, min: 0, max: 10000000 })),
        ratingPrev,
      ],
    }),
  ];

  /* ------------------------------------------------------------------ */
  /* Columna lateral: tarjeta del catálogo y resumen                      */
  /* ------------------------------------------------------------------ */
  const prevBox = h("div.pe-card");
  let mediaKey = "";
  let mediaEl = null;
  const facts = h("dl.kv.pe-facts");
  const asideNote = h("div.pe-aside__note");
  function updAside() {
    const p = form.get();
    const colors = p.colors || [];
    const ini = initialColorIndex(colors);
    const photos = photosFor(p, ini);
    const soldOut = isSoldOut(p);
    const ph = showPhotos ? photos[0] : null;
    const b = String(p.badge || "").trim();
    // La imagen solo se vuelve a crear si cambia algo que se ve en ella (no parpadea al escribir)
    const key = JSON.stringify([ph?.src, ph?.zoom, ph?.ox, ph?.oy, ph ? null : [p.tile, tileLines(p)], b, soldOut]);
    if (key !== mediaKey || !mediaEl) {
      mediaKey = key;
      const media = h("div.pe-card__media", { class: ph ? "has-photo" : null }, tileEl(p, { sub: false }));
      if (ph) {
        const img = h("img.pe-card__img", { src: photoSrc(ph, 640), alt: "", decoding: "async" });
        if (ph.zoom || ph.ox || ph.oy) Object.assign(img.style, { transform: `scale(${ph.zoom || 1})`, transformOrigin: `${ph.ox || "50%"} ${ph.oy || "50%"}` });
        img.addEventListener("error", () => { img.remove(); media.classList.remove("has-photo"); }, { once: true });
        media.append(img);
      }
      if (b) media.append(h("span.pe-card__badge", { class: b === "Nuevo" && "is-brand" }, b));
      if (soldOut) media.append(h("span.pe-card__veil", "Agotado"));
      mediaEl = media;
    }
    replace(prevBox,
      mediaEl,
      h("div.pe-card__body",
        h("p.pe-card__name", p.name || "Nombre del producto"),
        h("div.pe-card__swatches", colors.map((c) => h("span.pe-card__swatch", { style: { background: paletteById.get(c.color)?.hex || "#ccc" }, title: paletteById.get(c.color)?.name || "" }))),
        h("p.pe-card__price", p.price === null || p.price === undefined ? "$ —" : money(p.price)),
        p.envioGratis ? h("p.pe-card__ship", icon("package", { size: 14 }), "Envío gratis") : null));
    const total = productStock(p);
    const nPhotos = colors.reduce((a, c) => a + (c.photos?.length || 0), 0);
    const empty = emptyCells(p);
    replace(facts,
      h("dt", "Estado"), h("dd", h("span.cluster", statusBadge(p.status === "published" ? "published" : "draft"), soldOut ? statusBadge("soldout") : isLow(p) ? statusBadge("low") : null)),
      h("dt", "Stock"), h("dd", plural(total, "unidad", "unidades"), empty ? h("span.muted", ` · ${plural(empty, "talla sin stock", "tallas sin stock")}`) : null),
      h("dt", "Colores"), h("dd", plural(colors.length, "color", "colores")),
      h("dt", "Fotos"), h("dd", nPhotos ? `${plural(nPhotos, "foto", "fotos")}${colors.some((c) => !c.photos?.length) && nPhotos ? " · algunos colores usan las de otro" : ""}` : "Sin fotos: se ve la tarjeta de color"),
      !isNew && value.updatedAt ? [h("dt", "Actualizado"), h("dd", h("time", { datetime: form.initial.updatedAt, title: dateTime(form.initial.updatedAt) }, relativeTime(form.initial.updatedAt)), form.initial.updatedBy ? ` por ${form.initial.updatedBy}` : "")] : null);
    replace(asideNote,
      p.status !== "published" ? notice({ tone: "info", message: "Borrador: no se ve en la tienda." })
        : !showPhotos ? notice({ tone: "info", message: "Las fotos están apagadas en Ajustes: la tienda muestra la tarjeta de color." }) : null);
  }

  /* ------------------------------------------------------------------ */
  /* Encabezado y acciones                                                */
  /* ------------------------------------------------------------------ */
  const titleBadge = h("span.pe-hbadge");
  const updBadge = () => replace(titleBadge, isNew ? null : statusBadge(form.initial.status === "published" ? "published" : "draft"));

  function viewInStore(e) {
    if (form.initial.status !== "published") {
      e?.preventDefault();
      draftDialog(form.initial.name, async () => {
        form.set("status", "published");
        await form.submit();   // si falla, el diálogo se cierra y el error queda marcado en su campo
      }, { pending: form.dirty });
      return;
    }
    if (form.dirty) toast("La tienda muestra la última versión guardada.", { type: "info" });
  }

  async function duplicate() {
    if (form.dirty) { toast("Guarda o descarta los cambios antes de duplicar el producto.", { type: "warning" }); return; }
    try {
      const copy = await content.duplicateProduct(id);
      toast(`Creamos «${copy.name}» en borrador. Revísalo y publícalo cuando esté listo.`);
      ctx.navigate(`/productos/${enc(copy.id)}`, { force: true });
    } catch (e) { showApiError(e); }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `¿Eliminar «${form.initial.name}»?`,
      message: "Se quitará de la tienda y del panel. Un administrador puede recuperarlo en Revisiones: abre «Producto eliminado» y toca «Deshacer este cambio» (no toca nada más del sitio).",
      confirmLabel: "Eliminar producto",
      danger: true,
    });
    if (!ok) return;
    try {
      await content.deleteProduct(id);
      toast("Producto eliminado.");
      ctx.navigate("/productos", { force: true });
    } catch (e) { showApiError(e); }
  }

  const actions = isNew ? [button({ label: "Cancelar", variant: "ghost", href: "#/productos" })] : [
    button({ label: "Ver en la tienda", icon: "external", href: storeUrl(id), target: "_blank", onClick: viewInStore }),
    menu({ label: "Más acciones", variant: "secondary", items: [
      { label: "Duplicar", icon: "copy", onClick: duplicate },
      { divider: true },
      { label: "Eliminar", icon: "trash", danger: true, onClick: remove },
    ] }),
  ];
  const header = pageHeader({
    title: isNew ? "Nuevo producto" : value.name,
    breadcrumbs: [{ label: "Tienda" }, { label: "Productos", href: "#/productos" }],
    badge: titleBadge,
    subtitle: isNew
      ? "Completa la información, agrega colores con sus fotos y stock, y guarda."
      : `Última modificación ${relativeTime(value.updatedAt)}${value.updatedBy ? ` por ${value.updatedBy}` : ""}.`,
    actions,
  });

  /* ------------------------------------------------------------------ */
  /* Pestañas y montaje                                                   */
  /* ------------------------------------------------------------------ */
  const TAB_IDS = ["general", "colores", "descripcion", "estampados", "video", "tarjeta", "orden"];
  const startTab = TAB_IDS.includes(ctx.query.get("tab")) ? ctx.query.get("tab") : "general";
  const t = tabs({
    label: "Partes del producto",
    active: startTab,
    onChange: (tid) => ctx.setQuery({ tab: tid === "general" ? null : tid }),
    items: [
      { id: "general", label: "General", content: generalTab },
      { id: "colores", label: "Colores y stock", badge: (value.colors || []).length, content: colorsTab },
      { id: "descripcion", label: "Descripción", content: descTab },
      { id: "estampados", label: "Estampados", badge: (value.prints || []).length || null, content: printsTab },
      { id: "video", label: "Video", content: videoTab },
      { id: "tarjeta", label: "Tarjeta", content: tileTab },
      { id: "orden", label: "Orden y reseñas", content: orderTab },
    ],
  });
  function updTabBadges() {
    t.setBadge("colores", (form.get("colors") || []).length || null);
    t.setBadge("estampados", (form.get("prints") || []).length || null);
  }

  const aside = h("aside.pe-aside", { "aria-label": "Vista previa en el catálogo" },
    card({
      title: "Así se ve en el catálogo",
      body: [prevBox, asideNote, facts,
        !isNew ? button({ label: "Ver en la tienda", icon: "external", block: true, href: storeUrl(id), target: "_blank", onClick: viewInStore }) : null],
    }));

  /* --- Reacciones a cambios --- */
  let timer = 0;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      for (const s of [...colorSelects]) { if (!s.el.isConnected) colorSelects.delete(s); else s.fill(); }
      refreshColorHeads();
      updAside();
      updTile();
      updRanks();
      updTabBadges();
      soldOutNote.hidden = !form.get("soldOut");
      posterField.hidden = !form.get("video.src");
    }, 16);
  };
  form.on("change", ({ path }) => {
    if (path === "sizes") {
      const sizes = form.get("sizes") || [];
      const norm = sizes.map(normSize);
      if (norm.some((s, i) => s !== sizes[i])) { form.set("sizes", norm); return; }
      syncStock();
    }
    if (path === "id" || path === "") updId();
    schedule();
  });
  form.on("saved", () => {
    updBadge();
    if (!isNew) {
      header.querySelector(".page-title").textContent = form.initial.name;
      ctx.setTitle(form.initial.name);
      const sub = header.querySelector(".page-subtitle");
      if (sub) sub.textContent = `Última modificación ${relativeTime(form.initial.updatedAt)}${form.initial.updatedBy ? ` por ${form.initial.updatedBy}` : ""}.`;
    }
  });
  ctx.onCleanup(() => clearTimeout(timer));

  updId();
  updBadge();
  soldOutNote.hidden = !value.soldOut;
  posterField.hidden = !value.video?.src;
  el.append(h("div.page.pe-page", header, h("div.pe-layout", h("div.pe-main", t.el), aside)));
  schedule();
}

/* ==========================================================================
   Rutas
   ========================================================================== */
export default [
  {
    path: "/productos",
    title: "Productos",
    render: (el, params, ctx) => listView(el, params, ctx),
  },
  {
    path: "/productos/nuevo",
    title: "Nuevo producto",
    render: (el, params, ctx) => editorView(el, null, ctx),
  },
  {
    path: "/productos/:id",
    title: "Editar producto",
    render: (el, { id }, ctx) => editorView(el, id, ctx),
  },
];
