/* ==========================================================================
   Mercy Studio · Panel — views/texts.js
   Textos del sitio (#/textos): franja café superior, menú y ayuda, búsqueda, favoritos y carrito, catálogo,
   envíos y cambios (con todos los avisos de envío), cuidados por defecto, nota de la guía de tallas, ficha de
   producto, finalizar compra, suscripción y pie de página. Ordenados como aparecen en la tienda. Sección "texts"
   (PUT /api/admin/content/texts). Los textos de interfaz (etiquetas, avisos, estados vacíos) muestran el texto de
   fábrica como marcador: vacío = ese texto (la tienda nunca queda sin etiqueta).
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import { button, notice, pageHeader, section } from "../core/ui.js";
import {
  decorateSection, jumpNav, keepMetaFresh, metaSubtitle, richNodes, storeButton, storeLink,
} from "./home.js";

const FALLBACK_SUB = "Todos los textos de la tienda que no son de un producto ni del Inicio: menú, búsqueda, carrito, catálogo, envíos, ficha, pago y pie de página.";

const FABRICA = "Vacío = texto de fábrica.";
/** Campo de texto de interfaz: el marcador es el texto de fábrica y vacío = ese texto. */
function ui(form, path, label, placeholder, o = {}) {
  return f.text(form, path, { label, placeholder, maxlength: o.max || 160, help: [o.help, FABRICA].filter(Boolean).join(" ") });
}
function uiArea(form, path, label, placeholder, o = {}) {
  return f.textarea(form, path, { label, placeholder, maxlength: o.max || 500, rows: o.rows || 2, help: [o.help, FABRICA].filter(Boolean).join(" ") });
}
const VARS_BUSQUEDA = "{busqueda} = lo que escribió la persona.";
const VARS_MARCA = "{marca} = nombre de la marca (Ajustes).";
const NEGRITA = "Lo que vaya entre dos asteriscos dobles se ve en negrita: **así**.";

/** Franja café superior (frases unidas con " · "), como en la tienda. */
function topStripPreview(form) {
  const text = h("p.ct-topstrip__text");
  const upd = () => {
    const items = (form.get("topStrip") || []).map((t) => String(t || "").trim()).filter(Boolean);
    const kids = [];
    items.forEach((t, i) => {
      if (i) kids.push(h("span.ct-topstrip__dot", " · "));
      kids.push(t);
    });
    replace(text, kids.length ? kids : h("span.ct-muted-dark", "Sin frases"));
  };
  form.on("change", ({ path }) => { if (!path || path.startsWith("topStrip")) upd(); });
  upd();
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Vista previa")), h("div.ct-topstrip", { "aria-hidden": "true" }, text),
    h("p.ct-prev-cap", "En computador se ve fija y centrada; en celular se desliza para que se lea completa."));
}

/** Botones de búsquedas sugeridas, como en el panel de búsqueda de la tienda. */
function searchPreview(form) {
  const box = h("div.ct-chips");
  const upd = () => {
    const tags = (form.get("searchSuggestions") || []).filter((t) => String(t || "").trim());
    replace(box, tags.length ? tags.map((t) => h("span.ct-chip", String(t))) : h("span.ct-prev-empty", "Sin sugerencias: el bloque no se muestra."));
  };
  form.on("change", ({ path }) => { if (!path || path.startsWith("searchSuggestions")) upd(); });
  upd();
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Búsquedas sugeridas")), h("div.ct-searchprev", { "aria-hidden": "true" }, box));
}

/** Encabezado del catálogo: texto pequeño, título con acento y subtítulo + cantidad. */
function catalogPreview(form, total) {
  const eb = h("p.ct-cat__eyebrow");
  const title = h("p.ct-cat__title");
  const sub = h("p.ct-cat__sub");
  const upd = () => {
    const c = form.get("catalog") || {};
    eb.textContent = String(c.eyebrow || "");
    eb.hidden = !eb.textContent.trim();
    replace(title, richNodes(c.allTitle));
    const s = String(c.subtitle || "").trim();
    sub.textContent = `${s}${s ? " · " : ""}${total} ${total === 1 ? "diseño" : "diseños"}`;
  };
  form.on("change", ({ path }) => { if (!path || path.startsWith("catalog")) upd(); });
  upd();
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Vista previa")), h("div.ct-cat", { "aria-hidden": "true" }, eb, title, sub));
}

/** Nota de la guía de tallas: un paréntesis al final se ve en cursiva (como en la tienda). */
function sizeNotePreview(form) {
  const p = h("p.ct-note__text");
  const upd = () => {
    const note = String(form.get("sizeGuideNote") || "").trim();
    if (!note) { replace(p, h("span.ct-prev-empty", "Sin nota.")); return; }
    const m = /\s*(\([^()]*\))$/.exec(note);
    replace(p, m ? [note.slice(0, m.index), " ", h("em", m[1])] : note);
  };
  form.on("change", ({ path }) => { if (!path || path === "sizeGuideNote") upd(); });
  upd();
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Vista previa")), h("div.ct-note", { "aria-hidden": "true" }, p));
}

/** Pie de página en miniatura: frase bajo el logo y línea legal. */
function footerPreview(form) {
  const tagline = h("p.ct-foot__tagline");
  const legal = h("p.ct-foot__legal");
  const upd = () => {
    replace(tagline, richNodes(form.get("footerTagline"), { accent: false }));
    tagline.hidden = !String(form.get("footerTagline") || "").trim();
    replace(legal, richNodes(form.get("footerLegal"), { accent: false }));
    legal.hidden = !String(form.get("footerLegal") || "").trim();
  };
  form.on("change", ({ path }) => { if (!path || path.startsWith("footer")) upd(); });
  upd();
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Vista previa")),
    h("div.ct-foot", { "aria-hidden": "true" },
      h("img.ct-foot__logo", { src: "../assets/logo/mercy-studio-beige.png", alt: "", width: 110, height: 55 }),
      tagline,
      h("div.ct-foot__cols", h("span", "Tienda"), h("span", "Ayuda"), h("span", "Síguenos")),
      legal));
}

/** Lista de textos de una línea (franja superior, cuidados). */
function textList(form, path, { label, help, min = 0, max, itemLabel, placeholder, maxlength, addLabel, emptyText }) {
  return f.list(form, path, {
    label, help, min, max, addLabel, emptyText,
    newItem: () => "",
    itemLabel: (t, i) => String(t || "").trim() || `${itemLabel} ${i + 1}`,
    renderItem: (p, i) => f.text(form, p, { label: `${itemLabel} ${i + 1}`, className: "ct-sr-label", required: true, requiredMessage: "Escribe el texto o quita esta línea.", maxlength, placeholder }),
  });
}

export default [
  {
    path: "/textos",
    title: "Textos del sitio",
    async render(el, params, ctx) {
      const [value, data] = await Promise.all([content.section("texts"), content.load()]);
      const form = createForm({
        ctx,
        value,
        onSubmit: (v, { force }) => content.saveSection("texts", v, { force }),
      });
      const published = (data.products || []).filter((p) => p.status === "published");
      const sampleProduct = published[0];
      const suggestions = [...new Set([
        ...(data.categories || []).map((c) => c.name),
        ...(data.collections || []).map((c) => c.name),
        ...(data.colors || []).map((c) => c.name),
      ].filter(Boolean))];

      const header = pageHeader({
        title: "Textos del sitio",
        breadcrumbs: [{ label: "Contenido" }],
        subtitle: metaSubtitle("texts", FALLBACK_SUB),
        actions: [storeButton("../index.html")],
      });
      keepMetaFresh(header, form, "texts", FALLBACK_SUB);

      const secStrip = decorateSection(section({
        title: "Franja superior",
        description: "Cinta café delgada encima del menú, en todas las páginas menos en la de pago. Las frases se unen con un punto.",
        aside: topStripPreview(form),
        body: textList(form, "topStrip", {
          label: "Frases", help: "Entre 1 y 6 frases cortas.", min: 1, max: 6, itemLabel: "Frase",
          placeholder: "Envíos a toda Colombia", maxlength: 80, addLabel: "Agregar frase",
        }),
      }), { step: "Todas las páginas", className: "ct-sec", links: [storeLink("../index.html")] });

      const secMenu = decorateSection(section({
        title: "Menú y ayuda",
        description: "Títulos del menú lateral y de las columnas del pie de página, y los nombres de las ventanas de ayuda (que también son las pestañas «Envíos» y «Cambios» de cada producto).",
        body: [
          f.row(ui(form, "menu.title", "Título del menú lateral", "Tienda", { max: 40 }), ui(form, "menu.allLabel", "Enlace a toda la colección", "Toda la colección", { max: 60 })),
          ui(form, "menu.whatsappLabel", "Enlace de WhatsApp (menú y botón flotante)", "Escríbenos por WhatsApp", { max: 60 }),
          f.row(ui(form, "help.sizeGuide", "Ventana «Guía de tallas»", "Guía de tallas", { max: 60 }), ui(form, "help.shipping", "Ventana «Envíos»", "Envíos", { max: 60 }), ui(form, "help.returns", "Ventana «Cambios y devoluciones»", "Cambios y devoluciones", { max: 60 })),
          f.row(ui(form, "footerShopTitle", "Columna «Tienda» del pie", "Tienda", { max: 40 }), ui(form, "footerHelpTitle", "Columna «Ayuda» del pie", "Ayuda", { max: 40 }), ui(form, "footerFollowTitle", "Columna «Síguenos» del pie", "Síguenos", { max: 40 })),
          notice({ tone: "info", message: "El enlace «Nuestra historia» del menú usa el título de la ventana del bloque «Nuestro propósito» del Inicio.", action: button({ label: "Ir a Inicio", size: "sm", href: "#/inicio" }) }),
        ],
      }), { step: "Todas las páginas", className: "ct-sec", links: [storeLink("../index.html")] });

      const secSearch = decorateSection(section({
        title: "Búsqueda",
        description: "Panel de la lupa del menú: marcador del campo, botones de búsquedas sugeridas (al tocar uno se busca ese texto) y mensajes.",
        aside: searchPreview(form),
        body: [
          f.tags(form, "searchSuggestions", {
            label: "Búsquedas sugeridas", max: 10, maxlength: 40, suggestions,
            placeholder: "Escribe y presiona Enter",
            help: "Hasta 10, de máximo 40 caracteres. Escribe y presiona Enter o coma para agregar. Vacío = no se muestran.",
          }),
          f.row(ui(form, "search.placeholder", "Texto dentro del campo de búsqueda", "Busca por nombre, referencia o color…", { max: 80 }), ui(form, "search.suggestionsTitle", "Título de las búsquedas sugeridas", "Búsquedas sugeridas", { max: 60 })),
          f.row(ui(form, "search.topTitle", "Título sin escribir nada", "Lo más buscado", { max: 60 }), ui(form, "search.similarTitle", "Título de las parecidas (con resultados)", "Referencias parecidas", { max: 60 }), ui(form, "search.maybeTitle", "Título de las sugeridas (sin resultados)", "Quizá te interese", { max: 60 })),
          uiArea(form, "search.emptyText", "Sin resultados", "No encontramos nada para “{busqueda}”. Prueba con otro nombre, color o referencia.", { max: 300, help: VARS_BUSQUEDA }),
        ],
      }), { step: "Todas las páginas", className: "ct-sec" });

      const secDrawers = decorateSection(section({
        title: "Favoritos y carrito",
        description: "Paneles que se abren desde el corazón y el carrito del encabezado.",
        body: [
          f.row(ui(form, "favorites.title", "Título de favoritos", "Tus favoritos", { max: 60 }), ui(form, "favorites.emptyCta", "Botón de favoritos vacío", "Ver colección", { max: 40 })),
          ui(form, "favorites.subtitle", "Frase bajo el título de favoritos", "Guarda las prendas que te gustan con el corazón y vuelve a ellas cuando quieras.", { max: 300 }),
          f.row(ui(form, "favorites.emptyTitle", "Favoritos vacío: título", "Aún no tienes favoritos"), ui(form, "favorites.emptyText", "Favoritos vacío: texto", "Toca el corazón en cualquier prenda para guardarla aquí.", { max: 300 })),
          f.row(ui(form, "cart.title", "Título del carrito", "Carrito de compra", { max: 60 }), ui(form, "cart.emptyCta", "Botón del carrito vacío", "Seguir mirando", { max: 40 })),
          f.row(ui(form, "cart.emptyTitle", "Carrito vacío: título", "Tu carrito está vacío"), ui(form, "cart.emptyText", "Carrito vacío: texto", "Cuando agregues prendas las verás aquí.", { max: 300 })),
          ui(form, "cart.note", "Nota sobre el envío al pie del carrito", "El envío y los demás datos se confirman al finalizar tu compra.", { max: 300 }),
          f.row(ui(form, "cart.checkoutLabel", "Botón para ir al pago", "Comprar por WhatsApp", { max: 40 }), ui(form, "cart.continueLabel", "Botón para seguir mirando", "Seguir mirando", { max: 40 })),
        ],
      }), { step: "Todas las páginas", className: "ct-sec" });

      const secCatalog = decorateSection(section({
        title: "Catálogo",
        description: "Encabezado de la página del catálogo y nombres de las vistas «Más vendidos» y «Novedades».",
        aside: catalogPreview(form, published.length),
        body: [
          f.text(form, "catalog.eyebrow", { label: "Texto sobre el título", maxlength: 160, placeholder: "Catálogo", help: "Vacío = no se muestra." }),
          f.accentTitle(form, "catalog.allTitle", { label: "Título de toda la colección", maxlength: 160, help: "Se ve cuando no hay filtros ni búsqueda." }),
          f.text(form, "catalog.subtitle", { label: "Subtítulo", maxlength: 300, placeholder: "Fe, propósito y misericordia", help: "Va antes de la cantidad de diseños («… · 14 diseños»)." }),
          f.row(
            f.text(form, "catalog.bestTitle", { label: "Título de «Más vendidos»", maxlength: 160, placeholder: "Los más vendidos", help: "Catálogo en esa vista, menú lateral, selector «Ordenar por» y sugerencias. Sin cursiva." }),
            f.text(form, "catalog.newTitle", { label: "Título de «Novedades»", maxlength: 160, placeholder: "Novedades", help: "Catálogo en esa vista, menú lateral, selector «Ordenar por» y pie de página. Sin cursiva." }),
          ),
          uiArea(form, "catalog.metaDescription", "Descripción para buscadores", "Toda la colección de {marca}: ropa con propósito cristiano. Fe, propósito y misericordia en camisetas, blusas, hoodies, gorras y accesorios.", { max: 320, rows: 2, help: "Ideal: entre 120 y 160 caracteres. " + VARS_MARCA }),
          f.row(ui(form, "catalog.loadMore", "Botón «Ver más»", "Ver más productos", { max: 60 }), ui(form, "catalog.seeAll", "Enlace a toda la colección", "Ver toda la colección", { max: 60 })),
          ui(form, "catalog.similarTitle", "Título de las referencias parecidas", "Referencias parecidas"),
          f.row(ui(form, "catalog.similarText", "Parecidas: con resultados", "Otras prendas que podrían interesarte.", { max: 300 }), ui(form, "catalog.similarSearchText", "Parecidas: sin coincidencias exactas", "No encontramos coincidencias exactas para “{busqueda}”, pero estas se parecen.", { max: 300, help: VARS_BUSQUEDA })),
          f.row(ui(form, "catalog.emptyFiltersTitle", "Sin prendas con esos filtros: título", "No encontramos prendas con esos filtros"), ui(form, "catalog.emptyFiltersText", "Sin prendas con esos filtros: texto", "Prueba quitando algún filtro o mira lo que más gusta de la colección.", { max: 300 })),
          f.row(ui(form, "catalog.emptySearchTitle", "Búsqueda sin resultados: título", "No encontramos prendas para “{busqueda}”", { help: VARS_BUSQUEDA }), ui(form, "catalog.emptySearchText", "Búsqueda sin resultados: texto", "Revisa la escritura, prueba con otro nombre, color o referencia, o explora lo más vendido.", { max: 300 })),
        ],
      }), {
        step: "Catálogo",
        className: "ct-sec",
        links: [storeLink("../catalogo.html"), storeLink("../catalogo.html?vista=mas-vendidos", "Ver «Más vendidos»"), storeLink("../catalogo.html?vista=novedades", "Ver «Novedades»")],
      });

      const secShipping = decorateSection(section({
        title: "Envíos y cambios",
        description: "Explicaciones que se abren desde el menú y el pie de página, y que también aparecen en las pestañas de cada producto.",
        body: [
          f.textarea(form, "shippingInfo", { label: "Información de envíos", maxlength: 2000, recommended: 600, rows: 4, help: "Ventana «Envíos» y pestaña «Envíos» del producto (debajo se indica si la prenda tiene envío gratis). Cada Enter es un salto de línea." }),
          f.textarea(form, "returnsInfo", { label: "Cambios y devoluciones", maxlength: 2000, recommended: 600, rows: 4, help: "Ventana «Cambios y devoluciones» y pestaña del mismo nombre en cada producto." }),
          notice({ tone: "info", message: "Avisos de envío: son los textos cortos que la tienda muestra según si la prenda incluye envío gratis o no. " + NEGRITA }),
          f.row(ui(form, "shipping.badge", "Etiqueta de las tarjetas", "Envío gratis", { max: 40 }), ui(form, "shipping.lineFree", "Línea del carrito (prenda con envío gratis)", "Incluye envío gratis", { max: 60 })),
          f.row(ui(form, "shipping.cartFree", "Franja del carrito: con envío gratis", "Tu pedido tiene **ENVÍO GRATIS**"), ui(form, "shipping.cartPaid", "Franja del carrito: sin envío", "**ENVÍO NO INCLUIDO** · costo adicional, se coordina por WhatsApp")),
          f.row(ui(form, "shipping.productFree", "Ficha: con envío gratis", "Envío gratis incluido"), ui(form, "shipping.productPaid", "Ficha: sin envío", "Envío no incluido · se coordina por WhatsApp")),
          f.row(ui(form, "shipping.detailFree", "Pestaña «Envíos» de la ficha: con envío gratis", "Esta prenda incluye envío gratis.", { max: 300 }), ui(form, "shipping.detailPaid", "Pestaña «Envíos» de la ficha: sin envío", "El envío de esta prenda no está incluido: se coordina por WhatsApp.", { max: 300 })),
          f.row(ui(form, "shipping.ruleFree", "Ventana «Envíos»: regla del envío gratis", "**Envío gratis** si al menos una prenda de tu carrito lo incluye.", { max: 300 }), ui(form, "shipping.rulePaid", "Ventana «Envíos»: regla del envío no incluido", "**Envío no incluido** cuando ninguna prenda lo incluye: el costo adicional se coordina por WhatsApp.", { max: 300 })),
          f.row(ui(form, "shipping.method", "Pago: nombre del método de envío", "Envío a domicilio", { max: 60 }), ui(form, "shipping.time", "Pago: tiempo de entrega", "2–4 días hábiles", { max: 60, help: "También va en el mensaje de WhatsApp." }), ui(form, "shipping.coordination", "Pago: cómo se coordina", "Coordinamos por WhatsApp", { max: 80 })),
          f.row(ui(form, "shipping.checkoutFree", "Pago: etiqueta con envío gratis", "ENVÍO GRATIS", { max: 40 }), ui(form, "shipping.checkoutPaid", "Pago: etiqueta sin envío", "ENVÍO NO INCLUIDO", { max: 40 }), ui(form, "shipping.checkoutPaidNote", "Pago: nota sin envío", "Tiene un costo adicional que se coordina por WhatsApp")),
          ui(form, "shipping.pending", "Pago: nota junto al total sin envío", "+ envío por coordinar", { max: 60 }),
        ],
      }), {
        step: "Producto · carrito · pago · ventanas",
        className: "ct-sec",
        links: [sampleProduct ? storeLink(`../producto.html?id=${encodeURIComponent(sampleProduct.id)}`, "Ver en un producto") : null],
      });

      const secCare = decorateSection(section({
        title: "Cuidados de las prendas",
        description: "Recomendaciones de lavado de la pestaña «Cuidados de la prenda». Se usan en los productos que no tienen cuidados propios.",
        body: [
          textList(form, "care", {
            label: "Cuidados por defecto", help: "Hasta 12. Cada uno es una viñeta.", max: 12, itemLabel: "Cuidado",
            placeholder: "Lávala en agua fría y al revés", maxlength: 300, addLabel: "Agregar cuidado",
            emptyText: "Sin cuidados por defecto: los productos sin cuidados propios muestran «Lava la prenda con cuidado, en agua fría y al revés».",
          }),
          notice({ tone: "info", message: "Si un producto necesita otros cuidados, escríbelos en su ficha: reemplazan esta lista solo para ese producto.", action: button({ label: "Ir a Productos", size: "sm", href: "#/productos" }) }),
        ],
      }), {
        step: "Ficha de producto",
        className: "ct-sec",
        links: [sampleProduct ? storeLink(`../producto.html?id=${encodeURIComponent(sampleProduct.id)}`, "Ver en un producto") : null],
      });

      const secSize = decorateSection(section({
        title: "Guía de tallas",
        description: "Nota bajo las tablas de medidas de la ventana «Guía de tallas». Un paréntesis al final se ve en cursiva, p. ej. «(Valores de ejemplo.)».",
        aside: sizeNotePreview(form),
        body: [
          f.textarea(form, "sizeGuideNote", { label: "Nota de la guía de tallas", maxlength: 500, rows: 2, placeholder: "Medidas de la prenda en centímetros, tomadas en plano. Pueden variar ±1 cm." }),
          notice({ tone: "info", message: "Las tablas de medidas se editan en «Guía de tallas».", action: button({ label: "Ir a Guía de tallas", size: "sm", href: "#/tallas" }) }),
        ],
      }), { step: "Ficha de producto · pie de página", className: "ct-sec" });

      const secProduct = decorateSection(section({
        title: "Ficha de producto",
        description: "Etiquetas y títulos que se repiten en todas las fichas. Lo propio de cada prenda (nombre, descripción, detalles…) se edita en Productos.",
        body: [
          f.row(ui(form, "product.collectionLabel", "Palabra antes de la colección", "Colección", { max: 40, help: "Se ve en mayúsculas: «COLECCIÓN RENACER»." }), ui(form, "product.videoChip", "Botón del video en la galería", "Ver video", { max: 40 })),
          f.row(ui(form, "product.stockIn", "Estado con stock", "En stock · listo para enviar", { max: 80 }), ui(form, "product.stockOut", "Estado sin stock", "No disponible", { max: 80 })),
          f.row(ui(form, "product.lowStockOne", "Queda 1 unidad", "Queda 1 unidad", { max: 80 }), ui(form, "product.lowStockMany", "Quedan pocas unidades", "Quedan {n} unidades", { max: 80, help: "{n} = unidades disponibles (se muestra con 5 o menos)." })),
          f.row(ui(form, "product.videoSoonTitle", "Sin video: título", "Video próximamente", { max: 80 }), ui(form, "product.videoSoonText", "Sin video: texto", "Estamos preparando el video de esta prenda.", { max: 300 })),
          f.row(ui(form, "product.detailsTitle", "Pestaña «Detalles»", "Detalles", { max: 60 }), ui(form, "product.careTitle", "Pestaña «Cuidados»", "Cuidados de la prenda", { max: 60 }), ui(form, "product.sizesTitle", "Pestaña «Medidas / Tallas»", "Medidas / Tallas", { max: 60 })),
          f.row(ui(form, "product.detailsEmpty", "Pestaña «Detalles» sin ítems", "Pronto sumaremos más detalles de esta prenda.", { max: 300 }), ui(form, "product.careEmpty", "Pestaña «Cuidados» sin ítems", "Lava la prenda con cuidado, en agua fría y al revés.", { max: 300 })),
          ui(form, "product.sizeGuideLink", "Enlace a la guía completa (pestaña «Medidas»)", "Ver guía de tallas completa", { max: 80 }),
          f.row(ui(form, "product.storyTitle", "Título de la historia del diseño", "La historia del diseño", { max: 80 }), ui(form, "product.relatedTitle", "Título de «También te puede gustar»", "También te puede gustar", { max: 80 })),
          f.row(ui(form, "product.reviewsTitle", "Título de las reseñas", "Reseñas verificadas", { max: 80 }), ui(form, "product.reviewsSource", "Fuente de las reseñas", "reseñas en Google", { max: 60, help: "Va después de la cantidad: «48 reseñas en Google»." })),
          f.text(form, "product.verifiedLabel", { label: "Insignia de cada reseña", maxlength: 60, placeholder: "Compra verificada", help: "En las reseñas del Inicio y de la ficha. Vacío = sin insignia." }),
          ui(form, "product.metaSuffix", "Cierre de la descripción para buscadores", "Ropa con propósito cristiano, hecha en Colombia.", { max: 200, help: "Se agrega después del nombre y la colección de cada prenda. " + VARS_MARCA }),
        ],
      }), {
        step: "Ficha de producto",
        className: "ct-sec",
        links: [sampleProduct ? storeLink(`../producto.html?id=${encodeURIComponent(sampleProduct.id)}`, "Ver en un producto") : null],
      });

      const secCheckout = decorateSection(section({
        title: "Finalizar compra",
        description: "Página de pago: encabezado, envío, regalo, pago, botón de confirmar, ventana del mensaje y el inicio y cierre del mensaje de WhatsApp. Los nombres de los campos del formulario no cambian.",
        body: [
          f.accentTitle(form, "checkout.title", { label: "Título de la página", maxlength: 80, help: FABRICA }),
          f.row(ui(form, "checkout.subtitle", "Frase bajo el título", "Compra como invitado — sin registro obligatorio."), ui(form, "checkout.strip", "Nota del encabezado", "Compra segura coordinada por WhatsApp", { max: 80, help: "En celular solo se ven las dos primeras palabras." })),
          uiArea(form, "checkout.metaDescription", "Descripción para buscadores", "Finaliza tu compra en {marca} como invitado: completa tus datos, elige el pago y confirma tu pedido por WhatsApp.", { max: 320, rows: 2, help: VARS_MARCA }),
          f.row(ui(form, "checkout.emptyTitle", "Carrito vacío: título", "Tu carrito está vacío"), ui(form, "checkout.emptyText", "Carrito vacío: texto", "Agrega tus prendas favoritas para poder finalizar tu compra.", { max: 300 }), ui(form, "checkout.emptyCta", "Carrito vacío: botón", "Seguir mirando", { max: 40 })),
          f.accentTitle(form, "checkout.successTitle", { label: "Pedido enviado: título", maxlength: 80, help: "Se ve después de abrir WhatsApp. " + FABRICA }),
          uiArea(form, "checkout.successText", "Pedido enviado: texto", "Lo enviamos a WhatsApp. Allí coordinamos contigo el pago por transferencia y el envío a tu dirección.", { max: 500, help: VARS_MARCA }),
          f.row(ui(form, "checkout.successHome", "Pedido enviado: botón al inicio", "Volver al inicio", { max: 40 }), ui(form, "checkout.successCta", "Pedido enviado: botón al catálogo", "Seguir mirando", { max: 40 })),
          f.row(ui(form, "checkout.shipTitle", "Título del paso de envío", "Método de envío", { max: 60 }), ui(form, "checkout.payTitle", "Título del paso de pago", "Pago", { max: 60 })),
          uiArea(form, "checkout.note", "Nota del paso de envío", "Verifica que la dirección de entrega, productos y tallas seleccionados estén correctos y completos.", { max: 500 }),
          f.row(ui(form, "checkout.giftTitle", "Regalo: pregunta", "¿Es un regalo?", { max: 60 }), ui(form, "checkout.giftHint", "Regalo: explicación", "Agrega un mensaje personalizado (opcional).")),
          f.row(ui(form, "checkout.giftLabel", "Regalo: nombre del campo", "Mensaje personalizado", { max: 60 }), ui(form, "checkout.giftPlaceholder", "Regalo: texto dentro del campo", "Escribe aquí el mensaje que acompañará tu regalo…")),
          ui(form, "checkout.payLead", "Pago: instrucción", "Elige cómo vas a pagar por transferencia:"),
          uiArea(form, "checkout.payHint", "Pago: aclaración", "Aquí no se cobra nada. El método que elijas llega a {marca} dentro de tu mensaje de WhatsApp y por ese chat te enviamos los datos para transferir.", { max: 500, help: VARS_MARCA }),
          notice({ tone: "info", message: "Los medios de pago (Nequi, Bre-B, Bancolombia…) se editan en Ajustes.", action: button({ label: "Ir a Ajustes", size: "sm", href: "#/ajustes" }) }),
          f.row(ui(form, "checkout.confirmLabel", "Botón de confirmar", "Confirmar pedido por WhatsApp", { max: 60 }), ui(form, "checkout.confirmHelp", "Texto bajo el botón", "Te llevaremos a WhatsApp con el resumen de tu pedido para coordinar pago y envío.", { max: 300 })),
          ui(form, "checkout.noCodeCta", "Enlace «¿Aún no tienes código?»", "¿Aún no tienes código? Obtén {descuento} de descuento", { help: "Bajo el campo del cupón, solo si la persona no se ha suscrito. {descuento} = cupón de bienvenida." }),
          f.accentTitle(form, "checkout.previewTitle", { label: "Ventana del mensaje: título", maxlength: 80, help: FABRICA }),
          uiArea(form, "checkout.previewText", "Ventana del mensaje: texto", "Este es el mensaje que enviaremos a WhatsApp. Revísalo: allí coordinamos el pago y el envío contigo.", { max: 500 }),
          f.row(ui(form, "checkout.openLabel", "Botón «Abrir WhatsApp»", "Abrir WhatsApp", { max: 40 }), ui(form, "checkout.copyLabel", "Botón «Copiar mensaje»", "Copiar mensaje", { max: 40 }), ui(form, "checkout.afterOpenText", "Aviso tras abrir WhatsApp", "Abrimos WhatsApp en otra pestaña. Cuando termines, cierra esta ventana.", { max: 300 })),
          f.row(ui(form, "checkout.waIntro", "Mensaje de WhatsApp: después del saludo", ", quiero confirmar mi pedido:", { help: "El saludo se edita en Ajustes." }), ui(form, "checkout.waClosing", "Mensaje de WhatsApp: despedida", "¡Gracias! Quedo atento(a) para coordinar el pago y el envío.", { max: 300 })),
        ],
      }), { step: "Finalizar compra", className: "ct-sec", links: [storeLink("../checkout.html")] });

      const secSubscribe = decorateSection(section({
        title: "Suscripción y WhatsApp",
        description: "Mensajes al dejar el correo (pop-up de descuento y bloque «Comunidad» del Inicio) y el texto del botón flotante de WhatsApp.",
        body: [
          uiArea(form, "subscribe.thanks", "Gracias sin cupón", "¡Gracias por suscribirte! Te contaremos las novedades de {marca}.", { max: 300, help: "Cuando el modal de descuento está apagado o no hay cupón de bienvenida. " + VARS_MARCA }),
          f.row(ui(form, "subscribe.codeHint", "Código recibido sin aplicar (Comunidad)", "Este es tu código de bienvenida. Escríbelo en el checkout para usarlo.", { max: 300 }), ui(form, "subscribe.popupCodeHint", "Código recibido sin aplicar (pop-up)", "Este es tu código de bienvenida:")),
          f.row(ui(form, "subscribe.appliedToast", "Aviso al aplicar el cupón", "¡Listo! Tu descuento del {descuento} quedó aplicado", { help: "{descuento} = cupón de bienvenida." }), ui(form, "subscribe.subscribeLabel", "Botón de Comunidad sin descuento", "Suscribirme", { max: 40, help: "Reemplaza al botón con {descuento} cuando el modal está apagado." })),
          ui(form, "whatsappFabText", "Botón flotante de WhatsApp: después del saludo", ", quiero más información", { max: 120, help: "El saludo se edita en Ajustes." }),
        ],
      }), { step: "Inicio · todas las páginas", className: "ct-sec", links: [storeLink("../index.html")] });

      const secFooter = decorateSection(section({
        title: "Pie de página",
        description: "Bloque oscuro al final de todas las páginas: frase bajo el logo y línea legal.",
        aside: footerPreview(form),
        body: [
          f.text(form, "footerTagline", { label: "Frase bajo el logo", maxlength: 160, placeholder: "La moda es el medio. Cristo es el mensaje", help: "Vacío = no se muestra." }),
          f.text(form, "footerLegal", { label: "Línea legal", maxlength: 200, placeholder: "© 2026 Mercy Studio · Hecho con propósito en Colombia", help: "Última línea de la página. Vacío = no se muestra." }),
        ],
      }), { step: "Todas las páginas", className: "ct-sec", links: [storeLink("../index.html")] });

      const blocks = [
        ["Franja superior", secStrip], ["Menú y ayuda", secMenu], ["Búsqueda", secSearch], ["Favoritos y carrito", secDrawers], ["Catálogo", secCatalog],
        ["Envíos y cambios", secShipping], ["Cuidados", secCare], ["Guía de tallas", secSize], ["Ficha de producto", secProduct],
        ["Finalizar compra", secCheckout], ["Suscripción", secSubscribe], ["Pie de página", secFooter],
      ];
      el.append(h("div.page.page--form.ct-page",
        header,
        jumpNav(blocks.map(([label, sec]) => ({ label, target: () => sec })), "Ir a un grupo de textos"),
        blocks.map(([, sec]) => sec)));
    },
  },
];
