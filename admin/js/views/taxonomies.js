/* ==========================================================================
   Mercy Studio · Panel — views/taxonomies.js
   Taxonomías del catálogo (secciones-lista, patrón B del README: { items } + errorPrefix "items"):
   · #/colores      paleta global: muestra, nombre, hex e id; productos que usan cada color
   · #/hormas       hormas (Regular, Oversize…): productos y filas que tienen en la guía de tallas
   · #/categorias   nombre, id, detalles por defecto, guía de tallas y pie de página; orden = menú de la tienda
   · #/colecciones  nombre, id, descripción y productos de cada colección
   Ids nuevos: se generan del nombre (hasta que los edites); un id en uso queda bloqueado. Quitar algo en
   uso muestra dónde se usa; si los datos cambiaron mientras editabas, el servidor responde 409 in_use y el
   Form muestra el mismo diálogo. También exporta ayudas que usan views/sizecharts.js y views/reviews.js.
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api } from "../core/api.js";
import { content } from "../core/store.js";
import { session } from "../core/session.js";
import { createForm, fields as f } from "../core/forms.js";
import { badge, button, card, confirmDialog, modal, notice, pageHeader, sortHint, statusBadge } from "../core/ui.js";
import { HEX_RE, dateTime, plural, relativeTime, siteUrl, slugify, truncate } from "../core/format.js";
import { pexelsSized } from "../core/media.js";

const enc = encodeURIComponent;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const STORE = "../"; // la tienda (el panel vive en /admin/)

/* ==========================================================================
   Ayudas compartidas
   ========================================================================== */

/** Quita las marcas internas del panel (_new, _auto) antes de enviar al servidor. */
export const cleanItems = (list) => (list || []).map((x) => {
  if (!x || typeof x !== "object" || Array.isArray(x)) return x;
  const { _new, _auto, ...rest } = x;
  return rest;
});

/** Índice del ítem de una ruta "items.3" → 3. */
export const itemIndex = (p) => Number(String(p).split(".")[1]);

/** Id único a partir de un nombre ("Verde oliva" → "verde-oliva"; "verde-oliva-2" si ya existe). */
export function uniqueSlug(name, list, selfIndex) {
  const base = slugify(name);
  if (!base) return "";
  const taken = new Set((list || []).filter((_, j) => j !== selfIndex).map((x) => x?.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const s = `${base.slice(0, 55).replace(/-+$/, "")}-${n}`;
    if (!taken.has(s)) return s;
  }
  return base;
}

/** Formulario de una sección-lista: { items } + errorPrefix "items"; devuelve lo que normalizó el servidor. */
export function listForm(ctx, section, items, { successMessage } = {}) {
  return createForm({
    ctx,
    value: { items },
    errorPrefix: "items",
    successMessage: successMessage || "Cambios guardados.",
    onSubmit: async (v, { force }) => ({ items: await content.saveSection(section, cleanItems(v.items), { force }) }),
  });
}

/** Línea "Última modificación hace 5 min por Ana." (se actualiza al guardar). */
export function lastChangeLine(form, section) {
  const el = h("p.tx-updated");
  const upd = () => {
    const m = content.sectionMeta(section);
    replace(el, m?.updatedAt
      ? [icon("clock", { size: 14 }), h("span", "Última modificación ", h("time", { datetime: m.updatedAt, title: dateTime(m.updatedAt) }, relativeTime(m.updatedAt)), m.updatedBy ? ` por ${m.updatedBy}` : "", ".")]
      : null);
    el.hidden = !m?.updatedAt;
  };
  form.on("saved", upd);
  upd();
  return el;
}

/** Encabezado de página con la línea de última modificación. */
export function header({ title, subtitle, actions, form, section }) {
  const head = pageHeader({ title, subtitle, breadcrumbs: [{ label: "Tienda" }], actions });
  if (form && section) head.querySelector(".page-header__titles")?.append(lastChangeLine(form, section));
  return head;
}

/** Productos que usan un elemento (según el contenido guardado, que es lo que valida el servidor). */
export function productsUsing(kind, id, products = content.data?.products || []) {
  if (!id) return [];
  const test = {
    colors: (p) => (p.colors || []).some((c) => c.color === id),
    fits: (p) => (p.fits || []).includes(id),
    categories: (p) => p.category === id,
    collections: (p) => p.collection === id,
  }[kind];
  return test ? products.filter(test) : [];
}

const published = (list) => list.filter((p) => p.status === "published");

function productThumb(p) {
  for (const c of p.colors || []) {
    const ph = c.photos?.[0];
    if (ph?.src) return h("span.tx-plist__thumb", h("img", { src: ph.thumb ? siteUrl(ph.thumb) : pexelsSized(ph.src, 160), alt: "", loading: "lazy" }));
  }
  return h("span.tx-plist__thumb", { style: { background: `linear-gradient(160deg, ${p.tile?.from || "#d8bea6"}, ${p.tile?.to || "#a76d4a"})` } });
}

/** Diálogo con la lista de productos (enlaces al editor de cada uno). */
export function productsDialog({ title, message, products, action }) {
  const sorted = products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  return modal({
    title,
    size: "md",
    content: [
      message ? h("p.modal__text", message) : null,
      h("ul.tx-plist", sorted.map((p) => h("li",
        h("a.tx-plist__link", { href: `#/productos/${enc(p.id)}` },
          productThumb(p),
          h("span.tx-plist__text", h("span.tx-plist__name", p.name), h("span.tx-plist__ref", p.ref || p.id)),
          p.status === "draft" ? statusBadge("draft") : null,
          icon("chevron-right", { size: 16, className: "tx-plist__chev" }))))),
    ],
    actions: [action, { label: "Cerrar", variant: action ? "secondary" : "primary" }].filter(Boolean),
  });
}

/** Botón "12 productos" que abre la lista (o un texto si no hay). */
export function productsButton(products, { title, message, emptyText = "Ningún producto lo usa todavía.", action } = {}) {
  if (!products.length) return h("span.tx-usage__item.tx-usage__none", icon("shirt", { size: 15 }), emptyText);
  return button({
    label: plural(products.length, "producto", "productos"),
    icon: "shirt",
    variant: "link",
    size: "sm",
    className: "tx-usage__btn",
    onClick: () => productsDialog({ title, message, products, action }),
  });
}

/** "No puedes eliminar…" con la lista de lugares donde se usa (mismo estilo que el 409 in_use). */
export function blockedDialog({ title, message, products = [], places = [] }) {
  const items = [
    ...products.map((p) => ({ label: `Producto «${p.name}»${p.status === "draft" ? " (borrador)" : ""}`, href: `#/productos/${enc(p.id)}` })),
    ...places,
  ];
  return modal({
    title,
    size: "md",
    content: [
      h("p.modal__text", message),
      items.length ? h("div.stack-sm", h("p.muted", "Dónde se está usando:"), h("ul.usage-list", items.map((it) => h("li", it.href ? h("a", { href: it.href }, it.label) : it.label)))) : null,
    ],
    actions: [{ label: "Entendido", variant: "primary" }],
  });
}

/**
 * Elementos que se redibujan solos con cada cambio del formulario:
 *   const live = liveRegistry(form); live(el, (el) => …);
 * Los que salen del documento (al redibujar una lista) se olvidan.
 */
export function liveRegistry(form) {
  const fns = new Set();
  form.on("change", () => {
    for (const fn of [...fns]) {
      if (fn.el.isConnected) fn.seen = true;
      else if (fn.seen) { fns.delete(fn); continue; }
      try { fn(fn.el); } catch (e) { console.error(e); }
    }
  });
  return (el, fn) => {
    fn.el = el;
    fns.add(fn);
    fn(el);
    requestAnimationFrame(() => { if (el.isConnected) fn.seen = true; }); // así se libera al salir del documento
    return el;
  };
}

/** Al agregar un ítem, lleva el foco a su primer campo (por defecto la lista enfoca la cabecera). */
export function focusOnAdd(form, listField, path, selector) {
  let n = (form.get(path) || []).length;
  form.on("change", ({ path: p }) => {
    const m = (form.get(path) || []).length;
    if (p === path && m > n) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const li = listField.querySelector(":scope > ol.list-field")?.children[m - 1];
        const target = li?.querySelector(selector);
        if (target) {
          target.focus();
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }));
    }
    n = m;
  });
}

/** El nombre genera el id mientras el elemento es nuevo y no se ha editado el id a mano. */
export function autoId(form, p) {
  return (v) => {
    const it = form.get(p);
    if (!it?._new || it._auto === false) return;
    form.set(`${p}.id`, uniqueSlug(v, form.get("items"), itemIndex(p)));
  };
}

function dupIdValidator(form, p) {
  return (v) => {
    if (!v) return null;
    const i = itemIndex(p);
    return (form.get("items") || []).some((x, j) => j !== i && x?.id === v) ? "Ya hay otro elemento con este id." : null;
  };
}

/**
 * Campo "Id": en los nuevos se genera con el nombre; en los guardados se bloquea si está en uso
 * (`usedBy` = "lo usan 3 productos"); si no está en uso se puede cambiar con un aviso.
 */
export function idField(form, p, { item, usedBy = "", editHelp } = {}) {
  // Sin contador: slugify() ya recorta a 60 caracteres
  const base = { label: "Id", required: true, spellcheck: false, transform: (v) => slugify(v), validate: dupIdValidator(form, p) };
  if (item?._new) {
    return f.text(form, `${p}.id`, {
      ...base,
      placeholder: "se-genera-con-el-nombre",
      help: "Se genera con el nombre (minúsculas y guiones).",
      onChange: () => { if (form.get(`${p}._auto`) !== false) form.set(`${p}._auto`, false); },
    });
  }
  if (usedBy) {
    const fld = f.text(form, `${p}.id`, { label: "Id", disabled: true, className: "tx-id-locked", prefix: icon("lock", { size: 14 }), help: "En uso: no se puede cambiar." });
    fld.title = `No se puede cambiar: ${usedBy}.`;
    return fld;
  }
  return f.text(form, `${p}.id`, { ...base, help: editHelp || "Referencia interna: cámbiala solo si es necesario." });
}

/** Máximo de caracteres sin contador visible (para filas compactas). */
export const maxChars = (n) => (v) => ([...String(v ?? "")].length > n ? `Máximo ${n} caracteres (tiene ${[...String(v ?? "")].length}).` : null);

/** Muestra de color (hex válido o vacío). */
const swatchBg = (hex) => (HEX_RE.test(String(hex || "")) ? hex : "transparent");

/**
 * "lo usan 12 productos" · "la usa 1 producto" · "la usan 7 productos y 1 cupón" ("" si nada lo usa).
 * pronoun: "lo" | "la"; counts: [[n, "producto", "productos"], …]
 */
export function usagePhrase(pronoun, counts) {
  const parts = counts.filter(([n]) => n > 0);
  if (!parts.length) return "";
  const total = parts.reduce((s, [n]) => s + n, 0);
  return `${pronoun} ${total === 1 ? "usa" : "usan"} ${parts.map(([n, one, many]) => plural(n, one, many)).join(" y ")}`;
}

/** Enlace a la tienda en una pestaña nueva. */
export function storeLink(href, label) {
  return h("a.tx-usage__item.tx-usage__link", { href, target: "_blank", rel: "noopener" }, icon("external", { size: 14 }), label);
}

/* ==========================================================================
   Colores
   ========================================================================== */
async function colorsView(el, params, ctx) {
  const data = await content.load({ force: true });
  const products = data.products || [];
  const form = listForm(ctx, "colors", await content.section("colors"), { successMessage: "Colores guardados. Ya se ven en la tienda." });
  const live = liveRegistry(form);

  const list = f.list(form, "items", {
    label: "Colores de la paleta",
    className: "tx-list",
    min: 1,
    max: 60,
    addLabel: "Agregar color",
    confirmRemove: false,
    newItem: () => ({ id: "", name: "", hex: "#a89c8f", _new: true, _auto: true }),
    itemLabel: (it, i) => it?.name || `Color ${i + 1}`,
    renderItem: (p, i, it) => colorItem(form, p, it, products, live),
    beforeRemove: (it, i) => confirmRemoveColor(it, i),
  });
  /** Quitar un color: bloqueado si algún producto lo usa; si no, se confirma (los nuevos vacíos, sin preguntar). */
  async function confirmRemoveColor(it, i) {
    const name = it?.name || it?.id || `Color ${i + 1}`;
    const used = it?._new ? [] : productsUsing("colors", it.id, products);
    if (used.length) {
      blockedDialog({
        title: `No puedes eliminar «${name}»`,
        message: `${cap(usagePhrase("lo", [[used.length, "producto", "productos"]]))}. Quita este color de esos productos (o cámbialo por otro) y vuelve a intentarlo.`,
        products: used,
      });
      return false;
    }
    if (it?._new && !it.name) return true;
    return confirmDialog({ title: `¿Eliminar el color «${name}»?`, message: "Se quitará de la paleta cuando guardes los cambios.", confirmLabel: "Eliminar", danger: true });
  }
  focusOnAdd(form, list, "items", "input[name$='.name']");

  /* --- Vista previa del filtro de color del catálogo --- */
  const filter = h("ul.tx-filter", { "aria-label": "Colores del filtro del catálogo" });
  live(filter, () => {
    const cols = form.get("items") || [];
    replace(filter, cols.map((c) => {
      const pub = !c._new && products.some((p) => p.status === "published" && (p.colors || []).some((x) => x.color === c.id));
      return h("li.tx-filter__item", { class: !pub && "is-off", title: pub ? c.name : `${c.name || "Sin nombre"}: ningún producto publicado lo usa, no aparece en el filtro.` },
        h("span.tx-filter__dot", { style: { background: swatchBg(c.hex) } }),
        h("span.tx-filter__name", c.name || "Sin nombre"),
        pub ? null : h("span.sr-only", " (no aparece: sin productos publicados)"));
    }));
  });

  el.append(h("div.page.page--form",
    header({
      title: "Colores",
      subtitle: "La paleta de colores que pueden tener los productos. Se ven en la ficha de producto, en las tarjetas y en el filtro de color del catálogo.",
      actions: [button({ label: "Ver catálogo", icon: "external", href: `${STORE}catalogo.html`, target: "_blank" })],
      form,
      section: "colors",
    }),
    card({
      title: "Así se ve en el filtro del catálogo",
      description: "Solo aparecen los colores que usa al menos un producto publicado, en el orden de la paleta. Los atenuados no se muestran.",
      body: filter,
    }),
    card({
      title: "Paleta",
      description: `El nombre se ve en la ficha de producto y al pasar sobre la muestra del filtro. ${sortHint().replace(/\.$/, "")}; para borrar un color, primero quítalo de los productos que lo usan.`,
      body: list,
    })));
}

function colorItem(form, p, it, products, live) {
  const used = it?._new ? [] : productsUsing("colors", it.id, products);
  const hexField = f.color(form, `${p}.hex`, { label: "Color", required: true, help: "Elígelo en la muestra o escribe su código (p. ej. #1d2a44)." });
  const swatch = h("button.tx-swatch", { type: "button", title: "Elegir el tono" });
  swatch.addEventListener("click", () => {
    const picker = hexField.querySelector('input[type="color"]');
    try { picker.showPicker(); } catch { picker.click(); }
  });
  live(swatch, () => {
    swatch.style.background = swatchBg(form.get(`${p}.hex`));
    swatch.setAttribute("aria-label", `Elegir el tono de «${form.get(`${p}.name`) || "este color"}»`);
  });
  const pub = published(used);
  return h("div.tx-color",
    swatch,
    h("div.tx-color__main",
      f.row(
        f.text(form, `${p}.name`, { label: "Nombre", required: true, validate: maxChars(40), placeholder: "Ej.: Verde oliva", onChange: autoId(form, p) }),
        hexField,
        idField(form, p, { item: it, usedBy: usagePhrase("lo", [[used.length, "producto", "productos"]]) }),
        { cols: 3 }),
      h("div.tx-usage",
        productsButton(used, { title: `Productos con el color «${it?.name || it?.id}»` }),
        pub.length ? storeLink(`${STORE}catalogo.html?color=${enc(it.id)}`, "Ver en el catálogo") : null,
        it?._new ? badge("Nuevo: se crea al guardar", "accent") : null)));
}

/* ==========================================================================
   Hormas
   ========================================================================== */
async function fitsView(el, params, ctx) {
  const data = await content.load({ force: true });
  const products = data.products || [];
  const charts = data.sizeCharts || [];
  const form = listForm(ctx, "fits", await content.section("fits"), { successMessage: "Hormas guardadas. Ya se ven en la tienda." });

  const chartRows = (id) => charts.filter((sc) => sc.rows?.[id]?.length).map((sc) => ({ sc, n: sc.rows[id].length }));

  const list = f.list(form, "items", {
    label: "Hormas",
    className: "tx-list",
    max: 20,
    addLabel: "Agregar horma",
    confirmRemove: false,
    emptyText: "Aún no hay hormas. Las prendas sin horma (gorras, accesorios) no las necesitan.",
    newItem: () => ({ id: "", name: "", _new: true, _auto: true }),
    itemLabel: (it, i) => it?.name || `Horma ${i + 1}`,
    renderItem: (p, i, it) => {
      const used = it?._new ? [] : productsUsing("fits", it.id, products);
      const rows = it?._new ? [] : chartRows(it.id);
      return h("div.tx-fit",
        f.row(
          f.text(form, `${p}.name`, { label: "Nombre", required: true, validate: maxChars(40), placeholder: "Ej.: Oversize", onChange: autoId(form, p) }),
          // Cambiar el id de una horma con filas las borraría de la guía (cascada del servidor): se bloquea también
          idField(form, p, { item: it, usedBy: usagePhrase("la", [[used.length, "producto", "productos"]]) || (rows.length ? "tiene filas en la guía de tallas" : "") }),
          { cols: 2 }),
        h("div.tx-usage",
          productsButton(used, { title: `Productos con la horma «${it?.name || it?.id}»`, emptyText: "Ningún producto la usa todavía." }),
          rows.length
            ? h("span.tx-usage__item.tx-usage__guides", icon("ruler", { size: 14 }), h("span.tx-usage__none", "Guía de tallas:"),
              rows.map((r) => h("a.tx-usage__link", { href: `#/tallas?guia=${enc(r.sc.id)}`, title: `Editar la guía «${r.sc.name}»` }, `${r.sc.name} (${plural(r.n, "fila", "filas")})`)))
            : h("span.tx-usage__item.tx-usage__none", icon("ruler", { size: 14 }), it?._new ? "Agrega sus medidas en Guía de tallas después de guardar." : "Sin filas en la guía de tallas."),
          published(used).length ? storeLink(`${STORE}catalogo.html?fit=${enc(it.id)}`, "Ver en el catálogo") : null,
          it?._new ? badge("Nueva: se crea al guardar", "accent") : null));
    },
    beforeRemove: (it, i) => confirmRemoveFit(it, i),
  });
  /** Quitar una horma: bloqueado si algún producto la usa; avisa si tiene filas en la guía de tallas. */
  async function confirmRemoveFit(it, i) {
    const name = it?.name || it?.id || `Horma ${i + 1}`;
    const used = it?._new ? [] : productsUsing("fits", it.id, products);
    if (used.length) {
      blockedDialog({
        title: `No puedes eliminar «${name}»`,
        message: `${cap(usagePhrase("la", [[used.length, "producto", "productos"]]))}. Quita esta horma de esos productos y vuelve a intentarlo.`,
        products: used,
      });
      return false;
    }
    if (it?._new && !it.name) return true;
    const rows = it?._new ? [] : chartRows(it.id);
    return confirmDialog({
      title: `¿Eliminar la horma «${name}»?`,
      message: rows.length
        ? `Al guardar también se quitarán sus filas de la guía de tallas: ${rows.map((r) => `${r.sc.name} (${plural(r.n, "fila", "filas")})`).join(", ")}.`
        : "Se quitará cuando guardes los cambios.",
      confirmLabel: "Eliminar",
      danger: true,
    });
  }
  focusOnAdd(form, list, "items", "input[name$='.name']");

  el.append(h("div.page.page--form",
    header({
      title: "Hormas",
      subtitle: "Cortes disponibles para las prendas (Regular, Oversize, Boxy…). Se ven en el selector de horma de la ficha de producto, en el filtro «Horma» del catálogo y en las pestañas de la guía de tallas.",
      actions: [
        button({ label: "Guía de tallas", icon: "ruler", href: "#/tallas" }),
        button({ label: "Ver catálogo", icon: "external", href: `${STORE}catalogo.html`, target: "_blank" }),
      ],
      form,
      section: "fits",
    }),
    notice({
      tone: "info",
      title: "Antes de eliminar una horma",
      message: "Solo puedes eliminar hormas que ningún producto use. Al eliminarla, sus filas también se quitan de la guía de tallas.",
    }),
    card({ title: "Hormas", description: "El nombre se ve en el selector de horma de la ficha de producto. El orden es el del filtro «Horma» del catálogo.", body: list })));
}

/* ==========================================================================
   Categorías
   ========================================================================== */
async function categoriesView(el, params, ctx) {
  const data = await content.load({ force: true });
  const products = data.products || [];
  const charts = data.sizeCharts || [];
  const catTexts = data.texts?.catalog || {};
  // Cupones que se limitan a categorías (solo el administrador puede leerlos)
  let coupons = [];
  if (session.isAdmin) {
    try { coupons = (await api.get("/api/admin/coupons", { signal: ctx.signal })).items || []; } catch { coupons = []; }
  }
  const couponsUsing = (id) => coupons.filter((c) => c.appliesTo === "categories" && (c.categoryIds || []).includes(id));
  const chartName = (id) => charts.find((sc) => sc.id === id)?.name || id;

  const form = listForm(ctx, "categories", await content.section("categories"), { successMessage: "Categorías guardadas. Ya se ven en el menú y el pie de página de la tienda." });
  const live = liveRegistry(form);

  const list = f.list(form, "items", {
    label: "Categorías",
    className: "tx-list tx-list--cards",
    min: 1,
    max: 30,
    collapsible: true,
    addLabel: "Agregar categoría",
    confirmRemove: false,
    newItem: () => ({ id: "", name: "", details: [], sizeChart: "", inFooter: true, _new: true, _auto: true }),
    itemLabel: (it, i) => it?.name || `Categoría ${i + 1}`,
    // Insignias de la cabecera (el núcleo las vuelve a pedir cuando cambia la categoría)
    itemMeta: (cur) => {
      const c = cur || {};
      const used = c._new ? [] : productsUsing("categories", c.id, products);
      return h("span.tx-head-meta",
        c._new ? badge("Nueva", "accent") : badge(plural(used.length, "producto", "productos"), used.length ? "neutral" : "warning"),
        h("span.hide-mobile", badge(c.sizeChart ? `Guía: ${chartName(c.sizeChart)}` : "Sin guía de tallas", c.sizeChart ? "info" : "neutral")),
        c.inFooter === false ? badge("Oculta del pie", "neutral", { title: "No aparece en el pie de página" }) : null);
    },
    renderItem: (p, i, it) => {
      const used = it?._new ? [] : productsUsing("categories", it.id, products);
      const cps = it?._new ? [] : couponsUsing(it.id);
      const usedBy = usagePhrase("la", [[used.length, "producto", "productos"], [cps.length, "cupón", "cupones"]]);
      return h("div.tx-cat",
        f.row(
          f.text(form, `${p}.name`, { label: "Nombre", required: true, maxlength: 40, placeholder: "Ej.: Camisetas", help: "Se ve en el menú lateral, en el pie de página y en los filtros del catálogo.", onChange: autoId(form, p) }),
          idField(form, p, { item: it, usedBy, editHelp: "Va en los enlaces de la tienda (catalogo.html?cat=…). Si lo cambias, los enlaces que ya compartiste dejan de filtrar." }),
          { cols: 2 }),
        f.row(
          f.select(form, `${p}.sizeChart`, {
            label: "Guía de tallas",
            emptyLabel: "Sin guía de tallas (talla única)",
            options: charts.map((sc) => ({ value: sc.id, label: sc.name })),
            help: "Tabla que se abre con «Guía de tallas» en la ficha de producto. Sin guía, la ficha dice «Talla única».",
          }),
          h("div.tx-cat__switch", f.switch(form, `${p}.inFooter`, { label: "Mostrar en el pie de página", help: "Enlace en la columna «Tienda» del pie de página." })),
          { cols: 2 }),
        f.list(form, `${p}.details`, {
          label: "Detalles por defecto",
          optional: true,
          help: "Viñetas de «Detalles» en la ficha de los productos de esta categoría que no tengan detalles propios.",
          className: "tx-details",
          max: 20,
          addLabel: "Agregar detalle",
          newItem: "",
          emptyText: "Sin detalles: la ficha dirá «Pronto sumaremos más detalles de esta prenda».",
          itemLabel: (t, j) => (t ? truncate(t, 36) : `Detalle ${j + 1}`),
          renderItem: (q, j) => f.text(form, q, { label: `Detalle ${j + 1}`, className: "tx-hide-label", validate: maxChars(300), placeholder: "Ej.: Algodón 100 % de 210 g" }),
        }),
        h("div.tx-usage",
          productsButton(used, {
            title: `Productos de «${it?.name || it?.id}»`,
            emptyText: "Sin productos en esta categoría.",
            action: { label: "Abrir en Productos", icon: "filter", onClick: () => { location.hash = `#/productos?categoria=${enc(it.id)}`; } },
          }),
          cps.length ? h("a.tx-usage__item.tx-usage__link", { href: "#/cupones" }, icon("ticket", { size: 14 }), `Cupones: ${cps.map((c) => c.code).join(", ")}`) : null,
          live(h("a.tx-usage__item.tx-usage__link", icon("ruler", { size: 14 }), "Editar la guía de tallas"), (a) => {
            const sc = form.get(`${p}.sizeChart`);
            a.hidden = !sc;
            a.href = `#/tallas?guia=${enc(sc || "")}`;
          }),
          published(used).length ? storeLink(`${STORE}catalogo.html?cat=${enc(it.id)}`, "Ver en la tienda") : null));
    },
    beforeRemove: (it, i) => confirmRemoveCategory(it, i),
  });
  /** Quitar una categoría: bloqueado si la usan productos o cupones; si no, se confirma. */
  async function confirmRemoveCategory(it, i) {
    const name = it?.name || it?.id || `Categoría ${i + 1}`;
    const used = it?._new ? [] : productsUsing("categories", it.id, products);
    const cps = it?._new ? [] : couponsUsing(it.id);
    if (used.length || cps.length) {
      blockedDialog({
        title: `No puedes eliminar «${name}»`,
        message: `${cap(usagePhrase("la", [[used.length, "producto", "productos"], [cps.length, "cupón", "cupones"]]))}. ${[
          used.length && `cámbiales la categoría a ${used.length === 1 ? "ese producto" : "esos productos"}`,
          cps.length && `quítala de ${cps.length === 1 ? "ese cupón" : "esos cupones"}`,
        ].filter(Boolean).join(", ").replace(/^./, (m) => m.toUpperCase())} y vuelve a intentarlo.`,
        products: used,
        places: cps.map((c) => ({ label: `Cupón ${c.code}`, href: `#/cupones/${enc(c.id)}` })),
      });
      return false;
    }
    if (it?._new && !it.name) return true;
    return confirmDialog({ title: `¿Eliminar la categoría «${name}»?`, message: "Saldrá del menú y del pie de página cuando guardes los cambios.", confirmLabel: "Eliminar", danger: true });
  }
  focusOnAdd(form, list, "items", "input[name$='.name']");

  /* --- Vista previa: menú lateral y pie de página de la tienda --- */
  const menuList = h("ul.tx-store__list");
  const footList = h("ul.tx-store__list");
  live(menuList, () => {
    const cats = form.get("items") || [];
    const name = (c) => c.name || "Sin nombre";
    replace(menuList,
      h("li.is-fixed", catTexts.newTitle || "Novedades"),
      h("li.is-fixed", catTexts.bestTitle || "Los más vendidos"),
      h("li.is-fixed", "Toda la colección"),
      h("li.tx-store__sep", { "aria-hidden": "true" }),
      cats.map((c) => h("li", name(c))));
    replace(footList,
      h("li.is-fixed", catTexts.newTitle || "Novedades"),
      cats.filter((c) => c.inFooter !== false).map((c) => h("li", name(c))));
  });

  el.append(h("div.page",
    header({
      title: "Categorías",
      subtitle: "Agrupan los productos del catálogo. El orden de esta lista es el del menú lateral y el del pie de página de la tienda.",
      actions: [button({ label: "Ver catálogo", icon: "external", href: `${STORE}catalogo.html`, target: "_blank" })],
      form,
      section: "categories",
    }),
    h("div.tx-layout",
      h("div.tx-layout__main",
        card({ title: "Categorías", description: `Abre una categoría para editarla. ${sortHint()}`, body: list })),
      h("aside.tx-layout__aside", { "aria-label": "Vista previa en la tienda" },
        card({
          title: "Así se ve en la tienda",
          description: "Se actualiza mientras editas. Los elementos fijos van atenuados.",
          body: h("div.tx-store",
            h("div.tx-store__panel", h("p.tx-store__label", "Menú lateral"), menuList),
            h("div.tx-store__panel", h("p.tx-store__label", "Pie de página · Tienda"), footList)),
        })))));
}

/* ==========================================================================
   Colecciones
   ========================================================================== */
async function collectionsView(el, params, ctx) {
  const data = await content.load({ force: true });
  const products = data.products || [];
  const form = listForm(ctx, "collections", await content.section("collections"), { successMessage: "Colecciones guardadas." });
  const live = liveRegistry(form);

  const list = f.list(form, "items", {
    label: "Colecciones",
    className: "tx-list tx-list--cards",
    max: 40,
    collapsible: true,
    addLabel: "Agregar colección",
    confirmRemove: false,
    emptyText: "Aún no hay colecciones.",
    newItem: () => ({ id: "", name: "", description: "", _new: true, _auto: true }),
    itemLabel: (it, i) => it?.name || `Colección ${i + 1}`,
    itemMeta: (cur) => {
      const c = cur || {};
      const used = c._new ? [] : productsUsing("collections", c.id, products);
      return h("span.tx-head-meta", c._new ? badge("Nueva", "accent") : badge(plural(used.length, "producto", "productos"), used.length ? "neutral" : "warning"));
    },
    renderItem: (p, i, it) => {
      const used = it?._new ? [] : productsUsing("collections", it.id, products);
      return h("div.tx-col",
        f.row(
          f.text(form, `${p}.name`, { label: "Nombre", required: true, maxlength: 60, placeholder: "Ej.: Renacer", help: "Se ve en la ficha de producto («Colección Renacer») y la búsqueda de la tienda lo encuentra.", onChange: autoId(form, p) }),
          idField(form, p, { item: it, usedBy: usagePhrase("la", [[used.length, "producto", "productos"]]) }),
          { cols: 2 }),
        f.textarea(form, `${p}.description`, { label: "Descripción", optional: true, maxlength: 2000, rows: 2, help: "Uso interno por ahora: la tienda todavía no la muestra." }),
        h("div.tx-usage",
          productsButton(used, { title: `Productos de la colección «${it?.name || it?.id}»`, emptyText: "Ningún producto la usa todavía." }),
          published(used).length ? storeLink(`${STORE}catalogo.html?q=${enc(it.name)}`, "Buscar en la tienda") : null));
    },
    beforeRemove: (it, i) => confirmRemoveCollection(it, i),
  });
  /** Quitar una colección: bloqueado si algún producto la usa; si no, se confirma. */
  async function confirmRemoveCollection(it, i) {
    const name = it?.name || it?.id || `Colección ${i + 1}`;
    const used = it?._new ? [] : productsUsing("collections", it.id, products);
    if (used.length) {
      blockedDialog({
        title: `No puedes eliminar «${name}»`,
        message: `${cap(usagePhrase("la", [[used.length, "producto", "productos"]]))}. Cámbiales la colección a esos productos (o déjalos «Sin colección») y vuelve a intentarlo.`,
        products: used,
      });
      return false;
    }
    if (it?._new && !it.name) return true;
    return confirmDialog({ title: `¿Eliminar la colección «${name}»?`, message: "Se quitará cuando guardes los cambios.", confirmLabel: "Eliminar", danger: true });
  }
  focusOnAdd(form, list, "items", "input[name$='.name']");

  el.append(h("div.page.page--form",
    header({
      title: "Colecciones",
      subtitle: "Líneas o cápsulas de producto (Renacer, Salmos…). Cada producto puede pertenecer a una colección.",
      actions: [button({ label: "Ver catálogo", icon: "external", href: `${STORE}catalogo.html`, target: "_blank" })],
      form,
      section: "collections",
    }),
    card({ title: "Colecciones", description: `Abre una colección para editarla. ${sortHint()}`, body: list })));
}

/* ==========================================================================
   Rutas (contrato §7; sin roles = administrador y editor)
   ========================================================================== */
export default [
  { path: "/categorias", title: "Categorías", render: categoriesView },
  { path: "/colores", title: "Colores", render: colorsView },
  { path: "/colecciones", title: "Colecciones", render: collectionsView },
  { path: "/hormas", title: "Hormas", render: fitsView },
];
