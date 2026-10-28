/* ==========================================================================
   Mercy Studio · Panel — views/reviews.js
   Reseñas (#/resenas): testimonios de clientes (sección "reviews", patrón B: { items } + errorPrefix "items").
   · Inicio: carrusel con la cita (quote) de cada reseña visible, en el orden de esta lista.
   · Ficha de producto: las 3 primeras reseñas visibles, con el texto largo (text).
   · Sin cita ni texto la tienda no muestra la reseña; sin reseñas visibles se oculta la sección.
   · El encabezado del Inicio (título, puntaje y cantidad) se edita en #/inicio.
   · Cada parte (nombre, ciudad, cita y texto) puede tener su propio tipo de letra (fonts.*; "" = el de la tienda).
   · Cómo se ven en el Inicio (carrusel o acordeón, movimiento) se elige en #/inicio.
   Estrellas: control accesible (radiogroup con flechas, Inicio/Fin y clic).
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { content } from "../core/store.js";
import { fields as f } from "../core/forms.js";
import { badge, button, card, confirmDialog, sortHint, toast } from "../core/ui.js";
import { number, plural, truncate } from "../core/format.js";
import { STORE, header, listForm, liveRegistry, focusOnAdd } from "./taxonomies.js";

const PDP_COUNT = 3; // la ficha de producto muestra las 3 primeras visibles
const trim = (v) => String(v ?? "").trim();
const isShown = (r) => r && r.visible !== false && (trim(r.quote) || trim(r.text));

/* Tipos de letra de las reseñas: mismos ids que server/lib/validate.js (REVIEW_FONTS) y js/ui.js (FONTS).
   google = familia que se carga de Google Fonts para la vista previa (las de la marca ya las carga admin/index.html). */
const FONTS = [
  { id: "texto", label: "Lekton · texto de la marca", family: '"Lekton", ui-monospace, monospace' },
  { id: "titulo", label: "Mercy Titulo · títulos de la marca", family: '"Mercy Titulo", "Oswald", "Arial Narrow", Impact, sans-serif' },
  { id: "manuscrita", label: "Kaushan Script · manuscrita de la marca", family: '"Dafoe", "Kaushan Script", cursive' },
  { id: "playfair", label: "Playfair Display · elegante con remates", family: '"Playfair Display", Georgia, serif', google: "Playfair+Display:wght@400;700" },
  { id: "lora", label: "Lora · clásica con remates", family: '"Lora", Georgia, serif', google: "Lora:wght@400;700" },
  { id: "montserrat", label: "Montserrat · moderna", family: '"Montserrat", "Helvetica Neue", Arial, sans-serif', google: "Montserrat:wght@400;700" },
  { id: "poppins", label: "Poppins · redondeada", family: '"Poppins", "Helvetica Neue", Arial, sans-serif', google: "Poppins:wght@400;700" },
  { id: "dancing", label: "Dancing Script · manuscrita elegante", family: '"Dancing Script", cursive', google: "Dancing+Script:wght@400;700" },
  { id: "caveat", label: "Caveat · escrita a mano", family: '"Caveat", cursive', google: "Caveat:wght@400;700" },
];
const FONT = Object.fromEntries(FONTS.map((x) => [x.id, x]));
/* Partes de una reseña con su letra de siempre en la tienda */
const PARTS = [
  { key: "name", label: "Nombre", def: "Lekton", sample: "Laura M." },
  { key: "city", label: "Ciudad", def: "Lekton", sample: "Bogotá" },
  { key: "quote", label: "Cita (Inicio)", def: "Mercy Titulo en cursiva", sample: "La calidad es increíble…" },
  { key: "text", label: "Texto (ficha de producto)", def: "Lekton", sample: "Compré la Regular y me quedó perfecta…" },
];
const EMPTY_FONTS = { name: "", city: "", quote: "", text: "" };
const hasFonts = (r) => !!r?.fonts && PARTS.some(({ key }) => FONT[r.fonts[key]]);

const loaded = new Set();
/** Carga de Google Fonts la familia de la vista previa (una vez; la CSP del panel lo permite). */
function loadFont(id) {
  const ft = FONT[id];
  if (!ft?.google || loaded.has(id)) return;
  loaded.add(id);
  document.head.append(h("link", { rel: "stylesheet", href: `https://fonts.googleapis.com/css2?family=${ft.google}&display=swap` }));
}
const SCRIPT = new Set(["manuscrita", "dancing", "caveat"]);
/** Pinta un elemento con la letra elegida, como css/components.css (.ff-*): "" = la de la tienda para esa parte
    (la ponen las clases .rv-card__* / .rv-font__sample--*). Con otra letra, la cita deja la cursiva fina de Mercy Titulo. */
function paintFont(el, id, { quote = false } = {}) {
  const ft = FONT[id];
  if (ft) loadFont(id);
  el.style.fontFamily = ft ? ft.family : "";
  el.style.fontSizeAdjust = SCRIPT.has(id) ? "0.5" : "";
  const plain = quote && ft && id !== "titulo";
  el.style.fontStyle = plain ? "normal" : "";
  el.style.fontWeight = plain ? "400" : "";
}

/** Selector de tipo de letra (select nativo) con una muestra del texto de esa parte en la letra elegida. */
function fontControl(part, sampleText) {
  return ({ value, onChange, id, describedBy }) => {
    const sel = h("select.input.input--select", { id, "aria-describedby": describedBy },
      h("option", { value: "" }, `Predeterminada (${part.def})`),
      FONTS.map((ft) => h("option", { value: ft.id }, ft.label)));
    const sample = h(`span.rv-font__sample.rv-font__sample--${part.key}`, { "aria-hidden": "true" });
    const show = (v) => {
      const k = FONT[v] ? v : "";
      if (sel.value !== k) sel.value = k;
      paintFont(sample, k, { quote: part.key === "quote" });
    };
    sel.addEventListener("change", () => { show(sel.value); onChange(sel.value); });
    show(value);
    sampleText(sample);
    return { el: h("div.rv-font", sel, sample), setValue: show, focus: () => sel.focus(), control: sel };
  };
}

/** Control de 1 a 5 estrellas (para fields.custom con group: true; su nombre accesible es la <legend>). */
function starsControl({ value, onChange, id, describedBy, labelId }) {
  let cur = Math.min(5, Math.max(1, Math.round(Number(value) || 5)));
  const label = h("span.rv-stars__label", { "aria-hidden": "true" });
  const btns = [1, 2, 3, 4, 5].map((n) => {
    const b = h("button.rv-star", { type: "button", role: "radio", "aria-label": `${n} ${n === 1 ? "estrella" : "estrellas"}`, title: `${n} de 5` }, icon("star", { size: 24 }));
    b.addEventListener("click", () => set(n, true));
    b.addEventListener("pointerenter", () => paint(n));
    return b;
  });
  const group = h("div.rv-stars", { id, role: "radiogroup", "aria-labelledby": labelId || null, "aria-label": labelId ? null : "Estrellas", "aria-describedby": describedBy }, btns, label);
  group.addEventListener("pointerleave", () => paint());
  group.addEventListener("keydown", (e) => {
    const map = { ArrowRight: cur + 1, ArrowUp: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur - 1, Home: 1, End: 5 };
    if (!(e.key in map)) return;
    e.preventDefault();
    set(Math.min(5, Math.max(1, map[e.key])), true);
    btns[cur - 1].focus();
  });
  function paint(hover) {
    const show = hover || cur;
    btns.forEach((b, i) => {
      b.classList.toggle("is-on", i < show);
      b.classList.toggle("is-preview", !!hover && i < hover);
      b.setAttribute("aria-checked", String(i + 1 === cur));
      b.tabIndex = i + 1 === cur ? 0 : -1;
    });
    label.textContent = `${show} de 5`;
  }
  function set(n, user) {
    cur = n;
    paint();
    if (user) onChange(n);
  }
  paint();
  return { el: group, setValue(v) { cur = Math.min(5, Math.max(1, Math.round(Number(v) || 5))); paint(); }, focus: () => btns[cur - 1].focus() };
}

const starsText = (n) => "★".repeat(n) + "☆".repeat(5 - n);

export default [
  {
    path: "/resenas",
    title: "Reseñas",
    async render(el, params, ctx) {
      const data = await content.load({ force: true });
      const head = data.home?.reviews || {};
      const form = listForm(ctx, "reviews", await content.section("reviews"), { successMessage: "Reseñas guardadas. Ya se ven en la tienda." });
      const live = liveRegistry(form);

      const list = f.list(form, "items", {
        label: "Reseñas",
        className: "tx-list tx-list--cards",
        max: 60,
        collapsible: true,
        addLabel: "Agregar reseña",
        confirmRemove: false,
        emptyText: "Aún no hay reseñas. Sin reseñas visibles, la sección no aparece en el Inicio.",
        newItem: () => ({ id: "", name: "", city: "", stars: 5, quote: "", text: "", visible: true, fonts: { ...EMPTY_FONTS }, _new: true }),
        itemLabel: (it, i) => (it?.name ? `${it.name}${it.city ? ` · ${it.city}` : ""}` : `Reseña ${i + 1}`),
        // Insignias de la cabecera (el núcleo las vuelve a pedir cuando cambia la reseña)
        itemMeta: (cur) => {
          const r = cur || {};
          return h("span.tx-head-meta",
            r._new ? badge("Nueva", "accent") : null,
            h("span.rv-mini-stars", { role: "img", "aria-label": `${r.stars || 5} de 5 estrellas` }, starsText(r.stars || 5)),
            hasFonts(r) ? badge("Letra propia", "neutral") : null,
            r.visible === false ? badge("Oculta", "neutral", { dot: true }) : !trim(r.quote) && !trim(r.text) ? badge("Sin texto", "warning") : null);
        },
        beforeRemove: async (r) => {
          if (r?._new && !r.name && !trim(r.quote) && !trim(r.text)) return true;
          return confirmDialog({
            title: `¿Eliminar la reseña de «${r?.name || "sin nombre"}»?`,
            message: "Se eliminará cuando guardes los cambios. Si solo quieres que no se vea, apaga «Mostrar en la tienda».",
            confirmLabel: "Eliminar",
            danger: true,
          });
        },
        renderItem: (p) => {
          return h("div.rv-item",
            f.row(
              f.text(form, `${p}.name`, { label: "Nombre", required: true, maxlength: 60, placeholder: "Ej.: Laura M.", help: "Nombre y la inicial del apellido." }),
              f.text(form, `${p}.city`, { label: "Ciudad", optional: true, maxlength: 60, placeholder: "Ej.: Bogotá" }),
              { cols: 2 }),
            f.custom(form, `${p}.stars`, { label: "Estrellas", group: true, create: starsControl }),
            f.textarea(form, `${p}.quote`, {
              label: "Cita para el Inicio",
              maxlength: 300,
              recommended: 140,
              rows: 2,
              placeholder: "La calidad es increíble y el mensaje llega al corazón.",
              help: "Frase corta de la tarjeta del carrusel del Inicio. Si la dejas vacía, se usa el texto.",
              validate: (v, fm) => (!trim(v) && !trim(fm.get(`${p}.text`)) ? "Escribe la cita o el texto: sin ninguno de los dos, la reseña no se muestra." : null),
            }),
            f.textarea(form, `${p}.text`, {
              label: "Texto para la ficha de producto",
              optional: true,
              maxlength: 2000,
              rows: 3,
              placeholder: "Compré la Regular y me quedó perfecta…",
              help: `Se ve en «Reseñas verificadas» de la ficha de producto (las ${PDP_COUNT} primeras visibles). Si lo dejas vacío, se usa la cita.`,
            }),
            h("div.rv-fonts",
              h("div.rv-fonts__head",
                h("div",
                  h("h4.rv-fonts__title", "Tipo de letra"),
                  h("p.rv-fonts__desc", "Para cada parte de esta reseña. «Predeterminada» = la letra de siempre de la tienda.")),
                button({
                  label: "Usar en todas",
                  icon: "copy",
                  size: "sm",
                  variant: "ghost",
                  title: "Copia estos tipos de letra a todas las reseñas",
                  onClick: () => {
                    const fonts = { ...EMPTY_FONTS, ...(form.get(`${p}.fonts`) || {}) };
                    const all = form.get("items") || [];
                    all.forEach((_, i) => form.set(`items.${i}.fonts`, { ...fonts }));
                    toast(`Tipos de letra aplicados a ${plural(all.length, "reseña", "reseñas")}. Guarda para publicarlos (o descarta para deshacer).`, { type: "info" });
                  },
                })),
              f.row(...PARTS.map((part) => f.custom(form, `${p}.fonts.${part.key}`, {
                label: part.label,
                className: "rv-font-field",
                create: fontControl(part, (el) => live(el, () => {
                  el.textContent = truncate(trim(form.get(`${p}.${part.key}`)) || (part.key === "quote" ? trim(form.get(`${p}.text`)) : "") || part.sample, 70);
                })),
              })), { cols: 2 })),
            f.switch(form, `${p}.visible`, { label: "Mostrar en la tienda", help: "Apágalo para ocultarla sin borrarla." }));
        },
      });
      focusOnAdd(form, list, "items", "input[name$='.name']");

      /* --- Vista previa: tarjetas del Inicio --- */
      const pv = h("ol.rv-pv");
      const pvCount = h("p.rv-pv__count");
      live(pv, () => {
        const all = form.get("items") || [];
        const shown = all.filter(isShown);
        pvCount.textContent = all.length
          ? `${plural(shown.length, "reseña visible", "reseñas visibles")} de ${number(all.length)}.`
          : "";
        replace(pv, shown.length
          ? shown.map((r, i) => h("li.rv-card",
            h("div.rv-card__top",
              h("span.rv-card__stars", { role: "img", "aria-label": `${r.stars} de 5 estrellas` }, Array.from({ length: Math.min(5, Math.max(1, r.stars || 5)) }, () => icon("star", { size: 14 }))),
              i < PDP_COUNT ? h("span.rv-card__pdp", { title: "También se ve en la ficha de producto" }, "También en la ficha") : null),
            h("blockquote.rv-card__quote", { ref: (el) => paintFont(el, r.fonts?.quote, { quote: true }) }, `“${truncate(trim(r.quote) || trim(r.text), 160)}”`),
            h("div.rv-card__who",
              h("span.rv-card__avatar", { "aria-hidden": "true" }, (trim(r.name) || "C").charAt(0).toUpperCase()),
              h("span.rv-card__name",
                h("strong", { ref: (el) => paintFont(el, r.fonts?.name) }, trim(r.name) || "Cliente"),
                trim(r.city) ? h("span", { ref: (el) => paintFont(el, r.fonts?.city) }, trim(r.city)) : null))))
          : h("li.rv-pv__empty", icon("eye-off", { size: 16 }), "No hay reseñas visibles: la sección «Reseñas» no aparece en el Inicio ni en la ficha de producto."));
      });

      const score = Number(head.score) || 0;
      const LAYOUT = { slider: "Carrusel", accordion: "Acordeón" };
      const motion = head.motion === "timer" || (head.motion === "continuous" && head.layout === "accordion")
        ? `avanza cada ${plural(Number(head.interval) || 4, "segundo", "segundos")}`
        : head.motion === "continuous" ? "tira continua" : "sin movimiento";
      el.append(h("div.page",
        header({
          title: "Reseñas",
          subtitle: "Testimonios de clientes. Se ven en el carrusel del Inicio (con la cita) y en la ficha de producto (con el texto). El orden de la lista es el de la tienda.",
          actions: [button({ label: "Ver en la tienda", icon: "external", href: `${STORE}index.html#resenas`, target: "_blank" })],
          form,
          section: "reviews",
        }),
        h("div.tx-layout",
          h("div.tx-layout__main",
            card({ title: "Reseñas", description: `Abre una reseña para editarla. ${sortHint()}`, body: list })),
          h("aside.tx-layout__aside", { "aria-label": "Encabezado y vista previa" },
            card({
              title: "Encabezado en el Inicio",
              description: "Título, puntaje, cantidad de reseñas y cómo se ven (carrusel o acordeón, con o sin movimiento). Se editan en Inicio.",
              body: h("div.rv-head",
                h("p.rv-head__title", head.title || "Reseñas"),
                h("p.rv-head__score",
                  score ? h("span.rv-head__stars", { role: "img", "aria-label": `${Math.round(score)} de 5 estrellas` }, Array.from({ length: Math.round(score) }, () => icon("star", { size: 15 }))) : null,
                  h("span", [score ? number(score, 1) : "", Number(head.count) ? plural(Number(head.count), "reseña", "reseñas") : ""].filter(Boolean).join(" · ") || "Sin puntaje")),
                h("p.rv-head__layout", icon("layers", { size: 15 }), `${LAYOUT[head.layout] || LAYOUT.slider} · ${motion}`),
                button({ label: "Editar en Inicio", icon: "edit", size: "sm", href: "#/inicio" })),
            }),
            card({
              title: "Así se ve en el Inicio",
              description: "Solo las visibles, en este orden. Se actualiza mientras editas.",
              body: [pvCount, pv],
            })))));
    },
  },
];
