/* ==========================================================================
   Mercy Studio · Panel — views/revisions.js
   Revisiones (#/revisiones, solo administrador): historial de versiones del contenido del sitio.
   · Lista (GET /api/admin/revisions): fecha, persona, resumen, tamaño, «Actual» en la más reciente y
     «Contenido inicial» en la primera; agrupada por día.
   · Detalle (#/revisiones?id=<id>, GET /api/admin/revisions/:id): cambios frente a la versión anterior en
     lenguaje humano (products[fe].price → Producto «Camiseta Fe» › Precio), antes → después en rojo/verde,
     textos largos con «Ver más» y aviso si la lista de cambios se cortó (truncated).
   · «Restaurar esta versión» (POST …/:id/restore) con confirmación que lista los cambios posteriores que se
     deshacen (y avisa de productos que desaparecen, ajustes, modal de descuento): luego invalida el store del panel,
     recarga el historial, avisa si la versión usa archivos que ya no están en la biblioteca y ofrece «Deshacer».
   · «Deshacer este cambio»: vuelve a «antes» SOLO lo que muestra el detalle (una sección o un producto), sin tocar lo
     que se guardó después; se hace en el navegador con los PUT normales (sección / producto) y el servidor valida.
     Un campo que se volvió a cambiar después no se toca (se avisa). Recupera también un producto eliminado.
   Qué guarda: contenido (secciones) y productos. NO guarda cupones, usuarios, suscriptores ni medios.
   ========================================================================== */
import { append, h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api, isAbort } from "../core/api.js";
import { content } from "../core/store.js";
import { badge, button, card, confirmDialog, emptyState, errorState, modal, notice, pageHeader, showApiError, skeleton, toast, withBusy } from "../core/ui.js";
import { HEX_RE, bytes, clone, dateTime, deepEqual, fileNameOf, money, number, plural, relativeTime, siteUrl } from "../core/format.js";
import { dayHeading, groupByDay, timeOf } from "./activity.js";

const enc = encodeURIComponent;
const NARROW = "(max-width: 960px)";

/* ==========================================================================
   Traducción de rutas y valores a lenguaje humano
   ========================================================================== */
const SECTION_LABELS = {
  settings: "Ajustes generales", home: "Inicio", discountModal: "Modal de descuento", texts: "Textos del sitio",
  colors: "Colores", fits: "Hormas", categories: "Categorías", collections: "Colecciones", sizeCharts: "Guía de tallas",
  reviews: "Reseñas", products: "Productos",
};
const SECTION_HREF = {
  settings: "#/ajustes", home: "#/inicio", discountModal: "#/descuento", texts: "#/textos", colors: "#/colores", fits: "#/hormas",
  categories: "#/categorias", collections: "#/colecciones", sizeCharts: "#/tallas", reviews: "#/resenas", products: "#/productos",
};
const SECTION_ICON = {
  settings: "settings", home: "home", discountModal: "gift", texts: "text", colors: "palette", fits: "scissors",
  categories: "folder", collections: "layers", sizeCharts: "ruler", reviews: "star", products: "shirt",
};
const FIELD = {
  // Inicio
  hero: "Portada", media: "Fondo", type: "Tipo", src: "Archivo", poster: "Póster (imagen mientras carga)",
  fallbackSrc: "Video de respaldo", fallbackPoster: "Póster de respaldo", eyebrow: "Antetítulo", title: "Título",
  subtitle: "Subtítulo", ctaLabel: "Texto del botón", ctaHref: "Enlace del botón", marquee: "Franja en movimiento",
  icon: "Ícono", text: "Texto", bestSellers: "Más vendidos", count: "Cantidad", purpose: "Nuestro propósito",
  buttonLabel: "Texto del botón", storyTitle: "Título de la historia", storyQuote: "Frase de la historia",
  storyCtaLabel: "Botón de la historia", score: "Calificación", community: "Comunidad", highlight: "Texto destacado",
  placeholder: "Texto de ejemplo del campo", fine: "Letra pequeña", doneTitle: "Título al registrarse",
  doneMsg: "Mensaje al registrarse", doneCtaLabel: "Botón al registrarse",
  // Modal de descuento
  enabled: "Activado", autoOpen: "Abrir solo en el inicio", delayMs: "Espera antes de abrir", showOnCartOpen: "Mostrar al abrir el carrito",
  image: "Imagen", offerText: "Texto de la oferta", successTitle: "Título de éxito", successOffer: "Oferta de éxito",
  successFine: "Letra pequeña de éxito", successButton: "Botón de éxito", couponCode: "Cupón de bienvenida",
  // Textos
  topStrip: "Franja superior", footerTagline: "Frase del pie de página", footerLegal: "Texto legal del pie de página",
  searchSuggestions: "Sugerencias de búsqueda", shippingInfo: "Información de envíos", returnsInfo: "Información de cambios",
  care: "Cuidados", sizeGuideNote: "Nota de la guía de tallas", catalog: "Catálogo", allTitle: "Título de toda la colección",
  bestTitle: "Título de «Más vendidos»", newTitle: "Título de «Novedades»",
  // Ajustes
  brand: "Nombre de la marca", whatsapp: "Número de WhatsApp", whatsappDisplay: "WhatsApp (cómo se muestra)",
  whatsappGreeting: "Saludo de WhatsApp", social: "Redes sociales", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook",
  logo: "Logos", terracota: "Logo principal (terracota)", beige: "Logo claro (beige)", oscuro: "Logo oscuro",
  seo: "Buscadores (SEO)", description: "Descripción", giftMaxChars: "Máximo de caracteres del mensaje de regalo",
  pageSize: "Productos por página del catálogo", showPhotos: "Mostrar fotos de los productos", showAdminLink: "Acceso al panel en la tienda",
  // Listas
  id: "Identificador", name: "Nombre", hex: "Color", details: "Detalles", sizeChart: "Guía de tallas", inFooter: "En el pie de página",
  head: "Encabezados", unit: "Unidad", rows: "Medidas", city: "Ciudad", stars: "Estrellas", quote: "Frase destacada", visible: "Visible",
  // Productos
  ref: "Referencia", status: "Estado", category: "Categoría", collection: "Colección", fits: "Hormas", sizes: "Tallas", price: "Precio",
  badge: "Etiqueta", envioGratis: "Envío gratis", soldOut: "Marcado como agotado", bestRank: "Puesto en Más vendidos",
  newRank: "Puesto en Novedades", rating: "Calificación", reviewsCount: "Número de reseñas", colors: "Colores", photos: "Fotos",
  stock: "Stock", prints: "Estampados", video: "Video", tile: "Respaldo sin foto", tags: "Etiquetas de búsqueda",
  desc: "Descripción corta", story: "Historia", thumb: "Miniatura", alt: "Texto alternativo", zoom: "Acercamiento",
  ox: "Encuadre horizontal", oy: "Encuadre vertical", from: "Color inicial", to: "Color final", lines: "Líneas", sub: "Subtítulo",
  stacked: "Texto apilado", small: "Texto pequeño", fs: "Tamaño de letra",
};
const ICON_NAMES = {
  truck: "Camión", heart: "Corazón", shield: "Escudo", star: "Estrella", lock: "Candado", gift: "Regalo", tag: "Etiqueta",
  cross: "Cruz", check: "Chulo", chat: "Chat", whatsapp: "WhatsApp", ruler: "Regla", card: "Tarjeta", user: "Persona", info: "Información",
};
const ITEM_NOUN = {
  colors: "Color", fits: "Horma", categories: "Categoría", collections: "Colección", sizeCharts: "Guía", prints: "Estampado", products: "Producto",
};
const INDEX_NOUN = { marquee: "Frase", photos: "Foto", rows: "Fila", lines: "Línea" };
const PREFERRED = ["name", "ref", "status", "category", "price", "hex", "city", "stars", "quote", "text", "title", "src", "alt", "icon"];
const SKIP_KEYS = new Set(["createdAt", "updatedAt", "updatedBy"]);
const MEDIA_KEYS = new Set(["src", "poster", "fallbackSrc", "fallbackPoster", "image", "thumb", "terracota", "beige", "oscuro"]);
const MEDIA_RE = /\.(jpe?g|png|webp|gif|avif|mp4|m4v|webm|mov)(?:[?#]|$)/i;
const VIDEO_RE = /\.(mp4|m4v|webm|mov)(?:[?#]|$)/i;

/** "products[fe].colors[negro].stock.S (orden)" → { segs: [{key}|{id}], order } */
function parsePath(path) {
  let p = String(path || "");
  const order = p.endsWith(" (orden)");
  if (order) p = p.slice(0, -8);
  // Las tallas pueden llevar punto («7.5»): lo que sigue a «.stock.» es UNA sola clave (no «Talla 7 › 5»)
  let size = null;
  const sm = /^(.*\.stock)\.(.+)$/.exec(p);
  if (sm) { p = sm[1]; size = sm[2]; }
  const segs = [];
  const re = /([^.[\]]+)|\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(p))) segs.push(m[1] !== undefined ? { key: m[1] } : { id: m[2] });
  if (size !== null) segs.push({ key: size });
  return { segs, order };
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Nombres conocidos (contenido actual + objetos que vienen en los cambios). */
function makeLookups(data, changes) {
  const L = {};
  for (const k of ["colors", "fits", "categories", "collections", "sizeCharts", "reviews", "products"]) {
    L[k] = new Map((data?.[k] || []).map((x) => [x.id, x.name]));
  }
  // Elementos agregados o quitados en esta revisión (p. ej. un producto eliminado ya no está en el contenido)
  for (const c of changes || []) {
    const { segs } = parsePath(c.path);
    const last = segs[segs.length - 1];
    if (last?.id === undefined) continue;
    const obj = [c.after, c.before].find((v) => v && typeof v === "object" && !Array.isArray(v) && v.name);
    const list = segs.length === 2 ? segs[0].key : segs[segs.length - 2]?.key;
    if (obj && L[list] && !L[list].has(last.id)) L[list].set(last.id, obj.name);
  }
  return L;
}

function itemLabel(listKey, id, L) {
  if (/^\d+$/.test(id)) return `${INDEX_NOUN[listKey] || "Elemento"} ${Number(id) + 1}`;
  if (listKey === "reviews") return `Reseña de «${L.reviews?.get(id) || id}»`;
  const name = L[listKey]?.get(id) || (listKey === "prints" ? capitalize(id) : id);
  return ITEM_NOUN[listKey] ? `${ITEM_NOUN[listKey]} «${name}»` : `«${name}»`;
}

/** Partes legibles de una ruta (sin la sección/producto, que van en el encabezado del grupo). */
function humanParts(section, rest, L, order) {
  const out = [];
  let listKey = section;
  let prev = null;
  for (const s of rest) {
    if (s.id !== undefined) {
      out.push(prev === "stock" ? `Talla ${s.id}` : itemLabel(listKey, s.id, L)); // stock[7.5] o stock.7.5
      prev = null;
      continue;
    }
    const k = s.key;
    if (prev === "stock") out.push(`Talla ${k}`);
    else if (prev === "rows" && section === "sizeCharts") out.push(`Horma «${L.fits?.get(k) || k}»`);
    else if (section === "home" && prev === null && k === "reviews") out.push("Reseñas de Google");
    else if (section === "home" && prev === "reviews" && k === "count") out.push("Número de reseñas");
    else if (section === "home" && prev === "media" && k === "type") out.push("Tipo de fondo");
    else if (section === "texts" && prev === null && k === "care") out.push("Cuidados por defecto");
    else out.push(FIELD[k] || k);
    listKey = k;
    prev = k;
  }
  if (order) out.push("Orden");
  return out;
}

function groupOf(segs) {
  const sec = segs[0]?.key || "";
  if (sec === "products" && segs[1]?.id !== undefined) return { key: `products/${segs[1].id}`, section: "products", productId: segs[1].id, rest: segs.slice(2) };
  return { key: sec, section: sec, productId: null, rest: segs.slice(1) };
}

/* ---------- Valores ---------- */
const isEmpty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
const emptyNode = () => h("span.rev-empty", "(vacío)");

function longText(s, limit = 220) {
  const chars = [...s];
  if (chars.length <= limit) return h("span.rev-text", s);
  const short = `${chars.slice(0, limit).join("").trimEnd()}…`;
  const span = h("span.rev-text", short);
  const btn = h("button.rev-more", { type: "button", "aria-expanded": "false" }, "Ver más");
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    span.textContent = open ? short : s;
    btn.textContent = open ? "Ver más" : "Ver menos";
    btn.setAttribute("aria-expanded", String(!open));
  });
  return h("span.rev-long", span, btn);
}

function mediaValue(url) {
  const isVideo = VIDEO_RE.test(url);
  return h("span.rev-media",
    h("span.rev-media__thumb", { class: isVideo && "is-video" },
      isVideo ? icon("video", { size: 18 }) : h("img", { src: siteUrl(url), alt: "", loading: "lazy", decoding: "async" })),
    h("a.rev-media__name", { href: siteUrl(url), target: "_blank", rel: "noopener", title: url }, fileNameOf(url)));
}

function primitiveValue(v, key, L) {
  if (isEmpty(v)) return emptyNode();
  if (typeof v === "boolean") {
    if (key === "enabled") return h("span", v ? "Activado" : "Desactivado");
    if (key === "visible") return h("span", v ? "Visible" : "Oculta");
    return h("span", v ? "Sí" : "No");
  }
  if (typeof v === "number") {
    if (key === "price" || key === "minSubtotal") return h("span", money(v));
    if (key === "delayMs") return h("span", `${number(v / 1000, 1)} s`);
    if (key === "stars") return h("span", `${v} ${v === 1 ? "estrella" : "estrellas"}`);
    if (key === "rating" || key === "score" || key === "zoom") return h("span", number(v, 1));
    if (key === "__stock") return h("span", plural(v, "unidad", "unidades"));
    return h("span", number(v, Number.isInteger(v) ? 0 : 2));
  }
  const s = String(v);
  if (key === "status") return h("span", { published: "Publicado", draft: "Borrador" }[s] || s);
  if (key === "type" && ["video", "image", "none"].includes(s)) return h("span", { video: "Video", image: "Imagen", none: "Ninguno" }[s]);
  if (key === "icon") return h("span", ICON_NAMES[s] || s);
  if (key === "category") return h("span", `«${L.categories?.get(s) || s}»`);
  if (key === "collection") return h("span", `«${L.collections?.get(s) || s}»`);
  if (key === "sizeChart") return h("span", `«${L.sizeCharts?.get(s) || s}»`);
  if (HEX_RE.test(s)) return h("span.rev-hex", h("span.rev-hex__swatch", { style: { background: s } }), h("code", s.toLowerCase()));
  if ((MEDIA_KEYS.has(key) || MEDIA_RE.test(s)) && (/^https?:\/\//i.test(s) || /^\/?(uploads|assets)\//.test(s))) return mediaValue(s);
  return longText(s);
}

function arrayValue(list, other, side, key, L) {
  if (!list.length) return emptyNode();
  const names = key === "fits" ? L.fits : null;
  const label = (x) => (names?.get(x) || String(x));
  const otherSet = new Set((other || []).map(String));
  const mark = (x) => (Array.isArray(other) && !otherSet.has(String(x)) ? (side === "before" ? "is-removed" : "is-added") : null);
  const long = list.some((x) => String(x).length > 28);
  if (long) return h("ul.rev-lines", list.map((x) => h("li", { class: mark(x) }, longText(label(x), 160))));
  return h("span.rev-chips", list.map((x) => h("span.rev-chip", { class: mark(x) }, label(x))));
}

function orderValue(list, listKey, L) {
  if (!list?.length) return emptyNode();
  const name = (id) => L[listKey]?.get(id) || id;
  return h("ol.rev-order", list.map((id) => h("li", name(id))));
}

function objectValue(o, L) {
  const entries = Object.entries(o).filter(([k, v]) => !SKIP_KEYS.has(k) && (v === null || typeof v !== "object"));
  entries.sort((a, b) => {
    const ia = PREFERRED.indexOf(a[0]);
    const ib = PREFERRED.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const shown = entries.filter(([k, v]) => !isEmpty(v) && k !== "id").slice(0, 5);
  const rest = Object.keys(o).filter((k) => !SKIP_KEYS.has(k)).length - shown.length;
  return h("div.rev-obj",
    shown.length ? h("dl.rev-obj__kv", shown.map(([k, v]) => [h("dt", FIELD[k] || k), h("dd", primitiveValue(v, k, L))])) : null,
    rest > 0 ? h("p.rev-obj__more", `y ${plural(rest, "dato más", "datos más")}`) : null);
}

function valueNode(v, other, side, key, L) {
  if (isEmpty(v)) return emptyNode();
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== "object")) return arrayValue(v, other, side, key, L);
    return h("span", plural(v.length, "elemento", "elementos"));
  }
  if (typeof v === "object") return objectValue(v, L);
  return primitiveValue(v, key, L);
}

/** Una fila de cambio: ruta legible + antes → después. */
function changeRow(c, group, L) {
  const { segs, order } = parsePath(c.path);
  const parts = humanParts(group.section, group.rest, L, order);
  const lastKey = [...segs].reverse().find((s) => s.key !== undefined)?.key;
  const last = segs.length >= 2 && segs[segs.length - 2].key === "stock" ? "__stock" : lastKey;
  const lastIsItem = segs[segs.length - 1]?.id !== undefined;
  const added = isEmpty(c.before) && !isEmpty(c.after) && lastIsItem;
  const removed = !isEmpty(c.before) && isEmpty(c.after) && lastIsItem;
  const listKey = order ? (segs[segs.length - 1]?.key || group.section) : null;

  const pathEl = h("p.rev-change__path",
    parts.length ? parts.map((p, i) => [i ? h("span.rev-change__sep", { "aria-hidden": "true" }, "›") : null, h(i === parts.length - 1 ? "strong" : "span", p)]) : h("strong", order ? "Orden" : group.productId ? "Producto completo" : "Toda la sección"),
    added ? badge("Agregado", "success") : removed ? badge("Quitado", "danger") : order ? badge("Nuevo orden", "info") : null);

  let diff;
  if (order) {
    diff = h("div.rev-diff",
      h("div.rev-side.rev-side--before", h("span.rev-side__label", "Antes"), orderValue(c.before, listKey, L)),
      h("span.rev-diff__arrow", { "aria-hidden": "true" }, icon("arrow-right", { size: 16 })),
      h("div.rev-side.rev-side--after", h("span.rev-side__label", "Después"), orderValue(c.after, listKey, L)));
  } else if (added || removed) {
    const v = added ? c.after : c.before;
    diff = h("div.rev-diff.is-single",
      h("div.rev-side", { class: added ? "rev-side--after" : "rev-side--before" },
        h("span.rev-side__label", added ? "Se agregó" : "Se quitó"), valueNode(v, null, added ? "after" : "before", last, L)));
  } else {
    diff = h("div.rev-diff",
      h("div.rev-side.rev-side--before", h("span.rev-side__label", "Antes"), valueNode(c.before, c.after, "before", last, L)),
      h("span.rev-diff__arrow", { "aria-hidden": "true" }, icon("arrow-right", { size: 16 })),
      h("div.rev-side.rev-side--after", h("span.rev-side__label", "Después"), valueNode(c.after, c.before, "after", last, L)));
  }
  return h("li.rev-change", pathEl, diff);
}

/* ==========================================================================
   «Deshacer este cambio»: vuelve a «antes» solo las rutas del detalle
   ========================================================================== */
const CONTENT_SECTIONS = new Set(["settings", "home", "discountModal", "texts", "colors", "fits", "categories", "collections", "sizeCharts", "reviews"]);
const unstamp = (v) => {
  if (Array.isArray(v)) return v.map(unstamp);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !SKIP_KEYS.has(k)).map(([k, x]) => [k, unstamp(x)]));
  return v;
};
const same = (a, b) => deepEqual(unstamp(a ?? null), unstamp(b ?? null));
/** Clave de un elemento de lista como la usa el diff del servidor: id (o color en los colores de un producto). */
const itemKey = (x) => (x && typeof x === "object" ? (typeof x.id === "string" ? x.id : typeof x.color === "string" ? x.color : null) : null);
function indexIn(arr, seg) {
  const i = arr.findIndex((x) => itemKey(x) === seg.id);
  if (i !== -1) return i;
  // Listas sin id (frases de la franja, fotos…): el diff usa la posición
  if (/^\d+$/.test(seg.id) && !arr.some((x) => itemKey(x) !== null)) return Number(seg.id) < arr.length ? Number(seg.id) : -1;
  return -1;
}
function child(v, seg) {
  if (v === null || typeof v !== "object") return undefined;
  if (seg.key !== undefined) return Array.isArray(v) ? undefined : v[seg.key];
  if (!Array.isArray(v)) return v[seg.id]; // clave entre corchetes en un objeto (p. ej. stock[7.5])
  const i = indexIn(v, seg);
  return i === -1 ? undefined : v[i];
}
function getAt(root, segs) {
  let v = root;
  for (const s of segs) { v = child(v, s); if (v === undefined) return undefined; }
  return v;
}
/** Escribe `value` en la ruta (null en un elemento de lista = quitarlo; si no está, se agrega al final). */
function setAt(root, segs, value) {
  const parent = getAt(root, segs.slice(0, -1));
  const last = segs[segs.length - 1];
  if (!last || parent === null || typeof parent !== "object") return false;
  if (last.key !== undefined || !Array.isArray(parent)) {
    if (Array.isArray(parent)) return false;
    parent[last.key ?? last.id] = clone(value ?? null);
    return true;
  }
  const i = indexIn(parent, last);
  if (value === null || value === undefined) { if (i !== -1) parent.splice(i, 1); return true; }
  if (i !== -1) parent[i] = clone(value);
  else parent.push(clone(value));
  return true;
}
/** Orden: los elementos que estaban vuelven a su orden de antes, en los mismos lugares de la lista. */
function applyOrder(arr, before = [], after = []) {
  const keys = arr.map(itemKey);
  const was = new Set(before);
  const common = (list) => list.filter((k) => was.has(k) && after.includes(k) && keys.includes(k));
  if (!deepEqual(common(keys), common(after))) return false; // el orden se volvió a cambiar después
  const pos = keys.map((k, i) => (was.has(k) ? i : -1)).filter((i) => i !== -1);
  const items = pos.map((i) => arr[i]).sort((a, b) => before.indexOf(itemKey(a)) - before.indexOf(itemKey(b)));
  pos.forEach((at, j) => { arr[at] = items[j]; });
  return true;
}

/**
 * ¿Se puede deshacer solo este cambio? → { kind: "section"|"product"|"product-created"|"product-deleted", … }
 * o { reason } (primera versión, muchos cambios, o un cambio que tocó varias partes a la vez, como una restauración).
 */
function undoPlan(data) {
  const changes = data.changes || [];
  if (!data.previous || !changes.length) return { reason: "none" };
  if (data.truncated) return { reason: "truncated" };
  const parsed = changes.map((c) => { const { segs, order } = parsePath(c.path); return { c, order, g: groupOf(segs) }; });
  const g = parsed[0].g;
  if (parsed.some((x) => x.g.key !== g.key)) return { reason: "multi" };
  const ops = parsed.map((x) => ({ c: x.c, segs: x.g.rest, order: x.order, g: x.g }));
  if (g.productId) {
    if (ops.length === 1 && !ops[0].segs.length && !ops[0].order) {
      if (isEmpty(ops[0].c.before)) return { kind: "product-created", id: g.productId, after: ops[0].c.after };
      if (isEmpty(ops[0].c.after)) return { kind: "product-deleted", id: g.productId, before: ops[0].c.before };
    }
    if (ops.some((o) => !o.segs.length)) return { reason: "multi" };
    return { kind: "product", id: g.productId, ops };
  }
  if (!CONTENT_SECTIONS.has(g.section) || ops.some((o) => !o.segs.length && !o.order)) return { reason: "multi" };
  return { kind: "section", section: g.section, ops };
}

/** Aplica las operaciones sobre una copia del valor ACTUAL → { work, done, skipped } (skipped = se cambió después). */
function applyUndo(root, ops) {
  const work = clone(root);
  const done = [];
  const skipped = [];
  for (const op of [...ops.filter((o) => !o.order), ...ops.filter((o) => o.order)]) {
    if (op.order) {
      const arr = op.segs.length ? getAt(work, op.segs) : work;
      (Array.isArray(arr) && applyOrder(arr, op.c.before || [], op.c.after || []) ? done : skipped).push(op);
      continue;
    }
    const cur = getAt(work, op.segs);
    if (!same(cur, op.c.after) || !setAt(work, op.segs, op.c.before)) skipped.push(op);
    else done.push(op);
  }
  return { work, done, skipped };
}

/** Lista corta de lo que cambia (con «y N más»). */
function shortList(labels, max = 6) {
  return h("ul.rev-confirm__list", labels.slice(0, max).map((t) => h("li", t)),
    labels.length > max ? h("li.muted", `y ${number(labels.length - max)} más`) : null);
}

/** Mensajes de un 422 (p. ej. la categoría del producto ya no existe) en un diálogo claro. */
function undoValidationDialog(e) {
  const msgs = [...new Set(Object.values(e.fields || {}).filter(Boolean))];
  modal({
    title: "No se pudo deshacer",
    size: "sm",
    content: [
      h("p.modal__text", "El servidor no aceptó el valor de antes porque ya no es válido con el contenido actual:"),
      msgs.length ? shortList(msgs, 5) : h("p", e.message),
      h("p.muted", "Corrige eso en su sección (o hazlo a mano en el editor) e inténtalo de nuevo."),
    ],
    actions: [{ label: "Entendido", variant: "primary" }],
  });
}

/* ---------- Archivos que una versión usa y ya no están en la biblioteca ---------- */
function uploadsIn(value, path = "", out = new Map()) {
  if (typeof value === "string") {
    const u = value.split(/[?#]/)[0];
    if (/^\/uploads\//.test(u) && !out.has(u)) out.set(u, path);
  } else if (Array.isArray(value)) value.forEach((x, i) => uploadsIn(x, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, x] of Object.entries(value)) uploadsIn(x, path ? `${path}.${k}` : k, out);
  return out;
}
async function missingUploads(snapshot) {
  const used = uploadsIn(snapshot);
  if (!used.size) return [];
  const { items } = await api.get("/api/admin/media");
  const have = new Set();
  for (const m of items || []) for (const u of [m.url, m.thumbUrl]) if (u) have.add(String(u).split(/[?#]/)[0]);
  return [...used].filter(([u]) => !have.has(u)).map(([u, where]) => ({ url: u, where }));
}
function whereLabel(path, products) {
  if (!path) return "El sitio";
  const m = /^products\[(\d+)\]/.exec(path);
  if (m) return `Producto «${products?.[Number(m[1])]?.name || "?"}»`;
  const sec = path.split(/[.[]/)[0];
  return SECTION_LABELS[sec] || sec;
}

/* ==========================================================================
   Vista
   ========================================================================== */
export default [
  {
    path: "/revisiones",
    title: "Revisiones",
    roles: ["admin"],
    async render(el, params, ctx) {
      const [{ items: firstItems }] = await Promise.all([
        api.get("/api/admin/revisions", { signal: ctx.signal }),
        content.load().catch(() => null),
      ]);
      let revs = firstItems || [];
      const cache = new Map(); // id → respuesta del detalle
      let selectedId = ctx.query.get("id") || "";
      let lastRestored = null; // { id, undoId } para el aviso tras restaurar
      const narrow = window.matchMedia(NARROW);

      const page = h("div.page.page--wide.rev");
      const layout = h("div.rev-layout");
      const listBody = h("div.rev-listbody");
      const listCount = h("span.rev-listcount");
      const listCol = h("div.rev-listcol",
        h("section.card.rev-listcard", { "aria-label": "Versiones guardadas" },
          h("div.rev-listhead", h("h2.card__title", "Versiones guardadas"), listCount),
          listBody));
      const detailCol = h("div.rev-detailcol", { tabindex: "-1", "aria-live": "off" });
      layout.append(listCol, detailCol);

      const isCurrent = (id) => revs[0]?.id === id;
      const isOldest = (id) => revs[revs.length - 1]?.id === id;

      /* --- Lista --- */
      function revBadges(r) {
        const s = r.summary || "";
        const origin = s === "Contenido inicial" ? "Contenido inicial"
          : /^Contenido de fábrica/.test(s) ? "Contenido de fábrica"
            : /^Contenido existente al arrancar/.test(s) ? "Primera versión"
              : isOldest(r.id) && revs.length > 1 ? "Más antigua guardada" : null;
        return [
          isCurrent(r.id) ? badge("Actual", "success", { dot: true }) : null,
          origin ? badge(origin, origin === "Más antigua guardada" ? "neutral" : "info") : null,
          /^Restaurado desde/.test(s) ? badge("Restauración", "accent") : null,
        ];
      }
      function revIcon(r) {
        if (/^Restaurado desde/.test(r.summary || "")) return "history";
        if (/^Contenido (inicial|de fábrica|existente)/.test(r.summary || "")) return "sparkle";
        if (/^Producto/.test(r.summary || "")) return "shirt";
        const m = /^Sección «([^»]+)»/.exec(r.summary || "");
        if (m) {
          const sec = Object.keys(SECTION_LABELS).find((k) => SECTION_LABELS[k] === m[1] || (k === "settings" && m[1] === "Ajustes"));
          if (sec) return SECTION_ICON[sec];
        }
        return "file";
      }

      function renderList() {
        listCount.textContent = plural(revs.length, "versión", "versiones");
        if (!revs.length) {
          replace(listBody, emptyState({ icon: "history", title: "Aún no hay versiones", message: "Cuando alguien guarde el contenido o un producto, aparecerá aquí.", compact: true }));
          return;
        }
        replace(listBody, groupByDay(revs).map((g) => {
          const hid = uid("rev-d");
          const head = dayHeading(g.key, "h3");
          head.id = hid;
          head.classList.add("rev-day__title");
          return h("section.rev-day", { "aria-labelledby": hid }, head,
            h("ul.rev-list", g.items.map((r) => h("li",
              h("button.rev-item", {
                type: "button",
                dataset: { id: r.id },
                "aria-current": r.id === selectedId ? "true" : null,
                onClick: () => select(r.id, { focus: true }),
              },
              h("span.rev-item__icon", { class: isCurrent(r.id) && "is-current" }, icon(revIcon(r), { size: 15 })),
              h("span.rev-item__body",
                h("span.rev-item__summary", r.summary || "Cambio de contenido"),
                h("span.rev-item__meta", `${r.user?.name || "Sistema"} · `, h("time", { datetime: r.at, title: dateTime(r.at) }, timeOf(r.at)), ` · ${bytes(r.bytes)}`),
                h("span.rev-item__badges", revBadges(r))))))));
        }));
      }

      /* --- Detalle --- */
      let req = 0;
      async function select(id, { focus = false, push = true } = {}) {
        selectedId = id;
        if (push) ctx.setQuery({ id: id || null });
        for (const b of listBody.querySelectorAll(".rev-item")) {
          if (b.dataset.id === id) b.setAttribute("aria-current", "true");
          else b.removeAttribute("aria-current");
        }
        layout.classList.toggle("has-detail", !!id);
        page.classList.toggle("has-detail", !!id);
        if (!id) { replace(detailCol, placeholder()); return; }
        const my = ++req;
        if (!cache.has(id)) replace(detailCol, card({ body: skeleton({ variant: "form", rows: 4 }) }));
        if (narrow.matches) window.scrollTo({ top: 0 });
        try {
          const data = cache.get(id) || await api.get(`/api/admin/revisions/${enc(id)}`, { signal: ctx.signal });
          cache.set(id, data);
          if (my !== req) return;
          replace(detailCol, detailView(data));
          if (focus) detailCol.querySelector("h2")?.focus({ preventScroll: !narrow.matches });
        } catch (e) {
          if (my !== req || isAbort(e)) return;
          replace(detailCol, card({
            body: [
              narrow.matches ? backButton() : null,
              e?.status === 404
                ? emptyState({ icon: "history", title: "Esa versión ya no existe", message: "El historial guarda las últimas 200 versiones (y siempre el contenido inicial): las demás se borran solas.", action: revs.length ? { label: "Ver la versión actual", icon: "arrow-right", onClick: () => select(revs[0].id, { focus: true }) } : null })
                : errorState({ error: e, title: "No se pudo cargar esta versión", onRetry: () => select(id, { focus: true }) }),
            ],
          }));
        }
      }

      /* Al pasar de 200 versiones se descartan las más antiguas: la primera que queda se compara con «Contenido inicial» */
      function prunedNote(data) {
        if (!data.previous || revs.length < 200) return null;
        const i = revs.findIndex((x) => x.id === data.revision.id);
        const older = revs[i + 1];
        if (!older || older.id !== data.previous.id || !/^Contenido (inicial|de fábrica|existente)/.test(older.summary || "")) return null;
        return notice({ tone: "warning", message: "El historial ya descartó versiones más antiguas (guarda las últimas 200): esta lista compara con el contenido inicial y puede incluir cambios de versiones que ya no están." });
      }

      function placeholder() {
        return card({ className: "rev-placeholder", body: emptyState({ icon: "history", title: "Elige una versión", message: "Verás qué cambió en ella frente a la anterior y podrás restaurarla.", compact: true }) });
      }

      function backButton() {
        return button({
          label: "Todas las versiones", icon: "arrow-left", variant: "ghost", size: "sm", className: "rev-back",
          onClick: () => {
            const id = selectedId;
            select("", { push: true });
            requestAnimationFrame(() => listBody.querySelector(`.rev-item[data-id="${CSS.escape(id)}"]`)?.focus());
          },
        });
      }

      function detailView(data) {
        const r = data.revision;
        const meta = revs.find((x) => x.id === r.id);
        const current = isCurrent(r.id);
        const L = makeLookups(content.data, data.changes);
        const idx = revs.findIndex((x) => x.id === r.id);
        const newer = idx > 0 ? revs[idx - 1] : null;
        const older = idx >= 0 && idx < revs.length - 1 ? revs[idx + 1] : null;

        const plan = undoPlan(data);
        const canUndo = !plan.reason;
        const restoreBtn = current ? null : button({ label: "Restaurar esta versión", icon: "history", variant: canUndo ? "secondary" : "primary", onClick: () => restore(r, restoreBtn) });
        const undoBtn = canUndo ? button({ label: "Deshacer este cambio", icon: "refresh", variant: "primary", className: "rev-undo__btn", onClick: () => undoChange(data, plan, undoBtn) }) : null;
        const laterCount = idx > 0 ? idx : 0;
        const head = h("div.rev-head",
          h("div.rev-head__titles",
            h("div.rev-head__badges", meta ? revBadges(meta) : null),
            h("h2.rev-head__title", { tabindex: "-1" }, r.summary || "Cambio de contenido"),
            h("p.rev-head__meta",
              icon("user", { size: 14 }), h("span", r.user?.name || "Sistema"),
              h("span.rev-sep", "·"),
              h("time", { datetime: r.at }, dateTime(r.at)), h("span.muted", ` (${relativeTime(r.at)})`),
              meta ? [h("span.rev-sep", "·"), h("span", bytes(meta.bytes))] : null)),
          h("div.rev-head__actions", restoreBtn));
        const restoreHint = current ? null : h("p.rev-restore-hint", icon("info", { size: 14 }),
          h("span", "«Restaurar esta versión» deja TODO el sitio como quedó justo después de este cambio",
            laterCount ? `: también deshace ${plural(laterCount, "cambio guardado", "cambios guardados")} después, en cualquier sección.` : "."));

        const restoredNote = lastRestored && lastRestored.id === r.id
          ? notice({
            tone: "success",
            title: "Versión restaurada",
            message: "Esta es ahora la versión actual: la tienda ya muestra este contenido.",
            action: h("div.cluster", button({ label: "Ver tienda", icon: "external", size: "sm", href: "../", target: "_blank" }),
              lastRestored.undoId ? button({ label: "Deshacer", icon: "refresh", size: "sm", variant: "ghost", onClick: (e) => undo(lastRestored.undoId, e.currentTarget) }) : null),
          })
          : current ? notice({ tone: "info", message: canUndo
            ? "Esta es la versión que ve hoy la tienda. Si este cambio fue un error, usa «Deshacer este cambio»; para volver a una versión anterior completa, elígela en la lista."
            : "Esta es la versión que ve hoy la tienda. Para volver a una anterior, elígela en la lista y restáurala." }) : null;

        const changes = data.changes || [];
        let compare;
        if (!data.previous) {
          compare = h("p.rev-compare", "Es la primera versión guardada: no hay una anterior para comparar.");
        } else {
          compare = h("p.rev-compare",
            "Cambios frente a la versión anterior: ",
            h("button.rev-link", { type: "button", onClick: () => select(data.previous.id, { focus: true }) }, data.previous.summary),
            ` (${dateTime(data.previous.at)}).`);
        }

        // Agrupar por sección o producto
        const groups = new Map();
        for (const c of changes) {
          const { segs } = parsePath(c.path);
          const g = groupOf(segs);
          if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
          groups.get(g.key).items.push({ c, g });
        }
        const groupEls = [...groups.values()].map((g) => {
          let title;
          let href;
          let store = null;
          let ic;
          if (g.productId) {
            const name = L.products.get(g.productId) || g.productId;
            const now = content.data?.products?.find((p) => p.id === g.productId);
            title = `Producto «${name}»`;
            href = now ? `#/productos/${enc(g.productId)}` : null;
            store = now?.status === "published" ? `../producto.html?id=${enc(g.productId)}` : null;
            ic = "shirt";
          } else {
            title = SECTION_LABELS[g.section] || g.section;
            href = SECTION_HREF[g.section] || null;
            store = ["home", "discountModal", "texts", "settings"].includes(g.section) ? "../" : g.section === "products" ? "../catalogo.html" : null;
            ic = SECTION_ICON[g.section] || "file";
          }
          return h("section.rev-group", { "aria-label": title },
            h("div.rev-group__head",
              h("span.rev-group__icon", icon(ic, { size: 16 })),
              h("h3.rev-group__title", title),
              h("span.rev-group__count", plural(g.items.length, "cambio", "cambios")),
              h("span.rev-group__links",
                href ? h("a", { href }, "Abrir en el panel") : null,
                store ? h("a", { href: store, target: "_blank", rel: "noopener" }, icon("external", { size: 13 }), "Ver en la tienda") : null)),
            h("ul.rev-changes", g.items.map(({ c, g: gg }) => changeRow(c, gg, L))));
        });

        const body = [
          narrow.matches ? backButton() : null,
          head,
          restoredNote,
          h("div.rev-nav",
            button({ label: "Más reciente", icon: "arrow-left", variant: "ghost", size: "sm", disabled: !newer, onClick: () => newer && select(newer.id, { focus: true }) }),
            button({ label: "Más antigua", iconRight: "arrow-right", variant: "ghost", size: "sm", disabled: !older, onClick: () => older && select(older.id, { focus: true }) })),
          restoreHint,
          h("div.rev-changeshead", h("h3.rev-changeshead__title", data.previous ? plural(changes.length, "cambio", "cambios") + (data.truncated ? " o más" : "") : "Contenido inicial"), compare),
          undoBtn ? h("div.rev-undo", undoBtn, h("p.rev-undo__hint", plan.kind === "product-deleted"
            ? "Vuelve a crear este producto tal como estaba, sin tocar nada más del sitio."
            : plan.kind === "product-created"
              ? "Elimina el producto que se creó aquí, sin tocar nada más del sitio."
              : "Vuelve a como estaba antes solo lo de esta lista. Lo que se guardó después en otras partes del sitio no cambia.")) : null,
          prunedNote(data),
          data.truncated ? notice({ tone: "warning", message: `Esta versión tiene muchos cambios: se muestran los primeros ${number(changes.length)}. Al restaurarla se recupera TODO su contenido, no solo lo que ves aquí.` }) : null,
          data.previous && !changes.length ? emptyState({ icon: "check-circle", title: "Sin diferencias de contenido", message: "Esta versión quedó igual a la anterior (por ejemplo, una restauración de algo que no había cambiado).", compact: true }) : null,
          groupEls.length ? h("div.rev-groups", groupEls) : null,
        ];
        return card({ className: "rev-detail", body });
      }

      /* --- Restaurar --- */
      async function reloadList() {
        const r = await api.get("/api/admin/revisions", { signal: ctx.signal });
        revs = r.items || [];
        renderList();
      }

      /** Lo que se pierde al restaurar: las versiones guardadas DESPUÉS de esta (y avisos de lo más delicado). */
      function laterDetails(r) {
        const i = revs.findIndex((x) => x.id === r.id);
        const later = i > 0 ? revs.slice(0, i) : [];
        if (!later.length) return null;
        const names = (re) => [...new Set(later.map((x) => re.exec(x.summary || "")?.[1]).filter(Boolean))];
        const created = names(/^Producto «(.+)» creado/);
        const deleted = names(/^Producto «(.+)» eliminado/);
        const touched = (label) => later.some((x) => (x.summary || "").startsWith(`Sección «${label}»`));
        const warn = [
          created.length ? `Desaparecen de la tienda ${created.length === 1 ? "el producto creado" : "los productos creados"} después: ${created.map((n) => `«${n}»`).join(", ")}.` : null,
          deleted.length ? `Vuelven ${deleted.length === 1 ? "el producto eliminado" : "los productos eliminados"} después: ${deleted.map((n) => `«${n}»`).join(", ")}.` : null,
          touched("Ajustes generales") ? "Los ajustes generales vuelven a como estaban (número de WhatsApp, redes sociales, logos…)." : null,
          touched("Modal de descuento") ? "El modal de descuento vuelve a como estaba (puede cambiar el cupón que se entrega)." : null,
        ].filter(Boolean);
        return h("div.stack-sm.rev-confirm__later",
          h("p.rev-confirm__lead", `Se deshacen ${plural(later.length, "cambio guardado", "cambios guardados")} después de esta versión, en cualquier sección:`),
          shortList(later.map((x) => `${x.summary || "Cambio de contenido"} · ${x.user?.name || "Sistema"} · ${relativeTime(x.at)}`)),
          warn.length ? notice({ tone: "danger", title: "Ojo", message: warn.join(" ") }) : null,
          h("p.muted.small", "¿Solo quieres deshacer un cambio? Ábrelo en la lista y usa «Deshacer este cambio»: no toca lo demás."));
      }

      async function restore(r, btn) {
        const was = revs[0];
        const ok = await confirmDialog({
          title: "¿Restaurar esta versión?",
          message: `TODO el contenido del sitio vuelve a como quedó en esta versión (${r.summary}, del ${dateTime(r.at)}). Los visitantes verán el cambio al instante.`,
          details: [
            laterDetails(r),
            h("ul.rev-confirm",
              h("li", "Afecta el inicio, los textos, el modal de descuento, las categorías, colores, colecciones, hormas, guía de tallas, reseñas, ajustes y productos."),
              h("li", "No cambia los cupones, los usuarios, los suscriptores ni los archivos de la biblioteca de medios."),
              h("li", `Se puede deshacer: la versión actual${was ? ` (${was.summary})` : ""} queda en el historial y la puedes restaurar después.`)),
          ],
          confirmLabel: "Restaurar versión",
          danger: true,
        });
        if (!ok) return;
        let restored;
        try {
          restored = await withBusy(btn, () => api.post(`/api/admin/revisions/${enc(r.id)}/restore`), { label: "Restaurando…" });
        } catch (e) {
          showApiError(e, { title: "No se pudo restaurar" });
          return;
        }
        content.invalidate();
        await afterRestore(was?.id || null, `La tienda ya muestra el contenido de la versión del ${dateTime(r.at)}`);
        noteCoupons(restored?.coupons);
        warnMissingFiles(restored?.content, was?.id || null, restored?.missingMedia);
      }

      /** Cupones que el servidor ajustó al restaurar (apuntaban a productos que no existen en esa versión). */
      function noteCoupons(list) {
        if (!Array.isArray(list) || !list.length) return;
        const off = list.filter((c) => c.deactivated).map((c) => c.code);
        toast(`Se ajustaron ${plural(list.length, "cupón", "cupones")} que apuntaban a productos de otra versión: ${list.map((c) => c.code).join(", ")}.${off.length ? ` Quedaron desactivados: ${off.join(", ")}.` : ""}`, { type: "warning", title: "Cupones revisados", timeout: 12000, action: { label: "Ver cupones", onClick: () => { location.hash = "#/cupones"; } } });
      }

      /**
       * Tras restaurar: archivos de /uploads/ que la versión usa y ya no existen (se verían rotos). Si el servidor los
       * informa (missingMedia) se usan esos; si no, se comparan con la biblioteca de medios.
       */
      async function warnMissingFiles(snapshot, undoId, fromServer) {
        if (!snapshot) return;
        let missing = [];
        if (Array.isArray(fromServer)) {
          const where = uploadsIn(snapshot);
          missing = fromServer.map((u) => ({ url: u, where: where.get(String(u).split(/[?#]/)[0]) || "" }));
        } else {
          try { missing = await missingUploads(snapshot); } catch { return; }
        }
        if (!missing.length || !ctx.isCurrent) return;
        const places = [...new Set(missing.map((x) => whereLabel(x.where, snapshot.products)))];
        modal({
          title: "Faltan archivos de esta versión",
          size: "md",
          content: [
            h("p.modal__text", `Esta versión usa ${plural(missing.length, "archivo que ya se eliminó", "archivos que ya se eliminaron")} de la biblioteca de medios: en la tienda esos lugares se ven sin imagen o sin video.`),
            h("div.stack-sm", h("p.muted", "Dónde:"), shortList(places)),
            h("p.muted", "Súbelos de nuevo y elígelos en esas secciones, o deshaz la restauración."),
          ],
          actions: [
            undoId ? { label: "Deshacer la restauración", variant: "secondary", onClick: () => { setTimeout(() => undo(undoId), 0); } } : null,
            { label: "Entendido", variant: "primary" },
          ].filter(Boolean),
        });
      }

      /* --- Deshacer solo este cambio --- */
      async function undoChange(data, plan, btn) {
        const r = data.revision;
        const L = makeLookups(content.data, data.changes);
        const labelOf = (op) => humanParts(op.g.section, op.segs, L, op.order).join(" › ") || "Todo";
        try {
          if (plan.kind === "product-created") {
            const name = plan.after?.name || L.products.get(plan.id) || plan.id;
            let now = null;
            try { now = await content.product(plan.id); } catch (e) { if (e?.status !== 404) throw e; }
            if (!now) { toast(`«${name}» ya no existe: no hay nada que deshacer.`, { type: "info" }); return; }
            const ok = await confirmDialog({
              title: `¿Eliminar «${now.name}»?`,
              message: `Este cambio creó el producto. Deshacerlo lo quita de la tienda y del panel; el resto del sitio no cambia.${same(now, plan.after) ? "" : " Ojo: tuvo cambios después de crearse y también se perderán."}`,
              confirmLabel: "Eliminar producto",
              danger: true,
            });
            if (!ok) return;
            await withBusy(btn, () => content.deleteProduct(plan.id), { label: "Deshaciendo…" });
          } else if (plan.kind === "product-deleted") {
            const before = unstamp(plan.before);
            const data2 = await content.load({ force: true });
            if ((data2.products || []).some((p) => p.id === plan.id)) {
              modal({ title: "Ya existe un producto con ese id", size: "sm", content: h("p.modal__text", `Hoy hay otro producto con el id «${plan.id}». Cámbiale el id a ese producto (en su editor) y vuelve a intentarlo.`), actions: [{ label: "Entendido", variant: "primary" }] });
              return;
            }
            const ok = await confirmDialog({
              title: `¿Recuperar «${before.name}»?`,
              message: `Vuelve a crear el producto tal como estaba al eliminarlo (colores, fotos, tallas y stock).${before.status === "published" ? " Se verá en la tienda de inmediato." : " Queda en borrador."} Los demás productos y secciones no cambian.`,
              confirmLabel: "Recuperar producto",
            });
            if (!ok) return;
            await withBusy(btn, () => content.createProduct(before), { label: "Recuperando…" });
          } else {
            const isProduct = plan.kind === "product";
            let root;
            if (isProduct) {
              try { root = await content.product(plan.id); } catch (e) {
                if (e?.status === 404) { toast("Ese producto ya no existe (se eliminó o cambió de id): no hay nada que deshacer.", { type: "info" }); return; }
                throw e;
              }
            } else {
              content.invalidate();
              root = await content.section(plan.section, { force: true });
            }
            const { work, done, skipped } = applyUndo(root, plan.ops);
            const where = isProduct ? `El producto «${root.name}»` : `La sección «${SECTION_LABELS[plan.section] || plan.section}»`;
            if (!done.length) {
              modal({
                title: "No hay nada que deshacer",
                size: "sm",
                content: [h("p.modal__text", "Todo lo que cambió aquí se volvió a cambiar después, así que ya no está como lo dejó este cambio."), shortList(skipped.map(labelOf))],
                actions: [{ label: "Entendido", variant: "primary" }],
              });
              return;
            }
            const ok = await confirmDialog({
              title: "¿Deshacer este cambio?",
              message: `${where} vuelve a como estaba antes de este cambio (${plural(done.length, "dato", "datos")}). El resto del sitio no cambia.`,
              details: [
                shortList(done.map(labelOf)),
                skipped.length ? notice({ tone: "warning", message: `No se tocan porque se volvieron a cambiar después: ${skipped.map(labelOf).join(" · ")}.` }) : null,
              ],
              confirmLabel: "Deshacer este cambio",
            });
            if (!ok) return;
            await withBusy(btn, () => (isProduct ? content.updateProduct(plan.id, work) : content.saveSection(plan.section, work)), { label: "Deshaciendo…" });
          }
        } catch (e) {
          if (e?.isValidation) { undoValidationDialog(e); return; }
          if (e?.isConflict) { toast("Otra persona guardó cambios ahí mientras tanto. Vuelve a intentarlo.", { type: "error", title: "No se pudo deshacer" }); return; }
          showApiError(e, { title: "No se pudo deshacer" });
          return;
        }
        content.invalidate();
        try { await reloadList(); } catch (e) { showApiError(e); return; }
        if (!ctx.isCurrent) return;
        lastRestored = null;
        toast(`Deshicimos «${r.summary}». Lo demás del sitio quedó igual.`, { title: "Cambio deshecho", timeout: 9000 });
        if (revs[0]) await select(revs[0].id, { focus: true });
      }

      async function undo(id, btn) {
        if (!id) return;
        try {
          await withBusy(btn, () => api.post(`/api/admin/revisions/${enc(id)}/restore`), { label: "Deshaciendo…" });
        } catch (e) {
          showApiError(e, { title: "No se pudo deshacer" });
          return;
        }
        content.invalidate();
        lastRestored = null;
        await afterRestore(null, "Listo: el contenido volvió a como estaba antes de restaurar.");
      }

      async function afterRestore(undoId, message) {
        try {
          await reloadList();
        } catch (e) {
          showApiError(e);
          return;
        }
        if (!ctx.isCurrent) return;
        const top = revs[0];
        lastRestored = top ? { id: top.id, undoId } : null;
        toast(message, {
          title: undoId ? "Versión restaurada" : "Cambio deshecho",
          timeout: 12000,
          action: undoId ? { label: "Deshacer", onClick: () => undo(undoId) } : null,
        });
        if (top) await select(top.id, { focus: true });
        listBody.querySelector(`.rev-item[data-id="${CSS.escape(top?.id || "")}"]`)?.scrollIntoView({ block: "nearest" });
      }

      /* --- Montaje --- */
      el.append(page);
      append(page,
        pageHeader({
          title: "Revisiones",
          breadcrumbs: [{ label: "Sistema" }],
          subtitle: "Versiones anteriores del contenido del sitio. Mira qué cambió en cada una y restáurala si algo salió mal.",
          actions: [
            button({ label: "Ver actividad", icon: "activity", href: "#/actividad?tipo=revision" }),
            button({ label: "Ver tienda", icon: "external", href: "../", target: "_blank" }),
          ],
        }),
        notice({
          tone: "info",
          title: "Qué guarda el historial",
          message: "Cada vez que alguien guarda el contenido del sitio (inicio, textos, modal de descuento, categorías, colores, colecciones, hormas, guía de tallas, reseñas o ajustes) o un producto, se guarda una copia completa. No guarda cupones, usuarios, suscriptores ni archivos de la biblioteca de medios. Se conservan las últimas 200 versiones y, siempre, el contenido inicial.",
          className: "rev-intro",
        }),
        layout);
      renderList();

      if (!selectedId && !narrow.matches && revs.length) selectedId = revs[0].id;
      if (selectedId) await select(selectedId, { push: !!ctx.query.get("id") || false });
      else select("", { push: false });

      const onMq = () => {
        layout.classList.toggle("is-narrow", narrow.matches);
        if (!narrow.matches && !selectedId && revs.length) select(revs[0].id, { push: false });
        else if (selectedId && cache.has(selectedId)) replace(detailCol, detailView(cache.get(selectedId)));
      };
      layout.classList.toggle("is-narrow", narrow.matches);
      narrow.addEventListener("change", onMq);
      ctx.onCleanup(() => narrow.removeEventListener("change", onMq));
    },
  },
];
