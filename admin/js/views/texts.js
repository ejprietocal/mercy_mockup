/* ==========================================================================
   Mercy Studio · Panel — views/texts.js
   Textos del sitio (#/textos): franja café superior, búsquedas sugeridas, títulos del catálogo,
   envíos y cambios, cuidados por defecto, nota de la guía de tallas y pie de página.
   Ordenados como aparecen en la tienda, de arriba hacia abajo. Sección "texts"
   (PUT /api/admin/content/texts).
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import { button, notice, pageHeader, section } from "../core/ui.js";
import {
  decorateSection, jumpNav, keepMetaFresh, metaSubtitle, richNodes, storeButton, storeLink,
} from "./home.js";

const FALLBACK_SUB = "Textos que se repiten en varias páginas de la tienda: franja superior, catálogo, envíos, cuidados y pie de página.";

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

      const secSearch = decorateSection(section({
        title: "Búsqueda",
        description: "Botones que aparecen al abrir la lupa del menú; al tocar uno se busca ese texto.",
        aside: searchPreview(form),
        body: f.tags(form, "searchSuggestions", {
          label: "Búsquedas sugeridas", max: 10, maxlength: 40, suggestions,
          placeholder: "Escribe y presiona Enter",
          help: "Hasta 10, de máximo 40 caracteres. Escribe y presiona Enter o coma para agregar. Vacío = no se muestran.",
        }),
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
            f.text(form, "catalog.bestTitle", { label: "Título de «Más vendidos»", maxlength: 160, placeholder: "Los más vendidos", help: "Catálogo en esa vista, menú lateral y sugerencias. Sin cursiva." }),
            f.text(form, "catalog.newTitle", { label: "Título de «Novedades»", maxlength: 160, placeholder: "Novedades", help: "Catálogo en esa vista, menú lateral y pie de página. Sin cursiva." }),
          ),
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
        ],
      }), {
        step: "Producto · menú · pie de página",
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
        ["Franja superior", secStrip], ["Búsqueda", secSearch], ["Catálogo", secCatalog], ["Envíos y cambios", secShipping],
        ["Cuidados", secCare], ["Guía de tallas", secSize], ["Pie de página", secFooter],
      ];
      el.append(h("div.page.page--form.ct-page",
        header,
        jumpNav(blocks.map(([label, sec]) => ({ label, target: () => sec })), "Ir a un grupo de textos"),
        blocks.map(([, sec]) => sec)));
    },
  },
];
